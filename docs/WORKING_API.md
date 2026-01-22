# Working APIs - Multi-Source Video Integration

## Overview

This document describes the tested and working API endpoints for combining multiple video sources using **MAL ID** as the common identifier.

## Test Results (Naruto Shippuden - MAL ID: 1735)

### 1. TatakaiAPI - HiAnime Episode Sources ✅

**Endpoint:**

```bash
GET https://tatakaiapi.vercel.app/api/v1/hianime/episode/sources?animeEpisodeId=naruto-shippuden-355?ep=1
```

**Response Structure:**

```json
{
  "provider": "Tatakai",
  "status": 200,
  "data": {
    "headers": {
      "Referer": "https://megacloud.blog/"
    },
    "tracks": [
      {
        "url": "https://mgstatics.xyz/subtitle/9c302488d79166d2424829a76dac57ae/eng-4.vtt",
        "lang": "English"
      },
      {
        "url": "https://mgstatics.xyz/subtitle/9c302488d79166d2424829a76dac57ae/ara-17.vtt",
        "lang": "Arabic - Arabic [Full]"
      }
      // ... more subtitle tracks
    ],
    "intro": {
      "start": 60,
      "end": 146
    },
    "outro": {
      "start": 1340,
      "end": 1432
    },
    "sources": [
      {
        "url": "https://stormshade84.live/_v7/.../master.m3u8",
        "isM3U8": true,
        "type": "hls"
      }
    ],
    "anilistID": 1735,
    "malID": 1735
  }
}
```

**Key Features:**

- ✅ Returns `malID` and `anilistID`
- ✅ Provides HLS streaming sources
- ✅ Includes subtitle tracks in multiple languages
- ✅ Includes intro/outro skip timestamps
- ✅ Provides required referer headers

### 2. TatakaiAPI - HiAnime Search ✅

**Endpoint:**

```bash
GET https://tatakaiapi.vercel.app/api/v1/hianime/search?q=Naruto%20Shippuden
```

**Response Structure:**

```json
{
  "provider": "Tatakai",
  "status": 200,
  "data": {
    "animes": [
      {
        "id": "naruto-shippuden-355",
        "name": "Naruto: Shippuden",
        "poster": "...",
        "episodes": {
          "sub": 500,
          "dub": 500
        }
      }
    ],
    "searchQuery": "Naruto Shippuden",
    "totalPages": 1,
    "hasNextPage": false,
    "currentPage": 1
  }
}
```

### 3. TatakaiAPI - Animelok (Hindi Dubbed) 📋

**Endpoint Pattern:**

```bash
GET https://tatakaiapi.vercel.app/api/v1/animelok/anime/{mal_id}
GET https://tatakaiapi.vercel.app/api/v1/animelok/watch/{mal_id}?ep=1
```

**Note:** Currently returns empty data for MAL ID 1735, but the API exists and can be used when anime is available.

**Expected Response:**

```json
{
  "provider": "Tatakai",
  "status": 200,
  "data": {
    "id": "naruto-shippuden-1735",
    "title": "Naruto: Shippuden",
    "description": "...",
    "rating": "8.7",
    "seasons": [
      {
        "title": "Season 1",
        "episodes": [
          {
            "number": 1,
            "title": "Episode 1",
            "url": "/watch/naruto-shippuden-1735?ep=1"
          }
        ]
      }
    ]
  }
}
```

### 4. Existing Integration: WatchAnimeWorld ✅

**Current Implementation:** `src/integrations/watchanimeworld.ts`

**Endpoint Pattern:**

```
https://www.watchanimeworld.com/naruto-shippuden-1x1
```

**Format:** `{anime-slug}-1x{episode-number}`

### 5. Existing Integration: AnimeHindiDubbed ✅

**Current Implementation:** `src/integrations/animehindidubbed.ts`

**Servers:**

- Berlin (Servabyss)
- Madrid (Vidgroud)

