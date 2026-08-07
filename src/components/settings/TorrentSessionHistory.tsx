import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { History, Play, Trash2, CircleDot, CircleCheck, Ban, AlertTriangle, ExternalLink } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import {
  clearLocalTorrentSessionHistory,
  getLocalTorrentSessionHistory,
  LocalTorrentSessionItem,
  removeLocalTorrentSessionHistory,
} from '@/lib/localStorage';
import { cn } from '@/lib/utils';

const STATUS_META: Record<LocalTorrentSessionItem['status'], { label: string; className: string; icon: any }> = {
  active: { label: 'Active', className: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20', icon: CircleDot },
  completed: { label: 'Completed', className: 'bg-primary/10 text-primary border-primary/20', icon: CircleCheck },
  blocked: { label: 'Blocked', className: 'bg-red-500/10 text-red-300 border-red-500/20', icon: Ban },
  error: { label: 'Error', className: 'bg-amber-500/10 text-amber-300 border-amber-500/20', icon: AlertTriangle },
  stopped: { label: 'Stopped', className: 'bg-white/10 text-muted-foreground border-white/10', icon: CircleDot },
};

const formatDateTime = (value: string) => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
};

export function TorrentSessionHistory() {
  const navigate = useNavigate();
  const [items, setItems] = useState<LocalTorrentSessionItem[]>([]);

  const refresh = () => {
    setItems(getLocalTorrentSessionHistory());
  };

  useEffect(() => {
    refresh();

    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'tatakai_torrent_session_history_v1') {
        refresh();
      }
    };

    const handleHistoryChanged = () => refresh();

    window.addEventListener('storage', handleStorage);
    window.addEventListener('tatakai-torrent-history-changed', handleHistoryChanged);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('tatakai-torrent-history-changed', handleHistoryChanged);
    };
  }, []);

  const visibleItems = useMemo(() => items.slice(0, 8), [items]);

  const handleResume = (item: LocalTorrentSessionItem) => {
    if (item.status !== 'active') return;
    navigate(`/watch/torrent-${item.sessionId}?torrent=true&sessionId=${item.sessionId}`);
  };

  const handleRemove = (sessionId: string) => {
    removeLocalTorrentSessionHistory(sessionId);
    refresh();
  };

  const handleClearAll = () => {
    clearLocalTorrentSessionHistory();
    refresh();
  };

  if (!visibleItems.length) {
    return (
      <GlassPanel className="p-5 border-white/5 bg-white/[0.03]">
        <div className="flex items-center gap-3 mb-3">
          <History className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-bold">Torrent Session History</h3>
        </div>
        <p className="text-sm text-muted-foreground">No torrent sessions recorded yet.</p>
      </GlassPanel>
    );
  }

  return (
    <GlassPanel className="p-5 border-white/5 bg-white/[0.03] space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <History className="w-5 h-5 text-primary" />
          <div>
            <h3 className="text-lg font-bold">Torrent Session History</h3>
            <p className="text-xs text-muted-foreground">Recent imports, playback states, and blocked sessions</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={handleClearAll} className="gap-2 text-muted-foreground hover:text-foreground">
          <Trash2 className="w-4 h-4" />
          Clear all
        </Button>
      </div>

      <div className="space-y-3">
        {visibleItems.map((item) => {
          const meta = STATUS_META[item.status] || STATUS_META.stopped;
          const Icon = meta.icon;
          const canResume = item.status === 'active';

          return (
            <div
              key={item.sessionId}
              className={cn(
                'rounded-2xl border p-4 transition-all',
                canResume ? 'border-white/10 bg-white/[0.03] hover:border-primary/30 hover:bg-primary/5 cursor-pointer' : 'border-white/5 bg-white/[0.02]'
              )}
              onClick={() => handleResume(item)}
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5', meta.className)}>
                      <Icon className="w-3 h-3" />
                      {meta.label}
                    </span>
                    {item.fileName && (
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{item.fileName}</span>
                    )}
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-semibold truncate">{item.animeName || item.torrentName || 'Unknown torrent'}</h4>
                    <p className="text-xs text-muted-foreground truncate">
                      {item.fileName || 'No file selected'}{item.episodeNumber ? ` • Episode ${item.episodeNumber}` : ''}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDateTime(item.updatedAt)}
                      {item.error ? ` • ${item.error}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start">
                  {canResume && (
                    <Button size="sm" className="gap-2" onClick={(event) => { event.stopPropagation(); handleResume(item); }}>
                      <Play className="w-4 h-4" />
                      Resume
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(event) => { event.stopPropagation(); handleRemove(item.sessionId); }}
                    className="gap-2 text-muted-foreground hover:text-foreground"
                  >
                    <Trash2 className="w-4 h-4" />
                    Remove
                  </Button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] text-muted-foreground">
                <div className="rounded-xl bg-white/5 px-3 py-2">Peers: {item.seeders ?? 0} / {item.leechers ?? 0}</div>
                <div className="rounded-xl bg-white/5 px-3 py-2">Progress: {item.progress ?? 0}%</div>
                <div className="rounded-xl bg-white/5 px-3 py-2">Session: {item.sessionId.slice(0, 12)}…</div>
                <div className="rounded-xl bg-white/5 px-3 py-2">Started: {formatDateTime(item.startedAt)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </GlassPanel>
  );
}
