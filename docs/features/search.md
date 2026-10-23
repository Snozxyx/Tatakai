# Unified Search & Discovery

Tatakai provides a powerful unified search across all content types with advanced filtering, image search, and real-time suggestions.

---

## Architecture

```
Search System
├── Universal Search (anime, manga, novels, characters)
├── Anime Image Search (screenshot → title)
├── Advanced Filters (genres, tags, themes, attributes)
├── Search Suggestions (autocomplete, trending)
└── Search History (local + synced)
```

**Key Files:**
- `src/features/search/` — Search components
- `src/hooks/useUniversalSearch.ts`
- `supabase/functions/tatakai-api/search/*` — API

---

## Universal Search

### Query

```
Search "attack on titan"
        │
        ▼
Search API fans out to:
├── AniList (anime)
├── MangaDex / MangaBaka (manga)
├── Novel sources (novels)
├── Character DB (characters)
└── Local cache (recent, history)
        │
        ▼
Merge & deduplicate by AniList ID
        │
        ▼
Rank by:
  1. Exact title match
  2. Prefix match
  3. Fuzzy match (Levenshtein)
  4. Popularity × recency
        │
        ▼
Return unified results with type badges
```

### Result Types

| Type | Icon | Quick Actions |
|------|------|---------------|
| **Anime** | 🎬 | Watch, Add to list, Details |
| **Manga** | 📖 | Read, Add to list, Details |
| **Novel** | 📚 | Read, Add to list, Details |
| **Character** | 👤 | View profile, Favorites |

### Search Suggestions

- **Autocomplete** — debounced 150ms, shows top 5
- **Trending** — global trending searches
- **History** — user's recent searches (synced)
- **Entities** — direct links to anime/manga/novel pages

---

## Anime Image Search

### Flow

```
User uploads screenshot / pastes image
        │
        ▼
Image → trace.moe API (or local model)
        │
        ▼
Returns: { anilistId, episode, timestamp, similarity }
        │
        ▼
Fetch AniList details → Show result
        │
        ▼
Actions: Go to episode, Add to list, Watch
```

### Providers

| Provider | Method | Accuracy |
|----------|--------|----------|
| **trace.moe** | External API | High (95%+) |
| **Local (CLIP)** | On-device (desktop) | Medium (85%) |
| **AniList Image** | Fallback | Low |

**Privacy:** Local model preferred; external API only with consent.

---

## Advanced Filters

### Filter Categories

| Category | Anime | Manga | Novels |
|----------|-------|-------|--------|
| **Genres** | ✅ Multi-select | ✅ Multi-select | ✅ Multi-select |
| **Tags** | ✅ (AniList tags) | ✅ (MangaDex tags) | ✅ |
| **Themes** | ✅ | ✅ | ✅ |
| **Type** | TV, Movie, OVA, ONA, Special | Manga, Manhwa, Manhua, Webtoon, Comic | Web Novel, Light Novel |
| **Status** | Airing, Completed, Upcoming | Publishing, Completed, Hiatus | Ongoing, Completed, Hiatus |
| **Year/Season** | 1970–present, seasonal | — | — |
| **Score** | Min/Max (1-100) | Min/Max | Min/Max |
| **Episodes/Chapters** | Range | Range | Range |
| **Studio** | Multi-select | — | — |
| **Author/Artist** | — | Multi-select | Multi-select |
| **Magazine** | — | Multi-select | — |
| **Demographic** | Shounen, Seinen, Shoujo, Josei | Shounen, Seinen, Shoujo, Josei | — |
| **Language** | Audio/Sub languages | Chapter languages | Text languages |
| **Source** | Original, Manga, LN, Game, Original | Original, LN, Web Novel | Original, Manga, Anime |

### Filter UI

- **Chips** for genres/tags (multi-select, OR logic)
- **Dropdowns** for single-select (type, status, demographic)
- **Sliders** for ranges (score, year, episodes)
- **Search within** filters (e.g., "studio: Kyoto")
- **Save/Load** filter presets
- **URL sync** — shareable filter state

---

## Search Results

### Layout

| View | Description |
|------|-------------|
| **Grid** | Poster images, compact (default) |
| **List** | Detailed rows with metadata |
| **Cards** | Large cards with synopsis preview |

### Sorting

| Sort | Anime | Manga | Novels |
|------|-------|-------|--------|
| **Relevance** | Default | Default | Default |
| **Popularity** | Global score × activity | Global score × activity | Global score × activity |
| **Rating** | Mean score | Mean score | Mean score |
| **Date** | Start date / Latest chapter | Latest chapter | Latest chapter |
| **Title** | A-Z | A-Z | A-Z |
| **Episodes/Chapters** | Count | Count | Count |

### Infinite Scroll

- **Page size:** 50 results
- **Prefetch:** Next page on 80% scroll
- **Virtualized:** `@tanstack/react-virtual`

---

## Search History

### Local

- **Storage:** `localStorage` (encrypted)
- **Limit:** 100 recent searches
- **Sync:** Optional (Settings → Privacy)

### Management

- **Clear history** (one-click)
- **Delete individual** (swipe/click)
- **Pin** frequent searches
- **Export** (JSON)

---

## API

### Universal Search

```ts
// GET /api/v3/search?q=query&types=anime,manga,novel,characters&limit=20&page=1
interface SearchResponse {
  query: string;
  results: SearchResult[];
  suggestions: string[];
  totalEstimate: number;
  tookMs: number;
}

interface SearchResult {
  type: 'anime' | 'manga' | 'novel' | 'character';
  anilistId: number;
  title: { romaji: string; english: string; native: string };
  coverImage: string;
  metadata: {
    // Type-specific
    format?: string;
    status?: string;
    genres?: string[];
    score?: number;
    episodes?: number;
    chapters?: number;
  };
  availability: {
    hasSources: boolean;
    sourceCount: number;
  };
}
```

### Image Search

```ts
// POST /api/v3/search/image (multipart/form-data: image)
interface ImageSearchResponse {
  anilistId: number;
  episode: number;
  timestamp: number;        // Seconds into episode
  similarity: number;       // 0-1
  previewUrl: string;       // Frame thumbnail
}
```

### Suggestions

```ts
// GET /api/v3/search/suggest?q=partial&limit=10
interface SuggestResponse {
  suggestions: [
    { text: string; type: 'query' | 'entity'; anilistId?: number }
  ];
}
```

---

## Settings (Settings → Search)

| Option | Description |
|--------|-------------|
| **Default Types** | Which types to search by default |
| **Safe Search** | Strict / Moderate / Off (NSFW filtering) |
| **Image Search** | Enable, preferred provider (local/trace.moe) |
| **History** | Save history, sync across devices, retention |
| **Suggestions** | Show trending, show history, debounce delay |
| **Results** | Default view, default sort, page size |
| **Filters** | Show advanced filters by default |

---

## Performance

| Optimization | Implementation |
|--------------|----------------|
| **Debounce** | 150ms for autocomplete |
| **Cache** | Results cached 5 min (TanStack Query) |
| **Prefetch** | Next page, entity details on hover |
| **CDN** | Cover images via Cloudflare Images |
| **Index** | PostgreSQL trigram + full-text search |

---

## Related

- [Recommendations](features/recommendations.md)
- [Video Player](features/playback.md)
- [Manga Reader](features/manga.md)
- [Novel Reader](features/novels.md)