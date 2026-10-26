import { db } from '@/core/db/tatakai-db';
import { compatibilityAny, compatibilityTimeout, throwCompatibilityAbort } from '../compatibility/abort';
import { hasCompatibilityRuntime, type CompatibilitySource } from '../compatibility/client';
import { prepareLocalScriptRuntime } from '../sora/execute';
import { extensionRequestId } from '../compatibility/request-id';
import { proxyRemoteUrl } from '../remote/media';
import { executeMangayomi } from '../sora/execute';
import { soraHash, soraText, sourceUrl } from '../sora/repository';
import { mangayomiRepository, type MangayomiPackage } from './repository';
import type { MangayomiMethod } from './vm';
import { mangayomiEntryNumber } from './chapter-number';

const stateKey = 'compatibility:mangayomi:v1';
interface State {
  version: 1; repositories: { url: string; name: string; ecosystem: 'mangayomi' }[];
  packages: Record<string, MangayomiPackage>; enabled: Record<string, boolean>; preferences: Record<string, Record<string, unknown>>;
}
const calls = new Map<string, { controller: AbortController; sourceId?: string }>();
let mutations = Promise.resolve<unknown>(null);
const sid = (pkg: MangayomiPackage) => `compat-${pkg.id}`;
const object = (value: any) => !!value && typeof value === 'object' && !Array.isArray(value);
async function state(): Promise<State> {
  const record = await db.kv.get(stateKey);
  if (!record) return { version: 1, repositories: [], packages: {}, enabled: {}, preferences: {} };
  const value = JSON.parse(record.value);
  if (value?.version !== 1 || !Array.isArray(value.repositories) || !object(value.packages) || !object(value.enabled) || !object(value.preferences)
    || Object.values(value.enabled).some(flag => typeof flag !== 'boolean')
    || Object.entries(value.packages).some(([id, pkg]: [string, any]) => !/^mangayomi-[a-f0-9]{64}$/.test(id) || pkg?.id !== id || pkg.ecosystem !== 'mangayomi' || !['watch', 'read'].includes(pkg.kind) || !/^[a-f0-9]{64}$/.test(pkg.digest))) throw Error('Mangayomi settings need recovery; existing data was preserved');
  return value;
}
const save = (value: State) => db.kv.put({ key: stateKey, value: JSON.stringify(value), createdAt: new Date().toISOString() });
const inventory = (value: State) => Object.values(value.packages).map(pkg => ({ ...pkg, installed: true, hasUpdate: false }));
const source = (pkg: MangayomiPackage, value: State): CompatibilitySource => ({ id: sid(pkg), upstreamId: pkg.upstreamId, packageId: pkg.id, repository: pkg.repository, ecosystem: 'mangayomi', name: pkg.name, extensionName: pkg.name, lang: pkg.lang, kind: pkg.kind, enabled: value.enabled[sid(pkg)] === true, hasSettings: pkg.hasSettings });
const token = (owner: string, data: unknown) => btoa(Array.from(new TextEncoder().encode(JSON.stringify([owner, data])), byte => String.fromCharCode(byte)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function untoken(owner: string, encoded: unknown): any {
  if (typeof encoded !== 'string' || encoded.length > 30000) throw Error('Invalid Mangayomi content identifier');
  const result = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0))));
  if (!Array.isArray(result) || result[0] !== owner || !object(result[1])) throw Error('Content belongs to another source'); return result[1];
}
function originalId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 12000 || /[\x00-\x1f]/.test(value)) throw Error('Invalid original Mangayomi content identifier'); return value;
}
function headers(value: unknown): Record<string, string> {
  if (value == null) return {};
  if (!object(value) || Object.values(value).some(item => typeof item !== 'string') || JSON.stringify(value).length > 16384) throw Error('Invalid source headers');
  return Object.fromEntries(new Headers(value as Record<string, string>));
}
function preferences(rows: any, saved: Record<string, unknown>) {
  if (!Array.isArray(rows) || rows.length > 200) throw Error('Unsupported Mangayomi preference list');
  return rows.map((row, position) => {
    const kinds = [['checkBoxPreference', 'boolean'], ['switchPreferenceCompat', 'boolean'], ['listPreference', 'select'], ['multiSelectListPreference', 'multiselect'], ['editTextPreference', 'text']] as const;
    const found = kinds.find(([key]) => object(row?.[key]));
    const data = found ? row[found[0]] : {};
    const key = String(row?.key || '');
    const options = Array.isArray(data.entryValues) ? data.entryValues.slice(0, 300).map((value: unknown, index: number) => ({ value: String(value), label: String(data.entries?.[index] ?? value) })) : [];
    const initial = found?.[1] === 'multiselect' ? data.values || [] : data.value ?? options[data.valueIndex || 0]?.value ?? (found?.[1] === 'boolean' ? false : '');
    return { position, key, kind: found?.[1] || 'unsupported', title: String(data.title || key || 'Preference'), summary: data.summary ? String(data.summary) : undefined,
      value: Object.prototype.hasOwnProperty.call(saved, key) ? saved[key] : initial, options, enabled: !!key && key.length <= 200 && !!found, visible: true };
  });
}
async function execute(p: Record<string, any>, signal: AbortSignal) {
  const value = await state();
  if (p.op === 'repositories') return value.repositories;
  if (p.op === 'installedPackages') return inventory(value);
  if (p.op === 'sources') return Object.values(value.packages).map(pkg => source(pkg, value));
  if (p.op === 'prepare') return prepareLocalScriptRuntime(signal);
  if (p.op === 'addRepository' || p.op === 'removeRepository') {
    const url = sourceUrl(p.url, undefined, true);
    if (p.op === 'addRepository') await mangayomiRepository(url, signal);
    await db.transaction('rw', db.kv, async () => {
      const latest = await state(); latest.repositories = latest.repositories.filter(repo => repo.url !== url);
      if (p.op === 'addRepository') latest.repositories.push({ url, name: new URL(url).hostname, ecosystem: 'mangayomi' });
      throwCompatibilityAbort(signal); await save(latest);
    }); return null;
  }
  if (p.op === 'packages' || p.op === 'install') {
    const catalog = new Map<string, MangayomiPackage & { installed: boolean; hasUpdate: boolean; error?: string }>();
    const errors = new Map<string, string>();
    for (const repo of value.repositories) {
      try { for (const pkg of await mangayomiRepository(repo.url, signal)) catalog.set(pkg.id, { ...pkg, installed: !!value.packages[pkg.id], hasUpdate: !!value.packages[pkg.id] && value.packages[pkg.id].version !== pkg.version }); }
      catch (error) { throwCompatibilityAbort(signal); errors.set(repo.url, error instanceof Error ? error.message : 'Repository failed'); }
    }
    for (const pkg of inventory(value)) if (!catalog.has(pkg.id)) catalog.set(pkg.id, { ...pkg, error: errors.get(pkg.repository) });
    if (p.op === 'packages') { if (!catalog.size && errors.size) throw Error([...errors.values()].join('; ')); return [...catalog.values()]; }
    const pkg = catalog.get(p.packageId);
    if (!pkg || errors.has(pkg.repository)) throw Error('Refresh this Mangayomi repository before installing');
    const original = await soraText(pkg.scriptUrl, signal);
    const available = await executeMangayomi(original, 'probe', [], { source: pkg.source, preferences: value.preferences[pkg.id] || {} }, signal);
    if (!available.value.getHeaders || !available.value.search || !available.value.getDetail || !(pkg.kind === 'watch' ? available.value.getVideoList : available.value.getPageList)) throw Error('Mangayomi source is missing required methods');
    // Validate original source headers before replacing the installed artifact.
    const declared = await executeMangayomi(original, 'getHeaders', [pkg.baseUrl], { source: pkg.source, preferences: value.preferences[pkg.id] || {} }, signal);
    headers(declared.value);
    const candidate: MangayomiPackage = { ...pkg, digest: await soraHash(original), hasSettings: available.value.getSourcePreferences === true, hasBrowse: available.value.getPopular === true };
    await db.transaction('rw', db.kv, async () => {
      const latest = await state(); throwCompatibilityAbort(signal);
      await db.kv.put({ key: `mangayomi:artifact:${candidate.digest}`, value: original, createdAt: new Date().toISOString() });
      const previous = latest.packages[pkg.id]; latest.packages[pkg.id] = candidate; await save(latest);
      if (previous?.digest && !Object.values(latest.packages).some(other => other.digest === previous.digest)) await db.kv.delete(`mangayomi:artifact:${previous.digest}`);
    }); return null;
  }
  if (p.op === 'remove') {
    await db.transaction('rw', db.kv, async () => {
      const latest = await state(), pkg = latest.packages[p.packageId]; if (!pkg) throw Error('Source is not installed');
      delete latest.packages[pkg.id]; delete latest.enabled[sid(pkg)]; delete latest.preferences[pkg.id];
      throwCompatibilityAbort(signal); await save(latest);
      if (!Object.values(latest.packages).some(other => other.digest === pkg.digest)) await db.kv.delete(`mangayomi:artifact:${pkg.digest}`);
    });
    for (const call of calls.values()) if (call.sourceId === `compat-${p.packageId}`) call.controller.abort(); return null;
  }
  const pkg = Object.values(value.packages).find(pkg => sid(pkg) === p.sourceId);
  if (!pkg) throw Error('Mangayomi source is not installed');
  if (p.op === 'setEnabled') {
    if (typeof p.enabled !== 'boolean') throw Error('Invalid enabled state');
    await db.transaction('rw', db.kv, async () => { const latest = await state(); if (!latest.packages[pkg.id]) throw Error('Source was removed'); throwCompatibilityAbort(signal); latest.enabled[p.sourceId] = p.enabled; await save(latest); });
    if (!p.enabled) for (const call of calls.values()) if (call.sourceId === p.sourceId) call.controller.abort(); return null;
  }
  const settings = ['preferences', 'setPreference'].includes(p.op);
  if (!settings && !value.enabled[p.sourceId]) throw Error('Mangayomi source is disabled');
  const record = await db.kv.get(`mangayomi:artifact:${pkg.digest}`);
  if (!record || await soraHash(record.value) !== pkg.digest) throw Error('Mangayomi artifact checksum mismatch; repair the installed source');
  const invoke = async (method: MangayomiMethod, args: unknown[]) => {
    const result = await executeMangayomi(record.value, method, args, { source: pkg.source, preferences: value.preferences[pkg.id] || {} }, signal);
    if (!object(result.preferences) || Object.keys(result.preferences).length > 200 || JSON.stringify(result.preferences).length > 65536
      || Object.entries(result.preferences).some(([key, item]) => !key || key.length > 200 || ['__proto__', 'constructor', 'prototype'].includes(key)
        || !(typeof item === 'boolean' || typeof item === 'string' && item.length <= 16384 || Array.isArray(item) && item.length <= 300 && item.every(entry => typeof entry === 'string' && entry.length <= 16384)))) throw Error('Invalid source preference writes');
    if (Object.keys(result.preferences).length) await db.transaction('rw', db.kv, async () => {
      const latest = await state(); throwCompatibilityAbort(signal);
      if (latest.packages[pkg.id]?.digest !== pkg.digest || (!settings && !latest.enabled[p.sourceId])) throw Error('Source was changed or disabled');
      latest.preferences[pkg.id] = { ...latest.preferences[pkg.id], ...result.preferences }; await save(latest);
    });
    Object.assign(value.preferences[pkg.id] ||= {}, result.preferences);
    return result.value;
  };
  if (settings) {
    const rows = pkg.hasSettings ? preferences(await invoke('getSourcePreferences', []), value.preferences[pkg.id] || {}) : [];
    if (p.op === 'preferences') return rows;
    const row = rows.find(row => row.position === p.position && row.enabled);
    if (!row || ['__proto__', 'constructor', 'prototype'].includes(row.key) || (row.kind === 'boolean' ? typeof p.value !== 'boolean' : row.kind === 'select' ? !row.options.some(option => option.value === p.value) : row.kind === 'multiselect' ? !Array.isArray(p.value) || p.value.length > row.options.length || p.value.some((item: unknown) => !row.options.some(option => option.value === item)) : typeof p.value !== 'string' || p.value.length > 16384)) throw Error('Invalid source preference value');
    await db.transaction('rw', db.kv, async () => {
      const latest = await state(); throwCompatibilityAbort(signal); if (latest.packages[pkg.id]?.digest !== pkg.digest) throw Error('Source was changed');
      (latest.preferences[pkg.id] ||= {})[row.key] = p.value; await save(latest);
    }); return null;
  }
  const id = sid(pkg), declared = headers(await invoke('getHeaders', [pkg.baseUrl]));
  if (p.op === 'search' || p.op === 'browse') {
    if (p.op === 'browse' && !pkg.hasBrowse) return { results: [], hasNextPage: false };
    const page = Math.max(1, Math.min(Number(p.page) || 1, 100));
    const data = await invoke(p.op === 'browse' ? 'getPopular' : 'search', p.op === 'browse' ? [page] : [String(p.query || '').slice(0, 300), page, []]);
    if (!Array.isArray(data?.list)) throw Error('Mangayomi source returned an unsupported search list');
    return { hasNextPage: data.hasNextPage === true, results: await Promise.all(data.list.slice(0, 500).map(async (row: any) => {
      const media = { url: originalId(row.link || row.url), title: String(row.name || row.title || 'Untitled'), image: row.imageUrl || row.image };
      return { id: token(id, media), title: media.title, image: media.image ? await proxyRemoteUrl(sourceUrl(media.image, pkg.baseUrl), declared) : undefined };
    })) };
  }
  if (p.op === 'info' || p.op === 'chapters') {
    const media = untoken(id, p.id), details = await invoke('getDetail', [originalId(media.url)]);
    if (!Array.isArray(details?.chapters)) throw Error('Mangayomi source returned no chapter/episode list');
    return { id: p.id, title: details.name || media.title, description: details.description, image: details.imageUrl || media.image ? await proxyRemoteUrl(sourceUrl(details.imageUrl || media.image, pkg.baseUrl), declared) : undefined,
      entries: details.chapters.slice(0, 10000).map((entry: any) => {
        const label = String(entry.name || entry.title || 'Entry'), number = mangayomiEntryNumber(label, entry.number);
        return { id: token(id, { url: originalId(entry.url || entry.link), titleUrl: media.url }), label, number };
      }).sort((a: any, b: any) => (a.number ?? Infinity) - (b.number ?? Infinity)) };
  }
  if (p.op === 'pages') {
    if (pkg.kind !== 'read') throw Error('This source does not provide manga pages');
    const entry = untoken(id, p.chapterId), pages = await invoke('getPageList', [originalId(entry.url)]);
    if (!Array.isArray(pages)) throw Error('Mangayomi source returned an unsupported page list');
    return { pages: pages.slice(0, 2000).map((row, index) => ({ pageNumber: index + 1, imageUrl: sourceUrl(typeof row === 'string' ? row : row.url, pkg.baseUrl), headers: { ...declared, ...headers(row?.headers) } })) };
  }
  if (p.op === 'resolve') {
    if (pkg.kind !== 'watch') throw Error('This source does not provide video');
    const media = untoken(id, p.id), entry = untoken(id, p.episodeId);
    if (entry.titleUrl !== media.url) throw Error('Episode belongs to another title');
    const videos = await invoke('getVideoList', [originalId(entry.url)]);
    if (!Array.isArray(videos) || !videos.length) throw Error('Mangayomi source returned no streams');
    return { sources: videos.slice(0, 100).map(row => {
      const url = sourceUrl(row.url, pkg.baseUrl), resourceHeaders = headers(row.headers ?? declared);
      return { url, forceProxy: true, source: row.quality || pkg.name, quality: row.quality, sourceType: /\.m3u8(?:\?|$)/i.test(url) ? 'hls' : /\.mpd(?:\?|$)/i.test(url) ? 'dash' : 'mp4', headers: resourceHeaders,
        subtitles: (Array.isArray(row.subtitles) ? row.subtitles : []).slice(0, 100).map((track: any) => ({ url: sourceUrl(track.file || track.url, pkg.baseUrl), language: track.label || track.lang, headers: headers(track.headers ?? resourceHeaders) })) };
    }) };
  }
  throw Error('This Mangayomi host API is not implemented');
}
export async function requestMangayomi(payload: Record<string, any>, parentSignal?: AbortSignal) {
  if (!hasCompatibilityRuntime('mangayomi')) throw Error('Mangayomi extensions require an installed app with local workers and WebAssembly');
  const requestId = String(payload.requestId || extensionRequestId());
  if (payload.op === 'cancel') { calls.get(payload.target)?.controller.abort(); return null; }
  if (calls.size >= 24 || calls.has(requestId)) throw Error('Too many Mangayomi requests');
  const controller = new AbortController();
  const signal = compatibilityAny([controller.signal, compatibilityTimeout(120000), ...(parentSignal ? [parentSignal] : [])]);
  calls.set(requestId, { controller, sourceId: payload.op === 'setEnabled' ? undefined : payload.sourceId });
  const run = async () => {
    throwCompatibilityAbort(signal); const result = await execute(payload, signal); throwCompatibilityAbort(signal);
    if (payload.sourceId && !['setEnabled', 'preferences', 'setPreference'].includes(payload.op)) {
      const latest = await state(); if (!latest.enabled[payload.sourceId] || !Object.values(latest.packages).some(pkg => sid(pkg) === payload.sourceId)) throw Error('Source was disabled or removed');
    } return result;
  };
  try { return ['addRepository', 'removeRepository', 'install', 'remove', 'setEnabled', 'setPreference'].includes(payload.op) ? await (mutations = mutations.catch(() => {}).then(run)) : await run(); }
  finally { calls.delete(requestId); controller.abort(); }
}
