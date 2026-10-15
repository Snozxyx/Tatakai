import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Download, Check, RotateCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useDownload } from "@/hooks/media/useDownload";
import { readProxyQuerySnapshot } from "@/lib/api/proxy-utils";
import { consumeAutoDownloadNext, peekAutoDownloadNext } from "@/core/download/mobile/autoDownloadNext";
import { loadMobileConfig } from "@/hooks/ui/useMobileConfig";
import { isWifiOnlyBlocked } from "@/core/download/mobile/storageManager";

/**
 * The player's HLS `currentSource.url` is a *proxied* URL
 * (`<streamingProxy>?url=<raw>&referer=…&userAgent=…`). The main-process ffmpeg
 * downloader can't reach that proxy (external host, or the unused localhost:3000
 * default) → "ffmpeg exit code 1". ffmpeg *can* fetch the raw m3u8 directly,
 * injecting Referer/User-Agent via its own -headers/-user_agent options — which
 * is exactly how SeasonDownloadModal's working downloads behave. So unwrap the
 * proxy back to raw URL + headers before enqueueing. No-op for raw/local URLs.
 */
function unwrapForDownload(
  url: string,
  hdrs?: Record<string, string>,
): { url: string; headers?: Record<string, string> } {
  const snap = readProxyQuerySnapshot(url);
  const raw = snap.streamUrl && /^https?:/i.test(snap.streamUrl) ? snap.streamUrl : url;
  const merged: Record<string, string> = { ...(hdrs || {}) };
  if (snap.referer && !merged.Referer && !merged.referer) merged.Referer = snap.referer;
  if (snap.userAgent && !merged["User-Agent"] && !merged["user-agent"]) {
    merged["User-Agent"] = snap.userAgent;
  }
  return { url: raw, headers: Object.keys(merged).length ? merged : undefined };
}

interface DownloadButtonProps {
  episodeId?: string;
  animeName?: string;
  episodeNumber?: number;
  posterUrl?: string;
  /** The playing HLS/http source URL (used for non-torrent downloads). */
  sourceUrl?: string;
  /**
   * The provider's original (pre-proxy) URL for the playing source. The
   * proxied `sourceUrl` carries a short-lived token (15 min / cleared on
   * restart) — without this, the native enqueue rejects with "source expired".
   */
  originalUrl?: string;
  sourceType?: string;
  /** Magnet/torrent URL (torrentStats.rawUrl) — preferred for torrent sources. */
  torrentUrl?: string;
  headers?: Record<string, string>;
  animeId?: string | number | null;
  /** Caption tracks for the currently playing episode — saved as sidecars. */
  subtitles?: Array<{
    url: string;
    lang?: string;
    label?: string;
    language?: string;
    originalUrl?: string;
    headers?: unknown;
  }>;
}

/**
 * Desktop-only control that downloads the currently-playing episode. Works for
 * both HLS and torrent sources: torrents download from the magnet
 * (`torrentUrl`), everything else from the live `sourceUrl`. Reflects the live
 * job state from the download-monitor singleton (idle / queued / downloading /
 * done / failed) so the same button doubles as a status + retry affordance.
 */
