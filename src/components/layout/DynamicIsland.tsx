import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, ArrowDown, ArrowUp, Users, Check, X, Radio, Eye, Magnet, RefreshCw, Sparkles } from "lucide-react";
import { useDownloadStates, markCancelled } from "@/core/download/download-monitor";
import {
  useMangaDownloadStates,
  markMangaCancelled,
  mangaJobId,
  type MangaDownloadEntry,
} from "@/core/download/manga-download-monitor";
import { useActivityStates, type ActivityKind } from "@/core/activity/activity-monitor";
import { useUpdateState, dismissUpdateNotice } from "@/core/update/update-monitor";
import { useUpdateOrchestrator, installUpdateNow } from "@/core/update/useUpdateOrchestrator";

/**
 * Apple-Dynamic-Island-style widget for the desktop titlebar. It fuses three
 * app-lifetime singletons — the anime download-monitor, the manga
 * download-monitor and the live-activity monitor — so it stays live regardless
 * of which pages/modals mount. Collapsed it's a compact pill; on hover it morphs
 * into a panel with: animated activity pills (Streaming / Watching / Torrenting),
 * a rich row per active download (poster, name, kind/torrent badge, speeds,
 * peers, progress, cancel) and a compact recently-finished list. Manga rows are
 * badged Manga | Manhwa | Manhua. Tatakai tokens: black glass + primary accent.
 */

const fmtBps = (b?: number): string | null => {
  if (!b || b <= 0) return null;
  const mb = b / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB/s`;
  return `${Math.max(1, Math.round(b / 1024))} KB/s`;
};
const fmtBytes = (b?: number): string | null => {
  if (!b || b <= 0) return null;
  const gb = b / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${Math.round(b / 1024 ** 2)} MB`;
};

type DlStatus = "downloading" | "queued" | "completed" | "failed" | "cancelled";
type DlKind = "anime" | "manga" | "manhwa" | "manhua";

/** Normalized row shape both download monitors map into. */
interface UIItem {
  id: string;
  kind: DlKind;
  status: DlStatus;
  progress: number;
  title?: string;
  posterUrl?: string | null;
  subtitle?: string;
  isTorrent: boolean;
  dlSpeedBps?: number;
  upSpeedBps?: number;
  numPeers?: number;
  ratio?: number;
  seeders?: number | null;
  leechers?: number | null;
  downloadedBytes?: number;
  eta?: string;
  cancel: () => void;
}

const KIND_BADGE: Record<DlKind, { label: string; cls: string } | null> = {
  anime: null,
  manga: { label: "Manga", cls: "bg-sky-500/20 text-sky-300" },
  manhwa: { label: "Manhwa", cls: "bg-fuchsia-500/20 text-fuchsia-300" },
  manhua: { label: "Manhua", cls: "bg-amber-500/20 text-amber-300" },
};

const ACTIVITY_META: Record<
  ActivityKind,
  { label: string; Icon: typeof Radio; color: string; dot: string }
> = {
  streaming: { label: "Streaming", Icon: Radio, color: "text-rose-400", dot: "bg-rose-400" },
  watching: { label: "Watching", Icon: Eye, color: "text-emerald-400", dot: "bg-emerald-400" },
  torrenting: { label: "Torrenting", Icon: Magnet, color: "text-primary", dot: "bg-primary" },
};

function cancelAnime(episodeId: string) {
  try {
    (
      window as { electron?: { cancelDownload?: (a: { episodeId: string }) => void } }
    ).electron?.cancelDownload?.({ episodeId });
  } catch {
    /* ignore */
  }
  markCancelled(episodeId);
}

function cancelManga(entry: MangaDownloadEntry) {
  const jobId = entry.jobId || mangaJobId(entry.anilistId, entry.chapterKey);
  try {
    (window as { electron?: { manga?: { cancel?: (a: { jobId: string }) => void } } }).electron?.manga?.cancel?.({
      jobId,
    });
  } catch {
    /* ignore */
  }
  markMangaCancelled(jobId);
}

