import { useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAnimeInfo, useEpisodes, useNextEpisodeSchedule } from "@/hooks/useAnimeData";
import { useHiAnimeSeasons } from "@/hooks/useHiAnimeSeasons";
import { useExternalIds } from "@/hooks/useExternalIds";
import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Skeleton } from "@/components/ui/skeleton-custom";
import { AnimeGrid } from "@/components/anime/AnimeGrid";
import { VideoBackground } from "@/components/anime/VideoBackground";
import { CommentsSection } from "@/components/anime/CommentsSection";
import { EpisodeComments } from "@/components/video/EpisodeComments";
import { RatingsSection } from "@/components/anime/RatingsSection";
import { WatchlistButton } from "@/components/anime/WatchlistButton";
import { ShareButton } from "@/components/anime/ShareButton";
import { AddToPlaylistButton } from "@/components/playlist/AddToPlaylistButton";
import { NextEpisodeSchedule } from "@/components/anime/NextEpisodeSchedule";
import { getProxiedImageUrl, fetchJikanCover, fetchProducerAnimes } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { Loader2, Search, ArrowLeft, Play, Star, Calendar, Clock, Film, Tv, Layers, Users, Download, CloudDownload } from "lucide-react";
import { SeasonDownloadModal } from "@/components/anime/SeasonDownloadModal";
import { Helmet } from "react-helmet-async";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { fetchCombinedSources } from "@/lib/api";
import { useIsNativeApp, useIsDesktopApp, useIsMobileApp } from '@/hooks/useIsNativeApp';
import { useIsMobile } from '@/hooks/use-mobile';
import { Capacitor } from '@capacitor/core';

const EPISODES_PER_GROUP = 24;

