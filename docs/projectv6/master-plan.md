# Tatakai Unified Architecture & Feature Master Plan

**Version:** 1.0 (Consolidated)
**Date:** 2026
**Owner:** Snozxyx
**Scope:** Core Architecture + Feature Expansion + Technology Modernization + Security Hardening + Data Migration + Performance Optimization

> This document consolidates the **Comprehensive Architecture & Migration Master Plan v2.0** and the **Extended Architecture Plan v4.0** into a single unified reference.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Codebase Deep Audit & Findings](#2-codebase-deep-audit--findings)
3. [Metadata Strategy: AniList Primary + Jikan Fallback](#3-metadata-strategy-anilist-primary--jikan-fallback)
4. [Shiru Inspiration & Adoptable Patterns](#4-shiru-inspiration--adoptable-patterns)
5. [Extension Local Scraping Architecture](#5-extension-local-scraping-architecture)
6. [1.1.1.1 WARP Network Tunnel Integration](#6-1111-warp-network-tunnel-integration)
7. [Country Torrent Legality System (196 Countries)](#7-country-torrent-legality-system-196-countries)
8. [New Features (13 Major Features)](#8-new-features-13-major-features)
9. [Technology Upgrades](#9-technology-upgrades)
10. [Performance Optimizations](#10-performance-optimizations)
11. [Core Modules & File Structure](#11-core-modules--file-structure)
12. [Database Schema (Unified)](#12-database-schema-unified)
13. [Data Migration Plan](#13-data-migration-plan)
14. [Security Hardening (Phase 0)](#14-security-hardening-phase-0)
15. [Unified Phased Roadmap](#15-unified-phased-roadmap)
16. [API Contract Evolution](#16-api-contract-evolution)
17. [Core Module Specifications](#17-core-module-specifications)
18. [Mapping Optimization Strategy](#18-mapping-optimization-strategy)
19. [No-Regression Guardrails](#19-no-regression-guardrails)
20. [Target Architecture](#20-target-architecture)
21. [Complete Feature Matrix](#21-complete-feature-matrix)
22. [Appendices](#22-appendices)

---

## 1. Executive Summary

### The Core Insight

Tatakai should adopt **SeaAnime's modular architecture** (torrent lifecycle, playback core, local runtime) and **Shiru's AniList-first metadata model** (Web Worker extensions, anitomyscript parsing, per-series subtitle memory, dub-first tracking) while keeping Tatakai's identity intact and layering on **13 new user-facing features**, **10 technology upgrades**, and **comprehensive performance optimizations**.

### Key Architectural Decisions

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
| **On-device AI (Tatakai Neural)** | TensorFlow.js/ONNX Runtime Web for recommendations and subtitle translation. 100% private, works offline. |
| **WebRTC Watch2Together v2** | Sub-second sync via WebRTC data channels + Supabase Realtime. Each user loads video independently. |
| **React 19 + React Compiler** | Automatic memoization, better concurrent features, new hooks. |
| **Tailwind CSS v4** | CSS-based config, 10x faster builds. |
| **@tanstack/react-router** | Type-safe routing with built-in loaders. |

### What Tatakai Becomes

- **Browsing:** AniList/Jikan-powered, zero scraper dependence, faceted search, voice search
- **Watch/Source Resolution:** Mapped providers + local scraping extensions + torrent extensions
- **Player:** Same UI shell, modular core with source adapters, per-series subtitle memory, chapter-aware seekbar
- **Network:** 1.1.1.1 DoH always on + WARP proxy when needed for geo-block bypass
- **Torrent:** Desktop-only, country-policy-gated, first-party lifecycle
- **Extensions:** Moderated, sandboxed, signed, revocable, can scrape locally with domain permissions
- **AI:** On-device recommendations (Tatakai Neural), AI subtitle translation, content classification
- **Social:** Watch2Together v2 (WebRTC), clip sharing, cross-device sync, anime news feed
- **Offline:** Smart download manager with auto-download, storage management, quality selection
- **Discovery:** Anime calendar with notifications, character database, OST player
- **Personalization:** Tatakai Wrapped (Spotify-style stats), smart theme creator, voice search
- **Platform:** Web + Desktop (Electron) + Mobile (Capacitor) + PWA
- **Localization:** Full UI localization for 13+ languages via react-i18next

---

## 2. Codebase Deep Audit & Findings

### 2.1 Frontend (`snozxyx/tatakai`)

| Aspect | Current State |
|--------|---------------|
| Framework | React 18.2 + Vite 5.4.19 + @vitejs/plugin-react-swc |
| Routing | React Router DOM v6 |
| State | Zustand |
| Data Fetching | TanStack Query v5 |
| HTTP | Axios with interceptors |
| UI Primitives | Radix UI (30+ components) |
| Animations | Framer Motion |
| Styling | Tailwind CSS v3.4.17 |
| Providers | 12+ provider fanout (Gogo, Zoro, AniWave, etc.) |
| Player | Custom HLS.js-based with subtitle, PiP, screenshot, offline |
| Auth | Supabase Auth |
| Community | Comments, forum, profiles, marketplace, custom sources |
| Mobile | Capacitor v8 |
| Desktop | Electron v40 + electron-builder |
| PWA | Workbox (sw.js) |
| Themes | next-themes + 25+ themes, Lite Mode |
| Dubs | 13 languages |
| Servers | 30+ server options |
| Validation | Zod + React Hook Form |
| Media Processing | Sharp + fluent-ffmpeg |
| Discord | RPC + Embedded App SDK |
| Charts | Recharts |
| Carousel | Embla Carousel |
| Drag & Drop | DND Kit |
| Toasts | Sonner |
| Drawers | Vaul |
| Security | apiCrypto.ts + autoModeration.ts + contentSafety.ts |
| Analytics | AnalyticsService + useAnalytics.ts |
| Admin | 20+ admin components |
| Integrations | MAL sync, AniList sync, Trace.moe search, ML recommendations |
| Observability | Sentry + Datadog |

### 2.2 API (`snozxyx/tatakaiapi`)

| Aspect | Current State |
|--------|---------------|
| Framework | Hono (Node.js) |
| Scrapers | cheerio, axios, puppeteer |
| Proxy | Multiple proxy routes for media delivery |
| Providers | Centralized provider orchestration |
| Database | Supabase (PostgreSQL) |

### 2.3 What's Already Strong (Don't Break These)

| Area | Assessment |
|------|------------|
| **Build System** (Vite + SWC) | Excellent. SWC is fastest React compiler. |
| **Data Fetching** (TanStack Query v5) | Excellent. Industry standard. |
| **UI Primitives** (Radix UI 30+) | Excellent. Accessible, unstyled, composable. |
| **Animations** (Framer Motion) | Excellent. Best React animation library. |
| **Video Player** (HLS.js) | Excellent. Industry standard for HLS. |
| **Auth/Backend** (Supabase) | Excellent. Realtime, auth, storage, PostgreSQL. |
| **Observability** (Sentry + Datadog) | Excellent. Error tracking + logging. |
| **Desktop** (Electron v40) | Excellent. Very recent version. |
| **Mobile** (Capacitor v8) | Excellent. Latest major version. |
| **Validation** (Zod + RHF) | Excellent. Type-safe forms. |
| **Media Processing** (Sharp + ffmpeg) | Excellent. Image + video processing. |
| **Discord** (RPC + Embedded App SDK) | Excellent. Rich presence + Discord activity. |
| **Security** (apiCrypto + moderation) | Excellent. Request signing + moderation. |
| **Admin** (20+ components) | Excellent. Comprehensive admin surface. |

### 2.4 Critical Gaps Found

| Gap | Impact | Priority |
|-----|--------|----------|
| **No list virtualization** | Large catalogs (1000+ anime) will lag/jank | CRITICAL |
| **No WASM** | Heavy operations (image processing, parsing) on main thread | HIGH |
| **No Web Workers** | Extension scraping blocks UI | HIGH |
| **No IndexedDB abstraction** | Complex cache management, no structured queries | MEDIUM |
| **No image optimization pipeline** | Large images load slowly, no placeholders | HIGH |
| **No code splitting strategy** | Large bundle size, slow initial load | HIGH |
| **No bundle analyzer** | Can't measure or optimize bundle size | MEDIUM |
| **No E2E testing** | No automated UI regression testing | MEDIUM |
| **No i18n framework** | UI not localized despite 13 dub languages | MEDIUM |
| **No feature flag service** | Can't do gradual rollouts or A/B tests | MEDIUM |
| **No real-time sync** | Watch2Together needs WebSocket/Realtime | HIGH |
| **No client-side AI/ML** | Recommendations require server round-trip | MEDIUM |
| **No React Compiler** | Missing automatic memoization (React 19 feature) | MEDIUM |
| **No Tailwind v4** | Still on v3, missing v4 performance improvements | LOW |
| **No @tanstack/react-router** | Still on react-router-dom v6 | LOW |
| **No react-scan** | Hard to debug render performance | LOW |
| **No BlurHash** | Images pop in without smooth loading | MEDIUM |
| **No AVIF/WebP auto-conversion** | Serving unoptimized images | MEDIUM |
| **No @tanstack/react-table** | Admin tables likely hand-rolled | LOW |

### 2.5 Critical Security Issues Found

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

### 2.6 Architecture Debt

```
Current File Structure Issues:
src/
  hooks/           # 50+ hooks, no categorization
  lib/             # Mixed utilities, API clients, crypto
  services/        # Mixed concerns (API, analytics, providers)
  components/      # Flat structure, no atomic design
  pages/           # Page components mixed with logic
```

**Problems:**
1. Flat hook directory -- 50+ hooks in one folder, hard to navigate
2. Mixed lib folder -- API clients, crypto, logger, Discord all in one place
3. No feature-based organization -- Components organized by type, not feature
4. Services mix concerns -- Provider scraping, analytics, and API calls all together
5. No clear boundary -- UI components contain business logic

---

## 3. Metadata Strategy: AniList Primary + Jikan Fallback

### 3.1 Architecture Principle

```
+-------------------------------------------------------------+
|                    BROWSING SURFACES                         |
|  Home | Search | Trending | Genres | Seasonal | Favorites   |
+----------------------------+--------------------------------+
                             |
                +------------+------------+
                |                         |
       +--------v---------+    +---------v----------+
       |   AniList API    |    |    Jikan API       |
       |   (Primary)      |    |    (Fallback)      |
       |   GraphQL        |    |    REST v4         |
       +--------+---------+    +---------+----------+
                |                         |
                +------------+------------+
                             |
                +------------v------------+
                |  Tatakai Content Graph  |
                |  (Cache + Enrichment)   |
                +------------+------------+
                             |
                +------------v------------+
                |   Tatakai Internal IDs  |
                |   (System Anchor)       |
                +-------------------------+
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
      telemetry.recordAniListFailure(err);
      return this.fallbackClient.equivalentQuery<T>(query, variables);
    }
  }
}

// src/core/content/jikan-client.ts
class JikanClient {
  private endpoint = 'https://api.jikan.moe/v4';
  private rateLimiter = new RateLimiter(3, 1000); // 3 req/sec

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

### 3.6 Browsing Surfaces -- Data Flow

```
User opens Home
    |
    v
+---------------------+
| Check Content Graph  | <- Tatakai-owned cache
|   (IndexedDB/API)    |
+----------+----------+
           |
    +------+------+
    | Cache Hit?  |
    +------+------+
      Yes /   \ No
         /     \
        v       v
   +--------+  +--------------+
   | Return |  | Query AniList|
   | Cached |  |   (Primary)  |
   |  Data  |  +------+-------+
   +--------+         |
                      | Failure
                      v
              +--------------+
              | Query Jikan  |
              |  (Fallback)  |
              +------+-------+
                     |
                     v
              +--------------+
              | Store in     |
              | Content Graph|
              +--------------+
```

### 3.7 Content Graph Schema

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
  genres TEXT[],
  tags JSONB,
  studios JSONB,
  is_adult BOOLEAN DEFAULT FALSE,
  country_of_origin TEXT,
  next_airing_episode JSONB,
  trailer_url TEXT,
  synonyms TEXT[],
  relations JSONB,
  characters JSONB,
  staff JSONB,
  external_links JSONB,
  streaming_episodes JSONB,
  rankings JSONB,
  trending_score FLOAT,
  recommendation_vector VECTOR(384),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_from TEXT DEFAULT 'anilist',
  sync_version INTEGER DEFAULT 1
);

-- content_titles: Search-optimized title variants
CREATE TABLE content_titles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tatakai_id UUID REFERENCES content_items(tatakai_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  title_type TEXT NOT NULL,
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
  episode_internal_id TEXT NOT NULL,
  title TEXT,
  description TEXT,
  thumbnail_url TEXT,
  airing_at TIMESTAMPTZ,
  duration INTEGER,
  is_filler BOOLEAN DEFAULT FALSE,
  is_recap BOOLEAN DEFAULT FALSE,
  is_special BOOLEAN DEFAULT FALSE,
  anidb_eid INTEGER,
  tvdb_eid INTEGER,
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
  feed_type TEXT NOT NULL,
  season TEXT,
  season_year INTEGER,
  items JSONB NOT NULL,
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

### 4.2 Extension Architecture -- Tatakai Adaptation

```typescript
// src/core/extensions/abstract-source.ts
export abstract class AbstractSource {
  abstract id: string;
  abstract name: string;
  abstract version: string;
  abstract type: 'torrent' | 'onlinestream' | 'custom';

  protected anitomyscript: AnitomyScript;

  abstract validate(): Promise<boolean>;
  abstract single(options: SourceOptions): Promise<SourceResult[]>;
  abstract batch(options: SourceOptions): Promise<SourceResult[]>;
  abstract movie(options: SourceOptions): Promise<SourceResult[]>;
}

// src/core/extensions/types.ts
export interface SourceOptions {
  anilistId: number;
  media: AniListMedia;
  mappingsA?: CrossPlatformMappings;
  mappingsE?: EpisodeMappings;
  anidbAid?: number;
  anidbEid?: number;
  tvdbAid?: number;
  tvdbEid?: number;
  imdbAid?: string;
  mvdbAid?: number;
  titles: string[];
  episode?: number;
  episodeCount?: number;
  resolution: '2160' | '1080' | '720' | '540' | '480' | '';
  exclusions: string[];
  tatakaiId?: string;
  preferredLanguage?: string;
  countryCode?: string;
}

export interface TorrentResult {
  title: string;
  link: string;
  id?: number;
  seeders: number;
  leechers: number;
  downloads: number;
  accuracy: 'high' | 'medium' | 'low';
  hash: string;
  size: number;
  date: Date;
  type: 'batch' | 'best' | 'alt';
  parsed?: ParsedReleaseMetadata;
}

export interface ParsedReleaseMetadata {
  releaseGroup?: string;
  animeTitle?: string;
  episodeNumber?: number;
  episodeTitle?: string;
  videoResolution?: string;
  videoTerm?: string;
  audioTerm?: string;
  source?: string;
  version?: number;
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
  private timeout: number = 30000;

  constructor(extensionCode: string, manifest: ExtensionManifest) {
    const blob = new Blob([this.wrapExtension(extensionCode)], { type: 'application/javascript' });
    this.worker = new Worker(URL.createObjectURL(blob), { type: 'module' });
    this.injectAnitomyScript();
  }

  private wrapExtension(code: string): string {
    return `
      const fetch = self.__tatakai_fetch__;
      const anitomyscript = self.__tatakai_anitomy__;
      // No access to: document, window, localStorage, indexedDB, XMLHttpRequest
      ${code}
    `;
  }

  async execute(method: 'single' | 'batch' | 'movie', options: SourceOptions): Promise<SourceResult[]> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.worker.terminate();
        reject(new Error('Extension execution timeout'));
      }, this.timeout);

      this.worker.onmessage = (e) => { clearTimeout(timer); resolve(e.data.results); };
      this.worker.onerror = (err) => { clearTimeout(timer); reject(err); };
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
  dubLanguages: Record<string, EpisodeSchedule[]>;
}

// UI: Audio labels on cards
// "Dub 12 / Sub 24" -- shows latest available for each
// "Dual Audio" -- both available for latest episode
// Prefer Dubs setting: Hide from Continue Watching until dub catches up
```

### 4.6 Per-Series Subtitle Memory (Shiru-inspired)

```typescript
// src/core/player/subtitle-memory.ts
interface SubtitlePreference {
  tatakaiId: string;
  episodeNumber: number;
  sourceHash: string;
  preferredTrackIndex: number;
  preferredLanguage: string;
  delayMs: number;
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

Extensions scrape content **directly from the user's device** instead of routing every request through Tatakai's central API. The device becomes a first-class scraping node.

**Why this matters:**
- **Bypass server IP blocks:** Many anime sites block datacenter IPs but allow residential IPs
- **Lower latency:** Direct connection eliminates server round-trip
- **Reduce server costs:** Less proxy bandwidth and compute on TatakaiAPI
- **Resilience:** If TatakaiAPI is down, extensions can still function
- **Privacy:** User traffic doesn't pass through Tatakai's infrastructure

### 5.2 Architecture

```
User clicks "Watch Episode 5"
        |
        v
+---------------------+
| Provider Orchestrator|
| (decides strategy)   |
+----------+----------+
           |
    +------+------+
    | Local first?| <- Feature flag + extension permission
    +------+------+
      Yes /   \ No
         /     \
        v       v
+--------------+  +------------------+
|Local Runtime |  | TatakaiAPI       |
|Worker Thread |  | (server scrape)  |
+------+-------+  +------------------+
       |
       v
+---------------------+
| Extension Web Worker|
| (isolated JS)       |
| fetch() -> site HTML|
| cheerio-like parse  |
| extract video URLs  |
+----------+----------+
           |
           v
+---------------------+
| 1.1.1.1 WARP Tunnel | <- Optional: routes through Cloudflare
+----------+----------+
           |
           v
+---------------------+
| Structured Result   |
| -> Player Core      |
+---------------------+
```

### 5.3 Extension Code Example

```typescript
// Extension code running in Web Worker
class GogoanimeLocalSource extends AbstractSource {
  id = 'gogoanime-local';
  name = 'Gogoanime (Local)';
  type = 'onlinestream';

  async single(options: SourceOptions): Promise<SourceResult[]> {
    const searchUrl = `https://gogoanime3.co/search.html?keyword=${encodeURIComponent(options.titles[0])}`;
    const searchHtml = await this.fetch(searchUrl);
    const $ = this.parseHtml(searchHtml);
    const animePage = $('.items li a').first().attr('href');
    const episodeUrl = `https://gogoanime3.co${animePage}-episode-${options.episode}`;
    const episodeHtml = await this.fetch(episodeUrl);
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

### 5.4 Runtime Injection

```typescript
// desktop/runtime/extension-sandbox.ts
const extensionRuntimeAPI = {
  fetch: (url: string, init?: RequestInit) => {
    if (!matchesAllowedDomains(url, manifest.permissions)) {
      throw new PermissionDeniedError(`Domain not allowed: ${url}`);
    }
    return warpFetch(url, init);
  },
  parseHtml: (html: string) => createCheerioLikeParser(html),
  parseJson: (json: string) => JSON.parse(json),
  anitomyscript: anitomyscript,
  regex: {
    match: (pattern: RegExp, text: string) => pattern.exec(text),
    replace: (pattern: RegExp, text: string, replacement: string) => text.replace(pattern, replacement),
  },
  // No eval, no Function constructor, no XMLHttpRequest, no WebSocket
};
```

### 5.5 Permission Model

```typescript
interface ExtensionPermissions {
  'network:fetch': boolean;
  'network:domain:gogoanime.*': boolean;
  'network:domain:aniwave.*': boolean;
  'network:domain:*': boolean; // Rare, requires extra admin review
  'parse:html': boolean;
  'parse:json': boolean;
  'parse:xml': boolean;
  'content:read': boolean;
  'content:write': boolean;
  'torrent:search': boolean;
  'torrent:download': boolean;
}
```

**Security rules:**
1. No `eval()` or `Function()` constructor -- Web Worker CSP enforced
2. No DOM access -- Web Workers have no `document` or `window`
3. Fetch domain allowlist -- Only declared domains reachable
4. No local file system access
5. No WebSocket -- Only HTTP/HTTPS fetch
6. Timeout enforced -- 30-second max per request, 2-minute max per extension call
7. Rate limiting -- Per-domain rate limits enforced by runtime
8. Response size cap -- 10MB max response

### 5.6 Fallback Strategy

```
Local scraping attempt
        |
   Success? -> Yes -> Return Result
        |
        No
        |
   Why failed?
   /           \
Site blocked    Timeout/Error
   |                 |
   v                 v
Try WARP          Try server
(if off)          (TatakaiAPI)
   |                 |
   v                 v
WARP retry       Return Result
or fail
```

### 5.7 When Local Scraping Is Used

| Scenario | Strategy |
|----------|----------|
| Desktop + extension has `network:fetch` | Local scraping first |
| Desktop + extension lacks network perm | Server API only |
| Web browser + CORS allows | Local scraping possible (limited) |
| Web browser + CORS blocks | Server API proxy required |
| Mobile (Capacitor) | Server API first, local via native bridge later |
| Site blocks residential IP | WARP tunnel auto-enabled for that domain |
| WARP also blocked | Server API fallback |

### 5.8 Benefits for TatakaiAPI

- **70-80% reduction in proxy bandwidth** (most scraping happens on device)
- **Lower server costs** -- Server only handles: auth, content graph, mappings, fallback scraping
- **Better uptime** -- Server outages don't kill all source resolution
- **Scales infinitely** -- Each user brings their own scraping capacity

---

## 6. 1.1.1.1 WARP Network Tunnel Integration

### 6.1 The Concept

Built-in **1.1.1.1 DNS + optional WARP-like proxy tunnel** directly into the app. This is an **application-level network layer** that routes Tatakai's traffic through Cloudflare's network.

### 6.2 Two Modes

#### Mode A: 1.1.1.1 DNS (Always On)

- All DNS queries go through Cloudflare's encrypted DNS
- Performance impact: Negligible (faster than ISP DNS in most cases)
- Privacy impact: ISP cannot see what domains you visit
- Cannot be disabled (always-on for privacy)

#### Mode B: WARP Proxy (User Toggle)

```typescript
const warpConfig = {
  enabled: userSettings.warpEnabled,
  mode: 'auto' | 'always' | 'on-demand',

  autoTrigger: {
    failedRequestsThreshold: 3,
    httpStatusCodes: [403, 451, 503],
    errorPatterns: ['blocked', 'geo-restricted', 'unavailable'],
  },

  routeExtensions: true,
  routeTorrent: true,
  routeApi: false,
  routePlayer: false,
};
```

### 6.3 Architecture

```
App makes request
        |
        v
+---------------------+
| 1. DNS Resolution   |
| 1.1.1.1 DoH         | <- Always active
+----------+----------+
           |
           v
+---------------------+
| 2. WARP Decision    |
| Is WARP enabled?    |
+----------+----------+
     Yes /   \ No
        /     \
       v       v
+----------+  +----------+
| WARP     |  | Direct   |
| Proxy    |  | Connect  |
| (SOCKS5) |  |          |
+----+-----+  +----+-----+
     |             |
     v             v
+-------------------------+
| Cloudflare Edge         |
| (150+ cities worldwide) |
+-----------+-------------+
            |
            v
+-------------------------+
| Target Website/API      |
+-------------------------+
```

### 6.4 Electron Desktop Implementation

```typescript
// desktop/runtime/warp-tunnel.ts
class WarpTunnel {
  async initialize(): Promise<void> {
    const mainSession = session.defaultSession;
    await mainSession.setProxy({
      proxyRules: 'socks5://127.0.0.1:8080',
    });
  }

  async enableForDomain(domain: string): Promise<void> {
    this.routedDomains.add(domain);
    await this.updateProxyRules();
  }

  async fetchThroughWarp(url: string, init?: RequestInit): Promise<Response> {
    return net.fetch(url, { ...init });
  }
}
```

### 6.5 Web Limitations

- DoH is supported via `fetch()` to Cloudflare DNS
- WARP is NOT available on web -- extensions fall back to TatakaiAPI proxy
- PWA with fetch interceptor could use DoH at minimum

### 6.6 Extension & Torrent Integration

Extensions don't need to know about WARP -- it's transparent. Torrent metadata (tracker announces, DHT, magnet resolution) can benefit from WARP while peer connections remain direct for speed.

### 6.7 UI/UX

```
Settings -> Network
+-- DNS (always on)
|   +-- [check] Using 1.1.1.1 (Cloudflare)
|
+-- WARP Tunnel
|   +-- [Toggle] Enable WARP
|   +-- Mode: [Auto v] / Always / On-demand
|   +-- Route extension scraping: [check]
|   +-- Route torrent metadata: [check]
|   +-- Route API calls: [ ]
|   +-- Route video streams: [ ]
|
+-- Status
|   +-- WARP: Connected > Frankfurt
|   +-- IP: 104.16.x.x (Cloudflare)
|   +-- Latency: +12ms
|
+-- Advanced
    +-- Test connectivity
    +-- Reset WARP session
    +-- View routing log
```

### 6.8 Country Policy Interaction

WARP is a **network optimization tool**, not a **legal bypass**. Country policies are enforced regardless of WARP state. WARP may help with torrent metadata but does NOT change legality.

---

## 7. Country Torrent Legality System (196 Countries)

### 7.1 Ownership

- **Owner:** Snozxyx (sole admin authority)
- **Modification:** Admin dashboard only
- **User impact:** Read-only policy display + VPN recommendation
- **Audit:** All changes logged with admin ID, timestamp, previous value

### 7.2 Database Schema

```sql
CREATE TABLE country_torrent_policies (
  iso_code CHAR(2) PRIMARY KEY,
  iso_code_3 CHAR(3) NOT NULL,
  country_name TEXT NOT NULL,
  country_name_local TEXT,
  torrent_policy TEXT NOT NULL DEFAULT 'unclear'
    CHECK (torrent_policy IN ('legal', 'decriminalized', 'illegal', 'unclear', 'vpn_required')),
  enforcement_level TEXT NOT NULL DEFAULT 'unknown'
    CHECK (enforcement_level IN ('none', 'low', 'moderate', 'high', 'severe', 'unknown')),
  downloading_illegal BOOLEAN DEFAULT FALSE,
  uploading_illegal BOOLEAN DEFAULT FALSE,
  streaming_illegal BOOLEAN DEFAULT FALSE,
  fines_applicable BOOLEAN DEFAULT FALSE,
  imprisonment_possible BOOLEAN DEFAULT FALSE,
  isp_monitoring BOOLEAN DEFAULT FALSE,
  specific_law TEXT,
  law_reference_url TEXT,
  last_verified_at TIMESTAMPTZ,
  verification_source TEXT,
  notes TEXT,
  vpn_recommended BOOLEAN GENERATED ALWAYS AS (
    torrent_policy IN ('illegal', 'vpn_required') OR
    enforcement_level IN ('high', 'severe')
  ) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id),
  update_reason TEXT,
  version INTEGER DEFAULT 1
);

CREATE TABLE user_country_acknowledgments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  country_iso_code CHAR(2) REFERENCES country_torrent_policies(iso_code),
  acknowledged_at TIMESTAMPTZ DEFAULT NOW(),
  acknowledgment_expires_at TIMESTAMPTZ,
  vpn_dismissed BOOLEAN DEFAULT FALSE,
  UNIQUE(user_id, country_iso_code)
);

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

### 7.3 User Flow

```
User opens Tatakai (first time or after 30 days)
    |
    v
Detect country (IP/Geo) or use stored preference
    |
    v
Lookup policy for country
    |
    +-- legal/decriminalized -> Normal flow
    |
    +-- illegal/vpn_required -> Show VPN Warning Modal
    |                           -> Store acknowledgment (30-day expiry)
    |
    +-- unclear -> Show info notice only
```

### 7.4 Admin Dashboard

- Table of all 196 countries with inline editing
- Bulk import via CSV/JSON
- Audit log viewer
- Search/filter by policy type
- "Last verified" sorting
- Preview user-facing message

---

## 8. New Features (13 Major Features)

### 8.1 AI-Powered Smart Recommendations (Tatakai Neural)

**What:** On-device anime recommendation engine using lightweight ML models
**Why:** Instant, private, works offline. No server round-trip.
**Tech:** TensorFlow.js (quantized model ~2MB) or ONNX Runtime Web
**Privacy:** 100% on-device, no data leaves the device

```typescript
// src/core/ai/recommendation-engine.ts
class TatakaiNeuralEngine {
  private model: tf.LayersModel;

  async initialize() {
    this.model = await tf.loadLayersModel('indexeddb://tatakai-recommender-v1');
  }

  async recommend(
    watchHistory: WatchEntry[],
    favorites: string[],
    ratings: RatingEntry[]
  ): Promise<Recommendation[]> {
    const userVector = this.encodeUser(watchHistory, favorites, ratings);
    const catalogVectors = await this.getCatalogVectors();
    const similarities = catalogVectors.map(v =>
      this.cosineSimilarity(userVector, v.vector)
    );
    return this.rankAndExplain(similarities);
  }

  // "Because you liked Attack on Titan and rated Death Note 9/10"
  private explainRecommendation(rec: Recommendation, history: WatchEntry[]): string {
    const similarWatched = history
      .filter(h => h.genres.some(g => rec.genres.includes(g)))
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 2);
    return `Because you enjoyed ${similarWatched.map(w => w.title).join(' and ')}`;
  }
}
```

### 8.2 Real-Time Watch2Together v2 (WebRTC + Supabase Realtime)

**What:** Synchronized watching with friends, sub-second sync
**Architecture:** Each user loads video independently. WebRTC data channel sends `{ currentTime, isPlaying, timestamp }`. Chat via Supabase Realtime.

```typescript
// src/core/watch2gether/webrtc-sync.ts
class Watch2getherSync {
  private pc: RTCPeerConnection;
  private dataChannel: RTCDataChannel;
  private roomChannel: RealtimeChannel;

  async createRoom(animeId: string, episode: number): Promise<Room> {
    this.pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    this.dataChannel = this.pc.createDataChannel('sync', {
      ordered: true, maxRetransmits: 3
    });
    this.roomChannel = supabase.channel(`room:${roomId}`)
      .on('broadcast', { event: 'sync' }, (payload) => this.handleSyncSignal(payload))
      .on('presence', { event: 'sync' }, () => this.updateParticipantList())
      .subscribe();
    return { roomId, inviteCode: generateInviteCode() };
  }

  sendSyncSignal(state: PlayerState) {
    const signal = {
      currentTime: state.currentTime,
      isPlaying: state.isPlaying,
      playbackRate: state.playbackRate,
      timestamp: Date.now(),
      drift: this.calculateDrift()
    };
    if (this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(signal));
    }
    this.roomChannel.send({ type: 'broadcast', event: 'sync', payload: signal });
  }
}
```

**Features:** Host controls, smooth catch-up sync, text chat, reaction emojis, ready lobby, auto-pause on buffer, sync quality indicator.

### 8.3 Smart Download Manager (Offline-First)

**What:** Intelligent episode download with quality selection, auto-download, storage management

```typescript
// src/core/offline/download-manager.ts
class TatakaiDownloadManager {
  private queue: DownloadTask[] = [];
  private activeDownloads = new Map<string, AbortController>();

  async enqueue(options: DownloadOptions): Promise<DownloadTask> { /* ... */ }
  async processQueue() { /* ... */ }
  async getStorageUsage(): Promise<StorageStats> { /* ... */ }
  async cleanupOldDownloads(maxAgeDays: number = 30) { /* ... */ }
}
```

**UI:** Download button on episode cards, quality picker, queue manager, storage usage bar, "Download all remaining", WiFi-only toggle, auto-delete after watching.

### 8.4 Anime Calendar & Airing Schedule

**What:** Visual calendar showing upcoming episodes, seasonal releases, with notification support
**Views:** Weekly grid, daily timeline, "My Schedule" (watchlist only), seasonal overview, countdown timers

```typescript
// src/core/content/calendar-service.ts
class AnimeCalendarService {
  async getAiringSchedule(date: Date, filters?: CalendarFilters): Promise<CalendarDay[]> { /* ... */ }
  async subscribeToNotifications(tatakaiId: string) {
    // Use Capacitor Local Notifications for mobile
  }
}
```

### 8.5 Personal Stats & Wrapped (Tatakai Wrapped)

**What:** Spotify Wrapped-style annual/periodic viewing statistics
**UI:** Animated stat cards, genre pie chart, timeline heatmap, shareable image generation, milestone badges

```typescript
interface ViewingStats {
  period: { start: Date; end: Date };
  totalEpisodesWatched: number;
  totalMinutesWatched: number;
  uniqueAnimeWatched: number;
  genreBreakdown: Record<string, number>;
  topStudios: Record<string, number>;
  longestBinge: { anime: string; episodes: number; duration: number };
  watchStreak: { current: number; longest: number };
  peakWatchHour: number;
  completionRate: number;
}
```

### 8.6 AI Subtitle Translation (Real-Time)

**What:** On-the-fly subtitle translation using lightweight NLP models
**Model:** ONNX Runtime Web with quantized opus-mt models (~5MB each)
**Supported Languages:** Same 13 as dubs (Hindi, Telugu, Malayalam, German, French, Polish, etc.)
**Privacy:** On-device, no data sent to translation API

```typescript
// src/core/ai/subtitle-translator.ts
class SubtitleTranslator {
  async initialize(targetLanguage: string) {
    this.model = await loadTranslationModel('en', targetLanguage);
  }
  async translateSubtitles(subtitles: SubtitleTrack[], targetLang: string): Promise<SubtitleTrack> { /* ... */ }
  async translateBatch(texts: string[], targetLang: string): Promise<string[]> { /* ... */ }
}
```

### 8.7 Clip & Share System

**What:** Create and share short clips from episodes with timestamps (max 60 seconds)
**Features:** In-player clip creation, auto-caption, share to Discord/Twitter/Reddit, embed player, clip feed, reaction system

```typescript
// src/core/player/clip-system.ts
class ClipSystem {
  async createClip(tatakaiId: string, episode: number, startTime: number, endTime: number, options: ClipOptions): Promise<Clip> { /* ... */ }
  async generateShareLink(clip: Clip): Promise<string> { /* ... */ }
  async generateThumbnail(tatakaiId: string, episode: number, time: number): Promise<string> { /* ... */ }
}
```

### 8.8 Advanced Search with Faceted Filters

**What:** Elasticsearch-like search with multiple filter dimensions
**Backend:** PostgreSQL full-text search + JSONB filtering

```typescript
interface SearchFilters {
  query?: string;
  genres?: string[];
  year?: { min?: number; max?: number };
  season?: ('WINTER' | 'SPRING' | 'SUMMER' | 'FALL')[];
  format?: ('TV' | 'MOVIE' | 'OVA' | 'ONA' | 'SPECIAL')[];
  status?: ('FINISHED' | 'RELEASING' | 'NOT_YET_RELEASED')[];
  rating?: { min?: number; max?: number };
  episodes?: { min?: number; max?: number };
  studio?: string[];
  source?: ('ORIGINAL' | 'MANGA' | 'LIGHT_NOVEL' | 'VISUAL_NOVEL')[];
  dubLanguages?: string[];
  sortBy?: 'relevance' | 'popularity' | 'rating' | 'newest' | 'title';
}
```

**UI:** Search bar with autocomplete, filter sidebar, active filter chips, result count per filter, sort dropdown, grid/list toggle, save search as "Smart List".

### 8.9 Cross-Device Sync (Seamless Handoff)

**What:** Start watching on desktop, continue on mobile, seamlessly
**Tech:** Supabase Realtime broadcast for device presence + playback state

```typescript
// src/core/sync/cross-device-sync.ts
class CrossDeviceSync {
  async initialize() {
    this.syncChannel = supabase.channel(`user:${user.id}:sync`)
      .on('broadcast', { event: 'playback_state' }, (payload) => this.handleRemoteState(payload))
      .subscribe();
  }
  async syncPlaybackState(state: PlaybackState) { /* debounced every 5 seconds */ }
  async handoffToLocal(remoteState: PlaybackState) { /* navigate + seek */ }
}
```

**Features:** Auto-sync every 5 seconds, "Continue on this device?" prompt, device list in settings, force sync, offline queue.

### 8.10 Smart Theme Creator

**What:** Users create custom themes with visual editor
**Features:** Color picker with palette suggestions, background image upload, Google Fonts, animation speed slider, export/import JSON, community gallery

```typescript
interface CustomTheme {
  id: string;
  name: string;
  colors: { background, surface, primary, secondary, accent, text, textMuted, border, success, warning, error: string };
  background: { type: 'solid' | 'gradient' | 'image'; value: string; opacity: number; blur: number };
  typography: { fontFamily: string; fontSizeScale: number; lineHeight: number };
  player: { controlBarStyle: 'minimal' | 'full' | 'floating'; progressBarColor: string };
  animations: { reducedMotion: boolean; transitionSpeed: 'fast' | 'normal' | 'slow'; cardHoverEffect: 'scale' | 'lift' | 'glow' | 'none' };
}
```

### 8.11 Voice Search

**What:** Search anime by speaking instead of typing
**Tech:** Web Speech API
**Features:** Microphone button in search bar, real-time transcript, language auto-detection

```typescript
// src/core/search/voice-search.ts
class VoiceSearch {
  private recognition: SpeechRecognition;
  startListening(onInterim, onFinal, onError) { /* ... */ }
  stopListening() { /* ... */ }
}
```

### 8.12 Anime News Feed

**What:** Integrated anime news from multiple sources (ANN, Crunchyroll News, etc.)
**Features:** News tab, article cards, "Related to [Anime]" section, push notifications, save/share articles

```typescript
// src/core/news/news-aggregator.ts
class NewsAggregator {
  async fetchNews(limit: number = 50): Promise<NewsArticle[]> { /* ... */ }
  async getRelatedNews(tatakaiId: string): Promise<NewsArticle[]> { /* ... */ }
}
```

### 8.13 Character Database & OST Player

**What:** Detailed character pages and anime soundtrack player
**Features:** Character profiles with voice actors and appearances, OST playback with media session (lock screen controls), Spotify/YouTube links

```typescript
interface CharacterPage {
  id: string; name: string; image: string; description: string;
  anime: ContentItem[]; voiceActors: VoiceActor[];
  appearances: EpisodeAppearance[]; popularity: number;
}

interface OSTTrack {
  id: string; title: string; artist: string; anime: ContentItem;
  type: 'opening' | 'ending' | 'insert' | 'background';
  duration: number; audioUrl?: string; spotifyUrl?: string; youtubeUrl?: string;
}
```

---

## 9. Technology Upgrades

### 9.1 React 19 + React Compiler

**Current:** React 18.3.1 -> **Target:** React 19 + babel-plugin-react-compiler

- Automatic memoization (no more `useMemo`/`useCallback`)
- Better concurrent features
- New hooks: `useActionState`, `useFormStatus`, `useOptimistic`

### 9.2 Tailwind CSS v4

**Current:** v3.4.17 -> **Target:** v4

- No `tailwind.config.js` needed (CSS-based config)
- 10x faster build times
- New `@import` syntax

### 9.3 @tanstack/react-router

**Current:** react-router-dom v6 -> **Target:** @tanstack/react-router

- Type-safe routing
- Built-in loader pattern
- File-based routing option
- Search params as first-class citizens

```typescript
// src/routes/anime.$tatakaiId.tsx
export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: 'anime/$tatakaiId',
  component: AnimeDetailPage,
  loader: async ({ params }) => {
    const anime = await contentGraph.getById(params.tatakaiId);
    return { anime };
  },
});
```

### 9.4 @tanstack/react-virtual

List virtualization for large anime catalogs (1000+ items).

```typescript
function VirtualizedAnimeGrid({ items }: { items: AnimeCard[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 280,
    overscan: 5,
  });
  // ...renders only visible items
}
```

### 9.5 Dexie.js (IndexedDB Wrapper)

Structured client-side storage with TypeScript-friendly API.

```typescript
class TatakaiDatabase extends Dexie {
  contentItems!: Table<ContentItem, string>;
  watchHistory!: Table<WatchEntry, string>;
  downloadQueue!: Table<DownloadTask, string>;
  searchCache!: Table<SearchCacheEntry, string>;
  extensionCache!: Table<ExtensionCacheEntry, string>;

  constructor() {
    super('TatakaiDB');
    this.version(1).stores({
      contentItems: 'tatakaiId, anilistId, malId, titleRomaji, *genres',
      watchHistory: '++id, tatakaiId, episodeNumber, watchedAt',
      downloadQueue: 'id, status, priority, createdAt',
      searchCache: 'query, filtersHash, results, expiresAt',
      extensionCache: 'key, value, expiresAt',
    });
  }
}
```

### 9.6 BlurHash for Image Placeholders

Tiny placeholder strings (~30 bytes) that render blurred previews during image load.

### 9.7 ONNX Runtime Web (Client-Side AI)

Lighter than TensorFlow.js, supports models from PyTorch/TensorFlow. Use cases: recommendation model (~2MB), subtitle translation (~5MB/lang), content classification (~1MB).

### 9.8 WebGPU for Video Processing

Desktop-only GPU-accelerated frame extraction, thumbnail generation, and effects.

### 9.9 Feature Flags with Unleash

Gradual rollouts, A/B tests, kill switches.

```typescript
const isEnabled = unleash.isEnabled('torrent-core');
const variant = unleash.getVariant('recommendation-algo', { userId: user.id });
```

### 9.10 i18n with react-i18next

Full UI localization for 13+ languages.

```typescript
i18n.use(initReactI18next).init({
  resources: { en, de, hi, ja, /* ... */ },
  lng: navigator.language.split('-')[0],
  fallbackLng: 'en',
});
```

---

## 10. Performance Optimizations

### 10.1 Bundle Optimization

```typescript
// vite.config.ts
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'react-vendor': ['react', 'react-dom', 'react-router-dom'],
        'ui-vendor': ['framer-motion', '@radix-ui/*'],
        'video-vendor': ['hls.js'],
        'query-vendor': ['@tanstack/react-query'],
        'supabase': ['@supabase/supabase-js'],
        'admin': ['./src/pages/admin/**/*'],
        'analytics': ['./src/components/admin/Analytics*'],
      }
    }
  }
}
```

**Targets:** Initial bundle < 200KB gzipped, vendor chunks < 150KB each, feature chunks on demand.

### 10.2 Image Optimization Pipeline

- AVIF/WebP auto-conversion with responsive `srcset`
- BlurHash placeholders for all images
- On desktop: Sharp via Electron main process
- On web: CDN-based optimization

### 10.3 Code Splitting Strategy

- Route-based: `React.lazy()` for pages
- Component-based: Heavy components loaded on demand
- Preload on hover for navigation links

### 10.4 Memory Management

```typescript
class MemoryManager {
  private caches = new Map<string, LRUCache>();

  private async checkMemoryPressure() {
    const estimate = await navigator.storage.estimate();
    const ratio = (estimate.usage || 0) / (estimate.quota || Infinity);
    if (ratio > 0.8) this.evictAllCaches(0.5);
    else if (ratio > 0.6) this.evictAllCaches(0.25);
  }
}
```

### 10.5 React Performance Patterns

1. React Compiler (automatic memoization)
2. `@tanstack/react-virtual` for long lists
3. `useDeferredValue` for non-urgent updates
4. `useTransition` for state updates
5. `React.lazy` + `Suspense` for code splitting
6. `react-scan` in dev for render debugging

---

## 11. Core Modules & File Structure

### 11.1 Target File Structure

```
src/
  core/                          # Domain logic (no React)
    ai/                          # Tatakai Neural
      recommendation-engine.ts
      model-loader.ts
      vector-encoder.ts
      similarity.ts
      subtitle-translator.ts
      models/
        recommender-v1.onnx
        translator/
    content/                     # Content Graph
      anilist-client.ts
      jikan-client.ts
      content-graph.ts
      dub-tracker.ts
      calendar-service.ts
    extensions/                  # Extension Hub
      abstract-source.ts
      manifest-schema.ts
      permission-system.ts
      sandbox.ts
    mappings/                    # Mapper
      resolver.ts
      importer.ts
      conflict-resolver.ts
    network/                     # WARP, DoH, fetch
      doh-resolver.ts
      warp-config.ts
    offline/                     # Download Manager
      download-manager.ts
      storage-manager.ts
      stream-offline.ts
      cleanup-scheduler.ts
    player/                      # Player Core
      player-core.ts
      event-bus.ts
      adapters/
        hls-adapter.ts
        direct-adapter.ts
        offline-adapter.ts
        torrent-adapter.ts
      subtitle-manager.ts
      subtitle-memory.ts
      skip-window-manager.ts
      clip-system.ts
    providers/                   # Provider Orchestrator
      orchestrator.ts
      health-monitor.ts
      circuit-breaker.ts
    search/                      # Faceted Search
      faceted-search.ts
      query-builder.ts
      autocomplete.ts
      voice-search.ts
      saved-searches.ts
    stats/                       # Personal Stats
      personal-stats.ts
      wrapped-generator.ts
      milestone-tracker.ts
      share-image.ts
    sync/                        # Cross-Device Sync
      cross-device-sync.ts
      playback-sync.ts
      presence-manager.ts
      offline-queue.ts
    torrent/                     # Torrent Core
      types.ts
      quality-scorer.ts
      release-parser.ts
      episode-matcher.ts
      desktop-bridge.ts
    news/                        # News Feed
      news-aggregator.ts
      article-parser.ts
      notification-dispatcher.ts

  features/                      # Feature-based modules
    anime/
      components/
      hooks/
      pages/
      services/
    manga/
    watch/
    watch2gether/
    calendar/
    news/
    profile/
    community/
    admin/

  components/                    # Shared UI components
    ui/                          # Radix wrappers
    layout/                      # Layout shells
    virtualized/                 # Virtualized list components

  hooks/                         # Shared hooks (categorized)
    api/
    ui/
    media/

  lib/                           # Utilities (categorized)
    api/
    crypto/
    logger/

  i18n/                          # Translations
    locales/

  types/                         # Global TypeScript types

desktop/
  main.cjs                       # Hardened
  preload.cjs                    # Narrowed
  runtime/
    local-runtime.ts
    warp-tunnel.ts
    workers/
      scraper-worker.ts
      torrent-worker.ts
      extension-worker.ts
    torrent/
      session-manager.ts
      piece-prioritizer.ts
      cache-manager.ts
      stream-server.ts
    extensions/
      local-scraper.ts

TatakaiAPI/
  src/
    content/
    mappings/
    providers/
    extensions/
    admin/
```

---

## 12. Database Schema (Unified)

### 12.1 Core Architecture Tables

*(Content Graph tables defined in Section 3.7)*

### 12.2 Mapping Tables

```sql
CREATE TABLE source_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tatakai_id UUID REFERENCES content_items(tatakai_id) ON DELETE CASCADE,
  anilist_id INTEGER,
  mal_id INTEGER,
  kitsu_id INTEGER,
  anidb_aid INTEGER,
  tvdb_id INTEGER,
  imdb_id TEXT,
  tmdb_id INTEGER,
  provider_mappings JSONB DEFAULT '{}',
  confidence_score FLOAT DEFAULT 1.0,
  provenance TEXT DEFAULT 'anime-mapper',
  import_run_id UUID,
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
  anidb_eid INTEGER,
  tvdb_eid INTEGER,
  provider_episode_mappings JSONB DEFAULT '{}',
  confidence_score FLOAT DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tatakai_id, episode_number)
);

CREATE TABLE mapping_import_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
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
  conflict_type TEXT NOT NULL,
  conflicting_data JSONB NOT NULL,
  suggested_resolution JSONB,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 12.3 Provider Health Tables

```sql
CREATE TABLE provider_health_states (
  provider_id TEXT PRIMARY KEY,
  provider_name TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  status TEXT DEFAULT 'unknown' CHECK (status IN ('healthy', 'degraded', 'unhealthy', 'unknown')),
  last_check_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  consecutive_failures INTEGER DEFAULT 0,
  consecutive_successes INTEGER DEFAULT 0,
  avg_response_time_ms FLOAT,
  p95_response_time_ms FLOAT,
  error_rate_24h FLOAT,
  circuit_state TEXT DEFAULT 'closed' CHECK (circuit_state IN ('closed', 'open', 'half_open')),
  circuit_opened_at TIMESTAMPTZ,
  circuit_failure_threshold INTEGER DEFAULT 5,
  circuit_recovery_timeout_ms INTEGER DEFAULT 60000,
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
  incident_type TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  severity TEXT DEFAULT 'medium',
  description TEXT,
  error_samples JSONB,
  affected_routes TEXT[],
  resolved_by UUID REFERENCES auth.users(id),
  resolution_notes TEXT
);
```

### 12.4 Torrent Tables

```sql
CREATE TABLE torrent_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  info_hash TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  display_title TEXT,
  source_extension_id TEXT NOT NULL,
  source_url TEXT,
  magnet_uri TEXT,
  parsed_metadata JSONB,
  release_group TEXT,
  video_resolution TEXT,
  video_codec TEXT,
  audio_codec TEXT,
  source_type TEXT,
  is_dual_audio BOOLEAN DEFAULT FALSE,
  is_batch BOOLEAN DEFAULT FALSE,
  batch_episode_range INT4RANGE,
  language TEXT,
  seeders INTEGER DEFAULT 0,
  leechers INTEGER DEFAULT 0,
  downloads INTEGER DEFAULT 0,
  size_bytes BIGINT,
  upload_date TIMESTAMPTZ,
  quality_score FLOAT DEFAULT 0,
  match_accuracy TEXT DEFAULT 'medium',
  tatakai_id UUID REFERENCES content_items(tatakai_id),
  matched_episode_numbers INTEGER[],
  match_confidence FLOAT,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  is_available BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days'
);

CREATE TABLE torrent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_internal_id TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  tatakai_id UUID REFERENCES content_items(tatakai_id),
  episode_number INTEGER,
  info_hash TEXT REFERENCES torrent_candidates(info_hash),
  status TEXT DEFAULT 'pending',
  selected_files TEXT[],
  playable_file_path TEXT,
  progress_percent FLOAT DEFAULT 0,
  download_speed_bytes_sec BIGINT DEFAULT 0,
  upload_speed_bytes_sec BIGINT DEFAULT 0,
  total_downloaded_bytes BIGINT DEFAULT 0,
  total_uploaded_bytes BIGINT DEFAULT 0,
  peers_connected INTEGER DEFAULT 0,
  stream_url TEXT,
  stream_manifest TEXT,
  is_seeding_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
  error_count INTEGER DEFAULT 0,
  last_error TEXT
);

CREATE TABLE torrent_cache_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  info_hash TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  cache_path TEXT NOT NULL,
  priority INTEGER DEFAULT 0,
  is_fully_cached BOOLEAN DEFAULT FALSE,
  last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  UNIQUE(info_hash, file_path)
);
```

### 12.5 Extension Tables

```sql
CREATE TABLE extension_manifests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extension_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('torrent', 'onlinestream', 'custom', 'metadata')),
  main_url TEXT NOT NULL,
  update_url TEXT,
  description TEXT,
  speed TEXT CHECK (speed IN ('fast', 'moderate', 'slow')),
  accuracy TEXT CHECK (accuracy IN ('high', 'medium', 'low')),
  regions TEXT[],
  nsfw BOOLEAN DEFAULT FALSE,
  permissions TEXT[] DEFAULT '{}',
  signature TEXT,
  signed_by TEXT,
  submission_status TEXT DEFAULT 'pending'
    CHECK (submission_status IN ('pending', 'under_review', 'approved', 'rejected', 'disabled')),
  submitted_by UUID REFERENCES auth.users(id),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  is_killed BOOLEAN DEFAULT FALSE,
  killed_at TIMESTAMPTZ,
  kill_reason TEXT,
  install_count INTEGER DEFAULT 0,
  health_score FLOAT DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE extension_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extension_id TEXT REFERENCES extension_manifests(extension_id),
  event_type TEXT NOT NULL,
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
  last_used_at TIMESTAMPTZ,
  use_count INTEGER DEFAULT 0,
  user_settings JSONB DEFAULT '{}',
  UNIQUE(user_id, extension_id)
);
```

### 12.6 Feature Tables (New)

```sql
-- AI recommendations
CREATE TABLE user_embeddings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  preference_vector VECTOR(384),
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- Watch2Together
CREATE TABLE watch_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID REFERENCES auth.users(id),
  tatakai_id UUID REFERENCES content_items(tatakai_id),
  episode_number INTEGER,
  status TEXT DEFAULT 'waiting',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

CREATE TABLE room_participants (
  room_id UUID REFERENCES watch_rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  is_host BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (room_id, user_id)
);

-- Downloads
CREATE TABLE download_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  tatakai_id UUID REFERENCES content_items(tatakai_id),
  episode_number INTEGER,
  quality TEXT,
  status TEXT DEFAULT 'queued',
  progress FLOAT DEFAULT 0,
  file_path TEXT,
  file_size BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Clips
CREATE TABLE clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES auth.users(id),
  tatakai_id UUID REFERENCES content_items(tatakai_id),
  episode_number INTEGER,
  start_time FLOAT,
  end_time FLOAT,
  title TEXT,
  thumbnail_url TEXT,
  views INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- News
CREATE TABLE news_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id TEXT,
  source_name TEXT,
  title TEXT,
  summary TEXT,
  url TEXT,
  image_url TEXT,
  published_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  related_tatakai_ids UUID[]
);

-- Stats
CREATE TABLE viewing_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  milestone_type TEXT,
  threshold INTEGER,
  achieved_at TIMESTAMPTZ DEFAULT NOW(),
  is_notified BOOLEAN DEFAULT FALSE
);
```

---

## 13. Data Migration Plan

### Migration Philosophy

- **Zero-downtime:** All migrations are additive
- **Dual-write:** Write to old and new tables during transition
- **Backwards-compatible:** Old API responses unchanged during migration
- **Rollback-ready:** Each migration has a rollback script
- **Feature-flagged:** New paths gated until verified

### Migration Execution Order

| Phase | Migration | Description |
|-------|-----------|-------------|
| 1 | `001_content_graph.sql` | Content Graph tables (Section 3.7) |
| 0 | `006_country_policies.sql` | 196 countries with default 'unclear' |
| 2 | `002_mapper_internalization.sql` | source_mappings, episode_mappings |
| 2 | `003_provider_health.sql` | provider_health_states, incidents |
| 5 | `004_torrent_core.sql` | torrent_candidates, sessions, cache |
| 7 | `005_extension_hub.sql` | extension_manifests, audit_logs, user_extensions |
| 1-7 | `007_feature_tables.sql` | user_embeddings, watch_rooms, clips, news, milestones |

### Migration 1: Content Graph (AniList Ingestion)

```typescript
// scripts/migrations/001-ingest-anilist.ts
async function ingestAniListCatalog() {
  const pageSize = 50;
  let page = 1;
  let hasNextPage = true;

  while (hasNextPage) {
    const result = await anilistClient.query<PageResponse>(FULL_MEDIA_QUERY, { page, perPage: pageSize });
    for (const media of result.Page.media) {
      await upsertContentNode(media);
    }
    hasNextPage = result.Page.pageInfo.hasNextPage;
    page++;
    await sleep(1000); // Rate limit respect
  }
}
```

### Migration 2: Mapper Data Internalization

```typescript
// scripts/migrations/002-import-mapper.ts
async function importMapperShard(shardPath: string) {
  const runId = await startImportRun('anime-mapper', shardPath);
  const shard = await loadMapperShard(shardPath);

  for (const entry of shard.entries) {
    try {
      const tatakaiId = await resolveTatakaiIdByAniList(entry.anilistId);
      await upsertSourceMapping(tatakaiId, entry, runId);
      await recordImportProgress(runId, 'inserted');
    } catch (err) {
      await recordImportConflict(runId, entry, err);
    }
  }
  await completeImportRun(runId);
}
```

---

## 14. Security Hardening (Phase 0)

### 14.1 Electron Security Fixes

```javascript
// desktop/main.cjs -- AFTER (HARDENED)
const mainWindow = new BrowserWindow({
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    webSecurity: true,
    sandbox: true,
    allowRunningInsecureContent: false,
    preload: path.join(__dirname, 'preload.cjs'),
    allowPopups: false,
    safeDialogs: true,
    navigateOnDragDrop: false,
  }
});

// Navigation lockdown
mainWindow.webContents.on('will-navigate', (event, url) => {
  const allowedOrigins = ['https://tatakai.app', 'https://*.tatakai.app', 'http://localhost:*'];
  if (!isAllowed(url, allowedOrigins)) event.preventDefault();
});

// New window lockdown
mainWindow.webContents.setWindowOpenHandler(({ url }) => {
  if (url.startsWith('https://')) require('electron').shell.openExternal(url);
  return { action: 'deny' };
});

// Permission lockdown
mainWindow.webContents.session.setPermissionRequestHandler(
  (webContents, permission, callback) => {
    callback(['clipboard-read', 'clipboard-write'].includes(permission));
  }
);
```

### 14.2 Preload Bridge Narrowing

```typescript
// desktop/preload.cjs -- MINIMAL API SURFACE
const tatakaiRuntime = {
  health: () => ipcRenderer.invoke('runtime:health'),
  resolveEpisodeSources: (options) => ipcRenderer.invoke('runtime:resolve-sources', options),
  searchTorrentCandidates: (options) => ipcRenderer.invoke('torrent:search', options),
  startTorrentSession: (infoHash, options) => ipcRenderer.invoke('torrent:start', infoHash, options),
  stopTorrentSession: (sessionId) => ipcRenderer.invoke('torrent:stop', sessionId),
  getSessionStats: (sessionId) => ipcRenderer.invoke('torrent:stats', sessionId),
  readLocalCache: (key) => ipcRenderer.invoke('cache:read', key),
  writeLocalCache: (key, value, ttl) => ipcRenderer.invoke('cache:write', key, value, ttl),
  executeExtension: (extensionId, method, options) => ipcRenderer.invoke('extension:execute', extensionId, method, options),
  onTorrentProgress: (callback) => ipcRenderer.on('torrent:progress', callback),
  onPlaybackEvent: (callback) => ipcRenderer.on('player:event', callback),
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
};

contextBridge.exposeInMainWorld('tatakaiRuntime', tatakaiRuntime);
// NOTHING ELSE IS EXPOSED
```

### 14.3 Dependency Audit

```bash
npm audit --audit-level=moderate
# Integrate Snyk or Dependabot
# Pin all dependency versions
# Review all native modules (node-gyp)
```

---

## 15. Unified Phased Roadmap

### Phase 0: Security + Tech Baseline

**Goal:** Make the app safe enough to evolve

| Work Item | Owner | Deliverable |
|-----------|-------|-------------|
| Harden Electron defaults | Backend | `desktop/main.cjs` security patch |
| Remove unsafe webPreferences | Backend | Security audit pass |
| Review preload boundaries | Backend | Narrowed `preload.cjs` |
| Create shared TypeScript contracts | Frontend | `TatakaiDomainContracts` package |
| Add feature-flag framework (Unleash) | Backend | `FeatureFlagService` |
| Add baseline telemetry | Backend | Provider/playback/desktop health metrics |
| Add i18n framework | Frontend | react-i18next setup |
| Add Dexie.js | Frontend | IndexedDB abstraction |
| Add BlurHash | Frontend | Image placeholder system |
| Add bundle analyzer | DevOps | Bundle size visibility |
| Add react-scan (dev) | Frontend | Render debugging |
| Seed country policies | Backend | 196 countries |
| Document route contracts | Docs | API + component contract docs |

**Exit Criteria:**
- Desktop app passes security review
- No current features break
- Feature flags operational
- Country table seeded

### Phase 1: Content Graph + Virtualization + i18n

**Goal:** Stop scraper dependence for all browsing surfaces

| Work Item | Owner | Deliverable |
|-----------|-------|-------------|
| Build AniList GraphQL client | Frontend | `AniListClient` with rate limiting |
| Build Jikan REST fallback client | Frontend | `JikanClient` with query mapping |
| Create content ingestion pipeline | Backend | `ContentIngestionService` |
| Build content APIs | Backend | `/api/v3/content/*` endpoints |
| Migrate Home/Search/Trending/Genre/Seasonal pages | Frontend | Uses Content Graph |
| **Virtualized lists** | Frontend | `@tanstack/react-virtual` |
| **BlurHash integration** | Frontend | All image components |
| **i18n UI translation** | Frontend | All 13 languages |
| Add admin override tables | Backend | Title/poster corrections |
| Implement dual-write | Backend | Old + new tables during transition |
| Add content caching layers | Frontend | IndexedDB + Service Worker |

**Exit Criteria:**
- Home, Search, Trending, Genres, Seasonal work without scrapers
- Jikan fallback works when AniList is unavailable
- All 196 country policies queryable
- Large catalogs scroll smoothly

### Phase 2: Mapper + Search + AI Recommendations

**Goal:** Remove hot-path dependence on external mapper; add smart discovery

| Work Item | Owner | Deliverable |
|-----------|-------|-------------|
| Build mapper ingestion job | Backend | `MapperImportJob` |
| Create mapping tables | Backend | `source_mappings`, `episode_mappings` |
| Build mapping resolver | Backend | Internal mappings first, fallback second |
| Add mapping confidence scoring | Backend | Conflict resolution |
| Build admin conflict UI | Frontend | Mapping conflict resolution panel |
| Add provider health monitoring | Backend | `ProviderHealthService` |
| Create provider orchestrator | Backend | `ProviderOrchestrator` |
| **Faceted search** | Frontend | Advanced filters with PostgreSQL |
| **Voice search** | Frontend | Speech recognition |
| **Tatakai Neural v1** | Frontend | On-device recommendations |

**Exit Criteria:**
- Provider resolution works from internal mappings for 90%+ of titles
- External mapper outages don't block playback
- Faceted search operational
- AI recommendations working on-device

### Phase 3: Player Core + Offline + Subtitle AI

**Goal:** Same UI, modular core; offline viewing

| Work Item | Owner | Deliverable |
|-----------|-------|-------------|
| Split VideoPlayer into shell + core | Frontend | `VideoPlayerShell` + `PlayerCore` |
| Create source adapter registry | Frontend | HLS, Direct, Offline, Torrent (stub) adapters |
| Isolate subtitle management | Frontend | `SubtitleManager` with per-series memory |
| Isolate skip windows | Frontend | `SkipWindowManager` (OP/ED detection) |
| **Download manager** | Desktop/Mobile | Offline episodes |
| **Smart download** | Frontend | Auto-download settings, quality picker |
| **AI subtitle translation** | Frontend | ONNX opus-mt models |
| **Smart Theme Creator** | Frontend | Visual theme editor |

**Exit Criteria:**
- Existing watch UI looks identical
- Torrent can plug in as another adapter later
- Per-series subtitle memory works
- Download manager with queue and storage management

### Phase 4: Local Runtime + Extension Scraping + WARP

**Goal:** Device-level scraping, network tunnel, reduced server dependence

| Work Item | Owner | Deliverable |
|-----------|-------|-------------|
| Create local runtime service | Desktop | `TatakaiLocalRuntime` |
| Build IPC bridge | Desktop | `LocalRuntimeBridge` via preload |
| **Build extension sandbox with fetch** | Desktop | `ExtensionSandbox` |
| **Build local scraping worker** | Desktop | Extensions scrape from device |
| **Implement domain permission system** | Desktop | Per-extension domain allowlist |
| **Implement 1.1.1.1 DoH** | Desktop | Always-on encrypted DNS |
| **Implement WARP proxy tunnel** | Desktop | User-toggle SOCKS5 proxy |
| **Build WARP auto-trigger** | Desktop | Auto-enable on blocked sites |
| Update renderer hooks | Frontend | `useLocalRuntime()` |
| Build circuit breakers | Frontend | Auto-fallback to server API |

**Exit Criteria:**
- Desktop source fallback works without UI changes
- Extensions can scrape locally with permissions
- WARP tunnel connects and routes traffic
- Server outages have lower impact on desktop

### Phase 5: Torrent Core + Calendar + Stats

**Goal:** First-party torrent; discovery and personalization features

| Work Item | Owner | Deliverable |
|-----------|-------|-------------|
| Integrate anitomyscript | Desktop | Filename parser |
| Build torrent candidate discovery | Desktop | `TorrentSearchService` |
| Build release quality scorer | Desktop | `ReleaseQualityScorer` |
| Build torrent session manager | Desktop | Start/stop/stream lifecycle |
| Build streaming bridge | Desktop | Byte-range server for player |
| Add country policy gating | Frontend | VPN warning before torrent |
| **Anime calendar** | Frontend | Airing schedule with views |
| **Push notifications** | Mobile | Capacitor episode alerts |
| **Tatakai Wrapped** | Frontend | Stats + share cards |
| **Milestone badges** | Frontend | Achievement system |
| Integrate with Player Core | Frontend | `TorrentPlaybackAdapter` |

**Exit Criteria:**
- Torrent search/select/start/stop works on desktop
- Player UI visually unchanged
- Country policy enforced
- Calendar and stats features live

### Phase 6: Watch2Together v2 + Cross-Device Sync

**Goal:** Real-time social and cross-device experiences

| Work Item | Owner | Deliverable |
|-----------|-------|-------------|
| **WebRTC sync** | Frontend | Real-time room sync |
| **Supabase Realtime rooms** | Backend | Room state management |
| **Cross-device sync** | Frontend | Seamless handoff |
| **Device presence** | Frontend | Active device list |
| Mobile convergence | Mobile | Server-first, Content Graph + Player Core |
| Mobile caches | Mobile | Aggressive IndexedDB caching |

**Exit Criteria:**
- Watch2Together rooms with sub-second sync
- Cross-device handoff working
- No mobile regression from desktop work

### Phase 7: Extensions Platform + Clips + News

**Goal:** Formal extension platform with moderation; content creation and discovery

| Work Item | Owner | Deliverable |
|-----------|-------|-------------|
| Define extension manifest schema | Backend | `ExtensionManifestSchema` |
| Define local scraping permissions | Backend | `network:fetch`, `network:domain:*` |
| Build admin review workflow | Frontend | `ExtensionReviewWorkflow` |
| Build signing system | Backend | Cryptographic signatures |
| Build kill-switch system | Backend | Instant revocation |
| **Clip system** | Frontend | Create + share |
| **Anime news feed** | Frontend | News aggregator |
| **Character database** | Frontend | Character pages |
| **OST player** | Frontend | Soundtrack playback |
| Build local scraping audit panel | Frontend | Extension network activity |
| Build WARP management panel | Frontend | `WarpSettingsPanel` |

**Exit Criteria:**
- Extensions are reviewed, signed, and revocable
- Extension network activity is auditable
- Clip system and news feed operational
- Character/OST browsing available

### Phase 8: Polish + Production

**Goal:** Secure, fast, resilient production state

| Work Item | Owner | Deliverable |
|-----------|-------|-------------|
| **React 19 + Compiler** | Frontend | Auto-memoization |
| **Tailwind v4** | Frontend | Faster builds |
| **@tanstack/react-router** | Frontend | Type-safe routing |
| Performance budgets | DevOps | Enforced limits |
| E2E tests | QA | Playwright |
| Security audit | Security | Full review |
| Integration tests | QA | Content, provider, player, torrent, admin |
| Dependency audit | DevOps | Snyk/Dependabot |
| Rollout playbook | DevOps | Canary -> staged -> broad |
| Rollback playbook | DevOps | Emergency procedures |

**Exit Criteria:**
- No critical Electron security findings
- No major regressions
- Torrent desktop alpha stable
- Overall crash rate < 0.1%
- All performance budgets met

---

## 16. API Contract Evolution

### Current v2 -> Target v3

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
| -- | `/api/v3/mappings/resolve` | New |
| -- | `/api/v3/mappings/conflicts` | New |
| -- | `/api/v3/extensions/list` | New |
| -- | `/api/v3/extensions/submit` | New |
| -- | `/api/v3/admin/countries` | New |
| -- | `/api/v3/admin/providers/health` | New |
| -- | `/api/v3/admin/extensions/review` | New |

### Backwards Compatibility

- v2 endpoints remain operational during entire migration
- v3 endpoints return superset data
- Frontend feature flags control which endpoints are called
- Deprecation timeline: v2 retired 6 months after v3 stable

---

## 17. Core Module Specifications

### 17.1 Content Graph

```typescript
async function ingestAniListCatalog(page?: number): Promise<IngestionResult>;
async function ingestJikanFallback(malId: number): Promise<Partial<ContentItem>>;
async function upsertContentNode(media: AniListMedia): Promise<string>;
async function assignTatakaiId(anilistId?: number, malId?: number): Promise<string>;
async function buildTrendingFeed(limit?: number): Promise<ContentItem[]>;
async function buildHomeFeed(userId?: string): Promise<HomeFeedSections>;
async function searchContent(query: string, filters?: SearchFilters): Promise<SearchResult>;
```

### 17.2 Mapper Ingestor

```typescript
async function importMapperShard(shardPath: string, runId: string): Promise<ImportResult>;
async function resolveProviderMap(tatakaiId: string, providerId: string): Promise<string | null>;
async function resolveProviderEpisodeMap(tatakaiId: string, episodeNumber: number, providerId: string): Promise<string | null>;
async function reconcileMappingConflicts(): Promise<ConflictReport>;
```

### 17.3 Provider Orchestrator

```typescript
async function fetchProviderSources(tatakaiId: string, episodeNumber: number, options: SourceOptions): Promise<StreamingCandidate[]>;
async function mergeStreamingSources(candidates: StreamingCandidate[][]): Promise<StreamingCandidate[]>;
async function fallbackToLocalRuntime(options: SourceOptions): Promise<StreamingCandidate[]>;
async function fallbackToServerApi(options: SourceOptions): Promise<StreamingCandidate[]>;
async function recordProviderHealth(providerId: string, result: HealthCheckResult): Promise<void>;
```

### 17.4 Local Runtime Bridge

```typescript
function isLocalRuntimeAvailable(): boolean;
async function requestLocalEpisodeSources(tatakaiId: string, episode: number): Promise<StreamingCandidate[]>;
async function requestTorrentSessionStart(infoHash: string, options: TorrentOptions): Promise<TorrentSession>;
async function reportLocalRuntimeHealth(): Promise<RuntimeHealth>;
```

### 17.5 Torrent Core

```typescript
async function searchTorrentCandidates(options: TorrentSearchOptions): Promise<TorrentCandidate[]>;
async function scoreTorrentCandidate(candidate: TorrentCandidate, preferences: UserPreferences): Promise<number>;
async function startTorrentSession(infoHash: string, options: SessionOptions): Promise<TorrentSession>;
async function createPlaybackManifest(sessionId: string): Promise<string>;
async function parseReleaseName(filename: string): Promise<ParsedReleaseMetadata>;
async function scoreReleaseQuality(release: NormalizedRelease, preferences: UserPreferences): Promise<number>;
```

**Quality Scoring Signals:**
1. Source quality (BluRay > WEB-DL > TV > HDRip)
2. Codec compatibility
3. Resolution match
4. Audio track availability (dual audio > sub only)
5. Subtitle quality (styled ASS > plain SRT)
6. Release group trust score
7. Seed health and swarm stability
8. Episode naming confidence vs Tatakai metadata

### 17.6 Player Core

```typescript
async function attachPlaybackSource(source: PlaybackSource): Promise<void>;
async function switchPlaybackSource(source: PlaybackSource): Promise<void>;
async function setPlaybackMode(mode: 'hls' | 'direct' | 'torrent' | 'offline'): Promise<void>;
async function setSkipWindows(windows: SkipWindow[]): Promise<void>;
async function syncPlaybackProgress(progress: PlaybackProgress): Promise<void>;

interface SourceAdapter {
  readonly type: string;
  canHandle(source: PlaybackSource): boolean;
  attach(player: HTMLVideoElement, source: PlaybackSource): Promise<void>;
  detach(): Promise<void>;
  seek(time: number): Promise<void>;
}
// Adapters: HLSAdapter, DirectStreamAdapter, OfflineFileAdapter, TorrentPlaybackAdapter
```

### 17.7 Extension Hub

```typescript
async function validateExtensionManifest(manifest: ExtensionManifest): Promise<ValidationResult>;
async function approveExtensionVersion(extensionId: string, version: string, reviewerId: string): Promise<void>;
async function disableExtension(extensionId: string, reason: string): Promise<void>;
async function executeExtensionInSandbox(extensionId: string, method: string, options: object): Promise<unknown>;
```

### 17.8 Extension Local Scraping Runtime

```typescript
async function executeLocalScrape(extensionId: string, method: string, options: SourceOptions): Promise<SourceResult[]>;
async function validateFetchPermission(extensionId: string, url: string): Promise<boolean>;
async function interceptFetch(extensionId: string, url: string, init?: RequestInit): Promise<Response>;

interface ExtensionRuntimeAPI {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  parseHtml: (html: string) => CheerioLikeParser;
  parseJson: (json: string) => unknown;
  anitomyscript: AnitomyScript;
  regex: { match: Function; replace: Function };
}
```

### 17.9 WARP Tunnel

```typescript
async function initializeDoH(): Promise<void>;
async function resolveViaDoH(hostname: string): Promise<string>;
async function enableWarp(): Promise<void>;
async function disableWarp(): Promise<void>;
async function setWarpMode(mode: 'auto' | 'always' | 'on-demand'): Promise<void>;
async function fetchThroughWarp(url: string, init?: RequestInit): Promise<Response>;
async function getWarpStatus(): Promise<WarpStatus>;
async function testWarpConnectivity(): Promise<ConnectivityResult>;
```

### 17.10 Admin Ops

```typescript
async function updateCountryPolicy(isoCode: string, updates: PolicyUpdate, adminId: string): Promise<void>;
async function reviewProviderIncident(incidentId: string, resolution: IncidentResolution): Promise<void>;
async function reviewMappingConflict(conflictId: string, resolution: MappingResolution): Promise<void>;
async function approveMarketplaceItem(itemId: string): Promise<void>;
async function disableProviderRoute(providerId: string, reason: string): Promise<void>;
```

---

## 18. Mapping Optimization Strategy

### Resolution Flow

```
User requests Episode 5 of "Attack on Titan"
    |
    v
Tatakai Content Graph (tatakai_id -> anilist_id)
    |
    v
Source Mappings Table (provider_ids, anidb_aid, tvdb_id)
    |
    +-- Provider Resolver (direct ID mapping -> title search fallback)
    |
    +-- Torrent Resolver (titles + anidb_aid + anitomyscript matching)
    |
    v
Unified Results (streaming + torrent merged & scored)
```

### Optimization: Direct ID > Cross-ID > Title Search

```typescript
async function resolveProviderSourcesOptimized(tatakaiId, episodeNumber, providerId) {
  // 1. Direct mapping (fastest)
  const mapping = await mappingResolver.resolveProviderMap(tatakaiId, providerId);
  if (mapping) return providerClient.fetchById(mapping, episodeMap);

  // 2. Cross-ID mapping (AniDB -> provider)
  const anidbAid = await mappingResolver.resolveAniDbAid(tatakaiId);
  if (anidbAid) return providerClient.searchByAniDb(anidbAid, episodeNumber);

  // 3. Title search (slowest, least reliable)
  const titles = await contentGraph.getAllTitles(tatakaiId);
  return providerClient.searchByTitles(titles, episodeNumber);
}
```

### Caching Strategy for Mappings

| Cache Level | Key Pattern | TTL | Purpose |
|-------------|-------------|-----|---------|
| L1 (Memory) | `map:{tatakaiId}:{providerId}` | 5 min | Hot path provider lookups |
| L2 (IndexedDB) | `map:{tatakaiId}` | 1 hour | Full mapping record |
| L3 (API Cache) | `v3:mappings:{tatakaiId}` | 6 hours | Central fallback |
| L4 (Static) | `mapper:shard:{version}` | 7 days | Mapper ingestion shards |

---

## 19. No-Regression Guardrails

### Features That Must Not Break

| Feature | Guardrail |
|---------|-----------|
| Watch flows (12+ providers) | All existing source paths preserved |
| Source selection | Same UI, new core underneath |
| Comments / Forum | Unchanged tables, unchanged APIs |
| Admin/moderation | Unchanged + new panels added |
| Provider fanout | No providers removed during migration |
| Manga support | Unchanged |
| Community profiles | Unchanged |
| Marketplace | Evolved into Extension Hub, old data migrated |
| Custom sources | Migrated to extension format |
| Desktop (Electron) | Security hardened, features preserved |
| Mobile (Capacitor) | No forced parity, server-first |
| 13 dub languages | Preserved |
| 30+ servers | Preserved |
| MAL/AniList sync | Preserved, now uses Content Graph IDs |
| 25+ themes | Preserved |
| HLS player | Core refactored, UI preserved |
| Subtitles | Enhanced with per-series memory |
| PiP / Screenshots / Keyboard controls | Preserved |
| Offline handling | Enhanced with local runtime |

### Technical Guardrails

1. **Feature flags:** All new behavior behind `FEATURE_*` flags
2. **Dual-write:** Old and new tables written simultaneously during migration
3. **API versioning:** v2 stable, v3 additive, no breaking changes
4. **Component contracts:** Documented props/interfaces for all major components
5. **Canary rollouts:** Desktop torrent features on canary channel first
6. **Rollback scripts:** Every migration has a tested rollback
7. **A/B testing:** New content endpoints tested alongside old ones
8. **Error boundaries:** Player, content, and extension areas have error boundaries
9. **Graceful degradation:** AniList down -> Jikan -> cached -> stale data
10. **Performance budgets:** Bundle size, render time, API response time tracked

---

## 20. Target Architecture

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
         +----------+----------+           +----------------------+
                     |
     +---------------+----------------+
     |                                |
 +---v----------------+   +-----------v------------+
 | Web Renderer       |   | Desktop Renderer       |
 | server-first       |   | same UI as web         |
 | AniList/Jikan      |   | DoH DNS + WARP proxy   |
 | DoH DNS only       |   +-----------+------------+
 +--------------------+               |
                           +-----------v------------+
                           | Local Runtime          |
                           | TS workers + IPC       |
                           | +------------------+   |
                           | | Extension Sandbox|   |
                           | | Web Workers      |   |
                           | | Local scraping   |   |
                           | +------------------+   |
                           | +------------------+   |
                           | | Torrent Core     |   |
                           | | Session manager  |   |
                           | +------------------+   |
                           +-----------+------------+
                                       |
                           +-----------v------------+
                           | 1.1.1.1 WARP Tunnel    |
                           | DNS-over-HTTPS         |
                           | SOCKS5 proxy           |
                           | Geo-block bypass       |
                           +-----------+------------+
                                       |
                           +-----------v------------+
                           | Tatakai Player Core    |
                           | HLS/Direct/Offline/    |
                           | Torrent adapters       |
                           +------------------------+

 +--------------------+
 | Mobile Renderer    |
 | same UI contracts  |
 | server-first       |
 | Content Graph      |
 | Player Core        |
 | DoH DNS (limited)  |
 +--------------------+
```

---

## 21. Complete Feature Matrix

| Feature | SeaAnime | Shiru | Tatakai Current | Tatakai Target | Phase |
|---------|----------|-------|-----------------|----------------|-------|
| **Browsing** |
| AniList metadata | - | Yes | Partial | Yes (Primary) | 1 |
| Jikan fallback | - | - | - | Yes | 1 |
| Zero scraper browsing | - | Yes | - | Yes | 1 |
| Virtualized lists | - | - | - | Yes | 1 |
| BlurHash images | - | - | - | Yes | 1 |
| Faceted search | - | - | - | Yes | 2 |
| Voice search | - | - | - | Yes | 2 |
| **Player** |
| HLS playback | Yes | Yes | Yes | Yes | - |
| Custom subtitles | Yes | Yes | Yes | Yes | - |
| PiP | Yes | Yes | Yes | Yes | - |
| Per-series subtitle memory | - | Yes | - | Yes | 3 |
| Chapter skip (OP/ED) | - | Yes | - | Yes | 3 |
| Volume boost | - | Yes | - | Yes | 3 |
| Miniplayer | - | Yes | - | Yes | 3 |
| **Torrent** |
| Torrent search | Yes | Yes | - | Yes | 5 |
| Torrent streaming | Yes | Yes | - | Yes | 5 |
| anitomyscript parsing | - | Yes | - | Yes | 5 |
| Release quality scoring | - | Partial | - | Yes | 5 |
| **Extensions** |
| Web Worker sandbox | - | Yes | - | Yes | 4 |
| Local scraping | - | - | - | Yes | 4 |
| Manifest system | - | Yes | - | Yes | 7 |
| Moderated platform | - | - | Partial | Yes | 7 |
| **Network** |
| DoH (1.1.1.1) | - | - | - | Yes | 4 |
| WARP proxy | - | - | - | Yes | 4 |
| **Social** |
| Comments | - | - | Yes | Yes | - |
| Forum | - | - | Yes | Yes | - |
| Watch2Together | - | - | Yes | Yes (WebRTC) | 6 |
| Real-time sync | - | - | - | Yes | 6 |
| Clip sharing | - | - | - | Yes | 7 |
| **Offline** |
| Download manager | - | - | Partial | Yes | 3 |
| Auto-download | - | - | - | Yes | 3 |
| Storage management | - | - | - | Yes | 3 |
| **AI/ML** |
| On-device recommendations | - | - | Partial (server) | Yes | 2 |
| AI subtitle translation | - | - | - | Yes | 3 |
| **Discovery** |
| Calendar/Schedule | - | Yes | - | Yes | 5 |
| News feed | - | - | - | Yes | 7 |
| Character database | - | - | - | Yes | 7 |
| OST player | - | - | - | Yes | 7 |
| **Personalization** |
| Stats dashboard | - | - | Partial | Yes | 5 |
| Wrapped (annual stats) | - | - | - | Yes | 5 |
| Theme creator | - | - | Partial (25 presets) | Yes | 3 |
| Cross-device sync | - | - | - | Yes | 6 |
| **Platform** |
| Web | Yes | Yes | Yes | Yes | - |
| Desktop (Electron) | Yes | Yes | Yes | Yes | - |
| Mobile (Capacitor) | - | Yes | Yes | Yes | - |
| PWA | - | - | Yes | Yes | - |
| **Admin** |
| Provider health | - | - | Partial | Yes | 2 |
| Extension review | - | - | Partial | Yes | 7 |
| Country policies | - | - | - | Yes | 0 |
| **Legal** |
| 196-country torrent policy | - | - | - | Yes | 0 |
| VPN recommendation | - | - | - | Yes | 5 |
| **Tech Upgrades** |
| React 19 + Compiler | - | - | - | Yes | 8 |
| Tailwind v4 | - | - | - | Yes | 8 |
| @tanstack/react-router | - | - | - | Yes | 8 |
| @tanstack/react-virtual | - | - | - | Yes | 1 |
| Dexie.js | - | - | - | Yes | 0 |
| BlurHash | - | - | - | Yes | 0 |
| ONNX Runtime Web | - | - | - | Yes | 2 |
| WebGPU | - | - | - | Yes | 3 |
| Feature Flags (Unleash) | - | - | - | Yes | 0 |
| i18n (react-i18next) | - | - | - | Yes | 0 |

---

## 22. Appendices

### Appendix A: Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Metadata primary | AniList GraphQL | Richest anime data, native trending/seasonal |
| Metadata fallback | Jikan REST v4 | Reliable MAL mirror |
| Extension runtime | Web Workers | Isolated, no DOM access, Shiru-proven |
| Extension scraping | Local fetch via worker | Reduces server load, bypasses datacenter IP blocks |
| Filename parsing | anitomyscript | Battle-tested, Shiru uses it, JS-native |
| Desktop IPC | Electron preload + IPC | Narrow surface, typed, auditable |
| DNS resolution | 1.1.1.1 DoH | Bypass ISP blocks, encrypted |
| Geo-block bypass | Cloudflare WARP proxy | Application-level, 150+ egress cities |
| Local storage | IndexedDB (Dexie.js) | Structured data, TypeScript-friendly |
| Vector search | pgvector (Supabase) | ML recommendations, similar anime |
| Client-side AI | ONNX Runtime Web | Lighter than TF.js, multi-framework support |
| Feature flags | Unleash | Gradual rollout + A/B testing |
| Localization | react-i18next | Industry standard, 13+ languages |

### Appendix B: Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| AniList rate limits | Medium | High | Jikan fallback, aggressive caching |
| Electron security regression | Low | Critical | Security review gate, automated audit |
| Torrent legal issues | Medium | High | Country policy system, VPN warnings |
| Extension sandbox escape | Low | Critical | Web Workers, permission system, kill switch |
| Extension fetches malicious domain | Low | High | Domain allowlist, admin review |
| WARP connection unstable | Medium | Medium | Auto-fallback to direct, health monitoring |
| Site blocks WARP egress IPs | Medium | Medium | Multiple egress cities, server API fallback |
| Local scraping leaks user IP | Low | High | WARP routing, DoH always on |
| Mapper data stale | Medium | Medium | Weekly ingestion, manual override |
| Provider breakage during migration | Medium | High | Dual-write, circuit breakers, fallback chains |
| Community backlash from changes | Low | Medium | No UI changes during core refactor, feature flags |

### Appendix C: Success Metrics by Phase

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
| 4 | Extension local scrape success rate | > 75% |
| 4 | WARP connection success rate | > 95% |
| 4 | Server bandwidth reduction | > 50% |
| 5 | Torrent search success rate | > 80% |
| 5 | Torrent playback start time | < 15s |
| 5 | Country policy enforcement | 100% of torrent attempts |
| 6 | Mobile crash rate | No increase |
| 7 | Extension review time | < 48 hours |
| 7 | Extension kill-switch latency | < 5 minutes |
| 8 | Overall app crash rate | < 0.1% |
| 8 | Security scan findings | 0 critical |

### Appendix D: 196-Country Seed Data Structure

```typescript
interface CountrySeedEntry {
  isoCode: string;
  isoCode3: string;
  countryName: string;
  countryNameLocal: string;
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
```

**Maintenance:** Quarterly legal review, user reports, admin verifies, audit log records changes.

### Appendix E: Sample Country Seed Data

```sql
INSERT INTO country_torrent_policies VALUES
  ('DE', 'DEU', 'Germany', 'illegal', 'high', true, true, true, true,
   'Copyright Act (UrhG)', 'Abmahnung letters common. VPN strongly recommended.'),
  ('JP', 'JPN', 'Japan', 'illegal', 'severe', true, true, false, true,
   'Copyright Act (Act No. 48 of 1970)', 'Uploading punishable by up to 10 years.'),
  ('US', 'USA', 'United States', 'illegal', 'moderate', true, true, true, false,
   'Digital Millennium Copyright Act', 'Civil liability. Criminal for commercial scale.'),
  ('IN', 'IND', 'India', 'unclear', 'low', false, false, false, false,
   NULL, 'No specific torrent law. Rarely enforced for personal use.'),
  ('CH', 'CHE', 'Switzerland', 'legal', 'none', false, false, false, false,
   'Swiss Copyright Act', 'Downloading for personal use is legal.');
```

---

**End of Unified Master Plan**

This document consolidates all unique elements from both source plans into a single reference. The phased roadmap reconciles both timelines into 9 phases (0-8) that address security foundations, core architecture, new features, technology upgrades, and production hardening in a logical dependency order.
