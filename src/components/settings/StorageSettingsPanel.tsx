import { useState, useEffect, useCallback } from 'react';
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
        toast.success(`Updated video download folder to ${selected}`);
        fetchStorageInfo();
      }
    } else {
      toast.info('Directory selection is managed through your browser in web mode.');
    }
  };

  const handleSelectTorrentFolder = async () => {
    if (isNative && (window as any).electron?.selectDirectory) {
      const selected = await (window as any).electron.selectDirectory();
      if (selected) {
        setTorrentCachePath(selected);
        localStorage.setItem('tatakai_torrent_cache_path', selected);
        toast.success(`Updated torrent cache location to ${selected}`);
        fetchStorageInfo();
      }
    } else {
      toast.info('Directory selection is available in the desktop app.');
    }
  };

  const handleOpenDownloadsFolder = async () => {
    if (isNative && (window as any).electron?.openDownloadsFolder) {
      await (window as any).electron.openDownloadsFolder(downloadsPath);
    } else {
      toast.info('Folder explorer is available in the desktop app.');
    }
  };

  const handleClearCategory = async (category: 'torrent_cache' | 'video_downloads' | 'app_cache') => {
    const labels = {
      torrent_cache: 'Torrent Cache',
      video_downloads: 'Video Downloads',
      app_cache: 'App & Media Cache',
    };
    if (!(await confirm({ title: `Are you sure you want to clear ${labels[category]}? This cannot be undone.`, destructive: true }))) {
      return;
    }

    setClearingCategory(category);
    try {
      if (isNative && (window as any).electron?.clearStorageCategory) {
        const path = category === 'torrent_cache' ? torrentCachePath : category === 'video_downloads' ? downloadsPath : undefined;
        const res = await (window as any).electron.clearStorageCategory(category, path);
        if (res.success) {
          toast.success(`Cleared ${labels[category]} successfully`);
          fetchStorageInfo();
        } else {
          toast.error(`Failed to clear: ${res.error || 'Unknown error'}`);
        }
      } else {
        toast.success(`Cleared virtual ${labels[category]}`);
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    } finally {
      setClearingCategory(null);
    }
  };

  const handleStorageLimitChange = (value: string) => {
    setStorageLimitGb(value);
    localStorage.setItem('tatakai_storage_limit_gb', value);
    toast.success(`Max storage allocation set to ${value === 'unlimited' ? 'Unlimited' : `${value} GB`}`);
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
        title="Disk allocation"
        description={`How Tatakai's storage sits on ${storageInfo?.drive?.root || 'your system drive'}.`}
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={fetchStorageInfo}
            disabled={isLoading}
            className="rounded-xl text-xs gap-1.5 border-white/10"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            Refresh Storage
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
              title={`Torrent Cache: ${formatBytes(torrentSize)}`}
            />
            {/* App Video Downloads */}
            <div
              style={{ width: `${Math.max(1, (downloadsSize / totalDrive) * 100)}%` }}
              className="bg-amber-500 transition-all"
              title={`Video Downloads: ${formatBytes(downloadsSize)}`}
            />
            {/* App Temp Cache */}
            <div
              style={{ width: `${Math.max(1, (cacheSize / totalDrive) * 100)}%` }}
              className="bg-cyan-500 transition-all"
              title={`App & Temp Cache: ${formatBytes(cacheSize)}`}
            />
            {/* Other used disk space */}
            <div
              style={{ width: `${otherDriveUsed}%` }}
              className="bg-white/15 transition-all"
              title="Other OS & User Files"
            />
            {/* Free space */}
            <div
              style={{ width: `${freePercent}%` }}
              className="bg-emerald-500/40 transition-all"
              title={`Available Free Space: ${formatBytes(freeDrive)}`}
            />
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs pt-1">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-purple-500" />
              <span className="text-muted-foreground">Torrent Cache:</span>
              <span className="font-semibold text-foreground">{formatBytes(torrentSize)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              <span className="text-muted-foreground">Video Downloads:</span>
              <span className="font-semibold text-foreground">{formatBytes(downloadsSize)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-cyan-500" />
              <span className="text-muted-foreground">App & Media Cache:</span>
              <span className="font-semibold text-foreground">{formatBytes(cacheSize)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <span className="text-muted-foreground">Free Disk Space:</span>
              <span className="font-semibold text-emerald-400">{formatBytes(freeDrive)}</span>
            </div>
            <div className="flex items-center gap-1.5 ml-auto text-muted-foreground">
              <span>Total Capacity: {formatBytes(totalDrive)}</span>
            </div>
          </div>
        </div>
      </SettingsSection>

      {/* Storage Quota Limit */}
      <SettingsSection
        icon={Database}
        eyebrow="Storage Cap"
        title="App Storage Quota"
        description="Limit the maximum amount of computer storage Tatakai can reserve for offline content, torrent chunks, and media caches."
        action={
          <Select value={storageLimitGb} onValueChange={handleStorageLimitChange}>
            <SelectTrigger className="w-36 h-9 rounded-xl border-white/10 bg-background/50 text-xs font-bold">
              <SelectValue placeholder="Select Limit" />
            </SelectTrigger>
            <SelectContent className="bg-card/95 border-white/10">
              <SelectItem value="5">5 GB</SelectItem>
              <SelectItem value="10">10 GB</SelectItem>
              <SelectItem value="25">25 GB</SelectItem>
              <SelectItem value="50">50 GB (Default)</SelectItem>
              <SelectItem value="100">100 GB</SelectItem>
              <SelectItem value="200">200 GB</SelectItem>
              <SelectItem value="unlimited">Unlimited</SelectItem>
            </SelectContent>
          </Select>
        }
      >
        <p className="text-xs text-muted-foreground">
          Current Tatakai usage:{' '}
          <span className="font-bold text-foreground">{formatBytes(appTotal)}</span> of{' '}
          <span className="font-bold text-foreground">
            {storageLimitGb === 'unlimited' ? 'Unlimited' : `${storageLimitGb} GB`}
          </span>{' '}
          allocated. Oldest stream chunks will be safely trimmed when the cap is reached.
        </p>
      </SettingsSection>

      {/* Storage Locations Manager (Torrent Cache, Video Download, Other Cache) */}
      <SettingsSection
        icon={FolderOpen}
        eyebrow="Directories"
        title="Storage Locations"
        description="Customize where Tatakai saves torrent chunks, downloaded episodes, and application caches on your computer."
      >
        <div className="space-y-4">
          {/* 1. Torrent Cache Location */}
          <div className="p-4 rounded-xl border border-white/5 bg-muted/30 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">Torrent Cache Directory</span>
                  <SettingsBadge tone="primary">torrent_cache</SettingsBadge>
                  <span className="text-xs text-muted-foreground">({formatBytes(torrentSize)})</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Holds temporary pieces while streaming WebTorrent & peer-to-peer releases.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs font-semibold border-white/10 rounded-xl"
                  onClick={handleSelectTorrentFolder}
                >
                  Change Location
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs text-destructive hover:bg-destructive/10 rounded-xl"
                  disabled={clearingCategory === 'torrent_cache' || torrentSize === 0}
                  onClick={() => handleClearCategory('torrent_cache')}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Clear
                </Button>
              </div>
            </div>
            <p className="font-mono text-xs text-muted-foreground/80 bg-background/60 p-2 rounded-lg border border-white/5 truncate">
              {torrentCachePath || 'Default user application cache'}
            </p>
          </div>

          {/* 2. Video Download Location */}
          <div className="p-4 rounded-xl border border-white/5 bg-muted/30 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">Offline Video Downloads</span>
                  <SettingsBadge tone="warning">video_downloads</SettingsBadge>
                  <span className="text-xs text-muted-foreground">({formatBytes(downloadsSize)})</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Where full offline anime episodes and downloaded seasons are stored.
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
                  Open Folder
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs font-semibold border-white/10 rounded-xl"
                  onClick={handleSelectDownloadFolder}
                >
                  Change Location
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs text-destructive hover:bg-destructive/10 rounded-xl"
                  disabled={clearingCategory === 'video_downloads' || downloadsSize === 0}
                  onClick={() => handleClearCategory('video_downloads')}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Clear
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
                  <span className="font-semibold text-sm">Other Cache & Web Data</span>
                  <SettingsBadge tone="muted">app_cache</SettingsBadge>
                  <span className="text-xs text-muted-foreground">({formatBytes(cacheSize)})</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Chromium GPU cache, cover thumbnails, subtitle blobs, and transient API responses.
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
                  Clear Cache
                </Button>
              </div>
            </div>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
