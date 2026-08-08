import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, Upload, Puzzle, Zap, Globe, Sparkles, 
  CheckCircle2, Download, Shield, Code2, X, ArrowRight,
  Package, AlertTriangle, Lock, Star, ChevronRight, Layout,
  Clock, History, Plus, TrendingUp, LogIn, FolderUp, Package2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useIsNativeApp } from '@/hooks/ui/useIsNativeApp';
import { Background } from '@/components/layout/Background';
import { useExtensions } from '@/hooks/api/useExtensions';
import { PublishExtensionModal } from '@/components/extensions/PublishExtensionModal';
import { SideloadExtensionModal } from '@/components/extensions/SideloadExtensionModal';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { useAuth } from '@/contexts/AuthContext';

export interface ExtensionManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  icon?: string;
  banner?: string;
  screenshots?: string[];
  categories: string[];
  permissions: string[];
  isApproved: boolean;
  downloads?: number;
  rating?: number;
  updatedAt?: string;
  type?: 'torrent' | 'onlinestream' | 'custom';
  status?: 'pending' | 'approved' | 'rejected';
  user_id?: string;
}

const TYPE_COLORS: Record<string, string> = {
  torrent: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  onlinestream: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  custom: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
};

const TYPE_ICONS: Record<string, any> = {
  torrent: Zap,
  onlinestream: Globe,
  custom: Puzzle,
};