export default function AnimePage() {
  const { animeId } = useParams<{ animeId: string }>();
  const navigate = useNavigate();
  const routeAnimeId = animeId;
  const isExternalAnimeRoute = !!routeAnimeId && /^(mal|anilist)-\d+$/i.test(routeAnimeId);

  const { data: animeData, isLoading: loadingInfo } = useAnimeInfo(routeAnimeId);
  const resolvedAnimeId = useMemo(() => {
    if (!routeAnimeId) return undefined;
    if (!isExternalAnimeRoute) return routeAnimeId;
    const resolved = animeData?.anime?.info?.id;
    if (!resolved) return undefined;
    return /^(mal|anilist)-\d+$/i.test(resolved) ? undefined : resolved;
  }, [routeAnimeId, isExternalAnimeRoute, animeData?.anime?.info?.id]);

  const contentAnimeId = resolvedAnimeId || routeAnimeId;

  const { data: episodesData, isLoading: loadingEpisodes } = useEpisodes(
    resolvedAnimeId || (!isExternalAnimeRoute ? routeAnimeId : undefined)
  );
  const { data: hiAnimeSeasons = [] } = useHiAnimeSeasons(
    resolvedAnimeId || (!isExternalAnimeRoute ? routeAnimeId : undefined)
  );
  const { data: externalIds, isLoading: loadingExternalIds } = useExternalIds(contentAnimeId); // Robust multi-source ID resolution
  const { data: nextEpisodeSchedule } = useNextEpisodeSchedule(
    resolvedAnimeId || (!isExternalAnimeRoute ? routeAnimeId : undefined)
  );

  const episodeGroups = useMemo(() => {
    const episodes = episodesData?.episodes || [];
    if (episodes.length <= EPISODES_PER_GROUP) return [episodes];

    const groups: typeof episodes[] = [];
    for (let index = 0; index < episodes.length; index += EPISODES_PER_GROUP) {
      groups.push(episodes.slice(index, index + EPISODES_PER_GROUP));
    }
    return groups;
  }, [episodesData?.episodes]);

  // Get MAL/AniList IDs from the robust multi-source hook
  const malId = externalIds?.malId || null;
  const anilistId = externalIds?.anilistId || null;

  // Fetch highest quality cover from Jikan (MAL large_image_url) when malId is known
  const { data: hqPoster } = useQuery({
    queryKey: ['jikan-cover', malId],
    queryFn: () => fetchJikanCover(malId, animeData?.anime?.info?.poster ?? ''),
    enabled: !!malId,
    staleTime: 1000 * 60 * 60 * 24, // 24h — covers don't change often
  });

  const producerNames = useMemo(() => {
    const fromPayload = Array.isArray(animeData?.anime?.moreInfo?.producers)
      ? animeData.anime.moreInfo.producers.map((producer: unknown) => String(producer || '').trim()).filter(Boolean)
      : [];

    if (fromPayload.length > 0) {
      return Array.from(new Set(fromPayload));
    }

    const studioText = String(animeData?.anime?.moreInfo?.studios || '').trim();
    if (!studioText) return [];

    return Array.from(
      new Set(
        studioText
          .split(',')
          .map((studio) => studio.trim())
          .filter(Boolean)
      )
    );
  }, [animeData?.anime?.moreInfo?.producers, animeData?.anime?.moreInfo?.studios]);

  const producerRequestCandidates = useMemo(() => {
    const slugifyProducer = (value: string) => {
      return value
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    };

    const candidates: string[] = [];
    for (const producer of producerNames) {
      const slug = slugifyProducer(producer);
      if (slug) candidates.push(slug);
      candidates.push(producer);
    }

    return Array.from(new Set(candidates.map((value) => value.trim()).filter(Boolean)));
  }, [producerNames]);

  const { data: producerAnimeData } = useQuery({
    queryKey: ['producer-anime', producerRequestCandidates],
    queryFn: async () => {
      for (const candidate of producerRequestCandidates) {
        try {
          const response = await fetchProducerAnimes(candidate, 1);
          if (Array.isArray(response?.animes) && response.animes.length > 0) {
            return response;
          }
        } catch {
          // Try the next candidate (slug/raw producer variant).
        }
      }

      return null;
    },
    enabled: producerRequestCandidates.length > 0,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  const producerAnimes = useMemo(() => {
    const currentId = String(contentAnimeId || '').trim().toLowerCase();
    const rows = Array.isArray(producerAnimeData?.animes) ? producerAnimeData.animes : [];

    return rows
      .filter((anime) => String(anime?.id || '').trim().toLowerCase() !== currentId)
      .slice(0, 6);
  }, [producerAnimeData?.animes, contentAnimeId]);
  
  // Debug log for tracking ID extraction
  console.log('[AnimePage] External IDs Debug:', {
    routeAnimeId,
    contentAnimeId,
    loadingExternalIds,
    source: externalIds?.source,
    malId,
    anilistId,
    seasonsCount: hiAnimeSeasons?.length || 0
  });

  const [selectedEpisodeGroup, setSelectedEpisodeGroup] = useState(0);
  const isNative = useIsNativeApp(); // Any native app (desktop or mobile)
  const isDesktopApp = useIsDesktopApp(); // Only Electron/Tauri
  const isMobileNative = useIsMobileApp(); // Only Capacitor (Android/iOS)
  const isMobile = useIsMobile(); // Screen width based check
  
  // Show sidebar on desktop (web or app), but not on mobile (web or app)
  const showSidebar = !isMobile && !isMobileNative;
  
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);

  // handleDownloadEpisode removed as per user request to only keep season download here

  // Use HiAnime seasons directly - they have proper season titles like "Season 1", "Season 2", etc.
  const allSeasons = hiAnimeSeasons;

  // Auto-select episode 1 when clicking watch
  const handleWatchNow = () => {
    if (episodesData?.episodes[0]) {
      navigate(`/watch/${encodeURIComponent(episodesData.episodes[0].episodeId)}`);
    }
  };

  const handleEpisodeClick = (episodeId: string) => {
    navigate(`/watch/${encodeURIComponent(episodeId)}`);
  };

  useEffect(() => {
    setSelectedEpisodeGroup(0);
  }, [contentAnimeId]);

  if (loadingInfo) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Background />
        {showSidebar && <Sidebar />}
        <main className="relative z-10 pl-6 md:pl-32 pr-6 py-6 max-w-[1800px] mx-auto">
          <div className="space-y-8">
            <Skeleton className="h-8 w-32" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <Skeleton className="aspect-[3/4] rounded-3xl" />
              <div className="lg:col-span-2 space-y-4">
                <Skeleton className="h-12 w-3/4" />
                <Skeleton className="h-24 w-full" />
                <div className="flex gap-4">
                  <Skeleton className="h-14 w-40 rounded-full" />
                  <Skeleton className="h-14 w-14 rounded-full" />
                </div>
              </div>
            </div>
          </div>
        </main>
        <MobileNav />
      </div>
    );
  }

  if (!animeData || !animeData.anime) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Anime details not available</h1>
          <p className="text-muted-foreground mb-4">We couldn't retrieve the information for this anime ID.</p>
          <button onClick={() => navigate("/")} className="px-6 py-2 bg-primary text-primary-foreground rounded-full hover:brightness-110">
            Go back home
          </button>
        </div>
      </div>
    );
  }

  const { anime, recommendedAnimes: rawRecommended = [], relatedAnimes: rawRelated = [] } = animeData;
  const { info, moreInfo } = anime;

  // Filter out duplicates between related and recommended to avoid key collisions
  const relatedAnimes = rawRelated.slice(0, 6);
  const recommendedAnimes = rawRecommended
    .filter(rec => !relatedAnimes.some(rel => rel.id === rec.id))
    .slice(0, 6);

  const totalEpisodes = episodesData?.episodes?.length || 0;
  const hasEpisodeGroups = totalEpisodes > EPISODES_PER_GROUP;
  const activeEpisodeGroup = Math.min(selectedEpisodeGroup, Math.max(episodeGroups.length - 1, 0));
  const visibleEpisodes = episodeGroups[activeEpisodeGroup] || episodesData?.episodes || [];

  if (!info || !moreInfo) return null;

  return (
    <>
      {/* SEO Meta Tags */}
      <Helmet>
        <title>{info.name} - Watch Online | Tatakai</title>
        <meta name="description" content={info.description?.slice(0, 160) || `Watch ${info.name} online for free with subtitles.`} />
        <meta property="og:title" content={`${info.name} - Watch Online | Tatakai`} />
        <meta property="og:description" content={info.description?.slice(0, 160) || `Watch ${info.name} online.`} />
        <meta property="og:image" content={info.poster} />
        <meta property="og:type" content="video.other" />
        <meta property="og:url" content={`${window.location.origin}/anime/${contentAnimeId}`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${info.name} - Watch Online`} />
        <meta name="twitter:description" content={info.description?.slice(0, 100) || `Watch ${info.name}`} />
        <meta name="twitter:image" content={info.poster} />
        <link rel="canonical" href={`${window.location.origin}/anime/${contentAnimeId}`} />
      </Helmet>

      <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
        {showSidebar && <Sidebar />}

        {/* Video Background Hero */}
        <VideoBackground animeId={contentAnimeId!} poster={info.poster}>
          <main className={cn(
            "relative z-10 pr-6 py-6 max-w-[1800px] mx-auto pb-24 md:pb-6",
            isDesktopApp ? "pl-6" : "pl-6 md:pl-32" // Original web padding
          )}>
            {/* Back Button */}
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back</span>
            </button>

            {/* Hero Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16 pt-12 md:pt-24">
              {/* Poster */}
              <GlassPanel className="overflow-hidden">
                <img
                  src={hqPoster ?? getProxiedImageUrl(info.poster)}
                  alt={info.name}
                  className="w-full aspect-[3/4] object-cover"
                />
              </GlassPanel>

              {/* Info */}
              <div className="lg:col-span-2 space-y-6">
                <div>
                  <h1 className="font-display text-4xl md:text-5xl font-bold mb-4">
                    {info.name}
                  </h1>

                  {/* Stats */}
                  <div className="flex flex-wrap gap-4 mb-6">
                    {info.stats.rating && (
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber/20 text-amber">
                        <Star className="w-4 h-4 fill-amber" />
                        <span className="font-bold">{info.stats.rating}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted">
                      <Tv className="w-4 h-4" />
                      <span>{info.stats.type}</span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted">
                      <Clock className="w-4 h-4" />
                      <span>{info.stats.duration}</span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/20 text-primary">
                      <Film className="w-4 h-4" />
                      <span>SUB: {info.stats.episodes.sub}</span>
                    </div>
                    {info.stats.episodes.dub > 0 && (
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/20 text-secondary">
                        <Film className="w-4 h-4" />
                        <span>DUB: {info.stats.episodes.dub}</span>
                      </div>
                    )}
                  </div>

                  {/* Genres */}
                  <div className="flex flex-wrap gap-2 mb-6">
                    {moreInfo.genres?.map((genre) => (
                      <span
                        key={genre}
                        onClick={() => navigate(`/genre/${genre.toLowerCase()}`)}
                        className="px-3 py-1 rounded-full border border-border text-sm cursor-pointer hover:bg-muted transition-colors"
                      >
                        {genre}
                      </span>
                    ))}
                  </div>

                  {/* Description */}
                  <p className="text-muted-foreground leading-relaxed">
                    {info.description}
                  </p>
                </div>

                {/* More Info */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {moreInfo.aired && (
                    <div>
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">Aired</span>
                      <p className="font-medium flex items-center gap-2 mt-1">
                        <Calendar className="w-4 h-4" />
                        {moreInfo.aired}
                      </p>
                    </div>
                  )}
                  {moreInfo.status && (
                    <div>
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">Status</span>
                      <p className="font-medium mt-1">{moreInfo.status}</p>
                    </div>
                  )}
                  {moreInfo.studios && (
                    <div>
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">Studios</span>
                      <p className="font-medium mt-1">{moreInfo.studios}</p>
                    </div>
                  )}
                  {producerNames.length > 0 && (
                    <div className="col-span-2 md:col-span-3">
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">Producers</span>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {producerNames.map((producer) => (
                          <button
                            key={producer}
                            type="button"
                            onClick={() => navigate(`/search/producer/${encodeURIComponent(producer)}`)}
                            className="px-3 py-1 rounded-full border border-border text-sm hover:bg-muted transition-colors"
                          >
                            {producer}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-3 pt-4">
                  <button
                    onClick={handleWatchNow}
                    disabled={loadingEpisodes || !episodesData?.episodes[0]}
                    className="h-12 sm:h-14 px-6 sm:px-8 rounded-full bg-foreground text-background font-bold text-base sm:text-lg hover:scale-105 active:scale-95 transition-all flex items-center gap-2 glow-primary disabled:opacity-50"
                  >
                    <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-background" />
                    Watch Now
                  </button>
                  <WatchlistButton
                    animeId={contentAnimeId!}
                    animeName={info.name}
                    animePoster={info.poster}
                    variant="icon"
                    malId={malId || moreInfo.malId || null}
                    anilistId={anilistId || moreInfo.anilistId || null}
                  />
                  <AddToPlaylistButton
                    animeId={contentAnimeId!}
                    animeName={info.name}
                    animePoster={info.poster}
                    variant="icon"
                  />
                  <ShareButton
                    animeId={contentAnimeId!}
                    animeName={info.name}
                    animePoster={info.poster}
                    description={info.description}
                  />
                  <button
                    onClick={() => navigate(`/isshoni?anime=${encodeURIComponent(contentAnimeId!)}&title=${encodeURIComponent(info.name)}&poster=${encodeURIComponent(info.poster)}`)}
                    className="h-14 w-14 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 flex items-center justify-center transition-all hover:scale-105 shadow-lg shadow-purple-500/25"
                    title="Watch Together"
                  >
                    <Users className="w-5 h-5 text-white" />
                  </button>

                  {(isMobileNative || isDesktopApp) && (
                    <button
                      onClick={() => setIsDownloadModalOpen(true)}
                      className="h-14 w-14 rounded-full bg-primary/20 hover:bg-primary/30 text-primary flex items-center justify-center transition-all hover:scale-105"
                      title="Download Season"
                    >
                      <Download className="w-6 h-6" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </main>
        </VideoBackground>

        <main className="relative z-10 pl-6 md:pl-32 pr-6 max-w-[1800px] mx-auto pb-24 md:pb-6">
          {/* Next Episode Schedule - for airing anime */}
          {moreInfo.status === 'Currently Airing' && nextEpisodeSchedule?.airingISOTimestamp && (
            <NextEpisodeSchedule
              animeId={contentAnimeId!}
              animeName={info.name}
              airingTime={nextEpisodeSchedule.airingISOTimestamp}
              nextEpisodeNumber={(info.stats.episodes.sub || info.stats.episodes.dub || 0) + 1}
            />
          )}

          {/* Episodes */}
          <section className="mb-16">
            <div className="flex flex-col gap-4 mb-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-2xl font-semibold">Episodes</h2>
                <span className="text-sm text-muted-foreground">
                  {totalEpisodes} total
                </span>
              </div>
              {hasEpisodeGroups && (
                <div className="flex flex-wrap gap-2">
                  {episodeGroups.map((group, index) => {
                    const start = index * EPISODES_PER_GROUP + 1;
                    const end = Math.min((index + 1) * EPISODES_PER_GROUP, totalEpisodes);
                    const isActive = index === activeEpisodeGroup;

                    return (
                      <button
                        key={`${start}-${end}`}
                        onClick={() => setSelectedEpisodeGroup(index)}
                        className={`px-4 py-2 rounded-full text-sm font-semibold transition-all border ${isActive
                          ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20"
                          : "bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        {start}-{end}
                      </button>
                    );
                  })}
                </div>
              )}
              {hasEpisodeGroups && (
                <p className="text-xs text-muted-foreground">
                  Showing episodes {activeEpisodeGroup * EPISODES_PER_GROUP + 1}-{Math.min((activeEpisodeGroup + 1) * EPISODES_PER_GROUP, totalEpisodes)} of {totalEpisodes}
                </p>
              )}
            </div>
            {loadingEpisodes ? (
              <div className="grid grid-cols-4 md:grid-cols-8 lg:grid-cols-12 gap-2">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : episodesData ? (
              <div className="grid grid-cols-4 md:grid-cols-8 lg:grid-cols-12 gap-2">
                {visibleEpisodes.map((ep) => (
                  <ContextMenu key={ep.episodeId}>
                    <ContextMenuTrigger>
                      <button
                        onClick={() => handleEpisodeClick(ep.episodeId)}
                        className={`h-12 w-full rounded-lg font-medium transition-all hover:scale-105 relative ${ep.isFiller
                          ? "bg-orange/20 text-orange hover:bg-orange/30"
                          : "bg-muted hover:bg-primary hover:text-primary-foreground"
                          }`}
                        title={ep.title}
                      >
                        {ep.number}
                      </button>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      {/* Download Episode removed from context menu */}
                      <ContextMenuItem
                        onClick={() => handleEpisodeClick(ep.episodeId)}
                        className="gap-2 cursor-pointer"
                      >
                        <Play className="w-4 h-4" />
                        Play Episode
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                ))}
              </div>
            ) : null}
          </section>

          {/* Seasons Section */}
          {allSeasons.length > 1 && (
            <section className="mb-16">
              <h2 className="font-display text-2xl font-semibold mb-6 flex items-center gap-2">
                <Layers className="w-5 h-5 text-primary" />
                Seasons
              </h2>
              <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                {allSeasons.map((season) => (
                  <Link
                    key={season.id}
                    to={`/anime/${season.id}`}
                    className={cn(
                      "group flex-shrink-0",
                      season.isCurrent && "pointer-events-none"
                    )}
                  >
                    <div className={cn(
                      "relative w-32 md:w-40 rounded-xl overflow-hidden transition-all",
                      season.isCurrent
                        ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                        : "hover:scale-105"
                    )}>
                      <img
                        src={getProxiedImageUrl(season.poster)}
                        alt={season.name}
                        className="w-full aspect-[2/3] object-cover"
                      />
                      {season.isCurrent && (
                        <div className="absolute top-2 right-2 px-2 py-1 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                          Current
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                      {/* Show season title at bottom */}
                      <div className="absolute bottom-0 left-0 right-0 p-2 text-center">
                        <span className="text-white text-xs font-bold drop-shadow-lg">
                          {season.title}
                        </span>
                      </div>
                    </div>
                    <p className={cn(
                      "mt-2 text-xs md:text-sm font-medium line-clamp-2 text-center w-32 md:w-40 break-words",
                      season.isCurrent ? "text-primary" : "text-foreground group-hover:text-primary transition-colors"
                    )}>
                      {season.name}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Ratings Section */}
          <section className="mb-16">
            <RatingsSection animeId={contentAnimeId!} />
          </section>

          {/* Comments Section */}
          <section className="mb-16">
            <EpisodeComments animeId={contentAnimeId!} animeName={info.name} />
          </section>

          {/* Producer Catalog */}
          {producerAnimes.length > 0 && (
            <AnimeGrid
              animes={producerAnimes}
              title={`More from ${producerAnimeData?.producerName || producerNames[0] || 'this producer'}`}
            />
          )}

          {/* Related Animes */}
          {relatedAnimes.length > 0 && (
            <AnimeGrid animes={relatedAnimes.slice(0, 6)} title="Related Anime" />
          )}

          {/* Recommended */}
          {recommendedAnimes.length > 0 && (
            <AnimeGrid animes={recommendedAnimes.slice(0, 6)} title="Recommended" />
          )}
        </main>

        {!showSidebar && <MobileNav />}

        {(isMobileNative || isDesktopApp) && episodesData && (
          <SeasonDownloadModal
            isOpen={isDownloadModalOpen}
            onClose={() => setIsDownloadModalOpen(false)}
            episodes={episodesData.episodes}
            animeName={info.name}
            posterUrl={info.poster}
          />
        )}
      </div>
    </>
  );
}
