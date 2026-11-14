import { adultApi, type AdultMedia } from './adultApi';

export interface PornhwaIdentity {
  pornhwaId: string;
  tatakaiId?: string;
  anilistId?: number;
}

const positiveId = (value: unknown) => /^\d+$/.test(String(value || '')) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? String(Number(value)) : undefined;
const canonicalId = (value: unknown) => /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(String(value || '')) ? String(value) : undefined;

/** Reader route numbers are AniList IDs; PornhwaDB IDs always have their own namespace. */
export function pornhwaIdentityFromMedia(media: Partial<AdultMedia>): PornhwaIdentity | null {
  const pornhwaId = positiveId(media.sourceIds?.pornhwadb);
  return pornhwaId ? { pornhwaId, tatakaiId: canonicalId(media.tatakaiId || media.id), anilistId: Number(positiveId(media.anilistId)) || undefined } : null;
}

export async function resolvePornhwaIdentity(id: string, media?: Partial<AdultMedia>, signal?: AbortSignal): Promise<PornhwaIdentity | null> {
  const direct = /^pornhwadb:(\d+)$/.exec(id);
  if (direct && positiveId(direct[1])) return { pornhwaId: direct[1], tatakaiId: canonicalId(media?.tatakaiId), anilistId: media?.anilistId };
  const known = media && pornhwaIdentityFromMedia(media);
  if (known) return known;
  const lookup = canonicalId(media?.tatakaiId) || id;
  if (!canonicalId(lookup) && !/^(?:anilist:)?\d+$/.test(lookup)) return null;
  const resolved = await adultApi<AdultMedia>('media/' + encodeURIComponent(lookup), {}, signal);
  return pornhwaIdentityFromMedia(resolved);
}

export function pornhwaSeriesHref(identity: Partial<PornhwaIdentity>): string {
  const id = positiveId(identity.anilistId) || canonicalId(identity.tatakaiId) || (positiveId(identity.pornhwaId) ? 'pornhwadb:' + identity.pornhwaId : null);
  return id ? '/adult/manga/' + encodeURIComponent(id) : '/adult/manga';
}

/** PornhwaDB already signs and resizes these URLs; Gallery uses the original thumbnail. */
export function galleryImageUrl(value: string | undefined): string {
  if (!value) return '';
  try {
    const url = new URL(value, 'https://img.pornhwadb.com');
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}
