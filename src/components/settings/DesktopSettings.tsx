import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { normalizeUpdateState } from '@/core/update/normalized-update';
import { ReleaseDetails } from './ReleaseDetails';
import { useDeveloperMode } from '@/hooks/ui/useDeveloperMode';
import { useState, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { SettingsSection, SettingRow } from '@/components/settings/SettingsPrimitives';


import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';

import {
    FolderOpen,
    RefreshCw,
    Download,
    ExternalLink,
    FileText,
    RotateCcw,
    AlertTriangle,
    Terminal,
    FolderUp,
} from 'lucide-react';

import { SideloadExtensionModal } from '@/components/extensions/SideloadExtensionModal';
import { ExtensionDebugWindow } from '@/components/extensions/ExtensionDebugWindow';

import { toast } from 'sonner';

import { readStoredCountryCode } from '@/hooks/ui/useCountryPolicy';

import { CountryPolicyPanel } from '@/components/settings/CountryPolicyPanel';
import { ExternalPlayerSettings } from '@/components/settings/ExternalPlayerSettings';
import { DebridSettingsPanel } from '@/components/settings/DebridSettingsPanel';
import { TorrentSettings } from '@/components/settings/TorrentSettings';
import { HomeServerSettings } from '@/components/settings/HomeServerSettings';
import { FlareSolverrSettings } from '@/components/settings/FlareSolverrSettings';
import { getDiscordRpcSettings, saveDiscordRpcSettings, type DiscordRpcSettings } from '@/lib/discordRpc';

import { useIsNativeApp } from '@/hooks/ui/useIsNativeApp';
import { useUpdateState, resetUpdateState } from '@/core/update/update-monitor';
import { installUpdateNow, openManualUpdateDownload } from '@/core/update/useUpdateOrchestrator';

export function DesktopSettings() {
  useUiTranslation();
    const isNative = useIsNativeApp();

    // The update lifecycle is owned by one app-lifetime store (fed by the Dynamic
    // Island's orchestrator), so the panel and the island never disagree — and a
    // background download that finished before this page mounted still shows the
    // correct "Restart to Install" state.
    const update = useUpdateState();
    const release = normalizeUpdateState(update, __APP_VERSION__);
    const isDownloading = update.phase === 'downloading';
    const updateReady = update.phase === 'downloaded';
    const downloadProgress = update.progress;
    const updateAvailable =
        update.version &&
        (update.phase === 'available' || update.phase === 'downloading' || update.phase === 'downloaded')
            ? { version: update.version }
            : null;

    const [downloadPath, setDownloadPath] = useState<string>('');
    const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
    const { enabled: devMode, setEnabled: setDevMode } = useDeveloperMode();
    const [autoLaunch, setAutoLaunch] = useState(false);

    const [systemInfo, setSystemInfo] = useState<any>(null);

    const [showResetDialog, setShowResetDialog] = useState(false);

    const [countryIso2, setCountryIso2] = useState(
        () => readStoredCountryCode() || ''
    );

    const [runtimeEvents, setRuntimeEvents] = useState<
        Array<{ type: string; ts?: number; [key: string]: any }>
    >([]);

    const [extensionAudit, setExtensionAudit] = useState<Array<any>>([]);
    const [isSideloadOpen, setIsSideloadOpen] = useState(false);
    const [isDebugOpen, setIsDebugOpen] = useState(false);

    const [warpLog, setWarpLog] = useState<Array<any>>([]);
    const [rpcSettings, setRpcSettings] = useState<DiscordRpcSettings>(() => getDiscordRpcSettings());

    const handleExportLogs = async () => {
        if (!isNative) return;

        try {
            const success = await (window as any).electron.exportLogs();

            if (success) {
                toast.success(uiI18n.t('app.logs_exported_successfully_852b1517'));
            } else {
                toast.error(uiI18n.t('app.export_cancelled_or_failed_e6bea6bc'));
            }
        } catch (error) {
            console.error(error);
            toast.error(uiI18n.t('app.failed_to_export_logs_b777f66b'));
        }
    };

    useEffect(() => {
        if (isNative && (window as any).electron) {
            const savedPath = localStorage.getItem(
                'tatakai_download_path'
            );

            if (savedPath) {
                setDownloadPath(savedPath);
            } else {
                (window as any).electron
                    .getDownloadsDir()
                    .then((dir: string) => {
                        setDownloadPath(dir);
                    });
            }

            if ((window as any).electron.getSystemInfo) {
                (window as any).electron
                    .getSystemInfo()
                    .then((info: any) => {
                        setSystemInfo(info);
                    })
                    .catch((error: any) => {
                        console.error(
                            'Failed to load system info:',
                            error
                        );
                    });
            }

            if ((window as any).electron.getAutoLaunch) {
                (window as any).electron
                    .getAutoLaunch()
                    .then((result: any) => {
                        if (result.success) {
                            setAutoLaunch(result.enabled);
                        }
                    })
                    .catch((error: any) => {
                        console.error(
                            'Failed to load auto-launch setting:',
                            error
                        );
                    });
            }

            const onUpdaterEvent =
                (window as any).electron.onUpdaterEvent;

            if (onUpdaterEvent) {
                // State lives in the shared update-monitor store (see the derived
                // values above); this listener only fires the user-facing toasts
                // and clears the local "checking" spinner for the manual button.
                onUpdaterEvent((data: any) => {
                    switch (data.type) {
                        case 'available':
                        case 'mandatory-update':
                        case 'downloading':
                        case 'downloaded':
                            setIsCheckingUpdate(false);
                            break;

                        case 'not-available':
                            setIsCheckingUpdate(false);
                            toast.success(uiI18n.t('app.you_are_using_the_latest_version_34866012'));
                            break;

                        case 'error':
                            setIsCheckingUpdate(false);
                            toast.error(
                                uiI18n.t('app.updater_error_i18n_value_0_a829881d', { value0: data.message || 'unknown error' })
                            );
                            break;
                    }
                });
            }
        }
    }, [isNative]);

    useEffect(() => {
        if (
            !isNative ||
            !(window as any).tatakaiRuntime?.onPlaybackEvent
        )
            return;

        const unsubscribe = (
            window as any
        ).tatakaiRuntime.onPlaybackEvent((event: any) => {
            const type = String(event?.type || '');

            if (
                !type.startsWith('runtime-') &&
                !type.startsWith('extension-')
            )
                return;

            setRuntimeEvents((prev) => [event, ...prev].slice(0, 20));
        });

        return () => {
            if (typeof unsubscribe === 'function') unsubscribe();
        };
    }, [isNative]);

    useEffect(() => {
        if (!isNative || !(window as any).tatakaiRuntime) return;

        const load = async () => {
            try {
                const audit = await (
                    window as any
                ).tatakaiRuntime.getExtensionAuditLog?.(60);

                if (Array.isArray(audit))
                    setExtensionAudit(audit.reverse());
            } catch {}

            try {
                const log = await (
                    window as any
                ).tatakaiRuntime.getWarpRoutingLog?.();

                if (Array.isArray(log)) setWarpLog(log);
            } catch {}
        };

        void load();
    }, [isNative]);

    const handleSelectDirectory = async () => {
        if (!isNative) return;

        try {
            const path = await (
                window as any
            ).electron.selectDirectory();

            if (path) {
                setDownloadPath(path);

                localStorage.setItem(
                    'tatakai_download_path',
                    path
                );

                toast.success(uiI18n.t('app.download_location_updated_5cf4f948'));
            }
        } catch (error) {
            console.error(error);
            toast.error(uiI18n.t('app.failed_to_select_directory_02113ec4'));
        }
    };

    const handleCheckUpdate = async () => {
        setIsCheckingUpdate(true);

        // Clear the shared store so a fresh cycle starts clean.
        resetUpdateState();

        try {
            const result = await (
                window as any
            ).electron.updateCheck('stable');

            if (result?.error) {
                setIsCheckingUpdate(false);

                toast.error(uiI18n.t('app.check_failed_i18n_value_0_98d9c30b', { value0: result.error }));
            }
            // Success / availability is reported asynchronously via the
            // `updater-event` broadcast handled above; nothing else to do here.
        } catch (error) {
            console.error(error);

            setIsCheckingUpdate(false);

            toast.error(uiI18n.t('app.failed_to_check_for_updates_4c4052cd'));
        }
    };

    const handleDownloadUpdate = () => {
        // Download progress flows through the shared store via `updater-event`.
        (window as any).electron.updateDownload();
    };

    const handleQuitAndInstall = () => {
        installUpdateNow();
    };

    const handleAutoLaunchToggle = async (
        enabled: boolean
    ) => {
        if (!(window as any).electron?.setAutoLaunch) {
            toast.error(uiI18n.t('app.auto_launch_feature_not_available_8a3141a9'));
            return;
        }

        try {
            const result = await (
                window as any
            ).electron.setAutoLaunch(enabled);

            if (result.success) {
                setAutoLaunch(enabled);

                toast.success(
                    enabled
                        ? uiI18n.t('app.auto_launch_enabled_9839eb80')
                        : uiI18n.t('app.auto_launch_disabled_344551d6')
                );
            } else {
                toast.error(
                    uiI18n.t('app.failed_to_update_auto_launch_setting_71b33711')
                );
            }
        } catch (error) {
            console.error(error);

            toast.error(
                uiI18n.t('app.failed_to_update_auto_launch_setting_71b33711')
            );
        }
    };

    const handleResetApp = async () => {
        if (!isNative) {
            toast.error(uiI18n.t('app.reset_function_not_available_8aaf57b9'));
            return;
        }

        if (!(window as any).electron?.resetAppData) {
            toast.error(
                uiI18n.t('app.reset_function_not_available_please_restart_the__68c5e344')
            );
            return;
        }

        try {
            toast.loading('Resetting application...');

            const result = await (
                window as any
            ).electron.resetAppData();

            if (result.success) {
                localStorage.clear();

                toast.success(
                    uiI18n.t('app.app_data_cleared_restarting_app_24c6123d')
                );

                setTimeout(async () => {
                    await (window as any).electron.appRelaunch();
                }, 1500);
            } else {
                toast.error(
                    result.error || uiI18n.t('app.failed_to_reset_app_1c5a992e')
                );
            }
        } catch (error) {
            console.error(error);

            toast.error(uiI18n.t('app.failed_to_reset_app_1c5a992e'));
        }

        setShowResetDialog(false);
    };

    if (!isNative) return null;

    return (
        <div className="space-y-8 min-w-0">
            {/* GENERAL */}
            <SettingsSection title={uiI18n.t('app.general_9239ee2c')} bodyClassName="space-y-1">
                {(window as any).electron?.setAutoLaunch && (
                    <SettingRow
                        title={uiI18n.t('app.launch_at_startup_88d8812a')}
                        description={uiI18n.t('app.automatically_start_tatakai_when_you_log_in_0a683edb')}
                        control={
                            <Switch
                                checked={autoLaunch}
                                onCheckedChange={handleAutoLaunchToggle}
                            />
                        }
                    />
                )}

                <SettingRow
                    title={uiI18n.t('app.download_location_b82af0c9')}
                    description={uiI18n.t('app.episodes_will_be_saved_to_this_folder_organized__e077d2e6')}
                >
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex-1 basis-full sm:basis-0 min-w-0 px-3 py-2 rounded-md bg-background/50 border border-border text-sm font-mono truncate">
                            {downloadPath || uiI18n.t('app.default_808d7dca')}
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="shrink-0"
                            onClick={() => (window as any).electron.openPath(downloadPath)}
                            title={uiI18n.t('app.open_folder_027760ff')}
                        >
                            <ExternalLink className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" className="shrink-0" onClick={handleSelectDirectory}>
                            <FolderOpen className="w-4 h-4 mr-2" />
                            {uiI18n.t('app.change_64fbd995')}
                        </Button>
                    </div>
                </SettingRow>
            </SettingsSection>

            <ExternalPlayerSettings />

            <DebridSettingsPanel />

            <TorrentSettings />

            <HomeServerSettings />

            <FlareSolverrSettings />

            <CountryPolicyPanel />

            <SettingsSection
                title={uiI18n.t('app.discord_rich_presence_1ce59a08')}
                description={uiI18n.t('app.show_what_you_are_watching_in_discord_226eda86')}
                action={
                    <Switch
                        checked={rpcSettings.enabled}
                        onCheckedChange={(checked) => {
                            const next = { ...rpcSettings, enabled: checked };
                            setRpcSettings(next);
                            saveDiscordRpcSettings(next);
                            if (!checked && (window as any).electron?.clearRPC) {
                                (window as any).electron.clearRPC();
                            }
                            toast.success(checked ? uiI18n.t('app.discord_rpc_enabled_3ce8aa3c') : uiI18n.t('app.discord_rpc_disabled_5826bc7b'));
                        }}
                    />
                }
                bodyClassName="space-y-1"
            >
                {rpcSettings.enabled && (
                    [
                        { key: 'showAnimeTitle', get label() { return uiI18n.t('app.anime_title_87dc4f04'); }, desc: 'e.g. "Watching Solo Leveling"' },
                        { key: 'showEpisode',    get label() { return uiI18n.t('app.episode_number_f9410419'); }, desc: 'e.g. "Episode 8"' },
                        { key: 'showSeason',     get label() { return uiI18n.t('app.season_number_712e75c8'); }, desc: 'e.g. "S2 • Episode 8"' },
                        { key: 'showLanguage',   get label() { return uiI18n.t('app.language_dub_info_83085f80'); }, desc: 'e.g. "English Dub"' },
                        { key: 'showProgress',   get label() { return uiI18n.t('app.playback_progress_9b734216'); }, desc: 'Elapsed / remaining timestamps' },
                        { key: 'showButtons',    get label() { return uiI18n.t('app.view_on_tatakai_button_73b73c6d'); }, desc: 'Adds a clickable link to the presence' },
                    ] as Array<{ key: keyof DiscordRpcSettings; label: string; desc: string }>
                ).map(({ key, label, desc }) => (
                    <SettingRow
                        key={key}
                        title={label}
                        description={desc}
                        control={
                            <Switch
                                checked={rpcSettings[key] as boolean}
                                onCheckedChange={(checked) => {
                                    const next = { ...rpcSettings, [key]: checked };
                                    setRpcSettings(next);
                                    saveDiscordRpcSettings(next);
                                }}
                            />
                        }
                    />
                ))}
            </SettingsSection>

            {/* SYSTEM */}
            <SettingsSection title={uiI18n.t('app.system_bc0792d8')} bodyClassName="space-y-1">
                <SettingRow
                    title={uiI18n.t('app.current_version_vi18n_value_0_0829162c', { value0: __APP_VERSION__ })}
                    description={uiI18n.t('app.you_are_on_the_stable_channel_3864857b')}
                    control={
                        <div className="flex gap-2">
                            {updateReady ? (
                                <Button onClick={handleQuitAndInstall} className="bg-success text-white hover:bg-success/90">
                                    {uiI18n.t('app.restart_to_install_2ca8d8c0')}
                                </Button>
                            ) : updateAvailable && !isDownloading ? (
                                <Button onClick={update.manual ? openManualUpdateDownload : handleDownloadUpdate}>
                                    {update.manual ? uiI18n.t('app.download_manually_c68bf876') : uiI18n.t('app.download_vi18n_value_0_a7f631fe', { value0: updateAvailable.version })}
                                </Button>
                            ) : (
                                <Button onClick={handleCheckUpdate} disabled={isCheckingUpdate || isDownloading}>
                                    {isCheckingUpdate ? (
                                        <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Checking...</>
                                    ) : isDownloading ? (
                                        <><Download className="w-4 h-4 mr-2 animate-bounce" />{Math.round(downloadProgress)}%</>
                                    ) : (
                                        'Check for Updates'
                                    )}
                                </Button>
                            )}
                        </div>
                    }
                >
                    <ReleaseDetails notes={release.releaseNotes} percentage={release.rolloutPercentage} channel={release.channel} checkedAt={release.checkedAt} />
                    {updateAvailable && (
                        <p className="text-xs text-success flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                            {uiI18n.t('app.update_available_v_447e665e')}{updateAvailable.version}
                            {update.manual && uiI18n.t('app.install_the_latest_dmg_manually_on_macos_3076a1a6')}
                        </p>
                    )}
                    {downloadProgress > 0 && isDownloading && (
                        <div className="mt-2 w-full bg-muted rounded-full h-1.5 overflow-hidden">
                            <div className="bg-primary h-full transition-all duration-300" style={{ width: `${downloadProgress}%` }} />
                        </div>
                    )}
                </SettingRow>

                {systemInfo && (
                    <SettingRow title={uiI18n.t('app.system_information_b5923ed1')}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2 min-w-0">
                                <div className="flex items-center justify-between gap-3 text-sm">
                                    <span className="text-muted-foreground shrink-0">{uiI18n.t('app.app_version_055c4ce8')}</span>
                                    <Badge variant="secondary" className="shrink-0">{systemInfo.version}</Badge>
                                </div>
                                <div className="flex items-center justify-between gap-3 text-sm">
                                    <span className="text-muted-foreground shrink-0">{uiI18n.t('app.platform_123a7f2f')}</span>
                                    <span className="font-mono min-w-0 truncate text-right">{systemInfo.platform} ({systemInfo.arch})</span>
                                </div>
                                <div className="flex items-center justify-between gap-3 text-sm">
                                    <span className="text-muted-foreground shrink-0">{uiI18n.t('app.electron_32a90561')}</span>
                                    <span className="font-mono min-w-0 truncate text-right">v{systemInfo.electronVersion}</span>
                                </div>
                            </div>
                            <div className="space-y-2 min-w-0">
                                <div className="flex items-center justify-between gap-3 text-sm">
                                    <span className="text-muted-foreground shrink-0">{uiI18n.t('app.cpu_cores_8bafdfc7')}</span>
                                    <span className="font-mono min-w-0 truncate text-right">{systemInfo.cpus}</span>
                                </div>
                                <div className="flex items-center justify-between gap-3 text-sm">
                                    <span className="text-muted-foreground shrink-0">{uiI18n.t('app.total_ram_21492c7b')}</span>
                                    <span className="font-mono min-w-0 truncate text-right">{systemInfo.totalMemory} {uiI18n.t('app.gb_505a44fa')}</span>
                                </div>
                                <div className="flex items-center justify-between gap-3 text-sm">
                                    <span className="text-muted-foreground shrink-0">{uiI18n.t('app.free_ram_41fc6719')}</span>
                                    <span className="font-mono min-w-0 truncate text-right">{systemInfo.freeMemory} {uiI18n.t('app.gb_505a44fa')}</span>
                                </div>
                            </div>
                        </div>
                    </SettingRow>
                )}
            </SettingsSection>

            {/* DEVELOPER */}
            <SettingsSection title={uiI18n.t('app.developer_tools_b0608ab1')} bodyClassName="space-y-1">
                <SettingRow
                    title={uiI18n.t('app.developer_mode_324ac722')}
                    description={uiI18n.t('app.enable_advanced_debugging_features_55f0d95f')}
                    control={<Switch checked={devMode} onCheckedChange={setDevMode} />}
                />

                {devMode && (
                    <SettingRow
                        title={uiI18n.t('app.application_logs_cdd2f56a')}
                        description={uiI18n.t('app.export_logs_for_troubleshooting_8400394a')}
                        control={
                            <Button variant="outline" onClick={handleExportLogs}>
                                <FileText className="w-4 h-4 mr-2" />
                                {uiI18n.t('app.export_logs_fa7cce2c')}
                            </Button>
                        }
                    />
                )}

                <SettingRow
                    title={uiI18n.t('app.runtime_diagnostics_1e531b8f')}
                    description={uiI18n.t('app.local_runtime_proxy_events_93916c3a')}
                    control={
                        <Button variant="ghost" size="sm" onClick={() => setRuntimeEvents([])}>
                            {uiI18n.t('app.clear_719ea396')}
                        </Button>
                    }
                >
                    <div className="max-h-44 overflow-auto rounded-md border border-border/50 bg-background/50">
                        {runtimeEvents.length === 0 ? (
                            <div className="p-3 text-xs text-muted-foreground">{uiI18n.t('app.no_runtime_events_yet_cd81897e')}</div>
                        ) : (
                            <ul className="divide-y divide-border/40">
                                {runtimeEvents.map((evt, idx) => (
                                    <li key={`${evt.type}-${idx}`} className="p-2 text-xs">
                                        <div className="font-mono text-primary">{evt.type}</div>
                                        <div className="text-muted-foreground">
                                            {evt.ts ? new Date(evt.ts).toLocaleTimeString(uiI18n.language) : uiI18n.t('app.now_c9bc849a')}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </SettingRow>

                <SettingRow
                    title={uiI18n.t('app.extension_audit_log_sideloading_4ae65134')}
                    description={uiI18n.t('app.sideload_custom_modules_or_view_load_invoke_erro_338ee45d')}
                    control={
                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setIsDebugOpen(true)}
                                className="h-9 px-4 rounded-xl bg-primary/10 border-primary/30 text-primary hover:bg-primary/20 hover:border-primary/50 text-xs font-bold gap-1.5"
                            >
                                <Terminal className="w-4 h-4" />
                                {uiI18n.t('app.test_toko_extension_b427bcef')}
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setIsSideloadOpen(true)}
                                className="h-9 px-4 rounded-xl bg-primary/10 border-primary/30 text-primary hover:bg-primary/20 hover:border-primary/50 text-xs font-bold gap-1.5"
                            >
                                <FolderUp className="w-4 h-4" />
                                {uiI18n.t('app.sideload_extension_9e220d8a')}
                            </Button>
                        </div>
                    }
                >
                    <div className="max-h-40 overflow-auto rounded-md border border-border/50 bg-background/50">
                        {extensionAudit.length === 0 ? (
                            <div className="p-3 text-xs text-muted-foreground">{uiI18n.t('app.no_audit_entries_f0d72cd7')}</div>
                        ) : (
                            <ul className="divide-y divide-border/40">
                                {extensionAudit.slice(0, 20).map((evt, idx) => (
                                    <li key={`${evt.event}-${idx}`} className="p-2 text-xs">
                                        <div className="font-mono text-primary">{evt.event}</div>
                                        <div className="text-muted-foreground">
                                            {evt.extensionId ? uiI18n.t('app.ext_i18n_value_0_10ef3e0e', { value0: evt.extensionId }) : ''}
                                            {evt.ts ? new Date(evt.ts).toLocaleTimeString(uiI18n.language) : ''}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </SettingRow>

                <SettingRow
                    title={uiI18n.t('app.warp_routing_log_8d56dbeb')}
                    description={uiI18n.t('app.recent_route_decisions_966777ec')}
                >
                    <div className="max-h-36 overflow-auto rounded-md border border-border/50 bg-background/50">
                        {warpLog.length === 0 ? (
                            <div className="p-3 text-xs text-muted-foreground">{uiI18n.t('app.no_routing_entries_0237ee76')}</div>
                        ) : (
                            <ul className="divide-y divide-border/40">
                                {warpLog.slice(0, 20).map((evt, idx) => (
                                    <li key={`${evt.host}-${idx}`} className="p-2 text-xs">
                                        <div className="font-mono text-primary">{evt.host || uiI18n.t('app.unknown_host_16b7d43b')}</div>
                                        <div className="text-muted-foreground">
                                            {evt.routed ? uiI18n.t('app.routed_via_warp_faa22bd7') : uiI18n.t('app.direct_24a1733c')} · {evt.mode || uiI18n.t('app.auto_0d612c12')}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </SettingRow>
            </SettingsSection>
                

            {/* DANGER ZONE */}
            {(window as any).electron?.resetAppData && (
                <SettingsSection title={uiI18n.t('app.danger_zone_8fc83aac')}>
                    <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
                                <div>
                                    <p className="font-medium text-destructive">{uiI18n.t('app.reset_application_5d8a5040')}</p>
                                    <p className="text-sm text-muted-foreground">
                                        {uiI18n.t('app.clear_all_settings_cache_and_downloaded_content_7bb37f3b')}
                                    </p>
                                </div>
                            </div>
                            <Button variant="destructive" onClick={() => setShowResetDialog(true)}>
                                <RotateCcw className="w-4 h-4 mr-2" />
                                {uiI18n.t('app.reset_app_c9283e3e')}
                            </Button>
                        </div>
                    </div>
                </SettingsSection>
            )}

            {/* RESET DIALOG */}
            <Dialog
                open={showResetDialog}
                onOpenChange={setShowResetDialog}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-destructive">
                            <AlertTriangle className="w-5 h-5" />
                            {uiI18n.t('app.reset_application_5d8a5040')}
                        </DialogTitle>

                        <DialogDescription className="space-y-3 pt-4">
                            <p>
                                {uiI18n.t('app.this_action_will_completely_reset_the_tatakai_de_e9592390')}
                            </p>

                            <ul className="list-disc list-inside space-y-1 text-sm">
                                <li>
                                    {uiI18n.t('app.clear_all_app_settings_and_preferences_c48849bd')}
                                </li>

                                <li>
                                    {uiI18n.t('app.remove_download_history_and_offline_library_4f260b9f')}
                                </li>

                                <li>
                                    {uiI18n.t('app.reset_window_size_and_position_e0d74731')}
                                </li>

                                <li>
                                    {uiI18n.t('app.clear_cache_and_temporary_data_77c4f7e8')}
                                </li>

                                <li>
                                    {uiI18n.t('app.require_initial_setup_again_3cda2b96')}
                                </li>
                            </ul>
                        </DialogDescription>
                    </DialogHeader>

                    <DialogFooter className="gap-2">
                        <Button
                            variant="outline"
                            onClick={() =>
                                setShowResetDialog(false)
                            }
                        >
                            {uiI18n.t('app.cancel_77dfd213')}
                        </Button>

                        <Button
                            variant="destructive"
                            onClick={handleResetApp}
                        >
                            <RotateCcw className="w-4 h-4 mr-2" />
                            {uiI18n.t('app.reset_app_c9283e3e')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <SideloadExtensionModal
                isOpen={isSideloadOpen}
                onClose={() => setIsSideloadOpen(false)}
            />

            {isDebugOpen && (
                <ExtensionDebugWindow
                    onClose={() => setIsDebugOpen(false)}
                />
            )}
        </div>
    );
}
