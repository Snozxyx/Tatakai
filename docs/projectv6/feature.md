# Tatakai Extended Architecture Plan v4.0
## New Features · Technology Upgrades · Performance Optimizations · Codebase Analysis

**Owner:** Snozxyx  
**Date:** 2026  
**Scope:** Feature expansion + tech modernization + performance optimization based on actual codebase audit

---

## Table of Contents

1. [Codebase Deep Audit & Findings](#1-codebase-deep-audit--findings)
2. [New Features to Add](#2-new-features-to-add)
3. [Technology Upgrades](#3-technology-upgrades)
4. [Performance Optimizations](#4-performance-optimizations)
5. [New Core Modules](#5-new-core-modules)
6. [Updated Phased Roadmap](#6-updated-phased-roadmap)
7. [Technical Implementation Details](#7-technical-implementation-details)
8. [Appendix: Complete Feature Matrix](#8-appendix-complete-feature-matrix)

---

## 1. Codebase Deep Audit & Findings

### 1.1 What's Already Strong (Don't Break These)

| Area | Current State | Assessment |
|------|--------------|------------|
| **Build System** | Vite 5.4.19 + @vitejs/plugin-react-swc | Excellent. SWC is fastest React compiler. |
| **Data Fetching** | TanStack Query v5 | Excellent. Industry standard. |
| **UI Primitives** | Radix UI (30+ components) | Excellent. Accessible, unstyled, composable. |
| **Animations** | Framer Motion | Excellent. Best React animation library. |
| **Video Player** | HLS.js | Excellent. Industry standard for HLS. |
| **Auth/Backend** | Supabase client | Excellent. Realtime, auth, storage, PostgreSQL. |
| **Observability** | Sentry + Datadog | Excellent. Error tracking + logging. |
| **Desktop** | Electron v40 + electron-builder | Excellent. Very recent version. |
| **Mobile** | Capacitor v8 | Excellent. Latest major version. |
| **PWA** | Workbox (sw.js) | Good. Service worker already registered. |
| **Validation** | Zod + React Hook Form | Excellent. Type-safe forms. |
| **Media Processing** | Sharp + fluent-ffmpeg | Excellent. Image + video processing. |
| **Discord** | RPC + Embedded App SDK | Excellent. Rich presence + Discord activity. |
| **Charts** | Recharts | Good. For analytics dashboards. |
| **Carousel** | Embla Carousel | Good. Lightweight, performant. |
| **Drag & Drop** | DND Kit | Good. Accessible drag-and-drop. |
| **Toasts** | Sonner | Good. Clean toast notifications. |
| **Drawers** | Vaul | Good. Mobile-friendly drawers. |
| **Security** | apiCrypto.ts + autoModeration.ts + contentSafety.ts | Excellent. Request signing + moderation. |
| **Analytics** | AnalyticsService + useAnalytics.ts | Good. Custom analytics implementation. |
| **Admin** | 20+ admin components | Excellent. Comprehensive admin surface. |
| **Themes** | next-themes + 25+ themes | Good. Theme system in place. |

### 1.2 Critical Gaps Found

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

### 1.3 Architecture Debt

```
Current File Structure Issues:
├── src/
│   ├── hooks/           # 50+ hooks, no categorization
│   ├── lib/             # Mixed utilities, API clients, crypto
│   ├── services/        # Mixed concerns (API, analytics, providers)
│   ├── components/      # Flat structure, no atomic design
│   └── pages/           # Page components mixed with logic
```

**Problems:**
1. **Flat hook directory** — 50+ hooks in one folder, hard to navigate
2. **Mixed lib folder** — API clients, crypto, logger, Discord all in one place
3. **No feature-based organization** — Components organized by type, not feature
4. **Services mix concerns** — Provider scraping, analytics, and API calls all together
5. **No clear boundary** — UI components contain business logic

---

## 2. New Features to Add

### 2.1 AI-Powered Smart Recommendations (Tatakai Neural)

**What:** On-device anime recommendation engine using lightweight ML models

**Why:** Current ML recommendations likely require server round-trip. On-device is instant, private, works offline.

**How:**
```typescript
// src/core/ai/recommendation-engine.ts
import * as tf from '@tensorflow/tfjs'; // or ONNX Runtime Web

class TatakaiNeuralEngine {
  private model: tf.LayersModel;
  
  async initialize() {
    // Load quantized model (~2MB) from IndexedDB or CDN
    this.model = await tf.loadLayersModel('indexeddb://tatakai-recommender-v1');
  }
  
  async recommend(
    watchHistory: WatchEntry[],
    favorites: string[],
    ratings: RatingEntry[]
  ): Promise<Recommendation[]> {
    // Encode user profile as vector
    const userVector = this.encodeUser(watchHistory, favorites, ratings);
    
    // Encode catalog items
    const catalogVectors = await this.getCatalogVectors();
    
    // Compute cosine similarity
    const similarities = catalogVectors.map(v => 
      this.cosineSimilarity(userVector, v.vector)
    );
    
    // Return top-k with explanations
    return this.rankAndExplain(similarities);
  }
  
  // "Because you liked Attack on Titan and rated Death Note 9/10"
  private explainRecommendation(
    rec: Recommendation,
    history: WatchEntry[]
  ): string {
    const similarWatched = history
      .filter(h => h.genres.some(g => rec.genres.includes(g)))
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 2);
    
    return `Because you enjoyed ${similarWatched.map(w => w.title).join(' and ')}`;
  }
}
```

**Tech:** TensorFlow.js (quantized model ~2MB) or ONNX Runtime Web
**Privacy:** 100% on-device, no data leaves the device
**Fallback:** Server-side recommendations when model unavailable

### 2.2 Real-Time Watch2Together v2 (WebRTC + Supabase Realtime)

**What:** Synchronized watching with friends, with sub-second sync

**Why:** Current Watch2Together likely polls or uses basic sync. WebRTC enables true real-time with minimal latency.

**Architecture:**
```
Host starts room
    │
    ▼
┌─────────────────┐
│ Supabase Realtime│ ← Room state (play/pause/seek)
│ (broadcast)      │   Host controls, guests follow
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌───────┐ ┌───────┐
│ Host  │ │ Guest │
│ WebRTC│◄┤ WebRTC│ ← Direct video sync signal
│ data  │ │ data  │   (not video stream, just timestamps)
└───────┘ └───────┘

Video source: Each user loads independently
Sync signal: WebRTC data channel sends { currentTime, isPlaying, timestamp }
Chat: Supabase Realtime presence + broadcast
```

**Implementation:**
```typescript
// src/core/watch2gether/webrtc-sync.ts
class Watch2getherSync {
  private pc: RTCPeerConnection;
  private dataChannel: RTCDataChannel;
  private roomChannel: RealtimeChannel;
  
  async createRoom(animeId: string, episode: number): Promise<Room> {
    // Create WebRTC peer connection
    this.pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    
    // Create data channel for sync signals
    this.dataChannel = this.pc.createDataChannel('sync', {
      ordered: true,
      maxRetransmits: 3
    });
    
    // Join Supabase Realtime room
    this.roomChannel = supabase.channel(`room:${roomId}`)
      .on('broadcast', { event: 'sync' }, (payload) => {
        this.handleSyncSignal(payload);
      })
      .on('presence', { event: 'sync' }, () => {
        this.updateParticipantList();
      })
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
    
    // Send via WebRTC data channel (fastest)
    if (this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(signal));
    }
    
    // Backup via Supabase broadcast
    this.roomChannel.send({
      type: 'broadcast',
      event: 'sync',
      payload: signal
    });
  }
}
```

**Features:**
- Host controls playback (play/pause/seek)
- Guests auto-sync with smooth catch-up (not jarring jumps)
- Text chat overlay
- Reaction emojis
- "Ready to watch" lobby
- Auto-pause when someone buffers
- Sync quality indicator (green/yellow/red)

### 2.3 Smart Download Manager (Offline-First)

**What:** Intelligent episode download with quality selection, auto-download next episodes, storage management

**Why:** Users want offline viewing. Current app has "offline handling" but no structured download system.

```typescript
// src/core/offline/download-manager.ts
class TatakaiDownloadManager {
  private queue: DownloadTask[] = [];
  private activeDownloads = new Map<string, AbortController>();
  
  async enqueue(options: DownloadOptions): Promise<DownloadTask> {
    const task: DownloadTask = {
      id: generateId(),
      tatakaiId: options.tatakaiId,
      episodeNumber: options.episodeNumber,
      quality: options.quality || '1080p',
      source: options.source,
      status: 'queued',
      progress: 0,
      bytesDownloaded: 0,
      totalBytes: 0,
      priority: options.priority || 'normal',
      createdAt: Date.now(),
    };
    
    this.queue.push(task);
    this.persistQueue();
    this.processQueue();
    
    return task;
  }
  
  async processQueue() {
    const maxConcurrent = navigator.connection?.effectiveType === '4g' ? 3 : 1;
    
    while (this.activeDownloads.size < maxConcurrent && this.queue.length > 0) {
      const next = this.queue
        .filter(t => t.status === 'queued')
        .sort((a, b) => this.priorityWeight(b) - this.priorityWeight(a))[0];
      
      if (!next) break;
      
      this.startDownload(next);
    }
  }
  
  private async startDownload(task: DownloadTask) {
    task.status = 'downloading';
    const controller = new AbortController();
    this.activeDownloads.set(task.id, controller);
    
    try {
      // Get streaming source
      const sources = await providerOrchestrator.resolveSources(
        task.tatakaiId, 
        task.episodeNumber
      );
      
      const selected = sources.find(s => s.quality === task.quality) || sources[0];
      
      // Download with progress tracking
      const response = await fetch(selected.url, {
        signal: controller.signal,
        headers: selected.headers
      });
      
      const reader = response.body!.getReader();
      const total = Number(response.headers.get('content-length')) || 0;
      
      // Stream to Capacitor filesystem (mobile) or Electron downloads (desktop)
      const writer = await this.createFileWriter(task);
      
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        await writer.write(value);
        received += value.length;
        
        task.progress = total ? (received / total) * 100 : 0;
        task.bytesDownloaded = received;
        task.totalBytes = total;
        
        this.emitProgress(task);
      }
      
      await writer.close();
      task.status = 'completed';
      
      // Auto-download next episode if enabled
      if (userSettings.autoDownloadNext) {
        this.enqueueNextEpisode(task);
      }
      
    } catch (err) {
      if (controller.signal.aborted) {
        task.status = 'cancelled';
      } else {
        task.status = 'failed';
        task.error = err.message;
        
        // Retry with exponential backoff
        if (task.retryCount < 3) {
          task.retryCount++;
          setTimeout(() => this.enqueue(task), 1000 * Math.pow(2, task.retryCount));
        }
      }
    } finally {
      this.activeDownloads.delete(task.id);
      this.processQueue();
    }
  }
  
  // Storage management
  async getStorageUsage(): Promise<StorageStats> {
    const entries = await this.listDownloadedFiles();
    const totalBytes = entries.reduce((sum, e) => sum + e.size, 0);
    const quota = await navigator.storage.estimate();
    
    return {
      used: totalBytes,
      available: quota.usageDetails?.indexedDB || 0,
      quota: quota.quota || 0,
      entries: entries.length,
      byAnime: this.groupByAnime(entries)
    };
  }
  
  async cleanupOldDownloads(maxAgeDays: number = 30) {
    const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
    const entries = await this.listDownloadedFiles();
    
    for (const entry of entries) {
      if (entry.lastWatchedAt < cutoff) {
        await this.deleteDownload(entry.id);
      }
    }
  }
}
```

**UI Features:**
- Download button on episode cards
- Quality picker (same as player)
- Download queue manager
- Storage usage bar with cleanup suggestions
- "Download all remaining" for continuing series
- WiFi-only toggle
- Auto-delete after watching toggle

### 2.4 Anime Calendar & Airing Schedule

**What:** Visual calendar showing upcoming episodes, seasonal releases, with notification support

**Why:** Users want to know when new episodes drop. This drives retention.

```typescript
// src/core/content/calendar-service.ts
class AnimeCalendarService {
  async getAiringSchedule(
    date: Date,
    filters?: CalendarFilters
  ): Promise<CalendarDay[]> {
    // Fetch from Content Graph
    const airing = await contentGraph.getAiringEpisodes(date);
    
    // Group by day
    const grouped = groupBy(airing, (a) => 
      format(a.airingAt, 'yyyy-MM-dd')
    );
    
    return Object.entries(grouped).map(([date, episodes]) => ({
      date: new Date(date),
      episodes: episodes.sort((a, b) => a.airingAt - b.airingAt),
      hasUserWatchlist: episodes.some(e => 
        userWatchlist.includes(e.tatakaiId)
      )
    }));
  }
  
  async subscribeToNotifications(tatakaiId: string) {
    // Use Capacitor Local Notifications
    const anime = await contentGraph.getById(tatakaiId);
    
    if (anime.nextAiringEpisode) {
      await LocalNotifications.schedule({
        notifications: [{
          title: `${anime.title} - Episode ${anime.nextAiringEpisode.episode}`,
          body: 'New episode is now available!',
          id: `${tatakaiId}-${anime.nextAiringEpisode.episode}`,
          schedule: { at: new Date(anime.nextAiringEpisode.airingAt) },
          sound: 'notification.wav',
          attachments: [{ id: 'poster', url: anime.coverImage }]
        }]
      });
    }
  }
}
```

**Views:**
- Weekly grid view (Mon-Sun)
- Daily timeline view
- "My Schedule" (only watchlist items)
- Seasonal overview
- Countdown timers for upcoming episodes

### 2.5 Personal Stats & Wrapped (Tatakai Wrapped)

**What:** Spotify Wrapped-style annual/periodic viewing statistics

**Why:** Users love sharing stats. Drives engagement and social sharing.

```typescript
// src/core/analytics/personal-stats.ts
interface ViewingStats {
  period: { start: Date; end: Date };
  totalEpisodesWatched: number;
  totalMinutesWatched: number;
  uniqueAnimeWatched: number;
  uniqueGenres: string[];
  genreBreakdown: Record<string, number>;
  topStudios: Record<string, number>;
  averageRating: number;
  highestRated: { title: string; rating: number };
  longestBinge: { anime: string; episodes: number; duration: number };
  watchStreak: { current: number; longest: number };
  peakWatchHour: number;
  preferredDubLanguage: string;
  completionRate: number; // completed / (completed + dropped + watching)
  
  // Fun metrics
  totalCryingMoments: number; // User-marked emotional episodes
  totalRewatches: number;
  fastestBinge: { anime: string; hours: number };
  favoriteDayOfWeek: string;
}

class TatakaiWrapped {
  async generateWrapped(period: 'year' | 'season' | 'month' | 'all'): Promise<WrappedData> {
    const history = await this.getWatchHistory(period);
    
    return {
      stats: this.computeStats(history),
      highlights: this.generateHighlights(history),
      shareImage: await this.generateShareImage(history),
      comparison: this.compareToPreviousPeriod(history, period)
    };
  }
  
  private async generateShareImage(data: WrappedData): Promise<Blob> {
    // Use html-to-image or canvas to generate shareable card
    // Similar to Spotify Wrapped share cards
  }
}
```

**UI:**
- Animated stat cards
- Genre pie chart
- Timeline heatmap (GitHub-style)
- Shareable image generation
- "Compare with friends"
- Milestone badges ("100 episodes watched", "Binged 12 episodes in one day")

### 2.6 AI Subtitle Translation (Real-Time)

**What:** On-the-fly subtitle translation using lightweight NLP models

**Why:** Tatakai supports 13 dub languages but subtitles are often limited. AI translation expands accessibility.

```typescript
// src/core/ai/subtitle-translator.ts
class SubtitleTranslator {
  private model: TranslationModel;
  
  async initialize(targetLanguage: string) {
    // Load quantized translation model (~5MB per language pair)
    this.model = await loadTranslationModel('en', targetLanguage);
  }
  
  async translateSubtitles(
    subtitles: SubtitleTrack[],
    targetLang: string
  ): Promise<SubtitleTrack> {
    const translated: SubtitleEntry[] = [];
    
    for (const sub of subtitles) {
      const translatedText = await this.model.translate(sub.text);
      
      translated.push({
        ...sub,
        text: translatedText,
        lang: targetLang,
        label: `${sub.label} (AI ${targetLang.toUpperCase()})`,
        isAiTranslated: true
      });
    }
    
    return {
      ...subtitles[0],
      entries: translated,
      lang: targetLang,
      label: `AI ${targetLang.toUpperCase()}`
    };
  }
  
  // Batch translate for better performance
  async translateBatch(
    texts: string[],
    targetLang: string
  ): Promise<string[]> {
    // Process in batches of 32 for GPU efficiency
    const batches = chunk(texts, 32);
    const results: string[] = [];
    
    for (const batch of batches) {
      const translated = await this.model.translateBatch(batch);
      results.push(...translated);
    }
    
    return results;
  }
}
```

**Supported Languages:** Same 13 as dubs (Hindi, Telugu, Malayalam, German, French, Polish, etc.)
**Model:** ONNX Runtime Web with quantized opus-mt models (~5MB each)
**Privacy:** On-device, no data sent to translation API
**Quality:** Good enough for comprehension, marked as "AI-translated"

### 2.7 Clip & Share System

**What:** Create and share short clips from episodes with timestamps

**Why:** Social sharing drives organic growth. Users want to share favorite moments.

```typescript
// src/core/player/clip-system.ts
class ClipSystem {
  async createClip(
    tatakaiId: string,
    episode: number,
    startTime: number,
    endTime: number,
    options: ClipOptions
  ): Promise<Clip> {
    const duration = endTime - startTime;
    if (duration > 60) throw new Error('Clip max 60 seconds');
    
    // Generate clip metadata
    const clip: Clip = {
      id: generateId(),
      tatakaiId,
      episode,
      startTime,
      endTime,
      duration,
      title: options.title || `Clip from Episode ${episode}`,
      createdAt: Date.now(),
      createdBy: user.id,
      views: 0,
      // Generate thumbnail at middle of clip
      thumbnailUrl: await this.generateThumbnail(tatakaiId, episode, 
        startTime + duration / 2
      )
    };
    
    // Store in Supabase
    await supabase.from('clips').insert(clip);
    
    return clip;
  }
  
  async generateShareLink(clip: Clip): Promise<string> {
    // Deep link: tatakai://clip/{clipId}
    // Web link: https://tatakai.me/clip/{clipId}
    return `https://tatakai.me/clip/${clip.id}`;
  }
  
  async generateThumbnail(
    tatakaiId: string, 
    episode: number, 
    time: number
  ): Promise<string> {
    // Use canvas to capture frame from video element
    // Or use ffmpeg on desktop for higher quality
  }
}
```

**Features:**
- In-player clip creation (drag on timeline)
- Auto-caption generation
- Share to Discord, Twitter, Reddit
- Embed player for external sites
- Clip feed (trending clips)
- Reaction system on clips

### 2.8 Advanced Search with Faceted Filters

**What:** Elasticsearch-like search with multiple filter dimensions

**Why:** Current search is likely basic text search. Faceted search helps users discover content.

```typescript
// src/core/search/faceted-search.ts
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
  isAdult?: boolean;
  dubLanguages?: string[];
  sortBy?: 'relevance' | 'popularity' | 'rating' | 'newest' | 'title';
  sortOrder?: 'asc' | 'desc';
}

class FacetedSearch {
  async search(filters: SearchFilters): Promise<SearchResult> {
    // Use PostgreSQL full-text search + JSONB filtering
    const { data, error } = await supabase.rpc('search_anime', {
      query_text: filters.query,
      genre_filter: filters.genres,
      year_min: filters.year?.min,
      year_max: filters.year?.max,
      // ... other params
    });
    
    // Also compute facet counts for the sidebar
    const facets = await this.computeFacets(filters);
    
    return { results: data, facets, totalCount: data.length };
  }
  
  private async computeFacets(activeFilters: SearchFilters): Promise<Facets> {
    // For each filter dimension, count matching items
    // given the OTHER active filters
    return {
      genres: await this.facetCount('genres', activeFilters),
      years: await this.facetCount('year', activeFilters),
      formats: await this.facetCount('format', activeFilters),
      studios: await this.facetCount('studio', activeFilters),
    };
  }
}
```

**UI:**
- Search bar with autocomplete
- Filter sidebar with checkboxes
- Active filter chips (removable)
- Result count per filter option
- Sort dropdown
- View toggle (grid/list)
- Save search as "Smart List"

### 2.9 Cross-Device Sync (Seamless Handoff)

**What:** Start watching on desktop, continue on mobile, seamlessly

**Why:** Users watch on multiple devices. Sync should be invisible.

```typescript
// src/core/sync/cross-device-sync.ts
class CrossDeviceSync {
  private syncChannel: RealtimeChannel;
  
  async initialize() {
    this.syncChannel = supabase
      .channel(`user:${user.id}:sync`)
      .on('broadcast', { event: 'playback_state' }, (payload) => {
        this.handleRemoteState(payload);
      })
      .subscribe();
    
    // Also listen for device presence
    this.syncChannel.track({
      deviceId: this.deviceId,
      deviceType: this.getDeviceType(), // 'desktop' | 'mobile' | 'web'
      lastActive: Date.now()
    });
  }
  
  async syncPlaybackState(state: PlaybackState) {
    // Debounce: only sync every 5 seconds
    if (this.lastSyncTime && Date.now() - this.lastSyncTime < 5000) {
      return;
    }
    
    await this.syncChannel.send({
      type: 'broadcast',
      event: 'playback_state',
      payload: {
        tatakaiId: state.tatakaiId,
        episode: state.episode,
        currentTime: state.currentTime,
        isPlaying: state.isPlaying,
        deviceId: this.deviceId,
        timestamp: Date.now()
      }
    });
    
    this.lastSyncTime = Date.now();
  }
  
  private handleRemoteState(payload: any) {
    // Ignore our own broadcasts
    if (payload.deviceId === this.deviceId) return;
    
    // Show "Continue on [Device]" notification
    if (payload.isPlaying && this.shouldOfferHandoff(payload)) {
      toast.info(`Continue watching on ${payload.deviceType}?`, {
        action: {
          label: 'Resume',
          onClick: () => this.handoffToLocal(payload)
        }
      });
    }
  }
  
  async handoffToLocal(remoteState: PlaybackState) {
    // Navigate to the anime/episode
    navigate(`/watch/${remoteState.tatakaiId}/${remoteState.episode}`);
    
    // Seek to position (with small offset for recap)
    playerCore.seek(remoteState.currentTime - 3);
  }
}
```

**Features:**
- Auto-sync watch progress every 5 seconds
- "Continue on this device?" prompt
- Device list in settings (manage active devices)
- Force sync button
- Offline queue (sync when back online)

### 2.10 Smart Theme Creator

**What:** Users can create custom themes with color pickers, background images, and font choices

**Why:** 25+ themes is great, but user-created themes increase personalization and engagement.

```typescript
// src/core/themes/theme-creator.ts
interface CustomTheme {
  id: string;
  name: string;
  author: string;
  isPublic: boolean;
  
  colors: {
    background: string;
    surface: string;
    primary: string;
    secondary: string;
    accent: string;
    text: string;
    textMuted: string;
    border: string;
    success: string;
    warning: string;
    error: string;
  };
  
  background: {
    type: 'solid' | 'gradient' | 'image';
    value: string;
    opacity: number;
    blur: number;
  };
  
  typography: {
    fontFamily: string;
    fontSizeScale: number;
    lineHeight: number;
  };
  
  player: {
    controlBarStyle: 'minimal' | 'full' | 'floating';
    progressBarColor: string;
    bufferColor: string;
  };
  
  animations: {
    reducedMotion: boolean;
    transitionSpeed: 'fast' | 'normal' | 'slow';
    cardHoverEffect: 'scale' | 'lift' | 'glow' | 'none';
  };
}
```

**UI:**
- Visual theme editor (live preview)
- Color picker with palette suggestions
- Background image upload
- Font selector (Google Fonts integration)
- Animation speed slider
- Export/import theme JSON
- Share theme to community gallery
- Rate/like community themes

### 2.11 Voice Search

**What:** Search anime by speaking instead of typing

**Why:** Mobile users prefer voice input. Also accessible for users with disabilities.

```typescript
// src/core/search/voice-search.ts
class VoiceSearch {
  private recognition: SpeechRecognition;
  
  constructor() {
    this.recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.lang = navigator.language;
  }
  
  startListening(
    onInterim: (text: string) => void,
    onFinal: (text: string) => void,
    onError: (error: Error) => void
  ) {
    this.recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map(r => r[0].transcript)
        .join('');
      
      if (event.results[0].isFinal) {
        onFinal(transcript);
      } else {
        onInterim(transcript);
      }
    };
    
    this.recognition.onerror = (event) => {
      onError(new Error(event.error));
    };
    
    this.recognition.start();
  }
  
  stopListening() {
    this.recognition.stop();
  }
}
```

**Features:**
- Microphone button in search bar
- Real-time transcript display
- Language auto-detection
- "Did you mean?" suggestions
- Works in all supported UI languages

### 2.12 Anime News Feed

**What:** Integrated anime news from multiple sources (ANN, Crunchyroll News, etc.)

**Why:** Users want to stay updated on anime industry news, announcements, and releases.

```typescript
// src/core/news/news-aggregator.ts
class NewsAggregator {
  private sources: NewsSource[] = [
    { id: 'ann', name: 'Anime News Network', url: 'https://www.animenewsnetwork.com/news/rss.xml' },
    { id: 'crunchyroll', name: 'Crunchyroll News', url: 'https://crunchyroll.com/news/feed' },
    // Add more sources
  ];
  
  async fetchNews(limit: number = 50): Promise<NewsArticle[]> {
    // Fetch from all sources in parallel
    const articles = await Promise.all(
      this.sources.map(s => this.fetchFromSource(s))
    );
    
    // Merge, dedupe, sort by date
    return articles
      .flat()
      .sort((a, b) => b.publishedAt - a.publishedAt)
      .slice(0, limit);
  }
  
  async getRelatedNews(tatakaiId: string): Promise<NewsArticle[]> {
    const anime = await contentGraph.getById(tatakaiId);
    
    return this.searchNews({
      query: anime.titleRomaji,
      tags: anime.genres
    });
  }
}
```

**UI:**
- News tab in main navigation
- Article cards with images
- "Related to [Anime]" section on detail pages
- Push notifications for breaking news
- Save articles for later
- Share articles

### 2.13 Character Database & OST Player

**What:** Detailed character pages and anime soundtrack player

**Why:** Fans want to explore characters and listen to OSTs.

```typescript
// Character database
interface CharacterPage {
  id: string;
  name: string;
  image: string;
  description: string;
  anime: ContentItem[];
  voiceActors: VoiceActor[];
  appearances: EpisodeAppearance[];
  popularity: number;
  favorites: number;
}

// OST Player
interface OSTTrack {
  id: string;
  title: string;
  artist: string;
  anime: ContentItem;
  type: 'opening' | 'ending' | 'insert' | 'background';
  episode?: number;
  timestamp?: number; // When it plays in episode
  duration: number;
  audioUrl?: string;
  spotifyUrl?: string;
  youtubeUrl?: string;
}

class OSTPlayer {
  private tracks: OSTTrack[] = [];
  private currentTrack?: OSTTrack;
  
  async loadOSTForAnime(tatakaiId: string): Promise<OSTTrack[]> {
    // Fetch from external APIs or user-contributed database
    const tracks = await supabase
      .from('anime_ost')
      .select('*')
      .eq('tatakai_id', tatakaiId);
    
    this.tracks = tracks;
    return tracks;
  }
  
  playTrack(track: OSTTrack) {
    // Background audio playback (works even when app minimized)
    this.audioPlayer.src = track.audioUrl || track.youtubeUrl;
    this.audioPlayer.play();
    this.currentTrack = track;
    
    // Update media session for lock screen controls
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.anime.titleRomaji,
        artwork: [{ src: track.anime.coverImage }]
      });
    }
  }
}
```

---

## 3. Technology Upgrades

### 3.1 React 19 + React Compiler

**Current:** React 18.3.1  
**Target:** React 19 + React Compiler (Babel plugin)

**Why:**
- React Compiler automatically memoizes components (no more `useMemo`/`useCallback`)
- Better concurrent features
- Improved hydration
- New hooks: `useActionState`, `useFormStatus`, `useOptimistic`

**Migration:**
```bash
npm install react@19 react-dom@19
npm install -D babel-plugin-react-compiler
```

```javascript
// vite.config.ts
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']]
      }
    })
  ]
});
```

### 3.2 Tailwind CSS v4

**Current:** Tailwind v3.4.17  
**Target:** Tailwind v4

**Why:**
- No `tailwind.config.js` needed (CSS-based config)
- 10x faster build times
- New `@import` syntax
- Better IntelliSense

### 3.3 @tanstack/react-router

**Current:** react-router-dom v6  
**Target:** @tanstack/react-router

**Why:**
- Type-safe routing (no more `useParams` without types)
- Built-in loader pattern (replaces data fetching in `useEffect`)
- File-based routing option
- Better code splitting integration
- Search params as first-class citizens

```typescript
// src/routes/__root.tsx
export const Route = createRootRoute({
  component: RootComponent,
});

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

