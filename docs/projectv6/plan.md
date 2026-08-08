# Tatakai Comprehensive Architecture & Migration Master Plan

**Version:** 2.0  
**Date:** 2026  
**Owner:** Snozxyx  
**Scope:** SeaAnime Comparative Analysis + Shiru Inspiration + Country Torrent Legality + Data Migration + TatakaiAPI Integration

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Codebase Audit](#2-codebase-audit)
3. [Metadata Strategy: AniList Primary + Jikan Fallback](#3-metadata-strategy-anilist-primary--jikan-fallback)
4. [Shiru Inspiration & Adoptable Patterns](#4-shiru-inspiration--adoptable-patterns)
5. [Extension Local Scraping Architecture](#5-extension-local-scraping-architecture)
6. [1.1.1.1 WARP Network Tunnel Integration](#6-1111-warp-network-tunnel-integration)
7. [Country Torrent Legality System (196 Countries)](#7-country-torrent-legality-system-196-countries)
8. [Data Migration Plan](#8-data-migration-plan)
9. [Security Hardening (Phase 0)](#9-security-hardening-phase-0)
10. [Phased Implementation Roadmap](#10-phased-implementation-roadmap)
11. [Target Architecture](#11-target-architecture)
12. [API Contract Evolution](#12-api-contract-evolution)
13. [Core Module Specifications](#13-core-module-specifications)
14. [Mapping Optimization Strategy](#14-mapping-optimization-strategy)
15. [No-Regression Guardrails](#15-no-regression-guardrails)
16. [Appendices](#16-appendices)

---

## 1. Executive Summary

### The Core Insight

Tatakai should adopt **SeaAnime's modular architecture** (torrent lifecycle, playback core, local runtime) and **Shiru's AniList-first metadata model** (Web Worker extensions, anitomyscript parsing, per-series subtitle memory, dub-first tracking) while keeping Tatakai's identity intact.

### Key Decisions

| Decision | Rationale |
|----------|-----------|
| **AniList primary, Jikan fallback** | AniList has the richest GraphQL API for anime metadata. Jikan (MyAnimeList API) serves as a reliable fallback for rate limits, outages, or missing data. |
| **Shiru-style extension system** | Web Worker isolation + AbstractSource pattern + manifest-based extensions are safer than unrestricted client-side execution. |
| **anitomyscript for torrent parsing** | Battle-tested anime filename parser. Exposed to extensions for consistent release metadata extraction. |
| **Extension local scraping** | Extensions scrape directly from user's device via sandboxed Web Workers. Bypasses server IP blocks, reduces server costs, improves resilience. |
| **1.1.1.1 WARP tunnel** | Built-in DNS-over-HTTPS + optional Cloudflare proxy. Bypasses geo-blocks, ISP DNS poisoning, and IP-based rate limits. |
| **Country torrent legality gating** | 196-country policy table. VPN prompt for banned jurisdictions. Admin-owned, user-respected. |
| **Tatakai Content Graph** | Internal catalog with Tatakai IDs. Scrapers only for watch/source resolution, never for browsing. |
| **Mapper pipeline internalization** | Ingest `dev/anime-mapper` outputs into Tatakai-owned tables. Remove hot-path external dependency. |

### What Tatakai Becomes

- **Browsing:** AniList/Jikan-powered, zero scraper dependence
- **Watch/Source Resolution:** Mapped providers + **local scraping extensions** + torrent extensions
- **Network:** **1.1.1.1 DoH always on** + **WARP proxy when needed** for geo-block bypass
- **Torrent:** Desktop-only, country-policy-gated, first-party lifecycle
- **Extensions:** Moderated, sandboxed, signed, revocable, **can scrape locally with domain permissions**
- **Player:** Same UI shell, modular core with source adapters

---

## 2. Codebase Audit

### 2.1 Frontend (`snozxyx/tatakai`)

| Aspect | Current State |
|--------|---------------|
| Framework | React 18.2 + Vite + Tailwind CSS |
| Routing | React Router DOM v6 |
| State | Zustand |
| HTTP | Axios with interceptors |
| Providers | 12+ provider fanout (Gogo, Zoro, AniWave, etc.) |
| Player | Custom HLS-based with subtitle, PiP, screenshot, offline |
| Auth | Supabase Auth |
| Community | Comments, forum, profiles, marketplace, custom sources |
| Mobile | Capacitor |
| Desktop | Electron (security issues found) |
| Themes | 25+ themes, Lite Mode |
| Dubs | 13 languages |
| Servers | 30+ server options |
| Integrations | MAL sync, AniList sync, Trace.moe search, ML recommendations |

### 2.2 API (`snozxyx/tatakaiapi`)

| Aspect | Current State |
|--------|---------------|
| Framework | Hono (Node.js) |
| Scrapers | cheerio, axios, puppeteer |
| Proxy | Multiple proxy routes for media delivery |
| Providers | Centralized provider orchestration |
| Database | Supabase (PostgreSQL) |

### 2.3 Critical Security Issues Found

**File:** `desktop/main.cjs`

```javascript
// CURRENT (INSECURE)
webPreferences: {
  nodeIntegration: true,
  contextIsolation: false,
  webSecurity: false,           // CRITICAL: Allows mixed content, CORS bypass
  sandbox: false,               // CRITICAL: No renderer sandbox
  allowRunningInsecureContent: true,  // CRITICAL: Allows HTTP content on HTTPS
  webviewTag: true,             // CRITICAL: Enables webview with full privileges
}
```

**Impact:** With torrent execution, extension loading, and local runtime planned, these settings create a **critical attack surface**. Must be fixed in Phase 0.

---

## 3. Metadata Strategy: AniList Primary + Jikan Fallback

### 3.1 Architecture Principle

```
┌─────────────────────────────────────────────────────────────┐
│                    BROWSING SURFACES                        │
│  Home │ Search │ Trending │ Genres │ Seasonal │ Favorites  │
└──────────────────────────┬──────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              │                         │
     ┌────────▼─────────┐    ┌─────────▼──────────┐
     │   AniList API    │    │    Jikan API       │
     │   (Primary)      │    │    (Fallback)      │
     │   GraphQL        │    │    REST v4         │
     └────────┬─────────┘    └─────────┬──────────┘
              │                         │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Tatakai Content Graph  │
              │  (Cache + Enrichment)   │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │   Tatakai Internal IDs  │
              │   (System Anchor)       │
              └─────────────────────────┘
```

### 3.2 Why AniList Primary

| Feature | AniList | Jikan |
|---------|---------|-------|
| API Type | GraphQL | REST |
| Rate Limit | 90/min (auth) | 60/min (unauth), 3/sec |
| Data Richness | Extremely high | High |
| Episode Data | Detailed | Basic |
| Relations | Full | Partial |
| Recommendations | Built-in | Limited |
| Trending/Seasonal | Native | Available |
| Search Flexibility | GraphQL filters | Query params |
| Real-time Updates | Fast | MAL-dependent |

### 3.3 Why Jikan Fallback

- Covers AniList outages or rate-limit scenarios
- MyAnimeList has some titles AniList lacks (rare but real)
- Jikan is community-maintained and highly reliable
- Different data shapes help validate/cross-reference

### 3.4 Implementation Pattern

```typescript
// src/core/content/anilist-client.ts
class AniListClient {
  private endpoint = 'https://graphql.anilist.co';
  private fallbackClient: JikanClient;

  async query<T>(query: string, variables?: object): Promise<T> {
    try {
      return await this.anilistQuery<T>(query, variables);
    } catch (err) {
      // Log AniList failure
      telemetry.recordAniListFailure(err);
      // Attempt Jikan fallback with equivalent mapping
      return this.fallbackClient.equivalentQuery<T>(query, variables);
    }
  }
}

// src/core/content/jikan-client.ts  
class JikanClient {
  private endpoint = 'https://api.jikan.moe/v4';
  private rateLimiter = new RateLimiter(3, 1000); // 3 req/sec

  // Maps AniList GraphQL queries to Jikan REST equivalents
  async equivalentQuery<T>(aniListQuery: string, variables?: object): Promise<T> {
    const mapped = this.mapQueryToJikan(aniListQuery, variables);
    await this.rateLimiter.acquire();
    return this.fetchMapped<T>(mapped);
  }
}
```

### 3.5 Caching Strategy

| Cache Layer | TTL | Purpose |
|-------------|-----|---------|
| In-memory LRU | 5 min | Active page data |
| IndexedDB | 24 hours | Browse history, search results |
| Tatakai API cache | 1 hour | Centralized fallback cache |
| Service Worker | 7 days | Static assets, stale-while-revalidate |

### 3.6 Browsing Surfaces — Data Flow

```
User opens Home
    │
    ▼
┌─────────────────────┐
│ Check Content Graph │ ← Tatakai-owned cache
│   (IndexedDB/API)   │
└──────────┬──────────┘
           │
    ┌──────┴──────┐
    │ Cache Hit?  │
    └──────┬──────┘
      Yes /   \ No
         /     \
        ▼       ▼
   ┌────────┐  ┌──────────────┐
   │ Return │  │ Query AniList│
   │ Cached │  │   (Primary)  │
   │  Data  │  └──────┬───────┘
   └────────┘         │
                      │ Failure
                      ▼
              ┌──────────────┐
              │ Query Jikan  │
              │  (Fallback)  │
              └──────┬───────┘
                     │
                     ▼
              ┌──────────────┐
              │ Store in     │
              │ Content Graph│
              └──────────────┘
```

### 3.7 Content Graph Schema (Browsing-Only)

```sql
-- content_items: Core catalog entries
CREATE TABLE content_items (
  tatakai_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anilist_id INTEGER UNIQUE,
  mal_id INTEGER,
  kitsu_id INTEGER,
  title_romaji TEXT NOT NULL,
  title_english TEXT,
  title_native TEXT,
  description TEXT,
  cover_image_url TEXT,
  banner_image_url TEXT,
  format TEXT, -- TV, TV_SHORT, MOVIE, OVA, ONA, SPECIAL, MUSIC
  status TEXT, -- FINISHED, RELEASING, NOT_YET_RELEASED, CANCELLED, HIATUS
  season TEXT, -- WINTER, SPRING, SUMMER, FALL
  season_year INTEGER,
  episodes INTEGER,
  episode_duration INTEGER,
  start_date DATE,
  end_date DATE,
  average_score INTEGER, -- 0-100
  mean_score INTEGER,
  popularity INTEGER,
  favourites INTEGER,
  source TEXT, -- ORIGINAL, MANGA, LIGHT_NOVEL, VISUAL_NOVEL, VIDEO_GAME, OTHER
  genres TEXT[], -- PostgreSQL array
  tags JSONB, -- AniList tags with rankings
  studios JSONB, -- Primary + secondary studios
  is_adult BOOLEAN DEFAULT FALSE,
  country_of_origin TEXT, -- JP, CN, KR, etc.
  next_airing_episode JSONB, -- { episode, airingAt, timeUntilAiring }
  trailer_url TEXT,
  synonyms TEXT[],
  relations JSONB, -- AniList relation edges
  characters JSONB, -- Top characters
  staff JSONB, -- Key staff
  external_links JSONB,
  streaming_episodes JSONB,
  rankings JSONB, -- RATED, POPULAR
  -- Tatakai-specific
  trending_score FLOAT,
  recommendation_vector VECTOR(384), -- For ML recommendations
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_from TEXT DEFAULT 'anilist', -- 'anilist' | 'jikan' | 'manual'
  sync_version INTEGER DEFAULT 1
);

-- content_titles: Search-optimized title variants
CREATE TABLE content_titles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tatakai_id UUID REFERENCES content_items(tatakai_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  title_type TEXT NOT NULL, -- 'romaji', 'english', 'native', 'synonym'
  language TEXT,
  is_primary BOOLEAN DEFAULT FALSE,
  search_vector TSVECTOR,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_content_titles_search ON content_titles USING GIN(search_vector);

-- episode_items: Episode metadata
CREATE TABLE episode_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tatakai_id UUID REFERENCES content_items(tatakai_id) ON DELETE CASCADE,
  episode_number INTEGER NOT NULL,
  episode_internal_id TEXT NOT NULL, -- "tatakai:{uuid}:ep:{number}"
  title TEXT,
  description TEXT,
  thumbnail_url TEXT,
  airing_at TIMESTAMPTZ,
  duration INTEGER,
  is_filler BOOLEAN DEFAULT FALSE,
  is_recap BOOLEAN DEFAULT FALSE,
  is_special BOOLEAN DEFAULT FALSE,
  anidb_eid INTEGER, -- AniDB episode ID for mapping
  tvdb_eid INTEGER, -- TVDB episode ID for mapping
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tatakai_id, episode_number)
);

-- content_scores: Aggregated scores
CREATE TABLE content_scores (
  tatakai_id UUID PRIMARY KEY REFERENCES content_items(tatakai_id) ON DELETE CASCADE,
  anilist_score FLOAT,
  mal_score FLOAT,
  kitsu_score FLOAT,
  tatakai_user_score FLOAT,
  score_count INTEGER DEFAULT 0,
  weighted_score FLOAT GENERATED ALWAYS AS (
    (COALESCE(anilist_score, 0) * 0.4 + 
     COALESCE(mal_score, 0) * 0.3 + 
     COALESCE(kitsu_score, 0) * 0.2 +
     COALESCE(tatakai_user_score, 0) * 0.1) /
    NULLIF(
      (CASE WHEN anilist_score IS NOT NULL THEN 0.4 ELSE 0 END +
       CASE WHEN mal_score IS NOT NULL THEN 0.3 ELSE 0 END +
       CASE WHEN kitsu_score IS NOT NULL THEN 0.2 ELSE 0 END +
       CASE WHEN tatakai_user_score IS NOT NULL THEN 0.1 ELSE 0 END),
      0
    )
  ) STORED
);

-- content_feeds: Pre-computed feeds
CREATE TABLE content_feeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_type TEXT NOT NULL, -- 'trending', 'seasonal', 'upcoming', 'popular', 'top_rated'
  season TEXT,
  season_year INTEGER,
  items JSONB NOT NULL, -- Ordered array of { tatakai_id, rank, score }
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  UNIQUE(feed_type, season, season_year)
);
```

---

## 4. Shiru Inspiration & Adoptable Patterns

### 4.1 What Shiru Does Well

| Feature | Shiru Implementation | Tatakai Adoption |
|---------|---------------------|------------------|
| **AniList-first metadata** | All browsing, lists, tracking via AniList | Adopt exactly |
| **Web Worker extensions** | JS extensions in isolated Web Workers | Adopt for Tatakai Extension Hub |
| **AbstractSource pattern** | `single()`, `batch()`, `movie()`, `validate()` | Adopt for provider + torrent extensions |
| **anitomyscript** | Built-in filename parser for extensions | Adopt for torrent metadata parsing |
| **Dub-first tracking** | Independent sub/dub schedules, per-episode audio labels | Adopt for multi-language support |
| **Per-series subtitle memory** | Preferred subtitle track saved per source | Adopt for player core |
| **Offline support** | Library, history, loaded media offline | Adopt for desktop local runtime |
| **Parallel extension loading** | Results appear as each extension completes | Adopt for provider fanout |
| **Two-minute result cache** | Re-opening search doesn't re-fetch | Adopt |
| **Chapter-aware seekbar** | OP/ED/recap/filler detection with skip prompts | Adopt for player core |
| **Volume boost** | Beyond 100% volume (desktop) | Adopt |
| **Miniplayer** | Drag, resize, auto-hide on pause | Adopt |
| **Notification system** | Sub/dub/hentai release alerts | Evaluate vs existing Tatakai notifications |
| **Multiple profiles** | Separate libraries per profile | Evaluate |

### 4.2 Shiru Extension Architecture — Tatakai Adaptation

```typescript
// src/core/extensions/abstract-source.ts
export abstract class AbstractSource {
  abstract id: string;
  abstract name: string;
  abstract version: string;
  abstract type: 'torrent' | 'onlinestream' | 'custom';
  
  // anitomyscript is injected by the runtime
  protected anitomyscript: AnitomyScript;

  // Validate source is reachable
  abstract validate(): Promise<boolean>;

  // Search for a single episode
  abstract single(options: SourceOptions): Promise<SourceResult[]>;

  // Search for a batch/season
  abstract batch(options: SourceOptions): Promise<SourceResult[]>;

  // Search for a movie
  abstract movie(options: SourceOptions): Promise<SourceResult[]>;
}

// src/core/extensions/types.ts
export interface SourceOptions {
  anilistId: number;
  media: AniListMedia; // Full AniList media entry
  mappingsA?: CrossPlatformMappings; // Anime-level: AniDB, TVDB, IMDB, TMDB
  mappingsE?: EpisodeMappings; // Episode-level
  anidbAid?: number;
  anidbEid?: number;
  tvdbAid?: number;
  tvdbEid?: number;
  imdbAid?: string;
  mvdbAid?: number; // TheMovieDB
  titles: string[]; // All known titles including alternatives
  episode?: number;
  episodeCount?: number;
  resolution: '2160' | '1080' | '720' | '540' | '480' | '';
  exclusions: string[]; // Unsupported codecs, etc.
  // Tatakai additions
  tatakaiId?: string;
  preferredLanguage?: string;
  countryCode?: string; // For region filtering
}

export interface TorrentResult {
  title: string;
  link: string; // http:// .torrent or magnet://
  id?: number;
  seeders: number;
  leechers: number;
  downloads: number;
  accuracy: 'high' | 'medium' | 'low';
  hash: string; // REQUIRED info hash
  size: number; // bytes
  date: Date;
  type: 'batch' | 'best' | 'alt';
  // Parsed metadata (via anitomyscript)
  parsed?: ParsedReleaseMetadata;
}

export interface ParsedReleaseMetadata {
  releaseGroup?: string;
  animeTitle?: string;
  episodeNumber?: number;
  episodeTitle?: string;
  videoResolution?: string;
  videoTerm?: string; // H.264, H.265, AV1, etc.
  audioTerm?: string; // FLAC, AAC, OPUS, etc.
  source?: string; // BluRay, WEB-DL, TV, etc.
  version?: number; // v2, v3, etc.
  checksum?: string;
  language?: string;
  isDualAudio?: boolean;
  isBatch?: boolean;
}
```

### 4.3 Extension Manifest (Shiru-style, Tatakai-hardened)

```json
[
  {
    "id": "nyaasearch",
    "name": "Nyaa Search",
    "version": "1.0.0",
    "main": "gh:Spithskia/Shiru-Extensions/nyaasearch",
    "update": "gh:Spithskia/Shiru-Extensions",
    "type": "torrent",
    "speed": "fast",
    "accuracy": "high",
    "regions": ["US", "JP", "EU"],
    "nsfw": false,
    "unregulated": true,
    "deprecated": false,
    "description": "Search Nyaa.si for anime torrents",
    "icon": "iVBORw0KGgoAAAANS...",
    "permissions": ["network", "torrent_search"],
    "signature": "sha256:...",
    "signedBy": "tatakai-marketplace",
    "approvedAt": "2026-01-15T00:00:00Z",
    "approvedBy": "admin_uuid"
  }
]
```

**Tatakai additions over Shiru:**
- `permissions`: Explicit capability grants
- `signature` + `signedBy`: Cryptographic verification
- `approvedAt` + `approvedBy`: Moderation audit trail
- Kill-switch capability via admin dashboard

### 4.4 Web Worker Sandbox (Shiru-style)

```typescript
// desktop/runtime/extension-worker.ts
class ExtensionWorker {
  private worker: Worker;
  private timeout: number = 30000; // 30s max execution
  
  constructor(extensionCode: string, manifest: ExtensionManifest) {
    // Create blob URL from verified extension code
    const blob = new Blob([this.wrapExtension(extensionCode)], { type: 'application/javascript' });
    this.worker = new Worker(URL.createObjectURL(blob), { type: 'module' });
    
    // Inject anitomyscript
    this.injectAnitomyScript();
  }

  private wrapExtension(code: string): string {
    return `
      // Restricted globals
      const fetch = self.__tatakai_fetch__;
      const anitomyscript = self.__tatakai_anitomy__;
      
      // No access to: document, window, localStorage, indexedDB, XMLHttpRequest
      // Network requests go through __tatakai_fetch__ which enforces CORS + allowlist
      
      ${code}
    `;
  }

  async execute(method: 'single' | 'batch' | 'movie', options: SourceOptions): Promise<SourceResult[]> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.worker.terminate();
        reject(new Error('Extension execution timeout'));
      }, this.timeout);

      this.worker.onmessage = (e) => {
        clearTimeout(timer);
        resolve(e.data.results);
      };

      this.worker.onerror = (err) => {
        clearTimeout(timer);
        reject(err);
      };

      this.worker.postMessage({ method, options });
    });
  }
}
```

### 4.5 Dub-First Tracking (Shiru-inspired)

```typescript
// src/core/content/dub-tracker.ts
interface DubTrackingEntry {
  tatakaiId: string;
  anilistId: number;
  subSchedule: EpisodeSchedule[];
  dubSchedule: EpisodeSchedule[];
  preferredAudio: 'sub' | 'dub' | 'dual';
  latestSubEpisode: number;
  latestDubEpisode: number;
  // Per-dub-language tracking
  dubLanguages: Record<string, EpisodeSchedule[]>;
}

interface EpisodeSchedule {
  episodeNumber: number;
  airedAt: Date;
  availableAt: Date;
  delayStatus: 'on_time' | 'delayed' | 'indefinitely_delayed';
}

// UI: Audio labels on cards
// "Dub 12 / Sub 24" — shows latest available for each
// "Dual Audio" — both available for latest episode
// Prefer Dubs setting: Hide from Continue Watching until dub catches up
```

### 4.6 Per-Series Subtitle Memory (Shiru-inspired)

```typescript
// src/core/player/subtitle-memory.ts
interface SubtitlePreference {
  tatakaiId: string;
  episodeNumber: number;
  sourceHash: string; // Identifies the specific source/release
  preferredTrackIndex: number;
  preferredLanguage: string;
  delayMs: number;
  // Fuzzy matching for batches
  matchedBy: 'exact' | 'release_group' | 'series';
}

// Player loads and auto-selects based on:
// 1. Exact source match (same hash)
// 2. Same release group for same series
// 3. Same series default
```

---

## 5. Extension Local Scraping Architecture

### 5.1 The Concept

Extensions should be able to **scrape content directly from the user's device** instead of routing every request through Tatakai's central API. This is a paradigm shift: the device becomes a first-class scraping node.

**Why this matters:**
- **Bypass server IP blocks:** Many anime sites block datacenter IPs but allow residential IPs
- **Lower latency:** Direct connection eliminates server round-trip
- **Reduce server costs:** Less proxy bandwidth and compute on TatakaiAPI
- **Resilience:** If TatakaiAPI is down, extensions can still function
- **Privacy:** User traffic doesn't pass through Tatakai's infrastructure

### 5.2 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  EXTENSION LOCAL SCRAPING FLOW                   │
└─────────────────────────────────────────────────────────────────┘

User clicks "Watch Episode 5"
        │
        ▼
┌─────────────────────┐
│ Provider Orchestrator│
│ (decides strategy)   │
└──────────┬──────────┘
           │
    ┌──────┴──────┐
    │ Local first?│ ← Feature flag + extension permission
    └──────┬──────┘
      Yes /   \ No
         /     \
        ▼       ▼
┌──────────────┐  ┌──────────────────┐
│Local Runtime │  │ TatakaiAPI       │
│Worker Thread │  │ (server scrape)  │
└──────┬───────┘  └──────────────────┘
       │
       ▼
┌─────────────────────┐
│ Extension Web Worker│
│ (isolated JS)       │
│                     │
│ fetch() → site HTML │
│ cheerio-like parse  │
│ extract video URLs  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 1.1.1.1 WARP Tunnel │ ← Optional: routes through Cloudflare
│ (bypass geo-blocks) │     if site blocks raw residential IP
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Raw Response        │
│ (HTML/JSON/m3u8)    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Structured Result   │
│ → Provider Orchestrator
│ → Player Core       │
└─────────────────────┘
```

### 5.3 How It Works

**Inside the Web Worker:**

```typescript
// Extension code running in Web Worker (provided by extension author)
class GogoanimeLocalSource extends AbstractSource {
  id = 'gogoanime-local';
  name = 'Gogoanime (Local)';
  type = 'onlinestream';
  
  // Permissions declared in manifest:
  // permissions: ["network:fetch", "network:domain:gogoanime.*", "parse:html"]

  async single(options: SourceOptions): Promise<SourceResult[]> {
    // 1. Build search URL locally
    const searchUrl = `https://gogoanime3.co/search.html?keyword=${encodeURIComponent(options.titles[0])}`;
    
    // 2. Fetch directly from device (via WARP if enabled)
    const searchHtml = await this.fetch(searchUrl); // Routed through WARP tunnel if active
    
    // 3. Parse HTML (cheerio-like API injected by runtime)
    const $ = this.parseHtml(searchHtml);
    const animePage = $('.items li a').first().attr('href');
    
    // 4. Navigate to episode page
    const episodeUrl = `https://gogoanime3.co${animePage}-episode-${options.episode}`;
    const episodeHtml = await this.fetch(episodeUrl);
    
    // 5. Extract video sources
    const videoUrl = this.extractVideoUrl(episodeHtml);
    
    return [{
      source: this.id,
      url: videoUrl,
      quality: '1080p',
      headers: { referer: 'https://gogoanime3.co/' },
      subtitles: [],
    }];
  }
}
```

**Runtime injection (what Tatakai provides to the worker):**

```typescript
// desktop/runtime/extension-sandbox.ts
const extensionRuntimeAPI = {
  // Network (routed through WARP if enabled)
  fetch: (url: string, init?: RequestInit) => {
    // Validate URL against manifest permissions
    if (!matchesAllowedDomains(url, manifest.permissions)) {
      throw new PermissionDeniedError(`Domain not allowed: ${url}`);
    }
    // Route through WARP tunnel or direct
    return warpFetch(url, init); 
  },
  
  // HTML parsing (no DOM access, pure parser)
  parseHtml: (html: string) => createCheerioLikeParser(html),
  
  // JSON parsing
  parseJson: (json: string) => JSON.parse(json),
  
  // anitomyscript for filename parsing
  anitomyscript: anitomyscript,
  
  // Regex utilities
  regex: {
    match: (pattern: RegExp, text: string) => pattern.exec(text),
    replace: (pattern: RegExp, text: string, replacement: string) => text.replace(pattern, replacement),
  },
  
  // No eval, no Function constructor, no XMLHttpRequest, no WebSocket
};
```

### 5.4 Permission Model for Local Scraping

Extensions must declare exactly what they need:

```typescript
interface ExtensionPermissions {
  // Network permissions
  'network:fetch': boolean;        // Can make HTTP requests
  'network:domain:gogoanime.*': boolean;  // Specific domain allowlist
  'network:domain:aniwave.*': boolean;
  'network:domain:*': boolean;     // Rare, requires extra admin review
  
  // Parsing permissions
  'parse:html': boolean;           // HTML parser access
  'parse:json': boolean;           // JSON parser access
  'parse:xml': boolean;            // XML parser access
  
  // Content permissions
  'content:read': boolean;         // Can read Tatakai content metadata
  'content:write': boolean;        // Can write to local cache (rare)
  
  // Torrent permissions (separate from scraping)
  'torrent:search': boolean;       // Can search torrent sites
  'torrent:download': boolean;     // Can download torrent metadata
}
```

**Security rules:**
1. **No `eval()` or `Function()` constructor** — Web Worker CSP enforced
2. **No DOM access** — Web Workers have no `document` or `window`
3. **Fetch domain allowlist** — Only declared domains reachable
4. **No local file system access** — Cannot read/write arbitrary files
5. **No WebSocket** — Only HTTP/HTTPS fetch
6. **Timeout enforced** — 30-second max per request, 2-minute max per extension call
7. **Rate limiting** — Per-domain rate limits enforced by runtime
8. **Response size cap** — 10MB max response to prevent memory abuse

### 5.5 Fallback Strategy

```
Local scraping attempt
        │
        ▼
┌─────────────────┐
│ Success?        │
└────────┬────────┘
   Yes /   \ No
      /     \
     ▼       ▼
┌────────┐  ┌─────────────────┐
│ Return │  │ Why failed?     │
│ Result │  └────────┬────────┘
└────────┘           │
            ┌────────┴────────┐
            │                 │
     Site blocked     Timeout/Error
            │                 │
            ▼                 ▼
    ┌──────────────┐   ┌──────────────┐
    │ Try WARP     │   │ Try WARP     │
    │ (if off)     │   │ (if on,      │
    └──────┬───────┘   │  try server) │
           │           └──────┬───────┘
      Yes / \ No              │
         /   \                ▼
        ▼     ▼         ┌──────────────┐
   ┌────────┐ ┌─────┐   │ TatakaiAPI   │
   │ WARP   │ │Fail │   │ (server      │
   │ retry  │ │over │   │  fallback)   │
   └───┬────┘ └─────┘   └──────┬───────┘
       │                       │
       ▼                       ▼
  ┌────────┐              ┌────────┐
  │Return  │              │Return  │
  │Result  │              │Result  │
  └────────┘              └────────┘
```

### 5.6 When Local Scraping Is Used

| Scenario | Strategy |
|----------|----------|
| Desktop + extension has `network:fetch` | Local scraping first |
| Desktop + extension lacks network perm | Server API only |
| Web browser + CORS allows | Local scraping possible (limited) |
| Web browser + CORS blocks | Server API proxy required |
| Mobile (Capacitor) | Server API first, local via native bridge later |
| Site blocks residential IP | WARP tunnel auto-enabled for that domain |
| WARP also blocked | Server API fallback |

### 5.7 Benefits for TatakaiAPI

- **70-80% reduction in proxy bandwidth** (most scraping happens on device)
- **Lower server costs** — Server only handles: auth, content graph, mappings, fallback scraping
- **Better uptime** — Server outages don't kill all source resolution
- **Scales infinitely** — Each user brings their own scraping capacity

---

## 6. 1.1.1.1 WARP Network Tunnel Integration

### 6.1 The Concept

Tatakai will integrate a **built-in 1.1.1.1 DNS + optional WARP-like proxy tunnel** directly into the app. This is not a system-wide VPN — it's an **application-level network layer** that routes Tatakai's traffic (extensions, torrent metadata, API calls) through Cloudflare's network.

**Why this matters:**
- **Bypass geo-blocks:** Many anime sites block by country; WARP egresses from Cloudflare's global edge
- **Bypass IP-based rate limits:** Sites that rate-limit by IP see Cloudflare's IP, not the user's
- **Bypass ISP blocks:** Some ISPs DNS-block anime sites; 1.1.1.1 DNS bypasses this
- **Privacy:** Encrypted DNS prevents ISP snooping on what anime you're watching
- **Reliability:** Cloudflare's network is more reliable than many residential routes
- **Consistency:** Extensions and torrent metadata requests get consistent connectivity

### 6.2 Two Modes

#### Mode A: 1.1.1.1 DNS (Always On)

```typescript
// DNS-over-HTTPS (DoH) configuration
const dohConfig = {
  primary: 'https://cloudflare-dns.com/dns-query',
  fallback: 'https://1.1.1.1/dns-query',
  // Tatakai-specific: resolve anime site domains through DoH
  // before any HTTP request is made
};
```

- **What it does:** All DNS queries go through Cloudflare's encrypted DNS
- **When it's used:** Every network request in the app
- **Performance impact:** Negligible (faster than ISP DNS in most cases)
- **Privacy impact:** ISP cannot see what domains you visit
- **Cannot be disabled** (always-on for privacy)

#### Mode B: WARP Proxy (User Toggle)

```typescript
// Application-level SOCKS5/HTTP proxy via Cloudflare WARP
const warpConfig = {
  enabled: userSettings.warpEnabled,
  mode: 'auto' | 'always' | 'on-demand',
  
  // Auto mode: only enable when site blocks detected
  autoTrigger: {
    failedRequestsThreshold: 3,
    httpStatusCodes: [403, 451, 503],
    errorPatterns: ['blocked', 'geo-restricted', 'unavailable'],
  },
  
  // Per-feature toggles
  routeExtensions: true,   // Route extension scraping through WARP
  routeTorrent: true,      // Route torrent metadata through WARP
  routeApi: false,         // TatakaiAPI calls (usually fine direct)
  routePlayer: false,      // Video streams (direct for speed)
};
```

- **What it does:** HTTP/HTTPS traffic is proxied through Cloudflare's WARP network
- **When it's used:** Only when enabled (auto or manual)
- **Performance impact:** Small latency increase (~10-30ms), but often faster than blocked routes
- **Privacy impact:** Cloudflare sees traffic metadata (not content for HTTPS)

### 6.3 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    NETWORK STACK (Per Request)                   │
└─────────────────────────────────────────────────────────────────┘

App makes request
        │
        ▼
┌─────────────────────┐
│ 1. DNS Resolution   │
│    ↓                │
│ 1.1.1.1 DoH         │ ← Always active
│ (cloudflare-dns.com)│
└──────────┬──────────┘
           │ Resolved IP
           ▼
┌─────────────────────┐
│ 2. WARP Decision    │
│    ↓                │
│ Is WARP enabled?    │
│ Is this domain in   │
│   WARP route list?  │
└──────────┬──────────┘
     Yes /   \ No
        /     \
       ▼       ▼
┌──────────┐  ┌──────────┐
│ WARP     │  │ Direct   │
│ Proxy    │  │ Connection│
│ (SOCKS5) │  │          │
└────┬─────┘  └────┬─────┘
     │             │
     ▼             ▼
┌─────────────────────────┐
│ Cloudflare Edge         │
│ (150+ cities worldwide) │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Target Website/API      │
│ (sees Cloudflare IP,    │
│  not user IP)           │
└─────────────────────────┘
```

### 6.4 Implementation for Electron Desktop

```typescript
// desktop/runtime/warp-tunnel.ts
import { net, session } from 'electron';

class WarpTunnel {
  private proxyConfig = {
    mode: 'fixed_servers',
    rules: {
      singleProxy: {
        scheme: 'socks5',
        host: '127.0.0.1',
        port: 0, // Dynamic port
      },
      bypassList: ['localhost', '127.0.0.1', '*.tatakai.app'],
    },
  };

  async initialize(): Promise<void> {
    // Start local WireGuard-go or cloudflared subprocess
    // Or use Electron's built-in proxy API
    
    // Option 1: Electron session proxy
    const mainSession = session.defaultSession;
    await mainSession.setProxy({
      proxyRules: 'socks5://127.0.0.1:8080', // Local WARP client port
    });
    
    // Option 2: Use cloudflared access
    // Spawns cloudflared subprocess for WARP connection
  }

  async enableForDomain(domain: string): Promise<void> {
    // Add domain to WARP route list
    this.routedDomains.add(domain);
    
    // Update Electron session proxy rules
    await this.updateProxyRules();
  }

  // Extension fetch is automatically routed through WARP
  // when WARP is enabled and domain is in route list
  async fetchThroughWarp(url: string, init?: RequestInit): Promise<Response> {
    return net.fetch(url, {
      ...init,
      // Electron net.fetch respects session proxy settings
    });
  }
}
```

### 6.5 Implementation for Web (Limited)

Web browsers cannot create true proxy tunnels. However:
- **DoH is supported** via `fetch()` to `https://cloudflare-dns.com/dns-query`
- **WARP is NOT available** on web — extensions fall back to TatakaiAPI proxy
- **Progressive Web App** with `fetch` interceptor could use DoH at minimum

```typescript
// src/core/network/doh-resolver.ts (works on web + desktop)
export async function resolveViaDoH(hostname: string): Promise<string> {
  const response = await fetch('https://cloudflare-dns.com/dns-query', {
    method: 'GET',
    headers: { Accept: 'application/dns-json' },
    // Query params: ?name=example.com&type=A
  });
  const data = await response.json();
  return data.Answer[0].data;
}
```

### 6.6 Integration with Extensions

Extensions don't need to know about WARP — it's transparent:

```typescript
// Inside extension Web Worker
// Extension author writes:
const html = await fetch('https://some-anime-site.com/page');

// Runtime automatically:
// 1. Resolves DNS via 1.1.1.1 DoH
// 2. Checks if WARP is enabled for this domain
// 3. Routes through WARP proxy if yes
// 4. Returns response to extension
// Extension sees no difference
```

### 6.7 Integration with Torrent

Torrent metadata (tracker announces, DHT, magnet resolution) can benefit from WARP:

```typescript
// desktop/runtime/torrent/warp-routing.ts
interface TorrentWarpConfig {
  // DHT bootstrap nodes through WARP
  dhtRouting: boolean;
  
  // Tracker announce through WARP
  trackerRouting: boolean;
  
  // Magnet link resolution through WARP
  magnetRouting: boolean;
  
  // Actual peer connections (usually direct for speed)
  peerConnections: 'direct' | 'warp';
}

// Default: metadata through WARP, peers direct
const defaultTorrentWarp: TorrentWarpConfig = {
  dhtRouting: true,
  trackerRouting: true,
  magnetRouting: true,
  peerConnections: 'direct', // Peers are P2P, no benefit from proxy
};
```

### 6.8 UI/UX

```
Settings → Network
├── DNS (always on)
│   └── ✅ Using 1.1.1.1 (Cloudflare)
│
├── WARP Tunnel
│   ├── [Toggle] Enable WARP
│   ├── Mode: [Auto ▼] / Always / On-demand
│   ├── Route extension scraping: [✓]
│   ├── Route torrent metadata: [✓]
│   ├── Route API calls: [ ]
│   └── Route video streams: [ ]
│
├── Status
│   ├── WARP: Connected ▶ Frankfurt
│   ├── IP: 104.16.x.x (Cloudflare)
│   └── Latency: +12ms
│
└── Advanced
    ├── Test connectivity
    ├── Reset WARP session
    └── View routing log
```

### 6.9 Security & Privacy

| Concern | Mitigation |
|---------|------------|
| Cloudflare sees traffic | Only metadata (domains, IPs), not HTTPS content. Same as any CDN. |
| WARP logs | Cloudflare's privacy policy applies. Tatakai adds no additional logging. |
| DNS leaks | DoH prevents ISP DNS leaks. Electron `session.setProxy` prevents leaks. |
| Extension abuse | WARP doesn't give extensions new capabilities — just better connectivity. |
| Legal implications | WARP is a privacy tool, not an anonymity tool. Country policies still apply. |

### 6.10 Country Policy Interaction

WARP and country policies are **independent but complementary:**

```
User in Germany (torrent: illegal)
        │
        ├── WARP enabled → better connectivity
        │   └── Can browse AniList, stream from legal sources faster
        │
        └── Torrent feature
            └── Country policy check: ILLEGAL
                └── VPN warning modal shown
                    └── User must acknowledge
                        └── Torrent features unlocked (if they choose)
                            └── WARP may help with torrent metadata
                                but does NOT change legality
```

**Key rule:** WARP is a **network optimization tool**, not a **legal bypass**. Country policies are enforced regardless of WARP state.

---

## 7. Country Torrent Legality System (196 Countries)

### 5.1 Ownership

- **Owner:** Snozxyx (sole admin authority)
- **Modification:** Admin dashboard only
- **User impact:** Read-only policy display + VPN recommendation
- **Audit:** All changes logged with admin ID, timestamp, previous value

### 5.2 Database Schema

```sql
-- country_torrent_policies: 196 countries
CREATE TABLE country_torrent_policies (
  iso_code CHAR(2) PRIMARY KEY, -- ISO 3166-1 alpha-2
  iso_code_3 CHAR(3) NOT NULL, -- ISO 3166-1 alpha-3
  country_name TEXT NOT NULL,
  country_name_local TEXT,
  
  -- Policy classification
  torrent_policy TEXT NOT NULL DEFAULT 'unclear'
    CHECK (torrent_policy IN ('legal', 'decriminalized', 'illegal', 'unclear', 'vpn_required')),
  
  -- Enforcement level
  enforcement_level TEXT NOT NULL DEFAULT 'unknown'
    CHECK (enforcement_level IN ('none', 'low', 'moderate', 'high', 'severe', 'unknown')),
  
  -- Specific restrictions
  downloading_illegal BOOLEAN DEFAULT FALSE,
  uploading_illegal BOOLEAN DEFAULT FALSE,
  streaming_illegal BOOLEAN DEFAULT FALSE,
  fines_applicable BOOLEAN DEFAULT FALSE,
  imprisonment_possible BOOLEAN DEFAULT FALSE,
  isp_monitoring BOOLEAN DEFAULT FALSE,
  
  -- Legal details
  specific_law TEXT, -- Name of relevant law
  law_reference_url TEXT,
  last_verified_at TIMESTAMPTZ,
  verification_source TEXT,
  notes TEXT,
  
  -- Tatakai-specific
  vpn_recommended BOOLEAN GENERATED ALWAYS AS (
    torrent_policy IN ('illegal', 'vpn_required') OR 
    enforcement_level IN ('high', 'severe')
  ) STORED,
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id),
  update_reason TEXT,
  version INTEGER DEFAULT 1
);

-- user_country_acknowledgments: Track user VPN warnings
CREATE TABLE user_country_acknowledgments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  country_iso_code CHAR(2) REFERENCES country_torrent_policies(iso_code),
  acknowledged_at TIMESTAMPTZ DEFAULT NOW(),
  acknowledgment_expires_at TIMESTAMPTZ, -- Re-prompt every 30 days
  vpn_dismissed BOOLEAN DEFAULT FALSE,
  UNIQUE(user_id, country_iso_code)
);

-- country_policy_audit_log: Immutable audit trail
CREATE TABLE country_policy_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  iso_code CHAR(2) NOT NULL,
  changed_by UUID NOT NULL REFERENCES auth.users(id),
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  reason TEXT,
  ip_address INET
);
```

### 5.3 Sample Seed Data

```sql
INSERT INTO country_torrent_policies 
  (iso_code, iso_code_3, country_name, torrent_policy, enforcement_level, 
   downloading_illegal, uploading_illegal, fines_applicable, isp_monitoring,
   specific_law, last_verified_at, verification_source, notes) 
VALUES
  -- Strict enforcement
  ('DE', 'DEU', 'Germany', 'illegal', 'high', true, true, true, true, 
   'Copyright Act (UrhG)', '2026-01-01', 'legal-review-2026', 
   'Abmahnung letters common. VPN strongly recommended.'),
  
  ('JP', 'JPN', 'Japan', 'illegal', 'severe', true, true, false, true,
   'Copyright Act (Act No. 48 of 1970)', '2026-01-01', 'legal-review-2026',
   'Uploading punishable by up to 10 years. Downloading also illegal since 2012.'),
  
  ('GB', 'GBR', 'United Kingdom', 'illegal', 'moderate', true, true, true, true,
   'Digital Economy Act 2017', '2026-01-01', 'legal-review-2026',
   'ISP blocking of torrent sites active. Fines possible.'),
  
  ('FR', 'FRA', 'France', 'illegal', 'high', true, true, true, true,
   'HADOPI law', '2026-01-01', 'legal-review-2026',
   'Three-strikes system. VPN recommended.'),
  
  ('US', 'USA', 'United States', 'illegal', 'moderate', true, true, true, false,
   'Digital Millennium Copyright Act', '2026-01-01', 'legal-review-2026',
   'Copyright infringement civil liability. Criminal for commercial scale.'),
  
  -- Gray areas
  ('IN', 'IND', 'India', 'unclear', 'low', false, false, false, false,
   NULL, '2026-01-01', 'legal-review-2026',
   'No specific torrent law. Copyright Act applies but rarely enforced for personal use.'),
  
  ('BR', 'BRA', 'Brazil', 'decriminalized', 'low', false, false, false, false,
   'Law 9.610/1998', '2026-01-01', 'legal-review-2026',
   'Personal use downloading generally not prosecuted.'),
  
  -- Permissive
  ('CH', 'CHE', 'Switzerland', 'legal', 'none', false, false, false, false,
   'Swiss Copyright Act', '2026-01-01', 'legal-review-2026',
   'Downloading for personal use is legal. Uploading is not.'),
  
  ('ES', 'ESP', 'Spain', 'decriminalized', 'low', false, false, false, false,
   'Intellectual Property Law', '2026-01-01', 'legal-review-2026',
   'Personal use downloading not prosecuted. Profit-making is targeted.'),
  
  ('RU', 'RUS', 'Russia', 'illegal', 'low', true, false, false, false,
   'Civil Code of Russia', '2026-01-01', 'legal-review-2026',
   'Technically illegal but rarely enforced for personal anime consumption.');
```

### 5.4 User Flow

```
User opens Tatakai (first time or after 30 days)
    │
    ▼
┌─────────────────────────┐
│ Detect country (IP/Geo) │
│ or use stored preference│
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Lookup policy for country│
└───────────┬─────────────┘
            │
    ┌───────┴───────┐
    │ Policy type?  │
    └───────┬───────┘
legal/    │     \ illegal/
decrim.   │      vpn_required
    │     │           │
    ▼     │           ▼
┌──────┐  │    ┌─────────────────┐
│Normal│  │    │ Show VPN Warning│
│ Flow │  │    │ Modal           │
└──────┘  │    │ - Explain risk  │
          │    │ - Recommend VPN │
          │    │ - "I understand"│
          │    └────────┬────────┘
          │             │
          │             ▼
          │    ┌─────────────────┐
          │    │ Store ack in DB │
          │    │ (30-day expiry) │
          │    └─────────────────┘
          │
          ▼
    ┌─────────────┐
    │ unclear?    │
    │ Show info   │
    │ notice only │
    └─────────────┘
```

### 5.5 Admin Dashboard UI

```typescript
// Admin panel: Country Policy Manager
interface CountryPolicyManagerProps {
  // Table of all 196 countries
  // Inline editing for: torrent_policy, enforcement_level, all booleans
  // Bulk import via CSV/JSON
  // Audit log viewer
  // Search/filter by policy type
  // "Last verified" sorting
}

// Actions:
// - Edit single country
// - Bulk update (select multiple)
// - Import from CSV
// - Export current state
// - View audit log
// - Preview user-facing message
```

---

## 8. Data Migration Plan

### Migration Philosophy

- **Zero-downtime:** All migrations are additive
- **Dual-write:** Write to old and new tables during transition
- **Backwards-compatible:** Old API responses unchanged during migration
- **Rollback-ready:** Each migration has a rollback script
- **Feature-flagged:** New paths gated until verified

### Migration 1: Content Graph (AniList Ingestion)

**Goal:** Populate `content_items`, `content_titles`, `episode_items` from AniList

```sql
-- Migration: 001_content_graph.sql
-- Step 1: Create tables (if not exists)
-- [Tables defined in Section 3.7]

-- Step 2: Ingestion job (TypeScript)
// scripts/migrations/001-ingest-anilist.ts
async function ingestAniListCatalog() {
  const pageSize = 50;
  let page = 1;
  let hasNextPage = true;

  while (hasNextPage) {
    const result = await anilistClient.query<PageResponse>(`
      query ($page: Int, $perPage: Int) {
        Page(page: $page, perPage: $perPage) {
          pageInfo { hasNextPage }
          media(type: ANIME) {
            id
            idMal
            title { romaji english native }
            description
            coverImage { large extraLarge }
            bannerImage
            format
            status
            season
            seasonYear
            episodes
            duration
            startDate { year month day }
            endDate { year month day }
            averageScore
            meanScore
            popularity
            favourites
            source
            genres
            tags { name rank }
            studios { nodes { name isMain } }
            isAdult
            countryOfOrigin
            nextAiringEpisode { episode airingAt timeUntilAiring }
            trailer { id site }
            synonyms
            relations { edges { relationType node { id } } }
            characters { nodes { name { full } image { large } } }
            staff { nodes { name { full } primaryOccupations } }
            externalLinks { url site }
            streamingEpisodes { title thumbnail url }
            rankings { rank type }
          }
        }
      }
    `, { page, perPage: pageSize });

    for (const media of result.Page.media) {
      await upsertContentNode(media);
    }

    hasNextPage = result.Page.pageInfo.hasNextPage;
    page++;
    
    // Rate limit respect
    await sleep(1000);
  }
}

async function upsertContentNode(media: AniListMedia) {
  const tatakaiId = await resolveOrCreateTatakaiId(media.id);
  
  await db.query(`
    INSERT INTO content_items (
      tatakai_id, anilist_id, mal_id, title_romaji, title_english,
      title_native, description, cover_image_url, banner_image_url,
      format, status, season, season_year, episodes, episode_duration,
      start_date, end_date, average_score, mean_score, popularity,
      favourites, source, genres, tags, studios, is_adult,
      country_of_origin, next_airing_episode, trailer_url, synonyms,
      relations, characters, staff, external_links, streaming_episodes,
      rankings, last_synced_from
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
              $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28,
              $29, $30, $31, $32, $33, $34, $35, $36, 'anilist')
    ON CONFLICT (anilist_id) DO UPDATE SET
      title_romaji = EXCLUDED.title_romaji,
      title_english = EXCLUDED.title_english,
      title_native = EXCLUDED.title_native,
      description = EXCLUDED.description,
      cover_image_url = EXCLUDED.cover_image_url,
      banner_image_url = EXCLUDED.banner_image_url,
      status = EXCLUDED.status,
      episodes = EXCLUDED.episodes,
      average_score = EXCLUDED.average_score,
      popularity = EXCLUDED.popularity,
      favourites = EXCLUDED.favourites,
      genres = EXCLUDED.genres,
      tags = EXCLUDED.tags,
      next_airing_episode = EXCLUDED.next_airing_episode,
      rankings = EXCLUDED.rankings,
      updated_at = NOW(),
      sync_version = content_items.sync_version + 1,
      last_synced_from = 'anilist'
  `, [/* all params */]);

  // Upsert titles for search
  await upsertContentTitles(tatakaiId, media);
  
  // Upsert episodes
  await upsertEpisodes(tatakaiId, media);
}
```

**Rollback:**
```sql
-- Keep old provider-based browsing active
-- New tables can be dropped without affecting existing flows
-- Feature flag: CONTENT_GRAPH_V1=false reverts to old behavior
```

### Migration 2: Mapper Data Internalization

**Goal:** Replace external `anime-mapper` runtime dependency with internal tables

```sql
-- Migration: 002_mapper_internalization.sql

CREATE TABLE source_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tatakai_id UUID REFERENCES content_items(tatakai_id) ON DELETE CASCADE,
  
  -- External IDs
  anilist_id INTEGER,
  mal_id INTEGER,
  kitsu_id INTEGER,
  anidb_aid INTEGER,
  tvdb_id INTEGER,
  imdb_id TEXT,
  tmdb_id INTEGER,
  
  -- Provider-specific IDs
  provider_mappings JSONB DEFAULT '{}',
  -- e.g., { "gogoanime": "naruto", "zoro": "naruto-387" }
  
  -- Confidence & provenance
  confidence_score FLOAT DEFAULT 1.0,
  provenance TEXT DEFAULT 'anime-mapper',
  import_run_id UUID,
  
  -- Conflict resolution
  conflict_status TEXT DEFAULT 'resolved'
    CHECK (conflict_status IN ('resolved', 'pending', 'manual_override')),
  conflict_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(tatakai_id)
);

CREATE TABLE episode_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tatakai_id UUID REFERENCES content_items(tatakai_id) ON DELETE CASCADE,
  episode_number INTEGER NOT NULL,
  
  -- External episode IDs
  anidb_eid INTEGER,
  tvdb_eid INTEGER,
  
  -- Provider episode mappings
  provider_episode_mappings JSONB DEFAULT '{}',
  -- e.g., { "gogoanime": "episode-1", "zoro": "ep-1" }
  
  confidence_score FLOAT DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(tatakai_id, episode_number)
);

CREATE TABLE mapping_import_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL, -- 'anime-mapper', 'manual', 'provider-scrape'
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  records_processed INTEGER DEFAULT 0,
  records_inserted INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  records_conflicted INTEGER DEFAULT 0,
  shard_version TEXT,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  error_log TEXT
);

CREATE TABLE mapping_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tatakai_id UUID REFERENCES content_items(tatakai_id),
  conflict_type TEXT NOT NULL, -- 'duplicate_external_id', 'provider_mismatch', 'episode_gap'
  conflicting_data JSONB NOT NULL,
  suggested_resolution JSONB,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Ingestion Pipeline:**
```typescript
// scripts/migrations/002-import-mapper.ts
async function importMapperShard(shardPath: string) {
  const runId = await startImportRun('anime-mapper', shardPath);
  
  const shard = await loadMapperShard(shardPath);
  // Shard format: { anilistId, malId, anidbAid, tvdbId, providerIds: {...} }
  
  for (const entry of shard.entries) {
    try {
      const tatakaiId = await resolveTatakaiIdByAniList(entry.anilistId);
      
      await db.query(`
        INSERT INTO source_mappings 
          (tatakai_id, anilist_id, mal_id, anidb_aid, tvdb_id, 
           provider_mappings, confidence_score, import_run_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (tatakai_id) DO UPDATE SET
          mal_id = COALESCE(EXCLUDED.mal_id, source_mappings.mal_id),
          anidb_aid = COALESCE(EXCLUDED.anidb_aid, source_mappings.anidb_aid),
          tvdb_id = COALESCE(EXCLUDED.tvdb_id, source_mappings.tvdb_id),
          provider_mappings = source_mappings.provider_mappings || EXCLUDED.provider_mappings,
          confidence_score = LEAST(EXCLUDED.confidence_score, source_mappings.confidence_score),
          updated_at = NOW()
      `, [tatakaiId, entry.anilistId, entry.malId, entry.anidbAid, 
          entry.tvdbId, JSON.stringify(entry.providerIds), 
          entry.confidence, runId]);
      
      await recordImportProgress(runId, 'inserted');
    } catch (err) {
      await recordImportConflict(runId, entry, err);
    }
  }
  
  await completeImportRun(runId);
}
```

### Migration 3: Provider Health Monitoring

```sql
-- Migration: 003_provider_health.sql
CREATE TABLE provider_health_states (
  provider_id TEXT PRIMARY KEY,
  provider_name TEXT NOT NULL,
  provider_type TEXT NOT NULL, -- 'scraper', 'api', 'torrent', 'custom'
  
  -- Health metrics
  status TEXT DEFAULT 'unknown' CHECK (status IN ('healthy', 'degraded', 'unhealthy', 'unknown')),
  last_check_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  consecutive_failures INTEGER DEFAULT 0,
  consecutive_successes INTEGER DEFAULT 0,
  
  -- Performance metrics
  avg_response_time_ms FLOAT,
  p95_response_time_ms FLOAT,
  error_rate_24h FLOAT,
  
  -- Circuit breaker
  circuit_state TEXT DEFAULT 'closed' CHECK (circuit_state IN ('closed', 'open', 'half_open')),
  circuit_opened_at TIMESTAMPTZ,
  circuit_failure_threshold INTEGER DEFAULT 5,
  circuit_recovery_timeout_ms INTEGER DEFAULT 60000,
  
  -- Metadata
  base_url TEXT,
  regions TEXT[],
  supports_dub TEXT[],
  max_resolution TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE provider_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id TEXT REFERENCES provider_health_states(provider_id),
  incident_type TEXT NOT NULL, -- 'outage', 'slowdown', 'schema_change', 'blocked'
  started_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description TEXT,
  error_samples JSONB,
  affected_routes TEXT[],
  resolved_by UUID REFERENCES auth.users(id),
  resolution_notes TEXT
);
```

### Migration 4: Torrent Core Tables

```sql
-- Migration: 004_torrent_core.sql
CREATE TABLE torrent_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identification
  info_hash TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  display_title TEXT,
  
  -- Source
  source_extension_id TEXT NOT NULL,
  source_url TEXT,
  magnet_uri TEXT,
  
  -- Metadata (parsed via anitomyscript)
  parsed_metadata JSONB,
  release_group TEXT,
  video_resolution TEXT,
  video_codec TEXT,
  audio_codec TEXT,
  source_type TEXT, -- 'BluRay', 'WEB-DL', 'TV', 'DVD', 'HDRip'
  is_dual_audio BOOLEAN DEFAULT FALSE,
  is_batch BOOLEAN DEFAULT FALSE,
  batch_episode_range INT4RANGE,
  language TEXT,
  
  -- Health
  seeders INTEGER DEFAULT 0,
  leechers INTEGER DEFAULT 0,
  downloads INTEGER DEFAULT 0,
  size_bytes BIGINT,
  upload_date TIMESTAMPTZ,
  
  -- Scoring
  quality_score FLOAT DEFAULT 0,
  match_accuracy TEXT DEFAULT 'medium' CHECK (match_accuracy IN ('high', 'medium', 'low')),
  
  -- Mapping
  tatakai_id UUID REFERENCES content_items(tatakai_id),
  matched_episode_numbers INTEGER[],
  match_confidence FLOAT,
  
  -- Lifecycle
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  is_available BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days'
);
CREATE INDEX idx_torrent_candidates_hash ON torrent_candidates(info_hash);
CREATE INDEX idx_torrent_candidates_tatakai ON torrent_candidates(tatakai_id);
CREATE INDEX idx_torrent_candidates_available ON torrent_candidates(is_available, expires_at);

CREATE TABLE torrent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_internal_id TEXT UNIQUE NOT NULL, -- "tatakai:torrent:{uuid}"
  
  -- Linking
  user_id UUID REFERENCES auth.users(id),
  tatakai_id UUID REFERENCES content_items(tatakai_id),
  episode_number INTEGER,
  
  -- Torrent state
  info_hash TEXT REFERENCES torrent_candidates(info_hash),
  status TEXT DEFAULT 'pending' 
    CHECK (status IN ('pending', 'metadata', 'downloading', 'ready', 'streaming', 'paused', 'completed', 'error', 'stopped')),
  
  -- File selection
  selected_files TEXT[], -- Relative paths within torrent
  playable_file_path TEXT,
  
  -- Progress
  progress_percent FLOAT DEFAULT 0,
  download_speed_bytes_sec BIGINT DEFAULT 0,
  upload_speed_bytes_sec BIGINT DEFAULT 0,
  total_downloaded_bytes BIGINT DEFAULT 0,
  total_uploaded_bytes BIGINT DEFAULT 0,
  peers_connected INTEGER DEFAULT 0,
  pieces_total INTEGER,
  pieces_have INTEGER,
  
  -- Playback bridge
  stream_url TEXT,
  stream_manifest TEXT,
  
  -- Safety
  is_seeding_enabled BOOLEAN DEFAULT FALSE,
  max_upload_rate_bytes_sec BIGINT,
  max_download_rate_bytes_sec BIGINT,
  
  -- Lifecycle
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
  
  -- Error handling
  error_count INTEGER DEFAULT 0,
  last_error TEXT,
  last_error_at TIMESTAMPTZ
);

CREATE TABLE torrent_cache_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  info_hash TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  cache_path TEXT NOT NULL,
  priority INTEGER DEFAULT 0,
  is_fully_cached BOOLEAN DEFAULT FALSE,
  cached_pieces INTEGER DEFAULT 0,
  total_pieces INTEGER,
  last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
  access_count INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ,
  UNIQUE(info_hash, file_path)
);

CREATE TABLE torrent_cache_eviction_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  info_hash TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  evicted_at TIMESTAMPTZ DEFAULT NOW(),
  eviction_reason TEXT, -- 'expired', 'capacity', 'manual', 'session_end'
  bytes_freed BIGINT
);
```

### Migration 5: Extension Hub Tables

```sql
-- Migration: 005_extension_hub.sql
CREATE TABLE extension_manifests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identity
  extension_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('torrent', 'onlinestream', 'custom', 'metadata')),
  
  -- Source
  main_url TEXT NOT NULL,
  update_url TEXT,
  icon_url TEXT,
  icon_base64 TEXT,
  
  -- Metadata
  description TEXT,
  speed TEXT CHECK (speed IN ('fast', 'moderate', 'slow')),
  accuracy TEXT CHECK (accuracy IN ('high', 'medium', 'low')),
  regions TEXT[],
  nsfw BOOLEAN DEFAULT FALSE,
  unregulated BOOLEAN DEFAULT FALSE,
  deprecated BOOLEAN DEFAULT FALSE,
  deprecated_reason TEXT,
  
  -- Security
  permissions TEXT[] DEFAULT '{}',
  signature TEXT,
  signed_by TEXT,
  
  -- Moderation
  submission_status TEXT DEFAULT 'pending' 
    CHECK (submission_status IN ('pending', 'under_review', 'approved', 'rejected', 'disabled')),
  submitted_by UUID REFERENCES auth.users(id),
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  
  -- Kill switch
  is_killed BOOLEAN DEFAULT FALSE,
  killed_at TIMESTAMPTZ,
  killed_by UUID REFERENCES auth.users(id),
  kill_reason TEXT,
  
  -- Usage
  install_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  health_score FLOAT DEFAULT 1.0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE extension_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extension_id TEXT REFERENCES extension_manifests(extension_id),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'submitted', 'review_started', 'approved', 'rejected', 'installed', 
    'updated', 'enabled', 'disabled', 'killed', 'executed', 'crashed', 
    'permission_denied', 'uninstalled'
  )),
  performed_by UUID REFERENCES auth.users(id),
  performed_at TIMESTAMPTZ DEFAULT NOW(),
  details JSONB,
  ip_address INET,
  user_agent TEXT
);

CREATE TABLE user_extensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  extension_id TEXT REFERENCES extension_manifests(extension_id),
  is_enabled BOOLEAN DEFAULT TRUE,
  installed_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  use_count INTEGER DEFAULT 0,
  user_settings JSONB DEFAULT '{}',
  UNIQUE(user_id, extension_id)
);
```

### Migration 6: Country Policy Table

```sql
-- Migration: 006_country_policies.sql
-- [Schema defined in Section 5.2]
-- Seed all 196 countries with default 'unclear' policy
-- Admin can then update via dashboard
```

### Migration Execution Order

```
Phase 0 (Security):
  - No DB migrations needed
  
Phase 1 (Content Graph):
  001_content_graph.sql
  006_country_policies.sql (seed only)
  
Phase 2 (Mapper):
  002_mapper_internalization.sql
  003_provider_health.sql
  
Phase 3 (Player Core):
  - No new tables (refactor only)
  
Phase 4 (Local Runtime):
  - No new tables (desktop-only)
  
Phase 5 (Torrent Core):
  004_torrent_core.sql
  
Phase 6 (Mobile):
  - No new tables
  
Phase 7 (Extension Hub):
  005_extension_hub.sql
  
Phase 8 (Production):
  - Performance indexes
  - Archive old tables
```

---

## 9. Security Hardening (Phase 0)

### 7.1 Electron Security Fixes

**File:** `desktop/main.cjs`

```javascript
// BEFORE (INSECURE)
const mainWindow = new BrowserWindow({
  webPreferences: {
    nodeIntegration: true,
    contextIsolation: false,
    webSecurity: false,
    sandbox: false,
    allowRunningInsecureContent: true,
    webviewTag: true,
  }
});

// AFTER (HARDENED)
const mainWindow = new BrowserWindow({
  webPreferences: {
    // CORE SECURITY
    nodeIntegration: false,           // NEVER enable
    contextIsolation: true,           // REQUIRED for preload safety
    webSecurity: true,                // RESTORED - enforces CORS, mixed content
    sandbox: true,                    // RESTORED - renderer sandboxed
    allowRunningInsecureContent: false, // REMOVED
    
    // REMOVED: webviewTag - no longer needed
    // If webview is absolutely required for a specific feature,
    // it must be in an isolated <webview> with its own partition
    // and explicit allowlist
    
    // PRELOAD ONLY
    preload: path.join(__dirname, 'preload.cjs'),
    
    // ADDITIONAL HARDENING
    allowPopups: false,
    safeDialogs: true,
    safeDialogsMessage: 'Tatakai is preventing this dialog',
    navigateOnDragDrop: false,
    
    // CSP via session
    additionalArguments: [`--js-flags=--max-old-space-size=4096`]
  }
});

// Navigation lockdown
mainWindow.webContents.on('will-navigate', (event, url) => {
  const allowedOrigins = [
    'https://tatakai.app',
    'https://*.tatakai.app',
    'http://localhost:*', // Dev only
  ];
  
  const parsed = new URL(url);
  const isAllowed = allowedOrigins.some(pattern => {
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace('*', '.*'));
      return regex.test(parsed.origin);
    }
    return parsed.origin === pattern;
  });
  
  if (!isAllowed) {
    event.preventDefault();
    console.warn(`Blocked navigation to: ${url}`);
  }
});

// New window lockdown
mainWindow.webContents.setWindowOpenHandler(({ url }) => {
  // Only allow external links to open in system browser
  if (url.startsWith('https://')) {
    require('electron').shell.openExternal(url);
  }
  return { action: 'deny' };
});

// Permission lockdown
mainWindow.webContents.session.setPermissionRequestHandler(
  (webContents, permission, callback, details) => {
    const allowedPermissions = ['clipboard-read', 'clipboard-write'];
    callback(allowedPermissions.includes(permission));
  }
);
```

### 7.2 Preload Bridge Narrowing

```typescript
// desktop/preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

// EXPLICITLY TYPED AND MINIMAL API SURFACE
const tatakaiRuntime = {
  // Health
  health: () => ipcRenderer.invoke('runtime:health'),
  
  // Source resolution (desktop local fallback)
  resolveEpisodeSources: (options) => 
    ipcRenderer.invoke('runtime:resolve-sources', options),
  
  // Torrent (desktop only)
  searchTorrentCandidates: (options) => 
    ipcRenderer.invoke('torrent:search', options),
  startTorrentSession: (infoHash, options) => 
    ipcRenderer.invoke('torrent:start', infoHash, options),
  stopTorrentSession: (sessionId) => 
    ipcRenderer.invoke('torrent:stop', sessionId),
  getSessionStats: (sessionId) => 
    ipcRenderer.invoke('torrent:stats', sessionId),
  
  // Cache
  readLocalCache: (key) => 
    ipcRenderer.invoke('cache:read', key),
  writeLocalCache: (key, value, ttl) => 
    ipcRenderer.invoke('cache:write', key, value, ttl),
  
  // Extension execution (sandboxed)
  executeExtension: (extensionId, method, options) => 
    ipcRenderer.invoke('extension:execute', extensionId, method, options),
  
  // Events
  onTorrentProgress: (callback) => 
    ipcRenderer.on('torrent:progress', callback),
  onPlaybackEvent: (callback) => 
    ipcRenderer.on('player:event', callback),
  
  // Cleanup
  removeAllListeners: (channel) => 
    ipcRenderer.removeAllListeners(channel),
};

contextBridge.exposeInMainWorld('tatakaiRuntime', tatakaiRuntime);

// NOTHING ELSE IS EXPOSED
```

### 7.3 Dependency Audit

```bash
# Required tools
npm audit --audit-level=moderate
# Integrate Snyk or Dependabot
# Pin all dependency versions
# Review all native modules (node-gyp)
```

---

## 10. Phased Implementation Roadmap

### Phase 0: Security, Baseline, and Contract Freeze

**Duration:** 2 weeks  
**Goal:** Make the app safe enough to evolve

| Work Item | Owner | Deliverable |
|-----------|-------|-------------|
| Harden Electron defaults | Backend | `desktop/main.cjs` security patch |
| Remove unsafe webPreferences | Backend | Security audit pass |
| Review preload boundaries | Backend | Narrowed `preload.cjs` |
| Create shared TypeScript contracts | Frontend | `TatakaiDomainContracts` package |
| Add feature-flag framework | Frontend | `FeatureFlagService` |
| Add baseline telemetry | Backend | Provider/playback/desktop health metrics |
| Document route contracts | Docs | API + component contract docs |
| Seed country policy table | Backend | 196 countries with default 'unclear' |

**Exit Criteria:**
- [ ] Desktop app passes security review
- [ ] No current features break
- [ ] Feature flags operational
- [ ] Country table seeded

---

### Phase 1: Build the Tatakai Content Graph (AniList + Jikan)

**Duration:** 4 weeks  
**Goal:** Stop scraper dependence for all browsing surfaces

| Work Item | Owner | Deliverable |
|-----------|-------|-------------|
| Build AniList GraphQL client | Frontend | `AniListClient` with rate limiting |
| Build Jikan REST fallback client | Frontend | `JikanClient` with query mapping |
| Create content ingestion pipeline | Backend | `ContentIngestionService` |
| Build content APIs | Backend | `/api/v3/content/*` endpoints |
| Migrate Home page | Frontend | Uses Content Graph |
| Migrate Search page | Frontend | Uses Content Graph |
| Migrate Trending page | Frontend | Uses Content Graph |
| Migrate Genre/Seasonal pages | Frontend | Uses Content Graph |
| Migrate Favorites | Frontend | Uses Content Graph |
| Add admin override tables | Backend | Title/poster/availability corrections |
| Implement dual-write | Backend | Old + new tables during transition |
| Add content caching layers | Frontend | IndexedDB + Service Worker |

**Exit Criteria:**
- [ ] Home, Search, Trending, Genres, Seasonal, Favorites work without scrapers
- [ ] Existing UI consumes new endpoints without design changes
- [ ] Jikan fallback works when AniList is unavailable
- [ ] All 196 country policies queryable

---

### Phase 2: Internalize Mapper Data & Formalize Provider Contracts

**Duration:** 3 weeks  
**Goal:** Remove hot-path dependence on external mapper

| Work Item | Owner | Deliverable |
|-----------|-------|-------------|
| Build mapper ingestion job | Backend | `MapperImportJob` |
| Create mapping tables | Backend | `source_mappings`, `episode_mappings` |
| Build mapping resolver | Backend | `MappingResolverService` |
| Refactor provider resolution | Backend | Internal mappings first, fallback second |
| Add mapping confidence scoring | Backend | Confidence + conflict resolution |
| Build admin conflict UI | Frontend | Mapping conflict resolution panel |
| Add provider health monitoring | Backend | `ProviderHealthService` |
| Create provider orchestrator | Backend | `ProviderOrchestrator` |

**Exit Criteria:**
- [ ] Provider resolution works from internal mappings for 90%+ of titles
- [ ] External mapper outages don't block playback
- [ ] Admin can resolve mapping conflicts

---

### Phase 3: Refactor Player into Tatakai Player Core

**Duration:** 4 weeks  
**Goal:** Same UI, modular core

| Work Item | Owner | Deliverable |
|-----------|-------|-------------|
| Split VideoPlayer into shell + core | Frontend | `VideoPlayerShell` + `PlayerCore` |
| Create source adapter registry | Frontend | `SourceAdapterRegistry` |
| Build HLS adapter | Frontend | `HLSAdapter` |
| Build direct stream adapter | Frontend | `DirectStreamAdapter` |
| Build offline file adapter | Frontend | `OfflineFileAdapter` |
| Build torrent stream adapter | Frontend | `TorrentPlaybackAdapter` (stub) |
| Formalize playback events | Frontend | `PlaybackEventBus` |
| Isolate subtitle management | Frontend | `SubtitleManager` with per-series memory |
| Isolate skip windows | Frontend | `SkipWindowManager` |
| Isolate progress sync | Frontend | `ProgressSyncManager` |
| Preserve keyboard controls | Frontend | All existing shortcuts work |

**Exit Criteria:**
- [ ] Existing watch UI looks identical
- [ ] Direct stream playback unchanged
- [ ] Torrent can plug in as another adapter later
- [ ] Per-series subtitle memory works

---

### Phase 4: Desktop Local Runtime + Extension Local Scraping + WARP

**Duration:** 5 weeks  
**Goal:** Reduce server dependence on desktop; enable device-level scraping; build network tunnel

| Work Item | Owner | Deliverable |
|-----------|-------|-------------|
| Create local runtime service | Desktop | `TatakaiLocalRuntime` (worker threads) |
| Build IPC bridge | Desktop | `LocalRuntimeBridge` via preload |
| **Build extension sandbox with fetch** | Desktop | `ExtensionSandbox` with `fetch()` injection |
| **Build local scraping worker** | Desktop | Extensions scrape directly from device |
| **Implement domain permission system** | Desktop | Per-extension domain allowlist |
| **Add extension timeout/rate limits** | Desktop | 30s request timeout, per-domain rate limits |
| Move scraper adapters to local | Desktop | Approved scrapers in worker threads |
| Add local cache layers | Desktop | Source + mapping cache |
| **Implement 1.1.1.1 DoH** | Desktop | DNS-over-HTTPS always active |
| **Implement WARP proxy tunnel** | Desktop | User-toggle SOCKS5 proxy via Cloudflare |
| **Build WARP auto-trigger** | Desktop | Auto-enable on blocked-site detection |
| **Route extension fetch through WARP** | Desktop | Transparent proxy for extension requests |
| Update renderer hooks | Frontend | `useLocalRuntime()` hook |
| Build circuit breakers | Frontend | Auto-fallback to server API |
| Add runtime health reporting | Desktop | Health metrics to telemetry |

**Request Strategy:**
- Content pages: Central API only
- Episode source resolution (desktop): Local runtime first when healthy, central API fallback
- Extension scraping (desktop): Local worker → WARP (if needed) → target site
- Web/mobile: Central API only during this phase

**Exit Criteria:**
- [ ] Desktop source fallback works without UI changes
- [ ] Extensions can scrape locally with proper permissions
- [ ] WARP tunnel connects and routes traffic
- [ ] Server outages have lower impact on desktop
- [ ] No provider paths removed

---

### Phase 5: Build Tatakai Torrent Core for Desktop Alpha

**Duration:** 5 weeks  
**Goal:** First-party torrent search and playback

| Work Item | Owner | Deliverable |
|-----------|-------|-------------|
| Integrate anitomyscript | Desktop | Filename parser for all torrent metadata |
| Build torrent candidate discovery | Desktop | `TorrentSearchService` |
| Build release quality scorer | Desktop | `ReleaseQualityScorer` |
| Build episode-file matcher | Desktop | `TorrentEpisodeMatcher` |
| Build torrent session manager | Desktop | `TorrentSessionManager` |
| Build piece prioritization | Desktop | Playback-optimized piece selection |
| Build streaming bridge | Desktop | Byte-range server for player |
| Build cache management | Desktop | LRU cache with eviction |
| Add country policy gating | Frontend | VPN warning before torrent features |
| Add bandwidth/safety controls | Desktop | Per-session limits |
| Build desktop-only feature flags | Backend | Progressive rollout controls |
| Integrate with Player Core | Frontend | `TorrentPlaybackAdapter` |

**Important Rule:** Direct-stream remains default until torrent quality/stability proven.

**Exit Criteria:**
- [ ] Users can search/select/start/stop torrent playback on desktop
- [ ] Player UI visually unchanged
- [ ] Direct-stream flows work exactly as before
- [ ] Country policy enforced (VPN warning for illegal jurisdictions)

---

### Phase 6: Mobile Convergence Strategy

**Duration:** 3 weeks  
**Goal:** Same UI contracts, stable mobile experience

| Work Item | Owner | Deliverable |
|-----------|-------|-------------|
| Mobile uses Content Graph | Frontend | Same as desktop |
| Mobile uses Player Core | Frontend | Same adapters, server-first |
| Strengthen mobile caches | Mobile | Aggressive IndexedDB caching |
| Evaluate native bridge | Mobile | Research only, no implementation |
| Keep server-first policy | Mobile | No forced desktop parity |

**Mobile Policy:**
- Phase 6A: Server-first for all source playback
- Phase 6B: May consume torrent metadata only (no download)
- Phase 6C: No unstable/battery-heavy background behavior

**Exit Criteria:**
- [ ] Mobile benefits from Content Graph and Player Core
- [ ] No mobile regression from desktop work

---

### Phase 7: Moderated Extension Platform & Admin Expansion

**Duration:** 5 weeks  
**Goal:** Formal extension platform with moderation; local scraping permissions; WARP management

| Work Item | Owner | Deliverable |
|-----------|-------|-------------|
| Define extension manifest schema | Backend | `ExtensionManifestSchema` |
| Define permission scopes | Backend | Network, parsing, metadata, playback |
| **Define local scraping permissions** | Backend | `network:fetch`, `network:domain:*`, `parse:html` |
| Build Web Worker sandbox | Desktop | Isolated extension execution |
| **Build local scraping runtime** | Desktop | `LocalScraperRuntime` with fetch injection |
| **Build extension fetch interceptor** | Desktop | Routes through WARP when enabled |
| Build admin review workflow | Frontend | `ExtensionReviewWorkflow` |
| **Build local scraping audit panel** | Frontend | View extension network activity |
| Build signing system | Backend | Cryptographic extension signatures |
| Build kill-switch system | Backend | Instant revocation capability |
| Build extension audit log | Backend | `ExtensionAuditLog` |
| Build provider ops dashboard | Frontend | `ProviderOpsDashboard` |
| **Build WARP management panel** | Frontend | `WarpSettingsPanel` |
| Add extension health reporting | Backend | Crash/failure telemetry |

**Exit Criteria:**
- [ ] Extensions are reviewed, signed, and revocable
- [ ] Extensions can scrape locally with proper permissions
- [ ] Extension network activity is auditable
- [ ] Tatakai can expand source coverage safely
- [ ] No unrestricted code execution possible

---

### Phase 8: Optimization, Hardening, and Production Rollout

**Duration:** 4 weeks  
**Goal:** Secure, fast, resilient production state

| Work Item | Owner | Deliverable |
|-----------|-------|-------------|
| Optimize source caching | Backend | Aggressive dedupe + retry |
| Move heavy work off renderer | Desktop | All provider/torrent in workers |
| Add dependency audit | DevOps | Snyk/Dependabot integration |
| Add supply-chain monitoring | DevOps | npm audit automation |
| Build integration tests | QA | Content, provider, player, torrent, admin |
| Build security tests | QA | Electron, IPC, sandbox, torrent parsing |
| Performance budgets | Frontend | Bundle size, render time targets |
| Security checklist | Security | Pre-release security review |
| Rollout playbook | DevOps | Canary → staged → broad release |
| Rollback playbook | DevOps | Emergency rollback procedures |

**Exit Criteria:**
- [ ] No critical Electron security findings
- [ ] No major regressions in playback or community features
- [ ] Torrent desktop alpha stable for controlled public use

---

## 11. Target Architecture

```
                         +-------------------------+
                         |  Tatakai Content Graph  |
                         |  AniList-anchored DB    |
                         |  Jikan fallback         |
                         |  Tatakai internal IDs   |
                         +-----------+-------------+
                                     |
                    +----------------+----------------+
                    |                                 |
         +----------v----------+           +----------v-----------+
         | Central Tatakai API |           | Admin + Moderation   |
         | /api/v3/content/*   |           | comments/extensions  |
         | /api/v3/mappings/*  |           | provider ops         |
         | /api/v3/providers/* |           | country policies     |
         | fallback authority  |           |                      |
         +----------+----------+           +----------+-----------+
                     |                                 |
     +---------------+----------------+                |
     |                                |                |
 +---v----------------+   +-----------v------------+   |
 | Web Renderer       |   | Desktop Renderer       |   |
 | server-first       |   | same UI as web         |   |
 | AniList/Jikan      |   |                        |   |
 | DoH DNS only       |   | DoH DNS + WARP proxy   |   |
 +--------------------+   +-----------+------------+   |
                                      |
                          +-----------v------------+
                          | Local Runtime          |
                          | TS workers + IPC       |
                          |                        |
                          | ┌──────────────────┐   |
                          | │ Extension Sandbox│   |
                          | │ Web Workers      │   │
                          | │ Local scraping   │   │
                          │ │ fetch() → parse  │   │
                          | └──────────────────┘   │
                          |                        │
                          | ┌──────────────────┐   │
                          | │ Torrent Core     │   │
                          | │ Session manager  │   │
                          | │ Piece prioritizer│   │
                          | └──────────────────┘   │
                          +-----------+------------+
                                      |
                          +-----------v------------+
                          | 1.1.1.1 WARP Tunnel    |
                          | (optional, user toggle)│
                          |                        │
                          | • DNS-over-HTTPS       │
                          | • SOCKS5 proxy         │
                          | • Geo-block bypass     │
                          | • IP mask for scraping │
                          +-----------+------------+
                                      |
                          +-----------v------------+
                          | Tatakai Player Core    |
                          | HLS/Direct/Offline/    |
                          | Torrent adapters       |
                          | same visual UI         |
                          +------------------------+

+--------------------+
| Mobile Renderer    |
| same UI contracts  |
| server-first       │
| Content Graph      │
| Player Core        │
| DoH DNS (limited)  │
+--------------------+
```

---

## 12. API Contract Evolution

### Current v2 → Target v3

| Current Endpoint | Target Endpoint | Status |
|-----------------|-----------------|--------|
| `/api/anime/home` | `/api/v3/content/home` | New |
| `/api/anime/search` | `/api/v3/content/search` | New |
| `/api/anime/trending` | `/api/v3/content/trending` | New |
| `/api/anime/genre/*` | `/api/v3/content/genre` | New |
| `/api/anime/seasonal` | `/api/v3/content/seasonal` | New |
| `/api/anime/detail/:id` | `/api/v3/content/:tatakaiId` | New |
| `/api/providers/*` | `/api/v3/providers/sources` | Refactor |
| `/api/stream/*` | `/api/v3/playback/sources` | Refactor |
| — | `/api/v3/mappings/resolve` | New |
| — | `/api/v3/mappings/conflicts` | New |
| — | `/api/v3/extensions/list` | New |
| — | `/api/v3/extensions/submit` | New |
| — | `/api/v3/admin/countries` | New |
| — | `/api/v3/admin/providers/health` | New |
| — | `/api/v3/admin/extensions/review` | New |

### Backwards Compatibility

- v2 endpoints remain operational during entire migration
- v3 endpoints return superset data (old fields + new fields)
- Frontend feature flags control which endpoints are called
- Deprecation timeline: v2 retired 6 months after v3 stable

---

## 13. Core Module Specifications

### 11.1 Tatakai Content Graph

**File:** `src/core/content/`  
**API:** `TatakaiAPI/src/content/`

```typescript
// Key functions
async function ingestAniListCatalog(page?: number): Promise<IngestionResult>;
async function ingestJikanFallback(malId: number): Promise<Partial<ContentItem>>;
async function upsertContentNode(media: AniListMedia): Promise<string>; // returns tatakaiId
async function assignTatakaiId(anilistId?: number, malId?: number): Promise<string>;
async function resolveTatakaiIdByAniList(anilistId: number): Promise<string | null>;
async function resolveTatakaiIdByMal(malId: number): Promise<string | null>;
async function resolveEpisodeInternalId(tatakaiId: string, episodeNumber: number): Promise<string>;
async function buildTrendingFeed(limit?: number): Promise<ContentItem[]>;
async function buildHomeFeed(userId?: string): Promise<HomeFeedSections>;
async function buildSeasonalFeed(season: string, year: number): Promise<ContentItem[]>;
async function searchContent(query: string, filters?: SearchFilters): Promise<SearchResult>;
async function syncFavoritesMetadata(userId: string): Promise<void>;
```

### 11.2 Tatakai Mapper Ingestor

**File:** `src/core/mappings/`  
**API:** `TatakaiAPI/src/mappings/`

```typescript
// Key functions
async function importMapperShard(shardPath: string, runId: string): Promise<ImportResult>;
async function normalizePlatformIds(rawMappings: RawMapping[]): Promise<NormalizedMapping[]>;
async function upsertSourceMapping(tatakaiId: string, mapping: NormalizedMapping): Promise<void>;
async function resolveProviderMap(tatakaiId: string, providerId: string): Promise<string | null>; // provider-specific ID
async function resolveProviderEpisodeMap(tatakaiId: string, episodeNumber: number, providerId: string): Promise<string | null>;
async function reconcileMappingConflicts(): Promise<ConflictReport>;
async function markMappingConfidence(tatakaiId: string, score: number, reason: string): Promise<void>;
```

### 11.3 Tatakai Provider Orchestrator

**File:** `src/core/providers/`  
**API:** `TatakaiAPI/src/providers/`

```typescript
// Key functions
async function fetchProviderSources(tatakaiId: string, episodeNumber: number, options: SourceOptions): Promise<StreamingCandidate[]>;
async function mergeStreamingSources(candidates: StreamingCandidate[][]): Promise<StreamingCandidate[]>;
async function mergeSubtitleTracks(tracks: SubtitleTrack[][]): Promise<SubtitleTrack[]>;
async function scoreSourceCandidate(candidate: StreamingCandidate): Promise<number>;
async function resolveProviderContext(tatakaiId: string, providerId: string): Promise<ProviderContext>;
async function fallbackToLocalRuntime(options: SourceOptions): Promise<StreamingCandidate[]>;
async function fallbackToServerApi(options: SourceOptions): Promise<StreamingCandidate[]>;
async function recordProviderHealth(providerId: string, result: HealthCheckResult): Promise<void>;
```

### 11.4 Tatakai Local Runtime Bridge

**File:** `desktop/runtime/`  
**IPC:** `desktop/preload.cjs`

```typescript
// Key functions
function isLocalRuntimeAvailable(): boolean;
async function requestLocalSearch(query: string): Promise<LocalSearchResult[]>;
async function requestLocalEpisodeSources(tatakaiId: string, episode: number): Promise<StreamingCandidate[]>;
async function requestTorrentSessionStart(infoHash: string, options: TorrentOptions): Promise<TorrentSession>;
async function requestTorrentSessionStop(sessionId: string): Promise<void>;
async function readLocalCacheState(key: string): Promise<CacheEntry | null>;
async function reportLocalRuntimeHealth(): Promise<RuntimeHealth>;
```

### 11.5 Tatakai Torrent Core

**File:** `src/core/torrent/`  
**Desktop:** `desktop/runtime/torrent/`

```typescript
// Key functions
async function searchTorrentCandidates(options: TorrentSearchOptions): Promise<TorrentCandidate[]>;
async function scoreTorrentCandidate(candidate: TorrentCandidate, preferences: UserPreferences): Promise<number>;
async function resolveTorrentEpisodeFiles(candidate: TorrentCandidate, tatakaiId: string): Promise<TorrentFile[]>;
async function startTorrentSession(infoHash: string, options: SessionOptions): Promise<TorrentSession>;
async function selectPlayableFile(sessionId: string, filePath: string): Promise<void>;
async function prioritizePlaybackPieces(sessionId: string, timeRanges: TimeRange[]): Promise<void>;
async function createPlaybackManifest(sessionId: string): Promise<string>; // HLS/DASH manifest URL
async function stopTorrentSession(sessionId: string): Promise<void>;
async function evictTorrentCache(targetBytes?: number): Promise<number>; // bytes freed

// Release quality (Shiru + thewiki.moe inspired)
async function parseReleaseName(filename: string): Promise<ParsedReleaseMetadata>;
async function normalizeReleaseMetadata(parsed: ParsedReleaseMetadata): Promise<NormalizedRelease>;
async function scoreReleaseQuality(release: NormalizedRelease, preferences: UserPreferences): Promise<number>;
async function scoreMuxQuality(release: NormalizedRelease): Promise<number>;
async function selectPreferredReleaseVariant(candidates: TorrentCandidate[], preferences: UserPreferences): Promise<TorrentCandidate>;
async function buildDisplayTitleFromRelease(release: NormalizedRelease): Promise<string>;
async function detectBatchTorrentLayout(files: TorrentFile[]): Promise<BatchLayout>;
async function matchTorrentFileToEpisode(file: TorrentFile, episodeMetadata: EpisodeItem[]): Promise<number | null>;
```

**Quality Scoring Signals:**
1. Source quality (BluRay > WEB-DL > TV > HDRip)
2. Codec compatibility (H.264/H.265/AV1 vs player capabilities)
3. Resolution match (prefer user preference)
4. Audio track availability (dual audio > sub only)
5. Subtitle quality (styled ASS > plain SRT)
6. Release group trust score
7. Mux/remux quality hints
8. Seed health and swarm stability
9. Episode naming confidence vs Tatakai metadata

### 11.6 Tatakai Player Core

**File:** `src/core/player/`

```typescript
// Key functions
async function attachPlaybackSource(source: PlaybackSource): Promise<void>;
async function switchPlaybackSource(source: PlaybackSource): Promise<void>;
async function attachSubtitleTrack(track: SubtitleTrack): Promise<void>;
async function setPlaybackMode(mode: 'hls' | 'direct' | 'torrent' | 'offline'): Promise<void>;
async function setSkipWindows(windows: SkipWindow[]): Promise<void>;
async function syncPlaybackProgress(progress: PlaybackProgress): Promise<void>;
async function capturePlaybackError(error: PlaybackError): Promise<RecoveryStrategy>;
async function recoverFromPlaybackError(strategy: RecoveryStrategy): Promise<boolean>;
async function emitPlaybackEvent(event: PlaybackEvent): Promise<void>;

// Source adapters
interface SourceAdapter {
  readonly type: string;
  canHandle(source: PlaybackSource): boolean;
  attach(player: HTMLVideoElement, source: PlaybackSource): Promise<void>;
  detach(): Promise<void>;
  getCurrentTime(): number;
  getDuration(): number;
  seek(time: number): Promise<void>;
}

// Adapters: HLSAdapter, DirectStreamAdapter, OfflineFileAdapter, TorrentPlaybackAdapter
```

### 11.7 Tatakai Extension Hub

**File:** `src/core/extensions/`  
**Desktop:** `desktop/runtime/extensions/`

```typescript
// Key functions
async function validateExtensionManifest(manifest: ExtensionManifest): Promise<ValidationResult>;
async function reviewExtensionSubmission(submission: ExtensionSubmission): Promise<ReviewResult>;
async function approveExtensionVersion(extensionId: string, version: string, reviewerId: string): Promise<void>;
async function disableExtension(extensionId: string, reason: string): Promise<void>;
async function resolveExtensionPermissions(extensionId: string): Promise<Permission[]>;
async function executeExtensionInSandbox(extensionId: string, method: string, options: object): Promise<unknown>;
async function recordExtensionAuditEvent(event: AuditEvent): Promise<void>;
```

### 11.8 Tatakai Admin Ops

**File:** `src/components/admin/`  
**API:** `TatakaiAPI/src/admin/`

```typescript
// Key functions
async function reviewProviderIncident(incidentId: string, resolution: IncidentResolution): Promise<void>;
async function reviewMappingConflict(conflictId: string, resolution: MappingResolution): Promise<void>;
async function approveMarketplaceItem(itemId: string): Promise<void>;
async function approveCustomSource(sourceId: string): Promise<void>;
async function moderateComment(commentId: string, action: ModerationAction): Promise<void>;
async function moderateForumPost(postId: string, action: ModerationAction): Promise<void>;
async function disableProviderRoute(providerId: string, reason: string): Promise<void>;
async function publishContentOverride(tatakaiId: string, overrides: ContentOverrides): Promise<void>;
async function updateCountryPolicy(isoCode: string, updates: PolicyUpdate, adminId: string): Promise<void>;
async function getCountryPolicyAuditLog(isoCode: string): Promise<AuditEntry[]>;
```

### 11.9 Country Policy Manager

**File:** `src/components/admin/CountryPolicyManager.tsx`

```typescript
// Key functions
async function getAllCountryPolicies(): Promise<CountryPolicy[]>;
async function updateCountryPolicy(isoCode: string, updates: Partial<CountryPolicy>): Promise<void>;
async function bulkUpdatePolicies(updates: BulkPolicyUpdate[]): Promise<void>;
async function importPoliciesFromCSV(csvData: string): Promise<ImportResult>;
async function exportPoliciesToCSV(): Promise<string>;
async function getPolicyAuditLog(isoCode?: string): Promise<AuditEntry[]>;
```

### 11.10 Extension Local Scraping Runtime

**File:** `desktop/runtime/extensions/local-scraper.ts`  
**Worker:** `desktop/runtime/workers/extension-worker.ts`

```typescript
// Key functions
async function createScraperWorker(extensionId: string): Promise<Worker>;
async function executeLocalScrape(
  extensionId: string,
  method: 'single' | 'batch' | 'movie',
  options: SourceOptions
): Promise<SourceResult[]>;
async function validateFetchPermission(extensionId: string, url: string): Promise<boolean>;
async function interceptFetch(
  extensionId: string,
  url: string,
  init?: RequestInit
): Promise<Response>;
async function enforceRequestLimits(extensionId: string): Promise<void>;
async function parseHtmlInWorker(html: string): Promise<CheerioLikeParser>;
async function injectRuntimeAPI(worker: Worker, manifest: ExtensionManifest): Promise<void>;

// Runtime API injected into worker
interface ExtensionRuntimeAPI {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  parseHtml: (html: string) => CheerioLikeParser;
  parseJson: (json: string) => unknown;
  anitomyscript: AnitomyScript;
  regex: { match: Function; replace: Function };
  // No eval, no Function, no XMLHttpRequest, no WebSocket
}
```

**Security boundaries:**
- Web Worker CSP: `script-src 'self'; default-src 'none'`
- Fetch domain allowlist from manifest permissions
- 30-second request timeout
- 10MB response size cap
- Per-domain rate limiting (3 req/sec default)
- No access to `document`, `window`, `localStorage`, `indexedDB`

### 11.11 1.1.1.1 WARP Tunnel

**File:** `desktop/runtime/warp-tunnel.ts`  
**Config:** `src/core/network/warp-config.ts`

```typescript
// Key functions
async function initializeDoH(): Promise<void>; // Always on
async function resolveViaDoH(hostname: string): Promise<string>;
async function initializeWarpProxy(): Promise<void>; // User toggle
async function enableWarp(): Promise<void>;
async function disableWarp(): Promise<void>;
async function setWarpMode(mode: 'auto' | 'always' | 'on-demand'): Promise<void>;
async function routeThroughWarp(url: string): Promise<boolean>; // Should this URL use WARP?
async function fetchThroughWarp(url: string, init?: RequestInit): Promise<Response>;
async function getWarpStatus(): Promise<WarpStatus>;
async function testWarpConnectivity(): Promise<ConnectivityResult>;
async function autoEnableWarpForDomain(domain: string): Promise<void>;
async function getWarpRoutingLog(): Promise<RoutingLogEntry[]>;

// Electron integration
async function configureElectronProxy(session: Electron.Session, enabled: boolean): Promise<void>;

// Torrent integration
async function configureTorrentWarpRouting(config: TorrentWarpConfig): Promise<void>;

interface WarpStatus {
  enabled: boolean;
  mode: 'auto' | 'always' | 'on-demand';
  connected: boolean;
  egressCity?: string;
  egressIp?: string;
  latencyMs?: number;
  bytesTransferred: { up: number; down: number };
}
```

**Configuration:**
```typescript
interface WarpConfig {
  // DNS (always active)
  dohEndpoint: 'https://cloudflare-dns.com/dns-query';
  dohFallback: 'https://1.1.1.1/dns-query';
  
  // Proxy (user toggle)
  enabled: boolean;
  mode: 'auto' | 'always' | 'on-demand';
  proxyHost: '127.0.0.1';
  proxyPort: number; // Dynamic or fixed
  proxyType: 'socks5' | 'http';
  
  // Routing rules
  routeExtensions: boolean;
  routeTorrent: boolean;
  routeApi: boolean;
  routePlayer: boolean;
  bypassList: string[]; // Never route through WARP
  
  // Auto-trigger
  autoTrigger: {
    enabled: boolean;
    failedRequestsThreshold: number;
    httpStatusCodes: number[];
    errorPatterns: string[];
  };
}
```

---

## 14. Mapping Optimization Strategy

### 12.1 The Problem

Tatakai needs to map:
1. **AniList ID → Provider IDs** (for source resolution)
2. **AniList ID → External IDs** (AniDB, TVDB, IMDB, TMDB)
3. **Episode numbers → Provider episode IDs**
4. **Torrent releases → Tatakai content + episodes**
5. **Multiple provider results → unified candidate list**

### 12.2 Optimized Mapping Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MAPPING RESOLUTION FLOW                   │
└─────────────────────────────────────────────────────────────┘

User requests Episode 5 of "Attack on Titan"
    │
    ▼
┌─────────────────────────┐
│ Tatakai Content Graph   │
│ tatakai_id = "tata-123" │
│ anilist_id = 16498      │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Source Mappings Table   │
│ Lookup: tata-123        │
│ → anidb_aid = 9541      │
│ → tvdb_id = 267440      │
│ → provider_ids: {       │
│     gogoanime: "shingeki-no-kyojin",
│     zoro: "attack-on-titan-112",
│     ...                 │
│   }                     │
└───────────┬─────────────┘
            │
    ┌───────┴───────┐
    │               │
    ▼               ▼
┌─────────┐   ┌─────────────┐
│Provider │   │Torrent      │
│Resolver │   │Resolver     │
│         │   │             │
│Use      │   │Use titles[] │
│provider │   │+ anidb_aid  │
│mappings │   │+ anitomy    │
│directly │   │for matching │
└────┬────┘   └──────┬──────┘
     │               │
     └───────┬───────┘
             │
             ▼
    ┌─────────────────┐
    │ Unified Results │
    │ Streaming +     │
    │ Torrent merged  │
    │ & scored        │
    └─────────────────┘
```

### 12.3 Provider Mapping Optimization

**Current:** Each provider scrapes independently, often re-searching by title  
**Target:** Direct ID mapping where available, title search only as fallback

```typescript
// Optimized provider resolution
async function resolveProviderSourcesOptimized(
  tatakaiId: string, 
  episodeNumber: number,
  providerId: string
): Promise<StreamingCandidate[]> {
  
  // 1. Try direct mapping first (fastest)
  const mapping = await mappingResolver.resolveProviderMap(tatakaiId, providerId);
  if (mapping) {
    const episodeMap = await mappingResolver.resolveProviderEpisodeMap(
      tatakaiId, episodeNumber, providerId
    );
    if (episodeMap) {
      return providerClient.fetchById(mapping, episodeMap);
    }
  }
  
  // 2. Try cross-ID mapping (AniDB → provider)
  const anidbAid = await mappingResolver.resolveAniDbAid(tatakaiId);
  if (anidbAid) {
    const result = await providerClient.searchByAniDb(anidbAid, episodeNumber);
    if (result.length > 0) return result;
  }
  
  // 3. Fallback: title search (slowest, least reliable)
  const titles = await contentGraph.getAllTitles(tatakaiId);
  return providerClient.searchByTitles(titles, episodeNumber);
}
```

### 12.4 Torrent Mapping Optimization

```typescript
// Optimized torrent resolution
async function resolveTorrentCandidatesOptimized(
  tatakaiId: string,
  episodeNumber: number,
  extensions: ExtensionManifest[]
): Promise<TorrentCandidate[]> {
  
  const content = await contentGraph.getById(tatakaiId);
  const options: SourceOptions = {
    anilistId: content.anilistId,
    media: content.aniListData,
    mappingsA: await mappingResolver.getCrossPlatformMappings(tatakaiId),
    mappingsE: await mappingResolver.getEpisodeMappings(tatakaiId, episodeNumber),
    anidbAid: content.anidbAid,
    anidbEid: await mappingResolver.getAniDbEpisodeId(tatakaiId, episodeNumber),
    tvdbAid: content.tvdbId,
    titles: content.allTitles,
    episode: episodeNumber,
    episodeCount: content.episodes,
    resolution: userPreferences.preferredResolution,
    exclusions: userPreferences.excludedCodecs,
    tatakaiId,
    preferredLanguage: userPreferences.preferredLanguage,
    countryCode: userPreferences.countryCode,
  };
  
  // Execute all extensions in parallel (Shiru-style)
  const results = await Promise.allSettled(
    extensions.map(ext => extensionRuntime.execute(ext.id, 'single', options))
  );
  
  // Flatten, parse, score, dedupe
  const candidates = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value as TorrentResult[])
    .map(r => ({
      ...r,
      parsed: anitomyscript.parse(r.title),
      tatakaiId,
      matchedEpisodeNumbers: matchEpisodesFromParsed(r.parsed, episodeNumber, content.episodes),
    }));
  
  // Quality scoring
  const scored = candidates.map(c => ({
    ...c,
    qualityScore: scoreTorrentCandidate(c, userPreferences),
  }));
  
  // Deduplicate by info_hash
  const deduped = dedupeByHash(scored);
  
  // Sort by composite score
  return deduped.sort((a, b) => b.qualityScore - a.qualityScore);
}
```

### 12.5 Caching Strategy for Mappings

| Cache Level | Key Pattern | TTL | Purpose |
|-------------|-------------|-----|---------|
| L1 (Memory) | `map:{tatakaiId}:{providerId}` | 5 min | Hot path provider lookups |
| L2 (IndexedDB) | `map:{tatakaiId}` | 1 hour | Full mapping record |
| L3 (API Cache) | `v3:mappings:{tatakaiId}` | 6 hours | Central fallback |
| L4 (Static) | `mapper:shard:{version}` | 7 days | Mapper ingestion shards |

### 12.6 anitomyscript Integration

```typescript
// src/core/torrent/anitomy-wrapper.ts
import anitomyscript from 'anitomyscript';

export function parseAnimeFilename(filename: string): ParsedReleaseMetadata {
  const result = anitomyscript.parse(filename);
  
  return {
    releaseGroup: result.release_group,
    animeTitle: result.anime_title,
    episodeNumber: result.episode_number ? parseInt(result.episode_number) : undefined,
    episodeTitle: result.episode_title,
    videoResolution: result.video_resolution,
    videoTerm: result.video_term,
    audioTerm: result.audio_term,
    source: result.source,
    version: result.release_version ? parseInt(result.release_version) : undefined,
    checksum: result.file_checksum,
    // Derived fields
    language: detectLanguageFromFilename(filename),
    isDualAudio: detectDualAudio(filename),
    isBatch: detectBatchFromFilename(filename),
  };
}

// Exposed to extensions via worker injection
// Extensions can call: this.anitomyscript.parse(filename)
```

---

## 15. No-Regression Guardrails

### 13.1 Features That Must Not Break

| Feature | Current State | Guardrail |
|---------|--------------|-----------|
| Watch flows | 12+ providers, proxy routing | All existing source paths preserved |
| Source selection | Server picker, quality picker | Same UI, new core underneath |
| Comments | Supabase-backed | Unchanged tables, unchanged APIs |
| Forum | Supabase-backed | Unchanged |
| Admin/moderation | Existing dashboard | Unchanged + new panels added |
| Provider fanout | 12+ providers | No providers removed during migration |
| Manga support | Existing flows | Unchanged |
| Community profiles | Existing | Unchanged |
| Marketplace | Existing moderated | Evolved into Extension Hub, old data migrated |
| Custom sources | Existing | Migrated to extension format |
| Desktop packaging | Electron | Security hardened, features preserved |
| Mobile packaging | Capacitor | No forced parity, server-first |
| 13 dub languages | All supported | Preserved |
| 30+ servers | All supported | Preserved |
| MAL sync | Existing | Preserved, now uses Content Graph IDs |
| AniList sync | Existing | Preserved, now primary |
| 25+ themes | All supported | Preserved |
| Lite Mode | Existing | Preserved |
| Trace.moe search | Existing | Preserved |
| ML recommendations | Existing | Enhanced with Content Graph vectors |
| HLS player | Custom | Core refactored, UI preserved |
| Subtitles | Existing | Enhanced with per-series memory |
| PiP | Existing | Preserved |
| Screenshots | Existing | Preserved |
| Offline handling | Existing | Enhanced with local runtime |
| Keyboard controls | Existing | Preserved |

### 13.2 Technical Guardrails

1. **Feature flags:** All new behavior behind `FEATURE_*` flags
2. **Dual-write:** Old and new tables written simultaneously during migration
3. **API versioning:** v2 stable, v3 additive, no breaking changes
4. **Component contracts:** Documented props/interfaces for all major components
5. **Canary rollouts:** Desktop torrent features on canary channel first
6. **Rollback scripts:** Every migration has a tested rollback
7. **A/B testing:** New content endpoints tested alongside old ones
8. **Error boundaries:** Player, content, and extension areas have error boundaries
9. **Graceful degradation:** AniList down → Jikan → cached → stale data
10. **Performance budgets:** Bundle size, render time, API response time tracked

---

## 16. Appendices

### Appendix A: 196-Country Seed Data Structure

```typescript
// scripts/seed-countries.ts
interface CountrySeedEntry {
  isoCode: string;        // "DE"
  isoCode3: string;       // "DEU"
  countryName: string;    // "Germany"
  countryNameLocal: string; // "Deutschland"
  torrentPolicy: 'legal' | 'decriminalized' | 'illegal' | 'unclear' | 'vpn_required';
  enforcementLevel: 'none' | 'low' | 'moderate' | 'high' | 'severe' | 'unknown';
  downloadingIllegal: boolean;
  uploadingIllegal: boolean;
  streamingIllegal: boolean;
  finesApplicable: boolean;
  imprisonmentPossible: boolean;
  ispMonitoring: boolean;
  specificLaw?: string;
  lawReferenceUrl?: string;
  notes?: string;
}

// Data sources for verification:
// - Wikipedia "File sharing copyright laws"
// - EFF international copyright resources
// - Local legal databases
// - Quarterly review cycle
```

**Maintenance Process:**
1. Quarterly legal review (admin task)
2. User reports via "Report incorrect policy" button
3. Admin verifies and updates
4. Audit log records change
5. Affected users re-prompted on next visit

### Appendix B: File Structure Evolution

```
Current Structure:
src/
  components/
    video/VideoPlayer.tsx
    admin/MarketplaceManager.tsx
    admin/CustomSourceManager.tsx
  hooks/
    useComments.ts
    useForum.ts
  services/
    provider.service.ts
    streaming.service.ts
  lib/api/
    api-client.ts
desktop/
  main.cjs
  preload.cjs

Target Structure:
src/
  core/
    content/           # Content Graph
      anilist-client.ts
      jikan-client.ts
      content-graph.ts
      dub-tracker.ts
    providers/         # Provider Orchestrator
      orchestrator.ts
      health-monitor.ts
      circuit-breaker.ts
    player/            # Player Core
      player-core.ts
      event-bus.ts
      adapters/
        hls-adapter.ts
        direct-adapter.ts
        offline-adapter.ts
        torrent-adapter.ts
      subtitle-manager.ts
      skip-window-manager.ts
      subtitle-memory.ts
    torrent/           # Torrent Core (types + desktop bridge)
      types.ts
      quality-scorer.ts
      release-parser.ts
      episode-matcher.ts
      desktop-bridge.ts
    extensions/        # Extension Hub
      abstract-source.ts
      manifest-schema.ts
      permission-system.ts
      sandbox.ts
    mappings/          # Mapper
      resolver.ts
      importer.ts
      conflict-resolver.ts
  components/
    video/
      VideoPlayerShell.tsx   # Visual shell only
      PlayerControls.tsx
    admin/
      CountryPolicyManager.tsx
      ProviderOpsDashboard.tsx
      ExtensionReviewPanel.tsx
      MappingConflictResolver.tsx
  hooks/
    useContentGraph.ts
    useLocalRuntime.ts
    useTorrentSession.ts
    useExtensionSandbox.ts
    useCountryPolicy.ts
desktop/
  main.cjs                    # Hardened
  preload.cjs                 # Narrowed
  runtime/
    local-runtime.ts
    workers/
      scraper-worker.ts
      torrent-worker.ts
      extension-worker.ts
    torrent/
      session-manager.ts
      piece-prioritizer.ts
      cache-manager.ts
      stream-server.ts
TatakaiAPI/
  src/
    content/
    mappings/
    providers/
    extensions/
    admin/
```

### Appendix C: Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Metadata primary | AniList GraphQL | Richest anime data, native trending/seasonal |
| Metadata fallback | Jikan REST v4 | Reliable MAL mirror, different data shapes |
| Extension runtime | Web Workers | Isolated, no DOM access, Shiru-proven |
| Extension scraping | Local fetch via worker | Reduces server load, bypasses datacenter IP blocks |
| Filename parsing | anitomyscript | Battle-tested, Shiru uses it, JS-native |
| Torrent parsing | WebTorrent or libtorrent (wasm) | Evaluate both; WebTorrent simpler, libtorrent more complete |
| Desktop IPC | Electron preload + IPC | Narrow surface, typed, auditable |
| DNS resolution | 1.1.1.1 DoH | Bypass ISP blocks, prevent DNS poisoning, always encrypted |
| Geo-block bypass | Cloudflare WARP proxy | Application-level, not system VPN, 150+ egress cities |
| Local storage | IndexedDB + SQLite (via better-sqlite3) | Structured data in SQLite, blobs in IndexedDB |
| Caching | LRU + TTL | Aggressive caching for mappings and content |
| Vector search | pgvector (Supabase) | ML recommendations, similar anime |
| Feature flags | Unleash or custom | Simple boolean + gradual rollout |

### Appendix D: Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| AniList rate limits | Medium | High | Jikan fallback, aggressive caching, respect 90/min |
| Jikan also rate-limited | Low | High | Cached data serves stale content gracefully |
| Electron security regression | Low | Critical | Security review gate, automated audit |
| Torrent legal issues | Medium | High | Country policy system, VPN warnings, no seeding default |
| Extension sandbox escape | Low | Critical | Web Workers, no DOM access, permission system, kill switch |
| **Extension fetches malicious domain** | Low | High | Domain allowlist, admin review, fetch interceptor |
| **WARP connection unstable** | Medium | Medium | Auto-fallback to direct, health monitoring |
| **Site blocks WARP egress IPs** | Medium | Medium | Multiple egress cities, server API fallback |
| **Local scraping leaks user IP** | Low | High | WARP routing for scraping, DoH always on |
| **Residential IP rate-limited** | Medium | Medium | WARP auto-trigger, server fallback |
| Mapper data stale | Medium | Medium | Weekly ingestion jobs, manual override capability |
| Provider breakage during migration | Medium | High | Dual-write, circuit breakers, fallback chains |
| Mobile battery drain from desktop features | Medium | Medium | Mobile server-first policy, no forced parity |
| Community backlash from changes | Low | Medium | No UI changes during core refactor, feature flags |

### Appendix E: Success Metrics by Phase

| Phase | Metric | Target |
|-------|--------|--------|
| 0 | Security audit findings | 0 critical, 0 high |
| 0 | Feature flag coverage | 100% of new features |
| 1 | Content API response time | p95 < 200ms |
| 1 | AniList availability | 99.5% (with Jikan fallback) |
| 1 | Scraper dependence (browsing) | 0% |
| 2 | Mapping resolution hit rate | > 90% |
| 2 | External mapper outage impact | 0 user-facing errors |
| 3 | Player regression tests | 100% pass |
| 3 | Source adapter switch time | < 500ms |
| 4 | Desktop local runtime uptime | > 99% |
| 4 | **Extension local scrape success rate** | > 75% |
| 4 | **WARP connection success rate** | > 95% |
| 4 | **Server bandwidth reduction** | > 50% |
| 4 | Server fallback trigger rate | < 10% of requests |
| 5 | Torrent search success rate | > 80% |
| 5 | Torrent playback start time | < 15s (prebuffered) |
| 5 | Country policy enforcement | 100% of torrent attempts |
| 6 | Mobile crash rate | No increase |
| 6 | Mobile battery impact | No measurable regression |
| 7 | Extension review time | < 48 hours |
| 7 | Extension kill-switch latency | < 5 minutes |
| 7 | **Extension audit log completeness** | 100% of fetches logged |
| 8 | Overall app crash rate | < 0.1% |
| 8 | Security scan findings | 0 critical |

---

## Final Summary

This plan synthesizes:

1. **SeaAnime's architectural strengths** — modular domains, typed contracts, explicit torrent/playback lifecycles
2. **Shiru's proven patterns** — AniList-first metadata, Web Worker extensions, anitomyscript parsing, dub-first tracking, per-series subtitle memory
3. **Tatakai's existing strengths** — React/TSX UI, provider fanout, HLS player, community systems, Electron/Capacitor packaging
4. **Your vision** — 196-country torrent legality system, admin-owned policy, user-respected warnings
5. **Extension local scraping** — Device-first scraping via sandboxed Web Workers with fetch capabilities
6. **1.1.1.1 WARP integration** — Built-in DNS-over-HTTPS + optional proxy tunnel for geo-block bypass

The path forward:
- **Browsing:** AniList primary → Jikan fallback → zero scraper dependence
- **Watch:** Mapped providers + **local scraping extensions** + torrent core
- **Network:** **1.1.1.1 DoH always on** → **WARP proxy when needed** → bypass blocks automatically
- **Desktop:** Local runtime for fallback + **extension scraping** + torrent lifecycle + **WARP tunnel**
- **Mobile:** Same contracts, server-first, stable
- **Extensions:** Moderated, signed, revocable, **can scrape locally with domain permissions**
- **Admin:** Expanded for country policies, provider ops, extension review, **WARP routing logs**

**Tatakai becomes:** A SeaAnime-powerful, Shiru-smart, **network-resilient**, **device-capable**, Tatakai-true application.
