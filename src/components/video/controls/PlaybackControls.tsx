import uiI18n from '@/lib/uiI18n';
import { useTranslation as useUiTranslation } from 'react-i18next';
import { Play, Pause, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import { useTranslation } from "react-i18next";

interface PlaybackControlsProps {
  isPlaying: boolean;
  isLive: boolean;
  timelineSeekingLocked: boolean;
  timelineUiHidden: boolean;
  onTogglePlay: () => void;
  onRefresh: () => void;
  onSkip: (seconds: number) => void;
}

export function PlaybackControls({
  isPlaying,
  isLive,
  timelineSeekingLocked,
  timelineUiHidden,
  onTogglePlay,
  onRefresh,
  onSkip,
}: PlaybackControlsProps) {
  useUiTranslation();
  const { t } = useTranslation();
  return (
    <>
      <button
        onClick={onTogglePlay}
        aria-label={isPlaying ? t('player.pause') : t('player.play')}
        className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all video-controls-btn"
      >
        {isPlaying ? (
          <Pause className="w-5 h-5 md:w-6 md:h-6" />
        ) : (
          <Play className="w-5 h-5 md:w-6 md:h-6 fill-current" />
        )}
      </button>

      <button
        onClick={onRefresh}
        className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all video-controls-btn group"
        title={t('player.refreshStream')}
        aria-label={t('player.refreshStream')}
      >
        <RotateCcw className="w-4 h-4 md:w-5 md:h-5 group-active:-rotate-180 transition-transform duration-500" />
      </button>

      {!isLive && !timelineUiHidden && (
        <>
          <button
            onClick={() => onSkip(-10)}
            aria-label={t('migration.rewind')}
            disabled={timelineSeekingLocked}
            className={`p-2 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all hidden sm:flex video-controls-btn ${timelineSeekingLocked ? "cursor-not-allowed opacity-50 hover:bg-white/10" : ""}`}
          >
            <SkipBack className="w-4 h-4 md:w-5 md:h-5" />
          </button>

          <button
            onClick={() => onSkip(10)}
            aria-label={t('migration.forward')}
            disabled={timelineSeekingLocked}
            className={`p-2 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all hidden sm:flex video-controls-btn ${timelineSeekingLocked ? "cursor-not-allowed opacity-50 hover:bg-white/10" : ""}`}
          >
            <SkipForward className="w-4 h-4 md:w-5 md:h-5" />
          </button>
        </>
      )}
    </>
  );
}
