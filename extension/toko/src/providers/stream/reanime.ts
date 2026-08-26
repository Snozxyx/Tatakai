/**
 * Re:ANIME — direct-stream adapter (https://reanime.to)
 *
 * Resolves episodes by AniList ID through the public Flix API:
 *   GET /api/flix/{anilistId}/{episode}
 *
 * The API returns FlixCloud embed URLs (https://flixcloud.cc/e/{id}?v=N).
 * Those embed pages do not expose a plain stream URL directly — the real HLS/MP4
 * is encrypted behind a WASM + PBKDF2 + AES-CBC scheme. We ported the reference
 * (Seanime/A2) decoder into utils/flixcloud.ts so this provider returns a
 * directly playable URL whenever decryption succeeds, and falls back to the
 * embed URL (custom source type) otherwise.
 */
import { normalizeQuality, detectSourceType } from '../../utils/scraping/quality.js';
import { resolveFlixCloud } from '../../utils/common/flixcloud.js';
import type { StreamProvider, SourceOptions, SourceResult, SubtitleTrack } from '../../types/index.js';

import { fetchResponse } from '../../utils/http/fetch.js';

const BASE_URL = 'https://reanime.to';
const ALT_BASE_URL = 'https://reanime.net';

interface FlixServer {
  $id?: string;
  serverName?: string;
  dataLink?: string;
  dataType?: string;
  continue?: boolean;
  softsub?: boolean;
}

interface FlixResponse {
  success?: boolean;
  servers?: FlixServer[];
}

function languageLabel(dataType?: string): string {
  if (dataType === 'dub' || dataType === 's-dub') return 'English/Dub';
  return 'Japanese/Sub';
}

function absoluteUrl(url: string, base: string): string {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

async function fetchFlix(anilistId: number, episode: number): Promise<FlixServer[]> {
  const bases = [BASE_URL, ALT_BASE_URL];
  for (const base of bases) {
    try {
      const url = `${base}/api/flix/${anilistId}/${episode}`;
      const res = await fetchResponse(url, {
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'identity',
          Referer: `${base}/`,
        },
      });
      if (!res.ok) continue;

      const text = await res.text();
      if (!text) continue;
      const data = JSON.parse(text) as FlixResponse;
      if (data?.servers?.length) return data.servers;
    } catch {
      // try next base
    }
  }
  return [];
}

const provider: StreamProvider = {
  name: 'reanime',
  sites: [BASE_URL, ALT_BASE_URL],

  async single(opts: SourceOptions): Promise<SourceResult[]> {
    const anilistId = opts.anilistId;
    const episode = opts.episode ?? 1;
    if (!anilistId) return [];

    const servers = await fetchFlix(anilistId, episode);
    if (servers.length === 0) return [];

    // HD-2 is the reference-preferred server; keep first unique dataLink per
    // (serverName, dataType) so we do not emit the same FlixCloud id twice.
    const preference = (name?: string): number => {
      const n = (name || '').toLowerCase();
      if (n.includes('hd-2')) return 0;
      if (n.includes('hd-1')) return 1;
      if (n.includes('maze')) return 2;
      return 3;
    };

    const usable = servers
      .filter(s => Boolean(s?.dataLink))
      .sort((a, b) => {
        const byServer = preference(a.serverName) - preference(b.serverName);
        if (byServer !== 0) return byServer;
        const aDub = a.dataType === 'dub' ? 1 : 0;
        const bDub = b.dataType === 'dub' ? 1 : 0;
        return aDub - bDub;
      });

    const seen = new Set<string>();
    const results: SourceResult[] = [];

    for (const server of usable) {
      const embedUrl = absoluteUrl(server.dataLink!, BASE_URL);
      if (seen.has(embedUrl)) continue;
      seen.add(embedUrl);

      // Attempt to decrypt the FlixCloud embed to a direct stream URL.
      const resolved = await resolveFlixCloud(embedUrl, fetchResponse);
      const streamUrl = resolved?.url || embedUrl;

      const subtitles: SubtitleTrack[] = (resolved?.subtitles || []).map((sub, i) => ({
        url: sub.url,
        label: sub.language,
        language: sub.language,
        default: sub.isDefault && i === 0,
      }));

      results.push({
        source: `reanime-${server.serverName || 'hd'}`,
        url: streamUrl,
        quality: normalizeQuality(server.serverName || 'auto'),
        headers: { Referer: `${BASE_URL}/` },
        subtitles,
        audioLanguage: server.dataType === 'dub' ? 'en' : 'ja',
        language: server.dataType === 'dub' ? 'English Dub' : 'Japanese',
        server: server.serverName || 'hd',
        // FlixCloud always serves HLS once decrypted; embed fallback is custom.
        sourceType: resolved ? detectSourceType(streamUrl) : 'custom',
      });

      // Return up to 4 servers — enough variety without over-fetching.
      if (results.length >= 4) break;
    }

    return results;
  },
};

export default provider;
