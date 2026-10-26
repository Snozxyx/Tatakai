import { compatibilityAny, compatibilityTimeout, throwCompatibilityAbort } from '../compatibility/abort';
import { db } from '@/core/db/tatakai-db';
import type { CompatibilityPackage, CompatibilitySource } from '../compatibility/client';
import { languageLabel } from '../remote/metadata';
import { proxyRemoteUrl } from '../remote/media';
import { executeSora, prepareLocalScriptRuntime } from './execute';
import { localScriptRuntimeState } from './runtime';
import { extensionRequestId } from '../compatibility/request-id';
import { soraHash, soraRepository, soraText, sourceUrl, type SoraPackage } from './repository';

const stateKey = 'compatibility:sora:v1';
interface State { version: 1; repositories: { url: string; name: string; ecosystem: 'sora' }[]; packages: Record<string, SoraPackage>; enabled: Record<string, boolean> }
const calls = new Map<string, { controller: AbortController; sourceId?: string }>();
let mutations = Promise.resolve<unknown>(null);
export const hasSoraRuntime = () => localScriptRuntimeState().available;
const sid = (pkg: SoraPackage) => `compat-sora-${pkg.id.slice(5)}`;
async function state(): Promise<State> {
  const record = await db.kv.get(stateKey);
  if (!record) return { version: 1, repositories: [], packages: {}, enabled: {} };
  const value = JSON.parse(record.value);
  if (value?.version !== 1 || !Array.isArray(value.repositories) || !value.packages || !value.enabled || typeof value.packages !== 'object' || Array.isArray(value.packages) || typeof value.enabled !== 'object' || Array.isArray(value.enabled)) throw Error('Sora settings need recovery; existing data was preserved');
  if (Object.values(value.enabled).some(flag => typeof flag !== 'boolean') || Object.entries(value.packages).some(([id, pkg]: [string, any]) => !/^sora-[a-f0-9]{64}$/.test(id) || pkg?.id !== id || pkg.ecosystem !== 'sora' || !['watch', 'read'].includes(pkg.kind) || !/^[a-f0-9]{64}$/.test(pkg.digest))) throw Error('Invalid Sora inventory; existing data was preserved');
  return value;
}
const save = (value: State) => db.kv.put({ key: stateKey, value: JSON.stringify(value), createdAt: new Date().toISOString() });
const inventory = (value: State): CompatibilityPackage[] => Object.values(value.packages).map(pkg => ({ ...pkg, installed: true, hasUpdate: false }));
const source = (pkg: SoraPackage, value: State): CompatibilitySource => ({ id: sid(pkg), upstreamId: pkg.name, packageId: pkg.id, repository: pkg.repository, ecosystem: 'sora', name: pkg.name, extensionName: pkg.name, lang: pkg.lang, kind: pkg.kind, enabled: value.enabled[sid(pkg)] === true });
const token = (id: string, data: unknown) => btoa(Array.from(new TextEncoder().encode(JSON.stringify([id, data])), byte => String.fromCharCode(byte)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function untoken(id: string, value: unknown): any {
  if (typeof value !== 'string' || value.length > 30000) throw Error('Invalid Sora content identifier');
  const [owner, data] = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0))));
  if (owner !== id) throw Error('Content does not belong to this source'); return data;
}
function originalId(value: unknown): string { if (typeof value !== 'string' || !value.trim() || value.length > 12000 || /[\x00-\x1f]/.test(value)) throw Error('Invalid original Sora content identifier'); return value; }
function subtitleList(value: any): any[] { return typeof value === 'string' ? [{ url: value, label: 'Subtitles' }] : Array.isArray(value) ? value : []; }
function mergedHeaders(fallback: Record<string, string>, declared?: Record<string, string>) {
  const headers = new Headers(fallback);
  for (const [name, value] of Object.entries(declared || {})) headers.set(name, value);
  return Object.fromEntries(headers.entries());
}
function parsed(value: any) { for (let i = 0; i < 2 && typeof value === 'string'; i++) { try { value = JSON.parse(value); } catch { break; } } return value; }
function entries(value: any, language?: string): any[] {
  value = parsed(value);
  if (Array.isArray(value)) return value.flatMap(entry => Array.isArray(entry) && entry.length === 2 && Array.isArray(entry[1]) ? entry[1].map(item => ({ language, ...item, number: item.number ?? item.chapter ?? entry[0] })) : [{ language, ...entry }]);
  if (value && typeof value === 'object' && !value.error) return value.href || value.id ? [{ language, ...value }] : Object.entries(value).flatMap(([key, item]) => entries(item, /^[a-z]{2,3}(?:-[A-Za-z]{2})?$/.test(key) ? key : language));
  throw Error('Sora module returned an unsupported content list');
}
async function code(pkg: SoraPackage) {
  const record = await db.kv.get(`sora:artifact:${pkg.digest}`);
  if (!record || await soraHash(record.value) !== pkg.digest) throw Error('Sora artifact needs repair: checksum mismatch');
  return record.value;
}
async function execute(p: Record<string, any>, signal: AbortSignal) {
  const value = await state();
  if (p.op === 'installedPackages') return inventory(value);
  if (p.op === 'sources') return Object.values(value.packages).map(pkg => source(pkg, value));
  if (p.op === 'repositories') return value.repositories;
  if (p.op === 'prepare') return prepareLocalScriptRuntime(signal);
  if (p.op === 'addRepository' || p.op === 'removeRepository') {
    const url = sourceUrl(p.url, undefined, true);
    if (p.op === 'addRepository') await soraRepository(url, signal);
    await db.transaction('rw', db.kv, async () => { const latest = await state(); latest.repositories = latest.repositories.filter(repo => repo.url !== url); if (p.op === 'addRepository') latest.repositories.push({ url, name: new URL(url).hostname, ecosystem: 'sora' }); await save(latest); }); return null;
  }
  if (p.op === 'packages' || p.op === 'install') {
    const catalog = new Map<string, CompatibilityPackage & SoraPackage>();
    const errors = new Map<string, string>();
    for (const repo of value.repositories) {
      try { for (const pkg of await soraRepository(repo.url, signal)) catalog.set(pkg.id, { ...pkg, installed: !!value.packages[pkg.id], hasUpdate: !!value.packages[pkg.id] && value.packages[pkg.id].version !== pkg.version }); }
      catch (error) { throwCompatibilityAbort(signal); errors.set(repo.url, error instanceof Error ? error.message : 'Repository failed'); }
    }
    for (const pkg of inventory(value)) if (!catalog.has(pkg.id)) catalog.set(pkg.id, { ...pkg, error: errors.get(pkg.repository) } as CompatibilityPackage & SoraPackage);
    if (p.op === 'packages') { if (!catalog.size && errors.size) throw Error([...errors.values()].join('; ')); return [...catalog.values()]; }
    const pkg = catalog.get(p.packageId); if (!pkg) throw Error('Module is not in an added Sora repository');
    if (errors.has(pkg.repository)) throw Error('Refresh the repository before installing: ' + errors.get(pkg.repository));
    const original = await soraText(pkg.scriptUrl, signal);
    const available = await executeSora(original, 'probe', [], signal);
    if (!available.searchResults || !(pkg.kind === 'watch' ? available.extractEpisodes && available.extractStreamUrl : available.extractChapters && available.extractImages)) throw Error('Sora module is missing required source methods');
    const candidate: SoraPackage = { ...pkg, digest: await soraHash(original), hasDetails: available.extractDetails === true };
    throwCompatibilityAbort(signal);
    await db.transaction('rw', db.kv, async () => {
      const latest = await state(); throwCompatibilityAbort(signal);
      await db.kv.put({ key: `sora:artifact:${candidate.digest}`, value: original, createdAt: new Date().toISOString() });
      const previous = latest.packages[pkg.id];
      latest.packages[pkg.id] = candidate; await save(latest);
      if (previous?.digest && !Object.values(latest.packages).some(other => other.digest === previous.digest)) await db.kv.delete(`sora:artifact:${previous.digest}`);
    }); return null;
  }
  if (p.op === 'remove') {
    await db.transaction('rw', db.kv, async () => { const latest = await state(); const pkg = latest.packages[p.packageId]; if (!pkg) throw Error('Module is not installed'); delete latest.packages[pkg.id]; delete latest.enabled[sid(pkg)]; await save(latest); if (!Object.values(latest.packages).some(other => other.digest === pkg.digest)) await db.kv.delete(`sora:artifact:${pkg.digest}`); });
    for (const call of calls.values()) if (call.sourceId === `compat-sora-${String(p.packageId).slice(5)}`) call.controller.abort(); return null;
  }
  const pkg = Object.values(value.packages).find(pkg => sid(pkg) === p.sourceId);
  if (!pkg) throw Error('Sora source is not installed');
  if (p.op === 'setEnabled') {
    if (typeof p.enabled !== 'boolean') throw Error('Invalid enabled state');
    await db.transaction('rw', db.kv, async () => { const latest = await state(); if (!latest.packages[pkg.id]) throw Error('Source was removed'); latest.enabled[p.sourceId] = p.enabled; await save(latest); });
    if (!p.enabled) for (const call of calls.values()) if (call.sourceId === p.sourceId) call.controller.abort(); return null;
  }
  if (!value.enabled[p.sourceId]) throw Error('Sora source is disabled');
  const original = await code(pkg), id = sid(pkg);
  const invoke = async (method: Parameters<typeof executeSora>[1], args: unknown[]) => parsed(await executeSora(original, method, args, signal));
  const headers: Record<string, string> = pkg.baseUrl ? { Referer: pkg.baseUrl } : {};
  if (p.op === 'browse') return { results: [], hasNextPage: false }; // Sora declares search, not a popular catalog API.
  if (p.op === 'search') {
    const result = await invoke('searchResults', [String(p.query || '').slice(0, 300), Math.max(0, Math.min((Number(p.page) || 1) - 1, 99)), []]);
    if (!Array.isArray(result)) throw Error('Sora search did not return a list');
    return { hasNextPage: false, results: await Promise.all(result.slice(0, 500).map(async row => {
      const media = { url: originalId(row.href || row.id), title: String(row.title || row.name || 'Untitled'), image: row.image || row.imageURL };
      return { id: token(id, media), title: media.title, image: media.image ? await proxyRemoteUrl(sourceUrl(media.image, pkg.baseUrl), headers) : undefined };
    })) };
  }
  if (p.op === 'info' || p.op === 'chapters') {
    const media = untoken(id, p.id);
    const list = entries(await invoke(pkg.kind === 'watch' ? 'extractEpisodes' : 'extractChapters', [originalId(media.url)])).filter(row => pkg.kind !== 'read' || !row.language || /^(all|multi|unknown)$/i.test(pkg.lang) || languageLabel(row.language).toLowerCase() === languageLabel(pkg.lang).toLowerCase());
    const details = pkg.hasDetails ? await invoke('extractDetails', [originalId(media.url)]).catch(() => null) : null;
    return { id: p.id, title: media.title, description: details?.description, image: media.image ? await proxyRemoteUrl(sourceUrl(media.image, pkg.baseUrl), headers) : undefined, entries: list.slice(0, 10000).map(row => {
      const url = originalId(row.href || row.id), rawNumber = row.number ?? row.chapter ?? row.episode;
      const number = typeof rawNumber === 'number' ? rawNumber : Number(String(rawNumber ?? '').match(/\d+(?:\.\d+)?/)?.[0]);
      return { id: token(id, { url, titleUrl: media.url }), label: String(row.title || row.name || rawNumber || 'Entry'), number: Number.isFinite(number) ? number : undefined };
    }).sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity)) };
  }
  if (p.op === 'pages') {
    if (pkg.kind !== 'read') throw Error('This Sora module does not provide manga pages');
    const entry = untoken(id, p.chapterId), result = await invoke('extractImages', [originalId(entry.url)]);
    if (!Array.isArray(result)) throw Error('Sora page retrieval did not return a list');
    return { pages: result.slice(0, 2000).map((row, index) => ({ pageNumber: index + 1, imageUrl: sourceUrl(typeof row === 'string' ? row : row.url || row.image, pkg.baseUrl), headers: mergedHeaders(headers, row.headers) })) };
  }
  if (p.op === 'resolve') {
    if (pkg.kind !== 'watch') throw Error('This Sora module does not provide video');
    const media = untoken(id, p.id), entry = untoken(id, p.episodeId);
    if (entry.titleUrl !== media.url) throw Error('Episode does not belong to this title');
    const result = await invoke('extractStreamUrl', [originalId(entry.url)]);
    const list = typeof result === 'string' ? [{ url: result }] : result?.streams || (Array.isArray(result) ? result : [result]);
    const sources = list.map((row: any) => {
      const url = sourceUrl(typeof row === 'string' ? row : row?.streamUrl || row?.url || row?.stream, pkg.baseUrl);
      const streamHeaders = mergedHeaders({}, row?.headers);
      return { url, forceProxy: true, source: row?.title || row?.name || pkg.name, sourceType: /\.m3u8(?:\?|$)/i.test(url) ? 'hls' : /\.mpd(?:\?|$)/i.test(url) ? 'dash' : 'mp4', headers: streamHeaders,
        quality: row?.quality, audioLanguage: row?.language || row?.audioLanguage, subtitles: subtitleList(row?.subtitles || result?.subtitles || result?.subtitle).map((track: any) => ({ url: sourceUrl(track.url || track.file, pkg.baseUrl), language: track.lang || track.language || track.label, label: track.label, headers: track.headers || streamHeaders })) };
    });
    if (!sources.length) throw Error('Sora module returned no supported streams'); return { sources };
  }
  throw Error('This Sora module does not expose that host API');
}
export async function requestSora(payload: Record<string, any>, parentSignal?: AbortSignal) {
  if (!hasSoraRuntime()) throw Error('Sora extensions require an installed app with local workers and WebAssembly');
  const requestId = String(payload.requestId || extensionRequestId());
  if (payload.op === 'cancel') { calls.get(payload.target)?.controller.abort(); return null; }
  if (calls.size >= 24 || calls.has(requestId)) throw Error('Too many Sora requests');
  const controller = new AbortController();
  const signal = parentSignal ? compatibilityAny([parentSignal, controller.signal, compatibilityTimeout(120000)]) : compatibilityAny([controller.signal, compatibilityTimeout(120000)]);
  calls.set(requestId, { controller, sourceId: payload.op === 'setEnabled' ? undefined : payload.sourceId });
  const run = async () => {
    throwCompatibilityAbort(signal); const result = await execute(payload, signal); throwCompatibilityAbort(signal);
    if (payload.sourceId && payload.op !== 'setEnabled') { const latest = await state(); if (!latest.enabled[payload.sourceId] || !Object.values(latest.packages).some(pkg => sid(pkg) === payload.sourceId)) throw Error('Sora source was disabled or removed'); }
    return result;
  };
  try { return ['addRepository', 'removeRepository', 'install', 'remove', 'setEnabled'].includes(payload.op) ? await (mutations = mutations.catch(() => {}).then(run)) : await run(); }
  finally { calls.delete(requestId); controller.abort(); }
}
