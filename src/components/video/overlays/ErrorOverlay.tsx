import { AlertCircle, RefreshCw, RotateCcw } from "lucide-react";

interface ErrorOverlayProps {
  videoError: string;
  isOffline: boolean;
  isBuffering: boolean;
  videoSrc?: string;
  videoErrorObj?: MediaError | null;
  onRetry: () => void;
  onRefresh: () => void;
  onServerSwitch?: () => void;
}

export function ErrorOverlay({
  videoError,
  isOffline,
  isBuffering,
  videoSrc,
  videoErrorObj,
  onRetry,
  onRefresh,
  onServerSwitch,
}: ErrorOverlayProps) {
  if (!videoError) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/90 backdrop-blur-sm z-50">
      <div className="flex flex-col items-center gap-4 text-center p-6 md:p-10 max-w-md">
        <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-destructive/20 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 md:w-10 md:h-10 text-destructive" />
        </div>
        <p className="text-base md:text-lg text-white font-semibold">{videoError}</p>

        {isOffline && (
          <div className="text-xs text-white/50 bg-black/50 p-2 rounded mt-2 font-mono break-all max-w-[300px]">
            Debug: {videoSrc || "No Source"} <br />
            Error: {videoErrorObj?.message || videoErrorObj?.code || "Unknown"}
          </div>
        )}

        <p className="text-sm text-white/60">
          {videoError.toLowerCase().includes("auto-switching") ||
          videoError.toLowerCase().includes("switching server")
            ? "Auto-switching to the next server in 3 seconds..."
            : videoError.toLowerCase().includes("retrying")
              ? "Retrying automatically..."
              : "Automatic server failover is enabled."}
        </p>

        <div className="flex flex-col sm:flex-row gap-3 mt-2">
          <button
            onClick={onRetry}
            className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed backdrop-blur-sm flex items-center justify-center gap-2 transition-all font-medium video-controls-btn"
            disabled={isBuffering}
          >
            <RefreshCw className="w-4 h-4" />
            Retry Current Server
          </button>

          <button
            onClick={onRefresh}
            className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm flex items-center justify-center gap-2 transition-all font-medium video-controls-btn"
          >
            <RotateCcw className="w-4 h-4" />
            Refresh Player
          </button>

          {onServerSwitch && (
            <button
              onClick={onServerSwitch}
              className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/80 text-primary-foreground flex items-center justify-center gap-2 transition-all font-medium shadow-lg shadow-primary/30"
            >
              Switch Server
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
