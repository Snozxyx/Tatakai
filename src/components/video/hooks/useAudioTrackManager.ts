import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { sourceAdapterRegistry } from "@/core/player/SourceAdapterRegistry";
import type {
  UseAudioTrackManagerParams,
  AudioTrack,
} from "../VideoPlayer.types";
import { normalizeTrackLanguage, formatMediaTrackLabel } from "./useSubtitleManager";

function convertFileSrc(filePath: string): string {
  if (!filePath) return filePath;
  if (
    filePath.startsWith("http://") ||
    filePath.startsWith("https://") ||
    filePath.startsWith("tatakai-media://")
  ) {
    return filePath;
  }
  // Serve local files through the privileged tatakai-media:// scheme, NOT file:// —
  // the renderer runs with webSecurity on and refuses to load file:/// resources
  // (same reason video/subtitles/posters go through this scheme). A bare Windows
  // path like `file:///C:/...` would be blocked; strip any file:// prefix too.
  const normalized = filePath.replace(/^file:\/\/+/i, "").replace(/\\/g, "/");
  return `tatakai-media:///${normalized}`;
}

export function useAudioTrackManager({
  videoRef,
  audioTracks,
  currentAudioTrack,
  currentSource,
  currentSubtitle,
  extractedAudioUrls,
  isNative,
  setCurrentAudioTrack,
  setExtractedAudioUrls,
  setActiveExtractedAudioTrack,
  handleSubtitleChange,
}: UseAudioTrackManagerParams) {
  const externalAudioRef = useRef<HTMLAudioElement | null>(null);

  const handleAudioTrackChange = useCallback(
    (trackId: number) => {
      if (!videoRef.current || !isNative) return;
      const video = videoRef.current as any;

      void (async () => {
        const runtime = (window as any).tatakaiRuntime;
        const sessionId = new URLSearchParams(window.location.search).get("sessionId");
        const isTorrentSource = Boolean(
          sessionId &&
            (currentSource?.sourceType === "torrent" || currentSource?.url?.startsWith("magnet:")),
        );

        // ── Torrent ──────────────────────────────────────────────────────────
        if (isTorrentSource && runtime?.getTorrentStreamUrl) {
          try {
            const currentTimeSnapshot = Number.isFinite(video.currentTime) ? video.currentTime : 0;
            const wasPaused = video.paused;

            toast.loading("Switching audio track (reloading stream)...");
            const stream = await runtime.getTorrentStreamUrl(
              sessionId,
              (window as any).currentFileIndex ?? undefined,
              { audioTrackIndex: trackId },
            );
            toast.dismiss();

            if (!stream?.success || !stream.url) {
              toast.error(stream?.error || "Failed to request audio-switched stream");
              return;
            }

            setActiveExtractedAudioTrack(null);
            setCurrentAudioTrack(trackId);

            await sourceAdapterRegistry.switchTo({
              source: { id: stream.url, url: stream.url, mode: "hls" },
              videoElement: video,
              startTime: currentTimeSnapshot,
              autoPlay: !wasPaused,
            });

            handleSubtitleChange(currentSubtitle);
            toast.success("Audio track switched");
            return;
          } catch (err: any) {
            toast.dismiss();
            toast.error(err?.message || "Error switching audio track");
            return;
          }
        }

        // ── Non-torrent, in-container tracks ─────────────────────────────────
        const nativeList = video.audioTracks;
        if (nativeList && nativeList.length > 1) {
          const pos = audioTracks.findIndex((t) => t.id === trackId);
          const targetPos = pos >= 0 ? pos : trackId;
          for (let i = 0; i < nativeList.length; i++) {
            nativeList[i].enabled = i === targetPos;
          }
          setActiveExtractedAudioTrack(null);
          setCurrentAudioTrack(trackId);
          toast.success("Audio track switched");
          return;
        }

        // ── Fallback: extract the track to a separate file ───────────────────
        try {
          if (!runtime?.extractAudioTrack) {
            toast.error("Audio extraction runtime unavailable");
            return;
          }

          const existing = extractedAudioUrls[trackId];
          if (existing) {
            setCurrentAudioTrack(trackId);
            setActiveExtractedAudioTrack(trackId);
            toast.success("Audio track switched");
            return;
          }

          toast.loading("Extracting audio track...");
          let probeUrl = currentSource?.url || "";
          if (video?.src) probeUrl = video.src;

          try {
            if (sessionId && runtime?.getTorrentFilePath) {
              const pathRes = await runtime.getTorrentFilePath(sessionId);
              if (pathRes?.success && pathRes?.path) probeUrl = pathRes.path;
            }
          } catch {
            // fall back to stream URL
          }

          const result = await runtime.extractAudioTrack(probeUrl, trackId);
          toast.dismiss();

          if (result?.success && result?.url) {
            let extractedUrl = String(result.url || "").trim();
            // Anything that isn't already an http(s) or tatakai-media:// URL — a
            // bare Windows path OR a blocked file:// URL (e.g. from an older
            // main-process build) — is routed through the privileged scheme so
            // the <audio> element can actually load it.
            if (
              !/^https?:\/\//i.test(extractedUrl) &&
              !extractedUrl.startsWith("tatakai-media://")
            ) {
              extractedUrl = convertFileSrc(extractedUrl);
            }
            setExtractedAudioUrls((prev) => ({ ...prev, [trackId]: extractedUrl }));
            setCurrentAudioTrack(trackId);
            setActiveExtractedAudioTrack(trackId);
            toast.success("Audio track loaded");
          } else {
            toast.error(result?.error || "Failed to extract audio track");
          }
        } catch (err: any) {
          toast.dismiss();
          toast.error(err?.message || "Error extracting audio track");
        }
      })();
    },
    [
      videoRef,
      isNative,
      currentSource?.url,
      currentSource?.sourceType,
      extractedAudioUrls,
      currentSubtitle,
      handleSubtitleChange,
      audioTracks,
      setCurrentAudioTrack,
      setExtractedAudioUrls,
      setActiveExtractedAudioTrack,
    ],
  );

  return {
    handleAudioTrackChange,
    externalAudioRef,
  };
}
