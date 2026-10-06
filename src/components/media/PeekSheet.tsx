import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode, TouchEvent as ReactTouchEvent } from "react";
import { createPortal } from "react-dom";

const EXIT_MS = 260;
const DISMISS_DY = 110;

/**
 * Thumb-friendly bottom sheet for the quick peek: slides up with a small
 * bounce, swipes down to dismiss, closes on outside-tap / Escape.
 *
 * A bespoke sheet (instead of the app-wide Radix `Sheet`) because the peek
 * needs swipe-to-dismiss and a transform-driven drag that the dialog
 * primitive doesn't offer. Body scroll is locked while open, matching the
 * manga reader's own takeover pattern.
 */
export function PeekSheet({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
}) {
  const [render, setRender] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [settling, setSettling] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<{ startY: number; startT: number; active: boolean }>({
    startY: 0,
    startT: 0,
    active: false,
  });
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Mount on open; play the exit slide, then unmount.
  useEffect(() => {
    if (open) {
      setRender(true);
      setLeaving(false);
      setDragY(0);
      setSettling(false);
      return;
    }
    if (!render) return;
    setLeaving(true);
    const t = window.setTimeout(() => {
      setRender(false);
      setLeaving(false);
      setDragY(0);
    }, EXIT_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Lock the page scroll while the sheet is up; Escape closes.
  useEffect(() => {
    if (!render) return;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      html.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [render]);

  const onTouchStart = useCallback((e: ReactTouchEvent) => {
    const el = scrollRef.current;
    // Only a top-edge downward drag dismisses; anything else scrolls natively.
    if (el && el.scrollTop > 0) {
      gestureRef.current.active = false;
      return;
    }
    const t = e.touches[0];
    gestureRef.current = { startY: t.clientY, startT: Date.now(), active: true };
  }, []);

  const onTouchMove = useCallback((e: ReactTouchEvent) => {
    const g = gestureRef.current;
    if (!g.active) return;
    const dy = e.touches[0].clientY - g.startY;
    if (dy > 0) {
      setSettling(false);
      setDragY(dy);
    } else if (dragY !== 0) {
      setDragY(0);
    }
  }, [dragY]);

  const onTouchEnd = useCallback(() => {
    const g = gestureRef.current;
    if (!g.active) return;
    g.active = false;
    setDragY((dy) => {
      if (dy <= 0) return dy;
      const dt = Math.max(1, Date.now() - g.startT);
      const velocity = dy / dt;
      if (dy > DISMISS_DY || (dy > 40 && velocity > 0.6)) {
        // Let the exit animation take over from the finger position.
        window.setTimeout(() => closeRef.current(), 0);
        return dy;
      }
      return 0;
    });
    setSettling(true);
  }, []);

  if (!render || typeof document === "undefined") return null;

  const panelStyle: CSSProperties = leaving
    ? { transform: "translateY(102%)", transition: `transform ${EXIT_MS}ms ease-in` }
    : dragY > 0
      ? { transform: `translateY(${dragY}px)`, transition: "none" }
      : settling
        ? { transform: "translateY(0)", transition: "transform 220ms cubic-bezier(0.32, 0.9, 0.35, 1)" }
        : undefined;

  return createPortal(
    <div className="fixed inset-0 z-[80]" role="presentation">
      <div
        className="animate-peek-overlay-in absolute inset-0 bg-black/70 backdrop-blur-[2px]"
        style={leaving ? { opacity: 0, transition: `opacity ${EXIT_MS}ms ease-in` } : undefined}
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        style={panelStyle}
        className={
          "absolute inset-x-0 bottom-0 mx-auto flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-b-0 border-white/10 bg-background/95 shadow-2xl shadow-black/60 backdrop-blur-xl sm:max-w-xl " +
          (!leaving && dragY === 0 && !settling ? "animate-peek-sheet-in" : "")
        }
      >
        {/* Grabber — the swipe affordance */}
        <div className="shrink-0 cursor-grab touch-none select-none pt-2.5 active:cursor-grabbing" aria-hidden>
          <div className="mx-auto h-1.5 w-12 rounded-full bg-white/25" />
        </div>
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
