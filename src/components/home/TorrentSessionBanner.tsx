/**
 * The desktop-only "active torrent sessions" row on the home page.
 *
 * The card is `ResumeCard`, shared with the manga continue-reading row: same
 * poster size, paddings, progress bar and remove affordance. Only the wiring is
 * local — the 10 s stats poll against `tatakaiRuntime.getTorrentStats`, the
 * per-session stop, and the clear-all confirmation.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Clock, 
  Trash2, 
  Zap, 
  Activity, 
  PauseCircle, 
  ArrowRight,
  HardDriveDownload
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import { SectionHeading } from '@/components/anime/discover/SectionHeading';
import { RESUME_GRID_CLASS, ResumeCard } from '@/components/shared/ResumeCard';
import { useIsDesktopApp } from '@/hooks/ui/useIsNativeApp';
import {
  getLocalTorrentSessionHistory,
  removeLocalTorrentSessionHistory,
  clearLocalTorrentSessionHistory,
  type LocalTorrentSessionItem,
} from '@/lib/localStorage';

/** `0 KB/s` while a session is spinning up, MB/s once it is actually moving. */
function formatSpeed(bytesPerSecond?: number): string {
  const value = Number(bytesPerSecond || 0);
  if (!Number.isFinite(value) || value <= 0) return '0 KB/s';
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB/s`;
  return `${(value / 1024 / 1024).toFixed(1)} MB/s`;
}

export function TorrentSessionBanner() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const isDesktop = useIsDesktopApp();
  const [sessions, setSessions] = useState<LocalTorrentSessionItem[]>([]);
  const [activeSessions, setActiveSessions] = useState<Record<string, any>>({});

  const loadSessions = useCallback(async () => {
    if (!isDesktop) return;

    try {
      const history = getLocalTorrentSessionHistory();
      setSessions(history);

      if ((window as any).tatakaiRuntime?.getTorrentStats) {
        const statsMap: Record<string, any> = {};
        for (const item of history) {
          try {
            const stats = await (window as any).tatakaiRuntime.getTorrentStats(item.sessionId);
            if (stats && stats.success !== false) {
              statsMap[item.sessionId] = stats;
            }
          } catch {
            // A session the runtime has already dropped simply stays inactive.
          }
        }
        setActiveSessions(statsMap);
      }
    } catch (error) {
      console.error('Failed to load torrent sessions:', error);
    }
  }, [isDesktop]);

  useEffect(() => {
    loadSessions();
    const interval = setInterval(loadSessions, 10000);
    return () => clearInterval(interval);
  }, [loadSessions]);

  const removeSession = (id: string) => {
    removeLocalTorrentSessionHistory(id);
    setSessions((prev) => prev.filter((item) => item.sessionId !== id));

    if (activeSessions[id]) {
      (window as any).tatakaiRuntime?.stopTorrentSession?.(id);
      setActiveSessions((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const clearAll = async () => {
    if (!(await confirm({ title: 'Stop all active torrents and clear the session history?', destructive: true }))) return;
    clearLocalTorrentSessionHistory();
    setSessions([]);
    setActiveSessions({});
    if ((window as any).tatakaiRuntime?.clearAllTorrentData) {
      await (window as any).tatakaiRuntime.clearAllTorrentData();
      toast.success('All torrent data cleared');
    }
  };

  if (!isDesktop || (sessions.length === 0 && Object.keys(activeSessions).length === 0)) {
    return null;
  }

  const activeCount = Object.keys(activeSessions).length;

  return (
    <section className="mb-12 space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <SectionHeading
        eyebrow="Downloads"
        title="Torrent Sessions"
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAll}
            className="group gap-2 rounded-full text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5 transition-transform group-hover:scale-110" />
            Clear all
            {activeCount > 0 && (
              <span className="ml-1 inline-flex items-center rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-bold text-destructive">
                {activeCount} live
              </span>
            )}
          </Button>
        }
      />

      <div className={RESUME_GRID_CLASS}>
        {sessions.map((session) => {
          const stats = activeSessions[session.sessionId];
          const isActive = Boolean(stats);
          const title = session.animeName || session.torrentName || 'Unknown torrent';
          const href = `/watch/${
            session.animeId || `torrent-${session.sessionId}`
          }?sessionId=${session.sessionId}&torrent=true`;

          return (
            <ResumeCard
              key={session.sessionId}
              onClick={() => navigate(href)}
              poster={session.animePoster || undefined}
              title={title}
              primaryMeta={
                isActive ? (
                  <span className="flex items-center gap-1.5 font-medium text-emerald-400">
                    <Activity className="h-3 w-3 animate-pulse" />
                    Downloading
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-white/50">
                    <PauseCircle className="h-3 w-3" />
                    Session paused
                  </span>
                )
              }
              secondaryMeta={
                <span className="inline-flex items-center gap-1.5 text-white/40">
                  <Clock className="h-3 w-3" />
                  {new Date(session.startedAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric'
                  })}
                </span>
              }
              progress={isActive ? Number(stats.progress) : undefined}
              progressNote={
                isActive ? (
                  <span className="flex items-center gap-1 text-[11px] tabular-nums font-medium text-white/70">
                    <HardDriveDownload className="h-3 w-3" />
                    {formatSpeed(stats.downloadSpeed)}
                  </span>
                ) : undefined
              }
              footer={
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/40 transition-colors group-hover:text-white/70">
                  {isActive ? 'Open Player' : 'Resume Session'}
                  <ArrowRight className="h-3 w-3" />
                </div>
              }
              busy={isActive}
              dimmed={!isActive}
              fallbackIcon={Zap}
              onRemove={() => removeSession(session.sessionId)}
              removeLabel={`Remove ${title}`}
            />
          );
        })}
      </div>
    </section>
  );
}