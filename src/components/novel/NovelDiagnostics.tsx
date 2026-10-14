/**
 * NovelDiagnostics — "why are there no chapters?" as a checklist, not a
 * console hunt. Probes each layer of the novel pipeline and says exactly
 * which one is broken and what to do about it:
 *
 *   1. Extension host reachable? (GET /api/v3/health on 8099–8102)
 *   2. `toko` namespace mounted, with novel routes + capability?
 *   3. Installed Toko bundle version + capabilities (needs ≥ 4.3.0)?
 *   4. Bundle's own provider list — which novel providers are available?
 *
 * Shown collapsed under the empty-chapters state on NovelPage.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, CheckCircle2, XCircle, AlertTriangle, Copy, ChevronDown, RefreshCw } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { cn } from '@/lib/utils';
import { useDeveloperMode } from '@/hooks/ui/useDeveloperMode';

type CheckStatus = 'ok' | 'warn' | 'fail' | 'unknown';

interface CheckRow {
  label: string;
  status: CheckStatus;
  detail: string;
}

interface DiagnosticsResult {
  rows: CheckRow[];
  fix: string[];
  raw: Record<string, unknown>;
}

const PROBE_PORTS = [8099, 8100, 8101, 8102];
async function fetchJson(url: string, timeoutMs = 2500): Promise<{ status: number; body: unknown }> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: 'application/json' },
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON body */
    }
    return { status: res.status, body };
  } catch {
    return { status: 0, body: null };
  }
}

function unwrapInvoke(out: unknown): unknown {
  // Desktop explicit branches return the payload directly ({chapters},
  // provider arrays…); the generic fallthrough wraps it in {success, result}.
  if (out && typeof out === 'object' && 'result' in (out as Record<string, unknown>)) {
    return (out as Record<string, unknown>).result;
  }
  return out;
}

