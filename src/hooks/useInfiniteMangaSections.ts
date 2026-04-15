import { useInfiniteQuery } from '@tanstack/react-query';
import { searchManga } from '@/services/manga.service';
import { UnifiedMediaCardProps } from '@/components/UnifiedMediaCard';
import { 
  Sword, Heart, Laugh, Sparkles, Rocket, Ghost, Flower2, Compass, Search, Brain, Zap, Flame
} from 'lucide-react';
import { inferMangaAdultFlag } from '@/lib/contentSafety';

export type SectionLayout = 'grid' | 'carousel' | 'featured' | 'compact' | 'masonry';
export type SectionIcon = React.ComponentType<{ className?: string }>;

export interface MangaSection {
  id: string;
  title: string;
  genre: string;
  layout: SectionLayout;
  items: UnifiedMediaCardProps["item"][];
  icon?: SectionIcon;
}

const SECTION_CONFIGS: Array<{
  genre: string;
  query?: string;
  layout: SectionLayout;
  icon?: SectionIcon;
}> = [
  { genre: 'action', layout: 'grid', icon: Sword },
  { genre: 'romance', layout: 'carousel', icon: Heart },
  { genre: 'comedy', layout: 'featured', icon: Laugh },
  { genre: 'fantasy', layout: 'masonry', icon: Sparkles },
  { genre: 'sci-fi', layout: 'compact', icon: Rocket },
  { genre: 'horror', layout: 'grid', icon: Ghost },
  { genre: 'slice of life', layout: 'carousel', icon: Flower2 },
  { genre: 'adventure', layout: 'featured', icon: Compass },
  { genre: 'mystery', layout: 'masonry', icon: Search },
  { genre: 'psychological', layout: 'compact', icon: Brain },
  { genre: 'thriller', layout: 'grid', icon: Zap },
  { genre: 'drama', layout: 'featured', icon: Sparkles },
  { genre: 'historical', layout: 'grid', icon: Compass },
  { genre: 'supernatural', layout: 'masonry', icon: Ghost },
  { genre: 'isekai', layout: 'carousel', icon: Rocket },
  { genre: 'sports', layout: 'compact', icon: Zap },
  { genre: 'martial arts', layout: 'grid', icon: Sword },
  { genre: 'school life', layout: 'carousel', icon: Flower2 },
  { genre: 'seinen', layout: 'featured', icon: Brain },
  { genre: 'shounen', layout: 'masonry', icon: Flame },
  { genre: 'josei', layout: 'compact', icon: Heart },
  { genre: 'ecchi', layout: 'grid', icon: Sparkles },
  { genre: 'tragedy', layout: 'featured', icon: Sparkles },
  { genre: 'crime', layout: 'carousel', icon: Search },
  { genre: 'detective', layout: 'grid', icon: Search },
  { genre: 'survival', layout: 'masonry', icon: Zap },
  { genre: 'mecha', layout: 'featured', icon: Rocket },
  { genre: 'military', layout: 'grid', icon: Sword },
  { genre: 'vampire', layout: 'compact', icon: Ghost },
  { genre: 'magic', layout: 'masonry', icon: Sparkles },
  { genre: 'post-apocalyptic', layout: 'compact', icon: Rocket },
  { genre: 'delinquent', layout: 'carousel', icon: Flame },
  { genre: 'suspense', layout: 'grid', icon: Brain },
  { genre: 'mythology', layout: 'featured', icon: Compass },
  { genre: 'medical', layout: 'grid', icon: Brain },
  { genre: 'game', layout: 'compact', icon: Zap },
  { genre: 'time travel', layout: 'featured', icon: Rocket },
  { genre: 'reverse harem', layout: 'carousel', icon: Heart },
  { genre: 'harem', layout: 'masonry', icon: Heart },
  { genre: 'shoujo', layout: 'grid', icon: Flower2 },
  { genre: 'award winning', layout: 'featured', icon: Sparkles },
  { genre: 'samurai', layout: 'grid', icon: Sword },
  { genre: 'urban fantasy', layout: 'compact', icon: Ghost },
  { genre: 'cultivation', layout: 'masonry', icon: Flame },
  { genre: 'villainess', layout: 'carousel', icon: Heart },
  { genre: 'rebirth', layout: 'featured', icon: Rocket },
  { genre: 'webtoon', query: 'webtoon manhwa', layout: 'grid', icon: Flower2 },
  { genre: 'manhwa hits', query: 'popular manhwa', layout: 'featured', icon: Flame },
  { genre: 'manhua picks', query: 'popular manhua', layout: 'compact', icon: Compass },
  { genre: 'comics spotlight', query: 'top comics manga', layout: 'carousel', icon: Search },
  { genre: 'otome isekai', query: 'otome isekai manga', layout: 'featured', icon: Heart },
  { genre: 'regression', query: 'regression manhwa', layout: 'grid', icon: Rocket },
  { genre: 'academy', query: 'academy manga', layout: 'compact', icon: Brain },
  { genre: 'space opera', query: 'space opera manga', layout: 'masonry', icon: Rocket },
  { genre: 'monster', query: 'monster manga thriller', layout: 'carousel', icon: Ghost },
  { genre: 'coming of age', query: 'coming of age manga', layout: 'featured', icon: Sparkles },
  { genre: 'office romance', query: 'office romance manga', layout: 'grid', icon: Heart },
  { genre: 'action fantasy', query: 'action fantasy manga', layout: 'masonry', icon: Sword },
  { genre: 'survival game', query: 'survival game manga', layout: 'compact', icon: Zap },
  { genre: 'mystic worlds', query: 'supernatural fantasy manga', layout: 'carousel', icon: Sparkles },
];

