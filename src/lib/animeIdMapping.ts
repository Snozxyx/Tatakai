type CandidateValue = string | number | null | undefined;

export type AnimeIdMappingCandidate = {
  id?: CandidateValue;
  anime_id?: CandidateValue;
  animeId?: CandidateValue;
  tatakaiId?: CandidateValue;
  tatakaiID?: CandidateValue;
  tatakai_id?: CandidateValue;
  name?: CandidateValue;
  jname?: CandidateValue;
  title?: CandidateValue;
  titleEnglish?: CandidateValue;
  titleRomaji?: CandidateValue;
  titleNative?: CandidateValue;
  malId?: CandidateValue;
  malID?: CandidateValue;
  mal_id?: CandidateValue;
  anilistId?: CandidateValue;
  anilistID?: CandidateValue;
  anilist_id?: CandidateValue;
  idMal?: CandidateValue;
  [key: string]: unknown;
};

export type AnimeIdMappingIndex = {
  byName: Map<string, string>;
  byRawId: Map<string, string>;
  byExternalId: Map<string, string>;
};

export type ParsedAnimeId = {
  provider: 'mal' | 'anilist';
  id: number;
};

const normalizeLookupKey = (value?: CandidateValue) => String(value ?? '').trim().toLowerCase();

const normalizeRouteId = (value?: CandidateValue) => String(value ?? '').trim();

const isExternalRouteId = (value?: string) => {
  const raw = String(value ?? '').trim();
  if (!raw) return false;
  return /^(mal|anilist)-\d+$/i.test(raw) || /^\d+$/.test(raw);
};

const getCandidateId = (candidate: AnimeIdMappingCandidate) =>
  candidate.tatakaiId ?? candidate.tatakaiID ?? candidate.tatakai_id ?? candidate.id ?? candidate.anime_id ?? candidate.animeId;

const getTatakaiId = (candidate: AnimeIdMappingCandidate) =>
  normalizeRouteId(candidate.tatakaiId ?? candidate.tatakaiID ?? candidate.tatakai_id);

const getCandidateName = (candidate: AnimeIdMappingCandidate) =>
  candidate.name ?? candidate.jname ?? candidate.title ?? candidate.titleEnglish ?? candidate.titleRomaji ?? candidate.titleNative;

const getMalId = (candidate: AnimeIdMappingCandidate) =>
  toPositiveInt(candidate.malId ?? candidate.malID ?? candidate.mal_id ?? candidate.idMal);

const getAnilistId = (candidate: AnimeIdMappingCandidate) =>
  toPositiveInt(candidate.anilistId ?? candidate.anilistID ?? candidate.anilist_id);

const getKnownRouteId = (candidate: AnimeIdMappingCandidate) => {
  const tatakaiId = getTatakaiId(candidate);
  if (tatakaiId) return tatakaiId;

  const explicitId = getCandidateId(candidate);
  const parsedExplicitId = parseExternalAnimeId(typeof explicitId === 'string' ? explicitId : undefined);
  if (parsedExplicitId) {
    return `${parsedExplicitId.provider}:${parsedExplicitId.id}`;
  }

  const normalizedId = normalizeRouteId(explicitId);
  if (normalizedId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizedId)) {
    return normalizedId;
  }

  const externalRouteId = buildExternalAnimeRouteId(getMalId(candidate), getAnilistId(candidate));
  if (externalRouteId) {
    return externalRouteId;
  }

  return normalizedId || undefined;
};

const setPreferredMapping = (map: Map<string, string>, key: string, routeId: string) => {
  if (!key || !routeId) return;

  const existing = map.get(key);
  if (!existing) {
    map.set(key, routeId);
    return;
  }

  if (!isExternalRouteId(routeId) && isExternalRouteId(existing)) {
    map.set(key, routeId);
    return;
  }

  if (isExternalRouteId(routeId) && !isExternalRouteId(existing)) {
    return;
  }
};

export function toPositiveInt(value: CandidateValue): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;

  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value).trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;

  return Math.trunc(parsed);
}

export function parseExternalAnimeId(value?: string | null): ParsedAnimeId | null {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) return null;

  const match = rawValue.match(/^(mal|anilist)[\-_:]?([0-9]+)$/i);
  if (!match) return null;

  return {
    provider: match[1].toLowerCase() as ParsedAnimeId['provider'],
    id: Number.parseInt(match[2], 10),
  };
}

