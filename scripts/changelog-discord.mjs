import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const outputDirectory = '.artifacts/changelog';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function plain(value) {
  return String(value ?? '').replace(/[\r\n\u0000-\u001f\u007f]/g, ' ').trim();
}

function markdown(value) {
  return plain(value).replace(/[\\`*_{}[\]<>]/g, '\\$&');
}

export function category(pr) {
  const labels = (pr.labels || []).map((label) => String(label.name || '').toLowerCase());
  if (labels.some((label) => /security/.test(label)) || /^security[(:]/i.test(pr.title)) return 'Security';
  if (labels.includes('dependencies') || /^chore\(deps\)/i.test(pr.title)) return 'Dependencies';
  if (/^fix[(:]/i.test(pr.title) || labels.includes('bug')) return 'Fixes';
  if (/^feat[(:]/i.test(pr.title) || labels.includes('enhancement')) return 'Features';
  return 'Other changes';
}

export function renderChangelog(prs, repository, release) {
  const sections = new Map();
  for (const pr of [...prs].sort((a, b) => b.merged_at.localeCompare(a.merged_at) || b.number - a.number)) {
    const heading = category(pr);
    if (!sections.has(heading)) sections.set(heading, []);
    // Links are constructed from the validated repository and numeric PR id,
    // rather than accepting destinations from PR titles or descriptions.
    sections.get(heading).push(`- ${markdown(pr.title)} ([#${pr.number}](https://github.com/${repository}/pull/${pr.number})) — @${markdown(pr.user?.login || 'unknown')}`);
  }
  const baseline = release
    ? `Merged changes since ${markdown(release.tag_name)} (${release.published_at.slice(0, 10)}).`
    : 'Merged changes in the default branch; no published stable release exists.';
  return [
    '# Tatakai changelog', '', '## Unreleased', '', baseline,
    '', 'These changes are merged development work. This is not a new app release.',
    ...(prs.length ? [] : ['', 'No merged PRs since the latest stable release.']),
    ...[...sections].flatMap(([heading, entries]) => ['', `### ${heading}`, '', ...entries]), '',
  ].join('\n');
}

export function discordPayload(pr, repository) {
  return {
    username: 'Tatakai Changelog',
    allowed_mentions: { parse: [] },
    embeds: [{
      title: 'Tatakai • merged changes',
      description: `${markdown(pr.title).slice(0, 1500)}\n\nFull unreleased changelog attached.`,
      url: `https://github.com/${repository}/pull/${pr.number}`,
      color: 0x9b87f5,
      timestamp: pr.merged_at,
      footer: { text: `PR #${pr.number} • ${category(pr)} • No new version published` },
    }],
    attachments: [{ id: 0, filename: 'CHANGELOG.md', description: 'Automatically generated unreleased changelog' }],
  };
}

export async function sendDiscord(webhook, payload, changelog, { fetchImpl = fetch, sleep = pause } = {}) {
  let url;
  try { url = new URL(webhook); } catch { throw new Error('Discord webhook secret is missing or invalid.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'discord.com' || url.port || url.username || url.password ||
      !/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(url.pathname)) {
    throw new Error('Discord webhook secret is invalid.');
  }
  url.searchParams.set('wait', 'true');
  for (let attempt = 0; attempt < 3; attempt++) {
    const form = new FormData();
    form.append('payload_json', JSON.stringify(payload));
    form.append('files[0]', new Blob([changelog], { type: 'text/markdown' }), 'CHANGELOG.md');
    let response;
    try {
      response = await fetchImpl(url, { method: 'POST', body: form, redirect: 'error', signal: AbortSignal.timeout(30_000) });
    } catch {
      // Do not print fetch errors: they may contain the secret URL. A timeout
      // may follow a successful delivery, so do not blindly retry it.
      throw new Error('Discord delivery could not be confirmed; inspect the channel before retrying.');
    }
    if (response.status === 429 && attempt < 2) {
      const data = await response.json().catch(() => ({}));
      const retrySeconds = Number(data.retry_after ?? response.headers.get('retry-after') ?? 1);
      if (!Number.isFinite(retrySeconds) || retrySeconds < 0 || retrySeconds > 30) {
        throw new Error('Discord rate limit exceeds the retry budget; retry later.');
      }
      await sleep(Math.max(250, retrySeconds * 1000));
      continue;
    }
    if (!response.ok) throw new Error(`Discord rejected delivery (HTTP ${response.status}).`);
    const message = await response.json().catch(() => null);
    if (!message?.id) throw new Error('Discord delivery returned no message receipt; inspect the channel before retrying.');
    return message.id;
  }
}

export async function generate({ fetchImpl = fetch, env = process.env, directory = outputDirectory } = {}) {
  const repository = env.GITHUB_REPOSITORY;
  const number = env.PR_NUMBER;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || '') || !/^[1-9]\d*$/.test(number || '')) {
    throw new Error('GITHUB_REPOSITORY and a numeric PR_NUMBER are required.');
  }
  if (!env.GH_TOKEN) throw new Error('GH_TOKEN is required to read merged pull requests.');
  const api = async (route, optional = false) => {
    const response = await fetchImpl(`https://api.github.com/repos/${repository}${route}`, {
      headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: AbortSignal.timeout(30_000),
    });
    if (optional && response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub changelog lookup failed (HTTP ${response.status}).`);
    return response.json();
  };
  const repo = await api('');
  const pr = await api(`/pulls/${number}`);
  if (!pr.merged_at || pr.base?.ref !== repo.default_branch || pr.base?.repo?.full_name?.toLowerCase() !== repository.toLowerCase()) {
    throw new Error('Only PRs merged into this repository’s default branch can be announced.');
  }
  const release = await api('/releases/latest', true);
  const prs = [];
  // updated_at >= merged_at, so once an updated-desc page predates the
  // release cutoff all later pages are safely outside the unreleased window.
  for (let page = 1; ; page++) {
    const entries = await api(`/pulls?state=closed&base=${encodeURIComponent(repo.default_branch)}&sort=updated&direction=desc&per_page=100&page=${page}`);
    prs.push(...entries.filter((entry) => entry.merged_at && (!release || entry.merged_at > release.published_at)));
    if (entries.length < 100 || release && entries.at(-1).updated_at < release.published_at) break;
  }
  // The event's PR can briefly be absent from the list endpoint after merging.
  if (!prs.some((entry) => entry.number === pr.number) && (!release || pr.merged_at > release.published_at)) prs.push(pr);
  const changelog = renderChangelog(prs, repository, release);
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/CHANGELOG.md`, changelog);
  await writeFile(`${directory}/discord-payload.json`, JSON.stringify(discordPayload(pr, repository), null, 2));
  if (env.GITHUB_STEP_SUMMARY) await writeFile(env.GITHUB_STEP_SUMMARY, changelog, { flag: 'a' });
  console.log(`Generated unreleased changelog from ${prs.length} merged PR(s). No version or release changed.`);
}

async function main() {
  if (!process.argv.includes('--send')) return generate();
  const payload = JSON.parse(await readFile(`${outputDirectory}/discord-payload.json`, 'utf8'));
  const changelog = await readFile(`${outputDirectory}/CHANGELOG.md`, 'utf8');
  const messageId = await sendDiscord(process.env.DISCORD_CHANGELOG_WEBHOOK_URL, payload, changelog);
  console.log(`Discord changelog delivered (message ${messageId}).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