async function runNovelDiagnostics(anilistId?: number | null, title?: string): Promise<DiagnosticsResult> {
  const rows: CheckRow[] = [];
  const fix: string[] = [];
  const raw: Record<string, unknown> = {};
  const mobile = typeof window !== 'undefined' ? (window as any).tatakaiMobileExtensions : null;
  if (mobile) {
    const namespaces = mobile.listNamespaces();
    const toko = namespaces.find((ns: any) => ns.namespace === 'toko');
    rows.push({ label: 'Extension host', status: 'ok', detail: 'Running on this device through the native mobile runtime.' });
    rows.push({ label: 'Toko namespace', status: toko ? 'ok' : 'fail', detail: toko ? 'Mounted with the novel capability.' : 'Toko is not installed. Install it from Extensions.' });
    if (toko) {
      try {
        const result = await mobile.novelDiagnostics('toko', { anilistId, title });
        raw.providerStatus = result.diagnostics;
        const count = Array.isArray(result.results) ? result.results.length : 0;
        rows.push({ label: 'Chapter matching', status: count ? 'ok' : 'warn', detail: `${count} chapters after automatic title search.` });
        for (const provider of result.diagnostics || []) rows.push({ label: `Provider: ${provider.provider}`, status: provider.status === 'ok' ? 'ok' : provider.status === 'error' ? 'fail' : 'warn', detail: provider.error || `${provider.resultCount || 0} chapters (${provider.status}).` });
        fix.push(count ? 'Refresh the chapter list to load these results.' : 'Check the provider results above for access failures or titles that did not match.');
      } catch (error) {
        rows.push({ label: 'Chapter matching', status: 'fail', detail: (error as Error).message });
        fix.push('Update Toko in Extensions and retry.');
      }
    } else fix.push('Install Toko from Extensions.');
    return { rows, fix, raw };
  }

  // ── 1. Host reachability ──────────────────────────────────────────
  const probes = await Promise.all(
    PROBE_PORTS.map(async (port) => {
      const { status, body } = await fetchJson(`http://127.0.0.1:${port}/api/v3/health`);
      return { port, status, body };
    }),
  );
  raw.probes = probes.map((p) => ({
    port: p.port,
    status: p.status,
    service: (p.body as { service?: string } | null)?.service ?? null,
  }));
  const live = probes.find((p) => p.status === 200 && (p.body as { ok?: boolean } | null)?.ok);
  if (!live) {
    rows.push({
      label: 'Extension host',
      status: 'fail',
      detail: 'Nothing answers on ports 8099–8102. The desktop app (or its extension host) is not running.',
    });
    fix.push('Start (or restart) the Tatakai desktop app — it serves the extension host on port 8099.');
  } else {
    rows.push({
      label: 'Extension host',
      status: 'ok',
      detail: `Live on port ${live.port} (${(live.body as { service?: string })?.service ?? 'unknown service'}).`,
    });
  }

  // ── 2. toko namespace + novel routes ──────────────────────────────
  const namespaces = Array.isArray((live?.body as { namespaces?: unknown })?.namespaces)
    ? ((live?.body as { namespaces?: Array<{ namespace?: string; routes?: string[]; capabilities?: string[] }> }).namespaces ?? [])
    : [];
  raw.namespaces = namespaces.map((n) => ({
    namespace: n.namespace,
    routes: n.routes,
    capabilities: n.capabilities,
  }));
  const toko = namespaces.find((n) => n.namespace === 'toko');
  if (!live) {
    rows.push({ label: 'Toko namespace', status: 'unknown', detail: 'Skipped — host is down.' });
  } else if (!toko) {
    rows.push({
      label: 'Toko namespace',
      status: 'fail',
      detail: `Host is up but exposes: ${namespaces.map((n) => n.namespace).join(', ') || '(none)'}. Toko is not installed or failed to load.`,
    });
    fix.push('Open Extensions → install (or re-install) the official Toko extension.');
  } else {
    const routes = toko.routes || [];
    const caps = toko.capabilities || [];
    const hasNovelRoutes = routes.includes('novel/chapters') && routes.includes('novel/content');
    const hasNovelCap = caps.includes('novel');
    raw.toko = { routes, capabilities: caps };
    if (hasNovelRoutes && hasNovelCap) {
      rows.push({
        label: 'Toko namespace',
        status: 'ok',
        detail: `Mounted with novel routes (${routes.length} routes) and the "novel" capability.`,
      });
    } else {
      rows.push({
        label: 'Toko namespace',
        status: 'fail',
        detail: `Mounted but stale: routes [${routes.join(', ') || 'none'}], capabilities [${caps.join(', ') || 'none'}]. Novel routes are missing — this host predates novel support.`,
      });
      fix.push('Restart the desktop app so the new extension host (with novel/chapters + novel/content) loads.');
    }
  }

  // ── 2b. Route handlers live? (manifest can be new while the host ──
  // process is old — health lists routes from the manifest, but only a real
  // request proves the handler code exists).
  const livePort = live?.port;
  if (typeof anilistId === 'number' && Number.isFinite(anilistId) && livePort && toko) {
    const probe = await fetchJson(
      `http://127.0.0.1:${livePort}/api/v3/toko/novel/chapters?anilistId=${anilistId}&title=${encodeURIComponent(title || '')}&fullScan=1&refresh=1`,
      60000,
    );
    raw.routeProbe = { status: probe.status, body: probe.body };
    if (probe.status === 404) {
      rows.push({
        label: 'Route handlers',
        status: 'fail',
        detail:
          String((probe.body as { error?: string })?.error || '').includes('untrusted')
            ? 'The host advertises Toko but rejects its namespace. Update the desktop app to the host fix; title mapping has not run yet.'
            : 'The host returned 404. Its route handler may be missing; update and restart the app, then check again.',
      });
      fix.push('Fully quit and restart the desktop app (or the standalone Toko API server), then re-run diagnostics.');
    } else if (probe.status === 200) {
      const body = probe.body as { count?: number; chapterCount?: number; chapters?: Array<{ provider?: string }>; providers?: string[]; providerStatus?: unknown[] };
      const count = body.count ?? body.chapterCount ?? body.chapters?.length ?? 0;
      const providers = body.providers ?? [...new Set(body.chapters?.map(c => c.provider).filter(Boolean) || [])];
      raw.providerStatus = body.providerStatus;
      if (count > 0) {
        rows.push({
          label: 'Route handlers',
          status: 'ok',
          detail: `Live — this title resolves ${count} chapter rows via: ${providers.join(', ') || 'unknown'}.`,
        });
      } else {
        rows.push({
          label: 'Route handlers',
          status: 'warn',
          detail:
            'Live, but this title maps to zero chapters right now. The providers answered with nothing mappable — try another translator or title.',
        });
      }
    } else {
      rows.push({
        label: 'Route handlers',
        status: 'warn',
        detail: `Probe returned HTTP ${probe.status} — the host may still be starting. Re-run in a few seconds.`,
      });
    }
  }

  // ── 3. Installed bundle version ───────────────────────────────────
  const w = (typeof window !== 'undefined' ? window : {}) as {
    electron?: {
      listInstalledExtensions?: () => Promise<Array<{ id: string; version?: string; capabilities?: string[] }>>;
      invokeExtension?: (extensionId: string, method: string, args: unknown) => Promise<unknown>;
    };
  };
  let installed: Array<{ id: string; version?: string; capabilities?: string[] }> = [];
  try {
    if (w.electron?.listInstalledExtensions) {
      installed = (await w.electron.listInstalledExtensions()) || [];
    }
  } catch { /* best-effort */ }
  raw.installed = installed.map((row) => ({
    id: row.id,
    version: row.version,
    capabilities: row.capabilities,
  }));
  const tokoRow = installed.find(
    (row) =>
      row.id === 'tatakai.extension.toko' ||
      String(row.id || '').toLowerCase().includes('toko'),
  );
  if (!w.electron?.listInstalledExtensions) {
    rows.push({
      label: 'Installed Toko bundle',
      status: 'unknown',
      detail: 'Not on desktop (web/mobile) — bundle checks only apply to the desktop app.',
    });
  } else if (!tokoRow) {
    rows.push({
      label: 'Installed Toko bundle',
      status: 'fail',
      detail: 'Toko is not in the installed-extension list.',
    });
    fix.push('Install Toko from the Extensions hub (or sideload toko.kai from the repo).');
  } else {
    const version = String(tokoRow.version || 'unknown');
    const novelCap = (tokoRow.capabilities || []).includes('novel');
    const fresh = /^(\d+)\.(\d+)/.exec(version);
    const isFresh = fresh && (Number(fresh[1]) > 4 || (Number(fresh[1]) === 4 && Number(fresh[2]) >= 3));
    if (isFresh && novelCap) {
      rows.push({
        label: 'Installed Toko bundle',
        status: 'ok',
        detail: `v${version} with the "novel" capability.`,
      });
    } else {
      rows.push({
        label: 'Installed Toko bundle',
        status: 'fail',
        detail: `v${version}${novelCap ? '' : ' without the "novel" capability'} — novel support needs Toko ≥ 4.3.0.`,
      });
      fix.push('Update Toko to ≥ 4.3.0 in the Extensions hub (or sideload the fresh toko.kai), then restart the app.');
    }
  }

  // ── 4. Providers inside the bundle ────────────────────────────────
  if (Array.isArray(raw.providerStatus) && raw.providerStatus.length > 0) {
    for (const provider of raw.providerStatus as Array<{ provider: string; status: string; resultCount?: number; error?: string }>) {
      rows.push({ label: `Provider: ${provider.provider}`, status: provider.status === 'ok' ? 'ok' : provider.status === 'error' || provider.status === 'timeout' ? 'fail' : 'warn', detail: provider.error || `${provider.resultCount || 0} chapters after automatic title search (${provider.status}).` });
    }
  } else if (w.electron?.invokeExtension && tokoRow) {
    try {
      const out = await w.electron.invokeExtension(tokoRow.id, 'listProviders', {});
      const list = unwrapInvoke(out);
      const names: string[] = Array.isArray(list)
        ? list.map((row: { name?: string } | string) => typeof row === 'string' ? row : String(row?.name || '')).filter(Boolean)
        : [];
      raw.bundleProviders = names;
      if (names.length > 0) {
        rows.push({
          label: 'Novel providers',
          status: 'ok',
          detail: `${names.length} provider${names.length === 1 ? '' : 's'} reported by the installed bundle: ${names.join(', ')}.`,
        });
      } else if (names.length === 0) {
        rows.push({
          label: 'Novel providers',
          status: 'warn',
          detail: 'The bundle did not answer listProviders — it may still be loading. Retry in a few seconds.',
        });
      } else {
        rows.push({
          label: 'Novel providers',
          status: 'fail',
          detail: 'The bundle returned an empty provider list.',
        });
        fix.push('Restart or update Toko, then run diagnostics again.');
      }
    } catch {
      rows.push({
        label: 'Novel providers',
        status: 'warn',
        detail: 'Could not query the bundle (worker busy or still loading).',
      });
    }
  } else {
    rows.push({
      label: 'Novel providers',
      status: 'unknown',
      detail: 'The HTTP host did not return provider diagnostics. Update Toko and retry; desktop IPC is optional.',
    });
  }

  if (typeof anilistId === 'number' && Number.isFinite(anilistId)) {
    raw.anilistId = anilistId;
  }
  if (fix.length === 0 && rows.every((row) => row.status !== 'fail')) {
    fix.push(rows.some(row => row.label === 'Route handlers' && row.status === 'ok') ? 'Chapter scraping succeeded. Refresh the chapter list to load the latest results.' : 'Automatic title searches found no readable chapters. The provider results above show whether access failed or no matching title was found.');
  }
  const dedupedFix = [...new Set(fix)];
  return { rows, fix: dedupedFix, raw };
}

