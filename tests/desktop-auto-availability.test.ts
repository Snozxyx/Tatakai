import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import path from 'node:path';

function fixture(media: unknown, fails = false) {
  const exports = {};
  const module = { exports };
  const ipcMain = { removeListener() {} };
  runInNewContext(readFileSync('desktop/services/auto-downloader.cjs', 'utf8'), {
    module, exports, Date, Map, AbortSignal,
    require: (name: string) => name === 'electron' ? { app: { getPath: () => '.' }, ipcMain }
      : name === 'fs' ? { existsSync: () => false, writeFileSync() {} } : path,
    fetch: async () => {
      if (fails) throw new Error('offline');
      return { ok: true, json: async () => ({ data: { Media: media } }) };
    },
  });
  const { AutoDownloader } = module.exports as any;
  return new AutoDownloader({ info() {}, warn() {}, error() {} });
}

describe('desktop auto-download release gating', () => {
  test('completion during enqueue still advances the cursor', async () => {
    const auto = fixture({ status: 'FINISHED', episodes: 12 });
    auto.subscribe('123', 'Fixture', 2, 123);
    auto._resolveSource = async () => ({ sourceType: 'hls', url: 'fixture' });
    auto._enqueueFn = async (payload: any) => { auto.notifyDownloadCompleted(payload.episodeId); return { success: true }; };
    await auto._checkSubscription('123', auto.subscriptions.get('123'));
    expect(auto.subscriptions.get('123').nextEpisode).toBe(3);
  });
  test('enqueue rejection remains retryable at the same episode', async () => {
    const auto = fixture({ status: 'FINISHED', episodes: 12 });
    auto.subscribe('123', 'Fixture', 2, 123);
    auto._resolveSource = async () => ({ sourceType: 'hls', url: 'fixture' });
    let calls = 0;
    auto._enqueueFn = async () => { calls++; throw new Error('offline'); };
    await auto._checkSubscription('123', auto.subscriptions.get('123'));
    await auto._checkSubscription('123', auto.subscriptions.get('123'));
    expect(calls).toBe(2);
    expect(auto.subscriptions.get('123').nextEpisode).toBe(2);
    expect(auto.subscriptions.get('123').enqueuedEpisodes).toEqual([]);
  });
  test('future episodes never reach source lookup or advance the subscription', async () => {
    const auto = fixture({ status: 'RELEASING', nextAiringEpisode: { episode: 3, airingAt: Date.now() / 1000 + 86400 } });
    auto.subscribe('internal-id', 'Fixture', 4, 123);
    let lookedUp = false;
    auto._resolveSource = async () => { lookedUp = true; return { sourceType: 'hls', url: 'fixture' }; };
    await auto._checkSubscription('internal-id', auto.subscriptions.get('internal-id'));
    expect(lookedUp).toBe(false);
    expect(auto.subscriptions.get('internal-id').nextEpisode).toBe(4);
  });
  test('confirmed release enqueues once and advances only on completion', async () => {
    const auto = fixture({ status: 'RELEASING', airingSchedule: { nodes: [{ episode: 2, airingAt: Date.now() / 1000 - 60 }] } });
    auto.subscribe('internal-id', 'Fixture', 2, 123);
    auto._resolveSource = async () => ({ sourceType: 'hls', url: 'fixture' });
    const calls: any[] = [];
    auto._enqueueFn = async (payload: any) => { calls.push(payload); return { success: true }; };
    const subscription = auto.subscriptions.get('internal-id');
    await auto._checkSubscription('internal-id', subscription);
    await auto._checkSubscription('internal-id', subscription);
    expect(calls.length).toBe(1);
    expect(subscription.nextEpisode).toBe(2);
    auto.notifyDownloadCompleted(calls[0].episodeId);
    expect(subscription.nextEpisode).toBe(3);
  });
  test('missing schedule, network failure, and unknown identity wait for the next poll', async () => {
    expect(await fixture({ status: 'RELEASING' })._isEpisodeAvailable(123, 4)).toBe(false);
    expect(await fixture(null, true)._isEpisodeAvailable(123, 4)).toBe(false);
    expect(await fixture({ status: 'FINISHED', episodes: 12 })._isEpisodeAvailable(null, 4)).toBe(false);
    expect(await fixture({ status: 'FINISHED', episodes: 12 })._isEpisodeAvailable(123, 4)).toBe(true);
    expect(await fixture({ status: 'FINISHED', episodes: 12 })._isEpisodeAvailable(123, 13)).toBe(false);
  });
});
