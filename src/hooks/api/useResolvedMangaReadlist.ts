import { useQuery, useQueryClient } from "@tanstack/react-query";
import { needsReadlistMetadata, resolveReadlistMetadata } from "@/lib/reader/readlistMetadata";
import { mergeReadlistAliases, type ResolvedReadlistItem } from "@/lib/reader/readlistDisplay";

/** Shared cached repairs for profile shelves, including old imported rows. */
export function useResolvedMangaReadlist(rows: ResolvedReadlistItem[]) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["resolved-manga-readlist", rows],
    enabled: rows.some(item => !item.resolved_manga_id && needsReadlistMetadata(item)),
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const resolved = [...rows];
      let cursor = 0;
      await Promise.all(Array.from({ length: Math.min(5, rows.length) }, async () => {
        while (cursor < rows.length) {
          const index = cursor++;
          const item = rows[index];
          if (item.resolved_manga_id || !needsReadlistMetadata(item)) continue;
          const metadata = await queryClient.fetchQuery({
            queryKey: ["followed-manga-metadata", item.manga_id, item.manga_title, item.manga_poster, item.anilist_id, item.mal_id, item.format],
            queryFn: () => resolveReadlistMetadata(item),
            staleTime: 60 * 60 * 1000,
          });
          resolved[index] = {
            ...item,
            resolved_manga_id: metadata.id,
            manga_title: metadata.title || item.manga_title,
            manga_poster: metadata.poster || item.manga_poster,
            format: metadata.format || item.format,
          };
        }
      }));
      return mergeReadlistAliases(resolved);
    },
  });
  return { ...query, data: query.data ?? mergeReadlistAliases(rows) };
}
