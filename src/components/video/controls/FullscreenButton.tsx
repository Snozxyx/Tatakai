import { Maximize, Minimize } from "lucide-react";

interface FullscreenButtonProps {
  isFullscreen: boolean;
  onToggle: () => void;
}

export function FullscreenButton({ isFullscreen, onToggle }: FullscreenButtonProps) {
  return (
    <button
      onClick={onToggle}
      className="p-2 rounded-lg hover:bg-white/10 transition-colors"
      title="Toggle Fullscreen (F)"
    >
      {isFullscreen ? (
        <Minimize className="w-4 h-4 md:w-5 md:h-5" />
      ) : (
        <Maximize className="w-4 h-4 md:w-5 md:h-5" />
      )}
    </button>
  );
}
