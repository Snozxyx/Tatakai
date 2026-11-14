import { ANILIST_GRAPHQL_ENDPOINT } from '@/lib/api/backendOrigin';
import type { ContentSearchResult, SearchFilters, TatakaiMedia } from './types';

type CatalogAnime = Omit<TatakaiMedia, 'anilistId' | 'titleRomaji' | 'studios' | 'source_api' | 'fetchedAt'> & {
  id: number;
  idMal?: number;
  title: { romaji: string; english?: string; native?: string };
  coverImage?: { large?: string; medium?: string; color?: string };
  studios?: { nodes: TatakaiMedia['studios'] };
};

/** Use the same complete catalog proxy as manga/novel tag browsing. */
export async function searchAnimeTags(filters: SearchFilters): Promise<ContentSearchResult> {
  const page = filters.page ?? 1;
  const perPage = filters.perPage ?? 24;
  const tags = [...new Set((filters.tags ?? []).map(tag => tag.trim()).filter(Boolean))];
  const query = `query AnimeTagSearch(
    $page: Int, $perPage: Int, $search: String, $tags: [String], $genres: [String],
    $formats: [MediaFormat], $statuses: [MediaStatus], $season: MediaSeason,
    $sources: [MediaSource], $adult: Boolean, $sort: [MediaSort],
    $startMin: FuzzyDateInt, $startMax: FuzzyDateInt, $scoreMin: Int, $scoreMax: Int,
    $epMin: Int, $epMax: Int
  ) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { total currentPage lastPage hasNextPage perPage }
      media(type: ANIME, search: $search, tag_in: $tags, genre_in: $genres,
        format_in: $formats, status_in: $statuses, season: $season, source_in: $sources,
        isAdult: $adult, sort: $sort,
        startDate_greater: $startMin, startDate_lesser: $startMax,
        averageScore_greater: $scoreMin, averageScore_lesser: $scoreMax,
        episodes_greater: $epMin, episodes_lesser: $epMax) {
        id idMal title { romaji english native } synonyms
        coverImage { large medium color } bannerImage description
        format status season seasonYear episodes duration
        startDate { year month day } endDate { year month day }
        averageScore meanScore popularity favourites genres source isAdult countryOfOrigin
        tags { id name description category rank isAdult isGeneralSpoiler isMediaSpoiler }
        studios { nodes { id name isAnimationStudio } }
      }
    }
  }`;
  const response = await fetch(ANILIST_GRAPHQL_ENDPOINT, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({ query, forceUpstream: true, variables: {
      page, perPage, search: filters.query?.trim() || undefined, tags,
      genres: filters.genres?.length ? filters.genres : undefined,
      formats: filters.format?.length ? filters.format : undefined,
      statuses: filters.status?.length ? filters.status : undefined,
      season: filters.season?.[0], sources: filters.source,
      adult: filters.isAdult,
      sort: [filters.sortBy || 'POPULARITY_DESC'],
      // AniList uses exclusive bounds; the UI specifies inclusive bounds.
      startMin: filters.year?.min ? filters.year.min * 10000 - 1 : undefined,
      startMax: filters.year?.max ? (filters.year.max + 1) * 10000 : undefined,
      scoreMin: filters.rating?.min != null ? filters.rating.min - 1 : undefined,
      scoreMax: filters.rating?.max != null ? filters.rating.max + 1 : undefined,
      epMin: filters.episodes?.min != null ? filters.episodes.min - 1 : undefined,
      epMax: filters.episodes?.max != null ? filters.episodes.max + 1 : undefined,
    } }),
  });
  if (!response.ok) throw new Error('Anime tag search is temporarily unavailable. Please retry.');
  const reply = await response.json() as {
    data?: { Page?: { media: CatalogAnime[]; pageInfo: ContentSearchResult['pageInfo'] } };
    errors?: unknown[];
  };
  if (reply.errors?.length || !reply.data?.Page) {
    throw new Error('Anime tag search is temporarily unavailable. Please retry.');
  }
  const result = reply.data.Page;
  return {
    pageInfo: result.pageInfo,
    media: result.media.map(({ id, idMal, title, coverImage, studios, ...media }) => ({
      ...media, anilistId: id, malId: idMal,
      titleRomaji: title.romaji, titleEnglish: title.english, titleNative: title.native,
      coverImageLarge: coverImage?.large, coverImageMedium: coverImage?.medium,
      color: coverImage?.color, studios: studios?.nodes ?? [],
      synonyms: media.synonyms ?? [], genres: media.genres ?? [], tags: media.tags ?? [],
      source_api: 'anilist', fetchedAt: Date.now(),
    })),
  };
}
