import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, TouchEvent as ReactTouchEvent } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useMotionPreference } from '@/hooks/ui/useMotionPreference';

const EXIT_MS = 200;
const DISMISS_DY = 110;

/** Radix owns focus and modal isolation; the existing top-edge swipe stays local. */
export function PeekSheet({ open, onClose, label, children }: {
  open: boolean; onClose: () => void; label: string; children: ReactNode;
}) {
  useUiTranslation();
  const reduced = useMotionPreference();
  const [render, setRender] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [settling, setSettling] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const gesture = useRef({ startY: 0, startT: 0, dy: 0, active: false });
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (open) {
      if (!render) previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setRender(true); setLeaving(false); setDragY(0); setSettling(false);
      gesture.current.active = false;
      return;
    }
    if (!render) return;
    setLeaving(true);
    const timer = window.setTimeout(() => {
      setRender(false); setLeaving(false); setDragY(0);
    }, reduced ? 150 : EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open, render, reduced]);

  useEffect(() => {
    if (!render) return;
    const html = document.documentElement;
    const previous = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => { html.style.overflow = previous; };
  }, [render]);

  const onTouchStart = useCallback((event: ReactTouchEvent) => {
    if (leaving || (scrollRef.current?.scrollTop ?? 0) > 0) { gesture.current.active = false; return; }
    gesture.current = { startY: event.touches[0].clientY, startT: Date.now(), dy: 0, active: true };
  }, [leaving]);
  const onTouchMove = useCallback((event: ReactTouchEvent) => {
    const current = gesture.current;
    if (!current.active) return;
    current.dy = Math.max(0, event.touches[0].clientY - current.startY);
    setSettling(false); setDragY(current.dy);
  }, []);
  const onTouchEnd = useCallback(() => {
    const current = gesture.current;
    if (!current.active) return;
    current.active = false;
    const velocity = current.dy / Math.max(1, Date.now() - current.startT);
    if (current.dy > DISMISS_DY || (current.dy > 40 && velocity > .6)) closeRef.current();
    else { setDragY(0); setSettling(true); }
  }, []);
  const cancelTouch = useCallback(() => { gesture.current.active = false; setDragY(0); setSettling(true); }, []);

  if (!render) return null;
  const panelStyle: CSSProperties = reduced
    ? { transform: 'none', opacity: leaving ? 0 : 1, transition: 'opacity 150ms var(--ease-out)' }
    : leaving
      ? { transform: dragY > 0 ? 'translateY(102%)' : 'translateY(24px)', opacity: 0, transition: 'transform 200ms var(--ease-out), opacity 200ms var(--ease-out)' }
      : dragY > 0
        ? { transform: `translateY(${dragY}px)`, transition: 'none', animation: 'none' }
        : settling ? { transform: 'translateY(0)', transition: 'transform 200ms var(--ease-out)', animation: 'none' } : undefined;

  return <DialogPrimitive.Root open={render} onOpenChange={value => { if (!value) closeRef.current(); }}>
    <DialogPrimitive.Portal>
      <div className="fixed inset-0 z-[80]" role="presentation">
        <DialogPrimitive.Overlay className="peek-backdrop absolute inset-0 bg-black/60 backdrop-blur-[2px]"
          style={leaving ? { opacity: 0, transition: 'opacity 150ms var(--ease-out)' } : undefined} onClick={onClose} />
        <DialogPrimitive.Content asChild aria-describedby={undefined}
          onCloseAutoFocus={event => { event.preventDefault(); if (previousFocus.current?.isConnected) previousFocus.current.focus({ preventScroll: true }); }}>
          <div data-leaving={leaving} style={panelStyle} onTouchStart={onTouchStart} onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd} onTouchCancel={cancelTouch}
            className="peek-panel absolute inset-x-0 bottom-0 mx-auto flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-b-0 border-border bg-background shadow-2xl outline-none sm:max-w-xl">
            <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>
            <div className="relative flex h-12 shrink-0 items-start justify-center pt-3">
              <span className="h-1 w-10 rounded-full bg-muted-foreground/40" aria-hidden />
              <DialogPrimitive.Close aria-label={uiI18n.t('app.close_quick_peek_2800ccbb')} className="absolute right-2 top-1 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <X className="h-4 w-4" aria-hidden />
              </DialogPrimitive.Close>
            </div>
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>{children}</div>
          </div>
        </DialogPrimitive.Content>
      </div>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}
