import { expect, test } from 'bun:test';
import { getMobileOfflineEpisodeId } from '../src/core/download/mobile/offlineEpisodeId';

test('completed native downloads retain provider episode IDs instead of synthetic watch IDs', () => {
  const episodeId = 'provider/series?ep=12&lang=dub%20en';
  expect(getMobileOfflineEpisodeId(`native-offline://${encodeURIComponent(episodeId)}`, 'mobile-123?ep=12'))
    .toBe(episodeId);
});

test('legacy files and torrent sessions keep their fallback watch IDs', () => {
  for (const path of ['file:///downloads/video.mp4', 'torrent-session://abc', 'native-offline://', 'native-offline://%invalid']) {
    expect(getMobileOfflineEpisodeId(path, 'legacy-episode')).toBe('legacy-episode');
  }
});
