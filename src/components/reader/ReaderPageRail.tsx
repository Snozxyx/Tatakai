import { useEffect, useRef, useState, type PointerEvent } from 'react';
import uiI18n from '@/lib/uiI18n';
import './reader-page-rail.css';

/** A single tab stop keeps even very long webtoon chapters easy to navigate. */
export function ReaderPageRail({ page, total, onPage }: {
  page: number;
  total: number;
  onPage(page: number): void;
}) {
  const [preview, setPreview] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const frame = useRef(0);
  const pending = useRef<number | null>(null);
  const lastPage = useRef<number | null>(null);
  const trackBounds = useRef<DOMRect | null>(null);
  const onPageRef = useRef(onPage);
  onPageRef.current = onPage;
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const commit = (next: number) => {
    if (lastPage.current === next) return;
    lastPage.current = next;
    onPageRef.current(next);
  };
  const queuePage = (next: number) => {
    pending.current = next;
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const next = pending.current;
      pending.current = null;
      if (next !== null) {
        setPreview(next);
        commit(next);
      }
    });
  };
  const endDrag = () => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    pending.current = null;
    trackBounds.current = null;
    setDragging(false);
    setPreview(null);
  };
  if (total < 1) return null;
  const current = Math.max(0, Math.min(total - 1, page));
  const shown = preview ?? current;
  const pageAt = (event: PointerEvent<HTMLDivElement>) => {
    const rect = trackBounds.current ?? event.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(total - 1, Math.floor((event.clientY - rect.top) / Math.max(1, rect.height) * total)));
  };
  return (
    <div className="reader-page-rail">
      <div
        role="slider"
        tabIndex={0}
        aria-label={uiI18n.t('app.jump_to_page_8a8ded94')}
        aria-orientation="vertical"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={shown + 1}
        aria-valuetext={uiI18n.t('app.page_i18n_value_0_i18n_value_1_dd00d973', { value0: shown + 1, value1: total })}
        className="reader-page-rail-track"
        data-dragging={dragging || undefined}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          setDragging(true);
          event.currentTarget.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          trackBounds.current = event.currentTarget.getBoundingClientRect();
          lastPage.current = null;
          const next = pageAt(event);
          setPreview(next);
          commit(next);
        }}
        onPointerMove={(event) => {
          const next = pageAt(event);
          if (event.currentTarget.hasPointerCapture(event.pointerId)) queuePage(next);
          else setPreview(next);
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            commit(pageAt(event));
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          endDrag();
        }}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onPointerLeave={() => { if (!dragging) setPreview(null); }}
        onKeyDown={(event) => {
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? total - 1
            : event.key === 'ArrowDown' || event.key === 'ArrowRight' ? current + 1
            : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? current - 1
            : event.key === 'PageDown' ? current + 10 : event.key === 'PageUp' ? current - 10 : null;
          if (next === null) return;
          event.preventDefault();
          event.stopPropagation();
          onPage(Math.max(0, Math.min(total - 1, next)));
        }}
      >
        <div className="reader-page-rail-segments" aria-hidden="true">
          {Array.from({ length: Math.min(total, 300) }, (_, index) => (
            <span key={index} className={index / Math.min(total, 300) <= current / total ? 'bg-primary/60' : 'bg-muted'} />
          ))}
        </div>
        <span aria-hidden="true" className="reader-page-rail-marker" style={{ top: `${(shown + 0.5) / total * 100}%` }} />
        <span aria-hidden="true" className="reader-page-rail-label" style={{ top: `clamp(12px, ${(shown + 0.5) / total * 100}%, calc(100% - 12px))` }}>
          {shown + 1}<span className="reader-page-rail-total"> / {total}</span>
        </span>
      </div>
    </div>
  );
}
