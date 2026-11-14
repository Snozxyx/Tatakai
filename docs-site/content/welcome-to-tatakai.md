# Welcome to Tatakai

Welcome to the official documentation for **Tatakai** — an all-in-one platform for discovering, watching, reading, tracking, and discussing anime, manga, manhwa, manhua, comics, and novels.

## 🚀 Quick Links

| I want to…                     | Start here                                                    |
| ------------------------------ | ------------------------------------------------------------- |
| **Understand what Tatakai is** | [Product overview](/product-overview.md)                      |
| **Set up the project locally** | [Development Setup](/development-setup.md)                    |
| **Learn the architecture**     | [Architecture Overview](/architecture/system-architecture.md) |
| **Build an extension**         | [Extension System](/extensions/extension-overview.md)         |
| **See all features**           | [Features Reference](/feature-guides/product-overview.md)     |
| **Contribute to the codebase** | [Contributing](/contributing.md)                              |

## 📚 Documentation structure

* **Getting started:** Product overview, development setup, and contributing.
* **Architecture:** System, frontend, desktop, and backend documentation.
* **Extensions:** Build guides, manifest reference, capabilities, security, and migration.
* **Feature guides:** Readers, playback, discovery, community, downloads, and settings.
* **Technical reference:** Design system and project transparency.

## 🎯 What is Tatakai?

**One app. Every story. Every device.**

Tatakai combines:

* **Anime streaming** — Advanced player with 4K upscaling, auto-skip, multi-audio, subtitles
* **Manga/Manhwa/Comics reader** — Vertical scroll, multiple modes, customizable appearance
* **Novel/Light Novel reader** — Custom fonts, backgrounds, **multi-provider TTS** (System, KittenTTS, OpenAI, ElevenLabs, Local)
* **Extension ecosystem** — Add sources, themes, analytics, UI, services without modifying core
* **Smart recommendations** — Hybrid ML engine (genre, studio, era, theme, community signals)
* **Community features** — Posts, tier lists, playlists, watch-together, profiles, leaderboards
* **Cross-platform sync** — MAL, AniList, MangaBaka integration
* **Offline access** — Download anime, manga, novels for offline viewing
* **Torrent & Debrid** — Built-in torrent engine, proxy, WARP, Real-Debrid, TorBox, AllDebrid, Premiumize

**Platforms:** Windows, macOS (sideload), Linux, Android, iOS (sideload), Smart TVs (coming)

## 🔧 Tech Stack

| Layer          | Technology                                                  |
| -------------- | ----------------------------------------------------------- |
| **Frontend**   | React 19, TypeScript, Tailwind CSS, TanStack Query, Zustand |
| **Desktop**    | Electron (main + sandboxed workers)                         |
| **Mobile**     | Capacitor (Android/iOS)                                     |
| **Backend**    | TatakaiAPI proxy → Supabase (PostgreSQL + Auth + Realtime)  |
| **Extensions** | Custom `.kai` format + Stremio/Seanime compatibility        |
| **Media**      | HLS.js, MediaChrome, WebTorrent, FFmpeg.wasm                |

## 📖 Key Concepts

### Extension System

Most capabilities are **not hardcoded**. Extensions provide:

* **Data-driven**: Streaming/manga sources, themes, analytics (JSON + Node bundle)
* **Code-driven**: React pages, UI slots, services, modules (Renderer bundle)
* **Trust model**: Code-driven contributions only load for trusted extensions

### Two Execution Planes




## Main Process (Node)

Data plane: scraping, source resolution, HTTP API




## Renderer (Browser)

Code plane: React components, UI, app-privileged code



### Cross-Platform Architecture

* **Web App** → React SPA (Vite)
* **Desktop** → Electron wraps web app + adds native services (torrent, proxy, extension host)
* **Mobile** → Capacitor wraps web app + native bridges

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](/contributing.md) for:

* Code style & conventions
* Pull request process
* Issue reporting
* Extension development guidelines

## 📄 License

MIT License — see [LICENSE](https://github.com/snozxyx/Tatakai/blob/beta/LICENSE) for details.

## 🔗 Links

* **GitHub:** [github.com/snozxyx/Tatakai](https://github.com/snozxyx/Tatakai)
* **Website:** [tatakai.app](https://tatakai.app/)
* **Discord:** [Join our community](https://discord.gg/tatakai)
* **Changelog:** [CHANGELOG.md](https://github.com/snozxyx/Tatakai/blob/beta/CHANGELOG.md)

*Last updated: 2026*
