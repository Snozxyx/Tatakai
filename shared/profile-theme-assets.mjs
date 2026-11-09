export const DEFAULT_PROFILE_THEME_ASSET_BASE = 'https://tatakai.app/assets';
const LEGACY_PROFILE_THEME_ASSET_BASE = 'https://tatakai.me/assets';
export const PROFILE_THEME_ASSET_PREFIXES = ['profile-themes/', 'mascots/'];
export const PROFILE_THEME_ASSET_FILES = ['fonts/google-sans-flex-latin.woff2', 'fonts/google-sans-flex-OFL.txt'];

function assetPath(value) {
  if (typeof value !== 'string' || value.length > 4096 || /[\u0000-\u001f\\]/.test(value)) return null;
  let path = value.split(/[?#]/, 1)[0];
  if (path.startsWith('./')) path = path.slice(2);
  if (path.startsWith('assets/')) path = '/' + path;
  if (!path.startsWith('/assets/') || path.startsWith('//')) return null;
  try {
    for (let i = 0; i < 4 && path.includes('%'); i++) {
      if (/%(?:2f|5c)/i.test(path)) return null;
      const next = decodeURIComponent(path);
      if (next === path) break;
      path = next;
    }
  } catch { return null; }
  if (/[\u0000-\u001f\\?#%]/.test(path) || path.split('/').some(part => part === '.' || part === '..')) return null;
  return path.slice('/assets/'.length);
}

export function isProfileThemeAssetPath(value) {
  const path = assetPath(value);
  return path !== null && (PROFILE_THEME_ASSET_PREFIXES.some(prefix => path.startsWith(prefix)) || PROFILE_THEME_ASSET_FILES.includes(path));
}

export function normalizeProfileThemeAssetBase(value = DEFAULT_PROFILE_THEME_ASSET_BASE) {
  const raw = String(value || DEFAULT_PROFILE_THEME_ASSET_BASE).trim();
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || /[\u0000-\u001f\\]/.test(raw)) {
    throw new Error('Profile theme assets require an HTTPS base without credentials, query or fragment');
  }
  return url.href.replace(/\/+$/, '');
}

function ownedUrlPath(value, base) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    for (const candidate of new Set([normalizeProfileThemeAssetBase(base), DEFAULT_PROFILE_THEME_ASSET_BASE, LEGACY_PROFILE_THEME_ASSET_BASE])) {
      const owner = new URL(candidate);
      const prefix = owner.pathname.replace(/\/+$/, '') + '/';
      if (url.origin !== owner.origin || !url.pathname.startsWith(prefix)) continue;
      const path = '/assets/' + url.pathname.slice(prefix.length);
      if (isProfileThemeAssetPath(path)) return { path, suffix: url.search + url.hash };
    }
  } catch { /* Not an owned URL. */ }
  return null;
}

export function isProfileThemeAssetUrl(value, base = DEFAULT_PROFILE_THEME_ASSET_BASE) {
  return typeof value === 'string' && ownedUrlPath(value, base) !== null;
}

/** Rewrite only owned static paths. Uploaded/external URLs keep their existing validators. */
export function profileThemeAssetUrl(value, base = DEFAULT_PROFILE_THEME_ASSET_BASE) {
  if (typeof value !== 'string') return '';
  const owned = ownedUrlPath(value, base);
  if (owned) return profileThemeAssetUrl(owned.path, base) + owned.suffix;
  if (!isProfileThemeAssetPath(value)) return value;
  const path = assetPath(value);
  const suffix = value.match(/[?#].*$/)?.[0] || '';
  return normalizeProfileThemeAssetBase(base) + '/' + path.split('/').map(encodeURIComponent).join('/') + suffix;
}

/** Runs before Vite processes CSS assets, preventing local files from being bundled. */
export function rewriteProfileThemeCss(css, base = DEFAULT_PROFILE_THEME_ASSET_BASE) {
  return css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (match, _quote, value) => {
    const path = value.trim();
    return isProfileThemeAssetPath(path) ? `url("${profileThemeAssetUrl(path, base)}")` : match;
  });
}
