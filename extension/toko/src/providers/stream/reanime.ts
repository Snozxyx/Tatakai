import { normalizeQuality, detectSourceType } from '../../utils/quality.js';
import type { StreamProvider, SourceOptions, SourceResult } from '../../types.js';

declare const __tatakai_fetch__: (url: string, init?: RequestInit) => Promise<Response>;

const BASE_URL = 'https://reanime.to';

const provider: StreamProvider = {
  name: 'reanime',
  async single(opts: SourceOptions): Promise<SourceResult[]> {
    try {
      const anilistId = opts.anilistId;
      const episode = opts.episode ?? 1;
      
      if (!anilistId) return [];

      // Direct API: /api/flix/{anilistId}/{episode}
      const url = `${BASE_URL}/api/flix/${anilistId}/${episode}`;
      console.log('[Reanime] Calling direct API:', url);
      
      const res = await __tatakai_fetch__(url, {
        headers: { 
          Accept: 'application/json',
          'Accept-Encoding': 'identity', // Disable gzip to avoid decompression errors
          Referer: `${BASE_URL}/`,
        },
      });

      if (!res.ok) {
        console.log('[Reanime] API returned', res.status);
        return [];
      }

      const contentType = res.headers.get('content-type') || '';
      console.log('[Reanime] Content-Type:', contentType);

      let data: any;
      try {
        const text = await res.text();
        console.log('[Reanime] Response text length:', text.length);
        console.log('[Reanime] Response preview:', text.substring(0, 200));
        data = JSON.parse(text);
      } catch (parseErr) {
        console.error('[Reanime] Failed to parse response:', parseErr);
        return [];
      }

      if (!data || !data.servers || data.servers.length === 0) {
        console.log('[Reanime] No servers in response:', data);
        return [];
      }

      console.log('[Reanime] Found', data.servers.length, 'servers');
      
      return data.servers
        .filter((server: any) => Boolean(server?.dataLink))
        .map((server: any) => ({
          source: 'reanime',
          url: server.dataLink,
          quality: normalizeQuality(server.serverName || 'auto'),
          headers: { Referer: `${BASE_URL}/` },
          subtitles: [],
          audioLanguage: server.dataType === 'dub' ? 'English/Dub' : 'Japanese/Sub',
          sourceType: 'embed' as const,
        }));
    } catch (err) {
      console.error('[Reanime] Error:', err);
      return [];
    }
  },
};

export default provider;
