import { useQuery } from '@tanstack/react-query';
import { ANILIST_GRAPHQL_ENDPOINT } from '@/lib/api/backendOrigin';
import type { MediaRelation } from '@/core/content/types';

/** Older catalog records can retain relation titles without their cover art. */
export function useRelationCovers(relations: MediaRelation[]): Record<number, string> {
  const ids = [...new Set(relations.filter(relation => !relation.coverImage)
    .map(relation => relation.id).filter(id => Number.isFinite(id) && id > 0))].sort((a, b) => a - b);
  const { data } = useQuery({
    queryKey: ['relation-covers', ids],
    enabled: ids.length > 0,
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
    queryFn: async ({ signal }) => {
      const covers: Record<number, string> = {};
      for (let offset = 0; offset < ids.length; offset += 50) {
        const response = await fetch(ANILIST_GRAPHQL_ENDPOINT, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
          body: JSON.stringify({
            query: 'query RelationCovers($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids) { id coverImage { large medium } } } }',
            variables: { ids: ids.slice(offset, offset + 50) }, forceUpstream: true,
          }),
        });
        if (!response.ok) throw new Error('Related cover art is temporarily unavailable.');
        const reply = await response.json();
        if (reply.errors?.length || !reply.data?.Page) throw new Error('Related cover art is temporarily unavailable.');
        for (const media of reply.data.Page.media ?? []) {
          const cover = media.coverImage?.large || media.coverImage?.medium;
          if (cover) covers[media.id] = cover;
        }
      }
      return covers;
    },
  });
  return data ?? {};
}
