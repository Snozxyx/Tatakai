import { test, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { packagedAssetsPlugin } from '../scripts/packaged-assets.mjs';
import { assertNoPackagedProfileThemeAssets } from '../scripts/profile-theme-asset-check.mjs';

test('packaged builds retain offline media and exclude website-only assets', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'tatakai-assets-'));
  try {
    for (const file of ['assets/brand/demo.mp4', 'assets/video/6.mp4', 'altstore/apps.json',
      'sw.js', 'assets/tv/wallpapers/ember.mp4', 'assets/logo/logo.png', 'manifest.json',
      'assets/profile-themes/uchiha/itachi-rain.mp4', 'assets/mascots/theme-mascot.png',
      'assets/fonts/google-sans-flex-latin.woff2', 'assets/fonts/google-sans-flex-OFL.txt']) {
      const target = path.join(root, 'public', file);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, 'fixture:' + file);
    }
    const plugin = packagedAssetsPlugin();
    plugin.configResolved({ root, build: { outDir: 'dist' } });
    plugin.closeBundle();
    for (const file of ['assets/tv/wallpapers/ember.mp4', 'assets/logo/logo.png', 'manifest.json'])
      expect(existsSync(path.join(root, 'dist', file))).toBe(true);
    for (const file of ['assets/brand', 'assets/video', 'altstore', 'sw.js',
      'assets/profile-themes', 'assets/mascots', 'assets/fonts/google-sans-flex-latin.woff2', 'assets/fonts/google-sans-flex-OFL.txt'])
      expect(existsSync(path.join(root, 'dist', file))).toBe(false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('website assets remain available while server-managed profile media is excluded', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'tatakai-web-assets-'));
  try {
    for (const file of ['assets/brand/demo.mp4', 'sw.js', 'assets/logo/logo.png', 'assets/profile-themes/theme/poster.jpg']) {
      const target = path.join(root, 'public', file); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, 'fixture:' + file);
    }
    const plugin = packagedAssetsPlugin({ packaged: false });
    plugin.configResolved({ root, build: { outDir: 'dist' } }); plugin.closeBundle();
    expect(existsSync(path.join(root, 'dist/assets/brand/demo.mp4'))).toBe(true);
    expect(existsSync(path.join(root, 'dist/sw.js'))).toBe(true);
    expect(existsSync(path.join(root, 'dist/assets/profile-themes'))).toBe(false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('renaming or inlining a profile asset cannot bypass the package guard', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'tatakai-profile-leak-'));
  try {
    const source = path.join(root, 'public/assets/profile-themes/theme/texture.svg');
    const output = path.join(root, 'dist/assets'); mkdirSync(path.dirname(source), { recursive: true }); mkdirSync(output, { recursive: true });
    const art = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M1 2L3 4"/></svg>';
    writeFileSync(source, art); copyFileSync(source, path.join(output, 'texture-HASH.svg'));
    expect(() => assertNoPackagedProfileThemeAssets(path.join(root, 'dist'), path.join(root, 'public'))).toThrow('emitted or inlined');
    rmSync(path.join(output, 'texture-HASH.svg'));
    writeFileSync(path.join(output, 'main.js'), 'export const art="data:image/svg+xml;base64,' + Buffer.from(art).toString('base64') + '";');
    expect(() => assertNoPackagedProfileThemeAssets(path.join(root, 'dist'), path.join(root, 'public'))).toThrow('emitted or inlined');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('CSS references are made remote before asset emission', () => {
  const plugin = packagedAssetsPlugin();
  const css = '.theme{background:url("/assets/profile-themes/theme/bg.webp")}@font-face{src:url(/assets/fonts/google-sans-flex-latin.woff2)}.logo{background:url(/assets/logo/logo.png)}';
  const result = plugin.transform(css, 'theme.css');
  expect(result.code).toContain('https://tatakai.me/assets/profile-themes/theme/bg.webp');
  expect(result.code).toContain('https://tatakai.me/assets/fonts/google-sans-flex-latin.woff2');
  expect(result.code).toContain('url(/assets/logo/logo.png)');
});
