import { useQuery } from "@tanstack/react-query";
import { contentGraph } from "@/core";
import { fetchAniZipMapping } from "@/lib/mapping/anizip";
export function useTVTitleArt(id?: string) {
  return useQuery({
    queryKey: ["tv-enriched-art", id],
    enabled: !!id,
    staleTime: 3600000,
    queryFn: async ({ signal }) => {
      const media = await contentGraph.getMedia(id!);
      const mapping = await fetchAniZipMapping(media.anilistId, {
        signal,
      }).catch(() => null);
      return {
        ...media,
        logo:
          media.logo ||
          media.titleLogo ||
          mapping?.artwork.clearLogo ||
          undefined,
        bannerImage: mapping?.artwork.fanart || media.bannerImage,
      };
    },
  });
}