### 3.4 @tanstack/react-virtual

**New addition for list virtualization**

**Why:** Large anime catalogs (1000+ items) cause scroll jank without virtualization

```typescript
// src/components/virtualized/AnimeGrid.tsx
import { useVirtualizer } from '@tanstack/react-virtual';

function VirtualizedAnimeGrid({ items }: { items: AnimeCard[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 280, // Card height
    overscan: 5, // Render 5 extra items for smoothness
  });
  
  return (
    <div ref={parentRef} style={{ height: '100vh', overflow: 'auto' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <AnimeCard data={items[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 3.5 Dexie.js (IndexedDB Wrapper)

**New addition for structured client-side storage**

**Why:** IndexedDB API is verbose. Dexie provides a Promise-based, TypeScript-friendly wrapper.

```typescript
// src/core/db/tatakai-db.ts
import Dexie, { Table } from 'dexie';

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

export const db = new TatakaiDatabase();
```

### 3.6 BlurHash for Image Placeholders

**New addition for instant image loading**

**Why:** Images pop in without placeholders = jarring UX. BlurHash generates tiny placeholder images.

```typescript
// src/core/images/blurhash.ts
import { encode, decode } from 'blurhash';

async function generateBlurHash(imageUrl: string): Promise<string> {
  const image = await loadImage(imageUrl);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  
  // Resize to small for encoding
  canvas.width = 32;
  canvas.height = 32;
  ctx.drawImage(image, 0, 0, 32, 32);
  
  const imageData = ctx.getImageData(0, 0, 32, 32);
  return encode(imageData.data, 32, 32, 4, 4); // ~20-30 character string
}

