import { memo, Suspense, lazy, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Bell,
  Code2,
  Download,
  ExternalLink,
  HardDrive,
  Info,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Smartphone,
  Vibrate,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  SettingRow,
  SettingsBadge,
  SettingsSection,
} from '@/components/settings/SettingsPrimitives';
import {
  useMobileConfig,
  type KeyboardResizeMode,
  type MobileLayout,
  type OrientationLock,
  type StatusBarStyle,
} from '@/hooks/ui/useMobileConfig';
import { useSettingsModal } from '@/contexts/SettingsModalContext';
import { useTheme } from '@/hooks/ui/useTheme';
import { triggerHaptic } from '@/lib/haptics';
import { isCapacitor, isIOS } from '@/lib/platform/platform';
import {
  cancelMobileUpdateDownload,
  checkMobileUpdate,
  downloadMobileUpdate,
  installMobileUpdate,
  isAndroidAutoUpdateTarget,
  openMobileReleasePage,
  useMobileUpdateState,
} from '@/core/update/mobile-update';

/**
 * Mobile App Settings (Capacitor only) — the device-level shell preferences that
 * have no desktop analogue: haptics, status bar / orientation / keyboard, local
 * notifications, developer mode. Writes go through `useMobileConfig`
 * (localStorage, per-device); the few settings with an immediate native effect
 * (status bar, orientation, keyboard, keep-awake) are also applied here so the
 * change is felt right away instead of only after the next launch.
 */

/** Best-effort native appliers — all no-op off Capacitor / missing plugin. */
async function applyStatusBarStyle(style: StatusBarStyle): Promise<void> {
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    // Capacitor `Style.Light` = light icons (for a dark bg); `auto` follows the
    // app's dark chrome, so it also wants light icons.
    await StatusBar.setStyle({ style: style === 'dark' ? Style.Dark : Style.Light });
  } catch {
    /* web / plugin missing */
  }
}

async function applyOrientation(lock: OrientationLock): Promise<void> {
  try {
    const { ScreenOrientation } = await import('@capacitor/screen-orientation');
    if (lock === 'auto') {
      await ScreenOrientation.unlock();
      return;
    }
    await ScreenOrientation.lock({ orientation: lock === 'landscape' ? 'landscape' : 'portrait' });
  } catch {
    /* web / plugin missing */
  }
}

async function applyKeyboardResize(mode: KeyboardResizeMode): Promise<void> {
  try {
    const { Keyboard, KeyboardResize } = await import('@capacitor/keyboard');
    const map: Record<KeyboardResizeMode, (typeof KeyboardResize)[keyof typeof KeyboardResize]> = {
      native: KeyboardResize.Native,
      body: KeyboardResize.Body,
      ionic: KeyboardResize.Ionic,
      none: KeyboardResize.None,
    };
    await Keyboard.setResizeMode({ mode: map[mode] });
  } catch {
    /* web / plugin missing */
  }
}

// __PANEL_BODY__

/** Screen Wake Lock — prefer the native plugin, fall back to the web API. */
let wakeLockRef: { release: () => Promise<void> } | null = null;
async function applyKeepAwake(on: boolean): Promise<void> {
  try {
    const { KeepAwake } = await import('@capacitor-community/keep-awake');
    await (on ? KeepAwake.keepAwake() : KeepAwake.allowSleep());
    return;
  } catch {
    /* plugin missing (web) — fall through to the Wake Lock API */
  }
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
    };
    if (on) {
      if (!wakeLockRef && nav.wakeLock) wakeLockRef = await nav.wakeLock.request('screen');
    } else if (wakeLockRef) {
      await wakeLockRef.release();
      wakeLockRef = null;
    }
  } catch {
    /* unsupported — persisted preference still honored by a future applier */
  }
}

interface DeviceSummary {
  model?: string;
  osVersion?: string;
  platform?: string;
  manufacturer?: string;
  appVersion?: string;
  appBuild?: string;
}

