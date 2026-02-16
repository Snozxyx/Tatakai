import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { LocalNotifications } from '@capacitor/local-notifications';
import { getClientIdSync } from '@/hooks/useClientId';
import { ReleaseService, type AppRelease } from './releaseService';

export interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
    size: number;
  }>;
  html_url: string;
  from_db?: boolean;
}

export type UpdateProgress = {
  percent: number;
  transferred: number;
  total: number;
};

export class MobileUpdateService {
  private static readonly GITHUB_OWNER = 'snozxyx';
  private static readonly GITHUB_REPO = 'Tatakai';
  private static readonly CHECK_INTERVAL = 3600000; // 1 hour
  private static checkTimer: any = null;

  /**
   * Initialize auto-update checker
   */
  static async init() {
    if (!Capacitor.isNativePlatform()) {
      console.log('Not a native platform, skipping mobile updates');
      return;
    }

    // Request notification permissions
    await LocalNotifications.requestPermissions();

    // Check for updates on app launch
    await this.checkForUpdates();

    // Set up periodic checks
    this.checkTimer = setInterval(() => {
      this.checkForUpdates();
    }, this.CHECK_INTERVAL);
  }

  /**
   * Check for updates from GitHub releases
   */
  static async checkForUpdates(): Promise<void> {
    try {
      const currentVersion = await this.getCurrentVersion();
      const latestRelease = await this.getLatestRelease();

      if (!latestRelease) {
        console.log('No releases found');
        return;
      }

      const latestVersion = latestRelease.tag_name.replace('v', '');

      if (this.isNewerVersion(latestVersion, currentVersion)) {
        console.log(`Update available: ${currentVersion} → ${latestVersion}`);
        await this.notifyUpdate(latestRelease);
      } else {
        console.log(`App is up to date: ${currentVersion}`);
      }
    } catch (error) {
      console.error('Failed to check for updates:', error);
    }
  }

  /**
   * Get current app version
   */
  static async getCurrentVersion(): Promise<string> {
    try {
      const info = await CapacitorApp.getInfo();
      return info.version;
    } catch {
      // Fallback for web
      return __APP_VERSION__;
    }
  }

  /**
   * Fetch latest release from Supabase (formerly GitHub)
   */
  static async getLatestRelease(): Promise<GitHubRelease | null> {
    try {
      const platform = Capacitor.getPlatform();
      const dbPlatform = platform === 'ios' ? 'mac' : platform === 'android' ? 'android' : 'win';

      const release = await ReleaseService.getLatestRelease(dbPlatform as any);

      if (!release) {
        // Fallback to searching win for cross-platform metadata if specific one not found
        const winRelease = await ReleaseService.getLatestRelease('win');
        if (!winRelease) return null;
        return this.mapDbReleaseToGitHub(winRelease);
      }

      return this.mapDbReleaseToGitHub(release);
    } catch (error) {
      console.error('Failed to fetch latest release from DB:', error);
      return null;
    }
  }

  /**
   * Map database release to the internal GitHubRelease interface to maintain compatibility
   */
  private static mapDbReleaseToGitHub(release: AppRelease): GitHubRelease {
    const size = release.metadata?.size || 0;
    const name = release.url.split('/').pop() || `tatakai-${release.version}`;

    return {
      tag_name: release.version.startsWith('v') ? release.version : `v${release.version}`,
      name: release.version,
      body: release.notes || '',
      published_at: release.created_at,
      assets: [{
        name: name,
        browser_download_url: release.url,
        size: size
      }],
      html_url: release.url,
      from_db: true
    };
  }

  /**
   * Compare versions (simple semantic versioning)
   */
  static isNewerVersion(latest: string, current: string): boolean {
    const latestParts = latest.split('.').map(Number);
    const currentParts = current.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      const latestPart = latestParts[i] || 0;
      const currentPart = currentParts[i] || 0;

      if (latestPart > currentPart) return true;
      if (latestPart < currentPart) return false;
    }

