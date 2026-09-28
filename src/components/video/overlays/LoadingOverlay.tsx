import { Play } from "lucide-react";

interface LoadingOverlayProps {
  isVisible: boolean;
  serverName?: string;
}

export function LoadingOverlay({ isVisible, serverName }: LoadingOverlayProps) {
  if (!isVisible) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="w-16 h-16 md:w-20 md:h-20 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Play className="w-6 h-6 md:w-8 md:h-8 text-primary/70" />
          </div>
        </div>
        <span className="text-sm md:text-base text-white/80 font-medium">
          {serverName ? `Loading ${serverName}...` : "Loading..."}
        </span>
      </div>
    </div>
  );
}