function renderBlurHashPlaceholder(
  blurhash: string,
  width: number,
  height: number
): string {
  const pixels = decode(blurhash, width, height);
  // Convert to canvas/data URL for display
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(width, height);
  imageData.data.set(pixels);
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL();
}
```

**Storage:** BlurHash strings stored in Content Graph (~30 bytes each vs. full images)

### 3.7 ONNX Runtime Web (Client-Side AI)

**New addition for on-device ML**

**Why:** TensorFlow.js is heavy. ONNX Runtime Web is lighter, faster, and supports models from PyTorch, TensorFlow, etc.

```typescript
// src/core/ai/onnx-runtime.ts
import * as ort from 'onnxruntime-web';

class OnnxInferenceEngine {
  private session: ort.InferenceSession;
  
  async loadModel(modelPath: string) {
    this.session = await ort.InferenceSession.create(modelPath, {
      executionProviders: ['wasm'], // or 'webgpu' for GPU acceleration
      graphOptimizationLevel: 'all'
    });
  }
  
  async run(inputs: Record<string, ort.Tensor>): Promise<ort.InferenceSession.OnnxValueMapType> {
    return this.session.run(inputs);
  }
}
```

**Use cases:**
- Recommendation model (quantized, ~2MB)
- Subtitle translation (opus-mt, ~5MB per language)
- Content classification (NSFW detection, ~1MB)

### 3.8 WebGPU for Video Processing

**New addition for GPU-accelerated operations**

**Why:** FFmpeg in JS is slow. WebGPU enables GPU-accelerated video frame extraction, thumbnail generation, and effects.

```typescript
// Desktop-only: Extract frames using WebGPU
async function extractThumbnailGPU(
  videoUrl: string,
  time: number
): Promise<ImageBitmap> {
  const video = document.createElement('video');
  video.src = videoUrl;
  await video.play();
  video.currentTime = time;
  await new Promise(r => video.addEventListener('seeked', r));
  
  // Create WebGPU texture from video frame
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter!.requestDevice();
  
  const canvas = new OffscreenCanvas(video.videoWidth, video.videoHeight);
  const ctx = canvas.getContext('webgpu')!;
  
  // Copy video frame to GPU texture
  // Apply shaders (resize, blur, color correction)
  // Read back as ImageBitmap
  
  return createImageBitmap(canvas);
}
```

### 3.9 Feature Flags with Unleash

**New addition for gradual rollouts**

**Why:** Need to enable features for subsets of users, do A/B tests, and have kill switches.

```typescript
// src/core/feature-flags/unleash-client.ts
import { UnleashClient } from 'unleash-proxy-client';

