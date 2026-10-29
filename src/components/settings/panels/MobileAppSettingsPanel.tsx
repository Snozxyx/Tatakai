import { BetaChannelSettings } from '../BetaChannelSettings';
import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { normalizeUpdateState } from '@/core/update/normalized-update';
import { ReleaseDetails } from '../ReleaseDetails';
import { clearMediaMetadataCache } from '@/lib/queryClient';
import { memo, Suspense, lazy, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CapacitorHttp } from '@capacitor/core';
import { DownloadResumeSetting } from '@/components/settings/DownloadResumeSetting';
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
  await clearMediaMetadataCache();
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
  useUiTranslation();
  const mobileUpdate = useMobileUpdateState();
  const release = normalizeUpdateState(mobileUpdate, __APP_VERSION__);
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
      title={uiI18n.t('app.app_updates_16213f85')}
      description={uiI18n.t('app.check_github_releases_and_install_mobile_updates_b4f33277')}
      action={
        mobileUpdate.phase === 'available' || mobileUpdate.phase === 'downloaded' || mobileUpdate.phase === 'downloading'
          ? <SettingsBadge tone="warning">{uiI18n.t('app.update_available_21f1865b')}</SettingsBadge>
          : mobileUpdate.phase === 'current'
            ? <SettingsBadge>{uiI18n.t('app.up_to_date_82fb1d51')}</SettingsBadge>
            : undefined
      }
    >
      <SettingRow
        icon={Download}
        title={
          mobileUpdate.phase === 'available'
            ? uiI18n.t('app.tatakai_i18n_value_0_is_available_ebdd15b3', { value0: mobileUpdate.latestVersion })
            : mobileUpdate.phase === 'downloading'
              ? uiI18n.t('app.downloading_i18n_value_0_i18n_value_1_53326607', { value0: mobileUpdate.latestVersion, value1: Math.round(Number(mobileUpdate.progress ?? 0)) })
              : mobileUpdate.phase === 'downloaded' || mobileUpdate.phase === 'installing'
                ? uiI18n.t('app.tatakai_i18n_value_0_is_ready_to_install_3e1516d8', { value0: mobileUpdate.latestVersion })
                : uiI18n.t('app.check_for_updates_736b9062')
        }
        description={
          isIOS()
            ? uiI18n.t('app.ios_releases_are_unsigned_download_the_ipa_then__6b78019d')
            : autoCapable || mobileUpdate.phase === 'downloading' || mobileUpdate.phase === 'downloaded'
              ? uiI18n.t('app.android_updates_download_and_install_inside_the__ea8c56b1')
              : uiI18n.t('app.android_updates_open_the_latest_release_so_you_c_0c82d718')
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
                {uiI18n.t('app.cancel_77dfd213')}
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
                ? uiI18n.t('app.checking_97876b83')
                : mobileUpdate.phase === 'available'
                  ? autoCapable ? uiI18n.t('app.download_a479c9c3') : uiI18n.t('app.open_releases_afdf6661')
                  : mobileUpdate.phase === 'downloading'
                    ? uiI18n.t('app.i18n_value_0_cac4fa79', { value0: Math.round(Number(mobileUpdate.progress ?? 0)) })
                    : mobileUpdate.phase === 'downloaded'
                      ? uiI18n.t('app.install_fd6c3ebf')
                      : mobileUpdate.phase === 'installing'
                        ? uiI18n.t('app.opening_b1b8530b')
                        : uiI18n.t('app.check_now_2ce5dd0d')}
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
          {mobileUpdate.message || uiI18n.t('app.the_update_check_could_not_be_completed_8fe17d8b')}
        </p>
      )}
      <SettingRow
        icon={ScrollText}
        title={uiI18n.t('app.what_s_new_4d8dc5fe')}
        description={uiI18n.t('app.read_the_changelog_for_this_version_db98e369')}
        control={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => openSettings('changelog')}
            className="gap-2"
          >
            <ScrollText className="h-4 w-4" />
            {uiI18n.t('app.open_cf9b7706')}
          </Button>
        }
      />
      <ReleaseDetails notes={release.releaseNotes} percentage={release.rolloutPercentage} channel={release.channel} checkedAt={release.checkedAt} />
    </SettingsSection>
  );
});

