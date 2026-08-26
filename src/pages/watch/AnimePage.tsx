/**
 * AnimePage.tsx
 * Dynamic Anime detail and episode listing page.
 * Features:
 * - Dynamic Video Background Hero
 * - Intelligent episode grouping
 * - Series Relation Tree using UnifiedMediaCard
 * - Integration with Jikan for HQ covers
 */

import { useMemo, useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAnimeInfo, useEpisodes, useNextEpisodeSchedule } from "@/hooks/api/useAnimeData";
import { useAnimeSeasons } from "@/hooks/api/useAnimeSeasons";
import { contentGraph, toAnimeCard } from "@/core";
import type { MediaRelation } from "@/core/content/types";
import type { AnimeCard } from "@/types/anime";
import { Background } from "@/components/layout/Background";
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
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { getProxiedImageUrl, fetchJikanCover, fetchProducerAnimes } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  Loader2,
  Search,
  ArrowLeft,
  Play,
  Star,
  Calendar,
  Clock,
  Film,
  Tv,
  Layers,
  Users,
  Download,
  CloudDownload,
  Sparkles,
  PenTool,
  ExternalLink as ExternalLinkIcon,
  GitGraph,
  ArrowRight,
  ChevronRight,
  LayoutGrid,
  List,
} from "lucide-react";
import { SeasonDownloadModal } from "@/components/anime/SeasonDownloadModal";
import { Helmet } from "react-helmet-async";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { fetchCombinedSources } from "@/lib/api";
import { useIsNativeApp, useIsDesktopApp, useIsMobileApp } from '@/hooks/ui/useIsNativeApp';
import { updateDiscordRpc, clearDiscordRpc } from '@/lib/discordRpc';
import { useIsMobile } from '@/hooks/ui/use-mobile';
import { Capacitor } from '@capacitor/core';

const EPISODES_PER_GROUP = 24;

import { UnifiedMediaCard } from "@/components/UnifiedMediaCard";
import { ExtensionSlot } from "@/core/extensions/ExtensionSlot";

