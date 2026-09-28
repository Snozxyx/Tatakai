import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, CheckCircle, XCircle, AlertTriangle, RefreshCw, Server,
  Database, Wifi, Globe, Clock, Zap, Image as ImageIcon, Play, Activity, Gauge, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useStatusIncidents } from '@/hooks/admin/useAdminFeatures';
import { formatDistanceToNow } from 'date-fns';
import { StatusPageBackground } from '@/components/layout/StatusPageBackground';
import { TATAKAI_API_URL } from '@/lib/api/api-client';
import { resolveBackendOrigin } from '@/lib/api/backendOrigin';
import { useIsDesktopApp } from '@/hooks/ui/useIsNativeApp';

type Health = 'operational' | 'degraded' | 'down' | 'checking';

interface ServiceStatus {
  name: string;
  status: Health;
  latency?: number;
  icon: React.ReactNode;
  description: string;
  url?: string;
}

interface ProxyStatusNode {
  id: string; url: string; failures: number; successes: number;
  lastLatencyMs: number; cooldownUntil: number;
  status: 'online' | 'degraded' | 'offline';
}
interface ProxyDisplayNode {
  id: string; url: string; type: string;
  status: 'online' | 'degraded' | 'offline'; latencyMs: number; score: number;
}
interface ScraperHealthNode {
  id: string; label: string; status: 'operational' | 'degraded' | 'down'; latencyMs: number;
}
interface ScraperHealthSummary { total: number; operational: number; degraded: number; down: number; }

const SERVICE_CHECK_FREQ_SECONDS = 30;
const PROXY_POLL_FREQ_SECONDS = 4;
const HISTORY_CAP = 32;
const DEFAULT_BACKEND_HEALTH_URL = 'https://api.tatakai.me/health';
const BACKEND_ORIGIN = resolveBackendOrigin();
const PROXY_STATUS_ENDPOINT = BACKEND_ORIGIN ? `${BACKEND_ORIGIN}/api/proxy/status` : '/api/proxy/status';
const BACKEND_HEALTH_ENDPOINT = BACKEND_ORIGIN ? `${BACKEND_ORIGIN}/health` : DEFAULT_BACKEND_HEALTH_URL;

type KnownProxyNode = { id: string; url: string; type: string };
const KNOWN_PROXY_NODES: KnownProxyNode[] = [
  { id: 'proxy-node-hoko', url: 'https://hoko.tatakai.me/api/v1/streamingProxy', type: 'nodejs' },
];

function classifyProxyType(url: string): string {
  const lower = (url || '').toLowerCase();
  if (lower.includes('workers.dev') || lower.includes('cloudflare') || lower.includes('kira.tatakai.me')) return 'cf';
  if (lower.includes('hoko.tatakai.me')) return 'nodejs';
  if (lower.includes('bun')) return 'bun';
  return 'nodejs';
}

function buildProxyProbeUrls(proxyUrl: string, proxyPassword: string): string[] {
  const normalized = String(proxyUrl || '').trim().replace(/\/$/, '');
  if (!normalized) return [];
  const streamEndpoint = /\/api\/v1\/streamingproxy$/i.test(normalized) ? normalized : `${normalized}/api/v1/streamingProxy`;
  const rootEndpoint = normalized.replace(/\/api\/v1\/streamingproxy$/i, '');
  const params = new URLSearchParams({ url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', type: 'video' });
  if (proxyPassword) params.set('password', proxyPassword);
  return Array.from(new Set([`${rootEndpoint}/health`, `${streamEndpoint}?${params.toString()}`]));
}

async function probeKnownProxyNode(node: KnownProxyNode, proxyPassword: string): Promise<ProxyDisplayNode> {
  for (const probeUrl of buildProxyProbeUrls(node.url, proxyPassword)) {
    const start = performance.now();
    try {
      const response = await fetch(probeUrl, { signal: AbortSignal.timeout(5000) });
      const latencyMs = Math.round(performance.now() - start);
      const onlineLike = response.ok || [401, 403, 405].includes(response.status);
      if (onlineLike) return { id: node.id, url: node.url, type: node.type, status: 'online', latencyMs, score: 1 };
      if (response.status >= 400 && response.status < 500)
        return { id: node.id, url: node.url, type: node.type, status: 'degraded', latencyMs, score: 0 };
    } catch { /* try next probe url */ }
  }
  return { id: node.id, url: node.url, type: node.type, status: 'offline', latencyMs: 0, score: 0 };
}

// Stable, long-lived CDN assets the app actually pulls posters/thumbs from. An
// <img> load isn't CORS-gated the way fetch() is, so this measures real image
// delivery instead of poking an unrelated JSON API (the old api.nekosapi.com
// probe 404'd, which is why Image Delivery always showed "down").
const IMAGE_DELIVERY_PROBES = [
  'https://cdn.myanimelist.net/img/sp/icon/apple-touch-icon-256.png',
  'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx1-CXtrrkMpJ8Zq.png',
];

function probeImageLoad(src: string, timeoutMs = 6000): Promise<number> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const start = performance.now();
    const timer = setTimeout(() => { img.onload = null; img.onerror = null; reject(new Error('timeout')); }, timeoutMs);
    img.onload = () => { clearTimeout(timer); resolve(Math.round(performance.now() - start)); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('load-failed')); };
    img.src = `${src}${src.includes('?') ? '&' : '?'}_cb=${Date.now()}`;
  });
}

