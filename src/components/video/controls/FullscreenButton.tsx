import { Maximize, Minimize } from "lucide-react";
import { useTranslation } from "react-i18next";

interface FullscreenButtonProps {
  isFullscreen: boolean;
  onToggle: () => void;
}

export function FullscreenButton({ isFullscreen, onToggle }: FullscreenButtonProps) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onToggle}
      className="p-2 rounded-lg hover:bg-white/10 transition-colors"
      title={isFullscreen ? t('player.exitFullscreen') : t('player.fullscreen')}
    >
      {isFullscreen ? (
        <Minimize className="w-4 h-4 md:w-5 md:h-5" />
      ) : (
        <Maximize className="w-4 h-4 md:w-5 md:h-5" />
      )}
    </button>
  );
}