const STATUS_STYLE: Record<CheckStatus, { icon: typeof CheckCircle2; className: string }> = {
  ok: { icon: CheckCircle2, className: 'text-emerald-400' },
  warn: { icon: AlertTriangle, className: 'text-amber-400' },
  fail: { icon: XCircle, className: 'text-destructive' },
  unknown: { icon: Activity, className: 'text-muted-foreground' },
};

export function NovelDiagnostics({ anilistId, title }: { anilistId?: number | null; title?: string }) {
  const { enabled: isDeveloperMode } = useDeveloperMode();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const query = useQuery({
    queryKey: ['novel-diagnostics', anilistId ?? null, title || ''],
    queryFn: () => runNovelDiagnostics(anilistId, title),
    enabled: open,
    staleTime: 30_000,
    retry: false,
  });

  const copy = async () => {
    if (!query.data) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(query.data.raw, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  };

  if (!isDeveloperMode) return null;

  return (
    <GlassPanel className="p-4 border border-white/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-black">
          <Activity className="h-4 w-4 text-primary" />
          No chapters? Run diagnostics
        </span>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="mt-3">
          {query.isPending ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Probing extension host, bundle and providers…
            </p>
          ) : query.isError || !query.data ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">Diagnostics failed to run.</p>
              <button
                onClick={() => void query.refetch()}
                className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold hover:bg-white/10"
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                {query.data.rows.map((row) => {
                  const style = STATUS_STYLE[row.status];
                  const Icon = style.icon;
                  return (
                    <div key={row.label} className="flex items-start gap-2.5 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
                      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', style.className)} />
                      <div className="min-w-0">
                        <p className="text-xs font-black">{row.label}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{row.detail}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {query.data.fix.length > 0 && (
                <div className="mt-3 rounded-xl border border-primary/25 bg-primary/[0.06] p-3">
                  <p className="text-[11px] font-black uppercase tracking-wider text-primary">What to do</p>
                  <ol className="mt-1.5 space-y-1">
                    {query.data.fix.map((step, i) => (
                      <li key={i} className="text-xs leading-relaxed text-foreground/90">
                        <span className="font-black text-primary">{i + 1}. </span>{step}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              <div className="mt-3 flex gap-2">
                <button
                  onClick={copy}
                  className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold hover:bg-white/10"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? 'Copied!' : 'Copy report'}
                </button>
                <button
                  onClick={() => void query.refetch()}
                  className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold hover:bg-white/10"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Re-run
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </GlassPanel>
  );
}
