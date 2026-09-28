import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWatchHistory } from '@/hooks/user/useWatchHistory';
import { useEnhancedRecommendations } from '@/hooks/api/useEnhancedRecommendations';
import { AnimeCardWithPreview } from './AnimeCardWithPreview';
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
      {/* Header Section */}
      <div className="flex items-end justify-between mb-6 md:mb-8 gap-4">
        <div className="flex items-center gap-3 md:gap-4">
          
          {/* Seed Anime Thumbnail (Proper Poster Aspect Ratio) */}
          {seedAnime.poster && (
            <button 
              onClick={() => navigate(`/anime/${seedAnime.id}`)}
              className="relative shrink-0 overflow-hidden rounded-md md:rounded-lg w-10 h-14 md:w-12 md:h-[72px] bg-muted transition-transform hover:scale-105 active:scale-95 shadow-sm border border-border/40"
            >
              <img
                src={getProxiedImageUrl(seedAnime.poster)}
                alt={seedAnime.name}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              {/* Subtle inner ring for depth */}
              <div className="absolute inset-0 ring-1 ring-inset ring-black/10 dark:ring-white/10 rounded-md md:rounded-lg" />
            </button>
          )}

          {/* Context Text */}
          <div className="flex flex-col justify-center gap-1">
            <div className="flex items-center gap-1.5 text-sm font-medium text-primary">
              <Sparkles className="w-4 h-4" />
              <span>Because you watched</span>
            </div>
            <button
              onClick={() => navigate(`/anime/${seedAnime.id}`)}
              className="text-lg md:text-xl font-bold text-foreground text-left hover:text-primary transition-colors duration-200 line-clamp-1 max-w-[220px] md:max-w-md lg:max-w-lg"
              title={seedAnime.name}
            >
              {seedAnime.name}
            </button>
          </div>
        </div>

        {/* Clean, Modern Action Button */}
        <button
          onClick={() => navigate('/recommendations')}
          className="group hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-muted-foreground rounded-full hover:bg-primary/10 hover:text-primary transition-all duration-200 ease-out shrink-0"
        >
          See all
          <ChevronRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </button>
        
        {/* Mobile Action Button (Icon only or simplified) */}
        <button
          onClick={() => navigate('/recommendations')}
          className="sm:hidden group flex items-center text-sm font-medium text-muted-foreground hover:text-primary transition-colors pb-1"
        >
          See all
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Grid of Cards */}
      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-8">
        {items.map((rec, i) => (
          <motion.div
            key={rec.anime?.id || i}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ 
              delay: i * 0.05, 
              duration: 0.4, 
              ease: [0.21, 0.47, 0.32, 0.98] // Smooth custom easing
            }}
          >
            <AnimeCardWithPreview anime={rec.anime} />
          </motion.div>
        ))}
      </div>
    </section>
  );
}