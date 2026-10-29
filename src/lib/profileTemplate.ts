import { parse } from 'postcss';
import type { ProfileThemeData, ThemeMediaItem } from '@/components/profile/themes/types';
import type { SocialPresence } from '@/lib/socialActivity';
import { isAllowedImageUrl } from '@/lib/imageHosts';

export interface CustomProfileTheme {
  version: 1; theme_name: string; enabled: boolean; html: string; css: string;
}
export type ProfileTemplateData = Omit<ProfileThemeData, 'stats'> & { stats: Partial<ProfileThemeData['stats']>; summaryOnly?: boolean };
export const PROFILE_TEMPLATE_TAGS = [
  { group: 'Identity', key: 'name', description: 'Display name' }, { group: 'Identity', key: 'username', description: 'Username without @' },
  { group: 'Identity', key: 'bio', description: 'Profile bio' }, { group: 'Identity', key: 'avatar', description: 'Avatar image URL' },
  { group: 'Identity', key: 'initials', description: 'Display name initials' },
  { group: 'Identity', key: 'banner', description: 'Banner image URL' }, { group: 'Identity', key: 'profile_url', description: 'Profile link' },
  { group: 'Identity', key: 'status', description: 'Shared online or last-seen status' }, { group: 'Identity', key: 'activity', description: 'Shared watching or reading activity' },
  { group: 'Stats', key: 'followers', description: 'Follower count' }, { group: 'Stats', key: 'following', description: 'Following count' },
  { group: 'Stats', key: 'anime_count', description: 'Anime library size' }, { group: 'Stats', key: 'manga_count', description: 'Manga library size' },
  { group: 'Stats', key: 'novel_count', description: 'Visible novel library size' }, { group: 'Stats', key: 'episodes', description: 'Episodes watched' },
  { group: 'Stats', key: 'watch_hours', description: 'Hours watched' }, { group: 'Stats', key: 'completed', description: 'Completed anime' },
  { group: 'Stats', key: 'streak', description: 'Current watch streak' }, { group: 'Stats', key: 'longest_streak', description: 'Longest watch streak' },
  { group: 'Collections', key: 'badges', description: 'Verified badge images' }, { group: 'Collections', key: 'watchlist', description: 'Visible anime cards' },
  { group: 'Collections', key: 'manga_list', description: 'Visible manga cards' }, { group: 'Collections', key: 'novel_list', description: 'Visible novel cards' },
  { group: 'Collections', key: 'recent_activity', description: 'Visible watch history' }, { group: 'Collections', key: 'reading_history', description: 'Visible reading history' },
  { group: 'Collections', key: 'favorites', description: 'Favorite character cards' }, { group: 'Collections', key: 'social_links', description: 'Profile social links' },
  { group: 'Actions', key: 'follow_button', description: 'Working Follow / Following button' }, { group: 'Actions', key: 'message_button', description: 'Open a private conversation' },
  { group: 'Actions', key: 'edit_button', description: 'Edit this theme (owner only)' }, { group: 'Actions', key: 'back_button', description: 'Go back' },
  { group: 'Actions', key: 'default_button', description: 'View the original profile' },
] as const;

