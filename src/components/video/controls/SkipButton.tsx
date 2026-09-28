import { FastForward } from "lucide-react";
import type { ActiveSkip } from "../VideoPlayer.types";

interface SkipButtonProps {
  activeSkip: ActiveSkip | null;
  timelineSeekingLocked: boolean;
  onSkip: () => void;
  getSkipLabel: (type: string) => string;
}

export function SkipButton({
  activeSkip,
  timelineSeekingLocked,
  onSkip,
  getSkipLabel,
}: SkipButtonProps) {
  if (!activeSkip) return null;

  return (
    <button
      onClick={onSkip}
      className={`absolute bottom-24 md:bottom-28 right-4 md:right-6 px-5 py-3 md:px-6 md:py-3.5 rounded-xl bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 text-white font-bold flex items-center gap-2.5 shadow-2xl transition-all animate-in slide-in-from-right-5 z-20 skip-button-glow border border-white/20 ${timelineSeekingLocked ? "cursor-not-allowed opacity-60" : "hover:scale-105"}`}
    >
      <FastForward className="w-5 h-5 md:w-6 md:h-6" />
      <span className="text-sm md:text-base uppercase tracking-wide">
        {getSkipLabel(activeSkip.skipType)}
      </span>
    </button>
  );
}
