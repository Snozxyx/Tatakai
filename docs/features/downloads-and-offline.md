# Downloads & Offline

Tatakai (desktop) can download anime and manga for offline use and keep watch/read
progress in sync across devices. This is a desktop-first feature set because it
relies on native capabilities.

## Why downloads run in the main process

Request headers (referer, cookies, auth) **do not survive the IPC boundary**. A
downloader running in the renderer would lose the headers many providers require,
so download engines run in the **Electron main process** and are driven from the
renderer over IPC:

- `desktop/ipc/ipc-download-manager.cjs` + `ipc-manga-download-manager.cjs` — the
  queues.
- `desktop/ipc/ipc-library.cjs` + `ipc-manga-library.cjs` — the on-disk libraries.
- `desktop/runtime/download/` + `desktop/runtime/library/` — the engines.
- `desktop/services/auto-downloader.cjs` — automatic/queued downloads.

Downloaded media is served back to the renderer through the `tatakai-media://`
protocol so the player/reader treat local files like any other source.

## Manga offline downloads

- **Download whole series** for offline reading.
- Chapters are stored in a **Dexie `offlineChapters`** store (schema v5).
- A single **Offline Library** page lists downloaded content.
- Downloaded manga appears as rows/activity pills in the **Dynamic Island**.
- The main-process downloader preserves the provider headers the renderer would
  otherwise drop.

## Continue Watching (Netflix-style)

V6 reworked continue-watching into a cohesive, cross-device experience:

- **Resume** anywhere — progress syncs across devices.
- **Downloads** and **auto-download** stay in sync with the resume state.
- Richer **AnimeInfo** and a **release calendar** for what's next.
- Smarter **list import** so imported lists slot into the same surfaces.

Client logic lives in `src/core/download/`, the resume/activity code under
`src/core/activity/`, and the UI in `src/components/anime/` (e.g.
`ContinueWatching`, `LocalContinueWatching`).

## Offline resilience

Downloads dovetail with the app's offline behavior: `BackendStatusContext`
(tri-state health), an offline-safe route whitelist on `ProtectedRoute`, and the
`OfflineBanner` keep the app usable with no backend, while downloaded anime/manga
remain fully playable/readable. See
[../architecture/frontend.md](../architecture/frontend.md#offline--resilience) and
[../architecture/desktop.md](../architecture/desktop.md#memory--resilience).
