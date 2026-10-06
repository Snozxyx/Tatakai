import { useEffect, useSyncExternalStore } from 'react';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import { toast } from 'sonner';
import { compareAppVersions } from './version';

export const MOBILE_RELEASES_URL = 'https://github.com/Snozxyx/Tatakai/releases/latest';
const LATEST_RELEASE_API = 'https://api.github.com/repos/Snozxyx/Tatakai/releases/latest';

export type MobileUpdatePhase =
  | 'idle'
  | 'checking'
  | 'current'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error';

export interface MobileUpdateState {
  phase: MobileUpdatePhase;
  currentVersion?: string;
  latestVersion?: string;
  releaseUrl: string;
  checkedAt?: number;
  message?: string;
  /** Direct APK asset URL from the GitHub release (Android auto-update). */
  downloadUrl?: string;
  /** 0–100 download progress while `downloading`. */
  progress?: number;
  /** Absolute on-device path of the downloaded APK once `downloaded`. */
  apkPath?: string;
}

interface TatakaiUpdaterPlugin {
  canInstall(): Promise<{ supported: boolean; canRequestInstalls: boolean; apiLevel: number }>;
  openInstallSettings(): Promise<{ success: boolean }>;
  cancelDownload(): Promise<{ success: boolean }>;
  downloadApk(options: { url: string; version: string }): Promise<{ success: boolean; path: string; size: number; progress: number }>;
  installApk(options: { version: string; path?: string }): Promise<{ success: boolean; needsPermission?: boolean }>;
  addListener(
    eventName: 'updaterProgress',
    listener: (event: { progress?: number; receivedBytes?: number; totalBytes?: number }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

/** True only on the Android native shell — the sole target of auto-update. */
export function isAndroidAutoUpdateTarget(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

function getUpdaterPlugin(): TatakaiUpdaterPlugin | null {
  if (!isAndroidAutoUpdateTarget()) return null;
  try {
    if (!Capacitor.isPluginAvailable('TatakaiUpdater')) return null;
    return registerPlugin<TatakaiUpdaterPlugin>('TatakaiUpdater');
  } catch {
    return null;
  }
}

let progressHandle: { remove: () => Promise<void> } | null = null;

function detachProgressListener(): void {
  try {
    void progressHandle?.remove()?.catch(() => undefined);
  } catch {
    /* ignore */
  }
  progressHandle = null;
}

const INITIAL_STATE: MobileUpdateState = {
  phase: 'idle',
  releaseUrl: MOBILE_RELEASES_URL,
};

let state = INITIAL_STATE;
let checkInFlight: Promise<MobileUpdateState> | null = null;
const listeners = new Set<() => void>();

function publish(patch: Partial<MobileUpdateState>): MobileUpdateState {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
  return state;
}

export async function openMobileReleasePage(url = state.releaseUrl): Promise<void> {
  const target = /^https:\/\//i.test(url) ? url : MOBILE_RELEASES_URL;
  try {
    if (Capacitor.isNativePlatform()) {
      await Browser.open({ url: target });
      return;
    }
    window.open(target, '_blank', 'noopener,noreferrer');
  } catch {
    window.open(target, '_blank', 'noopener,noreferrer');
  }
}

type CheckOptions = { announce?: boolean };

export async function checkMobileUpdate(
  options: CheckOptions = {},
): Promise<MobileUpdateState> {
  if (checkInFlight) return checkInFlight;

  checkInFlight = (async () => {
    publish({ phase: 'checking', message: undefined });
    try {
      const app = await App.getInfo();
      const currentVersion = String(app.version || '').replace(/^v/i, '');
      const response = await CapacitorHttp.get({
        url: LATEST_RELEASE_API,
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`GitHub release check returned HTTP ${response.status}`);
      }

      const latestVersion = String(response.data?.tag_name || '').replace(/^v/i, '');
      if (!latestVersion) throw new Error('Latest release did not include a version tag');
      const releaseUrl = String(response.data?.html_url || MOBILE_RELEASES_URL);
      const downloadUrl = pickAndroidApkUrl(response.data?.assets, latestVersion);
      const available = compareAppVersions(latestVersion, currentVersion) > 0;
      const next = publish({
        phase: available ? 'available' : 'current',
        currentVersion,
        latestVersion,
        releaseUrl,
        checkedAt: Date.now(),
        message: undefined,
        downloadUrl,
        progress: undefined,
        apkPath: undefined,
      });

      if (available) {
        const autoTarget = isAndroidAutoUpdateTarget() && !!downloadUrl && !!getUpdaterPlugin();
        toast.info(`Tatakai ${latestVersion} is available`, {
          id: 'mobile-manual-update',
          description: Capacitor.getPlatform() === 'ios'
            ? 'Download the unsigned IPA, then sign and sideload it with your preferred tool.'
            : autoTarget
              ? 'Downloading happens inside the app — no browser needed.'
              : 'Download the latest Android package from GitHub Releases.',
          duration: Infinity,
          closeButton: true,
          action: autoTarget
            ? {
                label: 'Download',
                onClick: () => { void downloadMobileUpdate(); },
              }
            : {
                label: 'Open releases',
                onClick: () => { void openMobileReleasePage(releaseUrl); },
              },
        });
      } else if (options.announce) {
        toast.success(`Tatakai ${currentVersion} is up to date`);
      }
      return next;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const next = publish({ phase: 'error', message, checkedAt: Date.now() });
      if (options.announce) toast.error('Could not check for updates', { description: message });
      return next;
    } finally {
      checkInFlight = null;
    }
  })();

  return checkInFlight;
}

/**
 * Pick the self-installable APK from a GitHub release's asset list.
 * CI publishes `Tatakai-v<version>-android.apk`; fall back to any asset whose
 * name ends in `android.apk` so renames don't silently break auto-update.
 */
function pickAndroidApkUrl(assets: unknown, latestVersion: string): string | undefined {
  try {
    if (!Array.isArray(assets)) return undefined;
    const names = assets.filter(
      (a): a is { name?: unknown; browser_download_url?: unknown } =>
        !!a && typeof a === 'object',
    );
    const exact = names.find(
      (a) => String(a.name || '') === `Tatakai-v${latestVersion}-android.apk`,
    );
    const fallback = names.find((a) => String(a.name || '').toLowerCase().endsWith('android.apk'));
    const picked = exact || fallback;
    const url = String(picked?.browser_download_url || '').trim();
    return /^https:\/\//i.test(url) ? url : undefined;
  } catch {
    return undefined;
  }
}

let downloadInFlight = false;

/**
 * Android-only: download the release APK inside the app with progress.
 * Falls back to opening the releases page when the native updater is missing
 * (web preview, old build without the plugin, or no APK asset attached).
 */
export async function downloadMobileUpdate(): Promise<void> {
  const plugin = getUpdaterPlugin();
  if (!plugin) {
    await openMobileReleasePage();
    return;
  }
  const { downloadUrl, latestVersion } = state;
  if (!downloadUrl || !latestVersion) {
    await openMobileReleasePage();
    return;
  }
  if (downloadInFlight || state.phase === 'downloading') return;
  downloadInFlight = true;
  detachProgressListener();
  publish({ phase: 'downloading', progress: 0, message: undefined });
  try {
    try {
      // Throttle: native progress ticks arrive many times per second and each
      // publish re-renders every subscriber. Only whole-percent changes (and
      // at most one per 250ms) reach React — the bar still looks smooth.
      let lastEmitted = -1;
      let lastAt = 0;
      progressHandle = await plugin.addListener('updaterProgress', (event) => {
        const pct = Math.max(0, Math.min(100, Math.round(Number(event?.progress ?? 0))));
        if (!Number.isFinite(pct) || pct === lastEmitted) return;
        const now = Date.now();
        if (pct < 100 && now - lastAt < 250) return;
        lastEmitted = pct;
        lastAt = now;
        publish({ progress: pct });
      });
    } catch {
      progressHandle = null;
    }
    const result = await plugin.downloadApk({ url: downloadUrl, version: latestVersion });
    publish({ phase: 'downloaded', progress: 100, apkPath: String(result?.path || '') || undefined });
    toast.success(`Tatakai ${latestVersion} downloaded`, {
      id: 'mobile-update-downloaded',
      description: 'Tap Install to finish the update.',
      duration: 8000,
      closeButton: true,
      action: {
        label: 'Install',
        onClick: () => { void installMobileUpdate(); },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/cancelled/i.test(message)) {
      publish({ phase: 'available', progress: undefined });
    } else {
      publish({ phase: 'error', message, progress: undefined });
      toast.error('Update download failed', {
        description: message,
        action: {
          label: 'Open releases',
          onClick: () => { void openMobileReleasePage(); },
        },
      });
    }
  } finally {
    detachProgressListener();
    downloadInFlight = false;
  }
}

/** Cancel an in-flight APK download and return to the `available` state. */
export async function cancelMobileUpdateDownload(): Promise<void> {
  try {
    await getUpdaterPlugin()?.cancelDownload();
  } catch {
    /* the native side also watches the flag — the promise settles on its own */
  }
}

/**
 * Android-only: hand the downloaded APK to the package installer.
 * On first use Android requires the one-time "Install unknown apps" grant for
 * Tatakai — we deep-link straight to that settings page in that case.
 */
export async function installMobileUpdate(): Promise<void> {
  const plugin = getUpdaterPlugin();
  if (!plugin) {
    await openMobileReleasePage();
    return;
  }
  const { apkPath, latestVersion } = state;
  if (state.phase !== 'downloaded' || !latestVersion) {
    await downloadMobileUpdate();
    return;
  }
  publish({ phase: 'installing', message: undefined });
  try {
    const result = await plugin.installApk({
      version: latestVersion,
      ...(apkPath ? { path: apkPath } : {}),
    });
    if (result?.needsPermission) {
      publish({ phase: 'downloaded' });
      toast.warning('Permission needed to install updates', {
        id: 'mobile-update-permission',
        description: 'Allow "Install unknown apps" for Tatakai, then tap Install again.',
        duration: 10000,
        closeButton: true,
        action: {
          label: 'Open settings',
          onClick: () => { void plugin.openInstallSettings().catch(() => undefined); },
        },
      });
      return;
    }
    toast.info('Opening the installer…', {
      id: 'mobile-update-installing',
      description: 'Confirm the install to finish updating.',
      duration: 6000,
    });
    // The OS takes over from here; when the user confirms, this process is
    // replaced. Reset to `downloaded` so a back-press still offers Install.
    publish({ phase: 'downloaded' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    publish({ phase: 'downloaded', message });
    toast.error('Could not open the installer', { description: message });
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): MobileUpdateState {
  return state;
}

export function useMobileUpdateState(): MobileUpdateState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export function useMobileUpdateOrchestrator(): void {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let interval = 0;
    const maybeCheck = () => {
      try {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      } catch {
        /* assume online */
      }
      const age = Date.now() - (state.checkedAt || 0);
      if (state.phase === 'idle' || age > STALE_AFTER_MS) {
        void checkMobileUpdate();
      }
    };
    const timer = window.setTimeout(maybeCheck, 2500);
    interval = window.setInterval(maybeCheck, 6 * 60 * 60 * 1000);
    return () => {
      window.clearTimeout(timer);
      if (interval) window.clearInterval(interval);
    };
  }, []);
}
