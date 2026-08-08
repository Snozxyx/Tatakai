import React from 'react';
import { Button } from '@/components/ui/button';
import { Download, Upload, Users, AlertCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function TorrentStickyBanner({ sessionId, stats, onRepair, onStop }: { sessionId?: string; stats?: any; onRepair?: () => void; onStop?: () => void; }) {
  const percent = Math.max(0, Math.min(100, Number(stats?.progress ?? 0)));
  const downloading = (stats && (stats.downloadSpeed || 0) > 0) || false;
  const repair = stats?.repair;
  const repairAgeMs = repair?.at ? Date.now() - Number(repair.at) : null;
  const isUnavailable = stats?.availability === 'no_peers';
  const showRepair = !isUnavailable && repairAgeMs != null && repairAgeMs >= 0 && repairAgeMs < 120000;
  const stalledForMs = Number(stats?.stalledForMs || 0);
  const isStalled = !isUnavailable && stalledForMs > 45000 && (stats?.downloadSpeed || 0) <= 0;
  const stalledSeconds = Math.max(0, Math.round(stalledForMs / 1000));
  const storageBytes = Number.isFinite(stats?.storage)
    ? Number(stats.storage)
    : Number(stats?.storage?.totalBytes);
  const storageLabel = Number.isFinite(storageBytes)
    ? `${(storageBytes / 1024 / 1024).toFixed(0)} MB`
    : '0 MB';
  const peerCountLabel = stats?.numPeers == null ? 'n/a' : stats.numPeers;
  const seedersLabel = stats?.seeders == null ? 'n/a' : stats.seeders;
  const leechersLabel = stats?.leechers == null ? 'n/a' : stats.leechers;

  return (
    <div className="sticky top-20 z-50 w-full">
      <div className="mx-2 md:mx-0 rounded-2xl border border-border/20 bg-gradient-to-b from-card/80 to-card/60 p-4 backdrop-blur-sm shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <div className="px-3 py-1 rounded-full bg-rose-600/20 text-rose-400 text-xs font-semibold">STANDALONE TORRENT</div>
              {stats && !stats.verified && <div className="px-3 py-1 rounded-full bg-yellow-600/10 text-amber-400 text-xs font-medium">TIMELINE LOCKED</div>}
              {showRepair && (
                <div className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-300 text-xs font-medium flex items-center gap-1">
                  <AlertCircle size={12} /> Repairing
                </div>
              )}
              {isStalled && (
                <div className="px-3 py-1 rounded-full bg-orange-500/10 text-orange-300 text-xs font-medium flex items-center gap-1">
                  <AlertCircle size={12} /> Stalled {stalledSeconds}s
                </div>
              )}
              {isUnavailable && (
                <div className="px-3 py-1 rounded-full bg-red-500/10 text-red-300 text-xs font-medium flex items-center gap-1">
                  <AlertCircle size={12} /> No peers
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-lg md:text-xl font-semibold truncate">{stats?.name || 'Loading Torrent Data...'}</div>
                <div className="text-xs text-muted-foreground mt-1 truncate">{stats?.infoHash ? `${String(stats.infoHash).slice(0, 12)}…` : sessionId}</div>
              </div>

              <div className="hidden md:flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-2 bg-white/6 rounded-xl">
                  <Download size={16} /> <div className="text-sm">{stats?.downloadSpeed ? `${(stats.downloadSpeed/1024).toFixed(1)} KB/s` : '0 KB/s'}</div>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 bg-white/6 rounded-xl">
                  <Upload size={16} /> <div className="text-sm">{stats?.uploadSpeed ? `${(stats.uploadSpeed/1024).toFixed(1)} KB/s` : '0 KB/s'}</div>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 bg-white/6 rounded-xl">
                  <Users size={16} /> <div className="text-sm">{peerCountLabel}</div>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 bg-white/6 rounded-xl">
                  <div className="text-sm">Cache</div> <div className="text-sm font-medium">{storageLabel}</div>
                </div>
              </div>
            </div>

            <div className="mt-3">
              <div className="h-2 w-full bg-white/6 rounded-full overflow-hidden">
                <div style={{ width: `${percent}%` }} className={cn('h-full bg-primary transition-all')} />
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <div className="px-2 py-1 bg-white/5 rounded-md">{percent.toFixed(0)}% downloaded</div>
                <div className="px-2 py-1 bg-white/5 rounded-md">{stats?.eta != null ? (stats.eta ? `${Math.round(stats.eta)}s ETA` : 'Done') : 'ETA calculating'}</div>
                <div className="px-2 py-1 bg-white/5 rounded-md">Seeders {seedersLabel}</div>
                <div className="px-2 py-1 bg-white/5 rounded-md">Leechers {leechersLabel}</div>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <Button size="sm" variant={downloading ? 'destructive' : 'ghost'} onClick={onStop} className="rounded-full px-3">Stop</Button>
              <Button size="sm" variant="outline" onClick={onRepair} className="rounded-full px-3">{isUnavailable ? 'Retry' : 'Repair'}</Button>
              {isUnavailable && (
                <div className="text-xs text-red-200/80 truncate">
                  {stats?.availabilityMessage || 'This torrent has no visible swarm right now.'}
                </div>
              )}
              <div className="ml-auto text-xs text-muted-foreground flex items-center gap-2"><Clock size={14} /> <span>{stats?.startedAt ? new Date(stats.startedAt).toLocaleTimeString() : ''}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