const unleash = new UnleashClient({
  url: 'https://app.unleash-hosted.com/frontend',
  clientKey: 'YOUR_CLIENT_KEY',
  appName: 'tatakai',
  environment: import.meta.env.MODE,
});

// Check if feature is enabled
const isEnabled = unleash.isEnabled('torrent-core');

// With user context (for gradual rollouts)
const isEnabledForUser = unleash.isEnabled('new-player-ui', {
  userId: user.id,
  country: user.country,
  appVersion: APP_VERSION,
});

// A/B test variant
const variant = unleash.getVariant('recommendation-algo', {
  userId: user.id
});
// variant.name = 'control' | 'ml-model-v2' | 'hybrid'
```

### 3.10 i18n with react-i18next

**New addition for UI localization**

**Why:** 13 dub languages but UI is likely English-only. Localize the entire UI.

```typescript
// src/i18n/index.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: require('./locales/en.json') },
    de: { translation: require('./locales/de.json') },
    hi: { translation: require('./locales/hi.json') },
    ja: { translation: require('./locales/ja.json') },
    // ... all 13 languages
  },
  lng: navigator.language.split('-')[0],
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

// Usage in components
const { t } = useTranslation();
return <h1>{t('home.trending')}</h1>;
```

---

## 4. Performance Optimizations

### 4.1 Bundle Optimization

```bash
# Add bundle analyzer
npm install -D vite-bundle-visualizer

