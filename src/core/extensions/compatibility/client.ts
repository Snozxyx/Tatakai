import { randomUUID } from '../../../lib/uuid';
import { throwCompatibilityAbort } from './abort';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { EXTENSION_INSTALLED_EVENT } from '../ecosystems';
import { localScriptRuntimeState } from '../sora/runtime';

export const COMPATIBILITY_ECOSYSTEMS = ['cloudstream', 'mihon', 'sora', 'mangayomi', 'aniyomi'] as const;
export type CompatibilityEcosystem = typeof COMPATIBILITY_ECOSYSTEMS[number];
export const compatibilityLabel = (kind: CompatibilityEcosystem) => ({ mihon: 'Mihon', cloudstream: 'CloudStream', sora: 'Sora', mangayomi: 'Mangayomi', aniyomi: 'Aniyomi' })[kind];
export interface CompatibilitySource {
  nsfw?: boolean;
  id: string; upstreamId: string; packageId: string; repository: string; ecosystem: CompatibilityEcosystem;
  name: string; extensionName: string; lang: string; kind: 'watch' | 'read'; enabled: boolean; hasSettings?: boolean;
}
export interface CompatibilityStatus {
  platform: string;
  runtimes: { ecosystem: CompatibilityEcosystem; available: boolean; ready: boolean; message: string; downloadBytes?: number; updates?: boolean; authentication?: boolean; preparing?: boolean;
    preparation?: { stage: string; receivedBytes?: number; totalBytes?: number; message?: string; updatedAt?: number } }[];
}
export interface CompatibilityPackage { id: string; name: string; version: string; installed: boolean; hasUpdate: boolean; repository: string; ecosystem: CompatibilityEcosystem; kind?: 'watch' | 'read'; error?: string; icon?: string; pkgName?: string; lang?: string; sources?: { id?: string; name?: string; lang?: string }[] }
export interface CompatibilityRepository { url: string; name: string; ecosystem: CompatibilityEcosystem }
type Reply = { ok: boolean; result?: unknown; error?: string };
const android = registerPlugin<{ request(payload: { payload: string }): Promise<Reply> }>('TatakaiCompatibility');
export function hasCompatibilityRuntime(kind: CompatibilityEcosystem): boolean {
  if (typeof window === 'undefined') return false;
  return kind === 'sora' || kind === 'mangayomi' ? localScriptRuntimeState().available
    : !!(window as any).electron?.compatibilityRequest || (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('TatakaiCompatibility'));
}

export function hasCompatibilityBridge(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as any).electron?.compatibilityRequest || Capacitor.isNativePlatform();
}
export async function compatibilityRequest<T>(payload: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  throwCompatibilityAbort(signal);
  if (!hasCompatibilityBridge()) throw Error('Compatibility extensions require a supported installed app');
  if (payload.ecosystem === 'mangayomi' || String(payload.sourceId || '').startsWith('compat-mangayomi-')) {
    if (!hasCompatibilityRuntime('mangayomi')) throw Error('Mangayomi requires an installed app with local workers and WebAssembly');
    return (await import('../mangayomi/broker')).requestMangayomi(payload, signal) as Promise<T>;
  }
  if (payload.ecosystem === 'sora' || String(payload.sourceId || '').startsWith('compat-sora-')) return (await import('../sora/broker')).requestSora(payload, signal) as Promise<T>;
  if (payload.op === 'status' || (payload.op === 'sources' && !payload.ecosystem)) {
    const { requestSora } = await import('../sora/broker');
    if (payload.op === 'status') {
      const original = await nativeCompatibilityRequest<CompatibilityStatus>(payload, signal).catch(() => ({ platform: Capacitor.getPlatform(), runtimes: (['cloudstream', 'mihon', 'aniyomi'] as const).map(ecosystem => ({ ecosystem, available: false, ready: false, message: 'This build has no local Android bytecode host for this platform yet.' })) }));
      throwCompatibilityAbort(signal);
      const portable = localScriptRuntimeState();
      return { ...original, runtimes: [...original.runtimes, { ...portable, ecosystem: 'sora', updates: true },
        { ...portable, ecosystem: 'mangayomi', updates: true, message: portable.message + ' Dart, novels and advanced host APIs are pending.' }] } as T;
    }
    const results = await Promise.allSettled([nativeCompatibilityRequest<CompatibilitySource[]>(payload, signal), requestSora(payload, signal),
      hasCompatibilityRuntime('mangayomi') ? (await import('../mangayomi/broker')).requestMangayomi(payload, signal) : Promise.resolve([])]);
    throwCompatibilityAbort(signal);
    return results.flatMap(result => result.status === 'fulfilled' ? result.value as CompatibilitySource[] : []) as T;
  }
  return nativeCompatibilityRequest<T>(payload, signal);
}
async function nativeCompatibilityRequest<T>(payload: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  throwCompatibilityAbort(signal);
  if (!(window as any).electron?.compatibilityRequest && !(Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('TatakaiCompatibility'))) throw Error('This build does not include a local Android bytecode host');
  const requestId = randomUUID();
  const desktop = (window as any).electron?.compatibilityRequest as ((payload: unknown) => Promise<Reply>) | undefined;
  const send = (body: Record<string, unknown>) => desktop ? desktop(body) : android.request({ payload: JSON.stringify(body) });
  let abort: (() => void) | undefined;
  const canceled = new Promise<never>((_, reject) => {
    abort = () => { void send({ op: 'cancel', target: requestId, requestId: randomUUID() }).catch(() => {}); reject(signal?.reason || new DOMException('Aborted', 'AbortError')); };
    signal?.addEventListener('abort', abort, { once: true });
  });
  try {
    const reply = await Promise.race([send({ ...payload, requestId }), canceled]);
    throwCompatibilityAbort(signal);
    if (!reply.ok) throw Error(reply.error || 'Compatibility request failed');
    return reply.result as T;
  } finally { if (abort) signal?.removeEventListener('abort', abort); }
}
export async function compatibilityMutation<T>(payload: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const result = await compatibilityRequest<T>(payload, signal);
  notifyCompatibilityChange();
  return result;
}
export function notifyCompatibilityChange() {
  window.dispatchEvent(new CustomEvent(EXTENSION_INSTALLED_EVENT));
  window.dispatchEvent(new CustomEvent('tatakai-extensions-changed'));
}
export async function compatibilitySources(signal?: AbortSignal, kind?: 'watch' | 'read'): Promise<CompatibilitySource[]> {
  if (!hasCompatibilityBridge()) return [];
  if (kind) {
    const ecosystems: CompatibilityEcosystem[] = kind === 'watch' ? ['cloudstream', 'sora', 'mangayomi', 'aniyomi'] : ['mihon', 'sora', 'mangayomi', 'aniyomi'];
    const results = await Promise.allSettled(ecosystems.map(async ecosystem => (await compatibilityRequest<CompatibilitySource[]>({ op: 'sources', ecosystem }, signal)).filter(source => source.ecosystem === ecosystem)));
    throwCompatibilityAbort(signal);
    return results.flatMap(result => result.status === 'fulfilled' ? result.value.filter(source => source.kind === kind) : []);
  }
  return compatibilityRequest<CompatibilitySource[]>({ op: 'sources' }, signal);
}
export const compatibilityNamespace = (source: CompatibilitySource) => `compat-${source.ecosystem}`;
export const isCompatibilityNamespace = (namespace: string) => COMPATIBILITY_ECOSYSTEMS.some(kind => namespace === `compat-${kind}`);
