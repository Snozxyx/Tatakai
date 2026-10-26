import { expect, test } from 'bun:test';
import { parseP2PRoomState } from '../src/core/watch-party/room-state';

const state = () => ({ room_id: 'room', host_id: 'host', host_epoch: 1, p2p_enabled: true,
  source_revision: 'revision', media: { url: 'https://cdn.example/movie.mp4', format: 'mp4', timelineId: 'episode',
    subtitles: [{ url: 'https://cdn.example/captions.vtt', lang: 'en' }] },
  current_time_seconds: 42, is_playing: false, host_seen_at: null, turn_servers: [], buffering_policy: 'pause-together' });

test('room boundary accepts private RPC metadata and a paused restart position', () => {
  expect(parseP2PRoomState(state()).current_time_seconds).toBe(42);
  expect(parseP2PRoomState({ ...state(), source_revision: null, media: null }).media).toBeNull();
});
test('room boundary rejects malformed tracks, unsafe URLs, epochs and relay entries', () => {
  const input = state();
  for (const patch of [
    { host_epoch: NaN }, { current_time_seconds: -1 },
    { media: { ...input.media, url: 'javascript:alert(1)' } },
    { media: { ...input.media, url: 'https://user:password@cdn.example/movie.mp4' } },
    { media: { ...input.media, subtitles: { malicious: true } } },
    { media: { ...input.media, subtitles: [{ url: 'https://cdn.example/s.vtt', lang: {} }] } },
    { turn_servers: [{ urls: 'https://not-a-relay.example' }] },
  ]) expect(() => parseP2PRoomState({ ...input, ...patch })).toThrow();
});
