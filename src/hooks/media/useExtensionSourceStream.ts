import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useExtensionSourceStream
 * ------------------------------------------------------------------------------
 * Generic renderer consumer for the app-owned Extension-API host
 * (`desktop/runtime/extension-api-host`). Opens an SSE connection to
 *
 *   {baseUrl}/api/v3/<namespace>/<route>?anilistId=…&episode=…&stream=1
 *
 * and accumulates `source` events **progressively** (one per resolved source),
 * tracks `provider_status` diagnostics, resolves on `done`, and surfaces errors.
 *
 * The base URL + mounted namespaces are resolved once via the preload bridge
 * `window.tatakaiRuntime.getExtensionApiBase()` (IPC `runtime:get-api-base`), so
 * the renderer never hardcodes the host port. Generic over `namespace` — any
 * extension declaring `apiServer` reuses this hook unchanged. Toko is the first
 * consumer.
 */

export type ExtensionStreamPhase =
  | "idle"
  | "connecting"
  | "streaming"
  | "done"
  | "error"
  | "unavailable";

export interface ProviderDiagnostic {
  provider: string;
  status: "ok" | "timeout" | "error" | "empty" | string;
  durationMs?: number;
  resultCount?: number;
  attempts?: number;
  error?: string;
}

export interface NamespaceInfo {
  namespace: string;
  extensionId?: string;
  contract?: string | null;
  routes?: string[];
}

export interface ExtensionSourceStreamParams {
  anilistId?: number | string | null;
  titles?: string[];
  episode?: number | null;
  resolution?: string;
  preferredLanguage?: string;
  route?: "sources" | "stream" | "torrent";
  enabled?: boolean;
}

export interface ExtensionSourceStreamResult<T = any> {
  sources: T[];
  providerStatus: ProviderDiagnostic[];
  phase: ExtensionStreamPhase;
  error: Error | null;
  baseUrl: string | null;
  baseResolved: boolean;
  namespaceMounted: boolean;
  reload: () => void;
}

// ── Base-URL resolution (memoized per app session) ─────────────────────────────
// The host base URL is stable once the host is listening. We cache only
// successful resolutions; failures are NOT cached so a later mount can recover
// if the host started slightly after the first probe (startup race).

interface ResolvedBase {
  baseUrl: string | null;
  namespaces: NamespaceInfo[];
}

let cachedBase: ResolvedBase | null = null;
let baseInFlight: Promise<ResolvedBase> | null = null;

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Ports probed when the preload bridge can't name the host.
 *
 * `host-server.cjs` prefers 8099 and walks upward on EADDRINUSE, and the
 * standalone `extension/toko/api` dev server defaults to the same 8099. When both
 * are around the loser moves up, so the base URL is only knowable by asking.
 */
const PROBE_PORTS = [8099, 8100, 8101, 8102];

/**
 * Read `/api/v3/health` and translate it into a namespace list.
 *
 * The two hosts answer differently: the in-app host reports
 * `{ ok, service: 'extension-api-host', namespaces: [...] }`, while the
 * standalone Toko API reports `{ ok, service: 'toko-api', toko: true }` with no
 * namespace array at all. Synthesize the namespace in the latter case so both
 * are usable through the same code path.
 */
