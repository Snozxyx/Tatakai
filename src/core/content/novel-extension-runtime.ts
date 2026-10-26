import { discoverReadingBatches } from './reading-discovery';
/**
 * Novel extension bridge — text twin of `manga-extension-runtime.ts`.
 *
 * Primary transport is the in-app extension-API host over HTTP (same host that
 * serves manga chapters), so novels work for the bundled Toko extension whose
 * manifest declares `capabilities: ["novel"]`. IPC remains as a fallback.
 *
 * Extensions expose optional bundle methods: getNovelChapters, getNovelContent.
 */
import type { NovelContentResponse } from '@/types/novel';
import { serverNovelChapters, serverNovelContent } from '@/core/extensions/server/client';
import {
  resolveExtensionApiBase,
  MOBILE_EXT_BASE,
  type NamespaceInfo,
} from '@/hooks/media/useExtensionSourceStream';

function novelNamespaces(namespaces: NamespaceInfo[]): NamespaceInfo[] {
  return namespaces.filter((ns) => {
    const caps = ns.capabilities || [];
    const routes = ns.routes || [];
    // Strictly novel: the generic 'chapters' capability belongs to manga
    // extensions (see manga-extension-runtime). Matching it here fanned every
    // novel request out to manga-only namespaces, which 501/empty-answered and
    // surfaced as "manga extension trying to fetch" in novel diagnostics.
    return (
      caps.includes('novel') ||
      routes.includes('novel/chapters') ||
      routes.includes('novel/content')
    );
  });
}

async function resolveNovelHttpEnv(): Promise<{ baseUrl: string; namespaces: NamespaceInfo[] } | null> {
  try {
    let base = await resolveExtensionApiBase();
    const isMobileHost = typeof window !== 'undefined' && !!(window as any).tatakaiMobileExtensions;
    for (let attempt = 0; isMobileHost && novelNamespaces(base.namespaces || []).length === 0 && attempt < 10; attempt += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 400));
      base = await resolveExtensionApiBase(true);
    }
    if (!base.baseUrl) return null;
    const namespaces = novelNamespaces(base.namespaces || []);
    if (namespaces.length === 0) return null;
    return { baseUrl: base.baseUrl, namespaces };
  } catch {
    return null;
  }
}

async function httpGetJson(url: string, timeoutMs = 60_000): Promise<{ status: number; body: any | null }> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return { status: res.status, body: null };
    return { status: res.status, body: await res.json() };
  } catch {
    return { status: 0, body: null };
  }
}

interface NovelChapterAggregate {
  number: number;
  title?: string | null;
  volume?: number | null;
  sources: Array<{
    provider: string;
    providerName?: string;
    chapterKey: string;
    providerChapterId: string;
    language?: string | null;
    translator?: string | null;
    releaseDate?: string | null;
  }>;
}

export interface NovelChaptersPayload {
  pending?: boolean;
  chapters: NovelChapterAggregate[];
  providersAvailable: string[];
  failedProviders: string[];
}

const subProviderToNamespace = new Map<string, string>();

function mergeRows(
  byNumber: Map<number, NovelChapterAggregate>,
  rows: any[],
  fallbackProvider: string,
  namespace?: string,
): void {
  for (const row of rows) {
    const number = Number(row.number);
    if (!Number.isFinite(number) || number <= 0) continue;
    const provider = row.provider || fallbackProvider;
    if (namespace && provider) subProviderToNamespace.set(provider, namespace);
    const existing = byNumber.get(number) ?? {
      number,
      title: row.title ?? `Chapter ${number}`,
      volume: row.volume ?? null,
      sources: [],
    };
    if (Array.isArray(row.sources) && row.sources.length > 0) {
      for (const s of row.sources) {
        const sp = s.provider || fallbackProvider;
        if (namespace && sp) subProviderToNamespace.set(sp, namespace);
        existing.sources.push({
          provider: sp,
          providerName: s.providerName || row.providerName,
          chapterKey: s.chapterKey || String(number),
          providerChapterId: s.providerChapterId || s.chapterKey || String(number),
          language: s.language ?? null,
          translator: s.translator ?? null,
          releaseDate: s.releaseDate ?? null,
        });
      }
      byNumber.set(number, existing);
      continue;
    }
    existing.sources.push({
      provider,
      providerName: row.providerName,
      chapterKey: row.chapterKey || String(number),
      providerChapterId: row.providerChapterId || row.chapterKey || String(number),
      language: row.language ?? null,
      translator: row.translator ?? null,
      releaseDate: row.releaseDate ?? null,
    });
    byNumber.set(number, existing);
  }
}