const SEVERITY_COLORS: Record<string, string> = {
  minor: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/50',
  major: 'bg-orange-500/20 text-orange-500 border-orange-500/50',
  critical: 'bg-red-500/20 text-red-500 border-red-500/50',
};

function dotClass(status: Health | ProxyDisplayNode['status']): string {
  if (status === 'operational' || status === 'online') return 'bg-emerald-400';
  if (status === 'degraded') return 'bg-amber-400';
  if (status === 'checking') return 'bg-primary animate-pulse';
  return 'bg-red-500';
}

function StatusGlyph({ status, className = 'w-5 h-5' }: { status: Health; className?: string }) {
  if (status === 'operational') return <CheckCircle className={`${className} text-emerald-400`} />;
  if (status === 'degraded') return <AlertTriangle className={`${className} text-amber-400`} />;
  if (status === 'down') return <XCircle className={`${className} text-red-500`} />;
  return <RefreshCw className={`${className} text-primary animate-spin`} />;
}

/** Rolling per-service history rendered as a betterstack-style tick strip. */
function UptimeBars({ history }: { history: Health[] }) {
  const recent = history.slice(-HISTORY_CAP);
  const padded: (Health | null)[] = [
    ...Array.from({ length: Math.max(0, HISTORY_CAP - recent.length) }, () => null),
    ...recent,
  ];
  return (
    <div className="flex items-end gap-[3px] h-8" aria-hidden>
      {padded.map((h, i) => {
        const color = h === 'operational' ? 'bg-emerald-400/80'
          : h === 'degraded' ? 'bg-amber-400/80'
          : h === 'down' ? 'bg-red-500/80' : 'bg-white/10';
        const height = h === 'operational' ? 'h-full' : h === 'degraded' ? 'h-2/3'
          : h === 'down' ? 'h-1/2' : 'h-1/5';
        return <div key={i} className={`flex-1 rounded-full min-w-[2px] ${color} ${height}`} />;
      })}
    </div>
  );
}

