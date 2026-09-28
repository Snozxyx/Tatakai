import { Play } from "lucide-react";

interface CenterPlayButtonProps {
  isVisible: boolean;
  onClick: () => void;
}

export function CenterPlayButton({ isVisible, onClick }: CenterPlayButtonProps) {
  if (!isVisible) return null;

  return (
    <button
      onClick={onClick}
      className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/50 via-transparent to-black/20"
    >
      <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-primary/90 flex items-center justify-center hover:scale-110 transition-all duration-300 shadow-2xl shadow-primary/40 backdrop-blur-sm border border-white/20">
        <Play className="w-8 h-8 md:w-10 md:h-10 text-white fill-current ml-1" />
      </div>
    </button>
  );
}