async function readDeviceSummary(): Promise<DeviceSummary> {
  const summary: DeviceSummary = {};
  try {
    const { Device } = await import('@capacitor/device');
    const info = await Device.getInfo();
    summary.model = info.model;
    summary.osVersion = `${info.operatingSystem} ${info.osVersion}`.trim();
    summary.platform = info.platform;
    summary.manufacturer = info.manufacturer;
  } catch {
    /* ignore */
  }
  try {
    const { App } = await import('@capacitor/app');
    const info = await App.getInfo();
    summary.appVersion = info.version;
    summary.appBuild = info.build;
  } catch {
    /* ignore */
  }
  return summary;
}

/** Clear the WebView HTTP/image caches (Cache Storage API). Best-effort. */
async function clearWebCaches(): Promise<number> {
  if (typeof caches === 'undefined') return 0;
  const keys = await caches.keys();
  await Promise.all(keys.map((k) => caches.delete(k)));
  return keys.length;
}

// Debrid pulls in the orchestrator + two API clients even when the user only
// flips haptics — load it on demand so the panel opens fast on low-end phones.
const DebridSettingsPanel = lazy(() =>
  import('@/components/settings/DebridSettingsPanel').then((m) => ({ default: m.DebridSettingsPanel })),
);

/**
 * Self-contained app-update section. It owns the `useMobileUpdateState`
 * subscription so per-tick download progress re-renders ONLY this subtree —
 * previously every progress event re-rendered the whole 600-line panel,
 * including all switches and the debrid client form.
 */
const AppUpdateSection = memo(function AppUpdateSection() {
  const mobileUpdate = useMobileUpdateState();
  const { openSettings } = useSettingsModal();
  const autoCapable = isAndroidAutoUpdateTarget() && !!mobileUpdate.downloadUrl;

  const handleUpdateAction = () => {
    if (mobileUpdate.phase === 'available') {
      if (autoCapable) void downloadMobileUpdate();
      else void openMobileReleasePage();
      return;
    }
    if (mobileUpdate.phase === 'downloaded' || mobileUpdate.phase === 'installing') {
      void installMobileUpdate();
      return;
    }
    void checkMobileUpdate({ announce: true });
  };

  return (
    <SettingsSection
      title="App updates"
      description="Check GitHub Releases and install mobile updates manually."
      action={
        mobileUpdate.phase === 'available' || mobileUpdate.phase === 'downloaded' || mobileUpdate.phase === 'downloading'
          ? <SettingsBadge tone="warning">Update available</SettingsBadge>
          : mobileUpdate.phase === 'current'
            ? <SettingsBadge>Up to date</SettingsBadge>
            : undefined
      }
    >
      <SettingRow
        icon={Download}
        title={
          mobileUpdate.phase === 'available'
            ? `Tatakai ${mobileUpdate.latestVersion} is available`
            : mobileUpdate.phase === 'downloading'
              ? `Downloading ${mobileUpdate.latestVersion}… ${Math.round(Number(mobileUpdate.progress ?? 0))}%`
              : mobileUpdate.phase === 'downloaded' || mobileUpdate.phase === 'installing'
                ? `Tatakai ${mobileUpdate.latestVersion} is ready to install`
                : 'Check for updates'
        }
        description={
          isIOS()
            ? 'iOS releases are unsigned. Download the IPA, then sign and sideload it with your own tool.'
            : autoCapable || mobileUpdate.phase === 'downloading' || mobileUpdate.phase === 'downloaded'
              ? 'Android updates download and install inside the app — no browser needed.'
              : 'Android updates open the latest release so you can install the new package manually.'
        }
        control={
          <div className="flex shrink-0 items-center gap-2">
            {mobileUpdate.phase === 'downloading' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void cancelMobileUpdateDownload()}
              >
                Cancel
              </Button>
            )}
            <Button
              type="button"
              variant={
                mobileUpdate.phase === 'available' ||
                mobileUpdate.phase === 'downloaded' ||
                mobileUpdate.phase === 'installing'
                  ? 'default'
                  : 'outline'
              }
              size="sm"
              onClick={handleUpdateAction}
              disabled={mobileUpdate.phase === 'checking' || mobileUpdate.phase === 'downloading'}
              className="gap-2"
            >
              {mobileUpdate.phase === 'checking' || mobileUpdate.phase === 'installing' ? (
                <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : mobileUpdate.phase === 'available' ? (
                autoCapable ? (
                  <Download className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                )
              ) : mobileUpdate.phase === 'downloaded' ? (
                <Download className="h-4 w-4" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              )}
              {mobileUpdate.phase === 'checking'
                ? 'Checking'
                : mobileUpdate.phase === 'available'
                  ? autoCapable ? 'Download' : 'Open releases'
                  : mobileUpdate.phase === 'downloading'
                    ? `${Math.round(Number(mobileUpdate.progress ?? 0))}%`
                    : mobileUpdate.phase === 'downloaded'
                      ? 'Install'
                      : mobileUpdate.phase === 'installing'
                        ? 'Opening…'
                        : 'Check now'}
            </Button>
          </div>
        }
      />
      {(mobileUpdate.phase === 'downloading' || mobileUpdate.phase === 'downloaded') && (
        <div className="px-4 pb-3">
          <div
            className="h-1.5 overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-valuenow={Math.round(Number(mobileUpdate.progress ?? (mobileUpdate.phase === 'downloaded' ? 100 : 0)))}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${mobileUpdate.phase === 'downloaded' ? 100 : Math.round(Number(mobileUpdate.progress ?? 0))}%` }}
            />
          </div>
        </div>
      )}
      {mobileUpdate.phase === 'error' && (
        <p role="status" className="px-4 pb-3 text-xs text-red-300">
          {mobileUpdate.message || 'The update check could not be completed.'}
        </p>
      )}
      <SettingRow
        icon={ScrollText}
        title="What's new"
        description="Read the changelog for this version."
        control={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => openSettings('changelog')}
            className="gap-2"
          >
            <ScrollText className="h-4 w-4" />
            Open
          </Button>
        }
      />
    </SettingsSection>
  );
});

