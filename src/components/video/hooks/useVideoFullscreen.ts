import { useState, useCallback, useEffect } from "react";
import type { UseVideoFullscreenParams } from "../VideoPlayer.types";

export function useVideoFullscreen({ containerRef, isMobile }: UseVideoFullscreenParams) {
  const [isFullscreen, setIsFullscreen] = useState(false);

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

    const isElectron =
      typeof window !== "undefined" && !!(window as any).electron?.setFullscreen;

    if (!isFullscreen) {
      if (isElectron) {
        container.classList.add("is-player-fullscreen");
        setIsFullscreen(true);
        try {
          await (window as any).electron.setFullscreen(true);
          document.documentElement.classList.add("app-fullscreen");
        } catch {
          // CSS fullscreen still works even if IPC fails
        }
      } else {
        try {
          if (container.requestFullscreen) {
            await container.requestFullscreen();
          } else if ((container as any).webkitRequestFullscreen) {
            await Promise.resolve((container as any).webkitRequestFullscreen());
          } else {
            container.classList.add("is-player-fullscreen");
            setIsFullscreen(true);
          }
        } catch {
          container.classList.add("is-player-fullscreen");
          setIsFullscreen(true);
        }
      }

      await lockLandscapeOnMobile();
    } else {
      container.classList.remove("is-player-fullscreen");
      setIsFullscreen(false);

      if (isElectron) {
        document.documentElement.classList.remove("app-fullscreen");
        try {
          await (window as any).electron.setFullscreen(false);
        } catch {
          // Ignore
        }
      } else {
        try {
          if (document.fullscreenElement && document.exitFullscreen) {
            await document.exitFullscreen();
          } else if (
            (document as any).webkitFullscreenElement &&
            (document as any).webkitExitFullscreen
          ) {
            await Promise.resolve((document as any).webkitExitFullscreen());
          }
        } catch {
          // Ignore exit errors
        }
      }

      unlockOrientationOnMobile();
    }
  }, [containerRef, isFullscreen, isMobile, lockLandscapeOnMobile, unlockOrientationOnMobile]);

  // Listen for fullscreen API changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      const activeFullscreen =
        !!document.fullscreenElement || !!(document as any).webkitFullscreenElement;
      setIsFullscreen(activeFullscreen);
      if (!activeFullscreen) {
        containerRef.current?.classList.remove("is-player-fullscreen");
        unlockOrientationOnMobile();
      }
    };

    const handleKeyEscape = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        containerRef.current?.classList.contains("is-player-fullscreen")
      ) {
        containerRef.current.classList.remove("is-player-fullscreen");
        setIsFullscreen(false);
        document.documentElement.classList.remove("app-fullscreen");
        const bridge = (window as any).electron;
        if (bridge?.setFullscreen) {
          void bridge.setFullscreen(false);
        }
        unlockOrientationOnMobile();
      }
    };

    const handleElectronFullscreenChange = (isFull: boolean) => {
      if (!isFull && containerRef.current?.classList.contains("is-player-fullscreen")) {
        containerRef.current.classList.remove("is-player-fullscreen");
        document.documentElement.classList.remove("app-fullscreen");
        setIsFullscreen(false);
        unlockOrientationOnMobile();
      }
    };

    const unsubFullscreen = (window as any).electron?.onFullscreenChanged?.(
      handleElectronFullscreenChange,
    );

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("keydown", handleKeyEscape);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("keydown", handleKeyEscape);
      unsubFullscreen?.();
    };
  }, [containerRef, unlockOrientationOnMobile]);

  return { isFullscreen, toggleFullscreen };
}
