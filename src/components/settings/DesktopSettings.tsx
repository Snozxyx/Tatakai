import { useState, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';

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
    Laptop,
    Settings2,
    PlayCircle,
    Cpu,
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
import { isDiscordRpcEnabled } from '@/lib/discordRpc';

import { useIsNativeApp } from '@/hooks/ui/useIsNativeApp';

export function DesktopSettings() {
    const isNative = useIsNativeApp();

    const [downloadPath, setDownloadPath] = useState<string>('');
    const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
    const [devMode, setDevMode] = useState(false);
    const [autoLaunch, setAutoLaunch] = useState(false);

    const [updateAvailable, setUpdateAvailable] = useState<any>(null);

    const [downloadProgress, setDownloadProgress] = useState<number>(0);

    const [isDownloading, setIsDownloading] = useState(false);

    const [updateReady, setUpdateReady] = useState(false);

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
    const [discordRpcEnabled, setDiscordRpcEnabled] = useState(() => isDiscordRpcEnabled());

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
                onUpdaterEvent((data: any) => {
                    console.log('Updater event:', data);

                    switch (data.type) {
                        case 'update-available':
                            setUpdateAvailable(data.info);
                            setIsCheckingUpdate(false);
                            break;

                        case 'update-not-available':
                            setUpdateAvailable(null);
                            setIsCheckingUpdate(false);

                            toast.success(
                                'You are using the latest version'
                            );
                            break;

                        case 'download-progress':
                            setIsDownloading(true);
                            setDownloadProgress(
                                data.progress.percent
                            );
                            break;

                        case 'update-downloaded':
                            setIsDownloading(false);
                            setUpdateReady(true);

                            toast.success(
                                'Update downloaded. Ready to install.'
                            );
                            break;

                        case 'error':
                            setIsCheckingUpdate(false);
                            setIsDownloading(false);

                            toast.error(
                                `Updater error: ${data.error}`
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

        setUpdateAvailable(null);

        setUpdateReady(false);

        try {
            const result = await (
                window as any
            ).electron.checkForUpdates();

            if (result.status === 'dev-mode') {
                setIsCheckingUpdate(false);

                toast.info(
                    'Update check skipped in developer mode'
                );
            } else if (result.status === 'error') {
                setIsCheckingUpdate(false);

                toast.error(`Check failed: ${result.error}`);
            }
        } catch (error) {
            console.error(error);

            setIsCheckingUpdate(false);

            toast.error('Failed to check for updates');
        }
    };

    const handleDownloadUpdate = () => {
        (window as any).electron.downloadUpdate();

        setIsDownloading(true);
    };

    const handleQuitAndInstall = () => {
        (window as any).electron.quitAndInstall();
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
        <GlassPanel className="p-6">
            <h2 className="font-display text-xl font-semibold mb-8 flex items-center gap-2">
                <Laptop className="w-5 h-5 text-primary" />
                Desktop Application
            </h2>

            <div className="space-y-8">
                {/* GENERAL */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Settings2 className="w-4 h-4 text-primary" />

                        <h3 className="font-semibold">General</h3>
                    </div>

                    {(window as any).electron?.setAutoLaunch && (
                        <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30">
                            <div>
                                <p className="font-medium">
                                    Launch at Startup
                                </p>

                                <p className="text-sm text-muted-foreground">
                                    Automatically start Tatakai
                                    when you log in
                                </p>
                            </div>

                            <Switch
                                checked={autoLaunch}
                                onCheckedChange={
                                    handleAutoLaunchToggle
                                }
                            />
                        </div>
                    )}

                    <div className="p-4 rounded-xl bg-muted/30">
                        <label className="text-sm font-medium mb-3 block">
                            Download Location
                        </label>

                        <div className="flex gap-2">
                            <div className="flex-1 px-3 py-2 rounded-md bg-background/50 border border-border text-sm font-mono truncate">
                                {downloadPath || 'Default'}
                            </div>

                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                    (window as any).electron.openPath(
                                        downloadPath
                                    )
                                }
                                title="Open Folder"
                            >
                                <ExternalLink className="w-4 h-4" />
                            </Button>

                            <Button
                                variant="outline"
                                onClick={handleSelectDirectory}
                            >
                                <FolderOpen className="w-4 h-4 mr-2" />
                                Change
                            </Button>
                        </div>

                        <p className="text-xs text-muted-foreground mt-2">
                            Episodes will be saved to this
                            folder organized by anime title.
                        </p>
                    </div>
                </section>

                {/* PLAYBACK */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2">
                        <PlayCircle className="w-4 h-4 text-primary" />

                        <h3 className="font-semibold">
                            Playback & Streaming
                        </h3>
                    </div>

                    <div className="p-4 rounded-xl bg-muted/30">
                        <ExternalPlayerSettings />
                    </div>

                    <div className="p-4 rounded-xl bg-muted/30">
                        <DebridSettingsPanel />
                    </div>

                    <div className="p-4 rounded-xl bg-muted/30">
                        <TorrentSettings />
                    </div>

                    <div className="p-4 rounded-xl bg-muted/30 space-y-4">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <p className="font-medium">Discord Rich Presence</p>
                                <p className="text-xs text-muted-foreground">
                                    Show what you are watching in Discord
                                </p>
                            </div>
                            <Switch
                                checked={discordRpcEnabled}
                                onCheckedChange={(checked) => {
                                    setDiscordRpcEnabled(checked);
                                    try {
                                        localStorage.setItem('tatakai_discord_rpc', String(checked));
                                    } catch {
                                        /* ignore */
                                    }
                                    if (!checked && (window as any).electron?.clearRPC) {
                                        (window as any).electron.clearRPC();
                                    }
                                    toast.success(checked ? 'Discord RPC enabled' : 'Discord RPC disabled');
                                }}
                            />
                        </div>
                    </div>

                    <HomeServerSettings />

                    <FlareSolverrSettings />

                    <div className="p-4 rounded-xl bg-muted/30">
                        <CountryPolicyPanel />
                    </div>
                </section>

                {/* SYSTEM */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-primary" />

                        <h3 className="font-semibold">System</h3>
                    </div>

                    {/* Updates */}
                    <div className="p-4 rounded-xl bg-muted/30">
                        <div className="flex items-center justify-between">
                            <div className="flex-1 mr-4">
                                <p className="font-medium">
                                    Current Version:
                                    v{__APP_VERSION__}
                                </p>

                                <p className="text-xs text-muted-foreground">
                                    You are on the stable channel
                                </p>

                                {updateAvailable && (
                                    <p className="text-xs text-green-500 mt-1 flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />

                                        Update available:
                                        v{updateAvailable.version}
                                    </p>
                                )}

                                {downloadProgress > 0 &&
                                    isDownloading && (
                                        <div className="mt-2 w-full bg-muted rounded-full h-1.5 overflow-hidden">
                                            <div
                                                className="bg-primary h-full transition-all duration-300"
                                                style={{
                                                    width: `${downloadProgress}%`,
                                                }}
                                            />
                                        </div>
                                    )}
                            </div>

                            <div className="flex gap-2">
                                {updateReady ? (
                                    <Button
                                        onClick={
                                            handleQuitAndInstall
                                        }
                                        className="bg-green-600 hover:bg-green-700"
                                    >
                                        Restart to Install
                                    </Button>
                                ) : updateAvailable &&
                                  !isDownloading ? (
                                    <Button
                                        onClick={
                                            handleDownloadUpdate
                                        }
                                    >
                                        Download v
                                        {
                                            updateAvailable.version
                                        }
                                    </Button>
                                ) : (
                                    <Button
                                        onClick={
                                            handleCheckUpdate
                                        }
                                        disabled={
                                            isCheckingUpdate ||
                                            isDownloading
                                        }
                                    >
                                        {isCheckingUpdate ? (
                                            <>
                                                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                                Checking...
                                            </>
                                        ) : isDownloading ? (
                                            <>
                                                <Download className="w-4 h-4 mr-2 animate-bounce" />
                                                {Math.round(
                                                    downloadProgress
                                                )}
                                                %
                                            </>
                                        ) : (
                                            'Check for Updates'
                                        )}
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* System Info */}
                    {systemInfo && (
                        <div className="p-4 rounded-xl bg-muted/30">
                            <p className="font-medium mb-3">
                                System Information
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">
                                            App Version
                                        </span>

                                        <Badge variant="secondary">
                                            {systemInfo.version}
                                        </Badge>
                                    </div>

                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">
                                            Platform
                                        </span>

                                        <span className="font-mono">
                                            {
                                                systemInfo.platform
                                            }{' '}
                                            (
                                            {
                                                systemInfo.arch
                                            }
                                            )
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">
                                            Electron
                                        </span>

                                        <span className="font-mono">
                                            v
                                            {
                                                systemInfo.electronVersion
                                            }
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">
                                            CPU Cores
                                        </span>

                                        <span className="font-mono">
                                            {systemInfo.cpus}
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">
                                            Total RAM
                                        </span>

                                        <span className="font-mono">
                                            {
                                                systemInfo.totalMemory
                                            }{' '}
                                            GB
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">
                                            Free RAM
                                        </span>

                                        <span className="font-mono">
                                            {
                                                systemInfo.freeMemory
                                            }{' '}
                                            GB
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </section>

                {/* DEVELOPER */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-primary" />

                        <h3 className="font-semibold">
                            Developer Tools
                        </h3>
                    </div>

                    <div className="p-4 rounded-xl bg-muted/30">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-medium">
                                    Developer Mode
                                </p>

                                <p className="text-sm text-muted-foreground">
                                    Enable advanced debugging
                                    features
                                </p>
                            </div>

                            <Switch
                                checked={devMode}
                                onCheckedChange={setDevMode}
                            />
                        </div>

                        {devMode && (
                            <div className="mt-4 pt-4 border-t border-border">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-medium">
                                            Application Logs
                                        </p>

                                        <p className="text-sm text-muted-foreground">
                                            Export logs for
                                            troubleshooting
                                        </p>
                                    </div>

                                    <Button
                                        variant="outline"
                                        onClick={
                                            handleExportLogs
                                        }
                                    >
                                        <FileText className="w-4 h-4 mr-2" />
                                        Export Logs
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Runtime Diagnostics */}
                    <div className="p-4 rounded-xl bg-muted/30 space-y-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-medium">
                                    Runtime Diagnostics
                                </p>

                                <p className="text-sm text-muted-foreground">
                                    Local runtime/proxy events
                                </p>
                            </div>

                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                    setRuntimeEvents([])
                                }
                            >
                                Clear
                            </Button>
                        </div>

                        <div className="max-h-44 overflow-auto rounded-md border border-border/50 bg-background/50">
                            {runtimeEvents.length === 0 ? (
                                <div className="p-3 text-xs text-muted-foreground">
                                    No runtime events yet.
                                </div>
                            ) : (
                                <ul className="divide-y divide-border/40">
                                    {runtimeEvents.map(
                                        (evt, idx) => (
                                            <li
                                                key={`${evt.type}-${idx}`}
                                                className="p-2 text-xs"
                                            >
                                                <div className="font-mono text-primary">
                                                    {evt.type}
                                                </div>

                                                <div className="text-muted-foreground">
                                                    {evt.ts
                                                        ? new Date(
                                                              evt.ts
                                                          ).toLocaleTimeString()
                                                        : 'now'}
                                                </div>
                                            </li>
                                        )
                                    )}
                                </ul>
                            )}
                        </div>
                    </div>

                    {/* Extension Audit */}
                    <div className="p-4 rounded-xl bg-muted/30 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="font-medium">
                                    Extension Audit Log & Sideloading
                                </p>

                                <p className="text-sm text-muted-foreground">
                                    Sideload custom modules or view load/invoke/error events
                                </p>
                            </div>

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
                        </div>

                        <div className="max-h-40 overflow-auto rounded-md border border-border/50 bg-background/50">
                            {extensionAudit.length === 0 ? (
                                <div className="p-3 text-xs text-muted-foreground">
                                    No audit entries.
                                </div>
                            ) : (
                                <ul className="divide-y divide-border/40">
                                    {extensionAudit
                                        .slice(0, 20)
                                        .map((evt, idx) => (
                                            <li
                                                key={`${evt.event}-${idx}`}
                                                className="p-2 text-xs"
                                            >
                                                <div className="font-mono text-primary">
                                                    {evt.event}
                                                </div>

                                                <div className="text-muted-foreground">
                                                    {evt.extensionId
                                                        ? `ext=${evt.extensionId} · `
                                                        : ''}
                                                    {evt.ts
                                                        ? new Date(
                                                              evt.ts
                                                          ).toLocaleTimeString()
                                                        : ''}
                                                </div>
                                            </li>
                                        ))}
                                </ul>
                            )}
                        </div>
                    </div>

                    {/* Warp Log */}
                    <div className="p-4 rounded-xl bg-muted/30 space-y-3">
                        <div>
                            <p className="font-medium">
                                WARP Routing Log
                            </p>

                            <p className="text-sm text-muted-foreground">
                                Recent route decisions
                            </p>
                        </div>

                        <div className="max-h-36 overflow-auto rounded-md border border-border/50 bg-background/50">
                            {warpLog.length === 0 ? (
                                <div className="p-3 text-xs text-muted-foreground">
                                    No routing entries.
                                </div>
                            ) : (
                                <ul className="divide-y divide-border/40">
                                    {warpLog
                                        .slice(0, 20)
                                        .map((evt, idx) => (
                                            <li
                                                key={`${evt.host}-${idx}`}
                                                className="p-2 text-xs"
                                            >
                                                <div className="font-mono text-primary">
                                                    {evt.host ||
                                                        'unknown-host'}
                                                </div>

                                                <div className="text-muted-foreground">
                                                    {evt.routed
                                                        ? 'routed via warp'
                                                        : 'direct'}{' '}
                                                    ·{' '}
                                                    {evt.mode ||
                                                        'auto'}
                                                </div>
                                            </li>
                                        ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </section>

                {/* DANGER ZONE */}
                {(window as any).electron?.resetAppData && (
                    <section className="space-y-4">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-destructive" />

                            <h3 className="font-semibold text-destructive">
                                Danger Zone
                            </h3>
                        </div>

                        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <AlertTriangle className="w-5 h-5 text-destructive" />

                                    <div>
                                        <p className="font-medium text-destructive">
                                            Reset Application
                                        </p>

                                        <p className="text-sm text-muted-foreground">
                                            Clear all settings,
                                            cache, and downloaded
                                            content
                                        </p>
                                    </div>
                                </div>

                                <Button
                                    variant="destructive"
                                    onClick={() =>
                                        setShowResetDialog(true)
                                    }
                                >
                                    <RotateCcw className="w-4 h-4 mr-2" />
                                    Reset App
                                </Button>
                            </div>
                        </div>
                    </section>
                )}
            </div>

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
        </GlassPanel>
    );
}