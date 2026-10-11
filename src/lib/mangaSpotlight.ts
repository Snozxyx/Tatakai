import type { UnifiedMediaCardProps } from '@/components/UnifiedMediaCard';
import type { CinematicSpotlight } from '@/components/anime/CinematicHero';

export function toMangaSpotlight(item: UnifiedMediaCardProps['item'], index = 0): CinematicSpotlight {
  return { ...item, jname: item.name, rank: index + 1, description: (item.description || '').replace(/<[^>]*>/g, ''),
    otherInfo: [item.type || 'Manga', item.status].filter(Boolean), episodes: { sub: 0, dub: 0 } };
}

