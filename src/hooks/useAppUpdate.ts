import { useEffect, useState, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { MobileUpdateService, type GitHubRelease } from '@/services/mobileUpdateService';

/** Unified update state for all platforms */
export interface AppUpdateState {
  /** Current app version */
  currentVersion: string;
  /** Latest available version (null if unknown / not checked) */
  latestVersion: string | null;
  /** Whether a newer version exists */
  updateAvailable: boolean;
  /** Full GitHub release info when update is available */
  release: GitHubRelease | null;
  /** true while checking for updates */
  isChecking: boolean;
  /** true while the update is downloading */
  isDownloading: boolean;
  /** Download progress 0‑100 */
  downloadProgress: number;
  /** true when the download is complete and ready to install (Electron) */
  updateReady: boolean;
  /** Error message if last operation failed */
  error: string | null;
  /** Platform: 'electron' | 'capacitor' | 'web' */
  platform: 'electron' | 'capacitor' | 'web';
  /** Release page URL */
  releaseUrl: string | null;
  /** Direct download URL for the current platform */
  downloadUrl: string | null;
}

const GITHUB_RELEASE_URL = 'https://github.com/snozxyx/Tatakai/releases/latest';

function getDownloadUrl(release: GitHubRelease | null): string | null {
  if (!release) return null;

  const ua = navigator.userAgent.toLowerCase();
  const assets = release.assets;

  if (Capacitor.isNativePlatform()) {
    // Android APK
    const apk = assets.find(a => a.name.endsWith('.apk'));
    return apk?.browser_download_url ?? null;
  }

  if ((window as any).electron) {
    // Electron — updater handles this, but provide the link for display
    if (ua.includes('win')) {
      const win = assets.find(a => a.name.endsWith('.exe') && !a.name.includes('blockmap'));
      return win?.browser_download_url ?? null;
    }
    if (ua.includes('mac')) {
      const mac = assets.find(a => a.name.endsWith('.dmg'));
      return mac?.browser_download_url ?? null;
    }
    const linux = assets.find(a => a.name.endsWith('.AppImage'));
    return linux?.browser_download_url ?? null;
  }

  // Web — detect OS and provide download link
  if (ua.includes('android')) {
    return assets.find(a => a.name.endsWith('.apk'))?.browser_download_url ?? null;
  }
  if (ua.includes('win')) {
    return assets.find(a => a.name.endsWith('.exe') && !a.name.includes('blockmap'))?.browser_download_url ?? null;
  }
  if (ua.includes('mac')) {
    return assets.find(a => a.name.endsWith('.dmg'))?.browser_download_url ?? null;
  }
  // Linux
  return assets.find(a => a.name.endsWith('.AppImage'))?.browser_download_url ?? null;
}

export function useAppUpdate(): AppUpdateState & {
  checkForUpdates: () => Promise<void>;
  downloadUpdate: () => void;
  installUpdate: () => void;
} {
  const isElectron = !!(window as any).electron;
  const isCapacitor = !isElectron && Capacitor.isNativePlatform();
  const platform = isElectron ? 'electron' : isCapacitor ? 'capacitor' : 'web';

  const [state, setState] = useState<AppUpdateState>({
    currentVersion: __APP_VERSION__,
    latestVersion: null,
    updateAvailable: false,
    release: null,
    isChecking: false,
    isDownloading: false,
    downloadProgress: 0,
    updateReady: false,
    error: null,
    platform,
    releaseUrl: null,
    downloadUrl: null,
  });

  const cleanupRef = useRef<(() => void) | null>(null);

  // ── Electron: wire updater events ──
  useEffect(() => {
    if (!isElectron) return;
    const electron = (window as any).electron;
    if (!electron?.onUpdaterEvent) return;

    const handler = (data: any) => {
      switch (data.type) {
        case 'update-available':
          setState(s => ({
            ...s,
            updateAvailable: true,
            latestVersion: data.info?.version ?? null,
            isChecking: false,
            error: null,
          }));
          break;
        case 'update-not-available':
          setState(s => ({
            ...s,
            updateAvailable: false,
            isChecking: false,
            error: null,
          }));
          break;
        case 'download-progress':
          setState(s => ({
            ...s,
            isDownloading: true,
            downloadProgress: Math.round(data.progress?.percent ?? 0),
          }));
          break;
        case 'update-downloaded':
          setState(s => ({
            ...s,
            isDownloading: false,
            downloadProgress: 100,
            updateReady: true,
          }));
          break;
        case 'error':
          setState(s => ({
            ...s,
            isChecking: false,
            isDownloading: false,
            error: data.error ?? 'Unknown error',
          }));
          break;
      }
    };

    electron.onUpdaterEvent(handler);
    // electron IPC listeners don't return cleanup directly — no-op
  }, [isElectron]);

  // ── Check for updates ──
  const checkForUpdates = useCallback(async () => {
    setState(s => ({ ...s, isChecking: true, error: null }));

    try {
      if (isElectron) {
        // Electron: trigger native check, events handle the rest
        const electron = (window as any).electron;
        const result = await electron.checkForUpdates();
        if (result.status === 'dev-mode') {
          // Still fetch GitHub release for display
          const release = await MobileUpdateService.getLatestRelease();
          setState(s => ({
            ...s,
            isChecking: false,
            release,
            latestVersion: release?.tag_name.replace('v', '') ?? null,
            releaseUrl: release?.html_url ?? GITHUB_RELEASE_URL,
            downloadUrl: getDownloadUrl(release),
          }));
        } else if (result.status === 'error') {
          setState(s => ({ ...s, isChecking: false, error: result.error }));
        }
        // 'checked' → updater-event callbacks handle the rest
        // But also grab release info for URL display
        const release = await MobileUpdateService.getLatestRelease();
        if (release) {
          setState(s => ({
            ...s,
            release,
            releaseUrl: release.html_url,
            downloadUrl: getDownloadUrl(release),
          }));
        }
      } else {
        // Capacitor + Web: use GitHub API directly
        const release = await MobileUpdateService.getLatestRelease();
        if (!release) {
          setState(s => ({ ...s, isChecking: false, error: 'No releases found' }));
          return;
        }

        const latestVersion = release.tag_name.replace('v', '');
        const currentVersion = await MobileUpdateService.getCurrentVersion();
        const hasUpdate = MobileUpdateService.isNewerVersion(latestVersion, currentVersion);

        setState(s => ({
          ...s,
          isChecking: false,
          currentVersion,
          latestVersion,
          updateAvailable: hasUpdate,
          release,
          releaseUrl: release.html_url,
          downloadUrl: getDownloadUrl(release),
          error: null,
        }));
      }
    } catch (err: any) {
      setState(s => ({
        ...s,
        isChecking: false,
        error: err?.message ?? 'Failed to check for updates',
      }));
    }
  }, [isElectron]);

  // ── Download update ──
  const downloadUpdate = useCallback(() => {
    if (isElectron) {
      (window as any).electron.downloadUpdate();
      setState(s => ({ ...s, isDownloading: true, downloadProgress: 0 }));
    } else if (isCapacitor && state.release) {
      // Capacitor: download & install APK via MobileUpdateService
      setState(s => ({ ...s, isDownloading: true, downloadProgress: 0 }));
      MobileUpdateService.handleUpdate(state.release)
        .then(() => setState(s => ({ ...s, isDownloading: false, downloadProgress: 100 })))
        .catch(err => setState(s => ({ ...s, isDownloading: false, error: err.message })));
    } else if (state.downloadUrl) {
      // Web: open download link
      window.open(state.downloadUrl, '_blank');
    }
  }, [isElectron, isCapacitor, state.release, state.downloadUrl]);

  // ── Install update ──
  const installUpdate = useCallback(() => {
    if (isElectron) {
      (window as any).electron.quitAndInstall();
    } else if (state.releaseUrl) {
      window.open(state.releaseUrl, '_blank');
    }
  }, [isElectron, state.releaseUrl]);

  // ── Auto-check on mount ──
  useEffect(() => {
    checkForUpdates();
  }, [checkForUpdates]);

  // Cleanup
  useEffect(() => {
    return () => cleanupRef.current?.();
  }, []);

  return {
    ...state,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
  };
}
