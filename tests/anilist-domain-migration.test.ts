import { describe, expect, it } from 'bun:test';
import { selectPublicAniListApp } from '../src/lib/anilistApp';

const config = {
  clientId: '56435',
  redirectUri: 'https://tatakai.app/integration/anilist/redirect',
  legacyClientId: '36420',
  legacyRedirectUri: 'https://tatakai.me/integration/anilist/redirect',
};

describe('AniList public configuration by domain', () => {
  it('pairs the new website with the new registered app', () => {
    expect(selectPublicAniListApp(config, 'https://tatakai.app')).toEqual({ clientId: '56435', redirectUri: config.redirectUri });
  });
  it('keeps the old website paired with its existing app', () => {
    expect(selectPublicAniListApp(config, 'https://tatakai.me')).toEqual({ clientId: '36420', redirectUri: config.legacyRedirectUri });
  });
  it('uses the canonical app for native flows and honors a stored legacy callback', () => {
    expect(selectPublicAniListApp(config).clientId).toBe('56435');
    expect(selectPublicAniListApp(config, undefined, config.legacyRedirectUri).clientId).toBe('36420');
  });
  it('supports an old build where the primary app was already the .me client', () => {
    expect(selectPublicAniListApp({ clientId: '36420', redirectUri: config.legacyRedirectUri }, 'https://tatakai.me').clientId).toBe('36420');
  });
  it('rejects arbitrary callback overrides and returns public fields only', () => {
    expect(() => selectPublicAniListApp(config, 'https://tatakai.app', 'https://evil.test/callback')).toThrow('not registered');
    expect(Object.keys(selectPublicAniListApp(config)).sort()).toEqual(['clientId', 'redirectUri']);
  });
});
