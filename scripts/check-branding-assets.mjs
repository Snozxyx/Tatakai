import assert from 'node:assert/strict';
const test = async (_name, run) => { await run(); };
const expect = value => ({ toBe: expected => assert.equal(value, expected), toEqual: expected => assert.deepEqual(value, expected) });
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { exteriorMask, normalizeTile } from './generate-branding-assets.mjs';

await test('exterior normalization preserves disconnected white artwork and the light tile fill', async () => {
  const source = Buffer.alloc(16 * 16 * 4, 255);
  for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) { const index = (y * 16 + x) * 4; source[index] = source[index + 1] = source[index + 2] = 15; }
  source[(8 * 16 + 8) * 4] = source[(8 * 16 + 8) * 4 + 1] = source[(8 * 16 + 8) * 4 + 2] = 255;
  const input = await sharp(source, { raw: { width: 16, height: 16, channels: 4 } }).png().toBuffer();
  const mask = await exteriorMask(input);
  const result = await sharp(await normalizeTile(input, mask)).raw().toBuffer();
  expect(result[3]).toBe(0);
  expect(result[(8 * 16 + 8) * 4 + 3]).toBe(255);
  const light = await sharp({ create: { width: 16, height: 16, channels: 4, background: '#fffafd' } }).png().toBuffer();
  const normalized = await sharp(await normalizeTile(light, mask)).raw().toBuffer();
  expect(normalized[(7 * 16 + 7) * 4 + 3]).toBe(255);
  expect(normalized[(7 * 16 + 7) * 4 + 1]).toBe(250);
});
await test('generated light and monochrome logos have transparent corners and opaque central artwork', async () => {
  for (const name of ['light', 'monochrome']) {
    const { data, info } = await sharp(`public/assets/branding/${name}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(data[3]).toBe(0);
    expect(data[(Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 4 + 3]).toBe(255);
  }
  const catalog = JSON.parse(await readFile('ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json', 'utf8'));
  expect(catalog.images.map(image => image.appearances?.[0]?.value ?? 'any')).toEqual(['any', 'dark', 'tinted']);
});

console.log('BRANDING_ASSETS_OK');
