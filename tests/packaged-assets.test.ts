import { test, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { packagedAssetsPlugin } from '../scripts/packaged-assets.mjs';

test('packaged builds retain offline media and exclude website-only assets', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'tatakai-assets-'));
  try {
    for (const file of ['assets/brand/demo.mp4', 'assets/video/6.mp4', 'altstore/apps.json',
      'sw.js', 'assets/profile-themes/uchiha/itachi-rain-4k.mp4', 'assets/tv/wallpapers/ember.mp4', 'assets/logo/logo.png', 'manifest.json']) {
      const target = path.join(root, 'public', file);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, 'fixture');
    }
    const plugin = packagedAssetsPlugin();
    plugin.configResolved({ root, build: { outDir: 'dist' } });
    plugin.closeBundle();
    for (const file of ['assets/tv/wallpapers/ember.mp4', 'assets/logo/logo.png', 'manifest.json'])
      expect(existsSync(path.join(root, 'dist', file))).toBe(true);
    for (const file of ['assets/brand', 'assets/video', 'altstore', 'sw.js', 'assets/profile-themes/uchiha/itachi-rain-4k.mp4'])
      expect(existsSync(path.join(root, 'dist', file))).toBe(false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
