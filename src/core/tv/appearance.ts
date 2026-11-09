import { resolveTVTheme, type TVTheme } from "./themes";
import { useEffect, useState, useSyncExternalStore } from "react";
import { getCustomThemeSnapshot, subscribeCustomThemes } from '@/lib/customThemeRegistry';
import { TV_WALLPAPERS, resolveTVWallpaper } from "./wallpapers";
import { useCustomization } from '@/hooks/ui/useCustomization';
import { useSystemDark } from '@/hooks/ui/useTheme';
import { resolveThemeSelection } from '@/lib/themeSelection';
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
  useSyncExternalStore(subscribeCustomThemes, getCustomThemeSnapshot, getCustomThemeSnapshot);
  const { settings } = useCustomization();
  const systemDark = useSystemDark();
  const [appearance, setAppearance] = useState(readTVAppearance);
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  useEffect(() => {
    const update = () => setAppearance(readTVAppearance());
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const motion = () => setReduced(media?.matches ?? false);
    window.addEventListener("tatakai-tv-appearance", update);
    media?.addEventListener?.("change", motion);
    return () => {
      window.removeEventListener("tatakai-tv-appearance", update);
      media?.removeEventListener?.("change", motion);
    };
  }, []);
  const theme = settings.tvSelection ? resolveTVTheme(resolveThemeSelection(settings.tvSelection, systemDark)) : appearance.theme;
  return { appearance: { ...appearance, theme }, reduced: reduced || appearance.reducedMotion };
}
