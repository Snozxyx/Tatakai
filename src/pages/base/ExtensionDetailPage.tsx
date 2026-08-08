import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, Download, Shield, ShieldCheck, Zap, Globe, Puzzle, 
  CheckCircle2, X, Star, Users, History, FileText, ExternalLink,
  MessageSquare, Layout, Box, Github, Loader2, AlertCircle, Code2, Package2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { useIsNativeApp } from '@/hooks/ui/useIsNativeApp';
import { Background } from '@/components/layout/Background';
import { supabase } from '@/integrations/supabase/client';
import { ExtensionManifest } from './ExtensionHubPage';
import { OFFICIAL_EXTENSIONS, OFFICIAL_EXTENSION_URLS } from '@/core/extensions/defaultExtensions';
import { downloadExtensionKai } from '@/core/extensions/marketplace-client';
import { useQuery } from '@tanstack/react-query';
import { ExtensionDebugWindow } from '@/components/extensions/ExtensionDebugWindow';

const TYPE_COLORS: Record<string, string> = {
  torrent: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  onlinestream: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  custom: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
};

const TYPE_ICONS: Record<string, any> = {
  torrent: Zap,
  onlinestream: Globe,
  custom: Puzzle,
};

// ─── Description Renderer (lightweight markdown-ish) ────────────────────────
function DescriptionRenderer({ text }: { text: string }) {
  if (!text) return <p className="text-xl text-muted-foreground">No description available</p>;

  const lines = text.split('\n');
  return (
    <div className="space-y-3 text-base leading-relaxed">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-2" />;

        // Bold section headers: **text**
        if (/^\*\*.*\*\*$/.test(line.trim())) {
          const label = line.replace(/\*\*/g, '').trim();
          return (
            <p key={i} className="text-primary font-black text-sm uppercase tracking-widest mt-4 mb-1">
              {label}
            </p>
          );
        }

        // Inline bold (**text**) within a line
        const parts = line.split(/\*\*(.*?)\*\*/);
        if (parts.length > 1) {
          return (
            <p key={i} className="text-muted-foreground font-medium">
              {parts.map((part, j) =>
                j % 2 === 1 ? <strong key={j} className="text-foreground font-black">{part}</strong> : part
              )}
            </p>
          );
        }

        return (
          <p key={i} className="text-muted-foreground font-medium">
            {line}
          </p>
        );
      })}
    </div>
  );
}


interface SourceCodeResult {
  success: boolean;
  content?: string;
  truncated?: boolean;
  totalBytes?: number;
  error?: string;
}

