import { useMemo } from "react";
import { Download, Check, RotateCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useDownload } from "@/hooks/media/useDownload";
import { readProxyQuerySnapshot } from "@/lib/api/proxy-utils";

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
}: DownloadButtonProps) {
  const { isEnabled, downloadStates, startDownload } = useDownload();

  const isTorrent =
    sourceType === "torrent" || Boolean(torrentUrl) || Boolean(sourceUrl?.startsWith("magnet:"));
  const effectiveUrl = isTorrent ? torrentUrl || sourceUrl : sourceUrl;

  const state = episodeId ? downloadStates[episodeId] : undefined;
  const status = state?.status;
  const progress = Math.round(state?.progress ?? 0);

  const numericAnimeId = useMemo(() => {
    const n = Number(animeId);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }, [animeId]);

  if (!isEnabled) return null;

  const busy = status === "queued" || status === "downloading";

  const handleClick = async () => {
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
      case "ipc_error":
        toast.error(typeof res.error === "string" ? res.error : "Failed to start download");
        break;
      default:
        toast.error("Downloads are only available on desktop");
    }
  };

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
