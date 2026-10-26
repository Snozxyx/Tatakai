import { resolveTVTheme, type TVTheme } from "./themes";
import { useEffect, useState } from "react";
import { TV_WALLPAPERS, resolveTVWallpaper } from "./wallpapers";
export const DEFAULT_TV_WALLPAPER =
  TV_WALLPAPERS[0].src;
const KEY = "tatakai-tv-appearance";
export interface TVAppearance {
  theme: TVTheme;
  wallpaper: string;
  videoWallpaper: boolean;
  previews: boolean;
  reducedMotion: boolean;
}
export function readTVAppearance(): TVAppearance {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    return {
      videoWallpaper: false,
      previews: false,
      reducedMotion: false,
      ...saved,
      theme: resolveTVTheme(saved.theme),
      wallpaper: resolveTVWallpaper(saved.wallpaper),
    };
  } catch {
    return {
      theme: resolveTVTheme(undefined),
      wallpaper: DEFAULT_TV_WALLPAPER,
      videoWallpaper: false,
      previews: false,
      reducedMotion: false,
    };
  }
}
export function saveTVAppearance(value: TVAppearance) {
  localStorage.setItem(KEY, JSON.stringify(value));
  window.dispatchEvent(new Event("tatakai-tv-appearance"));
}
export function useTVAppearance() {
  const [appearance, setAppearance] = useState(readTVAppearance);
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  useEffect(() => {
    const update = () => setAppearance(readTVAppearance());
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const motion = () => setReduced(media.matches);
    window.addEventListener("tatakai-tv-appearance", update);
    media.addEventListener("change", motion);
    return () => {
      window.removeEventListener("tatakai-tv-appearance", update);
      media.removeEventListener("change", motion);
    };
  }, []);
  return { appearance, reduced: reduced || appearance.reducedMotion };
}
