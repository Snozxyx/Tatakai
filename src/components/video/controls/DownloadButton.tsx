import { useCallback, useEffect, useMemo, useRef } from "react";
import { Download, Check, RotateCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
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
  sourceType,
  torrentUrl,
  headers,
  animeId,
  subtitles,
}: DownloadButtonProps) {
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
      toast.error("Can't download: episode is not identified yet");
      return;
    }
    if (!effectiveUrl) {
      toast.error(
        isTorrent ? "Torrent source not ready to download yet" : "No stream URL to download",
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
      headers: dl.headers,
      posterUrl,
      animeId: numericAnimeId,
      subtitles: downloadableSubtitles,
    });

    if (res.ok) {
      toast.success(`Downloading ${animeName || "episode"}${episodeNumber ? ` · Ep ${episodeNumber}` : ""}`);
      return;
    }
    switch (res.reason) {
      case "missing_download_path":
        toast.error("Set a download folder in the Offline Library first");
        break;
      case "feature_disabled":
        toast.error("Downloads are disabled");
        break;
      case "missing_stream_url":
        toast.error("No stream URL to download");
        break;
      case "mobile_download_failed": {
        const detail = typeof (res as { error?: unknown }).error === "string" ? String((res as { error?: unknown }).error) : "";
        // The mobile queue reports "already queued" through this reason.
        if (detail.includes("already_downloading")) toast.info("Already downloading");
        else toast.error(detail || "Download failed");
        break;
      }
      case "ipc_error":
        toast.error(typeof res.error === "string" ? res.error : "Failed to start download");
        break;
      default:
        toast.error("Downloads are only available on desktop");
    }
  }, [busy, episodeId, effectiveUrl, isTorrent, headers, startDownload, animeName, episodeNumber, posterUrl, numericAnimeId, downloadableSubtitles]);

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
    toast.success(`Auto-downloading Ep ${episodeNumber} on WiFi`);
    void startNow();
  }, [busy, status, effectiveUrl, episodeId, episodeNumber, numericAnimeId, startNow]);

  if (!isEnabled) return null;

  let icon = <Download className="w-4 h-4 md:w-5 md:h-5" />;
  let title = "Download episode";
  if (status === "downloading") {
    icon = <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin text-primary" />;
    title = `Downloading… ${progress}%`;
  } else if (status === "queued") {
    icon = <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin" />;
    title = "Queued…";
  } else if (status === "completed") {
    icon = <Check className="w-4 h-4 md:w-5 md:h-5 text-green-400" />;
    title = "Downloaded — click to download again";
  } else if (status === "failed") {
    icon = <RotateCw className="w-4 h-4 md:w-5 md:h-5 text-red-400" />;
    title = state?.error ? `Failed: ${state.error} — retry` : "Download failed — retry";
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
