export type PublicAniListApp = { clientId: string; redirectUri: string };
export type PublicAniListConfig = {
  clientId: string;
  redirectUri: string;
  legacyClientId?: string;
  legacyRedirectUri?: string;
};

const LEGACY_REDIRECT = 'https://tatakai.me/integration/anilist/redirect';
const APP_REDIRECT = 'https://tatakai.app/integration/anilist/redirect';

/** AniList supports one callback per client; keep .me and .app paired. */
export function selectPublicAniListApp(
  config: PublicAniListConfig,
  webOrigin?: string,
  redirectOverride?: string,
): PublicAniListApp {
  const primaryRedirect = config.redirectUri || APP_REDIRECT;
  const legacyRedirect = config.legacyRedirectUri || LEGACY_REDIRECT;
  const isLegacyWeb = webOrigin === 'https://tatakai.me' || webOrigin === 'https://www.tatakai.me';
  const redirectUri = redirectOverride || (isLegacyWeb ? legacyRedirect : primaryRedirect);
  const primary = redirectUri === primaryRedirect;
  const legacy = redirectUri === legacyRedirect;
  if (!primary && !legacy) throw new Error('AniList redirect URI is not registered for this app');
  const clientId = primary
    ? config.clientId
    : config.legacyClientId || (primaryRedirect === legacyRedirect ? config.clientId : '36420');
  if (!clientId) throw new Error('Missing AniList client ID');
  return { clientId, redirectUri };
}

export function currentPublicAniListApp(
  native: boolean,
  webOrigin?: string,
  redirectOverride?: string,
): PublicAniListApp {
  return selectPublicAniListApp({
    clientId: String(import.meta.env.VITE_ANILIST_CLIENT_ID || ''),
    redirectUri: String(import.meta.env.VITE_ANILIST_REDIRECT_URI || '').split(',')[0]?.trim() || APP_REDIRECT,
    legacyClientId: String(import.meta.env.VITE_ANILIST_LEGACY_CLIENT_ID || ''),
    legacyRedirectUri: String(import.meta.env.VITE_ANILIST_LEGACY_REDIRECT_URI || '').trim() || LEGACY_REDIRECT,
  }, native ? undefined : webOrigin, redirectOverride);
}