function getRuntime(): any {
  return (typeof window !== 'undefined' ? window : {}) as any;
}

function hasExtensionRuntime(): boolean {
  const w = getRuntime();
  return Boolean(
    w.electron?.invokeExtension ||
    w.tatakaiRuntime?.invokeExtension ||
    (typeof window !== 'undefined' && (window as any).tatakaiMobileExtensions),
  );
}

async function fetchLocalNovelChapters(params: {
  fullScan?: boolean;
  anilistId?: number;
  malId?: number;
  title?: string;
  titles?: string[];
  provider?: string;
  seriesId?: string;
}): Promise<NovelChaptersPayload> {
  const env = await resolveNovelHttpEnv();
  const byNumber = new Map<number, NovelChapterAggregate>();
  const providersAvailable: string[] = [];
  const failedProviders: string[] = [];

  if (env) {
    let httpAnswered = false;
    const isMobile = env.baseUrl === MOBILE_EXT_BASE;
    const mobileHost = isMobile ? (window as any).tatakaiMobileExtensions : null;
    const results = await Promise.all(
      env.namespaces.slice(0, 8).map(async (ns) => {
        let body: any = null;
        if (isMobile && mobileHost?.novelChapters) {
          try {
            body = await mobileHost.novelChapters(ns.namespace, {
              anilistId: params.anilistId,
              malId: params.malId,
              title: params.title,
              titles: params.titles,
              provider: params.provider,
              seriesId: params.seriesId,
              fullScan: params.fullScan,
            });
          } catch { body = null; }
        } else {
          const u = new URL(`${env.baseUrl}/api/v3/${ns.namespace}/novel/chapters`);
          if (params.anilistId) u.searchParams.set('anilistId', String(params.anilistId));
          if (params.malId) u.searchParams.set('malId', String(params.malId));
          if (params.title) u.searchParams.set('title', params.title);
          for (const title of params.titles || []) u.searchParams.append('titles[]', title);
          if (params.provider) u.searchParams.set('provider', params.provider);
          if (params.seriesId) u.searchParams.set('seriesId', params.seriesId);
          if (params.fullScan) { u.searchParams.set('fullScan','1'); u.searchParams.set('refresh','1'); }
          ({ body } = await httpGetJson(u.toString()));
        }
        const rows = Array.isArray(body) ? body : Array.isArray(body?.chapters) ? body.chapters : null;
        return { ns, rows, pending: body?.partial === true };
      }),
    );
    for (const { ns, rows } of results) {
      if (rows == null) { failedProviders.push(ns.namespace); continue; }
      httpAnswered = true;
      if (rows.length === 0) continue;
      providersAvailable.push(ns.namespace);
      mergeRows(byNumber, rows, ns.namespace, ns.namespace);
    }
    // A successful empty catalog is already an answer. Repeating the same
    // scrape over IPC doubled the wait without changing title coverage.
    if (httpAnswered || byNumber.size > 0 || providersAvailable.length > 0) {
      return {
        chapters: Array.from(byNumber.values()).sort((a, b) => a.number - b.number),
        providersAvailable,
        failedProviders,
        pending: results.some(result => result.pending),
      };
    }
  }

  if (!hasExtensionRuntime()) {
    return { chapters: [], providersAvailable: [], failedProviders: [] };
  }

  // IPC fallback — one getNovelChapters invoke per installed extension.
  const w = getRuntime();
  try {
    const rows: any[] = w.electron?.listInstalledExtensions
      ? await w.electron.listInstalledExtensions()
      : [];
    const novelExts = (rows || [])
      .filter((r: any) => (r.capabilities || []).includes('novel'))
      .map((r: any) => r.id)
      .slice(0, 8);
    // The desktop `extension:invoke` handler fans `getNovelChapters` out
    // across every novel-capable extension itself and returns flat rows, so
    // one call aggregates everything (same as the manga IPC path).
    if (novelExts.length > 0) {
      try {
        const invoke = w.electron?.invokeExtension ?? w.tatakaiRuntime?.invokeExtension;
        const result: any = await invoke(novelExts[0], 'getNovelChapters', params);
        const rows2 = Array.isArray(result?.chapters) ? result.chapters : [];
        if (rows2.length > 0) {
          providersAvailable.push('toko');
          mergeRows(byNumber, rows2, 'toko', 'toko');
        } else {
          failedProviders.push('toko');
        }
      } catch {
        failedProviders.push('toko');
      }
    }
  } catch { /* best-effort */ }

  return {
    chapters: Array.from(byNumber.values()).sort((a, b) => a.number - b.number),
    providersAvailable,
    failedProviders,
  };
}

