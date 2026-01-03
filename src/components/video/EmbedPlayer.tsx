import { useState } from "react";
import { Loader2, AlertCircle, RefreshCw } from "lucide-react";

interface EmbedPlayerProps {
  url: string;
  poster?: string;
  language?: string;
  onError?: () => void;
}

export function EmbedPlayer({ url, poster, language, onError }: EmbedPlayerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  const handleLoad = () => {
    setIsLoading(false);
  };

  const handleError = () => {
    setIsLoading(false);
    setError(true);
    onError?.();
  };

  const handleRetry = () => {
    setIsLoading(true);
    setError(false);
    // Force iframe reload by clearing and resetting src
    const iframe = document.querySelector('iframe[data-embed-player]') as HTMLIFrameElement;
    if (iframe) {
      const currentSrc = iframe.src;
      iframe.src = 'about:blank';
      requestAnimationFrame(() => {
        iframe.src = currentSrc;
      });
    }
  };

  // Prevent iframe from navigating parent window or opening popups
  const handleIframeLoad = (e: React.SyntheticEvent<HTMLIFrameElement>) => {
    handleLoad();
    
    try {
      const iframe = e.currentTarget;
      
      // Prevent navigation redirects by monitoring iframe location changes
      const checkNavigation = setInterval(() => {
        try {
          // This will throw if cross-origin, which is expected and fine
          if (iframe.contentWindow) {
            // Block any attempts to navigate the parent window
            iframe.contentWindow.parent = iframe.contentWindow;
            iframe.contentWindow.top = iframe.contentWindow;
          }
        } catch {
          // Cross-origin access blocked - this is expected and safe
        }
      }, 100);

      // Clean up interval after 5 seconds (most ad redirects happen quickly)
      setTimeout(() => clearInterval(checkNavigation), 5000);
    } catch {
      // Ignore cross-origin errors
    }
  };

  if (error) {
    return (
      <div 
        className="w-full aspect-video bg-black flex flex-col items-center justify-center text-white"
        style={{ backgroundImage: poster ? `url(${poster})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }}
      >
        <div className="bg-black/80 p-6 rounded-xl flex flex-col items-center gap-4">
          <AlertCircle className="w-12 h-12 text-red-500" />
          <p className="text-lg">Failed to load embed player</p>
          <button
            onClick={handleRetry}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/80 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-video bg-black">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p className="text-white/70 text-sm">
              Loading {language ? `${language} ` : ''}player...
            </p>
          </div>
        </div>
      )}
      <iframe
        data-embed-player
        src={url}
        className="w-full h-full border-0"
        allowFullScreen
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        onLoad={handleIframeLoad}
        onError={handleError}
        referrerPolicy="no-referrer"
        title="Anime Video Player"
      />
    </div>
  );
}
