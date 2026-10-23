import { useEffect, useState } from "react";
import { TV_WALLPAPERS, resolveTVWallpaper } from "./wallpapers";
export const DEFAULT_TV_WALLPAPER =
  TV_WALLPAPERS[0].src;
const KEY = "tatakai-tv-appearance";
export interface TVAppearance {
  wallpaper: string;
  videoWallpaper: boolean;
  previews: boolean;
  reducedMotion: boolean;
}
export function readTVAppearance(): TVAppearance {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    return {
      videoWallpaper: true,
      previews: false,
      reducedMotion: false,
      ...saved,
      wallpaper: resolveTVWallpaper(saved.wallpaper),
    };
  } catch {
    return {
      wallpaper: DEFAULT_TV_WALLPAPER,
      videoWallpaper: true,
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
