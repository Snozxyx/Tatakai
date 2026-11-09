import { cpSync } from 'node:fs';
import path from 'node:path';
import { normalizeProfileThemeAssetBase, rewriteProfileThemeCss } from '../shared/profile-theme-assets.mjs';
import { assertNoPackagedProfileThemeAssets, PROFILE_THEME_PACKAGE_PATHS } from './profile-theme-asset-check.mjs';

// Unreferenced artwork stays on the website, rather than consuming native storage.
export const NATIVE_UNUSED_ARTWORK = [
  'assets/image/content/anime-style-group-boys-spending-time-together-enjoying-their-friendship.jpg',
  'assets/image/content/samurai-girl-confronts-mythical-dragon-backiee-5K.jpg',
  'assets/image/content/japan-background-digital-art.jpg',
  'assets/image/content/mysterious-oni-girl-in-shadows-backiee-4K.jpg',
  'assets/image/content/ken-kaneki-the-mighty-av.jpg',
];

// Vite otherwise copies all public files, including website demo recordings.
export function packagedAssetsPlugin({ packaged = true, profileThemeAssetBase } = {}) {
  let root;
  let output;
  const assetBase = normalizeProfileThemeAssetBase(profileThemeAssetBase);
  return {
    name: 'tatakai-packaged-assets',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      if (!/\.css(?:\?|$)/.test(id)) return;
      const result = rewriteProfileThemeCss(code, assetBase);
      return result !== code ? { code: result, map: null } : undefined;
    },
    configResolved(config) {
      root = config.root;
      output = path.resolve(root, config.build.outDir);
    },
    closeBundle() {
      const source = path.join(root, 'public');
      cpSync(source, output, {
        recursive: true,
        filter(file) {
          const relative = path.relative(source, file).split(path.sep).join('/');
          if (PROFILE_THEME_PACKAGE_PATHS.some(file => relative === file || relative.startsWith(`${file}/`))) return false;
          if (packaged && (NATIVE_UNUSED_ARTWORK.includes(relative) || relative === 'assets/logo/tatakaibanner.png')) return false;
          return !packaged || (!['assets/brand', 'assets/video', 'altstore'].some(dir =>
            relative === dir || relative.startsWith(`${dir}/`)) && relative !== 'sw.js');
        },
      });
      assertNoPackagedProfileThemeAssets(output, source);
    },
  };
}
