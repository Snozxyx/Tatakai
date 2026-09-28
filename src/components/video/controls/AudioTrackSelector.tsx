import { Mic } from "lucide-react";
import type { AudioTrack } from "../VideoPlayer.types";

interface AudioTrackSelectorProps {
  audioTracks: AudioTrack[];
  currentAudioTrack: number;
  showAudioMenu: boolean;
  onToggleMenu: () => void;
  onTrackChange: (trackId: number) => void;
}

export function AudioTrackSelector({
  audioTracks,
  currentAudioTrack,
  showAudioMenu,
  onToggleMenu,
  onTrackChange,
}: AudioTrackSelectorProps) {
  if (audioTracks.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={onToggleMenu}
        className={`p-2 rounded-lg hover:bg-white/10 transition-colors pointer-events-auto ${audioTracks.length > 1 ? "text-primary" : ""}`}
        title="Audio Tracks"
      >
        <Mic className="w-4 h-4 md:w-5 md:h-5" />
      </button>

      {showAudioMenu && (
        <div className="absolute bottom-full right-0 mb-2 bg-background/95 backdrop-blur-sm border border-border rounded-xl p-3 min-w-[150px] md:min-w-[180px] max-h-[300px] overflow-y-auto pointer-events-auto shadow-2xl">
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
            Audio Tracks
          </div>
          <div className="space-y-1">
            {audioTracks.map((track) => (
              <button
                key={track.id}
                onClick={() => onTrackChange(track.id)}
                className={`w-full px-3 py-1.5 text-left text-xs md:text-sm rounded-lg hover:bg-muted transition-colors ${currentAudioTrack === track.id ? "text-primary font-medium bg-primary/10" : "text-foreground"}`}
              >
                <span className="truncate block">
                  {track.label || `Track ${track.id}`} ({track.lang || "und"})
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
