# Frontend Architecture (React SPA)

## Overview

The web app is a **React 19 + TypeScript** SPA built with Vite, TanStack Query, Zustand, and Tailwind CSS. It runs standalone in browsers and is embedded in Electron/Capacitor for desktop/mobile.

---

## Project Structure

```
src/
├── main.tsx                 # App entry, providers, router
├── App.tsx                  # Root layout, routes, error boundaries
├── vite-env.d.ts            # Vite type declarations
├── core/                    # Domain layer (shared across features)
│   ├── api/                 # API clients
│   ├── content/             # Media types, sources, custom-source
│   ├── database/            # Local IndexedDB (Dexie)
│   ├── extensions/          # Extension system
│   ├── hooks/               # Shared hooks
│   ├── types/               # Shared types
│   └── utils/               # Utilities
├── features/                # Feature modules (self-contained)
│   ├── anime/
│   ├── community/
│   ├── downloads/
│   ├── manga/
│   ├── novels/
│   ├── player/
│   ├── recommendations/
│   ├── search/
│   ├── settings/
│   └── extensions/
├── components/              # Shared UI components
│   ├── ui/                  # shadcn/ui primitives
│   ├── media/               # Media cards, grids, skeletons
│   ├── player/              # Player-specific components
│   ├── reader/              # Reader-specific components
│   └── layout/              # Shell, header, sidebar, footer
├── hooks/                   # Cross-feature hooks
├── lib/                     # Library configs (queryClient, i18n, etc.)
├── styles/                  # Global CSS, Tailwind, animations
└── utils/                   # General utilities
```

---

## Routing (React Router v7)

**File:** `src/App.tsx`

```tsx
<Router>
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <ExtensionProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Home />} />
            <Route path="/search" element={<Search />} />
            <Route path="/anime/:id" element={<AnimeDetail />} />
            <Route path="/manga/:id" element={<MangaDetail />} />
            <Route path="/novel/:id" element={<NovelDetail />} />

            {/* Watch/Read routes */}
            <Route path="/watch/:animeId/:episodeId" element={<WatchPage />} />
            <Route path="/read/:mangaId/:chapterId" element={<MangaReader />} />
            <Route path="/read-novel/:novelId/:chapterId" element={<NovelReader />} />

            {/* Custom source routes (dynamic) */}
            <Route path="/x/:namespace/:sourceId/*" element={<CustomSourceRenderer />} />

            {/* Protected routes */}
            <Route element={<ProtectedRoute><Dashboard /></ProtectedRoute>}>
              <Route path="/library" element={<Library />} />
              <Route path="/downloads" element={<Downloads />} />
              <Route path="/settings/*" element={<Settings />} />
              <Route path="/profile/:userId" element={<Profile />} />
              <Route path="/watch-together/:sessionId" element={<WatchTogether />} />
            </Route>

            {/* Extension UI routes (dynamic) */}
            <Route path="/ext/:namespace/*" element={<ExtensionPageRenderer />} />

            {/* Auth */}
            <Route path="/login" element={<Login />} />
            <Route path="/callback" element={<AuthCallback />} />

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ExtensionProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
</Router>
```

### Route Conventions

| Pattern | Purpose |
|---------|---------|
| `/anime/:id` | Media detail pages (SSR-ready) |
| `/watch/:animeId/:episodeId` | Video player page |
| `/read/:mangaId/:chapterId` | Manga reader |
| `/read-novel/:novelId/:chapterId` | Novel reader |
| `/x/:namespace/:sourceId/*` | Custom source generic renderer |
| `/ext/:namespace/*` | Extension-owned pages |
| `/settings/*` | Settings panels (lazy-loaded) |

---

## State Management

### TanStack Query (Server State)

**Config:** `src/lib/queryClient.ts`

```ts
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,      // 5 min
      gcTime: 1000 * 60 * 30,        // 30 min
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
```

**Key Patterns:**

