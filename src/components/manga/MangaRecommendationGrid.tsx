import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
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
  useUiTranslation();
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
        <p className="text-muted-foreground">{uiI18n.t('app.add_manga_to_your_readlist_to_get_personalized_m_135ebbff')}</p>
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
              rating: rec.anime.averageScore != null ? rec.anime.averageScore : undefined,
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
              {rec.tier && (
                <div className={"absolute bottom-3 left-3 px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1.5 bg-black/60 text-white"} title={rec.tier === 'strong' ? uiI18n.t('app.strong_match_a99cde57') : rec.tier === 'possible' ? uiI18n.t('app.possible_match_d11ba676') : uiI18n.t('app.weak_match_7334132e')}>
                  <span className={`w-1.5 h-1.5 rounded-full ${rec.tier === 'strong' ? 'bg-green-500' : rec.tier === 'possible' ? 'bg-yellow-500' : 'bg-gray-500'}`} />
                  {rec.tier === 'strong' ? uiI18n.t('app.strong_cf846870') : rec.tier === 'possible' ? uiI18n.t('app.possible_dd8bd0b5') : uiI18n.t('app.weak_8bfada82')}
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
