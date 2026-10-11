import { describe, expect, test } from 'bun:test';
import { AVATAR_DECORATIONS, PROFILE_COSMETIC_EFFECTS, PROFILE_NAMEPLATES, hasPremiumCosmetics } from '../src/lib/profileCosmetics';
import { PREMIUM_BACKGROUND_EFFECTS, readProfileCustomization, profileSurfaceStyle } from '../src/lib/profileSettings';

describe('premium cosmetics access', () => {
  test('all three premium badge tiers and both admin representations unlock equipment', () => {
    for (const key of ['premium-go', 'premium-pro', 'premium-ultra']) expect(hasPremiumCosmetics({}, [{ key }])).toBe(true);
    expect(hasPremiumCosmetics({ is_admin: true })).toBe(true);
    expect(hasPremiumCosmetics({ role: 'admin' })).toBe(true);
  });

  test('standard, moderator, legacy premium flags, and unrelated badges cannot unlock equipment', () => {
    expect(hasPremiumCosmetics(null)).toBe(false);
    expect(hasPremiumCosmetics({ role: 'moderator', is_moderator: true })).toBe(false);
    expect(hasPremiumCosmetics({ is_premium: true } as never)).toBe(false);
    for (const key of ['booster', 'developer', 'partner', 'og', 'premium-forged']) expect(hasPremiumCosmetics({}, [{ key }])).toBe(false);
  });

  test('unentitled profile owners cannot render equipped premium cosmetics', () => {
    const row = { app_settings: { profile: { backgroundEffect: 'moonlit', avatarDecoration: 'imperial', profileEffect: 'hologram', nameplate: 'opal', ambientColor: '#ff99ca' } } };
    const denied = readProfileCustomization(row);
    expect(denied.backgroundEffect).toBe('none');
    expect(denied.avatarDecoration).toBe('none');
    expect(denied.profileEffect).toBe('none');
    expect(denied.nameplate).toBe('none');
    expect(denied.ambientColor).not.toBeNull();
    const allowed = readProfileCustomization(row, true);
    expect(allowed.backgroundEffect).toBe('moonlit');
    expect(allowed.avatarDecoration).toBe('imperial');
    expect(allowed.profileEffect).toBe('hologram');
    expect(allowed.nameplate).toBe('opal');
  });

  test('every shipped cosmetic round-trips for an entitled owner', () => {
    for (const backgroundEffect of PREMIUM_BACKGROUND_EFFECTS) expect(readProfileCustomization({ app_settings: { profile: { backgroundEffect } } }, true).backgroundEffect).toBe(backgroundEffect);
    for (const { key } of AVATAR_DECORATIONS) expect(readProfileCustomization({ app_settings: { profile: { avatarDecoration: key } } }, true).avatarDecoration).toBe(key);
    for (const { key } of PROFILE_COSMETIC_EFFECTS) expect(readProfileCustomization({ app_settings: { profile: { profileEffect: key } } }, true).profileEffect).toBe(key);
    for (const { key } of PROFILE_NAMEPLATES) expect(readProfileCustomization({ app_settings: { profile: { nameplate: key } } }, true).nameplate).toBe(key);
  });

  test('unknown keys fail closed; free backgrounds remain available', () => {
    const unknown = readProfileCustomization({ app_settings: { profile: { avatarDecoration: 'forged', profileEffect: 'forged', nameplate: 'forged', backgroundEffect: 'forged' } } }, true);
    expect([unknown.avatarDecoration, unknown.profileEffect, unknown.nameplate, unknown.backgroundEffect]).toEqual(['none', 'none', 'none', 'none']);
    expect(readProfileCustomization({ app_settings: { profile: { backgroundEffect: 'snow' } } }).backgroundEffect).toBe('snow');
  });

  test('cosmetic colors never retheme the original controls and cards', () => {
    expect(profileSurfaceStyle(readProfileCustomization({ app_settings: { profile: { avatarDecoration: 'celestial' } } }, true))).toBeUndefined();
    const style = profileSurfaceStyle(readProfileCustomization({ app_settings: { profile: { ambientColor: '#93b7ef', avatarDecoration: 'celestial' } } }, true));
    expect(Object.keys(style!)).toEqual(['--profile-accent']);
  });
});
