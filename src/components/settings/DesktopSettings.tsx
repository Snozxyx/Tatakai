import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { FolderOpen, RefreshCw, Download, ExternalLink, Terminal, FileText, RotateCcw, AlertTriangle, Info, Laptop } from 'lucide-react';
import { toast } from 'sonner';
import { useIsNativeApp } from '@/hooks/useIsNativeApp';

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
            const savedPath = localStorage.getItem('tatakai_download_path');
            if (savedPath) {
                setDownloadPath(savedPath);
            } else {
                (window as any).electron.getDownloadsDir().then((dir: string) => {
                    setDownloadPath(dir);
                });
            }

            // Load system info
            if ((window as any).electron.getSystemInfo) {
                (window as any).electron.getSystemInfo().then((info: any) => {
                    setSystemInfo(info);
                }).catch((error: any) => {
                    console.error('Failed to load system info:', error);
                });
            } else {
                // Fallback system info if function not available
                setSystemInfo({
                    platform: 'unknown',
                    arch: 'unknown',
                    version: '4.1.0',
                    electronVersion: 'unknown',
                    nodeVersion: 'unknown',
                    totalMemory: 0,
                    freeMemory: 0,
                    cpus: 0
                });
            }

            // Load auto-launch setting
            if ((window as any).electron.getAutoLaunch) {
                (window as any).electron.getAutoLaunch().then((result: any) => {
                    if (result.success) {
                        setAutoLaunch(result.enabled);
                    }
                }).catch((error: any) => {
                    console.error('Failed to load auto-launch setting:', error);
                });
            }

            // Setup updater listeners
            const onUpdaterEvent = (window as any).electron.onUpdaterEvent;
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
                            toast.success('You are using the latest version');
                            break;
                        case 'download-progress':
                            setIsDownloading(true);
                            setDownloadProgress(data.progress.percent);
                            break;
                        case 'update-downloaded':
                            setIsDownloading(false);
                            setUpdateReady(true);
                            toast.success('Update downloaded. Ready to install.');
                            break;
                        case 'error':
                            setIsCheckingUpdate(false);
                            setIsDownloading(false);
                            toast.error(`Updater error: ${data.error}`);
                            break;
                    }
                });
            }
        }
    }, [isNative]);

    const handleSelectDirectory = async () => {
        if (!isNative) return;
        try {
            const path = await (window as any).electron.selectDirectory();
            if (path) {
                setDownloadPath(path);
                localStorage.setItem('tatakai_download_path', path);
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
            const result = await (window as any).electron.checkForUpdates();
            if (result.status === 'dev-mode') {
                setIsCheckingUpdate(false);
                toast.info('Update check skipped in developer mode');
            } else if (result.status === 'error') {
                 setIsCheckingUpdate(false);
                 toast.error(`Check failed: ${result.error}`);
            }
            // 'checked' status will be followed by events if not dev-mode
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

    const handleAutoLaunchToggle = async (enabled: boolean) => {
        if (!(window as any).electron?.setAutoLaunch) {
            toast.error('Auto-launch feature not available');
            return;
        }
        
        try {
            const result = await (window as any).electron.setAutoLaunch(enabled);
            if (result.success) {
                setAutoLaunch(enabled);
                toast.success(enabled ? 'Auto-launch enabled' : 'Auto-launch disabled');
            } else {
                toast.error('Failed to update auto-launch setting');
            }
        } catch (error) {
            console.error(error);
            toast.error('Failed to update auto-launch setting');
        }
    };

    const handleResetApp = async () => {
        if (!isNative) {
            toast.error('Reset function not available');
            return;
        }

        // Check if function exists
        if (!(window as any).electron?.resetAppData) {
            toast.error('Reset function not available. Please restart the desktop app.');
            return;
        }
        
        try {
            toast.loading('Resetting application...');
            const result = await (window as any).electron.resetAppData();
            
            if (result.success) {
                // Clear localStorage
                localStorage.clear();
                
                toast.success('App data cleared. Restarting app...');
                
                // Use app.relaunch() to properly restart and clear locked files
                setTimeout(async () => {
                    await (window as any).electron.invoke('app-relaunch');
                }, 1500);
            } else {
                toast.error(result.error || 'Failed to reset app');
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
            <h2 className="font-display text-xl font-semibold mb-6 flex items-center gap-2">
                <Laptop className="w-5 h-5 text-primary" />
                Desktop Application
            </h2>
            
            <div className="space-y-6">
                {/* Application Settings */}
                {(window as any).electron?.setAutoLaunch && (
                    <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30">
                        <div>
                            <p className="font-medium">Launch at Startup</p>
                            <p className="text-sm text-muted-foreground">Automatically start Tatakai when you log in</p>
                        </div>
                        <Switch checked={autoLaunch} onCheckedChange={handleAutoLaunchToggle} />
                    </div>
                )}

                {/* Download Location */}
                <div className="p-4 rounded-xl bg-muted/30">
                    <label className="text-sm font-medium mb-3 block">Download Location</label>
                    <div className="flex gap-2">
                        <div className="flex-1 px-3 py-2 rounded-md bg-background/50 border border-border text-sm font-mono truncate">
                            {downloadPath || 'Default'}
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => (window as any).electron.openPath(downloadPath)} title="Open Folder">
                            <ExternalLink className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" onClick={handleSelectDirectory}>
                            <FolderOpen className="w-4 h-4 mr-2" />
                            Change
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                        Episodes will be saved to this folder organized by anime title.
                    </p>
                </div>

                {/* Updates Section */}
                <div className="p-4 rounded-xl bg-muted/30">
                    <div className="flex items-center justify-between">
                        <div className="flex-1 mr-4">
                            <p className="font-medium">Current Version: v4.1.0</p>
                            <p className="text-xs text-muted-foreground">You are on the stable channel</p>
                            {updateAvailable && (
                                 <p className="text-xs text-green-500 mt-1 flex items-center gap-1">
                                     <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                     Update available: v{updateAvailable.version}
                                 </p>
                            )}
                            {downloadProgress > 0 && isDownloading && (
                                 <div className="mt-2 w-full bg-muted rounded-full h-1.5 overflow-hidden">
                                     <div className="bg-primary h-full transition-all duration-300" style={{ width: `${downloadProgress}%` }} />
                                 </div>
                            )}
                        </div>
                        <div className="flex gap-2">
                            {updateReady ? (
                                <Button onClick={handleQuitAndInstall} variant="default" className="bg-green-600 hover:bg-green-700">
                                    Restart to Install
                                </Button>
                            ) : updateAvailable && !isDownloading ? (
                                <Button onClick={handleDownloadUpdate} variant="default">
                                    Download v{updateAvailable.version}
                                </Button>
                            ) : (
                                <Button onClick={handleCheckUpdate} disabled={isCheckingUpdate || isDownloading}>
                                    {isCheckingUpdate ? (
                                        <>
                                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                            Checking...
                                        </>
                                    ) : isDownloading ? (
                                         <>
                                            <Download className="w-4 h-4 mr-2 animate-bounce" />
                                            {Math.round(downloadProgress)}%
                                         </>
                                    ) : (
                                        'Check for Updates'
                                    )}
                                </Button>
                            )}
                        </div>
                    </div>
                </div>

                {/* System Information */}
                {systemInfo && (
                    <div className="p-4 rounded-xl bg-muted/30">
                        <p className="font-medium mb-3">System Information</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">App Version</span>
                                    <Badge variant="secondary">{systemInfo.version}</Badge>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Platform</span>
                                    <span className="font-mono">{systemInfo.platform} ({systemInfo.arch})</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Electron</span>
                                    <span className="font-mono">v{systemInfo.electronVersion}</span>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">CPU Cores</span>
                                    <span className="font-mono">{systemInfo.cpus}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Total RAM</span>
                                    <span className="font-mono">{systemInfo.totalMemory} GB</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Free RAM</span>
                                    <span className="font-mono">{systemInfo.freeMemory} GB</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Developer Mode */}
                <div className="p-4 rounded-xl bg-muted/30">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-medium">Developer Mode</p>
                            <p className="text-sm text-muted-foreground">Enable advanced debugging features</p>
                        </div>
                        <Switch checked={devMode} onCheckedChange={setDevMode} />
                    </div>
                    
                    {devMode && (
                        <div className="mt-4 pt-4 border-t border-border animate-in slide-in-from-top-2 fade-in duration-300">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-medium">Application Logs</p>
                                    <p className="text-sm text-muted-foreground">Export logs for troubleshooting</p>
                                </div>
                                <Button variant="outline" onClick={handleExportLogs}>
                                    <FileText className="w-4 h-4 mr-2" />
                                    Export Logs
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Reset Application - Dangerous */}
                {(window as any).electron?.resetAppData && (
                    <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <AlertTriangle className="w-5 h-5 text-destructive" />
                                <div>
                                    <p className="font-medium text-destructive">Reset Application</p>
                                    <p className="text-sm text-muted-foreground">Clear all settings, cache, and downloaded content</p>
                                </div>
                            </div>
                            <Button variant="destructive" onClick={() => setShowResetDialog(true)}>
                                <RotateCcw className="w-4 h-4 mr-2" />
                                Reset App
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Reset App Dialog */}
            <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-destructive">
                            <AlertTriangle className="w-5 h-5" />
                            Reset Application
                        </DialogTitle>
                        <DialogDescription className="space-y-3 pt-4">
                            <p>This action will completely reset the Tatakai desktop app:</p>
                            <ul className="list-disc list-inside space-y-1 text-sm">
                                <li>Clear all app settings and preferences</li>
                                <li>Remove download history and offline library</li>
                                <li>Reset window size and position</li>
                                <li>Clear cache and temporary data</li>
                                <li>Require initial setup again</li>
                            </ul>
                            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 mt-4">
                                <p className="text-amber-600 dark:text-amber-400 text-sm flex items-start gap-2">
                                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                    <span>The app will automatically restart after reset.</span>
                                </p>
                            </div>
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setShowResetDialog(false)}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={handleResetApp}>
                            <RotateCcw className="w-4 h-4 mr-2" />
                            Reset App
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </GlassPanel>
    );
}
