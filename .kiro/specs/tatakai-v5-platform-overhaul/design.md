# Design Document: TatakaiV5 Platform Overhaul

## Overview

This document covers the complete technical design for five interconnected feature areas of the TatakaiV5 Electron + React desktop application. The overhaul addresses: (1) a full torrent engine rewrite to fix reliability, metadata resolution, and peer-count display; (2) a Watch Page source UI redesign with per-source metadata on hover and visual type differentiation; (3) a more powerful anime name parser and catalog mapping system; (4) end-to-end fixes to the extension platform submission, review, and download workflow; and (5) a unified download system that lets users choose between HLS and torrent sources with auto-download support.

All five areas share the same Electron + React 18 + Vite + Zustand + TanStack Query + Tailwind CSS + Radix UI stack. The Electron main process (Node.js, CommonJS) hosts the torrent engine, extension sandbox, and download manager. The renderer (sandboxed Chromium) hosts all React UI. IPC is the only communication channel between them, exposed through the typed 	atakaiRuntime and electron context bridges in desktop/preload.cjs.

---

## Architecture

### High-Level Component Map

`

                          Renderer Process (React 18)                          
                                                                                
  WatchPage.tsx          AnimePage.tsx         ExtensionHub.tsx                
  (source UI redesign)   (catalog mapping)     (submission/review/download)    
                                                                             
  DownloadModal.tsx      NameParser hooks        ExtensionDetailPage.tsx        
                                                                             
                               
                                                                               
                   tatakaiRuntime / window.electron (contextBridge)             
─
                                  IPC (ipcRenderer.invoke / ipcMain.handle)

                          Main Process (Node.js / CJS)                          
                                                                                
  ipc-torrent.cjs          ipc-runtime.cjs         ipc-download-manager.cjs    
                                                                             
  TorrentFacade            ExtensionRegistry          DownloadQueue             
  TorrentSessionManager    ExtensionWorkerPool        AutoDownloader            
  CandidateDiscovery       KaiFormat                  ffmpeg / HLS              
  ReleaseParser            ExtensionSandbox                                     
  EpisodeMatcher                                                                
  StreamBridge                                                                  
─
`

### IPC Channel Map (new + modified channels)

| Channel | Direction | Purpose |
|---|---|---|
| 	orrent:search | RM | Search Nyaa for candidates |
| 	orrent:start | RM | Start torrent session (magnet or .torrent) |
| 	orrent:stop | RM | Stop and clean up session |
| 	orrent:stats | RM | Poll download stats |
| 	orrent:stream | RM | Get HTTP stream URL |
| 	orrent:resolve-metadata | RM | Resolve magnet metadata before download |
| 	orrent:preview | RM | **NEW** Get file list + sizes before starting |
| 	orrent:peers | RM | **NEW** Get real-time seeder/leecher counts |
| 	orrent:progress | MR | Push download progress events |
| extension:load | RM | Load extension into registry |
| extension:unload | RM | Unload extension |
| extension:invoke | RM | Invoke extension method |
| extension:load-kai | RM | Load .kai bundle |
| extension:get-source-code | RM | **NEW** Return bundle.js for transparency view |
| extension:submit | RM | **NEW** Submit extension to marketplace |
| extension:review-status | RM | **NEW** Poll review status |
| download:enqueue | RM | Queue HLS or torrent download |
| download:cancel | RM | Cancel active download |
| download:list | RM | List active/queued downloads |
| uto-download:subscribe | RM | Subscribe to auto-download |
| uto-download:unsubscribe | RM | Unsubscribe |
| uto-download:list | RM | List subscriptions |

---

## Area 1: Torrent Engine Overhaul

### 1.1 Current Problems

| Bug | Root Cause | Location |
|---|---|---|
| "Metadata resolution timeout" | 30s hard timeout with no retry; no DHT bootstrap; WebTorrent v2 ESM import race | session-manager.cjs:start() |
| setInterval(...).unref is not a function | WebTorrent v2 uses Node.js Timer objects; Electron's renderer-side timer polyfill strips .unref() | WebTorrent internals called from main process |
| No real-time seeder/leecher counts | 	orrent:progress event only emits 
umPeers; no split seeder/leecher | session-manager.cjs:tick() |
| No torrent preview before download | No IPC channel to inspect file list before start() | Missing |
| .exe files not blocked | No file-type filter in session start or candidate discovery | session-manager.cjs, candidate-discovery.cjs |
| .torrent file support missing | Only magnet links handled in ipc-torrent.cjs | ipc-torrent.cjs |

### 1.2 Architecture: Overhauled Torrent Engine

`mermaid
sequenceDiagram
    participant R as Renderer
    participant IPC as ipc-torrent.cjs
    participant F as TorrentFacade
    participant SM as TorrentSessionManager
    participant WT as WebTorrent Client
    participant NY as Nyaa.si RSS

    R->>IPC: torrent:search { query, episode }
    IPC->>F: search(options)
    F->>NY: GET /rss?q=...&c=1_2 + c=1_4
    NY-->>F: RSS XML (seeders, leechers, infoHash)
    F-->>R: { candidates: [...], source: 'nyaa.si' }

    R->>IPC: torrent:preview { magnet }
    IPC->>SM: preview(magnet)
    SM->>WT: client.add(magnet, { store: false })
    WT-->>SM: torrent metadata (files, sizes)
    SM-->>R: { files: [{name, size, isVideo, isExe}] }

    R->>IPC: torrent:start { magnet, episode, downloadPath }
    IPC->>SM: start(magnet, options)
    SM->>SM: blockExeFiles(torrent)
    SM->>WT: torrent.files[i].select()
    WT-->>SM: download progress events
    SM->>R: torrent:progress { seeders, leechers, ... }
`

### 1.3 Key Interfaces

