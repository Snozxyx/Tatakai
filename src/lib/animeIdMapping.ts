export type AnimeIdCandidate = {
  id?: unknown;
  name?: unknown;
  malId?: unknown;
  malID?: unknown;
  mal_id?: unknown;
  anilistId?: unknown;
  anilistID?: unknown;
  anilist_id?: unknown;
};

export type AnimeIdMappingEntry = {
  hianimeId: string;
  malId: number | null;
  anilistId: number | null;
  name?: string;
};

export type AnimeIdMappingIndex = {
  byHianimeId: Map<string, AnimeIdMappingEntry>;
  byMalId: Map<number, AnimeIdMappingEntry>;
  byAniListId: Map<number, AnimeIdMappingEntry>;
  byName: Map<string, AnimeIdMappingEntry>;
};

const EXTERNAL_ID_PATTERN = /^(mal|anilist)-(\d+)$/i;

export const toPositiveInt = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }
  return null;
};

const normalizeName = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value
    .toLowerCase()
    .replace(/[\W_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

export const parseExternalAnimeId = (
  value: unknown
): { provider: "mal" | "anilist"; id: number } | null => {
  if (typeof value !== "string") return null;
  const match = value.trim().match(EXTERNAL_ID_PATTERN);
  if (!match) return null;
  const parsed = toPositiveInt(match[2]);
  if (!parsed) return null;
  return { provider: match[1].toLowerCase() as "mal" | "anilist", id: parsed };
};

export const isExternalAnimeId = (value: unknown): boolean => {
  return parseExternalAnimeId(value) !== null;
};

const extractExternalIds = (candidate: AnimeIdCandidate) => {
  const malId =
    toPositiveInt(candidate.malId) ??
    toPositiveInt(candidate.malID) ??
    toPositiveInt(candidate.mal_id) ??
    null;

  const anilistId =
    toPositiveInt(candidate.anilistId) ??
    toPositiveInt(candidate.anilistID) ??
    toPositiveInt(candidate.anilist_id) ??
    null;

  return { malId, anilistId };
};

export const createAnimeIdMappingIndex = (): AnimeIdMappingIndex => ({
  byHianimeId: new Map<string, AnimeIdMappingEntry>(),
  byMalId: new Map<number, AnimeIdMappingEntry>(),
  byAniListId: new Map<number, AnimeIdMappingEntry>(),
  byName: new Map<string, AnimeIdMappingEntry>(),
});

export const registerAnimeIdMapping = (
  index: AnimeIdMappingIndex,
  candidate: AnimeIdCandidate
) => {
  const rawId = typeof candidate.id === "string" ? candidate.id.trim() : "";
  if (!rawId || isExternalAnimeId(rawId)) {
    return;
  }

  const { malId, anilistId } = extractExternalIds(candidate);
  const normalizedName = normalizeName(candidate.name);

  const entry: AnimeIdMappingEntry = {
    hianimeId: rawId,
    malId,
    anilistId,
    name: normalizedName || undefined,
  };

  index.byHianimeId.set(rawId, entry);
  if (malId) index.byMalId.set(malId, entry);
  if (anilistId) index.byAniListId.set(anilistId, entry);
  if (normalizedName) index.byName.set(normalizedName, entry);
};

export const registerAnimeIdMappings = (
  index: AnimeIdMappingIndex,
  candidates: AnimeIdCandidate[]
) => {
  for (const candidate of candidates) {
    registerAnimeIdMapping(index, candidate);
  }
};

export const resolveMappedHianimeId = (
  index: AnimeIdMappingIndex,
  candidate: AnimeIdCandidate
): string | null => {
  const rawId = typeof candidate.id === "string" ? candidate.id.trim() : "";
  if (rawId && !isExternalAnimeId(rawId)) {
    return rawId;
  }

  const parsedExternal = parseExternalAnimeId(rawId);
  if (parsedExternal) {
    const mapped =
      parsedExternal.provider === "mal"
        ? index.byMalId.get(parsedExternal.id)
        : index.byAniListId.get(parsedExternal.id);
    if (mapped?.hianimeId) return mapped.hianimeId;
  }

  const { malId, anilistId } = extractExternalIds(candidate);
  if (malId) {
    const mapped = index.byMalId.get(malId);
    if (mapped?.hianimeId) return mapped.hianimeId;
  }
  if (anilistId) {
    const mapped = index.byAniListId.get(anilistId);
    if (mapped?.hianimeId) return mapped.hianimeId;
  }

  const normalizedName = normalizeName(candidate.name);
  if (normalizedName) {
    const mapped = index.byName.get(normalizedName);
    if (mapped?.hianimeId) return mapped.hianimeId;
  }

  return null;
};

export const buildExternalAnimeRouteId = (
  malId?: unknown,
  anilistId?: unknown
): string | null => {
  const mal = toPositiveInt(malId);
  if (mal) return `mal-${mal}`;
  const anilist = toPositiveInt(anilistId);
  if (anilist) return `anilist-${anilist}`;
  return null;
};

export const buildPreferredAnimeRouteId = (
  candidate: AnimeIdCandidate,
  index?: AnimeIdMappingIndex
): string | null => {
  if (index) {
    const mappedHianimeId = resolveMappedHianimeId(index, candidate);
    if (mappedHianimeId) return mappedHianimeId;
  }

  const rawId = typeof candidate.id === "string" ? candidate.id.trim() : "";
  const parsedExternal = parseExternalAnimeId(rawId);
  if (parsedExternal) {
    return `${parsedExternal.provider}-${parsedExternal.id}`;
  }

  const hasExternalPrefix = /^(mal|anilist)-/i.test(rawId);
  if (rawId && !hasExternalPrefix) {
    return rawId;
  }

  const { malId, anilistId } = extractExternalIds(candidate);
  return buildExternalAnimeRouteId(malId, anilistId);
};

export const collectAnimeCandidatesFromHome = (homeData: any): AnimeIdCandidate[] => {
  if (!homeData || typeof homeData !== "object") return [];

  const collections: AnimeIdCandidate[] = [];
  const buckets = [
    homeData.spotlightAnimes,
    homeData.trendingAnimes,
    homeData.latestEpisodeAnimes,
    homeData.topAiringAnimes,
    homeData.topUpcomingAnimes,
    homeData.mostPopularAnimes,
    homeData.mostFavoriteAnimes,
    homeData.latestCompletedAnimes,
    homeData.top10Animes?.today,
    homeData.top10Animes?.week,
    homeData.top10Animes?.month,
  ];

  for (const bucket of buckets) {
    if (!Array.isArray(bucket)) continue;
    for (const item of bucket) {
      if (!item || typeof item !== "object") continue;
      collections.push(item as AnimeIdCandidate);
    }
  }

  return collections;
};