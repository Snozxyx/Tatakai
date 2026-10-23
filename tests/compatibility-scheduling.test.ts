import { describe, expect, it } from 'bun:test';
import { runCompatibilitySources, mapProviderTasks } from '../src/core/extensions/compatibility/scheduling';
import { compatibilityProviders } from '../src/core/extensions/compatibility/providers';
import { enableCompatibilityBatch } from '../src/core/extensions/compatibility/bulk-install';

describe('source execution and provider language groups', () => {
  it('limits addon network jobs while preserving input results and order', async () => {
    let active = 0, peak = 0;
    const result = await mapProviderTasks(Array.from({ length: 20 }, (_, index) => index), async number => {
      active++; peak = Math.max(peak, active); await new Promise(resolve => setTimeout(resolve, number % 3)); active--; return number;
    });
    expect(peak).toBe(4); expect(result).toEqual(Array.from({ length: 20 }, (_, index) => index));
  });
  it('bounds simultaneous heavy work across all ecosystems while retaining every result', async () => {
    const kinds = ['aniyomi', 'cloudstream', 'sora', 'mangayomi', 'mihon'];
    const sources = Array.from({ length: 30 }, (_, id) => ({ id, ecosystem: kinds[id % kinds.length] }));
    let active = 0, peak = 0; const results: number[] = [];
    const skipped = await runCompatibilitySources(sources, async source => {
      active++; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 2));
      results.push(source.id); active--;
    }, { totalMs: 2000 });
    expect(peak).toBe(2); expect(skipped).toEqual([]);
    expect(results.sort((a, b) => a - b)).toEqual(sources.map(row => row.id));
  });
  it('starts queued sources with fresh budgets and gives native hosts independent lanes', async () => {
    const calls: string[] = [], signals: AbortSignal[] = []; let animeActive = 0, peak = 0;
    const sources = Array.from({ length: 6 }, (_, i) => ({ id: String(i), ecosystem: 'aniyomi' })).concat([{ id: 'cloud', ecosystem: 'cloudstream' }]);
    const skipped = await runCompatibilitySources(sources, async (source, signal) => {
      expect(signal.aborted).toBe(false); signals.push(signal); calls.push(source.id);
      if (source.ecosystem === 'aniyomi') { animeActive++; peak = Math.max(peak, animeActive); await new Promise(resolve => setTimeout(resolve, 15)); animeActive--; }
    }, { sourceMs: 50, totalMs: 500 });
    expect(peak).toBe(1); expect(new Set(signals).size).toBe(7); expect(calls.indexOf('cloud')).toBeLessThan(calls.indexOf('1')); expect(skipped).toEqual([]);
  });
  it('reports unstarted providers separately when the overall lookup budget expires', async () => {
    const calls: number[] = [];
    const skipped = await runCompatibilitySources([0, 1, 2].map(id => ({ id, ecosystem: 'aniyomi' })), async (source, signal) => { calls.push(source.id); await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true })); }, { totalMs: 20, sourceMs: 100 });
    expect(calls).toEqual([0]); expect(skipped.map(row => row.id)).toEqual([1, 2]);
  });
  it('groups provider languages without merging separate packages or content kinds', async () => {
    const source = (id: string, lang: string) => ({ id, name: `MangaDex (${lang})`, packageId: 'original', ecosystem: 'mihon', kind: 'read', enabled: false, lang } as any);
    const sources = [source('en', 'en'), source('fr', 'fr'), { ...source('other', 'en'), packageId: 'other' }];
    const groups = compatibilityProviders(sources); expect(groups).toHaveLength(2); expect(groups[0].name).toBe('MangaDex'); expect(groups[0].sources).toHaveLength(2);
    const changed: string[] = [];
    const result = await enableCompatibilityBatch([...sources, sources[0]], true, async row => { changed.push(row.id); });
    expect(changed).toEqual(['en', 'fr', 'other']); expect(result.succeeded).toBe(3);
  });
});
