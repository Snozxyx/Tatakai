import { TVPlaybackContext } from "@/components/tv/TVPlaybackContext";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Play, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import type { EpisodeData } from "@/types/anime";
export type TVSourceOption = {
  id: string;
  title: string;
  detail: string;
  selected: boolean;
};
export function TVWatchView({
  title,
  episodeTitle,
  poster,
  player,
  sources,
  episodes,
  currentEpisodeId,
  loading,
  unavailable,
  onSource,
  onEpisode,
  onRefresh,
  downloads,
  dialogs,
}: {
  title: string;
  episodeTitle?: string;
  poster?: string;
  player: React.ReactNode;
  sources: TVSourceOption[];
  episodes: EpisodeData[];
  currentEpisodeId: string;
  loading: boolean;
  unavailable?: string;
  onSource(index: number): void;
  onEpisode(id: string): void;
  onRefresh(): void;
  downloads?: React.ReactNode;
  dialogs?: React.ReactNode;
}) {
  const [tab, setTab] = useState<"sources" | "episodes">("sources"),
    [page, setPage] = useState(0);
  const current = episodes.findIndex(
    (episode) => episode.episodeId === currentEpisodeId
  );
  return (
    <TVPlaybackContext.Provider value={{ title, poster, episodes, currentEpisodeId, onEpisode }}>
    <div className="tv-page tv-watch-page">
      <div className="tv-watch-heading">
        {poster && <img src={poster} alt="" />}
        <div>
          <h1>{title}</h1>
          <p>{episodeTitle || "Choose a source to start watching"}</p>
        </div>
        <div className="tv-actions">
          <button
            aria-label="Previous episode"
            disabled={current <= 0}
            onClick={() => onEpisode(episodes[current - 1].episodeId)}
          >
            <ChevronLeft />
          </button>
          <button
            aria-label="Next episode"
            disabled={
              current < 0 ||
              current + 1 >= episodes.length ||
              episodes[current + 1]?.hasAired === false
            }
            onClick={() => onEpisode(episodes[current + 1].episodeId)}
          >
            <ChevronRight />
          </button>
        </div>
      </div>
      <div className="tv-watch-player">
        {unavailable ? (
          <div className="tv-state">
            <h2>{unavailable}</h2>
            <p>Choose a released episode below.</p>
          </div>
        ) : (
          player || (
            <div className="tv-state">
              <Play />
              <h2>
                {loading ? "Finding your sources…" : "Ready when you are"}
              </h2>
              <p>
                Select a source below. Manage your extensions if no sources are
                available.
              </p>
              <Link to="/extensions">Manage extensions</Link>
            </div>
          )
        )}
      </div>
      <div className="tv-filter-tabs">
        <button
          data-tv-source-picker
          aria-pressed={tab === "sources"}
          onClick={() => setTab("sources")}
        >
          Sources <span>{sources.length}</span>
        </button>
        <button
          data-tv-episode-picker
          aria-pressed={tab === "episodes"}
          onClick={() => setTab("episodes")}
        >
          Episodes <span>{episodes.length}</span>
        </button>
        <button onClick={onRefresh}>
          <RefreshCw />
          Refresh sources
        </button>
        {downloads}
      </div>
      {tab === "sources" ? (
        <div className="tv-source-grid">
          {sources.map((source, index) => (
            <button
              className="tv-source-option"
              aria-pressed={source.selected}
              key={source.id}
              onClick={() => onSource(index)}
            >
              <strong>{source.title}</strong>
              <span>{source.detail}</span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="tv-pagination">
            <button
              disabled={page === 0}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous page
            </button>
            <button
              disabled={(page + 1) * 30 >= episodes.length}
              onClick={() => setPage((value) => value + 1)}
            >
              Next page
            </button>
          </div>
          <div className="tv-chapter-grid">
            {episodes.slice(page * 30, (page + 1) * 30).map((episode) => (
              <button
                key={episode.episodeId}
                disabled={episode.hasAired === false}
                aria-pressed={episode.episodeId === currentEpisodeId}
                onClick={() => onEpisode(episode.episodeId)}
              >
                <strong>Episode {episode.number}</strong>
                <span>{episode.title}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {dialogs}
    </div>
    </TVPlaybackContext.Provider>
  );
}