`	ypescript
interface TorrentCandidate {
  title: string;
  magnet: string;
  infoHash: string;
  seeders: number;
  leechers: number;
  downloads: number;
  size?: string;
  isTrusted: boolean;
  isRemake: boolean;
  pubDate?: string;
  parsed: ParsedRelease;
  qualityScore: number;
  displayTitle: string;
  qualityBadge: string;
  source: 'nyaa.si';
}

interface TorrentPreviewResult {
  success: boolean;
  name: string;
  infoHash: string;
  totalSize: number;
  files: TorrentFileInfo[];
  hasExeFiles: boolean;
  error?: string;
}

interface TorrentFileInfo {
  name: string;
  path: string;
  size: number;
  isVideo: boolean;
  isExe: boolean;
  index: number;
}

interface TorrentProgressEvent {
  sessionId: string;
  progress: number;          // 0-100
  downloadSpeed: number;     // bytes/s
  uploadSpeed: number;       // bytes/s
  numPeers: number;
  seeders: number;           // NEW: split from numPeers
  leechers: number;          // NEW: split from numPeers
  ratio: number;
  done: boolean;
  eta: number | null;        // seconds
  name: string;
}

interface TorrentStartOptions {
  magnet?: string;
  torrentBuffer?: Buffer;    // NEW: .torrent file support
  episode?: number;
  season?: number;
  fileIndex?: number;
  downloadPath?: string;     // optional: falls back to TorrentCacheManager.getRoot() (userData/torrent_cache)
}
`

### 1.4 Bug Fixes  Detailed Design

#### Fix 1: Metadata Resolution Timeout

**Problem**: client.add(magnet, ...) fires the callback only after metadata is fetched from peers. With no active peers or DHT, this never fires and the 30s timeout triggers.

**Solution**:
1. Upgrade WebTorrent to latest stable (currently ^2.5.1  check for 2.6+ with improved DHT).
2. Add explicit DHT bootstrap nodes to the WebTorrent client constructor.
3. Implement a two-phase approach: first attempt metadata resolution with a 45s timeout; on timeout, return a partial result with metadataResolved: false and continue resolving in the background, emitting a 	orrent:metadata-ready event when complete.
4. Add tracker announce on add: pass nnounce array to client.add().

`javascript
// session-manager.cjs  _ensureClient() fix
async _ensureClient() {
    if (this._client) return;
    const { default: WebTorrent } = await import('webtorrent');
    this._client = new WebTorrent({
        dht: {
            bootstrap: [
                'router.bittorrent.com:6881',
                'dht.transmissionbt.com:6881',
                'router.utorrent.com:6881',
                'dht.aelitis.com:6881',
            ]
        },
        tracker: { announce: [] },
        maxConns: 55,
    });
    this._client.on('error', (err) => {
        this._logger.error('[Torrent] client error:', err.message);
    });
}
`

#### Fix 2: setInterval(...).unref is not a function

**Problem**: WebTorrent v2 calls .unref() on Node.js timer handles. In Electron's main process this should work, but the error suggests WebTorrent is somehow being initialized in a context where timers are browser-polyfilled.

**Solution**: Ensure WebTorrent is only ever instantiated in the main process (never imported in renderer). Add a guard in _ensureClient():

`javascript
async _ensureClient() {
    if (this._client) return;
    if (typeof process === 'undefined' || process.type === 'renderer') {
        throw new Error('TorrentSessionManager must run in the main process');
    }
    // ... rest of init
}
`

Additionally, patch the timer issue by wrapping setInterval in the main process scope before WebTorrent loads:

`javascript
// At top of session-manager.cjs, before import('webtorrent')
const _origSetInterval = global.setInterval;
global.setInterval = function patchedSetInterval(...args) {
    const timer = _origSetInterval(...args);
    if (timer && typeof timer.unref !== 'function') {
        timer.unref = () => timer;
    }
    return timer;
};
`

#### Fix 3: Real-Time Seeder/Leecher Counts

WebTorrent exposes 	orrent.numPeers but not a split seeder/leecher count. The tracker wire protocol does provide this via 	orrent._peers and tracker announce responses.

**Solution**: Parse tracker scrape data from WebTorrent's internal tracker list:

`javascript
_getSeederLeecher(torrent) {
    let seeders = 0, leechers = 0;
    // WebTorrent stores tracker info in torrent._trackers
    for (const tracker of (torrent._trackers || [])) {
        if (tracker.scrapeData) {
            seeders = Math.max(seeders, tracker.scrapeData.complete || 0);
            leechers = Math.max(leechers, tracker.scrapeData.incomplete || 0);
        }
    }
    // Fallback: use numPeers as leechers if no scrape data
    if (seeders === 0 && leechers === 0) {
        leechers = torrent.numPeers || 0;
    }
    return { seeders, leechers };
}
`

#### Fix 4: .torrent File Support

Add a new IPC handler 	orrent:start-file and extend 	orrent:start to accept a buffer:

`javascript
// ipc-torrent.cjs
ipcMain.handle('torrent:start-file', async (_event, { torrentBuffer, options }) => {
    const buf = Buffer.isBuffer(torrentBuffer)
        ? torrentBuffer
        : Buffer.from(torrentBuffer);
    return facade.startFromBuffer(buf, options || {});
});
`

#### Fix 5: Block .exe Torrents

`javascript
// session-manager.cjs  inside start() callback, before file selection
function hasExeFiles(torrent) {
    return torrent.files.some(f => /\.exe$/i.test(f.name));
}

if (hasExeFiles(torrent)) {
    this._client.remove(torrent, { destroyStore: true });
    return resolve({
        success: false,
        error: 'BLOCKED_EXE: This torrent contains .exe files and has been blocked for security.',
        blocked: true,
    });
}
`

#### Fix 6: Torrent Preview (File List Before Download)

New 	orrent:preview IPC channel that adds the magnet with { store: false } (metadata-only mode), waits for the 
eady event, returns the file list, then removes the torrent:

