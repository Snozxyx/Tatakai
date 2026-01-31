import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  useEpisodeServers,
  useEpisodes,
  useAnimeInfo,
} from "@/hooks/useAnimeData";
import { useCombinedSources } from "@/hooks/useCombinedSources";
import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Skeleton } from "@/components/ui/skeleton-custom";
import { VideoPlayer } from "@/components/video/VideoPlayer";
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
} from "lucide-react";
import { useVideoSettings } from "@/hooks/useVideoSettings";
import { useIsNativeApp } from "@/hooks/useIsNativeApp";
import { getFriendlyServerName, getAnimeServerName } from "@/lib/serverNames";
import { updateLocalContinueWatching, getLocalContinueWatching } from "@/lib/localStorage";
import { useAuth } from "@/contexts/AuthContext";
import { useUpdateWatchHistory } from '@/hooks/useWatchHistory';
import { useViewTracker, useAnimeViewCount, formatViewCount } from '@/hooks/useViews';
import { useWatchTracking } from '@/hooks/useAnalytics';
import { getProxiedVideoUrl } from "@/lib/api";
import { ReportModal } from "@/components/ui/ReportModal";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ReviewPopup } from "@/components/ui/ReviewPopup";
import { Button } from "@/components/ui/button";
import { MarketplaceSubmitModal } from "@/components/ui/MarketplaceSubmitModal";
import { MarketplaceModal } from "@/components/ui/MarketplaceModal";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";

