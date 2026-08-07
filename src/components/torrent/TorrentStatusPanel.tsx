import React, { useMemo, useState } from 'react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AlertCircle, ChevronDown, ChevronUp, Download, HardDrive, Upload, Users } from 'lucide-react';

function formatRate(bytesPerSec?: number) {
  const value = Number(bytesPerSec || 0);
  if (!Number.isFinite(value) || value <= 0) return '0 KB/s';
  const kb = value / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB/s`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB/s`;
}

function formatBytes(bytes?: number) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return '0 MB';
  const mb = value / 1024 / 1024;
  if (mb < 1024) return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(gb >= 100 ? 0 : 1)} GB`;
}

export function TorrentStatusPanel({
  sessionId,
  stats,
  buffering,
  onRepair,
  onStop,
  onOpenFolder,
  className,
}: {
  sessionId?: string;
  stats?: any;
  buffering?: boolean;
  onRepair?: () => void;
  onStop?: () => void;
  onOpenFolder?: () => void;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const percent = Math.max(0, Math.min(100, Number(stats?.progress ?? 0)));
  const availability = String(stats?.availability || 'ok');
  const peerCountLabel = stats?.numPeers == null ? 'n/a' : stats.numPeers;
  const seedersText = stats?.seeders == null ? 'n/a' : `${stats.seeders}s`;
  const leechersText = stats?.leechers == null ? 'n/a' : `${stats.leechers}l`;

  const badge = useMemo(() => {
    if (availability === 'no_peers') return { label: 'No peers', tone: 'danger' as const };
    if (availability === 'stalled') return { label: 'Stalled', tone: 'warn' as const };
    if (buffering) return { label: 'Buffering', tone: 'info' as const };
    if (availability === 'searching') return { label: 'Searching', tone: 'muted' as const };
    return { label: 'Streaming', tone: 'ok' as const };
  }, [availability, buffering]);

  const storageBytes = Number.isFinite(stats?.storage)
    ? Number(stats.storage)
    : Number(stats?.storage?.totalBytes);

  const badgeClass =
    badge.tone === 'danger'
      ? 'bg-red-500/10 text-red-200 border-red-500/20'
      : badge.tone === 'warn'
        ? 'bg-orange-500/10 text-orange-200 border-orange-500/20'
        : badge.tone === 'info'
          ? 'bg-primary/10 text-primary border-primary/20'
          : badge.tone === 'ok'
            ? 'bg-emerald-500/10 text-emerald-200 border-emerald-500/20'
            : 'bg-white/5 text-muted-foreground border-white/10';

  return (
    <div className={cn("absolute left-1/2 top-4 -translate-x-1/2 z-[30] w-[min(92%,600px)] transition-all duration-300", className)}>
      <GlassPanel className="group relative overflow-hidden border-white/10 bg-black/20 backdrop-blur-xl shadow-xl p-3 md:p-3.5">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className={cn('px-2 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest', badgeClass)}>
                {badge.label}
              </div>
              {availability === 'no_peers' && (
                <div className="flex items-center gap-1 text-[10px] text-red-200/80 truncate">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span className="truncate">{stats?.availabilityMessage || 'No visible swarm right now.'}</span>
                </div>
              )}
            </div>
            <div className="mt-1 text-xs md:text-sm font-semibold truncate">
              {stats?.name || 'Torrent session'}
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs">
              <Download className="w-4 h-4" />
              <span className="font-semibold">{formatRate(stats?.downloadSpeed)}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs">
              <Users className="w-4 h-4" />
              <span className="font-semibold">{peerCountLabel}</span>
            </div>
          </div>

          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-2 rounded-xl hover:bg-white/5 transition-colors"
            aria-label={expanded ? 'Collapse torrent stats' : 'Expand torrent stats'}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        <div className="mt-2 h-1.5 w-full bg-white/6 rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all duration-500" style={{ width: `${percent}%` }} />
        </div>

        {expanded ? (
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs">
              <Download className="w-4 h-4" />
              <div className="min-w-0">
                <div className="text-[10px] text-muted-foreground">Down</div>
                <div className="font-semibold truncate">{formatRate(stats?.downloadSpeed)}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs">
              <Upload className="w-4 h-4" />
              <div className="min-w-0">
                <div className="text-[10px] text-muted-foreground">Up</div>
                <div className="font-semibold truncate">{formatRate(stats?.uploadSpeed)}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs">
              <Users className="w-4 h-4" />
              <div className="min-w-0">
                <div className="text-[10px] text-muted-foreground">Peers</div>
                <div className="font-semibold truncate">
                  {seedersText} / {leechersText}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs">
              <HardDrive className="w-4 h-4" />
              <div className="min-w-0">
                <div className="text-[10px] text-muted-foreground">Cache</div>
                <div className="font-semibold truncate">{formatBytes(storageBytes)}</div>
              </div>
            </div>

            <div className="col-span-2 md:col-span-4 flex items-center gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={onRepair} className="rounded-full px-3">
                Repair
              </Button>
              <Button size="sm" variant="destructive" onClick={onStop} className="rounded-full px-3">
                Stop
              </Button>
              {onOpenFolder ? (
                <Button size="sm" variant="ghost" onClick={onOpenFolder} className="rounded-full px-3 ml-auto">
                  Open folder
                </Button>
              ) : (
                <div className="ml-auto text-[10px] text-muted-foreground truncate">{stats?.infoHash ? `${String(stats.infoHash).slice(0, 12)}…` : sessionId}</div>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <div className="truncate">{percent.toFixed(0)}%</div>
            <div className="truncate">{stats?.eta != null ? (stats.eta ? `${Math.round(stats.eta)}s ETA` : 'Done') : 'ETA…'}</div>
          </div>
        )}
      </GlassPanel>
    </div>
  );
}

