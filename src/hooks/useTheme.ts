import { useState, useEffect, useCallback } from 'react';

export type Theme = 
  | 'midnight' 
  | 'cherry-blossom' 
  | 'neon-tokyo' 
  | 'deep-ocean' 
  | 'light-minimal';

interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  glass: string;
  glowPrimary: string;
  glowSecondary: string;
  surface: string;
  surfaceHover: string;
  sidebarBackground: string;
  sidebarBorder: string;
  isLight?: boolean;
  isBrutalism?: boolean;
}

export const THEME_COLORS: Record<Theme, ThemeColors> = {
  'midnight': {
    primary: '239 84% 67%',
    secondary: '270 60% 50%',
    accent: '280 70% 55%',
    background: '240 10% 4%',
    foreground: '0 0% 98%',
    card: '240 8% 7%',
    cardForeground: '0 0% 98%',
    muted: '240 6% 12%',
    mutedForeground: '240 5% 65%',
    border: '240 6% 18%',
    glass: '240 10% 8%',
    glowPrimary: '239 84% 67%',
    glowSecondary: '270 60% 50%',
    surface: '240 8% 5%',
    surfaceHover: '240 8% 10%',
    sidebarBackground: '240 10% 3%',
    sidebarBorder: '240 6% 15%',
  },
  'cherry-blossom': {
    primary: '340 82% 65%',
    secondary: '320 70% 55%',
    accent: '350 90% 70%',
    background: '340 15% 5%',
    foreground: '340 5% 95%',
    card: '340 12% 8%',
    cardForeground: '340 5% 95%',
    muted: '340 10% 15%',
    mutedForeground: '340 10% 60%',
    border: '340 10% 20%',
    glass: '340 12% 10%',
    glowPrimary: '340 82% 65%',
    glowSecondary: '320 70% 55%',
    surface: '340 12% 6%',
    surfaceHover: '340 12% 12%',
    sidebarBackground: '340 15% 4%',
    sidebarBorder: '340 10% 15%',
  },
  'neon-tokyo': {
    primary: '280 100% 60%',
    secondary: '180 100% 50%',
    accent: '320 100% 55%',
    background: '260 20% 3%',
    foreground: '0 0% 100%',
    card: '260 18% 6%',
    cardForeground: '0 0% 100%',
    muted: '260 15% 12%',
    mutedForeground: '260 10% 60%',
    border: '260 20% 18%',
    glass: '260 18% 8%',
    glowPrimary: '280 100% 60%',
    glowSecondary: '180 100% 50%',
    surface: '260 18% 4%',
    surfaceHover: '260 18% 10%',
    sidebarBackground: '260 20% 2%',
    sidebarBorder: '260 15% 15%',
  },
  'deep-ocean': {
    primary: '200 90% 55%',
    secondary: '220 85% 50%',
    accent: '175 85% 45%',
    background: '210 35% 3%',
    foreground: '200 5% 96%',
    card: '210 30% 6%',
    cardForeground: '200 5% 96%',
    muted: '210 20% 12%',
    mutedForeground: '210 15% 55%',
    border: '210 20% 16%',
    glass: '210 25% 8%',
    glowPrimary: '200 90% 55%',
    glowSecondary: '220 85% 50%',
    surface: '210 30% 4%',
    surfaceHover: '210 30% 10%',
    sidebarBackground: '210 35% 2%',
    sidebarBorder: '210 18% 12%',
  },
  'light-minimal': {
    primary: '220 90% 50%',
    secondary: '260 80% 55%',
    accent: '200 95% 45%',
    background: '0 0% 98%',
    foreground: '220 15% 10%',
    card: '0 0% 100%',
    cardForeground: '220 15% 10%',
    muted: '220 10% 92%',
    mutedForeground: '220 10% 40%',
    border: '220 10% 88%',
    glass: '0 0% 100%',
    glowPrimary: '220 90% 50%',
    glowSecondary: '260 80% 55%',
    surface: '220 10% 96%',
    surfaceHover: '220 10% 93%',
    sidebarBackground: '220 15% 97%',
    sidebarBorder: '220 10% 90%',
    isLight: true,
  },
};