# vite.config.ts
import { visualizer } from 'vite-bundle-visualizer';

export default defineConfig({
  plugins: [
    // ... other plugins
    visualizer({
      open: true,
      gzipSize: true,
      brotliSize: true,
    })
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Split vendor chunks
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': ['framer-motion', '@radix-ui/*'],
          'video-vendor': ['hls.js'],
          'query-vendor': ['@tanstack/react-query'],
          'supabase': ['@supabase/supabase-js'],
          // Lazy-load heavy features
          'admin': ['./src/pages/admin/**/*'],
          'analytics': ['./src/components/admin/Analytics*'],
        }
      }
    }
  }
});
```

**Target metrics:**
- Initial bundle: < 200KB gzipped
- Vendor chunks: < 150KB gzipped each
- Feature chunks: Loaded on demand

### 4.2 Image Optimization Pipeline

```typescript
// src/core/images/image-pipeline.ts
interface ImageOptimizationConfig {
  formats: ('avif' | 'webp' | 'jpeg')[];
  sizes: number[]; // [320, 640, 960, 1280, 1920]
  quality: number; // 0-100
  blurhash: boolean;
}

class ImageOptimizationPipeline {
  async optimize(
    sourceUrl: string,
    config: ImageOptimizationConfig
  ): Promise<OptimizedImageSet> {
    // On desktop: Use Sharp via Electron main process
    // On web: Use Cloudflare Images or similar CDN
    
    const results: OptimizedImage[] = [];
    
    for (const format of config.formats) {
      for (const width of config.sizes) {
        const optimized = await this.generateVariant(sourceUrl, {
          width,
          format,
          quality: config.quality
        });
        
        results.push(optimized);
      }
    }
    
    const blurhash = config.blurhash 
      ? await this.generateBlurHash(sourceUrl)
      : undefined;
    
    return {
      variants: results,
      blurhash,
      srcset: this.buildSrcSet(results),
    };
  }
  
