import { useInfiniteQuery } from '@tanstack/react-query';
import { fetchGenreAnimes, AnimeCard } from '@/lib/api';
import { 
  Sword, Heart, Laugh, Sparkles, Rocket, Ghost, Flower2, Compass, Theater, Eye,
  Trophy, Music, Search, Brain, Zap, Bot, Scroll, RefreshCw, Dumbbell, Target
} from 'lucide-react';

// Section types for unique layouts
export type SectionLayout = 'grid' | 'carousel' | 'featured' | 'compact' | 'masonry';

// Icon type for section
export type SectionIcon = React.ComponentType<{ className?: string }>;

export interface HomeSection {
  id: string;
  title: string;
  genre: string;
  layout: SectionLayout;
  animes: AnimeCard[];
  icon?: SectionIcon;
}

// Predefined section configurations with unique layouts
const SECTION_CONFIGS: Array<{ genre: string; layout: SectionLayout; icon?: SectionIcon }> = [
  { genre: 'action', layout: 'grid', icon: Sword },
  { genre: 'romance', layout: 'carousel', icon: Heart },
  { genre: 'comedy', layout: 'featured', icon: Laugh },
  { genre: 'fantasy', layout: 'masonry', icon: Sparkles },
  { genre: 'sci-fi', layout: 'compact', icon: Rocket },
  { genre: 'horror', layout: 'grid', icon: Ghost },
  { genre: 'slice-of-life', layout: 'carousel', icon: Flower2 },
  { genre: 'adventure', layout: 'featured', icon: Compass },
  { genre: 'drama', layout: 'masonry', icon: Theater },
  { genre: 'supernatural', layout: 'compact', icon: Eye },
  { genre: 'sports', layout: 'grid', icon: Trophy },
  { genre: 'music', layout: 'carousel', icon: Music },
  { genre: 'mystery', layout: 'featured', icon: Search },
  { genre: 'psychological', layout: 'masonry', icon: Brain },
  { genre: 'thriller', layout: 'compact', icon: Zap },
  { genre: 'mecha', layout: 'grid', icon: Bot },
  { genre: 'historical', layout: 'carousel', icon: Scroll },
  { genre: 'isekai', layout: 'featured', icon: RefreshCw },
  { genre: 'shounen', layout: 'masonry', icon: Dumbbell },
  { genre: 'seinen', layout: 'compact', icon: Target },
];

// Fetch a single genre section
async function fetchGenreSection(config: typeof SECTION_CONFIGS[0]): Promise<HomeSection> {
  try {
    const data = await fetchGenreAnimes(config.genre, 1);
    return {
      id: `section-${config.genre}-${Date.now()}`,
      title: data.genreName || config.genre.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      genre: config.genre,
      layout: config.layout,
      animes: data.animes.slice(0, 12),
      icon: config.icon,
    };
  } catch (error) {
    console.warn(`Failed to fetch ${config.genre}:`, error);
    return {
      id: `section-${config.genre}-${Date.now()}`,
      title: config.genre.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      genre: config.genre,
      layout: config.layout,
      animes: [],
      icon: config.icon,
    };
  }
}

// Hook for infinite scrolling home sections
export function useInfiniteHomeSections() {
  return useInfiniteQuery({
    queryKey: ['infiniteHomeSections'],
    queryFn: async ({ pageParam = 0 }) => {
      // Load 3 sections at a time
      const startIndex = pageParam * 3;
      const configs = SECTION_CONFIGS.slice(startIndex, startIndex + 3);
      
      if (configs.length === 0) {
        return { sections: [], nextPage: null };
      }
      
      const sections = await Promise.all(configs.map(fetchGenreSection));
      const validSections = sections.filter(s => s.animes.length > 0);
      
      return {
        sections: validSections,
        nextPage: startIndex + 3 < SECTION_CONFIGS.length ? pageParam + 1 : null,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}
