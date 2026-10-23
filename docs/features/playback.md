# Video Player & Streaming

Tatakai's video player is a highly customizable, feature-rich player built on **MediaChrome** + **HLS.js** with extensive keyboard shortcuts, multi-audio/subtitle support, and advanced playback controls.

---

## Architecture

```
VideoPlayer (React)
├── MediaChrome (UI: controls, menus, fullscreen)
├── HLS.js (HLS/DASH streaming)
├── Custom hooks (state, shortcuts, quality, audio, subtitles)
└── Extension integration (source resolution, proxy)
```

**Key Files:**
- `src/features/player/components/VideoPlayer.tsx`
- `src/features/player/hooks/useVideoPlayer.ts`
- `src/features/player/hooks/usePlayerShortcuts.ts`
- `src/hooks/usePreviewSource.ts`

---

## Supported Formats

| Format | Engine | Notes |
|--------|--------|-------|
| **HLS (.m3u8)** | HLS.js | Primary streaming format |
| **MP4/WebM/MKV** | Native HTML5 | Direct playback |
| **DASH (.mpd)** | HLS.js (dash.js) | Limited support |
| **Torrent (magnet)** | WebTorrent + native | Streamed via local proxy |
| **Embed (iframe)** | MediaChrome embed | Third-party players |

---

## Core Features

### Playback Controls

| Feature | Implementation |
|---------|----------------|
| **Play/Pause** | Space, K |
| **Seek** | ←/→ (10s), Shift+←/→ (30s), J/L (10s) |
| **Speed** | 0.5x – 4x (,[ / ].] keys) |
| **Volume** | ↑/↓, M (mute) |
| **Fullscreen** | F, Double-click |
| **Theater Mode** | T (dim background) |
| **Ambient Mode** | A (edge glow from video) |
| **PIP** | P (Picture-in-Picture) |

### Quality & Audio

```ts
// Quality selector (auto + manual)
const qualities = ['auto', '2160p', '1440p', '1080p', '720p', '480p', '360p'];

// Audio track selector (multi-language)
interface AudioTrack {
  id: number;
  label: string;        // "Japanese", "English Dub"
  language: string;     // BCP-47: "ja", "en"
  isDub: boolean;
}

// Subtitle track selector
interface SubtitleTrack {
  id: number;
  label: string;        // "English", "Japanese"
  language: string;     // BCP-47
  default: boolean;
  url: string;          // Proxied via localProxy
}
```

### Auto-Skip

| Type | Detection | Action |
|------|-----------|--------|
| **Opening** | Community timestamps + AI | Auto-seek past |
| **Ending** | Community timestamps + AI | Auto-seek past / next episode |
| **Recap** | Community timestamps | Auto-seek past |

**Settings:** Per-show toggle, global enable/disable, custom skip markers.

### Subtitle Features

- **Custom fonts** (upload .ttf/.otf)
- **Styling:** Size, color, outline, shadow, background
- **Sync:** Positive/negative delay (±10s)
- **External:** Load .srt/.vtt/.ass from file
- **AI-generated:** Whisper.cpp integration (desktop)

---

## Source Resolution

### Flow

```
User opens /watch/:animeId/:episodeId
        │
        ▼
useEpisodeSources(animeId, episode)  →  TanStack Query
        │
        ▼
ExtensionRegistry.resolveSources()  →  Fans out to ALL extensions with `sources` capability
        │
        ▼
Each extension (Node bundle) → sourcesAll(opts, onChunk)
        │
        ▼
Host aggregates → normalizeSource() → applyProxy()
        │
        ▼
Returns SourceResult[] (HLS, MP4, torrent, embed)
        │
        ▼
VideoPlayer consumes sources → MediaChrome + HLS.js
```

### Source Panel (Intelligent Grouping)

Sources grouped by:
1. **Language** (🇯🇵 Japanese, 🇬🇧 English Dub, 🇮🇳 Hindi Dub, etc.)
2. **Type** (HLS, MP4, Torrent, Embed)
3. **Server/Provider** (quality ladder per server)

---

## Advanced Features

### Stable Volume / Normalization

- **Web Audio API** compressor for consistent loudness
- Per-source volume memory
- `AudioContext` with `DynamicsCompressorNode`

### Next-Episode Preview

- Preloads next episode sources in background
- Shows preview thumbnail on hover (next episode button)
- Seamless transition with `autoPlayNext`

