export interface BackdropRect { left: number; top: number; bottom: number; width: number }
export interface CinematicHeaderBounds { left: number; top: number; width: number; height: number }
/** Keep the artwork inside its local page gutter, even inside a scaled Preferences canvas. */
export function cinematicHeaderBounds(owner: BackdropRect, header: BackdropRect, hero: BackdropRect, scale = 1): CinematicHeaderBounds {
  const factor = scale > 0 && Number.isFinite(scale) ? scale : 1;
  const left = Math.max(0, (hero.left - owner.left) / factor);
  const top = Math.max(0, (header.top - owner.top) / factor - 12);
  return { left, top, width: Math.max(0, Math.min(hero.width / factor, owner.width / factor - left)), height: Math.max(0, (hero.bottom - owner.top) / factor - top) };
}
