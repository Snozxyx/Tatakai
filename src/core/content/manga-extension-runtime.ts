/**
 * Desktop manga extension bridge.
 *
 * Primary transport is the in-app extension-API host over HTTP — the same host
 * that serves anime sources — so manga works for ANY sideloaded extension whose
 * manifest declares `capabilities: ["manga"]`, and 4-5 extensions can answer
 * concurrently. IPC (`invokeExtension`) remains as a fallback for when the host
 * has not come up (early launch race) or the preload bridge is absent.
 *
 * Extensions expose optional bundle methods: getMangaChapters, getMangaPages.
 */

import type {
  MangaChapterResponse,
  MangaReadResponse,
  MappedMangaChapter,
  MangaChapterSource,
} from "@/types/manga";
import {
  resolveExtensionApiBase,
  MOBILE_EXT_BASE,
  type NamespaceInfo,
} from "@/hooks/media/useExtensionSourceStream";

type ElectronRuntime = {
  electron?: {
    invokeExtension?: (extensionId: string, method: string, args: unknown) => Promise<unknown>;
    listInstalledExtensions?: () => Promise<Array<{ id: string; name?: string; capabilities?: string[] }>>;
  };
  tatakaiRuntime?: {
    invokeExtension?: (extensionId: string, method: string, args: unknown) => Promise<unknown>;
    listExtensions?: () => Promise<Array<{ id: string; name?: string }>>;
  };
};

function getRuntime(): ElectronRuntime {
  return (typeof window !== "undefined" ? window : {}) as ElectronRuntime;
}

function hasExtensionRuntime(): boolean {
  const w = getRuntime();
  return Boolean(w.electron?.invokeExtension || w.tatakaiRuntime?.invokeExtension);
}

async function listMangaExtensions(): Promise<string[]> {
  const w = getRuntime();
  try {
    if (w.electron?.listInstalledExtensions) {
      const rows = await w.electron.listInstalledExtensions();
      return (rows || [])
        .filter((row) => {
          const caps = row.capabilities || [];
          return caps.includes("manga") || caps.includes("chapters");
        })
        .map((row) => row.id)
        .filter(Boolean);
    }
  } catch {
    /* ignore */
  }
  return [];
}

async function invokeExt(extensionId: string, method: string, args: unknown): Promise<unknown> {
  const w = getRuntime();
  if (w.electron?.invokeExtension) {
    return w.electron.invokeExtension(extensionId, method, args);
  }
  if (w.tatakaiRuntime?.invokeExtension) {
    return w.tatakaiRuntime.invokeExtension(extensionId, method, args);
  }
  throw new Error("Extension runtime unavailable");
}

// ── debug ──────────────────────────────────────────────────────────────────
// Flip DEBUG_MANGA_EXT to true to re-enable the [manga-ext] trace.
const DBG = "[manga-ext]";
const DEBUG_MANGA_EXT = false;
function dbg(...args: unknown[]): void {
  if (!DEBUG_MANGA_EXT) return;
  // eslint-disable-next-line no-console
  console.log(DBG, ...args);
}
function dbgWarn(...args: unknown[]): void {
  if (!DEBUG_MANGA_EXT) return;
  // eslint-disable-next-line no-console
  console.warn(DBG, ...args);
}

// ── HTTP transport (extension-API host) ───────────────────────────────────────

/**
 * sub-provider name (mangadex/allmanga/…) → owning namespace (toko/…).
 *
 * Chapter sources carry the SUB-PROVIDER name in `provider`, not the extension
 * namespace, and that value round-trips through the reader URL back into the
 * pages request. This map, populated as chapters are fetched, lets a pages
 * request route to the one namespace that owns the chapter without a name being
 * hardcoded anywhere. Falls back to the chapterKey prefix, then to trying every
 * manga namespace (a non-owning extension simply 404s).
 */
const subProviderToNamespace = new Map<string, string>();

