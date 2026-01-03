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
import { getFriendlyServerName } from "@/lib/serverNames";
import { updateLocalContinueWatching, getLocalContinueWatching } from "@/lib/localStorage";
import { useAuth } from "@/contexts/AuthContext";
import { useUpdateWatchHistory } from '@/hooks/useWatchHistory';
import { useViewTracker, useAnimeViewCount, formatViewCount } from '@/hooks/useViews';
import { getProxiedVideoUrl, getProxiedEmbedUrl } from "@/lib/api";
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
} from "lucide-react";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";

export default function WatchPage() {
  const { episodeId } = useParams<{ episodeId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

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

  const { data: serversData, isLoading: loadingServers } =
    useEpisodeServers(decodedEpisodeId);
  const { data: animeData } = useAnimeInfo(animeId);
  const { data: episodesData } = useEpisodes(animeId);
  
  // View tracking
  const { data: viewCount } = useAnimeViewCount(animeId);
  useViewTracker(animeId, decodedEpisodeId);

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

  const {
    data: sourcesData,
    isLoading: loadingSources,
    error: sourcesError,
  } = useCombinedSources(
    decodedEpisodeId,
    animeData?.anime.info.name,
    currentEpisode?.number,
    currentServer?.serverName || "hd-2",
    category
  );

  // Fetch subtitles from sub server when watching dub (dub servers often don't include subs)
  const {
    data: subSourcesData,
  } = useCombinedSources(
    category === "dub" ? decodedEpisodeId : undefined, // Only fetch when in dub mode
    animeData?.anime.info.name,
    currentEpisode?.number,
    currentServer?.serverName || "hd-2",
    "sub"
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
      if (subSourcesData?.subtitles?.length) {
        subs = subSourcesData.subtitles;
      } else if (subSourcesData?.tracks?.length) {
        subs = subSourcesData.tracks;
      }
      // Fallback to dub source subs if sub sources had nothing
      if (subs.length === 0) {
        subs = sourcesData?.subtitles?.length ? sourcesData.subtitles : (sourcesData?.tracks || []);
      }
    } else {
      // For sub mode, use current sources
      subs = sourcesData?.subtitles?.length ? sourcesData.subtitles : (sourcesData?.tracks || []);
    }
    
    // Filter out thumbnails and only keep actual subtitle languages
    return subs.filter(sub => 
      sub.lang && 
      sub.lang.toLowerCase() !== 'thumbnails' && 
      !sub.url?.includes('thumbnails')
    );
  }, [sourcesData, subSourcesData, category]);

  // Compute selected embed source for WatchAnimeWorld
  const selectedEmbedSource = useMemo(() => {
    if (selectedServerIndex !== -2 || !selectedLangCode || !sourcesData) return null;
    const source = sourcesData.sources.find(
      s => s.langCode === selectedLangCode && (s.isEmbed || (!s.isM3U8 && s.needsHeadless))
    );
    if (!source) return null;
    
    // Proxy the embed URL to bypass AdBlock/Sandbox restrictions
    return {
      ...source,
      url: getProxiedEmbedUrl(source.url),
    };
  }, [selectedServerIndex, selectedLangCode, sourcesData]);

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
          await updateWatchHistory.mutateAsync({
            animeId,
            animeName: animeData.anime.info.name,
            animePoster: animeData.anime.info.poster,
            episodeId: decodedEpisodeId,
            episodeNumber: currentEpisode.number,
            progressSeconds: 0,
            durationSeconds: 0,
          });
        } catch (e) {
          console.warn('Failed to update watch history in DB:', e);
          // If the update failed, clear the flag so we can retry on next render
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
  }, [user, animeData, currentEpisode, animeId, decodedEpisodeId, updateWatchHistory]);

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

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Background />
      <Sidebar />

      <main className="relative z-10 pl-4 md:pl-32 pr-4 md:pr-6 py-4 md:py-6 max-w-[1800px] mx-auto pb-24 md:pb-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-4 md:mb-6">
          <button
            onClick={() => navigate(`/anime/${animeId}`)}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors group"
          >
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="hidden sm:inline">Back</span>
          </button>

          {animeData && (
            <div className="flex-1 min-w-0 text-right">
              <span className="font-medium text-foreground text-sm md:text-base truncate block">
                {animeData.anime.info.name}
              </span>
              {viewCount !== undefined && viewCount > 0 && (
                <span className="text-xs text-muted-foreground flex items-center justify-end gap-1 mt-0.5">
                  <Eye className="w-3 h-3" />
                  {formatViewCount(viewCount)} views
                </span>
              )}
            </div>
          )}
        </div>

        {/* Main Content - Stack on mobile, grid on desktop */}
        <div className="flex flex-col xl:grid xl:grid-cols-12 gap-4 md:gap-6">
          {/* Video Player Column */}
          <div className="xl:col-span-9 space-y-4 md:space-y-6">
            {/* Video Player */}
            <div className="rounded-xl md:rounded-2xl overflow-hidden border border-border/30 bg-card/60">
              {/* Render EmbedPlayer for WatchAnimeWorld embed sources */}
              {selectedEmbedSource ? (
                <EmbedPlayer
                  url={selectedEmbedSource.url}
                  poster={animeData?.anime.info.poster}
                  language={selectedEmbedSource.language}
                  onError={handleVideoError}
                />
              ) : (
                <VideoPlayer
                  sources={sourcesData?.sources || []}
                  subtitles={normalizedSubtitles}
                  headers={sourcesData?.headers}
                  poster={animeData?.anime.info.poster}
                  onError={handleVideoError}
                  onServerSwitch={handleServerSwitch}
                  isLoading={loadingSources}
                  serverName={currentServer ? getFriendlyServerName(currentServer.serverName) : undefined}
                  malId={sourcesData?.malID}
                  episodeNumber={serversData?.episodeNo || currentEpisode?.number}
                  initialSeekSeconds={initialSeekSeconds}
                  viewCount={viewCount}
                  onProgressUpdate={handleProgressUpdate}
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
                      className={`h-9 md:h-10 px-4 md:px-5 rounded-xl flex items-center gap-2 font-medium transition-all text-sm ${
                        category === "sub"
                          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                          : "bg-muted hover:bg-muted/80"
                      }`}
                    >
                      <Subtitles className="w-4 h-4" />
                      Sub
                    </button>
                    <button
                      onClick={() => setCategory("dub")}
                      className={`h-9 md:h-10 px-4 md:px-5 rounded-xl flex items-center gap-2 font-medium transition-all text-sm ${
                        category === "dub"
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
                    <div className="flex flex-wrap gap-2">
                      {availableServers.map((server, idx) => (
                        <button
                          key={server.serverId}
                          onClick={() => {
                            setSelectedServerIndex(idx);
                            setSelectedLangCode(null); // Reset language selection
                            setFailedServers(new Set());
                          }}
                          className={`h-9 px-3 md:px-4 rounded-xl font-medium transition-all text-sm ${
                            idx === selectedServerIndex
                              ? "bg-foreground text-background shadow-lg"
                              : failedServers.has(server.serverName)
                              ? "bg-destructive/20 text-destructive"
                              : "bg-muted hover:bg-muted/80"
                          }`}
                        >
                          {getFriendlyServerName(server.serverName)}
                          {failedServers.has(server.serverName) && " ✗"}
                        </button>
                      ))}
                      
                      {/* WatchAnimeWorld Language Sources */}
                      {sourcesData?.sources
                        .filter(s => s.language && s.langCode)
                        .reduce((acc: Array<{lang: string, code: string, isDub: boolean, isEmbed: boolean}>, source) => {
                          // Deduplicate by language code
                          if (!acc.find(l => l.code === source.langCode)) {
                            acc.push({
                              lang: source.language!,
                              code: source.langCode!,
                              isDub: source.isDub || false,
                              isEmbed: source.isEmbed || (!source.isM3U8 && source.needsHeadless) || false
                            });
                          }
                          return acc;
                        }, [])
                        .map((lang) => (
                          <button
                            key={lang.code}
                            onClick={() => {
                              // Select first source with this language
                              const sourceIdx = sourcesData.sources.findIndex(
                                s => s.langCode === lang.code
                              );
                              if (sourceIdx !== -1) {
                                setSelectedServerIndex(-2); // Special index for WatchAnimeWorld
                                setSelectedLangCode(lang.code);
                                setFailedServers(new Set());
                              }
                            }}
                            className={`h-9 px-3 md:px-4 rounded-xl font-medium transition-all text-sm flex items-center gap-1 ${
                              selectedServerIndex === -2 && selectedLangCode === lang.code
                                ? "bg-foreground text-background shadow-lg"
                                : "bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30"
                            }`}
                          >
                            <Globe className="w-3 h-3" />
                            {lang.lang}
                            {lang.isDub && <span className="text-xs opacity-70">(Dub)</span>}
                          </button>
                        ))}
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

              <div className="flex-1 overflow-y-auto space-y-1.5 md:space-y-2 pr-2 scrollbar-thin">
                {episodesData?.episodes.map((ep) => (
                  <button
                    key={ep.episodeId}
                    onClick={() => handleEpisodeChange(ep.episodeId)}
                    className={`w-full text-left p-2.5 md:p-3 rounded-xl transition-all text-sm ${
                      ep.episodeId === decodedEpisodeId
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
      </main>

      <MobileNav />
    </div>
  );
}