/** Animated circular gauge for the aggregate health index. */
function HealthRing({ value, color }: { value: number; color: string }) {
  const r = 42;
  const circumference = 2 * Math.PI * r;
  return (
    <div className="relative w-28 h-28 shrink-0">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
        <motion.circle
          cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - (circumference * value) / 100 }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-black font-mono">{value.toFixed(0)}%</span>
        <span className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">health</span>
      </div>
    </div>
  );
}
export default function StatusPage() {
  const navigate = useNavigate();
  const isDesktopApp = useIsDesktopApp();
  const { data: incidents = [], isLoading: loadingIncidents } = useStatusIncidents(false);

  const [proxies, setProxies] = useState<ProxyDisplayNode[]>([]);
  const [scrapers, setScrapers] = useState<ScraperHealthNode[]>([]);
  const [scraperSummary, setScraperSummary] = useState<ScraperHealthSummary>({ total: 0, operational: 0, degraded: 0, down: 0 });
  const [services, setServices] = useState<ServiceStatus[]>([
    { name: 'Tatakai Website', status: 'checking', icon: <Globe className="w-5 h-5" />, description: 'Main web frontend', url: 'https://tatakai.me' },
    { name: 'Tatakai Backend', status: 'checking', icon: <Zap className="w-5 h-5" />, description: 'Unified Hono API', url: 'https://api.tatakai.me/health' },
    { name: 'Supabase', status: 'checking', icon: <Database className="w-5 h-5" />, description: 'Database & auth infrastructure' },
    { name: 'Jikan API', status: 'checking', icon: <Server className="w-5 h-5" />, description: 'MyAnimeList metadata provider', url: 'https://api.jikan.moe/v4' },
    { name: 'AniList API', status: 'checking', icon: <Server className="w-5 h-5" />, description: 'AniList metadata provider', url: 'https://graphql.anilist.co' },
    { name: 'Image Delivery', status: 'checking', icon: <ImageIcon className="w-5 h-5" />, description: 'Posters, banners & thumbnails', url: 'https://cdn.myanimelist.net' },
    { name: 'Streaming Edge', status: 'checking', icon: <Play className="w-5 h-5" />, description: 'Video proxy & delivery pool' },
  ]);
  const [uptimeHistory, setUptimeHistory] = useState<Record<string, Health[]>>({});
  const [lastChecked, setLastChecked] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [nextCheckIn, setNextCheckIn] = useState(SERVICE_CHECK_FREQ_SECONDS);

  const sharedProxyPassword = String(
    import.meta.env.VITE_STREAM_PROXY_PASSWORD || import.meta.env.VITE_PROXY_PASSWORD || ''
  ).trim();
  const loadScraperHealth = useCallback(async () => {
    const response = await fetch(`${TATAKAI_API_URL}/health/scrapers`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(9000),
    });
    if (!response.ok) throw new Error(`Scraper health failed: ${response.status}`);
    const json = await response.json();
    const nodes: ScraperHealthNode[] = Array.isArray(json?.scrapers)
      ? json.scrapers.map((node: any, index: number) => ({
          id: String(node?.id || `source-${index + 1}`),
          label: String(node?.label || `Source ${String(index + 1).padStart(2, '0')}`),
          status: ['operational', 'degraded', 'down'].includes(node?.status) ? node.status : 'down',
          latencyMs: Number(node?.latencyMs || 0),
        }))
      : [];
    const summary: ScraperHealthSummary = json?.summary && typeof json.summary === 'object'
      ? {
          total: Number(json.summary.total || nodes.length || 0),
          operational: Number(json.summary.operational || 0),
          degraded: Number(json.summary.degraded || 0),
          down: Number(json.summary.down || 0),
        }
      : {
          total: nodes.length,
          operational: nodes.filter((n) => n.status === 'operational').length,
          degraded: nodes.filter((n) => n.status === 'degraded').length,
          down: nodes.filter((n) => n.status === 'down').length,
        };
    setScrapers(nodes);
    setScraperSummary(summary);
    return nodes;
  }, []);
  const loadProxyStatus = useCallback(async () => {
    let mapped: ProxyDisplayNode[] = [];
    try {
      const response = await fetch(PROXY_STATUS_ENDPOINT, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(7000),
      });
      if (response.ok) {
        const json = await response.json();
        const nodes: ProxyStatusNode[] = Array.isArray(json?.nodes) ? json.nodes : [];
        mapped = nodes.map((node) => ({
          id: node.id,
          url: node.url,
          type: classifyProxyType(node.url),
          status: node.status,
          latencyMs: node.lastLatencyMs || 0,
          score: Math.max(0, node.successes - node.failures),
        }));
      }
    } catch { /* fall back to direct node probes */ }

    if (mapped.length > 0) {
      setProxies(mapped);
      return mapped;
    }
    const probed = await Promise.all(
      KNOWN_PROXY_NODES.map((n) => probeKnownProxyNode(n, sharedProxyPassword))
    );
    setProxies(probed);
    return probed;
  }, [sharedProxyPassword]);
  // All service probes fire in parallel so the board fills in one pass instead
  // of staggering through six sequential awaits (the old flow left AniList stuck
  // on "checking" forever because it was never probed at all).
  const runChecks = useCallback(async () => {
    setIsRefreshing(true);
    setNextCheckIn(SERVICE_CHECK_FREQ_SECONDS);
    setServices((prev) => prev.map((s) => ({ ...s, status: 'checking', latency: undefined })));

    const check = async (
      name: string,
      fn: () => Promise<{ status: Health; latency: number }>
    ): Promise<{ name: string; status: Health; latency: number }> => {
      try { return { name, ...(await fn()) }; }
      catch { return { name, status: 'down', latency: 0 }; }
    };
    const results = await Promise.all([
      check('Tatakai Website', async () => {
        const start = Date.now();
        const res = await fetch(window.location.origin, { method: 'HEAD' });
        const latency = Date.now() - start;
        return { status: res.ok ? (latency > 1000 ? 'degraded' : 'operational') : 'down', latency };
      }),
      check('Tatakai Backend', async () => {
        const start = Date.now();
        // Hit the resolved backend origin (api.tatakai.me, desktop-safe) — the old
        // check pointed at api.tatakai.com (dead) AND required the body to contain
        // "daijoubu", but /health returns "ok", so a healthy backend read as down.
        //
        // Do NOT send X-Tatakai-Client/Version here (i.e. no withClientHeaders):
        // those are non-safelisted headers, so the browser fires a CORS preflight,
        // and /health's preflight only allows Content-Type,Authorization,X-Admin-Secret.
        // The unlisted client headers made the browser block the GET → fetch threw →
        // backend read as "down" even though curl (not CORS-gated) got 200 "ok".
        // A bare GET with only the safelisted Accept header sends no preflight.
        const res = await fetch(BACKEND_HEALTH_ENDPOINT, {
          headers: { Accept: 'text/plain,application/json,*/*' },
          signal: AbortSignal.timeout(5000),
        });
        const latency = Date.now() - start;
        return { status: res.ok ? (latency > 1000 ? 'degraded' : 'operational') : 'down', latency };
      }),
      check('Supabase', async () => {
        const start = Date.now();
        const { error } = await supabase.from('profiles').select('count').limit(1);
        const latency = Date.now() - start;
        return { status: error ? 'down' : (latency > 500 ? 'degraded' : 'operational'), latency };
      }),
      check('Jikan API', async () => {
        const start = Date.now();
        const res = await fetch('https://api.jikan.moe/v4/anime/1', { signal: AbortSignal.timeout(10000) });
        const latency = Date.now() - start;
        return { status: res.ok ? (latency > 1500 ? 'degraded' : 'operational') : (res.status === 429 ? 'degraded' : 'down'), latency };
      }),
      check('AniList API', async () => {
        const start = Date.now();
        const res = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ query: '{Media(id:1){id}}' }),
          signal: AbortSignal.timeout(8000),
        });
        const latency = Date.now() - start;
        return { status: res.ok ? (latency > 1500 ? 'degraded' : 'operational') : (res.status === 429 ? 'degraded' : 'down'), latency };
      }),
      check('Image Delivery', async () => {
        for (const src of IMAGE_DELIVERY_PROBES) {
          try {
            const latency = await probeImageLoad(src);
            return { status: latency > 1500 ? 'degraded' : 'operational', latency };
          } catch { /* try next CDN before giving up */ }
        }
        return { status: 'down', latency: 0 };
      }),
      check('Streaming Edge', async () => {
        const start = Date.now();
        const stats = await loadProxyStatus();
        const online = stats.filter((p) => p.status === 'online').length;
        const latency = Date.now() - start;
        return {
          status: stats.length > 0
            ? (online > 0 ? (online < stats.length / 2 ? 'degraded' : 'operational') : 'down')
            : 'down',
          latency,
        };
      }),
    ]);
    setServices((prev) => prev.map((s) => {
      const r = results.find((x) => x.name === s.name);
      return r ? { ...s, status: r.status, latency: r.latency } : s;
    }));
    setUptimeHistory((prev) => {
      const next = { ...prev };
      for (const r of results) next[r.name] = [...(next[r.name] || []), r.status].slice(-HISTORY_CAP);
      return next;
    });

    await loadScraperHealth().catch(() => { /* summary stays at last-known values */ });
    setLastChecked(new Date());
    setIsRefreshing(false);
  }, [loadProxyStatus, loadScraperHealth]);

  useEffect(() => {
    runChecks();
    loadProxyStatus().catch(() => { /* backend not reachable on first paint */ });

    const proxyInterval = setInterval(() => { loadProxyStatus().catch(() => {}); }, PROXY_POLL_FREQ_SECONDS * 1000);
    const serviceInterval = setInterval(() => { runChecks(); }, SERVICE_CHECK_FREQ_SECONDS * 1000);
    const countdownInterval = setInterval(
      () => setNextCheckIn((v) => (v <= 1 ? SERVICE_CHECK_FREQ_SECONDS : v - 1)),
      1000
    );
    return () => {
      clearInterval(proxyInterval);
      clearInterval(serviceInterval);
      clearInterval(countdownInterval);
    };
  }, [runChecks, loadProxyStatus]);
  const healthIndex = useMemo(() => {
    const svc = services.filter((s) => s.status !== 'checking').map((s) => (s.status === 'operational' ? 1 : s.status === 'degraded' ? 0.6 : 0));
    const prx = proxies.map((p) => (p.status === 'online' ? 1 : p.status === 'degraded' ? 0.6 : 0));
    const scr = scrapers.map((s) => (s.status === 'operational' ? 1 : s.status === 'degraded' ? 0.6 : 0));
    const all = [...svc, ...prx, ...scr];
    if (!all.length) return 0;
    return Number(((all.reduce((a, b) => a + b, 0) / all.length) * 100).toFixed(1));
  }, [services, proxies, scrapers]);

  const uptimeSamples = useMemo(() => Object.values(uptimeHistory).flat(), [uptimeHistory]);
  const uptimePct = useMemo(() => {
    if (!uptimeSamples.length) return null;
    const up = uptimeSamples.filter((s) => s === 'operational').length;
    return Number(((up / uptimeSamples.length) * 100).toFixed(2));
  }, [uptimeSamples]);

  const mttrMinutes = useMemo(() => {
    const resolved = incidents.filter((i: any) => !i.is_active && i.created_at && i.resolved_at);
    const durations = resolved
      .map((i: any) => {
        const start = new Date(i.created_at).getTime();
        const end = new Date(i.resolved_at).getTime();
        return end > start ? (end - start) / 60000 : null;
      })
      .filter((v: number | null): v is number => v !== null);
    if (!durations.length) return null;
    return Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
  }, [incidents]);

  const activeIncidents = incidents.filter((i: any) => i.is_active).length;
  const anyDown = services.some((s) => s.status === 'down') || proxies.some((p) => p.status === 'offline') || scrapers.some((s) => s.status === 'down');
  const anyDegraded = services.some((s) => s.status === 'degraded') || proxies.some((p) => p.status === 'degraded') || scrapers.some((s) => s.status === 'degraded');
  const anyChecking = services.some((s) => s.status === 'checking') || isRefreshing || scrapers.length === 0;

  const overall: Health = anyDown ? 'down' : anyDegraded ? 'degraded' : anyChecking ? 'checking' : 'operational';
  const overallLabel = {
    down: 'Major Outage',
    degraded: 'Partial Degradation',
    checking: 'Analyzing Infrastructure',
    operational: 'All Systems Operational',
  }[overall];
  const overallGradient = overall === 'down' ? 'from-red-500/20 via-red-900/30 to-red-500/10'
    : overall === 'degraded' ? 'from-amber-500/20 via-amber-900/30 to-amber-500/10'
    : overall === 'checking' ? 'from-primary/15 via-primary/10 to-primary/5'
    : 'from-emerald-500/20 via-emerald-900/30 to-emerald-500/10';
  const ringColor = overall === 'down' ? 'rgb(239 68 68)'
    : overall === 'degraded' ? 'rgb(251 191 36)'
    : overall === 'checking' ? 'rgb(236 72 153)'
    : 'rgb(52 211 153)';

  const kpis = [
    { label: 'Health Index', value: `${healthIndex.toFixed(1)}%`, detail: `${services.filter((s) => s.status === 'operational').length}/${services.length} services up`, icon: <Gauge className="w-4 h-4" /> },
    { label: 'Observed Uptime', value: uptimePct !== null ? `${uptimePct}%` : '--', detail: `${uptimeSamples.length} samples`, icon: <Activity className="w-4 h-4" /> },
    { label: 'Proxy Pool', value: `${proxies.filter((p) => p.status === 'online').length}/${proxies.length}`, detail: `${proxies.filter((p) => p.status === 'degraded').length} degraded`, icon: <Server className="w-4 h-4" /> },
    { label: 'Incidents', value: `${activeIncidents}`, detail: mttrMinutes !== null ? `MTTR ${mttrMinutes}m` : 'no history', icon: <AlertTriangle className="w-4 h-4" /> },
  ];
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden relative">
      <StatusPageBackground overlayColor="from-background/95 via-background/80 to-background/95" />
      <Sidebar />

      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <motion.div
          className="absolute top-[15%] right-[5%] text-9xl font-bold text-primary/5 select-none"
          animate={{ y: [0, -30, 0], opacity: [0.03, 0.08, 0.03] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        >状態</motion.div>
        <motion.div
          className="absolute bottom-[20%] left-[8%] text-8xl font-bold text-accent/5 select-none"
          animate={{ y: [0, 20, 0], opacity: [0.03, 0.06, 0.03] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        >稼働</motion.div>
        <div className="absolute top-0 right-1/3 w-px h-full bg-gradient-to-b from-transparent via-primary/10 to-transparent" />
        <div className="absolute top-0 left-1/4 w-px h-full bg-gradient-to-b from-transparent via-accent/10 to-transparent" />
      </div>

      <main className={`relative z-10 ${isDesktopApp ? 'pl-6' : 'pl-6 md:pl-32'} pr-6 py-6 max-w-[1400px] mx-auto pb-24 md:pb-6`}>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <button
            onClick={() => navigate(-1)}
            className="group flex items-center gap-2 p-2 rounded-full hover:bg-white/5 transition-all"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground group-hover:text-foreground group-hover:-translate-x-1 transition-all" />
            <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground">Return</span>
          </button>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-[11px] text-muted-foreground font-mono bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
              <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
              {isRefreshing ? 'Checking…' : `Next check in ${nextCheckIn}s`}
            </div>
            <Button
              onClick={runChecks}
              disabled={isRefreshing}
              variant="outline"
              className="gap-2 bg-white/5 border-white/10 hover:bg-white/10 h-10 px-4 rounded-xl transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Running' : 'Refresh'}
            </Button>
          </div>
        </div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <GlassPanel className={`relative overflow-hidden border border-white/10 bg-gradient-to-br ${overallGradient} p-6 md:p-8 mb-6`}>
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12"
              animate={{ x: ['-120%', '120%'] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
            />
            <div className="relative z-10 flex flex-col md:flex-row items-center gap-6 md:gap-10">
              <HealthRing value={healthIndex} color={ringColor} />
              <div className="flex-1 text-center md:text-left">
                <div className="flex items-center justify-center md:justify-start gap-3 mb-2">
                  <StatusGlyph status={overall} className="w-7 h-7" />
                  <h1 className="font-display text-2xl md:text-4xl font-bold tracking-tight">{overallLabel}</h1>
                </div>
                <p className="text-muted-foreground flex items-center justify-center md:justify-start gap-2 text-sm">
                  <Activity className="w-4 h-4 text-primary" />
                  Tatakai network infrastructure • updated {formatDistanceToNow(lastChecked, { addSuffix: true })}
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center md:justify-start gap-2">
                  {(['operational', 'degraded', 'down'] as const).map((k) => (
                    <span key={k} className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-black/20 border border-white/10 capitalize">
                      <span className={`w-2 h-2 rounded-full ${dotClass(k)}`} />
                      {services.filter((s) => s.status === k).length} {k}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </GlassPanel>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-10">
          {kpis.map((k) => (
            <GlassPanel key={k.label} className="p-4 border border-white/10 bg-white/5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{k.label}</p>
                <span className="text-primary/60">{k.icon}</span>
              </div>
              <div className="text-2xl font-black font-mono tracking-tight">{k.value}</div>
              <p className="mt-1 text-[11px] text-muted-foreground truncate">{k.detail}</p>
            </GlassPanel>
          ))}
        </div>
        <div className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-2xl font-bold flex items-center gap-3">
              <span className="p-2 rounded-lg bg-primary/10 text-primary"><Server className="w-6 h-6" /></span>
              Core Services
            </h2>
            <span className="text-xs text-muted-foreground font-mono bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
              {services.filter((s) => s.status === 'operational').length}/{services.length} operational
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {services.map((service, index) => (
              <motion.div
                key={service.name}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.06 }}
              >
                <GlassPanel className="group p-5 border border-white/10 bg-white/5 hover:border-white/20 hover:-translate-y-1 transition-all duration-300 h-full">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-primary">{service.icon}</span>
                      <div>
                        <h3 className="font-semibold">{service.name}</h3>
                        <p className="text-[11px] text-muted-foreground leading-snug">{service.description}</p>
                      </div>
                    </div>
                    <StatusGlyph status={service.status} />
                  </div>
                  <div className="mb-3"><UptimeBars history={uptimeHistory[service.name] || []} /></div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${dotClass(service.status)}`} />
                      <span className="capitalize font-medium">{service.status}</span>
                    </span>
                    <span className={`font-mono ${service.latency && service.latency > 500 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {service.latency !== undefined && service.latency > 0 ? `${service.latency}ms` : '--'}
                    </span>
                  </div>
                </GlassPanel>
              </motion.div>
            ))}
          </div>
        </div>
        <div className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-2xl font-bold flex items-center gap-3">
              <span className="p-2 rounded-lg bg-primary/10 text-primary"><Globe className="w-6 h-6" /></span>
              Edge Routing
            </h2>
            <span className="text-xs text-muted-foreground font-mono bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
              {proxies.length} node{proxies.length === 1 ? '' : 's'}
            </span>
          </div>
          <GlassPanel className="p-0 overflow-hidden border border-white/10 rounded-3xl">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-6 py-4 font-bold">Node</th>
                    <th className="px-6 py-4 font-bold">Type</th>
                    <th className="px-6 py-4 font-bold">Status</th>
                    <th className="px-6 py-4 font-bold">Latency</th>
                    <th className="px-6 py-4 font-bold">Weight</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  <AnimatePresence>
                    {proxies.map((proxy) => (
                      <motion.tr key={proxy.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4 font-mono text-xs text-primary/80">{proxy.id}</td>
                        <td className="px-6 py-4"><span className="inline-flex px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white/5 border border-white/10 uppercase">{proxy.type}</span></td>
                        <td className="px-6 py-4">
                          <span className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${dotClass(proxy.status)}`} />
                            <span className={`font-bold text-xs uppercase tracking-wide ${proxy.status === 'online' ? 'text-emerald-400' : proxy.status === 'degraded' ? 'text-amber-400' : 'text-red-500'}`}>{proxy.status}</span>
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-muted-foreground">{proxy.latencyMs > 0 ? `${proxy.latencyMs}ms` : '—'}</td>
                        <td className="px-6 py-4 font-mono text-xs text-muted-foreground">{proxy.score}</td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                  {proxies.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Initializing node pool…
                        </span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </GlassPanel>
        </div>
        <div className="mb-12">
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-2xl font-bold flex items-center gap-3">
                <span className="p-2 rounded-lg bg-primary/10 text-primary"><AlertTriangle className="w-6 h-6" /></span>
                Incidents &amp; Maintenance
              </h2>
              {activeIncidents > 0 && (
                <span className="text-xs font-mono px-3 py-1.5 rounded-full border bg-red-500/10 border-red-500/30 text-red-400">
                  {activeIncidents} active
                </span>
              )}
            </div>
            {loadingIncidents ? (
              <GlassPanel className="p-12 border border-white/10 rounded-3xl flex items-center justify-center">
                <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading incident feed…
                </span>
              </GlassPanel>
            ) : incidents.length === 0 ? (
              <GlassPanel className="p-12 border border-white/10 rounded-3xl flex flex-col items-center justify-center text-center gap-3">
                <CheckCircle className="w-10 h-10 text-emerald-400" />
                <div>
                  <p className="font-semibold">No incidents reported</p>
                  <p className="text-sm text-muted-foreground">All infrastructure has been running smoothly.</p>
                </div>
              </GlassPanel>
            ) : (
              <div className="space-y-4">
                {incidents.map((incident: any) => (
                  <motion.div key={incident.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                    <GlassPanel className={`p-6 border rounded-3xl ${incident.is_active ? 'border-red-500/30 bg-red-500/[0.03]' : 'border-white/10'}`}>
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border ${SEVERITY_COLORS[incident.severity] || SEVERITY_COLORS.minor}`}>
                          {incident.severity || 'minor'}
                        </span>
                        <span className="text-[10px] font-medium uppercase tracking-wider px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-muted-foreground capitalize">
                          {String(incident.status || 'investigating').replace(/_/g, ' ')}
                        </span>
                        {incident.is_active && (
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-red-500/15 border border-red-500/40 text-red-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" /> Live
                          </span>
                        )}
                      </div>
                      <h3 className="font-display text-lg font-bold mb-1">{incident.title}</h3>
                      {incident.description && (
                        <p className="text-sm text-muted-foreground leading-relaxed mb-4">{incident.description}</p>
                      )}
                      {Array.isArray(incident.affected_services) && incident.affected_services.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-4">
                          {incident.affected_services.map((svc: string) => (
                            <span key={svc} className="text-[11px] px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-muted-foreground">{svc}</span>
                          ))}
                        </div>
                      )}
                      {Array.isArray(incident.updates) && incident.updates.length > 0 && (
                        <div className="mt-4 pl-4 border-l-2 border-white/10 space-y-4">
                          {incident.updates.map((update: any) => (
                            <div key={update.id} className="relative">
                              <span className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-primary border-2 border-background" />
                              <p className="text-xs font-semibold capitalize text-primary">{String(update.status || '').replace(/_/g, ' ')}</p>
                              <p className="text-sm text-muted-foreground leading-relaxed">{update.message}</p>
                              {update.created_at && (
                                <p className="text-[10px] text-muted-foreground/60 font-mono mt-0.5">
                                  {formatDistanceToNow(new Date(update.created_at), { addSuffix: true })}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-2 text-[11px] text-muted-foreground/60 font-mono">
                        <Clock className="w-3 h-3" />
                        {incident.is_active ? 'Opened' : 'Resolved'}{' '}
                        {formatDistanceToNow(new Date(incident.resolved_at || incident.created_at), { addSuffix: true })}
                      </div>
                    </GlassPanel>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-4">
            <h2 className="font-display text-2xl font-bold flex items-center gap-3 mb-2">
              <span className="p-2 rounded-lg bg-primary/10 text-primary"><Gauge className="w-6 h-6" /></span>
              Reliability
            </h2>
            <GlassPanel className="p-5 border border-white/10 rounded-2xl">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Observed Uptime</p>
                <Activity className="w-4 h-4 text-primary/60" />
              </div>
              <div className="text-3xl font-black font-mono mb-3">{uptimePct !== null ? `${uptimePct}%` : '--'}</div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${uptimePct ?? 0}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                />
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">{uptimeSamples.length} samples this session</p>
            </GlassPanel>
            <div className="grid grid-cols-2 gap-4">
              <GlassPanel className="p-5 border border-white/10 rounded-2xl">
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2">MTTR</p>
                <div className="text-2xl font-black font-mono">{mttrMinutes !== null ? `${mttrMinutes}m` : '--'}</div>
                <p className="mt-1 text-[11px] text-muted-foreground">mean recovery</p>
              </GlassPanel>
              <GlassPanel className="p-5 border border-white/10 rounded-2xl">
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2">Check Freq</p>
                <div className="text-2xl font-black font-mono">{SERVICE_CHECK_FREQ_SECONDS}s</div>
                <p className="mt-1 text-[11px] text-muted-foreground">proxy {PROXY_POLL_FREQ_SECONDS}s</p>
              </GlassPanel>
            </div>
            <GlassPanel className="p-5 border border-white/10 rounded-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-1">Last Pulse</p>
                  <div className="text-lg font-bold font-mono">{lastChecked.toLocaleTimeString()}</div>
                </div>
                <Clock className={`w-8 h-8 ${isRefreshing ? 'text-primary animate-pulse' : 'text-primary/40'}`} />
              </div>
            </GlassPanel>
          </div>
        </div>
      </main>
      <MobileNav />
    </div>
  );
}