`javascript
async preview(magnet) {
    await this._ensureClient();
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            resolve({ success: false, error: 'preview_timeout' });
        }, 20000);

        this._client.add(magnet, { store: false }, (torrent) => {
            clearTimeout(timeout);
            const files = torrent.files.map((f, i) => ({
                name: f.name,
                path: f.path,
                size: f.length,
                isVideo: /\.(mkv|mp4|avi|m4v|ts|mov)$/i.test(f.name),
                isExe: /\.exe$/i.test(f.name),
                index: i,
            }));
            const hasExe = files.some(f => f.isExe);
            this._client.remove(torrent, { destroyStore: true });
            resolve({
                success: true,
                name: torrent.name,
                infoHash: torrent.infoHash,
                totalSize: torrent.length,
                files,
                hasExeFiles: hasExe,
            });
        });
    });
}
`

---

## Area 2: Watch Page  Source UI Redesign

### 2.1 Current Problems

| Issue | Location |
|---|---|
| Sources not categorized by dub language | WatchPage.tsx  flat server list |
| No hover metadata (dub lang, source type, quality, group, seeders/leechers) | WatchPage.tsx  server buttons have no tooltip |
| No visual differentiation by source type (HLS/Embed/Torrent) | WatchPage.tsx  all buttons look identical |
| Torrent and anime info alignment broken | WatchPage.tsx layout |
| "Continue Watch" shows placeholder image | updateLocalContinueWatching()  poster not persisted |

### 2.2 Architecture: Source UI

`mermaid
graph TD
    A[WatchPage] --> B[SourcePanel]
    B --> C[DubLanguageGroup]
    C --> D[SourceCard]
    D --> E[SourceHoverTooltip]
    D --> F[SourceTypeBadge]
    B --> G[TorrentSourceGroup]
    G --> H[TorrentSourceCard]
    H --> I[TorrentHoverTooltip]
    I --> J[SeederLeecher display]
`

### 2.3 Source Categorization Model

`	ypescript
type SourceType = 'hls' | 'embed' | 'torrent';

interface CategorizedSource {
  type: SourceType;
  url: string;
  quality: string;
  dubLanguage: string;       // e.g. "English", "Japanese", "Portuguese"
  dubLanguageCode: string;   // e.g. "en", "ja", "pt"
  sourceName: string;        // e.g. "SubsPlease", "Erai-raws"
  groupName?: string;        // release group for torrent sources
  seeders?: number;          // torrent only
  leechers?: number;         // torrent only
  providerKey: string;
  providerName: string;
  isEmbed: boolean;
  isM3U8: boolean;
  headers?: Record<string, string>;
}

interface DubLanguageGroup {
  language: string;
  languageCode: string;
  sources: CategorizedSource[];
}
`

### 2.4 Source Panel Component Design

`	ypescript
// src/components/video/SourcePanel.tsx

interface SourcePanelProps {
  sources: CategorizedSource[];
  selectedSourceKey: string | null;
  onSelectSource: (source: CategorizedSource) => void;
}

// Visual differentiation rules:
// HLS sources     bg-muted/50 text-muted-foreground, badge: "HLS" (grey)
// Embed sources   bg-primary/20 text-primary, badge: "Embed" (primary color)
// Torrent sources  bg-green-500/20 text-green-400, badge: "Torrent" (green)
`

#### Source Type Badge

`	ypescript
const SOURCE_TYPE_STYLES: Record<SourceType, { bg: string; text: string; label: string }> = {
  hls:     { bg: 'bg-muted/60',        text: 'text-muted-foreground', label: 'HLS'     },
  embed:   { bg: 'bg-primary/20',      text: 'text-primary',          label: 'Embed'   },
  torrent: { bg: 'bg-green-500/20',    text: 'text-green-400',        label: 'Torrent' },
};
`

#### Hover Tooltip Content

`	ypescript
interface SourceTooltipData {
  dubLanguage: string;
  sourceType: SourceType;
  quality: string;
  groupName?: string;
  seeders?: number;
  leechers?: number;
  providerName: string;
}
`

The tooltip renders on onMouseEnter using Radix UI Tooltip with a 200ms delay. For torrent sources, seeders/leechers are fetched from the live 	orrent:peers IPC channel if a session is active, or from the candidate metadata if not yet started.

### 2.5 Dub Language Grouping Algorithm

`	ypescript
function groupSourcesByDubLanguage(sources: CategorizedSource[]): DubLanguageGroup[] {
  const groups = new Map<string, CategorizedSource[]>();

  for (const source of sources) {
    const key = source.dubLanguageCode || 'unknown';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(source);
  }

  // Sort: Japanese first, English second, others alphabetically
  const PRIORITY: Record<string, number> = { ja: 0, en: 1 };
  return [...groups.entries()]
    .map(([code, srcs]) => ({
      language: srcs[0].dubLanguage,
      languageCode: code,
      sources: srcs,
    }))
    .sort((a, b) => {
      const pa = PRIORITY[a.languageCode] ?? 99;
      const pb = PRIORITY[b.languageCode] ?? 99;
      if (pa !== pb) return pa - pb;
      return a.language.localeCompare(b.language);
    });
}
`

### 2.6 "Continue Watch" Poster Fix

The bug is in updateLocalContinueWatching() in src/lib/localStorage.ts. The poster URL is not being passed or is being overwritten with a placeholder.

**Fix**: Ensure nimePoster is always passed from WatchPage.tsx when calling updateLocalContinueWatching, and that the function never overwrites a valid poster with an empty string:

`	ypescript
// src/lib/localStorage.ts
export function updateLocalContinueWatching(entry: ContinueWatchingEntry) {
  const existing = getLocalContinueWatching();
  const idx = existing.findIndex(e => e.episodeId === entry.episodeId);

  const merged: ContinueWatchingEntry = idx >= 0
    ? {
        ...existing[idx],
        ...entry,
        // Never overwrite a valid poster with empty/placeholder
        animePoster: entry.animePoster || existing[idx].animePoster || '',
      }
    : entry;

  // ... rest of update logic
}
`

---

