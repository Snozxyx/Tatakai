# Tatakai Documentation

Welcome to the official documentation for **Tatakai** — an all-in-one platform for discovering, watching, reading, tracking, and discussing anime, manga, manhwa, manhua, comics, and novels.

---

## 🚀 Quick Links

| I want to… | Start here |
|------------|------------|
| **Understand what Tatakai is** | [Overview](overview.md) |
| **Set up the project locally** | [Development Setup](development.md) |
| **Learn the architecture** | [Architecture Overview](architecture/overview.md) |
| **Build an extension** | [Extension System](extensions/overview.md) |
| **See all features** | [Features Reference](reference/features.md) |
| **Contribute to the codebase** | [Contributing](contributing.md) |
| **Report a vulnerability / read the audit** | [Security](../SECURITY.md) · [Audit](security/SECURITY_AUDIT.md) |

---

## 📚 Documentation Structure

```
docs/
├── README.md                    # This file
├── overview.md                  # Product overview & vision
├── development.md               # Local setup, build, test
├── contributing.md              # Contribution guidelines
├── architecture/
│   ├── overview.md              # System architecture (4 planes)
│   ├── frontend.md              # React app structure
│   ├── desktop.md               # Electron shell & services
│   └── backend.md               # API proxy, database, auth
├── extensions/
│   ├── overview.md              # Extension system architecture
│   ├── manifest.md              # manifest.json reference
│   ├── capabilities/
│   │   ├── sources.md           # Anime streaming sources
│   │   ├── manga.md             # Manga chapter sources
│   │   ├── custom-source.md     # Isolated read/watch verticals
│   │   ├── themes.md            # Custom themes
│   │   ├── analytics.md         # Analytics integrations
│   │   ├── ui-slots.md          # React pages & UI slots
│   │   └── services.md          # Services & platform modules
│   ├── renderer-loader.md       # How renderer bundles load
│   ├── security.md              # Trust model & permissions
│   ├── migration.md             # Migration from old format
│   └── build-first.md           # Step-by-step extension guide
├── security/
│   └── SECURITY_AUDIT.md        # Self-assessment: scope, findings (fixed & open), verification
├── features/
│   ├── playback.md              # Video player & streaming
│   ├── manga.md                 # Manga/manhwa reader
│   ├── novels.md                # Novel reader & TTS
│   ├── downloads.md             # Offline downloads
│   ├── recommendations.md       # AI recommendation engine
│   ├── community.md             # Social & community features
│   ├── search.md                # Unified search & discovery
│   └── settings.md              # Themes, customization, advanced
└── reference/
    ├── features.md              # Complete feature list (preserved)
    ├── design-guidelines.md     # UI/design system (preserved)
    └── ai-disclaimer.md         # AI usage transparency (preserved)
```

---

## 🎯 What is Tatakai?

**One app. Every story. Every device.**

Tatakai combines:
- **Anime streaming** — Advanced player with 4K upscaling, auto-skip, multi-audio, subtitles
- **Manga/Manhwa/Comics reader** — Vertical scroll, multiple modes, customizable appearance
- **Novel/Light Novel reader** — Custom fonts, backgrounds, **multi-provider TTS** (System, KittenTTS, OpenAI, ElevenLabs, Local)
- **Extension ecosystem** — Add sources, themes, analytics, UI, services without modifying core
- **Smart recommendations** — Hybrid ML engine (genre, studio, era, theme, community signals)
- **Community features** — Posts, tier lists, playlists, watch-together, profiles, leaderboards
- **Cross-platform sync** — MAL, AniList, MangaBaka integration
- **Offline access** — Download anime, manga, novels for offline viewing
- **Torrent & Debrid** — Built-in torrent engine, proxy, WARP, Real-Debrid, TorBox, AllDebrid, Premiumize

**Platforms:** Windows, macOS (sideload), Linux, Android, iOS (sideload), Smart TVs (coming)

---

## 🔧 Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19, TypeScript, Tailwind CSS, TanStack Query, Zustand |
| **Desktop** | Electron (main + sandboxed workers) |
| **Mobile** | Capacitor (Android/iOS) |
| **Backend** | TatakaiAPI proxy → Supabase (PostgreSQL + Auth + Realtime) |
| **Extensions** | Custom `.kai` format + Stremio/Seanime compatibility |
| **Media** | HLS.js, MediaChrome, WebTorrent, FFmpeg.wasm |

---

## 📖 Key Concepts

### Extension System
Most capabilities are **not hardcoded**. Extensions provide:
- **Data-driven**: Streaming/manga sources, themes, analytics (JSON + Node bundle)
- **Code-driven**: React pages, UI slots, services, modules (Renderer bundle)
- **Trust model**: Code-driven contributions only load for trusted extensions

### Two Execution Planes
1. **Main Process (Node)** — Data plane: scraping, source resolution, HTTP API
2. **Renderer (Browser)** — Code plane: React components, UI, app-privileged code

### Cross-Platform Architecture
- **Web App** → React SPA (Vite)
- **Desktop** → Electron wraps web app + adds native services (torrent, proxy, extension host)
- **Mobile** → Capacitor wraps web app + native bridges

---

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](contributing.md) for:
- Code style & conventions
- Pull request process
- Issue reporting
- Extension development guidelines

---

## 📄 License

MIT License — see [LICENSE](../LICENSE) for details.

---

## 🔗 Links

- **GitHub:** [github.com/snozxyx/Tatakai](https://github.com/snozxyx/Tatakai)
- **Website:** [tatakai.me](https://tatakai.me)
- **Discord:** [Join our community](https://discord.gg/tatakai)
- **Changelog:** [CHANGELOG.md](../CHANGELOG.md)

---

*Last updated: 2026*