export interface NovelContentAttempt {
  provider: string;
  chapterKey: string;
  providerChapterId?: string;
}

export async function fetchExtensionNovelChapters(params: Parameters<typeof fetchLocalNovelChapters>[0]): Promise<NovelChaptersPayload> {
  const [local, remote] = await discoverReadingBatches('novel:'+JSON.stringify(params), {
    local: () => fetchLocalNovelChapters(params).then(value => value || {chapters:[],providersAvailable:[],failedProviders:[]}),
    server: () => serverNovelChapters(params),
  });
  const byNumber = new Map<number, NovelChapterAggregate>();
  mergeRows(byNumber, local.chapters, 'local');
  mergeRows(byNumber, remote.chapters, 'server');
  return { chapters: [...byNumber.values()].sort((a, b) => a.number - b.number), pending: !!local.pending || !!remote.pending,
    providersAvailable: [...local.providersAvailable, ...remote.providersAvailable], failedProviders: [...local.failedProviders, ...remote.failedProviders] };
}

async function fetchOneSourceContent(params: {
  extensionId: string;
  chapterKey: string;
  providerChapterId?: string;
  anilistId?: number;
}): Promise<NovelContentResponse> {
  if (params.extensionId.startsWith('server-')) return serverNovelContent(params);
  const env = await resolveNovelHttpEnv();
  const fail = (message: string): NovelContentResponse => ({
    success: false,
    message,
    guidance: {
      code: 'NO_CONTENT_FOR_CHAPTER',
      message,
      retryable: true,
      attemptedProviders: [params.extensionId],
    },
  });

  if (env) {
    const prefix = params.chapterKey.includes(':') ? params.chapterKey.split(':')[0] : '';
    const preferred = subProviderToNamespace.get(params.extensionId) || (prefix ? subProviderToNamespace.get(prefix) : undefined);
    const ordered = [
      ...(preferred ? env.namespaces.filter((n) => n.namespace === preferred) : []),
      ...env.namespaces.filter((n) => n.namespace === params.extensionId),
      ...env.namespaces,
    ].filter((n, i, arr) => arr.findIndex((x) => x.namespace === n.namespace) === i);

    const isMobile = env.baseUrl === MOBILE_EXT_BASE;
    const mobileHost = isMobile ? (window as any).tatakaiMobileExtensions : null;
    for (const ns of ordered) {
      let body: any = null;
      if (isMobile && mobileHost?.novelContent) {
        try {
          body = await mobileHost.novelContent(ns.namespace, {
            chapterKey: params.chapterKey,
            provider: params.extensionId,
            providerChapterId: params.providerChapterId,
            anilistId: params.anilistId,
          });
        } catch { body = null; }
      } else {
        const u = new URL(`${env.baseUrl}/api/v3/${ns.namespace}/novel/content`);
        u.searchParams.set('chapterKey', params.chapterKey);
        if (params.extensionId) u.searchParams.set('provider', params.extensionId);
        if (params.providerChapterId) u.searchParams.set('providerChapterId', params.providerChapterId);
        if (params.anilistId) u.searchParams.set('anilistId', String(params.anilistId));
        ({ body } = await httpGetJson(u.toString()));
      }
      const paragraphs = Array.isArray(body) ? [] : Array.isArray(body?.paragraphs) ? body.paragraphs : [];
      if (paragraphs.length === 0) continue;
      subProviderToNamespace.set(params.extensionId, ns.namespace);
      const list = paragraphs
        .map((p: any, idx: number) => ({
          index: typeof p.index === 'number' ? p.index : idx,
          text: String(p.text || '').trim(),
        }))
        .filter((p: any) => p.text);
      if (list.length === 0) continue;
      return {
        success: true,
        data: {
          paragraphs: list,
          chapter: {
            chapterKey: params.chapterKey,
            anilistId: params.anilistId ?? 0,
            provider: params.extensionId,
            providerChapterId: params.providerChapterId || params.chapterKey,
            number: typeof body?.number === 'number' ? body.number : null,
            title: body?.title ?? null,
            language: body?.language ?? null,
          },
          readMeta: { provider: ns.namespace, fetchedAt: new Date().toISOString(), fallbackUsed: false },
        },
      };
    }
    return fail('This source has no text for this chapter; trying another translator.');
  }

  if (!hasExtensionRuntime()) {
    return {
      success: false,
      message: 'Connect an extension server or install a local novel extension to read this chapter.',
      guidance: {
        code: 'EXTENSION_RUNTIME_REQUIRED',
        message: 'Connect an extension server with a novel extension in Settings → Extension Hub.',
        retryable: false,
      },
    };
  }

  // IPC fallback (desktop): the `extension:invoke` handler fans
  // `getNovelContent` out across novel-capable extensions and returns
  // `{ paragraphs }` directly. Try every installed novel extension until one
  // yields text.
  try {
    const w: any = (typeof window !== 'undefined' ? window : {}) as any;
    const rows: any[] = w.electron?.listInstalledExtensions
      ? await w.electron.listInstalledExtensions().catch(() => [])
      : [];
    const novelExts = (rows || [])
      .filter((r: any) => (r.capabilities || []).includes('novel'))
      .map((r: any) => r.id)
      .slice(0, 8);
    const invoke = w.electron?.invokeExtension ?? w.tatakaiRuntime?.invokeExtension;
    if (invoke && novelExts.length > 0) {
      for (const extId of novelExts) {
        try {
          const out: any = await invoke(extId, 'getNovelContent', {
            chapterKey: params.chapterKey,
            provider: params.extensionId,
            providerChapterId: params.providerChapterId,
            anilistId: params.anilistId,
          });
          const paragraphs = Array.isArray(out?.paragraphs) ? out.paragraphs : [];
          const list = paragraphs
            .map((p: any, idx: number) => ({
              index: typeof p?.index === 'number' ? p.index : idx,
              text: String(p?.text ?? '').trim(),
            }))
            .filter((p: any) => p.text);
          if (list.length > 0) {
            return {
              success: true,
              data: {
                paragraphs: list,
                chapter: {
                  chapterKey: params.chapterKey,
                  anilistId: params.anilistId ?? 0,
                  provider: params.extensionId,
                  providerChapterId: params.providerChapterId || params.chapterKey,
                  number: typeof out?.number === 'number' ? out.number : null,
                  title: out?.title ?? null,
                  language: null,
                },
                readMeta: { provider: extId, fetchedAt: new Date().toISOString(), fallbackUsed: false },
              },
            };
          }
        } catch { /* try next extension */ }
      }
    }
  } catch { /* best-effort */ }
  return fail('Extension runtime has no novel text for this chapter yet.');
}

