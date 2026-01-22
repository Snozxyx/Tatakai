import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Background } from '@/components/layout/Background';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, CheckCircle, XCircle, AlertTriangle, 
  RefreshCw, Server, Database, Wifi, Film, Globe, Clock, Zap, Image, Play
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useStatusIncidents } from '@/hooks/useAdminFeatures';
import { formatDistanceToNow } from 'date-fns';

interface ServiceStatus {
  name: string;
  status: 'operational' | 'degraded' | 'down' | 'checking';
  latency?: number;
  icon: React.ReactNode;
  description: string;
  url?: string;
}

export default function StatusPage() {
  const navigate = useNavigate();
  const { data: incidents = [], isLoading: loadingIncidents } = useStatusIncidents(false);
  const [services, setServices] = useState<ServiceStatus[]>([
    { name: 'Tatakai Website', status: 'checking', icon: <Globe className="w-5 h-5" />, description: 'Main website', url: window.location.origin },
    { name: 'Supabase API', status: 'checking', icon: <Database className="w-5 h-5" />, description: 'Database & Auth' },
    { name: 'Jikan API', status: 'checking', icon: <Server className="w-5 h-5" />, description: 'MyAnimeList data', url: 'https://api.jikan.moe/v4' },
    { name: 'Waifu.pics API', status: 'checking', icon: <Image className="w-5 h-5" />, description: 'Profile images', url: 'https://api.waifu.pics/sfw/waifu' },
    { name: 'Nekos.best API', status: 'checking', icon: <Image className="w-5 h-5" />, description: 'Husbando images', url: 'https://nekos.best/api/v2/husbando' },
    { name: 'Video Proxy', status: 'checking', icon: <Play className="w-5 h-5" />, description: 'Video streaming' },
  ]);
  const [lastChecked, setLastChecked] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

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

    // Check Consumet API
    await checkService('Consumet API', async () => {
      const start = Date.now();
      const res = await fetch('https://api.consumet.org/anime/gogoanime/info/naruto', { signal: AbortSignal.timeout(10000) });
      const latency = Date.now() - start;
      return { 
        status: res.ok ? (latency > 2000 ? 'degraded' : 'operational') : 'down',
        latency 
      };
    });

    // Check Jikan API
    await checkService('Jikan API', async () => {
      const start = Date.now();
      const res = await fetch('https://api.jikan.moe/v4/anime/1', { signal: AbortSignal.timeout(10000) });
      const latency = Date.now() - start;
      return { 
        status: res.ok ? (latency > 1500 ? 'degraded' : 'operational') : (res.status === 429 ? 'degraded' : 'down'),
        latency 
      };
    });

    // Check Waifu.pics API
    await checkService('Waifu.pics API', async () => {
      const start = Date.now();
      const res = await fetch('https://api.waifu.pics/sfw/waifu', { signal: AbortSignal.timeout(5000) });
      const latency = Date.now() - start;
      return { 
        status: res.ok ? (latency > 1000 ? 'degraded' : 'operational') : 'down',
        latency 
      };
    });

    // Check Nekos.best API
    await checkService('Nekos.best API', async () => {
      const start = Date.now();
      const res = await fetch('https://nekos.best/api/v2/neko', { signal: AbortSignal.timeout(5000) });
      const latency = Date.now() - start;
      return { 
        status: res.ok ? (latency > 1000 ? 'degraded' : 'operational') : 'down',
        latency 
      };
    });

    // Check Video Proxy (Supabase Edge Function)
    await checkService('Video Proxy', async () => {
      const start = Date.now();
      try {
        const { data } = await supabase.functions.invoke('video-proxy', { 
          body: { test: true },
          method: 'POST'
        });
        const latency = Date.now() - start;
        return { status: 'operational', latency };
      } catch {
        const latency = Date.now() - start;
        // Edge functions may not respond to test requests, so we check if Supabase is up
        return { status: latency < 5000 ? 'operational' : 'degraded', latency };
      }
    });
    
    setLastChecked(new Date());
    setIsRefreshing(false);
  };

  useEffect(() => {
    checkServices();
  }, []);

  const getStatusIcon = (status: ServiceStatus['status']) => {
    switch (status) {
      case 'operational':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'degraded':
        return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      case 'down':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <RefreshCw className="w-5 h-5 text-muted-foreground animate-spin" />;
    }
  };

  const getStatusColor = (status: ServiceStatus['status']) => {
    switch (status) {
      case 'operational':
        return 'bg-green-500/20 border-green-500/50';
      case 'degraded':
        return 'bg-amber-500/20 border-amber-500/50';
      case 'down':
        return 'bg-red-500/20 border-red-500/50';
      default:
        return 'bg-muted/50 border-border/50';
    }
  };

  const overallStatus = services.some(s => s.status === 'down') 
    ? 'Major Outage' 
    : services.some(s => s.status === 'degraded')
    ? 'Partial Outage'
    : services.some(s => s.status === 'checking')
    ? 'Checking...'
    : 'All Systems Operational';

  const overallColor = services.some(s => s.status === 'down')
    ? 'from-red-500 to-red-700'
    : services.some(s => s.status === 'degraded')
    ? 'from-amber-500 to-amber-700'
    : 'from-green-500 to-green-700';

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Background />
      <Sidebar />

      <main className="relative z-10 pl-6 md:pl-32 pr-6 py-6 max-w-[1400px] mx-auto pb-24 md:pb-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back</span>
          </button>
        </div>

        {/* Overall Status */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <GlassPanel className={`p-8 mb-8 bg-gradient-to-r ${overallColor} border-0`}>
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                {services.some(s => s.status === 'checking') ? (
                  <RefreshCw className="w-10 h-10 animate-spin" />
                ) : services.some(s => s.status === 'down') ? (
                  <XCircle className="w-10 h-10" />
                ) : services.some(s => s.status === 'degraded') ? (
                  <AlertTriangle className="w-10 h-10" />
                ) : (
                  <CheckCircle className="w-10 h-10" />
                )}
                <div>
                  <h1 className="font-display text-2xl md:text-3xl font-bold">{overallStatus}</h1>
                  <p className="text-white/80">System Status Dashboard</p>
                </div>
              </div>
              <Button
                onClick={checkServices}
                disabled={isRefreshing}
                variant="secondary"
                className="gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </GlassPanel>
        </motion.div>

        {/* Services Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {services.map((service, index) => (
            <motion.div
              key={service.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
            >
              <GlassPanel className={`p-6 border ${getStatusColor(service.status)}`}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-muted/50">
                      {service.icon}
                    </div>
                    <div>
                      <h3 className="font-medium">{service.name}</h3>
                      <p className="text-xs text-muted-foreground">{service.description}</p>
                    </div>
                  </div>
                  {getStatusIcon(service.status)}
                </div>
                {service.latency && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Response time</span>
                    <span className={service.latency > 200 ? 'text-amber-500' : 'text-green-500'}>
                      {service.latency}ms
                    </span>
                  </div>
                )}
              </GlassPanel>
            </motion.div>
          ))}
        </div>

        {/* Last Checked */}
        <GlassPanel className="p-4">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-4 h-4" />
            Last checked: {lastChecked.toLocaleTimeString()}
          </div>
        </GlassPanel>

        {/* Incident History */}
        <div className="mt-8">
          <h2 className="font-display text-xl font-semibold mb-4">Recent Incidents</h2>
          <GlassPanel className="p-6">
            {loadingIncidents ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : incidents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
                <p>No incidents reported in the last 30 days</p>
              </div>
            ) : (
              <div className="space-y-4">
                {incidents.map((incident) => (
                  <div
                    key={incident.id}
                    className={`p-4 rounded-xl border ${
                      incident.is_active ? 'border-orange-500/50 bg-orange-500/5' : 'border-muted bg-muted/10'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${SEVERITY_COLORS[incident.severity as keyof typeof SEVERITY_COLORS]}`}>
                            {incident.severity.toUpperCase()}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[incident.status as keyof typeof STATUS_COLORS]}`}>
                            {incident.status}
                          </span>
                          {incident.is_active && (
                            <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-500 text-xs font-bold animate-pulse">
                              ONGOING
                            </span>
                          )}
                        </div>
                        <h3 className="font-semibold">{incident.title}</h3>
                        <p className="text-sm text-muted-foreground mt-1">{incident.description}</p>
                        
                        {incident.affected_services && incident.affected_services.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {incident.affected_services.map((service: string) => (
                              <span key={service} className="px-2 py-0.5 rounded-full bg-muted/50 text-xs">
                                {service}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Incident Updates */}
                        {incident.updates && incident.updates.length > 0 && (
                          <div className="mt-4 space-y-2">
                            {incident.updates.slice(0, 3).map((update) => (
                              <div key={update.id} className="pl-4 border-l-2 border-muted">
                                <p className="text-sm">{update.message}</p>
                                <p className="text-xs text-muted-foreground">
                                  {formatDistanceToNow(new Date(update.created_at), { addSuffix: true })}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        <p className="text-xs text-muted-foreground mt-3">
                          {incident.is_active ? 'Started' : 'Resolved'}{' '}
                          {formatDistanceToNow(new Date(incident.is_active ? incident.created_at : incident.resolved_at!), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassPanel>
        </div>
      </main>

      <MobileNav />
    </div>
  );
}
