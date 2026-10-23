# AI-Powered Recommendation Engine

Tatakai uses a **hybrid machine-learning recommendation engine** designed to understand individual preferences and recommend titles based on meaningful compatibility signals — not just popularity or generic AI wrappers.

---

## Architecture

```
Recommendation Engine
├── Signal Computation (offline, scheduled)
│   ├── Genre Fit
│   ├── Studio Fit
│   ├── Era Fit
│   ├── Theme Fit
│   ├── Community Signals
│   └── Popularity
├── Scoring Pipeline (online)
│   ├── Candidate Generation
│   ├── Feature Enrichment
│   ├── Scoring
│   └── Ranking
├── 3D Graph Visualization
└── Feedback Loop (explicit + implicit)
```

**Key Files:**
- `src/core/recommendations/` — Core engine
- `src/features/recommendations/` — UI components
- `supabase/functions/tatakai-api/recommendations/*` — API
- `supabase/migrations/*_recommendation_*.sql` — Schema

---

## Recommendation Factors

| Factor | Weight | Description |
|--------|--------|-------------|
| **Genre Fit** | 25% | Compatibility with your preferred genres (weighted by rating) |
| **Studio Fit** | 15% | Preference for particular animation studios |
| **Era Fit** | 10% | Compatibility with preferred release periods (80s, 90s, 2000s, 2010s, 2020s) |
| **Theme Fit** | 20% | Alignment with favorite themes (isekai, romance, psychological, etc.) |
| **Community Signals** | 15% | Activity from users with similar taste (co-watching, discussions) |
| **Popularity** | 10% | Discovery signal (trending, highly-rated) |
| **Personal History** | 5% | Direct collaborative filtering |

**Total:** 100% — weights adjustable per-user via Settings.

---

## Signal Computation

### Offline Pipeline (Daily Cron)

```sql
-- supabase/functions/cron-recommendations.ts
-- Runs daily at 03:00 UTC

-- 1. Build user taste profile from:
--    - Completed anime/manga/novels (rated)
--    - Watch/read time per genre/studio/era/theme
--    - Explicit ratings (1-10)
--    - Implicit signals (completion rate, re-watches)

-- 2. Compute per-title signals for each user:
INSERT INTO recommendation_signals (user_id, anilist_id, signal_type, value, weight)
SELECT
  u.id,
  m.anilist_id,
  'genre_fit',
  compute_genre_fit(u.taste_profile, m.genres),
  0.25
FROM users u
CROSS JOIN media m
WHERE m.anilist_id NOT IN (SELECT anilist_id FROM media_lists WHERE user_id = u.id)
  AND m.type = 'anime';
```

### Signal Types

| Signal | Computation |
|--------|-------------|
| `genre_fit` | Cosine similarity between user genre vector and title genre vector |
| `studio_fit` | Weighted average of user's studio ratings |
| `era_fit` | Gaussian kernel on release year vs user's preferred eras |
| `theme_fit` | Jaccard similarity on theme tags |
| `community` | Matrix factorization on user-title interaction matrix |
| `popularity` | Log-scaled global rating × recency decay |

---

## Scoring Pipeline

### Candidate Generation

1. **Content-based:** Top-K by each signal (union)
2. **Collaborative:** Users with similar taste → their highly-rated unseen titles
3. **Trending:** Global trending in user's preferred categories
4. **New releases:** Upcoming sequels, studio works, genre matches

### Feature Enrichment

Each candidate enriched with:
- All 6 signal values
- Metadata (genres, studio, year, themes)
- Availability (sources installed)
- User's list status (watching, planned, dropped)

### Scoring

```python
# Pseudocode
def score_title(user, title):
    base_score = sum(signal.value * signal.weight for signal in signals)

    # Boosts
    if title.studio in user.favorite_studios: base_score *= 1.2
    if title.is_sequel_of(user.completed): base_score *= 1.5
    if title.airing_now and user.likes_simulcast: base_score *= 1.1

    # Penalties
    if title in user.dropped: base_score *= 0.1
    if title.genres ∩ user.disliked_genres: base_score *= 0.5

    return normalize(base_score)
```

### Ranking

