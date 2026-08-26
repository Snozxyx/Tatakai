/**
 * SeaDex torrent provider using the releases.moe PocketBase API.
 * SeaDex records are collection recommendations, so preserve the actual
 * release filename when it is available instead of exposing a generic label.
 */
import { normalizeQuality } from '../../utils/scraping/quality.js';
import type { TorrentProvider, SourceOptions, SourceResult } from '../../types/index.js';
import { fetchResponse } from '../../utils/http/fetch.js';
import { inferTorrentFileFormat, scoreTitleMatch } from '../../utils/torrent/matcher.js';

const BASE = 'https://releases.moe';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

const TRACKERS = [
  'http://nyaa.tracker.wf:7777/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://tracker.torrent.eu.org:451/announce',
].map(t => `&tr=${encodeURIComponent(t)}`).join('');

interface TorrentRecord {
  id: string;
  infoHash?: string;
  url?: string;
  isBest?: boolean;
  releaseGroup?: string;
  tracker?: string;
  dualAudio?: boolean;
  files?: Array<{ name: string; length: number }>;
  tags?: string[];
  title?: string;
  name?: string;
}

interface EntryRecord {
  alID: number;
  id: string;
  expand?: { trs?: TorrentRecord[] };
}

interface PBResponse {
  items?: EntryRecord[];
}

function buildMagnet(infoHash: string, name: string): string {
  return `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(name)}${TRACKERS}`;
}

function inferQuality(record: TorrentRecord): string {
  const tags = (record.tags ?? []).join(' ');
  const name = record.releaseGroup ?? '';
  if (/2160|4k/i.test(tags + name)) return '4K';
  if (/1080/i.test(tags + name)) return '1080p';
  if (/720/i.test(tags + name)) return '720p';
  return 'auto';
}

function formatBytes(bytes: number): string | undefined {
  if (!Number.isFinite(bytes) || bytes <= 0) return undefined;
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${Math.round(bytes / 1_000_000)} MB`;
  return `${Math.round(bytes / 1_000)} KB`;
}

function sanitizeRecommendedTitle(value: string): string {
  return value
    .replace(/\s*\(\s*SeaDex recommended\s*\)\s*/gi, ' ')
    .replace(/\s*★\s*best\b/gi, ' ')
    .replace(/\s*\b(?:best|recommended)\b\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function torrentDisplayName(record: TorrentRecord, seriesTitle: string): string {
  const fileName = record.files?.find(file => /\.(mkv|mp4|webm|avi|mov|m4v)$/i.test(file.name))?.name
    ?? record.files?.[0]?.name;
  if (fileName) return fileName;

  const recordTitle = (record.title?.trim() || record.name?.trim() || '').replace(/\s*\(\s*SeaDex recommended\s*\)\s*★?best\b/gi, '');
  const cleanedTitle = sanitizeRecommendedTitle(recordTitle);
  if (cleanedTitle) return cleanedTitle;

  const group = record.releaseGroup ? `[${record.releaseGroup}] ` : '';
  const fallbackName = `${group}${seriesTitle}`.trim();
  return fallbackName || 'SeaDex recommended';
}

const provider: TorrentProvider = {
  name: 'seadex',
  sites: [BASE],

  async batch(opts: SourceOptions): Promise<SourceResult[]> {
    const seriesTitle = opts.titles[0] ?? 'Anime';

    const fetchRecords = async (filter: string): Promise<PBResponse | null> => {
      try {
        const res = await fetchResponse(
          `${BASE}/api/collections/entries/records?filter=${encodeURIComponent(filter)}&expand=trs&perPage=10`,
          { headers: { 'User-Agent': UA }, timeoutMs: 10_000 },
        );
        if (!res.ok) return null;
        return await res.json() as PBResponse;
      } catch {
        return null;
      }
    };

    let data: PBResponse | null = null;
    if (opts.anilistId) {
      data = await fetchRecords(`alID=${opts.anilistId}`);
    }
    if (!data || !data.items?.length) {
      const titleFilter = seriesTitle.replace(/['\\]/g, '').trim();
      if (titleFilter) {
        data = await fetchRecords(`(title~'${titleFilter}')`);
      }
    }
    if (!data) return [];

    const records = data.items?.flatMap(item => item.expand?.trs ?? []) ?? [];
    const results: Array<SourceResult & { isBest?: boolean }> = [];

    for (const record of records) {
      if (!record.infoHash) continue;

      const torrentTitle = torrentDisplayName(record, seriesTitle);
      const magnetLink = buildMagnet(record.infoHash, torrentTitle);
      const fileSize = formatBytes((record.files ?? []).reduce(
        (total, file) => total + (Number(file.length) || 0),
        0,
      ));

      results.push({
        source: 'seadex',
        url: magnetLink,
        magnetLink,
        quality: normalizeQuality(inferQuality(record)),
        headers: {},
        subtitles: [],
        sourceType: 'torrent',
        audioLanguage: record.dualAudio ? 'en' : 'ja',
        torrentTitle,
        releaseGroup: record.releaseGroup,
        fileSize,
        fileFormat: inferTorrentFileFormat(torrentTitle, ...((record.files ?? []).map(file => file.name))),
        matchScore: scoreTitleMatch(torrentTitle, seriesTitle),
        isBest: record.isBest,
      });
    }

    return results
      .sort((a, b) => Number(Boolean(b.isBest)) - Number(Boolean(a.isBest)))
      .slice(0, 10)
      .map(({ isBest: _isBest, ...result }) => result);
  },
};

export default provider;
