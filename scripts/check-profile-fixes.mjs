import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Isolated UI fixtures: no authenticated account or production writes.
const base = process.env.PROFILE_TEST_URL || 'http://127.0.0.1:8090';
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  window.fixtureProfile = { display_name: 'Fixture', username: 'fixture', is_public: true };
  window.fixtureCalls = [];
  window.electron = {
    setFullscreen: enabled => {
      window.fixtureCalls.push(enabled);
      return new Promise(resolve => { window.finishFullscreen = () => resolve({ success: true }); });
    },
    onFullscreenChanged: callback => { window.nativeFullscreen = callback; return () => {}; },
  };
});
await page.route('**/src/contexts/AuthContext.tsx', route => route.fulfill({ contentType: 'text/javascript', body: `
export const useAuth = () => ({ user: { id: '11111111-1111-1111-1111-111111111111' }, profile: window.fixtureProfile, refreshProfile: async()=>{} });
export const AuthProvider = ({children}) => children;
` }));
await page.route('**/src/hooks/user/useProfileFeatures.ts', route => route.fulfill({ contentType: 'text/javascript', body: `
const empty = () => ({data: [], isLoading: false, refetch: async()=>{}});
export const useRandomProfileImages = empty, useRandomBannerImages = empty, useAniListCharacterSearch = empty,
useRandomAvatarGifs = empty, useAniListMediaSearch = empty, useWaifuLandscapeBanners = empty;
const update = () => ({ mutateAsync: async value => { window.appliedImage = value; }, isPending: false });
export const useUpdateProfileAvatar = update, useUpdateProfileBanner = update, useUpdateProfileSettings = update;
` }));
await page.route('**/__profile-fixes', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>(type)=>type; window.__vite_plugin_react_preamble_installed__=true; import '/src/index.css';</script></head><body><div id="fixture"></div></body></html>` }));
await page.route('**/__frame', route => route.fulfill({ contentType: 'text/html', body: '<p>Local embed fixture</p>' }));
let uploadedPath;
await page.route('**/storage/v1/object/user-media/**', route => {
  uploadedPath = new URL(route.request().url()).pathname;
  return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ Key: uploadedPath }) });
});
try {
  await page.goto(`${base}/__profile-fixes`);
  await page.evaluate(async () => {
    const source = await (await fetch('/src/components/profile/AvatarPickerSheet.tsx')).text();
    const version = source.match(/react\.js\?v=([^"']+)/)[1];
    const { default: React } = await import(`/node_modules/.vite/deps/react.js?v=${version}`);
    const { default: { createRoot } } = await import(`/node_modules/.vite/deps/react-dom_client.js?v=${version}`);
    const { Dialog, DialogContent, DialogTitle } = await import('/src/components/ui/dialog.tsx');
    const { ProfileSettingsSheet } = await import('/src/components/profile/ProfileSettingsSheet.tsx');
    const { AvatarPickerSheet } = await import('/src/components/profile/AvatarPickerSheet.tsx');
    const { HistoryTab } = await import('/src/components/profile/tabs/HistoryTab.tsx');
    const { useVideoFullscreen } = await import('/src/components/video/hooks/useVideoFullscreen.ts');
    const { EmbedPlayer } = await import('/src/components/video/EmbedPlayer.tsx');
    const h = React.createElement;
    window.fixtureRoot = createRoot(document.getElementById('fixture'));
    window.mountSettings = () => window.fixtureRoot.render(h(Dialog, { open: true },
      h(DialogContent, { overlayClassName: 'z-[70]', className: 'z-[80]' },
        h(DialogTitle, null, 'Settings fixture'),
        h(ProfileSettingsSheet, { overlayClassName: 'z-[90]', contentClassName: 'z-[100]', trigger: h('button', null, 'Edit Profile') }),
        ...['avatar', 'banner'].map(type => h(AvatarPickerSheet, { key: type, type, overlayClassName: 'z-[90]', contentClassName: 'z-[100]', trigger: h('button', null, `Edit ${type}`) })))));
    window.mountHistory = () => window.fixtureRoot.render(h(HistoryTab, {
      history: Array.from({ length: 1181 }, (_, i) => ({ id: `${i}`, episode_id: `ep-${i+1}`, anime_id: 'one-piece', anime_name: 'One Piece', episode_number: i+1, completed: true, watched_at: '2026-10-01T00:00:00Z' })),
      mangaHistoryEntries: [], onNavigate: () => {}, formatDate: () => 'Imported',
    }));
    function Direct() {
      const ref = React.useRef(null);
      const { isFullscreen, toggleFullscreen } = useVideoFullscreen({ containerRef: ref, isMobile: false });
      return h('div', { ref, className: 'video-player-container', style: { height: 300 } },
        h('button', { onClick: toggleFullscreen }, isFullscreen ? 'Exit direct fullscreen' : 'Enter direct fullscreen'));
    }
    window.mountPlayer = embed => window.fixtureRoot.render(embed ? h(EmbedPlayer, { url: location.origin + '/__frame' }) : h(Direct));
    window.mountSettings();
  });
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.getByRole('button', { name: 'Edit Profile', exact: true }).click();
    const sheet = page.locator('[data-sheet-side]');
    assert.equal(await sheet.evaluate(node => getComputedStyle(node).zIndex), '100');
    await sheet.getByRole('textbox').first().fill('Editable fixture');
    await page.screenshot({ path: `.artifacts/profile-settings-${viewport.width}.png` });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Edit Profile', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Edit Profile', exact: true }).evaluate(node => node === document.activeElement), true);
    for (const type of ['avatar', 'banner']) {
      await page.getByRole('button', { name: `Edit ${type}`, exact: true }).click();
      assert.equal(await sheet.evaluate(node => getComputedStyle(node).zIndex), '100');
      await sheet.getByRole('tab', { name: 'Upload', exact: true }).click();
      await page.locator('input[type=file]').setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6m8AAAAASUVORK5CYII=', 'base64') });
      await page.waitForFunction(() => !!document.querySelector('[data-sheet-side] img[src*="user-media"]'));
      assert.ok(uploadedPath.includes(`/11111111-1111-1111-1111-111111111111/${type}/`), uploadedPath);
      await sheet.getByRole('button', { name: /Apply/ }).click();
      await page.getByRole('button', { name: `Edit ${type}`, exact: true }).waitFor();
      assert.ok(await page.evaluate(() => window.appliedImage.includes('/user-media/')));
    }
  }
  await page.evaluate(() => window.mountHistory());
  await page.getByText('1181 episodes watched', { exact: true }).waitFor();
  assert.equal(await page.locator('[class*="divide-y"] > div').first().innerText().then(text => text.includes('Episode 1181')), true);
  for (const embed of [false, true]) {
    await page.evaluate(embed => window.mountPlayer(embed), embed);
    const button = embed ? page.getByRole('button', { name: 'Fullscreen', exact: true }) : page.getByRole('button', { name: 'Enter direct fullscreen' });
    await button.click();
    await page.locator('.is-player-fullscreen').waitFor();
    await page.evaluate(() => { document.dispatchEvent(new Event('fullscreenchange')); window.nativeFullscreen(false); });
    assert.equal(await page.locator('.is-player-fullscreen').count(), 1);
    await page.evaluate(() => window.finishFullscreen());
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.is-player-fullscreen'));
    await page.evaluate(() => window.finishFullscreen());
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('app-fullscreen')), false);
  }
  await page.evaluate(() => { delete window.electron; window.mountPlayer(false); });
  await page.getByRole('button', { name: 'Enter direct fullscreen' }).click();
  await page.waitForFunction(() => !!document.fullscreenElement);
  await page.getByRole('button', { name: 'Exit direct fullscreen' }).click();
  await page.waitForFunction(() => !document.fullscreenElement);
  // Import the real hooks too: fixture stubs must not hide module syntax errors.
  await page.unroute('**/src/hooks/user/useProfileFeatures.ts');
  await page.evaluate(async () => {
    const hooks = await import('/src/hooks/user/useProfileFeatures.ts?profile-smoke=1');
    if (typeof hooks.usePublicWatchHistory !== 'function') throw new Error('Profile hook module failed to load');
  });
  assert.deepEqual(errors, []);
  console.log('PASS: Settings sheets above parent, focus restoration, avatar/banner upload and Apply, 1181-row History UI, first-click direct/embed desktop fullscreen, Escape, browser fullscreen, real profile-hook import.');
} finally { await browser.close(); }
