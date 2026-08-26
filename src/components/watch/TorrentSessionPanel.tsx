/**
 * TorrentSessionPanel — the live state of the running torrent session.
 *
 * Replaces the two-line status strip that only ever showed a percentage and a
 * download speed. While a torrent is playing, that percentage is the *only*
 * thing standing between "buffering for a second" and "this release has no
 * swarm and will never finish", and the user had no way to tell those apart —
 * so the panel now shows the numbers that distinguish them: byte counts against
 * the real file size, a rolling speed graph, seeders/leechers split out of the
 * peer total, and the engine's own stall/availability verdicts as plain badges.
 *
 * Everything here is read from the session-manager `stats()` payload. Nothing is
 * inferred or estimated client-side except the speed history, which the runtime
 * does not keep — it is sampled from successive polls and lives only as long as
 * the panel is mounted.
 *
 * Actions belong to the page: repair (re-announce) and stop both change routing
 * state, so they are passed in rather than dialled through IPC from here.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Download,
  FolderOpen,
  HardDrive,
  Loader2,
  Radio,
  RefreshCw,
  ShieldCheck,
  Square,
  Upload,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TorrentSessionPanelProps {
  sessionId: string;
  /** Raw `stats()` payload from the session manager, or null before the first poll. */
  stats: any | null;
  /** Already clamped to 0-100 by the page. */
  progressPercent: number;
  /** Whether the file is complete *and* hash-verified — this is what unlocks seeking. */
  verified: boolean;
  loading?: boolean;
  error?: string | null;
  /** Engine download directory, shown so the user knows where the data landed. */
  downloadPath?: string;
  /** When on, an incomplete file is deleted on stop. Worth saying out loud. */
  optimizeStorage?: boolean;
  onRepair: () => void | Promise<void>;
  onStop: () => void;
}

/** How many poll samples the speed graph keeps — roughly the last minute. */
const SPEED_HISTORY_LIMIT = 40;

