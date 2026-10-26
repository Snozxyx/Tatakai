/** Fullscreen API elements and CSS/native fullscreen players own their overlays. */
export function getFullscreenPortalContainer(): HTMLElement | undefined {
  if (typeof document === 'undefined') return undefined;
  const native = document.fullscreenElement ||
    (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement;
  if (native instanceof HTMLElement) return native;
  return document.querySelector<HTMLElement>('.video-player-container.is-player-fullscreen') ?? undefined;
}
