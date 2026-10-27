import { useCallback, useRef, useEffect, useState } from "react";
import type { UseControlsVisibilityParams } from "../VideoPlayer.types";

export function useControlsVisibility({ isPlaying, isMobile }: UseControlsVisibilityParams) {
  const showControlsRef = useRef(true);
  const [, renderControls] = useState(true);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Expose getter for the current value
  const getShowControls = useCallback(() => showControlsRef.current, []);

  const setShowControls = useCallback((value: boolean) => {
    if (!value && document.activeElement?.matches(':focus-visible') && document.activeElement.closest('.video-controls-gradient')) return;
    if (showControlsRef.current === value) return;
    showControlsRef.current = value;
    renderControls(value);
  }, []);

  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);

    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }

    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 3000);
  }, [isPlaying, setShowControls]);

  // Auto-hide when playback starts
  useEffect(() => {
    if (isPlaying && !isMobile) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    } else if (!isPlaying) {
      setShowControls(true);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    }

    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [isPlaying, isMobile, setShowControls]);

  return {
    showControls: showControlsRef.current,
    getShowControls,
    setShowControls,
    showControlsTemporarily,
  };
}