### Sleep Timer

- 15/30/45/60/90/120 min or custom
- Pauses playback, optionally closes player
- Persists across sessions

### Screenshot Capture

- `S` key or control button
- Saves current frame as PNG
- Includes subtitles if visible

### External Player Handoff

```ts
// Supported players
const externalPlayers = {
  mpv: 'mpv -- "{url}"',
  vlc: 'vlc "{url}"',
  iina: 'open -a IINA "{url}"',
  custom: 'user-defined command',
};
```

**Passes:** URL, headers (via local proxy), subtitles, audio track.

---

## Keyboard Shortcuts (Full List)

| Key | Action |
|-----|--------|
| `Space` / `K` | Play/Pause |
| `←` / `J` | Seek -10s |
| `→` / `L` | Seek +10s |
| `Shift+←` | Seek -30s |
| `Shift+→` | Seek +30s |
| `↑` | Volume +5% |
| `↓` | Volume -5% |
| `M` | Mute/Unmute |
| `F` | Fullscreen |
| `T` | Theater Mode |
| `A` | Ambient Mode |
| `P` | Picture-in-Picture |
| `,` / `<` | Speed -0.1x |
| `.` / `>` | Speed +0.1x |
| `S` | Screenshot |
| `C` | Toggle Subtitles |
| `V` | Toggle Audio Track |
| `Q` | Toggle Quality Menu |
| `N` | Next Episode |
| `B` | Previous Episode |
| `1-9` | Seek to 10%-90% |
| `0` | Seek to start |
| `Home` | Seek to start |
| `End` | Seek to end |

**Customizable** in Settings → Player → Shortcuts.

---

## Mobile & TV

| Platform | Adaptations |
|----------|-------------|
| **Android** | Touch gestures (swipe seek, pinch zoom), hardware back button |
| **iOS** | WebKit inline playback, AirPlay support |
| **Android TV** | D-pad navigation, leanback UI, voice search |
| **Web** | Full keyboard + mouse |

---

## Settings (Settings → Player)

| Category | Options |
|----------|---------|
| **Playback** | Auto-play next, auto-skip, sleep timer, preview next |
| **Quality** | Default quality, max quality, adaptive switching |
| **Audio** | Preferred language order, normalize volume |
| **Subtitles** | Preferred language, font, size, color, sync offset |
| **Appearance** | Theater mode default, ambient mode, controls timeout |
| **Shortcuts** | Remap all keys, export/import profile |
| **Advanced** | HLS.js config, buffer settings, debug logging |

---

## Integration Points

### Extension Sources

```ts
// Hook used by WatchPage
const { data: sources } = useEpisodeSources(animeId, episode);

// Sources already normalized, proxied, categorized
// categories: byLanguage, byType
```

### Download Integration

```ts
// From player context menu
const downloadEpisode = async (source: SourceResult) => {
  await downloadManager.queue({
    type: 'anime',
    sourceId: source.source,
    url: source.url,
    headers: source.headers,
    quality: source.quality,
    subtitles: source.subtitles,
  });
};
```

### Watch Together

```ts
// Sync state shared via Supabase Realtime
interface WatchTogetherState {
  timestamp: number;
  playing: boolean;
  speed: number;
  quality: string;
  audioTrack: number;
  subtitleTrack: number;
}
```

---

## Performance

| Optimization | Implementation |
|--------------|----------------|
| **Lazy load** | HLS.js loaded only when HLS source selected |
| **Buffer management** | Configurable max buffer, auto-cleanup |
| **Memory** | `MediaSource` cleanup on unmount |
| **Preload** | Next episode sources prefetched |
| **Web Workers** | HLS.js transmuxer in worker (optional) |

---

## Debugging

### DevTools Panel

Settings → Player → Advanced → "Open Debug Panel"

Shows:
- Current source + quality + audio + subtitles
- HLS.js stats (bitrate, buffer, dropped frames)
- Buffer health, bandwidth estimate
- Source resolution timeline

### Console Logging

```ts
// Enable debug
localStorage.setItem('debug:player', 'true');

// Logs: [Player] quality change, [Player] source switch, [Player] buffer stall
```

---

## Related

- [Manga Reader](features/manga.md)
- [Novel Reader](features/novels.md)
- [Downloads](features/downloads.md)
- [Watch Together](features/community.md#watch-together)
- [Extension Sources](extensions/capabilities/sources.md)