/* ─── Spotlight Component ─────────────────────────────────────────────────── */
function Spotlight({ extensions }: { extensions: ExtensionManifest[] }) {
  const navigate = useNavigate();
  if (extensions.length === 0) return null;

  return (
    <div className="relative group">
      <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar snap-x snap-mandatory">
        {extensions.slice(0, 3).map((ext, idx) => (
          <motion.div 
            key={ext.id || idx}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.1 }}
            onClick={() => navigate(`/extensions/${ext.id}`)}
            className="flex-shrink-0 w-full md:w-[600px] h-[350px] rounded-[2.5rem] overflow-hidden relative cursor-pointer snap-center border border-white/10 group/item shadow-2xl"
          >
            <img src={ext.banner} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover/item:scale-110" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
            <div className="absolute bottom-0 left-0 p-8 space-y-3">
              <div className="flex items-center gap-3">
                <span className={cn("px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border", TYPE_COLORS[ext.type ?? 'custom'])}>
                  Featured Module
                </span>
                <span className="flex items-center gap-1.5 text-[10px] font-black text-primary bg-primary/10 px-2 py-1 rounded-full border border-primary/20">
                  <Star className="w-3 h-3 fill-primary" /> {ext.rating || 'New'}
                </span>
              </div>
              <h3 className="text-3xl md:text-4xl font-black text-white tracking-tighter">{ext.name}</h3>
              <p className="text-sm text-gray-300 line-clamp-2 max-w-md leading-relaxed">{ext.description}</p>
              
              <div className="pt-2 flex items-center gap-4 text-xs text-white/50">
                 <span className="flex items-center gap-1.5"><Download className="w-3.5 h-3.5" /> {(ext.downloads || 0).toLocaleString()} installs</span>
                 <span className="w-1 h-1 rounded-full bg-white/20" />
                 <span>By {ext.author}</span>
              </div>
            </div>
            <div className="absolute top-8 right-8">
              <div className="w-14 h-14 rounded-2xl bg-black/40 backdrop-blur-2xl border border-white/10 flex items-center justify-center group-hover/item:bg-primary transition-colors duration-300">
                <ArrowRight className="w-6 h-6 text-white" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ─── Category Grid ───────────────────────────────────────────────────────── */
function CategoryGrid({ title, extensions, icon: Icon }: { title: string, extensions: ExtensionManifest[], icon: any }) {
  const navigate = useNavigate();
  if (extensions.length === 0) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black flex items-center gap-3 tracking-tight">
          <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          {title}
        </h2>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary font-bold">
          See everything <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {extensions.map((ext, idx) => {
          const ExtIcon = TYPE_ICONS[ext.type ?? 'custom'];
          return (
            <motion.div 
              key={ext.id || idx}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              onClick={() => navigate(`/extensions/${ext.id}`)}
              className="group cursor-pointer rounded-3xl border border-white/5 bg-card/20 hover:bg-card/40 transition-all duration-300 hover:border-primary/40 p-5 shadow-lg hover:shadow-primary/5"
            >
              <div className="relative aspect-[16/10] rounded-2xl overflow-hidden mb-5 border border-white/5 shadow-inner">
                <img src={ext.banner} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                <div className="absolute top-3 left-3">
                   <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center border backdrop-blur-xl shadow-lg", TYPE_COLORS[ext.type ?? 'custom'])}>
                      <ExtIcon className="w-5 h-5" />
                   </div>
                </div>
                <div className="absolute bottom-3 left-3 right-3 flex justify-between items-center">
                   <span className="text-[10px] font-black uppercase text-white/90 bg-black/40 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10">v{ext.version}</span>
                   <div className="flex items-center gap-1.5">
                      {ext.categories?.includes('default') && (
                        <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider bg-primary/80 text-white px-2 py-0.5 rounded-lg backdrop-blur-sm">
                          <Package2 className="w-2.5 h-2.5" /> Built-in
                        </span>
                      )}
                      {ext.categories?.includes('sideloaded') && !ext.categories?.includes('default') && (
                        <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider bg-violet-500/80 text-white px-2 py-0.5 rounded-lg backdrop-blur-sm">
                          <FolderUp className="w-2.5 h-2.5" /> Sideloaded
                        </span>
                      )}
                      {ext.isApproved && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                    </div>
                </div>
              </div>
              <div className="space-y-2">
                <h4 className="font-bold text-base group-hover:text-primary transition-colors flex items-center justify-between">
                  {ext.name}
                </h4>
                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed opacity-70 group-hover:opacity-100 transition-opacity">
                  {ext.description}
                </p>
                <div className="pt-2 flex items-center justify-between border-t border-white/5">
                   <span className="text-[10px] font-bold text-muted-foreground">By {ext.author}</span>
                   <div className="flex items-center gap-1.5 text-[10px] font-bold text-primary">
                      <Download className="w-3 h-3" />
                      {(ext.downloads ?? 0).toLocaleString()}
                   </div>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  );
}

/* ─── Main Page ───────────────────────────────────────────────────────────── */
// Built-in showcase extensions displayed when the registry is empty


export default function ExtensionHubPage() {
  const { extensions, isLoading, mySubmissions } = useExtensions();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isNative = useIsNativeApp();
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'torrent' | 'onlinestream' | 'custom'>('all');
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [isSideloadModalOpen, setIsSideloadModalOpen] = useState(false);

  // Use real extensions from hook
  const allExtensions = extensions;

  const filtered = useMemo(() => {
    let list = allExtensions;
    if (query) list = list.filter((e) => `${e.name} ${e.description} ${e.author} ${e.categories.join(' ')}`.toLowerCase().includes(query.toLowerCase()));
    if (typeFilter !== 'all') list = list.filter((e) => e.type === typeFilter);
    return list;
  }, [allExtensions, query, typeFilter]);

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <Background />
      
      <div className="max-w-[1400px] mx-auto px-6 py-10 space-y-16">
        
        {/* Modern Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
          <div className="space-y-3 relative z-10">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-3 text-primary text-xs font-black uppercase tracking-[0.2em] bg-primary/10 w-fit px-4 py-2 rounded-full border border-primary/20"
            >
              <Sparkles className="w-4 h-4 animate-pulse" />
              Tatakai Ecosystem
            </motion.div>
            <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-none">
              The <span className="text-primary italic">Extensions</span> Hub
            </h1>
            <p className="text-muted-foreground max-w-xl text-lg md:text-xl leading-relaxed font-medium">
              Expand your horizons with community-driven sources, themes, and powerful automation modules.
            </p>
          </div>

          {/* Background Spotlight Image */}
          <div className="absolute top-0 left-0 w-full h-[500px] overflow-hidden opacity-40 pointer-events-none">
             <img 
               src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop" 
               className="w-full h-full object-cover blur-sm"
               alt=""
             />
             <div className="absolute inset-0 bg-gradient-to-b from-background/0 via-background/60 to-background" />
          </div>
          
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              variant="outline"
              onClick={() => setIsSideloadModalOpen(true)}
              className="h-14 px-8 rounded-2xl bg-primary/10 border-primary/30 text-primary hover:bg-primary/20 hover:border-primary/60 transition-all font-bold text-base shadow-lg shadow-primary/10"
            >
              <FolderUp className="w-5 h-5 mr-2" />
              Sideload Extension
            </Button>
            {user ? (
              <Button 
                variant="outline" 
                onClick={() => setIsSubmitModalOpen(true)}
                className="h-14 px-8 rounded-2xl bg-white/5 border-white/10 hover:bg-white/10 hover:border-primary/50 transition-all font-bold text-base"
              >
                <Plus className="w-5 h-5 mr-3 text-primary" />
                Publish Extension
              </Button>
            ) : (
              <Button 
                variant="outline" 
                onClick={() => navigate('/auth')}
                className="h-14 px-8 rounded-2xl bg-white/5 border-white/10 hover:bg-white/10 hover:border-primary/50 transition-all font-bold text-base"
                title="Sign in to publish an extension"
              >
                <LogIn className="w-5 h-5 mr-3 text-primary" />
                Sign In to Publish
              </Button>
            )}
          </div>
        </div>

        {/* My Submissions Banner */}
        {mySubmissions.some(s => s.status === 'pending') && (
           <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-6 rounded-3xl bg-blue-500/10 border border-blue-500/20 flex flex-col md:flex-row items-center justify-between gap-6"
           >
              <div className="flex items-center gap-4">
                 <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center text-blue-400">
                    <Clock className="w-6 h-6" />
                 </div>
                 <div>
                    <h4 className="font-bold">Submissions Under Review</h4>
                    <p className="text-sm text-muted-foreground">You have {mySubmissions.filter(s => s.status === 'pending').length} extension(s) waiting for moderator approval.</p>
                 </div>
              </div>
              <Button variant="outline" className="rounded-xl border-blue-500/30 text-blue-400 hover:bg-blue-500/10">View My Submissions</Button>
           </motion.div>
        )}

        {/* Desktop Check */}
        {!isNative && (
          <div className="p-5 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-5 shadow-lg">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-500">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <p className="font-black text-sm uppercase tracking-widest">Web Version Limitation</p>
              <p className="text-xs text-muted-foreground font-medium">Extension execution requires the Tatakai Desktop sandbox. Use the desktop app to install and run modules.</p>
            </div>
          </div>
        )}

        {/* Discovery Tools */}
        <div className="flex flex-col md:flex-row gap-6">
           <div className="relative flex-1 group">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-muted-foreground transition-colors group-focus-within:text-primary" />
              <Input 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, author, or keyword..." 
                className="h-16 pl-14 bg-white/5 border-white/10 rounded-[1.5rem] text-xl focus:ring-4 focus:ring-primary/10 transition-all font-medium"
              />
           </div>
           <div className="flex gap-2 p-1.5 bg-white/5 rounded-[1.5rem] border border-white/10 backdrop-blur-xl">
              {(['all', 'torrent', 'onlinestream', 'custom'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={cn(
                    "px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300",
                    typeFilter === t ? "bg-primary text-primary-foreground shadow-xl shadow-primary/20" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                  )}
                >
                  {t}
                </button>
              ))}
           </div>
        </div>

        {/* Spotlight Section */}
        {!query && typeFilter === 'all' && allExtensions.length > 0 && (
          <Spotlight extensions={allExtensions} />
        )}

        {/* Categories / Grid */}
        {isLoading ? (
           <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-muted-foreground font-black uppercase tracking-widest animate-pulse">Syncing with Registry...</p>
           </div>
        ) : allExtensions.length > 0 ? (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_350px] gap-16">
            <div className="space-y-24">

              {/* Official Extensions — premium row */}
              {(() => {
                const officialList = filtered.filter(e => e.categories?.includes('official'));
                if (officialList.length === 0) return null;
                return (
                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
                        <Package2 className="w-5 h-5 text-primary" />
                      </div>
                      <h2 className="text-2xl font-black tracking-tight">Official Extensions</h2>
                      <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary">
                        By Tatakai
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {officialList.map((ext, idx) => {
                        const ExtIcon = TYPE_ICONS[ext.type ?? 'custom'];
                        return (
                          <motion.div
                            key={ext.id || idx}
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            onClick={() => navigate(`/extensions/${ext.id}`)}
                            className="group cursor-pointer rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/5 via-card/20 to-card/10 hover:from-primary/10 hover:border-primary/40 transition-all duration-300 p-5 shadow-lg hover:shadow-primary/10"
                          >
                            <div className="relative aspect-[16/7] rounded-2xl overflow-hidden mb-5 border border-primary/10 shadow-inner">
                              <img src={ext.banner} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                              <div className="absolute top-3 left-3 flex items-center gap-2">
                                <div className="w-10 h-10 rounded-xl overflow-hidden border border-white/20 shadow-lg">
                                  {ext.icon
                                    ? <img src={ext.icon} alt="" className="w-full h-full object-cover" />
                                    : <div className={cn("w-full h-full flex items-center justify-center", TYPE_COLORS[ext.type ?? 'custom'])}><ExtIcon className="w-5 h-5" /></div>
                                  }
                                </div>
                                <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider bg-primary/80 text-white px-2 py-0.5 rounded-lg backdrop-blur-sm">
                                  <Package2 className="w-2.5 h-2.5" /> Official
                                </span>
                              </div>
                              <div className="absolute bottom-3 left-3 right-3 flex justify-between items-center">
                                <span className="text-[10px] font-black uppercase text-white/90 bg-black/40 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10">v{ext.version}</span>
                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <h4 className="font-bold text-base group-hover:text-primary transition-colors">{ext.name}</h4>
                              <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed opacity-70 group-hover:opacity-100 transition-opacity">
                                Anime streaming · Torrent · Manga — all in one official extension
                              </p>
                              <div className="pt-2 flex items-center justify-between border-t border-white/5">
                                <span className="text-[10px] font-bold text-muted-foreground">By {ext.author}</span>
                                <div className="flex gap-1.5 flex-wrap">
                                  {ext.categories?.filter(c => !['official','streaming','sideloaded','default'].includes(c)).slice(0,3).map(cat => (
                                    <span key={cat} className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg bg-white/5 border border-white/10">{cat}</span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              <CategoryGrid 
                  title="Streaming Sources" 
                  extensions={filtered.filter(e => e.type === 'onlinestream')} 
                  icon={Globe}
              />
              
              <CategoryGrid 
                  title="Torrent Discovery" 
                  extensions={filtered.filter(e => e.type === 'torrent')} 
                  icon={Zap}
              />

              <CategoryGrid 
                  title="Custom Utilities" 
                  extensions={filtered.filter(e => e.type === 'custom' && !e.categories?.includes('official'))} 
                  icon={Puzzle}
              />
            </div>

            {/* Sidebar Stats & Activity */}
            <div className="space-y-10">
               <GlassPanel className="p-8 border-white/5 bg-primary/5 rounded-[2.5rem] relative overflow-hidden group">
                  <div className="absolute top-[-20%] right-[-20%] w-40 h-40 bg-primary/20 rounded-full blur-3xl group-hover:bg-primary/30 transition-colors" />
                  <h3 className="text-xl font-black mb-6 flex items-center gap-2">
                     <TrendingUp className="w-5 h-5 text-primary" />
                     Trending Now
                  </h3>
                  <div className="space-y-6">
                     {extensions.slice(0, 4).map((ext, idx) => (
                        <div key={ext.id || idx} className="flex items-center gap-4 group/item cursor-pointer" onClick={() => navigate(`/extensions/${ext.id}`)}>
                           <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center font-black text-white/20 group-hover/item:text-primary transition-colors">
                              {idx + 1}
                           </div>
                           <div className="flex-1 min-w-0">
                              <p className="font-bold text-sm truncate group-hover/item:text-primary transition-colors">{ext.name}</p>
                              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">{ext.type}</p>
                           </div>
                        </div>
                     ))}
                  </div>
               </GlassPanel>

               <GlassPanel className="p-8 border-white/5 bg-white/[0.02] rounded-[2.5rem]">
                  <h3 className="text-xl font-black mb-6 flex items-center gap-2">
                     <History className="w-5 h-5 text-secondary" />
                     Recent Activity
                  </h3>
                  <div className="space-y-6">
                     {[
                        { user: 'Sora', action: 'published', item: 'Nyaa+ v2', time: '2m ago' },
                        { user: 'Kuro', action: 'updated', item: 'Animelok', time: '14m ago' },
                        { user: 'Admin', action: 'verified', item: 'ToonWorld', time: '1h ago' }
                     ].map((activity, idx) => (
                        <div key={idx} className="flex gap-4">
                           <div className="w-10 h-10 rounded-full bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center font-bold text-[10px]">
                              {activity.user[0]}
                           </div>
                           <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold truncate">
                                 <span className="text-primary">{activity.user}</span> {activity.action} <span className="text-white">{activity.item}</span>
                              </p>
                              <p className="text-[10px] text-muted-foreground mt-1 font-bold">{activity.time}</p>
                           </div>
                        </div>
                     ))}
                  </div>
               </GlassPanel>

               <div className="p-8 rounded-[2.5rem] bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-white/5 space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-indigo-400">
                     <Shield className="w-6 h-6" />
                  </div>
                  <h4 className="font-black text-lg">Verified Safety</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                     Every module in the staff picks section has undergone manual source code inspection for your security.
                  </p>
                  <Button variant="link" className="p-0 h-auto text-indigo-400 text-xs font-bold">Read security whitepaper &rarr;</Button>
               </div>
            </div>
          </div>
        ) : (
           <div className="flex flex-col items-center justify-center py-24 text-center space-y-6">
              <div className="w-24 h-24 rounded-[2rem] bg-white/5 flex items-center justify-center text-muted-foreground/20 border-2 border-dashed border-white/10">
                 <Package className="w-12 h-12" />
              </div>
              <div className="space-y-2">
                 <h3 className="text-2xl font-black">No extensions found</h3>
                 <p className="text-muted-foreground max-w-sm">The registry is empty or your search returned no results. Try another query or check back later.</p>
              </div>
              <Button variant="outline" className="rounded-xl border-primary/20 text-primary" onClick={() => setQuery('')}>Clear Search</Button>
           </div>
        )}

        {/* Developer CTA */}
        <div className="relative rounded-[3rem] overflow-hidden border border-primary/20 bg-primary/5 p-16 md:p-24 text-center space-y-6 shadow-2xl">
           <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-30">
              <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-primary rounded-full blur-[150px] animate-pulse" />
              <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-secondary rounded-full blur-[150px] animate-pulse" />
           </div>
           <div className="relative space-y-6">
              <div className="w-20 h-20 rounded-3xl bg-primary/20 border border-primary/30 flex items-center justify-center mx-auto">
                 <Code2 className="w-10 h-10 text-primary" />
              </div>
              <h2 className="text-4xl md:text-6xl font-black tracking-tighter">Become a <span className="text-primary italic">Creator</span></h2>
              <p className="text-muted-foreground max-w-3xl mx-auto text-lg md:text-xl leading-relaxed font-medium">
                Tatakai extensions are built with standard TypeScript/JavaScript and run in a secure sandbox.
                Publish your own source, theme, or tool to thousands of users.
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4 pt-6">
                  <Button 
                    className="h-16 px-10 rounded-2xl font-black text-lg bg-primary hover:scale-105 transition-transform shadow-xl shadow-primary/20"
                    onClick={() => setIsSubmitModalOpen(true)}
                  >
                    Publish your SDK
                  </Button>
                  <Button variant="outline" className="h-16 px-10 rounded-2xl font-black text-lg border-white/10 backdrop-blur-md hover:bg-white/5 transition-all">
                    Developer Docs
                  </Button>
              </div>
           </div>
        </div>

        {/* Security Info */}
        <div className="grid md:grid-cols-3 gap-8">
           {[
             { icon: Shield, title: 'Sandboxed Runtime', desc: 'Every extension runs in an isolated Web Worker without access to your files or personal data.' },
             { icon: Lock, title: 'Cryptographic Signing', desc: 'Official marketplace extensions are verified using Ed25519 signatures to ensure code integrity.' },
             { icon: History, title: 'Version Control', desc: 'Roll back to previous versions or track updates directly through the unified versioning system.' }
           ].map((item, idx) => (
             <GlassPanel key={idx} className="p-8 space-y-4 border-white/5 hover:border-primary/20 transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <item.icon className="w-6 h-6" />
                </div>
                <h4 className="font-black text-lg tracking-tight">{item.title}</h4>
                <p className="text-sm text-muted-foreground leading-relaxed font-medium opacity-80">{item.desc}</p>
             </GlassPanel>
           ))}
        </div>

        <PublishExtensionModal 
          isOpen={isSubmitModalOpen} 
          onClose={() => setIsSubmitModalOpen(false)} 
        />
        <SideloadExtensionModal
          isOpen={isSideloadModalOpen}
          onClose={() => setIsSideloadModalOpen(false)}
        />
      </div>
    </div>
  );
}
