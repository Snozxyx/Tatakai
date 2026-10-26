import type { P2PRoomState, RoomMedia } from './session';

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function httpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 8192) return false;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}

/** Treat even authenticated room metadata as untrusted input at the player boundary. */
export function parseP2PRoomState(value: unknown): P2PRoomState {
  if (!object(value) || typeof value.room_id !== 'string' || typeof value.host_id !== 'string'
    || !Number.isSafeInteger(value.host_epoch) || Number(value.host_epoch) < 1
    || typeof value.p2p_enabled !== 'boolean'
    || (value.current_time_seconds !== undefined && (typeof value.current_time_seconds !== 'number' || !Number.isFinite(value.current_time_seconds) || value.current_time_seconds < 0))
    || (value.is_playing !== undefined && typeof value.is_playing !== 'boolean')
    || (value.source_revision !== null && typeof value.source_revision !== 'string')
    || !['pause-together', 'keep-playing'].includes(String(value.buffering_policy))
    || !Array.isArray(value.turn_servers) || value.turn_servers.length > 8
    || (value.host_seen_at !== null && typeof value.host_seen_at !== 'string')) throw new Error('Invalid peer room state');
  let media: RoomMedia | null = null;
  if (value.media !== null) {
    const source = value.media;
    if (!object(source) || !httpUrl(source.url) || !['hls', 'mp4'].includes(String(source.format))
      || typeof source.timelineId !== 'string' || !source.timelineId || source.timelineId.length > 2048
      || (source.bitrateBps !== undefined && (typeof source.bitrateBps !== 'number' || !Number.isFinite(source.bitrateBps) || source.bitrateBps <= 0))) {
      throw new Error('Invalid room media descriptor');
    }
    for (const name of ['subtitles', 'audioTracks']) {
      const tracks = source[name];
      if (tracks !== undefined && (!Array.isArray(tracks) || tracks.length > 64)) throw new Error('Invalid room tracks');
      for (const track of (tracks || []) as unknown[]) {
        if (!object(track) || (track.lang !== undefined && (typeof track.lang !== 'string' || track.lang.length > 128))
          || (track.label !== undefined && (typeof track.label !== 'string' || track.label.length > 256))
          || (name === 'subtitles' && (!httpUrl(track.url) || typeof track.lang !== 'string'))
          || (name === 'audioTracks' && typeof track.id !== 'string')) throw new Error('Invalid room track');
      }
    }
    media = source as unknown as RoomMedia;
  }
  for (const server of value.turn_servers) {
    if (!object(server) || (server.username !== undefined && typeof server.username !== 'string')
      || (server.credential !== undefined && typeof server.credential !== 'string')) throw new Error('Invalid relay settings');
    const urls = typeof server.urls === 'string' ? [server.urls] : server.urls;
    if (!Array.isArray(urls) || !urls.length || urls.length > 8
      || urls.some(url => typeof url !== 'string' || url.length > 2048 || !/^(stun|stuns|turn|turns):[^\s]+$/.test(url))) {
      throw new Error('Invalid relay URL');
    }
  }
  return { ...value, media, host_seen_at: value.host_seen_at || '' } as unknown as P2PRoomState;
}
