import { create } from 'zustand';

interface UIState {
  currentRoute: string;
  sidebarOpen: boolean;
  loading: boolean;
  theme: 'default' | 'high-contrast';
  uiScale: number;
  reducedMotion: boolean;
  enhancedFocus: boolean;
  
  // Actions
  setCurrentRoute: (route: string) => void;
  setSidebarOpen: (open: boolean) => void;
  setLoading: (loading: boolean) => void;
  setTheme: (theme: 'default' | 'high-contrast') => void;
  setUIScale: (scale: number) => void;
  setReducedMotion: (enabled: boolean) => void;
  setEnhancedFocus: (enabled: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  currentRoute: 'home',
  sidebarOpen: false,
  loading: false,
  theme: 'default',
  uiScale: 1.0,
  reducedMotion: false,
  enhancedFocus: false,

  setCurrentRoute: (route) => set({ currentRoute: route }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setLoading: (loading) => set({ loading }),
  setTheme: (theme) => set({ theme }),
  setUIScale: (scale) => set({ uiScale: scale }),
  setReducedMotion: (enabled) => set({ reducedMotion: enabled }),
  setEnhancedFocus: (enabled) => set({ enhancedFocus: enabled }),
}));

// Focus management store
interface FocusState {
  lastFocusedElement: string | null;
  focusHistory: Array<{ route: string; selector: string }>;
  
  // Actions
  setLastFocusedElement: (selector: string | null) => void;
  addToFocusHistory: (route: string, selector: string) => void;
  getLastFocusForRoute: (route: string) => string | null;
}

export const useFocusStore = create<FocusState>((set, get) => ({
  lastFocusedElement: null,
  focusHistory: [],

  setLastFocusedElement: (selector) => set({ lastFocusedElement: selector }),
  
  addToFocusHistory: (route, selector) => set((state) => ({
    focusHistory: [
      ...state.focusHistory.filter(item => item.route !== route),
      { route, selector }
    ].slice(-10) // Keep only last 10 entries
  })),

  getLastFocusForRoute: (route) => {
    const history = get().focusHistory;
    const entry = history.find(item => item.route === route);
    return entry?.selector || null;
  }
}));