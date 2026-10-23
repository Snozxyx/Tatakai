import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

/** Shared desktop/native-window and mobile DOM fullscreen lifecycle. */
export function useReaderFullscreen(
  containerRef: RefObject<HTMLDivElement>,
  autoFullscreen: boolean,
  total: number
) {
  const [isFs, setIsFs] = useState(false);

  const electronBridge = () =>
    (
      window as unknown as {
        electron?: {
          setFullscreen?: (v: boolean) => Promise<unknown>;
          onFullscreenChanged?: (
            cb: (v: boolean) => void
          ) => (() => void) | void;
        };
      }
    ).electron;

  const enterFullscreen = useCallback(async () => {
    const bridge = electronBridge();
    try {
      if (bridge?.setFullscreen) {
        await bridge.setFullscreen(true);
        document.documentElement.classList.add("app-fullscreen");
      } else {
        if (!containerRef.current?.requestFullscreen) return;
        await containerRef.current.requestFullscreen();
      }
      setIsFs(true);
    } catch {
      document.documentElement.classList.remove("app-fullscreen");
      setIsFs(false);
    }
  }, []);

  const exitFullscreen = useCallback(() => {
    const bridge = electronBridge();
    setIsFs(false);
    if (bridge?.setFullscreen) {
      document.documentElement.classList.remove("app-fullscreen");
      void bridge.setFullscreen(false).catch(() => {});
    } else if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (isFs) exitFullscreen();
    else enterFullscreen();
  }, [isFs, enterFullscreen, exitFullscreen]);

  // Sync state when leaving fullscreen via Esc, F11 or native window chrome, and
  // always drop the CSS class on unmount so the app never gets stranded fullscreen.
  useEffect(() => {
    const onFsChange = () => {
      if (!electronBridge()?.setFullscreen)
        setIsFs(document.fullscreenElement === containerRef.current);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitFullscreen();
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("keydown", onKey);
    const unsub = electronBridge()?.onFullscreenChanged?.((full: boolean) => {
      if (!full) {
        document.documentElement.classList.remove("app-fullscreen");
        setIsFs(false);
      }
    });
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("keydown", onKey);
      if (typeof unsub === "function") unsub();
      document.documentElement.classList.remove("app-fullscreen");
    };
  }, [exitFullscreen]);

  const autoFsRef = useRef(false);
  useEffect(() => {
    if (autoFullscreen && !autoFsRef.current && total > 0) {
      autoFsRef.current = true;
      enterFullscreen();
    }
  }, [autoFullscreen, total, enterFullscreen]);

  const [fullscreenExitVisible, setFullscreenExitVisible] = useState(true);
  useEffect(() => {
    if (!isFs) {
      setFullscreenExitVisible(true);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const reveal = () => {
      setFullscreenExitVisible(true);
      clearTimeout(timer);
      timer = setTimeout(() => setFullscreenExitVisible(false), 2500);
    };
    reveal();
    window.addEventListener("pointermove", reveal);
    window.addEventListener("pointerdown", reveal);
    window.addEventListener("keydown", reveal);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", reveal);
      window.removeEventListener("pointerdown", reveal);
      window.removeEventListener("keydown", reveal);
    };
  }, [isFs]);

  return {
    isFs,
    enterFullscreen,
    exitFullscreen,
    toggleFullscreen,
    fullscreenExitVisible,
  };
}
