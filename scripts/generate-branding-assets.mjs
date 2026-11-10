import sharp from 'sharp';
import iconGen from 'icon-gen';
import { mkdir, readFile, writeFile, copyFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const variants = ['dark', 'light', 'monochrome', 'legacy'];

async function generateIconFiles(input, output, name, icns = false) {
  const numeric = path.join(root, '.cache/branding-icons', name); await mkdir(numeric, { recursive: true });
  for (const size of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) await sharp(input).resize(size, size).ensureAlpha().png().toFile(path.join(numeric, `${size}.png`));
  await iconGen(numeric, output, { ico: { name, sizes: [16, 32, 48, 64, 128, 256] }, ...(icns ? { icns: { name, sizes: [16, 32, 64, 128, 256, 512, 1024] } } : {}) });
}

/** Remove the connected white exterior using the dark tile's silhouette. */
export async function exteriorMask(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const count = info.width * info.height, outside = new Uint8Array(count), queue = new Uint32Array(count);
  let head = 0, tail = 0;
  const visit = index => {
    if (outside[index]) return;
    const offset = index * 4;
    if (data[offset] < 230 || data[offset + 1] < 230 || data[offset + 2] < 230) return;
    outside[index] = 1; queue[tail++] = index;
  };
  for (let x = 0; x < info.width; x++) { visit(x); visit((info.height - 1) * info.width + x); }
  for (let y = 0; y < info.height; y++) { visit(y * info.width); visit(y * info.width + info.width - 1); }
  while (head < tail) {
    const index = queue[head++], x = index % info.width;
    if (x > 0) visit(index - 1); if (x < info.width - 1) visit(index + 1);
    if (index >= info.width) visit(index - info.width); if (index < count - info.width) visit(index + info.width);
  }
  const alpha = Buffer.alloc(count, 255);
  for (let index = 0; index < count; index++) if (outside[index]) alpha[index] = 0;
  return { alpha, width: info.width, height: info.height };
}

export async function normalizeTile(input, mask) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== mask.width || info.height !== mask.height) throw new Error('Logo silhouette dimensions differ');
  for (let index = 0; index < mask.alpha.length; index++) data[index * 4 + 3] = Math.min(data[index * 4 + 3], mask.alpha[index]);
  return sharp(data, { raw: info }).png().toBuffer();
}

