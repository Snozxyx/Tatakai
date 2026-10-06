import {
  type DebridAccount,
  type DebridProvider,
  type DebridUnrestrictResult,
  type RealDebridFile,
  type RealDebridTorrentInfo,
  RealDebridClient,
} from './realdebrid-client';
import {
  type TorboxTorrentFile,
  type TorboxTorrentInfo,
  TorboxClient,
} from './torbox-client';

const ACCOUNTS_KEY = 'tatakai_debrid_accounts';
const ACTIVE_PROVIDER_KEY = 'tatakai_active_debrid_provider';
// Blu-ray packs (.m2ts) and broadcast rips (.mpg/.mpeg/.wmv/.flv/.m2v) used to
// report "No playable video file" even when cached.
const VIDEO_EXTENSION = /\.(?:mp4|mkv|webm|m4v|mov|avi|ts|m2ts|mts|mpg|mpeg|m2v|wmv|flv|ogv|3gp)(?:$|[?#])/i;

// Magnet -> resolved HTTP cache (10min). Prevents the triple addMagnet race
// where WatchPage + VideoPlayer + MobileVideoPlayer each created the same
// provider torrent (quota burn + account pollution).
const resolveCache = new Map<string, { url: string; at: number }>();
const RESOLVE_CACHE_TTL_MS = 10 * 60 * 1000;

function magnetCacheKey(magnet: string, options: Pick<DebridResolveOptions, 'episodeNumber' | 'filenameHint'>): string {
  return `${String(magnet || '').trim()}::${Number(options.episodeNumber) || 0}::${String(options.filenameHint || '').toLowerCase().slice(0, 80)}`;
}

function getCachedResolve(magnet: string, options: Pick<DebridResolveOptions, 'episodeNumber' | 'filenameHint'>): string | null {
  const entry = resolveCache.get(magnetCacheKey(magnet, options));
  if (!entry) return null;
  if (Date.now() - entry.at > RESOLVE_CACHE_TTL_MS) {
    resolveCache.delete(magnetCacheKey(magnet, options));
    return null;
  }
  return entry.url;
}

function setCachedResolve(
  magnet: string,
  options: Pick<DebridResolveOptions, 'episodeNumber' | 'filenameHint'>,
  url: string,
): void {
  resolveCache.set(magnetCacheKey(magnet, options), { url, at: Date.now() });
  // Bound growth: keep the last 50 entries.
  if (resolveCache.size > 50) {
    const oldest = resolveCache.keys().next().value;
    if (oldest) resolveCache.delete(oldest);
  }
}

/** Extract btih hash from a magnet link for TorBox hash-dedupe. */
export function extractMagnetHash(magnet: string): string | null {
  const m = /btih:([a-f0-9]{40}|[a-z2-7]{32})/i.exec(String(magnet || ''));
  return m ? m[1].toLowerCase() : null;
}

type DebridStorage = Pick<Storage, 'getItem' | 'setItem'>;

export interface DebridResolveOptions {
  episodeNumber?: number;
  filenameHint?: string;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  /** Progress callback for uncached torrents (state + 0-100 progress). */
  onProgress?: (state: string, progress?: number) => void;
  /** AbortSignal to cancel polling when the user navigates away. */
  signal?: AbortSignal;
}

export interface DebridVideoFile {
  id: string;
  name: string;
  size: number;
  mimeType?: string;
}

function normalizedEpisode(value?: number): number | null {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function matchesEpisode(name: string, episode?: number): boolean {
  const number = normalizedEpisode(episode);
  if (!number) return false;
  const padded = String(number).padStart(2, '0');
  const escaped = String(number).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedPadded = padded.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [
    new RegExp(`(?:^|[^a-z0-9])s\\d{1,3}e(?:${escapedPadded}|${escaped})(?:v\\d+)?(?:[^0-9]|$)`, 'i'),
    new RegExp(`(?:^|[^a-z0-9])ep(?:isode)?[ ._-]*(?:${escapedPadded}|${escaped})(?:v\\d+)?(?:[^0-9]|$)`, 'i'),
    new RegExp(`(?:^|[ ._-])(?:${escapedPadded}|${escaped})(?:v\\d+)?(?:[ ._-]|$)`, 'i'),
  ].some((pattern) => pattern.test(name));
}

function filenameAffinity(name: string, hint?: string): number {
  const normalizedHint = String(hint || '')
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!normalizedHint) return 0;
  const haystack = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  const tokens = normalizedHint.split(/\s+/).filter((token) => token.length >= 3);
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
}

/** Select the intended episode when possible, otherwise the largest video. */
export function selectBestDebridVideoFile(
  files: DebridVideoFile[],
  options: Pick<DebridResolveOptions, 'episodeNumber' | 'filenameHint'> = {},
): DebridVideoFile | null {
  const videos = files.filter((file) => (
    VIDEO_EXTENSION.test(file.name) || String(file.mimeType || '').toLowerCase().startsWith('video/')
  ));
  if (!videos.length) return null;

  return [...videos].sort((left, right) => {
    const episodeDifference =
      Number(matchesEpisode(right.name, options.episodeNumber)) -
      Number(matchesEpisode(left.name, options.episodeNumber));
    if (episodeDifference) return episodeDifference;
    const hintDifference =
      filenameAffinity(right.name, options.filenameHint) -
      filenameAffinity(left.name, options.filenameHint);
    if (hintDifference) return hintDifference;
    return right.size - left.size;
  })[0];
}

function pollingOptions(options: DebridResolveOptions, defaultAttempts: number) {
  return {
    interval: Math.max(50, Number(options.pollIntervalMs) || 500),
    attempts: Math.max(1, Number(options.maxPollAttempts) || defaultAttempts),
    sleep: options.sleep || ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))),
  };
}

