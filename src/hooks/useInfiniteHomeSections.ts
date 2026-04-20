import { useInfiniteQuery } from '@tanstack/react-query';
import { fetchGenreAnimes, AnimeCard } from '@/lib/api';
import { fetchAniListDiscover, type AniListSearchFilters } from '@/lib/externalIntegrations';
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
const SECTION_CONFIGS: Array<{
  genre: string;
  layout: SectionLayout;
  icon?: SectionIcon;
  anilistFormat?: AniListSearchFilters['format'];
  anilistSort?: AniListSearchFilters['sort'];
}> = [
  { genre: 'action', layout: 'grid', icon: Sword, anilistFormat: 'TV', anilistSort: 'TRENDING_DESC' },
  { genre: 'romance', layout: 'carousel', icon: Heart, anilistFormat: 'TV_SHORT', anilistSort: 'POPULARITY_DESC' },
  { genre: 'comedy', layout: 'featured', icon: Laugh, anilistFormat: 'MOVIE', anilistSort: 'FAVOURITES_DESC' },
  { genre: 'fantasy', layout: 'masonry', icon: Sparkles, anilistFormat: 'ONA', anilistSort: 'TRENDING_DESC' },
  { genre: 'sci-fi', layout: 'compact', icon: Rocket, anilistFormat: 'OVA', anilistSort: 'POPULARITY_DESC' },
  { genre: 'horror', layout: 'grid', icon: Ghost, anilistFormat: 'SPECIAL', anilistSort: 'SCORE_DESC' },
  { genre: 'slice-of-life', layout: 'carousel', icon: Flower2, anilistFormat: 'TV', anilistSort: 'POPULARITY_DESC' },
  { genre: 'adventure', layout: 'featured', icon: Compass, anilistFormat: 'TV', anilistSort: 'TRENDING_DESC' },
  { genre: 'drama', layout: 'masonry', icon: Theater, anilistFormat: 'MOVIE', anilistSort: 'SCORE_DESC' },
  { genre: 'supernatural', layout: 'compact', icon: Eye, anilistFormat: 'ONA', anilistSort: 'TRENDING_DESC' },
  { genre: 'sports', layout: 'grid', icon: Trophy, anilistFormat: 'TV', anilistSort: 'POPULARITY_DESC' },
  { genre: 'music', layout: 'carousel', icon: Music, anilistFormat: 'MUSIC', anilistSort: 'TRENDING_DESC' },
  { genre: 'mystery', layout: 'featured', icon: Search, anilistFormat: 'TV', anilistSort: 'SCORE_DESC' },
  { genre: 'psychological', layout: 'masonry', icon: Brain, anilistFormat: 'TV', anilistSort: 'POPULARITY_DESC' },
  { genre: 'thriller', layout: 'compact', icon: Zap, anilistFormat: 'MOVIE', anilistSort: 'SCORE_DESC' },
  { genre: 'mecha', layout: 'grid', icon: Bot, anilistFormat: 'TV', anilistSort: 'POPULARITY_DESC' },
  { genre: 'historical', layout: 'carousel', icon: Scroll, anilistFormat: 'SPECIAL', anilistSort: 'TRENDING_DESC' },
  { genre: 'isekai', layout: 'featured', icon: RefreshCw, anilistFormat: 'ONA', anilistSort: 'POPULARITY_DESC' },
  { genre: 'shounen', layout: 'masonry', icon: Dumbbell, anilistFormat: 'TV', anilistSort: 'TRENDING_DESC' },
  { genre: 'seinen', layout: 'compact', icon: Target, anilistFormat: 'TV', anilistSort: 'SCORE_DESC' },
];

const DESKTOP_SECTION_BATCH_SIZE = 4;
const MOBILE_SECTION_BATCH_SIZE = 3;
const MAX_CONCURRENT_SECTION_REQUESTS = 2;

const ANILIST_GENRE_ALIASES: Record<string, string> = {
  'sci-fi': 'Sci-Fi',
  'slice-of-life': 'Slice of Life',
};

