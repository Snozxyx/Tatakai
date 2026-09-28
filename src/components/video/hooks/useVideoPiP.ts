import { useState, useCallback, useEffect, useRef } from "react";
import type { UseVideoPiPParams } from "../VideoPlayer.types";

/**
 * Picture-in-Picture control.
 *
 * Rewritten to fix two bugs:
 *  1. "Replays the video in watchpage" — the old code, on a SecurityError,
 *     reassigned `video.src = video.currentSrc`. For an HLS/MSE stream that
 *     tears down the MediaSource and restarts playback from 0. We NEVER touch
 *     `src` here; PiP works on the live element as-is.
 *  2. "Got stuck" — overlapping toggle calls (double click, keybind + click)
 *     could fire enter+exit concurrently and wedge the state. A `busyRef`
 *     guard makes toggle strictly serial.
 */
/** Master switch — PiP is temporarily disabled across the app. Flip to true to
 * re-enable the button, the keybind, and auto-PiP-on-tab-hide. */
const PIP_ENABLED = false;

export function useVideoPiP({ videoRef, isMobile, isPlaying }: UseVideoPiPParams) {
  const [isPiP, setIsPiP] = useState(false);
  const autoPiPDismissedRef = useRef(false);
  const busyRef = useRef(false);

  const togglePiP = useCallback(async () => {
    if (!PIP_ENABLED) return;
    const video = videoRef.current;
    if (!video) return;
    if (busyRef.current) return; // a previous enter/exit is still resolving
    busyRef.current = true;

    try {
      // In PiP anywhere → exit.
      if (document.pictureInPictureElement) {
        autoPiPDismissedRef.current = true;
        await document.exitPictureInPicture().catch(() => undefined);
        return;
      }

      if ((document as unknown as { pictureInPictureEnabled?: boolean }).pictureInPictureEnabled === false) {
        return;
      }
      if (video.disablePictureInPicture) return;

      // Needs at least metadata+a frame; if not ready yet, wait briefly.
      if (video.readyState < 2) {
        await new Promise<void>((resolve) => {
          const done = () => {
            video.removeEventListener("loadeddata", done);
            resolve();
          };
          video.addEventListener("loadeddata", done, { once: true });
          window.setTimeout(done, 3000);
        });
      }
      if (video.readyState < 2) return; // still no frame — bail rather than hang

      autoPiPDismissedRef.current = false;
      await video.requestPictureInPicture();
    } catch (err) {
      // Swallow — PiP is best-effort. Do NOT mutate src/attributes here; that
      // restarts the stream. A blocked request just leaves us inline.
      autoPiPDismissedRef.current = true;
      if (import.meta.env.DEV) {
        const e = err as { name?: string; message?: string };
        console.warn("[PiP] request failed:", e?.name, e?.message);
      }
    } finally {
      busyRef.current = false;
    }
  }, [videoRef]);

  // Mirror browser PiP state.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onEnter = () => setIsPiP(true);
    const onLeave = () => {
      setIsPiP(false);
      if (document.visibilityState === "hidden") autoPiPDismissedRef.current = true;
    };

    video.addEventListener("enterpictureinpicture", onEnter);
    video.addEventListener("leavepictureinpicture", onLeave);
    return () => {
      video.removeEventListener("enterpictureinpicture", onEnter);
      video.removeEventListener("leavepictureinpicture", onLeave);
    };
  }, [videoRef]);

  // Auto-PiP when the tab is hidden (desktop only, while playing).
  useEffect(() => {
    if (!PIP_ENABLED) return;
    if (isMobile) return;

    const handleVisibilityChange = () => {
      const video = videoRef.current;
      if (!video) return;

      if (
        document.visibilityState === "hidden" &&
        isPlaying &&
        !video.ended &&
        !video.paused &&
        !video.disablePictureInPicture &&
        !document.pictureInPictureElement &&
        !autoPiPDismissedRef.current &&
        video.readyState >= 2
      ) {
        video.requestPictureInPicture().catch(() => {
          autoPiPDismissedRef.current = true;
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [videoRef, isMobile, isPlaying]);

  // Re-arm auto-PiP when playback (re)starts.
  useEffect(() => {
    if (isPlaying) autoPiPDismissedRef.current = false;
  }, [isPlaying]);

  return { isPiP, togglePiP };
}