export function MobileAppSettingsPanel(_props: { section?: string }) {
  useUiTranslation();
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
      toast.success(uiI18n.t('app.cleared_web_and_title_metadata_caches_19a54106'));
    } catch {
      toast.error(uiI18n.t('app.could_not_clear_caches_5a773f47'));
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
    toast.success(uiI18n.t('app.mobile_settings_reset_to_defaults_9da9e1ab'));
  };

  const nativeBadge = isCapacitor() ? null : (
    <SettingsBadge tone="warning">{uiI18n.t('app.preview_f1fbb2b4')}</SettingsBadge>
  );

  return (
    <div className="min-w-0 space-y-6">
      <BetaChannelSettings />
      {!isCapacitor() && (
        <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-muted-foreground">
          {uiI18n.t('app.you_apos_re_viewing_these_on_a_non_mobile_build__73428cbe')}
        </p>
      )}

      <SettingsSection
        title={uiI18n.t('app.haptics_feedback_ac5363a1')}
        description={uiI18n.t('app.vibration_feedback_for_taps_toggles_and_outcomes_23ca5c51')}
        action={nativeBadge}
      >
        <SettingRow
          icon={Vibrate}
          title={uiI18n.t('app.haptic_feedback_b0baa915')}
          description={uiI18n.t('app.buzz_on_navigation_selections_and_completed_acti_3783e7e8')}
          control={<Switch checked={config.hapticFeedback} onCheckedChange={handleHaptics} aria-label={uiI18n.t('app.haptic_feedback_b0baa915')} />}
        />
      </SettingsSection>

      <SettingsSection
        title={uiI18n.t('app.display_orientation_1bb7842e')}
        description={uiI18n.t('app.how_the_app_fills_the_screen_and_reacts_to_the_d_a363f531')}
      >
        <div className="flex flex-col divide-y divide-white/5">
          <SettingRow
            title={uiI18n.t('app.mobile_layout_39dde171')}
            description={uiI18n.t('app.refreshed_adds_a_cinematic_spotlight_glass_heade_a2b3aafb')}
            control={
              <Select value={config.mobileLayout} onValueChange={(value) => updateConfig({ mobileLayout: value === 'classic' ? 'classic' : 'refreshed' })}>
                <SelectTrigger className="h-11 w-36 rounded-lg text-sm" aria-label={uiI18n.t('app.mobile_layout_39dde171')}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="refreshed">{uiI18n.t('app.refreshed_b583face')}</SelectItem>
                  <SelectItem value="classic">{uiI18n.t('app.classic_130cd7fe')}</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <SettingRow
            title={uiI18n.t('app.reduce_motion_25a5aef5')}
            description={uiI18n.t('app.minimize_animations_and_transitions_e82ddf56')}
            control={<Switch checked={reduceMotion} onCheckedChange={handleReduceMotion} aria-label={uiI18n.t('app.reduce_motion_25a5aef5')} />}
          />
          <SettingRow
            title={uiI18n.t('app.keep_screen_awake_e4656630')}
            description={uiI18n.t('app.prevent_the_screen_from_sleeping_while_the_app_i_4a864c8a')}
            control={<Switch checked={config.keepScreenAwake} onCheckedChange={handleKeepAwake} aria-label={uiI18n.t('app.keep_screen_awake_e4656630')} />}
          />
          <SettingRow
            title={uiI18n.t('app.status_bar_31b8336a')}
            description={uiI18n.t('app.icon_color_of_the_system_status_bar_1f2c6957')}
            control={
              <Select value={config.statusBarStyle} onValueChange={(v) => handleStatusBar(v as StatusBarStyle)}>
                <SelectTrigger className="h-9 w-36 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">{uiI18n.t('app.auto_c614ba7c')}</SelectItem>
                  <SelectItem value="light">{uiI18n.t('app.light_icons_ae976f23')}</SelectItem>
                  <SelectItem value="dark">{uiI18n.t('app.dark_icons_58ad4f8f')}</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <SettingRow
            title={uiI18n.t('app.orientation_lock_189da7d6')}
            description={uiI18n.t('app.lock_the_app_to_one_orientation_or_allow_rotatio_9e62e7c3')}
            control={
              <Select value={config.orientationLock} onValueChange={(v) => handleOrientation(v as OrientationLock)}>
                <SelectTrigger className="h-9 w-36 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">{uiI18n.t('app.auto_c614ba7c')}</SelectItem>
                  <SelectItem value="portrait">{uiI18n.t('app.portrait_92b6b1bf')}</SelectItem>
                  <SelectItem value="landscape">{uiI18n.t('app.landscape_7dc4bea6')}</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <SettingRow
            title={uiI18n.t('app.landscape_in_player_5a1b624b')}
            description={uiI18n.t('app.rotate_to_landscape_automatically_when_a_video_o_b79b9186')}
            control={
              <Switch
                checked={config.forceLandscapeInPlayer}
                onCheckedChange={(v) => updateConfig({ forceLandscapeInPlayer: v })}
                aria-label={uiI18n.t('app.force_landscape_in_player_c383ff26')}
              />
            }
          />
          <SettingRow
            title={uiI18n.t('app.keyboard_resize_9dc46a00')}
            description={uiI18n.t('app.how_the_view_adjusts_when_the_soft_keyboard_appe_09d13a97')}
            control={
              <Select value={config.keyboardResize} onValueChange={(v) => handleKeyboard(v as KeyboardResizeMode)}>
                <SelectTrigger className="h-9 w-36 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="native">{uiI18n.t('app.native_4fc6e7f7')}</SelectItem>
                  <SelectItem value="body">{uiI18n.t('app.body_718a7e8a')}</SelectItem>
                  <SelectItem value="ionic">{uiI18n.t('app.ionic_bbbb4d77')}</SelectItem>
                  <SelectItem value="none">{uiI18n.t('app.none_6eef6648')}</SelectItem>
                </SelectContent>
              </Select>
            }
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title={uiI18n.t('app.notifications_753a22b2')}
        description={uiI18n.t('app.local_notifications_shown_in_the_device_tray_0dff312b')}
      >
        <div className="flex flex-col divide-y divide-white/5">
          <SettingRow
            icon={Bell}
            title={uiI18n.t('app.download_progress_9c8fe84b')}
            description={uiI18n.t('app.ongoing_notification_while_downloads_run_8e47e684')}
            control={
              <Switch
                checked={config.downloadNotifications}
                onCheckedChange={(v) => updateConfig({ downloadNotifications: v })}
                aria-label={uiI18n.t('app.download_progress_notifications_8f3e293a')}
              />
            }
          />
          <SettingRow
            title={uiI18n.t('app.download_complete_95efb337')}
            description={uiI18n.t('app.notify_when_a_download_finishes_67800420')}
            control={
              <Switch
                checked={config.downloadCompleteNotifications}
                onCheckedChange={(v) => updateConfig({ downloadCompleteNotifications: v })}
                aria-label={uiI18n.t('app.download_complete_notifications_a69e19e2')}
              />
            }
          />
          <SettingRow
            title={uiI18n.t('app.general_notifications_0694e086')}
            description={uiI18n.t('app.route_in_app_notifications_to_the_system_tray_347ab8dd')}
            control={
              <Switch
                checked={config.generalNotifications}
                onCheckedChange={(v) => updateConfig({ generalNotifications: v })}
                aria-label={uiI18n.t('app.general_notifications_0694e086')}
              />
            }
          />
        </div>
      </SettingsSection>

      <Suspense fallback={null}>
        <DebridSettingsPanel />
      </Suspense>

      <SettingsSection title={uiI18n.t('app.cloudflare_a5b966cd')} description={uiI18n.t('app.try_to_resolve_provider_challenges_before_retryi_d2842567')}>
        <SettingRow title={uiI18n.t('app.resolve_challenges_538c5675')} description={uiI18n.t('app.reuse_clearance_cookies_from_an_on_device_browse_b5e5a10a')}
          control={<Switch checked={config.cloudflareBypass} onCheckedChange={(cloudflareBypass) => updateConfig({ cloudflareBypass })} aria-label={uiI18n.t('app.resolve_cloudflare_challenges_9fa40ba4')} />} />
        <label className="mt-3 block text-sm">
          {uiI18n.t('app.flaresolverr_server_optional_5d41ae0f')}
          <input type="url" defaultValue={config.flaresolverrUrl} key={config.flaresolverrUrl}
            placeholder="http://192.168.1.10:8191" aria-label={uiI18n.t('app.flaresolverr_server_url_95a5bc1b')}
            className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2"
            onBlur={(event) => {
              const value = event.target.value.trim();
              try {
                if (value && !['http:', 'https:'].includes(new URL(value).protocol)) throw new Error(uiI18n.t('app.protocol_6e9b4af6'));
                updateConfig({ flaresolverrUrl: value });
              } catch { toast.error(uiI18n.t('app.enter_a_valid_http_or_https_server_url_04ec9e83')); }
            }} />
        </label>
        {config.flaresolverrUrl && <Button variant="outline" size="sm" className="mt-3" onClick={async (event) => {
          const button = event.currentTarget;
          button.disabled = true;
          try {
            const endpoint = config.flaresolverrUrl.replace(/\/v1\/?$/, '').replace(/\/$/, '');
            const response = await CapacitorHttp.get({ url: endpoint, connectTimeout: 5000, readTimeout: 5000 });
            if (response.status !== 200 || !JSON.stringify(response.data).toLowerCase().includes('flaresolverr')) throw new Error(uiI18n.t('app.unreachable_408e9edf'));
            toast.success(uiI18n.t('app.flaresolverr_is_reachable_65cb3e26'));
          } catch { toast.error(uiI18n.t('app.could_not_reach_flaresolverr_check_the_server_ur_536a72db')); }
          finally { button.disabled = false; }
        }}>{uiI18n.t('app.test_connection_ccf66f07')}</Button>}
        <p className="mt-2 text-xs text-muted-foreground">{uiI18n.t('app.leave_blank_to_use_the_on_device_browser_a_confi_d57284ef')}</p>
      </SettingsSection>

      <SettingsSection title={uiI18n.t('mobileCloudProxy.sectionTitle')} description={uiI18n.t('mobileCloudProxy.sectionDescription')}>
        <SettingRow
          title={uiI18n.t('mobileCloudProxy.defaultLabel')}
          description={uiI18n.t('mobileCloudProxy.defaultDescription')}
          control={<Switch checked={config.cloudProxyByDefault} onCheckedChange={value => updateConfig({ cloudProxyByDefault: value })} aria-label={uiI18n.t('mobileCloudProxy.defaultLabel')} />}
        />
      </SettingsSection>

      <SettingsSection
        title={uiI18n.t('app.data_saver_07147bcc')}
        description={uiI18n.t('app.cap_quality_to_720p_force_low_memory_buffers_dis_2c25402b')}
      >
        <div className="flex flex-col divide-y divide-white/5">
          <SettingRow
            title={uiI18n.t('app.data_saver_07147bcc')}
            description={uiI18n.t('app.best_for_metered_links_posters_stay_full_size_st_4af3a780')}
            control={
              <Switch
                checked={config.dataSaver}
                onCheckedChange={(v) => {
                  updateConfig({ dataSaver: v });
                  if (v) void triggerHaptic('success');
                }}
                aria-label={uiI18n.t('app.data_saver_07147bcc')}
              />
            }
          />
          <SettingRow
            title={uiI18n.t('app.auto_download_next_b31a103e')}
            description={uiI18n.t('app.queue_the_next_episode_chapter_when_one_finishes_86779ce7')}
            control={
              <Switch
                checked={config.autoDownloadNext}
                onCheckedChange={(v) => updateConfig({ autoDownloadNext: v })}
                aria-label={uiI18n.t('app.auto_download_next_b31a103e')}
              />
            }
          />
          <SettingRow
            title={uiI18n.t('app.wifi_only_f4f241e2')}
            description={uiI18n.t('app.only_auto_download_on_unmetered_wifi_manual_down_eaec6f25')}
            control={
              <Switch
                checked={config.wifiOnlyDownloads}
                onCheckedChange={(v) => updateConfig({ wifiOnlyDownloads: v })}
                aria-label={uiI18n.t('app.wifi_only_downloads_38b691c8')}
              />
            }
          />
          <SettingRow
            title={uiI18n.t('app.auto_evict_watched_90609d00')}
            description={uiI18n.t('app.free_watched_offline_items_first_when_storage_ru_838c60fd')}
            control={
              <Switch
                checked={config.autoEvictWatched}
                onCheckedChange={(v) => updateConfig({ autoEvictWatched: v })}
                aria-label={uiI18n.t('app.auto_evict_watched_90609d00')}
              />
            }
          />
        </div>
      </SettingsSection>

      <DownloadResumeSetting />
      <SettingsSection title={uiI18n.t('app.storage_9e092dda')} description={uiI18n.t('app.free_up_space_used_by_cached_pages_and_images_3262a695')}>
        <SettingRow
          icon={HardDrive}
          title={uiI18n.t('app.clear_cache_22bc1a4e')}
          description={uiI18n.t('app.remove_saved_title_metadata_web_responses_and_im_3890f79c')}
          control={
            <button
              type="button"
              onClick={handleClearCaches}
              disabled={clearing}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
            >
              {clearing ? uiI18n.t('app.clearing_bc7a2b58') : uiI18n.t('app.clear_cache_22bc1a4e')}
            </button>
          }
        />
      </SettingsSection>

      <SettingsSection title={uiI18n.t('app.developer_7e08ebec')} description={uiI18n.t('app.expose_advanced_affordances_for_debugging_dad721ae')}>
        <SettingRow
          icon={Code2}
          title={uiI18n.t('app.developer_mode_98322696')}
          description={uiI18n.t('app.show_extra_diagnostics_and_sideloading_controls_0965075a')}
          control={
            <Switch
              checked={config.devMode}
              onCheckedChange={(v) => updateConfig({ devMode: v })}
              aria-label={uiI18n.t('app.developer_mode_98322696')}
            />
          }
        />
      </SettingsSection>

      <AppUpdateSection />

      <SettingsSection title={uiI18n.t('app.device_a5a74a6d')} description={uiI18n.t('app.this_device_and_app_build_b6844cd9')}>
        <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 text-sm">
          <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-muted-foreground">
            <dt className="flex items-center gap-2"><Smartphone className="h-3.5 w-3.5" /> {uiI18n.t('app.model_68c2cc7f')}</dt>
            <dd className="text-right text-foreground">{device.model || '—'}</dd>
            <dt>{uiI18n.t('app.platform_123a7f2f')}</dt>
            <dd className="text-right text-foreground">{device.platform || uiI18n.t('app.web_ca84d134')}</dd>
            <dt>{uiI18n.t('app.os_de8aa862')}</dt>
            <dd className="text-right text-foreground">{device.osVersion || '—'}</dd>
            <dt className="flex items-center gap-2"><Info className="h-3.5 w-3.5" /> {uiI18n.t('app.app_version_0e25be38')}</dt>
            <dd className="text-right text-foreground">
              {device.appVersion ? uiI18n.t('app.i18n_value_0i18n_value_1_bb0b4be1', { value0: device.appVersion, value1: device.appBuild ? ` (${device.appBuild})` : '' }) : '—'}
            </dd>
          </dl>
        </div>
      </SettingsSection>

      <SettingsSection title={uiI18n.t('app.reset_44c57abd')} description={uiI18n.t('app.restore_every_mobile_preference_to_its_default_f089e9ba')}>
        <SettingRow
          icon={RotateCcw}
          title={uiI18n.t('app.reset_mobile_settings_1dcf203f')}
          description={uiI18n.t('app.haptics_display_orientation_notifications_and_de_9f917bb5')}
          control={
            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-sm font-medium text-red-300 transition-colors hover:border-red-500/40 hover:bg-red-500/10"
            >
              {uiI18n.t('app.reset_to_defaults_ddefe47d')}
            </button>
          }
        />
      </SettingsSection>
    </div>
  );
}

