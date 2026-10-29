import { describe, expect, test } from 'bun:test';
import { compileProfileCss } from '../src/lib/profileCustomCode';
import { activityPermitted, DEFAULT_SOCIAL_PRIVACY, safeActivityHref } from '../src/lib/socialActivity';
import { profileThemeConversation } from '../src/lib/profileThemeConversation';
import { defaultSekaiConfig } from '../src/lib/profileThemes';

describe('profile custom CSS boundary', () => {
  test('scopes every selector while preserving supported appearance declarations', () => {
    const result = compileProfileCss('h2, .sp-widget { color: #c5b8f3; padding: 20px; }', 'alice');
    expect(result.warnings).toEqual([]);
    expect(result.css).toContain(':not([data-profile-protected], [data-profile-protected] *)');
    expect(result.css).toContain(':where([data-profile-custom-root="alice"]) h2:not([data-profile-protected], [data-profile-protected] *),');
    expect(result.css).toContain(':where([data-profile-custom-root="alice"]) .sp-widget');
  });
  test('drops network requests, imports, layout escapes, functional selectors and important overrides', () => {
    const css = compileProfileCss('@import "https://evil.example"; body { position: fixed; z-index: 999; background-image: url(https://evil.example); color: red!important; } :is(h1),body { color: blue }').css;
    for (const token of ['@import', 'https:', 'position', 'z-index', 'background-image', '!important', ':is']) expect(css).not.toContain(token);
    expect(css).toContain('color: red');
  });
  test('rejects malformed and oversized CSS without applying partial raw input', () => {
    expect(compileProfileCss('h2 {').css).toBe('');
    expect(compileProfileCss('x'.repeat(20001)).css).toBe('');
  });
});
describe('social activity privacy', () => {
  const activity = { kind: 'watching' as const, title: 'Frieren', href: '/anime/frieren' };
  test('online and per-media switches are both required to publish an activity', () => {
    expect(activityPermitted(activity, DEFAULT_SOCIAL_PRIVACY)).toBe(true);
    expect(activityPermitted(activity, { ...DEFAULT_SOCIAL_PRIVACY, show_online: false })).toBe(false);
    expect(activityPermitted(activity, { ...DEFAULT_SOCIAL_PRIVACY, share_watching: false })).toBe(false);
    expect(activityPermitted({ ...activity, kind: 'novel' }, { ...DEFAULT_SOCIAL_PRIVACY, share_reading: false })).toBe(false);
  });
  test('activity links cannot expose reader/provider queries or navigate outside the app', () => {
    for (const href of ['//evil.example', 'https://evil.example', '/messages/id', '/novel/book?token=secret', '/anime/../../messages']) expect(safeActivityHref(href)).toBeNull();
    expect(safeActivityHref('/manga/one-piece')).toBe('/manga/one-piece');
  });
});
describe('profile-matched chat', () => {
  test('every custom theme supplies its own palette and the default inherits app settings', () => {
    for (const id of ['uchiha', 'komorebi', 'gothic-empress', 'midnight-lofi', 'sekaipop']) {
      expect(profileThemeConversation(id, defaultSekaiConfig()).style).toHaveProperty('--foreground');
    }
    expect(profileThemeConversation('default').style).toEqual({});
    expect(profileThemeConversation('unknown').style).toEqual({});
  });
  test('chat follows saved accent and SekaiPop light/dark configuration', () => {
    const cyan = profileThemeConversation('midnight-lofi', {version:1,accent:'cyan'});
    const amber = profileThemeConversation('midnight-lofi', {version:1,accent:'amber'});
    expect(cyan.style).not.toEqual(amber.style);
    const config = defaultSekaiConfig();
    expect(profileThemeConversation('sekaipop', config).style).not.toEqual(profileThemeConversation('sekaipop', {...config,mode:'dark'}).style);
  });
});