export function buildExternalAnimeRouteId(malId?: CandidateValue, anilistId?: CandidateValue): string | undefined {
  const parsedAnilistId = toPositiveInt(anilistId);
  if (parsedAnilistId) return `anilist:${parsedAnilistId}`;

  const parsedMalId = toPositiveInt(malId);
  if (parsedMalId) return `mal:${parsedMalId}`;

  return undefined;
}

export function createAnimeIdMappingIndex(): AnimeIdMappingIndex {
  return {
    byName: new Map<string, string>(),
    byRawId: new Map<string, string>(),
    byExternalId: new Map<string, string>(),
  };
}

export function registerAnimeIdMappings(index: AnimeIdMappingIndex, candidates: AnimeIdMappingCandidate[]) {
  for (const candidate of candidates) {
    const routeId = getKnownRouteId(candidate);
    if (!routeId) continue;

    const candidateId = normalizeLookupKey(getCandidateId(candidate));
    if (candidateId) setPreferredMapping(index.byRawId, candidateId, routeId);

    const candidateName = normalizeLookupKey(getCandidateName(candidate));
    if (candidateName) setPreferredMapping(index.byName, candidateName, routeId);

    const malId = getMalId(candidate);
    if (malId) setPreferredMapping(index.byExternalId, `mal-${malId}`, routeId);

    const anilistId = getAnilistId(candidate);
    if (anilistId) setPreferredMapping(index.byExternalId, String(anilistId), routeId);
  }
}

export function collectAnimeCandidatesFromHome(homeData: any): AnimeIdMappingCandidate[] {
  const candidates: AnimeIdMappingCandidate[] = [];

  const pushMany = (items: unknown) => {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (item && typeof item === 'object') {
        candidates.push(item as AnimeIdMappingCandidate);
      }
    }
  };

  pushMany(homeData?.latestEpisodeAnimes);
  pushMany(homeData?.spotlightAnimes);
  pushMany(homeData?.topAiringAnimes);
  pushMany(homeData?.topUpcomingAnimes);
  pushMany(homeData?.trendingAnimes);
  pushMany(homeData?.mostPopularAnimes);
  pushMany(homeData?.mostFavoriteAnimes);
  pushMany(homeData?.latestCompletedAnimes);
  pushMany(homeData?.top10Animes?.today);
  pushMany(homeData?.top10Animes?.week);
  pushMany(homeData?.top10Animes?.month);

  return candidates;
}

export function buildPreferredAnimeRouteId(
  candidate: AnimeIdMappingCandidate | null | undefined,
  index?: AnimeIdMappingIndex
): string | undefined {
  if (!candidate) return undefined;

  const tatakaiId = getTatakaiId(candidate);
  if (tatakaiId) return tatakaiId;

  const explicitId = getCandidateId(candidate);
  const parsedExplicitId = parseExternalAnimeId(typeof explicitId === 'string' ? explicitId : undefined);
  if (parsedExplicitId) {
    return `${parsedExplicitId.provider}:${parsedExplicitId.id}`;
  }

  const normalizedExplicitId = normalizeRouteId(explicitId);
  if (normalizedExplicitId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizedExplicitId)) {
    return normalizedExplicitId;
  }

  const malId = getMalId(candidate);
  const anilistId = getAnilistId(candidate);
  const externalRouteId = buildExternalAnimeRouteId(malId, anilistId);
  if (externalRouteId) {
    if (index) {
      const externalLookup = index.byExternalId.get(externalRouteId);
      if (externalLookup) return externalLookup;
    }

    return externalRouteId;
  }

  const normalizedId = normalizeLookupKey(explicitId);
  if (index && normalizedId) {
    const mappedById = index.byRawId.get(normalizedId);
    if (mappedById) return mappedById;
  }

  const candidateName = normalizeLookupKey(getCandidateName(candidate));
  if (index && candidateName) {
    const mappedByName = index.byName.get(candidateName);
    if (mappedByName) return mappedByName;
  }

  const fallbackRouteId = normalizedExplicitId || normalizeRouteId(explicitId);
  return fallbackRouteId || undefined;
}