## Area 3: Name Parser & Anime Catalog Mapping

### 3.1 Current State

The existing 
elease-parser.cjs is a solid anitomy-style regex parser. It handles:
- Release groups, resolution, codec, audio, source, bit depth, subtitle format
- Episode numbers (SxEx, dash-ep, range, keyword, decimal specials)
- Season extraction, batch detection, trusted group list

**Gaps identified**:
1. Alternate titles not handled (e.g. "Shingeki no Kyojin" vs "Attack on Titan")
2. Season number mapping to AniList season entries is not implemented
3. Special characters in titles cause search mismatches (e.g. Re:Zero, 86 - Eighty Six)
4. Episode ranges in batch torrents not mapped to individual episode numbers
5. uildSearchTitle() strips too aggressively  removes meaningful numbers

### 3.2 Enhanced Parser Architecture

`mermaid
graph LR
    A[Raw Filename] --> B[ReleaseParser]
    B --> C[ParsedRelease]
    C --> D[TitleNormalizer]
    D --> E[NormalizedTitle]
    E --> F[CatalogMapper]
    F --> G[AniList API]
    F --> H[Local Title Cache]
    G --> I[MappedAnime]
    H --> I
    I --> J[EpisodeMatcher]
`

### 3.3 Title Normalizer

`	ypescript
// src/core/naming/title-normalizer.ts

interface NormalizationOptions {
  stripArticles?: boolean;       // remove "The", "A", "An"
  normalizeSpecialChars?: boolean; // Re:Zero  ReZero for fuzzy match
  expandAbbreviations?: boolean;  // "S2"  "Season 2"
  removeYearSuffix?: boolean;     // "Anime (2023)"  "Anime"
}

export function normalizeTitle(title: string, opts: NormalizationOptions = {}): string {
  let t = title.trim();

  // Normalize special characters for fuzzy matching
  if (opts.normalizeSpecialChars) {
    t = t
      .replace(/[：:]/g, '')          // Re:Zero  ReZero
      .replace(/[！!]/g, '')
      .replace(/[？?]/g, '')
      .replace(/[]/g, ' ')
      .replace(/[～~]/g, ' ')
      .normalize('NFKC');             // full-width  half-width
  }

  // Strip leading articles
  if (opts.stripArticles) {
    t = t.replace(/^(The|A|An)\s+/i, '');
  }

  // Remove year suffix
  if (opts.removeYearSuffix) {
    t = t.replace(/\s*\(\d{4}\)\s*$/, '');
  }

  // Normalize whitespace
  t = t.replace(/\s+/g, ' ').trim();

  return t;
}

export function buildSearchVariants(title: string): string[] {
  const variants = new Set<string>();
  variants.add(title);
  variants.add(normalizeTitle(title, { stripArticles: true }));
  variants.add(normalizeTitle(title, { normalizeSpecialChars: true }));
  variants.add(normalizeTitle(title, { stripArticles: true, normalizeSpecialChars: true, removeYearSuffix: true }));

  // Handle "Season N"  try without season suffix for AniList lookup
  const withoutSeason = title.replace(/\s+(Season|Part|Cour)\s+\d+\s*$/i, '').trim();
  if (withoutSeason !== title) variants.add(withoutSeason);

  // Handle numeric season: "Anime 2nd Season"  "Anime"
  const withoutOrdinal = title.replace(/\s+\d+(st|nd|rd|th)\s+Season\s*$/i, '').trim();
  if (withoutOrdinal !== title) variants.add(withoutOrdinal);

  return [...variants].filter(Boolean);
}
`

### 3.4 Catalog Mapper

`	ypescript
// src/core/naming/catalog-mapper.ts

interface CatalogMappingResult {
  anilistId: number | null;
  malId: number | null;
  tatakaiId: string | null;
  matchedTitle: string;
  confidence: number;
  seasonOffset: number;   // episode number offset for multi-season series
  method: 'exact' | 'fuzzy' | 'alternate' | 'cache';
}

export async function mapParsedReleaseToAnime(
  parsed: ParsedRelease,
  hints?: { anilistId?: number; malId?: number }
): Promise<CatalogMappingResult> {
  // 1. If hints provided, use them directly
  if (hints?.anilistId) {
    return { anilistId: hints.anilistId, malId: hints.malId ?? null,
             tatakaiId: null, matchedTitle: parsed.title ?? '', confidence: 100,
             seasonOffset: 0, method: 'exact' };
  }

  // 2. Check local title cache
  const cached = await titleCache.lookup(parsed.searchTitle ?? parsed.title ?? '');
  if (cached) return { ...cached, method: 'cache' };

  // 3. Build search variants and try AniList
  const variants = buildSearchVariants(parsed.title ?? '');
  for (const variant of variants) {
    const result = await searchAniList(variant, parsed.season);
    if (result && result.confidence >= 80) {
      await titleCache.store(parsed.searchTitle ?? '', result);
      return { ...result, method: result.confidence === 100 ? 'exact' : 'fuzzy' };
    }
  }

  // 4. Try alternate titles from AniList synonyms
  const altResult = await searchAniListBySynonyms(variants);
  if (altResult) return { ...altResult, method: 'alternate' };

  return { anilistId: null, malId: null, tatakaiId: null,
           matchedTitle: parsed.title ?? '', confidence: 0, seasonOffset: 0, method: 'fuzzy' };
}
`

### 3.5 Season Number  AniList Entry Mapping

AniList models multi-season anime as separate entries. The parser extracts season: 2 from a filename like [SubsPlease] Anime S02E05, but the torrent search needs to find the correct AniList entry for Season 2.

