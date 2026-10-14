import { describe, test, expect } from 'bun:test';
import { evaluateCandidates } from '../src/core/download/candidate-evaluator.cjs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const preferences = { preferredQuality: '1080p', audioLanguage: 'ja', fallbackLanguage: '', providerPriority: ['first', 'second'], scoringProfile: 'balanced' as const };
const candidate = (id: string, episode = 2, quality = '1080p', providerId = 'first') => ({ id, candidate: { title: 'Fixture', episodeNumber: episode, quality, language: 'ja', providerId }, payload: { url: id } });

describe('candidate evaluation and simulation', () => {
  test('episode, season, exclusion and minimum scores prevent selection', () => {
    expect(evaluateCandidates(preferences, [candidate('wrong', 3)], 2, ['Fixture']).selected).toBeNull();
    expect(evaluateCandidates({ ...preferences, seasonNumber: 2 }, [candidate('unknown-season')], 2, ['Fixture']).selected).toBeNull();
    expect(evaluateCandidates({ ...preferences, excludeTerms: ['Fixture'] }, [candidate('excluded')], 2, ['Fixture']).selected).toBeNull();
    expect(evaluateCandidates({ ...preferences, minimumScore: 999 }, [candidate('low')], 2, ['Fixture']).selected).toBeNull();
  });
  test('profiles use the same scorer and have stable tie breaking', () => {
    const input = [candidate('b', 2, '720p'), candidate('a'), candidate('z', 2, '2160p')];
    expect(evaluateCandidates(preferences, input, 2, ['Fixture']).selected?.id).toBe('a');
    expect(evaluateCandidates({ ...preferences, scoringProfile: 'data-saver' }, input, 2, ['Fixture']).selected?.id).toBe('b');
    expect(evaluateCandidates({ ...preferences, scoringProfile: 'best-quality' }, input, 2, ['Fixture']).selected?.id).toBe('z');
    expect(evaluateCandidates(preferences, [candidate('z'), candidate('a')], 2, ['Fixture']).selected?.id).toBe('a');
  });
  test('invalid episode and season candidates are rejected before scoring', () => {
    const result = evaluateCandidates({ ...preferences, seasonNumber: 2 }, [{ ...candidate('wrong', 3), candidate: { ...candidate('wrong', 3).candidate, seasonNumber: 1 } }], 2, ['Fixture']);
    expect(result.ranked[0].score).toBe(0);
    expect(result.ranked[0].reasons).not.toContain('episode-match');
    expect(result.ranked[0].rejected).toEqual(['episode-mismatch', 'season-mismatch']);
  });
  test('desktop simulation and execution select the same release without simulation writes', async () => {
    const module = { exports: {} as any }; let writes = 0; const queue: any[] = [];
    runInNewContext(readFileSync('desktop/services/auto-downloader.cjs', 'utf8'), { module, exports: module.exports, Date, Map, AbortSignal,
      require: (name: string) => name === 'electron' ? { app: { getPath: () => '.' }, ipcMain: {} } : name === 'fs' ? { existsSync: () => false, writeFileSync() { writes++; } } : name === 'path' ? path : require(path.resolve('desktop/services', name)) });
    const auto = new module.exports.AutoDownloader({ info() {}, warn() {}, error() {} });
    auto.subscribe('1', 'Fixture', 2, 1);
    auto.candidateResolver = async () => [{ title: 'Fixture - 02 [720p]', episodeNumber: 2, quality: '720p', url: 'low', sourceType: 'hls' }, { title: 'Fixture - 02 [1080p]', episodeNumber: 2, quality: '1080p', url: 'high', sourceType: 'hls' }];
    auto._isEpisodeAvailable = async () => true;
    auto._enqueueFn = async (input: any) => { queue.push(input); return { success: true }; };
    const before = JSON.stringify(auto.getSubscriptions()); const writeCount = writes;
    const simulation = await auto.simulate('1', 2);
    expect(writes).toBe(writeCount); expect(JSON.stringify(auto.getSubscriptions())).toBe(before); expect(queue).toHaveLength(0);
    await auto._checkSubscription('1', auto.subscriptions.get('1'));
    expect(queue[0].url).toBe(simulation.selected.payload.url);
  });
});
