import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, CheckCircle, XCircle, AlertTriangle,
  RefreshCw, Server, Database, Wifi, Film, Globe, Clock, Zap, Image, Play, Activity
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useStatusIncidents } from '@/hooks/useAdminFeatures';
import { formatDistanceToNow } from 'date-fns';
import { StatusPageBackground } from '@/components/layout/StatusPageBackground';
import { TATAKAI_API_URL, withClientHeaders } from '@/lib/api/api-client';

interface ServiceStatus {
  name: string;
  status: 'operational' | 'degraded' | 'down' | 'checking';
  latency?: number;
  icon: React.ReactNode;
  description: string;
  url?: string;
}

interface ProxyStatusNode {
  id: string;
  url: string;
  failures: number;
  successes: number;
  lastLatencyMs: number;
  cooldownUntil: number;
  status: 'online' | 'degraded' | 'offline';
}

interface ProxyDisplayNode {
  id: string;
  url: string;
  type: string;
  status: 'online' | 'degraded' | 'offline';
  latencyMs: number;
  score: number;
}

interface ScraperHealthNode {
  id: string;
  label: string;
  status: 'operational' | 'degraded' | 'down';
  latencyMs: number;
}

interface ScraperHealthSummary {
  total: number;
  operational: number;
  degraded: number;
  down: number;
}

const SERVICE_CHECK_FREQ_SECONDS = 30;
const PROXY_POLL_FREQ_SECONDS = 4;
const DEFAULT_BACKEND_HEALTH_URL = 'http://api.tatakai.me/health';

type KnownProxyNode = {
  id: string;
  url: string;
  type: string;
};

const KNOWN_PROXY_NODES: KnownProxyNode[] = [
  {
    id: 'proxy-node-hoko',
    url: 'https://hoko.tatakai.me/api/v1/streamingProxy',
    type: 'nodejs',
  },
];

function resolveProxyStatusEndpoint(apiBaseUrl: string, explicitBackendOrigin?: string): string {
  const backendOrigin = String(explicitBackendOrigin || '').trim().replace(/\/$/, '');
  if (backendOrigin) {
    return `${backendOrigin}/api/proxy/status`;
  }

  const apiBase = String(apiBaseUrl || '').trim();
  if (!apiBase || !/^https?:\/\//i.test(apiBase)) {
    return '/api/proxy/status';
  }

  try {
    const parsed = new URL(apiBase);
    return `${parsed.origin}/api/proxy/status`;
  } catch {
    return '/api/proxy/status';
  }
}

function resolveBackendHealthEndpoint(apiBaseUrl: string, explicitBackendOrigin?: string): string {
  const backendOrigin = String(explicitBackendOrigin || '').trim().replace(/\/$/, '');
  if (backendOrigin) {
    return `${backendOrigin}/health`;
  }

  const apiBase = String(apiBaseUrl || '').trim();
  if (!apiBase || !/^https?:\/\//i.test(apiBase)) {
    return DEFAULT_BACKEND_HEALTH_URL;
  }

  try {
    const parsed = new URL(apiBase);
    return `${parsed.origin}/health`;
  } catch {
    return DEFAULT_BACKEND_HEALTH_URL;
  }
}

function buildProxyProbeUrls(proxyUrl: string, proxyPassword: string): string[] {
  const normalized = String(proxyUrl || '').trim().replace(/\/$/, '');
  if (!normalized) return [];

  const streamEndpoint = /\/api\/v1\/streamingproxy$/i.test(normalized)
    ? normalized
    : `${normalized}/api/v1/streamingProxy`;
  const rootEndpoint = normalized.replace(/\/api\/v1\/streamingproxy$/i, '');

  const params = new URLSearchParams({
    url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    type: 'video',
  });
  if (proxyPassword) {
    params.set('password', proxyPassword);
  }

  return Array.from(
    new Set([
      `${rootEndpoint}/health`,
      `${streamEndpoint}?${params.toString()}`,
    ])
  );
}