`	ypescript
// Algorithm: Season-to-AniList-entry resolution
async function resolveSeasonEntry(
  baseAnilistId: number,
  targetSeason: number
): Promise<number | null> {
  if (targetSeason <= 1) return baseAnilistId;

  // Fetch relations from AniList
  const relations = await fetchAniListRelations(baseAnilistId);

  // Filter to SEQUEL relations, sort by season/year
  const sequels = relations
    .filter(r => r.relationType === 'SEQUEL')
    .sort((a, b) => (a.startDate?.year ?? 9999) - (b.startDate?.year ?? 9999));

  // Season 2 = first sequel, Season 3 = second sequel, etc.
  const idx = targetSeason - 2;
  return sequels[idx]?.id ?? null;
}
`

### 3.6 Edge Case Handling

| Edge Case | Handling |
|---|---|
| Re:Zero | 
ormalizeSpecialChars strips : for search, keeps original for display |
| 86 - Eighty Six | Parser extracts title as "86 - Eighty Six"; normalizer tries both "86" and "Eighty Six" as variants |
| Sword Art Online: Alicization | Colon stripped for search; "Sword Art Online Alicization" tried first |
| Overlord IV | Roman numeral "IV"  season 4; try AniList with season hint |
| Shingeki no Kyojin vs Attack on Titan | AniList synonyms search covers both; local cache stores both keys |
| Episode 18.5 (recap) | isSpecial: true; matched as special episode, not regular |
| Batch  1-12 | episodeEnd set; episode matcher selects correct file within batch |
| S00E03 (OVA/Special) | specialEpisode: 3; mapped to AniList special episode list |

---

## Area 4: Extension Platform  Full Fix & Complete Workflow

### 4.1 Current State Assessment

The extension platform has a solid foundation:
- ExtensionRegistry, ExtensionWorkerPool, ExtensionSandbox, KaiFormat are all implemented
- IPC handlers for extension:load, extension:unload, extension:invoke, extension:sideload-manifest, extension:load-kai exist
- The .kai format (ZIP with manifest.json + bundle.js + README.md + icon.png) is fully specified

**Gaps that break the end-to-end workflow**:
1. No extension:submit IPC channel  submission to marketplace is not wired
2. No extension:review-status IPC channel  review polling not implemented
3. No extension:get-source-code IPC channel  transparency view missing
4. PublishExtensionModal.tsx exists but is not connected to real IPC
5. MarketplaceModal.tsx and MarketplaceSubmitModal.tsx exist but use stub data
6. No marketplace API client in the renderer
7. Extension source code transparency view not implemented in ExtensionDetailPage

### 4.2 API Integration

All marketplace operations go through the single unified **TatakaiAPI** (`TatakaiAPI/` folder, Hono on port `4001`). In production this is `https://api.tatakai.me`; in local development it is `http://localhost:4001`. The base URL is resolved from `VITE_TATAKAI_API_URL` (already set in `.env`).

The existing API already has:
- `GET /api/v3/extensions/manifests` — list approved extensions
- `GET /api/v3/extensions/manifests/:id` — get single extension
- `POST /api/v3/admin/extensions/submit` — submit a new manifest (admin-gated)
- `POST /api/v3/admin/extensions/:id/approve` — approve
- `POST /api/v3/admin/extensions/:id/reject` — reject

**New endpoints to add to TatakaiAPI:**
- `POST /api/v3/extensions/submit` — public submission endpoint (no admin secret required; creates a `pending` draft)
- `GET /api/v3/extensions/:id/status` — poll review status for a submitted extension

### 4.3 Complete Workflow Architecture

`mermaid
sequenceDiagram
    participant Dev as Extension Developer
    participant R as Renderer (ExtensionHub)
    participant IPC as ipc-runtime.cjs
    participant API as TatakaiAPI (localhost:4001 / api.tatakai.me)
    participant Admin as Admin Review Panel

    Dev->>R: Upload .kai file via PublishExtensionModal
    R->>IPC: extension:submit { kaiBuffer, metadata }
    IPC->>API: POST /api/v3/extensions/submit (JSON manifest)
    API-->>IPC: { data: { extension_id, submission_status: 'pending' } }
    IPC-->>R: { success: true, submissionId: extension_id }

    loop Poll every 30s
        R->>IPC: extension:review-status { submissionId }
        IPC->>API: GET /api/v3/extensions/:id/status
        API-->>IPC: { data: { submission_status, main_url, updated_at } }
        IPC-->>R: { status, downloadUrl }
    end

    Admin->>API: POST /api/v3/admin/extensions/:id/approve
    API-->>R: status: 'approved', downloadUrl: main_url

    R->>IPC: extension:load-kai { kaiBuffer }
    IPC->>IPC: parseKaiFile + verifySignature
    IPC->>IPC: installKaiExtension
    IPC-->>R: { success: true, extensionId }
`

### 4.4 New IPC Handlers

#### extension:submit

`javascript
// TATAKAI_API_BASE resolves from env: process.env.VITE_TATAKAI_API_URL
// → 'http://localhost:4001/api/v3' in dev, 'https://api.tatakai.me/api/v3' in prod
ipcMain.handle('extension:submit', async (_event, { kaiBuffer, metadata }) => {
    try {
        const buf = Buffer.isBuffer(kaiBuffer) ? kaiBuffer : Buffer.from(kaiBuffer);
        // Parse and validate the .kai file before submitting
        const parsed = await parseKaiFile(buf, { skipSignatureCheck: true });
        const manifest = parsed.manifest;

        // Validate required fields
        if (!manifest.id || !manifest.name || !manifest.version || !manifest.type) {
            return { success: false, error: 'missing_required_fields' };
        }
        if (buf.length > 10 * 1024 * 1024) {
            return { success: false, error: 'bundle_too_large' };
        }

        // POST to TatakaiAPI public submission endpoint
        const response = await axios.post(
            `${TATAKAI_API_BASE}/extensions/submit`,
            {
                extension_id: manifest.id,
                name: manifest.name,
                version: manifest.version,
                type: manifest.type,
                main_url: metadata?.mainUrl || '',
                update_url: metadata?.updateUrl || null,
                description: manifest.description || '',
                permissions: manifest.permissions ?? [],
                signature: metadata?.signature || null,
                signed_by: metadata?.signedBy || null,
            },
            { timeout: 30000 }
        );

        appendAudit('extension-submit', { extensionId: manifest.id });
        return { success: true, submissionId: manifest.id, status: 'pending' };
    } catch (err) {
        if (err.response?.status === 503 || err.code === 'ECONNREFUSED') {
            return { success: false, error: 'marketplace_unavailable' };
        }
        logger.error('[Extension] Submit failed:', err.message);
        return { success: false, error: err.message };
    }
});
`

