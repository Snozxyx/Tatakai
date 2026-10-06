/**
 * securityBridge.ts — unified watch/embed signals for every shell.
 *
 * Desktop arms `desktop/security/ad-blocker.cjs` via
 * `window.electron.security.{setWatchActive,setEmbedActive}` (see
 * `WatchPage.tsx` + `EmbedPlayer.tsx`). Mobile previously had no equivalent:
 * `EmbedPlayer` early-returned when `window.electron` was missing, so the
 * native `AntiHijackWebViewClient` never learned an embed was on screen and
 * unknown top-frame navigations from a click-hijack were handed to Capacitor
 * instead of being swallowed.
 *
 * These helpers fan out to both: Electron IPC when present, and the native
 * `TatakaiLocalProxyPlugin.setEmbedActive/setWatchActive` (which flips
 * `SecurityState`) on Android. Safe on web — no-ops there.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

type SecurityPlugin = {
  setEmbedActive(options: { active: boolean }): Promise<unknown>;
  setWatchActive(options: { active: boolean }): Promise<unknown>;
};

let securityPlugin: SecurityPlugin | null | undefined;

function getSecurityPlugin(): SecurityPlugin | null {
  if (securityPlugin !== undefined) return securityPlugin;
  securityPlugin = null;
  try {
    if (typeof window !== 'undefined' && Capacitor.isPluginAvailable('TatakaiLocalProxy')) {
      securityPlugin = registerPlugin<SecurityPlugin>('TatakaiLocalProxy');
    }
  } catch {
    securityPlugin = null;
  }
  return securityPlugin;
}

function notifyElectron(method: 'setWatchActive' | 'setEmbedActive', active: boolean): void {
  try {
    const security = (window as any)?.electron?.security;
    security?.[method]?.(active === true);
  } catch {
    /* ignore */
  }
}

function notifyNative(method: 'setWatchActive' | 'setEmbedActive', active: boolean): void {
  try {
    const p = getSecurityPlugin();
    if (!p) return;
    void p[method]({ active: active === true }).catch(() => undefined);
  } catch {
    /* ignore */
  }
}

export function setWatchActiveBridge(active: boolean): void {
  notifyElectron('setWatchActive', active);
  notifyNative('setWatchActive', active);
}

export function setEmbedActiveBridge(active: boolean): void {
  notifyElectron('setEmbedActive', active);
  notifyNative('setEmbedActive', active);
}