const SECTION_BATCH_SIZE = 8;

function toDisplayGenre(genre: string): string {
  return genre.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

function shuffleConfigs<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
  }
  return arr;
}

const SHUFFLED_SECTION_CONFIGS = shuffleConfigs(SECTION_CONFIGS);

async function fetchMangaSection(config: typeof SECTION_CONFIGS[0], pageSeed: number, canShowAdult: boolean): Promise<MangaSection> {
  const query = config.query || `${config.genre} manga`;
  const data = await searchManga(query, 1, 24);
  const rawItems = Array.isArray(data?.results) ? data.results : [];
  
  const items = rawItems
    .filter(item => {
      const isAdult = inferMangaAdultFlag(item);
      return !isAdult || canShowAdult;
    })
    .map(item => ({
      id: String(item.anilistId || item.malId || item.id),
      name: item.canonicalTitle || item.title?.english || item.title?.romaji || item.title?.native || "Unknown",
      poster: item.poster || "",
      type: item.mediaType || "manga",
      status: item.status || undefined,
      rating: typeof item.score === "number" && Number.isFinite(item.score) ? (item.score / 10).toFixed(1) : undefined,
      chapters: typeof item.chapters === "number" && item.chapters > 0 ? item.chapters : undefined,
      malId: typeof item.malId === "number" ? item.malId : undefined,
      anilistId: typeof item.anilistId === "number" ? item.anilistId : undefined,
      mediaType: "manga" as const,
    }))
    .slice(0, 12);

  return {
    id: `section-${config.genre}-${Date.now()}`,
    title: toDisplayGenre(config.genre),
    genre: config.genre,
    layout: config.layout,
    items,
    icon: config.icon,
  };
}

export function useInfiniteMangaSections({ showAdult }: { showAdult: boolean }) {
  return useInfiniteQuery({
    queryKey: ['infiniteMangaSections', showAdult],
    queryFn: async ({ pageParam = 0 }) => {
      const startIndex = pageParam * SECTION_BATCH_SIZE;
      const configs = SHUFFLED_SECTION_CONFIGS.slice(startIndex, startIndex + SECTION_BATCH_SIZE);
      
      if (configs.length === 0) {
        return { sections: [], nextPage: null };
      }
      
      const sections = await Promise.all(
        configs.map((config, index) => fetchMangaSection(config, startIndex + index + 1, showAdult))
      );
      
      const validSections = sections.filter(s => s.items.length > 0);
      
      return {
        sections: validSections,
        nextPage: startIndex + SECTION_BATCH_SIZE < SHUFFLED_SECTION_CONFIGS.length ? pageParam + 1 : null,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
    staleTime: 10 * 60 * 1000,
  });
}