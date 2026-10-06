/**
 * bootstrap.ts — one-time native setup for the Capacitor mobile shell.
 *
 * Called from `main.tsx` before React renders. No-ops off Capacitor, so it is
 * always safe to invoke. Keeps all mobile-only plugin wiring in one place
 * instead of scattered `useEffect`s.
 */

import { isCapacitor, isAndroid } from '@/lib/platform/platform';

let started = false;

export async function bootstrapMobile(): Promise<void> {
  if (started || !isCapacitor()) return;
  started = true;

  // Tag the document so mobile-only CSS (safe-area insets, input zoom guards)
  // applies. Mirrors the class MainLayout also toggles, set early so first paint
  // is correct.
  try {
    document.documentElement.classList.add('capacitor-native');
    if (isAndroid()) document.documentElement.classList.add('capacitor-android');
    else document.documentElement.classList.add('capacitor-ios');
  } catch {
    /* non-fatal */
  }

  // Install the in-WebView extension dispatch surface early so the first
  // source/manga resolution can find it. Bundles register into it separately.
  try {
    // Start the native loopback media proxy first (anime HLS/MP4 + subtitles +
    // manga images + download assets, desktop LocalProxyServer parity). When
    // running, `registerMobileSource` returns `http://127.0.0.1:<port>/stream/`
    // URLs for plain `<video>` / `<img>` loads; otherwise the in-memory
    // `mobile-proxy://` + CapacitorHttp path is used. Never blocks render.
    try {
      const [{ ensureNativeProxy }, { setNativeProxyBaseUrl }] = await Promise.all([
        import('@/core/mobile/localProxyNative'),
        import('@/core/extensions/mobile/mobileProxy'),
      ]);
      const base = await ensureNativeProxy();
      if (base) setNativeProxyBaseUrl(base);
    } catch {
      /* JS fallback stays */
    }

    // The torrent runtime must be present before React's first interaction
    // frame, otherwise capability-gated Android torrent controls can race it.
    const { installMobileTorrentBridge } = await import(
      '@/core/torrent/mobile/mobileTorrentBridge'
    );
    installMobileTorrentBridge();

    const { installNativePlayerBridge } = await import(
      '@/core/player/mobile/nativePlayerBridge'
    );
    installNativePlayerBridge();

    const { installMobileExtensionHost } = await import(
      '@/core/extensions/mobile/mobileExtensionHost'
    );
    installMobileExtensionHost();
    // Fire extension init in the background — do NOT await it before React
    // renders. hydrateMobileExtensions() reads Dexie (IndexedDB) which can be
    // slow on first open / after a schema migration, and blocking createRoot()
    // on it produces a black screen until the DB read finishes.
    void import('@/core/extensions/mobile/mobileExtensionInstaller').then(
      ({ initMobileExtensions }) => initMobileExtensions(),
    );
  } catch {
    /* non-fatal */
  }

  // If the native loopback service died while the app was backgrounded
  // (OS process recycle), re-establish it on return so playback keeps the
  // desktop-parity fast path instead of silently dropping to the JS bridge.
  // Never blocks render; failures keep the existing fallback.
  try {
    const { App } = await import('@capacitor/app');
    await App.addListener('resume', () => {
      void import('@/core/mobile/localProxyNative').then(({ reensureNativeProxy }) =>
        reensureNativeProxy(),
      ).catch(() => {});
    });
  } catch {
    /* App plugin missing / web — ignore */
  }

  await Promise.allSettled([
    initStatusBar(),
    initKeyboard(),
    hideSplash(),
  ]);
}

async function initStatusBar(): Promise<void> {
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    // Capacitor's naming follows the icon colour: `Light` means light icons.
    // The app chrome is #09090b, so `Dark` would deliberately produce the
    // light status bar / dark icons combination we do not want.
    await StatusBar.setStyle({ style: Style.Light });
    if (isAndroid()) {
      await StatusBar.setBackgroundColor({ color: '#09090b' });
    }
    // Do NOT overlay the WebView — the layout reserves the inset via safe-area
    // CSS vars, and overlaying would double-count it.
    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch {
    /* plugin missing / web — ignore */
  }
}

async function initKeyboard(): Promise<void> {
  try {
    const { Keyboard, KeyboardResize } = await import('@capacitor/keyboard');
    await Keyboard.setResizeMode({ mode: KeyboardResize.Body });
  } catch {
    /* ignore */
  }
}

async function hideSplash(): Promise<void> {
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    // launchAutoHide handles the common case; hide explicitly once the bundle
    // has evaluated so a slow first paint doesn't flash the shell background.
    await SplashScreen.hide();
  } catch {
    /* ignore */
  }
}
