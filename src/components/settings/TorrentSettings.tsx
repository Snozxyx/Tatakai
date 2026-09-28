import React, { useState, useEffect, useCallback } from 'react';
import { SettingsSection, SettingRow } from '@/components/settings/SettingsPrimitives';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export function TorrentSettings() {
    const confirm = useConfirm();
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
    const [customTrackers, setCustomTrackers] = useState(() => localStorage.getItem('tatakai_torrent_custom_trackers') || '');
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
        localStorage.setItem('tatakai_torrent_custom_trackers', customTrackers);

        const customTrackerList = customTrackers.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

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
                customTrackers: customTrackerList,
            });
        }

        toast.success('Torrent settings saved. New sessions will use these settings.');
    };

    const clearCache = async () => {
        if (await confirm({ title: 'Clear all torrent cache and data? This will stop active sessions.', destructive: true })) {
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
        <SettingsSection
            title="Torrent Engine"
            description="Configure the internal WebTorrent engine for professional streaming."
            bodyClassName="space-y-1"
        >
            <SettingRow
                title="Torrent Storage Location"
                description="Where torrent files and cache are stored. New sessions use this path."
                control={
                    <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={handleOpenTorrentPath} disabled={!torrentStoragePath || storageLoading}>
                            Open
                        </Button>
                        <Button size="sm" onClick={handleChangeTorrentPath} disabled={storageLoading}>
                            Change
                        </Button>
                    </div>
                }
            >
                <div className="space-y-2">
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
                </div>
            </SettingRow>
            <SettingRow
                title="Max Connections"
                description="Lower values reduce connections; higher values can improve speed but use more CPU/RAM."
            >
                <div className="flex items-center gap-4">
                    <Slider
                        value={[maxConns]}
                        min={1}
                        max={500}
                        step={1}
                        onValueChange={([v]) => setMaxConns(v)}
                        className="flex-1"
                    />
                    <span className="text-sm font-mono w-8 text-right">{maxConns}</span>
                </div>
            </SettingRow>

            <SettingRow
                title="Enable UPnP"
                description="Automatic port forwarding for better connectivity."
                control={<Switch checked={enableUpnp} onCheckedChange={setEnableUpnp} />}
            />

            <SettingRow
                title="Custom Trackers"
                description="One tracker URL per line (udp://, http(s)://, or wss://). Added alongside the built-in public trackers."
            >
                <textarea
                    value={customTrackers}
                    onChange={(e) => setCustomTrackers(e.target.value)}
                    rows={4}
                    spellCheck={false}
                    placeholder={'udp://tracker.example.com:1337/announce\nwss://tracker.example.org'}
                    className="w-full rounded-md bg-white/5 border border-white/10 px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
            </SettingRow>

            <SettingRow
                title="Background Behavior"
                description="What to do when you leave the watch page."
                control={(ids) => (
                    <Select value={bgBehavior} onValueChange={setBgBehavior}>
                        <SelectTrigger aria-labelledby={ids.labelId} aria-describedby={ids.descriptionId} className="w-52">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="prompt">Always Prompt</SelectItem>
                            <SelectItem value="keep">Keep Running (Background)</SelectItem>
                            <SelectItem value="stop">Stop Automatically</SelectItem>
                        </SelectContent>
                    </Select>
                )}
            />

            <SettingRow
                title="Download Limit (MB/s)"
                description="0 for unlimited."
                control={(ids) => (
                    <Input
                        type="number"
                        value={limitDownload}
                        onChange={(e) => setLimitDownload(Number(e.target.value))}
                        placeholder="0"
                        aria-labelledby={ids.labelId}
                        className="w-28 bg-white/5 border-white/10"
                    />
                )}
            />

            <SettingRow
                title="Upload Limit (MB/s)"
                description="0 for unlimited."
                control={(ids) => (
                    <Input
                        type="number"
                        value={limitUpload}
                        onChange={(e) => setLimitUpload(Number(e.target.value))}
                        placeholder="0"
                        aria-labelledby={ids.labelId}
                        className="w-28 bg-white/5 border-white/10"
                    />
                )}
            />

            <SettingRow
                title="Bandwidth Schedule"
                description="Automatically adjusts engine behavior based on time of day."
                control={(ids) => (
                    <Select value={bandwidthSchedule} onValueChange={setBandwidthSchedule}>
                        <SelectTrigger aria-labelledby={ids.labelId} aria-describedby={ids.descriptionId} className="w-56">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="default">Standard (Adaptive)</SelectItem>
                            <SelectItem value="night-owl">Night Owl (Max speed 2AM-7AM)</SelectItem>
                            <SelectItem value="gaming">Gaming (Minimum Latency)</SelectItem>
                        </SelectContent>
                    </Select>
                )}
            />

            <SettingRow
                tone="accent"
                title="Free Torrent Space Automatically"
                description="Deletes temporary torrent data after usage and trims old cache without touching active sessions."
                control={<Switch checked={autoFreeSpace} onCheckedChange={setAutoFreeSpace} />}
            >
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
            </SettingRow>

            <div className="flex gap-4 pt-4">
                <Button onClick={save} className="flex-1 font-bold">
                    Save Torrent Config
                </Button>
                <Button variant="outline" onClick={clearCache} className="border-destructive/20 text-destructive hover:bg-destructive/5 font-bold">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Clear Cache
                </Button>
            </div>
        </SettingsSection>
    );
}
