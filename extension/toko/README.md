# Toko — Unified Tatakai Extension

Toko is the official unified extension for the [Tatakai](https://github.com/tatakai) platform. It consolidates all anime direct-stream sources, torrent indexers, and manga chapter providers into a single installable `.kai` package.

## Capabilities

- **Anime Stream** — 15 direct-stream providers (A1-port, A2-port, and net-new)
- **Torrent** — 8 torrent indexers with magnet link and torrent file support
- **Manga** — 5 manga providers with chapter/page fetching and scanlator metadata
- **Preview** — Random-timestamp hover/detail video previews for anime cards
- **Website-first Indexing** — Episode and chapter counts sourced directly from provider websites

## Building

```bash
pnpm run build:toko
# or
npx tsx extension/toko/build.ts
```

This produces `extension/toko/dist/toko.kai` ready for installation.

## Directory Structure

```
extension/toko/
  manifest.json          — Extension manifest (id, type, permissions, capabilities)
  README.md              — This file
  icon.png               — Extension icon
  src/
    index.ts             — TokoBundleClass (default export)
    types.ts             — Shared type definitions
    utils/
      quality.ts         — normalizeQuality(), detectSourceType()
      timeout.ts         — withProviderTimeout()
    providers/
      stream/            — Direct-stream provider adapters
      torrent/           — Torrent provider adapters
      manga/             — Manga provider adapters
  build.ts               — esbuild bundle + zip script
  dist/
    bundle.js            — Compiled bundle (generated)
    toko.kai             — Installable .kai package (generated)
```

## Development

Provider adapters live in `src/providers/`. Each adapter exports a typed provider interface defined in `src/types.ts`.

Stream adapters implement `StreamProvider` (required: `single()`; optional: `movie()`, `getLanguages()`).
Torrent adapters implement `TorrentProvider` (required: `batch()`).
Manga adapters implement `MangaProvider` (required: `getChapters()`, `getPages()`).
