import { useContext, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ListVideo, Pause, Play, RotateCcw, RotateCw, X } from "lucide-react";
import { TVPlaybackContext } from "./TVPlaybackContext";
import "./tv-playback-overlay.css";

/** Lives inside the video container, including when that container is fullscreen. */
export function TVPlaybackOverlay({ visible, playing, seekingLocked, onToggle, onSeek, fallbackTitle, episodeTitle, episodeNumber }: {
  visible: boolean; playing: boolean; seekingLocked: boolean;
  onToggle(): void; onSeek(seconds: number): void;
  fallbackTitle?: string; episodeTitle?: string; episodeNumber?: number;
}) {
  const details = useContext(TVPlaybackContext);
  const [expanded, setExpanded] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const stack = useRef<HTMLDivElement>(null);
  const current = details?.episodes.findIndex(item => item.episodeId === details.currentEpisodeId) ?? -1;
  const episode = details?.episodes[current];
  useEffect(() => {
    if (expanded) {
      const selected = stack.current?.querySelector<HTMLElement>('[aria-current="true"]') || stack.current?.querySelector<HTMLElement>('button:not(:disabled)');
      selected?.focus({ preventScroll: true });
      selected?.scrollIntoView({ block: "center", behavior: "instant" });
    }
  }, [expanded, details?.currentEpisodeId]);
  const close = () => { setExpanded(false); opener.current?.focus(); };
  return <div className="tv-playback-overlay" data-visible={visible || expanded || undefined}
    onKeyDown={event => { if (expanded && ["Escape", "BrowserBack", "GoBack"].includes(event.key)) { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <div className="tv-playback-top">
      <Link to="/" aria-label="Back to browsing" className="tv-playback-back"><ArrowLeft /></Link>
      <span className="tv-playback-wordmark">tatakai</span>
      {!!details?.episodes.length && <button ref={opener} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}><ListVideo /> Episodes</button>}
    </div>
    <div className="tv-playback-transport">
      <button aria-label="Rewind 10 seconds" disabled={seekingLocked} onClick={() => onSeek(-10)}><RotateCcw /><span>10</span></button>
      <button className="tv-playback-toggle" aria-label={playing ? "Pause" : "Play"} onClick={onToggle}>{playing ? <Pause /> : <Play fill="currentColor" />}</button>
      <button aria-label="Forward 10 seconds" disabled={seekingLocked} onClick={() => onSeek(10)}><RotateCw /><span>10</span></button>
    </div>
    <div className="tv-playback-description">
      <p>{details?.title || fallbackTitle}</p>
      <span className="tv-playback-format">{episode?.runtime ? `${episode.runtime} min · ` : ""}{episodeTitle || "Now watching"}</span>
      <h2>{episodeNumber || episode?.number ? `Episode ${episodeNumber || episode?.number}` : "Now playing"}</h2>
      {episode?.overview && <p className="tv-playback-synopsis">{episode.overview}</p>}
    </div>
    {expanded && details && <aside className="tv-playback-episodes" data-tv-modal aria-label="Episode selection" onKeyDown={event => {
      if (event.key === 'Tab') {
        const items = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled)')];
        const index = items.indexOf(document.activeElement as HTMLElement);
        if (event.shiftKey && index === 0) { event.preventDefault(); items.at(-1)?.focus(); }
        else if (!event.shiftKey && index === items.length - 1) { event.preventDefault(); items[0]?.focus(); }
      }
    }}>
      <div className="tv-playback-episodes-heading"><span>All episodes</span><button aria-label="Close episodes" onClick={close}><X /></button></div>
      <div ref={stack} className="tv-playback-stack">
        {details.episodes.map(item => <button key={item.episodeId} aria-current={item.episodeId === details.currentEpisodeId ? "true" : undefined}
          disabled={item.hasAired === false} onClick={() => { details.onEpisode(item.episodeId); close(); }}>
          {(item.image || details.poster) && <img src={item.image || details.poster} alt="" loading="lazy" />}
          <span><strong>{item.number}. {item.title || `Episode ${item.number}`}</strong><small>{item.hasAired === false ? "Coming soon" : item.episodeId === details.currentEpisodeId ? "Now playing" : item.runtime ? `${item.runtime} min` : "Watch episode"}</small></span>
          {item.episodeId === details.currentEpisodeId && <i aria-hidden="true" />}
        </button>)}
      </div>
    </aside>}
  </div>;
}
