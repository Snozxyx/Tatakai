# Product Overview

## Vision

**Tatakai** (戦い — "battle" in Japanese) is an **all-in-one platform** for anime, manga, and novel enthusiasts. We believe fans shouldn't need five different apps to track, watch, read, discover, and discuss their favorite stories.

> **One app. Every story. Every device.**

---

## Core Philosophy

| Principle | What it means |
|-----------|---------------|
| **Extension-first** | Core features live in extensions, not the main app. Anyone can add sources, themes, or UI. |
| **Local-first** | Your data, your device. Optional cloud sync via MAL/AniList/MangaBaka — never required. |
| **Privacy-respecting** | No telemetry, no forced accounts, no tracking. You control what leaves your device. |
| **Cross-platform parity** | Same features on web, desktop, and mobile. No "lite" versions. |
| **Community-driven** | Built in the open. Extensions, translations, and features come from users. |

---

## Supported Content

| Category | Formats |
|----------|---------|
| **Anime** | TV Series, Movies, OVAs, ONAs, Specials |
| **Manga** | Manga, Manhwa, Manhua, Comics, Webtoons |
| **Novels** | Web Novels, Light Novels |
| **Sources** | Direct Streams (HLS/MP4), Embedded Players, Torrents (magnet/torrent files) |

---

## Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| **Windows** | ✅ Supported | Native installer, auto-updates |
| **macOS** | ✅ Supported | Sideload only (no notarization) |
| **Linux** | ✅ Supported | AppImage, Flatpak, Snap |
| **Android** | ✅ Supported | Play Store + direct APK |
| **iOS** | ✅ Supported | Sideload only (AltStore, TrollStore) |
| **Smart TVs** | ✅ Supported | Android TV, tvOS targets |
| **Web** | ✅ Supported | Connect with the [Tatakai Server] |


---

## Key Differentiators

### 🎬 Advanced Video Player
- 4K AI upscaling (shader-based)
- Adaptive quality switching
- Multi-audio tracks + stable volume
- Auto-skip OP/ED/recaps (community + AI)
- Theater/Ambient modes
- External player handoff (MPV, VLC, IINA)

### 📖 Unified Reading Experience
- **Manga**: Vertical scroll, webtoon mode, spread view, custom backgrounds
- **Novels**: Font families, sizes, line height, themes, **5 TTS engines**

### 🧩 True Extension Ecosystem
- **Native `.kai` extensions** — Full API access (sources, UI, services, themes)
- **Stremio compatibility** — HTTP/JSON addons (stream, catalog, meta, subtitles)
- **Seanime compatibility** — JS/TS providers (streaming, manga, torrent, custom-source)
- Multiple extensions run simultaneously with priority ordering

### 🤖 Hybrid Recommendation Engine
Not a wrapper — a custom ML pipeline analyzing:
- Genre/Studio/Era/Theme fit
- Community engagement signals
- Personal history weighting
- **Interactive 3D recommendation graph** for visual discovery

### 👥 Community & Social
- Posts (text, images, GIFs, playlists, tier lists)
- Watch Together (96% sync, shared controls)
- Profiles with stats, badges, ranks, favorites
- Follow system, leaderboards, notifications

### 🌐 Networking & Offline
- Built-in torrent client (WebTorrent + native)
- Integrated proxy + Cloudflare WARP
- **4 Debrid services**: Real-Debrid, TorBox, AllDebrid, Premiumize
- Full offline downloads (anime episodes, manga chapters, novels)

---

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│                      USER INTERFACES                        │
│  Web (React SPA)  │  Desktop (Electron)  │  Mobile (Capacitor)  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     EXTENSION HOST                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Extension A │  │  Extension B │  │  Extension N ... │  │
│  │  (Node bundle│  │  (Node bundle│  │  (Renderer bundle)│  │
│  │  + renderer) │  │  + renderer) │  │                  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
       ┌──────────┐   ┌─────────────┐  ┌────────────┐
       │ Supabase │   │  Torrent/   │  │  External  │
       │ (Auth,   │   │  Proxy/     │  │  APIs      │
       │  DB,     │   │  Debrid/    │  │  (AniList, │
       │  Realtime)│   │  WARP       │  │  MAL, etc) │
       └──────────┘   └─────────────┘  └────────────┘
```

**Four Planes:**
1. **Web App** — React SPA, works standalone
2. **Desktop Shell** — Electron, native integrations, extension host
3. **API Proxy** — TatakaiAPI (rate limiting, caching, auth)
4. **Data Layer** — Supabase (PostgreSQL, Auth, Realtime, Storage)

---

## Extension Ecosystem

| Type | Examples | Plane |
|------|----------|-------|
| **Streaming Sources** | HiAnime, Gogoanime, 9anime mirrors | Node (data) |
| **Manga Sources** | MangaDex, MangaKakalot, ComicK | Node (data) |
| **Custom Sources** | Isolated read/watch verticals (e.g., "Webtoon XYZ") | Node (data) |
| **Themes** | Custom color schemes, CSS variables | Data or Code |
| **Analytics** | Plausible, Umami, custom endpoints | Data or Code |
| **UI Pages/Slots** | Custom watch page, settings panels, sidebar items | Renderer (code) |
| **Services/Modules** | Background sync, download managers, notify hooks | Renderer (code) |

> **Trust Model:** Code-driven contributions (React UI, services) only load for **trusted extensions**. Data-driven works for all installed extensions.

---

## Getting Started

| Path | Document |
|------|----------|
| **Install & Run** | [Development Setup](development.md) |
| **Architecture Deep Dive** | [Architecture Overview](architecture/overview.md) |
| **Build an Extension** | [Extension System](extensions/overview.md) |
| **All Features** | [Features Reference](reference/features.md) |

---

## Project Status

| Area | Status |
|------|--------|
| Core App (Web/Desktop/Android) | ✅ Stable |
| Extension System (Native + Stremio ) | ✅ Stable |
| Seanime Compatibility |💚 Beta |
| Aniyomi/Mihon Compatibility |💚 Beta |
| Cloudstream Compatibility |💚 Beta |
| iOS / Smart TV | 💚 Beta |
| Discord Integration | 🚧 Planned |
| Home Server (Self-hosted) | ✅ Available |

---

## Community & Support

- **GitHub Issues** — Bugs, feature requests
- **GitHub Discussions** — Questions, ideas, showcase
- **Discord** — Real-time chat, beta announcements
- **Documentation** — This site, kept in sync with code

---

*Tatakai is free, open-source (MIT), and built by [Snozxyx](https://github.com/snozxyx) with community contributions.*