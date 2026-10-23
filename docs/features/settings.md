# Settings, Themes & Advanced Configuration

Comprehensive settings system with 27+ themes, granular customization, and advanced options for power users.

---

## Settings Architecture

```
Settings System
├── Settings Store (Zustand + Supabase sync)
├── Settings UI (categorized panels)
├── Theme Engine (CSS variables + Tailwind)
├── Advanced Config (debug, diagnostics, experimental)
└── Disk Allocation (storage management)
```

**Key Files:**
- `src/core/hooks/useSettings.ts`
- `src/features/settings/` — All settings panels
- `src/styles/theme.css` — CSS variables
- `src/components/providers/ThemeProvider.tsx`

---

## Settings Categories

### 1. Account & Sync

| Setting | Description |
|---------|-------------|
| **Profile** | Username, display name, avatar, bio, links |
| **Connections** | MAL, AniList, MangaBaka (OAuth) |
| **Sync** | Auto-sync interval, conflict resolution, manual sync |
| **Discord** | Discord Rich Presence, DM notifications (coming) |
| **Backup** | Export/import all data (JSON) |

### 2. Appearance

| Setting | Description |
|---------|-------------|
| **Theme** | 27 built-in + custom (see Themes below) |
| **Color Mode** | Light / Dark / System / Custom schedule |
| **Accent Color** | Override primary accent (color picker) |
| **Density** | Compact / Comfortable / Spacious |
| **Animations** | Full / Reduced / Off (respects `prefers-reduced-motion`) |
| **Font Scale** | 80% – 150% (global) |
| **Custom CSS** | Advanced: inject custom CSS (trusted only) |

### 3. Player (Video)

