import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { useEnhancedRecommendations } from '@/hooks/useEnhancedRecommendations';
import { AnimeCardWithPreview } from './AnimeCardWithPreview';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { getProxiedImageUrl } from '@/lib/api';
import { motion } from 'framer-motion';
import { Sparkles, ChevronRight } from 'lucide-react';

interface BecauseYouWatchedProps {
  className?: string;
}

export function BecauseYouWatched({ className }: BecauseYouWatchedProps) {
  const { data: history = [] } = useWatchHistory(20);
  const { data: recommendations, isLoading } = useEnhancedRecommendations();
  const navigate = useNavigate();

  // Pick the most recently watched anime as the seed
  const seedAnime = useMemo(() => {
    if (!history.length) return null;
    const recent = history[0];
    return { id: recent.anime_id, name: recent.anime_name, poster: recent.anime_poster };
  }, [history]);

  if (!seedAnime || !recommendations?.length || isLoading) return null;

  const items = recommendations.slice(0, 6);

  return (
    <section className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3 group">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="font-display text-lg md:text-xl font-black leading-tight">
                Because you watched
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                {seedAnime.poster && (
                  <img
                    src={getProxiedImageUrl(seedAnime.poster)}
                    alt={seedAnime.name}
                    className="w-5 h-5 rounded-md object-cover"
                    loading="lazy"
                  />
                )}
                <button
                  onClick={() => navigate(`/anime/${seedAnime.id}`)}
                  className="text-sm text-primary font-semibold hover:underline underline-offset-2 truncate max-w-[200px]"
                >
                  {seedAnime.name}
                </button>
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={() => navigate('/recommendations')}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          See all
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-8">
        {items.map((rec, i) => (
          <motion.div
            key={rec.anime?.id || i}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.3 }}
          >
            <AnimeCardWithPreview anime={rec.anime} />
          </motion.div>
        ))}
      </div>
    </section>
  );
}
