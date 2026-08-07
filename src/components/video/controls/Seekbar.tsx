import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { formatTime } from '@/core/player/time-utils';

interface Chapter {
  startTime: number;
  endTime: number;
  type: 'op' | 'ed' | 'recap' | 'mixed-op' | 'mixed-ed';
}

interface SeekbarProps {
  currentTime: number;
  duration: number;
  buffered: number;
  chapters?: Chapter[];
  onSeek: (time: number) => void;
  isLive?: boolean;
}

export function Seekbar({
  currentTime,
  duration,
  buffered,
  chapters = [],
  onSeek,
  isLive = false
}: SeekbarProps) {
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (buffered / duration) * 100 : 0;

  const handleSeek = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (isLive) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const percent = (clientX - rect.left) / rect.width;
    const newTime = Math.max(0, Math.min(duration, percent * duration));
    onSeek(newTime);
  };

  const chapterMarkers = useMemo(() => {
    return chapters.map((chapter, i) => {
      const left = (chapter.startTime / duration) * 100;
      const width = ((chapter.endTime - chapter.startTime) / duration) * 100;
      
      let color = 'bg-primary/40';
      if (chapter.type === 'op' || chapter.type === 'mixed-op') color = 'bg-amber-500/40';
      if (chapter.type === 'ed' || chapter.type === 'mixed-ed') color = 'bg-purple-500/40';

      return (
        <div
          key={`chapter-${i}`}
          className={cn("absolute h-full transition-colors", color)}
          style={{ left: `${left}%`, width: `${width}%` }}
          title={chapter.type.toUpperCase()}
        />
      );
    });
  }, [chapters, duration]);

  return (
    <div className="relative w-full group/seekbar select-none">
      <div
        className="relative h-1.5 md:h-2 w-full bg-white/20 rounded-full cursor-pointer overflow-hidden transition-all duration-200 group-hover/seekbar:h-2 md:group-hover/seekbar:h-2.5"
        onClick={handleSeek}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Buffered */}
        <div
          className="absolute inset-y-0 left-0 bg-white/30 transition-all duration-300"
          style={{ width: `${bufferedPercent}%` }}
        />

        {/* Chapters */}
        {!isLive && chapterMarkers}

        {/* Progress */}
        <div
          className="absolute inset-y-0 left-0 bg-primary shadow-[0_0_10px_rgba(var(--primary-rgb),0.5)] transition-all duration-100"
          style={{ width: `${progress}%` }}
        >
           {/* Thumb pulse effect */}
           <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 md:w-4 md:h-4 bg-white rounded-full scale-0 group-hover/seekbar:scale-100 transition-transform duration-200 shadow-xl border-2 border-primary" />
        </div>
      </div>
    </div>
  );
}
