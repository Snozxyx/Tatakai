import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, X, Zap, Clock, ExternalLink, Trash2, Loader2 } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useIsDesktopApp } from '@/hooks/ui/useIsNativeApp';
import { getLocalTorrentSessionHistory, removeLocalTorrentSessionHistory, clearLocalTorrentSessionHistory, LocalTorrentSessionItem } from '@/lib/localStorage';

export function TorrentSessionBanner() {
  const navigate = useNavigate();
  const isDesktop = useIsDesktopApp();
  const [sessions, setSessions] = useState<LocalTorrentSessionItem[]>([]);
  const [activeSessions, setActiveSessions] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  const loadSessions = async () => {
    if (!isDesktop) {
      setLoading(false);
      return;
    }

    try {
      // Load history from existing system
      const history = getLocalTorrentSessionHistory();
      setSessions(history);

      // Check for active sessions in the desktop runtime
      if ((window as any).tatakaiRuntime?.getTorrentStats) {
          const statsMap: Record<string, any> = {};
          for (const s of history) {
            try {
                const stats = await (window as any).tatakaiRuntime.getTorrentStats(s.sessionId);
                if (stats && stats.success !== false) {
                    statsMap[s.sessionId] = stats;
                }
            } catch (e) {
                // Ignore errors
            }
          }
          setActiveSessions(statsMap);
      }
    } catch (e) {
      console.error('Failed to load torrent sessions:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
    const interval = setInterval(loadSessions, 10000);
    return () => clearInterval(interval);
  }, [isDesktop]);

  const removeSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    removeLocalTorrentSessionHistory(id);
    setSessions(prev => prev.filter(s => s.sessionId !== id));
    
    if (activeSessions[id]) {
        (window as any).tatakaiRuntime?.stopTorrentSession?.(id);
        const newActive = { ...activeSessions };
        delete newActive[id];
        setActiveSessions(newActive);
    }
  };

  const clearAll = async () => {
    if (window.confirm('Are you sure you want to stop all active torrents and clear history?')) {
        clearLocalTorrentSessionHistory();
        setSessions([]);
        setActiveSessions({});
        if ((window as any).tatakaiRuntime?.clearAllTorrentData) {
            await (window as any).tatakaiRuntime.clearAllTorrentData();
            toast.success('All torrent data cleared');
        }
    }
  };

  if (!isDesktop || (sessions.length === 0 && Object.keys(activeSessions).length === 0)) {
    return null;
  }

  return (
    <div className="mb-12">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-black flex items-center gap-3 tracking-tight">
          <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          Active Torrent Sessions
        </h2>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={clearAll}
          className="text-muted-foreground hover:text-destructive font-bold flex items-center gap-2"
        >
          <Trash2 className="w-4 h-4" />
          Clear All
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sessions.map((session) => {
          const stats = activeSessions[session.sessionId];
          const isActive = !!stats;

          return (
            <GlassPanel
              key={session.sessionId}
              onClick={() => navigate(`/watch/${session.animeId || 'torrent-' + session.sessionId}?sessionId=${session.sessionId}&torrent=true`)}
              className={cn(
                "group relative overflow-hidden border-white/5 hover:border-primary/40 cursor-pointer transition-all duration-300 p-4",
                isActive ? "bg-primary/5" : "opacity-60 grayscale hover:grayscale-0"
              )}
            >
              <div className="flex gap-4">
                <div className="relative w-16 h-24 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
                  {session.animePoster ? (
                    <img src={session.animePoster} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Zap className="w-6 h-6 text-muted-foreground/20" />
                    </div>
                  )}
                  {isActive && (
                    <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-sm truncate group-hover:text-primary transition-colors">
                    {session.animeName || session.torrentName || 'Unknown Torrent'}
                  </h3>
                  <div className="mt-2 space-y-1">
                    {isActive ? (
                      <>
                        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-primary">
                          <span>Progress {stats.progress}%</span>
                          <span>{stats.downloadSpeed ? (stats.downloadSpeed / 1024 / 1024).toFixed(1) + ' MB/s' : '0 KB/s'}</span>
                        </div>
                        <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mt-1">
                          <div 
                            className="h-full bg-primary transition-all duration-500" 
                            style={{ width: `${stats.progress}%` }}
                          />
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[9px] text-muted-foreground font-medium">
                          <Clock className="w-3 h-3" />
                          <span>Started {new Date(session.startedAt).toLocaleDateString()}</span>
                        </div>
                      </>
                    ) : (
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">
                        Session Inactive • Click to Resume
                      </p>
                    )}
                  </div>
                </div>

                <button
                  onClick={(e) => removeSession(e, session.sessionId)}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/40 text-white/40 hover:text-destructive hover:bg-destructive/10 transition-all opacity-0 group-hover:opacity-100"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </GlassPanel>
          );
        })}
      </div>
    </div>
  );
}