export const STARTER_PROFILE_HTML = `<main class="profile">
  <header class="topbar"><a href="/">TATAKAI</a><nav>{back_button}{edit_button}{default_button}</nav></header>
  <section class="hero">
    <div class="portrait"><span class="avatar-fallback">{initials}</span><img class="avatar" src="{avatar}" alt="{name}" /></div>
    <div class="identity"><p class="handle">@{username}</p><h1>{name}</h1><p class="bio">{bio}</p><p class="status">{status}</p><p>{activity}</p><div class="badges">{badges}</div><div class="actions">{follow_button}{message_button}</div></div>
  </section>
  <section class="stats"><div><strong>{anime_count}</strong><span>Anime</span></div><div><strong>{manga_count}</strong><span>Manga</span></div><div><strong>{watch_hours}</strong><span>Hours watched</span></div><div><strong>{followers}</strong><span>Followers</span></div></section>
  <section><h2>My anime library</h2>{watchlist}</section>
  <section><h2>On my bookshelf</h2>{manga_list}{novel_list}</section>
  <section><h2>Recent activity</h2>{recent_activity}</section>
  <footer>{social_links}<span>Made with Tatakai</span></footer>
</main>`;
export const STARTER_PROFILE_CSS = `:root { --bg: #10111a; --surface: #1a1d2b; --ink: #f0eef8; --muted: #aaa7be; --accent: #c4b5fd; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.65 system-ui, sans-serif; }
.profile { max-width: 1100px; margin: auto; padding: 28px; }
.topbar, nav, .actions, .badges, footer { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.topbar { justify-content: space-between; padding-bottom: 24px; border-bottom: 1px solid #ffffff18; }
a { color: var(--accent); text-decoration: none; }
button { border: 1px solid #ffffff26; background: var(--surface); color: var(--ink); padding: 10px 16px; border-radius: 10px; font: inherit; cursor: pointer; }
button:hover { border-color: var(--accent); }
a:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }
.hero { display: grid; grid-template-columns: 140px 1fr; gap: 32px; align-items: center; padding: 52px 0; }
.portrait { position: relative; width: 140px; height: 140px; }.avatar { position: absolute; inset: 0; z-index: 1; width: 100%; height: 100%; border-radius: 28px; object-fit: cover; background: var(--surface); }.avatar-fallback { position: absolute; inset: 0; display: grid; place-items: center; border-radius: 28px; background: var(--surface); color: var(--accent); font-size: 42px; font-weight: 700; }
h1 { font-size: clamp(32px, 5vw, 56px); line-height: 1.1; letter-spacing: -0.035em; margin: 8px 0 16px; }
.handle, .bio, .status, .tatakai-empty { color: var(--muted); }
.bio { max-width: 65ch; white-space: pre-line; }
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; padding: 24px 0; border-top: 1px solid #ffffff18; border-bottom: 1px solid #ffffff18; }
.stats strong, .stats span { display: block; }.stats strong { font-size: 28px; color: var(--accent); }.stats span { color: var(--muted); font-size: 12px; }
section h2 { font-size: 21px; margin: 36px 0 16px; }
.tatakai-media-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(145px, 1fr)); gap: 16px; }
.tatakai-media-card { display: grid; gap: 8px; color: var(--ink); }.tatakai-media-card img { width: 100%; aspect-ratio: 2 / 3; object-fit: cover; border-radius: 12px; }.tatakai-media-card small { color: var(--muted); }
.tatakai-badge { height: 28px; width: 28px; object-fit: contain; }footer { justify-content: space-between; margin-top: 48px; padding-top: 24px; color: var(--muted); font-size: 12px; border-top: 1px solid #ffffff18; }
@media (max-width: 600px) { .profile { padding: 20px; }.hero { grid-template-columns: 1fr; gap: 20px; padding: 32px 0; }.portrait { width: 100px; height: 100px; }.avatar, .avatar-fallback { border-radius: 20px; }.stats { grid-template-columns: repeat(2, 1fr); } }
`;
export const DEFAULT_CUSTOM_THEME: CustomProfileTheme = { version: 1, theme_name: 'My custom theme', enabled: false, html: STARTER_PROFILE_HTML, css: STARTER_PROFILE_CSS };
export const escapeProfileText = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function safeTemplateImage(value: unknown): string {
  if (typeof value !== 'string') return '';
  if (/^\/assets\/[a-zA-Z0-9_./-]+$/.test(value) && !value.includes('..')) return value;
  if (!isAllowedImageUrl(value)) return '';
  try { const url = new URL(value); return !url.username && !url.password ? url.href : ''; } catch { return ''; }
}
/** Image tags work in CSS url("{banner}") too, without allowing CSS syntax injection. */
export function renderProfileTemplateCss(css: string, data: ProfileTemplateData) {
  return css.replace(/\{(avatar|banner)\}/g, (_, key: string) => safeTemplateImage(key === 'avatar' ? data.owner.avatar_url : data.owner.banner_url).replace(/["'()\\\s]/g, char => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`));
}
export function safeTemplateLink(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048) return '';
  if (/^\/(?!\/)[a-zA-Z0-9_@%./-]*$/.test(value) && !value.includes('..')) return value;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}
/** Full CSS runs only in the opaque iframe; imports, remote fonts and unsafe fetches are removed. */
export function compileCustomThemeCss(input: string, reducedMotion = false) {
  const warnings = new Set<string>();
  if (input.length > 20000) return { css: '', warnings: ['CSS must be 20,000 characters or fewer.'] };
  try {
    const root = parse(input);
    root.walkAtRules(rule => {
      if (!['media', 'supports', 'keyframes', '-webkit-keyframes', 'container'].includes(rule.name.toLowerCase())) { warnings.add(`@${rule.name} is not supported.`); rule.remove(); }
    });
    root.walkDecls(decl => {
      const prop = decl.prop.toLowerCase();
      let unsafe = /\\|expression\s*\(|image-set\s*\(|paint\s*\(|-moz-binding|behavior/i.test(decl.value) || ['behavior', '-moz-binding'].includes(prop);
      for (const match of decl.value.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) if (!safeTemplateImage(match[2].trim())) unsafe = true;
      if (unsafe || (reducedMotion && /^(animation|transition|scroll-behavior)/.test(prop))) { if (unsafe) warnings.add(`Unsafe ${decl.prop} value was removed.`); decl.remove(); }
    });
    return { css: root.toString(), warnings: [...warnings] };
  } catch { return { css: '', warnings: ['CSS could not be parsed. Check the braces and declarations.'] }; }
}

export function renderProfileTemplate(html: string, data: ProfileTemplateData, presence?: SocialPresence, followingCount = 0): { html: string; unknown: string[] } {
  const e = escapeProfileText;
  const count = (allowed: boolean, value: number | undefined) => allowed ? value == null ? '—' : String(value) : 'Private';
  const button = (action: string, label: string) => `<button type="button" data-profile-action="${action}">${e(label)}</button>`;
  const media = (items: ThemeMediaItem[], allowed = true) => !allowed ? '<p class="tatakai-empty">This collection is private.</p>' : data.summaryOnly ? `<p class="tatakai-empty"><a href="/@${e(encodeURIComponent(data.owner.username || ''))}">Open the full profile to view this collection.</a></p>` : !items.length ? '<p class="tatakai-empty">Nothing here yet.</p>' : `<div class="tatakai-media-list">${items.slice(0, 12).map(item => {
    const image = safeTemplateImage(item.image), href = safeTemplateLink(item.href);
    return `<a class="tatakai-media-card" href="${e(href || '#')}">${image ? `<img src="${e(image)}" alt="" loading="lazy">` : ''}<span>${e(item.title)}</span>${item.detail ? `<small>${e(item.detail)}</small>` : ''}</a>`;
  }).join('')}</div>`;
  const values: Record<string, string> = {
    name: e(data.owner.display_name || data.owner.username || 'Member'), initials: e((data.owner.display_name || data.owner.username || 'M').trim().split(/\s+/).slice(0, 2).map(word => word[0] || '').join('').toUpperCase()), username: e(data.owner.username || 'member'), bio: e(data.owner.bio),
    avatar: e(safeTemplateImage(data.owner.avatar_url)), banner: e(safeTemplateImage(data.owner.banner_url)), profile_url: e(`/@${encodeURIComponent(data.owner.username || '')}`),
    followers: e(data.followers), following: e(followingCount), anime_count: count(data.canViewLibrary, data.stats.anime), manga_count: count(data.canViewLibrary, data.stats.manga),
    novel_count: count(data.isOwner && data.canViewLibrary, data.stats.novels ?? data.sections?.novels.length), episodes: count(data.canViewHistory, data.stats.episodes), watch_hours: count(data.canViewHistory, data.stats.hours),
    completed: count(data.canViewLibrary, data.stats.completed), streak: count(data.canViewHistory, data.stats.streak), longest_streak: count(data.canViewHistory, data.stats.longestStreak),
    status: e(presence?.online ? 'Online' : presence?.last_seen ? `Last online ${new Date(presence.last_seen).toLocaleDateString()}` : ''),
    activity: e(presence?.online && presence.title ? `${presence.kind === 'watching' ? 'Watching' : 'Reading'} ${presence.title}` : ''),
    badges: data.badges.slice(0, 12).map(badge => safeTemplateImage(badge.image) ? `<img class="tatakai-badge" src="${e(safeTemplateImage(badge.image))}" alt="${e(badge.label)}" title="${e(badge.label)}">` : '').join(''),
    watchlist: media(data.sections?.watchlist ?? data.library, data.canViewLibrary), manga_list: media(data.sections?.manga ?? [], data.canViewLibrary),
    novel_list: media(data.sections?.novels ?? [], data.isOwner && data.canViewLibrary), recent_activity: media(data.activity, data.canViewHistory), reading_history: media(data.sections?.readingHistory ?? [], data.canViewHistory),
    favorites: media(data.favorites), social_links: data.links.map(link => { const href = safeTemplateLink(link.url); return href ? `<a href="${e(href)}" target="_blank" rel="noopener noreferrer">${e(link.label)}</a>` : ''; }).join(' '),
    follow_button: data.isOwner ? '' : button('follow', data.following ? 'Following' : 'Follow'), message_button: data.isOwner ? '' : button('message', 'Message'),
    edit_button: data.isOwner ? button('edit', 'Edit theme') : '', back_button: button('back', 'Back'), default_button: button('default', 'Original profile'),
  };
  const unknown = new Set<string>();
  const rendered = html.slice(0, 20000).replace(/\{([a-z_]+)\}/g, (tag, key: string) => { if (Object.prototype.hasOwnProperty.call(values, key)) return values[key]; unknown.add(tag); return e(tag); });
  return { html: rendered.slice(0, 250000), unknown: [...unknown] };
}
