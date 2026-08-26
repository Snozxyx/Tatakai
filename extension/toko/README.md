# Toko — Unified Tatakai Extension

<p align="center">
  <img src="./icon.png" width="120" alt="Toko logo">
</p>

<p align="center">
  <strong>One extension for all your Tatakai providers.</strong><br>
  A unified <code>.kai</code> extension for anime streaming, torrent indexing, and manga providers.
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#building">Building</a> •
  <a href="#development">Development</a> •
  <a href="#provider-architecture">Architecture</a>
</p>

---

## Features

Toko is the official unified extension for the [Tatakai](https://github.com/snozxyx/tatakai) platform. It consolidates multiple providers into a single installable `.kai` package.

| Category | Providers | Capabilities |
|:--|:--:|:--|
| **Anime Stream** | 15 | Direct-stream sources |
| **Torrent** | 8 | Magnet links and torrent files |
| **Manga** | 5 | Chapters, pages, and scanlator metadata |

### Anime Streaming

- 15 direct-stream providers
- Support for single episodes
- Optional movie support
- Optional language information

### Torrent

- 8 torrent indexers
- Magnet link support
- Torrent file support
- Batch searching through a unified provider interface

### Manga

- 5 manga providers
- Chapter listing and retrieval
- Page fetching
- Scanlator metadata

---

## Building

Build Toko using pnpm:

```bash
pnpm run build:toko
