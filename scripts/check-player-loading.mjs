import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.PLAYER_TEST_URL || 'http://127.0.0.1:8090';
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
const failures = [];

async function checkPlayer(componentName) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__player-loading', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><head><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>(type)=>type; window.__vite_plugin_react_preamble_installed__=true; import '/src/index.css';</script></head><body><div id="root"></div></body></html>`,
  }));
  await page.route('**/api/media/probe**', route => route.fulfill({ contentType: 'application/json', body: '{}' }));
  try {
    await page.goto(`${base}/__player-loading`);
    await page.evaluate(async componentName => {
      // Control media events independently of browser buffering to reproduce a
      // resumed stream that never sends another `playing` event.
      const states = new WeakMap();
      const state = video => {
        if (!states.has(video)) states.set(video, {
          currentTime: 0, duration: 600, paused: true, seeking: false,
          ended: false, readyState: 0, src: '',
        });
        return states.get(video);
      };
      for (const key of ['currentTime', 'duration', 'paused', 'seeking', 'ended', 'readyState', 'src']) {
        Object.defineProperty(HTMLMediaElement.prototype, key, {
          configurable: true,
          get() { return state(this)[key]; },
          set(value) { state(this)[key] = value; },
        });
      }
      Object.defineProperty(HTMLMediaElement.prototype, 'currentSrc', {
        configurable: true, get() { return state(this).src; },
      });
      HTMLMediaElement.prototype.load = function () {
        Object.assign(state(this), { currentTime: 0, paused: true, seeking: false, ended: false, readyState: 0 });
        this.dispatchEvent(new Event('emptied'));
        this.dispatchEvent(new Event('loadstart'));
      };
      HTMLMediaElement.prototype.play = function () {
        state(this).paused = false;
        this.dispatchEvent(new Event('play'));
        return Promise.resolve();
      };
      HTMLMediaElement.prototype.pause = function () {
        if (state(this).paused) return;
        state(this).paused = true;
        this.dispatchEvent(new Event('pause'));
      };
      window.sendPlaybackEvent = (event, patch = {}) => {
        const video = document.querySelector('video');
        Object.assign(state(video), patch);
        video.dispatchEvent(new Event(event));
      };

      localStorage.setItem('video-player-settings', JSON.stringify({
        autoplay: false, autoSkipIntro: false, subtitleLanguage: 'off', playerEngine: 'builtin',
      }));
      const modulePath = `/src/components/video/${componentName}.tsx`;
      const source = await (await fetch(modulePath)).text();
      const reactPath = source.match(/["']([^"']*\/react\.js\?v=[^"']*)["']/)[1];
      const depsBase = reactPath.slice(0, reactPath.lastIndexOf('/'));
      const version = new URL(reactPath, location.origin).searchParams.get('v');
      const { default: React } = await import(reactPath);
      const { default: { createRoot } } = await import(`${depsBase}/react-dom_client.js?v=${version}`);
      const { BrowserRouter } = await import(`${depsBase}/react-router-dom.js?v=${version}`);
      const { QueryClient, QueryClientProvider } = await import(`${depsBase}/@tanstack_react-query.js?v=${version}`);
      const settingsSource = await (await fetch('/src/hooks/media/useVideoSettings.ts')).text();
      const authPath = settingsSource.match(/["'](\/src\/contexts\/AuthContext\.tsx[^"']*)["']/)[1];
      const { AuthProvider } = await import(authPath);
      const { sourceAdapterRegistry } = await import('/src/core/player/SourceAdapterRegistry.ts');
      sourceAdapterRegistry.register('offline', {
        async load({ source, videoElement }) { videoElement.src = source.url; videoElement.load(); },
        async unload() {},
      });
      const Player = (await import(modulePath))[componentName];
      const root = createRoot(document.getElementById('root'));
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      window.playbackErrors = [];
      const onError = error => window.playbackErrors.push(error);
      window.renderLoadingPlayer = (server, isLoading) => root.render(React.createElement(BrowserRouter, null,
        React.createElement(QueryClientProvider, { client }, React.createElement(AuthProvider, null,
          React.createElement(Player, {
            sources: server ? [{ url: `${location.origin}/__${server}.mp4`, isM3U8: false }] : [],
            isOffline: true, isLoading, serverName: server || 'Pending', onError,
          })))));
      window.renderLoadingPlayer(null, true);
    }, componentName);
    await page.locator('video').waitFor({ state: 'attached' });

    const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const send = async (event, patch) => {
      await page.evaluate(({ event, patch }) => window.sendPlaybackEvent(event, patch), { event, patch });
      await settle();
    };
    const checkSpinner = async (expected, label) => {
      await settle();
      const actual = await page.locator('.animate-spin:visible').count() > 0;
      if (actual !== expected) failures.push(`${componentName}: ${label} (spinner ${actual ? 'visible' : 'hidden'})`);
    };
    const switchServer = async (server, loading = false) => {
      await page.evaluate(({ server, loading }) => window.renderLoadingPlayer(server, loading), { server, loading });
      await page.waitForFunction(server => document.querySelector('video').src.includes(`__${server}.mp4`), server);
      await settle();
    };

    await checkSpinner(true, 'unresolved sources show loading');
    await switchServer('server-a');
    await send('loadedmetadata', { readyState: 3 });
    await send('play', { paused: false });
    await send('playing');
    await checkSpinner(false, 'normal playback clears loading');

    await send('waiting', { readyState: 2 });
    await checkSpinner(true, 'a genuine stall shows loading while playback is requested');
    await send('timeupdate');
    await checkSpinner(true, 'unchanged playback time does not clear a stall');
    await send('timeupdate', { currentTime: 60, seeking: true, readyState: 3 });
    await send('timeupdate', { seeking: false });
    await checkSpinner(true, 'a seek does not count as resumed playback');
    await send('timeupdate', { currentTime: 60.25 });
    await checkSpinner(false, 'advancing playback clears loading without another playing event');

    await page.evaluate(() => window.renderLoadingPlayer('server-a', true));
    await checkSpinner(false, 'a stale source-loading flag does not cover active playback');
    await switchServer('server-b', true);
    await checkSpinner(true, 'a new server resets the previous playback state');
    await send('playing', { paused: false, readyState: 3 });
    await checkSpinner(false, 'playing clears loading when the play event was missed');

    await switchServer('server-c');
    await send('play', { paused: false });
    await send('waiting', { readyState: 2 });
    await send('pause', { paused: true });
    await checkSpinner(false, 'pausing clears the buffering spinner');
    await send('waiting', { paused: false });
    await send('canplay', { paused: true, readyState: 3 });
    await checkSpinner(false, 'a ready video clears loading with autoplay off');

    assert.deepEqual(errors, [], `${componentName} must not raise browser errors`);
    assert.deepEqual(await page.evaluate(() => window.playbackErrors), [], `${componentName} must not trigger server failover`);
    console.log(`${componentName}: completed loading, progress, seeking, server switching and paused readiness checks.`);
  } finally {
    await page.close();
  }
}

try {
  for (const componentName of ['VideoPlayer', 'MobileVideoPlayer']) await checkPlayer(componentName);
  assert.deepEqual(failures, [], 'Player loading regression checks failed');
  console.log('Player loading regression checks passed in Chromium.');
} finally {
  await browser.close();
}
