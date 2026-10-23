import { describe, expect, it } from 'bun:test';
import { installCompatibilityBatch } from '../src/core/extensions/compatibility/bulk-install';
import type { CompatibilityPackage } from '../src/core/extensions/compatibility/client';
const pkg = (id: string, installed = false): CompatibilityPackage => ({ id, name: id, version: '1', repository: 'https://repo.test/index.pb', ecosystem: 'aniyomi', installed, hasUpdate: false });
describe('bulk compatibility installation', () => {
  it('installs every matching package beyond the display limit, once and sequentially', async () => {
    const calls: string[] = []; let active = 0, peak = 0;
    const list = Array.from({ length: 125 }, (_, i) => pkg(String(i)));
    const result = await installCompatibilityBatch([...list, list[0], pkg('already-installed', true)], async row => { active++; peak = Math.max(peak, active); await Promise.resolve(); calls.push(row.id); active--; });
    expect(calls).toHaveLength(125); expect(peak).toBe(1); expect(result).toMatchObject({ total: 125, completed: 125, installed: 125, failed: 0, cancelled: false });
  });
  it('continues after a failed package and reports the actual outcome', async () => {
    const result = await installCompatibilityBatch([pkg('one'), pkg('broken'), pkg('three')], async row => { if (row.id === 'broken') throw Error('Original package cannot load'); });
    expect(result).toMatchObject({ total: 3, completed: 3, installed: 2, failed: 1, failures: [{ name: 'broken', error: 'Original package cannot load' }] });
  });
  it('cancels the active operation without starting the next extension', async () => {
    const controller = new AbortController(), calls: string[] = [];
    const result = await installCompatibilityBatch([pkg('one'), pkg('two'), pkg('three')], async row => { calls.push(row.id); if (row.id === 'two') { controller.abort(); throw Error('cancelled'); } }, controller.signal);
    expect(calls).toEqual(['one', 'two']); expect(result).toMatchObject({ completed: 1, installed: 1, failed: 0, cancelled: true }); expect(result.current).toBeUndefined();
  });
});
