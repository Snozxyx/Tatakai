import { describe, expect, test } from 'bun:test';
import { compileCustomThemeCss, renderProfileTemplate, renderProfileTemplateCss, DEFAULT_CUSTOM_THEME, safeTemplateLink } from '../src/lib/profileTemplate';
import type { ProfileThemeData } from '../src/components/profile/themes/types';
import { profileThemeConversation } from '../src/lib/profileThemeConversation';

const data: ProfileThemeData = { owner: { user_id: 'owner', display_name: 'A <script>alert(1)</script>', username: 'reader', bio: 'Hello "world"' },
  isOwner: false, canViewLibrary: true, canViewHistory: true, canViewCalendar: true, badges: [],
  library: [{ id: '1', title: 'Secret title <img onerror=bad>', href: '/anime/one', image: '' }], activity: [], favorites: [], links: [],
  stats: { anime: 14, manga: 7, episodes: 300, hours: 92, completed: 8, streak: 5, longestStreak: 12 }, following: false, followPending: false, followers: 42, onFollow: () => {}, loading: false, error: false };
describe('full HTML profile themes', () => {
  test('identity and stats tags are escaped once and never interpreted as markup or additional tags', () => {
    const rendered = renderProfileTemplate('<h1>{name}</h1><p>{followers} / {watch_hours} / {username}</p>', data);
    expect(rendered.html).toContain('A &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(rendered.html).toContain('42 / 92 / reader');
    expect(rendered.unknown).toEqual([]);
    expect(renderProfileTemplate('{name}', { ...data, owner: { ...data.owner, display_name: '{watchlist}' } }).html).toBe('{watchlist}');
  });
  test('private data cannot be recovered by including a collection or stats tag', () => {
    const rendered = renderProfileTemplate('{watchlist}|{anime_count}|{watch_hours}|{recent_activity}|{novel_list}', { ...data, canViewLibrary: false, canViewHistory: false });
    expect(rendered.html).not.toContain('Secret title');
    expect(rendered.html).not.toContain('300');
    expect(rendered.html).toContain('Private');
    expect(rendered.html).toContain('This collection is private.');
  });
  test('owner-only edit actions and visitor follow/message actions are generated from the viewer relationship', () => {
    const html = '{follow_button}{message_button}{edit_button}{default_button}';
    const visitor = renderProfileTemplate(html, data).html;
    expect(visitor).toContain('data-profile-action="message"'); expect(visitor).not.toContain('data-profile-action="edit"');
    const owner = renderProfileTemplate(html, { ...data, isOwner: true }).html;
    expect(owner).toContain('data-profile-action="edit"'); expect(owner).not.toContain('data-profile-action="follow"');
  });
  test('activity tags only use the privacy-filtered presence supplied by the server', () => {
    expect(renderProfileTemplate('{status}{activity}', data).html).toBe('');
    expect(renderProfileTemplate('{activity}', data, { user_id: 'owner', username: 'reader', display_name: 'A', avatar_url: null, online: false, last_seen: null, title: 'Hidden' }).html).toBe('');
  });
  test('unknown fields do not expose arbitrary owner properties, and media titles stay escaped', () => {
    const rendered = renderProfileTemplate('{access_token}{__proto__}{watchlist}', data);
    expect(rendered.unknown).toEqual(['{access_token}', '{__proto__}']);
    expect(rendered.html).toContain('&lt;img onerror=bad&gt;');
  });
  test('full themes support grids, responsive media queries and custom color variables', () => {
    const result = compileCustomThemeCss(':root{--accent:#aabbcc}body{display:grid;position:relative} @media(max-width:600px){body{grid-template-columns:1fr}}');
    expect(result.warnings).toEqual([]); expect(result.css).toContain('display:grid'); expect(result.css).toContain('@media');
    expect(compileCustomThemeCss(DEFAULT_CUSTOM_THEME.css).warnings).toEqual([]);
  });
  test('chat inherits safe custom-theme palette values without applying author CSS to app controls', () => {
    const result = profileThemeConversation('custom-html', ':root{--bg:#112233;--ink:#eeeeff;--accent:#cc99ff} body{position:fixed;display:none}');
    expect(result.style).toHaveProperty('--primary'); expect(result.style.backgroundColor).toBe('#112233');
    expect(result.style).not.toHaveProperty('position'); expect(result.style).not.toHaveProperty('display');
    expect(profileThemeConversation('custom-html', 'body{background:url(javascript:bad)}').style).toEqual({});
  });
  test('imports, unsafe fetches, legacy script CSS and remote fonts are removed', () => {
    const result = compileCustomThemeCss('@import "https://evil.example/a.css"; @font-face{font-family:x;src:url(https://evil.example/font)} body{background:url(https://evil.example/track);color:#fff;behavior:expression(alert(1))}');
    expect(result.css).not.toContain('evil.example'); expect(result.css).not.toContain('expression'); expect(result.css).toContain('color:#fff');
  });
  test('reduced motion removes author animation and transition declarations', () => {
    const result = compileCustomThemeCss('body{animation:spin 1s infinite;transition:all 1s;display:grid}', true);
    expect(result.css).not.toContain('animation'); expect(result.css).not.toContain('transition'); expect(result.css).toContain('display:grid');
  });
  test('image tags in CSS resolve to safe URLs and cannot close a quoted CSS value', () => {
    const css = renderProfileTemplateCss('body{background:url("{banner}")}', { ...data, owner: { ...data.owner, banner_url: 'https://i.imgur.com/banner.png' } });
    expect(css).toContain('https://i.imgur.com/banner.png');
    expect(compileCustomThemeCss(css).warnings).toEqual([]);
    expect(renderProfileTemplate('{initials}', { ...data, owner: { ...data.owner, display_name: 'Story Keeper' } }).html).toBe('SK');
  });
  test('links cannot carry credentials, JavaScript, external protocol-relative targets or private query strings', () => {
    for (const link of ['javascript:alert(1)', '//evil.example', 'https://name:password@evil.example', '/anime/id?access_token=secret']) expect(safeTemplateLink(link)).toBe('');
    expect(safeTemplateLink('/anime/id')).toBe('/anime/id');
  });
});
