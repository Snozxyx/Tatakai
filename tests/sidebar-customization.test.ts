import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { DEFAULT_SIDEBAR, normalizeSidebarPreferences, sidebarRailItems, sidebarOverflowItems } from '../src/lib/sidebarCustomization';

test('default sidebar stays unchanged and native routes remain capability-aware', () => {
  expect(normalizeSidebarPreferences(DEFAULT_SIDEBAR)).toBeNull();
  expect(sidebarRailItems(null, false).map(item => item.id)).toEqual(['home', 'search', 'manga', 'novels', 'community', 'sources']);
  expect(sidebarRailItems(null, true).map(item => item.id)).toContain('downloads');
  expect(sidebarOverflowItems(null, false).map(item => item.id)).toEqual(['trending', 'calendar', 'favorites']);
});
test('unknown/duplicate IDs cannot replace required system access, and hidden shortcuts stay reachable', () => {
  const preference = normalizeSidebarPreferences({ version: 1, order: ['novels', 'settings', 'home', 'home'], hidden: ['home', 'settings', 'downloads'] })!;
  expect(preference.order).not.toContain('settings' as any);
  expect(preference.order.filter(id => id === 'home')).toHaveLength(1);
  expect(sidebarRailItems(preference, true).map(item => item.id)).not.toContain('home');
  expect(sidebarOverflowItems(preference, true).map(item => item.id)).toContain('home');
  expect(sidebarOverflowItems(preference, true).map(item => item.id)).toContain('downloads');
});
test('live sidebar preview drafts, Cancel and Reset are local and Save is explicit', () => {
  const result = spawnSync(process.execPath, ['tests/fixtures/sidebar-customization.tsx'], { cwd: process.cwd(), encoding: 'utf8', timeout: 20000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
  expect(result.stdout).toContain('SIDEBAR_PREVIEW_SAVE_CANCEL_OK');
}, 25000);
test('theme and motion preferences stay local without account hydration or writes', () => {
  const result = spawnSync(process.execPath, ['tests/fixtures/local-theme-store.tsx'], { cwd: process.cwd(), encoding: 'utf8', timeout: 20000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
  expect(result.stdout).toContain('LOCAL_THEME_STORE_OK');
}, 25000);
