import uiI18n from '@/lib/uiI18n';
import { Camera } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

interface ScreenshotButtonProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  animeName?: string;
  episodeNumber?: number;
}

export function ScreenshotButton({ videoRef, animeName, episodeNumber }: ScreenshotButtonProps) {
  const { t } = useTranslation();
  const handleScreenshot = () => {
    if (!videoRef.current) return;

    try {
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(videoRef.current, 0, 0);

      canvas.toBlob((blob) => {
        if (!blob) return;

        const timestamp = new Date()
          .toLocaleString(uiI18n.language, {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
          .replace(/[/,: ]/g, "-");
        const filename = `screenshot-${animeName || "anime"}-ep${episodeNumber || "?"}-${timestamp}.png`;

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        toast.success(t('player.screenshotSaved', { filename }));
      }, "image/png");
    } catch (err) {
      console.error("Screenshot failed:", err);
      toast.error(t('player.screenshotFailed'));
    }
  };

  return (
    <button
      onClick={handleScreenshot}
      className="p-2 rounded-lg hover:bg-white/10 transition-colors"
      title={t('player.takeScreenshot')}
    >
      <Camera className="w-4 h-4 md:w-5 md:h-5" />
    </button>
  );
}