/** Namespaces whose manifest advertises manga (capability or route). */
function mangaNamespaces(namespaces: NamespaceInfo[]): NamespaceInfo[] {
  return namespaces.filter((ns) => {
    const caps = ns.capabilities || [];
    const routes = ns.routes || [];
    return (
      caps.includes("manga") ||
      caps.includes("chapters") ||
      routes.includes("manga/chapters")
    );
  });
}

interface HttpMangaEnv {
  baseUrl: string;
  namespaces: NamespaceInfo[];
}

/** Resolve the host base + manga-capable namespaces, or null when unavailable. */
async function resolveMangaHttpEnv(): Promise<HttpMangaEnv | null> {
  try {
    // Mobile registers its downloaded extension bundles asynchronously during
    // bootstrap. MangaPage requests chapters as soon as metadata arrives, which
    // can beat that registration by a fraction of a second. Unlike the anime
    // stream hook this path used to give up permanently, leaving a false empty
    // chapter list until the user re-opened the page.
    let base = await resolveExtensionApiBase();
    const isMobileHost = typeof window !== "undefined" && !!(window as any).tatakaiMobileExtensions;
    for (let attempt = 0; isMobileHost && mangaNamespaces(base.namespaces || []).length === 0 && attempt < 10; attempt += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 400));
      base = await resolveExtensionApiBase(true);
    }
    dbg("resolveMangaHttpEnv: base=", base?.baseUrl, "namespaces=", (base?.namespaces || []).map((n) => ({ ns: n.namespace, caps: n.capabilities, routes: n.routes })));
    if (!base.baseUrl) {
      dbgWarn("resolveMangaHttpEnv: no baseUrl — host not up");
      return null;
    }
    const namespaces = mangaNamespaces(base.namespaces || []);
    dbg("resolveMangaHttpEnv: manga-capable namespaces=", namespaces.map((n) => n.namespace));
    if (namespaces.length === 0) {
      dbgWarn("resolveMangaHttpEnv: no manga-capable namespaces among", (base.namespaces || []).map((n) => n.namespace));
      return null;
    }
    return { baseUrl: base.baseUrl, namespaces };
  } catch (err) {
    dbgWarn("resolveMangaHttpEnv: threw", err);
    return null;
  }
}

async function httpGetJson(url: string, timeoutMs = 20_000): Promise<{ status: number; body: any | null }> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      // A 404 here is expected while probing sources — the chapter simply isn't
      // served by this namespace/provider. Report the status so callers can treat
      // "not found" as "try the next scanlator" rather than a transport failure.
      dbgWarn("httpGetJson: HTTP", res.status, url);
      return { status: res.status, body: null };
    }
    return { status: res.status, body: await res.json() };
  } catch (err) {
    // status 0 = never reached the host (timeout / network); distinct from a 404.
    dbgWarn("httpGetJson: fetch failed", url, err);
    return { status: 0, body: null };
  }
}

interface MangaChapterSourceRow {
  provider: string;
  chapterKey: string;
  providerChapterId: string;
  language?: string | null;
  scanlator?: string | null;
  releaseDate?: string | null;
}

interface MangaChapterAggregate {
  number: number;
  title?: string | null;
  volume?: number | null;
  sources: MangaChapterSourceRow[];
}

// ── per-provider console trace (always on — mirrors the anime source path) ──
// The anime path logs one line per provider plus a sortable table so an empty
// or timed-out provider stands out. Manga now does the same: the HTTP host
// returns `providerStatus` (one ProviderDiagnostic per sub-provider —
// mangadex, mangapill, mangakatana, weebcentral, nelomanga, comick), and we
// pair each with the number of chapters it actually contributed to the merge.
const MDBG = "[toko/manga]";

interface MangaProviderDiag {
  provider: string;
  status: "ok" | "empty" | "error" | "timeout" | string;
  durationMs?: number;
  resultCount?: number;
  attempts?: number;
  error?: string;
}

