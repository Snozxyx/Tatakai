import { useTVAppearance } from "@/core/tv/appearance";
import "./tv-loading-screen.css";

export function TVLoadingScreen({ message = "Getting everything ready…", compact = false }: {
  message?: string;
  compact?: boolean;
}) {
  const { reduced } = useTVAppearance();
  return (
    <section className={`tv-loading-screen${compact ? " tv-loading-compact" : ""}`} data-reduced-motion={reduced || undefined} aria-busy="true" aria-label="Loading content">
      <div className="tv-loading-hero">
        <div className="tv-loading-copy">
          <div className="tv-loading-identity">
            <img src="/assets/logo/tatakai-logo-square.png" alt="" />
            <span>tatakai</span>
          </div>
          <p className="tv-loading-message" role="status" aria-live="polite">{message}</p>
          <div className="tv-loading-pulse" aria-hidden="true">
            <div className="tv-loading-title"><i /><i /></div>
            <div className="tv-loading-facts"><i /><i /><i /></div>
            <div className="tv-loading-lines"><i /><i /><i /></div>
            <div className="tv-loading-actions"><i /><i /></div>
          </div>
        </div>
      </div>
      <div className="tv-loading-shelves tv-loading-pulse" aria-hidden="true">
        {Array.from({ length: compact ? 1 : 2 }, (_, row) => (
          <div className="tv-loading-shelf" key={row}>
            <div className="tv-loading-shelf-heading" />
            <div className="tv-loading-cards">
              {Array.from({ length: 5 }, (_, column) => <div className="tv-loading-card" key={column}><i /></div>)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