async function probeKnownProxyNode(node: KnownProxyNode, proxyPassword: string): Promise<ProxyDisplayNode> {
  const probeUrls = buildProxyProbeUrls(node.url, proxyPassword);

  for (const probeUrl of probeUrls) {
    const requestStart = performance.now();
    try {
      const response = await fetch(probeUrl, { signal: AbortSignal.timeout(5000) });
      const latency = Math.round(performance.now() - requestStart);

      // 401/403/405 still indicate the proxy is reachable and alive.
      const onlineLike =
        response.ok || response.status === 401 || response.status === 403 || response.status === 405;

      if (onlineLike) {
        return {
          id: node.id,
          url: node.url,
          type: node.type,
          status: 'online',
          latencyMs: latency,
          score: 1,
        };
      }

      if (response.status >= 400 && response.status < 500) {
        return {
          id: node.id,
          url: node.url,
          type: node.type,
          status: 'degraded',
          latencyMs: latency,
          score: 0,
        };
      }
    } catch {
      // Try next probe URL.
    }
  }

  return {
    id: node.id,
    url: node.url,
    type: node.type,
    status: 'offline',
    latencyMs: 0,
    score: 0,
  };
}

export default function StatusPage() {
  const navigate = useNavigate();
  const { data: incidents = [], isLoading: loadingIncidents } = useStatusIncidents(false);
  const [proxies, setProxies] = useState<ProxyDisplayNode[]>([]);
  const [scrapers, setScrapers] = useState<ScraperHealthNode[]>([]);
  const [scraperSummary, setScraperSummary] = useState<ScraperHealthSummary>({
    total: 0,
    operational: 0,
    degraded: 0,
    down: 0,
  });
  const [services, setServices] = useState<ServiceStatus[]>([
    { name: 'Tatakai Website', status: 'checking', icon: <Globe className="w-5 h-5" />, description: 'Main website frontend', url: window.location.origin },
    { name: 'Tatakai Backend', status: 'checking', icon: <Zap className="w-5 h-5" />, description: 'Unified Hono API', url: DEFAULT_BACKEND_HEALTH_URL },
    { name: 'Supabase API', status: 'checking', icon: <Database className="w-5 h-5" />, description: 'Database & Auth infrastructure' },
    { name: 'Jikan API', status: 'checking', icon: <Server className="w-5 h-5" />, description: 'MyAnimeList metadata provider', url: 'https://api.jikan.moe/v4/health' },
    { name: 'Image Assets', status: 'checking', icon: <Image className="w-5 h-5" />, description: 'Anime posters & thumbnails', url: 'https://api.waifu.pics/sfw/waifu' },
    { name: 'Streaming Infrastructure', status: 'checking', icon: <Play className="w-5 h-5" />, description: 'Video delivery services' },
  ]);
  const [lastChecked, setLastChecked] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const proxyStatusEndpoint = useMemo(
    () => resolveProxyStatusEndpoint(TATAKAI_API_URL, import.meta.env.VITE_BACKEND_ORIGIN),
    []
  );
  const backendHealthEndpoint = useMemo(
    () => resolveBackendHealthEndpoint(TATAKAI_API_URL, import.meta.env.VITE_BACKEND_ORIGIN),
    []
  );
  const sharedProxyPassword = String(
    import.meta.env.VITE_STREAM_PROXY_PASSWORD || import.meta.env.VITE_PROXY_PASSWORD || ''
  ).trim();

  const SEVERITY_COLORS = {
    minor: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/50',
    major: 'bg-orange-500/20 text-orange-500 border-orange-500/50',
    critical: 'bg-red-500/20 text-red-500 border-red-500/50',
  };

  const STATUS_COLORS = {
    investigating: 'bg-red-500/20 text-red-500',
    identified: 'bg-orange-500/20 text-orange-500',
    monitoring: 'bg-blue-500/20 text-blue-500',
    resolved: 'bg-green-500/20 text-green-500',
  };

  const classifyProxyType = (url: string) => {
    const lower = (url || '').toLowerCase();
    if (lower.includes('workers.dev') || lower.includes('cloudflare') || lower.includes('kira.tatakai.me')) return 'cf';
    if (lower.includes('hoko.tatakai.me')) return 'nodejs';
    if (lower.includes('bun')) return 'bun';
    return 'nodejs';
  };

  const loadScraperHealth = useCallback(async () => {
    const response = await fetch(`${TATAKAI_API_URL}/health/scrapers`, {
      headers: withClientHeaders({ Accept: 'application/json' }),
      signal: AbortSignal.timeout(9000),
    });
    if (!response.ok) throw new Error(`Scraper health failed: ${response.status}`);

    const json = await response.json();
    const nodes: ScraperHealthNode[] = Array.isArray(json?.scrapers)
      ? json.scrapers.map((node: any, index: number) => ({
          id: String(node?.id || `source-${index + 1}`),
          label: String(node?.label || `Source ${String(index + 1).padStart(2, '0')}`),
          status: node?.status === 'operational' || node?.status === 'degraded' || node?.status === 'down'
            ? node.status
            : 'down',
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
          operational: nodes.filter((node) => node.status === 'operational').length,
          degraded: nodes.filter((node) => node.status === 'degraded').length,
          down: nodes.filter((node) => node.status === 'down').length,
        };

    setScrapers(nodes);
    setScraperSummary(summary);
    return nodes;
  }, []);

  const loadProxyStatus = useCallback(async () => {
    let mappedFromBackend: ProxyDisplayNode[] = [];

    try {
      const response = await fetch(proxyStatusEndpoint, {
        headers: withClientHeaders({ Accept: 'application/json' }),
        signal: AbortSignal.timeout(7000),
      });
      if (response.ok) {
        const json = await response.json();
        const nodes: ProxyStatusNode[] = Array.isArray(json?.nodes) ? json.nodes : [];
        mappedFromBackend = nodes.map((node) => ({
          id: node.id,
          url: node.url,
          type: classifyProxyType(node.url),
          status: node.status,
          latencyMs: node.lastLatencyMs || 0,
          score: Math.max(0, node.successes - node.failures),
        }));
      }
    } catch {
      // Fall back to direct node probes below.
    }

    if (mappedFromBackend.length > 0) {
      setProxies(mappedFromBackend);
      return mappedFromBackend;
    }

    const probedFallback = await Promise.all(
      KNOWN_PROXY_NODES.map((node) => probeKnownProxyNode(node, sharedProxyPassword))
    );
    setProxies(probedFallback);
    return probedFallback;
  }, [proxyStatusEndpoint, sharedProxyPassword]);

  const checkService = async (name: string, checkFn: () => Promise<{ status: ServiceStatus['status']; latency: number }>): Promise<ServiceStatus['status']> => {
    try {
      const result = await checkFn();
      setServices(prev => prev.map(s =>
        s.name === name ? { ...s, status: result.status, latency: result.latency } : s
      ));
      return result.status;
    } catch {
      setServices(prev => prev.map(s =>
        s.name === name ? { ...s, status: 'down', latency: undefined } : s
      ));
      return 'down';
    }
  };

  const checkServices = async () => {
    setIsRefreshing(true);

    try {
      // Reset all to checking
      setServices(prev => prev.map(s => ({ ...s, status: 'checking' as const, latency: undefined })));

      // Check Tatakai Website
      await checkService('Tatakai Website', async () => {
        const start = Date.now();
        const res = await fetch(window.location.origin, { method: 'HEAD' });
        const latency = Date.now() - start;
        return {
          status: res.ok ? (latency > 1000 ? 'degraded' : 'operational') : 'down',
          latency
        };
      });

      // Check Tatakai Backend
      await checkService('Tatakai Backend', async () => {
        const start = Date.now();
        try {
          const res = await fetch(backendHealthEndpoint, {
            headers: withClientHeaders({ Accept: 'text/plain,application/json,*/*' }),
            signal: AbortSignal.timeout(5000),
          });
          const text = await res.text();
          const latency = Date.now() - start;
          return {
            status: res.ok && text.includes('daijoubu') ? (latency > 1000 ? 'degraded' : 'operational') : 'down',
            latency
          };
        } catch {
          return { status: 'down', latency: 0 };
        }
      });

      // Check Supabase
      await checkService('Supabase API', async () => {
        const start = Date.now();
        const { error } = await supabase.from('profiles').select('count').limit(1);
        const latency = Date.now() - start;
        return {
          status: error ? 'down' : (latency > 500 ? 'degraded' : 'operational'),
          latency
        };
      });

      // Check Jikan API
      await checkService('Jikan API', async () => {
        const start = Date.now();
        try {
          const res = await fetch('https://api.jikan.moe/v4/anime/1', { signal: AbortSignal.timeout(10000) });
          const latency = Date.now() - start;
          return {
            status: res.ok ? (latency > 1500 ? 'degraded' : 'operational') : (res.status === 429 ? 'degraded' : 'down'),
            latency
          };
        } catch {
          return { status: 'down', latency: 0 };
        }
      });

      // Check Image Assets
      await checkService('Image Assets', async () => {
        const start = Date.now();
        try {
          const res = await fetch('https://api.waifu.pics/sfw/waifu', { signal: AbortSignal.timeout(5000) });
          const latency = Date.now() - start;
          return {
            status: res.ok ? (latency > 1000 ? 'degraded' : 'operational') : 'down',
            latency
          };
        } catch {
          return { status: 'down', latency: 0 };
        }
      });

      // Check Streaming Infrastructure
      await checkService('Streaming Infrastructure', async () => {
        const start = Date.now();
        try {
          const stats = await loadProxyStatus();
          const onlineCount = stats.filter(p => p.status === 'online').length;
          const latency = Date.now() - start;
          return { 
            status: stats.length > 0
              ? (onlineCount > 0 ? (onlineCount < stats.length / 2 ? 'degraded' : 'operational') : 'down')
              : 'down', 
            latency 
          };
        } catch {
          return { status: 'down', latency: 0 };
        }
      });

      await loadScraperHealth();
      setLastChecked(new Date());
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    checkServices();

    // Poll live backend proxy status
    const proxyInterval = setInterval(() => {
      loadProxyStatus().catch(() => {
        // no-op; per-service status check handles failures
      });
    }, PROXY_POLL_FREQ_SECONDS * 1000);

    // Periodic full system check used by status KPIs.
    const serviceInterval = setInterval(() => {
      checkServices();
    }, SERVICE_CHECK_FREQ_SECONDS * 1000);

    loadProxyStatus().catch(() => {
      // no-op on first render if backend isn't reachable yet
    });

    return () => {
      clearInterval(proxyInterval);
      clearInterval(serviceInterval);
    };
  }, [loadProxyStatus]);

  const globalHealthIndex = useMemo(() => {
    const serviceScores = services
      .filter((s) => s.status !== 'checking')
      .map((s) => (s.status === 'operational' ? 1 : s.status === 'degraded' ? 0.6 : 0));
    const proxyScores = proxies.map((p) => (p.status === 'online' ? 1 : p.status === 'degraded' ? 0.6 : 0));
    const scraperScores = scrapers.map((scraper) => (scraper.status === 'operational' ? 1 : scraper.status === 'degraded' ? 0.6 : 0));
    const allScores = [...serviceScores, ...proxyScores, ...scraperScores];
    if (allScores.length === 0) return 0;
    const average = allScores.reduce((sum, v) => sum + v, 0) / allScores.length;
    return Number((average * 100).toFixed(1));
  }, [services, proxies, scrapers]);

  const mttrMinutes = useMemo(() => {
    const resolvedIncidents = incidents.filter((incident: any) => !incident.is_active && incident.created_at && incident.resolved_at);
    if (!resolvedIncidents.length) return null;

    const durations = resolvedIncidents
      .map((incident: any) => {
        const start = new Date(incident.created_at).getTime();
        const end = new Date(incident.resolved_at).getTime();
        return end > start ? (end - start) / 60000 : null;
      })
      .filter((v: number | null): v is number => v !== null);

    if (!durations.length) return null;
    return Math.round(durations.reduce((sum, v) => sum + v, 0) / durations.length);
  }, [incidents]);

  const getStatusIcon = (status: ServiceStatus['status']) => {
    switch (status) {
      case 'operational':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'degraded':
        return <AlertTriangle className="w-5 h-5 text-amber-400" />;
      case 'down':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <RefreshCw className="w-5 h-5 text-primary animate-spin" />;
    }
  };

  const getStatusOutlineColor = (status: ServiceStatus['status']) => {
    switch (status) {
      case 'operational':
        return 'border-green-500/30';
      case 'degraded':
        return 'border-amber-500/30';
      case 'down':
        return 'border-red-500/30';
      default:
        return 'border-primary/20';
    }
  };

  const hasServiceDown = services.some((service) => service.status === 'down');
  const hasServiceDegraded = services.some((service) => service.status === 'degraded');
  const hasServiceChecking = services.some((service) => service.status === 'checking');
  const hasProxyDown = proxies.some((proxy) => proxy.status === 'offline');
  const hasProxyDegraded = proxies.some((proxy) => proxy.status === 'degraded');
  const hasScraperDown = scrapers.some((scraper) => scraper.status === 'down');
  const hasScraperDegraded = scrapers.some((scraper) => scraper.status === 'degraded');

  const overallStatus = hasServiceDown || hasProxyDown || hasScraperDown
    ? 'Critical System Failure'
    : hasServiceDegraded || hasProxyDegraded || hasScraperDegraded
      ? 'Partial System Degradation'
      : hasServiceChecking || isRefreshing || scrapers.length === 0
        ? 'Analyzing Infrastructure...'
        : 'All Systems Operational';

  const overallColor = hasServiceDown || hasProxyDown || hasScraperDown
    ? 'from-red-500/20 via-red-900/40 to-red-500/20'
    : hasServiceDegraded || hasProxyDegraded || hasScraperDegraded
      ? 'from-amber-500/20 via-amber-900/40 to-amber-500/20'
      : 'from-green-500/20 via-emerald-900/40 to-green-500/20';

  const overallIconColor = hasServiceDown || hasProxyDown || hasScraperDown
    ? 'text-red-500'
    : hasServiceDegraded || hasProxyDegraded || hasScraperDegraded
      ? 'text-amber-500'
      : 'text-emerald-400';

  const dashboardCards = [
    {
      label: 'Health Index',
      value: `${globalHealthIndex.toFixed(1)}%`,
      detail: `${services.filter((service) => service.status === 'operational').length}/${services.length} services up`,
    },
    {
      label: 'Proxy Nodes',
      value: `${proxies.filter((proxy) => proxy.status === 'online').length}/${proxies.length}`,
      detail: `${proxies.filter((proxy) => proxy.status === 'degraded').length} degraded`,
    },
    {
      label: 'Scraper Checks',
      value: `${scraperSummary.operational}/${scraperSummary.total}`,
      detail: `${scraperSummary.degraded} degraded, ${scraperSummary.down} down`,
    },
    {
      label: 'Incident MTTR',
      value: mttrMinutes !== null ? `${mttrMinutes}m` : '--',
      detail: `${incidents.filter((incident: any) => incident.is_active).length} active incidents`,
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden relative">
      <StatusPageBackground overlayColor="from-background/95 via-background/80 to-background/95" />
      <Sidebar />

      {/* Japanese decorative elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <motion.div
          className="absolute top-[15%] right-[5%] text-9xl font-bold text-primary/5 select-none"
          animate={{ y: [0, -30, 0], opacity: [0.03, 0.08, 0.03] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        >
          状態
        </motion.div>
        <motion.div
          className="absolute bottom-[20%] left-[8%] text-8xl font-bold text-accent/5 select-none"
          animate={{ y: [0, 20, 0], opacity: [0.03, 0.06, 0.03] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        >
          稼働
        </motion.div>
        
        {/* Decorative thin lines */}
        <div className="absolute top-0 right-1/3 w-px h-full bg-gradient-to-b from-transparent via-primary/10 to-transparent" />
        <div className="absolute top-0 left-1/4 w-px h-full bg-gradient-to-b from-transparent via-accent/10 to-transparent" />
      </div>

      <main className="relative z-10 pl-6 md:pl-32 pr-6 py-6 max-w-[1400px] mx-auto pb-24 md:pb-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate(-1)}
            className="group flex items-center gap-2 p-2 rounded-full hover:bg-white/5 transition-all"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground group-hover:text-foreground group-hover:-translate-x-1 transition-all" />
            <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground">Return</span>
          </button>
        </div>

        {/* Overall Status Banner */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <GlassPanel className={`p-8 mb-8 bg-gradient-to-r ${overallColor} border-0 relative overflow-hidden backdrop-blur-xl group`}>
            {/* Shimmer effect */}
            <motion.div 
               className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12 translate-x-[-100%]"
               animate={{ x: ["100%", "-100%"] }}
               transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            />
            
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
              <div className="flex items-center gap-6">
                <div className={`p-4 rounded-2xl bg-black/40 border border-white/10 ${overallIconColor}`}>
                  {services.some(s => s.status === 'checking') ? (
                    <RefreshCw className="w-12 h-12 animate-spin" />
                  ) : services.some(s => s.status === 'down') ? (
                    <XCircle className="w-12 h-12" />
                  ) : services.some(s => s.status === 'degraded') ? (
                    <AlertTriangle className="w-12 h-12" />
                  ) : (
                    <CheckCircle className="w-12 h-12" />
                  )}
                </div>
                <div>
                  <h1 className="font-display text-2xl md:text-4xl font-bold tracking-tight">{overallStatus}</h1>
                  <p className="text-muted-foreground mt-1 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" />
                    Tatakai Network Infrastructure Dashboard
                  </p>
                </div>
              </div>
              <Button
                onClick={checkServices}
                disabled={isRefreshing}
                variant="outline"
                className="gap-2 bg-white/5 border-white/10 hover:bg-white/10 h-12 px-6 rounded-xl transition-all"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                Rerunning Checks
              </Button>
            </div>
          </GlassPanel>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-12">
          {dashboardCards.map((card) => (
            <GlassPanel key={card.label} className="p-5 border border-white/10 bg-white/5 backdrop-blur-xl">
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-3">{card.label}</p>
              <div className="flex items-end justify-between gap-4">
                <div className="text-3xl font-black font-mono tracking-tight">{card.value}</div>
                <Activity className="w-5 h-5 text-primary/60 shrink-0" />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{card.detail}</p>
            </GlassPanel>
          ))}
        </div>

        {/* Services Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {services.map((service, index) => (
            <motion.div
              key={service.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
            >
              <GlassPanel className={`p-6 border-b-2 hover:translate-y-[-4px] transition-all duration-300 ${getStatusOutlineColor(service.status)}`}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-2xl bg-white/5 border border-white/10 group-hover:scale-110 transition-all">
                      {service.icon}
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">{service.name}</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">{service.description}</p>
                    </div>
                  </div>
                  {getStatusIcon(service.status)}
                </div>
                
                <div className="mt-6 flex items-center justify-between">
                   <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Response</span>
                      <div className="flex items-center gap-2">
                         <div className={`w-2 h-2 rounded-full ${service.status === 'operational' ? 'bg-green-400' : service.status === 'degraded' ? 'bg-amber-400' : 'bg-red-500 animate-pulse'}`} />
                         <span className="text-sm font-medium capitalize">{service.status}</span>
                      </div>
                   </div>
                   {service.latency !== undefined && (
                     <div className="flex flex-col items-end">
                        <span className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Latency</span>
                        <span className={`font-mono text-sm ${service.latency > 500 ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {service.latency > 0 ? `${service.latency}ms` : '--'}
                        </span>
                     </div>
                   )}
                </div>
              </GlassPanel>
            </motion.div>
          ))}
        </div>

        {/* Scraper Health */}
        <div className="mb-12">
          <div className="flex items-center justify-between gap-4 mb-6">
            <h2 className="font-display text-2xl font-bold flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Wifi className="w-6 h-6" />
              </div>
              Scraper Health
            </h2>
            <div className="text-xs text-muted-foreground font-mono bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
              {scraperSummary.operational}/{scraperSummary.total} passing
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {scrapers.map((scraper, index) => (
              <motion.div
                key={scraper.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
              >
                <GlassPanel className="p-5 border border-white/10 bg-white/5 backdrop-blur-xl">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Generic Source</p>
                      <h3 className="font-semibold text-lg mt-1">{scraper.label}</h3>
                    </div>
                    <div className={`w-3 h-3 rounded-full ${scraper.status === 'operational' ? 'bg-green-400' : scraper.status === 'degraded' ? 'bg-amber-400' : 'bg-red-500'}`} />
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    {scraper.status === 'operational' ? <CheckCircle className="w-4 h-4 text-green-400" /> : scraper.status === 'degraded' ? <AlertTriangle className="w-4 h-4 text-amber-400" /> : <XCircle className="w-4 h-4 text-red-500" />}
                    <span className="capitalize font-medium">{scraper.status}</span>
                    <span className="text-muted-foreground">•</span>
                    <span className="font-mono text-muted-foreground">{scraper.latencyMs > 0 ? `${scraper.latencyMs}ms` : '--'}</span>
                  </div>
                </GlassPanel>
              </motion.div>
            ))}

            {scrapers.length === 0 && (
              <GlassPanel className="p-5 border border-dashed border-white/10 bg-white/5 backdrop-blur-xl sm:col-span-2 xl:col-span-3">
                <div className="flex items-center justify-center py-8 text-center text-muted-foreground">
                  <RefreshCw className="w-5 h-5 animate-spin mr-3" />
                  Scraper checks are still loading.
                </div>
              </GlassPanel>
            )}
          </div>
        </div>

        {/* Proxy Pool Load Balancer */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-2xl font-bold flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Server className="w-6 h-6" />
              </div>
              Edge Routing Infrastructure
            </h2>
            <div className="text-xs text-muted-foreground font-mono bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
              Active Nodes: {proxies.length}
            </div>
          </div>
          
          <GlassPanel className="p-0 overflow-hidden border border-white/10 backdrop-blur-3xl rounded-3xl">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10">
                    <th className="px-6 py-5 font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Node Identifier</th>
                    <th className="px-6 py-5 font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Provider Type</th>
                    <th className="px-6 py-5 font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Deployment Status</th>
                    <th className="px-6 py-5 font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Network Latency</th>
                    <th className="px-6 py-5 font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Payload Weight</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  <AnimatePresence>
                    {proxies.map((proxy) => (
                      <motion.tr 
                         key={proxy.id}
                         initial={{ opacity: 0 }}
                         animate={{ opacity: 1 }}
                         exit={{ opacity: 0 }}
                         className="hover:bg-white/5 transition-colors group"
                      >
                        <td className="px-6 py-5 font-mono font-medium text-xs text-primary/80">{proxy.id}</td>
                        <td className="px-6 py-5">
                          <span className="inline-flex items-center px-3 py-1 rounded-lg text-[10px] font-bold bg-white/5 text-white/90 border border-white/10 uppercase tracking-tighter">
                            {proxy.type}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${proxy.status === 'online' ? 'bg-green-400' : proxy.status === 'degraded' ? 'bg-amber-400' : 'bg-red-500'} shadow-[0_0_8px_rgba(34,197,94,0.4)]`} />
                            <span className={`font-bold text-xs uppercase tracking-widest 
                              ${proxy.status === 'online' ? 'text-green-400' : 
                                proxy.status === 'degraded' ? 'text-amber-400' : 'text-red-500'}`}>
                              {proxy.status}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <span className={`font-mono text-sm font-bold ${proxy.latencyMs === 0 ? 'text-muted-foreground' : proxy.latencyMs < 200 ? 'text-emerald-400' : proxy.latencyMs < 500 ? 'text-amber-400' : 'text-red-500'}`}>
                            {proxy.latencyMs > 0 ? `${Math.round(proxy.latencyMs)}ms` : '--'}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-4">
                            <div className="flex-1 bg-white/5 rounded-full h-1.5 overflow-hidden border border-white/5 w-24">
                              <motion.div 
                                className="bg-primary h-full rounded-full shadow-[0_0_10px_rgba(139,92,246,0.3)]" 
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.max(0, Math.min(100, 50 + proxy.score * 10))}%` }}
                                transition={{ duration: 1 }}
                              />
                            </div>
                            <span className="text-muted-foreground font-mono text-[10px]">score {proxy.score}</span>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                  {proxies.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                        <div className="flex flex-col items-center justify-center opacity-40">
                          <Server className="w-10 h-10 mb-4 animate-pulse" />
                          <p className="text-sm font-medium tracking-widest uppercase">Initializing Node Pool...</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </GlassPanel>
        </div>

        {/* Incident History */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
           <div className="lg:col-span-2">
              <div className="flex items-center gap-3 mb-6">
                 <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                    <AlertTriangle className="w-6 h-6" />
                 </div>
                 <h2 className="font-display text-2xl font-bold">Maintenance & Incidents</h2>
              </div>
              
              <GlassPanel className="p-6 border border-white/10 rounded-3xl min-h-[300px]">
                {loadingIncidents ? (
                  <div className="flex flex-col items-center justify-center h-full py-12">
                     <RefreshCw className="w-8 h-8 animate-spin text-primary opacity-50 mb-4" />
                     <p className="text-sm text-muted-foreground">fetching history...</p>
                  </div>
                ) : incidents.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-green-500/20">
                       <CheckCircle className="w-10 h-10 text-green-500" />
                    </div>
                    <p className="text-lg font-medium">All systems normal</p>
                    <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
                       No active incidents or scheduled maintenance reported in the last 30 days. Perfect conditions detected.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {incidents.map((incident) => (
                      <motion.div
                        key={incident.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`p-6 rounded-2xl border backdrop-blur-xl ${incident.is_active ? 'border-orange-500/40 bg-orange-500/5' : 'border-white/5 bg-white/5'}`}
                      >
                        <div className="flex items-start justify-between gap-6">
                          <div className="flex-1">
                            <div className="flex flex-wrap items-center gap-2 mb-4">
                              <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-tighter border ${SEVERITY_COLORS[incident.severity as keyof typeof SEVERITY_COLORS]}`}>
                                {incident.severity}
                              </span>
                              <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-tighter bg-white/5 text-white/70 border border-white/10`}>
                                {incident.status}
                              </span>
                              {incident.is_active && (
                                <span className="px-2.5 py-1 rounded-md bg-red-500/20 text-red-500 text-[10px] font-black uppercase tracking-tighter animate-pulse border border-red-500/30">
                                  LIVE
                                </span>
                              )}
                            </div>
                            <h3 className="font-bold text-xl mb-2">{incident.title}</h3>
                            <p className="text-sm text-muted-foreground leading-relaxed">{incident.description}</p>
    
                            {incident.affected_services && incident.affected_services.length > 0 && (
                              <div className="flex flex-wrap gap-2 mt-4">
                                {incident.affected_services.map((service: string) => (
                                  <span key={service} className="px-3 py-1 rounded-lg bg-white/5 text-[10px] font-bold border border-white/10 text-muted-foreground">
                                    {service}
                                  </span>
                                ))}
                              </div>
                            )}
    
                            {incident.updates && incident.updates.length > 0 && (
                              <div className="mt-6 space-y-4 border-l-2 border-white/5 pl-6 ml-1">
                                {incident.updates.slice(0, 3).map((update) => (
                                  <div key={update.id} className="relative">
                                    <div className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full bg-background border-2 border-primary" />
                                    <p className="text-sm font-medium">{update.message}</p>
                                    <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1.5 font-mono">
                                      <Clock className="w-3 h-3" />
                                      {formatDistanceToNow(new Date(update.created_at), { addSuffix: true })}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
    
                            <div className="mt-6 pt-4 border-t border-white/5 text-[10px] text-muted-foreground font-mono flex items-center gap-2">
                              <span className={incident.is_active ? 'text-orange-500' : 'text-emerald-500'}>
                                ● {incident.is_active ? 'Impact started' : 'Full Resolution reached'}
                              </span>
                              — {formatDistanceToNow(new Date(incident.is_active ? incident.created_at : incident.resolved_at!), { addSuffix: true })}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </GlassPanel>
           </div>
           
           <div className="space-y-8">
              <div className="flex items-center gap-3 mb-6">
                 <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <Globe className="w-6 h-6" />
                 </div>
                 <h2 className="font-display text-2xl font-bold">Network Summary</h2>
              </div>
              
              <GlassPanel className="p-6 border border-white/10 rounded-3xl bg-primary/5">
                 <div className="space-y-6">
                    <div>
                       <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Global Health Index</p>
                       <div className="flex items-center gap-4">
                          <div className="text-4xl font-black font-mono">{globalHealthIndex.toFixed(1)}%</div>
                          <div className="flex-1 bg-white/5 h-2 rounded-full overflow-hidden border border-white/5">
                             <motion.div 
                               className="bg-emerald-500 h-full rounded-full" 
                               initial={{ width: 0 }}
                             animate={{ width: `${globalHealthIndex}%` }}
                               transition={{ duration: 1.5 }}
                             />
                          </div>
                       </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                       <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">MTTR</p>
                          <p className="text-xl font-bold">{mttrMinutes !== null ? `${mttrMinutes}m` : '--'}</p>
                       </div>
                       <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Check Freq</p>
                          <p className="text-xl font-bold">{SERVICE_CHECK_FREQ_SECONDS}s</p>
                       </div>
                    </div>
                 </div>
              </GlassPanel>
              
              <GlassPanel className="p-6 border border-white/10 rounded-3xl bg-secondary/5">
                 <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground tracking-widest uppercase">
                       <Clock className="w-4 h-4" />
                       Timing Reference
                    </div>
                 </div>
                 <div className="flex justify-center flex-col items-center py-4 bg-black/20 rounded-2xl border border-white/5">
                    <div className="text-3xl font-black font-mono tracking-tighter">
                       {lastChecked.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-2 uppercase tracking-[0.2em] font-bold">System Pulse Checked</div>
                 </div>
              </GlassPanel>
           </div>
        </div>
      </main>

      <MobileNav />
    </div>
  );
}
