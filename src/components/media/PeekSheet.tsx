import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, TouchEvent as ReactTouchEvent } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useMotionPreference } from '@/hooks/ui/useMotionPreference';
import { useIsMobile } from '@/hooks/ui/use-mobile';
import './peek-sheet.css';

const DISMISS_DY = 110;

/** Radix owns focus and modal isolation; the existing top-edge swipe stays local. */
export function PeekSheet({ open, onClose, label, children, footer }: {
  open: boolean; onClose: () => void; label: string; children: ReactNode; footer?: ReactNode;
}) {
  useUiTranslation();
  const reduced = useMotionPreference();
  const compact = useIsMobile();
  const [render, setRender] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [settling, setSettling] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
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
    }, parseFloat(panelRef.current ? getComputedStyle(panelRef.current).getPropertyValue('--peek-close-dur') : '') || 150);
    return () => window.clearTimeout(timer);
  }, [open, render, reduced, compact]);

  useEffect(() => {
    if (!render) return;
    const html = document.documentElement;
    const previous = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => { html.style.overflow = previous; };
  }, [render]);

  const onTouchStart = useCallback((event: ReactTouchEvent) => {
    if (!compact || leaving || !(event.target instanceof Element) || !event.target.closest('[data-peek-drag-handle]') || event.target.closest('button')) { gesture.current.active = false; return; }
    gesture.current = { startY: event.touches[0].clientY, startT: Date.now(), dy: 0, active: true };
  }, [leaving, compact]);
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
    ? { transform: 'none', opacity: leaving ? 0 : 1, transition: 'opacity var(--duration-quick) var(--ease-out)' }
    : leaving
      ? { transform: dragY > 0 ? 'translateY(102%)' : compact ? 'translateY(24px)' : 'translateY(var(--distance-base)) scale(var(--scale-large))', opacity: 0, animation: 'none', transition: 'transform var(--peek-close-dur) var(--peek-ease), opacity var(--peek-close-dur) var(--peek-ease)' }
      : dragY > 0
        ? { transform: `translateY(${dragY}px)`, transition: 'none', animation: 'none' }
        : settling ? { transform: 'translateY(0)', transition: 'transform var(--duration-fast) var(--peek-ease)', animation: 'none' } : undefined;

  return <DialogPrimitive.Root open={render} onOpenChange={value => { if (!value) closeRef.current(); }}>
    <DialogPrimitive.Portal>
      <div className="fixed inset-0 z-[80]" role="presentation">
        <DialogPrimitive.Overlay data-leaving={leaving} className="peek-backdrop absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
        <div className="pointer-events-none absolute inset-0 flex items-end justify-center md:items-center md:px-6 md:py-6">
        <DialogPrimitive.Content asChild aria-describedby={undefined}
          onCloseAutoFocus={event => { event.preventDefault(); if (previousFocus.current?.isConnected) previousFocus.current.focus({ preventScroll: true }); }}>
          <div ref={panelRef} data-peek-layout={compact ? 'sheet' : 'dialog'} data-leaving={leaving} style={panelStyle} onTouchStart={onTouchStart} onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd} onTouchCancel={cancelTouch}
            className="peek-panel pointer-events-auto relative mx-auto flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-b-0 border-border bg-background shadow-xl outline-none md:max-w-[640px] md:rounded-2xl md:border-b">
            <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>
            {compact && <div data-peek-drag-handle className="relative z-10 flex h-6 shrink-0 touch-none items-center justify-center"><span className="h-1 w-10 rounded-full bg-muted-foreground/40" aria-hidden /></div>}
            <DialogPrimitive.Close aria-label={uiI18n.t('app.close_quick_peek_2800ccbb')} className="absolute right-3 top-3 z-20 flex h-10 w-10 items-center justify-center rounded-lg border border-border/50 bg-background/85 text-foreground backdrop-blur-sm transition-colors hover:bg-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
              <X className="size-4" aria-hidden />
            </DialogPrimitive.Close>
            <div ref={scrollRef} data-peek-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>{children}</div>
            {footer && <div className="shrink-0">{footer}</div>}
          </div>
        </DialogPrimitive.Content>
        </div>
      </div>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}
