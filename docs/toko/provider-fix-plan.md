# Toko Provider Fix Plan

## Current State (from toko_result.json — One Piece ep 1, anilistId=21)

### Working
- `animelok` — 6 sources, direct HLS (pahe/bato/uwucdn), subtitles ✅
- `animeya-vidnest` — embed fallback (custom sourceType) ✅
- `animetosho` — magnet links, peer data ✅

### Broken / Wrong

#### Torrent providers
| Provider | Problem |
|---|---|
| nyaa | Returns `.torrent` file URLs, not magnet links. Wrong files: getting Fish-Man Island ep 1 (arc "- 01") not original ep 1. No title-match scoring. |
| subplease | Filters too aggressively — SubsPlease doesn't carry ep 1 (only recent eps). Falls back to empty. |
| animetosho | Returns ep 1157-1160 (latest episodes), not ep 1. No title/episode scoring. |
| seadex | Returns all release group torrents for the show, no episode filter. |

#### Stream providers returning 0 results
Most providers time out or return empty because:
1. **Mapping problem**: `opts.titles` is populated by AniList GraphQL in `server.js`, but inside the toko bundle the providers only have whatever titles were passed in. For providers that search by title (toonstream, animesalt, etc.) and get `["One Piece", "ワンピース"]`, they can find the show but still fail because:
   - They navigate to the anime page and look for `episode-1` links, but One Piece ep 1 is 1999 content that many sites don't host
   - Sites may use different episode numbering (some sites number from the arc)
2. Some providers are geo-blocked (animeblkom 403, acgnx cloudflare) without proxy

---

## Fix Plan

### Fix 1: Nyaa — Magnet Link + Title-Match Scoring

**Root cause:** Nyaa RSS returns `<link>https://nyaa.si/view/XXXXX</link>` and `<enclosure url="https://nyaa.si/download/XXXXX.torrent">`. Neither is a magnet link. The magnet must be constructed from the info_hash embedded in the torrent page, OR we use the `<nyaa:infoHash>` RSS tag.

**Fix:**
1. Parse `<nyaa:infoHash>` from RSS items → build `magnet:?xt=urn:btih:{hash}&dn={title}&tr=...`
2. Use `release-parser.cjs` logic (ported to TS) for title matching:
   - Parse torrent title with `parseReleaseName()` 
   - Compare parsed episode number against target ep
   - Compare parsed title against anime title (fuzzy word overlap)
   - Add `matchScore` field to results
3. Sort by `matchScore * seeders` combined

**Expected result:** Returns ep 001 (`[SubsPlease] One Piece - 001`) instead of Fish-Man arc ep 01.

### Fix 2: AnimeTosho — Episode Filtering

**Root cause:** `matchesEpisode()` only checks the episode number `01`, which matches `S01E1160` episode field `1160` if the regex misses, but more importantly the search query `One Piece 01` returns whatever AnimeTosho considers most relevant — which is recent episodes because they sort by date.

**Fix:**
1. Use the `feed.animetosho.org/json?q=One+Piece+001` endpoint and parse `title` field with `release-parser` logic
2. Filter: `parsed.episodeNumber === targetEp` (strict match)
3. Also filter out results where title similarity < 0.5
4. Add `matchScore` to results

### Fix 3: SubsPlease — Episode Not Available

**Root cause:** SubsPlease API only returns recent airing episodes (last ~30). One Piece ep 1 from 1999 doesn't exist there.

**Fix:**
- Accept this: SubsPlease is for **currently airing** shows only
- When SubsPlease returns 0 results, this is expected for old episodes
- Still show results if ep is available (recent One Piece eps work fine)
- Add `matchScore` field alongside existing results

### Fix 4: All Torrent Providers — Add `magnetLink` + `matchScore` Fields

Currently `url` is sometimes a `.torrent` file URL (nyaa) and sometimes a magnet (animetosho).

**Fix:** Add explicit `magnetLink?: string` field to `SourceResult`:
- For providers that have magnet: populate `magnetLink` from magnet and keep `url` as the `.torrent` or nyaa page
- For providers that only have magnet: set both `url = magnetLink`
- Add `matchScore: number` (0–100) to every torrent result based on title+episode match quality

### Fix 5: Use `release-parser` Naming System in Toko

The desktop runtime has a full anitomy-style parser at `desktop/runtime/torrent/naming/`. The toko extension needs equivalent logic but in pure TS (no `require()`).

**Approach:** Port the essential functions to `extension/toko/src/utils/torrent-match.ts`:
- `parseEpisodeFromTitle(title: string, targetEp: number): { epNum: number | null, isBatch: boolean, season: number | null }`
- `scoreTitleMatch(torrentTitle: string, animeTitle: string): number` — word overlap score 0-100
- `scoreTorrentResult(torrentTitle: string, animeTitle: string, targetEp: number, seeders: number): number`