function SourceCodeTab({ extensionId }: { extensionId: string }) {
  const { data, isLoading, error } = useQuery<SourceCodeResult>({
    queryKey: ['extension-source-code', extensionId],
    queryFn: () => (window as any).tatakaiRuntime.getExtensionSourceCode(extensionId),
    staleTime: Infinity,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm font-bold uppercase tracking-widest animate-pulse">Loading source code…</p>
      </div>
    );
  }

  if (error || !data?.success) {
    const message = data?.error ?? (error instanceof Error ? error.message : 'Unknown error');
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center border-2 border-dashed border-white/5 rounded-[2rem]">
        <AlertCircle className="w-12 h-12 text-destructive opacity-40" />
        <div>
          <h3 className="text-lg font-black">Source Code Unavailable</h3>
          <p className="text-sm text-muted-foreground mt-1">{message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {data.truncated && (
        <div className="flex items-start gap-3 px-5 py-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-bold leading-relaxed">
            Source truncated to 50 KB — full bundle is{' '}
            {data.totalBytes != null
              ? `${(data.totalBytes / 1024).toFixed(1)} KB`
              : 'larger than the display limit'}.
          </p>
        </div>
      )}
      <pre className="bg-muted/30 rounded-lg p-4 text-xs font-mono overflow-auto max-h-[500px] whitespace-pre-wrap">
        {data.content}
      </pre>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ExtensionDetailPage() {
  const { extensionId } = useParams<{ extensionId: string }>();
  const navigate = useNavigate();
  const isNative = useIsNativeApp();
  const [activeTab, setActiveTab] = useState<'overview' | 'changelog' | 'reviews' | 'source'>('overview');
  const [installState, setInstallState] = useState<'idle' | 'installing' | 'installed' | 'not_loaded'>('idle');
  const [isDebugOpen, setIsDebugOpen] = useState(false);

  useEffect(() => {
    const installed = JSON.parse(localStorage.getItem('tatakai_installed_extensions') ?? '[]');
    if (installed.includes(extensionId)) setInstallState('installed');
  }, [extensionId]);

  // Derived booleans for backwards-compat with existing JSX
  const isInstalling = installState === 'installing';
  const isInstalled = installState === 'installed' || installState === 'not_loaded';
  const { data: extension, isLoading, error } = useQuery({
    queryKey: ['extension', extensionId],
    queryFn: async () => {
      if (!extensionId) throw new Error('No extension ID');

      // 0. Check official bundled extensions FIRST — no network call needed
      const official = OFFICIAL_EXTENSIONS.find(e => e.id === extensionId);
      if (official) return official;

      // 1. Check local sideloaded extensions storage
      const sideloadedRaw = typeof window !== 'undefined' ? localStorage.getItem('tatakai_sideloaded_extensions') : null;
      if (sideloadedRaw) {
        const sideloadedList: ExtensionManifest[] = JSON.parse(sideloadedRaw);
        const match = sideloadedList.find(e => e.id === extensionId);
        if (match) return match;
      }

      // 2. Query DB (extension_manifests canonical table)
      const { data: manifestData, error: manifestErr } = await supabase
        .from('extension_manifests' as any)
        .select('*')
        .eq('extension_id', extensionId)
        .single();
      
      if (!manifestErr && manifestData) {
        return {
          id: manifestData.extension_id ?? manifestData.id,
          name: manifestData.name,
          description: manifestData.description ?? '',
          version: manifestData.version,
          author: manifestData.author_name ?? manifestData.author ?? 'Unknown',
          icon: manifestData.icon_url ?? manifestData.icon ?? undefined,
          banner: manifestData.banner_url ?? manifestData.banner ?? undefined,
          screenshots: manifestData.screenshots ?? [],
          categories: manifestData.categories ?? [],
          permissions: manifestData.permissions ?? [],
          isApproved: manifestData.submission_status === 'approved',
          downloads: manifestData.downloads ?? 0,
          rating: manifestData.rating ?? undefined,
          updatedAt: manifestData.updated_at ?? undefined,
          type: manifestData.type,
          status: manifestData.submission_status,
          user_id: manifestData.submitted_by ?? manifestData.user_id ?? undefined,
        } as ExtensionManifest;
      }

      // 3. Fallback to legacy extensions table
      const { data, error: legacyError } = await supabase
        .from('extensions' as any)
        .select('*')
        .eq('id', extensionId)
        .single();
      
      if (legacyError) throw legacyError;
      return data as ExtensionManifest;
    },
    enabled: !!extensionId,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <Background />
        <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
        <p className="text-muted-foreground font-black uppercase tracking-widest animate-pulse">Fetching Extension...</p>
      </div>
    );
  }

  if (error || !extension) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <Background />
        <AlertCircle className="w-16 h-16 text-destructive mb-4 opacity-20" />
        <h1 className="text-2xl font-bold mb-2">Extension Not Found</h1>
        <p className="text-muted-foreground mb-6">The requested module might be private or removed from the registry.</p>
        <Button onClick={() => navigate('/extensions')}>Return to Hub</Button>
      </div>
    );
  }

  const handleInstallToggle = async () => {
    if (isInstalled) {
      // Uninstall
      setInstallState('installing');
      await new Promise(r => setTimeout(r, 500));
      const installed = JSON.parse(localStorage.getItem('tatakai_installed_extensions') ?? '[]');
      localStorage.setItem('tatakai_installed_extensions', JSON.stringify(installed.filter((id: string) => id !== extensionId)));
      // Also remove from sideloaded if it's there
      const sideloaded = JSON.parse(localStorage.getItem('tatakai_sideloaded_extensions') ?? '[]');
      localStorage.setItem('tatakai_sideloaded_extensions', JSON.stringify(sideloaded.filter((e: any) => e.id !== extensionId)));
      (window as any).tatakaiRuntime?.unloadExtension?.(extensionId).catch(() => {});
      setInstallState('idle');
      return;
    }

    // Install
    setInstallState('installing');

    try {
      const officialUrl = OFFICIAL_EXTENSION_URLS[extensionId!];
      const tatakaiRuntime = (window as any).tatakaiRuntime;

      if (officialUrl) {
        // Official extension — download via XHR to avoid CORS issues with patched fetch
        const buffer = await downloadExtensionKai(officialUrl);

        if (tatakaiRuntime?.loadKaiExtension) {
          const result = await tatakaiRuntime.loadKaiExtension(buffer, true);
          if (!result?.success) throw new Error(result?.error ?? 'Runtime load failed');
        }

        // Persist to sideloaded + installed lists
        if (extension) {
          const sideloaded: ExtensionManifest[] = JSON.parse(localStorage.getItem('tatakai_sideloaded_extensions') ?? '[]');
          const filtered = sideloaded.filter(e => e.id !== extensionId);
          localStorage.setItem('tatakai_sideloaded_extensions', JSON.stringify([extension, ...filtered]));
        }
      } else {
        // Community extension — legacy path
        await new Promise(r => setTimeout(r, 800));
        tatakaiRuntime?.loadExtension?.(extensionId, extension).catch(() => {});
      }

      const installed = JSON.parse(localStorage.getItem('tatakai_installed_extensions') ?? '[]');
      localStorage.setItem('tatakai_installed_extensions', JSON.stringify([...new Set([...installed, extensionId])]));
      window.dispatchEvent(new CustomEvent('tatakai:extension-sideloaded', { detail: extension }));
    } catch (err: any) {
      console.error('[ExtensionDetailPage] Install error:', err);
      setInstallState('idle');
      return;
    }

    // Health-check polling: poll runtime:health every 500ms for up to 5s (req 11.4, 11.5, 11.6)
    let pollCount = 0;
    const maxPolls = 10;
    const poll = setInterval(async () => {
      pollCount++;
      try {
        const health = await (window as any).tatakaiRuntime?.health?.();
        if (health?.loadedExtensions?.includes(extensionId)) {
          clearInterval(poll);
          setInstallState('installed');
          return;
        }
      } catch { /* ignore */ }
      if (pollCount >= maxPolls) {
        clearInterval(poll);
        setInstallState('not_loaded'); // "Installed (not loaded)" warning
      }
    }, 500);
  };

  const Icon = TYPE_ICONS[extension.type ?? 'custom'];

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <Background />
      
      {/* Hero Banner Section */}
      <div className="relative h-[450px] w-full overflow-hidden">
        <motion.div 
          initial={{ scale: 1.1, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1 }}
          className="absolute inset-0"
        >
          {extension.banner ? (
            <img src={extension.banner} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/20 via-background to-secondary/20" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
          <div className="absolute inset-0 bg-black/20" />
        </motion.div>

        <div className="absolute top-8 left-8 z-20">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate('/extensions')}
            className="rounded-full h-12 w-12 bg-black/40 backdrop-blur-xl hover:bg-black/60 border border-white/10"
          >
            <ArrowLeft className="w-6 h-6" />
          </Button>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-8 md:p-16 z-10">
          <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row items-end justify-between gap-8">
            <div className="flex items-start gap-8">
              <motion.div 
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className={cn(
                  "w-32 h-32 md:w-40 md:h-40 rounded-[2.5rem] flex items-center justify-center border-4 backdrop-blur-2xl shadow-2xl",
                  TYPE_COLORS[extension.type ?? 'custom']
                )}
              >
                {extension.icon ? (
                    <img src={extension.icon} alt="" className="w-full h-full object-cover rounded-[2.5rem]" />
                ) : (
                    <Icon className="w-16 h-16 md:w-20 md:h-20" />
                )}
              </motion.div>
              
              <div className="space-y-3">
                <motion.div 
                  initial={{ x: -30, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  className="flex items-center gap-4 flex-wrap"
                >
                  <h1 className="text-4xl md:text-6xl font-black tracking-tighter leading-none">{extension.name}</h1>
                  {extension.categories?.includes('official') && (
                    <div className="px-3 py-1 rounded-full bg-primary/20 border border-primary/40 flex items-center gap-1.5 text-[10px] font-black uppercase text-primary">
                        <Package2 className="w-4 h-4" /> Official
                    </div>
                  )}
                  {extension.isApproved && (
                    <div className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center gap-1.5 text-[10px] font-black uppercase text-emerald-400">
                        <ShieldCheck className="w-4 h-4" /> Verified
                    </div>
                  )}
                </motion.div>
                
                <motion.div 
                  initial={{ x: -30, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="flex items-center gap-6 text-sm font-bold text-white/60"
                >
                  <span className="flex items-center gap-2"><Users className="w-5 h-5 text-primary" /> {extension.author}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-white/10" />
                  <span>Version {extension.version}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-white/10" />
                  <span className="flex items-center gap-2 text-primary bg-primary/10 px-3 py-1 rounded-full"><Star className="fill-primary w-4 h-4" /> {extension.rating || 'New'}</span>
                </motion.div>

                <div className="flex gap-2 pt-3 flex-wrap">
                  {extension.categories?.filter(cat => cat !== 'official' && cat !== 'sideloaded' && cat !== 'default' && cat !== 'streaming').map(cat => (
                    <span key={cat} className="px-4 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-[0.1em]">
                      {cat}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="flex flex-col items-center gap-3"
            >
              <Button 
                onClick={handleInstallToggle}
                disabled={isInstalling || !isNative}
                size="lg"
                className={cn(
                  "h-16 px-12 rounded-[1.5rem] font-black text-xl shadow-2xl transition-all duration-300",
                  installState === 'not_loaded'
                    ? "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                    : isInstalled
                    ? "bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive hover:text-white"
                    : "bg-primary text-primary-foreground hover:scale-105 active:scale-95 shadow-primary/20"
                )}
              >
                {isInstalling ? (
                  <Loader2 className="w-7 h-7 animate-spin" />
                ) : installState === 'not_loaded' ? (
                  <><AlertCircle className="w-6 h-6 mr-3" /> Installed (not loaded)</>
                ) : isInstalled ? (
                  <><X className="w-6 h-6 mr-3" /> Remove Module</>
                ) : (
                  <><Download className="w-6 h-6 mr-3" /> Install Now</>
                )}
              </Button>
              {!isNative && (
                <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[10px] font-black text-amber-500 uppercase tracking-widest">
                   <AlertCircle className="w-3.5 h-3.5" /> Desktop App Required
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </div>

      {/* Content Section */}
      <div className="max-w-[1400px] mx-auto px-8 md:px-16 mt-16 grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-16">
        
        {/* Main Content */}
        <div className="space-y-16">
          
          {/* Screenshot Carousel */}
          {extension.screenshots && extension.screenshots.length > 0 && (
            <section>
              <h2 className="text-2xl font-black mb-8 flex items-center gap-3">
                <Box className="w-6 h-6 text-primary" />
                Module Interface
              </h2>
              <div className="flex gap-6 overflow-x-auto pb-6 no-scrollbar snap-x snap-mandatory">
                {extension.screenshots.map((s, idx) => (
                  <motion.div 
                    key={idx}
                    whileHover={{ scale: 1.02 }}
                    className="flex-shrink-0 w-full md:w-[600px] aspect-video rounded-[2rem] overflow-hidden border border-white/5 shadow-2xl snap-center"
                  >
                    <img src={s} alt="" className="w-full h-full object-cover" />
                  </motion.div>
                ))}
              </div>
            </section>
          )}

          {/* Tabs & Details */}
          <section>
            <div className="flex gap-2 p-1.5 bg-white/5 rounded-2xl border border-white/10 mb-10 w-fit">
              {(['overview', 'changelog', 'reviews', 'source'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  className={cn(
                    "px-10 py-3 text-xs font-black uppercase tracking-[0.15em] transition-all rounded-xl",
                    activeTab === t ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                  )}
                >
                  {t === 'source' ? (
                    <span className="flex items-center gap-2"><Code2 className="w-3.5 h-3.5" /> Source</span>
                  ) : t}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="min-h-[300px]"
              >
                {activeTab === 'overview' && (
                  <div className="space-y-10">
                    <DescriptionRenderer text={extension.description || ''} />
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <GlassPanel className="p-8 border-white/5 bg-white/[0.02] rounded-[2rem]">
                        <h3 className="text-lg font-black mb-6 flex items-center gap-3">
                          <Shield className="w-5 h-5 text-primary" />
                          Security Permissions
                        </h3>
                        <div className="space-y-3">
                          {extension.permissions?.map(p => (
                            <div key={p} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5 font-mono text-xs text-white/70">
                              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                              {p}
                            </div>
                          ))}
                        </div>
                      </GlassPanel>

                      <GlassPanel className="p-8 border-white/5 bg-white/[0.02] rounded-[2rem]">
                        <h3 className="text-lg font-black mb-6 flex items-center gap-3">
                          <Layout className="w-5 h-5 text-secondary" />
                          Technical Specs
                        </h3>
                        <div className="space-y-5">
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground font-bold uppercase tracking-widest text-[10px]">Registry Type</span>
                            <span className="font-black text-primary uppercase">{extension.type}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground font-bold uppercase tracking-widest text-[10px]">Sync Date</span>
                            <span className="font-black text-white">{extension.updatedAt || 'Recently'}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground font-bold uppercase tracking-widest text-[10px]">Total Downloads</span>
                            <span className="font-black text-white">{(extension.downloads || 0).toLocaleString()}</span>
                          </div>
                        </div>
                      </GlassPanel>
                    </div>
                  </div>
                )}

                {activeTab === 'changelog' && (
                  <div className="space-y-8">
                    <div className="p-8 rounded-[2rem] bg-white/5 border border-white/5 space-y-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                           <span className="px-4 py-1.5 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest border border-primary/20">v{extension.version}</span>
                           <h4 className="font-black text-lg">Stable Release</h4>
                        </div>
                        <span className="text-xs text-muted-foreground font-bold">{extension.updatedAt || 'Recent'}</span>
                      </div>
                      <ul className="space-y-4">
                        <li className="flex items-start gap-4 text-muted-foreground font-medium">
                          <div className="w-6 h-6 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                             <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          </div>
                          Initial marketplace integration and automated source mapping.
                        </li>
                        <li className="flex items-start gap-4 text-muted-foreground font-medium">
                          <div className="w-6 h-6 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                             <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                          </div>
                          Optimized resolution engine for faster loading of 1080p content.
                        </li>
                      </ul>
                    </div>
                  </div>
                )}

                {activeTab === 'reviews' && (
                  <div className="flex flex-col items-center justify-center py-20 text-center space-y-6 border-2 border-dashed border-white/5 rounded-[2rem]">
                    <div className="w-20 h-20 rounded-3xl bg-white/5 flex items-center justify-center text-muted-foreground/20">
                       <MessageSquare className="w-10 h-10" />
                    </div>
                    <div>
                       <h3 className="text-xl font-black">Community Insights</h3>
                       <p className="text-muted-foreground max-w-sm mx-auto font-medium">Be the first to rate and review this extension for the Tatakai community!</p>
                    </div>
                    <Button variant="outline" className="rounded-xl border-primary/20 text-primary">Write a Review</Button>
                  </div>
                )}

                {activeTab === 'source' && extensionId && (
                  <SourceCodeTab extensionId={extensionId} />
                )}
              </motion.div>            </AnimatePresence>
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-8">
          <GlassPanel className="p-8 border-white/10 bg-white/[0.03] rounded-[2.5rem] shadow-2xl">
            <h3 className="font-black text-lg mb-8 flex items-center gap-3">
              <Users className="w-5 h-5 text-primary" />
              Developer
            </h3>
            <div className="flex items-center gap-5 mb-10">
              <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center font-black text-2xl text-white shadow-xl shadow-primary/20">
                {extension.author[0]}
              </div>
              <div>
                <p className="font-black text-xl tracking-tight">{extension.author}</p>
                <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mt-1">Verified Publisher</p>
              </div>
            </div>
            <div className="space-y-3">
              <Button variant="outline" className="w-full h-14 justify-start gap-4 rounded-2xl bg-white/5 border-white/10 hover:bg-primary hover:text-white transition-all font-bold">
                <Github className="w-5 h-5" />
                Inspect Repository
              </Button>
              <Button variant="outline" className="w-full h-14 justify-start gap-4 rounded-2xl bg-white/5 border-white/10 hover:bg-secondary hover:text-white transition-all font-bold">
                <Globe className="w-5 h-5" />
                Publisher Portfolio
              </Button>
            </div>
          </GlassPanel>

          <div className="p-8 rounded-[2.5rem] bg-primary/10 border border-primary/20 space-y-4 shadow-xl">
            <h3 className="font-black text-lg flex items-center gap-3">
              <ShieldCheck className="w-6 h-6 text-primary" />
              Runtime Security
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed font-medium opacity-90">
              This module has been audited by the Tatakai team. It operates within a restricted memory space and cannot access your local filesystem or sensitive credentials.
            </p>
          </div>

          <div className="p-8 rounded-[2.5rem] bg-white/5 border border-white/10 space-y-6">
             <h4 className="font-black uppercase tracking-widest text-xs text-muted-foreground">About .kai format</h4>
             <p className="text-xs text-muted-foreground/60 leading-relaxed font-medium">
                Tatakai extensions use the open <code className="text-primary font-bold">.kai</code> format. This combines a secure JSON manifest with a sandboxed JavaScript bundle.
             </p>
             <Button variant="link" className="p-0 text-primary font-bold text-xs">Learn about development &rarr;</Button>
          </div>
        </div>

      </div>

      {isDebugOpen && (
        <ExtensionDebugWindow onClose={() => setIsDebugOpen(false)} />
      )}
    </div>
  );
}
