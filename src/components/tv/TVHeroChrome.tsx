import { Pause, Play, Star } from "lucide-react";
import { saveTVAppearance, useTVAppearance } from "@/core/tv/appearance";
export function TVHeroFacts({
  facts,
  score,
}: {
  facts: Array<string | number | undefined | null>;
  score?: number;
}) {
  return (
    <div className="tv-hero-facts">
      {score != null && score > 0 && (
        <span className="tv-hero-score">
          <Star fill="currentColor" /> {(score / 10).toFixed(1)}
        </span>
      )}
      {[
        ...new Set(
          facts.filter((value) => value != null && String(value).trim())
        ),
      ]
        .slice(0, 6)
        .map((value) => (
          <span key={String(value)}>{value}</span>
        ))}
    </div>
  );
}
export function TVPreviewToggle() {
  const { appearance, reduced } = useTVAppearance();
  return (
    <button
      className="tv-preview-toggle"
      data-tv-key="hero-preview-toggle"
      aria-pressed={appearance.previews && !reduced}
      aria-label={reduced ? "Previews disabled for reduced motion" : appearance.previews ? "Pause previews" : "Play previews"}
      title={reduced ? "Previews disabled for reduced motion" : appearance.previews ? "Pause previews" : "Play previews"}
      disabled={reduced}
      onClick={() =>
        saveTVAppearance({ ...appearance, previews: !appearance.previews })
      }
    >
      {appearance.previews && !reduced ? <Pause /> : <Play />}
    </button>
  );
}
