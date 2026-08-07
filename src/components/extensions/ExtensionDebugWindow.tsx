/**
 * ExtensionDebugWindow
 *
 * A developer-mode panel that tests every Toko provider in real-time and
 * displays per-provider source counts, stream URLs, and error details.
 *
 * Opened from Settings → Developer Mode → "Test Toko Extension".
 *
 * Usage:
 *   <ExtensionDebugWindow
 *     anilistId={21}
 *     titles={['One Piece']}
 *     episode={1}
 *     onClose={() => setDebugOpen(false)}
 *   />
 */

import React, { useState, useCallback, useRef } from 'react';
import { X, Play, RefreshCw, CheckCircle2, XCircle, Loader2, ChevronDown, ChevronRight, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProviderBreakdownRow {
  provider: string;
  count: number;
  status: 'ok' | 'empty' | 'error' | 'skipped';
  latencyMs?: number;
  error?: string;
}

interface ProviderDiagnostic {
  provider: string;
  status: 'ok' | 'empty' | 'error' | 'timeout';
  durationMs: number;
  resultCount: number;
  error?: string;
}

interface ProviderResult {
  provider: string;
  category: 'stream' | 'torrent' | 'manga';
  status: 'pending' | 'running' | 'ok' | 'error' | 'empty';
  sourceCount: number;
  latencyMs?: number;
  sources: Array<{ url: string; quality: string; sourceType?: string; audioLanguage?: string; providerKey?: string }>;
  breakdown: ProviderBreakdownRow[];
  error?: string;
}

interface TestConfig {
  anilistId: number;
  titles: string[];
  episode: number;
  mangaTitle?: string;
}

interface ExtensionDebugWindowProps {
  anilistId?: number;
  titles?: string[];
  episode?: number;
  mangaTitle?: string;
  onClose: () => void;
}

interface BundleStatus {
  loaded: boolean;
  bundlePath: string | null;
  error?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function proxyIndicator(url: string): string {
  if (/^http:\/\/localhost/i.test(url) || /^tatakai-media:\/\//i.test(url)) return '🔀';
  return '🌐';
}

function truncateUrl(url: string, max = 80): string {
  return url.length > max ? url.slice(0, max) + '…' : url;
}

function buildBreakdown(rawSources: any[], diagnostics: ProviderDiagnostic[] = []): ProviderBreakdownRow[] {
  const byProvider = new Map<string, ProviderBreakdownRow>();
  for (const src of rawSources) {
    const key = src.source || src.providerKey || src.provider || 'unknown';
    const current = byProvider.get(key);
    byProvider.set(key, {
      provider: key,
      count: (current?.count ?? 0) + 1,
      status: 'ok',
      latencyMs: current?.latencyMs,
    });
  }
  for (const diagnostic of diagnostics) {
    const current = byProvider.get(diagnostic.provider);
    byProvider.set(diagnostic.provider, {
      provider: diagnostic.provider,
      count: Math.max(current?.count ?? 0, diagnostic.resultCount),
      status: diagnostic.status === 'ok' ? 'ok' : diagnostic.status === 'empty' ? 'empty' : 'error',
      latencyMs: diagnostic.durationMs,
      error: diagnostic.error,
    });
  }
  return Array.from(byProvider.values()).sort((a, b) => a.provider.localeCompare(b.provider));
}

async function fetchBundleStatus(): Promise<BundleStatus> {
  try {
    const rows: any[] = await (window as any).electron?.listInstalledExtensions?.() ?? [];
    console.log('[DebugWindow] listInstalledExtensions result:', rows);
    const toko = rows.find((r: any) => r.id === 'tatakai.extension.toko');
    console.log('[DebugWindow] toko entry:', toko);
    return {
      loaded: Boolean(toko),
      bundlePath: toko?.bundlePath ?? (toko ? '<userData>/extensions/tatakai.extension.toko/bundle.js' : null),
    };
  } catch (err: any) {
    console.error('[DebugWindow] fetchBundleStatus error:', err);
    return { loaded: false, bundlePath: null, error: err?.message ?? String(err) };
  }
}

// ── Test runner (calls Toko via IPC) ─────────────────────────────────────────

async function runTokoTest(method: 'debugSingle' | 'debugBatch' | 'debugMangaChapters', config: TestConfig): Promise<any> {
  const electron = (window as any).electron;
  const runtime = (window as any).tatakaiRuntime;

  const payload = method === 'debugMangaChapters'
    ? { anilistId: config.anilistId, title: config.mangaTitle || config.titles[0] }
    : { anilistId: config.anilistId, titles: config.titles, episode: config.episode, resolution: '1080p' };

  console.log(`[DebugWindow] runTokoTest method=${method} payload=`, payload);
  console.log('[DebugWindow] electron available:', !!electron, 'invokeExtension:', !!electron?.invokeExtension);
  console.log('[DebugWindow] tatakaiRuntime available:', !!runtime);

  if (electron?.invokeExtension) {
    const res = await electron.invokeExtension('tatakai.extension.toko', method, [payload]);
    console.log(`[DebugWindow] invokeExtension result for ${method}:`, res);
    return res;
  }
  if (runtime?.invoke) {
    const res = await runtime.invoke('extension:invoke', {
      extensionId: 'tatakai.extension.toko',
      method,
      args: [payload],
    });
    console.log(`[DebugWindow] runtime.invoke result for ${method}:`, res);
    return res;
  }
  throw new Error('No extension runtime available');
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ExtensionDebugWindow({ anilistId = 21, titles = ['One Piece'], episode = 1, mangaTitle, onClose }: ExtensionDebugWindowProps) {
  const [results, setResults] = useState<ProviderResult[]>([]);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandedBreakdown, setExpandedBreakdown] = useState<Set<string>>(new Set());
  const [apiResults, setApiResults] = useState<Array<{ name: string; ok: boolean; latencyMs: number; data?: any; error?: string }>>([]);
  const [bundleStatus, setBundleStatus] = useState<BundleStatus | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const abortRef = useRef(false);
  const [config, setConfig] = useState<TestConfig>({ anilistId, titles, episode, mangaTitle });

  const toggle = (key: string) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const toggleBreakdown = (key: string) => setExpandedBreakdown(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const copyReport = useCallback(() => {
    const report = {
      timestamp: new Date().toISOString(),
      config: { anilistId: config.anilistId, episode: config.episode, titles: config.titles },
      ipcResults: results.map(r => ({
        method: r.provider,
        totalSources: r.sourceCount,
        elapsedMs: r.latencyMs ?? null,
        providers: r.breakdown ?? [],
      })),
      apiResults,
      extensionStatus: bundleStatus,
    };
    navigator.clipboard.writeText(JSON.stringify(report, null, 2))
      .then(() => {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      })
      .catch(() => {});
  }, [results, apiResults, bundleStatus, config]);

  const testTokoProviders = useCallback(async () => {
    setRunning(true);
    abortRef.current = false;
    setResults([]);
    setApiResults([]);
    setBundleStatus(null);

    // Fetch bundle status before running IPC tests (Req 2.8.5)
    const status = await fetchBundleStatus();
    setBundleStatus(status);

    // Test Toko IPC methods
    const methods: Array<{ label: string; method: 'debugSingle' | 'debugBatch' | 'debugMangaChapters'; category: 'stream' | 'torrent' | 'manga' }> = [
      { label: 'Stream (single)', method: 'debugSingle', category: 'stream' },
      { label: 'Torrent+Stream (batch)', method: 'debugBatch', category: 'torrent' },
      { label: 'Manga chapters', method: 'debugMangaChapters', category: 'manga' },
    ];

    for (const { label, method, category } of methods) {
      if (abortRef.current) break;

      // Add pending entry
      setResults(prev => [...prev, { provider: label, category, status: 'running', sourceCount: 0, sources: [], breakdown: [] }]);

      const t0 = Date.now(); // Req 2.8.7 — timing
      try {
        const res = await Promise.race([
          runTokoTest(method, config),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 20_000)),
        ]) as any;

        const elapsedMs = Date.now() - t0;
        const responseBody = res?.result ?? res?.data ?? res;
        console.log(`[DebugWindow] ${label} responseBody:`, responseBody);
        const rawSources = Array.isArray(responseBody)
          ? responseBody
          : (Array.isArray(responseBody?.results)
            ? responseBody.results
            : (Array.isArray(responseBody?.chapters) ? responseBody.chapters : []));
        const diagnostics: ProviderDiagnostic[] = Array.isArray(responseBody?.diagnostics)
          ? responseBody.diagnostics
          : [];
        console.log(`[DebugWindow] ${label} rawSources:`, rawSources, 'diagnostics:', diagnostics);
        const sourceCount = rawSources.length;
        const breakdown = buildBreakdown(rawSources, diagnostics);
        const failedProviders = diagnostics.filter(d => d.status === 'error' || d.status === 'timeout');

        setResults(prev => prev.map(r => r.provider === label ? {
          ...r,
          status: sourceCount > 0 ? 'ok' : failedProviders.length > 0 ? 'error' : 'empty',
          sourceCount,
          latencyMs: elapsedMs,
          breakdown,
          error: failedProviders.length > 0
            ? failedProviders.map(d => `${d.provider}: ${d.error ?? d.status}`).join('\n')
            : undefined,
          sources: rawSources.slice(0, 10).map((s: any) => ({
            url: s.url || `Chapter ${s.number}` || '',
            quality: s.quality || (s.sources?.length ? `${s.sources.length} sources` : ''),
            sourceType: s.sourceType || s.chapterKey,
            audioLanguage: s.audioLanguage,
            providerKey: s.source || s.providerKey || s.provider,
          })),
        } : r));
      } catch (err: any) {
        const elapsedMs = Date.now() - t0;
        setResults(prev => prev.map(r => r.provider === label ? {
          ...r, status: 'error', sourceCount: 0, latencyMs: elapsedMs, error: err?.message ?? String(err), sources: [], breakdown: [],
        } : r));
      }
    }

    // Test API endpoints
    const endpoints = [
      { name: '/toko/preview', url: `/api/v3/toko/preview?anilistId=${config.anilistId}&episode=${config.episode}&${config.titles.map(t => `titles[]=${encodeURIComponent(t)}`).join('&')}` },
      { name: '/toko/index/episodes', url: `/api/v3/toko/index/episodes?anilistId=${config.anilistId}&${config.titles.map(t => `titles[]=${encodeURIComponent(t)}`).join('&')}` },
      { name: '/toko/index/chapters', url: `/api/v3/toko/index/chapters?anilistId=${config.anilistId}&title=${encodeURIComponent(config.titles[0])}` },
    ];

    const newApiResults = [];
    for (const ep of endpoints) {
      if (abortRef.current) break;
      const start = Date.now();
      try {
        const res = await fetch(ep.url, { signal: AbortSignal.timeout(10_000) });
        const data = await res.json().catch(() => null);
        newApiResults.push({ name: ep.name, ok: res.ok, latencyMs: Date.now() - start, data });
      } catch (err: any) {
        newApiResults.push({ name: ep.name, ok: false, latencyMs: Date.now() - start, error: err?.message });
      }
    }
    setApiResults(newApiResults);
    setRunning(false);
  }, [config]);

  const totalSources = results.reduce((a, r) => a + r.sourceCount, 0);
  const hasErrors = results.some(r => r.status === 'error');

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-4xl max-h-[90vh] bg-zinc-900 border border-white/10 rounded-2xl flex flex-col overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/20 flex-shrink-0">
          <div>
            <h2 className="text-lg font-black text-foreground flex items-center gap-2">
              <span className="text-violet-400">🔧</span> Toko Extension Debug
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">Developer Mode — tests each provider in real-time</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Config bar */}
        <div className="px-6 py-3 border-b border-white/5 bg-black/10 flex gap-4 items-center text-xs flex-shrink-0 flex-wrap">
          <label className="flex items-center gap-2">
            <span className="text-muted-foreground">AniList ID:</span>
            <input
              type="number"
              value={config.anilistId}
              onChange={e => setConfig(c => ({ ...c, anilistId: parseInt(e.target.value) || 21 }))}
              className="w-20 bg-white/5 border border-white/10 rounded px-2 py-1 text-foreground"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="text-muted-foreground">Episode:</span>
            <input
              type="number"
              value={config.episode}
              onChange={e => setConfig(c => ({ ...c, episode: parseInt(e.target.value) || 1 }))}
              className="w-16 bg-white/5 border border-white/10 rounded px-2 py-1 text-foreground"
            />
          </label>
          <label className="flex items-center gap-2 flex-1">
            <span className="text-muted-foreground">Title:</span>
            <input
              value={config.titles[0] ?? ''}
              onChange={e => setConfig(c => ({ ...c, titles: [e.target.value] }))}
              className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-foreground"
            />
          </label>
          <button
            onClick={running ? () => { abortRef.current = true; setRunning(false); } : testTokoProviders}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all',
              running ? 'bg-destructive/20 text-destructive border border-destructive/20' : 'bg-violet-500/20 text-violet-400 border border-violet-500/30 hover:bg-violet-500/30'
            )}
          >
            {running ? <><RefreshCw className="w-4 h-4 animate-spin" /> Stop</> : <><Play className="w-4 h-4" /> Run Tests</>}
          </button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">

          {/* Bundle Status Panel (Req 2.8.5) */}
          {bundleStatus && (
            <section>
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Bundle Status</h3>
              <div className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 flex items-start gap-3 flex-wrap">
                {bundleStatus.loaded
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  : <XCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />}
                <span className={cn('text-xs font-bold', bundleStatus.loaded ? 'text-emerald-400' : 'text-destructive')}>
                  {bundleStatus.loaded
                    ? '✅ loaded'
                    : bundleStatus.error
                      ? `❌ error: ${bundleStatus.error}`
                      : '❌ not loaded'}
                </span>
                {bundleStatus.bundlePath && (
                  <span className="text-xs font-mono text-muted-foreground break-all">
                    {bundleStatus.bundlePath}
                  </span>
                )}
              </div>
            </section>
          )}

          {/* IPC method results */}
          {results.length > 0 && (
            <section>
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Extension IPC Results</h3>
              <div className="space-y-2">
                {results.map(r => (
                  <div key={r.provider} className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
                    {/* Result row header */}
                    <button
                      onClick={() => toggle(r.provider)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left"
                    >
                      {r.status === 'running' ? <Loader2 className="w-4 h-4 animate-spin text-primary flex-shrink-0" />
                        : r.status === 'ok' ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                          : r.status === 'empty' ? <CheckCircle2 className="w-4 h-4 text-amber-400 flex-shrink-0" />
                            : r.status === 'error' ? <XCircle className="w-4 h-4 text-destructive flex-shrink-0" />
                              : <div className="w-4 h-4 rounded-full border border-white/20 flex-shrink-0" />}
                      <span className="font-bold text-sm flex-1">{r.provider}</span>
                      <span className={cn('text-xs px-2 py-0.5 rounded font-bold',
                        r.sourceCount > 0 ? 'bg-emerald-500/20 text-emerald-400' : r.status === 'error' ? 'bg-destructive/20 text-destructive' : 'bg-white/5 text-muted-foreground'
                      )}>
                        {r.status === 'running' ? 'testing…' : r.status === 'error' ? 'ERROR' : `${r.sourceCount} results`}
                      </span>
                      {/* Timing display (Req 2.8.7) */}
                      {r.latencyMs != null && (
                        <span className="text-xs text-muted-foreground ml-2">Total: {r.latencyMs}ms</span>
                      )}
                      {expanded.has(r.provider) ? <ChevronDown className="w-4 h-4 text-muted-foreground ml-1" /> : <ChevronRight className="w-4 h-4 text-muted-foreground ml-1" />}
                    </button>

                    {expanded.has(r.provider) && (
                      <div className="px-4 pb-3 border-t border-white/5">
                        {r.error && <p className="text-xs text-destructive mt-2 font-mono">{r.error}</p>}

                        {/* Per-Provider Breakdown (Req 2.8.1–2.8.2) */}
                        {r.breakdown.length > 0 && (
                          <div className="mt-2">
                            <button
                              onClick={() => toggleBreakdown(r.provider)}
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-1"
                            >
                              {expandedBreakdown.has(r.provider)
                                ? <ChevronDown className="w-3 h-3" />
                                : <ChevronRight className="w-3 h-3" />}
                              <span className="font-semibold">Provider Breakdown ({r.breakdown.length})</span>
                            </button>
                            {expandedBreakdown.has(r.provider) && (
                              <div className="rounded-lg border border-white/5 bg-black/20 overflow-hidden">
                                {r.breakdown.map((row, i) => (
                                  <div key={i} className="flex items-center gap-3 px-3 py-1.5 border-b border-white/5 last:border-b-0" title={row.error}>
                                    <span className="text-xs font-mono text-foreground flex-1">{row.provider}</span>
                                    <span className="text-xs text-muted-foreground">{row.count} src{row.count !== 1 ? 's' : ''}</span>
                                    {row.latencyMs != null && <span className="text-[10px] text-muted-foreground">{row.latencyMs}ms</span>}
                                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-bold',
                                      row.status === 'ok' ? 'bg-emerald-500/20 text-emerald-400'
                                        : row.status === 'empty' ? 'bg-amber-500/20 text-amber-400'
                                          : row.status === 'error' ? 'bg-destructive/20 text-destructive'
                                            : 'bg-white/5 text-muted-foreground'
                                    )}>
                                      {row.status}
                                    </span>
                                    {row.error && <span className="max-w-48 truncate text-[10px] text-destructive">{row.error}</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Source list with proxy indicators and URL truncation (Req 2.8.3–2.8.4) */}
                        {r.sources.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {r.sources.map((s, i) => (
                              <li key={i} className="text-xs font-mono text-muted-foreground flex gap-2 items-start">
                                <span className="text-white/30 w-5 flex-shrink-0">{i + 1}.</span>
                                {s.url && s.url.startsWith('http') && (
                                  <span className="flex-shrink-0" title={s.url}>{proxyIndicator(s.url)}</span>
                                )}
                                <span className="break-all" title={s.url}>{truncateUrl(s.url)}</span>
                                {s.quality && <span className="text-primary bg-primary/10 px-1 rounded flex-shrink-0">{s.quality}</span>}
                                {s.sourceType && <span className="text-violet-400 flex-shrink-0">{s.sourceType}</span>}
                                {s.audioLanguage && <span className="text-amber-400 flex-shrink-0">{s.audioLanguage}</span>}
                              </li>
                            ))}
                          </ul>
                        )}
                        {r.sourceCount === 0 && r.status !== 'error' && (
                          <p className="text-xs text-muted-foreground mt-2">No results returned by this method.</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* API endpoint results */}
          {apiResults.length > 0 && (
            <section className="mt-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">API Endpoint Results</h3>
              <div className="space-y-2">
                {apiResults.map(r => (
                  <div key={r.name} className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
                    <button
                      onClick={() => toggle('api:' + r.name)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left"
                    >
                      {r.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        : <XCircle className="w-4 h-4 text-destructive flex-shrink-0" />}
                      <span className="font-mono text-xs flex-1 text-muted-foreground">{r.name}</span>
                      <span className="text-xs text-muted-foreground">{r.latencyMs}ms</span>
                      {expanded.has('api:' + r.name) ? <ChevronDown className="w-4 h-4 text-muted-foreground ml-1" /> : <ChevronRight className="w-4 h-4 text-muted-foreground ml-1" />}
                    </button>
                    {expanded.has('api:' + r.name) && (
                      <div className="px-4 pb-3 border-t border-white/5">
                        {r.error && <p className="text-xs text-destructive mt-2 font-mono">{r.error}</p>}
                        {r.data && (
                          <pre className="text-xs font-mono text-muted-foreground mt-2 overflow-auto max-h-32 bg-black/20 rounded p-2">
                            {JSON.stringify(r.data, null, 2).slice(0, 1200)}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Empty state */}
          {results.length === 0 && apiResults.length === 0 && !running && !bundleStatus && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-violet-500/10 flex items-center justify-center mb-4">
                <Play className="w-8 h-8 text-violet-400" />
              </div>
              <h3 className="font-bold text-lg mb-1">Ready to test</h3>
              <p className="text-sm text-muted-foreground">Configure the fixture above and click Run Tests to probe every Toko provider.</p>
            </div>
          )}
        </div>

        {/* Footer summary */}
        {(results.length > 0 || apiResults.length > 0) && (
          <div className="px-6 py-3 border-t border-white/10 bg-black/20 flex items-center gap-6 text-xs flex-shrink-0 flex-wrap">
            <span className="font-bold">
              Total sources: <span className={totalSources > 0 ? 'text-emerald-400' : 'text-muted-foreground'}>{totalSources}</span>
            </span>
            <span>Stream: <span className="text-primary">{results.find(r => r.provider.includes('single'))?.sourceCount ?? 0}</span></span>
            <span>Torrent: <span className="text-primary">{results.find(r => r.provider.includes('batch'))?.sourceCount ?? 0}</span></span>
            <span>Manga: <span className="text-primary">{results.find(r => r.provider.includes('chapter'))?.sourceCount ?? 0}</span></span>
            {hasErrors && <span className="text-destructive font-bold">⚠ Some providers failed</span>}
            <span className="text-muted-foreground">
              API: {apiResults.filter(r => r.ok).length}/{apiResults.length} OK
            </span>
            {/* Copy Report button (Req 2.8.6) */}
            <button
              onClick={copyReport}
              className={cn(
                'ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all',
                copySuccess
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-white/5 text-muted-foreground border border-white/10 hover:bg-white/10 hover:text-foreground'
              )}
            >
              <Copy className="w-3 h-3" />
              {copySuccess ? 'Copied!' : 'Copy Report'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