#### extension:review-status

`javascript
ipcMain.handle('extension:review-status', async (_event, { submissionId }) => {
    try {
        // GET /api/v3/extensions/:id/status from TatakaiAPI
        const response = await axios.get(
            `${TATAKAI_API_BASE}/extensions/${submissionId}/status`,
            { timeout: 10000 }
        );
        const row = response.data?.data;
        return {
            success: true,
            submissionId,
            status: row?.submission_status ?? 'pending',  // 'pending' | 'under_review' | 'approved' | 'rejected'
            notes: row?.notes || null,
            approvedAt: row?.updated_at || null,
            downloadUrl: row?.submission_status === 'approved' ? row?.main_url : null,
        };
    } catch (err) {
        return { success: false, error: err.message };
    }
});
`

#### extension:get-source-code

`javascript
ipcMain.handle('extension:get-source-code', async (_event, extensionId) => {
    try {
        const entry = registry.lookup(extensionId);
        if (!entry) return { success: false, error: 'Extension not loaded' };
        if (!fs.existsSync(entry.bundlePath)) return { success: false, error: 'Bundle not found' };

        const code = fs.readFileSync(entry.bundlePath, 'utf8');
        // Return first 50KB for display; flag if truncated
        const MAX_DISPLAY = 50 * 1024;
        return {
            success: true,
            code: code.length > MAX_DISPLAY ? code.slice(0, MAX_DISPLAY) : code,
            truncated: code.length > MAX_DISPLAY,
            totalBytes: code.length,
        };
    } catch (err) {
        return { success: false, error: err.message };
    }
});
`

### 4.5 Renderer: Marketplace API Client

```typescript
// src/core/extensions/marketplace-client.ts

// Uses the unified TatakaiAPI — same base as all other API calls.
// Dev: http://localhost:4001/api/v3  |  Prod: https://api.tatakai.me/api/v3
// VITE_TATAKAI_API_URL is already set in .env (e.g. /api/v2/hianime for the proxy path,
// but for direct API calls we use VITE_API_BASE_URL which points to https://api.tatakai.me/api/v2).
// For v3 endpoints we derive the base from VITE_BACKEND_ORIGIN + '/api/v3'.
const TATAKAI_API_V3 =
  import.meta.env.VITE_BACKEND_ORIGIN
    ? `${import.meta.env.VITE_BACKEND_ORIGIN}/api/v3`
    : 'http://localhost:4001/api/v3';

export interface MarketplaceExtension {
  id: string;           // extension_id
  name: string;
  version: string;
  type: 'torrent' | 'onlinestream' | 'custom';
  description: string | null;
  permissions: string[];
  mainUrl: string;      // main_url — the hosted bundle URL
  updateUrl?: string | null;
  signature?: string | null;
  signedBy?: string | null;
  speed?: string | null;
  accuracy?: string | null;
  regions?: string[] | null;
  nsfw?: boolean;
}

export async function fetchMarketplaceExtensions(
  filter?: { type?: string }
): Promise<MarketplaceExtension[]> {
  const res = await fetch(`${TATAKAI_API_V3}/extensions/manifests`);
  if (!res.ok) throw new Error(`TatakaiAPI error: ${res.status}`);
  const data = await res.json();
  const rows: MarketplaceExtension[] = (data.data ?? []).map((m: Record<string, unknown>) => ({
    id: m.id as string,
    name: m.name as string,
    version: m.version as string,
    type: m.type as MarketplaceExtension['type'],
    description: (m.description as string) ?? null,
    permissions: (m.permissions as string[]) ?? [],
    mainUrl: m.main as string,
    updateUrl: (m.update as string) ?? null,
    signature: (m.signature as string) ?? null,
    signedBy: (m.signedBy as string) ?? null,
  }));
  if (filter?.type) return rows.filter(r => r.type === filter.type);
  return rows;
}

// Extensions in TatakaiAPI are URL-based (main_url points to hosted bundle).
// downloadExtensionKai fetches the bundle from main_url as an ArrayBuffer.
export async function downloadExtensionKai(mainUrl: string): Promise<ArrayBuffer> {
  const res = await fetch(mainUrl);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return res.arrayBuffer();
}
```

### 4.5 Extension Source Code Transparency View

`	ypescript
// src/pages/extensions/ExtensionDetailPage.tsx  Source Code tab

function SourceCodeTab({ extensionId }: { extensionId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['extension-source', extensionId],
    queryFn: () => window.tatakaiRuntime.getExtensionSourceCode(extensionId),
    enabled: !!extensionId,
    staleTime: Infinity,
  });

  if (isLoading) return <Skeleton className="h-96" />;
  if (!data?.success) return <p className="text-muted-foreground">Source code unavailable.</p>;

  return (
    <div className="relative">
      {data.truncated && (
        <div className="mb-2 text-xs text-amber-400">
          Showing first 50 KB of {(data.totalBytes / 1024).toFixed(0)} KB
        </div>
      )}
      <pre className="bg-muted/30 rounded-lg p-4 text-xs font-mono overflow-auto max-h-[500px] whitespace-pre-wrap">
        {data.code}
      </pre>
    </div>
  );
}
`

### 4.6 Preload Bridge Additions

`javascript
// desktop/preload.cjs  additions to tatakaiRuntime
submitExtension: (kaiBuffer, metadata) =>
    ipcRenderer.invoke('extension:submit', { kaiBuffer, metadata }),
getReviewStatus: (submissionId) =>
    ipcRenderer.invoke('extension:review-status', { submissionId }),
getExtensionSourceCode: (extensionId) =>
    ipcRenderer.invoke('extension:get-source-code', extensionId),
`

