import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isProfileThemeAssetPath, isProfileThemeAssetUrl, profileThemeAssetUrl, normalizeProfileThemeAssetBase } from '../shared/profile-theme-assets.mjs';

test('profile media, mascots and theme fonts resolve directly to the server', () => {
  assert.equal(profileThemeAssetUrl('/assets/profile-themes/uchiha/itachi-rain.mp4'), 'https://tatakai.app/assets/profile-themes/uchiha/itachi-rain.mp4');
  assert.equal(profileThemeAssetUrl('./assets/mascots/Chibi Catgirl Yay Sticker.png'), 'https://tatakai.app/assets/mascots/Chibi%20Catgirl%20Yay%20Sticker.png');
  assert.equal(profileThemeAssetUrl('/assets/fonts/google-sans-flex-latin.woff2'), 'https://tatakai.app/assets/fonts/google-sans-flex-latin.woff2');
  assert.equal(profileThemeAssetUrl('/assets/profile-themes/theme/bg.webp?v=2#crop'), 'https://tatakai.app/assets/profile-themes/theme/bg.webp?v=2#crop');
});

test('a configured assets root also upgrades previously saved server URLs', () => {
  const base = 'https://cdn.example.test/theme-assets/';
  assert.equal(profileThemeAssetUrl('/assets/profile-themes/theme/bg.webp', base), 'https://cdn.example.test/theme-assets/profile-themes/theme/bg.webp');
  assert.equal(profileThemeAssetUrl('https://tatakai.me/assets/profile-themes/theme/bg.webp', base), 'https://cdn.example.test/theme-assets/profile-themes/theme/bg.webp');
  assert.equal(isProfileThemeAssetUrl('https://cdn.example.test/theme-assets/profile-themes/theme/bg.webp', base), true);
});

test('uploaded and unrelated assets do not enter the managed namespace', () => {
  for (const value of ['https://uploads.example.test/assets/profile-themes/photo.png', 'blob:https://tatakai.me/preview', '/assets/logo/logo.png']) {
    assert.equal(profileThemeAssetUrl(value), value);
    assert.equal(isProfileThemeAssetUrl(value), false);
  }
  assert.equal(isProfileThemeAssetUrl('https://user:password@tatakai.me/assets/profile-themes/photo.png'), false);
});

test('encoded traversal, protocol-relative paths and credential-bearing bases are rejected', () => {
  for (const value of ['/assets/profile-themes/../private.key', '/assets/profile-themes/%2e%2e/private.key', '/assets/profile-themes/%252e%252e/private.key', '/assets/profile-themes/path%2f../private.key', '//evil.test/assets/profile-themes/image.png', '/assets/profile-themes/path\\image.png']) assert.equal(isProfileThemeAssetPath(value), false);
  for (const base of ['http://cdn.example.test/assets', 'https://user:password@cdn.example.test/assets', 'https://cdn.example.test/assets?secret=1', 'https://cdn.example.test/assets#fragment']) assert.throws(() => normalizeProfileThemeAssetBase(base));
});
