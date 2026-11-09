import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PROFILE_THEME_ASSET_PREFIXES, PROFILE_THEME_ASSET_FILES } from '../shared/profile-theme-assets.mjs';

export const PROFILE_THEME_PACKAGE_PATHS = [
  ...PROFILE_THEME_ASSET_PREFIXES.map(prefix => 'assets/' + prefix.replace(/\/$/, '')),
  ...PROFILE_THEME_ASSET_FILES.map(file => 'assets/' + file),
];

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(filename) : entry.isFile() ? [filename] : [];
  });
}
const digest = data => createHash('sha256').update(data).digest('hex');

/** Check content too: renaming or inlining media does not make it safe to ship. */
export function assertNoPackagedProfileThemeAssets(directory, publicDirectory = 'public') {
  const forbidden = PROFILE_THEME_PACKAGE_PATHS.filter(file => fs.existsSync(path.join(directory, file)));
  if (forbidden.length) throw new Error('Server-hosted profile assets found in build: ' + forbidden.join(', '));
  const sources = PROFILE_THEME_PACKAGE_PATHS.flatMap(file => {
    const filename = path.join(publicDirectory, file);
    if (!fs.existsSync(filename)) return [];
    return fs.statSync(filename).isDirectory() ? walk(filename) : [filename];
  });
  const sizes = new Set(), hashes = new Set(), inline = [];
  for (const filename of sources) {
    const bytes = fs.readFileSync(filename);
    sizes.add(bytes.length); hashes.add(digest(bytes));
    if (bytes.length > 16 && bytes.length <= 4096 && /\.(?:svg|png|webp|jpg|jpeg)$/i.test(filename)) {
      inline.push(bytes.toString('base64'));
      if (/\.svg$/i.test(filename)) inline.push(encodeURIComponent(bytes.toString('utf8')), JSON.stringify(bytes.toString('utf8')).slice(1, -1));
    }
  }
  const leaks = [];
  for (const filename of walk(directory)) {
    const stat = fs.statSync(filename);
    if (sizes.has(stat.size) && hashes.has(digest(fs.readFileSync(filename)))) leaks.push(path.relative(directory, filename));
    if (inline.length && /\.(?:js|css|html)$/i.test(filename)) {
      const text = fs.readFileSync(filename, 'utf8');
      if (inline.some(payload => text.includes(payload))) leaks.push(path.relative(directory, filename));
    }
  }
  if (leaks.length) throw new Error('Profile assets were emitted or inlined in the build: ' + [...new Set(leaks)].join(', '));
}