```ts
// Media list (anime/manga/novel unified)
const { data } = useMediaList({ type: 'anime', status: 'watching' });

// Episode sources (fans out to all extensions)
const { data: sources } = useEpisodeSources(animeId, episodeNumber);

// Custom source content
const { data } = useCustomSource(namespace, sourceId, path);

// Recommendations
const { data } = useRecommendations({ limit: 20, signals: ['genre', 'studio'] });
```

### Zustand (Client State)

**Stores in `src/core/hooks/` or feature-specific:**

| Store | Purpose |
|-------|---------|
| `useAuthStore` | User session, profile, tokens |
| `useSettingsStore` | All user settings (synced to Supabase) |
| `usePlayerStore` | Video player state (quality, audio, subtitles, speed) |
| `useReaderStore` | Manga/novel reader state (mode, scroll, theme) |
| `useDownloadStore` | Download queue, active downloads |
| `useExtensionStore` | Installed extensions, trust status |
| `useThemeStore` | Active theme, custom CSS variables |
| `useWatchTogetherStore` | Session state, participants, sync |

**Example:**
```ts
// src/core/hooks/usePlayerStore.ts
export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      quality: 'auto',
      audioTrack: 0,
      subtitleTrack: -1,
      playbackRate: 1,
      theaterMode: false,
      ambientMode: false,
      setQuality: (q) => set({ quality: q }),
      // ...
    }),
    { name: 'player-storage', partialize: (s) => omit(s, ['internal']) }
  )
);
```

---

## Context Providers (Hierarchy)

```
<QueryClientProvider>
  <ThemeProvider>           // Tailwind dark/class, CSS variables
    <AuthProvider>          // Supabase auth, profile, permissions
      <ExtensionProvider>   // Extension registry, loader, trust
        <SettingsProvider>  // Reactive settings (debounced sync)
          <I18nProvider>    // Translations, RTL, locale
            <AppRoutes />
          </I18nProvider>
        </SettingsProvider>
      </ExtensionProvider>
    </AuthProvider>
  </ThemeProvider>
</QueryClientProvider>
```

**Key Providers:**

| Provider | File | Responsibility |
|----------|------|----------------|
| `ThemeProvider` | `src/components/providers/ThemeProvider.tsx` | Theme switching, CSS var injection, OS preference |
| `AuthProvider` | `src/core/hooks/useAuth.tsx` | Session, profile, OAuth, token refresh |
| `ExtensionProvider` | `src/core/extensions/ExtensionProvider.tsx` | Registry, bootstrap, renderer loader |
| `SettingsProvider` | `src/core/hooks/useSettings.tsx` | All settings, validation, Supabase sync |
| `I18nProvider` | `src/lib/i18n.tsx` | Translations, locale detection, RTL |

---

## Data Fetching Patterns

### 1. Media Details (Anime/Manga/Novel)

```ts
// src/features/anime/hooks/useAnimeDetail.ts
export function useAnimeDetail(animeId: string) {
  return useQuery({
    queryKey: ['anime', 'detail', animeId],
    queryFn: () => tatakaiApi.anime.getDetail(animeId),
    enabled: !!animeId,
    select: (data) => enrichWithExtensions(data), // Merge extension metadata
  });
}
```

### 2. Episode Sources (Extension Fan-Out)

```ts
// src/features/player/hooks/useEpisodeSources.ts
export function useEpisodeSources(animeId: string, episode: number) {
  return useQuery({
    queryKey: ['sources', animeId, episode],
    queryFn: async () => {
      // Calls ExtensionRegistry.getSources() which fans out to all extensions
      const results = await extensionRegistry.resolveSources({
        anilistId: animeId,
        episode,
        titles: await getTitles(animeId),
      });
      return applyProxy(results); // Rewrite headed URLs
    },
    staleTime: 1000 * 60 * 2, // 2 min
  });
}
```

### 3. Custom Source Content

```ts
// src/core/content/custom-source-runtime.ts
export function useCustomSource(namespace: string, sourceId: string, path: string) {
  return useQuery({
    queryKey: ['custom', namespace, sourceId, path],
    queryFn: () => extensionRegistry.invokeCustomSource(namespace, sourceId, path),
    // Custom sources use separate React Query keys, never touch media lists
  });
}
```

