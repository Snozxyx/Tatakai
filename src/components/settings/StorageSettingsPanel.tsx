import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useState, useEffect, useCallback } from 'react';
import { clearMediaMetadataCache } from '@/lib/queryClient';
import {
  FolderOpen,
  Trash2,
  RefreshCw,
  FolderUp,
  Database,
  DownloadCloud,
  Layers,
  Sparkles,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useIsNativeApp } from '@/hooks/ui/useIsNativeApp';
import { SettingsSection, SettingRow, SettingsBadge } from '@/components/settings/SettingsPrimitives';

interface StorageInfoState {
  drive: {
    root: string;
    totalBytes: number;
    freeBytes: number;
    usedBytes: number;
  };
  appStorage: {
    downloadsSize: number;
    torrentCacheSize: number;
    appCacheSize: number;
    totalAppBytes: number;
  };
  paths: {
    downloadsPath: string;
    torrentCachePath: string;
    appCachePath: string;
  };
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function StorageSettingsPanel() {
  useUiTranslation();
  const isNative = useIsNativeApp();
  const confirm = useConfirm();

  const [downloadsPath, setDownloadsPath] = useState<string>(() => {
    return localStorage.getItem('tatakai_download_path') || '';
  });

  const [torrentCachePath, setTorrentCachePath] = useState<string>(() => {
    return localStorage.getItem('tatakai_torrent_cache_path') || '';
  });

  const [storageLimitGb, setStorageLimitGb] = useState<string>(() => {
    return localStorage.getItem('tatakai_storage_limit_gb') || '50';
  });

  const [storageInfo, setStorageInfo] = useState<StorageInfoState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [clearingCategory, setClearingCategory] = useState<string | null>(null);

  const fetchStorageInfo = useCallback(async () => {
    setIsLoading(true);
    try {
      if (isNative && (window as any).electron?.getStorageInfo) {
        const info = await (window as any).electron.getStorageInfo(downloadsPath, torrentCachePath);
        if (info.success && info.drive) {
          setStorageInfo({
            drive: info.drive,
            appStorage: info.appStorage || { downloadsSize: 0, torrentCacheSize: 0, appCacheSize: 0, totalAppBytes: 0 },
            paths: info.paths || { downloadsPath, torrentCachePath, appCachePath: '' },
          });
          if (info.paths?.downloadsPath && !downloadsPath) {
            setDownloadsPath(info.paths.downloadsPath);
          }
          if (info.paths?.torrentCachePath && !torrentCachePath) {
            setTorrentCachePath(info.paths.torrentCachePath);
          }
          return;
        }
      }

      // Browser fallback using navigator.storage.estimate
      if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        const total = estimate.quota || 100 * 1024 * 1024 * 1024; // fallback 100GB
        const used = estimate.usage || 0;
        const free = Math.max(0, total - used);

        setStorageInfo({
          drive: {
            root: 'Browser Storage Quota',
            totalBytes: total,
            freeBytes: free,
            usedBytes: used,
          },
          appStorage: {
            downloadsSize: Math.round(used * 0.4),
            torrentCacheSize: Math.round(used * 0.3),
            appCacheSize: Math.round(used * 0.3),
            totalAppBytes: used,
          },
          paths: {
            downloadsPath: 'IndexedDB / Virtual Downloads',
            torrentCachePath: 'Virtual Torrent Memory',
            appCachePath: 'Browser Cache Storage',
          },
        });
      }
    } catch (err) {
      console.error('Failed to get storage diagnostics:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isNative, downloadsPath, torrentCachePath]);

  useEffect(() => {
    fetchStorageInfo();
  }, [fetchStorageInfo]);

  const handleSelectDownloadFolder = async () => {
    if (isNative && (window as any).electron?.selectDirectory) {
      const selected = await (window as any).electron.selectDirectory();
      if (selected) {
        setDownloadsPath(selected);
        localStorage.setItem('tatakai_download_path', selected);
        toast.success(uiI18n.t('app.updated_video_download_folder_to_i18n_value_0_d3ca591a', { value0: selected }));
        fetchStorageInfo();
      }
    } else {
      toast.info(uiI18n.t('app.directory_selection_is_managed_through_your_brow_10bf0d09'));
    }
  };

  const handleSelectTorrentFolder = async () => {
    if (isNative && (window as any).electron?.selectDirectory) {
      const selected = await (window as any).electron.selectDirectory();
      if (selected) {
        setTorrentCachePath(selected);
        localStorage.setItem('tatakai_torrent_cache_path', selected);
        toast.success(uiI18n.t('app.updated_torrent_cache_location_to_i18n_value_0_62691aa0', { value0: selected }));
        fetchStorageInfo();
      }
    } else {
      toast.info(uiI18n.t('app.directory_selection_is_available_in_the_desktop__77ff4bfb'));
    }
  };

  const handleOpenDownloadsFolder = async () => {
    if (isNative && (window as any).electron?.openDownloadsFolder) {
      await (window as any).electron.openDownloadsFolder(downloadsPath);
    } else {
      toast.info(uiI18n.t('app.folder_explorer_is_available_in_the_desktop_app_71109c48'));
    }
  };

  const handleClearCategory = async (category: 'torrent_cache' | 'video_downloads' | 'app_cache') => {
    const labels = {
      torrent_cache: 'Torrent Cache',
      video_downloads: 'Video Downloads',
      app_cache: 'App & Media Cache',
    };
    if (!(await confirm({ get title() { return uiI18n.t('app.are_you_sure_you_want_to_clear_i18n_value_0_this_d1c9449d', { value0: labels[category] }); }, destructive: true }))) {
      return;
    }

    setClearingCategory(category);
    try {
      if (category === 'app_cache') await clearMediaMetadataCache();
      if (isNative && (window as any).electron?.clearStorageCategory) {
        const path = category === 'torrent_cache' ? torrentCachePath : category === 'video_downloads' ? downloadsPath : undefined;
        const res = await (window as any).electron.clearStorageCategory(category, path);
        if (res.success) {
          toast.success(uiI18n.t('app.cleared_i18n_value_0_successfully_74a02207', { value0: labels[category] }));
          fetchStorageInfo();
        } else {
          toast.error(uiI18n.t('app.failed_to_clear_i18n_value_0_078d5e90', { value0: res.error || 'Unknown error' }));
        }
      } else {
        toast.success(category === 'app_cache' ? uiI18n.t('app.cleared_cached_title_metadata_6849e648') : uiI18n.t('app.cleared_virtual_i18n_value_0_1f80d69d', { value0: labels[category] }));
      }
    } catch (err: any) {
      toast.error(uiI18n.t('app.error_i18n_value_0_6c651f8a', { value0: err.message }));
    } finally {
      setClearingCategory(null);
    }
  };

  const handleStorageLimitChange = (value: string) => {
    setStorageLimitGb(value);
    localStorage.setItem('tatakai_storage_limit_gb', value);
    toast.success(uiI18n.t('app.max_storage_allocation_set_to_i18n_value_0_4b363d91', { value0: value === 'unlimited' ? 'Unlimited' : `${value} GB` }));
  };

  // Calculations for storage bar
  const totalDrive = storageInfo?.drive?.totalBytes || 1;
  const freeDrive = storageInfo?.drive?.freeBytes || 0;
  const appTotal = storageInfo?.appStorage?.totalAppBytes || 0;
  const torrentSize = storageInfo?.appStorage?.torrentCacheSize || 0;
  const downloadsSize = storageInfo?.appStorage?.downloadsSize || 0;
  const cacheSize = storageInfo?.appStorage?.appCacheSize || 0;

  const appPercent = Math.min(100, (appTotal / totalDrive) * 100);
  const freePercent = Math.min(100, (freeDrive / totalDrive) * 100);
  const otherDriveUsed = Math.max(0, 100 - appPercent - freePercent);

  return (
    <div className="space-y-6">
      {/* Computer Drive & App Storage Visualizer */}
      <SettingsSection
        title={uiI18n.t('app.disk_allocation_4c509236')}
        description={uiI18n.t('app.how_tatakai_s_storage_sits_on_i18n_value_0_9ebb10be', { value0: storageInfo?.drive?.root || 'your system drive' })}
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={fetchStorageInfo}
            disabled={isLoading}
            className="rounded-xl text-xs gap-1.5 border-white/10"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            {uiI18n.t('app.refresh_storage_24852d36')}
          </Button>
        }
      >
        {/* Multi-Segment Storage Bar — the disk visualizer keeps its accent colors */}
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="h-4 w-full rounded-full bg-white/5 border border-white/10 overflow-hidden flex">
            {/* App Torrents */}
            <div
              style={{ width: `${Math.max(1, (torrentSize / totalDrive) * 100)}%` }}
              className="bg-purple-500 transition-all"
              title={uiI18n.t('app.torrent_cache_i18n_value_0_03765112', { value0: formatBytes(torrentSize) })}
            />
            {/* App Video Downloads */}
            <div
              style={{ width: `${Math.max(1, (downloadsSize / totalDrive) * 100)}%` }}
              className="bg-amber-500 transition-all"
              title={uiI18n.t('app.video_downloads_i18n_value_0_f1270ab4', { value0: formatBytes(downloadsSize) })}
            />
            {/* App Temp Cache */}
            <div
              style={{ width: `${Math.max(1, (cacheSize / totalDrive) * 100)}%` }}
              className="bg-cyan-500 transition-all"
              title={uiI18n.t('app.app_temp_cache_i18n_value_0_bd8cf31c', { value0: formatBytes(cacheSize) })}
            />
            {/* Other used disk space */}
            <div
              style={{ width: `${otherDriveUsed}%` }}
              className="bg-white/15 transition-all"
              title={uiI18n.t('app.other_os_user_files_16745ed8')}
            />
            {/* Free space */}
            <div
              style={{ width: `${freePercent}%` }}
              className="bg-emerald-500/40 transition-all"
              title={uiI18n.t('app.available_free_space_i18n_value_0_eb259b6c', { value0: formatBytes(freeDrive) })}
            />
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs pt-1">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-purple-500" />
              <span className="text-muted-foreground">{uiI18n.t('app.torrent_cache_c327b696')}</span>
              <span className="font-semibold text-foreground">{formatBytes(torrentSize)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              <span className="text-muted-foreground">{uiI18n.t('app.video_downloads_e66820ee')}</span>
              <span className="font-semibold text-foreground">{formatBytes(downloadsSize)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-cyan-500" />
              <span className="text-muted-foreground">{uiI18n.t('app.app_media_cache_0280c958')}</span>
              <span className="font-semibold text-foreground">{formatBytes(cacheSize)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <span className="text-muted-foreground">{uiI18n.t('app.free_disk_space_c642fb96')}</span>
              <span className="font-semibold text-emerald-400">{formatBytes(freeDrive)}</span>
            </div>
            <div className="flex items-center gap-1.5 ml-auto text-muted-foreground">
              <span>{uiI18n.t('app.total_capacity_77261cb1')} {formatBytes(totalDrive)}</span>
            </div>
          </div>
        </div>
      </SettingsSection>

      {/* Storage Quota Limit */}
      <SettingsSection
        icon={Database}
        eyebrow="Storage Cap"
        title={uiI18n.t('app.app_storage_quota_efa538cd')}
        description={uiI18n.t('app.limit_the_maximum_amount_of_computer_storage_tat_4dbca672')}
        action={
          <Select value={storageLimitGb} onValueChange={handleStorageLimitChange}>
            <SelectTrigger className="w-36 h-9 rounded-xl border-white/10 bg-background/50 text-xs font-bold">
              <SelectValue placeholder={uiI18n.t('app.select_limit_3418f0e1')} />
            </SelectTrigger>
            <SelectContent className="bg-card/95 border-white/10">
              <SelectItem value="5">{uiI18n.t('app.5_gb_227edb6a')}</SelectItem>
              <SelectItem value="10">{uiI18n.t('app.10_gb_ca3389aa')}</SelectItem>
              <SelectItem value="25">{uiI18n.t('app.25_gb_80175caa')}</SelectItem>
              <SelectItem value="50">{uiI18n.t('app.50_gb_default_cd664c43')}</SelectItem>
              <SelectItem value="100">{uiI18n.t('app.100_gb_e4a96b60')}</SelectItem>
              <SelectItem value="200">{uiI18n.t('app.200_gb_822250ca')}</SelectItem>
              <SelectItem value="unlimited">{uiI18n.t('app.unlimited_b8bef37b')}</SelectItem>
            </SelectContent>
          </Select>
        }
      >
        <p className="text-xs text-muted-foreground">
          {uiI18n.t('app.current_tatakai_usage_259298d6')}{' '}
          <span className="font-bold text-foreground">{formatBytes(appTotal)}</span> {uiI18n.t('app.of_de04fa0e')}{' '}
          <span className="font-bold text-foreground">
            {storageLimitGb === 'unlimited' ? uiI18n.t('app.unlimited_b8bef37b') : uiI18n.t('app.i18n_value_0_gb_c298ee84', { value0: storageLimitGb })}
          </span>{' '}
          {uiI18n.t('app.allocated_oldest_stream_chunks_will_be_safely_tr_cc4cf5b5')}
        </p>
      </SettingsSection>

      {/* Storage Locations Manager (Torrent Cache, Video Download, Other Cache) */}
      <SettingsSection
        icon={FolderOpen}
        eyebrow="Directories"
        title={uiI18n.t('app.storage_locations_452f80e1')}
        description={uiI18n.t('app.customize_where_tatakai_saves_torrent_chunks_dow_0a8d7842')}
      >
        <div className="space-y-4">
          {/* 1. Torrent Cache Location */}
          <div className="p-4 rounded-xl border border-white/5 bg-muted/30 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{uiI18n.t('app.torrent_cache_directory_6e1dacd3')}</span>
                  <SettingsBadge tone="primary">{uiI18n.t('app.torrent_cache_120a0db3')}</SettingsBadge>
                  <span className="text-xs text-muted-foreground">({formatBytes(torrentSize)})</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {uiI18n.t('app.holds_temporary_pieces_while_streaming_webtorren_5211094f')}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs font-semibold border-white/10 rounded-xl"
                  onClick={handleSelectTorrentFolder}
                >
                  {uiI18n.t('app.change_location_ee94ea23')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs text-destructive hover:bg-destructive/10 rounded-xl"
                  disabled={clearingCategory === 'torrent_cache' || torrentSize === 0}
                  onClick={() => handleClearCategory('torrent_cache')}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  {uiI18n.t('app.clear_719ea396')}
                </Button>
              </div>
            </div>
            <p className="font-mono text-xs text-muted-foreground/80 bg-background/60 p-2 rounded-lg border border-white/5 truncate">
              {torrentCachePath || uiI18n.t('app.default_user_application_cache_fa07254c')}
            </p>
          </div>

          {/* 2. Video Download Location */}
          <div className="p-4 rounded-xl border border-white/5 bg-muted/30 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{uiI18n.t('app.offline_video_downloads_2086d228')}</span>
                  <SettingsBadge tone="warning">{uiI18n.t('app.video_downloads_de9f0d9d')}</SettingsBadge>
                  <span className="text-xs text-muted-foreground">({formatBytes(downloadsSize)})</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {uiI18n.t('app.where_full_offline_anime_episodes_and_downloaded_49557df9')}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs font-semibold border-white/10 rounded-xl"
                  onClick={handleOpenDownloadsFolder}
                >
                  <FolderOpen className="h-3.5 w-3.5 mr-1" />
                  {uiI18n.t('app.open_folder_027760ff')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs font-semibold border-white/10 rounded-xl"
                  onClick={handleSelectDownloadFolder}
                >
                  {uiI18n.t('app.change_location_ee94ea23')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs text-destructive hover:bg-destructive/10 rounded-xl"
                  disabled={clearingCategory === 'video_downloads' || downloadsSize === 0}
                  onClick={() => handleClearCategory('video_downloads')}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  {uiI18n.t('app.clear_719ea396')}
                </Button>
              </div>
            </div>
            <p className="font-mono text-xs text-muted-foreground/80 bg-background/60 p-2 rounded-lg border border-white/5 truncate">
              {downloadsPath || 'Videos/Tatakai'}
            </p>
          </div>

          {/* 3. Other App & Media Cache */}
          <div className="p-4 rounded-xl border border-white/5 bg-muted/30 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{uiI18n.t('app.other_cache_web_data_839b931c')}</span>
                  <SettingsBadge tone="muted">{uiI18n.t('app.app_cache_d261e1fc')}</SettingsBadge>
                  <span className="text-xs text-muted-foreground">({formatBytes(cacheSize)})</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {uiI18n.t('app.chromium_gpu_cache_cover_thumbnails_subtitle_blo_7e060b50')}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs text-destructive hover:bg-destructive/10 rounded-xl"
                  disabled={clearingCategory === 'app_cache' || cacheSize === 0}
                  onClick={() => handleClearCategory('app_cache')}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  {uiI18n.t('app.clear_cache_52217508')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
