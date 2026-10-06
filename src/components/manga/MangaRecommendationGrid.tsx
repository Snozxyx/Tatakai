import { Link } from 'react-router-dom';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { getProxiedImageUrl } from '@/lib/api';
import { BookOpen, Star } from 'lucide-react';
import type { EngineRecommendation } from '@/hooks/api/useRecommendationEngine';
import { Peekable } from '@/components/media/MediaQuickPeek';
import { peekFromManga } from '@/components/media/quickPeekStore';

/** Grid of manga/manhwa/manhua recommendations from the manga engine. */
export function MangaRecommendationGrid({
  recommendations,
  isLoading,
}: {
  recommendations: EngineRecommendation[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="aspect-[2/3] bg-muted/50 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (recommendations.length === 0) {
    return (
      <GlassPanel className="p-8 text-center">
        <BookOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
        <p className="text-muted-foreground">Add manga to your readlist to get personalized manga, manhwa and manhua picks.</p>
      </GlassPanel>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {recommendations.map((rec) => (
        <Peekable
          key={rec.anime.id}
          media={peekFromManga(
            {
              id: rec.anime.id,
              name: rec.anime.title,
              poster: rec.anime.poster,
              type: rec.anime.format,
              rating: rec.anime.score != null ? rec.anime.score : undefined,
            },
            `/manga/${rec.anime.id}`,
          )}
        >
        <GlassPanel hoverEffect className="group overflow-hidden">
          <Link to={`/manga/${rec.anime.id}`} className="block">
            <div className="relative aspect-[2/3]">
              <img
                src={getProxiedImageUrl(rec.anime.poster ?? '')}
                alt={rec.anime.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
              <div className="absolute top-3 right-3 px-3 py-1.5 rounded-full bg-primary/90 backdrop-blur text-primary-foreground text-xs font-bold flex items-center gap-1">
                <Star className="w-3 h-3 fill-current" />
                {rec.score}%
              </div>
              {rec.anime.format && rec.anime.format !== 'manga' && (
                <div className="absolute top-3 left-3 px-2 py-1 rounded-md text-[10px] font-bold uppercase bg-black/60 text-white">
                  {rec.anime.format}
                </div>
              )}
            </div>
            <div className="p-3 space-y-1">
              <h3 className="font-bold text-sm line-clamp-2 group-hover:text-primary transition-colors">{rec.anime.title}</h3>
              {rec.reasons[0] && <p className="text-xs text-muted-foreground line-clamp-1">• {rec.reasons[0]}</p>}
            </div>
          </Link>
        </GlassPanel>
        </Peekable>
      ))}
    </div>
  );
}
