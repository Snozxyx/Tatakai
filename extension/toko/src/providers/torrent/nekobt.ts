/**
 * NekoBT torrent provider adapter (using Torznab API / RSS).
 */
import { normalizeQuality } from '../../utils/scraping/quality.js';
import type { TorrentProvider, SourceOptions, SourceResult } from '../../types/index.js';
import { fetchResponse, loadHtml } from '../../utils/http/fetch.js';
import { scoreEpisodeMatch, isBatchTitle } from '../../utils/torrent/matcher.js';
import { buildSearchQueries } from '../../utils/scraping/title-normalizer.js';

function formatSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
}

const BASE = 'https://nekobt.to';

const provider: TorrentProvider = {
  name: 'nekobt',
  sites: [BASE],
  async batch(opts: SourceOptions): Promise<SourceResult[]> {
    const titles = opts.titles ?? [];
    const ep = opts.episode ?? 0;
    if (titles.length === 0) return [];

    const epPad = ep > 0 ? String(ep).padStart(2, '0') : '';
    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

    let xml = '';
    for (const title of buildSearchQueries(titles)) {
      const qStr = ep > 0 ? `${title} ${epPad}` : title;
      const url = `${BASE}/api/torznab/api?t=search&q=${encodeURIComponent(qStr)}`;
      try {
        const res = await fetchResponse(url, {
          headers: { 'User-Agent': UA },
          timeoutMs: 6000,
        });
        if (res.ok) {
          const text = await res.text();
          if (text.includes('<item>')) {
            xml = text;
            break;
          }
        }
      } catch { continue; }
    }

    if (!xml) return [];

    const $ = loadHtml(xml);
    const results: SourceResult[] = [];
    const seenUrls = new Set<string>();

    $.find('item').each((_: number, item: any) => {
      const title = $(item).find('title').first().text().trim();
      const magnetUrl = $(item).find('link').first().text().trim() || $(item).find('enclosure').attr('url') || '';
      if (!magnetUrl || !magnetUrl.startsWith('magnet:') || seenUrls.has(magnetUrl)) return;

      if (ep > 0) {
        if (isBatchTitle(title)) return;
        if (scoreEpisodeMatch(title, ep) === 0) return;
      }
      seenUrls.add(magnetUrl);

      const sizeStr = $(item).find('size').text().trim() || $(item).find('torznab\\:attr[name="size"]').attr('value');
      const seedersStr = $(item).find('torznab\\:attr[name="seeders"]').attr('value');
      const leechersStr = $(item).find('torznab\\:attr[name="leechers"]').attr('value');

      const size = sizeStr ? parseInt(sizeStr, 10) : undefined;
      const seeders = seedersStr ? parseInt(seedersStr, 10) : undefined;
      const leechers = leechersStr ? parseInt(leechersStr, 10) : undefined;
      const peers = (seeders || 0) + (leechers || 0);

      results.push({
        source: 'nekobt',
        url: magnetUrl,
        quality: normalizeQuality(title),
        headers: {},
        subtitles: [],
        sourceType: 'torrent' as const,
        audioLanguage: 'ja',
        torrentTitle: title,
        seeders,
        leechers,
        peers: peers > 0 ? peers : undefined,
        fileSize: formatSize(size),
      });
    });

    results.sort((a, b) => (b.seeders ?? 0) - (a.seeders ?? 0));
    return results.slice(0, 15);
  },
};

export default provider;
