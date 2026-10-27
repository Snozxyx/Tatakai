import { useRef, useState, type CSSProperties } from 'react';
import { formatTime } from '@/core/player/time-utils';

/** Preview while dragging, then seek once so torrent/proxy requests do not pile up. */
export function PlayerSeekInput({ currentTime, duration, buffered = 0, onSeek, onScrubbingChange, className, disabled, label }: {
  currentTime: number; duration: number; buffered?: number; onSeek: (time: number) => void;
  onScrubbingChange?: (active: boolean) => void; className?: string; disabled?: boolean; label: string;
}) {
  const [preview, setPreview] = useState<number | null>(null);
  const dragging = useRef(false);
  const maximum = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const value = Math.min(maximum, Math.max(0, preview ?? (Number.isFinite(currentTime) ? currentTime : 0)));
  const finish = (time?: number) => {
    if (!dragging.current) return;
    dragging.current = false;
    if (time !== undefined) onSeek(time);
    setPreview(null);
    onScrubbingChange?.(false);
  };
  return <>
    <input type="range" aria-label={label} aria-valuetext={`${formatTime(value)} / ${formatTime(maximum)}`}
      min={0} max={maximum} step={0.1} value={value} disabled={disabled || !maximum}
      className={className} data-player-interactive="true"
      style={{ '--seek-progress': `${maximum ? value / maximum * 100 : 0}%`, '--seek-buffered': `${maximum ? Math.min(100, buffered / maximum * 100) : 0}%` } as CSSProperties}
      onPointerDown={event => {
        event.stopPropagation(); dragging.current = true; setPreview(value); onScrubbingChange?.(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onChange={event => {
        const next = Number(event.currentTarget.value);
        if (dragging.current) setPreview(next); else onSeek(next);
      }}
      onPointerUp={event => { event.stopPropagation(); finish(Number(event.currentTarget.value)); }}
      onPointerCancel={() => finish()}
      onLostPointerCapture={() => finish()}
      onBlur={event => finish(Number(event.currentTarget.value))}
      onClick={event => event.stopPropagation()}
      onKeyDown={event => event.stopPropagation()} />
    {preview !== null && <output className="pointer-events-none absolute bottom-full left-1/2 mb-3 -translate-x-1/2 rounded-md bg-black/90 px-3 py-1.5 text-sm tabular-nums text-white">{formatTime(value)}</output>}
  </>;
}