- **Diversity:** MMR (Maximal Marginal Relevance) to avoid same-genre clusters
- **Novelty:** Boost unseen studios/genres slightly
- **Availability:** Prioritize titles with installed sources

---

## Interactive 3D Recommendation Graph

### Visualization

**Component:** `src/features/recommendations/components/RecommendationGraph.tsx`

- **Nodes:** Titles (size = score, color = primary genre)
- **Edges:** Similarity (genre, studio, theme, user co-rating)
- **Clusters:** Force-directed layout reveals taste neighborhoods
- **Interaction:** Pan, zoom, click for detail, filter by signal

### Controls

| Control | Action |
|---------|--------|
| **Drag** | Pan camera |
| **Scroll** | Zoom |
| **Click node** | Show title detail panel |
| **Hover edge** | Show similarity breakdown |
| **Filter panel** | Toggle signals, genres, types |
| **Search** | Highlight matching titles |
| **Reset view** | Center on user's taste centroid |

---

## Feedback Loop

### Explicit Feedback

| Action | Signal |
|--------|--------|
| **Rate 1-10** | Direct preference |
| **"Not interested"** | Negative signal for title + similar |
| **"Want to watch"** | Positive signal for title + similar |
| **Hide recommendation** | Negative for that specific reason |

### Implicit Feedback

| Behavior | Signal |
|----------|--------|
| **Click detail** | Mild interest |
| **Add to list** | Strong interest |
| **Start watching** | Very strong interest |
| **Complete** | Confirmation |
| **Drop early** | Negative (genre/studio/theme) |
| **Re-watch** | Strong positive |
| **Skip OP/ED** | Neutral |
| **Watch Together** | Social signal |

---

## API

### Get Recommendations

```ts
// GET /api/v3/recommendations?limit=20&types=anime,manga,novel
interface RecommendationResponse {
  items: RecommendationItem[];
  graphData: GraphData;  // For 3D visualization
  metadata: {
    computedAt: string;
    signalsUsed: string[];
    diversityScore: number;
  };
}

interface RecommendationItem {
  anilistId: number;
  title: string;
  type: 'anime' | 'manga' | 'novel';
  score: number;           // 0-1
  signals: SignalBreakdown;
  availability: SourceAvailability;
  reason: string;          // Human-readable: "Because you liked Studio Ghibli"
}
```

### Signal Breakdown

```ts
interface SignalBreakdown {
  genreFit: number;
  studioFit: number;
  eraFit: number;
  themeFit: number;
  community: number;
  popularity: number;
}
```

### Submit Feedback

```ts
// POST /api/v3/recommendations/feedback
{
  anilistId: 12345,
  type: 'anime',
  feedback: 'not_interested' | 'want_to_watch' | 'hide',
  reason?: 'genre' | 'studio' | 'theme' | 'other',
}
```

---

## Settings (Settings → Recommendations)

| Option | Description |
|--------|-------------|
| **Enabled** | Master toggle |
| **Content Types** | Anime / Manga / Novels (toggle each) |
| **Signal Weights** | Sliders for 6 factors (must sum to 100%) |
| **Diversity** | Low / Medium / High (MMR lambda) |
| **Novelty** | Boost unseen genres/studios |
| **Availability Filter** | Only show titles with installed sources |
| **Exclude** | Genres, studios, tags to never recommend |
| **Feedback** | Share anonymous usage for model improvement |
| **Graph** | Auto-rotate, node size, edge threshold |

---

## Privacy

- **Local-first:** Signals computed on-device where possible
- **Anonymous:** Server only sees aggregated, anonymized signals
- **Opt-out:** Disable in Settings → Privacy
- **Data retention:** Signals deleted 30 days after account deletion

---

## Performance

| Optimization | Implementation |
|--------------|----------------|
| **Precomputation** | Daily cron builds user signals |
| **Caching** | Recommendations cached 6 hours |
| **Incremental** | Only recompute changed users |
| **Batch API** | Single request for home + graph |
| **Web Workers** | Graph layout off main thread |

---

## Related

- [Video Player](features/playback.md)
- [Manga Reader](features/manga.md)
- [Novel Reader](features/novels.md)
- [Community](features/community.md)
- [Search](features/search.md)
