import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { Link } from 'react-router-dom';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { getProxiedImageUrl } from '@/lib/api';
import { BookOpen, Star } from 'lucide-react';
import type { EngineRecommendation } from '@/hooks/api/useRecommendationEngine';

/** Grid of light-novel recommendations from the novel engine. */
export function NovelRecommendationGrid({
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
        <p className="text-muted-foreground">{uiI18n.t('app.add_light_novels_to_your_library_to_get_personal_971f420e')}</p>
      </GlassPanel>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {recommendations.map((rec) => (
        <GlassPanel hoverEffect key={rec.anime.id} className="group overflow-hidden">
          <Link to={`/novel/${rec.anime.id}`} className="block">
            <div className="relative aspect-[2/3]">
              <img
                src={getProxiedImageUrl(rec.anime.poster ?? '')}
                alt={rec.anime.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                loading="lazy"
              />
              {rec.anime.averageScore != null && (
                <span className="absolute left-2 top-2 flex items-center gap-1 rounded-lg bg-black/70 px-2 py-0.5 text-xs font-bold text-amber-300">
                  <Star className="w-3 h-3" /> {(rec.anime.averageScore / 10).toFixed(1)}
                </span>
              )}
            </div>
            <div className="p-2.5">
              <p className="truncate text-sm font-bold">{rec.anime.title}</p>
              <p className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">{uiI18n.t('app.novel_5ce28bac')} {Math.round(rec.score)} {uiI18n.t('app.match_ef5c844e')}</p>
            </div>
          </Link>
        </GlassPanel>
      ))}
    </div>
  );
}