  private buildSrcSet(variants: OptimizedImage[]): string {
    return variants
      .map(v => `${v.url} ${v.width}w`)
      .join(', ');
  }
}

// React component
function OptimizedImage({ src, alt, blurhash, width, height }: Props) {
  const [loaded, setLoaded] = useState(false);
  
  return (
    <div style={{ position: 'relative', width, height }}>
      {/* BlurHash placeholder */}
      {!loaded && blurhash && (
        <BlurhashCanvas
          hash={blurhash}
          width={width}
          height={height}
          style={{ position: 'absolute', inset: 0 }}
        />
      )}
      
      {/* Actual image */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        style={{
          opacity: loaded ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }}
      />
    </div>
  );
}
```

### 4.3 Code Splitting Strategy

```typescript
// Route-based code splitting (already partially done)
const AdminPage = lazy(() => import('./pages/admin/AdminPage'));
const AnalyticsPage = lazy(() => import('./pages/admin/AnalyticsPage'));

// Component-based code splitting
const HeavyChart = lazy(() => import('./components/charts/HeavyChart'));
const VideoPlayer = lazy(() => import('./components/video/VideoPlayer'));

// Preload on hover
function NavLink({ to, children }: Props) {
  const preload = () => {
    const component = routeComponents[to];
    if (component && component.preload) {
      component.preload();
    }
  };
  
  return (
    <Link to={to} onMouseEnter={preload}>
      {children}
    </Link>
  );
}
```

### 4.4 Memory Management

```typescript
// src/core/memory/memory-manager.ts
class MemoryManager {
  private caches = new Map<string, LRUCache>();
  
  constructor() {
    // Monitor memory pressure
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      setInterval(() => this.checkMemoryPressure(), 30000);
    }
  }
  
  private async checkMemoryPressure() {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage || 0;
    const quota = estimate.quota || Infinity;
    const ratio = usage / quota;
    
    if (ratio > 0.8) {
      // Aggressive cleanup
      this.evictAllCaches(0.5); // Remove 50% of each cache
    } else if (ratio > 0.6) {
      // Moderate cleanup
      this.evictAllCaches(0.25); // Remove 25%
    }
  }
  
  private evictAllCaches(fraction: number) {
    for (const cache of this.caches.values()) {
      const targetSize = Math.floor(cache.size * (1 - fraction));
      while (cache.size > targetSize) {
        cache.evictLRU();
      }
    }
  }
}
```

### 4.5 React Performance Patterns

```typescript
// 1. Use React Compiler (automatic memoization)
// No more manual useMemo/useCallback needed in most cases

// 2. Virtualize long lists
// See @tanstack/react-virtual above

// 3. Use useDeferredValue for non-urgent updates
function SearchResults({ query }: { query: string }) {
  const deferredQuery = useDeferredValue(query);
  
  // This won't block typing
  const results = useQuery({
    queryKey: ['search', deferredQuery],
    queryFn: () => searchAnime(deferredQuery),
  });
  
  return <ResultsList data={results.data} />;
}

// 4. Use useTransition for state updates
function FilterButton({ filter }: Props) {
  const [isPending, startTransition] = useTransition();
  
  return (
    <button
      onClick={() => {
        startTransition(() => {
          setActiveFilter(filter);
        });
      }}
      disabled={isPending}
    >
      {filter.name}
      {isPending && <Spinner />}
    </button>
  );
}

// 5. Use React.lazy + Suspense for code splitting
// See above

// 6. Optimize re-renders with react-scan (dev only)
// npm install -D react-scan
// Add to main.tsx for development
if (import.meta.env.DEV) {
  import('react-scan').then(({ scan }) => {
    scan({ enabled: true });
  });
}
```

---

## 5. New Core Modules

### 5.1 Tatakai Neural (AI Recommendations)

```
src/core/ai/
  ├── recommendation-engine.ts      # Main recommendation logic
  ├── model-loader.ts               # ONNX model loading
  ├── vector-encoder.ts             # User/content vector encoding
  ├── similarity.ts                 # Cosine similarity, etc.
  └── models/
      ├── recommender-v1.onnx       # Quantized model (~2MB)
      └── translator/
          ├── en-de.onnx            # Translation models (~5MB each)
          └── en-hi.onnx
```

### 5.2 Tatakai Sync (Cross-Device)

```
src/core/sync/
  ├── cross-device-sync.ts          # Main sync coordinator
  ├── playback-sync.ts              # Playback state sync
  ├── presence-manager.ts           # Device presence tracking
  └── offline-queue.ts              # Queued sync operations
```

### 5.3 Tatakai Offline (Download Manager)

```
src/core/offline/
  ├── download-manager.ts           # Queue + download logic
  ├── storage-manager.ts            # Capacitor/Electron file I/O
  ├── stream-offline.ts             # Offline playback adapter
  └── cleanup-scheduler.ts          # Auto-cleanup old downloads
