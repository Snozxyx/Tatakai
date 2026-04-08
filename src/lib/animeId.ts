import { fetchAnimeInfo } from '@/lib/api';

const EXTERNAL_ANIME_ID_PATTERN = /^(mal|anilist)-\d+$/i;
const canonicalIdCache = new Map<string, string>();
const inflightResolutions = new Map<string, Promise<string>>();

export function isExternalAnimeId(animeId: string | null | undefined): boolean {
  if (!animeId) return false;
  return EXTERNAL_ANIME_ID_PATTERN.test(animeId.trim());
}

function readCanonicalIdFromInfo(payload: any): string | null {
  const candidate = payload?.anime?.info?.id ?? payload?.anime?.id ?? payload?.id;
  if (typeof candidate !== 'string') return null;

  const normalized = candidate.trim();
  if (!normalized) return null;
  return normalized;
}

export async function resolveCanonicalAnimeId(animeId: string): Promise<string> {
  const normalized = animeId.trim();
  if (!normalized) return animeId;

  if (!isExternalAnimeId(normalized)) {
    canonicalIdCache.set(normalized, normalized);
    return normalized;
  }

  const cached = canonicalIdCache.get(normalized);
  if (cached) return cached;

  const existingRequest = inflightResolutions.get(normalized);
  if (existingRequest) return existingRequest;

  const resolver = (async () => {
    try {
      const info = await fetchAnimeInfo(normalized);
      const canonicalId = readCanonicalIdFromInfo(info) || normalized;
      canonicalIdCache.set(normalized, canonicalId);

      if (!isExternalAnimeId(canonicalId)) {
        canonicalIdCache.set(canonicalId, canonicalId);
      }

      return canonicalId;
    } catch {
      canonicalIdCache.set(normalized, normalized);
      return normalized;
    } finally {
      inflightResolutions.delete(normalized);
    }
  })();

  inflightResolutions.set(normalized, resolver);
  return resolver;
}

export async function resolveCanonicalAnimeIds(animeIds: string[]): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(animeIds.filter(Boolean).map((id) => id.trim())));
  const resolved = await Promise.all(
    uniqueIds.map(async (id) => [id, await resolveCanonicalAnimeId(id)] as const)
  );

  return new Map(resolved);
}
