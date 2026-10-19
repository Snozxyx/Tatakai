import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useDesktopPlayerFullscreen } from "./useDesktopPlayerFullscreen";
import { useState, useCallback, useEffect, useRef } from "react";
import type { UseVideoFullscreenParams } from "../VideoPlayer.types";
import { lockFullscreenAncestors } from "../fullscreenAncestors";

export function useVideoFullscreen({ containerRef, isMobile }: UseVideoFullscreenParams) {
  useUiTranslation();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const desktop = useDesktopPlayerFullscreen(containerRef, setIsFullscreen);
  const fullscreenRef = useRef(false);
  const pendingRef = useRef(false);
  fullscreenRef.current = isFullscreen;
  const unlockAncestorsRef = useRef<(() => void) | null>(null);

  const releaseAncestors = useCallback(() => {
    try {
      unlockAncestorsRef.current?.();
    } catch {
      /* ignore */
    }
    unlockAncestorsRef.current = null;
  }, []);

  const lockLandscapeOnMobile = useCallback(async () => {
    if (!isMobile) return;
    try {
      const orientationApi = screen.orientation as any;
      if (orientationApi?.lock) {
        await orientationApi.lock("landscape");
      }
    } catch {
      // Some mobile browsers block orientation lock; ignore silently.
    }
  }, [isMobile]);

  const unlockOrientationOnMobile = useCallback(() => {
    if (!isMobile) return;
    try {
      if (screen.orientation?.unlock) {
        screen.orientation.unlock();
      }
    } catch {
      // Ignore unlock failures.
    }
  }, [isMobile]);

  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;

    if (desktop.isDesktop) return desktop.toggle();
    if (pendingRef.current) return;
    pendingRef.current = true;
    try {
      if (!fullscreenRef.current) {
        try {
          if (container.requestFullscreen) {
            await container.requestFullscreen();
          } else if ((container as any).webkitRequestFullscreen) {
            await Promise.resolve((container as any).webkitRequestFullscreen());
          } else {
            throw new Error(uiI18n.t('app.fullscreen_api_unavailable_a64b8e4a'));
          }
          fullscreenRef.current = true;
          setIsFullscreen(true);
        } catch {
          releaseAncestors();
          unlockAncestorsRef.current = lockFullscreenAncestors(container);
          container.classList.add("is-player-fullscreen");
          // Locks the document behind the player (scrollbar/wheel) while the
          // CSS fallback is active — see html.app-fullscreen in index.css.
          document.documentElement.classList.add("app-fullscreen");
          fullscreenRef.current = true;
          setIsFullscreen(true);
        }
        await lockLandscapeOnMobile();
      } else {
        container.classList.remove("is-player-fullscreen");
        document.documentElement.classList.remove("app-fullscreen");
        releaseAncestors();
        fullscreenRef.current = false;
        setIsFullscreen(false);
        try {
          if (document.fullscreenElement && document.exitFullscreen) {
            await document.exitFullscreen();
          } else if ((document as any).webkitFullscreenElement && (document as any).webkitExitFullscreen) {
            await Promise.resolve((document as any).webkitExitFullscreen());
          }
        } catch {
          // Ignore exit errors.
        }
        unlockOrientationOnMobile();
      }
    } finally {
      pendingRef.current = false;
    }
  }, [containerRef, desktop.isDesktop, desktop.toggle, lockLandscapeOnMobile, unlockOrientationOnMobile, releaseAncestors]);

  // Listen for fullscreen API changes
  useEffect(() => {
    if (desktop.isDesktop) return;
    const handleFullscreenChange = () => {
      const activeFullscreen =
        !!document.fullscreenElement || !!(document as any).webkitFullscreenElement;
      fullscreenRef.current = activeFullscreen;
      setIsFullscreen(activeFullscreen);
      if (!activeFullscreen) {
        containerRef.current?.classList.remove("is-player-fullscreen");
        document.documentElement.classList.remove("app-fullscreen");
        releaseAncestors();
        unlockOrientationOnMobile();
      }
    };

    const handleKeyEscape = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        containerRef.current?.classList.contains("is-player-fullscreen")
      ) {
        containerRef.current.classList.remove("is-player-fullscreen");
        releaseAncestors();
        fullscreenRef.current = false;
        setIsFullscreen(false);
        document.documentElement.classList.remove("app-fullscreen");
        unlockOrientationOnMobile();
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("keydown", handleKeyEscape);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("keydown", handleKeyEscape);
      releaseAncestors();
      containerRef.current?.classList.remove("is-player-fullscreen");
      document.documentElement.classList.remove("app-fullscreen");
    };
  }, [containerRef, desktop.isDesktop, unlockOrientationOnMobile, releaseAncestors]);

  return { isFullscreen, toggleFullscreen };
}
