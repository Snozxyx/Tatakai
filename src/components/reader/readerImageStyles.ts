import type { CSSProperties } from 'react';
import { DEFAULT_READER_SETTINGS, type ReaderSettings } from '@/hooks/media/useReaderSettings';
import { getProfileKnobs } from '@/lib/memoryProfile';
import { getEffectiveMemoryProfile } from '@/lib/mobile/dataSaver';

export function readerPageIsEager(settings: ReaderSettings, index: number, currentPage: number, touchOrNative: boolean) {
  const preloading = settings.preloading === 'partial' ? getProfileKnobs(getEffectiveMemoryProfile()).readerPreload : settings.preloading;
  if (settings.loadingStrategy === 'eager' || preloading === 'full') return true;
  return Math.abs(index - currentPage) <= (preloading === 'none' ? 1 : touchOrNative ? 6 : 3);
}

/** Exact sizing shared by the standard and extension readers. */
export function readerImageStyles(settings: ReaderSettings, touchOrNative: boolean) {
  const zoomFactor = settings.zoom / 100;
  const maxWidthCap = settings.maxWidthPx > 0 ? `${settings.maxWidthPx}px` : undefined;

  // Mobile default is edge-to-edge pages: when the user never changed the
  // desktop-oriented 70% default, touch devices render full width instead. An
  // explicit width choice is always honored.
  const effectiveWidthPercent =
    touchOrNative &&
    settings.widthPercent === DEFAULT_READER_SETTINGS.widthPercent
      ? 100
      : settings.widthPercent;

  // Panel crop (small phones): full-bleed vertical pages, height-fit paged
  // pages — no letterboxing on narrow screens.
  const cropVerticalStyle: CSSProperties | null = settings.panelCrop
    ? { width: "100%", maxWidth: "none" }
    : null;

  // Vertical (webtoon) sizing: width-based, scaled by zoom, capped by maxWidthPx.
  const widthStyle: CSSProperties =
    cropVerticalStyle ??
    (settings.sizing === "natural"
      ? {
          width: zoomFactor === 1 ? "auto" : `${Math.round(100 * zoomFactor)}%`,
          maxWidth: maxWidthCap ?? (zoomFactor > 1 ? "none" : "100%"),
        }
      : {
          width: `${effectiveWidthPercent * zoomFactor}%`,
          maxWidth: maxWidthCap ?? (zoomFactor > 1 ? "none" : "100%"),
        });

  // Paged sizing honors the page-fit mode (fit width / height / both / original).
  const pagedStyle: CSSProperties = (() => {
    // Panel crop forces height-fit in paged mode so each page fills the phone
    // screen edge to edge.
    if (settings.panelCrop) {
      return { height: `${88 * zoomFactor}vh`, width: "auto", maxWidth: "none" };
    }
    switch (settings.pageFit) {
      case "height":
        return { height: `${88 * zoomFactor}vh`, width: "auto", maxWidth: maxWidthCap ?? "none" };
      case "both":
        return {
          maxHeight: `${90 * zoomFactor}vh`,
          maxWidth: maxWidthCap ?? `${effectiveWidthPercent * zoomFactor}%`,
          width: "auto",
          height: "auto",
        };
      case "original":
        return {
          width: zoomFactor === 1 ? "auto" : `${Math.round(100 * zoomFactor)}%`,
          maxWidth: maxWidthCap ?? "none",
        };
      case "width":
      default:
        return {
          width: `${effectiveWidthPercent * zoomFactor}%`,
          maxWidth: maxWidthCap ?? (zoomFactor > 1 ? "none" : "100%"),
        };
    }
  })();

  return { vertical: widthStyle, paged: pagedStyle };
}
