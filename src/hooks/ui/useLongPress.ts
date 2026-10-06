import { useCallback, useEffect, useRef } from "react";
import { triggerHaptic } from "@/lib/haptics";

interface UseLongPressOptions {
  /** Called once when the press passes the delay without moving away. */
  onLongPress: (e: React.PointerEvent | React.MouseEvent) => void;
  /** Hold duration before firing. Default 550ms. */
  delay?: number;
  /** Pointer drift (px) that cancels the press (scroll/slide). Default 12. */
  moveTolerance?: number;
  /** Fire a haptic tick when the long-press triggers. Default true. */
  haptic?: boolean;
  disabled?: boolean;
}

interface LongPressHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  onPointerLeave: (e: React.PointerEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onClickCapture: (e: React.MouseEvent) => void;
}

/**
 * Long-press / right-click hook for media cards.
 *
 * Pointer-based so it works for touch (hold) and mouse, and coexists with
 * scrolling: any drift past `moveTolerance` (i.e. the start of a scroll or
 * swipe) cancels the timer. When the press fires, the click that follows a
 * touch hold is swallowed via `onClickCapture` so the card doesn't navigate.
 * On desktop, right-click opens the same action (with the native menu
 * suppressed on the card).
 */
export function useLongPress({
  onLongPress,
  delay = 550,
  moveTolerance = 12,
  haptic = true,
  disabled = false,
}: UseLongPressOptions): LongPressHandlers {
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);
  const lastFiredAtRef = useRef(0);
  const cbRef = useRef(onLongPress);
  cbRef.current = onLongPress;

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      if (e.isPrimary === false) return;
      // Mouse: only the main button starts a hold; the right button is
      // handled by onContextMenu.
      if (e.pointerType === "mouse" && e.button !== 0) return;
      firedRef.current = false;
      startRef.current = { x: e.clientX, y: e.clientY };
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      const target = e.currentTarget as HTMLElement;
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        startRef.current = null;
        firedRef.current = true;
        lastFiredAtRef.current = Date.now();
        if (haptic) void triggerHaptic("medium");
        cbRef.current(e);
        // Release any implicit pointer capture so the ensuing pointerup
        // can't turn into a click on the wrapped link.
        try {
          if (target.hasPointerCapture?.(e.pointerId)) target.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }, delay);
    },
    [delay, disabled, haptic],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!startRef.current || timerRef.current == null) return;
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      if (Math.hypot(dx, dy) > moveTolerance) clearTimer();
    },
    [clearTimer, moveTolerance],
  );

  const cancel = useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      // Desktop right-click = same quick-peek action.
      e.preventDefault();
      e.stopPropagation();
      if (haptic) void triggerHaptic("medium");
      firedRef.current = true;
      lastFiredAtRef.current = Date.now();
      cbRef.current(e);
    },
    [disabled, haptic],
  );

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    // Swallow the tap that ends a touch hold (and any click right after a
    // context-menu open) so a long-press never navigates.
    if (firedRef.current || Date.now() - lastFiredAtRef.current < 600) {
      e.preventDefault();
      e.stopPropagation();
      firedRef.current = false;
    }
  }, []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onContextMenu,
    onClickCapture,
  };
}
