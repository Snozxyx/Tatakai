import { expect, it } from 'bun:test';
import { mergeWatchBatches, remainingWatchSources } from '../src/core/extensions/compatibility/watch-batches';

const report = (provider: string, skippedSourceIds: string[] = []) => ({ provider, name: provider, kind: 'anime' as const, ecosystem: 'aniyomi', status: 'skipped', count: 0, durationMs: 0, skippedSourceIds, error: 'Not searched in this batch' });

it('resumes only pending source identities and keeps earlier streams and subtitles', () => {
  const previous = { sources: [{ providerKey: 'other', url: 'https://media.test/old' }, { providerKey: 'group', compatibilitySourceId: 'en', url: 'https://media.test/en', subtitles: [{ url: 'en.vtt' }] }], subtitles: [{ url: 'standalone.vtt' }], statuses: [report('group', ['fr', 'ja']), report('other')] };
  expect(remainingWatchSources(previous)).toEqual(['fr', 'ja']);
  const next = mergeWatchBatches(previous, { sources: [{ providerKey: 'group', compatibilitySourceId: 'fr', url: 'https://media.test/fr', subtitles: [{ url: 'fr.vtt' }] }], subtitles: [], statuses: [{ ...report('group', ['ja']), status: 'ok', count: 1, error: undefined }] });
  expect(next.sources).toHaveLength(3);
  expect(next.subtitles).toEqual(previous.subtitles);
  expect(next.statuses.find(row => row.provider === 'group')).toMatchObject({ status: 'ok', count: 2, subtitleCount: 2, skippedSourceIds: ['ja'], error: undefined });
  expect(remainingWatchSources(next)).toEqual(['ja']);
  expect(mergeWatchBatches(next, { sources: next.sources, subtitles: next.subtitles, statuses: [] }).sources).toHaveLength(3);
});