---

## Extension Integration (Renderer Side)

### Extension Registry

**File:** `src/core/extensions/ExtensionRegistry.ts`

```ts
class ExtensionRegistry {
  // Data-driven contributions (available for ALL extensions)
  themes: Map<string, ThemeContribution> = new Map();
  analytics: Map<string, AnalyticsContribution> = new Map();
  sources: Map<string, SourceExtension> = new Map();
  mangaSources: Map<string, MangaSourceExtension> = new Map();
  customSources: Map<string, CustomSourceExtension> = new Map();

  // Code-driven contributions (TRUSTED extensions only)
  pages: Map<string, React.ComponentType> = new Map();
  slots: Map<string, SlotContribution[]> = new Map();
  services: Map<string, ServiceContribution> = new Map();
  modules: Map<string, ModuleContribution> = new Map();

  // Dynamic renderer loading
  async loadRenderer(namespace: string, rendererUrl: string): Promise<void>
  async activateRenderer(namespace: string): Promise<void>
}
```

### Renderer Loader

**File:** `src/core/extensions/rendererLoader.ts`

```ts
export async function loadRendererBundle(
  namespace: string,
  blobUrl: string
): Promise<RendererModule> {
  // 1. Dynamic import from blob URL
  const module = await import(/* @vite-ignore */ blobUrl);

  // 2. Call activate(ctx) with ExtensionContext
  const ctx = createExtensionContext(namespace);
  await module.default?.activate?.(ctx);

  // 3. Register contributions
  registry.registerRendererContributions(namespace, ctx.contributions);

  return module;
}
```

### Extension Context API (Renderer)

```ts
interface ExtensionContext {
  namespace: string;
  manifest: Manifest;
  registry: {
    // UI contributions (trusted only)
    registerPage: (path: string, component: ComponentType) => void;
    registerSlot: (slot: string, component: ComponentType, priority?: number) => void;
    registerService: (service: ServiceDefinition) => void;
    registerModule: (module: ModuleDefinition) => void;

    // Data access
    useQuery: typeof useQuery;
    useMutation: typeof useMutation;
    queryClient: QueryClient;

    // App APIs
    api: TatakaiAPI;
    settings: SettingsStore;
    i18n: I18n;
    theme: ThemeStore;
  };
  // Lifecycle
  onUnload: (fn: () => void) => void;
}
```

---

## UI Components

### Design System

- **Base:** shadcn/ui (Radix UI primitives + Tailwind)
- **Theme:** CSS variables (see `reference/design-guidelines.md`)
- **Custom Components:** Extended in `src/components/ui/`

### Key Component Categories

| Category | Examples |
|----------|----------|
| **Media Display** | `MediaCard`, `MediaGrid`, `MediaSkeleton`, `PosterImage`, `BannerImage` |
| **Player** | `VideoPlayer`, `QualitySelector`, `AudioSelector`, `SubtitleSelector`, `SkipControls` |
| **Reader** | `MangaViewer`, `NovelViewer`, `ReaderToolbar`, `PageNavigator`, `TTSControls` |
| **Community** | `PostCard`, `TierList`, `PlaylistCard`, `ProfileHeader`, `Leaderboard` |
| **Extensions** | `ExtensionCard`, `ExtensionSettings`, `SourceBadge`, `TrustBadge` |
| **Layout** | `AppShell`, `Header`, `Sidebar`, `BottomNav`, `Modal`, `Drawer` |

### Animation Conventions

- **CSS-first** for simple transitions (opacity, transform, color)
- **Framer Motion** for complex orchestration (page transitions, lists, modals)
- **Respects `prefers-reduced-motion`** — all animations have `reduce-motion` variants

