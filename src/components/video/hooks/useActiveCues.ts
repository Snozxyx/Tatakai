import { useEffect, useState } from "react";
import { sanitizeCueText } from "@/core/player/subtitle-utils";

/**
 * Watches the video's text tracks and returns the active cue text of whichever
 * track is currently enabled (mode "hidden" or "showing").
 *
 * We render subtitles ourselves in a custom overlay (see SubtitleOverlay) so we
 * can style color/opacity/outline/position freely and paint above the Anime4K
 * canvas. Tracks are set to "hidden" — the browser parses cues and fires
 * `cuechange` but does NOT paint them, avoiding double subtitles.
 *
 * `refreshKey` lets the caller force a re-scan when tracks are swapped out
 * (server switch, torrent seek, internal-track load).
 *
 * `offset` (seconds) manually shifts subtitle timing: cues are matched against
 * `currentTime + offset`. When 0 we use the browser's native `activeCues`
 * (exact, cheap); with an offset we scan `track.cues` on each time update.
 */
export function useActiveCues(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  refreshKey: unknown,
  offset: number = 0,
): string[] {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let activeTrack: TextTrack | null = null;
    const cleanups: Array<() => void> = [];

    const readCues = () => {
      const track = activeTrack;
      if (!track) {
        setLines((prev) => (prev.length ? [] : prev));
        return;
      }
      const next: string[] = [];
      if (offset === 0) {
        const active = track.activeCues;
        if (active) {
          for (let i = 0; i < active.length; i++) {
            const text = sanitizeCueText((active[i] as VTTCue).text);
            if (text) next.push(text);
          }
        }
      } else {
        const cues = track.cues;
        const vid = videoRef.current;
        if (cues && vid) {
          const t = vid.currentTime + offset;
          for (let i = 0; i < cues.length; i++) {
            const cue = cues[i] as VTTCue;
            if (cue.startTime <= t && cue.endTime > t) {
              const text = sanitizeCueText(cue.text);
              if (text) next.push(text);
            }
          }
        }
      }
      setLines((prev) =>
        prev.length === next.length && prev.every((line, idx) => line === next[idx]) ? prev : next,
      );
    };

    const pickActiveTrack = (): TextTrack | null => {
      const tracks = video.textTracks;
      // Prefer a "showing" track, else the first "hidden" one.
      for (let i = 0; i < tracks.length; i++) {
        if (tracks[i].mode === "showing") return tracks[i];
      }
      for (let i = 0; i < tracks.length; i++) {
        if (tracks[i].mode === "hidden") return tracks[i];
      }
      return null;
    };

    const bind = () => {
      // Unbind previous.
      cleanups.forEach((fn) => fn());
      cleanups.length = 0;

      activeTrack = pickActiveTrack();
      if (activeTrack) {
        const handler = () => readCues();
        activeTrack.addEventListener("cuechange", handler);
        cleanups.push(() => activeTrack?.removeEventListener("cuechange", handler));
      }
      readCues();
    };

    bind();

    // Re-bind when the set of tracks or their modes changes.
    const tracks = video.textTracks;
    const onChange = () => bind();
    tracks.addEventListener?.("change", onChange);
    tracks.addEventListener?.("addtrack", onChange);
    tracks.addEventListener?.("removetrack", onChange);

    // Fallback poll: activeCues can update without a cuechange event on some
    // MSE resets. Cheap string compare keeps this from causing renders. With a
    // non-zero offset, cuechange fires at the wrong (unshifted) time, so
    // timeupdate is the primary driver there.
    const onTimeUpdate = () => readCues();
    video.addEventListener('timeupdate', onTimeUpdate);
    const poll = window.setInterval(readCues, 400);

    return () => {
      cleanups.forEach((fn) => fn());
      tracks.removeEventListener?.("change", onChange);
      tracks.removeEventListener?.("addtrack", onChange);
      tracks.removeEventListener?.("removetrack", onChange);
      video.removeEventListener('timeupdate', onTimeUpdate);
      window.clearInterval(poll);
    };
  }, [videoRef, refreshKey, offset]);

  return lines;
}
