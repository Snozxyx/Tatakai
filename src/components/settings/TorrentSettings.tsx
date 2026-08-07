import React, { useState, useEffect, useCallback } from 'react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Zap, Shield, Maximize, Trash2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

export function TorrentSettings() {
    const [maxConns, setMaxConns] = useState(() => Number(localStorage.getItem('tatakai_torrent_max_conns') || 3));
    const [bgBehavior, setBgBehavior] = useState(() => localStorage.getItem('tatakai_torrent_bg_behavior') || 'prompt');
    const [enableUpnp, setEnableUpnp] = useState(() => localStorage.getItem('tatakai_torrent_upnp') !== 'false');
    const [limitDownload, setLimitDownload] = useState(() => Number(localStorage.getItem('tatakai_torrent_limit_dl') || 0));
    const [limitUpload, setLimitUpload] = useState(() => Number(localStorage.getItem('tatakai_torrent_limit_ul') || 0));
    const [bandwidthSchedule, setBandwidthSchedule] = useState(() => localStorage.getItem('tatakai_bandwidth_schedule') || 'default');
    const [autoFreeSpace, setAutoFreeSpace] = useState(() => {
        const raw = localStorage.getItem('tatakai_optimize_torrent_storage_v1');
        return raw == null ? true : raw === 'true';
    });
    const [cleanupMaxCacheGb, setCleanupMaxCacheGb] = useState(() => Number(localStorage.getItem('tatakai_torrent_cleanup_max_cache_gb') || 50));
    const [cleanupMaxAgeHours, setCleanupMaxAgeHours] = useState(() => Number(localStorage.getItem('tatakai_torrent_cleanup_max_age_hours') || 72));
    const [cleanupOnPlaybackEnd, setCleanupOnPlaybackEnd] = useState(() => localStorage.getItem('tatakai_torrent_cleanup_on_end') !== 'false');
    const [torrentStoragePath, setTorrentStoragePath] = useState<string>('');
    const [torrentCachePath, setTorrentCachePath] = useState<string>('');
    const [storageLoading, setStorageLoading] = useState(false);

    const loadStoragePaths = useCallback(async () => {
        if (!(window as any).tatakaiRuntime?.getTorrentStoragePaths) return;
        setStorageLoading(true);
        try {
            const result = await (window as any).tatakaiRuntime.getTorrentStoragePaths();
            if (result?.success) {
                setTorrentStoragePath(String(result.torrentPath || ''));
                setTorrentCachePath(String(result.cachePath || ''));
            }
        } catch (err) {
            console.error('Failed to load torrent storage paths:', err);
        } finally {
            setStorageLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadStoragePaths();
    }, [loadStoragePaths]);

    const handleChangeTorrentPath = useCallback(async () => {
        if (!(window as any).electron?.selectDirectory || !(window as any).tatakaiRuntime?.setTorrentStoragePath) {
            toast.error('Torrent storage path is not available in this environment');
            return;
        }

        try {
            const selected = await (window as any).electron.selectDirectory();
            if (!selected) return;

            const result = await (window as any).tatakaiRuntime.setTorrentStoragePath(selected);
            if (result?.success) {
                setTorrentStoragePath(String(result.path || selected));
                setTorrentCachePath(String(result.path || selected));
                toast.success('Torrent storage path updated');
            } else {
                toast.error(result?.error || 'Failed to update torrent path');
            }
        } catch (err) {
            console.error('Failed to update torrent path:', err);
            toast.error('Failed to update torrent path');
        }
    }, []);

    const handleResetTorrentPath = useCallback(async () => {
        if (!(window as any).tatakaiRuntime?.setTorrentStoragePath) return;
        try {
            const result = await (window as any).tatakaiRuntime.setTorrentStoragePath('');
            if (result?.success) {
                setTorrentStoragePath(String(result.path || ''));
                setTorrentCachePath(String(result.path || ''));
                toast.success('Torrent storage path reset');
            } else {
                toast.error(result?.error || 'Failed to reset torrent path');
            }
        } catch (err) {
            console.error('Failed to reset torrent path:', err);
            toast.error('Failed to reset torrent path');
        }
    }, []);

    const handleOpenTorrentPath = useCallback(async () => {
        if (!(window as any).electron?.openPath || !torrentStoragePath) return;
        try {
            await (window as any).electron.openPath(torrentStoragePath);
        } catch (err) {
            console.error('Failed to open torrent path:', err);
            toast.error('Failed to open torrent folder');
        }
    }, [torrentStoragePath]);

    const save = () => {
        localStorage.setItem('tatakai_torrent_max_conns', String(maxConns));
        localStorage.setItem('tatakai_torrent_bg_behavior', bgBehavior);
        localStorage.setItem('tatakai_torrent_upnp', String(enableUpnp));
        localStorage.setItem('tatakai_torrent_limit_dl', String(limitDownload));
        localStorage.setItem('tatakai_torrent_limit_ul', String(limitUpload));
        localStorage.setItem('tatakai_bandwidth_schedule', bandwidthSchedule);
        localStorage.setItem('tatakai_optimize_torrent_storage_v1', String(autoFreeSpace));
        localStorage.setItem('tatakai_torrent_cleanup_max_cache_gb', String(cleanupMaxCacheGb));
        localStorage.setItem('tatakai_torrent_cleanup_max_age_hours', String(cleanupMaxAgeHours));
        localStorage.setItem('tatakai_torrent_cleanup_on_end', String(cleanupOnPlaybackEnd));

        // Sync with main process
        if ((window as any).tatakaiRuntime?.updateTorrentSettings) {
            (window as any).tatakaiRuntime.updateTorrentSettings({
                schedule: bandwidthSchedule,
                limitDownload,
                limitUpload,
                maxConns,
                enableUpnp,
                autoFreeSpace,
                cleanupMaxCacheGb,
                cleanupMaxAgeHours,
                cleanupOnPlaybackEnd,
            });
        }

        toast.success('Torrent settings saved. New sessions will use these settings.');
    };

    const clearCache = async () => {
        if (window.confirm('Clear all torrent cache and data? This will stop active sessions.')) {
            if ((window as any).tatakaiRuntime?.clearAllTorrentData) {
                const res = await (window as any).tatakaiRuntime.clearAllTorrentData();
                if (res.success) {
                    toast.success('Torrent cache cleared');
                } else {
                    toast.error('Failed to clear cache: ' + res.error);
                }
            }
        }
    };

    return (
        <div className="space-y-6 mt-8">
            <div>
                <h3 className="text-lg font-bold flex items-center gap-2 mb-2">
                    <Zap className="w-5 h-5 text-primary" />
                    Torrent Engine
                </h3>
                <p className="text-xs text-muted-foreground">Configure the internal WebTorrent engine for professional streaming.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <GlassPanel className="p-4 space-y-3 md:col-span-2">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="space-y-1">
                            <Label className="text-xs font-bold uppercase tracking-widest">Torrent Storage Location</Label>
                            <p className="text-[10px] text-muted-foreground">
                                Where torrent files and cache are stored. New sessions use this path.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={handleOpenTorrentPath} disabled={!torrentStoragePath || storageLoading}>
                                Open
                            </Button>
                            <Button size="sm" onClick={handleChangeTorrentPath} disabled={storageLoading}>
                                Change
                            </Button>
                        </div>
                    </div>
                    <Input
                        value={storageLoading ? 'Loading...' : (torrentStoragePath || 'Default (app data)')}
                        readOnly
                        className="bg-white/5 border-white/10"
                    />
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>Cache: {torrentCachePath || 'Default'}</span>
                        <Button size="sm" variant="ghost" onClick={handleResetTorrentPath} disabled={storageLoading}>
                            Reset
                        </Button>
                    </div>
                </GlassPanel>
                <GlassPanel className="p-4 space-y-4">
                    <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase tracking-widest">Max Connections</Label>
                        <div className="flex items-center gap-4">
                            <Slider 
                                value={[maxConns]} 
                                min={1} 
                                max={500} 
                                step={1} 
                                onValueChange={([v]) => setMaxConns(v)}
                                className="flex-1"
                            />
                            <span className="text-sm font-mono w-8">{maxConns}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">Lower values reduce connections; higher values can improve speed but use more CPU/RAM.</p>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label className="text-xs font-bold uppercase tracking-widest">Enable UPnP</Label>
                            <p className="text-[10px] text-muted-foreground">Automatic port forwarding for better connectivity.</p>
                        </div>
                        <Switch checked={enableUpnp} onCheckedChange={setEnableUpnp} />
                    </div>
                </GlassPanel>

                <GlassPanel className="p-4 space-y-4">
                    <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase tracking-widest">Background Behavior</Label>
                        <select 
                            value={bgBehavior} 
                            onChange={(e) => setBgBehavior(e.target.value)}
                            className="w-full bg-background border border-white/10 rounded-md p-2 text-sm outline-none focus:border-primary/50"
                        >
                            <option value="prompt">Always Prompt</option>
                            <option value="keep">Keep Running (Background)</option>
                            <option value="stop">Stop Automatically</option>
                        </select>
                        <p className="text-[10px] text-muted-foreground">What to do when you leave the watch page.</p>
                    </div>
                </GlassPanel>

                <GlassPanel className="p-4 space-y-4">
                    <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase tracking-widest">Download Limit (MB/s)</Label>
                        <Input 
                            type="number" 
                            value={limitDownload} 
                            onChange={(e) => setLimitDownload(Number(e.target.value))}
                            placeholder="0 for unlimited"
                            className="bg-white/5 border-white/10"
                        />
                    </div>
                </GlassPanel>

                <GlassPanel className="p-4 space-y-4">
                    <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase tracking-widest">Upload Limit (MB/s)</Label>
                        <Input 
                            type="number" 
                            value={limitUpload} 
                            onChange={(e) => setLimitUpload(Number(e.target.value))}
                            placeholder="0 for unlimited"
                            className="bg-white/5 border-white/10"
                        />
                    </div>
                </GlassPanel>

                <GlassPanel className="p-4 space-y-4">
                    <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase tracking-widest">Bandwidth Schedule</Label>
                        <select 
                            value={bandwidthSchedule} 
                            onChange={(e) => setBandwidthSchedule(e.target.value)}
                            className="w-full bg-background border border-white/10 rounded-md p-2 text-sm outline-none focus:border-primary/50"
                        >
                            <option value="default">Standard (Adaptive)</option>
                            <option value="night-owl">Night Owl (Max speed 2AM-7AM)</option>
                            <option value="gaming">Gaming (Minimum Latency)</option>
                        </select>
                        <p className="text-[10px] text-muted-foreground">Automatically adjusts engine behavior based on time of day.</p>
                    </div>
                </GlassPanel>

                <GlassPanel className="p-4 space-y-4 md:col-span-2">
                    <div className="flex items-center justify-between gap-4">
                        <div className="space-y-1">
                            <Label className="text-xs font-bold uppercase tracking-widest">Free Torrent Space Automatically</Label>
                            <p className="text-[10px] text-muted-foreground">
                                Deletes temporary torrent data after usage and trims old cache without touching active sessions.
                            </p>
                        </div>
                        <Switch checked={autoFreeSpace} onCheckedChange={setAutoFreeSpace} />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Max Cache (GB)</Label>
                            <Input
                                type="number"
                                min={1}
                                value={cleanupMaxCacheGb}
                                onChange={(e) => setCleanupMaxCacheGb(Number(e.target.value))}
                                className="bg-white/5 border-white/10"
                                disabled={!autoFreeSpace}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Unused Age (hours)</Label>
                            <Input
                                type="number"
                                min={1}
                                value={cleanupMaxAgeHours}
                                onChange={(e) => setCleanupMaxAgeHours(Number(e.target.value))}
                                className="bg-white/5 border-white/10"
                                disabled={!autoFreeSpace}
                            />
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                            <div>
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">After playback</Label>
                                <p className="text-[10px] text-muted-foreground">Remove temporary files when a session stops.</p>
                            </div>
                            <Switch
                                checked={cleanupOnPlaybackEnd}
                                onCheckedChange={setCleanupOnPlaybackEnd}
                                disabled={!autoFreeSpace}
                            />
                        </div>
                    </div>
                </GlassPanel>
            </div>

            <div className="flex gap-4">
                <Button onClick={save} className="flex-1 font-bold">
                    Save Torrent Config
                </Button>
                <Button variant="outline" onClick={clearCache} className="border-destructive/20 text-destructive hover:bg-destructive/5 font-bold">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Clear Cache
                </Button>
            </div>
        </div>
    );
}
