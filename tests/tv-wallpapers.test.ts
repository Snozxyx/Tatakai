import { expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { TV_WALLPAPERS, validTVWallpaper, resolveTVWallpaper, wallpaperTheme } from '../src/core/tv/wallpapers';
import { shouldAnimateWallpaper } from '../src/core/tv/wallpaperPlayback';
test('all TV presets include bundled video and still assets for offline and reduced-motion use', () => {
  expect(TV_WALLPAPERS.length).toBe(6);
  for (const preset of TV_WALLPAPERS) {
    expect(existsSync(`public${preset.src}`)).toBe(true);
    expect(existsSync(`public${preset.poster}`)).toBe(true);
    expect(validTVWallpaper(preset.src)).toBe(true);
  }
});
test('custom wallpapers accept HTTPS without credentials and reject unsafe/local paths', () => {
  expect(validTVWallpaper('https://example.test/background.mp4')).toBe(true);
  for (const value of ['javascript:alert(1)', 'http://example.test/video.mp4', '/assets/../../private', 'https://user:password@example.test/video.mp4']) expect(validTVWallpaper(value)).toBe(false);
});
test('wallpaper colors change glass tokens while keeping surfaces dark and text accents light', () => {
  const blue = wallpaperTheme([30, 150, 240]), red = wallpaperTheme([240, 50, 50]);
  expect(blue).not.toEqual(red);
  expect(blue['--tv-glass'].split(',').every(value => Number(value) < 55)).toBe(true);
});

test('existing wallpaper selections migrate to their lighter TV copies', () => {
  for (const preset of TV_WALLPAPERS) expect(resolveTVWallpaper(preset.legacySrc)).toBe(preset.src);
  expect(resolveTVWallpaper('/unsafe')).toBe(TV_WALLPAPERS[0].src);
});

test('decorative decoding stops for background, playback, previews and reduced motion', () => {
  const state = { enabled: true, reduced: false, visible: true, foreground: true, paused: false, previewing: false };
  expect(shouldAnimateWallpaper(state)).toBe(true);
  for (const change of [{ enabled: false }, { reduced: true }, { visible: false }, { foreground: false }, { paused: true }, { previewing: true }]) expect(shouldAnimateWallpaper({ ...state, ...change })).toBe(false);
});
