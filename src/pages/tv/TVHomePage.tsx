import { TVCinematicHero } from "@/components/tv/TVCinematicHero";
import { TVDiscoveryGrid } from "@/components/tv/TVDiscoveryGrid";
import { useState, useEffect, useRef } from "react";
import { publishTVSuggestions } from "@/core/tv/TVLauncherSync";
import { Link } from "react-router-dom";
import { Play, Info, ChevronLeft, ChevronRight } from "lucide-react";
import { useHomeData } from "@/hooks/api/useAnimeData";
import { useWatchHistory } from "@/hooks/user/useWatchHistory";
import { TVContentCard, type TVCard } from "@/components/tv/TVContentCard";
import { useQuery } from "@tanstack/react-query";
import { useTVTitleArt } from "@/core/tv/useTVTitleArt";
import { db } from "@/core/db/tatakai-db";
export function TVRail({
  title,
  items,
  onFocus,
}: {
  title: string;
  items: TVCard[];
  onFocus?(item: TVCard): void;
}) {
  if (!items.length) return null;
  return (
    <section className="tv-rail">
      <h2>{title}</h2>
      <div className="tv-rail-items">
        {items.map((item) => (
          <TVContentCard key={item.id} item={item} onFocus={onFocus} />
        ))}
      </div>
    </section>
  );
}
export default function TVHomePage() {
  const { data, isLoading, error, refetch } = useHomeData();
  const { data: history = [] } = useWatchHistory(20);
  const { data: channels = [] } = useQuery({
    queryKey: ["tv-home-live"],
    queryFn: () =>
      db.iptvChannels.where("kind").equals("live").limit(10).toArray(),
  });
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [ambient, setAmbient] = useState<TVCard>();
  const [preview, setPreview] = useState<TVCard>();
  const previewTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(previewTimer.current), []);
  function focusCard(item: TVCard) {
    setAmbient(item);
    clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => setPreview(item), 1500);
  }
  const features = (data?.spotlightAnimes || [])
    .filter((item) => item.banner || item.poster)
    .slice(0, 8);
  const originalHero = features[featuredIndex % (features.length || 1)];
  function changeFeature(delta: number) {
    clearTimeout(previewTimer.current);
    setPreview(undefined);
    setAmbient(undefined);
    setFeaturedIndex(
      (value) => (value + delta + features.length) % features.length
    );
  }
  const enriched = useTVTitleArt(
    preview?.href?.startsWith("/watch")
      ? originalHero?.id
      : preview?.id || originalHero?.id
  );

  useEffect(() => {
    if (data)
      publishTVSuggestions([
        ...(data.trendingAnimes || []),
        ...(data.mostPopularAnimes || []),
      ]);
  }, [data]);
  const hero = originalHero && {
    ...originalHero,
    ...(preview && !preview.href?.startsWith("/watch")
      ? {
          id: preview.id,
          name: preview.name,
          poster: preview.poster || originalHero.poster,
        }
      : {}),
    banner:
      enriched.data?.bannerImage ||
      (preview ? preview.banner || preview.poster : originalHero.banner),
    logo: enriched.data?.logo,
    description:
      enriched.data?.description || (preview ? "" : originalHero.description),
    otherInfo: enriched.data
      ? [
          enriched.data.format,
          enriched.data.seasonYear,
          ...enriched.data.genres.slice(0, 3),
        ]
          .filter(Boolean)
          .map(String)
      : originalHero.otherInfo,
  };
  const resume: TVCard[] = history
    .filter((item) => !item.completed)
    .map((item) => ({
      id: item.id,
      name: item.anime_name,
      poster: item.anime_poster || "",
      href: `/watch/${encodeURIComponent(
        item.episode_id
      )}?animeId=${encodeURIComponent(item.anime_id)}&ep=${
        item.episode_number
      }`,
      progress: Math.min(
        1,
        item.progress_seconds / (item.duration_seconds || 1)
      ),
      subtitle: `Resume episode ${item.episode_number}`,
    }));
  if (isLoading)
    return (
      <div className="tv-state" role="status">
        Finding your next watch…
      </div>
    );
  if (error)
    return (
      <div className="tv-state">
        <h1>Your home couldn’t load</h1>
        <p>Check your connection, or open My Tatakai for downloaded content.</p>
        <button onClick={() => void refetch()}>Try again</button>
      </div>
    );
  return (
    <>
      <div
        className="tv-ambient"
        style={{
          backgroundImage: `url("${(
            ambient?.banner ||
            hero?.banner ||
            ""
          ).replace(/"/g, "%22")}")`,
        }}
      />
      {hero ? (
        <TVCinematicHero
          title={hero.name}
          artwork={hero.banner || hero.poster}
          logo={hero.logo}
          anilistId={enriched.data?.anilistId}
          facts={(hero.otherInfo || []).slice(0, 4)}
          score={enriched.data?.averageScore}
          description={hero.description}
          status={enriched.data?.status === "NOT_YET_RELEASED" ? "Coming soon" : undefined}
          actions={<>
            <Link className="tv-primary" data-tv-key="hero-play"
              to={`/anime/${hero.id}${enriched.data?.status === "NOT_YET_RELEASED" ? "" : "?play=true"}`}>
              <Play fill="currentColor" />
              {enriched.data?.status === "NOT_YET_RELEASED" ? "View title" : "Play"}
            </Link>
            <Link className="tv-secondary" data-tv-key="hero-info" to={`/anime/${hero.id}`}>
              <Info /> More info
            </Link>
          </>}
          navigation={features.length > 1 ? <>
            <button aria-label="Previous featured title" onClick={() => changeFeature(-1)}><ChevronLeft /></button>
            <span>{preview ? "Your selection" : `${(featuredIndex % features.length) + 1} / ${features.length}`}</span>
            <button aria-label="Next featured title" onClick={() => changeFeature(1)}><ChevronRight /></button>
          </> : undefined}
        />
      ) : (
        <div className="tv-state">
          <h1>Welcome to Tatakai</h1>
          <p>Search for a title or connect your library in My Tatakai.</p>
        </div>
      )}
      <TVRail
        title="Your Next Watch"
        items={
          resume.length ? resume : (data?.mostPopularAnimes || []).slice(0, 12)
        }
        onFocus={focusCard}
      />
      <TVRail
        title="Trending This Season"
        items={(data?.trendingAnimes || []).map((item) => ({
          ...item,
          rank: undefined,
        }))}
        onFocus={focusCard}
      />
      <TVRail
        title="Live IPTV Channels"
        items={channels.map((item) => ({
          id: item.id,
          name: item.name,
          poster: item.logo,
          href: `/tv/iptv?channel=${encodeURIComponent(item.id)}`,
          subtitle: item.group,
        }))}
      />
      <TVRail
        title="Top 10 in Anime Today"
        items={(data?.top10Animes?.today || [])
          .slice(0, 10)
          .map((item, index) => ({ ...item, rank: index + 1 }))}
        onFocus={focusCard}
      />
      <TVRail
        title="Popular on Tatakai"
        items={data?.mostPopularAnimes || []}
        onFocus={focusCard}
      />
      <TVDiscoveryGrid onFocus={focusCard} />
    </>
  );
}
