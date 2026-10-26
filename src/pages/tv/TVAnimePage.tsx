import { TVLoadingScreen } from "@/components/tv/TVLoadingScreen";
import { TVCinematicHero } from "@/components/tv/TVCinematicHero";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { Play, Plus, Check } from "lucide-react";
import { useAnimeInfo, useEpisodes } from "@/hooks/api/useAnimeData";
import { useWatchHistory } from "@/hooks/user/useWatchHistory";
import { useWatchlistItem, useAddToWatchlist } from "@/hooks/user/useWatchlist";
import { useAuth } from "@/contexts/AuthContext";
import { useTVTitleArt } from "@/core/tv/useTVTitleArt";

export default function TVAnimePage({ animeId }: { animeId: string }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useAnimeInfo(animeId);
  const episodes = useEpisodes(animeId),
    history = useWatchHistory(100),
    watchlist = useWatchlistItem(animeId),
    add = useAddToWatchlist();
  const art = useTVTitleArt(animeId);
  const [showAll, setShowAll] = useState(false),
    [page, setPage] = useState(0);
  const resume = history.data?.find(
    (item) => item.anime_id === animeId && !item.completed
  );
  const playable =
    episodes.data?.episodes.filter((episode) => episode.hasAired !== false) ||
    [];
  const openEpisode = (episodeId: string, number: number) =>
    navigate(
      `/watch/${encodeURIComponent(episodeId)}?animeId=${encodeURIComponent(
        animeId
      )}&ep=${number}`
    );
  useEffect(() => {
    if (params.get("play") !== "true") return;
    if (resume) openEpisode(resume.episode_id, resume.episode_number);
    else if (playable[0])
      openEpisode(playable[0].episodeId, playable[0].number);
  }, [params, episodes.data, history.data]); // eslint-disable-line react-hooks/exhaustive-deps
  if (isLoading)
    return (
      <TVLoadingScreen message="Loading title…" />
    );
  if (error || !data)
    return (
      <div className="tv-state">
        <h1>Title unavailable</h1>
        <p>Check your connection and try again.</p>
        <button onClick={() => void refetch()}>Retry</button>
      </div>
    );
  const all = episodes.data?.episodes || [],
    selection = all.slice(page * 24, (page + 1) * 24);
  return (
    <div className="tv-title-page">
      <TVCinematicHero
        title={data.info.name}
        artwork={art.data?.bannerImage || data.info.poster}
        logo={art.data?.logo}
        anilistId={art.data?.anilistId}
        facts={[data.info.stats.type, art.data?.seasonYear, art.data?.rating, ...data.moreInfo.genres.slice(0, 2)]}
        score={art.data?.averageScore}
        description={data.info.description}
        status={[data.moreInfo.status, all.length ? `${all.length} episodes` : undefined].filter(Boolean).join(" · ")}
        actions={<>
            <button
              className="tv-primary"
              data-tv-key="title-play"
              disabled={!playable.length}
              onClick={() =>
                resume
                  ? openEpisode(resume.episode_id, resume.episode_number)
                  : playable[0] &&
                    openEpisode(playable[0].episodeId, playable[0].number)
              }
            >
              <Play fill="currentColor" />
              {resume
                ? `Resume episode ${resume.episode_number}`
                : playable.length
                ? "Watch now"
                : "Not yet available"}
            </button>
            <button
              aria-pressed={!!watchlist.data}
              disabled={add.isPending}
              onClick={() => {
                if (!user) {
                  navigate("/tv/library");
                  return;
                }
                add.mutate({
                  animeId,
                  animeName: data.info.name,
                  animePoster: data.info.poster,
                  malId: data.moreInfo.malId,
                  anilistId: data.moreInfo.anilistId,
                });
              }}
            >
              {watchlist.data ? <Check /> : <Plus />}
              {watchlist.data ? "In My Tatakai" : "My list"}
            </button>
        </>}
      />
      <div className="tv-title-tabs">
        <a className="active" href="#tv-title-episodes">Episodes</a>
        <button onClick={() => setShowAll((value) => !value)}>
          {showAll ? "Less detail" : "Full synopsis"}
        </button>
        <Link to="/extensions">Sources &amp; extensions</Link>
      </div>
      {showAll && <section className="tv-title-full-synopsis"><h2>About {data.info.name}</h2><p>{data.info.description.replace(/<[^>]*>/g, "")}</p></section>}
      <section id="tv-title-episodes">
        <div className="tv-section-heading">
          <h2>
            Episodes <span>{all.length}</span>
          </h2>
          {all.length > 24 && (
            <div className="tv-actions">
              <button
                disabled={page === 0}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous
              </button>
              <span>
                {page * 24 + 1}–{Math.min(all.length, (page + 1) * 24)}
              </span>
              <button
                disabled={(page + 1) * 24 >= all.length}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </button>
            </div>
          )}
        </div>
        {episodes.isLoading && <p role="status">Finding episodes…</p>}
        {episodes.error && (
          <button onClick={() => void episodes.refetch()}>
            Retry episodes
          </button>
        )}
        <div className="tv-episode-grid">
          {selection.map((episode) => (
            <button
              className="tv-episode-card"
              key={episode.episodeId}
              disabled={episode.hasAired === false}
              data-tv-key={`episode-${episode.episodeId}`}
              onClick={() => openEpisode(episode.episodeId, episode.number)}
            >
              <div className="tv-episode-image">
                {(episode.image || art.data?.bannerImage) && (
                  <img
                    loading="lazy"
                    src={episode.image || art.data?.bannerImage}
                    alt=""
                  />
                )}
                <span>{episode.number}</span>
                <Play />
              </div>
              <strong><span>Episode {episode.number}: </span>{episode.title || "Untitled"}</strong>
              <p>
                {episode.hasAired === false
                  ? "Coming soon"
                  : episode.overview ||
                    (episode.runtime
                      ? `${episode.runtime} min`
                      : "Choose a source and watch")}
              </p>
            </button>
          ))}
        </div>
        {!episodes.isLoading && !all.length && (
          <p>No released episodes are available yet.</p>
        )}
      </section>
    </div>
  );
}
