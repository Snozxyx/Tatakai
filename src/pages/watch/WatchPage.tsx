import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import {
  useEpisodeServers,
  useEpisodes,
  useAnimeInfo,
} from "@/hooks/api/useAnimeData";
import { useCombinedSourcesWithRefetch } from "@/hooks/media/useCombinedSources";
import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Skeleton } from "@/components/ui/skeleton-custom";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { MobileVideoPlayer } from "@/components/video/MobileVideoPlayer";
import { EmbedPlayer } from "@/components/video/EmbedPlayer";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Volume2,
  Subtitles,
  Server,
  ListVideo,
  Eye,
  Globe,
  Star,
  Clock,
  RefreshCw,
  AlertCircle,
  Flag,
  Share2,
  Users,
  TrendingUp,
  CircleCheck,
  Download,
  Upload,
  HardDrive,
  Wifi,
  LockKeyhole,
} from "lucide-react";
import { useVideoSettings } from "@/hooks/media/useVideoSettings";
import { useIsNativeApp, useIsDesktopApp, useIsMobileApp } from "@/hooks/ui/useIsNativeApp";
import { useIsMobile } from "@/hooks/ui/use-mobile";
import { buildUniqueSimpleNameMap, getFriendlyServerName, getSimpleServerDisplayName } from "@/lib/serverNames";
import { updateLocalContinueWatching, getLocalContinueWatching } from "@/lib/localStorage";
import { getLocalTorrentSessionHistory, updateLocalTorrentSessionHistory, upsertLocalTorrentSessionHistory } from "@/lib/localStorage";
import { useAuth } from "@/contexts/AuthContext";
import { useUpdateWatchHistory } from '@/hooks/user/useWatchHistory';
import { useViewTracker, useAnimeViewCount, formatViewCount } from '@/hooks/user/useViews';
import { useWatchTracking } from '@/hooks/api/useAnalytics';
import { getProxiedVideoUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import { clearDiscordRpc } from "@/lib/discordRpc";
import { ReportModal } from "@/components/ui/ReportModal";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { EpisodeComments } from "@/components/video/EpisodeComments";
import { ReviewPopup } from "@/components/ui/ReviewPopup";
import { Button } from "@/components/ui/button";
import { MarketplaceSubmitModal } from "@/components/ui/MarketplaceSubmitModal";
import { MarketplaceModal } from "@/components/ui/MarketplaceModal";
import { SourceLanguageTabs } from "@/components/watch/SourceLanguageTabs";
import { SourceTypeBadge } from "@/components/watch/SourceTypeBadge";
import { normalizeWatchLanguageKey } from "@/lib/languageUtils";
import { toast } from "sonner";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { trackEvent } from "@/lib/api";
import { fetchCombinedSources } from "@/lib/api/api-client";
import { markProviderSourcesExpired } from "@/core/content/provider-orchestrator";
import {
  buildDubSubtitles,
  clearCachedCombinedSourcesByEpisodeAndCategory,
  clearSourceFailure,
  comboFailureKey,
  getPreferredServer,
  getSourceFailureCount,
  getSourceHealthScore,
  getRefererVariants,
  logPlaybackTelemetry,
  preflightSourceUrl,
  recordProviderQualityOutcome,
  recordSourceFailure,
  recordSourceHealth,
  selectSourceForServer,
  setPreferredServer,
  shouldAutoSkipSource,
  sortServersByHealth,
  DubQualityProfile,
} from "@/lib/watch/sourceIntelligence";

function toLocalFileUrl(filePath?: string): string {
  if (!filePath) return '';
  if (/^(https?:|blob:|data:)/i.test(filePath)) return filePath;
  // Already a tatakai-media:// URL — return as-is
  if (filePath.startsWith('tatakai-media://')) return filePath;
  // Already a file:// URL — convert to tatakai-media:// for Electron renderer safety
  if (filePath.startsWith('file://')) {
    const isElectron = typeof window !== 'undefined' && !!(window as any).electron;
    if (!isElectron) return filePath;
    // Extract path from file:// and rebuild as tatakai-media://
    const rawPath = filePath.replace(/^file:\/\/\//i, '').replace(/^file:\/\//i, '');
    const decoded = rawPath.replace(/ /g, '%20');
    return `tatakai-media:///${decoded}`;
  }
  // Raw Windows/Unix absolute path
  const normalized = filePath.replace(/\\/g, '/');
  const encoded = normalized.replace(/ /g, '%20');
  const isElectron = typeof window !== 'undefined' && !!(window as any).electron;
  if (isElectron) {
    // Use tatakai-media:// protocol which bypasses webSecurity for local files
    return /^[A-Za-z]:\//.test(normalized)
      ? `tatakai-media:///${encoded}`
      : `tatakai-media://${encoded}`;
  }
  return /^[A-Za-z]:\//.test(normalized)
    ? `file:///${encoded}`
    : normalized.startsWith('/') ? `file://${encoded}` : `file:///${encoded}`;
}

function joinLocalPath(root: string, child?: string): string {
  if (!child) return root;
  const separator = root.includes('\\') ? '\\' : '/';
  return `${root.replace(/[\\/]+$/g, '')}${separator}${String(child).replace(/^[\\/]+/g, '')}`;
}

export default function WatchPage() {
  const { episodeId } = useParams<{ episodeId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { settings } = useVideoSettings();
  const isNative = useIsNativeApp();
  const isDesktop = useIsDesktopApp(); // Only Electron/Tauri
  const isMobileApp = useIsMobileApp(); // Only Capacitor
  const isMobileViewport = useIsMobile();
  const queryClient = useQueryClient();
  const isDeveloperMode = useMemo(() => {
    if (import.meta.env.DEV) return true;
    try {
      if (!Capacitor.isNativePlatform()) return false;
      const saved = localStorage.getItem('tatakai_mobile_config');
      if (!saved) return false;
      const config = JSON.parse(saved);
      return config?.devMode === true;
    } catch {
      return false;
    }
  }, []);

  const isOfflineMode = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('offline') === 'true';
  }, [location.search]);

  const offlinePath = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('path') || '';
  }, [location.search]);

  const initialSeekSeconds = useMemo(() => {
    try {
      const params = new URLSearchParams(location.search);
      const t = params.get('t');
      if (!t) return undefined;
      const n = Number(t);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
    } catch {
      return undefined;
    }
  }, [location.search]);

  const torrentSessionId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('sessionId') || '';
  }, [location.search]);

  const optimizeTorrentStorage = useMemo(() => {
    try {
      const raw = localStorage.getItem('tatakai_optimize_torrent_storage_v1');
      return raw == null ? true : raw === 'true';
    } catch {
      return true;
    }
  }, []);

  const [torrentPlaybackSource, setTorrentPlaybackSource] = useState<null | {
    id: string;
    url: string;
    mode: 'torrent';
    quality?: string;
    sourceType?: string;
    providerName?: string;
    providerKey?: string;
    isEmbed?: boolean;
    isM3U8?: boolean;
  }>(null);
  const [torrentPlaybackLoading, setTorrentPlaybackLoading] = useState(false);
  const [torrentPlaybackError, setTorrentPlaybackError] = useState<string | null>(null);
  const [torrentLiveStats, setTorrentLiveStats] = useState<any | null>(null);
  const [torrentRetryTrigger, setTorrentRetryTrigger] = useState(0);
  const [autoRepairCount, setAutoRepairCount] = useState(0);
  const torrentCompletionHandledRef = useRef(false);
  const lastPlaybackTimeRef = useRef(0);

  const formatTorrentRate = useCallback((value?: number) => {
    if (!Number.isFinite(value || 0) || (value || 0) <= 0) return '0 KB/s';
    const kb = (value || 0) / 1024;
    if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB/s`;
    const mb = kb / 1024;
    return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB/s`;
  }, []);

  const formatTorrentBytes = useCallback((value?: number) => {
    const bytes = Number(value || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
    const mb = bytes / 1024 / 1024;
    if (mb < 1024) return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(gb >= 100 ? 0 : 1)} GB`;
  }, []);

  const torrentProgressPercent = useMemo(() => {
    const raw = Number(torrentLiveStats?.progress ?? 0);
    if (!Number.isFinite(raw)) return 0;
    return Math.max(0, Math.min(100, raw));
  }, [torrentLiveStats?.progress]);

  const torrentVerified = Boolean(torrentSessionId && torrentLiveStats?.done === true && torrentLiveStats?.verified !== false);
  const torrentTimelineLocked = Boolean(torrentSessionId && !torrentVerified);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!isDesktop || !torrentSessionId || !(window as any).tatakaiRuntime?.getTorrentStreamUrl) {
        setTorrentPlaybackSource(null);
        setTorrentPlaybackLoading(false);
        setTorrentPlaybackError(null);
        setTorrentLiveStats(null);
        return;
      }

      setTorrentPlaybackLoading(true);
      setTorrentPlaybackError(null);

      try {
        const stream = await (window as any).tatakaiRuntime.getTorrentStreamUrl(torrentSessionId);
        if (cancelled) return;

        if (!stream?.success || !stream.url) {
          // If metadata is still resolving, we don't set a hard error yet
          if (stream?.error === 'metadata_not_ready') {
            setTorrentPlaybackError('Resolving torrent metadata...');
          } else if (stream?.error === 'session_not_found') {
            // Session might be lost (app restart), try to recover from history
            const history = getLocalTorrentSessionHistory();
            const session = history.find(s => s.sessionId === torrentSessionId);
            const sessionStopped = Boolean(session && session.status !== 'active');

            if (sessionStopped) {
              setTorrentPlaybackError('Torrent session stopped.');
              return;
            }

            if (session?.infoHash && (window as any).tatakaiRuntime?.startTorrentSession) {
              setTorrentPlaybackError('Reconnecting to torrent session...');
              try {
                const restart = await (window as any).tatakaiRuntime.startTorrentSession(session.infoHash, {
                  fileIndex: session.fileIndex,
                  autoSelectLargest: session.fileIndex == null
                });
                if (restart?.sessionId && restart.sessionId !== torrentSessionId) {
                  const params = new URLSearchParams(location.search);
                  params.set('sessionId', restart.sessionId);
                  navigate(`${location.pathname}?${params.toString()}`, { replace: true });
                }

                if (restart?.success) {
                  setTorrentRetryTrigger(prev => prev + 1);
                  return;
                }

                if (
                  restart?.retryable ||
                  restart?.error === 'metadata_timeout' ||
                  restart?.error === 'metadata_files_pending' ||
                  restart?.error === 'metadata_pending'
                ) {
                  setTorrentPlaybackError('Resolving torrent metadata...');
                  setTimeout(() => {
                    if (!cancelled) setTorrentRetryTrigger(prev => prev + 1);
                  }, 2500);
                  return;
                }
              } catch (e) {
                console.error('Failed to auto-restart torrent session:', e);
              }
            }

            setTorrentPlaybackError('Connecting to torrent session...');
            setTimeout(() => {
              if (!cancelled) setTorrentRetryTrigger(prev => prev + 1);
            }, 1500);
          } else if (stream?.error === 'prebuffer_timeout') {
            // Prebuffer timed out, but we might have SOME data. The bridge handles this 
            // but if it still fails, we show a specific message.
            setTorrentPlaybackError('Buffering taking longer than expected. Please wait...');
            setTimeout(() => {
              if (!cancelled) setTorrentRetryTrigger(prev => prev + 1);
            }, 2000);
          } else if (stream?.error === 'transcode_not_ready') {
            // Stream-bridge polls internally for up to 45s, so this should be rare.
            // If it still appears, wait a bit longer before retrying.
            setTorrentPlaybackError('Preparing video stream...');
            setTimeout(() => {
              if (!cancelled) setTorrentRetryTrigger(prev => prev + 1);
            }, 3000);
          } else if (stream?.error === 'transcode_timeout') {
            // ffmpeg took over 45s to produce a manifest — retry once.
            setTorrentPlaybackError('Stream preparation timed out. Retrying...');
            setTimeout(() => {
              if (!cancelled) setTorrentRetryTrigger(prev => prev + 1);
            }, 3000);
          } else {
            // Generic failure - might be transient (e.g. tracker delay), retry up to 5 times
            if (autoRepairCount < 8) {
              setAutoRepairCount(prev => prev + 1);
              setTorrentPlaybackError(`Stream connection failed (${stream?.error || 'unknown'}). Retrying...`);
              setTimeout(() => {
                if (!cancelled) setTorrentRetryTrigger(prev => prev + 1);
              }, 1500);
              return;
            }
            setTorrentPlaybackError(String(stream?.error || 'Failed to resolve torrent stream'));
          }
          return;
        }

        const streamUrl = String(stream.url);
        if (Number.isFinite(Number(stream.fileIndex))) {
          (window as any).currentFileIndex = Number(stream.fileIndex);
        }
        setTorrentPlaybackSource({
          id: torrentSessionId,
          url: streamUrl,
          mode: 'torrent',
          sourceType: 'torrent',
          providerName: 'Torrent session',
          providerKey: 'torrent-session',
          isEmbed: false,
          // When the runtime returns a remuxed HLS manifest, let the player auto-detect HLS.
          // Mode detection also checks `url.includes('.m3u8')`, but this keeps it explicit.
          isM3U8: Boolean((stream as any).isM3U8),
        });
        setTorrentLiveStats((current: any) => ({
          ...(current || {}),
          sessionId: torrentSessionId,
          name: stream.name || current?.name,
          fileName: stream.name || current?.fileName,
          fileIndex: stream.fileIndex ?? current?.fileIndex,
          infoHash: stream.infoHash || current?.infoHash,
          rawUrl: (stream as any).rawUrl || current?.rawUrl,
        }));
      } catch (err: any) {
        if (!cancelled) {
          // Automatic Auto-Repair attempt for 'Failed to resolve'
          if (autoRepairCount < 3 && (err?.message?.includes('resolve') || err?.message?.includes('timeout'))) {
            setAutoRepairCount(prev => prev + 1);
            setTorrentPlaybackError(`Stream unstable. Auto-repair attempt ${autoRepairCount + 1}/3...`);
            setTimeout(() => {
              if (!cancelled) setTorrentRetryTrigger(prev => prev + 1);
            }, 1500);
            return;
          }

          setTorrentPlaybackError(err?.message || 'Failed to resolve torrent stream');
          setTorrentLiveStats((current: any) => ({
            ...(current || {}),
            sessionId: torrentSessionId,
            error: err?.message || 'Failed to resolve torrent stream',
          }));
        }
      } finally {
        if (!cancelled) {
          setTorrentPlaybackLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [isDesktop, torrentSessionId, torrentRetryTrigger]);

  useEffect(() => {
    if (!isDesktop || !torrentSessionId || !(window as any).tatakaiRuntime) {
      return;
    }

    let cancelled = false;
    const runtime = (window as any).tatakaiRuntime;

    // Listen for metadata-ready event to retry stream resolution
    const stopMetadataReady = runtime.onTorrentMetadataReady?.((data: any) => {
      if (data?.sessionId === torrentSessionId) {
        setTorrentRetryTrigger(prev => prev + 1);
        toast.success('Torrent metadata resolved! Starting stream...');
      }
    });

    const refreshTorrentStats = async () => {
      try {
        const stats = await runtime.getTorrentStats?.(torrentSessionId);
        if (!cancelled && stats?.success) {
          setTorrentLiveStats((current: any) => ({
            ...(current || {}),
            ...stats,
            sessionId: torrentSessionId,
          }));
        }
      } catch {
        // ignore transient polling failures
      }
    };

    const stopProgress = runtime.onTorrentProgress?.((stats: any) => {
      if (cancelled || stats?.sessionId !== torrentSessionId) return;
      setTorrentLiveStats((current: any) => ({
        ...(current || {}),
        ...stats,
        sessionId: torrentSessionId,
      }));

      if (stats?.availability === 'no_peers') {
        setTorrentPlaybackError(stats.availabilityMessage || 'No peers or seeders found. Try another torrent release.');
        return;
      }

      const transcodeStatus = String(stats?.transcode?.status || '').toLowerCase();
      const transcodePercent = stats?.transcode?.percent;
      if (transcodeStatus === 'running') {
        const pctText = Number.isFinite(transcodePercent) ? ` (${Math.max(0, Math.min(99, Math.round(transcodePercent)))}%)` : '';
        setTorrentPlaybackError(`Preparing multi-audio stream${pctText}...`);
      } else if (transcodeStatus === 'ready') {
        setTorrentPlaybackError((current: string | null) => (
          current && current.toLowerCase().includes('preparing multi-audio stream') ? null : current
        ));
      } else if (transcodeStatus === 'error') {
        setTorrentPlaybackError('Multi-audio stream preparation failed. Retrying...');
      }
    });

    void refreshTorrentStats();
    const interval = window.setInterval(refreshTorrentStats, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      stopProgress?.();
      stopMetadataReady?.();
    };
  }, [isDesktop, torrentSessionId]);

  useEffect(() => {
    if (!torrentSessionId) return;

    const handleTorrentServiceRestarted = () => {
      setTorrentPlaybackSource(null);
      setTorrentLiveStats((current: any) => ({
        ...(current || {}),
        done: false,
        verified: false,
      }));
      setTorrentPlaybackError('Torrent service restarted. Reconnecting...');
      setTorrentRetryTrigger(prev => prev + 1);
    };

    window.addEventListener('tatakai-torrent-service-restarted', handleTorrentServiceRestarted);
    return () => window.removeEventListener('tatakai-torrent-service-restarted', handleTorrentServiceRestarted);
  }, [torrentSessionId]);

  // ── Torrent completion → disconnect peers without stopping session ──────
  // When the torrent finishes downloading, we disconnect from the swarm
  // (disconnect peers) to stop upload/download activity. We keep the session
  // alive so the local HTTP stream server can continue serving the file,
  // which avoids Electron webSecurity blocking direct file:// protocol URLs.
  useEffect(() => {
    if (!isDesktop || !torrentSessionId) return;
    if (!torrentLiveStats?.done) {
      // Reset the completion flag when torrent is not done (e.g. new session)
      torrentCompletionHandledRef.current = false;
      return;
    }
    if (torrentCompletionHandledRef.current) return;
    torrentCompletionHandledRef.current = true;

    const runtime = (window as any).tatakaiRuntime;

    const handleTorrentCompleted = async () => {
      try {
        console.log('[WatchPage] Torrent complete — disconnecting peers to stop swarm activity');

        // Disconnect all peers from the completed torrent to save bandwidth
        try {
          if (runtime?.disconnectTorrentPeers) {
            await runtime.disconnectTorrentPeers(torrentSessionId);
            console.log('[WatchPage] Torrent peers disconnected after completion.');
          } else {
            console.warn('[WatchPage] disconnectTorrentPeers method not available on runtime.');
          }
        } catch (err: any) {
          console.warn('[WatchPage] Failed to disconnect torrent peers:', err?.message);
        }

        // Clear any torrent error (e.g. buffering messages)
        setTorrentPlaybackError(null);

        // Update session history
        try {
          updateLocalTorrentSessionHistory(torrentSessionId, {
            status: 'completed',
            progress: 100,
            endedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        } catch { /* ignore */ }

        // Re-fetch stream URL so the player switches from HLS to the direct
        // WebTorrent HTTP URL. The direct URL supports range requests, giving
        // the player full native seeking capability without HLS limitations.
        // Small delay to let the session manager recognize the completed state.
        setTimeout(() => {
          setTorrentRetryTrigger(prev => prev + 1);
        }, 500);

        toast.success('Download complete — playing from local file');
      } catch (err: any) {
        console.error('[WatchPage] Failed to handle torrent completion:', err);
      }
    };

    void handleTorrentCompleted();
  }, [isDesktop, torrentSessionId, torrentLiveStats?.done]);

  // Parse the episode ID properly - extract the actual episode ID
  const decodedEpisodeId = useMemo(() => {
    if (!episodeId) return "";
    const decoded = decodeURIComponent(episodeId);
    // If it contains ?ep=, extract the proper format
    if (decoded.includes("?ep=")) {
      const [animeSlug, queryPart] = decoded.split("?ep=");
      return `${animeSlug}?ep=${queryPart}`;
    }
    return decoded;
  }, [episodeId]);

  // Extract anime ID (everything before ?ep=)
  const animeId = useMemo(() => {
    if (!decodedEpisodeId) return "";
    return decodedEpisodeId.split("?")[0];
  }, [decodedEpisodeId]);

  const [category, setCategory] = useState<"sub" | "dub">(() => {
    // Check if there's a saved preference from continue watching
    const savedHistory = getLocalContinueWatching();
    const saved = savedHistory.find(h => h.episodeId === decodeURIComponent(episodeId || ''));
    return saved?.category || "sub";
  });
  const [selectedServerIndex, setSelectedServerIndex] = useState(-1); // -1 = not yet initialized
  const [selectedLangCode, setSelectedLangCode] = useState<string | null>(() => {
    // Load saved language preference from continue watching
    const savedHistory = getLocalContinueWatching();
    const saved = savedHistory.find(h => h.episodeId === decodeURIComponent(episodeId || ''));
    return saved?.languageCode || null;
  });
  const [selectedProviderServerKey, setSelectedProviderServerKey] = useState<string | null>(null);
  const [preferredServerName, setPreferredServerName] = useState<string | null>(() => {
    const storedPreferred = getPreferredServer(animeId);
    if (storedPreferred) return storedPreferred;
    // Check if there's a saved server preference from continue watching
    const savedHistory = getLocalContinueWatching();
    const saved = savedHistory.find(h => h.episodeId === decodeURIComponent(episodeId || ''));
    return saved?.serverName || null;
  });
  const [failedServers, setFailedServers] = useState<Set<string>>(new Set());
  const [showReviewPopup, setShowReviewPopup] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isMarketplaceModalOpen, setIsMarketplaceModalOpen] = useState(false);
  const [isMarketplaceListVisible, setIsMarketplaceListVisible] = useState(false);
  const [offlineSources, setOfflineSources] = useState<any[]>([]);
  const [offlineManifest, setOfflineManifest] = useState<any>(null);
  const [offlineSubtitles, setOfflineSubtitles] = useState<Array<{ lang: string; url: string; label?: string }>>([]);
  const [dubProfile, setDubProfile] = useState<DubQualityProfile>(() => {
    try {
      return (localStorage.getItem("watch-dub-quality-profile") as DubQualityProfile) || "balanced";
    } catch {
      return "balanced";
    }
  });
  const [showSourceDebug, setShowSourceDebug] = useState(false);
  const [activeSourceLanguage, setActiveSourceLanguage] = useState("all");
  const [refererRetryIndex, setRefererRetryIndex] = useState(0);
  const [sourceReady, setSourceReady] = useState(true);
  const [sourcePreflightError, setSourcePreflightError] = useState<string | null>(null);
  const [newProviderCount, setNewProviderCount] = useState(0);
  const [providerFeedUpdatedAt, setProviderFeedUpdatedAt] = useState<number | null>(null);
  const [lockedSourceUrl, setLockedSourceUrl] = useState<string | null>(null);
  const [blockedSourceUrls, setBlockedSourceUrls] = useState<Record<string, number>>({});
  const [committedPlaybackSource, setCommittedPlaybackSource] = useState<any | null>(null);
  const [committedPlaybackHeaders, setCommittedPlaybackHeaders] = useState<{ Referer?: string; "User-Agent"?: string;[key: string]: string | undefined } | null>(null);
  const previousProviderCountRef = useRef<number | null>(null);
  const selectedServerNameRef = useRef<string | null>(null);
  const pendingPlaybackCommitRef = useRef(true);
  const failoverTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isDeveloperMode && showSourceDebug) {
      setShowSourceDebug(false);
    }
  }, [isDeveloperMode, showSourceDebug]);

  const { data: serversData, isLoading: loadingServers } =
    useEpisodeServers(isOfflineMode ? '' : decodedEpisodeId);
  const isGenericTorrent = animeId.startsWith('torrent-') || animeId.startsWith('generic-');
  // Also skip API calls for offline/imported local episode IDs
  const isLocalOfflineEpisode = isOfflineMode || animeId.startsWith('local-') || animeId.startsWith('auto-') || animeId.startsWith('imported-');
  const skipApiCalls = isGenericTorrent || isLocalOfflineEpisode;

  // Load data - skip if it's a generic torrent or local offline episode to avoid unnecessary API calls
  const { data: animeData } = useAnimeInfo(!skipApiCalls ? animeId : '');
  const { data: episodesData } = useEpisodes(!skipApiCalls ? animeId : '');

  // Update torrent session history
  useEffect(() => {
    if (torrentSessionId && torrentLiveStats?.name) {
      const history = getLocalTorrentSessionHistory();
      const existing = history.find((entry) => entry.sessionId === torrentSessionId);
      const infoHash = torrentLiveStats.infoHash || existing?.infoHash;

      const payload = {
        infoHash,
        torrentName: torrentLiveStats.name,
        animeId,
        animeName: animeData?.info?.name,
        animePoster: animeData?.info?.poster,
        episodeId: decodedEpisodeId,
        fileName: torrentLiveStats.fileName || torrentLiveStats.name,
        fileIndex: torrentLiveStats.fileIndex,
        status: 'active' as const,
        progress: torrentLiveStats.progress,
        seeders: torrentLiveStats.seeders,
        leechers: torrentLiveStats.leechers,
      };

      if (existing) {
        updateLocalTorrentSessionHistory(torrentSessionId, payload);
      } else {
        upsertLocalTorrentSessionHistory({
          sessionId: torrentSessionId,
          ...payload,
        });
      }
    }
  }, [torrentSessionId, torrentLiveStats, animeData, animeId, decodedEpisodeId]);

  // View tracking
  const { data: viewCount } = useAnimeViewCount(animeId);
  useViewTracker(animeId, decodedEpisodeId);

  // Reset offline state when path or episode changes
  useEffect(() => {
    if (isOfflineMode) {
      // Reset states to prevent stale data from previous navigation
      setOfflineSources([]);
      setOfflineManifest(null);
      setOfflineSubtitles([]);
    }
  }, [isOfflineMode, offlinePath, decodedEpisodeId]);

  useEffect(() => {
    if (isOfflineMode && offlinePath) {
      const loadOfflineContent = async () => {
        try {
          let manifest: any = null;
          const electronBridge = (window as any).electron;
          if (electronBridge?.getOfflineLibrary) {
            const library = await electronBridge.getOfflineLibrary();
            const entry = Array.isArray(library)
              ? library.find((item: any) => String(item.path || '') === offlinePath)
              : null;
            if (entry) {
              manifest = {
                animeName: entry.name,
                poster: entry.poster,
                episodes: Array.isArray(entry.episodes) ? entry.episodes : [],
              };
            }
          }

          if (!manifest) {
            const manifestUrl = toLocalFileUrl(joinLocalPath(offlinePath, 'manifest.json'));
            const response = await fetch(manifestUrl);
            manifest = await response.json();
          }
          setOfflineManifest(manifest);

          // Try to find episode by ID first
          let ep = manifest.episodes.find((e: any) => e.id === decodedEpisodeId);

          // If not found by ID, try to find by episode number (fallback for older downloads)
          if (!ep && manifest.episodes.length > 0) {
            // Extract episode number from ID if possible (e.g., "anime-ep-1" -> 1)
            const epNumMatch = decodedEpisodeId.match(/ep[_-]?(\d+)/i) || decodedEpisodeId.match(/(\d+)$/);
            const epNum = epNumMatch ? parseInt(epNumMatch[1]) : null;

            if (epNum !== null) {
              ep = manifest.episodes.find((e: any) => e.number === epNum);
            }

            // Last resort: use first episode if this is the first navigation
            if (!ep) {
              console.warn(`Episode ID "${decodedEpisodeId}" not found in manifest. Using first episode.`);
              ep = manifest.episodes[0];
            }
          }

          if (ep) {
            console.log(`Loading offline episode: ${ep.id || ep.number} from ${offlinePath}/${ep.file}`);

            // For Electron: convert local file path to HTTP stream URL via IPC.
            // This enables Chromium to play MKV/AVI files with proper range request support.
            let sourceUrl = toLocalFileUrl(joinLocalPath(offlinePath, ep.file));
            const electronBridge = (window as any).electron;
            if (electronBridge?.streamLocalFile) {
              try {
                const result = await electronBridge.streamLocalFile(sourceUrl);
                if (result?.success && result.url) {
                  sourceUrl = result.url;
                  console.log(`[WatchPage] Streaming via HTTP: ${sourceUrl}`);
                }
              } catch (streamErr) {
                console.warn('[WatchPage] streamLocalFile failed, falling back to direct URL:', streamErr);
              }
            }

            setOfflineSources([{
              url: sourceUrl,
              isM3U8: false,
              quality: 'Downloaded'
            }]);

            // Load subtitles if available in manifest
            if (ep.subtitles && Array.isArray(ep.subtitles)) {
              const subs = await Promise.all(ep.subtitles.map(async (sub: any) => {
                const localSubPath = toLocalFileUrl(joinLocalPath(offlinePath, sub.file || sub.url));
                let subUrl = localSubPath;

                // For Electron: read subtitle file as data: URL via IPC
                // data: URLs work reliably with <track> elements (no CORS issues)
                const electronBridge = (window as any).electron;
                if (electronBridge?.invoke) {
                  try {
                    const result = await electronBridge.invoke('media:read-local-file', localSubPath);
                    if (result?.success && result.url) {
                      subUrl = result.url;
                    }
                  } catch {
                    // Fall back to HTTP stream URL
                    if (electronBridge?.streamLocalFile) {
                      try {
                        const streamResult = await electronBridge.streamLocalFile(localSubPath);
                        if (streamResult?.success && streamResult.url) subUrl = streamResult.url;
                      } catch { /* keep original */ }
                    }
                  }
                }
                return { lang: sub.lang, label: sub.label || sub.lang, url: subUrl };
              }));
              setOfflineSubtitles(subs.filter((sub: any) => sub.url));
              console.log('Loaded offline subtitles:', subs.length);
            } else {
              setOfflineSubtitles([]);
            }
          } else {
            console.error('No episodes found in offline manifest');
            setOfflineSources([]);
            setOfflineSubtitles([]);
          }
        } catch (err) {
          console.error('Failed to load offline manifest:', err);
          setOfflineSources([]);
          setOfflineManifest(null);
          setOfflineSubtitles([]);
        }
      };
      loadOfflineContent();
    }
  }, [isOfflineMode, offlinePath, decodedEpisodeId]);

  useEffect(() => {
    try {
      localStorage.setItem("watch-dub-quality-profile", dubProfile);
    } catch {
      // Ignore storage errors.
    }
  }, [dubProfile]);

  // Watch time analytics tracking
  const watchMetadata = useMemo(() => ({
    animeName: animeData?.info.name,
    animePoster: animeData?.info.poster,
    genres: animeData?.moreInfo.genres,
  }), [animeData]);

  useWatchTracking(animeId, decodedEpisodeId, watchMetadata);

  const [pendingRedirect, setPendingRedirect] = useState<string | null>(null);

  // Block navigations to other origins (best-effort).
  useEffect(() => {
    const allowedOrigin = window.location.origin;
    const isAllowed = (url: string | URL | null | undefined) => {
      if (!url) return true;
      try {
        const resolved = new URL(url.toString(), window.location.href);
        return resolved.origin === allowedOrigin;
      } catch {
        return false;
      }
    };

    const clickHandler = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) return;
      if (!isAllowed(anchor.href)) {
        event.preventDefault();
        event.stopPropagation();
        setPendingRedirect(anchor.href);
      }
    };

    const originalOpen = window.open;
    const guardedOpen: typeof window.open = (url: string | URL | undefined, target?: string, features?: string) => {
      if (url && !isAllowed(url)) {
        setPendingRedirect(url.toString());
        return null;
      }
      return originalOpen.call(window, url, target, features);
    };

    document.addEventListener("click", clickHandler, true);
    window.open = guardedOpen;

    return () => {
      document.removeEventListener("click", clickHandler, true);
      window.open = originalOpen;
    };
  }, []);

  const [refreshTrigger, setRefreshCounter] = useState(0);

  const handleManualRefresh = useCallback(() => {
    setFailedServers(new Set());
    setRefreshCounter(prev => prev + 1);
    setTorrentRetryTrigger(prev => prev + 1);
    queryClient.invalidateQueries({ queryKey: ["servers", decodedEpisodeId] });
    queryClient.invalidateQueries({ queryKey: ["sources", decodedEpisodeId] });
    toast.success("Refreshing sources...");
  }, [decodedEpisodeId, queryClient]);

  const availableServers = useMemo(() => {
    const rawServers = (category === "sub" ? serversData?.sub : serversData?.dub) || [];
    const dedupedServers = rawServers.filter((server, index, array) => {
      const normalized = String(server.serverName || "").trim().toLowerCase();
      if (!normalized) return false;
      return index === array.findIndex((candidate) => String(candidate.serverName || "").trim().toLowerCase() === normalized);
    });

    const sorted = sortServersByHealth(dedupedServers);
    const pinServerFirst = (servers: typeof sorted, targetName: string) => {
      const target = String(targetName || "").trim().toLowerCase();
      if (!target) return servers;
      const index = servers.findIndex((server) => String(server.serverName || "").trim().toLowerCase() === target);
      if (index <= 0) return servers;
      const pinned = servers[index];
      return [pinned, ...servers.slice(0, index), ...servers.slice(index + 1)];
    };

    const savedPref = getPreferredServer(animeId, category);
    let ordered = sorted;
    if (savedPref) {
      const prefIndex = ordered.findIndex((s) => s.serverName.toLowerCase() === savedPref.toLowerCase());
      if (prefIndex > 0) {
        const pinned = ordered[prefIndex];
        ordered = [pinned, ...ordered.slice(0, prefIndex), ...ordered.slice(prefIndex + 1)];
      }
    }

    // Keep Koro (justanime) as first server when available.
    return pinServerFirst(ordered, "justanime");
  }, [category, serversData, animeId, dubProfile]);

  const availableServersRef = useRef(availableServers);

  useEffect(() => {
    availableServersRef.current = availableServers;
  }, [availableServers]);

  const selectRegularServer = useCallback((nextIndex: number) => {
    const serverList = availableServersRef.current;

    if (nextIndex >= 0 && serverList[nextIndex]) {
      selectedServerNameRef.current = serverList[nextIndex].serverName;
    } else if (nextIndex < 0) {
      selectedServerNameRef.current = null;
    }

    pendingPlaybackCommitRef.current = true;
    setSelectedServerIndex(nextIndex);
  }, []);

  // Keep selected server stable when list order changes during progressive discovery.
  useEffect(() => {
    if (selectedServerIndex < 0) return;

    const pinnedServerName = selectedServerNameRef.current;
    if (!pinnedServerName) return;

    const remappedIndex = availableServers.findIndex((server) => server.serverName === pinnedServerName);
    if (remappedIndex === -1) {
      selectRegularServer(-1);
      setSelectedLangCode(null);
      setSelectedProviderServerKey(null);
      setPreferredServerName(null);
      setFailedServers(new Set());
      return;
    }

    if (remappedIndex !== selectedServerIndex) {
      setSelectedServerIndex(remappedIndex);
    }
  }, [availableServers, selectedServerIndex, selectRegularServer]);

  useEffect(() => {
    if (loadingServers) return;
    if (category !== "dub") return;
    if (availableServers.length > 0) return;

    const shouldFallback = window.confirm("No dub sources available for this episode. Switch to Sub now?");
    if (shouldFallback) {
      setCategory("sub");
      selectRegularServer(-1);
      setSelectedProviderServerKey(null);
      trackEvent("watch_category_switch_failed", {
        animeId,
        episodeId: decodedEpisodeId,
        from: "dub",
        to: "sub",
        reason: "no_dub_servers",
      });
      logPlaybackTelemetry({
        type: "category_switch",
        animeId,
        episodeId: decodedEpisodeId,
        category: "dub",
        ok: false,
        userId: user?.id,
        metadata: { reason: "no_dub_servers" },
      });
    }
  }, [loadingServers, category, availableServers.length, animeId, decodedEpisodeId, user?.id, selectRegularServer]);

  // Auto-select server when servers load: prefer saved server, then hd-1 (Goku), then first
  useEffect(() => {
    if (availableServers.length > 0 && selectedServerIndex === -1) {
      const isEligible = (serverName: string) => {
        const key = comboFailureKey(decodedEpisodeId, serverName, category);
        return !shouldAutoSkipSource(key);
      };

      const koroIndex = availableServers.findIndex((s) => s.serverName.toLowerCase() === 'justanime' && isEligible(s.serverName));
      if (koroIndex !== -1) {
        selectRegularServer(koroIndex);
        return;
      }

      // First try the saved server preference (but not hd-1)
      if (preferredServerName && preferredServerName !== 'hd-1') {
        const savedIndex = availableServers.findIndex(s => s.serverName === preferredServerName);
        if (savedIndex !== -1 && isEligible(availableServers[savedIndex].serverName)) {
          selectRegularServer(savedIndex);
          return;
        }
      }
      // Try to find hd-1 (Goku) as default
      const hd1Index = availableServers.findIndex(s => s.serverName === 'hd-1' && isEligible(s.serverName));
      if (hd1Index !== -1) {
        selectRegularServer(hd1Index);
      } else {
        // Fallback to first server
        const firstEligible = availableServers.findIndex((s) => isEligible(s.serverName));
        selectRegularServer(firstEligible === -1 ? 0 : firstEligible);
      }
    }
  }, [availableServers, selectedServerIndex, preferredServerName, animeId, decodedEpisodeId, category, selectRegularServer]);

  const currentServer = useMemo(() => {
    if (selectedServerIndex === -5 && selectedProviderServerKey) {
      return {
        serverId: -5,
        serverName: selectedProviderServerKey,
        providerKey: selectedProviderServerKey,
        providerName: selectedProviderServerKey,
        displayName: selectedProviderServerKey,
        isProviderServer: true,
      };
    }

    // If selectedServerIndex is valid, use it; otherwise try to find a default
    if (selectedServerIndex >= 0 && availableServers[selectedServerIndex]) {
      return availableServers[selectedServerIndex];
    }
    // Fallback to hd-1 if available
    const hd1 = availableServers.find(s => s.serverName === 'hd-1');
    if (hd1) return hd1;
    // Otherwise use first available server
    return availableServers[0] || null;
  }, [availableServers, selectedServerIndex, selectedProviderServerKey]);

  const activeSelectionIdentity = useMemo(() => {
    if (selectedServerIndex >= 0) {
      const pinnedServerName = selectedServerNameRef.current || availableServers[selectedServerIndex]?.serverName || "";
      return [decodedEpisodeId, category, "server", pinnedServerName.toLowerCase()].join("|");
    }

    if (selectedServerIndex === -5) {
      return [decodedEpisodeId, category, "provider", (selectedProviderServerKey || "").toLowerCase()].join("|");
    }

    if (selectedServerIndex === -4) {
      return [decodedEpisodeId, category, "grouped", (selectedLangCode || "").toLowerCase(), (preferredServerName || "").toLowerCase()].join("|");
    }

    if (selectedServerIndex === -3) {
      return [decodedEpisodeId, category, "m3u8", (selectedLangCode || "").toLowerCase()].join("|");
    }

    if (selectedServerIndex === -2) {
      return [decodedEpisodeId, category, "embed", (selectedLangCode || "").toLowerCase()].join("|");
    }

    return [decodedEpisodeId, category, String(selectedServerIndex)].join("|");
  }, [decodedEpisodeId, category, selectedServerIndex, selectedLangCode, selectedProviderServerKey, preferredServerName, availableServers]);

  useEffect(() => {
    setLockedSourceUrl(null);
  }, [activeSelectionIdentity]);

  // Find current episode BEFORE using it in hooks
  const currentEpisodeIndex = useMemo(() => {
    const list = isOfflineMode ? offlineManifest?.episodes : episodesData?.episodes;
    return list?.findIndex(
      (ep: any) => (ep.episodeId || ep.id) === decodedEpisodeId
    ) ?? -1;
  }, [isOfflineMode, offlineManifest, episodesData, decodedEpisodeId]);

  const currentEpisode = useMemo(() => {
    const list = isOfflineMode ? offlineManifest?.episodes : episodesData?.episodes;
    return list?.[currentEpisodeIndex];
  }, [isOfflineMode, offlineManifest, episodesData, currentEpisodeIndex]);

  const prevEpisode = useMemo(() => {
    const list = isOfflineMode ? offlineManifest?.episodes : episodesData?.episodes;
    return currentEpisodeIndex > 0 ? list?.[currentEpisodeIndex - 1] : null;
  }, [isOfflineMode, offlineManifest, episodesData, currentEpisodeIndex]);

  const nextEpisode = useMemo(() => {
    const list = isOfflineMode ? offlineManifest?.episodes : episodesData?.episodes;
    return currentEpisodeIndex < (list?.length ?? 0) - 1 ? list?.[currentEpisodeIndex + 1] : null;
  }, [isOfflineMode, offlineManifest, episodesData, currentEpisodeIndex]);

  // Keep combined source query stable so manual server selection doesn't trigger full refetch.
  const combinedSourceServer = "hd-1";

  useEffect(() => {
    if (isOfflineMode || !nextEpisode?.episodeId) return;
    queryClient.prefetchQuery({
      queryKey: [
        "combined-sources",
        nextEpisode.episodeId,
        animeData?.info.name,
        nextEpisode.number,
        combinedSourceServer,
        category,
        user?.id,
        (animeData as any)?.anilistID || animeData?.moreInfo.anilistId || null,
        (animeData as any)?.malID || animeData?.moreInfo.malId || null,
      ],
      queryFn: () =>
        fetchCombinedSources(
          nextEpisode.episodeId,
          animeData?.info.name,
          nextEpisode.number,
          combinedSourceServer,
          category,
          user?.id,
          (animeData as any)?.anilistID || animeData?.moreInfo.anilistId || null,
          (animeData as any)?.malID || animeData?.moreInfo.malId || null
        ),
      staleTime: 2 * 60 * 1000,
    });
  }, [
    animeData?.info.name,
    animeData?.moreInfo.anilistId,
    animeData?.moreInfo.malId,
    category,
    combinedSourceServer,
    isOfflineMode,
    nextEpisode?.episodeId,
    nextEpisode?.number,
    queryClient,
    user?.id,
  ]);

  const discordDetails = animeData?.info.name ?? null;

  const {
    data: sourcesData,
    isLoading: loadingSources,
    isFetching: fetchingSources,
    error: sourcesError,
    refetch: refetchSources,
  } = useCombinedSourcesWithRefetch(
    decodedEpisodeId,
    animeData?.info.name,
    currentEpisode?.number,
    combinedSourceServer,
    category,
    user?.id,
    (animeData as any)?.anilistID || animeData?.moreInfo.anilistId || null,
    (animeData as any)?.malID || animeData?.moreInfo.malId || null
  );

  const { data: fastStartData, isLoading: loadingFastStart } = useQuery({
    queryKey: ["fast-start-source", decodedEpisodeId, currentServer?.serverName, category],
    enabled: !isOfflineMode && !!decodedEpisodeId && !!currentServer?.serverName,
    staleTime: 90 * 1000,
    queryFn: async () => {
      const empty = {
        headers: { Referer: "", "User-Agent": "" },
        sources: [],
        subtitles: [],
        tracks: [],
        anilistID: null,
        malID: null,
        intro: null,
        outro: null,
      };
      try {
        return await fetchCombinedSources(
          decodedEpisodeId,
          animeData?.info.name,
          currentEpisode?.number,
          currentServer?.serverName || "hd-1",
          category,
          user?.id,
          (animeData as any)?.anilistID || animeData?.moreInfo.anilistId || null,
          (animeData as any)?.malID || animeData?.moreInfo.malId || null
        );
      } catch {
        return empty;
      }
    },
  });

  const sourceDataForPlayback = useMemo(() => {
    const normalizeForBlocked = (value?: string | null) => {
      const raw = String(value || "").trim();
      if (!raw) return "";

      try {
        const parsed = new URL(raw, window.location.origin);
        const upstream = parsed.searchParams.get("url");
        return String(upstream || parsed.href || raw).trim();
      } catch {
        return raw;
      }
    };

    const countUsableSources = (payload: any): number => {
      const rows = Array.isArray(payload?.sources) ? payload.sources : [];
      const now = Date.now();
      return rows.filter((source: any) => {
        const normalized = normalizeForBlocked(source?.url);
        if (!normalized) return false;
        const expiresAt = blockedSourceUrls[normalized];
        return !(Number.isFinite(expiresAt) && expiresAt > now);
      }).length;
    };

    const usableCombinedCount = countUsableSources(sourcesData);
    const usableFastStartCount = countUsableSources(fastStartData);

    if (usableCombinedCount > 0 && sourcesData?.sources?.length) return sourcesData;
    if (usableFastStartCount > 0 && fastStartData?.sources?.length) return fastStartData;
    if (fastStartData?.sources?.length) return fastStartData;
    if (sourcesData?.sources?.length) return sourcesData;
    return sourcesData || fastStartData;
  }, [sourcesData, fastStartData, blockedSourceUrls]);

  const normalizePlaybackSourceUrl = useCallback((value?: string | null) => {
    const raw = String(value || "").trim();
    if (!raw) return "";

    try {
      const parsed = new URL(raw, window.location.origin);
      const upstream = parsed.searchParams.get("url");
      return String(upstream || parsed.href || raw).trim();
    } catch {
      return raw;
    }
  }, []);

  const isPlaybackSourceBlocked = useCallback(
    (value?: string | null) => {
      const normalized = normalizePlaybackSourceUrl(value);
      if (!normalized) return false;

      const expiresAt = blockedSourceUrls[normalized];
      return Number.isFinite(expiresAt) && expiresAt > Date.now();
    },
    [blockedSourceUrls, normalizePlaybackSourceUrl],
  );

  const blockPlaybackSourceUrl = useCallback(
    (value?: string | null, ttlMs = 2 * 60 * 1000) => {
      const normalized = normalizePlaybackSourceUrl(value);
      if (!normalized) return;

      const expiresAt = Date.now() + Math.max(15000, ttlMs);
      setBlockedSourceUrls((previous) => {
        const next: Record<string, number> = { ...previous, [normalized]: expiresAt };
        const now = Date.now();
        for (const [url, expiry] of Object.entries(next)) {
          if (!Number.isFinite(expiry) || expiry <= now) {
            delete next[url];
          }
        }
        return next;
      });
    },
    [normalizePlaybackSourceUrl],
  );

  const visibleSources = useMemo(() => {
    const rawSources = sourceDataForPlayback?.sources || [];
    const unblockedSources = rawSources.filter((source) => !isPlaybackSourceBlocked(source?.url));
    const seen = new Set<string>();

    return unblockedSources.filter((source) => {
      if (!source?.url) return false;
      const key = [
        String(source.url || '').trim().toLowerCase(),
        String(source.server || source.providerKey || source.providerName || '').trim().toLowerCase(),
        String(source.langCode || source.language || '').trim().toLowerCase(),
        String(source.quality || '').trim().toLowerCase(),
        source.isEmbed ? 'embed' : 'direct',
        source.isM3U8 ? 'm3u8' : 'file',
      ].join('|');

      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [sourceDataForPlayback?.sources, isPlaybackSourceBlocked]);

  const hasWatchAnimeWorldAvailable = useMemo(() => {
    return visibleSources.some((s: any) =>
      s.langCode?.startsWith('watchanimeworld') ||
      s.langCode?.startsWith('watchaw') ||
      s.providerKey === 'watchaw' ||
      s.providerName?.toLowerCase().includes('watchaw') ||
      s.providerName?.includes('Goku') ||
      s.providerName?.includes('Luffy') ||
      s.providerName?.includes('Z-Fighter')
    );
  }, [visibleSources]);

  // Get next episode estimates for current source
  const getNextEpisodeEstimate = (source: any): string | null => {
    if (isOfflineMode) return null;
    if (!sourcesData?.nextEpisodeEstimates || !source) return null;

    // Find estimate matching this source's language/server
    const estimate = sourcesData.nextEpisodeEstimates.find(e =>
      (!e.lang || source.language?.toLowerCase().includes(e.lang.toLowerCase())) &&
      (!e.server || source.providerName?.includes(e.server))
    );

    return estimate ? estimate.label : null;
  };

  const getUrlHost = (url?: string) => {
    if (!url) return "unknown";
    try {
      return new URL(url).host || "unknown";
    } catch {
      return "unknown";
    }
  };

  // Fetch subtitles from sub stream in a lightweight way when watching dub.
  // Avoid full combined provider fan-out here to prevent duplicate API bursts.
  const { data: subSourcesData } = useQuery({
    queryKey: ["sub-track-only", decodedEpisodeId, combinedSourceServer],
    enabled: category === "dub" && !isOfflineMode && !!decodedEpisodeId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const empty = {
        headers: { Referer: "", "User-Agent": "" },
        sources: [],
        subtitles: [],
        tracks: [],
        anilistID: null,
        malID: null,
        intro: null,
        outro: null,
      };
      try {
        return await fetchCombinedSources(
          decodedEpisodeId,
          animeData?.info.name,
          currentEpisode?.number,
          combinedSourceServer,
          "sub",
          user?.id,
          (animeData as any)?.anilistID || animeData?.moreInfo.anilistId || null,
          (animeData as any)?.malID || animeData?.moreInfo.malId || null
        );
      } catch {
        return empty;
      }
    },
  });

  // Auto-select WatchAnimeWorld language if saved preference exists
  useEffect(() => {
    if (hasWatchAnimeWorldAvailable && selectedLangCode && selectedServerIndex === -1) {
      // Check if the saved language exists in current sources
      const langExists = visibleSources.some(s => s.langCode === selectedLangCode);
      if (langExists) {
        selectRegularServer(-2); // Select WatchAnimeWorld
      }
    }
  }, [hasWatchAnimeWorldAvailable, selectedLangCode, selectedServerIndex, visibleSources, selectRegularServer]);

  // Normalize subtitles - in dub mode, ALWAYS prefer sub source subs since dub rarely has them
  const normalizedSubtitles = useMemo(() => {
    let subs: Array<{ lang: string; url: string; label?: string; sourceOrigin?: string }> = [];

    if (category === "dub") {
      const subTracks = [
        ...(subSourcesData?.subtitles || []),
        ...(subSourcesData?.tracks || []),
      ];
      const dubTracks = [
        ...(sourceDataForPlayback?.subtitles || []),
        ...(sourceDataForPlayback?.tracks || []),
      ];
      subs = buildDubSubtitles(dubTracks, subTracks);
    } else {
      // For sub mode, use current sources
      const allTracks = [
        ...(sourceDataForPlayback?.subtitles || []),
        ...(sourceDataForPlayback?.tracks || [])
      ];
      const seenUrls = new Set<string>();
      const seenLanguages = new Set<string>();
      const normalizeLanguage = (track: { lang?: string; label?: string }) => {
        const raw = `${track.lang || ''} ${track.label || ''}`.toLowerCase();
        const compact = raw.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
        if (!compact) return '';
        if (compact === 'en' || compact.includes('english') || compact.includes('eng')) return 'en';
        if (compact === 'ja' || compact.includes('japanese') || compact.includes('jpn')) return 'ja';
        if (compact === 'hi' || compact.includes('hindi')) return 'hi';
        if (compact === 'es' || compact.includes('spanish') || compact.includes('espanol')) return 'es';
        return compact;
      };

      subs = allTracks.filter(s => {
        const urlKey = String(s.url || '').trim();
        const languageKey = normalizeLanguage(s);
        if (!urlKey) return false;
        if (seenUrls.has(urlKey)) return false;
        if (languageKey && seenLanguages.has(languageKey)) return false;
        seenUrls.add(urlKey);
        if (languageKey) seenLanguages.add(languageKey);
        return true;
      });
    }

    const languageRank = (sub: { lang?: string; label?: string }) => {
      const value = `${sub.lang || ''} ${sub.label || ''}`.toLowerCase();
      if (value.includes('english') || value.includes('eng') || value.trim() === 'en') return 0;
      if (value.includes('japanese') || value.includes('jpn') || value.trim() === 'ja') return 1;
      if (value.includes('hindi') || value.includes('hin') || value.trim() === 'hi') return 2;
      return 10;
    };

    const seen = new Set<string>();
    return subs
      .filter(sub =>
        sub.lang &&
        sub.lang.toLowerCase() !== 'thumbnails' &&
        !sub.url?.includes('thumbnails')
      )
      .filter((sub) => {
        const key = `${String(sub.lang || '').toLowerCase()}|${String(sub.url || '').trim().toLowerCase()}`;
        if (!String(sub.url || '').trim() || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((left, right) => languageRank(left) - languageRank(right));
  }, [sourceDataForPlayback, subSourcesData, category]);

  // Select the appropriate source to play
  const resolvedSelectedSource = useMemo(() => {
    if (!visibleSources.length) return null;

    // Handle grouped sources (index -4)
    if (selectedServerIndex === -4 && selectedLangCode) {
      // If we have a provider name in state, match it too
      return visibleSources.find(s =>
        s.langCode === selectedLangCode &&
        (preferredServerName ? s.providerName === preferredServerName : true)
      );
    }

    // Handle M3U8 multi-language sources (index -3)
    if (selectedServerIndex === -3 && selectedLangCode) {
      return visibleSources.find(s => s.langCode === selectedLangCode && s.isM3U8 && !s.isEmbed);
    }

    // Handle embed sources (index -2)
    if (selectedServerIndex === -2 && selectedLangCode) {
      return visibleSources.find(s => s.langCode === selectedLangCode && s.isEmbed);
    }

    // Handle Tatakai provider groups (index -5)
    if (selectedServerIndex === -5 && selectedProviderServerKey) {
      return selectSourceForServer(visibleSources, selectedProviderServerKey, category);
    }

    // Handle regular servers
    if (selectedServerIndex >= 0 && availableServers[selectedServerIndex]) {
      const serverName = availableServers[selectedServerIndex].serverName;
      const isKoroServer = String(serverName || "").trim().toLowerCase() === "justanime";
      const candidatePool = isKoroServer
        ? visibleSources
        : visibleSources.filter((source) => {
          const providerKey = String(source.providerKey || "").trim().toLowerCase();
          const providerName = String(source.providerName || "").trim().toLowerCase();
          return providerKey !== "justanime" && !providerName.includes("koro");
        });
      return selectSourceForServer(candidatePool, serverName, category);
    }

    return null;
  }, [visibleSources, selectedServerIndex, selectedLangCode, selectedProviderServerKey, availableServers, preferredServerName]);

  const selectedSource = useMemo(() => {
    if (!visibleSources.length) return null;

    if (lockedSourceUrl && !isPlaybackSourceBlocked(lockedSourceUrl)) {
      const locked = visibleSources.find((source) => source.url === lockedSourceUrl);
      if (locked) return locked;
    }

    return resolvedSelectedSource;
  }, [visibleSources, lockedSourceUrl, resolvedSelectedSource, isPlaybackSourceBlocked]);

  useEffect(() => {
    if (!selectedSource?.url) return;
    if (isPlaybackSourceBlocked(selectedSource.url)) return;

    setLockedSourceUrl((current) => {
      if (!current) return selectedSource.url;
      if (current === selectedSource.url) return current;
      if (isPlaybackSourceBlocked(current)) return selectedSource.url;

      const currentStillVisible = visibleSources.some((source) => source.url === current);
      return currentStillVisible ? current : selectedSource.url;
    });
  }, [selectedSource?.url, visibleSources, isPlaybackSourceBlocked]);

  useEffect(() => {
    if (!lockedSourceUrl) return;
    if (!isPlaybackSourceBlocked(lockedSourceUrl)) return;
    setLockedSourceUrl(null);
  }, [lockedSourceUrl, isPlaybackSourceBlocked]);

  const playbackHeaders = useMemo<{ Referer?: string; "User-Agent"?: string;[key: string]: string | undefined }>(() => {
    if (torrentPlaybackSource) {
      return {};
    }

    const baseHeaders: { Referer?: string; "User-Agent"?: string } = (sourceDataForPlayback?.headers || {}) as { Referer?: string; "User-Agent"?: string };
    const variants = getRefererVariants(baseHeaders?.Referer);
    const chosenReferer = variants[Math.min(refererRetryIndex, Math.max(0, variants.length - 1))];

    return {
      ...baseHeaders,
      Referer: chosenReferer || baseHeaders?.Referer,
      "User-Agent": baseHeaders?.["User-Agent"],
    };
  }, [sourceDataForPlayback?.headers?.Referer, sourceDataForPlayback?.headers?.["User-Agent"], refererRetryIndex, torrentPlaybackSource]);

  const playbackCandidateSource = useMemo(() => {
    return torrentPlaybackSource || resolvedSelectedSource || null;
  }, [torrentPlaybackSource, resolvedSelectedSource]);

  const playbackSources = useMemo(() => {
    if (torrentPlaybackSource) {
      return [torrentPlaybackSource];
    }

    return visibleSources;
  }, [torrentPlaybackSource, visibleSources]);

  useEffect(() => {
    if (!playbackCandidateSource) {
      if (pendingPlaybackCommitRef.current) {
        setCommittedPlaybackSource(null);
        setCommittedPlaybackHeaders(null);
      }
      return;
    }

    if (!committedPlaybackSource || pendingPlaybackCommitRef.current) {
      setCommittedPlaybackSource(playbackCandidateSource);
      setCommittedPlaybackHeaders(playbackHeaders);
      pendingPlaybackCommitRef.current = false;
    }
  }, [playbackCandidateSource, playbackHeaders, committedPlaybackSource]);

  const activePlaybackSource = committedPlaybackSource || playbackCandidateSource;
  const activePlaybackHeaders = committedPlaybackHeaders || playbackHeaders;
  const playbackLoading = torrentPlaybackLoading || !playbackCandidateSource || !sourceReady;

  useEffect(() => {
    let cancelled = false;

    const runPreflight = async () => {
      if (!activePlaybackSource || isOfflineMode || activePlaybackSource.isEmbed || activePlaybackSource.sourceType === 'torrent') {
        setSourceReady(true);
        setSourcePreflightError(null);
        return;
      }

      const directUrl = activePlaybackSource.url.startsWith("http")
        ? getProxiedVideoUrl(activePlaybackSource.url, activePlaybackHeaders?.Referer, activePlaybackHeaders?.["User-Agent"])
        : activePlaybackSource.url;

      const result = await preflightSourceUrl(directUrl, 4500);
      if (cancelled) return;

      const categoryType = category as "sub" | "dub";
      const serverName = currentServer?.serverName || activePlaybackSource.server || activePlaybackSource.providerName || "unknown";
      recordSourceHealth(serverName, categoryType, result.ok, result.latencyMs);
      recordProviderQualityOutcome(
        activePlaybackSource.providerName || activePlaybackSource.server || serverName,
        categoryType,
        activePlaybackSource.quality,
        result.ok
      );
      logPlaybackTelemetry({
        type: "source_health",
        animeId,
        episodeId: decodedEpisodeId,
        category,
        serverName,
        ok: result.ok,
        latencyMs: result.latencyMs,
        userId: user?.id,
      });

      if (!result.ok) {
        const isLikelyHls = Boolean(activePlaybackSource?.isM3U8) || /\.m3u8(?:$|[?#])/i.test(activePlaybackSource?.url || "");
        if (isLikelyHls) {
          // HLS preflight can fail on strict CDNs while actual playback succeeds via proxy failover.
          setSourceReady(true);
          setSourcePreflightError("Stream preflight failed. Trying HLS fallback...");
          return;
        }

        setSourceReady(false);
        setSourcePreflightError("Stream preflight failed. Retrying server...");
      } else {
        setSourceReady(true);
        setSourcePreflightError(null);
      }
    };

    runPreflight();

    return () => {
      cancelled = true;
    };
  }, [activePlaybackSource?.url, activePlaybackSource?.providerName, activePlaybackSource?.server, activePlaybackSource?.isEmbed, isOfflineMode, activePlaybackHeaders?.Referer, activePlaybackHeaders?.["User-Agent"], category, currentServer?.serverName, animeId, decodedEpisodeId, user?.id]);

  // Separate Marketplace sources
  const marketplaceSources = useMemo(() => {
    return visibleSources
      .filter(s => s.langCode?.startsWith('marketplace-'))
      .map((source: any) => {
        const meta = (source?.metadata && typeof source.metadata === 'object') ? source.metadata : {};
        return {
          ...source,
          sourceType: source.sourceType || meta.sourceType || (source.magnetLink || meta.magnet_link ? 'magnet' : undefined),
          magnetLink: source.magnetLink || meta.magnet_link,
          torrentFileUrl: source.torrentFileUrl || meta.torrent_file_url,
          externalUrl: source.externalUrl || meta.external_url,
          streamUrl: source.streamUrl || meta.stream_url || source.url,
          quality: source.quality || meta.quality,
          codec: source.codec || meta.codec,
          audio: source.audio || meta.audio,
          subtitleType: source.subtitleType || meta.subtitleType,
          episodeRange: source.episodeRange || meta.episodeRange,
          releaseGroup: source.releaseGroup || meta.releaseGroup,
          notes: source.notes || meta.notes,
        };
      });
  }, [visibleSources]);

  const officialServerNameSet = useMemo(() => {
    return new Set(availableServers.map((server) => String(server.serverName || "").trim().toLowerCase()).filter(Boolean));
  }, [availableServers]);

  const isOfficialSource = useCallback((source: any) => {
    if (!source) return false;

    if (String(source.providerKey || "").trim().toLowerCase() === "justanime") {
      return false;
    }

    const candidates = [
      String(source.server || "").trim().toLowerCase(),
      String(source.providerKey || "").trim().toLowerCase(),
      String(source.providerName || "").trim().toLowerCase(),
    ].filter(Boolean);

    if (candidates.some((value) => /^hd-\d+$/i.test(value))) return true;
    return candidates.some((value) => officialServerNameSet.has(value));
  }, [officialServerNameSet]);

  const providerSourceCount = useMemo(() => {
    return visibleSources.filter((source) =>
      !isOfficialSource(source) &&
      !!source.providerName &&
      source.providerName !== 'TatakaiAPI' &&
      !source.langCode?.startsWith('marketplace-')
    ).length;
  }, [visibleSources, isOfficialSource]);

  useEffect(() => {
    previousProviderCountRef.current = null;
    setNewProviderCount(0);
    setProviderFeedUpdatedAt(null);
    setBlockedSourceUrls({});
  }, [decodedEpisodeId, category]);

  useEffect(() => {
    if (previousProviderCountRef.current === null) {
      previousProviderCountRef.current = providerSourceCount;
      if (providerSourceCount > 0) setProviderFeedUpdatedAt(Date.now());
      return;
    }

    const previousCount = previousProviderCountRef.current;
    if (providerSourceCount > previousCount) {
      setNewProviderCount(providerSourceCount - previousCount);
      setProviderFeedUpdatedAt(Date.now());
    } else if (providerSourceCount !== previousCount) {
      setNewProviderCount(0);
      setProviderFeedUpdatedAt(Date.now());
    }

    previousProviderCountRef.current = providerSourceCount;
  }, [providerSourceCount]);

  useEffect(() => {
    if (!newProviderCount) return;
    const timer = setTimeout(() => setNewProviderCount(0), 7000);
    return () => clearTimeout(timer);
  }, [newProviderCount]);

  // Group external sources by language (excluding marketplace)
  const languageGroups = useMemo<Record<string, any[]>>(() => {
    if (visibleSources.length === 0) return {};

    return visibleSources.reduce((acc: Record<string, any[]>, source) => {
      // Only group external providers (Animelok, WatchAnimeWorld, Animeya, etc.)
      // AND exclude marketplace sources (they have their own section)
      if (isOfficialSource(source)) return acc;
      if (!source.providerName || source.providerName === 'TatakaiAPI' || source.langCode?.startsWith('marketplace-')) return acc;

      let lang = source.language || "Unknown";

      // Manual overrides & Merging variants
      const lowerLang = lang.toLowerCase();
      const lowerProvider = (source.providerName || "").toLowerCase();

      // Merge German/Deutsch/Filemoon variants into German as requested
      if (
        lowerLang.includes("german") ||
        lowerLang.includes("deutsch") ||
        lowerProvider.includes("filemoon") ||
        lowerProvider.includes("video öffnen")
      ) {
        lang = "German";
      } else if (lowerLang.includes("hindi")) {
        lang = "Hindi";
      } else if (lowerLang.includes("telugu")) {
        lang = "Telugu";
      } else if (lowerLang.includes("tamil")) {
        lang = "Tamil";
      } else if (lowerLang.includes("english") || lowerLang === "eng" || lowerLang === "en") {
        lang = "English";
      } else if (lowerLang.includes("japanese") || lowerLang === "jap" || lowerLang === "jpn") {
        lang = "Japanese";
      }

      if (!acc[lang]) acc[lang] = [];
      acc[lang].push(source);
      return acc;
    }, {});
  }, [visibleSources, isOfficialSource]);

  const uniqueLabelMap = useMemo(() => {
    const keys: string[] = [];
    const fallbackByKey: Record<string, string> = {};

    for (const server of availableServers) {
      const key = String(server.serverName);
      keys.push(key);
      fallbackByKey[key] = String(server.displayName || server.providerName || server.serverName);
    }

    Object.entries(languageGroups).forEach(([lang, sources]) => {
      sources.forEach((source: any, sIdx: number) => {
        const key = String(source?.langCode || source?.server || source?.providerKey || `${lang}-${sIdx}`);
        keys.push(key);
        fallbackByKey[key] = String(source?.providerName || key);
      });
    });

    return buildUniqueSimpleNameMap(keys, fallbackByKey);
  }, [availableServers, languageGroups]);

  // Language-tab filter — when activeSourceLanguage is not 'all', only show sources
  // whose normalized language key matches the selected tab. This is a display-only
  // filter and never affects the underlying source selection state.
  const filteredLanguageGroups = useMemo<Record<string, any[]>>(() => {
    if (activeSourceLanguage === "all") return languageGroups;
    const filtered: Record<string, any[]> = {};
    Object.entries(languageGroups).forEach(([lang, sources]) => {
      const filteredSources = sources.filter(
        (src) =>
          normalizeWatchLanguageKey(src.language || src.audioLanguage || "") ===
          activeSourceLanguage,
      );
      if (filteredSources.length > 0) filtered[lang] = filteredSources;
    });
    return filtered;
  }, [languageGroups, activeSourceLanguage]);

  const isVerifiedProvider = (providerKey?: string, serverName?: string) => {
    const key = String(providerKey || '').toLowerCase();
    const name = String(serverName || '').toLowerCase();

    // Strictly limited to official HiAnime/Tatakai servers only
    const verified = ['hianime', 'tatakaiapi'];

    return verified.includes(key);
  };

  const getSimpleSourceLabel = (source: any, fallbackKey: string) => {
    const key = String(source?.langCode || source?.server || source?.providerKey || source?.providerName || fallbackKey);
    return uniqueLabelMap[key] || getSimpleServerDisplayName(key, String(source?.providerName || fallbackKey));
  };

  const activeServerDisplayName = useMemo(() => {
    if (isOfflineMode) return "Offline";
    if (selectedSource) {
      return getSimpleSourceLabel(selectedSource, selectedSource?.providerName || "server");
    }
    if (currentServer?.serverName) {
      return getSimpleServerDisplayName(currentServer.serverName, getFriendlyServerName(currentServer.serverName));
    }
    return undefined;
  }, [isOfflineMode, selectedSource, currentServer?.serverName, uniqueLabelMap]);

  const updateWatchHistory = useUpdateWatchHistory();
  const initialSavedRef = useRef<string | null>(null);

  // Save to localStorage for non-logged in users; save to DB for authenticated users
  useEffect(() => {
    if (!animeData || !currentEpisode) return;

    // Prevent re-running for the same episode repeatedly (avoids update loops)
    if (initialSavedRef.current === decodedEpisodeId) return;
    initialSavedRef.current = decodedEpisodeId;

    const timeout = setTimeout(async () => {
      if (user) {
        try {
          console.debug('[WatchPage] Saving watch history with IDs:', {
            animeId,
            episodeId: decodedEpisodeId,
            malID: sourcesData?.malID || animeData?.moreInfo.malId,
            anilistID: sourcesData?.anilistID || animeData?.moreInfo.anilistId,
          });
          await updateWatchHistory.mutateAsync({
            animeId,
            animeName: animeData?.info.name || 'Unknown Anime',
            animePoster: animeData?.info.poster || '',
            episodeId: decodedEpisodeId,
            episodeNumber: currentEpisode.number,
            progressSeconds: 0,
            durationSeconds: 0,
            malId: sourcesData?.malID || animeData?.moreInfo.malId || null,
            anilistId: sourcesData?.anilistID || animeData?.moreInfo.anilistId || null,
            isLastEpisode: !nextEpisode,
          });
        } catch (e) {
          console.warn('Failed to update watch history in DB:', e);
          initialSavedRef.current = null;
        }
      } else {
        updateLocalContinueWatching({
          animeId,
          animeName: animeData?.info.name || 'Unknown Anime',
          animePoster: animeData?.info.poster || '',
          episodeId: decodedEpisodeId,
          episodeNumber: currentEpisode.number,
          progressSeconds: 0,
          durationSeconds: 0,
        });
      }
    }, 5000);

    return () => clearTimeout(timeout);
  }, [user, animeData, currentEpisode, animeId, decodedEpisodeId, updateWatchHistory, sourcesData]);

  // Discord RPC is driven by VideoPlayer (elapsed/status). Clear on leave.
  useEffect(() => {
    return () => {
      if (isNative) clearDiscordRpc();
    };
  }, [isNative]);

  // Auto-switch to next working server on error
  const errorThrottleRef = useRef(0);
  const forceRefreshLockUntilRef = useRef(0);
  const forceRefreshInFlightRef = useRef(false);
  const attemptedFailoverRef = useRef<Set<string>>(new Set());
  const sourceRefreshThrottleRef = useRef(0);
  const sourceRefreshInFlightRef = useRef(false);
  const sourceRefreshHandlerRef = useRef<null | (() => Promise<void>)>(null);

  const requestSourceRefresh = useCallback((reason: string, options?: { purgeProviderFallback?: boolean }) => {
    const handler = sourceRefreshHandlerRef.current;
    if (!handler) return;

    if (options?.purgeProviderFallback) {
      markProviderSourcesExpired(reason);
    }

    const now = Date.now();
    if (sourceRefreshInFlightRef.current) return;
    if (now - sourceRefreshThrottleRef.current < 15000) return;

    pendingPlaybackCommitRef.current = true;
    sourceRefreshThrottleRef.current = now;
    sourceRefreshInFlightRef.current = true;
    setSourcePreflightError(`Refreshing stream links (${reason})...`);

    void handler().finally(() => {
      sourceRefreshInFlightRef.current = false;
    });
  }, [setSourcePreflightError]);

  const moveToNextVisibleSource = useCallback((blockedUrl?: string | null): boolean => {
    if (!Array.isArray(visibleSources) || visibleSources.length === 0) return false;

    const blockedNormalized = normalizePlaybackSourceUrl(blockedUrl || activePlaybackSource?.url || "");
    const candidates = visibleSources.filter((source) => !isPlaybackSourceBlocked(source?.url));
    if (candidates.length <= 1) return false;

    const currentIndex = candidates.findIndex((source) => {
      const normalized = normalizePlaybackSourceUrl(source?.url);
      return blockedNormalized
        ? normalized === blockedNormalized
        : normalized === normalizePlaybackSourceUrl(activePlaybackSource?.url || "");
    });

    let nextSource: any | null = null;
    if (currentIndex >= 0) {
      for (let offset = 1; offset < candidates.length; offset += 1) {
        const candidate = candidates[(currentIndex + offset) % candidates.length];
        if (!candidate?.url) continue;
        if (blockedNormalized && normalizePlaybackSourceUrl(candidate.url) === blockedNormalized) continue;
        nextSource = candidate;
        break;
      }
    } else {
      nextSource = candidates[0] || null;
    }

    if (!nextSource?.langCode) return false;

    pendingPlaybackCommitRef.current = true;
    setSelectedProviderServerKey(null);
    selectRegularServer(-4);
    setSelectedLangCode(nextSource.langCode);
    setPreferredServerName(nextSource.providerName || null);
    setLockedSourceUrl(nextSource.url || null);
    setRefererRetryIndex(0);
    return true;
  }, [visibleSources, normalizePlaybackSourceUrl, activePlaybackSource?.url, isPlaybackSourceBlocked, selectRegularServer]);

  const handleVideoError = useCallback((context?: { statusCode?: number; reason?: string }) => {
    // Throttle repeated errors to avoid rapid state updates
    const now = Date.now();
    if (now - errorThrottleRef.current < 2000) return;
    errorThrottleRef.current = now;

    if (!currentServer) return;
    if (failoverTimeoutRef.current !== null) return;

    const statusCode = Number(context?.statusCode || 0);
    const reason = String(context?.reason || "").toLowerCase();
    const isExpiredStream = statusCode === 410;
    const isForbiddenStream = statusCode === 403;
    const isMissingStream = statusCode === 404;
    const isManifestFailure = reason.includes("manifest");
    const isCodecBufferFailure =
      reason.includes("codec") ||
      reason.includes("buffer") ||
      reason.includes("stalled") ||
      reason.includes("decoder") ||
      reason.includes("unsupported") ||
      reason.includes("native-decode-error") ||
      reason.includes("native-playback-not-supported") ||
      reason.includes("native-decoder-unsupported-config") ||
      reason.includes("fatal-media-buffer") ||
      reason.includes("hls-buffer-codec-loop");

    const comboKey = comboFailureKey(animeId, decodedEpisodeId, currentServer.serverName, category);
    recordSourceFailure(comboKey);
    recordProviderQualityOutcome(
      activePlaybackSource?.providerName || activePlaybackSource?.server || currentServer.serverName,
      category,
      activePlaybackSource?.quality,
      false
    );
    logPlaybackTelemetry({
      type: "source_failure",
      animeId,
      episodeId: decodedEpisodeId,
      category,
      serverName: currentServer.serverName,
      ok: false,
      userId: user?.id,
      metadata: {
        refererRetryIndex,
        statusCode: context?.statusCode,
        reason: context?.reason,
      },
    });

    // Retry the same server with alternate referers for m3u8 before server switch.
    const refererVariants = getRefererVariants(activePlaybackHeaders?.Referer);
    if (!isExpiredStream && !isCodecBufferFailure && (activePlaybackSource?.isM3U8 || activePlaybackSource?.url?.includes(".m3u8")) && refererRetryIndex < refererVariants.length - 1) {
      pendingPlaybackCommitRef.current = true;
      setRefererRetryIndex((v) => v + 1);
      return;
    }

    if (isExpiredStream || isForbiddenStream || isMissingStream || isManifestFailure || isCodecBufferFailure) {
      const ttlMs = isExpiredStream
        ? 2 * 60 * 1000
        : isCodecBufferFailure
          ? 3 * 60 * 1000
          : 90 * 1000;
      blockPlaybackSourceUrl(activePlaybackSource?.url, ttlMs);
      setLockedSourceUrl(null);
      pendingPlaybackCommitRef.current = true;
      setCommittedPlaybackSource(null);
      setCommittedPlaybackHeaders(null);
      setRefererRetryIndex(0);

      const movedToNextSource = moveToNextVisibleSource(activePlaybackSource?.url);
      if (movedToNextSource) {
        if (isCodecBufferFailure || isManifestFailure) {
          requestSourceRefresh("codec/manifest failure", { purgeProviderFallback: false });
        }
        return;
      }

      requestSourceRefresh(
        isExpiredStream
          ? "expired stream (410)"
          : isCodecBufferFailure
            ? "codec decode error"
            : isManifestFailure
              ? "manifest error"
              : `stream error (${statusCode})`,
        { purgeProviderFallback: isExpiredStream }
      );
    }

    if (shouldAutoSkipSource(comboKey)) {
      setFailedServers((prev) => {
        const copy = new Set(prev);
        copy.add(currentServer.serverName);
        return copy;
      });
    }

    setFailedServers((prev) => {
      const copy = new Set(prev);
      copy.add(currentServer.serverName);
      return copy;
    });

    attemptedFailoverRef.current.add(currentServer.serverName);
    if (availableServers.length === 0) return;

    let nextIndex = -1;
    for (let offset = 1; offset <= availableServers.length; offset += 1) {
      const candidateIndex = (Math.max(0, selectedServerIndex) + offset) % availableServers.length;
      const candidateName = availableServers[candidateIndex]?.serverName;
      if (!candidateName) continue;
      if (attemptedFailoverRef.current.has(candidateName)) continue;
      if (failedServers.has(candidateName)) continue;
      nextIndex = candidateIndex;
      break;
    }

    if (nextIndex === -1) {
      requestSourceRefresh("all servers failed", { purgeProviderFallback: true });
      attemptedFailoverRef.current.clear();
      nextIndex = availableServers.findIndex((server) => server.serverName !== currentServer.serverName);
    }

    if (nextIndex !== -1) {
      failoverTimeoutRef.current = window.setTimeout(() => {
        setSelectedProviderServerKey(null);
        selectRegularServer(nextIndex);
        setRefererRetryIndex(0);
        failoverTimeoutRef.current = null;
      }, 3000);
    }
  }, [currentServer, availableServers, selectedServerIndex, failedServers, animeId, decodedEpisodeId, category, user?.id, refererRetryIndex, activePlaybackHeaders?.Referer, activePlaybackSource?.isM3U8, activePlaybackSource?.url, activePlaybackSource?.providerName, activePlaybackSource?.server, activePlaybackSource?.quality, selectRegularServer, requestSourceRefresh, blockPlaybackSourceUrl, moveToNextVisibleSource]);

  useEffect(() => {
    attemptedFailoverRef.current.clear();
    if (failoverTimeoutRef.current !== null) {
      window.clearTimeout(failoverTimeoutRef.current);
      failoverTimeoutRef.current = null;
    }
  }, [selectedServerIndex]);

  useEffect(() => {
    return () => {
      if (failoverTimeoutRef.current !== null) {
        window.clearTimeout(failoverTimeoutRef.current);
        failoverTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (sourceReady || !activePlaybackSource) return;
    const t = setTimeout(() => {
      handleVideoError();
    }, 200);
    return () => clearTimeout(t);
  }, [sourceReady, activePlaybackSource?.url, handleVideoError]);

  const handleServerSwitch = () => {
    if (failoverTimeoutRef.current !== null) {
      window.clearTimeout(failoverTimeoutRef.current);
      failoverTimeoutRef.current = null;
    }
    const nextIndex = (selectedServerIndex + 1) % availableServers.length;
    selectRegularServer(nextIndex);
    setSelectedProviderServerKey(null);
    if (availableServers[nextIndex]) {
      setPreferredServer(animeId, category, availableServers[nextIndex].serverName);
    }
  };

  const handleRetryCurrentServer = useCallback(() => {
    if (failoverTimeoutRef.current !== null) {
      window.clearTimeout(failoverTimeoutRef.current);
      failoverTimeoutRef.current = null;
    }

    const currentServerName = currentServer?.serverName;
    if (!currentServerName) return;

    attemptedFailoverRef.current.delete(currentServerName);
    setFailedServers((prev) => {
      if (!prev.has(currentServerName)) return prev;
      const copy = new Set(prev);
      copy.delete(currentServerName);
      return copy;
    });
  }, [currentServer?.serverName]);

  const handleForceRefreshSources = useCallback(async () => {
    const now = Date.now();
    if (forceRefreshInFlightRef.current) return;
    if (fetchingSources) return;
    if (now < forceRefreshLockUntilRef.current) return;

    forceRefreshLockUntilRef.current = now + 3000;
    forceRefreshInFlightRef.current = true;

    setFailedServers(new Set());
    setTorrentRetryTrigger(prev => prev + 1);
    toast.success("Refreshing servers...");

    try {
      clearCachedCombinedSourcesByEpisodeAndCategory(decodedEpisodeId, category);
      await queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey as any[];
          return key?.[0] === "combined-sources" && key?.[1] === decodedEpisodeId && key?.[5] === category;
        },
      });
      await refetchSources();
    } finally {
      forceRefreshInFlightRef.current = false;
    }
  }, [decodedEpisodeId, category, queryClient, refetchSources, fetchingSources]);

  useEffect(() => {
    sourceRefreshHandlerRef.current = handleForceRefreshSources;
  }, [handleForceRefreshSources]);

  const handleCategoryChange = useCallback((nextCategory: "sub" | "dub") => {
    if (nextCategory === category) return;

    if (failoverTimeoutRef.current !== null) {
      window.clearTimeout(failoverTimeoutRef.current);
      failoverTimeoutRef.current = null;
    }

    trackEvent("watch_category_switch", {
      animeId,
      episodeId: decodedEpisodeId,
      from: category,
      to: nextCategory,
    });

    logPlaybackTelemetry("category_switch", {
      type: "category_switch",
      animeId,
      episodeId: decodedEpisodeId,
      category: nextCategory,
      ok: true,
      userId: user?.id,
      metadata: { from: category, to: nextCategory },
    });

    setCategory(nextCategory);
    selectRegularServer(-1);
    setSelectedProviderServerKey(null);
    setRefererRetryIndex(0);
    setSourcePreflightError(null);
  }, [animeId, decodedEpisodeId, category, user?.id, selectRegularServer]);

  // Progress update callback for VideoPlayer - must be defined outside JSX
  const handleProgressUpdate = useCallback((progressSeconds: number, durationSeconds: number, completed?: boolean) => {
    // Track playback time for seamless torrent completion source switch
    if (Number.isFinite(progressSeconds) && progressSeconds > 0) {
      lastPlaybackTimeRef.current = progressSeconds;
    }
    if (!animeData || !currentEpisode) return;
    try {
      if (user) {
        // Use mutateAsync to avoid triggering re-renders during render
        updateWatchHistory.mutateAsync({
          animeId,
          animeName: animeData.info.name,
          animePoster: animeData.info.poster,
          episodeId: decodedEpisodeId,
          episodeNumber: currentEpisode.number,
          progressSeconds: progressSeconds,
          durationSeconds: durationSeconds,
          completed: !!completed,
          malId: sourcesData?.malID || animeData?.moreInfo.malId || null,
          anilistId: sourcesData?.anilistID || animeData?.moreInfo.anilistId || null,
          isLastEpisode: !nextEpisode,
        }).catch(e => console.warn('Failed to save progress to DB:', e));
      }
      // Always save to localStorage (for server preference and as backup)
      updateLocalContinueWatching({
        animeId,
        animeName: animeData.info.name,
        animePoster: animeData?.info.poster || '',
        episodeId: decodedEpisodeId,
        episodeNumber: currentEpisode.number,
        progressSeconds: progressSeconds,
        durationSeconds: durationSeconds || 0,
        serverName: currentServer?.serverName,
        category: category,
        languageCode: selectedLangCode || undefined, // Save WatchAnimeWorld language preference
      });
    } catch (e) {
      console.warn('Failed to save progress:', e);
    }
  }, [user, animeData, currentEpisode, animeId, decodedEpisodeId, updateWatchHistory, currentServer, category, selectedLangCode]);

  const handleEpisodeChange = (epId: string) => {
    if (failoverTimeoutRef.current !== null) {
      window.clearTimeout(failoverTimeoutRef.current);
      failoverTimeoutRef.current = null;
    }
    setFailedServers(new Set());
    setSelectedProviderServerKey(null);
    if (isOfflineMode) {
      navigate(`/watch/${encodeURIComponent(epId)}?offline=true&path=${encodeURIComponent(offlinePath)}`);
    } else {
      navigate(`/watch/${encodeURIComponent(epId)}`);
    }
  };

  // Background session management
  useEffect(() => {
    if (!torrentSessionId || !isDesktop) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // If there's an active torrent, prompt the user
      const pref = localStorage.getItem('tatakai_torrent_bg_behavior') || 'prompt';
      if (pref === 'keep') return;
      if (pref === 'stop') {
        (window as any).tatakaiRuntime?.stopTorrentSession?.(torrentSessionId);
        updateLocalTorrentSessionHistory(torrentSessionId, {
          status: 'stopped',
          endedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        return;
      }

      e.preventDefault();
      e.returnValue = 'You have an active torrent session. Do you want to keep it running in the background?';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [torrentSessionId, isDesktop]);

  // Handle navigation within the app
  useEffect(() => {
    if (!torrentSessionId || !isDesktop) return;

    return () => {
      // This runs when the component unmounts (navigation away)
      const pref = localStorage.getItem('tatakai_torrent_bg_behavior') || 'prompt';
      if (pref === 'keep') return;
      if (pref === 'stop') {
        (window as any).tatakaiRuntime?.stopTorrentSession?.(torrentSessionId);
        updateLocalTorrentSessionHistory(torrentSessionId, {
          status: 'stopped',
          endedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        return;
      }

      // If prompt, we can't easily show a standard confirm here because it's async and navigation is already happening
      // For now, we'll default to 'keep' but notify the user
      toast.info('Torrent session is running in the background. You can stop it from the Home page or Settings.');
    };
  }, [torrentSessionId, isDesktop]);

  useEffect(() => {
    setRefererRetryIndex(0);
  }, [selectedSource?.url]);

  useEffect(() => {
    if (!sourceReady || !currentServer) return;
    const comboKey = comboFailureKey(decodedEpisodeId, currentServer.serverName, category);
    clearSourceFailure(comboKey);
  }, [sourceReady, currentServer?.serverName, animeId, decodedEpisodeId, category]);

  const handleEpisodeEnd = () => {
    if (settings.autoNextEpisode && nextEpisode?.episodeId) {
      handleEpisodeChange(nextEpisode.episodeId);
      return;
    }

    if (isDesktop && torrentSessionId && (window as any).tatakaiRuntime?.stopTorrentSession) {
      const keepCompletedFile = Boolean(torrentLiveStats?.done || torrentProgressPercent >= 100);
      const destroyStore = Boolean(optimizeTorrentStorage && !keepCompletedFile);
      void (window as any).tatakaiRuntime.stopTorrentSession(torrentSessionId, { destroyStore }).catch(() => { });
    }

    if (torrentSessionId) {
      updateLocalTorrentSessionHistory(torrentSessionId, {
        status: 'completed',
        endedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        progress: 100,
      });
    }

    setShowReviewPopup(true);
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Background />
      <Sidebar />

      <main className={cn(
        "relative z-10 pr-4 md:pr-6 py-4 md:py-6 max-w-[1800px] mx-auto pb-24 md:pb-6",
        isDesktop ? "pl-4 md:pl-6" : "pl-4 md:pl-32"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-4 md:mb-6">
          <button
            onClick={() => isOfflineMode ? navigate('/offline') : navigate(`/anime/${animeId}`)}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors group"
          >
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="hidden sm:inline">Back</span>
          </button>

          {animeData && (
            <div className="flex-1 min-w-0 text-right flex flex-col items-end gap-2">
              <span className="font-medium text-foreground text-sm md:text-base truncate block">
                {animeData?.info.name || offlineManifest?.animeName}
              </span>
              <div className="flex items-center gap-4">
                {viewCount !== undefined && viewCount > 0 && (
                  <span className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                    <Eye className="w-3 h-3" />
                    {formatViewCount(viewCount)} views
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Main Content - Stack on mobile, grid on desktop */}
        <div className={cn(
          "flex flex-col gap-4 md:gap-6",
          !isGenericTorrent && "xl:grid xl:grid-cols-12"
        )}>
          {/* Video Player Column */}
          <div className={cn(
            "space-y-4 md:space-y-6",
            !isGenericTorrent ? "xl:col-span-9" : "w-full"
          )}>
            {/* Torrent status moved to sticky banner (see TorrentStickyBanner) */}

            <div className="rounded-xl md:rounded-2xl overflow-hidden border border-border/30 bg-card/60">

              {/* Render EmbedPlayer for embed sources */}
              {activePlaybackSource?.isEmbed ? (
                <EmbedPlayer
                  url={activePlaybackSource.url}
                  poster={animeData?.info.poster}
                  language={activePlaybackSource.language}
                  onError={handleVideoError}
                />
              ) : isMobileApp ? (
                <MobileVideoPlayer
                  sources={isOfflineMode ? offlineSources : playbackSources}
                  subtitles={isOfflineMode ? offlineSubtitles : normalizedSubtitles}
                  headers={activePlaybackHeaders}
                  poster={animeData?.info.poster || (isOfflineMode ? toLocalFileUrl(joinLocalPath(offlinePath, 'poster.jpg')) : undefined)}
                  onError={handleVideoError}
                  onServerSwitch={handleServerSwitch}
                  onRetryCurrentServer={handleRetryCurrentServer}
                  isLoading={isOfflineMode ? false : playbackLoading}
                  serverName={activeServerDisplayName}
                  malId={sourcesData?.malID || animeData?.moreInfo.malId}
                  episodeNumber={currentEpisode?.number || (isOfflineMode ? offlineManifest?.episodes.find((e: any) => e.id === decodedEpisodeId)?.number : undefined)}
                  introWindow={sourceDataForPlayback?.intro || null}
                  outroWindow={sourceDataForPlayback?.outro || null}
                  initialSeekSeconds={initialSeekSeconds}
                  onProgressUpdate={handleProgressUpdate}
                  animeId={animeId}
                  animeName={animeData?.info.name || (isOfflineMode ? offlineManifest?.animeName : '')}
                  animePoster={animeData?.info.poster || (isOfflineMode ? toLocalFileUrl(joinLocalPath(offlinePath, 'poster.jpg')) : undefined)}
                  episodeTitle={currentEpisode?.title || (isOfflineMode ? offlineManifest?.episodes.find((e: any) => e.id === decodedEpisodeId)?.title : undefined)}
                  episodeId={decodedEpisodeId}
                  onEpisodeEnd={handleEpisodeEnd}
                  onBack={() => navigate(-1)}
                  hideTimelineUi={Boolean(torrentSessionId && !torrentVerified)}
                  isOffline={isOfflineMode}
                />
              ) : (
                <VideoPlayer
                  sources={isOfflineMode ? offlineSources : playbackSources}
                  subtitles={isOfflineMode ? offlineSubtitles : normalizedSubtitles}
                  headers={activePlaybackHeaders}
                  poster={animeData?.info.poster || (isOfflineMode ? toLocalFileUrl(joinLocalPath(offlinePath, 'poster.jpg')) : undefined)}
                  onError={handleVideoError}
                  onServerSwitch={handleServerSwitch}
                  onRetryCurrentServer={handleRetryCurrentServer}
                  isLoading={isOfflineMode ? false : playbackLoading}
                  serverName={activeServerDisplayName}
                  malId={sourcesData?.malID || animeData?.moreInfo.malId}
                  episodeNumber={currentEpisode?.number || (isOfflineMode ? offlineManifest?.episodes.find((e: any) => e.id === decodedEpisodeId)?.number : undefined)}
                  introWindow={sourceDataForPlayback?.intro || null}
                  outroWindow={sourceDataForPlayback?.outro || null}
                  initialSeekSeconds={initialSeekSeconds}
                  viewCount={viewCount}
                  onProgressUpdate={handleProgressUpdate}
                  animeId={animeId}
                  animeName={animeData?.info.name || (isOfflineMode ? offlineManifest?.animeName : '')}
                  animePoster={animeData?.info.poster || (isOfflineMode ? toLocalFileUrl(joinLocalPath(offlinePath, 'poster.jpg')) : undefined)}
                  episodeTitle={currentEpisode?.title || (isOfflineMode ? offlineManifest?.episodes.find((e: any) => e.id === decodedEpisodeId)?.title : undefined)}
                  episodeId={decodedEpisodeId}
                  onEpisodeEnd={handleEpisodeEnd}
                  isTimelineLocked={torrentTimelineLocked}
                  timelineLockReason="Torrent seeking unlocks after the file has fully downloaded and verified."
                  hideTimelineUi={Boolean(torrentSessionId && !torrentVerified)}
                  isOffline={isOfflineMode}
                  torrentStats={torrentLiveStats || undefined}
                  torrentSessionId={torrentSessionId || undefined}
                  onTorrentRepair={async () => {
                    try {
                      await (window as any).tatakaiRuntime?.reannounceTorrent?.(torrentSessionId);
                      toast.success('Repair requested');
                    } catch (e) {
                      toast.error('Repair failed');
                    }
                  }}
                  onTorrentStop={async () => {
                    try {
                      await (window as any).tatakaiRuntime?.stopTorrentSession?.(torrentSessionId, { removeData: false });
                      toast.success('Torrent stopped');
                      setTorrentLiveStats(null);
                      setTorrentPlaybackSource(null);
                    } catch (e) {
                      toast.error('Failed to stop torrent');
                    }
                  }}
                />
              )}
            </div>

            {/* Episode Info & Navigation */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h1 className="font-display text-lg md:text-2xl font-bold">
                  {isGenericTorrent
                    ? (torrentLiveStats?.name || 'Torrent Content')
                    : `Episode ${currentEpisode?.number || (isOfflineMode ? offlineManifest?.episodes.find((e: any) => e.id === decodedEpisodeId)?.number : "?")}`
                  }
                </h1>
                {!isGenericTorrent && currentEpisode?.title && (
                  <p className="text-muted-foreground text-sm mt-1 line-clamp-1">
                    {currentEpisode.title}
                  </p>
                )}
              </div>

              {!isGenericTorrent && (
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  {/* Secondary Actions */}
                  <div className="flex items-center gap-1 mr-2 px-2 border-r border-white/10">
                    <button
                      onClick={() => setIsReportModalOpen(true)}
                      className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      title="Report issue"
                    >
                      <Flag className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      onClick={() =>
                        prevEpisode && handleEpisodeChange(prevEpisode.episodeId)
                      }
                      disabled={!prevEpisode}
                      className="flex-1 sm:flex-none h-10 px-3 md:px-4 rounded-xl bg-muted hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all text-sm"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>Prev</span>
                    </button>

                    <button
                      onClick={() =>
                        nextEpisode && handleEpisodeChange(nextEpisode.episodeId)
                      }
                      disabled={!nextEpisode}
                      className="flex-1 sm:flex-none h-10 px-3 md:px-4 rounded-xl bg-primary hover:bg-primary/80 text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all text-sm"
                    >
                      <span>Next</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Server & Category Selection - Hide in offline mode or generic torrent */}
            {!isOfflineMode && !isGenericTorrent && (
              <GlassPanel className="p-4 md:p-5">
                <div className="flex flex-col gap-4 md:gap-6">
                  {/* Category Toggle */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs md:text-sm font-medium text-muted-foreground">
                      <Volume2 className="w-4 h-4" />
                      Audio
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleCategoryChange("sub")}
                        className={`h-9 md:h-10 px-4 md:px-5 rounded-xl flex items-center gap-2 font-medium transition-all text-sm ${category === "sub"
                          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                          : "bg-muted hover:bg-muted/80"
                          }`}
                      >
                        <Subtitles className="w-4 h-4" />
                        Sub
                      </button>
                      <button
                        onClick={() => handleCategoryChange("dub")}
                        className={`h-9 md:h-10 px-4 md:px-5 rounded-xl flex items-center gap-2 font-medium transition-all text-sm ${category === "dub"
                          ? "bg-secondary text-secondary-foreground shadow-lg shadow-secondary/25"
                          : "bg-muted hover:bg-muted/80"
                          }`}
                      >
                        <Volume2 className="w-4 h-4" />
                        Dub
                      </button>
                      {category === "dub" && (
                        <select
                          value={dubProfile}
                          onChange={(e) => setDubProfile(e.target.value as DubQualityProfile)}
                          className="h-9 md:h-10 px-3 rounded-xl bg-muted text-sm"
                          title="Dub profile: Stability prioritizes healthy servers; Quality prioritizes HD servers"
                        >
                          <option value="stability">Dub: Stability</option>
                          <option value="quality">Dub: Quality</option>
                        </select>
                      )}
                    </div>
                    {sourcePreflightError && (
                      <p className="text-xs text-amber-400 mt-1">{sourcePreflightError}</p>
                    )}
                  </div>

                  {/* Server Selection */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs md:text-sm font-medium text-muted-foreground">
                      <Server className="w-4 h-4" />
                      Server
                      <button
                        onClick={handleForceRefreshSources}
                        title="Fetch more servers"
                        className="p-1 hover:bg-muted rounded-md transition-colors"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${loadingSources || fetchingSources ? 'animate-spin' : ''}`} />
                      </button>
                      {isDeveloperMode && (
                        <button
                          onClick={() => setShowSourceDebug(v => !v)}
                          title="Toggle source debug"
                          className={`p-1 rounded-md transition-colors ${showSourceDebug ? 'bg-primary/20 text-primary' : 'hover:bg-muted text-muted-foreground'}`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <div className="ml-auto flex items-center gap-2">
                        <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                          {providerSourceCount} sources
                        </span>
                        {(loadingSources || fetchingSources) && (
                          <span className="text-xs bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full">
                            {providerSourceCount > 0 ? 'Adding more servers...' : 'Finding servers...'}
                          </span>
                        )}
                        {newProviderCount > 0 && (
                          <span className="text-xs bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full">
                            +{newProviderCount} new
                          </span>
                        )}
                        {!(loadingSources || fetchingSources) && providerFeedUpdatedAt && (
                          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                            Updated
                          </span>
                        )}
                        {hasWatchAnimeWorldAvailable && (
                          <span className="flex items-center gap-1 text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                            <Globe className="w-3 h-3" />
                            Multi-Language
                          </span>
                        )}
                      </div>
                    </div>
                    {loadingServers ? (
                      <div className="flex gap-2">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <Skeleton key={i} className="h-9 w-20 rounded-xl" />
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-4">
                        {/* Standard Tatakai Servers */}
                        {availableServers.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {availableServers.map((server, idx) => {
                              // Skip TatakaiAPI if other servers exist to reduce noise
                              const serverLabel = uniqueLabelMap[String(server.serverName)] || getSimpleServerDisplayName(server.serverName, server.displayName || server.providerName || server.serverName);
                              if (!server.isProviderServer && serverLabel === 'TatakaiAPI' && availableServers.length > 1) return null;

                              const serverSource = visibleSources.length
                                ? selectSourceForServer(visibleSources, server.serverName)
                                : null;
                              const nextEstimate = getNextEpisodeEstimate(serverSource);
                              const comboKey = comboFailureKey(decodedEpisodeId, server.serverName, category);
                              const failCount = getSourceFailureCount(comboKey);
                              const healthScore = getSourceHealthScore(server.serverName);
                              const workingState = failCount >= 2 || failedServers.has(server.serverName) ? "Not working" : "Working";
                              const serverDescription = `${workingState} • Health ${healthScore}/100 • Fails ${failCount} • Source ${server.serverName}${serverSource?.url ? ` • ${getUrlHost(serverSource.url)}` : ""}`;

                              return (
                                <TooltipProvider key={server.serverId}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        onClick={() => {
                                          selectRegularServer(idx);
                                          setSelectedLangCode(null);
                                          setSelectedProviderServerKey(null);
                                          setPreferredServerName(null);
                                          setFailedServers(new Set());
                                          setPreferredServer(server.serverName);
                                          setRefererRetryIndex(0);
                                        }}
                                        title={serverDescription}
                                        className={`h-9 px-3 md:px-4 rounded-xl font-medium transition-all text-sm flex items-center justify-center gap-1.5 ${idx === selectedServerIndex
                                          ? "bg-foreground text-background shadow-lg"
                                          : failedServers.has(server.serverName)
                                            ? "bg-destructive/20 text-destructive"
                                            : server.isProviderServer
                                              ? "bg-primary/5 hover:bg-primary/10 text-primary border border-primary/15"
                                              : "bg-muted hover:bg-muted/80"
                                          }`}
                                      >
                                        {serverLabel}
                                        {isVerifiedProvider(server.providerKey || (server as any).providerName, server.serverName) && (
                                          <CircleCheck className="w-3 h-3 text-primary animate-in zoom-in duration-300" />
                                        )}
                                        {failedServers.has(server.serverName) && " ✗"}
                                      </button>
                                    </TooltipTrigger>
                                    {nextEstimate && (
                                      <TooltipContent side="top" className="max-w-xs">
                                        <div className="flex items-center gap-2">
                                          <Clock className="w-3 h-3" />
                                          <span className="text-xs">
                                            {serverDescription} | Next episode for {serverSource?.language || 'this language'}: {nextEstimate}
                                          </span>
                                        </div>
                                      </TooltipContent>
                                    )}
                                    {!nextEstimate && (
                                      <TooltipContent side="top" className="max-w-xs">
                                        <div className="space-y-1">
                                          <div className="text-xs font-semibold">{serverLabel}</div>
                                          <div className="text-xs text-muted-foreground">{serverDescription}</div>
                                        </div>
                                      </TooltipContent>
                                    )}
                                  </Tooltip>
                                </TooltipProvider>
                              );
                            })}
                          </div>
                        )}

                        {/* Community Marketplace Entry Point */}
                        <div className="flex flex-col gap-4 p-4 rounded-2xl bg-primary/5 border border-primary/10 shadow-inner group">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center group-hover:bg-primary/30 transition-colors">
                                <Globe className="w-5 h-5 text-primary" />
                              </div>
                              <div>
                                <h4 className="text-sm font-bold tracking-tight">Community Marketplace</h4>
                                <p className="text-[10px] text-muted-foreground"> {marketplaceSources.length} community sources available</p>
                              </div>
                            </div>
                            <Button
                              onClick={() => setIsMarketplaceListVisible(true)}
                              className="rounded-xl px-6 font-black uppercase tracking-widest text-[10px] gap-2 shadow-lg shadow-primary/20 hover:scale-105 transition-all"
                            >
                              <TrendingUp className="w-3.5 h-3.5" /> View Marketplace
                            </Button>
                          </div>
                        </div>

                        {/* Language Groups (Categorized External Sources) */}
                        <SourceLanguageTabs
                          sources={visibleSources.filter(
                            (src) =>
                              !isOfficialSource(src) &&
                              !!src.providerName &&
                              src.providerName !== "TatakaiAPI" &&
                              !src.langCode?.startsWith("marketplace-"),
                          )}
                          activeLanguage={activeSourceLanguage}
                          onLanguageChange={setActiveSourceLanguage}
                        />
                        {Object.entries(filteredLanguageGroups).map(([lang, sources]) => (
                          <div key={lang} className="flex flex-col gap-2">
                            <div className="text-xs text-muted-foreground font-medium flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                              {lang} Sources
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {sources.map((source, sIdx) => {
                                const isSelected = selectedServerIndex === -4 &&
                                  selectedLangCode === source.langCode &&
                                  preferredServerName === source.providerName;
                                const nextEstimate = getNextEpisodeEstimate(source);
                                const label = getSimpleSourceLabel(source, `${lang}-${sIdx}`);
                                const sourceServerName = source.server || source.providerKey || source.langCode || source.providerName || `source-${sIdx}`;
                                const sourceComboKey = comboFailureKey(decodedEpisodeId, sourceServerName, category);
                                const failCount = getSourceFailureCount(sourceComboKey);
                                const healthScore = getSourceHealthScore(sourceServerName);
                                const workingState = failCount >= 2 ? "Not working" : "Working";
                                const hoverInfo = `${workingState} • Health ${healthScore}/100 • Fails ${failCount} • Source ${sourceServerName} • ${getUrlHost(source.url)}`;

                                return (
                                  <TooltipProvider key={`${source.langCode}-${source.providerName}-${sIdx}`}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          onClick={() => {
                                            selectRegularServer(-4);
                                            setSelectedLangCode(source.langCode);
                                            setPreferredServerName(source.providerName || null);
                                            setFailedServers(new Set());
                                          }}
                                          className={`h-9 px-3 md:px-4 rounded-xl font-medium transition-all text-sm flex items-center gap-2 ${isSelected
                                            ? "bg-foreground text-background shadow-lg"
                                            : source.isEmbed
                                              ? "bg-primary/5 hover:bg-primary/10 text-primary/80 border border-primary/20"
                                              : "bg-muted hover:bg-muted/80"
                                            }`}
                                          title={hoverInfo}
                                        >
                                          {source.isEmbed ? <Globe className="w-3 h-3" /> : <Server className="w-3 h-3 text-muted-foreground" />}
                                          {label}
                                          <SourceTypeBadge
                                            isM3U8={source.isM3U8}
                                            isEmbed={source.isEmbed}
                                            sourceType={source.sourceType}
                                          />
                                          {isVerifiedProvider(source.providerKey, source.server || source.providerName) && (
                                            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/20 text-[9px] font-bold text-primary border border-primary/30 ml-auto animate-in fade-in slide-in-from-right-2">
                                              <CircleCheck className="w-2.5 h-2.5" />
                                              <span>VERIFIED</span>
                                            </div>
                                          )}
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="max-w-xs bg-background/95 backdrop-blur-xl border-white/10 shadow-2xl">
                                        <div className="space-y-1.5 p-1">
                                          {source.server?.startsWith('Shared by') && (
                                            <div className="flex items-center gap-2 text-primary font-bold text-[10px] uppercase tracking-wider bg-primary/10 px-2 py-1 rounded-md mb-1">
                                              <Users className="w-3 h-3" />
                                              {source.server}
                                            </div>
                                          )}
                                          {nextEstimate && (
                                            <div className="flex items-center gap-2 text-muted-foreground text-xs">
                                              <Clock className="w-3 h-3" />
                                              <span>{hoverInfo} | Next episode: {nextEstimate}</span>
                                            </div>
                                          )}
                                          {!source.server?.startsWith('Shared by') && !nextEstimate && (
                                            <span className="text-xs">{hoverInfo}</span>
                                          )}
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                );
                              })}
                            </div>
                          </div>
                        ))}

                        {/* No Servers Message */}
                        {!loadingSources && availableServers.length === 0 && Object.keys(languageGroups).length === 0 && (
                          <div className="flex flex-col items-center justify-center p-6 text-center bg-muted/20 rounded-2xl border border-dashed border-border/50">
                            <AlertCircle className="w-8 h-8 text-muted-foreground mb-2 opacity-50" />
                            <p className="text-sm text-muted-foreground">
                              No available servers found for this episode.
                            </p>
                            <button
                              onClick={handleForceRefreshSources}
                              className="mt-3 text-xs bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1.5 rounded-lg font-bold transition-all"
                            >
                              Try Fetching Again
                            </button>
                          </div>
                        )}

                        {isDeveloperMode && showSourceDebug && (
                          <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs font-mono overflow-auto max-h-64">
                            <div>category: {category}</div>
                            <div>serverIndex: {selectedServerIndex}</div>
                            <div>sourceReady: {String(sourceReady)}</div>
                            <div>refererRetryIndex: {refererRetryIndex}</div>
                            <div>currentServer: {currentServer?.serverName || "none"}</div>
                            <pre className="mt-2 whitespace-pre-wrap break-all">{JSON.stringify(activePlaybackSource || selectedSource || null, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </GlassPanel>
            )}
          </div>

          {/* Sidebar - Episode List */}
          {!isGenericTorrent && (
            <div className="xl:col-span-3">
              <GlassPanel className="p-4 md:p-5 max-h-[400px] xl:max-h-[700px] flex flex-col">
                <div className="flex items-center gap-3 mb-3 md:mb-4">
                  <ListVideo className="w-5 h-5 text-primary" />
                  <h3 className="font-display text-base md:text-lg font-semibold">Episodes</h3>
                  <span className="ml-auto text-xs md:text-sm text-muted-foreground">
                    {episodesData?.totalEpisodes || 0}
                  </span>
                </div>

                {/* Episode Range Selector for 50+ episodes */}
                {(episodesData?.totalEpisodes || 0) > 50 && (
                  <div className="mb-3 space-y-2">
                    {/* Episode search */}
                    <div className="relative">
                      <input
                        type="number"
                        placeholder="Jump to episode..."
                        min={1}
                        max={episodesData?.totalEpisodes}
                        className="w-full h-8 px-3 rounded-lg bg-muted/50 border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const target = e.target as HTMLInputElement;
                            const epNum = parseInt(target.value);
                            if (epNum && episodesData) {
                              const ep = episodesData.episodes.find(ep => ep.number === epNum);
                              if (ep) {
                                handleEpisodeChange(ep.episodeId);
                                target.value = '';
                              }
                            }
                          }
                        }}
                      />
                    </div>
                    {/* Range buttons */}
                    <div className="flex flex-wrap gap-1">
                      {Array.from({ length: Math.ceil((episodesData?.totalEpisodes || 0) / 50) }).map((_, idx) => {
                        const start = idx * 50 + 1;
                        const end = Math.min((idx + 1) * 50, episodesData?.totalEpisodes || 0);
                        const currentEp = currentEpisode?.number || 1;
                        const isActive = currentEp >= start && currentEp <= end;
                        return (
                          <button
                            key={idx}
                            onClick={() => {
                              // Scroll to range
                              const container = document.getElementById('episode-list-container');
                              const firstEpInRange = episodesData?.episodes.find(ep => ep.number === start);
                              if (container && firstEpInRange) {
                                const epEl = document.getElementById(`ep-${firstEpInRange.episodeId}`);
                                epEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              }
                            }}
                            className={`px-2 py-1 text-xs rounded ${isActive
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted/50 hover:bg-muted'
                              }`}
                          >
                            {start}-{end}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div id="episode-list-container" className="flex-1 overflow-y-auto space-y-1.5 md:space-y-2 pr-2 scrollbar-thin">
                  {(isOfflineMode ? offlineManifest?.episodes : episodesData?.episodes)?.map((ep: any) => (
                    <button
                      key={ep.episodeId || ep.id}
                      id={`ep-${ep.episodeId || ep.id}`}
                      onClick={() => {
                        if (isOfflineMode) {
                          navigate(`/watch/${encodeURIComponent(ep.id)}?offline=true&path=${encodeURIComponent(offlinePath)}`);
                        } else {
                          handleEpisodeChange(ep.episodeId);
                        }
                      }}
                      className={`w-full text-left p-2.5 md:p-3 rounded-xl transition-all text-sm ${(ep.episodeId || ep.id) === decodedEpisodeId
                        ? "bg-primary text-primary-foreground"
                        : ep.isFiller
                          ? "bg-orange/10 border border-orange/30 hover:bg-orange/20"
                          : "bg-muted/50 hover:bg-muted"
                        }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold">EP {ep.number}</span>
                        {ep.isFiller && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange/20 text-orange">
                            Filler
                          </span>
                        )}
                        {(ep.episodeId || ep.id) === decodedEpisodeId && (
                          <span className="text-xs">▶</span>
                        )}
                      </div>
                      {(ep.title || ep.name) && (
                        <p className="text-xs mt-1 opacity-80 line-clamp-1">
                          {ep.title || ep.name}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </GlassPanel>
            </div>
          )}

          {/* Episode Comments - aligned with video column */}
          <div className="xl:col-span-9">
            <EpisodeComments
              animeId={animeId}
              episodeId={decodedEpisodeId}
              animeName={animeData?.info.name}
            />
          </div>
        </div>

      </main >

      {!isDesktop && isMobileViewport && <MobileNav />
      }

      {
        animeData && (
          <ReviewPopup
            isOpen={showReviewPopup}
            onClose={() => setShowReviewPopup(false)}
            animeId={animeId}
            animeName={animeData?.info.name || (isOfflineMode ? offlineManifest?.animeName : '')}
            userId={user?.id}
          />
        )
      }

      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        targetType="server"
        targetId={decodedEpisodeId || animeId || "unknown"}
        targetName={`${animeData?.info.name || (isOfflineMode ? offlineManifest?.animeName : '')}`}
      />

      <MarketplaceSubmitModal
        isOpen={isMarketplaceModalOpen}
        onClose={() => setIsMarketplaceModalOpen(false)}
        animeId={animeId || ""}
        animeName={animeData?.info.name || (isOfflineMode ? offlineManifest?.animeName : '') || ""}
        episodeNumber={currentEpisode?.number}
      />

      <MarketplaceModal
        isOpen={isMarketplaceListVisible}
        onClose={() => setIsMarketplaceListVisible(false)}
      />

      {/* Redirect Warning Popup */}
      {
        pendingRedirect && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in">
            <div className="bg-card border border-white/10 p-6 rounded-2xl max-w-md w-full shadow-2xl space-y-4 m-4">
              <div className="flex items-center gap-3 text-yellow-500">
                <AlertCircle className="w-6 h-6" />
                <h3 className="font-bold text-lg">External Link Warning</h3>
              </div>
              <p className="text-muted-foreground">
                This content is trying to open an external link.
              </p>
              <div className="p-3 bg-black/30 rounded-lg border border-white/5 text-xs font-mono break-all text-white/70 max-h-24 overflow-y-auto">
                {pendingRedirect}
              </div>
              <p className="text-xs text-muted-foreground">
                External sites may contain ads or trackers. Proceed with caution.
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="ghost" onClick={() => setPendingRedirect(null)}>Cancel</Button>
                <Button variant="destructive" onClick={() => {
                  const url = pendingRedirect;
                  setPendingRedirect(null);
                  window.open(url, '_blank');
                }}>
                  Open Link
                </Button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
}
