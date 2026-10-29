// Run with Bun. Original pinned scripts execute in the production interpreter; network is real local HTTP.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { getQuickJS } from 'quickjs-emscripten';
import { evaluateSora, type SoraMethod } from '../src/core/extensions/sora/vm';

const checkout = path.resolve('.cache/extension-feasibility/sora-modules');
const commit = execFileSync('git', ['-C', checkout, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const engine = await getQuickJS();
const evidence: any = { recordedAt: new Date().toISOString(), engine: 'quickjs-emscripten 0.32.0', repository: 'https://github.com/xdfkenny/Sora-Modules', commit, environment: `${process.platform}/${process.arch}; Bun CLI; native app/device integration separately verified`, modules: [] };
const decode = (value: any) => { if (typeof value === 'string') { try { return JSON.parse(value); } catch {} } return value; };
for (const module of ['mangadex', 'anidb']) {
  const prefix = `https://raw.githubusercontent.com/xdfkenny/Sora-Modules/${commit}/${module}/${module}`;
  const record: any = { module, manifestUrl: prefix + '.json', scriptUrl: prefix + '.js', checks: [], requests: [] }; evidence.modules.push(record);
  const signal = AbortSignal.timeout(90000);
  const step = async (name: string, work: () => Promise<any>) => {
    const began = performance.now();
    try { const result = await work(); record.checks.push({ name, status: 'demonstrated', milliseconds: Math.round(performance.now() - began) }); console.log(module, name); return result; }
    catch (error: any) { record.checks.push({ name, status: 'blocked', error: String(error.message).slice(0, 300) }); throw error; }
  };
  try {
    const original = await step('Download original pinned JavaScript artifact', async () => {
      const response = await fetch(record.scriptUrl, { signal }); if (!response.ok) throw Error(`HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer()); record.sha256 = createHash('sha256').update(bytes).digest('hex'); record.bytes = bytes.length; return bytes.toString('utf8');
    });
    const call = async (method: SoraMethod, args: unknown[]) => decode(await evaluateSora(engine, original, method, args, async request => {
      const response = await fetch(request.url, { method: request.method, headers: request.headers, body: ['GET', 'HEAD'].includes(request.method || 'GET') ? undefined : request.body, signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
      record.requests.push({ origin: new URL(request.url).origin, pathname: new URL(request.url).pathname, status: response.status, method: request.method, headerNames: Object.keys(request.headers || {}) });
      const body = await response.text(); if (body.length > 10 * 1024 * 1024) throw Error('Source response exceeded 10 MB');
      return { status: response.status, body, headers: Object.fromEntries(response.headers) };
    }, signal));
    await step('Original source exports loaded', () => call('probe', []));
    const results = await step('Original source search', async () => { const result = await call('searchResults', [module === 'mangadex' ? 'Give My Regards to Black Jack' : 'Naruto', 0, []]); if (!Array.isArray(result) || !result.length) throw Error('No real search results'); record.results = result.length; return result; });
    const titleId = results[0].href || results[0].id;
    if (module === 'mangadex') await step('Original title details', async () => { const details = await call('extractDetails', [titleId]); if (!details?.description) throw Error('No real description'); });
    const chapters = await step('Original chapters or episodes', async () => {
      const raw = await call(module === 'mangadex' ? 'extractChapters' : 'extractEpisodes', [titleId]);
      const list = Array.isArray(raw) ? raw : Object.values(raw || {}).flatMap((group: any) => Array.isArray(group) ? group.flatMap((entry: any) => Array.isArray(entry) && Array.isArray(entry[1]) ? entry[1] : [entry]) : []);
      if (!list.length) throw Error('No real chapters/episodes'); record.entries = list.length; return list;
    });
    const entryId = chapters[0].href || chapters[0].id;
    const resolved = await step('Original page or stream resolution', async () => { const data = await call(module === 'mangadex' ? 'extractImages' : 'extractStreamUrl', [entryId]); const list = module === 'mangadex' ? data : typeof data === 'string' ? [data] : data?.streams || (Array.isArray(data) ? data : [data]); const urls = Array.isArray(list) ? list.map((item:any)=>typeof item === 'string' ? item : item?.streamUrl || item?.url || item?.stream).filter((url:any)=>typeof url === 'string' && /^https?:\/\//.test(url)) : []; if (!urls.length) throw Error('No supported real media URLs'); record.resolvedMedia = urls.length; record.resolutionType = typeof data; return data; });
    if (module === 'mangadex') await step('Original image HTTP bytes', async () => {
      const response = await fetch(resolved[0], { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw Error(`Image HTTP ${response.status}`);
      const reader = response.body!.getReader(); const first = await reader.read(); await reader.cancel(); if (!first.value?.length) throw Error('No image bytes'); record.imageType = response.headers.get('content-type');
    });
  } catch { /* Record failed providers without concealing successful independent evidence. */ }
}
await fs.writeFile('.cache/extension-feasibility/sora-runtime-evidence.json', JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence.modules.map((record: any) => ({ module: record.module, checks: record.checks })), null, 2));
if (evidence.modules.some((record: any) => record.checks.some((check: any) => check.status === 'blocked'))) process.exitCode = 1;