// --- Helper Component: Relation Tree ---
function RelationTree({ relations }: { relations: MediaRelation[] }) {
  if (relations.length === 0) return null;

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
      {relations.map((rel, index) => {
        const isNovel = rel.format?.toUpperCase().includes('NOVEL');
        const isManga = rel.format?.toUpperCase().includes('MANGA') || rel.format?.toUpperCase().includes('ONE_SHOT');
        
        return (
          <div key={`${rel.id}-${index}`} className="min-w-[160px] md:min-w-[200px] max-w-[220px]">
            <UnifiedMediaCard 
              item={{
                id: String(rel.id),
                name: rel.titleEnglish || rel.titleRomaji || "Untitled",
                poster: rel.coverImage || "",
                type: rel.relationType,
                status: rel.format || undefined,
                mediaType: isManga ? 'manga' : (isNovel ? 'manga' : 'anime'),
                href: isNovel ? '/novel/comingsoon' : undefined
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

export default function AnimePage() {
  const { animeId } = useParams<{ animeId: string }>();
  const navigate = useNavigate();
  const routeAnimeId = animeId;

  const { data: animeData, isLoading: loadingInfo } = useAnimeInfo(routeAnimeId);
  const { data: mappingDebug } = useQuery({
    queryKey: ["anime-mapping-debug", routeAnimeId],
    queryFn: async () => {
      if (!routeAnimeId) return null;
      const res = await fetch(`/api/v3/content/${encodeURIComponent(routeAnimeId)}`);
      if (!res.ok) return null;
      const json = await res.json();
      return json?.data ?? null;
    },
    enabled: !!routeAnimeId,
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    if (!import.meta.env.DEV || !mappingDebug) return;
    
    // Extract any additional mapping IDs from debug data
    const tmdbId = mappingDebug.tmdbId || mappingDebug.media?.tmdbId || 
                 mappingDebug.media?.externalLinks?.find((l: any) => l.site.toLowerCase() === 'tmdb')?.url.split('/').pop();

    console.debug("[AnimePage] Comprehensive Mapping Debug", {
      tatakaiId: mappingDebug.media?.tatakaiId || mappingDebug.id,
      anilistId: mappingDebug.media?.anilistId || mappingDebug.anilistId,
      malId: mappingDebug.media?.malId || mappingDebug.malId,
      tmdbId,
      source: mappingDebug.source || mappingDebug.media?.source_api,
      raw: mappingDebug
    });
  }, [mappingDebug]);

  const anilistId = animeData?.moreInfo?.anilistId || mappingDebug?.media?.anilistId || mappingDebug?.anilistId || null;
  const parsedAniListId = useMemo(() => {
    if (anilistId != null) {
      const num = Number(anilistId);
      if (Number.isFinite(num) && num > 0) return num;
    }
    const rawId = routeAnimeId || '';
    const numericMatch = rawId.match(/^anilist[:_-]?(\d+)$/i) || rawId.match(/^(\d+)$/);
    if (numericMatch?.[1]) {
      const num = Number(numericMatch[1]);
      if (Number.isFinite(num) && num > 0) return num;
    }
    return undefined;
  }, [anilistId, routeAnimeId]);

  const previewTitles = useMemo(() => {
    if (!animeData?.info?.name) return [];
    return [
      animeData.info.name,
      (animeData.info as any).japaneseName,
      (animeData.info as any).englishName,
    ].filter(Boolean) as string[];
  }, [animeData?.info]);

  const contentAnimeId = useMemo(() => {
    if (anilistId && Number.isFinite(Number(anilistId))) return String(anilistId);
    if (!routeAnimeId) return undefined;
    return routeAnimeId;
  }, [routeAnimeId, anilistId]);

  const seasonsQueryId = useMemo(() => {
    if (anilistId && Number.isFinite(Number(anilistId))) return String(anilistId);
    if (routeAnimeId && /^\d+$/.test(routeAnimeId)) return routeAnimeId;
    return undefined;
  }, [anilistId, routeAnimeId]);

  const { data: seasonsData } = useAnimeSeasons(seasonsQueryId);

  const [selectedEpisodeGroup, setSelectedEpisodeGroup] = useState(0);
  const [episodeQuery, setEpisodeQuery] = useState("");
  const [episodeLayout, setEpisodeLayout] = useState<"grid" | "compact">("compact");

  const { data: episodesData, isLoading: loadingEpisodes } = useEpisodes(contentAnimeId);
  const { data: nextEpisodeSchedule } = useNextEpisodeSchedule(contentAnimeId);

  /**
   * Episodes matching the search box, or all of them when it is empty.
   *
   * Matches the number, the title, every localized title ani.zip carries and the
   * synopsis — so "temple" finds the episode by what happens in it, not just by
   * what it is called.
   */
  const filteredEpisodes = useMemo(() => {
    const episodes = episodesData?.episodes || [];
    const needle = episodeQuery.trim().toLowerCase();
    if (!needle) return episodes;

    return episodes.filter((ep) => {
      if (String(ep.number) === needle) return true;
      const haystack = [
        ep.title,
        ep.overview,
        ...Object.values(ep.titles ?? {}),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [episodesData?.episodes, episodeQuery]);

  const episodeGroups = useMemo(() => {
    const episodes = filteredEpisodes;
    if (episodes.length <= EPISODES_PER_GROUP) return [episodes];

    const groups: typeof episodes[] = [];
    for (let index = 0; index < episodes.length; index += EPISODES_PER_GROUP) {
      groups.push(episodes.slice(index, index + EPISODES_PER_GROUP));
    }
    return groups;
  }, [filteredEpisodes]);

  /**
   * Thumbnails are only worth a card grid if there are thumbnails. ani.zip covers
   * most catalogued shows but not all, and a wall of empty 16:9 boxes reads worse
   * than the numbered pills, so the default follows the data.
   */
  const episodesHaveThumbnails = useMemo(() => {
    const episodes = episodesData?.episodes || [];
    if (episodes.length === 0) return false;
    const withImage = episodes.filter((ep) => Boolean(ep.image)).length;
    return withImage / episodes.length >= 0.5;
  }, [episodesData?.episodes]);

  useEffect(() => {
    setEpisodeLayout(episodesHaveThumbnails ? "grid" : "compact");
  }, [episodesHaveThumbnails]);

  // A filtered-down list has its own grouping; jumping back to the first group
  // keeps the range buttons and the rendered slice in agreement.
  useEffect(() => {
    setSelectedEpisodeGroup(0);
  }, [episodeQuery]);

  // Get MAL/AniList IDs from Tatakai API response
  const malId = animeData?.moreInfo?.malId || null;

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.debug("[AnimePage] External IDs Debug", {
      routeAnimeId,
      contentAnimeId,
      malId,
      anilistId,
      hasAnimeData: Boolean(animeData),
    });
  }, [routeAnimeId, contentAnimeId, malId, anilistId, Boolean(animeData)]);

  // Fetch highest quality cover from Jikan (MAL large_image_url) when malId is known
  const { data: hqPoster } = useQuery({
    queryKey: ['jikan-cover', malId],
    queryFn: () => fetchJikanCover(malId, animeData?.info?.poster ?? ''),
    enabled: !!malId,
    staleTime: 1000 * 60 * 60 * 24, // 24h — covers don't change often
  });

  const producerNames = useMemo<string[]>(() => {
    const rawProducers = animeData?.moreInfo?.producers;
    const fromPayload = Array.isArray(rawProducers)
      ? rawProducers.map((producer) => String(producer || '').trim()).filter(Boolean)
      : [];

    if (fromPayload.length > 0) {
      return Array.from(new Set(fromPayload));
    }

    const studioText = String(rawProducers || animeData?.moreInfo?.studios || '').trim();
    if (!studioText) return [];

    return Array.from(
      new Set(
        studioText
          .split(',')
          .map((studio) => studio.trim())
          .filter(Boolean)
      )
    );
  }, [animeData?.moreInfo?.producers, animeData?.moreInfo?.studios]);

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
  

  const isNative = useIsNativeApp(); // Any native app (desktop or mobile)
  const isDesktopApp = useIsDesktopApp(); // Only Electron/Tauri
  const isMobileNative = useIsMobileApp(); // Only Capacitor (Android/iOS)
  const isMobile = useIsMobile(); // Screen width based check

  useEffect(() => {
    const title = animeData?.info?.name;
    if (!title) return;
    updateDiscordRpc(`Viewing ${title}`, 'Browsing details');
    return () => {
      clearDiscordRpc();
    };
  }, [animeData?.info?.name]);
  
  // Show sidebar on desktop (web or app), but not on mobile (web or app)
  const showSidebar = !isMobile && !isMobileNative;
  
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);

  // handleDownloadEpisode removed as per user request to only keep season download here

  // Use HiAnime seasons directly - they have proper season titles like "Season 1", "Season 2", etc.
  const allSeasons = Array.isArray(seasonsData) ? seasonsData : [];

  // Auto-select episode 1 when clicking watch
  const handleWatchNow = () => {
    if (episodesData?.episodes[0]) {
      navigate(`/watch/${encodeURIComponent(episodesData.episodes[0].episodeId)}`);
    }
  };

  const handleEpisodeClick = (episodeId: string) => {
    navigate(`/watch/${encodeURIComponent(episodeId)}`);
  };

  const info = animeData?.info;
  const moreInfo = animeData?.moreInfo;

  const relatedAnime = useMemo<AnimeCard[]>(() => {
    if (!info || !moreInfo) return [];
    const relations = (moreInfo.relations || []) as MediaRelation[];
    const seen = new Set<string>();
    return relations
      .map((rel) => {
        const id = String(rel.id || '').trim();
        if (!id) return null;
        if (String(contentAnimeId || '') === id) return null;
        if (seen.has(id)) return null;
        
        const isManga = rel.format && ['MANGA', 'ONE_SHOT', 'NOVEL'].includes(rel.format as any);
        if (isManga) return null;

        seen.add(id);
        return {
          id,
          name: rel.titleEnglish ?? rel.titleRomaji ?? "Untitled",
          poster: rel.coverImage || info.poster,
          type: rel.format || undefined,
          episodes: { sub: 0, dub: 0 },
          mediaType: 'anime',
        } as any;
      })
      .filter(Boolean) as AnimeCard[];
  }, [moreInfo, info, contentAnimeId]);

  const relatedManga = useMemo<AnimeCard[]>(() => {
    if (!info || !moreInfo) return [];
    const relations = (moreInfo.relations || []) as MediaRelation[];
    const seen = new Set<string>();
    return relations
      .map((rel) => {
        const id = String(rel.id || '').trim();
        if (!id) return null;
        if (String(contentAnimeId || '') === id) return null;
        if (seen.has(id)) return null;

        const isManga = rel.format && ['MANGA', 'ONE_SHOT', 'NOVEL'].includes(rel.format as any);
        if (!isManga) return null;

        seen.add(id);
        return {
          id,
          name: rel.titleEnglish ?? rel.titleRomaji ?? "Untitled",
          poster: rel.coverImage || info.poster,
          type: rel.format || undefined,
          episodes: { sub: 0, dub: 0 },
          mediaType: 'manga',
        } as any;
      })
      .filter(Boolean) as AnimeCard[];
  }, [moreInfo, info, contentAnimeId]);

  const genreSeeds = useMemo(
    () => (moreInfo?.genres || []).filter(Boolean).slice(0, 2),
    [moreInfo?.genres]
  );
  const { data: recommendationRows } = useQuery({
    queryKey: ["anime-recommendations", contentAnimeId, genreSeeds.join("|")],
    queryFn: async () => {
      if (genreSeeds.length === 0) return [] as AnimeCard[];
      const result = await contentGraph.search({
        genres: genreSeeds,
        page: 1,
        perPage: 12,
        sortBy: "POPULARITY_DESC",
        isAdult: false,
      });
      return result.media.map(toAnimeCard);
    },
    enabled: genreSeeds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const recommendedAnimes = useMemo(() => {
    const rows = recommendationRows || [];
    return rows.filter((row) => String(row.id) !== String(contentAnimeId)).slice(0, 12);
  }, [recommendationRows, contentAnimeId]);

  useEffect(() => {
    setSelectedEpisodeGroup(0);
  }, [contentAnimeId]);

  if (loadingInfo) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Background />
        <main
          className={cn(
            "relative z-10 pr-6 py-6 max-w-[1800px] mx-auto",
            isDesktopApp ? "pl-6" : "pl-6 md:pl-32",
          )}
        >
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

  if (!animeData) {
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

  const totalEpisodes = episodesData?.episodes?.length || 0;
  const matchedEpisodes = filteredEpisodes.length;
  const isFilteringEpisodes = episodeQuery.trim().length > 0;
  // The search box appears at the point the plain grid stops being scannable.
  const showEpisodeToolbar = totalEpisodes > EPISODES_PER_GROUP || episodesHaveThumbnails;
  const hasEpisodeGroups = matchedEpisodes > EPISODES_PER_GROUP;
  const activeEpisodeGroup = Math.min(selectedEpisodeGroup, Math.max(episodeGroups.length - 1, 0));
  const visibleEpisodes = episodeGroups[activeEpisodeGroup] || filteredEpisodes;

  // Drop the alias that already reads as the page heading so the list doesn't
  // start by repeating the title above it.
  const titleAliases = ((moreInfo?.titleAliases as string[] | undefined) ?? []).filter(
    (alias) => alias.toLowerCase() !== String(info?.name ?? '').toLowerCase()
  );

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
        {/* Video Background Hero */}
        <VideoBackground
          animeId={contentAnimeId!}
          poster={info.poster}
          anilistId={parsedAniListId}
          titles={previewTitles}
        >
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
                  <ExtensionSlot slotId="anime-details-after-title" props={{ anime: animeData }} />

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
                    {moreInfo.genres?.map((genre, index) => (
                      <span
                        key={`${genre}-${index}`}
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

                  {/* Also known as — AniList titles + synonyms + ani.zip's localized
                      titles. Collapsed by default because popular shows can carry
                      15+ aliases and they would otherwise bury the synopsis. */}
                  {titleAliases.length > 0 && (
                    <details className="mt-4 group">
                      <summary className="text-xs uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground transition-colors list-none inline-flex items-center gap-1">
                        Also known as
                        <span className="text-[10px] opacity-60">({titleAliases.length})</span>
                      </summary>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {titleAliases.map((alias) => (
                          <span
                            key={alias}
                            className="px-2 py-0.5 rounded-md bg-muted/60 text-xs text-muted-foreground"
                          >
                            {alias}
                          </span>
                        ))}
                      </div>
                    </details>
                  )}
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
                      <p 
                        className="font-medium mt-1 hover:text-primary cursor-pointer transition-colors"
                        onClick={() => navigate(`/search/producer/${encodeURIComponent(moreInfo.studios)}`)}
                      >
                        {moreInfo.studios}
                      </p>
                    </div>
                  )}
                  {(moreInfo.season || moreInfo.year) && (
                    <div>
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">Season</span>
                      <p className="font-medium mt-1 capitalize">{moreInfo.season} {moreInfo.year}</p>
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

        <main
          className={cn(
            "relative z-10 pr-6 max-w-[1800px] mx-auto pb-24 md:pb-6",
            isDesktopApp ? "pl-6" : "pl-6 md:pl-32",
          )}
        >
          {/* Next Episode Schedule - for airing anime */}
          {nextEpisodeSchedule?.airingISOTimestamp && (
            <NextEpisodeSchedule
              animeId={contentAnimeId!}
              animeName={info.name}
              airingTime={nextEpisodeSchedule.airingISOTimestamp}
              nextEpisodeNumber={nextEpisodeSchedule.episode || (info.stats.episodes.sub || info.stats.episodes.dub || 0) + 1}
              dayOfWeek={nextEpisodeSchedule.dayOfWeek}
              episodeTitle={nextEpisodeSchedule.title}
              overview={nextEpisodeSchedule.overview}
              thumbnail={nextEpisodeSchedule.image}
            />
          )}

          {/* Episodes */}
          <section className="mb-16">
            <div className="flex flex-col gap-4 mb-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-2xl font-semibold">Episodes</h2>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    {isFilteringEpisodes
                      ? `${matchedEpisodes} of ${totalEpisodes}`
                      : `${totalEpisodes} total`}
                  </span>
                  {showEpisodeToolbar && (
                    <>
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        <input
                          type="search"
                          value={episodeQuery}
                          onChange={(event) => setEpisodeQuery(event.target.value)}
                          placeholder="Search number or title..."
                          aria-label="Search episodes"
                          className="h-9 w-48 md:w-60 pl-8 pr-3 rounded-full bg-muted/50 border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                      </div>
                      <div className="flex items-center rounded-full border border-border overflow-hidden">
                        <button
                          onClick={() => setEpisodeLayout("grid")}
                          aria-label="Thumbnail view"
                          aria-pressed={episodeLayout === "grid"}
                          className={cn(
                            "px-3 h-9 transition-colors",
                            episodeLayout === "grid"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted/50 text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <LayoutGrid className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEpisodeLayout("compact")}
                          aria-label="Compact view"
                          aria-pressed={episodeLayout === "compact"}
                          className={cn(
                            "px-3 h-9 transition-colors",
                            episodeLayout === "compact"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted/50 text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <List className="w-4 h-4" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
              {hasEpisodeGroups && (
                <div className="flex flex-wrap gap-2">
                  {episodeGroups.map((group, index) => {
                    // Labelled by the episode numbers actually in the group rather
                    // than by slice arithmetic — with a search active the groups no
                    // longer line up with 1-24, 25-48, …
                    const start = group[0]?.number ?? index * EPISODES_PER_GROUP + 1;
                    const end = group[group.length - 1]?.number ?? start;
                    const isActive = index === activeEpisodeGroup;

                    return (
                      <button
                        key={`${start}-${end}-${index}`}
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
                  Showing {visibleEpisodes.length} of {matchedEpisodes}
                  {isFilteringEpisodes ? ` matching episodes` : ` episodes`}
                </p>
              )}
            </div>
            {loadingEpisodes ? (
              <div className="grid grid-cols-4 md:grid-cols-8 lg:grid-cols-12 gap-2">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : !episodesData ? null : visibleEpisodes.length === 0 ? (
              <GlassPanel className="p-6 text-center text-sm text-muted-foreground">
                No episode matches "{episodeQuery.trim()}".
              </GlassPanel>
            ) : episodeLayout === "grid" ? (
              /* Thumbnail cards. The screencap, air date, runtime and synopsis all
                 come from ani.zip, which is also what decides the numbering here. */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {visibleEpisodes.map((ep, index) => (
                  <ContextMenu key={`${ep.episodeId}-${index}`}>
                    <ContextMenuTrigger>
                      <button
                        onClick={() => handleEpisodeClick(ep.episodeId)}
                        title={ep.title}
                        className={cn(
                          "group w-full text-left rounded-xl overflow-hidden border bg-muted/30 transition-all hover:border-primary/60 hover:bg-muted/60",
                          ep.isFiller
                            ? "border-orange/40"
                            : ep.hasAired === false
                              ? "border-dashed border-white/15 opacity-70"
                              : "border-border"
                        )}
                      >
                        <div className="relative aspect-video bg-muted/60 overflow-hidden">
                          {ep.image ? (
                            <img
                              src={ep.image}
                              alt={ep.title}
                              loading="lazy"
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                              onError={(event) => {
                                event.currentTarget.style.visibility = "hidden";
                              }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Tv className="w-7 h-7 text-muted-foreground/40" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/70 text-white text-xs font-bold backdrop-blur-sm">
                            EP {ep.number}
                          </span>
                          {ep.isFiller && (
                            <span className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-orange/90 text-black text-[10px] font-bold uppercase tracking-wide">
                              Filler
                            </span>
                          )}
                          {ep.hasAired === false && (
                            <span className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-primary/90 text-primary-foreground text-[10px] font-bold uppercase tracking-wide">
                              Upcoming
                            </span>
                          )}
                          <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="w-11 h-11 rounded-full bg-primary/90 flex items-center justify-center shadow-lg">
                              <Play className="w-5 h-5 text-primary-foreground ml-0.5" />
                            </span>
                          </span>
                        </div>
                        <div className="p-3 space-y-1.5">
                          <p className="text-sm font-semibold leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                            {ep.title}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {ep.airDate && (
                              <span className="inline-flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {ep.airDate}
                              </span>
                            )}
                            {ep.runtime ? (
                              <span className="inline-flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {ep.runtime}m
                              </span>
                            ) : null}
                          </div>
                          {ep.overview && (
                            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                              {ep.overview}
                            </p>
                          )}
                        </div>
                      </button>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
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
            ) : (
              <div className="grid grid-cols-4 md:grid-cols-8 lg:grid-cols-12 gap-2">
                {visibleEpisodes.map((ep, index) => (
                  <ContextMenu key={`${ep.episodeId}-${index}`}>
                    <ContextMenuTrigger>
                      <HoverCard openDelay={220} closeDelay={80}>
                        <HoverCardTrigger asChild>
                          <button
                            onClick={() => handleEpisodeClick(ep.episodeId)}
                            className={`h-12 w-full rounded-lg font-medium transition-all hover:scale-105 relative ${ep.isFiller
                              ? "bg-orange/20 text-orange hover:bg-orange/30"
                              : ep.hasAired === false
                                // Dated in the future: still listed (ani.zip knows
                                // about it) but visibly not playable yet.
                                ? "bg-muted/40 text-muted-foreground border border-dashed border-white/15 hover:bg-muted/60"
                                : "bg-muted hover:bg-primary hover:text-primary-foreground"
                              }`}
                            title={ep.title}
                          >
                            {ep.number}
                          </button>
                        </HoverCardTrigger>
                        <HoverCardContent side="top" className="w-72 p-0 overflow-hidden">
                          {ep.image && (
                            <img
                              src={ep.image}
                              alt={ep.title}
                              loading="lazy"
                              className="w-full aspect-video object-cover"
                              onError={(event) => { event.currentTarget.style.display = 'none'; }}
                            />
                          )}
                          <div className="p-3 space-y-1.5">
                            <p className="text-sm font-semibold leading-snug">
                              {ep.number}. {ep.title}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              {ep.airDate && (
                                <span className="inline-flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {ep.airDate}
                                </span>
                              )}
                              {ep.runtime ? (
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {ep.runtime}m
                                </span>
                              ) : null}
                              {ep.hasAired === false && (
                                <span className="text-primary font-medium">Not yet aired</span>
                              )}
                              {ep.isFiller && <span className="text-orange font-medium">Filler</span>}
                            </div>
                            {ep.overview && (
                              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-5 pt-1">
                                {ep.overview}
                              </p>
                            )}
                            {/* The native title is the one worth showing beside the
                                English one; the other ~12 languages would just be noise. */}
                            {ep.titles?.ja && ep.titles.ja !== ep.title && (
                              <p className="text-xs text-muted-foreground/80 pt-1">{ep.titles.ja}</p>
                            )}
                          </div>
                        </HoverCardContent>
                      </HoverCard>
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
            )}
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

          {/* Relation Tree */}
          {moreInfo.relations && moreInfo.relations.length > 0 && (
            <section className="mb-16">
              <h2 className="font-display text-2xl font-semibold mb-6 flex items-center gap-2">
                <GitGraph className="w-5 h-5 text-primary" />
                Series Tree
              </h2>
              <RelationTree relations={moreInfo.relations} />
            </section>
          )}

          {/* Characters */}
          {info.characterVoiceActor && info.characterVoiceActor.length > 0 && (
            <section className="mb-16">
              <h2 className="font-display text-2xl font-semibold mb-6 flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Characters
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {info.characterVoiceActor.slice(0, 12).map((cva, index) => (
                  <GlassPanel 
                    key={`${cva.character.id}-${index}`} 
                    className="p-3 flex items-center gap-3 hover:bg-white/10 transition-all cursor-pointer group"
                    onClick={() => navigate(`/character/${cva.character.id}?name=${encodeURIComponent(cva.character.name)}`)}
                  >
                    <img 
                      src={getProxiedImageUrl(cva.character.poster) || "/placeholder.svg"} 
                      alt={cva.character.name}
                      className="w-14 h-14 rounded-full object-cover border border-white/10 group-hover:scale-110 transition-transform"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm truncate group-hover:text-primary transition-colors">{cva.character.name}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{cva.character.cast || "Character"}</p>
                    </div>
                    {cva.voiceActor.name !== "Unknown" && (
                       <div className="text-right border-l border-white/10 pl-3 hidden sm:block">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Voice</p>
                          <p className="text-[11px] font-medium truncate max-w-[80px]">{cva.voiceActor.name}</p>
                       </div>
                    )}
                  </GlassPanel>
                ))}
              </div>
            </section>
          )}

          {/* Staff */}
          {moreInfo.staff && moreInfo.staff.length > 0 && (
            <section className="mb-16">
              <h2 className="font-display text-2xl font-semibold mb-6 flex items-center gap-2">
                <PenTool className="w-5 h-5 text-primary" />
                Staff
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {moreInfo.staff.map((s, index) => (
                  <GlassPanel key={`${s.id}-${index}`} className="p-3 flex items-center gap-3 hover:bg-white/10 transition-colors">
                    <img 
                      src={getProxiedImageUrl(s.imageUrl) || "/placeholder.svg"} 
                      alt={s.name}
                      className="w-10 h-10 rounded-full object-cover border border-white/10"
                    />
                    <div className="min-w-0">
                      <p className="font-bold text-xs truncate">{s.name}</p>
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{s.role || "Staff"}</p>
                    </div>
                  </GlassPanel>
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

          {/* Related Anime */}
          {relatedAnime.length > 0 && (
            <AnimeGrid animes={relatedAnime.slice(0, 6)} title="Anime Recommendation" />
          )}

          {/* Related Manga */}
          {relatedManga.length > 0 && (
            <AnimeGrid animes={relatedManga.slice(0, 6)} title="Manga Recommendation" />
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
            animeId={contentAnimeId}
          />
        )}
      </div>
    </>
  );
}


