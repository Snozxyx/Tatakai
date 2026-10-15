import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
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
  useUiTranslation();
    const confirm = useConfirm();
    const [preload, setPreload] = useState(() => localStorage.getItem('tatakai:preload-next-episode') === 'true');
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
            toast.error(uiI18n.t('app.torrent_storage_path_is_not_available_in_this_en_6751fd6f'));
            return;
        }

        try {
            const selected = await (window as any).electron.selectDirectory();
            if (!selected) return;

            const result = await (window as any).tatakaiRuntime.setTorrentStoragePath(selected);
            if (result?.success) {
                setTorrentStoragePath(String(result.path || selected));
                setTorrentCachePath(String(result.path || selected));
                toast.success(uiI18n.t('app.torrent_storage_path_updated_035cf83f'));
            } else {
                toast.error(result?.error || uiI18n.t('app.failed_to_update_torrent_path_017e33d8'));
            }
        } catch (err) {
            console.error('Failed to update torrent path:', err);
            toast.error(uiI18n.t('app.failed_to_update_torrent_path_017e33d8'));
        }
    }, []);

    const handleResetTorrentPath = useCallback(async () => {
        if (!(window as any).tatakaiRuntime?.setTorrentStoragePath) return;
        try {
            const result = await (window as any).tatakaiRuntime.setTorrentStoragePath('');
            if (result?.success) {
                setTorrentStoragePath(String(result.path || ''));
                setTorrentCachePath(String(result.path || ''));
                toast.success(uiI18n.t('app.torrent_storage_path_reset_f9df46bb'));
            } else {
                toast.error(result?.error || uiI18n.t('app.failed_to_reset_torrent_path_959e7aa1'));
            }
        } catch (err) {
            console.error('Failed to reset torrent path:', err);
            toast.error(uiI18n.t('app.failed_to_reset_torrent_path_959e7aa1'));
        }
    }, []);

    const handleOpenTorrentPath = useCallback(async () => {
        if (!(window as any).electron?.openPath || !torrentStoragePath) return;
        try {
            await (window as any).electron.openPath(torrentStoragePath);
        } catch (err) {
            console.error('Failed to open torrent path:', err);
            toast.error(uiI18n.t('app.failed_to_open_torrent_folder_55112b93'));
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

        toast.success(uiI18n.t('app.torrent_settings_saved_new_sessions_will_use_the_3c1170a5'));
    };

    const clearCache = async () => {
        if (await confirm({ get title() { return uiI18n.t('app.clear_all_torrent_cache_and_data_this_will_stop__174dbf64'); }, destructive: true })) {
            if ((window as any).tatakaiRuntime?.clearAllTorrentData) {
                const res = await (window as any).tatakaiRuntime.clearAllTorrentData();
                if (res.success) {
                    toast.success(uiI18n.t('app.torrent_cache_cleared_2c0ffdb0'));
                } else {
                    toast.error('Failed to clear cache: ' + res.error);
                }
            }
        }
    };

    return (
        <SettingsSection
            title={uiI18n.t('app.torrent_engine_56caec3a')}
            description={uiI18n.t('app.configure_the_internal_webtorrent_engine_for_pro_629f8e9e')}
            bodyClassName="space-y-1"
        >
            <SettingRow title={uiI18n.t('app.preload_next_episode_bb79849a')} description={uiI18n.t('app.warm_the_next_episode_after_80_playback_uses_at__9e1a1e53')} control={<Switch checked={preload} onCheckedChange={value => { setPreload(value); localStorage.setItem('tatakai:preload-next-episode', String(value)); }} />} />
            <SettingRow
                title={uiI18n.t('app.torrent_storage_location_30553d7c')}
                description={uiI18n.t('app.where_torrent_files_and_cache_are_stored_new_ses_a3cb9626')}
                control={
                    <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={handleOpenTorrentPath} disabled={!torrentStoragePath || storageLoading}>
                            {uiI18n.t('app.open_cf9b7706')}
                        </Button>
                        <Button size="sm" onClick={handleChangeTorrentPath} disabled={storageLoading}>
                            {uiI18n.t('app.change_64fbd995')}
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
                        <span>{uiI18n.t('app.cache_731765c6')} {torrentCachePath || uiI18n.t('app.default_808d7dca')}</span>
                        <Button size="sm" variant="ghost" onClick={handleResetTorrentPath} disabled={storageLoading}>
                            {uiI18n.t('app.reset_44c57abd')}
                        </Button>
                    </div>
                </div>
            </SettingRow>
            <SettingRow
                title={uiI18n.t('app.max_connections_e0cfb922')}
                description={uiI18n.t('app.lower_values_reduce_connections_higher_values_ca_a6f81236')}
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
                title={uiI18n.t('app.enable_upnp_707344e7')}
                description={uiI18n.t('app.automatic_port_forwarding_for_better_connectivit_ec40b65a')}
                control={<Switch checked={enableUpnp} onCheckedChange={setEnableUpnp} />}
            />

            <SettingRow
                title={uiI18n.t('app.custom_trackers_e60deba9')}
                description={uiI18n.t('app.one_tracker_url_per_line_udp_http_s_or_wss_added_eb2c96a2')}
            >
                <textarea
                    value={customTrackers}
                    onChange={(e) => setCustomTrackers(e.target.value)}
                    rows={4}
                    spellCheck={false}
                    placeholder={uiI18n.t('app.udp_tracker_example_com_1337_announce_wss_tracke_f8915d54')}
                    className="w-full rounded-md bg-white/5 border border-white/10 px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
            </SettingRow>

            <SettingRow
                title={uiI18n.t('app.background_behavior_36204721')}
                description={uiI18n.t('app.what_to_do_when_you_leave_the_watch_page_0197758c')}
                control={(ids) => (
                    <Select value={bgBehavior} onValueChange={setBgBehavior}>
                        <SelectTrigger aria-labelledby={ids.labelId} aria-describedby={ids.descriptionId} className="w-52">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="prompt">{uiI18n.t('app.always_prompt_d2579b75')}</SelectItem>
                            <SelectItem value="keep">{uiI18n.t('app.keep_running_background_b2808524')}</SelectItem>
                            <SelectItem value="stop">{uiI18n.t('app.stop_automatically_6e8b80fd')}</SelectItem>
                        </SelectContent>
                    </Select>
                )}
            />

            <SettingRow
                title={uiI18n.t('app.download_limit_mb_s_ec1937c3')}
                description={uiI18n.t('app.0_for_unlimited_07f904c9')}
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
                title={uiI18n.t('app.upload_limit_mb_s_bff7d748')}
                description={uiI18n.t('app.0_for_unlimited_07f904c9')}
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
                title={uiI18n.t('app.bandwidth_schedule_0ab23943')}
                description={uiI18n.t('app.automatically_adjusts_engine_behavior_based_on_t_038f9550')}
                control={(ids) => (
                    <Select value={bandwidthSchedule} onValueChange={setBandwidthSchedule}>
                        <SelectTrigger aria-labelledby={ids.labelId} aria-describedby={ids.descriptionId} className="w-56">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="default">{uiI18n.t('app.standard_adaptive_0b3a56fe')}</SelectItem>
                            <SelectItem value="night-owl">{uiI18n.t('app.night_owl_max_speed_2am_7am_cc67e906')}</SelectItem>
                            <SelectItem value="gaming">{uiI18n.t('app.gaming_minimum_latency_1b24403c')}</SelectItem>
                        </SelectContent>
                    </Select>
                )}
            />

            <SettingRow
                tone="accent"
                title={uiI18n.t('app.free_torrent_space_automatically_1a3842cc')}
                description={uiI18n.t('app.deletes_temporary_torrent_data_after_usage_and_t_74d554f2')}
                control={<Switch checked={autoFreeSpace} onCheckedChange={setAutoFreeSpace} />}
            >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{uiI18n.t('app.max_cache_gb_85a9e9cc')}</Label>
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
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{uiI18n.t('app.unused_age_hours_0d24f038')}</Label>
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
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{uiI18n.t('app.after_playback_2729a5b4')}</Label>
                                <p className="text-[10px] text-muted-foreground">{uiI18n.t('app.remove_temporary_files_when_a_session_stops_924dba41')}</p>
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
                    {uiI18n.t('app.save_torrent_config_ea611ee6')}
                </Button>
                <Button variant="outline" onClick={clearCache} className="border-destructive/20 text-destructive hover:bg-destructive/5 font-bold">
                    <Trash2 className="w-4 h-4 mr-2" />
                    {uiI18n.t('app.clear_cache_52217508')}
                </Button>
            </div>
        </SettingsSection>
    );
}
