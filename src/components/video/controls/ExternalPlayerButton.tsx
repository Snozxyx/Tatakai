import { MonitorPlay } from "lucide-react";
import { toast } from "sonner";

interface ExternalPlayerButtonProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  externalPlayerPath: string | null;
  currentSourceUrl?: string;
  isPlaying: boolean;
  animeName?: string;
  episodeNumber?: number;
  episodeTitle?: string;
}

export function ExternalPlayerButton({
  videoRef,
  externalPlayerPath,
  currentSourceUrl,
  isPlaying,
  animeName,
  episodeNumber,
  episodeTitle,
}: ExternalPlayerButtonProps) {
  const handleLaunchExternal = async () => {
    if (!externalPlayerPath || !currentSourceUrl) return;

    try {
      const rt = (window as any).tatakaiRuntime;
      const res = await rt.launchExternalPlayer({
        executablePath: externalPlayerPath,
        streamUrl: currentSourceUrl,
        options: {
          startTime: videoRef.current?.currentTime || 0,
          title: `${animeName || "Tatakai"} - ${episodeNumber ? `Episode ${episodeNumber}` : ""} ${episodeTitle || ""}`.trim(),
        },
      });

      if (res.success) {
        toast.success(`Launched ${res.player || "external player"}`);
        if (isPlaying) videoRef.current?.pause();
      } else {
        toast.error(res.error || "Failed to launch external player");
      }
    } catch (err: any) {
      toast.error(err.message || "Error launching external player");
    }
  };

  if (!externalPlayerPath || !currentSourceUrl) return null;

  return (
    <button
      onClick={handleLaunchExternal}
      className="p-2 rounded-lg hover:bg-white/10 transition-colors text-blue-400"
      title="Play in External Player"
    >
      <MonitorPlay className="w-4 h-4 md:w-5 md:h-5" />
    </button>
  );
}