export function MobileAppSettingsPanel(_props: { section?: string }) {
  const { config, updateConfig, resetConfig } = useMobileConfig();
  const { reduceMotion, setReduceMotion } = useTheme();
  const [device, setDevice] = useState<DeviceSummary>({});
  const [clearing, setClearing] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    void readDeviceSummary().then((d) => {
      if (mounted.current) setDevice(d);
    });
    return () => {
      mounted.current = false;
    };
  }, []);

  const handleHaptics = (enabled: boolean) => {
    updateConfig({ hapticFeedback: enabled });
    if (enabled) void triggerHaptic('success');
  };

  const handleReduceMotion = (enabled: boolean) => {
    // Authoritative store is useTheme; mirror into the mobile config blob so
    // surfaces that read it directly (MainLayout, players) stay in sync.
    setReduceMotion(enabled);
    updateConfig({ reduceMotion: enabled });
  };

  const handleKeepAwake = (enabled: boolean) => {
    updateConfig({ keepScreenAwake: enabled });
    void applyKeepAwake(enabled);
  };

  const handleStatusBar = (style: StatusBarStyle) => {
    updateConfig({ statusBarStyle: style });
    void applyStatusBarStyle(style);
  };

  const handleOrientation = (lock: OrientationLock) => {
    updateConfig({ orientationLock: lock });
    void applyOrientation(lock);
  };

  const handleKeyboard = (mode: KeyboardResizeMode) => {
    updateConfig({ keyboardResize: mode });
    void applyKeyboardResize(mode);
  };

  const handleClearCaches = async () => {
    setClearing(true);
    try {
      const n = await clearWebCaches();
      toast.success(n > 0 ? `Cleared ${n} cache${n === 1 ? '' : 's'}` : 'Caches already empty');
    } catch {
      toast.error('Could not clear caches');
    } finally {
      if (mounted.current) setClearing(false);
    }
  };

  const handleReset = () => {
    resetConfig();
    void applyStatusBarStyle('auto');
    void applyOrientation('auto');
    void applyKeyboardResize('native');
    void applyKeepAwake(false);
    toast.success('Mobile settings reset to defaults');
  };

  const nativeBadge = isCapacitor() ? null : (
    <SettingsBadge tone="warning">Preview</SettingsBadge>
  );

  return (
    <div className="min-w-0 space-y-6">
      {!isCapacitor() && (
        <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-muted-foreground">
          You&apos;re viewing these on a non-mobile build. Preferences still save, but native
          effects (status bar, orientation, haptics) only apply inside the Android / iOS app.
        </p>
      )}

      <SettingsSection
        title="Haptics & feedback"
        description="Vibration feedback for taps, toggles, and outcomes across the app."
        action={nativeBadge}
      >
        <SettingRow
          icon={Vibrate}
          title="Haptic feedback"
          description="Buzz on navigation, selections, and completed actions."
          control={<Switch checked={config.hapticFeedback} onCheckedChange={handleHaptics} aria-label="Haptic feedback" />}
        />
      </SettingsSection>

      <SettingsSection
        title="Display & orientation"
        description="How the app fills the screen and reacts to the device shell."
      >
        <div className="flex flex-col divide-y divide-white/5">
          <SettingRow
            title="Mobile layout"
            description="Use the consistent poster grid and labeled navigation, or keep the classic shell."
            control={
              <Select value={config.mobileLayout} onValueChange={(v) => updateConfig({ mobileLayout: v as MobileLayout })}>
                <SelectTrigger className="h-9 w-36 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="focused">Focused</SelectItem>
                  <SelectItem value="classic">Classic</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <SettingRow
            title="Reduce motion"
            description="Minimize animations and transitions."
            control={<Switch checked={reduceMotion} onCheckedChange={handleReduceMotion} aria-label="Reduce motion" />}
          />
          <SettingRow
            title="Keep screen awake"
            description="Prevent the screen from sleeping while the app is open."
            control={<Switch checked={config.keepScreenAwake} onCheckedChange={handleKeepAwake} aria-label="Keep screen awake" />}
          />
          <SettingRow
            title="Status bar"
            description="Icon color of the system status bar."
            control={
              <Select value={config.statusBarStyle} onValueChange={(v) => handleStatusBar(v as StatusBarStyle)}>
                <SelectTrigger className="h-9 w-36 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto</SelectItem>
                  <SelectItem value="light">Light icons</SelectItem>
                  <SelectItem value="dark">Dark icons</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <SettingRow
            title="Orientation lock"
            description="Lock the app to one orientation, or allow rotation."
            control={
              <Select value={config.orientationLock} onValueChange={(v) => handleOrientation(v as OrientationLock)}>
                <SelectTrigger className="h-9 w-36 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto</SelectItem>
                  <SelectItem value="portrait">Portrait</SelectItem>
                  <SelectItem value="landscape">Landscape</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <SettingRow
            title="Landscape in player"
            description="Rotate to landscape automatically when a video opens."
            control={
              <Switch
                checked={config.forceLandscapeInPlayer}
                onCheckedChange={(v) => updateConfig({ forceLandscapeInPlayer: v })}
                aria-label="Force landscape in player"
              />
            }
          />
          <SettingRow
            title="Keyboard resize"
            description="How the view adjusts when the soft keyboard appears."
            control={
              <Select value={config.keyboardResize} onValueChange={(v) => handleKeyboard(v as KeyboardResizeMode)}>
                <SelectTrigger className="h-9 w-36 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="native">Native</SelectItem>
                  <SelectItem value="body">Body</SelectItem>
                  <SelectItem value="ionic">Ionic</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
            }
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Notifications"
        description="Local notifications shown in the device tray."
      >
        <div className="flex flex-col divide-y divide-white/5">
          <SettingRow
            icon={Bell}
            title="Download progress"
            description="Ongoing notification while downloads run."
            control={
              <Switch
                checked={config.downloadNotifications}
                onCheckedChange={(v) => updateConfig({ downloadNotifications: v })}
                aria-label="Download progress notifications"
              />
            }
          />
          <SettingRow
            title="Download complete"
            description="Notify when a download finishes."
            control={
              <Switch
                checked={config.downloadCompleteNotifications}
                onCheckedChange={(v) => updateConfig({ downloadCompleteNotifications: v })}
                aria-label="Download complete notifications"
              />
            }
          />
          <SettingRow
            title="General notifications"
            description="Route in-app notifications to the system tray."
            control={
              <Switch
                checked={config.generalNotifications}
                onCheckedChange={(v) => updateConfig({ generalNotifications: v })}
                aria-label="General notifications"
              />
            }
          />
        </div>
      </SettingsSection>

      <Suspense fallback={null}>
        <DebridSettingsPanel />
      </Suspense>

      <SettingsSection
        title="Data saver"
        description="Cap quality to 720p, force low-memory buffers, disable autoplay and heavy preloading."
      >
        <div className="flex flex-col divide-y divide-white/5">
          <SettingRow
            title="Data saver"
            description="Best for metered links. Posters stay full-size; streams and preloads shrink."
            control={
              <Switch
                checked={config.dataSaver}
                onCheckedChange={(v) => {
                  updateConfig({ dataSaver: v });
                  if (v) void triggerHaptic('success');
                }}
                aria-label="Data saver"
              />
            }
          />
          <SettingRow
            title="Auto-download next"
            description="Queue the next episode / chapter when one finishes downloading."
            control={
              <Switch
                checked={config.autoDownloadNext}
                onCheckedChange={(v) => updateConfig({ autoDownloadNext: v })}
                aria-label="Auto-download next"
              />
            }
          />
          <SettingRow
            title="WiFi only"
            description="Only auto-download on unmetered WiFi. Manual downloads always work."
            control={
              <Switch
                checked={config.wifiOnlyDownloads}
                onCheckedChange={(v) => updateConfig({ wifiOnlyDownloads: v })}
                aria-label="WiFi only downloads"
              />
            }
          />
          <SettingRow
            title="Auto-evict watched"
            description="Free watched offline items first when storage runs low."
            control={
              <Switch
                checked={config.autoEvictWatched}
                onCheckedChange={(v) => updateConfig({ autoEvictWatched: v })}
                aria-label="Auto-evict watched"
              />
            }
          />
        </div>
      </SettingsSection>

      <SettingsSection title="Storage" description="Free up space used by cached pages and images.">
        <SettingRow
          icon={HardDrive}
          title="Clear cache"
          description="Remove cached web responses and images. Downloads are not affected."
          control={
            <button
              type="button"
              onClick={handleClearCaches}
              disabled={clearing}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
            >
              {clearing ? 'Clearing…' : 'Clear cache'}
            </button>
          }
        />
      </SettingsSection>

      <SettingsSection title="Developer" description="Expose advanced affordances for debugging.">
        <SettingRow
          icon={Code2}
          title="Developer mode"
          description="Show extra diagnostics and sideloading controls."
          control={
            <Switch
              checked={config.devMode}
              onCheckedChange={(v) => updateConfig({ devMode: v })}
              aria-label="Developer mode"
            />
          }
        />
      </SettingsSection>

      <AppUpdateSection />

      <SettingsSection title="Device" description="This device and app build.">
        <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 text-sm">
          <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-muted-foreground">
            <dt className="flex items-center gap-2"><Smartphone className="h-3.5 w-3.5" /> Model</dt>
            <dd className="text-right text-foreground">{device.model || '—'}</dd>
            <dt>Platform</dt>
            <dd className="text-right text-foreground">{device.platform || 'web'}</dd>
            <dt>OS</dt>
            <dd className="text-right text-foreground">{device.osVersion || '—'}</dd>
            <dt className="flex items-center gap-2"><Info className="h-3.5 w-3.5" /> App version</dt>
            <dd className="text-right text-foreground">
              {device.appVersion ? `${device.appVersion}${device.appBuild ? ` (${device.appBuild})` : ''}` : '—'}
            </dd>
          </dl>
        </div>
      </SettingsSection>

      <SettingsSection title="Reset" description="Restore every mobile preference to its default.">
        <SettingRow
          icon={RotateCcw}
          title="Reset mobile settings"
          description="Haptics, display, orientation, notifications, and developer mode."
          control={
            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-sm font-medium text-red-300 transition-colors hover:border-red-500/40 hover:bg-red-500/10"
            >
              Reset to defaults
            </button>
          }
        />
      </SettingsSection>
    </div>
  );
}

