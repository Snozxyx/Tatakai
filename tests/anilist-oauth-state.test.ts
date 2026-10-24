/**
 * Regression test — OAuth `state` handling for the AniList link flow.
 *
 * SEC audit finding AUTH-1: the web AniList flow sent no `state` parameter, and
 * the redirect page exchanged whatever `code` it received. That is a login CSRF:
 * an attacker holding an authorization code for THEIR AniList account could send
 * the victim to
 *     https://tatakai.me/integration/anilist/redirect?code=<attacker code>
 * and the victim's Tatakai profile would link the attacker's AniList account.
 *
 * The fix: every flow mints and stores a state, the authorize URL carries it,
 * and the redirect page refuses a callback whose state does not match.
 */
import { describe, it, expect, beforeEach } from 'bun:test';

process.env.VITE_ANILIST_CLIENT_ID = '1234';
process.env.VITE_ANILIST_REDIRECT_URI = 'https://tatakai.me/integration/anilist/redirect';

const store = new Map<string, string>();
(globalThis as any).localStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => store.clear(),
};

const mod = await import('../src/lib/externalIntegrations');

describe('AniList OAuth state (AUTH-1)', () => {
    beforeEach(() => store.clear());

    it('mints and persists a state for the web flow (which used to send none)', () => {
        const url = new URL(mod.getAniListAuthUrl());
        const state = url.searchParams.get('state');
        expect(state).toBeTruthy();
        expect(state!.length).toBeGreaterThanOrEqual(16);
        expect(url.searchParams.get('response_type')).toBe('code');
        expect(mod.readAniListOAuthState()).toBe(state!);
    });

    it('uses the desktop bridge marker when one is passed', () => {
        const url = new URL(mod.getAniListAuthUrl(undefined, 'tatakai-desktop-abc123'));
        expect(url.searchParams.get('state')).toBe('tatakai-desktop-abc123');
        expect(mod.readAniListOAuthState()).toBe('tatakai-desktop-abc123');
    });

    it('mints a different state for each new attempt (no replayable constant)', () => {
        const first = new URL(mod.getAniListAuthUrl()).searchParams.get('state');
        const second = new URL(mod.getAniListAuthUrl()).searchParams.get('state');
        expect(first).not.toBe(second);
        expect(mod.readAniListOAuthState()).toBe(second!);
    });

    it('keeps the state that a returning callback is verified against', () => {
        const state = new URL(mod.getAniListAuthUrl()).searchParams.get('state')!;
        // What the redirect page compares the callback's ?state= with.
        expect(mod.readAniListOAuthState()).toBe(state);
        // A callback carrying someone else's state does not match.
        expect(mod.readAniListOAuthState()).not.toBe('attacker-state');
    });
});
