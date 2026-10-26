import type { ReactNode } from "react";
import { TVTitleLogo } from "./TVTitleLogo";
import { TVHeroFacts, TVPreviewToggle } from "./TVHeroChrome";
import { TVTrailerPreview } from "./TVVideoBackdrop";
import "./tv-cinematic-hero.css";

/** The same remote-first billboard on Home and title details. */
export function TVCinematicHero({
  title, artwork, logo, anilistId, facts, score, description, actions, status, navigation,
}: {
  title: string;
  artwork: string;
  logo?: string;
  anilistId?: number;
  facts: Array<string | number | undefined | null>;
  score?: number;
  description: string;
  actions: ReactNode;
  status?: string;
  navigation?: ReactNode;
}) {
  return (
    <>
    <div className="tv-art-atmosphere" aria-hidden="true">
      <img src={artwork} alt="" decoding="async" />
    </div>
    <section className="tv-cinema" aria-label={title}>
      <img className="tv-cinema-art" src={artwork} alt="" fetchPriority="high" />
      <TVTrailerPreview anilistId={anilistId} title={title} />
      <div className="tv-cinema-scrim" aria-hidden="true" />
      <div className="tv-cinema-copy">
        <TVTitleLogo logo={logo} title={title} />
        <TVHeroFacts facts={facts} score={score} />
        <p className="tv-cinema-description">{description.replace(/<[^>]*>/g, "")}</p>
        <div className="tv-actions tv-cinema-actions">{actions}</div>
      </div>
      <div className="tv-cinema-corner">
        {status && <span className="tv-cinema-status">{status}</span>}
        <TVPreviewToggle />
      </div>
      {navigation && <div className="tv-cinema-navigation">{navigation}</div>}
    </section>
    </>
  );
}