async function probeHealth(baseUrl: string, timeoutMs = 1200): Promise<ResolvedBase | null> {
  try {
    const res = await fetch(`${baseUrl}/api/v3/health`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      ok?: boolean;
      toko?: boolean;
      namespaces?: NamespaceInfo[];
    };
    if (!body?.ok) return null;

    if (Array.isArray(body.namespaces) && body.namespaces.length > 0) {
      return { baseUrl, namespaces: body.namespaces };
    }
    if (body.toko) {
      return {
        baseUrl,
        namespaces: [{ namespace: "toko", routes: ["sources", "stream", "torrent"] }],
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Find a live extension-API host by probing the candidate ports concurrently and
 * keeping the lowest-numbered responder, so the result is stable across calls.
 */
async function probeExtensionApiBase(): Promise<ResolvedBase | null> {
  if (typeof fetch !== "function") return null;
  const results = await Promise.all(
    PROBE_PORTS.map((port) => probeHealth(`http://127.0.0.1:${port}`)),
  );
  return results.find((r): r is ResolvedBase => r !== null) ?? null;
}

async function resolveExtensionApiBase(force = false): Promise<ResolvedBase> {
  if (!force && cachedBase && cachedBase.baseUrl) return cachedBase;
  if (baseInFlight) return baseInFlight;

  baseInFlight = (async () => {
    const rt = (typeof window !== "undefined" ? (window as any).tatakaiRuntime : null) as
      | { getExtensionApiBase?: () => Promise<ResolvedBase> }
      | null;

    // Retry a few times to tolerate the host coming up just after app launch.
    for (let attempt = 0; attempt < 3; attempt++) {
      if (rt?.getExtensionApiBase) {
        try {
          const res = await rt.getExtensionApiBase();
          if (res && res.baseUrl) {
            cachedBase = {
              baseUrl: res.baseUrl,
              namespaces: Array.isArray(res.namespaces) ? res.namespaces : [],
            };
            return cachedBase;
          }
        } catch {
          /* transient — retry */
        }
      }

      // The bridge is absent (browser dev) or reported nothing (the in-app host
      // lost the port race and never came up). Either way a host may still be
      // listening, and asking it directly is cheap. Without this the hook
      // reports `unavailable`, WatchPage falls through to the central dispatch
      // endpoint, and the user sees no servers at all.
      const probed = await probeExtensionApiBase();
      if (probed) {
        cachedBase = probed;
        return cachedBase;
      }

      if (attempt < 2) await delay(400);
    }
    return { baseUrl: null, namespaces: [] };
  })().finally(() => {
    baseInFlight = null;
  });

  return baseInFlight;
}

function buildStreamUrl(
  baseUrl: string,
  namespace: string,
  route: string,
  p: ExtensionSourceStreamParams,
  forceRefresh = false
): string {
  const u = new URL(`${baseUrl}/api/v3/${namespace}/${route}`);
  const anilistId = Number(p.anilistId);
  if (Number.isFinite(anilistId) && anilistId > 0) u.searchParams.set("anilistId", String(anilistId));
  if (p.episode != null && Number.isFinite(Number(p.episode))) u.searchParams.set("episode", String(p.episode));
  if (p.resolution) u.searchParams.set("resolution", p.resolution);
  if (p.preferredLanguage) u.searchParams.set("preferredLanguage", p.preferredLanguage);
  for (const t of p.titles || []) {
    if (t) u.searchParams.append("titles[]", t);
  }
  // The host caches resolved sources so remounting the player replays them
  // instead of re-scraping every provider. Only an explicit "fetch more servers"
  // click should pay that cost again.
  if (forceRefresh) u.searchParams.set("refresh", "1");
  u.searchParams.set("stream", "1");
  return u.toString();
}

// ── Console diagnostics ───────────────────────────────────────────────────────
// "Which provider returned how much" has to be answerable from the renderer
// console, not just the main-process log: the two can disagree (a source can be
// dropped by the SSE dedupe below, or arrive after `done`), and only this side
// sees what the UI actually got. One line per provider as it resolves, then one
// summary table when the stream closes.

/** Normalized comparison key — provider names vary in case and separators. */
const providerKeyOf = (name: unknown) =>
  String(name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Sources accepted into state for one provider.
 *
 * Providers name each source after the server it resolved to, not after
 * themselves — `animeya` emits `animeya-vidnest-sub`, `reanime` emits
 * `reanime-HD-1` — while the diagnostic carries the bare registry name. An
 * exact-match lookup therefore read "2 reported, 0 received" for every provider
 * that does this, which looks exactly like sources being dropped on the way to
 * the UI. Match on prefix instead; no two registry names prefix each other.
 */
function countReceived(perProvider: Map<string, number>, provider: unknown): number {
  const key = providerKeyOf(provider);
  if (!key) return 0;
  let total = 0;
  for (const [owner, n] of perProvider) {
    const o = providerKeyOf(owner);
    if (o === key || o.startsWith(key)) total += n;
  }
  return total;
}

/** `provider_status` → one line, warning-level for the failures worth noticing. */
function logProviderStatus(namespace: string, route: string, d: ProviderDiagnostic, received: number) {
  const ms = Number.isFinite(d.durationMs) ? `${d.durationMs}ms` : "?ms";
  const attempts = (d.attempts ?? 0) > 1 ? ` attempts=${d.attempts}` : "";
  const err = d.error ? ` error=${d.error}` : "";
  const line = `[${namespace}/${route}] provider=${d.provider} results=${received} status=${d.status} ${ms}${attempts}${err}`;
  if (d.status === "error" || d.status === "timeout") console.warn(line);
  else console.info(line);
}

/** `done` → totals plus a sortable table, so an empty provider stands out. */
function logStreamSummary(
  namespace: string,
  route: string,
  diagnostics: ProviderDiagnostic[],
  perProvider: Map<string, number>,
  total: number
) {
  const byStatus = diagnostics.reduce<Record<string, number>>((acc, d) => {
    acc[d.status] = (acc[d.status] || 0) + 1;
    return acc;
  }, {});
  const summary = Object.entries(byStatus)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  console.info(
    `[${namespace}/${route}] done — ${total} sources from ${diagnostics.length} providers (${summary})`
  );
  if (!diagnostics.length) return;
  const rows = diagnostics
    .map((d) => ({
      provider: d.provider,
      // `received` is what the UI kept; `reported` is what the provider claimed.
      // A gap means the dedupe collapsed duplicate URLs.
      received: countReceived(perProvider, d.provider),
      reported: d.resultCount ?? 0,
      status: d.status,
      ms: d.durationMs ?? 0,
      error: d.error || "",
    }))
    .sort((a, b) => b.received - a.received || a.provider.localeCompare(b.provider));
  console.table?.(rows);
}

const INITIAL_STATE = {
  sources: [] as any[],
  providerStatus: [] as ProviderDiagnostic[],
  phase: "idle" as ExtensionStreamPhase,
  error: null as Error | null,
  baseUrl: null as string | null,
  baseResolved: false,
  namespaceMounted: false,
};

export function useExtensionSourceStream<T = any>(
  namespace: string,
  params: ExtensionSourceStreamParams
): ExtensionSourceStreamResult<T> {
  const {
    anilistId,
    titles,
    episode,
    resolution = "1080p",
    preferredLanguage,
    route = "sources",
    enabled = true,
  } = params;

  const [state, setState] = useState(INITIAL_STATE);
  const [reloadKey, setReloadKey] = useState(0);
  // `reloadKey > 0` means the user asked for this fetch, so it bypasses the
  // host's result cache. A plain mount (key 0) is allowed to be served from it.
  const reload = useCallback(() => {
    // Force a fresh base probe on manual reload so a recovered host is picked up.
    cachedBase = null;
    setReloadKey((k) => k + 1);
  }, []);

  // Stable dependency key — re-open the stream only when a meaningful param changes.
  const titlesKey = (titles || []).join("|");
  const paramsKey = JSON.stringify({
    namespace,
    anilistId: anilistId ?? null,
    titlesKey,
    episode: episode ?? null,
    resolution,
    preferredLanguage: preferredLanguage ?? null,
    route,
    enabled,
    reloadKey,
  });

  // Read latest params without retriggering the effect for object identity churn.
  const paramsRef = useRef(params);
  paramsRef.current = params;

  useEffect(() => {
    if (!enabled) {
      setState({ ...INITIAL_STATE, phase: "idle" });
      return;
    }

    let cancelled = false;
    let es: EventSource | null = null;
    let done = false;
    let received = 0;
    const seen = new Set<string>();
    const sources: any[] = [];
    const providerStatus: ProviderDiagnostic[] = [];
    // Sources actually accepted into state, keyed by lowercased provider name.
    const perProvider = new Map<string, number>();

    setState({ ...INITIAL_STATE, phase: "connecting" });

    (async () => {
      const base = await resolveExtensionApiBase();
      if (cancelled) return;

      const mounted = !!base.baseUrl && (base.namespaces || []).some((n) => n.namespace === namespace);
      if (!base.baseUrl || !mounted) {
        setState((s) => ({
          ...s,
          phase: "unavailable",
          baseUrl: base.baseUrl,
          baseResolved: true,
          namespaceMounted: mounted,
        }));
        return;
      }

      setState((s) => ({ ...s, baseUrl: base.baseUrl, baseResolved: true, namespaceMounted: true }));

      let url: string;
      try {
        url = buildStreamUrl(base.baseUrl, namespace, route, {
          anilistId,
          titles,
          episode,
          resolution,
          preferredLanguage,
        }, reloadKey > 0);
      } catch (err) {
        setState((s) => ({ ...s, phase: "error", error: err as Error }));
        return;
      }

      try {
        es = new EventSource(url);
      } catch (err) {
        setState((s) => ({ ...s, phase: "error", error: err as Error }));
        return;
      }

      es.addEventListener("open", () => {
        if (!cancelled && !done) setState((s) => ({ ...s, phase: "streaming" }));
      });

      es.addEventListener("source", (e) => {
        if (cancelled || done) return;
        try {
          const src = JSON.parse((e as MessageEvent).data);
          const key = `${src?.providerKey || ""}::${src?.url || ""}`;
          if (key !== "::" && seen.has(key)) return;
          seen.add(key);
          sources.push(src);
          received++;
          const owner = String(src?.providerName || src?.source || src?.providerKey || "unknown").toLowerCase();
          perProvider.set(owner, (perProvider.get(owner) || 0) + 1);
          setState((s) => ({ ...s, sources: [...sources], phase: "streaming" }));
        } catch {
          /* ignore malformed event */
        }
      });

      es.addEventListener("provider_status", (e) => {
        if (cancelled || done) return;
        try {
          const d = JSON.parse((e as MessageEvent).data) as ProviderDiagnostic;
          providerStatus.push(d);
          logProviderStatus(namespace, route, d, countReceived(perProvider, d.provider));
          setState((s) => ({ ...s, providerStatus: [...providerStatus] }));
        } catch {
          /* ignore malformed event */
        }
      });

      es.addEventListener("done", () => {
        if (cancelled) return;
        done = true;
        logStreamSummary(namespace, route, providerStatus, perProvider, received);
        setState((s) => ({ ...s, phase: "done" }));
        try {
          es?.close();
        } catch {
          /* noop */
        }
      });

      // Both server-sent `error` events (have `.data`) and native transport
      // errors (no `.data`) dispatch here. Disambiguate by `.data` presence.
      es.addEventListener("error", (e) => {
        if (cancelled) return;
        const data = (e as MessageEvent).data;
        if (data) {
          // Server-sent terminal error.
          let message = "stream error";
          try {
            message = JSON.parse(data)?.message || message;
          } catch {
            /* keep default */
          }
          done = true;
          setState((s) => ({
            ...s,
            phase: received > 0 ? "done" : "error",
            error: received > 0 ? s.error : new Error(message),
          }));
          try {
            es?.close();
          } catch {
            /* noop */
          }
          return;
        }
        // Native transport error. Ignore benign post-`done` close; otherwise stop
        // (EventSource would auto-reconnect and re-run the whole scrape).
        if (done) return;
        if (es && es.readyState === EventSource.CLOSED) {
          done = true;
          setState((s) => ({
            ...s,
            phase: received > 0 ? "done" : "error",
            error: received > 0 ? s.error : new Error("stream connection failed"),
          }));
        } else if (received > 0) {
          done = true;
          try {
            es?.close();
          } catch {
            /* noop */
          }
          setState((s) => ({ ...s, phase: "done" }));
        }
      });
    })();

    return () => {
      cancelled = true;
      try {
        es?.close();
      } catch {
        /* noop */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey]);

  return { ...state, reload } as ExtensionSourceStreamResult<T>;
}

// ── Per-provider API client ───────────────────────────────────────────────────
//
// The SSE stream above is one request that fans out to every provider. These two
// helpers are the other half of the contract the host exposes: one provider, one
// API call. Same normalization, same proxying, but a provider can be exercised —
// and its failure attributed — in isolation. Generic over `namespace`: any
// extension whose bundle implements `listProviders`/`runProvider` gets these.

export interface ProviderEntry {
  name: string;
  kind: "stream" | "torrent" | "manga";
}

export interface SingleProviderResult<T = any> {
  provider: string;
  kind: "stream" | "torrent";
  status: string;
  durationMs?: number;
  attempts?: number;
  error?: string;
  count: number;
  sources: T[];
  fetchedAt?: string;
}

/** Every provider the extension can run. Returns `[]` when the host is down. */
export async function listExtensionProviders(namespace: string): Promise<ProviderEntry[]> {
  const base = await resolveExtensionApiBase();
  if (!base.baseUrl) return [];
  try {
    const res = await fetch(`${base.baseUrl}/api/v3/${namespace}/providers`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.providers) ? data.providers : [];
  } catch {
    return [];
  }
}

export interface UrlProbeResult {
  /** True only for a definite < 400 answer. Unknown counts as reachable. */
  ok: boolean;
  status: number;
  error?: string;
  /** False when the host itself was unavailable, so the verdict means nothing. */
  checked: boolean;
}

/**
 * Ask the extension API host whether a URL actually answers.
 *
 * The renderer cannot do this itself for a third-party URL — CORS refuses the
 * `fetch`, and an `<iframe>` reports `onLoad` even for a 502 error document. The
 * host is a normal HTTP client with no such limits, so embed failover asks it.
 *
 * Fails *open*: if the host is unreachable or the probe throws, the result is
 * `ok: true` with `checked: false`. Guessing "dead" would tear down a player
 * that might have been about to work.
 */
export async function probeUrlReachable(url: string, referer?: string): Promise<UrlProbeResult> {
  const unchecked: UrlProbeResult = { ok: true, status: 0, checked: false };
  if (!url || !/^https?:/i.test(url)) return unchecked;

  const base = await resolveExtensionApiBase();
  if (!base.baseUrl) return unchecked;

  try {
    const u = new URL(`${base.baseUrl}/api/v3/probe`);
    u.searchParams.set("url", url);
    if (referer) u.searchParams.set("referer", referer);
    const res = await fetch(u.toString());
    if (!res.ok) return unchecked;
    const data = await res.json();
    return {
      ok: Boolean(data?.ok),
      status: Number(data?.status || 0),
      error: data?.error ? String(data.error) : undefined,
      checked: true,
    };
  } catch {
    return unchecked;
  }
}

/**
 * Runs one provider and logs `provider=… results=…` to the console. Never
 * throws — a failed provider comes back as `status: 'error'` with an empty
 * source list, because callers here are diagnostics, not playback paths.
 */
export async function fetchExtensionProvider<T = any>(
  namespace: string,
  provider: string,
  params: ExtensionSourceStreamParams
): Promise<SingleProviderResult<T>> {
  const fail = (error: string): SingleProviderResult<T> => ({
    provider,
    kind: "stream",
    status: "error",
    error,
    count: 0,
    sources: [],
  });

  const base = await resolveExtensionApiBase();
  if (!base.baseUrl) return fail("extension API host unavailable");

  let url: string;
  try {
    const built = new URL(
      buildStreamUrl(base.baseUrl, namespace, `providers/${encodeURIComponent(provider)}`, params)
    );
    built.searchParams.delete("stream"); // per-provider route is plain JSON
    url = built.toString();
  } catch (err) {
    return fail((err as Error).message);
  }

  try {
    const res = await fetch(url);
    const data = await res.json();
    const result: SingleProviderResult<T> = {
      provider: data?.provider || provider,
      kind: data?.kind === "torrent" ? "torrent" : "stream",
      status: data?.status || (res.ok ? "ok" : "error"),
      durationMs: data?.durationMs,
      attempts: data?.attempts,
      error: data?.error,
      count: Number(data?.count) || (Array.isArray(data?.sources) ? data.sources.length : 0),
      sources: Array.isArray(data?.sources) ? data.sources : [],
      fetchedAt: data?.fetchedAt,
    };
    logProviderStatus(
      namespace,
      "providers",
      {
        provider: result.provider,
        status: result.status,
        durationMs: result.durationMs,
        resultCount: result.count,
        attempts: result.attempts,
        error: result.error,
      },
      result.count
    );
    return result;
  } catch (err) {
    const result = fail((err as Error).message);
    logProviderStatus(
      namespace,
      "providers",
      { provider, status: "error", resultCount: 0, error: result.error },
      0
    );
    return result;
  }
}

/**
 * Fans out one request per provider and logs a summary table — the
 * "Provider 1 → API call, Provider 2 → API call, …" shape, for answering
 * "which providers are actually alive right now" in one console command.
 * `concurrency` is bounded so a 20-provider sweep doesn't stall the renderer.
 */
export async function probeAllExtensionProviders(
  namespace: string,
  params: ExtensionSourceStreamParams,
  opts: { kinds?: Array<"stream" | "torrent">; concurrency?: number } = {}
): Promise<SingleProviderResult[]> {
  const kinds = opts.kinds || ["stream", "torrent"];
  const concurrency = Math.max(1, Math.min(8, opts.concurrency ?? 4));

  const all = await listExtensionProviders(namespace);
  const targets = all.filter((p) => kinds.includes(p.kind as "stream" | "torrent"));
  if (!targets.length) {
    console.warn(`[${namespace}/providers] no providers to probe`);
    return [];
  }

  console.info(`[${namespace}/providers] probing ${targets.length} providers…`);
  const results: SingleProviderResult[] = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, targets.length) }, async () => {
      while (cursor < targets.length) {
        const target = targets[cursor++];
        results.push(await fetchExtensionProvider(namespace, target.name, params));
      }
    })
  );

  const alive = results.filter((r) => r.count > 0);
  console.info(
    `[${namespace}/providers] ${alive.length}/${results.length} providers returned sources`
  );
  console.table?.(
    results
      .map((r) => ({
        provider: r.provider,
        kind: r.kind,
        results: r.count,
        status: r.status,
        ms: r.durationMs ?? 0,
        error: r.error || "",
      }))
      .sort((a, b) => b.results - a.results || a.provider.localeCompare(b.provider))
  );
  return results;
}

// Reachable from devtools so a provider sweep needs no rebuild:
//   await tatakaiProviders.probe('toko', { anilistId: 20, episode: 34 })
//   await tatakaiProviders.one('toko', 'animeya', { anilistId: 20, episode: 34 })
if (typeof window !== "undefined") {
  (window as any).tatakaiProviders = {
    list: listExtensionProviders,
    one: fetchExtensionProvider,
    probe: probeAllExtensionProviders,
  };
}
