import { useEffect, useLayoutEffect, useMemo, type ReactNode } from 'react';
import { applyThemePalette, resolveThemePalette, useTheme } from '@/hooks/ui/useTheme';
import { useIsMobile } from '@/hooks/ui/use-mobile';
import { CustomizationScopeProvider, useCustomization } from '@/hooks/ui/useCustomization';
import { getThemeCustomization } from '@/lib/customization';
import { brandLogoSource, resolveLogoVariant, syncCommittedLauncher } from '@/lib/branding';
import { isTV } from '@/core/tv/device';
import { useTVAppearance } from '@/core/tv/appearance';
import { AppThemeBackgroundProvider } from './AppThemeBackground';
import { appThemeBackground } from '@/lib/themeBackground';
import { useDesktopBackdrop } from '@/lib/desktopBackdrop';
import { CanvasReadability } from './CanvasReadability';

/** Only committed stores reach this runtime. Editors keep previews scoped locally. */
export function BrandRuntimeProvider({ children }: { children: ReactNode }) {
  const main = useTheme();
  const backdrop = useDesktopBackdrop();
  const canvasOpacity = backdrop.selection?.opacity ?? 0.82;
  const activeBackdrop = backdrop.selection?.activeMode ?? backdrop.selection?.mode;
  const systemBlur = (activeBackdrop === 'system-blur' && backdrop.capabilities?.supported === true && backdrop.selection?.supported !== false) || (activeBackdrop === 'transparent' && backdrop.capabilities?.transparentSupported === true);
  useLayoutEffect(() => {
    document.documentElement.classList.toggle('desktop-system-blur', systemBlur);
    if (systemBlur && activeBackdrop) document.documentElement.dataset.desktopBackdrop = activeBackdrop;
    else delete document.documentElement.dataset.desktopBackdrop;
    document.documentElement.style.setProperty('--desktop-canvas-opacity', String(canvasOpacity));
    return () => { document.documentElement.classList.remove('desktop-system-blur'); delete document.documentElement.dataset.desktopBackdrop; document.documentElement.style.removeProperty('--desktop-canvas-opacity'); };
  }, [systemBlur, canvasOpacity, activeBackdrop]);
  const tv = useTVAppearance();
  const mobile = useIsMobile();
  const { settings } = useCustomization();
  const television = isTV();
  const theme = television ? tv.appearance.theme : main.theme;
  const customization = getThemeCustomization(settings, theme);
  const palette = useMemo(() => resolveThemePalette(theme, customization.palette), [theme, customization.palette, main.themeInfo]);
  const variant = resolveLogoVariant(customization.logo, theme);
  const background = appThemeBackground(customization, palette.background);
  useEffect(() => {
    applyThemePalette(theme, palette, television ? tv.reduced : main.reduceMotion, main.highContrast);
    if (typeof window !== 'undefined' && window.electron?.persistTheme) void window.electron.persistTheme({
      theme, primary: palette.primary, secondary: palette.secondary, accent: palette.accent,
      background: palette.background, foreground: palette.foreground,
      mutedForeground: palette.mutedForeground, border: palette.border, card: palette.card,
    }).catch(() => undefined);
  }, [theme, palette, television, tv.reduced, main.reduceMotion, main.highContrast]);
  useEffect(() => {
    let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!icon) { icon = document.createElement('link'); icon.rel = 'icon'; document.head.appendChild(icon); }
    icon.type = 'image/png'; icon.href = brandLogoSource(variant);
    void syncCommittedLauncher(variant).catch(() => undefined);
  }, [variant]);
  return <CustomizationScopeProvider themeId={theme} target={television ? 'tv' : mobile ? 'mobile' : 'desktop'}><AppThemeBackgroundProvider background={background} systemBlur={systemBlur}><CanvasReadability palette={palette} background={background} systemBlur={systemBlur} opacity={canvasOpacity} />{children}</AppThemeBackgroundProvider></CustomizationScopeProvider>;
}