function formatBytes(value: unknown): string {
  const bytes = Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(bytes >= 10 * 1024 ** 3 ? 0 : 2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function formatRate(value: unknown): string {
  const bytes = Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB/s";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB/s`;
  return `${(kb / 1024).toFixed(kb / 1024 >= 100 ? 0 : 1)} MB/s`;
}

/** Seconds → `4m 12s`. `Infinity` and absurd values become an em dash. */
function formatEta(value: unknown): string {
  const seconds = Number(value ?? NaN);
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  // WebTorrent returns Infinity-ish numbers while there is no download rate.
  if (seconds > 86400 * 7) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${Math.round(seconds % 60)}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/**
 * Rolling speed graph with a fixed zero baseline.
 *
 * Deliberately not the shared `Sparkline`: that one normalizes to min..max, so a
 * steady 3 MB/s and a steady 3 KB/s draw the identical flat line. For transfer
 * rates the distance from zero is the whole point.
 */
function SpeedGraph({
  series,
  className,
}: {
  series: number[];
  className?: string;
}) {
  const width = 132;
  const height = 30;

  const path = useMemo(() => {
    if (series.length < 2) return null;
    const peak = Math.max(...series, 1);
    const stepX = width / (series.length - 1);
    const points = series.map((value, index) => {
      const x = index * stepX;
      const y = height - Math.max(0, Math.min(1, value / peak)) * (height - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return {
      line: `M${points.join(" L")}`,
      area: `M0,${height} L${points.join(" L")} L${width},${height} Z`,
    };
  }, [series]);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("overflow-visible", className)}
      aria-hidden="true"
    >
      {path ? (
        <>
          <path d={path.area} fill="currentColor" opacity={0.12} />
          <path d={path.line} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
        </>
      ) : (
        <line x1="0" y1={height - 1} x2={width} y2={height - 1} stroke="currentColor" strokeWidth={1} opacity={0.2} />
      )}
    </svg>
  );
}

export function TorrentSessionPanel({
  sessionId,
  stats,
  progressPercent,
  verified,
  loading,
  error,
  downloadPath,
  optimizeStorage,
  onRepair,
  onStop,
}: TorrentSessionPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [downSeries, setDownSeries] = useState<number[]>([]);
  const [upSeries, setUpSeries] = useState<number[]>([]);
  const lastSampleRef = useRef<any>(null);

  // The runtime keeps no speed history, so it is sampled here from successive
  // stats objects. Keyed on the object identity — each poll produces a new one —
  // rather than on the speed value, which would skip samples whenever the rate
  // happened to repeat.
  useEffect(() => {
    if (!stats || lastSampleRef.current === stats) return;
    lastSampleRef.current = stats;
    const down = Math.max(0, Number(stats.downloadSpeed) || 0);
    const up = Math.max(0, Number(stats.uploadSpeed) || 0);
    setDownSeries((prev) => [...prev, down].slice(-SPEED_HISTORY_LIMIT));
    setUpSeries((prev) => [...prev, up].slice(-SPEED_HISTORY_LIMIT));
  }, [stats]);

  // A new session is a new transfer; carrying the old curve over would show a
  // cliff that never happened.
  useEffect(() => {
    setDownSeries([]);
    setUpSeries([]);
    lastSampleRef.current = null;
  }, [sessionId]);

  const copy = useCallback(async (label: string, value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied((current) => (current === label ? null : current)), 1600);
    } catch {
      // Clipboard can be denied; the value is on screen either way.
    }
  }, []);

  const handleRepair = useCallback(async () => {
    setRepairing(true);
    try {
      await onRepair();
    } finally {
      setTimeout(() => setRepairing(false), 1200);
    }
  }, [onRepair]);

  const openFolder = useCallback(() => {
    const target = String(downloadPath || stats?.storage?.root || "").trim();
    if (!target) return;
    void (window as any).electron?.openPath?.(target);
  }, [downloadPath, stats?.storage?.root]);

  const downloaded = Number(stats?.downloaded ?? 0);
  const totalLength = Number(stats?.length ?? 0);
  const uploaded = Number(stats?.uploaded ?? 0);
  const numFiles = Number(stats?.numFiles ?? 0);
  const seeders = stats?.seeders;
  const leechers = stats?.leechers;
  const numPeers = stats?.numPeers;
  const done = Boolean(stats?.done);
  const ratio = Number(stats?.ratio ?? 0);

  const stalledForMs = Number(stats?.stalledForMs || 0);
  const isUnavailable = stats?.availability === "no_peers";
  const isStalled = !isUnavailable && !done && stalledForMs > 45000 && Number(stats?.downloadSpeed || 0) <= 0;
  const repairAgeMs = stats?.repair?.at ? Date.now() - Number(stats.repair.at) : null;
  const showRepairBadge = !isUnavailable && repairAgeMs != null && repairAgeMs >= 0 && repairAgeMs < 120000;

  const cacheBytes = Number(stats?.storage?.totalBytes ?? (Number.isFinite(stats?.storage) ? stats?.storage : NaN));
  const cacheMaxBytes = Number(stats?.storage?.maxBytes ?? NaN);

  // `progress` is the authoritative figure; the byte pair is only shown when the
  // metadata actually gave a file length, which some magnets do not.
  const byteLabel = totalLength > 0
    ? `${formatBytes(downloaded)} of ${formatBytes(totalLength)}`
    : formatBytes(downloaded);

  const peerLabel = numPeers == null ? "n/a" : String(numPeers);
  const infoHash = String(stats?.infoHash || "");

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-2xl border p-3.5 transition-colors",
        isUnavailable
          ? "border-red-500/30 bg-red-500/[0.04]"
          : isStalled
            ? "border-amber-500/30 bg-amber-500/[0.04]"
            : "border-emerald-500/25 bg-emerald-500/[0.04]",
      )}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-400">
              <Radio className={cn("h-3 w-3", !done && "animate-pulse")} />
              Torrent session
            </span>

            {done && verified && (
              <span className="flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
                <ShieldCheck className="h-2.5 w-2.5" /> Verified
              </span>
            )}
            {!verified && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">
                Seeking locked
              </span>
            )}
            {showRepairBadge && (
              <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">
                <RefreshCw className="h-2.5 w-2.5 animate-spin" /> Repairing
              </span>
            )}
            {isStalled && (
              <span className="flex items-center gap-1 rounded-full bg-orange-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-orange-300">
                <AlertTriangle className="h-2.5 w-2.5" /> Stalled {Math.round(stalledForMs / 1000)}s
              </span>
            )}
            {isUnavailable && (
              <span className="flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-300">
                <AlertTriangle className="h-2.5 w-2.5" /> No peers
              </span>
            )}
          </div>

          <p className="mt-1 truncate font-mono text-xs text-foreground" title={stats?.name || sessionId}>
            {stats?.name || (loading ? "Resolving release..." : sessionId)}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex h-7 shrink-0 items-center gap-1 rounded-lg bg-white/5 px-2 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          aria-expanded={expanded}
        >
          {expanded ? "Less" : "Details"}
          <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
        </button>
      </div>

      {/* ── Progress ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              done ? "bg-emerald-400" : isUnavailable ? "bg-red-500/70" : "bg-emerald-500",
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
          <span className="font-bold text-foreground">{progressPercent.toFixed(1)}%</span>
          <span>{byteLabel}</span>
          {!done && (
            <span className="flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" />
              {formatEta(stats?.eta)}
            </span>
          )}
          {done && <span className="text-emerald-400">Download complete</span>}
        </div>
      </div>

      {/* ── Live rates ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.03] px-2.5 py-2 text-emerald-400">
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              <Download className="h-2.5 w-2.5" /> Down
            </div>
            <div className="truncate text-xs font-bold text-foreground">{formatRate(stats?.downloadSpeed)}</div>
          </div>
          <SpeedGraph series={downSeries} className="hidden shrink-0 sm:block" />
        </div>

        <div className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.03] px-2.5 py-2 text-sky-400">
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              <Upload className="h-2.5 w-2.5" /> Up
            </div>
            <div className="truncate text-xs font-bold text-foreground">{formatRate(stats?.uploadSpeed)}</div>
          </div>
          <SpeedGraph series={upSeries} className="hidden shrink-0 sm:block" />
        </div>

        <div className="col-span-2 rounded-xl bg-white/[0.03] px-2.5 py-2 sm:col-span-1">
          <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            <Users className="h-2.5 w-2.5" /> Peers
          </div>
          <div className="text-xs font-bold text-foreground">
            {peerLabel}
            <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
              {/* Split out because the total hides the case that matters: many
                  leechers and no seeders never finishes. */}
              {seeders == null ? "n/a" : seeders} seed · {leechers == null ? "n/a" : leechers} leech
            </span>
          </div>
        </div>
      </div>

      {/* ── Engine messages ───────────────────────────────────────────────── */}
      {(isUnavailable || error) && (
        <p className={cn("text-[10px]", isUnavailable ? "text-red-300" : "text-amber-300")}>
          {isUnavailable
            ? stats?.availabilityMessage || "This release has no visible swarm right now — try another one."
            : error}
        </p>
      )}

      {/* ── Details ────────────────────────────────────────────────────────── */}
      {expanded && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-white/5 pt-3 text-[10px] sm:grid-cols-3">
          <div>
            <div className="text-muted-foreground">Uploaded</div>
            <div className="font-medium text-foreground">
              {formatBytes(uploaded)}
              {ratio > 0 && <span className="ml-1 text-muted-foreground">· {ratio.toFixed(2)} ratio</span>}
            </div>
          </div>

          <div>
            <div className="text-muted-foreground">Files in release</div>
            <div className="font-medium text-foreground">{numFiles > 0 ? numFiles : "—"}</div>
          </div>

          <div>
            <div className="text-muted-foreground">Started</div>
            <div className="font-medium text-foreground">
              {stats?.startedAt ? new Date(stats.startedAt).toLocaleTimeString() : "—"}
            </div>
          </div>

          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center gap-1 text-muted-foreground">
              <HardDrive className="h-2.5 w-2.5" /> Cache on disk
            </div>
            <div className="font-medium text-foreground">
              {Number.isFinite(cacheBytes) ? formatBytes(cacheBytes) : "—"}
              {Number.isFinite(cacheMaxBytes) && cacheMaxBytes > 0 && (
                // Cache-wide, not this torrent — the engine reports one budget
                // for every session it has ever cached.
                <span className="ml-1 text-muted-foreground">of {formatBytes(cacheMaxBytes)} total</span>
              )}
            </div>
          </div>

          <div className="col-span-2">
            <div className="text-muted-foreground">Info hash</div>
            <button
              type="button"
              onClick={() => copy("hash", infoHash)}
              disabled={!infoHash}
              className="flex max-w-full items-center gap-1 font-mono text-[10px] text-foreground transition-colors hover:text-emerald-400 disabled:opacity-50"
              title="Copy info hash"
            >
              <span className="truncate">{infoHash || "—"}</span>
              {copied === "hash" ? (
                <Check className="h-2.5 w-2.5 shrink-0 text-emerald-400" />
              ) : (
                <Copy className="h-2.5 w-2.5 shrink-0" />
              )}
            </button>
          </div>

          {(downloadPath || stats?.storage?.root) && (
            <div className="col-span-2 sm:col-span-3">
              <div className="text-muted-foreground">Saved to</div>
              <div className="flex items-center gap-2">
                <span className="truncate font-mono text-[10px] text-foreground">
                  {downloadPath || stats?.storage?.root}
                </span>
                <button
                  type="button"
                  onClick={() => copy("path", String(downloadPath || stats?.storage?.root || ""))}
                  className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                  title="Copy path"
                >
                  {copied === "path" ? <Check className="h-2.5 w-2.5 text-emerald-400" /> : <Copy className="h-2.5 w-2.5" />}
                </button>
              </div>
            </div>
          )}

          {optimizeStorage && !done && (
            <p className="col-span-2 text-[10px] text-amber-400/80 sm:col-span-3">
              Storage optimization is on — stopping before this finishes deletes the partial file.
            </p>
          )}
        </div>
      )}

      {/* ── Actions ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
        <Button
          size="sm"
          variant="outline"
          onClick={handleRepair}
          disabled={repairing}
          className="h-7 gap-1.5 rounded-lg border-white/10 px-2.5 text-[11px]"
          title="Re-announce to the trackers and DHT to find more peers"
        >
          {repairing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {isUnavailable ? "Find peers" : "Repair"}
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={onStop}
          className="h-7 gap-1.5 rounded-lg px-2.5 text-[11px] text-red-300 hover:bg-red-500/10 hover:text-red-200"
          title="Stop the session and go back to the hosted streams"
        >
          <Square className="h-3 w-3" />
          Stop &amp; return to streams
        </Button>

        {(downloadPath || stats?.storage?.root) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={openFolder}
            className="h-7 gap-1.5 rounded-lg px-2.5 text-[11px] text-muted-foreground hover:text-foreground"
            title="Open the download folder"
          >
            <FolderOpen className="h-3 w-3" />
            Open folder
          </Button>
        )}

        {loading && (
          <span className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Starting...
          </span>
        )}
      </div>
    </div>
  );
}