export const THEME_INFO: Record<Theme, { name: string; gradient: string; description: string; icon: string; category: 'dark' | 'light' }> = {
  'midnight': {
    name: 'Midnight',
    gradient: 'from-indigo-600 via-purple-600 to-violet-700',
    description: 'Classic dark with indigo & violet accents',
    icon: '🌙',
    category: 'dark',
  },
  'cherry-blossom': {
    name: 'Cherry Blossom',
    gradient: 'from-pink-500 via-rose-500 to-fuchsia-600',
    description: 'Soft pink tones inspired by sakura',
    icon: '🌸',
    category: 'dark',
  },
  'neon-tokyo': {
    name: 'Neon Tokyo',
    gradient: 'from-purple-500 via-fuchsia-500 to-cyan-400',
    description: 'Electric neon cyberpunk vibes',
    icon: '🗼',
    category: 'dark',
  },
  'deep-ocean': {
    name: 'Deep Ocean',
    gradient: 'from-cyan-500 via-blue-600 to-indigo-700',
    description: 'Mysterious underwater depths',
    icon: '🌊',
    category: 'dark',
  },
  'light-minimal': {
    name: 'Light Minimal',
    gradient: 'from-blue-400 via-indigo-400 to-purple-400',
    description: 'Clean, bright, modern design',
    icon: '☀️',
    category: 'light',
  },
};

const THEME_KEY = 'anime-theme';

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(THEME_KEY) as Theme | null;
      return stored && THEME_COLORS[stored] ? stored : 'midnight';
    }
    return 'midnight';
  });

  const applyTheme = useCallback((themeName: Theme) => {
    const colors = THEME_COLORS[themeName];
    if (!colors) return;
    
    const root = document.documentElement;
    
    root.style.setProperty('--primary', colors.primary);
    root.style.setProperty('--secondary', colors.secondary);
    root.style.setProperty('--accent', colors.accent);
    root.style.setProperty('--background', colors.background);
    root.style.setProperty('--foreground', colors.foreground);
    root.style.setProperty('--card', colors.card);
    root.style.setProperty('--card-foreground', colors.cardForeground);
    root.style.setProperty('--muted', colors.muted);
    root.style.setProperty('--muted-foreground', colors.mutedForeground);
    root.style.setProperty('--border', colors.border);
    root.style.setProperty('--input', colors.border);
    root.style.setProperty('--ring', colors.primary);
    root.style.setProperty('--glass', colors.glass);
    root.style.setProperty('--glow-primary', colors.glowPrimary);
    root.style.setProperty('--glow-secondary', colors.glowSecondary);
    root.style.setProperty('--surface', colors.surface);
    root.style.setProperty('--surface-hover', colors.surfaceHover);
    root.style.setProperty('--sidebar-background', colors.sidebarBackground);
    root.style.setProperty('--sidebar-foreground', colors.foreground);
    root.style.setProperty('--sidebar-primary', colors.primary);
    root.style.setProperty('--sidebar-primary-foreground', colors.foreground);
    root.style.setProperty('--sidebar-accent', colors.muted);
    root.style.setProperty('--sidebar-accent-foreground', colors.foreground);
    root.style.setProperty('--sidebar-border', colors.sidebarBorder);
    root.style.setProperty('--sidebar-ring', colors.primary);
    root.style.setProperty('--popover', colors.card);
    root.style.setProperty('--popover-foreground', colors.cardForeground);

    // Add light theme class for special styling
    if (colors.isLight) {
      document.body.classList.add('light-theme');
      document.body.classList.remove('dark-theme');
    } else {
      document.body.classList.add('dark-theme');
      document.body.classList.remove('light-theme');
    }
    
    // Set data-theme attribute for theme-specific CSS
    document.body.setAttribute('data-theme', themeName);
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme, applyTheme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem(THEME_KEY, newTheme);
  }, []);

  const isLightTheme = THEME_COLORS[theme]?.isLight ?? false;

  return { 
    theme, 
    setTheme, 
    themes: Object.keys(THEME_COLORS) as Theme[],
    themeInfo: THEME_INFO,
    isLightTheme,
  };
}
