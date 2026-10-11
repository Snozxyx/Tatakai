import { useCallback, useEffect, useRef } from 'react';
import { createDesktopFullscreenController, type DesktopFullscreenBridge } from '../desktopFullscreen';
import { lockFullscreenAncestors } from '../fullscreenAncestors';

function desktopBridge(): DesktopFullscreenBridge | undefined {
  return (window as unknown as { electron?: DesktopFullscreenBridge }).electron;
}

export function useDesktopPlayerFullscreen(
  containerRef: React.RefObject<HTMLDivElement | null>,
  onChange: (enabled: boolean) => void,
) {
  const controllerRef = useRef<ReturnType<typeof createDesktopFullscreenController> | null>(null);
  useEffect(() => {
    const bridge = desktopBridge();
    if (!bridge?.setFullscreen) return;
    let release: (() => void) | undefined;
    let paintedNode: HTMLDivElement | null = null;
    const controller = createDesktopFullscreenController(bridge, enabled => {
      release?.();
      release = undefined;
      if (enabled && containerRef.current) {
        paintedNode = containerRef.current;
        release = lockFullscreenAncestors(paintedNode);
        paintedNode.classList.add('is-player-fullscreen');
        document.documentElement.classList.add('app-fullscreen');
      } else {
        paintedNode?.classList.remove('is-player-fullscreen');
        document.documentElement.classList.remove('app-fullscreen');
      }
      onChange(enabled);
    });
    controllerRef.current = controller;
    const unsubscribe = bridge.onFullscreenChanged?.(enabled => controller.nativeChanged(enabled));
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void controller.exit();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      unsubscribe?.();
      document.removeEventListener('keydown', onKey);
      controller.dispose();
      controllerRef.current = null;
    };
  }, [containerRef, onChange]);

  const toggle = useCallback(() => {
    if (!containerRef.current) return Promise.resolve();
    return controllerRef.current?.toggle() ?? Promise.resolve();
  }, [containerRef]);
  return { isDesktop: !!desktopBridge()?.setFullscreen, toggle };
}