/**
 * Read a chapter's text, falling back across the chapter's other sources.
 * Returns the first source that yields paragraphs.
 */
export async function fetchExtensionNovelContent(params: {
  chapterKey: string;
  provider?: string;
  providerChapterId?: string;
  anilistId?: number;
  alternatives?: NovelContentAttempt[];
}): Promise<NovelContentResponse> {
  let provider = params.provider;
  let effKey = params.chapterKey;
  let providerChapterId = params.providerChapterId;
  if ((!provider || provider === '') && params.alternatives?.length) {
    const first = params.alternatives[0];
    provider = first.provider;
    effKey = first.chapterKey || params.chapterKey;
    providerChapterId = first.providerChapterId || providerChapterId;
  }
  const attempts: NovelContentAttempt[] = [
    { provider: provider || '', chapterKey: effKey, providerChapterId },
    ...(params.alternatives || []),
  ];
  const seen = new Set<string>();
  const attempted: string[] = [];
  let lastFailure: NovelContentResponse | null = null;
  for (const attempt of attempts) {
    if (!attempt.provider || !attempt.chapterKey) continue;
    const key = `${attempt.provider}::${attempt.chapterKey}::${attempt.providerChapterId || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    attempted.push(attempt.provider);
    const res = await fetchOneSourceContent({
      extensionId: attempt.provider,
      chapterKey: attempt.chapterKey,
      providerChapterId: attempt.providerChapterId,
      anilistId: params.anilistId,
    }).catch((error): NovelContentResponse => ({ success: false, message: error instanceof Error ? error.message : 'This novel source could not be reached.',
      guidance: { code: 'SOURCE_UNAVAILABLE', message: error instanceof Error ? error.message : 'This novel source could not be reached.', retryable: true } }));
    if (res.success && (res.data?.paragraphs?.length ?? 0) > 0) {
      if (attempted.length > 1 && res.data?.readMeta) res.data.readMeta.fallbackUsed = true;
      return res;
    }
    lastFailure = res;
  }
  if (lastFailure) {
    return {
      ...lastFailure,
      guidance: lastFailure.guidance
        ? { ...lastFailure.guidance, attemptedProviders: attempted }
        : lastFailure.guidance,
    };
  }
  return {
    success: false,
    message: 'No text available for this chapter.',
    guidance: {
      code: 'NO_CONTENT_FOR_CHAPTER',
      message: "None of this chapter's sources returned text.",
      retryable: true,
      attemptedProviders: attempted,
    },
  };
}
