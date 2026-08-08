import { useQuery } from '@tanstack/react-query';
import { contentGraph } from '@/core';

interface Season {
  id: string;
  name: string;
  title: string;
  poster: string;
  isCurrent: boolean;
}

export function useAnimeSeasons(animeId: string | undefined) {
  return useQuery({
    queryKey: ['anime-seasons', animeId],
    queryFn: async (): Promise<Season[]> => {
      if (!animeId) return [];

      try {
        const media = await contentGraph.getMedia(animeId);
        if (!media) return [];

        const relations = media.relations || [];
        const seasonRelationTypes = ['PREQUEL', 'SEQUEL', 'PARENT', 'SIDE_STORY', 'ALTERNATIVE', 'SUMMARY', 'SPIN_OFF'];
        
        const seasons: Season[] = relations
          .filter(rel => seasonRelationTypes.includes(rel.relationType.toUpperCase()))
          .map(rel => ({
            id: String(rel.id),
            name: rel.titleEnglish || rel.titleRomaji,
            title: rel.titleEnglish || rel.titleRomaji,
            poster: rel.coverImage || '',
            isCurrent: false,
          }));

        // Add the current anime to the list
        const currentId = String(media.anilistId || animeId);
        if (!seasons.some(s => s.id === currentId)) {
          seasons.push({
            id: currentId,
            name: media.titleEnglish || media.titleRomaji,
            title: media.titleEnglish || media.titleRomaji,
            poster: media.coverImageLarge || '',
            isCurrent: true,
          });
        } else {
          // Mark the existing entry as current
          const currentEntry = seasons.find(s => s.id === currentId);
          if (currentEntry) currentEntry.isCurrent = true;
        }

        // Sort by name/season number
        seasons.sort((a, b) => {
          const aNum = extractSeasonNumber(a.name);
          const bNum = extractSeasonNumber(b.name);
          if (aNum !== null && bNum !== null) return aNum - bNum;
          return a.name.localeCompare(b.name);
        });

        return seasons;
      } catch (error) {
        console.error('Failed to fetch seasons via content graph:', error);
        return [];
      }
    },
    enabled: !!animeId && !animeId.startsWith('mal-'),
    staleTime: 1000 * 60 * 30, // 30 minutes
  });
}

// Helper to extract season number from name
function extractSeasonNumber(name: string): number | null {
  const patterns = [
    /season (\d+)/i,
    /(\d+)(st|nd|rd|th) season/i,
    /part (\d+)/i,
    /\s+(\d+)$/,
  ];
  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}