---

## Data Models

### Torrent Session Entry (in-memory)

`	ypescript
interface TorrentSessionEntry {
  torrent: WebTorrent.Torrent;
  sessionId: string;
  magnet: string;
  targetFileIndex: number;
  matchResult: EpisodeMatchResult | null;
  batchInfo: BatchDetectionResult;
  startedAt: number;
  // NEW fields
  seeders: number;
  leechers: number;
  blocked: boolean;   // true if exe files were found
}
`

### Parsed Release (extended)

`	ypescript
interface ParsedRelease {
  raw: string;
  title?: string;
  searchTitle: string;
  releaseGroup?: string;
  episodeNumber?: number;
  episodeEnd?: number;
  season?: number;
  specialEpisode?: number;
  isSpecial: boolean;
  year?: number;
  resolution?: string;
  bitDepth?: string;
  codec?: string;
  videoCodec?: string;
  audioCodec?: string;
  source?: string;
  sourceTag?: string;
  remux: boolean;
  audio: string[];
  subtitleFormats: string[];
  isDualAudio: boolean;
  isHardSub: boolean;
  isBatch: boolean;
  isTrusted: boolean;
  confidence: number;
  // NEW fields
  normalizedTitle?: string;       // special-char-stripped for search
  searchVariants?: string[];      // all title variants to try
  dubLanguage?: string;           // detected dub language
}
`

### Download Queue Entry

`	ypescript
interface DownloadQueueEntry {
  episodeId: string;
  animeName: string;
  episodeNumber: number;
  sourceType: 'hls' | 'torrent';
  // HLS fields
  url?: string;
  headers?: Record<string, string>;
  // Torrent fields
  magnet?: string;
  torrentBuffer?: ArrayBuffer;
  // Common
  // Resolved in order: (1) explicit field, (2) localStorage 'tatakai_download_path' (set in app setup),
  // (3) DownloadStorageManager.defaultLibraryRoot() → app.getPath('videos')/Tatakai
  downloadPath: string;
  posterUrl?: string;
  subtitles?: SubtitleDownloadSpec[];
  addedAt: number;
  status: 'queued' | 'active' | 'completed' | 'failed';
}
`

### Extension Submission

`	ypescript
interface ExtensionSubmission {
  submissionId: string;
  extensionId: string;
  status: 'pending' | 'in_review' | 'approved' | 'rejected';
  submittedAt: string;
  reviewedAt?: string;
  notes?: string;
  downloadUrl?: string;   // set when approved
}
`

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Torrent metadata timeout (45s) | Return { success: false, error: 'metadata_timeout', retryable: true }; renderer shows retry button |
| .exe files in torrent | Block immediately; return { blocked: true, error: 'BLOCKED_EXE' }; show security warning |
| Torrent preview timeout (20s) | Return { success: false, error: 'preview_timeout' }; allow user to start without preview |
| setInterval.unref error | Patched at main process startup; logged as warning if still occurs |
| Source type detection fails | Default to hls type; log warning |
| Dub language detection fails | Group under "Unknown" language; still display source |
| "Continue Watch" poster missing | Fall back to nimeData?.info.poster; never show placeholder |
| AniList title mapping fails | Return confidence: 0; use raw parsed title for search |
| Extension submission API unreachable | Return { success: false, error: 'marketplace_unavailable' }; show retry |
| Extension source code > 50KB | Truncate with 	runcated: true; show "View full source on GitHub" link |
| Auto-download HLS source unavailable | Fall back to torrent; log fallback event |
| Auto-download both sources unavailable | Skip episode; retry on next poll cycle |
| Torrent download .exe detected mid-session | Stop session; delete partial files; emit 	orrent:blocked event |

---

## Testing Strategy

### Unit Testing

- 
elease-parser.cjs: property-based tests with fast-check generating random filenames; verify no crash, confidence in [0,100]
- 	itle-normalizer.ts: table-driven tests for all edge cases (Re:Zero, 86, SAO, etc.)
- catalog-mapper.ts: mock AniList API; verify variant search order and cache behavior
- episode-matcher.cjs: property tests verifying episode match confidence monotonicity
- extension-sandbox.cjs: verify blocked globals are undefined in worker context
- kai-format.cjs: test with valid/invalid ZIP, missing fields, oversized bundle

### Property-Based Tests

**Property 1: Parser never crashes**
For any string input to parseReleaseName(), the function must return a valid ParsedRelease object with confidence in [0, 100] and never throw.

**Property 2: Title normalizer idempotency**
For any title string 	, 
ormalizeTitle(normalizeTitle(t, opts), opts) must equal 
ormalizeTitle(t, opts).

**Property 3: Source grouping completeness**
For any array of CategorizedSource objects, groupSourcesByDubLanguage() must return groups whose total source count equals the input array length  no sources are lost or duplicated.

**Property 4: Torrent exe blocking**
For any torrent whose file list contains at least one .exe file, start() must return { success: false, blocked: true } and must not create a session entry.

**Property 5: Download queue ordering**
For any sequence of enqueue operations with ctiveDownloads.size < 3, downloads must start immediately. When ctiveDownloads.size >= 3, new downloads must be queued and start only after an active download completes.

### Integration Testing

- Full torrent search  preview  start  stream flow with a known test magnet
- Extension submit  review-status poll  load-kai  invoke flow with a test extension
- Auto-download subscribe  checkFeeds  download enqueue flow with mocked API

---

## Security Considerations

