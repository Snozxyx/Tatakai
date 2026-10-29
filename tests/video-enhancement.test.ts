import { describe, expect, test } from 'bun:test';
import { normalizeVideoEnhancement } from '../src/lib/video/enhancement-settings';
import { RtxFrameBudget } from '../src/lib/video/rtx-video';

describe('video enhancement migration and frame budget', () => {
  test('preserves existing opt-in and specialized Anime4K selections', () => {
    for (const preset of ['standard', 'restore', 'upscale']) expect(normalizeVideoEnhancement({ anime4kPreset: preset })).toEqual({ videoEnhancementEngine: 'anime4k', videoEnhancementQuality: 'balanced' });
    expect(normalizeVideoEnhancement({ anime4kPreset: 'high' }).videoEnhancementQuality).toBe('high');
    expect(normalizeVideoEnhancement({ anime4kPreset: 'light' }).videoEnhancementQuality).toBe('light');
    expect(normalizeVideoEnhancement(undefined).videoEnhancementEngine).toBe('off');
    expect(normalizeVideoEnhancement({ anime4kPreset: 'high', videoEnhancementEngine: 'off' }).videoEnhancementEngine).toBe('off');
    expect(normalizeVideoEnhancement({ videoEnhancementEngine: 'rtx', videoEnhancementQuality: 'high' }).videoEnhancementEngine).toBe('rtx');
  });
  test('sustained slow processing lowers quality before restoring original playback', () => {
    const budget = new RtxFrameBudget('high');
    const sample = () => Array.from({ length: 30 }, () => budget.record(60, 1000 / 30)).at(-1);
    expect(sample()).toBe('lower'); expect(budget.quality).toBe('balanced');
    expect(sample()).toBe('lower'); expect(budget.quality).toBe('light');
    expect(sample()).toBe('disable');
  });
  test('an isolated slow frame does not disable enhancement', () => {
    const budget = new RtxFrameBudget('balanced');
    expect(budget.record(100, 1000 / 24)).toBe('keep');
    for (let i = 0; i < 120; i++) expect(budget.record(15, 1000 / 24)).toBe('keep');
    expect(budget.quality).toBe('balanced');
  });
});
