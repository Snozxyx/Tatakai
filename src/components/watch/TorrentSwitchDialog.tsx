/**
 * TorrentSwitchDialog
 *
 * Confirmation shown before the app leaves a hosted stream and joins a
 * BitTorrent swarm.
 *
 * The other source types are passive: the app fetches bytes over HTTP and that
 * is the whole of it. A torrent is different in three ways the user cannot see
 * from the button they clicked — it publishes their IP to every peer and uploads
 * back to them, it writes the entire file (often a whole season pack) to disk,
 * and playback behaves differently because the file arrives out of order. So the
 * switch is gated on an explicit confirmation that states all three, plus the
 * enforcement picture for the region the browser reports.
 *
 * Rendering-only: it decides nothing. `onConfirm` hands the source straight back
 * to the caller, which owns starting the session.
 */

import { useMemo } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Scale, HardDrive, PlayCircle, Info, Users, TriangleAlert } from "lucide-react";
import {
  getTorrentRegionPolicy,
  TORRENT_UNIVERSAL_NOTES,
  type TorrentEnforcementLevel,
} from "@/lib/watch/torrentPolicy";

export interface TorrentSwitchSource {
  url?: string;
  magnetLink?: string;
  torrentFileUrl?: string;
  torrentTitle?: string;
  providerName?: string;
  providerKey?: string;
  server?: string;
  releaseGroup?: string;
  quality?: string;
  fileSize?: string;
  fileFormat?: string;
  language?: string;
  languageLabel?: string;
  audioLanguage?: string;
  langCode?: string;
  subtitleType?: string;
  codec?: string;
  audio?: string;
  episodeRange?: string;
  seeders?: number;
  leechers?: number;
  peers?: number;
  notes?: string;
  [key: string]: unknown;
}

interface TorrentSwitchDialogProps {
  /** Non-null opens the dialog. The same object is passed back to `onConfirm`. */
  source: TorrentSwitchSource | null;
  /** Series title, for the "what you are about to download" line. */
  animeTitle?: string;
  /** e.g. "Episode 7". */
  episodeLabel?: string;
  /** Torrent playback needs the desktop runtime; false disables confirmation. */
  isDesktop: boolean;
  /** Reflects the "optimize torrent storage" setting so the note matches reality. */
  optimizeStorage?: boolean;
  /** Absolute path the torrent engine writes into, when the runtime reports one. */
  downloadPath?: string;
  onCancel: () => void;
  onConfirm: (source: TorrentSwitchSource) => void;
}

const LEVEL_STYLES: Record<TorrentEnforcementLevel, { label: string; className: string }> = {
  high: {
    label: "Actively enforced",
    className: "bg-red-500/10 text-red-400 border-red-500/30",
  },
  moderate: {
    label: "Enforced",
    className: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  },
  "personal-use-tolerated": {
    label: "Sharing is the risk",
    className: "bg-sky-500/10 text-sky-400 border-sky-500/30",
  },
  unknown: {
    label: "Region unknown",
    className: "bg-muted text-muted-foreground border-white/10",
  },
};

/** `magnet:?xt=urn:btih:<hash>` → the hash, uppercased. */
function infoHashOf(magnet: string): string {
  const match = /xt=urn:btih:([a-z0-9]+)/i.exec(magnet);
  return match ? match[1].toUpperCase() : "";
}

function trackerCountOf(magnet: string): number {
  const matches = magnet.match(/[?&]tr=/gi);
  return matches ? matches.length : 0;
}