export default function WatchPage() {
  const { episodeId } = useParams<{ episodeId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { settings } = useVideoSettings();
  const isNative = useIsNativeApp();

  const offlineData = useMemo(() => {
    return (location.state as any)?.offlineMode ? (location.state as any) : null;
  }, [location.state]);

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
  const [preferredServerName, setPreferredServerName] = useState<string | null>(() => {
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

  const { data: serversData, isLoading: loadingServers } =
    useEpisodeServers(decodedEpisodeId);
  const { data: animeData } = useAnimeInfo(animeId);
  const { data: episodesData } = useEpisodes(animeId);

  // View tracking
  const { data: viewCount } = useAnimeViewCount(animeId);
  useViewTracker(animeId, decodedEpisodeId);

  // Watch time analytics tracking
  const watchMetadata = useMemo(() => ({
    animeName: animeData?.anime?.info?.name,
    animePoster: animeData?.anime?.info?.poster,
    genres: animeData?.anime?.moreInfo?.genres,
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

  const availableServers = useMemo(() => {
    // Filter out hd-1 server completely
    const servers = (category === "sub" ? serversData?.sub : serversData?.dub) || [];
    return servers.filter(s => s.serverName !== 'hd-1');
  }, [category, serversData]);

  // Auto-select server when servers load: prefer saved server, then hd-2, then first
  useEffect(() => {
    if (availableServers.length > 0 && selectedServerIndex === -1) {
      // First try the saved server preference (but not hd-1)
      if (preferredServerName && preferredServerName !== 'hd-1') {
        const savedIndex = availableServers.findIndex(s => s.serverName === preferredServerName);
        if (savedIndex !== -1) {
          setSelectedServerIndex(savedIndex);
          return;
        }
      }
      // Try to find hd-2 (HD Pro) as default
      const hd2Index = availableServers.findIndex(s => s.serverName === 'hd-2');
      if (hd2Index !== -1) {
        setSelectedServerIndex(hd2Index);
      } else {
        // Fallback to first server
        setSelectedServerIndex(0);
      }
    }
  }, [availableServers, selectedServerIndex, preferredServerName]);

  const currentServer = availableServers[Math.max(0, selectedServerIndex)];

  // Find current episode BEFORE using it in hooks
  const currentEpisodeIndex = useMemo(() => {
    return episodesData?.episodes.findIndex(
      (ep) => ep.episodeId === decodedEpisodeId
    ) ?? -1;
  }, [episodesData, decodedEpisodeId]);

  const currentEpisode = episodesData?.episodes[currentEpisodeIndex];
  const prevEpisode =
    currentEpisodeIndex > 0
      ? episodesData?.episodes[currentEpisodeIndex - 1]
      : null;
  const nextEpisode =
    currentEpisodeIndex < (episodesData?.episodes.length ?? 0) - 1
      ? episodesData?.episodes[currentEpisodeIndex + 1]
      : null;

  const discordDetails = animeData?.anime?.info?.name ?? null;

  const {
    data: sourcesData,
    isLoading: loadingSources,
    error: sourcesError,
    refetch: refetchSources,
  } = useCombinedSources(
    decodedEpisodeId,
    animeData?.anime.info.name,
    currentEpisode?.number,
    currentServer?.serverName || "hd-2",
    category,
    user?.id
  );

  // Get next episode estimates for current source
  const getNextEpisodeEstimate = (source: any): string | null => {
    if (!sourcesData?.nextEpisodeEstimates || !source) return null;

    // Find estimate matching this source's language/server
    const estimate = sourcesData.nextEpisodeEstimates.find(e =>
      (!e.lang || source.language?.toLowerCase().includes(e.lang.toLowerCase())) &&
      (!e.server || source.providerName?.includes(e.server))
    );

    return estimate ? estimate.label : null;
  };

  // Fetch subtitles from sub server when watching dub (dub servers often don't include subs)
  const {
    data: subSourcesData,
  } = useCombinedSources(
    category === "dub" ? decodedEpisodeId : undefined, // Only fetch when in dub mode
    animeData?.anime.info.name,
    currentEpisode?.number,
    currentServer?.serverName || "hd-2",
    "sub",
    user?.id
  );

  // Auto-select WatchAnimeWorld language if saved preference exists
  useEffect(() => {
    if (sourcesData?.hasWatchAnimeWorld && selectedLangCode && selectedServerIndex === -1) {
      // Check if the saved language exists in current sources
      const langExists = sourcesData.sources.some(s => s.langCode === selectedLangCode);
      if (langExists) {
        setSelectedServerIndex(-2); // Select WatchAnimeWorld
      }
    }
  }, [sourcesData?.hasWatchAnimeWorld, selectedLangCode, selectedServerIndex, sourcesData?.sources]);

  // Normalize subtitles - in dub mode, ALWAYS prefer sub source subs since dub rarely has them
  const normalizedSubtitles = useMemo(() => {
    let subs: Array<{ lang: string; url: string; label?: string }> = [];

    if (category === "dub") {
      // For dub mode, prioritize subtitles from sub sources
      const allSubTracks = [
        ...(subSourcesData?.subtitles || []),
        ...(subSourcesData?.tracks || []),
        ...(sourcesData?.subtitles || []),
        ...(sourcesData?.tracks || [])
      ];

      const seenUrls = new Set();
      subs = allSubTracks.filter(s => {
        if (seenUrls.has(s.url)) return false;
        seenUrls.add(s.url);
        return true;
      });
    } else {
      // For sub mode, use current sources
      const allTracks = [
        ...(sourcesData?.subtitles || []),
        ...(sourcesData?.tracks || [])
      ];
      const seenUrls = new Set();
      subs = allTracks.filter(s => {
        if (seenUrls.has(s.url)) return false;
        seenUrls.add(s.url);
        return true;
      });
    }

    // Filter out thumbnails and only keep actual subtitle languages
    return subs.filter(sub =>
      sub.lang &&
      sub.lang.toLowerCase() !== 'thumbnails' &&
      !sub.url?.includes('thumbnails')
    );
  }, [sourcesData, subSourcesData, category]);

  // Select the appropriate source to play
  const selectedSource = useMemo(() => {
    if (!sourcesData?.sources) return null;

    // Handle grouped sources (index -4)
    if (selectedServerIndex === -4 && selectedLangCode) {
      // If we have a provider name in state, match it too
      return sourcesData.sources.find(s =>
        s.langCode === selectedLangCode &&
        (preferredServerName ? s.providerName === preferredServerName : true)
      );
    }

    // Handle M3U8 multi-language sources (index -3)
    if (selectedServerIndex === -3 && selectedLangCode) {
      return sourcesData.sources.find(s => s.langCode === selectedLangCode && s.isM3U8 && !s.isEmbed);
    }

    // Handle embed sources (index -2)
    if (selectedServerIndex === -2 && selectedLangCode) {
      return sourcesData.sources.find(s => s.langCode === selectedLangCode && s.isEmbed);
    }

    // Handle regular servers
    if (selectedServerIndex >= 0 && availableServers[selectedServerIndex]) {
      const serverName = availableServers[selectedServerIndex].serverName;
      return sourcesData.sources.find(s => s.server === serverName);
    }

    return null;
  }, [sourcesData?.sources, selectedServerIndex, selectedLangCode, availableServers, preferredServerName]);

  // Separate Marketplace sources
  const marketplaceSources = useMemo(() => {
    if (!sourcesData?.sources) return [];
    return sourcesData.sources.filter(s => s.langCode?.startsWith('marketplace-'));
  }, [sourcesData?.sources]);

  // Group external sources by language (excluding marketplace)
  const languageGroups = useMemo(() => {
    if (!sourcesData?.sources) return {};

    return sourcesData.sources.reduce((acc: Record<string, any[]>, source) => {
      // Only group external providers (Animelok, WatchAnimeWorld, Animeya, etc.)
      // AND exclude marketplace sources (they have their own section)
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
  }, [sourcesData?.sources]);

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
            malID: sourcesData?.malID || animeData?.anime?.moreInfo?.malId,
            anilistID: sourcesData?.anilistID || animeData?.anime?.moreInfo?.anilistId,
          });
          await updateWatchHistory.mutateAsync({
            animeId,
            animeName: animeData.anime.info.name,
            animePoster: animeData.anime.info.poster,
            episodeId: decodedEpisodeId,
            episodeNumber: currentEpisode.number,
            progressSeconds: 0,
            durationSeconds: 0,
            malId: sourcesData?.malID || animeData?.anime?.moreInfo?.malId || null,
            anilistId: sourcesData?.anilistID || animeData?.anime?.moreInfo?.anilistId || null,
            isLastEpisode: !nextEpisode,
          });
        } catch (e) {
          console.warn('Failed to update watch history in DB:', e);
          initialSavedRef.current = null;
        }
      } else {
        updateLocalContinueWatching({
          animeId,
          animeName: animeData.anime.info.name,
          animePoster: animeData.anime.info.poster,
          episodeId: decodedEpisodeId,
          episodeNumber: currentEpisode.number,
          progressSeconds: 0,
          durationSeconds: 0,
        });
      }
    }, 5000);

    return () => clearTimeout(timeout);
  }, [user, animeData, currentEpisode, animeId, decodedEpisodeId, updateWatchHistory, sourcesData]);

  // Discord RPC Update
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).electron && animeData?.anime?.info?.name) {
      const episodeNum = serversData?.episodeNo || currentEpisode?.number || "";
      (window as any).electron.updateRPC({
        details: `Watching ${animeData.anime.info.name}`,
        state: episodeNum ? `Episode ${episodeNum}` : 'Browsing episodes'
      });
    }
  }, [animeData, currentEpisode, serversData]);

  // Auto-switch to next working server on error
  const errorThrottleRef = useRef(0);
  const handleVideoError = useCallback(() => {
    // Throttle repeated errors to avoid rapid state updates
    const now = Date.now();
    if (now - errorThrottleRef.current < 2000) return;
    errorThrottleRef.current = now;

    if (!currentServer) return;

    // If this server is already marked failed, don't do anything
    if (failedServers.has(currentServer.serverName)) return;

    // Mark server as failed
    setFailedServers((prev) => {
      const copy = new Set(prev);
      copy.add(currentServer.serverName);
      return copy;
    });

    // Find next available server that hasn't failed
    const nextServerIndex = availableServers.findIndex(
      (server, idx) =>
        idx > selectedServerIndex && !failedServers.has(server.serverName)
    );

    if (nextServerIndex !== -1) {
      setSelectedServerIndex(nextServerIndex);
    } else {
      // Try from beginning
      const firstAvailable = availableServers.findIndex(
        (server) => !failedServers.has(server.serverName)
      );
      if (firstAvailable !== -1 && firstAvailable !== selectedServerIndex) {
        setSelectedServerIndex(firstAvailable);
      }
    }
  }, [currentServer, availableServers, selectedServerIndex, failedServers]);

  const handleServerSwitch = () => {
    const nextIndex = (selectedServerIndex + 1) % availableServers.length;
    setSelectedServerIndex(nextIndex);
  };

  // Progress update callback for VideoPlayer - must be defined outside JSX
  const handleProgressUpdate = useCallback((progressSeconds: number, durationSeconds: number, completed?: boolean) => {
    if (!animeData || !currentEpisode) return;
    try {
      if (user) {
        // Use mutateAsync to avoid triggering re-renders during render
        updateWatchHistory.mutateAsync({
          animeId,
          animeName: animeData.anime.info.name,
          animePoster: animeData.anime.info.poster,
          episodeId: decodedEpisodeId,
          episodeNumber: currentEpisode.number,
          progressSeconds: progressSeconds,
          durationSeconds: durationSeconds,
          completed: !!completed,
          malId: sourcesData?.malID || animeData?.anime?.moreInfo?.malId || null,
          anilistId: sourcesData?.anilistID || animeData?.anime?.moreInfo?.anilistId || null,
          isLastEpisode: !nextEpisode,
        }).catch(e => console.warn('Failed to save progress to DB:', e));
      }
      // Always save to localStorage (for server preference and as backup)
      updateLocalContinueWatching({
        animeId,
        animeName: animeData.anime.info.name,
        animePoster: animeData.anime.info.poster,
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
    setFailedServers(new Set());
    navigate(`/watch/${encodeURIComponent(epId)}`);
  };

  // Reset failed servers when category changes - also reset to find hd-1 again
  useEffect(() => {
    setFailedServers(new Set());
    setSelectedServerIndex(-1); // Reset to let auto-select logic find hd-1
  }, [category]);

  const handleEpisodeEnd = () => {
    if (!settings.autoNextEpisode) {
      setShowReviewPopup(true);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Background />
      <Sidebar />

      <main className="relative z-10 pl-4 md:pl-32 pr-4 md:pr-6 py-4 md:py-6 max-w-[1800px] mx-auto pb-24 md:pb-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-4 md:mb-6">
          <button
            onClick={() => offlineData ? navigate('/downloads') : navigate(`/anime/${animeId}`)}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors group"
          >
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="hidden sm:inline">Back</span>
          </button>

          {animeData && (
            <div className="flex-1 min-w-0 text-right flex flex-col items-end gap-2">
              <span className="font-medium text-foreground text-sm md:text-base truncate block">
                {animeData?.anime.info.name || offlineData?.animeTitle}
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
        <div className="flex flex-col xl:grid xl:grid-cols-12 gap-4 md:gap-6">
          {/* Video Player Column */}
          <div className="xl:col-span-9 space-y-4 md:space-y-6">
            {/* Video Player */}
            <div className="rounded-xl md:rounded-2xl overflow-hidden border border-border/30 bg-card/60">

              {/* Render EmbedPlayer for embed sources */}
              {selectedSource?.isEmbed ? (
                <EmbedPlayer
                  url={selectedSource.url}
                  poster={animeData?.anime.info.poster}
                  language={selectedSource.language}
                  onError={handleVideoError}
                />
              ) : (
                <VideoPlayer
                  sources={
                    offlineData?.localUri
                      ? [{ url: offlineData.localUri, isM3U8: !!offlineData.isM3U8, quality: 'Downloaded' }]
                      : (selectedSource && !selectedSource.isEmbed
                        ? [selectedSource]
                        : (sourcesData?.sources || []))
                  }
                  subtitles={normalizedSubtitles}
                  headers={sourcesData?.headers}
                  poster={animeData?.anime.info.poster || offlineData?.poster}
                  onError={handleVideoError}
                  onServerSwitch={handleServerSwitch}
                  isLoading={!offlineData && loadingSources}
                  serverName={selectedSource?.providerName || (currentServer ? getFriendlyServerName(currentServer.serverName) : (offlineData ? 'Offline' : undefined))}
                  malId={sourcesData?.malID || animeData?.anime?.moreInfo?.malId}
                  episodeNumber={serversData?.episodeNo || currentEpisode?.number || offlineData?.episodeNumber}
                  initialSeekSeconds={initialSeekSeconds}
                  viewCount={viewCount}
                  onProgressUpdate={handleProgressUpdate}
                  animeId={animeId || offlineData?.animeId}
                  animeName={animeData?.anime.info.name || offlineData?.animeTitle}
                  animePoster={animeData?.anime.info.poster || offlineData?.poster}
                  episodeTitle={currentEpisode?.title || offlineData?.episodeTitle}
                  episodeId={decodedEpisodeId || offlineData?.episodeId}
                  onEpisodeEnd={handleEpisodeEnd}
                />
              )}
            </div>

            {/* Episode Info & Navigation */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h1 className="font-display text-lg md:text-2xl font-bold">
                  Episode {serversData?.episodeNo || currentEpisode?.number || "?"}
                </h1>
                {currentEpisode?.title && (
                  <p className="text-muted-foreground text-sm mt-1 line-clamp-1">
                    {currentEpisode.title}
                  </p>
                )}
              </div>

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
            </div>

            {/* Server & Category Selection */}
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
                      onClick={() => setCategory("sub")}
                      className={`h-9 md:h-10 px-4 md:px-5 rounded-xl flex items-center gap-2 font-medium transition-all text-sm ${category === "sub"
                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                        : "bg-muted hover:bg-muted/80"
                        }`}
                    >
                      <Subtitles className="w-4 h-4" />
                      Sub
                    </button>
                    <button
                      onClick={() => setCategory("dub")}
                      className={`h-9 md:h-10 px-4 md:px-5 rounded-xl flex items-center gap-2 font-medium transition-all text-sm ${category === "dub"
                        ? "bg-secondary text-secondary-foreground shadow-lg shadow-secondary/25"
                        : "bg-muted hover:bg-muted/80"
                        }`}
                    >
                      <Volume2 className="w-4 h-4" />
                      Dub
                    </button>
                  </div>
                </div>

                {/* Server Selection */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs md:text-sm font-medium text-muted-foreground">
                    <Server className="w-4 h-4" />
                    Server
                    <button
                      onClick={() => refetchSources()}
                      title="Fetch more servers"
                      className="p-1 hover:bg-muted rounded-md transition-colors"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingSources ? 'animate-spin' : ''}`} />
                    </button>
                    {sourcesData?.hasWatchAnimeWorld && (
                      <span className="ml-auto flex items-center gap-1 text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                        <Globe className="w-3 h-3" />
                        Multi-Language Available
                      </span>
                    )}
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
                            const serverInfo = getAnimeServerName(server.serverName);
                            if (serverInfo.name === 'TatakaiAPI' && availableServers.length > 1) return null;

                            const serverSource = sourcesData?.sources.find(s => s.server === server.serverName);
                            const nextEstimate = getNextEpisodeEstimate(serverSource);

                            return (
                              <TooltipProvider key={server.serverId}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      onClick={() => {
                                        setSelectedServerIndex(idx);
                                        setSelectedLangCode(null);
                                        setPreferredServerName(null);
                                        setFailedServers(new Set());
                                      }}
                                      title={serverInfo.description}
                                      className={`h-9 px-3 md:px-4 rounded-xl font-medium transition-all text-sm ${idx === selectedServerIndex
                                        ? "bg-foreground text-background shadow-lg"
                                        : failedServers.has(server.serverName)
                                          ? "bg-destructive/20 text-destructive"
                                          : "bg-muted hover:bg-muted/80"
                                        }`}
                                    >
                                      {serverInfo.name}
                                      {failedServers.has(server.serverName) && " ✗"}
                                    </button>
                                  </TooltipTrigger>
                                  {nextEstimate && (
                                    <TooltipContent side="top" className="max-w-xs">
                                      <div className="flex items-center gap-2">
                                        <Clock className="w-3 h-3" />
                                        <span className="text-xs">
                                          Next episode for {serverSource?.language || 'this language'} estimated: {nextEstimate}
                                        </span>
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
                      {Object.entries(languageGroups).map(([lang, sources]) => (
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

                              return (
                                <TooltipProvider key={`${source.langCode}-${source.providerName}-${sIdx}`}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        onClick={() => {
                                          setSelectedServerIndex(-4);
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
                                      >
                                        {source.isEmbed ? <Globe className="w-3 h-3" /> : <Server className="w-3 h-3 text-muted-foreground" />}
                                        {source.providerName}
                                        {source.isM3U8 && <span className="text-[10px] opacity-60 font-mono tracking-tighter">HLS</span>}
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
                                            <span>Next episode estimated: {nextEstimate}</span>
                                          </div>
                                        )}
                                        {!source.server?.startsWith('Shared by') && !nextEstimate && (
                                          <span className="text-xs">Switch to {source.providerName}</span>
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
                            onClick={() => refetchSources()}
                            className="mt-3 text-xs bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1.5 rounded-lg font-bold transition-all"
                          >
                            Try Fetching Again
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </GlassPanel>
          </div>

          {/* Sidebar - Episode List */}
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
                {episodesData?.episodes.map((ep) => (
                  <button
                    key={ep.episodeId}
                    id={`ep-${ep.episodeId}`}
                    onClick={() => handleEpisodeChange(ep.episodeId)}
                    className={`w-full text-left p-2.5 md:p-3 rounded-xl transition-all text-sm ${ep.episodeId === decodedEpisodeId
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
                      {ep.episodeId === decodedEpisodeId && (
                        <span className="text-xs">▶</span>
                      )}
                    </div>
                    {ep.title && (
                      <p className="text-xs mt-1 opacity-80 line-clamp-1">
                        {ep.title}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </GlassPanel>
          </div>
        </div>
      </main >

      {!isNative && <MobileNav />
      }

      {
        animeData && (
          <ReviewPopup
            isOpen={showReviewPopup}
            onClose={() => setShowReviewPopup(false)}
            animeId={animeId || offlineData?.animeId}
            animeName={animeData?.anime.info.name || offlineData?.animeTitle}
            userId={user?.id}
          />
        )
      }

      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        targetType="server"
        targetId={decodedEpisodeId || offlineData?.episodeId || animeId || "unknown"}
        targetName={`${animeData?.anime.info.name || offlineData?.animeTitle}${serversData?.episodeNo ? ` - Ep ${serversData.episodeNo}` : ''}`}
      />

      <MarketplaceSubmitModal
        isOpen={isMarketplaceModalOpen}
        onClose={() => setIsMarketplaceModalOpen(false)}
        animeId={animeId || ""}
        animeName={animeData?.anime.info.name || offlineData?.animeTitle || ""}
        episodeNumber={serversData?.episodeNo || currentEpisode?.number}
      />

      <MarketplaceModal
        isOpen={isMarketplaceListVisible}
        onClose={() => setIsMarketplaceListVisible(false)}
        sources={marketplaceSources}
        animeName={animeData?.anime.info.name || offlineData?.animeTitle || ""}
        episodeNumber={serversData?.episodeNo || currentEpisode?.number || 1}
        onSelectSource={(source) => {
          setSelectedServerIndex(-4);
          setSelectedLangCode(source.langCode);
          setPreferredServerName(source.providerName || null);
          setFailedServers(new Set());
        }}
        onOpenSubmit={() => {
          setIsMarketplaceListVisible(false);
          setIsMarketplaceModalOpen(true);
        }}
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