```css
/* Global reduced motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Theming System

**Files:** `src/styles/theme.css`, `src/components/providers/ThemeProvider.tsx`

### CSS Variables (Tailwind + Custom)

```css
:root {
  /* shadcn/ui base */
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 340 82% 65%;
  --primary-foreground: 340 5% 95%;
  /* ... */

  /* Tatakai custom */
  --glass-bg: 340 12% 8% / 0.6;
  --glass-border: 340 5% 95% / 0.1;
  --glow-primary: 340 82% 65%;
  --radius: 1rem;
}
```

### Theme Switching

```tsx
// ThemeProvider.tsx
export function ThemeProvider({ children }) {
  const { theme, setTheme } = useThemeStore();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark', ...THEMES.map(t => t.id));
    root.classList.add(theme);
    // Apply custom CSS variables for theme
    applyThemeVariables(theme);
  }, [theme]);

  return <>{children}</>;
}
```

---

## Internationalization (i18n)

**File:** `src/lib/i18n.ts`

- **Library:** `i18next` + `react-i18next`
- **Languages:** EN (default), JA, ZH, KO, ES, PT, FR, DE, RU, AR (RTL)
- **Namespaces:** `common`, `anime`, `manga`, `novels`, `settings`, `community`, `extensions`
- **Detection:** Browser locale → user setting → fallback EN

```ts
// Usage
const { t } = useTranslation('anime');
return <h1>{t('anime.calendar.title')}</h1>;
```

---

## Performance Optimizations

| Technique | Implementation |
|-----------|----------------|
| **Code Splitting** | `React.lazy()` for all feature routes, settings panels |
| **Virtualization** | `@tanstack/react-virtual` for media grids, lists, logs |
| **Image Optimization** | `src/components/media/PosterImage.tsx` — blur placeholder, lazy load, WebP/AVIF |
| **Bundle Analysis** | `pnpm build -- --analyze` |
| **Prefetching** | `queryClient.prefetchQuery()` on hover (media cards, navigation) |
| **Memoization** | `React.memo`, `useMemo`, `useCallback` for expensive renders |

---

## Error Handling

### Error Boundaries

```tsx
// src/components/ErrorBoundary.tsx
export class ErrorBoundary extends Component<Props, State> {
  state = { error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    logError(error, errorInfo); // Sentry/log service
  }

  render() {
    if (this.state.error) {
      return <ErrorFallback error={this.state.error} reset={() => this.setState({ error: null })} />;
    }
    return this.props.children;
  }
}
```

### API Error Handling

```ts
// src/core/api/tatakaiApi.ts
export const tatakaiApi = {
  async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: 'Unknown error' }));
      throw new ApiError(res.status, error.message, error.code);
    }
    return res.json();
  },
};
```

---

## Testing

| Type | Tool | Location |
|------|------|----------|
| **Unit** | Vitest | `src/**/*.test.ts(x)` |
| **Integration** | Vitest + MSW | `src/features/**/*.test.ts(x)` |
| **E2E** | Playwright | `e2e/**/*.spec.ts` |
| **Component** | Storybook | `src/**/*.stories.tsx` |

**Run:**
```bash
pnpm test           # Unit + integration
pnpm test:e2e       # E2E (requires dev server)
pnpm test:coverage  # Coverage report
```

---

## Build & Deploy

### Vite Config Highlights

```ts
// vite.config.ts
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    target: 'es2022',
    minify: 'esbuild',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-ui': ['@radix-ui/*', 'framer-motion', 'lucide-react'],
          'vendor-media': ['hls.js', 'media-chrome'],
        },
      },
    },
  },
  server: { port: 5173, hmr: true },
});
```

### Environment Variables (Build Time)

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `VITE_TATAKAI_API_URL` | TatakaiAPI proxy URL |
| `VITE_APP_VERSION` | Injected from `package.json` |
| `VITE_BUILD_TIME` | ISO timestamp |

---

## Related Documents

- [Architecture Overview](architecture/overview.md) — Full system architecture
- [Desktop Architecture](architecture/desktop.md) — Electron specifics
- [Backend & Data](architecture/backend.md) — Supabase, API proxy
- [Extension System](extensions/overview.md) — Extension integration details