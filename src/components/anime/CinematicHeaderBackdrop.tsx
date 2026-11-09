import { useLayoutEffect, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { getHighQualityImage, type SpotlightAnime } from '@/lib/api';
import { cinematicHeaderBounds, type CinematicHeaderBounds } from '@/lib/cinematicHeaderBounds';
import { spotlightArtworkBlur, useSpotlightPresentation } from '@/components/customization/SpotlightPresentation';

export interface HeaderBackdropPlacement { owner: HTMLElement; bounds: CinematicHeaderBounds; viewport: CinematicHeaderBounds }
export function useCinematicHeaderBackdrop(section: RefObject<HTMLElement>, identity?: string): HeaderBackdropPlacement | null {
  const [placement, setPlacement] = useState<HeaderBackdropPlacement | null>(null);
  useLayoutEffect(() => {
    const hero = section.current;
    const owner = hero?.closest<HTMLElement>('[data-spotlight-page], .spotlight-preview-page, main');
    const header = owner?.querySelector<HTMLElement>('header[data-desktop-header][data-page-aligned="true"]');
    if (!hero || !owner || !header) { setPlacement(null); return; }
    const measure = () => {
      const target = owner.closest<HTMLElement>('[data-preview-target]')?.dataset.previewTarget;
      const desktop = target ? target === 'desktop' : window.matchMedia('(min-width: 1024px)').matches && !document.documentElement.classList.contains('tatakai-tv');
      if (!desktop || !header.getClientRects().length) { setPlacement(null); return; }
      const ownerRect = owner.getBoundingClientRect();
      const scale = owner.offsetWidth > 0 ? ownerRect.width / owner.offsetWidth : 1;
      const bounds = cinematicHeaderBounds(ownerRect, header.getBoundingClientRect(), hero.getBoundingClientRect(), scale);
      const viewport = { left: ownerRect.left + bounds.left * scale, top: ownerRect.top + bounds.top * scale, width: bounds.width * scale, height: bounds.height * scale };
      setPlacement(current => current?.owner === owner && JSON.stringify(current.bounds) === JSON.stringify(bounds) && JSON.stringify(current.viewport) === JSON.stringify(viewport) ? current : { owner, bounds, viewport });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(owner); observer?.observe(header); observer?.observe(hero);
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); observer?.disconnect(); };
  }, [section, identity]);
  return placement;
}
/** A clipped layer behind the local Header and hero; the poster track keeps its own clipping. */
export function CinematicHeaderBackdrop({ placement, anime, nativePortal }: { placement: HeaderBackdropPlacement; anime: SpotlightAnime; nativePortal?: HTMLDivElement | null }) {
  const presentation = useSpotlightPresentation();
  const portal = nativePortal && !placement.owner.closest('[data-preview-target]') ? nativePortal : null;
  const hostRect = portal?.getBoundingClientRect();
  const scale = portal && portal.offsetWidth > 0 ? hostRect!.width / portal.offsetWidth || 1 : 1;
  const bounds = portal ? { left: (placement.viewport.left - hostRect!.left) / scale, top: (placement.viewport.top - hostRect!.top) / scale, width: placement.viewport.width / scale, height: placement.viewport.height / scale } : placement.bounds;
  return createPortal(<div data-cinematic-header-backdrop data-native-backdrop={Boolean(portal)} aria-hidden="true" className="cinematic-header-backdrop" style={{ ...bounds, ...(portal ? { zIndex: 1, opacity: 1 } : {}) }}>
    <img key={`${anime.id}:${anime.banner}`} style={{ filter: `blur(${spotlightArtworkBlur(presentation?.backgroundBlur, 22)}px)` }} src={getHighQualityImage(anime.banner || anime.poster) || '/placeholder.svg'} alt="" decoding="async" onError={event => { const image = event.currentTarget; if (image.dataset.fallback) { image.style.opacity = '0'; return; } image.dataset.fallback = 'true'; image.src = getHighQualityImage(anime.poster) || '/placeholder.svg'; }} />
    <div className="cinematic-header-backdrop-shade" />
  </div>, portal || placement.owner);
}