export function TorrentSwitchDialog({
  source,
  animeTitle,
  episodeLabel,
  isDesktop,
  optimizeStorage,
  downloadPath,
  onCancel,
  onConfirm,
}: TorrentSwitchDialogProps) {
  // The browser locale cannot change without a reload, so this is resolved once
  // rather than on every render of a dialog that stays mounted.
  const policy = useMemo(() => getTorrentRegionPolicy(), []);

  const magnet = String(source?.magnetLink || source?.url || "");
  const hasMagnet = /^magnet:/i.test(magnet);
  const infoHash = hasMagnet ? infoHashOf(magnet) : "";
  const trackers = hasMagnet ? trackerCountOf(magnet) : 0;

  const fullTitle =
    String(source?.torrentTitle || "").trim() ||
    [trimmed(animeTitle), trimmed(episodeLabel)].filter(Boolean).join(" — ") ||
    "Untitled release";

  const providerLabel =
    String(source?.providerName || source?.server || source?.providerKey || "").trim() || "Unknown provider";

  const seeders = numberOrNull(source?.seeders);
  const leechers = numberOrNull(source?.leechers);
  const peers = numberOrNull(source?.peers);

  const detailRows = useMemo(() => {
    const rows: Array<{ label: string; value: string }> = [];
    const push = (label: string, value?: string | number | null) => {
      const text = value === 0 ? "0" : String(value ?? "").trim();
      if (text) rows.push({ label, value: text });
    };

    push("Provider", providerLabel);
    push("Release group", source?.releaseGroup);
    push("Quality", source?.quality);
    push("Size", source?.fileSize);
    push("Container", source?.fileFormat);
    push("Video codec", source?.codec);
    push("Audio", source?.audio || source?.audioLanguage);
    push("Language", source?.languageLabel || source?.language);
    push("Subtitles", source?.subtitleType);
    push("Episodes in release", source?.episodeRange);
    push("Seeders", seeders);
    push("Leechers", leechers);
    push("Peers", peers);
    push("Trackers in magnet", trackers > 0 ? trackers : null);
    push("Info hash", infoHash);
    return rows;
  }, [
    providerLabel,
    source?.releaseGroup,
    source?.quality,
    source?.fileSize,
    source?.fileFormat,
    source?.codec,
    source?.audio,
    source?.audioLanguage,
    source?.languageLabel,
    source?.language,
    source?.subtitleType,
    source?.episodeRange,
    seeders,
    leechers,
    peers,
    trackers,
    infoHash,
  ]);

  const levelStyle = LEVEL_STYLES[policy.level];
  const zeroSeeders = seeders === 0;
  const canConfirm = isDesktop && hasMagnet;

  return (
    <AlertDialog open={!!source} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <AlertDialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto border-white/10 bg-background/95 backdrop-blur-xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <TriangleAlert className="h-5 w-5 text-amber-400" />
            Switch to a torrent source?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This leaves the hosted stream and joins a peer-to-peer swarm. Read the notes below — the
            things it changes are not visible from the player.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* ── What you are about to download ─────────────────────────────── */}
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Release
          </div>
          <p className="mt-1 break-words font-mono text-xs leading-relaxed text-foreground" title={fullTitle}>
            {fullTitle}
          </p>
          {(animeTitle || episodeLabel) && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Selected for {[animeTitle, episodeLabel].filter(Boolean).join(" · ")}
            </p>
          )}
          {source?.notes && (
            <p className="mt-1 text-[11px] text-muted-foreground">{String(source.notes)}</p>
          )}
        </section>

        {/* ── Source details ─────────────────────────────────────────────── */}
        {detailRows.length > 0 && (
          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <Users className="h-3 w-3" /> Source details
            </div>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
              {detailRows.map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-3 text-[11px]">
                  <dt className="shrink-0 text-muted-foreground">{row.label}</dt>
                  <dd className="truncate font-medium" title={row.value}>{row.value}</dd>
                </div>
              ))}
            </dl>
            {zeroSeeders && (
              <p className="mt-2 rounded-md bg-red-500/10 px-2 py-1 text-[11px] text-red-400">
                The indexer reports no seeders. Counts are often stale so it may still start, but if
                no peer has the data it will never play.
              </p>
            )}
          </section>
        )}

        {/* ── Region / legal ─────────────────────────────────────────────── */}
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <Scale className="h-3 w-3" /> Where you appear to be: {policy.regionName}
            </div>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${levelStyle.className}`}>
              {levelStyle.label}
            </span>
          </div>
          <p className="text-xs font-semibold">{policy.headline}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{policy.detail}</p>
          <ul className="mt-2 space-y-1">
            {TORRENT_UNIVERSAL_NOTES.map((note) => (
              <li key={note} className="flex gap-2 text-[11px] leading-relaxed text-muted-foreground">
                <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
                <span>{note}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 flex gap-1.5 text-[10px] leading-relaxed text-muted-foreground/80">
            <Info className="mt-[1px] h-3 w-3 shrink-0" />
            <span>
              General information, not legal advice. The region above is guessed from your language
              settings, not your location, and enforcement practices change.
            </span>
          </p>
        </section>

        {/* ── Storage ────────────────────────────────────────────────────── */}
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <HardDrive className="h-3 w-3" /> Storage
          </div>
          <ul className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
            <li>
              The whole file is written to disk, not streamed and discarded
              {source?.fileSize ? ` — this release reports ${String(source.fileSize)}.` : "."}
              {" "}A season pack downloads in full even when you only watch one episode.
            </li>
            {downloadPath && (
              <li className="break-all">
                Saved under <span className="font-mono text-foreground/80">{downloadPath}</span>
              </li>
            )}
            <li>
              {optimizeStorage
                ? "Storage optimisation is on, so finished data is cleaned up automatically under your cache limits."
                : "Storage optimisation is off, so downloaded data stays until you remove it in Settings → Torrent."}
            </li>
          </ul>
        </section>

        {/* ── Playback ───────────────────────────────────────────────────── */}
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <PlayCircle className="h-3 w-3" /> Playback
          </div>
          <ul className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
            <li>Playback starts only once metadata resolves and peers are found — usually seconds, sometimes never.</li>
            <li>Seeking is limited to what has downloaded, so the timeline stays locked until the file is complete and verified.</li>
            <li>Subtitles and audio tracks come from inside the release, so they may differ from the hosted stream.</li>
            {!isDesktop && (
              <li className="text-amber-400">Torrent playback needs the desktop app — this device cannot start a session.</li>
            )}
            {!hasMagnet && (
              <li className="text-amber-400">This source has no magnet link, so there is nothing to start.</li>
            )}
          </ul>
        </section>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Keep current source</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canConfirm}
            onClick={() => { if (source && canConfirm) onConfirm(source); }}
          >
            I understand — start torrent
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Keeps the title-fallback expression readable when a field is undefined. */
function trimmed(value?: string): string {
  return String(value || "").trim();
}
