import { describe, test, expect } from 'bun:test';
import { PlaybackCoordinator } from '../src/core/player/PlaybackCoordinator';
import { SourceAdapterRegistry, AbstractSourceAdapter } from '../src/core/player/SourceAdapterRegistry';
import type { AdapterLoadOptions } from '../src/core/player/SourceAdapterRegistry';

describe('playback continuity', () => {
  test('lazy engines load on selection, retry failures and reuse the loaded engine', async () => {
    const registry = SourceAdapterRegistry.getInstance(); await registry.unload();
    let imports = 0;
    class Adapter extends AbstractSourceAdapter {
      readonly mode = 'dash' as const;
      async load() {} async unload() {} async play() {}
      pause() {} seek() {} setVolume() {}
    }
    const adapter = new Adapter();
    registry.registerLazy('dash', async () => {
      if (++imports === 1) throw new Error('chunk unavailable');
      return adapter;
    });
    expect(imports).toBe(0);
    const options = { source: { id: 'lazy', url: 'local', mode: 'dash' as const }, videoElement: {} as HTMLVideoElement };
    await expect(registry.switchTo(options)).rejects.toThrow('chunk unavailable');
    await registry.switchTo(options);
    await registry.switchTo(options);
    expect(imports).toBe(2);
    expect(registry.getCurrentAdapter()).toBe(adapter);
    await registry.unload();
  });
  test('same-episode switches retain position, episode changes reset it', () => {
    const core = new PlaybackCoordinator();
    const source = { id: 'a', url: 'a', mode: 'direct' as const, mediaId: 'series', episodeId: 'ep1' };
    core.begin(source, 17); core.report(42, 120);
    expect(core.begin({ ...source, url: 'b' }, 0).startTime).toBe(42);
    expect(core.begin({ ...source, episodeId: 'ep2' }, 3).startTime).toBe(3);
  });
  test('obsolete resolutions/events are ignored and native units are normalized', () => {
    const core = new PlaybackCoordinator(); const writes: any[] = []; core.sink = (...args) => writes.push(args);
    const source = { id: 'a', url: 'a', mode: 'torrent' as const, episodeId: '1' };
    const first = core.begin(source); const next = core.begin({ ...source, episodeId: '2' });
    expect(first.signal.aborted).toBe(true); expect(core.isCurrent(first)).toBe(false);
    core.reportNative({ positionMs: 50_000, durationMs: 100_000 }, first.generation);
    expect(writes).toHaveLength(0);
    core.reportNative({ positionMs: 23_000, durationMs: 90_000 }, next.generation);
    expect(writes[0].slice(0, 2)).toEqual([23, 90]);
  });
  test('completion is persisted once; external close does not imply completion', () => {
    const core = new PlaybackCoordinator(); const writes: any[] = []; core.sink = (...args) => writes.push(args);
    core.begin({ id: 'a', url: 'a', mode: 'direct' }, 20, 'external'); core.flush();
    expect(writes[0][2]).toBe(false);
    core.report(100, 100, true); core.report(100, 100, true); core.dispose();
    expect(writes.filter(write => write[2])).toHaveLength(1);
  });
  test('adapter switches serialize loads and release obsolete adapters', async () => {
    const registry = SourceAdapterRegistry.getInstance(); await registry.unload();
    let finish!: () => void;
    let entered!: () => void;
    const loading = new Promise<void>(resolve => { entered = resolve; });
    const loaded = new Promise<void>(resolve => { finish = resolve; });
    const events: string[] = [];
    class Adapter extends AbstractSourceAdapter {
      readonly mode = 'direct' as const;
      async load(options: AdapterLoadOptions) { events.push(`load:${options.source.id}`); if (options.source.id === 'a') { entered(); await loaded; } }
      async unload() { events.push('unload'); }
      async play() {} pause() {} seek() {} setVolume() {}
    }
    const adapter = new Adapter(); registry.register('direct', adapter);
    const options = (id: string) => ({ source: { id, url: id, mode: 'direct' as const }, videoElement: {} as HTMLVideoElement });
    const first = registry.switchTo(options('a')); await loading;
    const second = registry.switchTo(options('b')); finish(); await Promise.all([first, second]);
    expect(events).toEqual(['load:a', 'unload', 'load:b']); expect(registry.getCurrentAdapter()).toBe(adapter);
    await registry.unload(); expect(registry.getCurrentAdapter()).toBeNull();
  });
});
