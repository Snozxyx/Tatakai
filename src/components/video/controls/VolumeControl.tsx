import { Volume2, VolumeX } from "lucide-react";

interface VolumeControlProps {
  volume: number;
  isMuted: boolean;
  onToggleMute: () => void;
  onVolumeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function VolumeControl({
  volume,
  isMuted,
  onToggleMute,
  onVolumeChange,
}: VolumeControlProps) {
  return (
    <div className="hidden md:flex items-center gap-2 group/volume ml-1">
      <button
        onClick={onToggleMute}
        className="p-2 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all video-controls-btn"
      >
        {isMuted || volume === 0 ? (
          <VolumeX className="w-5 h-5" />
        ) : (
          <Volume2 className="w-5 h-5" />
        )}
      </button>

      <div className="w-0 group-hover/volume:w-24 overflow-hidden transition-all duration-300">
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={isMuted ? 0 : volume}
          onChange={onVolumeChange}
          className="w-24 h-1.5 accent-primary cursor-pointer bg-white/20 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
        />
      </div>
    </div>
  );
}