## Common Identifier Strategy

### Primary Identifier: MAL ID

All services can use MAL ID as the common identifier:

1. **Animeya.cc** - Uses MAL ID in URL: `https://animeya.cc/watch/naruto-shippuden-1735`
2. **Animelok.to** - Uses MAL ID in URL: `https://animelok.to/anime/naruto-shippuden-1735`
3. **TatakaiAPI** - Returns `malID` and `anilistID` in response
4. **WatchAnimeWorld** - Uses anime slug (derived from HiAnime anime ID)
5. **AnimeHindiDubbed** - Uses anime slug (derived from HiAnime anime ID)

### ID Resolution Flow

```
User watches episode
     ↓
HiAnime episodeId: "naruto-shippuden-355?ep=1"
     ↓
TatakaiAPI returns: { malID: 1735, anilistID: 1735 }
     ↓
Use MAL ID to fetch from other sources:
  - Animelok: /api/v1/animelok/anime/1735
  - Animeya: /watch/naruto-shippuden-1735
  - WatchAnimeWorld: naruto-shippuden-1x{ep}
  - AnimeHindiDubbed: naruto-shippuden (current slug-based)
```

## Proposed Implementation

### API Functions to Add

```typescript
// Fetch from TatakaiAPI with MAL ID support
export async function fetchTatakaiSourcesViaEpisodeId(
  episodeId: string,
  server: string = "hd-2",
  category: string = "sub"
): Promise<StreamingData & { malID?: number; anilistID?: number }> {
  const url = `https://tatakaiapi.vercel.app/api/v1/hianime/episode/sources`;
  const params = new URLSearchParams({
    animeEpisodeId: episodeId,
    server,
    category
  });
  
  const response = await fetch(`${url}?${params}`);
  const json = await response.json();
  
  if (json.status === 200 && json.data) {
    return {
      headers: json.data.headers,
      sources: json.data.sources,
      subtitles: json.data.tracks || json.data.subtitles || [],
      tracks: json.data.tracks,
      anilistID: json.data.anilistID,
      malID: json.data.malID,
      intro: json.data.intro,
      outro: json.data.outro
    };
  }
  
  throw new Error('Failed to fetch from TatakaiAPI');
}

// Fetch from Animelok using MAL ID
export async function fetchAnimelokSourcesByMalId(
  malId: number,
  episodeNumber: number
): Promise<StreamingSource[]> {
  // Implementation to fetch from Animelok
}
```

### Updated useCombinedSources Hook

The hook should:

1. First fetch from TatakaiAPI to get `malID` and `anilistID`
2. Use the MAL ID to fetch from other sources:
   - Animelok (Hindi dubbed)
   - Animeya (if available)
   - WatchAnimeWorld (existing)
   - AnimeHindiDubbed (existing)
3. Combine all sources with proper labels
4. Return combined streaming data

## Benefits

1. **Single Source of Truth:** TatakaiAPI provides MAL ID for all sources
2. **Multi-Source Redundancy:** Multiple streaming options increase reliability
3. **Language Support:** Hindi, English, Japanese from different sources
4. **Quality Options:** Different servers offer different quality levels
5. **Subtitle Support:** Rich subtitle support from TatakaiAPI tracks

## Testing Checklist

- [✅] TatakaiAPI HiAnime sources endpoint working
- [✅] TatakaiAPI returns valid malID (1735)
- [✅] TatakaiAPI returns HLS streaming sources
- [✅] TatakaiAPI includes subtitle tracks
- [✅] TatakaiAPI includes intro/outro timestamps
- [ ] Animelok integration via MAL ID
- [ ] Combine sources from multiple providers
- [ ] Video playback from TatakaiAPI sources
- [ ] Subtitle rendering from tracks
- [ ] Intro/outro skip functionality

---

**Last Updated:** 2026-01-22  
**Tested With:** Naruto Shippuden (MAL ID: 1735, Episode 1)
