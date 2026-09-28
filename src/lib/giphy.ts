import type { CommentAttachment } from './commentMedia';

/**
 * Thin Giphy client for the comment GIF picker. The key is a public,
 * rate-limited beta/prod key supplied per-deployment via `VITE_GIPHY_API_KEY`;
 * when it is absent the picker degrades to a "not configured" state rather than
 * throwing. Requests are `pg-13` rated to keep the picker safe-for-work.
 */
const API_KEY = import.meta.env.VITE_GIPHY_API_KEY as string | undefined;
const BASE = 'https://api.giphy.com/v1/gifs';

export interface GiphyGif {
  id: string;
  url: string;
  preview: string;
  title: string;
  width?: number;
  height?: number;
}

export function isGiphyConfigured(): boolean {
  return typeof API_KEY === 'string' && API_KEY.length > 0;
}

function mapGif(g: any): GiphyGif {
  const full = g?.images?.fixed_height ?? g?.images?.original ?? {};
  const small = g?.images?.fixed_height_small ?? g?.images?.preview_gif ?? full;
  return {
    id: String(g?.id ?? ''),
    url: full?.url ?? '',
    preview: small?.url ?? full?.url ?? '',
    title: g?.title || 'GIF',
    width: Number(full?.width) || undefined,
    height: Number(full?.height) || undefined,
  };
}

async function fetchGiphy(path: string, params: Record<string, string>): Promise<GiphyGif[]> {
  if (!API_KEY) return [];
  const qs = new URLSearchParams({
    api_key: API_KEY,
    rating: 'pg-13',
    bundle: 'messaging_non_clips',
    ...params,
  });
  const res = await fetch(`${BASE}/${path}?${qs.toString()}`);
  if (!res.ok) throw new Error(`Giphy request failed (${res.status})`);
  const json = await res.json();
  return (Array.isArray(json?.data) ? json.data : [])
    .map(mapGif)
    .filter((g: GiphyGif) => /^https?:\/\//i.test(g.url));
}

export function trendingGifs(limit = 24): Promise<GiphyGif[]> {
  return fetchGiphy('trending', { limit: String(limit) });
}

export function searchGifs(query: string, limit = 24): Promise<GiphyGif[]> {
  const q = query.trim();
  if (!q) return trendingGifs(limit);
  return fetchGiphy('search', { q, limit: String(limit) });
}

export function gifToAttachment(g: GiphyGif): CommentAttachment {
  return {
    type: 'gif',
    url: g.url,
    preview: g.preview,
    width: g.width,
    height: g.height,
    title: g.title,
  };
}
