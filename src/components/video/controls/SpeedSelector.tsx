import { Settings } from "lucide-react";

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

interface SpeedSelectorProps {
  playbackRate: number;
  showSettings: boolean;
  onToggleMenu: () => void;
  onRateChange: (rate: number) => void;
}

export function SpeedSelector({
  playbackRate,
  showSettings,
  onToggleMenu,
  onRateChange,
}: SpeedSelectorProps) {
  return (
    <div className="relative">
      <button
        onClick={onToggleMenu}
        className="p-2 rounded-lg hover:bg-white/10 transition-colors"
        title="Playback Speed"
      >
        <Settings className="w-4 h-4 md:w-5 md:h-5" />
      </button>

      {showSettings && (
        <div className="absolute bottom-full right-0 mb-2 bg-background/95 backdrop-blur-sm border border-border rounded-xl p-2 min-w-[100px] md:min-w-[120px] shadow-2xl">
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-2 py-1 mb-1">
            Speed
          </div>
          {SPEED_OPTIONS.map((rate) => (
            <button
              key={rate}
              onClick={() => onRateChange(rate)}
              className={`w-full px-3 py-1.5 text-left text-xs md:text-sm rounded-lg hover:bg-muted transition-colors ${playbackRate === rate ? "text-primary font-medium bg-primary/10" : "text-foreground"}`}
            >
              {rate}x
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
