import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react';
import { AppearanceBackground } from '@/components/settings/BackgroundEditor';
import type { BackgroundConfig } from '@/lib/customization';
import './app-theme-background.css';

const GlobalBackgroundContext = createContext(false);
const SystemBlurContext = createContext(false);
const BackgroundPortalContext = createContext<HTMLDivElement | null>(null);
export function useAppThemeBackground() { return useContext(GlobalBackgroundContext); }
export function useAppSystemBlur() { return useContext(SystemBlurContext); }
export function useAppBackdropPortal() { return useContext(BackgroundPortalContext); }

/** One committed background survives route changes; section/preview backgrounds stay local. */
export function AppThemeBackgroundProvider({ background, systemBlur = false, children }: { background?: BackgroundConfig | null; systemBlur?: boolean; children: ReactNode }) {
  const custom = !!background;
  const [portal, setPortal] = useState<HTMLDivElement | null>(null);
  const active = custom || systemBlur;
  useLayoutEffect(() => {
    if (active) document.documentElement.dataset.appBackground = custom ? 'custom' : 'system';
    else delete document.documentElement.dataset.appBackground;
    return () => { delete document.documentElement.dataset.appBackground; };
  }, [active, custom, systemBlur]);
  return <GlobalBackgroundContext.Provider value={custom}><SystemBlurContext.Provider value={systemBlur}><BackgroundPortalContext.Provider value={systemBlur ? portal : null}>
    {active && <div data-app-theme-background className="fixed inset-0 z-0 pointer-events-none overflow-hidden" style={systemBlur ? { opacity: 'var(--desktop-canvas-opacity, 0.82)' } : undefined}>
      {custom ? <AppearanceBackground background={background} /> : <div data-desktop-theme-tint className="absolute inset-0" style={{ backgroundColor: 'hsl(var(--background))' }} />}
      {systemBlur && <div ref={setPortal} data-desktop-background-portal className="absolute inset-0 pointer-events-none" />}
    </div>}
    {children}
  </BackgroundPortalContext.Provider></SystemBlurContext.Provider></GlobalBackgroundContext.Provider>;
}