export function DownloadButton({
  episodeId,
  animeName,
  episodeNumber,
  posterUrl,
  sourceUrl,
  originalUrl,
  sourceType,
  torrentUrl,
  headers,
  animeId,
  subtitles,
}: DownloadButtonProps) {
  useUiTranslation();
  const { t } = useTranslation();
  const { isEnabled, downloadStates, startDownload } = useDownload();

  // Only treat the episode as a torrent when the *playing* source is one.
  // A stale `torrentUrl` (session state that survives switching back to a
  // stream) must never hijack a stream download into the slow torrent path.
  const sourceTypeNorm = String(sourceType || '').toLowerCase();
  const isTorrentSource =
    sourceTypeNorm === "torrent" ||
    sourceTypeNorm === "debrid" ||
    Boolean(sourceUrl?.startsWith("magnet:"));
  const isTorrent = isTorrentSource;
  const effectiveUrl = isTorrent ? torrentUrl || sourceUrl : sourceUrl;

  const state = episodeId ? downloadStates[episodeId] : undefined;
  const status = state?.status;
  const progress = Math.round(state?.progress ?? 0);

  const numericAnimeId = useMemo(() => {
    const n = Number(animeId);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }, [animeId]);

  // Keep only caption tracks with a real URL and a non-thumbnail language so
  // season/thumbnail metadata never gets written as a bogus sidecar.
  const downloadableSubtitles = useMemo(() => {
    if (!subtitles?.length) return undefined;
    const out = subtitles
      .filter((s) => {
        const u = String(s?.url || '').trim();
        if (!u) return false;
        const lang = String(s?.lang || s?.language || s?.label || '').trim().toLowerCase();
        if (!lang) return false;
        if (/thumbnail/i.test(lang) || /thumbnail/i.test(u)) return false;
        return true;
      })
      .map((s) => ({ ...s, url: String(s.url).trim() }));
    return out.length ? out : undefined;
  }, [subtitles]);

  const busy = status === "queued" || status === "downloading";

  const startNow = useCallback(async () => {
    if (busy) return;
    if (!episodeId) {
      toast.error(t('player.downloadNotIdentified'));
      return;
    }
    if (!effectiveUrl) {
      toast.error(
        isTorrent ? t('player.downloadTorrentNotReady') : t('player.downloadNoStreamUrl'),
      );
      return;
    }

    const dl = isTorrent
      ? { url: effectiveUrl, headers }
      : unwrapForDownload(effectiveUrl, headers);

    const res = await startDownload({
      episodeId,
      animeName: animeName || "Anime",
      episodeNumber: episodeNumber ?? 0,
      url: dl.url,
      // The live (possibly proxied) URL plus its pre-proxy original: the
      // native side re-resolves from `originalUrl` when the token has expired.
      originalUrl: isTorrent ? undefined : originalUrl,
      headers: dl.headers,
      posterUrl,
      animeId: numericAnimeId,
      subtitles: downloadableSubtitles,
    });

    if (res.ok) {
      const name = animeName || t('player.downloadEpisodeFallback');
      toast.success(
        episodeNumber
          ? t('player.downloadStartedEpisode', { name, number: episodeNumber })
          : t('player.downloadStartedGeneric', { name }),
      );
      return;
    }
    switch (res.reason) {
      case "missing_download_path":
        toast.error(t('player.downloadSetFolderFirst'));
        break;
      case "feature_disabled":
        toast.error(t('player.downloadsDisabled'));
        break;
      case "missing_stream_url":
        toast.error(t('player.downloadNoStreamUrl'));
        break;
      case "mobile_download_failed": {
        const detail = typeof (res as { error?: unknown }).error === "string" ? String((res as { error?: unknown }).error) : "";
        // The mobile queue reports "already queued" through this reason.
        if (detail.includes("already_downloading")) toast.info(uiI18n.t('app.already_downloading_7a98b1fa'));
        else toast.error(detail || uiI18n.t('app.download_failed_01125e1b'));
        break;
      }
      case "ipc_error":
        toast.error(typeof res.error === "string" ? res.error : t('player.downloadFailedStart'));
        break;
      default:
        toast.error(t('player.downloadDesktopOnly'));
    }
  }, [busy, episodeId, effectiveUrl, isTorrent, headers, startDownload, animeName, episodeNumber, posterUrl, numericAnimeId, downloadableSubtitles, originalUrl]);

  const handleClick = () => {
    void startNow();
  };

  // Auto-download-next: a completed episode N arms a one-shot intent for N+1.
  // When this button mounts for that exact episode with a resolved stream URL,
  // download it without a tap (WiFi-only guard keeps the intent until WiFi).
  const autoFiredRef = useRef(false);
  useEffect(() => {
    if (autoFiredRef.current || busy || status === "completed" || !effectiveUrl || !episodeId) return;
    if (numericAnimeId == null || episodeNumber == null) return;
    let enabled = false;
    try {
      enabled = loadMobileConfig().autoDownloadNext === true;
    } catch {
      return;
    }
    if (!enabled) return;
    let intent: { animeId: number; nextEpisode: number } | null = null;
    try {
      intent = peekAutoDownloadNext();
    } catch {
      return;
    }
    if (!intent || Number(intent.animeId) !== numericAnimeId || Number(intent.nextEpisode) !== Number(episodeNumber)) return;
    if (isWifiOnlyBlocked()) return;
    autoFiredRef.current = true;
    try {
      consumeAutoDownloadNext(numericAnimeId);
    } catch {
      /* intent already peeked — proceed anyway */
    }
    toast.success(uiI18n.t('app.auto_downloading_ep_i18n_value_0_on_wifi_da948fda', { value0: episodeNumber }));
    void startNow();
  }, [busy, status, effectiveUrl, episodeId, episodeNumber, numericAnimeId, startNow]);

  if (!isEnabled) return null;

  let icon = <Download className="w-4 h-4 md:w-5 md:h-5" />;
  let title = t('player.downloadEpisode');
  if (status === "downloading") {
    icon = <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin text-primary" />;
    title = t('player.downloadingPercent', { progress });
  } else if (status === "queued") {
    icon = <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin" />;
    title = t('player.downloadQueued');
  } else if (status === "completed") {
    icon = <Check className="w-4 h-4 md:w-5 md:h-5 text-green-400" />;
    title = t('player.downloadedRetry');
  } else if (status === "failed") {
    icon = <RotateCw className="w-4 h-4 md:w-5 md:h-5 text-red-400" />;
    title = state?.error ? t('player.downloadFailedRetry', { error: state.error }) : t('player.downloadFailedRetryGeneric');
  }

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className="relative p-2 rounded-lg hover:bg-white/10 transition-colors disabled:cursor-default"
      title={title}
    >
      {icon}
      {status === "downloading" && (
        <span className="absolute -bottom-0.5 -right-0.5 text-[9px] font-semibold leading-none text-primary bg-black/70 rounded px-0.5">
          {progress}
        </span>
      )}
    </button>
  );
}