    return false;
  }

  /**
   * Show update notification
   */
  private static async notifyUpdate(release: GitHubRelease): Promise<void> {
    const platform = Capacitor.getPlatform();

    await LocalNotifications.schedule({
      notifications: [
        {
          title: 'Update Available!',
          body: `Tatakai ${release.tag_name} is ready to install`,
          id: 1,
          extra: {
            releaseUrl: release.html_url,
            version: release.tag_name,
            platform: platform
          },
          actionTypeId: 'UPDATE_ACTION',
          schedule: { at: new Date(Date.now() + 1000) }
        }
      ]
    });

    // Listen for notification tap
    LocalNotifications.addListener('localNotificationActionPerformed', async (notification) => {
      if (notification.actionId === 'tap') {
        await this.handleUpdate(release);
      }
    });
  }

  /**
   * Handle update based on platform
   */
  static async handleUpdate(release: GitHubRelease): Promise<void> {
    const platform = Capacitor.getPlatform();

    if (platform === 'android') {
      // Android: Download and install APK from GitHub
      await this.downloadAndInstallAPK(release);
    } else if (platform === 'ios') {
      // iOS: Redirect to web version
      await this.redirectToWebVersion();
    }
  }

  /**
   * Download and install APK (Android only)
   */
  private static async downloadAndInstallAPK(release: GitHubRelease): Promise<void> {
    try {
      // Find APK asset
      const apkAsset = release.assets.find(asset =>
        asset.name.endsWith('.apk')
      );

      if (!apkAsset) {
        console.error('No APK found in release');
        return;
      }

      // Show download progress notification
      await LocalNotifications.schedule({
        notifications: [
          {
            title: 'Downloading Update',
            body: 'Please wait...',
            id: 2,
            ongoing: true
          }
        ]
      });

      // Download APK
      const response = await fetch(apkAsset.browser_download_url);
      const blob = await response.blob();
      const base64 = await this.blobToBase64(blob);

      // Save to filesystem
      const fileName = `tatakai-${release.tag_name}.apk`;
      const result = await Filesystem.writeFile({
        path: fileName,
        data: base64,
        directory: Directory.Cache
      });

      // Cancel download notification
      await LocalNotifications.cancel({ notifications: [{ id: 2 }] });

      // Open file for installation
      await Browser.open({ url: result.uri });

      // Show completion notification
      await LocalNotifications.schedule({
        notifications: [
          {
            title: 'Update Downloaded',
            body: 'Tap to install',
            id: 3
          }
        ]
      });
    } catch (error) {
      console.error('Failed to download APK:', error);

      await LocalNotifications.schedule({
        notifications: [
          {
            title: 'Update Failed',
            body: 'Could not download update. Please try again.',
            id: 4
          }
        ]
      });
    }
  }

  /**
   * Redirect to web version (iOS fallback)
   */
  private static async redirectToWebVersion(): Promise<void> {
    await Browser.open({
      url: 'https://tatakai.me',
      presentationStyle: 'fullscreen',
      toolbarColor: '#09090b'
    });

    // Show instructions
    await LocalNotifications.schedule({
      notifications: [
        {
          title: 'Use Web Version',
          body: 'Tap "Share" → "Add to Home Screen" to install the latest version',
          id: 5
        }
      ]
    });
  }

  /**
   * Convert Blob to Base64
   */
  private static blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Manual update check (triggered by user)
   */
  static async manualCheck(): Promise<boolean> {
    try {
      const currentVersion = await this.getCurrentVersion();
      const latestRelease = await this.getLatestRelease();

      if (!latestRelease) {
        return false;
      }

      const latestVersion = latestRelease.tag_name.replace('v', '');

      if (this.isNewerVersion(latestVersion, currentVersion)) {
        await this.handleUpdate(latestRelease);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Manual update check failed:', error);
      return false;
    }
  }

  /**
   * Clean up
   */
  static destroy() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }
}