/** A single pulsing status dot (the "live" indicator on activity pills). */
function PulseDot({ className }: { className: string }) {
  return (
    <motion.span
      className={`h-2 w-2 rounded-full ${className}`}
      animate={{ scale: [1, 1.6, 1], opacity: [1, 0.35, 1] }}
      transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

export function DynamicIsland() {
  useUpdateOrchestrator();
  const animeStates = useDownloadStates();
  const mangaStates = useMangaDownloadStates();
  const activities = useActivityStates();
  const update = useUpdateState();
  const [hovered, setHovered] = useState(false);

  // Fuse both download monitors into one normalized list.
  const items = useMemo<UIItem[]>(() => {
    const anime: UIItem[] = Object.values(animeStates).map((s) => ({
      id: s.episodeId,
      kind: "anime",
      status: s.status as DlStatus,
      progress: s.progress ?? 0,
      title: s.animeName,
      posterUrl: s.posterUrl,
      subtitle: s.episodeNumber ? `Ep ${s.episodeNumber}` : undefined,
      isTorrent: s.sourceType === "torrent",
      dlSpeedBps: s.dlSpeedBps,
      upSpeedBps: s.upSpeedBps,
      numPeers: s.numPeers,
      ratio: s.ratio,
      seeders: s.seeders,
      leechers: s.leechers,
      downloadedBytes: s.downloadedBytes,
      eta: s.eta,
      cancel: () => cancelAnime(s.episodeId),
    }));
    const manga: UIItem[] = Object.values(mangaStates).map((s) => ({
      id: s.jobId,
      kind: (s.kind ?? "manga") as DlKind,
      status: s.status as DlStatus,
      progress: s.progress ?? 0,
      title: s.title,
      posterUrl: s.posterUrl,
      subtitle: s.chapterLabel,
      isTorrent: false,
      cancel: () => cancelManga(s),
    }));
    return [...anime, ...manga];
  }, [animeStates, mangaStates]);

  const active = useMemo(
    () =>
      items
        .filter((s) => s.status === "downloading" || s.status === "queued")
        .sort((a, b) => {
          if (a.status !== b.status) return a.status === "downloading" ? -1 : 1;
          return (b.progress ?? 0) - (a.progress ?? 0);
        }),
    [items],
  );

  const downloading = active.filter((s) => s.status === "downloading");
  const finished = useMemo(
    () =>
      items
        .filter((s) => s.status === "completed" || s.status === "failed" || s.status === "cancelled")
        .slice(-4)
        .reverse(),
    [items],
  );

  const activityList = useMemo(
    () => Object.values(activities).sort((a, b) => a.startedAt - b.startedAt),
    [activities],
  );

  const totals = useMemo(() => {
    let dl = 0;
    let ul = 0;
    let peers = 0;
    for (const s of downloading) {
      dl += s.dlSpeedBps ?? 0;
      ul += s.upSpeedBps ?? 0;
      peers += s.numPeers ?? 0;
    }
    return { dl, ul, peers };
  }, [downloading]);

  const topProgress = useMemo(
    () => downloading.reduce((m, s) => Math.max(m, s.progress ?? 0), 0),
    [downloading],
  );

  const hasDownloads = active.length > 0;
  const hasActivity = activityList.length > 0;

  // The update is "showable" while it's actually doing something the user should
  // see: pulling the download, ready to restart, or installing. A dismissed
  // ready-state stays live (installs on quit) but stops occupying the island.
  const updateShowing =
    update.phase === "downloading" ||
    update.phase === "installing" ||
    (update.phase === "downloaded" && !update.dismissed);
  const hasUpdate = updateShowing;

  if (!hasDownloads && !hasActivity && !hasUpdate) return null;

  const expanded = hovered;
  const label =
    downloading.length > 0 ? `${downloading.length} downloading` : `${active.length} queued`;
  const totalDl = fmtBps(totals.dl);
  const leadActivity = activityList[0];

  const updateHeaderLabel =
    update.phase === "downloading"
      ? `Updating ${Math.round(update.progress)}%`
      : update.phase === "installing"
        ? "Installing…"
        : "Update ready";

  return (
    <div
      className="absolute left-1/2 top-0 -translate-x-1/2 z-[10000]"
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <motion.div
        layout
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
        className="mt-1 overflow-hidden rounded-2xl border border-white/10 bg-black/90 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.6)]"
      >
        {/* Compact header — always visible */}
        <motion.div layout="position" className="flex h-6 items-center gap-2 px-3">
          {hasDownloads ? (
            <>
              <Download className="h-3.5 w-3.5 text-primary" />
              <span className="text-[11px] font-medium leading-none text-white/80">{label}</span>
              {topProgress > 0 && (
                <span className="text-[11px] font-semibold leading-none text-primary">
                  {Math.round(topProgress)}%
                </span>
              )}
              {totalDl && (
                <span className="flex items-center gap-0.5 text-[10px] leading-none text-white/60">
                  <ArrowDown className="h-2.5 w-2.5" />
                  {totalDl}
                </span>
              )}
            </>
          ) : hasUpdate ? (
            <>
              {update.phase === "downloaded" ? (
                <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
              )}
              <span className="text-[11px] font-medium leading-none text-white/80">
                {updateHeaderLabel}
              </span>
            </>
          ) : leadActivity ? (
            <>
              {(() => {
                const meta = ACTIVITY_META[leadActivity.kind];
                const Icon = meta.Icon;
                return <Icon className={`h-3.5 w-3.5 ${meta.color}`} />;
              })()}
              <span className="text-[11px] font-medium leading-none text-white/80">
                {ACTIVITY_META[leadActivity.kind].label}
              </span>
              <PulseDot className={ACTIVITY_META[leadActivity.kind].dot} />
              {leadActivity.label && (
                <span className="max-w-[140px] truncate text-[10px] leading-none text-white/50">
                  {leadActivity.label}
                </span>
              )}
            </>
          ) : null}
          {/* Trailing icons when downloads occupy the header */}
          {hasDownloads && (hasActivity || hasUpdate) && (
            <span className="ml-auto flex items-center gap-1.5">
              {hasUpdate &&
                (update.phase === "downloaded" ? (
                  <Sparkles className="h-3 w-3 text-emerald-400" />
                ) : (
                  <RefreshCw className="h-3 w-3 animate-spin text-primary" />
                ))}
              {activityList.map((a) => {
                const meta = ACTIVITY_META[a.kind];
                const Icon = meta.Icon;
                return <Icon key={a.id} className={`h-3 w-3 ${meta.color}`} />;
              })}
            </span>
          )}
        </motion.div>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="w-[340px] px-2 pb-2"
            >
              {/* Desktop self-update */}
              {hasUpdate && (
                <div className="mb-1.5 mt-1 rounded-xl bg-white/[0.04] p-2">
                  <div className="flex items-center gap-2.5">
                    <div className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/5">
                      {update.phase === "downloaded" ? (
                        <Sparkles className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[12px] font-semibold text-white/90">
                          {update.phase === "downloaded"
                            ? "Update ready to install"
                            : update.phase === "installing"
                              ? "Installing update…"
                              : "Downloading update"}
                        </span>
                        {update.version && (
                          <span className="flex-shrink-0 rounded bg-primary/20 px-1 py-px text-[9px] font-bold text-primary">
                            v{update.version}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-white/50">
                        {update.phase === "downloading"
                          ? `${Math.round(update.progress)}%`
                          : update.phase === "downloaded"
                            ? update.mandatory
                              ? "Restarting to finish…"
                              : "Installs when you close Tatakai"
                            : "Please wait…"}
                      </div>
                    </div>
                    {update.phase === "downloaded" && !update.mandatory && (
                      <div className="flex flex-shrink-0 items-center gap-1">
                        <button
                          onClick={installUpdateNow}
                          className="rounded-lg bg-emerald-500/90 px-2 py-1 text-[10px] font-bold text-white hover:bg-emerald-500"
                          title="Restart and install now"
                        >
                          Restart
                        </button>
                        <button
                          onClick={dismissUpdateNotice}
                          className="flex h-6 w-6 items-center justify-center rounded-full text-white/40 hover:bg-white/10 hover:text-white"
                          title="Later"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  {update.phase === "downloading" && (
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                      <motion.div
                        className="h-full rounded-full bg-primary"
                        initial={false}
                        animate={{ width: `${Math.round(update.progress)}%` }}
                        transition={{ duration: 0.4 }}
                      />
                    </div>
                  )}
                </div>
              )}
              {/* Live activities */}
              {activityList.length > 0 && (
                <div className="space-y-1.5 pb-2 pt-1">
                  {activityList.map((a) => {
                    const meta = ACTIVITY_META[a.kind];
                    const Icon = meta.Icon;
                    return (
                      <div key={a.id} className="flex items-center gap-2.5 rounded-xl bg-white/[0.04] p-2">
                        <div className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/5">
                          <Icon className={`h-4 w-4 ${meta.color}`} />
                          <span className="absolute -right-0.5 -top-0.5">
                            <PulseDot className={meta.dot} />
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className={`text-[12px] font-semibold ${meta.color}`}>{meta.label}</span>
                          {a.label && (
                            <div className="truncate text-[11px] text-white/70">{a.label}</div>
                          )}
                          {a.detail && (
                            <div className="truncate text-[10px] text-white/40">{a.detail}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Aggregate throughput */}
              {downloading.length > 0 && (totals.dl > 0 || totals.ul > 0 || totals.peers > 0) && (
                <div className="mb-1.5 flex items-center gap-3 rounded-xl bg-white/[0.03] px-2.5 py-1.5 text-[10px] text-white/60">
                  {fmtBps(totals.dl) && (
                    <span className="flex items-center gap-1 text-emerald-400">
                      <ArrowDown className="h-3 w-3" />
                      {fmtBps(totals.dl)}
                    </span>
                  )}
                  {fmtBps(totals.ul) && (
                    <span className="flex items-center gap-1 text-sky-400">
                      <ArrowUp className="h-3 w-3" />
                      {fmtBps(totals.ul)}
                    </span>
                  )}
                  {totals.peers > 0 && (
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {totals.peers}
                    </span>
                  )}
                </div>
              )}
              {/* Active downloads */}
              <div className="space-y-1.5">
                {active.map((item) => {
                  const badge = KIND_BADGE[item.kind];
                  const pct = Math.round(item.progress ?? 0);
                  const dl = fmtBps(item.dlSpeedBps);
                  const done = fmtBytes(item.downloadedBytes);
                  return (
                    <div key={item.id} className="rounded-xl bg-white/[0.04] p-2">
                      <div className="flex items-center gap-2.5">
                        {item.posterUrl ? (
                          <img src={item.posterUrl} alt="" className="h-11 w-8 flex-shrink-0 rounded-md object-cover" />
                        ) : (
                          <div className="flex h-11 w-8 flex-shrink-0 items-center justify-center rounded-md bg-white/5">
                            <Download className="h-4 w-4 text-white/30" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-[12px] font-semibold text-white/90">{item.title || "Downloading"}</span>
                            {badge && (
                              <span className={`flex-shrink-0 rounded px-1 py-px text-[9px] font-bold ${badge.cls}`}>{badge.label}</span>
                            )}
                            {item.isTorrent && (
                              <span className="flex-shrink-0 rounded bg-primary/20 px-1 py-px text-[9px] font-bold text-primary">Torrent</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-white/50">
                            {item.subtitle && <span className="truncate">{item.subtitle}</span>}
                            {item.status === "queued" ? (
                              <span className="text-white/40">Queued</span>
                            ) : (
                              <>
                                {dl && <span className="flex items-center gap-0.5 text-emerald-400"><ArrowDown className="h-2.5 w-2.5" />{dl}</span>}
                                {item.eta && <span>{item.eta}</span>}
                                {done && <span>{done}</span>}
                              </>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={item.cancel}
                          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-white/40 hover:bg-white/10 hover:text-white"
                          title="Cancel"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {item.isTorrent && item.status === "downloading" && (
                        <div className="mt-1 flex items-center gap-2.5 pl-[42px] text-[9px] text-white/40">
                          {fmtBps(item.upSpeedBps) && (
                            <span className="flex items-center gap-0.5 text-sky-400">
                              <ArrowUp className="h-2.5 w-2.5" />
                              {fmtBps(item.upSpeedBps)}
                            </span>
                          )}
                          {typeof item.numPeers === "number" && item.numPeers > 0 && (
                            <span className="flex items-center gap-0.5">
                              <Users className="h-2.5 w-2.5" />
                              {item.numPeers}
                            </span>
                          )}
                          {typeof item.ratio === "number" && <span>Ratio {item.ratio.toFixed(2)}</span>}
                        </div>
                      )}
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                        <motion.div
                          className="h-full rounded-full bg-primary"
                          initial={false}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.4 }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              {finished.length > 0 && (
                <div className="mt-2 border-t border-white/5 pt-2">
                  <div className="space-y-1">
                    {finished.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 px-1 text-[10px]">
                        {item.status === "completed" ? (
                          <Check className="h-3 w-3 flex-shrink-0 text-emerald-400" />
                        ) : (
                          <X className="h-3 w-3 flex-shrink-0 text-white/30" />
                        )}
                        <span className="truncate text-white/50">{item.title || "Download"}</span>
                        {item.subtitle && <span className="flex-shrink-0 text-white/30">· {item.subtitle}</span>}
                        <span className="ml-auto flex-shrink-0 text-white/25">
                          {item.status === "completed" ? "Done" : item.status === "cancelled" ? "Cancelled" : "Failed"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

