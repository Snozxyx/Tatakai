// Original pinned provider code, production VM, real local networking. Run with Bun.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { getQuickJS } from 'quickjs-emscripten';
import { evaluateMangayomi, type MangayomiMethod } from '../src/core/extensions/mangayomi/vm';
import { createMangayomiDom } from '../src/core/extensions/mangayomi/dom';

const commit = '6004f1f8d1a56f882dadb734ce26f50c626a3850';
const repository = 'https://github.com/kodjodevf/mangayomi-extensions';
const raw = `https://raw.githubusercontent.com/kodjodevf/mangayomi-extensions/${commit}`;
const signal = AbortSignal.timeout(120000), engine = await getQuickJS();
const evidence: any = { recordedAt: new Date().toISOString(), repository, commit, engine: 'quickjs-emscripten 0.32.0; linkedom 0.18.12', environment: `${process.platform}/${process.arch}; production interpreter via Bun; installed-app/device validation is separate`, checks: [], requests: [] };
async function step(name: string, work: () => Promise<any>) {
  const began = performance.now();
  try { const result = await work(); evidence.checks.push({ name, status: 'demonstrated', milliseconds: Math.round(performance.now() - began) }); console.log(name); return result; }
  catch (error: any) { evidence.checks.push({ name, status: 'blocked', error: String(error.message).slice(0, 300) }); throw error; }
}
try {
  const index = await step('Original pinned repository index', async () => {
    const response = await fetch(`${raw}/index.json`, { signal }); if (!response.ok) throw Error(`Index HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer()); evidence.indexSha256 = createHash('sha256').update(bytes).digest('hex');
    return JSON.parse(bytes.toString('utf8'));
  });
  const source = index.find((row: any) => row.name === 'MangaDex' && row.lang === 'en' && row.sourceCodeLanguage === 1);
  if (!source) throw Error('Pinned English JavaScript source not found');
  evidence.source = { id: String(source.id), name: source.name, lang: source.lang, version: source.version, catalogScriptUrl: source.sourceCodeUrl };
  const url = `${raw}/javascript/manga/src/all/mangadex.js`;
  const code = await step('Original pinned Mangayomi JavaScript artifact', async () => {
    const response = await fetch(url, { signal }); if (!response.ok) throw Error(`Artifact HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer()); evidence.scriptUrl = url; evidence.sha256 = createHash('sha256').update(bytes).digest('hex'); evidence.bytes = bytes.length;
    return bytes.toString('utf8');
  });
  const call = async (method: MangayomiMethod, args: unknown[]) => (await evaluateMangayomi(engine, code, method, args, { source, preferences: {} }, async request => {
    const response = await fetch(request.url, { method: request.method, headers: request.headers, body: ['GET', 'HEAD'].includes(request.method || 'GET') ? undefined : request.body, signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
    evidence.requests.push({ origin: new URL(request.url).origin, pathname: new URL(request.url).pathname, status: response.status, method: request.method, headerNames: Object.keys(request.headers || {}) });
    const body = await response.text(); if (body.length > 8 * 1024 * 1024) throw Error('HTTP response exceeded 8 MB');
    return { status: response.status, body, headers: Object.fromEntries(response.headers) };
  }, createMangayomiDom(), signal)).value;
  await step('Original provider construction and methods', () => call('probe', []));
  await step('Original preferences and declared headers', async () => {
    const rows = await call('getSourcePreferences', []), headers = await call('getHeaders', [source.baseUrl]);
    if (!rows.length || !headers['user-agent']) throw Error('Original preference defaults were not delivered'); evidence.preferences = rows.length;
  });
  const result = await step('Original source search', async () => {
    const data = await call('search', ['Give My Regards to Black Jack', 1, []]);
    if (!data?.list?.length) throw Error('No real search results'); evidence.results = data.list.length; return data.list[0];
  });
  const detail = await step('Original title details and chapters', async () => {
    const data = await call('getDetail', [result.link]); if (!data?.chapters?.length) throw Error('No original chapters'); evidence.chapters = data.chapters.length; return data;
  });
  const pages = await step('Original chapter page retrieval', async () => {
    const data = await call('getPageList', [detail.chapters[0].url]); if (!Array.isArray(data) || !data.length) throw Error('No original page URLs'); evidence.pages = data.length; return data;
  });
  await step('Original image HTTP bytes', async () => {
    const response = await fetch(typeof pages[0] === 'string' ? pages[0] : pages[0].url, { signal });
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw Error(`Image HTTP ${response.status}`);
    const reader = response.body!.getReader(), first = await reader.read(); await reader.cancel(); if (!first.value?.length) throw Error('Empty image'); evidence.imageType = response.headers.get('content-type');
  });
} catch { process.exitCode = 1; }
await fs.mkdir('.cache/extension-feasibility', { recursive: true });
await fs.writeFile('.cache/extension-feasibility/mangayomi-runtime-evidence.json', JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence.checks, null, 2));
