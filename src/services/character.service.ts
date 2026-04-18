import { externalApiGet, TATAKAI_API_URL } from "@/lib/api/api-client";
import { CharacterApiResponse, CharacterBase, CharacterDetail } from "@/types/anime";
import { searchJikanCharacters } from "@/services/jikan.service";

const CHAR_API_URL = "https://anime-api.canelacho.com/api/v1";

const EXTERNAL_CHARACTER_ID_PREFIX = "ext-";
const DEFAULT_CHARACTER_IMAGE = "/placeholder.svg";

type UnknownRecord = Record<string, unknown>;

type RawCharacterResponse = {
  success?: boolean;
  message?: string;
  data?: unknown;
  pagination?: UnknownRecord;
};

const fetchCharacterApiViaProxy = <T>(path: string): Promise<T> => {
  const targetUrl = `${CHAR_API_URL}${path}`;
  return externalApiGet<T>(
    TATAKAI_API_URL,
    `/techinmind/proxy?url=${encodeURIComponent(targetUrl)}`
  );
};

const asString = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
};

const asNumber = (value: unknown, fallback: number): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const asOptionalNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((entry) => asString(entry)).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[,/|]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
};

const resolveAnimeName = (value: unknown, fallback?: unknown): string => {
  if (typeof value === "string") return value.trim();

  if (value && typeof value === "object") {
    const record = value as UnknownRecord;
    return (
      asString(record.name) ||
      asString(record.title) ||
      asString(record.romaji) ||
      asString(record.english)
    );
  }

  return asString(fallback);
};

const normalizeNameForMatch = (value: string): string =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const namesLikelyMatch = (left?: string, right?: string): boolean => {
  const normalizedLeft = normalizeNameForMatch(String(left || ""));
  const normalizedRight = normalizeNameForMatch(String(right || ""));

  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;
  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) return true;

  const leftTokens = new Set(normalizedLeft.split(" ").filter((token) => token.length > 2));
  const rightTokens = normalizedRight.split(" ").filter((token) => token.length > 2);
  const overlapCount = rightTokens.filter((token) => leftTokens.has(token)).length;

  return overlapCount >= Math.min(2, rightTokens.length);
};

const buildSlug = (value: string): string => {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();

  return normalized || "unknown-character";
};

const normalizeCharacterId = (record: UnknownRecord, fallbackName: string): string => {
  const legacyId = asString(record._id);
  if (legacyId) return legacyId;

  const externalNumericId = asString(record.id || record.characterId);
  if (externalNumericId) {
    if (/^\d+$/.test(externalNumericId)) {
      return `${EXTERNAL_CHARACTER_ID_PREFIX}${externalNumericId}`;
    }
    return externalNumericId;
  }

  return buildSlug(fallbackName);
};

const normalizeCharacterBase = (row: UnknownRecord): CharacterBase => {
  const firstName = asString(row.firstName);
  const lastName = asString(row.lastName);
  const assembledName = [firstName, lastName].filter(Boolean).join(" ").trim();

  const name =
    asString(row.name) ||
    asString(row.fullName) ||
    asString(row.displayName) ||
    assembledName ||
    asString(row.title) ||
    "Unknown Character";

  return {
    _id: normalizeCharacterId(row, name),
    name,
    anime: resolveAnimeName(row.anime, row.series) || "Unknown Anime",
    image:
      asString(row.image) ||
      asString(row.avatar) ||
      asString(row.poster) ||
      asString(row.thumbnail) ||
      DEFAULT_CHARACTER_IMAGE,
    malId: asOptionalNumber(row.malId ?? row.mal_id ?? row.malID),
    gender: asString(row.gender) || undefined,
    status: asString(row.status) || undefined,
  };
};

const buildDescription = (base: CharacterBase, row: UnknownRecord): string => {
  const explicitDescription = asString(row.description);
  if (explicitDescription) return explicitDescription;

  const title = asString(row.title);
  const occupation = asString(row.occupation);
  const village = asString(row.village);
  const country = asString(row.country);

  const lines: string[] = [];
  if (title) lines.push(`${base.name} is known as ${title}.`);
  if (occupation) lines.push(`Occupation: ${occupation}.`);
  if (base.anime && base.anime !== "Unknown Anime") lines.push(`Appears in ${base.anime}.`);

  const origin = [village, country].filter(Boolean).join(", ");
  if (origin) lines.push(`Origin: ${origin}.`);

  return lines.join(" ") || `${base.name} appears in ${base.anime}.`;
};

const normalizeCharacterDetail = (row: UnknownRecord): CharacterDetail => {
  const base = normalizeCharacterBase(row);
  const powers = toStringArray(row.powers || row.power);
  const abilities = toStringArray(row.abilities || row.ability);
  const elements = toStringArray(row.elements || row.element);
  const occupations = toStringArray(row.occupation);

  const resolvedAbilities = abilities.length > 0 ? abilities : elements;

  return {
    ...base,
    description: buildDescription(base, row),
    age: asString(row.age) || undefined,
    birthday: asString(row.birthday) || undefined,
    occupation: occupations.length > 0 ? occupations : undefined,
    powers: powers.length > 0 ? powers : undefined,
    abilities: resolvedAbilities.length > 0 ? resolvedAbilities : undefined,
    weapons: toStringArray(row.weapons).length > 0 ? toStringArray(row.weapons) : undefined,
    country: asString(row.country) || asString(row.village) || undefined,
    clan: asString(row.clan) || undefined,
    elements: elements.length > 0 ? elements : undefined,
    affiliations: toStringArray(row.affiliations).length > 0 ? toStringArray(row.affiliations) : undefined,
    family: Array.isArray(row.family) ? (row.family as Array<{ name: string; relation: string }>) : undefined,
    voiceActors: Array.isArray(row.voiceActors)
      ? (row.voiceActors as Array<{ name: string; language: string }>)
      : undefined,
  };
};