/** Desktop launchers display the asset's alpha channel instead of masking it. */
async function desktopIcon(input) {
  const size = 1024;
  const mask = Buffer.from(`<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><rect width="${size}" height="${size}" rx="${size * 0.18}" fill="white"/></svg>`);
  return sharp(input).resize(size, size).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

export async function generateBrandingAssets() {
  const assets = path.join(root, 'public/assets/branding'), resources = path.join(root, 'resources/branding');
  await mkdir(assets, { recursive: true }); await mkdir(resources, { recursive: true });
  const sourceDir = path.join(root, 'build/branding-source');
  await mkdir(sourceDir, { recursive: true });
  const inputs = { dark: 'Untitled Design (1).png', monochrome: 'Untitled design (2).png', light: 'Untitled design (3).png' };
  for (const [variant, name] of Object.entries(inputs)) {
    const destination = path.join(sourceDir, `${variant}.png`);
    try { await readFile(destination); } catch { await copyFile(path.join(root, 'New folder', name), destination); }
  }
  const mask = await exteriorMask(path.join(sourceDir, 'monochrome.png'));
  const tiles = {
    dark: await readFile(path.join(sourceDir, 'dark.png')),
    light: await normalizeTile(path.join(sourceDir, 'light.png'), mask),
    monochrome: await normalizeTile(path.join(sourceDir, 'monochrome.png'), mask),
    legacy: await readFile(path.join(root, 'public/assets/logo/tatakai-logo-square.png')),
  };
  const fills = { light: '#fff6fa', dark: '#09090b', monochrome: '#09090b', legacy: '#f57875' };
  const densitySizes = { ldpi: 36, mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  for (const variant of variants) {
    await sharp(tiles[variant]).resize(512, 512).png().toFile(path.join(assets, `${variant}.png`));
    const flat = await sharp(tiles[variant]).resize(1024, 1024).flatten({ background: fills[variant] }).png().toBuffer();
    const desktop = await desktopIcon(tiles[variant]);
    await writeFile(path.join(resources, `${variant}.png`), desktop);
    await generateIconFiles(desktop, resources, variant);
    for (const [density, size] of Object.entries(densitySizes)) {
      const directory = path.join(root, 'android/app/src/main/res', `mipmap-${density}`);
      await mkdir(directory, { recursive: true });
      await sharp(flat).resize(size, size).png().toFile(path.join(directory, `ic_launcher_${variant}.png`));
      const foregroundSize = Math.round(size * 2.25), insetSize = Math.round(foregroundSize * 0.72);
      const inset = await sharp(tiles[variant]).resize(insetSize, insetSize).png().toBuffer();
      await sharp({ create: { width: foregroundSize, height: foregroundSize, channels: 4, background: '#00000000' } }).composite([{ input: inset, left: Math.floor((foregroundSize - insetSize) / 2), top: Math.floor((foregroundSize - insetSize) / 2) }]).png().toFile(path.join(directory, `ic_launcher_${variant}_foreground.png`));
    }
    const adaptive = path.join(root, 'android/app/src/main/res/mipmap-anydpi-v26');
    await mkdir(adaptive, { recursive: true });
    await writeFile(path.join(adaptive, `ic_launcher_${variant}.xml`), `<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/branding_${variant}"/><foreground android:drawable="@mipmap/ic_launcher_${variant}_foreground"/></adaptive-icon>\n`);
    const tv = path.join(root, 'android/app/src/tv/res/drawable'); await mkdir(tv, { recursive: true });
    const logo = await sharp(tiles[variant]).resize(120, 120).png().toBuffer();
    await sharp({ create: { width: 320, height: 180, channels: 4, background: fills[variant] } }).composite([{ input: logo, left: 100, top: 30 }]).png().toFile(path.join(tv, `tv_banner_${variant}.png`));
    const name = `AppIcon${variant[0].toUpperCase()}${variant.slice(1)}`;
    const ios = path.join(root, 'ios/App/App/Assets.xcassets', `${name}.appiconset`); await mkdir(ios, { recursive: true });
    await writeFile(path.join(ios, 'icon.png'), flat);
    await writeFile(path.join(ios, 'Contents.json'), JSON.stringify({ images: [{ filename: 'icon.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }], info: { author: 'xcode', version: 1 } }, null, 2) + '\n');
  }
  const values = path.join(root, 'android/app/src/main/res/values/branding.xml');
  await writeFile(values, '<resources>' + variants.map(variant => `<color name="branding_${variant}">${fills[variant]}</color>`).join('') + '</resources>\n');
  for (const [density, size] of Object.entries(densitySizes)) {
    const directory = path.join(root, 'android/app/src/main/res', `mipmap-${density}`);
    for (const name of ['ic_launcher.png', 'ic_launcher_round.png']) await sharp(tiles.dark).resize(size, size).flatten({ background: fills.dark }).png().toFile(path.join(directory, name));
  }
  for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml']) await writeFile(path.join(root, 'android/app/src/main/res/mipmap-anydpi-v26', name), '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/branding_dark"/><foreground android:drawable="@mipmap/ic_launcher_dark_foreground"/></adaptive-icon>\n');
  await sharp(tiles.dark).resize(256, 256).png().toFile(path.join(root, 'android/app/src/main/res/drawable/ic_notification_large.png'));
  const glyph = await sharp(tiles.monochrome).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let index = 0; index < glyph.data.length; index += 4) {
    const opacity = glyph.data[index + 3] * Math.max(0, Math.min(1, (glyph.data[index] - 170) / 85));
    glyph.data[index] = glyph.data[index + 1] = glyph.data[index + 2] = 255; glyph.data[index + 3] = Math.round(opacity);
  }
  await sharp(glyph.data, { raw: glyph.info }).resize(96, 96).png().toFile(path.join(root, 'android/app/src/main/res/drawable/ic_notification.png'));
  // Keep the old originals intact; replace only generated installed defaults.
  await sharp(tiles.dark).resize(512, 512).png().toFile(path.join(root, 'resources/icon.png'));
  for (const size of [16, 32, 48, 64, 128, 256, 512, 1024]) await sharp(tiles.dark).resize(size, size).png().toFile(path.join(root, 'resources', `icon-${size}.png`));
  await generateIconFiles(path.join(resources, 'dark.png'), path.join(root, 'resources'), 'icon', true);
  const pwa = path.join(root, 'public/assets/branding/pwa'); await mkdir(pwa, { recursive: true });
  for (const size of [192, 512]) {
    await sharp(tiles.dark).resize(size, size).png().toFile(path.join(pwa, `icon-${size}.png`));
    await sharp(tiles.dark).resize(size, size).flatten({ background: fills.dark }).png().toFile(path.join(pwa, `icon-maskable-${size}.png`));
  }
  const primary = path.join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset');
  await mkdir(primary, { recursive: true });
  const images = [];
  for (const [variant, appearance] of [['light', null], ['dark', 'dark'], ['monochrome', 'tinted']]) {
    const filename = `${variant}.png`; await copyFile(path.join(root, 'ios/App/App/Assets.xcassets', `AppIcon${variant[0].toUpperCase()}${variant.slice(1)}.appiconset/icon.png`), path.join(primary, filename));
    images.push({ filename, idiom: 'universal', platform: 'ios', size: '1024x1024', ...(appearance ? { appearances: [{ appearance: 'luminosity', value: appearance }] } : {}) });
  }
  await writeFile(path.join(primary, 'Contents.json'), JSON.stringify({ images, info: { author: 'xcode', version: 1 } }, null, 2) + '\n');
  const mobile = path.join(root, 'resources/mobile'); await mkdir(mobile, { recursive: true });
  for (const icon of [path.join(mobile, 'icon-only.png'), path.join(root, 'resources/icon-only.png')]) await sharp(tiles.dark).resize(1024, 1024).flatten({ background: fills.dark }).png().toFile(icon);
  async function splash(file) {
    let width = 2732, height = 2732;
    try { const previous = await sharp(file).metadata(); width = previous.width; height = previous.height; } catch { /* new standard splash */ }
    const size = Math.round(Math.min(width, height) * 0.28), logo = await sharp(tiles.dark).resize(size, size).png().toBuffer();
    await sharp({ create: { width, height, channels: 4, background: '#0f0b0c' } }).composite([{ input: logo, left: Math.floor((width - size) / 2), top: Math.floor((height - size) / 2) }]).png().toFile(file);
  }
  await splash(path.join(mobile, 'splash.png')); await splash(path.join(root, 'resources/splash.png'));
  const androidRes = path.join(root, 'android/app/src/main/res');
  for (const directory of await readdir(androidRes, { withFileTypes: true })) if (directory.isDirectory() && directory.name.startsWith('drawable')) {
    const file = path.join(androidRes, directory.name, 'splash.png'); try { await readFile(file); await splash(file); } catch { /* resource qualifier without a splash */ }
  }
  const iosSplash = path.join(root, 'ios/App/App/Assets.xcassets/Splash.imageset');
  for (const file of await readdir(iosSplash)) if (file.endsWith('.png')) await splash(path.join(iosSplash, file));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await generateBrandingAssets();