function logMangaProviderStatus(d: MangaProviderDiag, chapters: number): void {
  const ms = Number.isFinite(d.durationMs) ? `${d.durationMs}ms` : "?ms";
  const attempts = (d.attempts ?? 0) > 1 ? ` attempts=${d.attempts}` : "";
  const err = d.error ? ` error=${d.error}` : "";
  const line = `${MDBG} provider=${d.provider} chapters=${chapters} reported=${d.resultCount ?? 0} status=${d.status} ${ms}${attempts}${err}`;
  if (d.status === "error" || d.status === "timeout") console.warn(line);
  else console.info(line);
}

function logMangaSummary(
  diagnostics: MangaProviderDiag[],
  perProvider: Map<string, number>,
  totalChapters: number,
): void {
  // Per-provider line first (ok/empty at info, error/timeout at warn).
  for (const d of diagnostics) logMangaProviderStatus(d, perProvider.get(d.provider) ?? 0);

  const byStatus = diagnostics.reduce<Record<string, number>>((acc, d) => {
    acc[d.status] = (acc[d.status] || 0) + 1;
    return acc;
  }, {});
  const summary = Object.entries(byStatus)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  console.info(
    `${MDBG} done — ${totalChapters} chapters merged from ${diagnostics.length} providers (${summary})`
  );

  const rows = diagnostics
    .map((d) => ({
      provider: d.provider,
      // `chapters` is what survived the merge; `reported` is the provider's raw
      // count. A gap means another provider already supplied those numbers.
      chapters: perProvider.get(d.provider) ?? 0,
      reported: d.resultCount ?? 0,
      status: d.status,
      ms: d.durationMs ?? 0,
      error: d.error || "",
    }))
    .sort((a, b) => b.chapters - a.chapters || a.provider.localeCompare(b.provider));
  // A provider that contributed chapters but somehow lacked a diagnostic still
  // shows up so the table matches what the reader lists.
  for (const [provider, chapters] of perProvider) {
    if (!diagnostics.some((d) => d.provider === provider)) {
      rows.push({ provider, chapters, reported: chapters, status: "ok", ms: 0, error: "" });
    }
  }
  console.table?.(rows);
}

export interface MangaChaptersPayload {
  chapters: MangaChapterAggregate[];
  providersAvailable: string[];
  failedProviders: string[];
}

/** Flat chapter row as returned by both the HTTP host and the IPC handler. */
interface FlatChapterRow {
  number?: number;
  title?: string;
  volume?: number;
  provider?: string;
  chapterKey?: string;
  providerChapterId?: string;
  language?: string;
  scanlator?: string;
  releaseDate?: string;
  /** Mobile bundle results may already be aggregated by chapter. */
  sources?: Array<{
    provider?: string;
    chapterKey?: string;
    providerChapterId?: string;
    language?: string | null;
    scanlator?: string | null;
    releaseDate?: string | null;
  }>;
}

/** Merge flat rows from one source (namespace or extension) into the accumulator. */
function mergeFlatRows(
  byNumber: Map<number, MangaChapterAggregate>,
  rows: FlatChapterRow[],
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
    // `getMangaChapters` from the shared bundle already merges providers into
    // `{ number, sources }`. Preserve those source records instead of reducing
    // the whole chapter to a synthetic `toko:<number>` source.
    if (Array.isArray(row.sources) && row.sources.length > 0) {
      for (const source of row.sources) {
        const sourceProvider = source.provider || fallbackProvider;
        if (namespace && sourceProvider) subProviderToNamespace.set(sourceProvider, namespace);
        existing.sources.push({
          provider: sourceProvider,
          chapterKey: source.chapterKey || String(number),
          providerChapterId: source.providerChapterId || source.chapterKey || String(number),
          language: source.language ?? null,
          scanlator: source.scanlator ?? null,
          releaseDate: source.releaseDate ?? null,
        });
      }
      byNumber.set(number, existing);
      continue;
    }
    existing.sources.push({
      provider,
      chapterKey: row.chapterKey || String(number),
      providerChapterId: row.providerChapterId || row.chapterKey || String(number),
      language: row.language ?? null,
      scanlator: row.scanlator ?? null,
      releaseDate: row.releaseDate ?? null,
    });
    byNumber.set(number, existing);
  }
}

