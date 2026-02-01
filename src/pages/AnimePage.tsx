import { useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAnimeInfo, useEpisodes, useNextEpisodeSchedule } from "@/hooks/useAnimeData";
import { useAnimeSeasons } from "@/hooks/useAnimeSeasons";
import { useAnimelokSeasons } from "@/hooks/useAnimelokSeasons";
import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Skeleton } from "@/components/ui/skeleton-custom";
import { AnimeGrid } from "@/components/anime/AnimeGrid";
import { VideoBackground } from "@/components/anime/VideoBackground";
import { CommentsSection } from "@/components/anime/CommentsSection";
import { RatingsSection } from "@/components/anime/RatingsSection";
import { WatchlistButton } from "@/components/anime/WatchlistButton";
import { ShareButton } from "@/components/anime/ShareButton";
import { AddToPlaylistButton } from "@/components/playlist/AddToPlaylistButton";
import { NextEpisodeSchedule } from "@/components/anime/NextEpisodeSchedule";
import { getProxiedImageUrl, searchAnime } from "@/lib/api";
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
import { useIsNativeApp } from '@/hooks/useIsNativeApp';

export default function AnimePage() {
  const { animeId } = useParams<{ animeId: string }>();
  const navigate = useNavigate();
  const { data: animeData, isLoading: loadingInfo, error: infoError } = useAnimeInfo(animeId);
  const { data: episodesData, isLoading: loadingEpisodes } = useEpisodes(animeId);
  const { data: seasons = [], isLoading: loadingSeasons } = useAnimeSeasons(animeId);
  const { data: animelokSeasonsData } = useAnimelokSeasons(animeId);
  const { data: nextEpisodeSchedule } = useNextEpisodeSchedule(animeId);

  const [isResolving, setIsResolving] = useState(false);
  const isNative = useIsNativeApp();
  const [resolutionStatus, setResolutionStatus] = useState<string>("");
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);

  // handleDownloadEpisode removed as per user request to only keep season download here

  // Handle MAL-prefixed IDs by searching and redirecting
  useEffect(() => {
    if (animeId?.startsWith('mal-') && !isResolving) {
      const resolveMalId = async () => {
        setIsResolving(true);
        setResolutionStatus("Looking for this anime on Tatakai...");

        try {
          // If we have an error or it's clearly a MAL ID, we need to find it on HiAnime
          // Note: useAnimeInfo will likely fail for 'mal-xxxx'
          const malNumericId = animeId.split('-')[1];
          console.log(`[AnimePage] Resolving MAL ID: ${malNumericId}`);

          // Look in our own database first for a mapping
          const { supabase } = await import('@/integrations/supabase/client');
          const { data: mapping } = await supabase
            .from('watchlist')
            .select('anime_id, anime_name')
            .eq('mal_id', parseInt(malNumericId))
            .neq('anime_id', animeId)
            .limit(1)
            .maybeSingle();

          if (mapping?.anime_id && !mapping.anime_id.startsWith('mal-')) {
            console.log(`[AnimePage] Found mapping in DB: ${mapping.anime_id}`);
            navigate(`/anime/${mapping.anime_id}`, { replace: true });
            return;
          }

          // Fallback: Search HiAnime by title if we have it, or just use general search
          // This is a bit tricky without the title, but we can try to get it from MAL if needed
          // For now, let's assume if it fails, the user can search manually OR we try metadata lookup
        } catch (err) {
          console.error('[AnimePage] Resolution failed:', err);
        } finally {
          setIsResolving(false);
        }
      };

      resolveMalId();
    }
  }, [animeId, navigate]);

  // Merge Animelok seasons if available
  const allSeasons = useMemo(() => {
    const baseSeasons = [...seasons];

    if (animelokSeasonsData?.seasons && animelokSeasonsData.seasons.length > 0) {
      // Add Animelok seasons that aren't already in the list
      animelokSeasonsData.seasons.forEach((animelokSeason) => {
        if (!baseSeasons.find(s => s.id === animelokSeason.id)) {
          baseSeasons.push({
            id: animelokSeason.id,
            name: animelokSeason.title,
            title: animelokSeason.title,
            poster: animelokSeason.poster || "",
            isCurrent: animelokSeason.id === animeId,
          });
        }
      });
    }

    return baseSeasons;
  }, [seasons, animelokSeasonsData, animeId]);

  // Auto-select episode 1 when clicking watch
  const handleWatchNow = () => {
    if (episodesData?.episodes[0]) {
      navigate(`/watch/${encodeURIComponent(episodesData.episodes[0].episodeId)}`);
    }
  };

  const handleEpisodeClick = (episodeId: string) => {
    navigate(`/watch/${encodeURIComponent(episodeId)}`);
  };

  if (isResolving || (animeId?.startsWith('mal-') && !animeData)) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Background />
        <Sidebar />
        <main className="relative z-10 flex flex-col items-center justify-center min-h-[80vh] p-6 text-center">
          <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
          <h1 className="text-2xl font-bold mb-2">Resolving Anime Link</h1>
          <p className="text-muted-foreground">{resolutionStatus || "Please wait while we find the best source for this anime..."}</p>
        </main>
        <MobileNav />
      </div>
    );
  }

  if (loadingInfo) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Background />
        <Sidebar />
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
        <meta property="og:url" content={`${window.location.origin}/anime/${animeId}`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${info.name} - Watch Online`} />
        <meta name="twitter:description" content={info.description?.slice(0, 100) || `Watch ${info.name}`} />
        <meta name="twitter:image" content={info.poster} />
        <link rel="canonical" href={`${window.location.origin}/anime/${animeId}`} />
      </Helmet>

      <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
        {!isNative && <Sidebar />}

        {/* Video Background Hero */}
        <VideoBackground animeId={animeId!} poster={info.poster}>
          <main className={cn(
            "relative z-10 pr-6 py-6 max-w-[1800px] mx-auto pb-24 md:pb-6",
            isNative ? "p-6" : "pl-6 md:pl-32"
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
                  src={getProxiedImageUrl(info.poster)}
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
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-4 pt-4">
                  <button
                    onClick={handleWatchNow}
                    disabled={loadingEpisodes || !episodesData?.episodes[0]}
                    className="h-14 px-8 rounded-full bg-foreground text-background font-bold text-lg hover:scale-105 active:scale-95 transition-all flex items-center gap-2 glow-primary disabled:opacity-50"
                  >
                    <Play className="w-5 h-5 fill-background" />
                    Watch Now
                  </button>
                  <WatchlistButton
                    animeId={animeId!}
                    animeName={info.name}
                    animePoster={info.poster}
                    variant="icon"
                    malId={moreInfo.malId}
                    anilistId={moreInfo.anilistId}
                  />
                  <AddToPlaylistButton
                    animeId={animeId!}
                    animeName={info.name}
                    animePoster={info.poster}
                    variant="icon"
                  />
                  <ShareButton
                    animeId={animeId!}
                    animeName={info.name}
                    animePoster={info.poster}
                    description={info.description}
                  />
                  <button
                    onClick={() => navigate(`/isshoni?anime=${encodeURIComponent(animeId!)}&title=${encodeURIComponent(info.name)}&poster=${encodeURIComponent(info.poster)}`)}
                    className="h-14 w-14 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 flex items-center justify-center transition-all hover:scale-105 shadow-lg shadow-purple-500/25"
                    title="Watch Together"
                  >
                    <Users className="w-5 h-5 text-white" />
                  </button>

                  {isNative && (
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
              animeId={animeId!}
              animeName={info.name}
              airingTime={nextEpisodeSchedule.airingISOTimestamp}
              nextEpisodeNumber={(info.stats.episodes.sub || info.stats.episodes.dub || 0) + 1}
            />
          )}

          {/* Episodes */}
          <section className="mb-16">
            <h2 className="font-display text-2xl font-semibold mb-6">Episodes</h2>
            {loadingEpisodes ? (
              <div className="grid grid-cols-4 md:grid-cols-8 lg:grid-cols-12 gap-2">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : episodesData ? (
              <div className="grid grid-cols-4 md:grid-cols-8 lg:grid-cols-12 gap-2">
                {episodesData.episodes.map((ep) => (
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
                      "group",
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
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <p className={cn(
                      "mt-2 text-sm font-medium line-clamp-2 text-center",
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
            <RatingsSection animeId={animeId!} />
          </section>

          {/* Comments Section */}
          <section className="mb-16">
            <CommentsSection animeId={animeId!} />
          </section>

          {/* Related Animes */}
          {relatedAnimes.length > 0 && (
            <AnimeGrid animes={relatedAnimes.slice(0, 6)} title="Related Anime" />
          )}

          {/* Recommended */}
          {recommendedAnimes.length > 0 && (
            <AnimeGrid animes={recommendedAnimes.slice(0, 6)} title="Recommended" />
          )}
        </main>

        {!isNative && <MobileNav />}

        {isNative && episodesData && (
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
