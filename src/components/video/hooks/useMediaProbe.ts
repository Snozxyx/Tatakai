import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import type {
  UseMediaProbeParams,
  AudioTrack,
  InternalSubtitleTrack,
} from "../VideoPlayer.types";
import { normalizeTrackLanguage, formatMediaTrackLabel, dedupeInternalSubtitleTracks } from "./useSubtitleManager";

export function useMediaProbe({
  videoRef,
  currentSource,
  isNative,
  torrentStats,
  setAudioTracks,
  setInternalSubtitles,
}: UseMediaProbeParams) {
  const probeInProgressRef = useRef(false);
  const deferredProbeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const torrentStartupGraceUntilRef = useRef(0);
  const probeSucceededRef = useRef(false);
  const torrentStatsRef = useRef(torrentStats);
  torrentStatsRef.current = torrentStats;

  const triggerMediaProbe = useCallback(async () => {
    const url = currentSource?.url;
    const currentTorrentStats = torrentStatsRef.current;
    if (!url || !isNative || !(window as any).tatakaiRuntime?.probeMedia || probeInProgressRef.current)
      return;

    if (
      url.startsWith("file://") ||
      url.startsWith("data:") ||
      url.startsWith("blob:")
    )
      return;

    const isM3U8 = url.includes(".m3u8") || currentSource?.isM3U8;
    const torrentRawUrl = (currentTorrentStats as any)?.rawUrl;
    const allowTorrentProbeThroughHls = Boolean(
      isM3U8 &&
        currentSource?.sourceType === "torrent" &&
        typeof torrentRawUrl === "string" &&
        torrentRawUrl.startsWith("http"),
    );
    if (isM3U8 && !allowTorrentProbeThroughHls) return;

    const isTorrentSource =
      url.startsWith("magnet:") || url.length === 40 || currentSource?.sourceType === "torrent";
    if (isTorrentSource && Date.now() < torrentStartupGraceUntilRef.current) {
      const delayMs = Math.max(
        1000,
        torrentStartupGraceUntilRef.current - Date.now() + 250,
      );
      if (deferredProbeTimerRef.current) {
        clearTimeout(deferredProbeTimerRef.current);
      }
      deferredProbeTimerRef.current = setTimeout(() => {
        deferredProbeTimerRef.current = null;
        void triggerMediaProbe();
      }, delayMs);
      return;
    }

    if (isTorrentSource) {
      const sessionId = new URLSearchParams(window.location.search).get("sessionId");
      if (!sessionId) return;
    }

    probeInProgressRef.current = true;

    let attempts = 0;
    const maxAttempts = isTorrentSource ? 2 : 3;

    const tryProbe = async () => {
      try {
        let probeUrl = allowTorrentProbeThroughHls ? String(torrentRawUrl) : url;
        let result: { success?: boolean; tracks?: Array<any>; error?: string } | undefined;

        if (isTorrentSource) {
          const sessionId = new URLSearchParams(window.location.search).get("sessionId");
          const isTorrentComplete = Boolean(currentTorrentStats?.done || currentTorrentStats?.verified);

          if (isTorrentComplete) {
            if (sessionId && (window as any).tatakaiRuntime?.getTorrentFilePath) {
              const pathRes = await (window as any).tatakaiRuntime.getTorrentFilePath(sessionId);
              if (pathRes?.success && pathRes?.path) {
                probeUrl = pathRes.path;
              }
            }
          } else {
            const rawUrl = (currentTorrentStats as any)?.rawUrl;
            if (typeof rawUrl === "string" && rawUrl.startsWith("http")) {
              probeUrl = rawUrl;
            } else if (videoRef.current?.src?.startsWith("http")) {
              probeUrl = videoRef.current.src;
            }
          }

          const isHttpProbe =
            probeUrl.startsWith("http://") || probeUrl.startsWith("https://");
          if (
            !isHttpProbe &&
            sessionId &&
            (window as any).tatakaiRuntime?.ensureTorrentPrebuffer
          ) {
            const fileIndex = (window as any).currentFileIndex ?? undefined;
            const prebuffer = await (
              window as any
            ).tatakaiRuntime.ensureTorrentPrebuffer(sessionId, fileIndex, {
              requireMetadataTail: false,
            });
            if (!prebuffer?.success) {
              console.warn(
                `[VideoPlayer] Skipping media probe until torrent is ready: ${prebuffer?.error || "prebuffer pending"}`,
              );
              return false;
            }
          }

          console.log(`[VideoPlayer] Probing media: ${probeUrl} (attempt ${attempts + 1})`);
          result = await (window as any).tatakaiRuntime.probeMedia(probeUrl);
        } else {
          result = await (window as any).tatakaiRuntime.probeMedia(probeUrl);
        }

        if (result?.success) {
          if (result.tracks && result.tracks.length > 0) {
            console.log(`[VideoPlayer] Found tracks:`, result.tracks);
            const audio: AudioTrack[] = result.tracks
              .filter((t: any) => t.type === "audio")
              .map((t: any) => ({
                id: t.index,
                label: formatMediaTrackLabel(t),
                lang: normalizeTrackLanguage(t.language),
                default: !!t.default,
              }));

            const subs: InternalSubtitleTrack[] = result.tracks
              .filter((t: any) => t.type === "subtitle")
              .map((t: any) => ({
                id: t.index,
                label: formatMediaTrackLabel(t),
                lang: normalizeTrackLanguage(t.language),
                default: !!t.default,
              }));

            const dedupedSubs = dedupeInternalSubtitleTracks(subs);

            setAudioTracks(audio);
            setInternalSubtitles(dedupedSubs);
            probeSucceededRef.current = true;

            if (audio.length > 0 || dedupedSubs.length > 0) {
              console.log(
                `[VideoPlayer] Successfully detected ${audio.length} audio tracks and ${dedupedSubs.length} internal subtitles.`,
              );
              toast.success(
                `Detected ${audio.length} audio tracks & ${dedupedSubs.length} subtitles`,
                { id: "probe-success", duration: 2000 },
              );
            }
          } else {
            console.warn(`[VideoPlayer] Probe successful but no tracks found in: ${probeUrl}`);
          }
          return true;
        } else {
          console.warn(
            `[VideoPlayer] Probe attempt ${attempts + 1} failed for ${probeUrl}:`,
            result?.error,
          );
          return false;
        }
      } catch (err) {
        console.error(`[VideoPlayer] Probe error on attempt ${attempts + 1}:`, err);
        return false;
      }
    };

    while (attempts < maxAttempts) {
      const success = await tryProbe();
      if (success) break;
      attempts++;
      if (attempts < maxAttempts) {
        await new Promise((r) => setTimeout(r, isTorrentSource ? 4000 : 1200));
      }
    }

    probeInProgressRef.current = false;
  }, [currentSource?.url, currentSource?.isM3U8, currentSource?.sourceType, isNative, videoRef, setAudioTracks, setInternalSubtitles]);

  // Reset and trigger probe on source change
  useEffect(() => {
    setAudioTracks([]);
    setInternalSubtitles([]);
    probeSucceededRef.current = false;
    if (deferredProbeTimerRef.current) {
      clearTimeout(deferredProbeTimerRef.current);
      deferredProbeTimerRef.current = null;
    }
    probeInProgressRef.current = false;
    triggerMediaProbe();
  }, [triggerMediaProbe, window.location.search]);

  // Retry probe on torrent status change — only if probe hasn't succeeded yet
  useEffect(() => {
    if (probeSucceededRef.current) return;

    const isTorrentSource =
      currentSource?.sourceType === "torrent" ||
      currentSource?.url?.startsWith("magnet:") ||
      currentSource?.url?.length === 40;
    if (!isTorrentSource || !isNative) return;

    const rawUrl = (torrentStats as any)?.rawUrl;
    const hasConnection =
      (torrentStats?.numPeers ?? 0) > 0 ||
      (torrentStats?.progress ?? 0) > 0 ||
      torrentStats?.done;
    if (typeof rawUrl === "string" && rawUrl.startsWith("http") && hasConnection) {
      console.log("[VideoPlayer] Retrying media probe due to torrent status update...");
      void triggerMediaProbe();
    }
  }, [
    currentSource?.url,
    torrentStats?.done,
    torrentStats?.progress,
    torrentStats?.numPeers,
    (torrentStats as any)?.rawUrl,
    isNative,
    triggerMediaProbe,
  ]);

  // Cleanup deferred probe timer
  useEffect(() => {
    return () => {
      if (deferredProbeTimerRef.current) {
        clearTimeout(deferredProbeTimerRef.current);
        deferredProbeTimerRef.current = null;
      }
    };
  }, []);

  return {
    triggerMediaProbe,
    extractedSubtitleCacheRef: useRef<Record<string, string>>({}),
    extractedSubtitlePromiseRef: useRef<Map<string, any>>(new Map()),
    autoLoadedInternalSubtitleRef: useRef(""),
    torrentStartupGraceUntilRef,
    deferredProbeTimerRef,
  };
}