This replaces the simple regex in all torrent providers.

### Fix 6: Zero Results from Stream Providers — Mapping Problem

**Root cause analysis:**
The `server.js` passes `opts.titles = ["One Piece", "ワンピース", "One Piece"]` (from AniList). This is correct. But the providers fail for different reasons:

| Provider | Actual reason for 0 results |
|---|---|
| toonstream | Can find "One Piece" but ep 1 link uses `/ep-1/` format — regex `episode-1` doesn't match `/ep-1/` |
| animesalt | ep 1 URL is `/episode/one-piece-1x1/` — works if it exists on their site |
| anizone | SPA — search returns correct anime ID but ep page doesn't have static HLS |
| watchanimeworld | Can find the show but WAW uses `1x1` episode format, the slug guesser may fail |
| 4anime | New WP scraper — episode URL pattern needs tuning |
| desidub/hindidubbed | Hindi dub sites work — timeout issue resolved |
| anikoto | 000 = site not reachable |
| senshi | 502 maintenance |

**Immediate fixes:**
1. toonstream: Add `ep-{N}` as episode URL pattern  
2. watchanimeworld: Fix episode slug URL construction
3. anizone/mkissa: These are SPA-heavy sites — difficult without JS execution

**Longer-term fix (mapping):**
Many providers need **AniList → site-specific ID** mapping to skip the unreliable title-search → episode-link chain. Plan:

```
AniList ID → mapping service → { toonstream_id, watchanimeworld_slug, animelok_slug, ... }
```

The mapping service already exists at `TatakaiAPI/src/services/mapping/` (handles AniList→MAL→Kitsu). Extending it with site-specific IDs is the correct long-term solution.

---

## Implementation Order

### Phase 1 — Torrent Quality (Immediate, High Value)
1. Create `extension/toko/src/utils/torrent-match.ts` — port release-parser essential logic
2. Update `nyaa.ts` — extract magnet from `<nyaa:infoHash>`, use torrent-match scoring
3. Update `animetosho.ts` — use torrent-match scoring, strict episode filter
4. Update all torrent providers — add `magnetLink` and `matchScore` fields
5. Update `server.js` normalizeSource — pass through `magnetLink` and `matchScore`
6. Rebuild bundle

### Phase 2 — Stream Provider Fixes (URL Pattern Fixes)
1. Fix toonstream episode URL patterns (`ep-N`, `episode-N`, `-N/`)
2. Fix watchanimeworld episode slug construction
3. Fix 4anime episode URL construction

### Phase 3 — Mapping Integration (Architecture)
1. Extend TatakaiAPI mapping resolver to store per-site IDs
2. Pass resolved IDs to toko extension as additional opts fields
3. Providers check for pre-resolved ID before falling back to title search

---

## Field Changes to SourceResult Type

```typescript
interface SourceResult {
  // existing...
  url: string;              // torrent: .torrent URL or magnet (whichever available)
  
  // NEW for torrents:
  magnetLink?: string;      // always the magnet:?xt=... URL when available
  matchScore?: number;      // 0-100: how well this matches the requested title+episode
  releaseGroup?: string;    // parsed release group, e.g. "SubsPlease"
  resolution?: string;      // parsed resolution, e.g. "1080p"
}
```

---

## toko_result.json Analysis Notes

From the actual result for `anilistId=21, episode=1`:

**Nyaa results — all wrong:**
- `[Anime Time] One Piece (Season 01) East Blue (Fixed)` — this is a **batch** (17.9 GiB) ❌
- `[SubsPlease] One Piece Log - Fish-Man Island Saga - 01` — wrong arc, ep numbering confusion ❌
- `[Judas] One Piece Gyojin Tou-hen - 01` — Fish-Man Island arc ep 1, not main ep 1 ❌
- `[NC-Raws] One Piece - 01` — this is actually correct! ep 1, but search found it by coincidence ❌ (low seeders)

The search query `One Piece 01` hits by coincidence on "- 01" in arc subtitles. The real ep 1 from 1999 would be:
`[SubsPlease] One Piece - 001 (1080p) [hash].mkv` — but SubsPlease doesn't have it (too old).

For nyaa, the better search for One Piece ep 1 would be `One Piece - 001` with strict title matching.

**AnimeTosho results — all wrong:**
- `S01E1160`, `S01E1159`, `S01E1158`, `S01E1157` — these are **current** episodes (2026)
- AnimeTosho sorts by newest, so `?q=One+Piece+001` returns recent eps not ep 001

The fix: use `q=One+Piece+-+001` (SubsPlease format) OR parse episode numbers and strict-filter.

**AnimeLok — correct!** ✅
Returns actual HLS streams for ep 1 with proper URL and subtitles.