export async function fetchExtensionMangaChapters(params: {
  anilistId?: number;
  malId?: number;
  title?: string;
}): Promise<MangaChaptersPayload> {
  dbg("fetchExtensionMangaChapters: params=", params);
  // Prefer the HTTP host: it serves every manga-capable namespace, so multiple
  // extensions answer in one pass and pages can route back by namespace.
  const env = await resolveMangaHttpEnv();
  if (env) {
    const http = await fetchChaptersViaHttp(env, params);
    dbg("fetchExtensionMangaChapters: HTTP result chapters=", http.chapters.length, "available=", http.providersAvailable, "failed=", http.failedProviders);
    if (http.chapters.length > 0 || http.providersAvailable.length > 0) return http;
    // Host is up but returned nothing (e.g. an extension that only streams).
    // Fall through to IPC in case a non-HTTP extension can still answer.
    dbgWarn("fetchExtensionMangaChapters: HTTP host up but no chapters — falling through to IPC");
  }

  if (!hasExtensionRuntime()) {
    dbgWarn("fetchExtensionMangaChapters: no extension runtime (not desktop) — returning empty");
    return { chapters: [], providersAvailable: [], failedProviders: [] };
  }
  const ipc = await fetchChaptersViaIpc(params);
  dbg("fetchExtensionMangaChapters: IPC result chapters=", ipc.chapters.length, "available=", ipc.providersAvailable, "failed=", ipc.failedProviders);
  return ipc;
}

/** HTTP path: fan out `manga/chapters` across every manga-capable namespace. */
async function fetchChaptersViaHttp(
  env: HttpMangaEnv,
  params: { anilistId?: number; malId?: number; title?: string },
): Promise<MangaChaptersPayload> {
  const byNumber = new Map<number, MangaChapterAggregate>();
  const providersAvailable: string[] = [];
  const failedProviders: string[] = [];

  const targets = env.namespaces.slice(0, 8);
  const isMobile = env.baseUrl === MOBILE_EXT_BASE;
  const mobileHost = isMobile ? (window as any).tatakaiMobileExtensions : null;
  const results = await Promise.all(
    targets.map(async (ns) => {
      let body: any = null;
      if (isMobile && mobileHost) {
        // In-WebView runtime: call the dispatch directly instead of HTTP.
        try {
          body = await mobileHost.mangaChapters(ns.namespace, {
            anilistId: params.anilistId,
            malId: params.malId,
            title: params.title,
          });
        } catch {
          body = null;
        }
      } else {
        const u = new URL(`${env.baseUrl}/api/v3/${ns.namespace}/manga/chapters`);
        if (params.anilistId) u.searchParams.set("anilistId", String(params.anilistId));
        if (params.malId) u.searchParams.set("malId", String(params.malId));
        if (params.title) u.searchParams.set("title", params.title);
        dbg("fetchChaptersViaHttp: GET", u.toString());
        ({ body } = await httpGetJson(u.toString()));
      }
      // The desktop HTTP host wraps rows as `{ chapters }`, while the mobile
      // in-WebView dispatch returns the bundle's array directly. Accept both
      // contracts; previously the valid mobile array was treated as a failure
      // and MangaPage rendered an empty chapter list.
      const rows = Array.isArray(body)
        ? (body as FlatChapterRow[])
        : Array.isArray(body?.chapters)
          ? (body.chapters as FlatChapterRow[])
          : null;
      const diag = Array.isArray(body?.providerStatus) ? (body.providerStatus as MangaProviderDiag[]) : [];
      dbg("fetchChaptersViaHttp:", ns.namespace, "→ rows=", rows == null ? "null(failed)" : rows.length);
      return { ns, rows, diag };
    }),
  );

  const diagnostics: MangaProviderDiag[] = [];
  for (const { ns, rows, diag } of results) {
    for (const d of diag) if (d && d.provider) diagnostics.push(d);
    if (rows == null) {
      failedProviders.push(ns.namespace);
      continue;
    }
    if (rows.length === 0) continue;
    providersAvailable.push(ns.namespace);
    mergeFlatRows(byNumber, rows, ns.namespace, ns.namespace);
  }

  // Count how many merged chapters each sub-provider actually backs, then print
  // the anime-style per-provider trace + table to the console.
  const perProvider = new Map<string, number>();
  for (const ch of byNumber.values()) {
    for (const s of ch.sources) perProvider.set(s.provider, (perProvider.get(s.provider) ?? 0) + 1);
  }
  logMangaSummary(diagnostics, perProvider, byNumber.size);

  return {
    chapters: Array.from(byNumber.values()).sort((a, b) => a.number - b.number),
    providersAvailable,
    failedProviders,
  };
}

