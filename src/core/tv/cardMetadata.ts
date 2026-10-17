import { splitRating } from "@/lib/mediaRating";
import type { MediaCardMetadata } from "@/types/anime";
import type { TatakaiMedia } from "@/core/content/types";
export interface TVCardMetadataInput extends MediaCardMetadata {
  episodes?: { sub?: number; dub?: number };
  chapters?: number;
  isAdult?: boolean;
}
export function tvCardMetadata(
  item: TVCardMetadataInput,
  media?: TatakaiMedia
) {
  item = { ...item, ...item.tvMetadata };
  const rating = splitRating(
    media?.averageScore ? (media.averageScore / 10).toFixed(1) : item.rating
  );
  const genres = media?.genres || item.genres || [];
  const rawTags = media?.tags || item.tags || [];
  const tags = rawTags
    .filter(
      (tag) =>
        typeof tag === "string" ||
        (!tag.isGeneralSpoiler &&
          !tag.isMediaSpoiler &&
          (!tag.isAdult || item.isAdult))
    )
    .map((tag) => (typeof tag === "string" ? tag : tag.name));
  return {
    score: rating.score,
    contentRating:
      rating.label || media?.rating || splitRating(item.rating).label,
    type: media?.format || item.type,
    year: media?.seasonYear || media?.startDate?.year || item.year,
    status: (media?.status || item.status)?.replace(/_/g, " "),
    sub: media?.episodeSubCount ?? item.episodes?.sub ?? media?.episodes,
    dub: media?.episodeDubCount ?? item.episodes?.dub,
    chapters: item.chapters,
    tags: [...new Set([...genres, ...tags].filter(Boolean))],
  };
}
