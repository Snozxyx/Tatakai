import { formatTime } from "@/core/player/time-utils";

interface TimeDisplayProps {
  currentTime: number;
  duration: number;
  timelineUiHidden: boolean;
}

export function TimeDisplay({ currentTime, duration, timelineUiHidden }: TimeDisplayProps) {
  if (timelineUiHidden) return null;

  return (
    <div className="flex items-center gap-1.5 ml-2 px-2.5 py-1.5 rounded-lg bg-white/10 backdrop-blur-sm">
      <span className="text-xs md:text-sm font-medium text-white/90">
        {formatTime(currentTime)}
      </span>
      <span className="text-white/40">/</span>
      <span className="text-xs md:text-sm text-white/60">{formatTime(duration)}</span>
    </div>
  );
}
