import {
  isProfileThemeAssetPath,
  isProfileThemeAssetUrl as isOwnedAssetUrl,
  profileThemeAssetUrl as resolveAssetUrl,
  rewriteProfileThemeCss as rewriteAssetCss,
} from '../../shared/profile-theme-assets.mjs';
import { originalImageUrl } from './media/imageUrl';

function assetBase(): string | undefined {
  return import.meta.env?.VITE_PROFILE_THEME_ASSET_BASE || undefined;
}

export { isProfileThemeAssetPath };

/** Display owned assets through the VPS; leave already-validated uploaded media unchanged. */
export function profileThemeAssetUrl(value: string): string {
  const original = originalImageUrl(value);
  const source = original !== value && isOwnedAssetUrl(original, assetBase()) ? original : value;
  return resolveAssetUrl(source, assetBase());
}

export function isProfileThemeAssetUrl(value: unknown): boolean {
  return typeof value === 'string' && isOwnedAssetUrl(originalImageUrl(value), assetBase());
}

export function rewriteProfileThemeCss(value: string): string {
  return rewriteAssetCss(value, assetBase()).replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (match, _quote, source: string) => {
    return isProfileThemeAssetUrl(source.trim()) ? `url("${profileThemeAssetUrl(source.trim())}")` : match;
  });
}
