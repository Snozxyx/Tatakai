import { Play, BookOpen, Star, Film } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useNavigate } from "react-router-dom";
import { getProxiedImageUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface UnifiedMediaCardProps {
  item: {
    id: string; // The specific ID used for routing (malId, anilistId, or pure string id)
    name: string;
    poster: string;
    type?: string; 
    status?: string;
    rating?: string | number;
    episodes?: { sub?: number; dub?: number }; // For anime
    chapters?: number; // For manga
    mediaType: 'anime' | 'manga' | 'character';
    malId?: number;
    anilistId?: number;
    isAdult?: boolean;
    blurAdult?: boolean;
  };
  className?: string;
}

export function UnifiedMediaCard({ item, className = "" }: UnifiedMediaCardProps) {
  const navigate = useNavigate();
  
  const isAnime = item.mediaType === 'anime';
  const isManga = item.mediaType === 'manga';
  const isCharacter = item.mediaType === 'character';
  const isAdultItem = Boolean(item.isAdult);
  const shouldBlurAdult = Boolean(isAdultItem && item.blurAdult);

  const getMangaFormatLabel = () => {
    if (!isManga) return item.mediaType;

    const normalized = String(item.type || item.mediaType || "manga").trim().toLowerCase();
    if (normalized === "manwha" || normalized === "manwah") return "manhwa";
    if (normalized === "comic" || normalized === "oel") return "comics";
    if (!normalized) return "manga";
    return normalized;
  };

  const mediaBadgeLabel = getMangaFormatLabel();

  const handleClick = () => {
    if (isAnime) {
      navigate(`/anime/${encodeURIComponent(item.id)}`);
    } else if (isManga) {
      navigate(`/manga/${encodeURIComponent(item.id)}`);
    } else if (isCharacter) {
      const characterRouteId = item.id || item.name;
      if (characterRouteId) {
        navigate(`/char/${encodeURIComponent(characterRouteId)}`);
      }
    }
  };

  const getBadgeIcon = () => {
    if (isAnime) return <Film className="w-3 h-3" />;
    if (isManga) return <BookOpen className="w-3 h-3" />;
    if (isCharacter) return <Star className="w-3 h-3" />;
    return null;
  };

  const renderMetadata = () => {
    if (isCharacter) return null;
    
    return (
      <div className="flex flex-wrap items-center gap-2 mt-2">
        {item.rating && (
          <span className="flex items-center text-xs text-yellow-400 font-medium bg-yellow-400/10 px-1.5 py-0.5 rounded-md">
            <Star className="w-3 h-3 mr-1 fill-current" />
            {item.rating}
          </span>
        )}
        
        {isAnime && item.episodes?.sub != null && (
          <span className="text-xs text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded-md">
            {item.episodes.sub} sub {item.episodes.dub ? `• ${item.episodes.dub} dub` : ''}
          </span>
        )}
        
        {isManga && item.chapters != null && item.chapters > 0 && (
          <span className="text-xs text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded-md">
            {item.chapters} ch
          </span>
        )}
      </div>
    );
  };

  return (
    <GlassPanel
      className={`group relative overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/20 ${className}`}
      onClick={handleClick}
    >
      <div className="relative aspect-[3/4] overflow-hidden">
        <img
          src={getProxiedImageUrl(item.poster || '')}
          alt={item.name}
          className={cn(
            "w-full h-full object-cover transition-transform duration-500 group-hover:scale-105",
            shouldBlurAdult && "blur-md scale-110"
          )}
          loading="lazy"
          onError={(event) => {
            const image = event.currentTarget;
            const directPoster = item.poster || '';
            const stage = image.dataset.fallbackStage || 'proxy';

            if (stage === 'proxy' && directPoster && image.currentSrc !== directPoster) {
              image.dataset.fallbackStage = 'direct';
              image.src = directPoster;
              return;
            }

            if (stage !== 'placeholder') {
              image.dataset.fallbackStage = 'placeholder';
              image.src = '/placeholder.svg';
            }
          }}
        />

        {isAdultItem && (
          <div className="absolute top-2 right-2 z-20 rounded-full border border-rose-500/40 bg-rose-500/20 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-rose-200">
            18+
          </div>
        )}

        {shouldBlurAdult && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
            <div className="rounded-full border border-rose-400/40 bg-black/70 px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-rose-200 backdrop-blur-sm">
              Sensitive Preview
            </div>
          </div>
        )}
        
        {/* Media Type Badge */}
        {item.mediaType && (
          <div className="absolute top-2 left-2 z-10">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-background/80 backdrop-blur-md border border-white/10 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
              {getBadgeIcon()}
              {mediaBadgeLabel}
            </div>
          </div>
        )}

        {/* Status Badge */}
        {item.status && !isCharacter && !isAdultItem && (
          <div className="absolute top-2 right-2 z-10">
            <div className="px-2 py-1 rounded-full bg-background/80 backdrop-blur-md border border-white/10 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {item.status}
            </div>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/20 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />
        
        {/* Hover Action Overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
          <div className="w-12 h-12 rounded-full bg-primary/90 text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/30 backdrop-blur-sm transform scale-50 group-hover:scale-100 transition-transform duration-300 ease-out">
            {isManga ? <BookOpen className="w-6 h-6 ml-0.5" /> : (isCharacter ? <Star className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />)}
          </div>
        </div>

        <div className="absolute bottom-0 w-full p-4">
          <h3 className="font-display font-bold text-base md:text-lg leading-tight line-clamp-2 text-white group-hover:text-primary transition-colors">
            {item.name}
          </h3>
          {renderMetadata()}
        </div>
      </div>
    </GlassPanel>
  );
}