| Setting | Description |
|---------|-------------|
| **Playback** | Auto-play next, auto-skip OP/ED/recap, sleep timer |
| **Quality** | Default quality, max quality, adaptive switching |
| **Audio** | Preferred language order, volume normalization |
| **Subtitles** | Preferred language, font, size, color, outline, sync offset |
| **Appearance** | Theater mode default, ambient mode, controls timeout |
| **Shortcuts** | Full remapping (see [Playback](features/playback.md#keyboard-shortcuts)) |
| **External Players** | MPV, VLC, IINA, custom command |
| **Advanced** | HLS.js config, buffer settings, hardware decoding |

### 4. Manga Reader

| Setting | Description |
|---------|-------------|
| **Reading** | Default mode (vertical/paged/spread), RTL default, auto-advance |
| **Appearance** | Background, page gap, spread gap, fit width |
| **Navigation** | Swipe sensitivity, long-press actions, double-tap zoom |
| **Progress** | Auto-mark read (%), sync frequency, progress badges |
| **Downloads** | Quality, format (CBZ/PDF/Folder), auto-download next |

### 5. Novel Reader

| Setting | Description |
|---------|-------------|
| **Reading** | Default mode, auto-advance, scroll speed, keep screen on |
| **Typography** | Font, size, line height, spacing, align, max width |
| **Appearance** | Theme, custom colors, paragraph indent |
| **TTS** | Default engine, voice, rate, pitch, volume, auto-play next |
| **Downloads** | Format (EPUB/HTML), include images, TOC |

### 6. Downloads

| Setting | Description |
|---------|-------------|
| **General** | Download folder, concurrency, priority defaults |
| **Anime** | Container (MKV/MP4), embed subs, preferred quality |
| **Manga** | Format, quality, naming template |
| **Novels** | Format, include images, TOC |
| **Storage** | Max size, auto-cleanup, cleanup policies |
| **Network** | WiFi only, metered pause, proxy for downloads |

### 7. Recommendations

| Setting | Description |
|---------|-------------|
| **Enabled** | Master toggle |
| **Content Types** | Anime / Manga / Novels |
| **Signal Weights** | 6 sliders (must sum to 100%) |
| **Diversity** | Low / Medium / High |
| **Novelty** | Boost unseen genres/studios |
| **Availability** | Only show titles with installed sources |
| **Exclusions** | Genres, studios, tags to never recommend |

### 8. Community

| Setting | Description |
|---------|-------------|
| **Profile** | Visibility, customization, featured content |
| **Notifications** | Per-type toggles, push, email digest |
| **Privacy** | Profile visibility, follow requests, block list |
| **Feed** | Default feed, content filters, NSFW handling |
| **Watch Together** | Auto-join, chat, host preferences |

### 9. Search

| Setting | Description |
|---------|-------------|
| **Default Types** | Which types to search by default |
| **Safe Search** | Strict / Moderate / Off |
| **Image Search** | Enable, preferred provider |
| **History** | Save, sync, retention |
| **Suggestions** | Trending, history, debounce |
| **Results** | Default view, sort, page size |

### 10. Extensions

| Setting | Description |
|---------|-------------|
| **Installed** | List, enable/disable, configure, uninstall |
| **Hub** | Browse, search, install from marketplace |
| **Sideload** | Install `.kai` file |
| **Trust** | Mark trusted (enables renderer contributions) |
| **Updates** | Auto-update, check frequency |
| **Compatibility** | Seanime/Mihon/Aniyomi status |

### 11. Privacy & Security

| Setting | Description |
|---------|-------------|
| **Analytics** | Disable all / Anonymous only / Full |
| **Crash Reports** | Send crash logs |
| **Usage Stats** | Anonymous feature usage |
| **Network** | Proxy, WARP, DoH |
| **Encryption** | Local encryption key (rotate) |
| **Session** | Timeout, device management |
| **Data** | Export, delete account, retention |

### 12. Advanced

| Setting | Description |
|---------|-------------|
| **Debug** | Console logging, React DevTools, performance monitor |
| **Diagnostics** | Export diagnostics bundle |
| **Experimental** | Feature flags (early access) |
| **Memory** | Profile (Low/Balanced/Unlimited) — desktop only |
| **Developer** | Extension dev mode, source maps, hot reload |
| **Reset** | Reset category / Reset all to defaults |

---

## Themes

### Built-in Themes (27)

| Category | Themes |
|----------|--------|
| **Blossom (Default)** | Blossom Dark, Blossom Light, Blossom High Contrast |
| **Cyberpunk** | Neon Tokyo, Synthwave, Ghost in the Shell |
| **Anime** | Studio Ghibli, Makoto Shinkai, Ufotable, MAPPA, KyoAni |
| **Seasonal** | Spring Sakura, Summer Festival, Autumn Maple, Winter Snow |
| **Monochrome** | Pure Black, Pure White, Gray Scale, Sepia |
| **Accessibility** | High Contrast Dark, High Contrast Light, Protanopia, Deuteranopia, Tritanopia |
| **Custom** | User-created (unlimited) |

### Theme Structure

```css
/* CSS Variables (HSL format) */
:root {
  /* Core */
  --primary: 340 82% 65%;
  --primary-foreground: 340 5% 95%;
  --secondary: 320 70% 55%;
  --accent: 350 90% 70%;
  
  /* Backgrounds */
  --background: 340 15% 5%;
  --foreground: 340 5% 95%;
  --card: 340 12% 8%;
  --card-foreground: 340 5% 95%;
  --muted: 340 10% 15%;
  --muted-foreground: 340 5% 65%;
  
  /* Borders & Rings */
  --border: 340 10% 20%;
  --ring: 340 82% 65%;
  
  /* Glassmorphism */
  --glass-bg: 340 12% 8% / 0.6;
  --glass-border: 340 5% 95% / 0.1;
  --glow-primary: 340 82% 65%;
  
  /* Radius & Spacing */
  --radius: 1rem;
}
```

### Theme Creation

1. **Settings → Appearance → Themes → Create Theme**
2. **Visual editor** — color pickers for all tokens
3. **Live preview** — see changes instantly
4. **Export/Import** — JSON file for sharing
5. **Extension themes** — contributed via `manifest.contributes.themes`

---

## Disk Allocation

### Storage Management

```ts
interface DiskAllocation {
  maxSizeGB: number;        // 0 = unlimited
  currentSizeGB: number;
  breakdown: {
    anime: number;
    manga: number;
    novels: number;
    cache: number;
    extensions: number;
    other: number;
  };
  autoCleanup: boolean;
  policies: CleanupPolicy[];
}

interface CleanupPolicy {
  id: string;
  name: string;
  enabled: boolean;
  trigger: 'size' | 'time' | 'manual';
  condition: {
    maxSizeGB?: number;
    olderThanDays?: number;
    watched?: boolean;
    read?: boolean;
  };
  action: 'delete' | 'archive' | 'compress';
}
```

### UI

- **Visual breakdown** — pie chart by category
- **Policy editor** — create/customize cleanup rules
- **Manual cleanup** — "Free up X GB" wizard
- **Quota warning** — notification at 80%/95%

---

## Memory Optimization (Desktop)

### Profiles

| Profile | V8 Heap Cap | Best For |
|---------|-------------|----------|
| **Low** | 1024 MB | 8GB RAM, integrated graphics |
| **Balanced** | 1536 MB | 16GB RAM (default) |
| **Unlimited** | No cap | 32GB+ RAM, dedicated GPU |

### Monitoring

- **Settings → Advanced → Memory** — real-time graph
- **Metrics:** Heap used, heap limit, GC frequency, RSS
- **"Free Memory Now"** — triggers `global.gc()`
- **Auto-profile** — switches to Low on memory pressure

---

## Configuration Files

### User Config (Encrypted)

```
<userData>/
├── config.json              # Main settings (encrypted)
├── memory-profile.json      # Memory profile
├── shortcuts.json           # Player shortcuts
├── themes/                  # Custom themes
│   └── my-theme.json
└── extensions/              # Extension configs
    └── <ext-id>.json
```

### Sync

- **Supabase** — settings synced across devices
- **Conflict resolution** — last-write-wins per key
- **Local override** — device-specific settings (marked)

---

## Keyboard Shortcuts (Global)

| Scope | Shortcuts |
|-------|-----------|
| **Global** | `Cmd/Ctrl+K` (command palette), `Cmd/Ctrl+Shift+F` (fullscreen) |
| **Navigation** | `1-4` (tabs), `G+H` (home), `G+L` (library), `G+D` (downloads) |
| **Player** | See [Playback](features/playback.md#keyboard-shortcuts) |
| **Reader** | `V` (mode), `N/B` (next/prev chapter), `T` (TTS) |
| **Search** | `/` (focus search), `Esc` (close) |

**Customizable:** Settings → Player → Shortcuts / Settings → Advanced → Global Shortcuts

---

## Command Palette

**Shortcut:** `Cmd/Ctrl+K` (or `Cmd/Ctrl+Shift+P`)

### Commands

| Category | Commands |
|----------|----------|
| **Navigation** | Go to Home, Library, Downloads, Settings, Profile |
| **Search** | Search Anime, Search Manga, Search Novels, Image Search |
| **Playback** | Play/Pause, Next Episode, Previous Episode, Theater Mode |
| **Library** | Add to Watching, Add to Reading, Rate, Progress |
| **Extensions** | Install Extension, Open Hub, Reload Extensions |
| **Developer** | Toggle Debug, Export Diagnostics, Reload App |

---

## Reset & Recovery

### Reset Options

| Reset | Scope |
|-------|-------|
| **Category** | Single settings panel (e.g., "Reset Player") |
| **All Settings** | Everything except account/connections |
| **Cache Only** | TanStack Query cache, image cache |
| **Extensions** | Disable all, clear extension data |
| **Factory** | Complete reset (like fresh install) |

### Recovery

- **Settings backup** — auto-exported daily to `backups/`
- **Import backup** — Settings → Advanced → Import
- **Safe mode** — Launch with minimal settings (hold Shift on startup)

---

## Related

- [Themes](features/settings.md#themes)
- [Player](features/playback.md)
- [Manga Reader](features/manga.md)
- [Novel Reader](features/novels.md)
- [Downloads](features/downloads.md)
- [Extensions](extensions/overview.md)