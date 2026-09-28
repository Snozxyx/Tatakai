# Tatakai Documentation

Tatakai is an **extension-based otaku community and companion app** for tracking,
discovering, reading, and watching together — available as a web app, a desktop
app (Electron), and Android (Capacitor). Most advanced capabilities are delivered
through a modular **extension system** rather than being hard-coded.

> This documentation describes how the project is structured and how its major
> systems work. For the user-facing release history, see the root
> [`CHANGELOG.md`](../CHANGELOG.md) or **Settings → Changelog** in the app.

## Start here

| If you want to… | Read |
| --- | --- |
| Understand the whole system at a glance | [architecture/overview.md](architecture/overview.md) |
| Work on the web/React app | [architecture/frontend.md](architecture/frontend.md) |
| Work on the desktop (Electron) app | [architecture/desktop.md](architecture/desktop.md) |
| Understand the backend & database | [architecture/backend-and-data.md](architecture/backend-and-data.md) |
| Set up, build, and verify locally | [guides/development.md](guides/development.md) |
| Build an extension | [extension/README.md](extension/README.md) |

## Architecture

- **[overview.md](architecture/overview.md)** — the four planes (web app, desktop
  shell, API proxy, Supabase) and how they fit together. **Read this first.**
- **[frontend.md](architecture/frontend.md)** — the React app: routing, contexts,
  data fetching, the `core/` domain layer, and UI structure.
- **[desktop.md](architecture/desktop.md)** — the Electron main process, IPC
  surface, runtime hosts (torrent, proxy, extension-API host, home server), and
  background services.
- **[backend-and-data.md](architecture/backend-and-data.md)** — the TatakaiAPI
  proxy, the Supabase schema, the two id-spaces in `profiles`, the RPC-based
  write model, ranks/badges, and how migrations are handled.

## Features

Deep dives on the major product systems live in **[features/](features/README.md)**:

- [Streaming & playback](features/streaming-playback.md)
- [Manga](features/manga.md)
- [Downloads & offline](features/downloads-and-offline.md)
- [Watch2Together](features/watch-together.md)
- [Community](features/community.md)
- [Recommendations](features/recommendations.md)
- [Ranks & badges](features/ranks-and-badges.md)
- [Admin & moderation](features/admin-and-moderation.md)

## Extensions

The extension system has its own documentation set under
**[extension/](extension/README.md)** — the execution planes, the manifest
reference, per-capability guides (sources, manga, custom sources, themes,
analytics, services/modules, UI slots/pages), the renderer loader, and the
security/trust model.

## Guides & reference

- [guides/development.md](guides/development.md) — local setup, build, and
  verification (including known build/type-check caveats).
- [guides/desktop-signing.md](guides/desktop-signing.md) — desktop code signing.
- [guides/home-server.md](guides/home-server.md) — the optional self-hosted home
  server.
- [reference/design-guidelines.md](reference/design-guidelines.md) — UI/design
  conventions.
- [reference/ai-disclaimer.md](reference/ai-disclaimer.md) — AI-usage disclaimer.

## Other artifacts

- [`tatakai-architecture.html`](tatakai-architecture.html) — a generated,
  standalone visual architecture snapshot (large; open in a browser).
- [toko/](toko/) — integration notes for the Toko provider/extension work.