function realDebridFailure(info: RealDebridTorrentInfo): string | null {
  const status = String(info?.status || '').toLowerCase();
  return ['magnet_error', 'error', 'virus', 'dead'].includes(status)
    ? `Real-Debrid could not prepare this torrent (${status})`
    : null;
}

export async function resolveRealDebridMagnet(
  client: Pick<RealDebridClient, 'addMagnet' | 'getTorrentInfo' | 'selectFiles' | 'unrestrictLink'>,
  magnet: string,
  options: DebridResolveOptions = {},
): Promise<DebridUnrestrictResult> {
  const poll = pollingOptions(options, 60);
  const torrentId = await client.addMagnet(magnet);
  let info: RealDebridTorrentInfo | null = null;

  for (let attempt = 0; attempt < poll.attempts; attempt += 1) {
    if (options.signal?.aborted) throw new DOMException('Debrid resolve aborted', 'AbortError');
    info = await client.getTorrentInfo(torrentId);
    const failure = realDebridFailure(info);
    if (failure) throw new Error(failure);
    try { options.onProgress?.(String((info as RealDebridTorrentInfo)?.status || 'pending'), (info as RealDebridTorrentInfo)?.progress); } catch { /* ignore */ }
    if (Array.isArray(info.files) && info.files.length > 0 && info.status !== 'magnet_conversion') break;
    if (attempt < poll.attempts - 1) await poll.sleep(poll.interval);
  }

  const files = (info?.files || []).map((file: RealDebridFile) => ({
    id: String(file.id),
    name: String(file.path || ''),
    size: Number(file.bytes) || 0,
  }));
  const selected = selectBestDebridVideoFile(files, options);
  if (!selected) throw new Error('No playable video file was found in the Real-Debrid torrent');

  await client.selectFiles(torrentId, [selected.id]);

  for (let attempt = 0; attempt < poll.attempts; attempt += 1) {
    if (options.signal?.aborted) throw new DOMException('Debrid resolve aborted', 'AbortError');
    info = await client.getTorrentInfo(torrentId);
    const failure = realDebridFailure(info);
    if (failure) throw new Error(failure);
    if (Array.isArray(info.links) && info.links.length > 0) {
      return client.unrestrictLink(info.links[0]);
    }
    if (attempt < poll.attempts - 1) await poll.sleep(poll.interval);
  }

  throw new Error(`Real-Debrid is still preparing the selected file (${info?.status || 'pending'})`);
}

function torboxFailure(info: TorboxTorrentInfo | null): string | null {
  if (!info) return null;
  if (info.error) return `TorBox could not prepare this torrent (${info.error})`;
  const state = String(info.download_state || '').toLowerCase();
  return ['expired', 'reported missing', 'failed', 'error', 'missingfiles'].includes(state)
    ? `TorBox could not prepare this torrent (${state})`
    : null;
}

export async function resolveTorboxMagnet(
  client: Pick<TorboxClient, 'addMagnet' | 'getTorrentInfo' | 'unrestrictLink' | 'listTorrents'>,
  magnet: string,
  options: DebridResolveOptions & { onProgress?: (state: string, progress?: number) => void } = {},
): Promise<DebridUnrestrictResult> {
  const poll = pollingOptions(options, 90);
  // Hash-dedupe: reuse an already-cached torrent instead of creating a
  // duplicate on every re-resolve (quota burn).
  let torrentId: string | null = null;
  try {
    const hash = extractMagnetHash(magnet);
    if (hash && typeof (client as { listTorrents?: () => Promise<TorboxTorrentInfo[]> }).listTorrents === 'function') {
      const existing = await (client as TorboxClient).listTorrents(true);
      const match = existing.find((t) => String(t.hash || '').toLowerCase() === hash && t.download_present);
      if (match?.id != null) torrentId = String(match.id);
    }
  } catch { /* dedupe best-effort — fall through to create */ }
  if (!torrentId) torrentId = await client.addMagnet(magnet);
  let info: TorboxTorrentInfo | null = null;

  for (let attempt = 0; attempt < poll.attempts; attempt += 1) {
    // TorBox's normal mylist cache may be ten minutes old. Always bypass it for
    // the just-created item or a cached torrent appears stuck/not found.
    info = await client.getTorrentInfo(torrentId, true);
    const failure = torboxFailure(info);
    if (failure) throw new Error(failure);
    try { options.onProgress?.(String(info?.download_state || 'pending'), info?.progress); } catch { /* progress best-effort */ }
    if (info?.download_present === true && Array.isArray(info.files) && info.files.length > 0) break;
    if (attempt < poll.attempts - 1) await poll.sleep(poll.interval);
  }

  if (!info?.download_present) {
    throw new Error(`TorBox is still preparing this torrent (${info?.download_state || 'pending'})`);
  }

  const files = (info.files || []).map((file: TorboxTorrentFile) => ({
    id: String(file.id),
    name: String(file.short_name || file.name || file.absolute_path || ''),
    size: Number(file.size) || 0,
    mimeType: String(file.mimetype || file.mime_type || ''),
  }));
  const selected = selectBestDebridVideoFile(files, options);
  if (!selected) throw new Error('No playable video file was found in the TorBox torrent');

  const result = await client.unrestrictLink(torrentId, selected.id, selected.name);
  return {
    ...result,
    filename: result.filename || selected.name,
    mimeType: result.mimeType === 'application/octet-stream'
      ? (files.find((file) => file.id === selected.id)?.mimeType || result.mimeType)
      : result.mimeType,
    filesize: result.filesize || selected.size,
  };
}