```

### 5.4 Tatakai Calendar

```
src/core/calendar/
  ├── calendar-service.ts           # Airing schedule logic
  ├── notification-scheduler.ts     # Capacitor local notifications
  └── countdown-manager.ts          # Countdown timers
```

### 5.5 Tatakai Search (Faceted)

```
src/core/search/
  ├── faceted-search.ts             # Main search logic
  ├── query-builder.ts              # PostgreSQL query builder
  ├── autocomplete.ts               # Search suggestions
  ├── voice-search.ts               # Speech recognition
  └── saved-searches.ts             # Smart lists
```

### 5.6 Tatakai Stats

```
src/core/stats/
  ├── personal-stats.ts             # Stats computation
  ├── wrapped-generator.ts          # Wrapped image generation
  ├── milestone-tracker.ts          # Achievement badges
  └── share-image.ts                # Canvas-based share cards
```

### 5.7 Tatakai News

```
src/core/news/
  ├── news-aggregator.ts            # RSS feed aggregation
  ├── article-parser.ts             # Content extraction
  └── notification-dispatcher.ts    # Push notifications
```

---

## 6. Updated Phased Roadmap

### Phase 0: Security + Tech Baseline (3 weeks)

| Work Item | Owner | Deliverable |
|-----------|-------|-------------|
| Harden Electron | Backend | Security patch |
| Add bundle analyzer | DevOps | Bundle size visibility |
| Add react-scan (dev) | Frontend | Render debugging |
| Set up feature flags | Backend | Unleash client |
| Add i18n framework | Frontend | react-i18next setup |
| Add Dexie.js | Frontend | IndexedDB abstraction |
| Add BlurHash | Frontend | Image placeholder system |
| **Seed country policies** | Backend | 196 countries |

### Phase 1: Content Graph + Virtualization (5 weeks)

| Work Item | Owner | Deliverable |
|-----------|-------|-------------|
| AniList client | Frontend | GraphQL client |
| Jikan fallback | Frontend | REST fallback |
| Content ingestion | Backend | Pipeline |
| **Virtualized lists** | Frontend | `@tanstack/react-virtual` |
| **BlurHash integration** | Frontend | All image components |
| **i18n UI translation** | Frontend | All 13 languages |
| Home/Search/Trending migration | Frontend | Content Graph powered |

### Phase 2: Mapper + Search + AI (5 weeks)

| Work Item | Owner | Deliverable |
|-----------|-------|-------------|
| Mapper ingestion | Backend | Pipeline |
| **Faceted search** | Frontend | Advanced filters |
| **Voice search** | Frontend | Speech recognition |
| **Tatakai Neural v1** | Frontend | On-device recommendations |
| Provider health monitoring | Backend | Dashboard |

### Phase 3: Player Core + Offline (5 weeks)

| Work Item | Owner | Deliverable |
|-----------|-------|-------------|
| Player core refactor | Frontend | Modular adapters |
| **Download manager** | Desktop/Mobile | Offline episodes |
| **Smart download** | Frontend | Auto-download settings |
| Subtitle memory | Frontend | Per-series preferences |
| Skip windows | Frontend | OP/ED detection |

### Phase 4: Local Runtime + Scraping + WARP (6 weeks)

| Work Item | Owner | Deliverable |
|-----------|-------|-------------|
| Local runtime | Desktop | Worker threads |
| **Extension local scraping** | Desktop | Web Worker sandbox |
| **1.1.1.1 DoH** | Desktop | Always-on DNS |
| **WARP proxy** | Desktop | User-toggle tunnel |
| IPC bridge | Desktop | Narrow preload |
| Circuit breakers | Frontend | Fallback logic |

### Phase 5: Torrent + Calendar + Stats (6 weeks)

| Work Item | Owner | Deliverable |
|-----------|-------|-------------|
| Torrent core | Desktop | Session manager |
| anitomyscript | Desktop | Filename parser |
| **Anime calendar** | Frontend | Airing schedule |
| **Push notifications** | Mobile | Episode alerts |
| **Tatakai Wrapped** | Frontend | Stats + share cards |
| Country policy gating | Frontend | VPN warnings |

### Phase 6: Watch2Together v2 + Cross-Device (5 weeks)

| Work Item | Owner | Deliverable |
|-----------|-------|-------------|
| **WebRTC sync** | Frontend | Real-time sync |
| **Supabase Realtime** | Backend | Room state |
| **Cross-device sync** | Frontend | Handoff |
| Mobile convergence | Mobile | Server-first |

### Phase 7: Extensions + Clips + News (5 weeks)

| Work Item | Owner | Deliverable |
|-----------|-------|-------------|
| Extension platform | Backend | Manifest + sandbox |
| **Clip system** | Frontend | Create + share |
| **Anime news feed** | Frontend | News aggregator |
| Admin expansion | Frontend | Review panels |

### Phase 8: Polish + Production (6 weeks)

| Work Item | Owner | Deliverable |
|-----------|-------|-------------|
| **React 19 + Compiler** | Frontend | Auto-memoization |
| **Tailwind v4** | Frontend | Faster builds |
| Performance budgets | DevOps | Enforced limits |
| E2E tests | QA | Playwright |
| Security audit | Security | Full review |
| Production rollout | DevOps | Canary → broad |

---

## 7. Technical Implementation Details

### 7.1 File Structure Refactor (Target)

```
src/
  core/                          # Domain logic (no React)
    ai/                          # Tatakai Neural
    content/                     # Content Graph
    extensions/                  # Extension Hub
    mappings/                    # Mapper
    network/                     # WARP, DoH, fetch
    offline/                     # Download Manager
    player/                      # Player Core
    providers/                   # Provider Orchestrator
    search/                      # Faceted Search
    stats/                       # Personal Stats
    sync/                        # Cross-Device Sync
    torrent/                     # Torrent Core
    
  features/                      # Feature-based modules
    anime/                       # Anime browsing
      components/
      hooks/
      pages/
      services/
    manga/                       # Manga reading
    watch/                       # Watch page
    watch2gether/                # Watch2Together
    calendar/                    # Airing schedule
    news/                        # News feed
    profile/                     # User profile
    community/                   # Comments, forum
    admin/                       # Admin dashboard
    
  components/                    # Shared UI components
    ui/                          # Primitive components (Radix wrappers)
    layout/                      # Layout shells
    virtualized/                 # Virtualized list components
    
  hooks/                         # Shared hooks (categorized)
    api/                         # Data fetching hooks
    ui/                          # UI interaction hooks
    media/                       # Player/media hooks
    
  lib/                           # Utilities (categorized)
    api/                         # API clients
    crypto/                      # Encryption
    logger/                      # Logging
    
  i18n/                          # Translations
    locales/
    
  types/                         # Global TypeScript types
```

### 7.2 Database Schema Additions

```sql
-- For AI recommendations
CREATE TABLE user_embeddings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  preference_vector VECTOR(384),
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- For Watch2Together
CREATE TABLE watch_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID REFERENCES auth.users(id),
  tatakai_id UUID REFERENCES content_items(tatakai_id),
  episode_number INTEGER,
  status TEXT DEFAULT 'waiting', -- waiting, playing, paused, ended
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

