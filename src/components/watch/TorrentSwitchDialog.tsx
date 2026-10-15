import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
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
import { useTranslation } from "react-i18next";
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
  /** Torrent playback needs a torrent-capable runtime (desktop or mobile app); false disables confirmation. */
  canPlayTorrent: boolean;
  /** Reflects the "optimize torrent storage" setting so the note matches reality. */
  optimizeStorage?: boolean;
  /** Absolute path the torrent engine writes into, when the runtime reports one. */
  downloadPath?: string;
  onCancel: () => void;
  onConfirm: (source: TorrentSwitchSource) => void;
}

const LEVEL_STYLES: Record<TorrentEnforcementLevel, { labelKey: string; className: string }> = {
  high: {
    labelKey: "torrent.switch.levelHigh",
    className: "bg-red-500/10 text-red-400 border-red-500/30",
  },
  moderate: {
    labelKey: "torrent.switch.levelModerate",
    className: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  },
  "personal-use-tolerated": {
    labelKey: "torrent.switch.levelTolerated",
    className: "bg-sky-500/10 text-sky-400 border-sky-500/30",
  },
  unknown: {
    labelKey: "torrent.switch.levelUnknown",
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
  canPlayTorrent,
  optimizeStorage,
  downloadPath,
  onCancel,
  onConfirm,
}: TorrentSwitchDialogProps) {
  useUiTranslation();
  const { t } = useTranslation();
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
    t('torrent.switch.untitledRelease');

  const providerLabel =
    String(source?.providerName || source?.server || source?.providerKey || "").trim() || t('torrent.switch.unknownProvider');

  const seeders = numberOrNull(source?.seeders);
  const leechers = numberOrNull(source?.leechers);
  const peers = numberOrNull(source?.peers);

  const detailRows = useMemo(() => {
    const rows: Array<{ label: string; value: string }> = [];
    const push = (label: string, value?: string | number | null) => {
      const text = value === 0 ? "0" : String(value ?? "").trim();
      if (text) rows.push({ label, value: text });
    };

    push(t('torrent.switch.fieldProvider'), providerLabel);
    push(t('torrent.switch.fieldReleaseGroup'), source?.releaseGroup);
    push(t('torrent.switch.fieldQuality'), source?.quality);
    push(t('torrent.switch.fieldSize'), source?.fileSize);
    push(t('torrent.switch.fieldContainer'), source?.fileFormat);
    push(t('torrent.switch.fieldVideoCodec'), source?.codec);
    push(t('torrent.switch.fieldAudio'), source?.audio || source?.audioLanguage);
    push(t('torrent.switch.fieldLanguage'), source?.languageLabel || source?.language);
    push(t('torrent.switch.fieldSubtitles'), source?.subtitleType);
    push(t('torrent.switch.fieldEpisodesInRelease'), source?.episodeRange);
    push(t('torrent.switch.fieldSeeders'), seeders);
    push(t('torrent.switch.fieldLeechers'), leechers);
    push(t('torrent.switch.fieldPeers'), peers);
    push(t('torrent.switch.fieldTrackers'), trackers > 0 ? trackers : null);
    push(t('torrent.switch.fieldInfoHash'), infoHash);
    return rows;
  }, [
    t,
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
  , uiI18n.language]);

  const levelStyle = LEVEL_STYLES[policy.level];
  const zeroSeeders = seeders === 0;
  const canConfirm = canPlayTorrent && hasMagnet;

  return (
    <AlertDialog open={!!source} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <AlertDialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto border-white/10 bg-background/95 backdrop-blur-xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <TriangleAlert className="h-5 w-5 text-amber-400" />
            {t('torrent.switch.title')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('torrent.switch.description')}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* ── What you are about to download ─────────────────────────────── */}
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {t('torrent.switch.release')}
          </div>
          <p className="mt-1 break-words font-mono text-xs leading-relaxed text-foreground" title={fullTitle}>
            {fullTitle}
          </p>
          {(animeTitle || episodeLabel) && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t('torrent.switch.selectedFor', { selection: [animeTitle, episodeLabel].filter(Boolean).join(" · ") })}
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
              <Users className="h-3 w-3" /> {t('torrent.switch.sourceDetails')}
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
                {t('torrent.switch.zeroSeeders')}
              </p>
            )}
          </section>
        )}

        {/* ── Region / legal ─────────────────────────────────────────────── */}
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <Scale className="h-3 w-3" /> {t('torrent.switch.regionLine', { region: policy.regionName })}
            </div>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${levelStyle.className}`}>
              {t(levelStyle.labelKey)}
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
              {t('torrent.switch.legalNote')}
            </span>
          </p>
        </section>

        {/* ── Storage ────────────────────────────────────────────────────── */}
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <HardDrive className="h-3 w-3" /> {t('torrent.switch.storage')}
          </div>
          <ul className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
            <li>
              {source?.fileSize
                ? t('torrent.switch.storageWritesFileSized', { size: String(source.fileSize) })
                : t('torrent.switch.storageWritesFile')}{" "}
              {t('torrent.switch.storageSeasonPack')}
            </li>
            {downloadPath && (
              <li className="break-all">
                {t('torrent.switch.savedUnder')}{" "}
                <span className="font-mono text-foreground/80">{downloadPath}</span>
              </li>
            )}
            <li>
              {optimizeStorage
                ? t('torrent.switch.optimizeOn')
                : t('torrent.switch.optimizeOff')}
            </li>
          </ul>
        </section>

        {/* ── Playback ───────────────────────────────────────────────────── */}
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <PlayCircle className="h-3 w-3" /> {t('torrent.switch.playback')}
          </div>
          <ul className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
            <li>{t('torrent.switch.playbackMetadata')}</li>
            <li>{t('torrent.switch.playbackSeeking')}</li>
            <li>{t('torrent.switch.playbackTracks')}</li>
            {!canPlayTorrent && (
              <li className="text-amber-400">{t('migration.torrentSwitchNote')}</li>
            )}
            {!hasMagnet && (
              <li className="text-amber-400">{t('torrent.switch.playbackNoMagnet')}</li>
            )}
          </ul>
        </section>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{t('torrent.switch.keepSource')}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canConfirm}
            onClick={() => { if (source && canConfirm) onConfirm(source); }}
          >
            {t('torrent.switch.confirmStart')}
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