export class DebridOrchestrator {
  private rdClient: RealDebridClient | null = null;
  private tbClient: TorboxClient | null = null;
  private activeProvider: DebridProvider | null = null;
  private readonly storage: DebridStorage | null;

  constructor(storage?: DebridStorage | null) {
    this.storage = storage === undefined
      ? (typeof localStorage !== 'undefined' ? localStorage : null)
      : storage;
    this.loadAccounts();
  }

  private loadAccounts(): void {
    // Reset first: removing/deactivating an account must not leave its old
    // in-memory client active until the app is restarted.
    this.rdClient = null;
    this.tbClient = null;
    this.activeProvider = null;
    if (!this.storage) return;

    try {
      const accounts = this.getAccounts();
      const preferred = this.storage.getItem(ACTIVE_PROVIDER_KEY) as DebridProvider | null;
      const active = accounts.find((account) => account.isActive && account.provider === preferred)
        || accounts.find((account) => account.isActive);
      if (!active?.apiKey) return;

      this.activeProvider = active.provider;
      if (active.provider === 'realdebrid') this.rdClient = new RealDebridClient(active.apiKey);
      if (active.provider === 'torbox') this.tbClient = new TorboxClient(active.apiKey);
    } catch (error) {
      console.error('[DebridOrchestrator] Failed to load accounts', error);
    }
  }

  saveAccounts(accounts: DebridAccount[], preferredProvider?: DebridProvider): void {
    if (!this.storage) return;
    const cleaned = accounts
      .filter((account) => account?.provider === 'realdebrid' || account?.provider === 'torbox')
      .map((account) => ({
        provider: account.provider,
        apiKey: String(account.apiKey || '').trim(),
        isActive: Boolean(account.isActive),
      }));
    if (preferredProvider) {
      for (const account of cleaned) account.isActive = account.provider === preferredProvider;
      this.storage.setItem(ACTIVE_PROVIDER_KEY, preferredProvider);
    }
    this.storage.setItem(ACCOUNTS_KEY, JSON.stringify(cleaned));
    this.loadAccounts();
  }

  getAccounts(): DebridAccount[] {
    if (!this.storage) return [];
    try {
      const parsed = JSON.parse(this.storage.getItem(ACCOUNTS_KEY) || '[]');
      return Array.isArray(parsed)
        ? parsed.filter((account) => (
          account &&
          (account.provider === 'realdebrid' || account.provider === 'torbox') &&
          typeof account.apiKey === 'string'
        ))
        : [];
    } catch {
      return [];
    }
  }

  hasActiveProvider(): boolean {
    return this.activeProvider !== null;
  }

  getActiveProviderName(): DebridProvider | null {
    return this.activeProvider;
  }

  async resolveMagnetToStream(
    magnet: string,
    options: DebridResolveOptions = {},
  ): Promise<string> {
    if (!/^magnet:\?/i.test(String(magnet || '').trim())) {
      throw new Error('A valid magnet link is required for debrid playback');
    }
    if (!this.activeProvider) throw new Error('No active debrid provider is configured');

    // In-memory dedupe: same magnet+episode within 10min reuses the HTTP URL
    // instead of creating another provider torrent.
    const cached = getCachedResolve(magnet, options);
    if (cached) return cached;

    let url: string;
    if (this.activeProvider === 'realdebrid' && this.rdClient) {
      url = (await resolveRealDebridMagnet(this.rdClient, magnet, options)).url;
    } else if (this.activeProvider === 'torbox' && this.tbClient) {
      url = (await resolveTorboxMagnet(this.tbClient, magnet, options)).url;
    } else {
      throw new Error('The active debrid provider could not be initialized');
    }
    if (/^https?:/i.test(url)) setCachedResolve(magnet, options, url);
    return url;
  }
}

export const debridOrchestrator = new DebridOrchestrator();
