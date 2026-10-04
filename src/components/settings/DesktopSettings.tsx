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
    const isNative = useIsNativeApp();

    // The update lifecycle is owned by one app-lifetime store (fed by the Dynamic
    // Island's orchestrator), so the panel and the island never disagree — and a
    // background download that finished before this page mounted still shows the
    // correct "Restart to Install" state.
    const update = useUpdateState();
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
    const [devMode, setDevMode] = useState(false);
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
                toast.success('Logs exported successfully');
            } else {
                toast.error('Export cancelled or failed');
            }
        } catch (error) {
            console.error(error);
            toast.error('Failed to export logs');
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
                            toast.success('You are using the latest version');
                            break;

                        case 'error':
                            setIsCheckingUpdate(false);
                            toast.error(
                                `Updater error: ${data.message || 'unknown error'}`
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

                toast.success('Download location updated');
            }
        } catch (error) {
            console.error(error);
            toast.error('Failed to select directory');
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

                toast.error(`Check failed: ${result.error}`);
            }
            // Success / availability is reported asynchronously via the
            // `updater-event` broadcast handled above; nothing else to do here.
        } catch (error) {
            console.error(error);

            setIsCheckingUpdate(false);

            toast.error('Failed to check for updates');
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
            toast.error('Auto-launch feature not available');
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
                        ? 'Auto-launch enabled'
                        : 'Auto-launch disabled'
                );
            } else {
                toast.error(
                    'Failed to update auto-launch setting'
                );
            }
        } catch (error) {
            console.error(error);

            toast.error(
                'Failed to update auto-launch setting'
            );
        }
    };

    const handleResetApp = async () => {
        if (!isNative) {
            toast.error('Reset function not available');
            return;
        }

        if (!(window as any).electron?.resetAppData) {
            toast.error(
                'Reset function not available. Please restart the desktop app.'
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
                    'App data cleared. Restarting app...'
                );

                setTimeout(async () => {
                    await (window as any).electron.invoke(
                        'app-relaunch'
                    );
                }, 1500);
            } else {
                toast.error(
                    result.error || 'Failed to reset app'
                );
            }
        } catch (error) {
            console.error(error);

            toast.error('Failed to reset app');
        }

        setShowResetDialog(false);
    };

    if (!isNative) return null;

    return (
        <div className="space-y-8 min-w-0">
            {/* GENERAL */}
            <SettingsSection title="General" bodyClassName="space-y-1">
                {(window as any).electron?.setAutoLaunch && (
                    <SettingRow
                        title="Launch at Startup"
                        description="Automatically start Tatakai when you log in"
                        control={
                            <Switch
                                checked={autoLaunch}
                                onCheckedChange={handleAutoLaunchToggle}
                            />
                        }
                    />
                )}

                <SettingRow
                    title="Download Location"
                    description="Episodes will be saved to this folder organized by anime title."
                >
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex-1 basis-full sm:basis-0 min-w-0 px-3 py-2 rounded-md bg-background/50 border border-border text-sm font-mono truncate">
                            {downloadPath || 'Default'}
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="shrink-0"
                            onClick={() => (window as any).electron.openPath(downloadPath)}
                            title="Open Folder"
                        >
                            <ExternalLink className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" className="shrink-0" onClick={handleSelectDirectory}>
                            <FolderOpen className="w-4 h-4 mr-2" />
                            Change
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
                title="Discord Rich Presence"
                description="Show what you are watching in Discord"
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
                            toast.success(checked ? 'Discord RPC enabled' : 'Discord RPC disabled');
                        }}
                    />
                }
                bodyClassName="space-y-1"
            >
                {rpcSettings.enabled && (
                    [
                        { key: 'showAnimeTitle', label: 'Anime title', desc: 'e.g. "Watching Solo Leveling"' },
                        { key: 'showEpisode',    label: 'Episode number', desc: 'e.g. "Episode 8"' },
                        { key: 'showSeason',     label: 'Season number', desc: 'e.g. "S2 • Episode 8"' },
                        { key: 'showLanguage',   label: 'Language / dub info', desc: 'e.g. "English Dub"' },
                        { key: 'showProgress',   label: 'Playback progress', desc: 'Elapsed / remaining timestamps' },
                        { key: 'showButtons',    label: '"View on Tatakai" button', desc: 'Adds a clickable link to the presence' },
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
            <SettingsSection title="System" bodyClassName="space-y-1">
                <SettingRow
                    title={`Current version — v${__APP_VERSION__}`}
                    description="You are on the stable channel"
                    control={
                        <div className="flex gap-2">
                            {updateReady ? (
                                <Button onClick={handleQuitAndInstall} className="bg-success text-white hover:bg-success/90">
                                    Restart to Install
                                </Button>
                            ) : updateAvailable && !isDownloading ? (
                                <Button onClick={update.manual ? openManualUpdateDownload : handleDownloadUpdate}>
                                    {update.manual ? 'Download manually' : `Download v${updateAvailable.version}`}
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
                    {updateAvailable && (
                        <p className="text-xs text-success flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                            Update available: v{updateAvailable.version}
                            {update.manual && ' - install the latest DMG manually on macOS.'}
                        </p>
                    )}
                    {downloadProgress > 0 && isDownloading && (
                        <div className="mt-2 w-full bg-muted rounded-full h-1.5 overflow-hidden">
                            <div className="bg-primary h-full transition-all duration-300" style={{ width: `${downloadProgress}%` }} />
                        </div>
                    )}
                </SettingRow>

                {systemInfo && (
                    <SettingRow title="System information">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2 min-w-0">
                                <div className="flex items-center justify-between gap-3 text-sm">
                                    <span className="text-muted-foreground shrink-0">App Version</span>
                                    <Badge variant="secondary" className="shrink-0">{systemInfo.version}</Badge>
                                </div>
                                <div className="flex items-center justify-between gap-3 text-sm">
                                    <span className="text-muted-foreground shrink-0">Platform</span>
                                    <span className="font-mono min-w-0 truncate text-right">{systemInfo.platform} ({systemInfo.arch})</span>
                                </div>
                                <div className="flex items-center justify-between gap-3 text-sm">
                                    <span className="text-muted-foreground shrink-0">Electron</span>
                                    <span className="font-mono min-w-0 truncate text-right">v{systemInfo.electronVersion}</span>
                                </div>
                            </div>
                            <div className="space-y-2 min-w-0">
                                <div className="flex items-center justify-between gap-3 text-sm">
                                    <span className="text-muted-foreground shrink-0">CPU Cores</span>
                                    <span className="font-mono min-w-0 truncate text-right">{systemInfo.cpus}</span>
                                </div>
                                <div className="flex items-center justify-between gap-3 text-sm">
                                    <span className="text-muted-foreground shrink-0">Total RAM</span>
                                    <span className="font-mono min-w-0 truncate text-right">{systemInfo.totalMemory} GB</span>
                                </div>
                                <div className="flex items-center justify-between gap-3 text-sm">
                                    <span className="text-muted-foreground shrink-0">Free RAM</span>
                                    <span className="font-mono min-w-0 truncate text-right">{systemInfo.freeMemory} GB</span>
                                </div>
                            </div>
                        </div>
                    </SettingRow>
                )}
            </SettingsSection>

            {/* DEVELOPER */}
            <SettingsSection title="Developer Tools" bodyClassName="space-y-1">
                <SettingRow
                    title="Developer Mode"
                    description="Enable advanced debugging features"
                    control={<Switch checked={devMode} onCheckedChange={setDevMode} />}
                />

                {devMode && (
                    <SettingRow
                        title="Application Logs"
                        description="Export logs for troubleshooting"
                        control={
                            <Button variant="outline" onClick={handleExportLogs}>
                                <FileText className="w-4 h-4 mr-2" />
                                Export Logs
                            </Button>
                        }
                    />
                )}

                <SettingRow
                    title="Runtime Diagnostics"
                    description="Local runtime/proxy events"
                    control={
                        <Button variant="ghost" size="sm" onClick={() => setRuntimeEvents([])}>
                            Clear
                        </Button>
                    }
                >
                    <div className="max-h-44 overflow-auto rounded-md border border-border/50 bg-background/50">
                        {runtimeEvents.length === 0 ? (
                            <div className="p-3 text-xs text-muted-foreground">No runtime events yet.</div>
                        ) : (
                            <ul className="divide-y divide-border/40">
                                {runtimeEvents.map((evt, idx) => (
                                    <li key={`${evt.type}-${idx}`} className="p-2 text-xs">
                                        <div className="font-mono text-primary">{evt.type}</div>
                                        <div className="text-muted-foreground">
                                            {evt.ts ? new Date(evt.ts).toLocaleTimeString() : 'now'}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </SettingRow>

                <SettingRow
                    title="Extension Audit Log & Sideloading"
                    description="Sideload custom modules or view load/invoke/error events"
                    control={
                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setIsDebugOpen(true)}
                                className="h-9 px-4 rounded-xl bg-primary/10 border-primary/30 text-primary hover:bg-primary/20 hover:border-primary/50 text-xs font-bold gap-1.5"
                            >
                                <Terminal className="w-4 h-4" />
                                Test Toko Extension
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setIsSideloadOpen(true)}
                                className="h-9 px-4 rounded-xl bg-primary/10 border-primary/30 text-primary hover:bg-primary/20 hover:border-primary/50 text-xs font-bold gap-1.5"
                            >
                                <FolderUp className="w-4 h-4" />
                                Sideload Extension
                            </Button>
                        </div>
                    }
                >
                    <div className="max-h-40 overflow-auto rounded-md border border-border/50 bg-background/50">
                        {extensionAudit.length === 0 ? (
                            <div className="p-3 text-xs text-muted-foreground">No audit entries.</div>
                        ) : (
                            <ul className="divide-y divide-border/40">
                                {extensionAudit.slice(0, 20).map((evt, idx) => (
                                    <li key={`${evt.event}-${idx}`} className="p-2 text-xs">
                                        <div className="font-mono text-primary">{evt.event}</div>
                                        <div className="text-muted-foreground">
                                            {evt.extensionId ? `ext=${evt.extensionId} · ` : ''}
                                            {evt.ts ? new Date(evt.ts).toLocaleTimeString() : ''}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </SettingRow>

                <SettingRow
                    title="WARP Routing Log"
                    description="Recent route decisions"
                >
                    <div className="max-h-36 overflow-auto rounded-md border border-border/50 bg-background/50">
                        {warpLog.length === 0 ? (
                            <div className="p-3 text-xs text-muted-foreground">No routing entries.</div>
                        ) : (
                            <ul className="divide-y divide-border/40">
                                {warpLog.slice(0, 20).map((evt, idx) => (
                                    <li key={`${evt.host}-${idx}`} className="p-2 text-xs">
                                        <div className="font-mono text-primary">{evt.host || 'unknown-host'}</div>
                                        <div className="text-muted-foreground">
                                            {evt.routed ? 'routed via warp' : 'direct'} · {evt.mode || 'auto'}
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
                <SettingsSection title="Danger Zone">
                    <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
                                <div>
                                    <p className="font-medium text-destructive">Reset Application</p>
                                    <p className="text-sm text-muted-foreground">
                                        Clear all settings, cache, and downloaded content
                                    </p>
                                </div>
                            </div>
                            <Button variant="destructive" onClick={() => setShowResetDialog(true)}>
                                <RotateCcw className="w-4 h-4 mr-2" />
                                Reset App
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
                            Reset Application
                        </DialogTitle>

                        <DialogDescription className="space-y-3 pt-4">
                            <p>
                                This action will completely reset
                                the Tatakai desktop app:
                            </p>

                            <ul className="list-disc list-inside space-y-1 text-sm">
                                <li>
                                    Clear all app settings and
                                    preferences
                                </li>

                                <li>
                                    Remove download history and
                                    offline library
                                </li>

                                <li>
                                    Reset window size and
                                    position
                                </li>

                                <li>
                                    Clear cache and temporary
                                    data
                                </li>

                                <li>
                                    Require initial setup again
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
                            Cancel
                        </Button>

                        <Button
                            variant="destructive"
                            onClick={handleResetApp}
                        >
                            <RotateCcw className="w-4 h-4 mr-2" />
                            Reset App
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