function toDisplayGenre(genre: string): string {
  return genre.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

function toAniListGenre(genre: string): string {
  return ANILIST_GENRE_ALIASES[genre] || toDisplayGenre(genre);
}

function toAnimeCardFromAniList(media: any): AnimeCard {
  const title = media?.title?.english || media?.title?.romaji || media?.title?.native || 'Unknown title';
  const episodeCount = Number(media?.episodes) || 0;
  return {
    id: media?.idMal ? `mal-${media.idMal}` : `anilist-${media.id}`,
    name: title,
    poster: media?.coverImage?.large || media?.coverImage?.medium || '/placeholder.svg',
    type: media?.format ? String(media.format).toLowerCase() : undefined,
    rating: media?.averageScore ? (Number(media.averageScore) / 10).toFixed(1) : undefined,
    episodes: {
      sub: episodeCount,
      dub: 0,
    },
    malId: media?.idMal || undefined,
    anilistId: media?.id || undefined,
  };
}

function mergeUniqueAnimeCards(...groups: AnimeCard[][]): AnimeCard[] {
  const all = groups.flat();
  const seen = new Set<string>();
  const merged: AnimeCard[] = [];

  for (const anime of all) {
    if (!anime) continue;
    const key = String(anime.id || '').trim().toLowerCase() || String(anime.name || '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(anime);
  }

  return merged;
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

async function mapWithConcurrency<T, R>(
  items: T[],
  maxConcurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];

  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) {
        return;
      }

      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  };

  const workerCount = Math.min(Math.max(maxConcurrency, 1), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}

const SHUFFLED_SECTION_CONFIGS = shuffleConfigs(SECTION_CONFIGS);

// Fetch a single genre section
async function fetchGenreSection(config: typeof SECTION_CONFIGS[0], pageSeed: number): Promise<HomeSection> {
  let genreTitle = toDisplayGenre(config.genre);
  let internalAnimes: AnimeCard[] = [];

  try {
    const data = await fetchGenreAnimes(config.genre, 1);
    genreTitle = data.genreName || genreTitle;
    internalAnimes = data.animes.slice(0, 8);
  } catch (error) {
    console.warn(`Failed to fetch internal genre ${config.genre}:`, error);
  }

  let anilistAnimes: AnimeCard[] = [];
  try {
    const anilistPage = ((pageSeed - 1) % 8) + 1;
    const anilistData = await fetchAniListDiscover({
      page: anilistPage,
      perPage: 10,
      genres: [toAniListGenre(config.genre)],
      format: config.anilistFormat,
      sort: config.anilistSort || 'TRENDING_DESC',
    });
    anilistAnimes = anilistData.map(toAnimeCardFromAniList);
  } catch (error) {
    console.warn(`Failed to fetch AniList genre ${config.genre}:`, error);
  }

  const animes = mergeUniqueAnimeCards(internalAnimes, anilistAnimes).slice(0, 12);

  return {
    id: `section-${config.genre}-${Date.now()}-${pageSeed}`,
    title: genreTitle,
    genre: config.genre,
    layout: config.layout,
    animes,
    icon: config.icon,
  };
}

// Hook for infinite scrolling home sections
export function useInfiniteHomeSections() {
  const sectionBatchSize =
    typeof window !== 'undefined' && window.innerWidth < 768
      ? MOBILE_SECTION_BATCH_SIZE
      : DESKTOP_SECTION_BATCH_SIZE;

  return useInfiniteQuery({
    queryKey: ['infiniteHomeSections', sectionBatchSize],
    queryFn: async ({ pageParam = 0 }) => {
      // Load multiple shuffled sections at a time for variety.
      const startIndex = pageParam * sectionBatchSize;
      const configs = SHUFFLED_SECTION_CONFIGS.slice(startIndex, startIndex + sectionBatchSize);
      
      if (configs.length === 0) {
        return { sections: [], nextPage: null };
      }

      const sections = await mapWithConcurrency(
        configs,
        MAX_CONCURRENT_SECTION_REQUESTS,
        (config, index) => fetchGenreSection(config, startIndex + index + 1)
      );
      let validSections = sections.filter(s => s.animes.length > 0);

      // Mobile users can receive empty batches more often due smaller pages and flaky upstreams.
      // Rescue with a small curated fallback so the section never appears blank.
      if (validSections.length === 0) {
        const usedGenres = new Set(configs.map((cfg) => cfg.genre));
        const rescueConfigs = SECTION_CONFIGS
          .filter((cfg) => !usedGenres.has(cfg.genre))
          .slice(0, 2);

        if (rescueConfigs.length > 0) {
          const rescueSections = await mapWithConcurrency(
            rescueConfigs,
            MAX_CONCURRENT_SECTION_REQUESTS,
            (config, index) => fetchGenreSection(config, startIndex + sectionBatchSize + index + 1)
          );
          validSections = rescueSections.filter((section) => section.animes.length > 0);
        }
      }
      
      return {
        sections: validSections,
        nextPage: startIndex + sectionBatchSize < SHUFFLED_SECTION_CONFIGS.length ? pageParam + 1 : null,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
    retry: 1,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}
