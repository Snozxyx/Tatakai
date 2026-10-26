export interface LyricLine { time: number; text: string }
/** LRC timestamps, including repeated timestamps on one line and millisecond offsets. */
export function parseProfileLyrics(source: string): LyricLine[] {
  const offset = Number(source.match(/\[offset:([+-]?\d+)\]/i)?.[1] ?? 0) / 1000;
  return source.split(/\r?\n/).flatMap(line => {
    const text = line.replace(/\[[^\]]*\]/g, '').trim();
    if (!text) return [];
    return [...line.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)].map(match => ({
      time: Math.max(0, Number(match[1]) * 60 + Number(match[2]) + Number(`0.${match[3] ?? '0'}`) + offset), text,
    }));
  }).sort((a, b) => a.time - b.time).slice(0, 500);
}
export function safeProfileAudio(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048) return '';
  try { const url = new URL(value.trim()); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}

export function profileYouTubeId(value: string): string | null {
  try {
    const url = new URL(value); if (url.protocol !== 'https:' || url.username || url.password) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (!['youtube.com', 'music.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'youtu.be'].includes(host)) return null;
    const id = host === 'youtu.be' ? url.pathname.split('/')[1] : url.searchParams.get('v') || url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1];
    return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}

interface LyricsMatch { trackName?: string; artistName?: string; syncedLyrics?: string | null; plainLyrics?: string | null; instrumental?: boolean }
export interface DetectedProfileMusic { title: string; artist: string; lyrics: string; status: 'synced' | 'plain' | 'instrumental' | 'missing' | 'unavailable' }
const cleanTitle = (value: string) => value.replace(/\s*[[(](?:official|music video|lyrics?|audio|visuali[sz]er|hd|4k)[^\])]*[\])]/gi, '').replace(/\s*\|\s*official.*$/i, '').trim().slice(0, 100);
async function musicJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 12000);
  try { if (signal?.aborted) throw new Error('Cancelled'); const response = await fetch(url, { signal: controller.signal, credentials: 'omit' }); if (!response.ok) throw new Error('Music lookup is temporarily unavailable.'); return await response.json(); }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
export async function findProfileLyrics(title: string, artist: string, signal?: AbortSignal): Promise<DetectedProfileMusic> {
  if (!title.trim()) throw new Error('Enter a song title to find lyrics.');
  const query = new URLSearchParams({ track_name: title.slice(0, 100), ...(artist ? { artist_name: artist.slice(0, 100) } : {}) });
  let raw = await musicJson(`https://lrclib.net/api/search?${query}`, signal);
  if (Array.isArray(raw) && !raw.length) raw = await musicJson(`https://lrclib.net/api/search?${new URLSearchParams({ q: `${artist} ${title}`.trim().slice(0, 200) })}`, signal);
  const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const target = normalize(title); const performer = normalize(artist);
  const matches = (Array.isArray(raw) ? raw : []).filter((item): item is LyricsMatch => Boolean(item && typeof item === 'object' && typeof item.trackName === 'string' && typeof item.artistName === 'string'));
  const similarity = (left: string, right: string) => { const words = new Set(left.split(' ').filter(Boolean)); const other = new Set(right.split(' ').filter(Boolean)); return [...words].filter(word => other.has(word)).length / Math.max(1, words.size, other.size); };
  const score = (match: LyricsMatch) => similarity(target, normalize(match.trackName!)) * 3 + (performer ? similarity(performer, normalize(match.artistName!)) : 0);
  const match = matches.sort((a, b) => score(b) - score(a))[0];
  if (!match || similarity(target, normalize(match.trackName!)) < 0.75 || (performer && similarity(performer, normalize(match.artistName!)) < 0.35)) return { title, artist, lyrics: '', status: 'missing' };
  const synced = typeof match.syncedLyrics === 'string' ? match.syncedLyrics : '';
  const plain = typeof match.plainLyrics === 'string' ? match.plainLyrics : '';
  return { title, artist, lyrics: (synced || plain).slice(0, 20000), status: synced ? 'synced' : plain ? 'plain' : match.instrumental ? 'instrumental' : 'missing' };
}
export async function detectProfileMusic(url: string, signal?: AbortSignal): Promise<DetectedProfileMusic> {
  const id = profileYouTubeId(url); if (!id) throw new Error('Paste a valid YouTube video or YouTube Music link.');
  const raw = await musicJson(`https://noembed.com/embed?${new URLSearchParams({ url: `https://www.youtube.com/watch?v=${id}` })}`, signal) as Record<string, unknown>;
  if (typeof raw.title !== 'string' || raw.error) throw new Error('This video could not be identified. You can still enter the title and artist manually.');
  const cleaned = cleanTitle(raw.title);
  const split = cleaned.split(/\s+[-–—]\s+/);
  const artist = split.length > 1 ? split.shift()! : typeof raw.author_name === 'string' ? raw.author_name.replace(/\s*-\s*Topic$|VEVO$/i, '').trim().slice(0, 100) : '';
  const title = cleanTitle(split.length ? split.join(' - ') : cleaned);
  try { return await findProfileLyrics(title, artist, signal); }
  catch (error) { if (signal?.aborted) throw error; return { title, artist, lyrics: '', status: 'unavailable' }; }
}
