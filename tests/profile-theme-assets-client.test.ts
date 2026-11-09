import { afterEach, expect, test } from 'bun:test';
import { profileThemeAssetUrl } from '../src/lib/profileThemeAssets';
import { publicImageUrl, optimizedImageUrl } from '../src/lib/media/imageUrl';
import { defaultSekaiConfig, SEKAI_DEFAULT_WALLPAPER, SEKAI_MASCOTS, sekaiMascotUrl, safeThemeImage, readSekaiConfig } from '../src/lib/profileThemes';
import { safeProfileAudio } from '../src/lib/profileThemeMusic';
import { profileThemeConversation } from '../src/lib/profileThemeConversation';
import { safeTemplateImage, compileCustomThemeCss } from '../src/lib/profileTemplate';
import { readFrostedConfig } from '../src/components/profile/themes/frosted-blast/config';
import { EMPRESS_POSTER } from '../src/components/profile/themes/gothic-empress/config';
import { MIDNIGHT_LOFI_ROOM } from '../src/components/profile/themes/midnight-lofi/config';
import { HEAVEN_POSTER, HEAVEN_VIDEO } from '../src/components/profile/themes/eyes-toward-heaven/config';
import { CUSTOM_EMOJI } from '../src/lib/customEmoji';
import { mediaProps } from '../src/lib/media-jsx/props';

const base = 'https://tatakai.me/assets';
const originalWindow = globalThis.window;
const originalAssetBase = process.env.VITE_PROFILE_THEME_ASSET_BASE;
const originalPackaged = process.env.VITE_PACKAGED_BUILD;
afterEach(() => {
  globalThis.window = originalWindow;
  if (originalAssetBase === undefined) delete process.env.VITE_PROFILE_THEME_ASSET_BASE;
  else process.env.VITE_PROFILE_THEME_ASSET_BASE = originalAssetBase;
  if (originalPackaged === undefined) delete process.env.VITE_PACKAGED_BUILD;
  else process.env.VITE_PACKAGED_BUILD = originalPackaged;
});

test('theme defaults, mascots and built-in emoji always point to the VPS', () => {
  for (const url of [SEKAI_DEFAULT_WALLPAPER, EMPRESS_POSTER, MIDNIGHT_LOFI_ROOM, HEAVEN_POSTER, HEAVEN_VIDEO]) {
    expect(url.startsWith(base + '/profile-themes/')).toBe(true);
  }
  for (const mascot of SEKAI_MASCOTS) {
    const url = new URL(sekaiMascotUrl(mascot.key));
    expect(url.origin).toBe('https://tatakai.me');
    expect(decodeURIComponent(url.pathname)).toBe('/assets/mascots/' + mascot.file);
  }
  expect(CUSTOM_EMOJI.filter(item => item.group === 'mascots').every(item => item.src.startsWith(base + '/mascots/'))).toBe(true);
  expect(CUSTOM_EMOJI.find(item => item.key === 'custom-1019ccry')?.src).toBe('/assets/emoji/1019ccry.gif');
});

test('saved relative profile images and soundtrack URLs migrate without changing custom HTTPS media', () => {
  const wallpaper = '/assets/profile-themes/sekaipop/default-wallpaper.png';
  const track = '/assets/profile-themes/midnight-lofi/after-the-last-train.mp3';
  const parsed = readSekaiConfig({ ...defaultSekaiConfig(), wallpaper: { url: wallpaper }, music: { url: track } })!;
  expect(parsed.wallpaper.url).toBe(base + '/profile-themes/sekaipop/default-wallpaper.png');
  expect(parsed.music.url).toBe(base + '/profile-themes/midnight-lofi/after-the-last-train.mp3');
  expect(readFrostedConfig({ version: 1, backgroundUrl: wallpaper })?.backgroundUrl).toBe(parsed.wallpaper.url);
  const uploaded = 'https://uploads.example.com/image.png?token=private';
  expect(safeThemeImage(uploaded)).toBe(uploaded);
  expect(safeProfileAudio('https://uploads.example.com/audio.mp3?signature=private')).toBe('https://uploads.example.com/audio.mp3?signature=private');
  expect(profileThemeAssetUrl('blob:https://tatakai.me/upload-preview')).toBe('blob:https://tatakai.me/upload-preview');
});

test('remote assets remain absolute in desktop/file, mobile/custom-scheme and TV renderers', () => {
  process.env.VITE_PACKAGED_BUILD = 'true';
  for (const href of ['file:///app/index.html', 'app://tatakai.me/', 'capacitor://tatakai.me/', 'https://localhost/']) {
    globalThis.window = { location: { href } } as Window;
    expect(optimizedImageUrl('/assets/profile-themes/komorebi/garden.webp')).toBe(base + '/profile-themes/komorebi/garden.webp');
    expect(optimizedImageUrl(HEAVEN_POSTER)).toBe(HEAVEN_POSTER);
  }
});

