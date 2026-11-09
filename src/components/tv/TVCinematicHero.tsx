import type { ReactNode } from "react";
import { SpotlightPresentation, SpotlightPart, useSpotlightEditing, useSpotlightPresentation } from '@/components/customization/SpotlightPresentation';
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
  const editing = useSpotlightEditing();
  const presentation = useSpotlightPresentation();
  return (
    <SpotlightPresentation>
    <div className="tv-art-atmosphere" aria-hidden="true">
      <img src={artwork} alt="" decoding="async" />
    </div>
    <section data-spotlight-stage className="tv-cinema" aria-label={title}>
      <img className="tv-cinema-art" src={artwork} alt="" fetchPriority="high" />
      {!editing && presentation?.variant !== 'classic' && <TVTrailerPreview anilistId={anilistId} title={title} />}
      <div data-spotlight-shade className="tv-cinema-scrim" aria-hidden="true" />
      <div data-spotlight-copy className="tv-cinema-copy">
        <SpotlightPart part="title"><TVTitleLogo logo={logo} title={title} /></SpotlightPart>
        <SpotlightPart part="details"><TVHeroFacts facts={facts} score={score} /></SpotlightPart>
        <SpotlightPart part="description"><p data-spotlight-description className="tv-cinema-description">{description.replace(/<[^>]*>/g, "")}</p></SpotlightPart>
        <SpotlightPart part="actions"><div data-spotlight-actions className="tv-actions tv-cinema-actions">{actions}</div></SpotlightPart>
      </div>
      <div className="tv-cinema-corner">
        {status && <span className="tv-cinema-status">{status}</span>}
        <TVPreviewToggle />
      </div>
      {navigation && <div className="tv-cinema-navigation">{navigation}</div>}
    </section>
    </SpotlightPresentation>
  );
}
