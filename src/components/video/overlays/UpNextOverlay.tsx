import { Play, X } from "lucide-react";

/**
 * Up-Next countdown overlay shown when an episode ends and Auto Next Episode is
 * on. Sits above the player (below the settings sheet) and gives the viewer a
 * few seconds — with a live ring countdown — to either jump straight to the
 * next episode ("Play now") or cancel the auto-advance and stay put.
 *
 * Purely presentational: the parent owns the countdown timer and passes the
 * current `secondsLeft` / `total`. `onPlayNow` advances immediately;
 * `onCancel` dismisses the overlay without advancing.
 */
export interface UpNextOverlayProps {
  secondsLeft: number;
  total: number;
  title?: string;
  thumbnail?: string;
  episodeNumber?: number;
  onPlayNow: () => void;
  onCancel: () => void;
}

const RING_RADIUS = 22;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function UpNextOverlay({
  secondsLeft,
  total,
  title,
  thumbnail,
  episodeNumber,
  onPlayNow,
  onCancel,
}: UpNextOverlayProps) {
  const clampedTotal = Math.max(1, total);
  const progress = Math.min(1, Math.max(0, secondsLeft / clampedTotal));
  const dashOffset = RING_CIRCUMFERENCE * (1 - progress);

  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-end justify-end p-4 md:p-6">
      <div className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-black/80 shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        <div className="flex items-stretch gap-3 p-3">
          {thumbnail ? (
            <div className="relative shrink-0 overflow-hidden rounded-lg">
              <img
                src={thumbnail}
                alt=""
                className="h-20 w-32 object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <Play className="h-6 w-6 text-white drop-shadow" fill="currentColor" />
              </div>
            </div>
          ) : (
            <div className="relative flex h-20 w-32 shrink-0 items-center justify-center">
              <svg viewBox="0 0 52 52" className="h-14 w-14 -rotate-90">
                <circle
                  cx="26"
                  cy="26"
                  r={RING_RADIUS}
                  fill="none"
                  stroke="rgba(255,255,255,0.15)"
                  strokeWidth="4"
                />
                <circle
                  cx="26"
                  cy="26"
                  r={RING_RADIUS}
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={RING_CIRCUMFERENCE}
                  strokeDashoffset={dashOffset}
                  style={{ transition: "stroke-dashoffset 1s linear" }}
                />
              </svg>
              <span className="absolute text-lg font-bold tabular-nums text-white">
                {secondsLeft}
              </span>
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col justify-center">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
              Up Next{thumbnail ? ` · ${secondsLeft}s` : ""}
            </p>
            <p className="truncate text-sm font-semibold text-white">
              {typeof episodeNumber === "number" ? `Episode ${episodeNumber}` : "Next Episode"}
            </p>
            {title && (
              <p className="truncate text-xs text-white/60">{title}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-white/10 p-2">
          <button
            type="button"
            onClick={onPlayNow}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Play className="h-4 w-4" fill="currentColor" />
            Play now
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
          >
            <X className="h-4 w-4" />
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
