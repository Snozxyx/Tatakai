import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { normalizeSidebarRoute, openSidebarLink, sidebarQuickPeek } from '../src/lib/sidebarLinks';
import { closeMediaQuickPeek, getMediaQuickPeekSnapshot } from '../src/components/media/quickPeekStore';
import { DEFAULT_SIDEBAR, normalizeSidebarPreferences, sidebarRailItems, sidebarOverflowItems } from '../src/lib/sidebarCustomization';

test('internal routes and canonical Tatakai links normalize across browser and native origins', () => {
  expect(normalizeSidebarRoute('/community?tab=foryou#feed', 'file:///app/index.html')).toBe('/community?tab=foryou#feed');
  for (const host of ['tatakai.me', 'app.tatakai.me', 'www.tatakai.me']) expect(normalizeSidebarRoute(`https://${host}/anime/anilist%3A21?q=mine#details`, 'http://localhost:8090/')).toBe('/anime/anilist%3A21?q=mine#details');
  expect(normalizeSidebarRoute('app://tatakai.me/index.html#/novel/321?foo=bar', 'app://tatakai.me/index.html')).toBe('/novel/321?foo=bar');
  for (const value of ['https://external.example/anime/21', '//external.example/anime/21', 'javascript:alert(1)', '/anime/%ZZ']) expect(normalizeSidebarRoute(value)).toBeNull();
});
test('quick view keeps decoded media identity and the full app route, while ordinary links navigate', () => {
  const paths: string[] = [];
  openSidebarLink({ path: '/anime/anilist%3A21?q=mine#details', name: 'Favorite', mode: 'quick-view' }, path => paths.push(path));
  expect(paths).toEqual([]);
  expect(getMediaQuickPeekSnapshot()).toMatchObject({ id: 'anilist:21', kind: 'anime', routeTo: '/anime/anilist%3A21?q=mine#details', enrichIdentity: true });
  closeMediaQuickPeek();
  for (const route of ['/manga/discover', '/novel/genre', '/manga/read/21', '/community']) expect(sidebarQuickPeek(route, 'Shortcut')).toBeNull();
  openSidebarLink({ path: '/community?tab=foryou', mode: 'page' }, path => paths.push(path));
  expect(paths).toEqual(['/community?tab=foryou']);
  expect(getMediaQuickPeekSnapshot()).toBeNull();
});
test('custom shortcut IDs share ordering and visibility without replacing pinned system actions', () => {
  const preference = normalizeSidebarPreferences({ ...DEFAULT_SIDEBAR, order: ['link:fixture', ...DEFAULT_SIDEBAR.order], links: { 'link:fixture': { id: 'link:fixture', name: 'My novel', path: 'https://tatakai.me/novel/321', mode: 'quick-view' } } })!;
  expect(sidebarRailItems(preference, true)[0]).toMatchObject({ id: 'link:fixture', path: '/novel/321', mode: 'quick-view' });
  expect(sidebarOverflowItems({ ...preference, hidden: [...preference.hidden, 'link:fixture'] }, true).some(item => item.id === 'link:fixture')).toBe(true);
  expect(preference.order).not.toContain('settings' as any);
});
test('shortcut create/delete remains a draft until Save and Cancel restores stored links', () => {
  const result = spawnSync(process.execPath, ['tests/fixtures/sidebar-links.tsx'], { cwd: process.cwd(), encoding: 'utf8', timeout: 20000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
  expect(result.stdout).toContain('SIDEBAR_LINK_DRAFT_OK');
}, 25000);