const normalizePagination = (
  pagination: UnknownRecord | undefined,
  page: number,
  limit: number,
  totalRows: number
) => ({
  currentPage: asNumber(pagination?.currentPage, page),
  totalPages: asNumber(pagination?.totalPages, 1),
  totalCharacters: asNumber(pagination?.totalCharacters ?? pagination?.totalItems, totalRows),
  pageSize: asNumber(pagination?.pageSize ?? pagination?.itemsPerPage, limit),
});

const extractCharacterRows = (payload: unknown): UnknownRecord[] => {
  if (Array.isArray(payload)) {
    return payload.filter((entry): entry is UnknownRecord => typeof entry === "object" && entry !== null);
  }

  if (payload && typeof payload === "object") {
    const record = payload as UnknownRecord;
    if (Array.isArray(record.data)) {
      return record.data.filter((entry): entry is UnknownRecord => typeof entry === "object" && entry !== null);
    }
  }

  return [];
};

const normalizeCharacterListResponse = (
  response: RawCharacterResponse,
  page: number,
  limit: number
): CharacterApiResponse<CharacterBase[]> => {
  const rows = extractCharacterRows(response.data);
  const data = rows.map(normalizeCharacterBase);

  return {
    success: response.success !== false,
    message: response.message || "Characters fetched",
    data,
    pagination: normalizePagination(response.pagination, page, limit, data.length),
  };
};

const toApiCharacterId = (id: string): string => {
  const normalized = String(id || "").trim();
  if (!normalized) return normalized;
  if (normalized.startsWith(EXTERNAL_CHARACTER_ID_PREFIX)) {
    return normalized.slice(EXTERNAL_CHARACTER_ID_PREFIX.length);
  }
  return normalized;
};

export async function fetchCharacters(page: number = 1, limit: number = 20): Promise<CharacterApiResponse<CharacterBase[]>> {
  const response = await fetchCharacterApiViaProxy<RawCharacterResponse>(`/characters?page=${page}&limit=${limit}`);
  return normalizeCharacterListResponse(response, page, limit);
}

export async function fetchCharacterById(id: string): Promise<CharacterApiResponse<CharacterDetail>> {
  const apiId = toApiCharacterId(id);
  const response = await fetchCharacterApiViaProxy<RawCharacterResponse>(`/characters/${encodeURIComponent(apiId)}`);
  const record = (response.data && typeof response.data === "object" ? (response.data as UnknownRecord) : {}) as UnknownRecord;

  return {
    success: response.success !== false,
    message: response.message || "Character fetched",
    data: normalizeCharacterDetail(record),
  };
}

export async function searchCharacters(query: string, page: number = 1, limit: number = 20): Promise<CharacterApiResponse<CharacterBase[]>> {
  const encodedQuery = encodeURIComponent(query);

  const enrichWithJikan = async (payload: CharacterApiResponse<CharacterBase[]>) => {
    const characters = Array.isArray(payload.data) ? payload.data : [];
    if (characters.length === 0) return payload;

    const needsImageOrRouteHint = characters.some(
      (character) => !character.malId || !character.image || character.image === DEFAULT_CHARACTER_IMAGE
    );
    if (!needsImageOrRouteHint) return payload;

    try {
      const jikanResponse = await searchJikanCharacters(query, 1);
      const jikanRows = Array.isArray(jikanResponse?.data) ? jikanResponse.data : [];
      if (jikanRows.length === 0) return payload;

      const enrichedData = characters.map((character) => {
        const matched = character.malId
          ? jikanRows.find((candidate) => Number(candidate.mal_id) === Number(character.malId))
          : jikanRows.find((candidate) => namesLikelyMatch(candidate.name, character.name));

        if (!matched) return character;

        const jikanImage =
          matched.images?.jpg?.image_url ||
          matched.images?.jpg?.small_image_url ||
          matched.images?.webp?.image_url ||
          matched.images?.webp?.small_image_url ||
          "";

        return {
          ...character,
          malId: character.malId || matched.mal_id,
          image:
            character.image && character.image !== DEFAULT_CHARACTER_IMAGE
              ? character.image
              : (jikanImage || character.image || DEFAULT_CHARACTER_IMAGE),
        };
      });

      return {
        ...payload,
        data: enrichedData,
      };
    } catch {
      return payload;
    }
  };

  try {
    const response = await fetchCharacterApiViaProxy<RawCharacterResponse>(
      `/characters/search?name=${encodedQuery}&page=${page}&limit=${limit}`
    );
    const normalized = normalizeCharacterListResponse(response, page, limit);
    return enrichWithJikan(normalized);
  } catch {
    const response = await fetchCharacterApiViaProxy<RawCharacterResponse>(
      `/characters/search?q=${encodedQuery}&page=${page}&limit=${limit}`
    );
    const normalized = normalizeCharacterListResponse(response, page, limit);
    return enrichWithJikan(normalized);
  }
}