/** IPC fallback path — one `getMangaChapters` invoke per installed extension. */
async function fetchChaptersViaIpc(params: {
  anilistId?: number;
  malId?: number;
  title?: string;
}): Promise<MangaChaptersPayload> {
  const extensionIds = await listMangaExtensions();
  const byNumber = new Map<number, MangaChapterAggregate>();
  const providersAvailable: string[] = [];
  const failedProviders: string[] = [];

  for (const extensionId of extensionIds.slice(0, 8)) {
    try {
      const result = (await invokeExt(extensionId, "getMangaChapters", params)) as {
        chapters?: FlatChapterRow[];
      } | null;

      const rows = Array.isArray(result?.chapters) ? result!.chapters! : [];
      if (rows.length === 0) continue;
      providersAvailable.push(extensionId);
      mergeFlatRows(byNumber, rows, extensionId);
    } catch {
      failedProviders.push(extensionId);
    }
  }

  return {
    chapters: Array.from(byNumber.values()).sort((a, b) => a.number - b.number),
    providersAvailable,
    failedProviders,
  };
}

/** A single chapter source to attempt pages for (sub-provider + its chapterKey). */
export interface MangaPageAttempt {
  provider: string;
  chapterKey: string;
  providerChapterId?: string;
}

/**
 * Read a chapter's pages, falling back across the chapter's other sources.
 *
 * A chapter often has several sources (mangadex/allmanga/…). Any one can be
 * empty — a provider goes down, gets rate-limited, or (as with AllManga's
 * captcha-gated pages endpoint) is blocked upstream while still listing
 * chapters. So we try the requested source first, then the supplied
 * `alternatives` in order, and return the first that yields pages. The reader
 * feeds `alternatives` reliability-first (see MangaPage), so a dead AllManga
 * source transparently falls through to MangaDex.
 */
