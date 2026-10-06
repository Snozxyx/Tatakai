/**
 * platform.ts — single source of truth for runtime platform detection.
 *
 * The app runs in four shells with materially different capabilities:
 *   - web       — plain browser, http(s) origin
 *   - electron  — desktop, Node main process behind `window.electron`
 *   - android   — Capacitor native, in-WebView, native plugins
 *   - ios       — Capacitor native, in-WebView, native plugins (reduced feature set)
 *
 * Feature code should branch on the *capabilities* below, never on ad-hoc
 * `window.electron` / `Capacitor.isNativePlatform()` checks scattered across the
 * codebase. The legacy `useIsNativeApp` / `useIsDesktopApp` / `useIsMobileApp`
 * hooks now delegate here so both styles agree.
 */

import { Capacitor } from '@capacitor/core';
import { isP2PDisabled } from '@/lib/torrent/p2pPolicy';

function readForceNative(): boolean {
  const v = String(import.meta.env.VITE_FORCE_NATIVE_APP || '').toLowerCase();
  return v === 'true' || v === '1';
}

/** Electron desktop (also covers the legacy Tauri probes). */
export function isElectron(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as any;
  return (
    !!w.electron ||
    !!w.__TAURI__ ||
    !!w.__TAURI_INTERNALS__ ||
    !!w.invoke ||
    !!w.tauri
  );
}

/** Capacitor native shell (Android or iOS). */
export function isCapacitor(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function isAndroid(): boolean {
  try {
    return isCapacitor() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

export function isIOS(): boolean {
  try {
    return isCapacitor() && Capacitor.getPlatform() === 'ios';
  } catch {
    return false;
  }
}

/** Any packaged shell (Electron OR Capacitor). Mirrors the old `useIsNativeApp`. */
export function isNative(): boolean {
  return readForceNative() || isElectron() || isCapacitor();
}

/** Desktop only (Electron/Tauri). Mirrors the old `useIsDesktopApp`. */
export function isDesktop(): boolean {
  return isElectron();
}

/**
 * macOS host (Electron `darwin` platform, or a Mac browser UA).
 * Used to slim the custom TitleBar: macOS already paints native traffic
 * lights via `hiddenInset`, so a solid 32px bar only duplicates chrome and
 * eats menu-bar-adjacent space.
 */
export function isMacOS(): boolean {
  if (typeof window !== 'undefined') {
    const w = window as any;
    if (w.electron?.platform === 'darwin') return true;
  }
  if (typeof navigator !== 'undefined') {
    const platform = (navigator as any).platform || '';
    const ua = navigator.userAgent || '';
    if (/Mac/i.test(platform)) return true;
    if (/Macintosh|Mac OS X/i.test(ua)) return true;
  }
  return false;
}

/** Capacitor mobile only. Mirrors the old `useIsMobileApp`. */
export function isMobileNative(): boolean {
  return isCapacitor();
}

// ── Capability gates ──────────────────────────────────────────────────────────
// Prefer these over shell checks: a capability can be served by more than one
// shell (e.g. the extension runtime is a local HTTP host on desktop but an
// in-WebView runtime on mobile), and this keeps the branch points honest.

/**
 * True when the renderer runs from a real http(s) origin (web dev, tatakai.me).
 * When false (Electron file://, Capacitor capacitor:// / https://localhost),
 * `window.location.origin` is NOT a usable API base — resolve an explicit
 * backend origin instead. See backendOrigin.ts.
 */
export function isHttpOrigin(): boolean {
  if (typeof window === 'undefined') return false;
  return /^https?:$/i.test(window.location.protocol);
}

/** Downloads: Electron uses `window.electron`; mobile uses the Capacitor downloader. */
export function hasDownloadService(): boolean {
  return isDesktop() || isMobileNative();
}

/**
 * Torrent: Electron (WebTorrent) always; Android only once the native torrent
 * plugin is actually registered (`window.tatakaiRuntime.getTorrentStreamUrl`,
 * installed by the mobile torrent bridge). iOS: never. Gating on plugin
 * presence — not just `isAndroid()` — keeps torrent UI hidden on an Android
 * build that hasn't bundled the native plugin yet, instead of offering an
 * action that would fail.
 *
 * The user's P2P kill-switch (Settings → Debrid → "Disable P2P torrents")
 * forces this to false: no swarm session can start anywhere, while debrid
 * resolution (server-side, no swarm) keeps working.
 */
export function hasTorrentService(): boolean {
  try {
    if (isP2PDisabled()) return false;
  } catch {
    /* policy unreadable — fall through to capability detection */
  }
  if (isDesktop()) return true;
  if (isAndroid() && typeof window !== 'undefined') {
    // `bootstrapMobile()` installs the JS adapters just after the native bridge
    // becomes available. Checking the registered plugin as well prevents a
    // first-render race from hiding Android torrent controls forever.
    return !!(window as any).tatakaiRuntime?.getTorrentStreamUrl
      || Capacitor.isPluginAvailable('TatakaiTorrent');
  }
  return false;
}

/**
 * Extension runtime: desktop has the local HTTP host + IPC; mobile has the
 * in-WebView runtime (Phase 2). Web has neither (falls back to central dispatch).
 */
export function hasExtensionRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as any;
  return (
    !!w.electron?.invokeExtension ||
    !!w.tatakaiRuntime?.invokeExtension ||
    !!w.tatakaiMobileExtensions || // in-WebView runtime, installed in Phase 2
    isMobileNative()
  );
}
