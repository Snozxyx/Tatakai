import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { category, discordPayload, generate, renderChangelog, sendDiscord } from '../scripts/changelog-discord.mjs';

const pr = {
  number: 123, title: 'fix(player): restore playback',
  merged_at: '2026-10-24T12:00:00Z', user: { login: 'contributor' }, labels: [],
};
const repository = 'Snozxyx/Tatakai';
// Synthetic token, deliberately not a live webhook.
const webhook = 'https://discord.com/api/webhooks/123456789/synthetic-test-token';

test('groups merged PRs and escapes untrusted titles without changing version metadata', () => {
  const markdown = renderChangelog([
    pr,
    { ...pr, number: 124, title: 'chore(deps): update parser', merged_at: '2026-10-24T13:00:00Z' },
    { ...pr, number: 125, title: '[click](https://attacker.example)\n@everyone' },
  ], repository, { tag_name: 'v6.3.0', published_at: '2026-10-23T12:00:00Z' });
  assert.match(markdown, /## Unreleased/);
  assert.match(markdown, /### Fixes/);
  assert.match(markdown, /### Dependencies/);
  assert.match(markdown, /since v6\.3\.0/);
  assert.ok(!markdown.includes('[click](https://attacker.example)'));
  assert.ok(!markdown.includes('\n@everyone'));
  assert.match(markdown, /https:\/\/github.com\/Snozxyx\/Tatakai\/pull\/123/);
  assert.equal(category({ ...pr, labels: [{ name: 'security' }] }), 'Security');
});

test('Discord payload suppresses mentions and bounds hostile long titles', () => {
  const payload = discordPayload({ ...pr, title: '@everyone '.repeat(2000) }, repository);
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
  assert.ok(payload.embeds[0].description.length < 2000);
  assert.equal(payload.attachments[0].filename, 'CHANGELOG.md');
});

test('sends the complete markdown attachment and waits for a message receipt', async () => {
  const id = await sendDiscord(webhook, discordPayload(pr, repository), '# Full changelog', {
    fetchImpl: async (url, options) => {
      assert.equal(url.searchParams.get('wait'), 'true');
      assert.equal(options.redirect, 'error');
      assert.equal(options.method, 'POST');
      assert.equal(await options.body.get('files[0]').text(), '# Full changelog');
      assert.deepEqual(JSON.parse(options.body.get('payload_json')).allowed_mentions, { parse: [] });
      return Response.json({ id: 'confirmed-message' });
    },
  });
  assert.equal(id, 'confirmed-message');
});

test('retries only confirmed rate limits within a bounded delay', async () => {
  let calls = 0;
  const waits = [];
  await sendDiscord(webhook, {}, 'notes', {
    fetchImpl: async () => ++calls === 1
      ? Response.json({ retry_after: 0.5 }, { status: 429 })
      : Response.json({ id: 'ok' }),
    sleep: async (ms) => { waits.push(ms); },
  });
  assert.equal(calls, 2);
  assert.deepEqual(waits, [500]);
  await assert.rejects(sendDiscord(webhook, {}, 'notes', {
    fetchImpl: async () => Response.json({ retry_after: 300 }, { status: 429 }),
  }), /retry budget/);
});

test('rejects invalid destinations before exposing the credential', async () => {
  for (const url of [undefined, 'http://discord.com/api/webhooks/1/token', 'https://attacker.example/api/webhooks/1/token', 'https://discord.com@attacker.example/api/webhooks/1/token']) {
    await assert.rejects(sendDiscord(url, {}, 'notes', {
      fetchImpl: () => { throw new Error('must not make a request'); },
    }), /secret.*invalid/);
  }
});

test('redacts transport errors and does not retry uncertain deliveries', async () => {
  let calls = 0;
  await assert.rejects(sendDiscord(webhook, {}, 'notes', {
    fetchImpl: async () => { calls++; throw new Error(`failure at ${webhook}`); },
  }), (error) => !error.message.includes('synthetic-test-token') && /could not be confirmed/.test(error.message));
  assert.equal(calls, 1);
  await assert.rejects(sendDiscord(webhook, {}, 'notes', {
    fetchImpl: async () => Response.json({ token: 'sensitive-response' }, { status: 401 }),
  }), /HTTP 401/);
  await assert.rejects(sendDiscord(webhook, {}, 'notes', {
    fetchImpl: async () => Response.json({}),
  }), /no message receipt/);
});

test('generation filters released and unmerged PRs, includes an event missing from the list, and rejects open PRs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tatakai-changelog-test-'));
  const env = { GITHUB_REPOSITORY: repository, PR_NUMBER: '123', GH_TOKEN: 'synthetic-github-token' };
  let merged = true;
  const fetchImpl = async (rawUrl, options) => {
    assert.equal(options.headers.Authorization, 'Bearer synthetic-github-token');
    const url = new URL(rawUrl);
    const route = url.pathname.replace(`/repos/${repository}`, '');
    if (route === '') return Response.json({ default_branch: 'main' });
    if (route === '/pulls/123') return Response.json({ ...pr, merged_at: merged ? pr.merged_at : null, base: { ref: 'main', repo: { full_name: repository } } });
    if (route === '/releases/latest') return Response.json({ tag_name: 'v6.3.0', published_at: '2026-10-23T00:00:00Z' });
    if (route === '/pulls') return Response.json([
      { ...pr, number: 120, title: 'Already released', merged_at: '2026-10-22T00:00:00Z' },
      { ...pr, number: 121, title: 'Closed without merge', merged_at: null },
      { ...pr, number: 122, title: 'New merge', merged_at: '2026-10-24T10:00:00Z' },
    ]);
    throw new Error('Unexpected endpoint');
  };
  await generate({ directory, env, fetchImpl });
  const markdown = await readFile(join(directory, 'CHANGELOG.md'), 'utf8');
  assert.ok(markdown.includes('New merge'));
  assert.ok(markdown.includes(pr.title));
  assert.ok(!markdown.includes('Already released'));
  assert.ok(!markdown.includes('Closed without merge'));
  const payload = await readFile(join(directory, 'discord-payload.json'), 'utf8');
  assert.ok(!payload.includes(env.GH_TOKEN));
  merged = false;
  await assert.rejects(generate({ directory, env, fetchImpl }), /Only PRs merged/);
});