1. **Torrent .exe blocking**: Enforced in session-manager.cjs before any file is selected or downloaded. Cannot be bypassed by the renderer.
2. **Extension source code display**: The extension:get-source-code handler only reads from the installed bundle path  it cannot read arbitrary files. The path is constructed from pp.getPath('userData') + the extension ID, which is validated as a registry entry.
3. **Marketplace submission**: The .kai file is parsed and validated before submission. The bundle size limit (10 MB) is enforced. No code is executed during submission.
4. **Auto-download URL resolution**: URLs fetched from the Tatakai API are passed directly to ffmpeg. The protocol_whitelist in ffmpeg input options restricts to ile,http,https,tcp,tls,crypto  no arbitrary protocol execution.
5. **Torrent download path**: The `downloadPath` in every `download:enqueue` call is resolved using the existing path hierarchy: (1) the explicit `downloadPath` field if provided, (2) `tatakai_download_path` from the renderer's `localStorage` (set during the app's initial setup flow), (3) `DownloadStorageManager.defaultLibraryRoot()` → `app.getPath('videos')/Tatakai` as the final fallback. For torrent streaming sessions that do not persist to the library, the path falls back to `TorrentCacheManager.getRoot()` → `app.getPath('userData')/torrent_cache`. Path traversal sequences (`../`) are rejected at the IPC boundary before any file operation.
6. **Extension worker isolation**: All existing sandbox properties from the extension platform spec are preserved. The new extension:get-source-code channel is read-only and does not execute code.

---

## Performance Considerations

1. **Torrent metadata resolution**: The two-phase approach (return partial result immediately, resolve metadata in background) prevents the UI from blocking for 45 seconds.
2. **Source panel rendering**: The SourcePanel component uses useMemo to memoize grouped sources. Re-renders only when the source list changes.
3. **Hover tooltip data**: Seeder/leecher counts for torrent sources are fetched lazily on hover, not on mount. A 200ms debounce prevents excessive IPC calls.
4. **Title cache**: The CatalogMapper uses an in-memory LRU cache (max 500 entries) backed by cache:write IPC for persistence across sessions.
5. **Auto-download polling**: The 30-minute interval is appropriate for episode release cadence. The initial 30-second delay prevents startup contention.

---

## Dependencies

### Main Process (desktop/package.json)

| Package | Current | Required Change |
|---|---|---|
| webtorrent | ^2.5.1 | Upgrade to latest ^2.x for DHT improvements |
| xios | ^1.13.4 | No change |
| jszip | ^3.10.1 | No change |
| orm-data | Not present | **Add** for marketplace submission multipart upload |

### Renderer (package.json root)

| Package | Purpose |
|---|---|
| @tanstack/react-virtual | Already present (virtualized grids) |
| @radix-ui/react-tooltip | Already present (hover tooltips) |
| No new dependencies required | All new UI uses existing stack |

---

## Correctness Properties

### Property 1: Parser never crashes on arbitrary input

*For any* string passed to parseReleaseName(), the function must return a valid ParsedRelease object with confidence in the range [0, 100] and must never throw an exception.

**Validates**: Area 3  Name Parser robustness

---

### Property 2: Title normalizer idempotency

*For any* title string 	 and any NormalizationOptions object opts, applying 
ormalizeTitle twice must produce the same result as applying it once: 
ormalizeTitle(normalizeTitle(t, opts), opts) === normalizeTitle(t, opts).

**Validates**: Area 3  Title normalization correctness

---

### Property 3: Source grouping completeness

*For any* array of CategorizedSource objects, groupSourcesByDubLanguage() must return groups whose total source count equals the input array length  no sources are lost or duplicated during grouping.

**Validates**: Area 2  Source UI grouping

---

### Property 4: Torrent exe blocking is unconditional

*For any* torrent whose file list contains at least one file with a .exe extension, TorrentSessionManager.start() must return { success: false, blocked: true } and must not create a session entry in 	his._sessions.

**Validates**: Area 1  Security protection

---

### Property 5: Download queue ordering

*For any* sequence of download:enqueue calls, if ctiveDownloads.size < 3 at enqueue time, the download must start immediately. If ctiveDownloads.size >= 3, the download must be added to downloadQueue and must start only after an active download completes  the queue must never exceed 3 concurrent active downloads.

**Validates**: Area 5  Download system concurrency

---

### Property 6: Torrent preview does not persist state

*For any* magnet link passed to 	orrent:preview, the operation must not create a session entry in TorrentSessionManager._sessions and must remove the torrent from the WebTorrent client before returning.

**Validates**: Area 1  Preview isolation

---

### Property 7: Continue Watch poster preservation

*For any* call to updateLocalContinueWatching() where the existing entry has a non-empty nimePoster, the resulting stored entry must have a non-empty nimePoster  a valid poster must never be overwritten with an empty string or placeholder.

**Validates**: Area 2  Continue Watch fix

---

### Property 8: Extension source code read-only

*For any* call to extension:get-source-code, the handler must only read from the path <userData>/extensions/<extensionId>/bundle.js and must never write to disk, execute code, or access paths outside the extensions directory.

**Validates**: Area 4  Extension transparency security

---

### Property 9: Auto-download episode advancement

*For any* successful auto-download of episode N for a subscribed anime, the subscription's 
extEpisode field must be updated to N+1 before the next poll cycle  the same episode must never be downloaded twice for the same subscription.

**Validates**: Area 5  Auto-download correctness

---

### Property 10: Seeder/leecher counts are non-negative

*For any* torrent session, the seeders and leechers values emitted in 	orrent:progress events must be non-negative integers. A value of 0 is valid; negative values are never emitted.

**Validates**: Area 1  Real-time peer counts

---

### Property 11: Catalog mapping confidence monotonicity

*For any* ParsedRelease with a non-null 	itle, the confidence returned by mapParsedReleaseToAnime() when using an exact AniList ID hint must be greater than or equal to the confidence returned without a hint.

**Validates**: Area 3  Catalog mapping quality

---

### Property 12: Extension submission validation gates upload

*For any* .kai buffer passed to extension:submit, the handler must parse and validate the manifest before making any network request. If the manifest is missing required fields, the handler must return { success: false } without contacting the marketplace API.

**Validates**: Area 4  Extension submission safety

