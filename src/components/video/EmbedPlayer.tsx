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
    // Force iframe reload
    const iframe = document.querySelector('iframe[data-embed-player]') as HTMLIFrameElement;
    if (iframe) {
      iframe.src = iframe.src;
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
        onLoad={handleLoad}
        onError={handleError}
        referrerPolicy="origin"
        sandbox="allow-scripts allow-same-origin allow-forms"
        title="Anime Video Player"
      />
    </div>
  );
}
