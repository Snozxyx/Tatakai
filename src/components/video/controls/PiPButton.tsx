import { PictureInPicture2 } from "lucide-react";

interface PiPButtonProps {
  isPiP: boolean;
  onToggle: () => void;
}

export function PiPButton({ isPiP, onToggle }: PiPButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`p-2 rounded-lg hover:bg-white/10 transition-colors ${isPiP ? "text-primary" : ""}`}
      title="Picture in Picture"
      aria-label="Toggle Picture in Picture"
    >
      <PictureInPicture2 className="w-4 h-4 md:w-5 md:h-5" />
    </button>
  );
}
