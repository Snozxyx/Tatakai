import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { PictureInPicture2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface PiPButtonProps {
  isPiP: boolean;
  onToggle: () => void;
}

export function PiPButton({ isPiP, onToggle }: PiPButtonProps) {
  useUiTranslation();
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`p-2 rounded-lg hover:bg-white/10 transition-colors ${isPiP ? "text-primary" : ""}`}
      title={t('player.pictureInPicture')}
      aria-label={t('player.pictureInPicture')}
    >
      <PictureInPicture2 className="w-4 h-4 md:w-5 md:h-5" />
    </button>
  );
}
