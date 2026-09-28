/**
 * anilist.ts - Thin AniList GraphQL client.
 *
 * Every AniList call is routed through the TatakaiAPI proxy
 * (`/api/v3/anilist/graphql`) rather than hitting https://graphql.anilist.co
 * directly — the proxy serves the in-process mirror first (falling back to real
 * AniList), holds rate limits server-side, and fixes the CORS-on-429 failure of
 * direct browser calls. The proxy is request/response compatible: it accepts the
 * same `{ query, variables }` body and returns the same `{ data, errors }` shape.
 *
 * Genre notes:
 *   - `GenreCollection` is a plain `[String]` list. `GenreCollection { genre }`
 *     — the shape used in `TatakaiAPI/src/providers/anilist/queries.ts` — is
 *     rejected by the API, so a client built on that query silently returns [].
 *   - It is NOT filtered by type: the same 19 genres cover anime and manga.
 *   - AniList's vocabulary also includes `Hentai`, which is mature content.
 *     `fetchAniListGenres` drops it unless `includeAdult` is set.
 */

import { ANILIST_GRAPHQL_ENDPOINT } from '@/lib/api/backendOrigin';

export const ANILIST_GRAPHQL_URL = ANILIST_GRAPHQL_ENDPOINT;

/** The mature genre AniList exposes; excluded from the genre list by default. */
export const ADULT_GENRE = 'Hentai';

export interface AniListQueryOptions {
  variables?: Record<string, unknown>;
  /** Bypass the in-module memory cache (default: cache for 12h). */
  forceRefresh?: boolean;
  signal?: AbortSignal;
}

async function gql<TData>(query: string, options: AniListQueryOptions = {}): Promise<TData> {
  const { variables, signal } = options;

  const res = await fetch(ANILIST_GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(variables ? { query, variables } : { query }),
    signal,
  });

  if (!res.ok) {
    throw new Error(`AniList ${res.status}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors[0].message || 'AniList GraphQL error');
  }
  return json.data as TData;
}

/** 12h: AniList only adds a genre when it promotes a tag, which is rare. */
const GENRES_TTL_MS = 12 * 60 * 60 * 1000;

let genresCache: { at: number; includeAdult: boolean; genres: string[] } | null = null;

/**
 * All genres AniList currently knows about, deduplicated and in AniList's own
 * order (Action, Adventure, Comedy, ... Thriller) — stable enough to index the
 * GenreCloud accent palette against.
 *
 * `includeAdult` is the honest way to opt into `Hentai`; callers derive it from
 * the user's content-safety setting rather than passing a literal.
 */
export async function fetchAniListGenres(includeAdult = false): Promise<string[]> {
  if (!includeAdult && genresCache?.includeAdult === false) {
    const age = Date.now() - genresCache.at;
    if (age < GENRES_TTL_MS) return genresCache.genres;
  }

  const data = await gql<{ GenreCollection: string[] }>(
    'query { GenreCollection }',
  );

  const raw = Array.isArray(data.GenreCollection) ? data.GenreCollection : [];
  const genres = [...new Set(raw.map((g) => g.trim()).filter(Boolean))];
  if (!includeAdult) {
    genres.splice(genres.indexOf(ADULT_GENRE), 1);
  }

  if (!includeAdult) {
    genresCache = { at: Date.now(), includeAdult, genres };
  }
  return genres;
}