-- For downloads
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

-- For clips
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

-- For news
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

-- For stats
CREATE TABLE viewing_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  milestone_type TEXT, -- episodes_watched, hours_watched, streak
  threshold INTEGER,
  achieved_at TIMESTAMPTZ DEFAULT NOW(),
  is_notified BOOLEAN DEFAULT FALSE
);
```

---

## 8. Appendix: Complete Feature Matrix

| Feature | SeaAnime | Shiru | Tatakai Current | Tatakai Target | Phase |
|---------|----------|-------|-----------------|----------------|-------|
| **Browsing** |
| AniList metadata | ❌ | ✅ | ⚠️ (partial) | ✅ Primary | 1 |
| Jikan fallback | ❌ | ❌ | ❌ | ✅ | 1 |
| Zero scraper browsing | ❌ | ✅ | ❌ | ✅ | 1 |
| Virtualized lists | ❌ | ❌ | ❌ | ✅ | 1 |
| BlurHash images | ❌ | ❌ | ❌ | ✅ | 1 |
| Faceted search | ❌ | ❌ | ❌ | ✅ | 2 |
| Voice search | ❌ | ❌ | ❌ | ✅ | 2 |
| **Player** |
| HLS playback | ✅ | ✅ | ✅ | ✅ | - |
| Custom subtitles | ✅ | ✅ | ✅ | ✅ | - |
| PiP | ✅ | ✅ | ✅ | ✅ | - |
| Per-series subtitle memory | ❌ | ✅ | ❌ | ✅ | 3 |
| Chapter skip (OP/ED) | ❌ | ✅ | ❌ | ✅ | 3 |
| Volume boost | ❌ | ✅ | ❌ | ✅ | 3 |
| Miniplayer | ❌ | ✅ | ❌ | ✅ | 3 |
| **Torrent** |
| Torrent search | ✅ | ✅ | ❌ | ✅ | 5 |
| Torrent streaming | ✅ | ✅ | ❌ | ✅ | 5 |
| anitomyscript parsing | ❌ | ✅ | ❌ | ✅ | 5 |
| Release quality scoring | ❌ | ⚠️ | ❌ | ✅ | 5 |
| **Extensions** |
| Web Worker sandbox | ❌ | ✅ | ❌ | ✅ | 4 |
| Local scraping | ❌ | ❌ | ❌ | ✅ | 4 |
| Manifest system | ❌ | ✅ | ❌ | ✅ | 7 |
| Moderated platform | ❌ | ❌ | ⚠️ (marketplace) | ✅ | 7 |
| **Network** |
| DoH (1.1.1.1) | ❌ | ❌ | ❌ | ✅ | 4 |
| WARP proxy | ❌ | ❌ | ❌ | ✅ | 4 |
| **Social** |
| Comments | ❌ | ❌ | ✅ | ✅ | - |
| Forum | ❌ | ❌ | ✅ | ✅ | - |
| Watch2Together | ❌ | ❌ | ✅ | ✅ WebRTC | 6 |
| Real-time sync | ❌ | ❌ | ❌ | ✅ | 6 |
| Clip sharing | ❌ | ❌ | ❌ | ✅ | 7 |
| **Offline** |
| Download manager | ❌ | ❌ | ⚠️ | ✅ | 3 |
| Auto-download | ❌ | ❌ | ❌ | ✅ | 3 |
| Storage management | ❌ | ❌ | ❌ | ✅ | 3 |
| **AI/ML** |
| On-device recommendations | ❌ | ❌ | ⚠️ (server) | ✅ | 2 |
| AI subtitle translation | ❌ | ❌ | ❌ | ✅ | 3 |
| **Discovery** |
| Calendar/Schedule | ❌ | ✅ | ❌ | ✅ | 5 |
| News feed | ❌ | ❌ | ❌ | ✅ | 7 |
| Character database | ❌ | ❌ | ❌ | ✅ | 7 |
| OST player | ❌ | ❌ | ❌ | ✅ | 7 |
| **Personalization** |
| Stats dashboard | ❌ | ❌ | ⚠️ | ✅ | 5 |
| Wrapped (annual stats) | ❌ | ❌ | ❌ | ✅ | 5 |
| Theme creator | ❌ | ❌ | ⚠️ (25 presets) | ✅ | 3 |
| Cross-device sync | ❌ | ❌ | ❌ | ✅ | 6 |
| **Platform** |
| Web | ✅ | ✅ | ✅ | ✅ | - |
| Desktop (Electron) | ✅ | ✅ | ✅ | ✅ | - |
| Mobile (Capacitor) | ❌ | ✅ | ✅ | ✅ | - |
| PWA | ❌ | ❌ | ✅ | ✅ | - |
| **Admin** |
| Provider health | ❌ | ❌ | ⚠️ | ✅ | 2 |
| Extension review | ❌ | ❌ | ⚠️ | ✅ | 7 |
| Country policies | ❌ | ❌ | ❌ | ✅ | 0 |
| **Legal** |
| 196-country torrent policy | ❌ | ❌ | ❌ | ✅ | 0 |
| VPN recommendation | ❌ | ❌ | ❌ | ✅ | 5 |

---

## Final Summary

This extended plan adds **13 major new features**, **8 technology upgrades**, and **comprehensive performance optimizations** to the Tatakai architecture:

### New Features
1. **Tatakai Neural** — On-device AI recommendations
2. **Watch2Together v2** — WebRTC real-time sync
3. **Smart Download Manager** — Offline-first episode downloads
4. **Anime Calendar** — Airing schedule with notifications
5. **Tatakai Wrapped** — Spotify-style annual stats
6. **AI Subtitle Translation** — Real-time on-device translation
7. **Clip & Share** — Create and share episode clips
8. **Faceted Search** — Advanced filters and discovery
9. **Cross-Device Sync** — Seamless handoff between devices
10. **Smart Theme Creator** — User-created themes
11. **Voice Search** — Speech-to-text anime search
12. **Anime News Feed** — Integrated news aggregator
13. **Character DB + OST Player** — Extended anime universe

### Technology Upgrades
1. **React 19 + React Compiler** — Automatic memoization
2. **Tailwind CSS v4** — Faster builds, CSS-based config
3. **@tanstack/react-router** — Type-safe routing
4. **@tanstack/react-virtual** — List virtualization
5. **Dexie.js** — Structured IndexedDB
6. **BlurHash** — Image placeholders
7. **ONNX Runtime Web** — Client-side ML
8. **Unleash** — Feature flags and A/B testing
9. **react-i18next** — Full UI localization

### Performance Optimizations
1. Bundle analysis + code splitting
2. Image optimization pipeline (AVIF/WebP/BlurHash)
3. Memory management with pressure detection
4. React Compiler + useDeferredValue + useTransition
5. Virtualized lists for large catalogs
6. Web Workers for background tasks
7. WASM for performance-critical operations

**Tatakai becomes:** The most feature-rich, performant, and technically advanced anime streaming platform — SeaAnime-powerful, Shiru-smart, network-resilient, device-capable, AI-enhanced, and Tatakai-true.