export async function fetchExtensionMangaPages(params: {
  extensionId: string;
  chapterKey: string;
  providerChapterId?: string;
  anilistId?: number;
  alternatives?: MangaPageAttempt[];
}): Promise<MangaReadResponse> {
  const attempts: MangaPageAttempt[] = [
    { provider: params.extensionId, chapterKey: params.chapterKey, providerChapterId: params.providerChapterId },
    ...(params.alternatives || []),
  ];

  const seen = new Set<string>();
  const attempted: string[] = [];
  let lastFailure: MangaReadResponse | null = null;

  for (const attempt of attempts) {
    if (!attempt.provider || !attempt.chapterKey) continue;
    const key = `${attempt.provider}::${attempt.chapterKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    attempted.push(attempt.provider);

    const res = await fetchOneSourcePages({
      extensionId: attempt.provider,
      chapterKey: attempt.chapterKey,
      providerChapterId: attempt.providerChapterId,
      anilistId: params.anilistId,
    });
    if (res.success && (res.data?.pages?.length ?? 0) > 0) {
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
    message: "No pages available for this chapter.",
    guidance: {
      code: "NO_PAGES_FOR_CHAPTER",
      message: "None of this chapter's sources returned pages.",
      retryable: true,
      attemptedProviders: attempted,
    },
  };
}

/** Fetch pages for exactly one source (HTTP host first, IPC fallback). */
async function fetchOneSourcePages(params: {
  extensionId: string;
  chapterKey: string;
  providerChapterId?: string;
  anilistId?: number;
}): Promise<MangaReadResponse> {
  // `extensionId` here is really the source's sub-provider name (mangadex/
  // allmanga/…) threaded from the reader URL — see subProviderToNamespace.
  const env = await resolveMangaHttpEnv();
  if (env) {
    const { response, reached } = await fetchPagesViaHttp(env, params);
    if (response) return response;
    // The host answered every candidate namespace but none had pages for this
    // source (e.g. a 404 for a chapter the provider no longer serves). IPC
    // targets extension *ids*, not sub-providers, so it can't serve this source —
    // return a soft "no pages" so the caller falls back to another scanlator
    // instead of stalling on a guaranteed-failing IPC roundtrip. Only fall
    // through to IPC when the host was never reached (offline / IPC-only mode).
    if (reached) {
      return {
        success: false,
        message: "This source returned no pages for the chapter.",
        guidance: {
          code: "NO_PAGES_FOR_CHAPTER",
          message: "This source has no pages for this chapter; trying another scanlator.",
          retryable: true,
          attemptedProviders: [params.extensionId],
        },
      };
    }
    // Host unreachable — fall through to IPC.
  }

  if (!hasExtensionRuntime()) {
    return {
      success: false,
      message: "Manga chapter reading requires the Tatakai desktop app.",
      guidance: {
        code: "EXTENSION_RUNTIME_REQUIRED",
        message: "Open this chapter in the Tatakai desktop app with a manga extension installed.",
        retryable: false,
      },
    };
  }
  return fetchPagesViaIpc(params);
}

/**
 * Order the namespaces to try for a chapter's pages: the mapped owner first
 * (by sub-provider name, then by chapterKey prefix, then by exact namespace
 * match), and every other manga namespace after as a safety net. A namespace
 * that does not own the chapter returns 404/empty, so trying more is harmless.
 */
function resolvePageNamespaces(env: HttpMangaEnv, subProvider: string, chapterKey: string): NamespaceInfo[] {
  const prefix = chapterKey.includes(":") ? chapterKey.split(":")[0] : "";
  const preferredNs =
    subProviderToNamespace.get(subProvider) ||
    (prefix ? subProviderToNamespace.get(prefix) : undefined);

  const ordered: NamespaceInfo[] = [];
  const seen = new Set<string>();
  const push = (ns?: NamespaceInfo) => {
    if (ns && !seen.has(ns.namespace)) {
      seen.add(ns.namespace);
      ordered.push(ns);
    }
  };

  if (preferredNs) push(env.namespaces.find((n) => n.namespace === preferredNs));
  // The caller may already be handing us a namespace name directly.
  push(env.namespaces.find((n) => n.namespace === subProvider));
  for (const ns of env.namespaces) push(ns);
  return ordered;
}

/** HTTP path: fetch pages from the owning namespace (with try-all fallback). */
async function fetchPagesViaHttp(
  env: HttpMangaEnv,
  params: { extensionId: string; chapterKey: string; providerChapterId?: string; anilistId?: number },
): Promise<{ response: MangaReadResponse | null; reached: boolean }> {
  const candidates = resolvePageNamespaces(env, params.extensionId, params.chapterKey);

  // `reached` becomes true once any candidate answers with a real HTTP status
  // (incl. 404) — i.e. the host is up and this source is authoritatively empty,
  // vs. a transport failure (status 0) that warrants the IPC fallback.
  const isMobile = env.baseUrl === MOBILE_EXT_BASE;
  const mobileHost = isMobile ? (window as any).tatakaiMobileExtensions : null;

  let reached = false;
  for (const ns of candidates) {
    let status = 0;
    let body: any = null;
    if (isMobile && mobileHost) {
      try {
        body = await mobileHost.mangaPages(ns.namespace, {
          chapterKey: params.chapterKey,
          provider: params.extensionId,
          providerChapterId: params.providerChapterId,
          anilistId: params.anilistId,
        });
        status = body ? 200 : 404;
      } catch {
        status = 0;
        body = null;
      }
    } else {
      const u = new URL(`${env.baseUrl}/api/v3/${ns.namespace}/manga/pages`);
      u.searchParams.set("chapterKey", params.chapterKey);
      if (params.extensionId) u.searchParams.set("provider", params.extensionId);
      if (params.providerChapterId) u.searchParams.set("providerChapterId", params.providerChapterId);
      if (params.anilistId) u.searchParams.set("anilistId", String(params.anilistId));
      ({ status, body } = await httpGetJson(u.toString()));
    }
    if (status > 0) reached = true;
    // Same shape difference as chapters: mobile dispatch returns the page
    // array directly while the desktop API wraps it in `{ pages }`.
    const rawPages = Array.isArray(body) ? body : Array.isArray(body?.pages) ? body.pages : [];
    if (rawPages.length === 0) continue;

    // Remember the winner so the next chapter routes in one request.
    subProviderToNamespace.set(params.extensionId, ns.namespace);
    return { response: buildReadResponse(params, ns.namespace, rawPages, body), reached };
  }

  return { response: null, reached };
}

/** IPC fallback path — `getMangaPages` invoke. */
async function fetchPagesViaIpc(params: {
  extensionId: string;
  chapterKey: string;
  providerChapterId?: string;
  anilistId?: number;
}): Promise<MangaReadResponse> {
  try {
    const result = (await invokeExt(params.extensionId, "getMangaPages", {
      chapterKey: params.chapterKey,
      provider: params.extensionId,
      providerChapterId: params.providerChapterId,
      anilistId: params.anilistId,
    })) as {
      pages?: Array<{ pageNumber?: number; imageUrl?: string; proxiedImageUrl?: string | null; width?: number; height?: number }>;
      title?: string;
      number?: number;
      language?: string;
    };

    const rawPages = Array.isArray(result?.pages) ? result.pages : [];
    if (rawPages.length === 0) {
      return {
        success: false,
        message: "No pages returned from extension.",
        guidance: {
          code: "NO_PAGES_FOR_CHAPTER",
          message: "Extension returned no pages for this chapter.",
          retryable: true,
          attemptedProviders: [params.extensionId],
        },
      };
    }
    return buildReadResponse(params, params.extensionId, rawPages, result);
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Extension read failed",
      guidance: {
        code: "EXTENSION_RUNTIME_REQUIRED",
        message: "Failed to load chapter pages from extension.",
        retryable: true,
        attemptedProviders: [params.extensionId],
      },
    };
  }
}

/** Shape a successful pages response (shared by HTTP and IPC paths). */
function buildReadResponse(
  params: { extensionId: string; chapterKey: string; providerChapterId?: string; anilistId?: number },
  provider: string,
  rawPages: Array<{ pageNumber?: number; imageUrl?: string; proxiedImageUrl?: string | null; width?: number; height?: number; headers?: unknown }>,
  meta: { title?: string; number?: number; language?: string } | null,
): MangaReadResponse {
  const pages = rawPages
    .map((page, idx) => {
      const headerEntries = page.headers && typeof page.headers === "object"
        ? Object.entries(page.headers as Record<string, unknown>)
          .filter(([, v]) => v != null)
          .map(([k, v]): [string, string] => [k, String(v)])
        : [];
      return {
        pageNumber: page.pageNumber ?? idx + 1,
        imageUrl: String(page.imageUrl || ""),
        proxiedImageUrl: page.proxiedImageUrl ?? null,
        width: page.width ?? null,
        height: page.height ?? null,
        // Kept for the mobile in-app proxy's dead-token re-registration (the
        // desktop loopback token needs no such fallback). Dropped when empty
        // so desktop payloads stay byte-identical.
        ...(headerEntries.length ? { headers: Object.fromEntries(headerEntries) } : {}),
      };
    })
    .filter((page) => page.imageUrl);

  // The extension pages endpoint returns pages only — `meta.number`/`meta.title`
  // are usually null. When the number is missing, recover it from
  // `providerChapterId` ONLY when the whole id is a clean chapter number (most
  // scrapers set it to `String(chapterNumber)`). Providers with opaque ids
  // (e.g. atsu's `9x6iM|V1wAie`) fall through to null — the reader threads the
  // real number via the URL — so we never coin a bogus number from a hash.
  const derivedNumber =
    meta?.number ??
    (() => {
      const raw = (params.providerChapterId || "").trim();
      return /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : null;
    })();

  return {
    success: true,
    data: {
      pages,
      chapter: {
        chapterKey: params.chapterKey,
        anilistId: params.anilistId ?? 0,
        provider,
        providerChapterId: params.providerChapterId || params.chapterKey,
        number: derivedNumber,
        title: meta?.title ?? null,
        language: meta?.language ?? null,
      },
      readMeta: {
        provider,
        fetchedAt: new Date().toISOString(),
        expiresAt: null,
        retryAfter: null,
        fallbackUsed: false,
      },
    },
  };
}

/** Convert an extension source row to the response `MangaChapterSource` shape. */
function extSource(s: MangaChapterSourceRow): MangaChapterSource {
  return {
    provider: s.provider,
    chapterKey: s.chapterKey,
    providerChapterId: s.providerChapterId,
    language: s.language ?? null,
    scanlator: s.scanlator ?? null,
    releaseDate: s.releaseDate ?? null,
  };
}

export function mergeChaptersWithExtensions(
  base: MangaChapterResponse,
  extensionPayload: Awaited<ReturnType<typeof fetchExtensionMangaChapters>>,
): MangaChapterResponse {
  if (!extensionPayload.chapters.length) {
    return {
      ...base,
      providersAvailable: [...(base as any).providersAvailable || [], "tatakai_media"],
      failedProviders: extensionPayload.failedProviders,
    } as MangaChapterResponse;
  }

  const byNumber = new Map<number, (typeof extensionPayload.chapters)[0]>();
  for (const chapter of extensionPayload.chapters) {
    if (chapter.number != null) byNumber.set(chapter.number, chapter);
  }

  // 1) Enrich existing base chapters with extension sources.
  const baseNumbers = new Set<number>();
  const enriched = (base.mappedChapters || []).map((mapped) => {
    const num = mapped.chapterNumber;
    if (num != null) baseNumbers.add(num);
    const ext = num != null ? byNumber.get(num) : undefined;
    if (!ext) return mapped;
    const withoutPlaceholder = mapped.sources.filter((s) => s.provider !== "tatakai_media");
    const tatakai = mapped.sources.find((s) => s.provider === "tatakai_media");
    return {
      ...mapped,
      chapterTitle: ext.title || mapped.chapterTitle,
      volume: ext.volume ?? mapped.volume,
      sources: [
        ...ext.sources.map(extSource),
        ...withoutPlaceholder.filter((s) => !ext.sources.some((e) => e.provider === s.provider)),
        ...(tatakai ? [tatakai] : []),
      ],
    };
  });

  // 2) Append extension chapters with no base counterpart. The base mapping is
  //    empty whenever the mappings schema is unreachable (the common case), so
  //    without this every extension chapter would be dropped — the "No chapters
  //    available yet" bug.
  const extraFromExt: MappedMangaChapter[] = [];
  for (const ext of extensionPayload.chapters) {
    if (ext.number == null || baseNumbers.has(ext.number)) continue;
    extraFromExt.push({
      chapterNumber: ext.number,
      chapterTitle: ext.title ?? `Chapter ${ext.number}`,
      volume: ext.volume ?? null,
      canonicalOrder: 0,
      sources: ext.sources.map(extSource),
    });
  }

  // 3) Combine, sort ascending by chapter number, reassign canonicalOrder.
  const mappedChapters = [...enriched, ...extraFromExt]
    .sort((a, b) => (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0))
    .map((ch, idx) => ({ ...ch, canonicalOrder: idx }));

  return {
    ...base,
    mappedChapters,
    partial: extensionPayload.failedProviders.length > 0,
    failedProviders: extensionPayload.failedProviders,
    providersAvailable: [...extensionPayload.providersAvailable, "tatakai_media"],
  } as MangaChapterResponse;
}