test('managed profile artwork never goes through wsrv while normal public images keep optimization', () => {
  const image = base + '/profile-themes/uchiha/itachi-rain-poster.webp';
  expect(publicImageUrl(image, 640)).toBe(image);
  const cached = 'https://wsrv.nl/?url=' + encodeURIComponent(image) + '&w=200';
  expect(publicImageUrl(cached, 640)).toBe(image);
  expect(safeThemeImage(cached)).toBe(image);
  expect(publicImageUrl('https://catalog.example.com/cover.jpg', 640)?.startsWith('https://wsrv.nl/')).toBe(true);
  const external = 'https://another.example/assets/profile-themes/cover.jpg';
  expect(profileThemeAssetUrl(external)).toBe(external);
});

test('custom asset base rebases only owned URLs, including saved default-host URLs', () => {
  process.env.VITE_PROFILE_THEME_ASSET_BASE = 'https://cdn.example.com/theme-assets';
  expect(profileThemeAssetUrl('/assets/profile-themes/komorebi/garden.webp')).toBe('https://cdn.example.com/theme-assets/profile-themes/komorebi/garden.webp');
  expect(profileThemeAssetUrl(base + '/profile-themes/komorebi/garden.webp')).toBe('https://cdn.example.com/theme-assets/profile-themes/komorebi/garden.webp');
  expect(profileThemeAssetUrl('https://uploaded.example/image.png')).toBe('https://uploaded.example/image.png');
});

test('custom templates remap owned HTML/CSS assets while preserving the existing URL security boundary', () => {
  const relative = '/assets/profile-themes/komorebi/garden.webp';
  expect(safeTemplateImage(relative)).toBe(base + '/profile-themes/komorebi/garden.webp');
  expect(safeTemplateImage(base + '/profile-themes/komorebi/garden.webp')).toBe(base + '/profile-themes/komorebi/garden.webp');
  const compiled = compileCustomThemeCss('body{background:#eee url("' + relative + '")}');
  expect(compiled.css).toContain(base + '/profile-themes/komorebi/garden.webp');
  expect(compiled.warnings).toEqual([]);
  for (const value of ['javascript:alert(1)', '/assets/profile-themes/../private.png', '/assets/profile-themes/%2e%2e/private.png', 'https://name:password@tatakai.me/assets/profile-themes/image.png']) expect(safeThemeImage(value)).toBe('');
  expect(safeTemplateImage('https://unknown.example/tracker.png')).toBe('');
  const unsafe = compileCustomThemeCss('@import "https://evil.example/code.css";body{background:url("javascript:alert(1)")}');
  expect(unsafe.css).not.toContain('@import');
  expect(unsafe.css).not.toContain('javascript:');
});

test('conversation themes retain complete CSS palettes with direct remote artwork', () => {
  for (const id of ['uchiha', 'komorebi', 'gothic-empress']) {
    const appearance = profileThemeConversation(id);
    expect(appearance.image?.startsWith(base + '/profile-themes/')).toBe(true);
    expect(appearance.style.backgroundColor).toBeTruthy();
    expect(appearance.style.color).toBeTruthy();
  }
});

test('managed JSX images suppress hotlink referrers without changing unrelated media policy', () => {
  const image = base + '/profile-themes/gothic-empress/empress-poster.jpg';
  expect(mediaProps('img', { src: image })?.referrerPolicy).toBe('no-referrer');
  expect(mediaProps('img', { src: image, 'data-image-original': true })?.referrerPolicy).toBe('no-referrer');
  expect(mediaProps('img', { src: image, referrerPolicy: 'same-origin' })?.referrerPolicy).toBe('same-origin');
  expect(mediaProps('img', { src: 'https://uploads.example.com/photo.jpg' })?.referrerPolicy).toBeUndefined();
});

test('cached managed JSX images unwrap and call the real fallback once without a same-URL retry', () => {
  const image = base + '/profile-themes/gothic-empress/empress-poster.jpg';
  const cached = 'https://wsrv.nl/?url=' + encodeURIComponent(image) + '&w=200';
  let fallbacks = 0;
  let assignments = 0;
  const props = mediaProps('img', { src: cached, onError: () => { fallbacks += 1; } })!;
  expect(props.src).toBe(image);
  expect(props.referrerPolicy).toBe('no-referrer');
  const currentTarget = { getAttribute: () => image, set src(_value: string) { assignments += 1; } };
  props.onError({ currentTarget });
  expect(fallbacks).toBe(1);
  expect(assignments).toBe(0);
});
