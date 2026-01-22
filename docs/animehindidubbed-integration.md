# AnimeHindiDubbed.in Integration Guide

## Overview
AnimeHindiDubbed.in is a WordPress-based anime streaming site that provides Hindi-dubbed anime content. The site uses a unique structure where anime pages contain embedded JavaScript with episode data.

## ✅ Implementation Status
**COMPLETED** - Scraper and client integration implemented

## Architecture

### Site Structure
- **Platform**: WordPress with BlackVideo theme
- **Video Hosting**: Multiple servers (Filemoon, Servabyss, Vidgroud)
- **URL Pattern**: `https://animehindidubbed.in/{anime-slug}/`
  - Example: `https://animehindidubbed.in/black-butler/`
- **Episode Organization**: All episodes for an anime are on ONE page (not separate posts)
- **Data Format**: Episodes stored in JavaScript `serverVideos` object in the page HTML

### How It Works

Each anime page contains a JavaScript object like this:
```javascript
const serverVideos = {
  filemoon: [
    { "name": "01", "url": "https://bysewihe.com/e/..." },
    { "name": "02", "url": "https://bysewihe.com/e/..." },
    { "name": "S5E1", "url": "https://bysewihe.com/e/..." }
  ],
  servabyss: [...],
  vidgroud: [...]
};
```

The scraper:
1. Fetches the anime page HTML
2. Extracts the `serverVideos` JavaScript object using regex
3. Parses it to get all episodes for all servers
4. Returns structured data with episode URLs

### Episode Naming Convention
- Simple episodes: `"01"`, `"02"`, `"03"`, etc.
- Season/Episode format: `"S5E1"`, `"S5E12"`, etc.
- All servers (filemoon, servabyss, vidgroud) typically have the same episodes

### Video Servers
1. **Filemoon** (bysewihe.com) - Primary, best quality, multi-audio support
2. **Servabyss** (short.icu) - URL shortener, redirects to actual player
3. **Vidgroud** (listeamed.net) - Alternative host
  - Handle multiple video hosts (likely uses third-party embeds)

## Implementation

### ✅ Completed Implementation

#### Files Created

1. **Supabase Edge Function**: `supabase/functions/animehindidubbed-scraper/index.ts`
   - Search anime by title
   - Extract complete anime data (all episodes, all servers)
   - In-memory caching (10 min TTL)
   - Rate limiting (20 req/min per IP)

2. **Client Integration**: `src/integrations/animehindidubbed.ts`
   - `searchAnimeHindiDubbed(title)` - Search for anime
   - `getAnimeHindiDubbedData(slug)` - Get all episodes and servers
   - Helper functions for episode parsing and server selection

### API Usage

```typescript
import {
  searchAnimeHindiDubbed,
  getAnimeHindiDubbedData,
  getAllEpisodes,
  getEpisodeUrl,
} from '@/integrations/animehindidubbed';

// Search for anime
const results = await searchAnimeHindiDubbed('Black Butler');

// Get anime data with all episodes
const animeData = await getAnimeHindiDubbedData('black-butler');

// Get all episodes: ["01", "02", "03", "S5E1", "S5E12"]
const episodes = getAllEpisodes(animeData);

// Get episode URL for specific server
const url = getEpisodeUrl(animeData, '01', 'filemoon');
```

### Integration Pattern

Use the same pattern as `watchanimeworld-integration.ts`:
- Add to combined sources in video player
- Display as "Hindi 1" (AnimeHindiDubbed) and "Hindi 2" (WatchAnimeWorld)
- Or use server-specific names like "Tokyo Server", "Mumbai Server", etc.

## Deployment

### 1. Deploy Supabase Function
```bash
cd supabase
supabase functions deploy animehindidubbed-scraper
```

### 2. Set Environment Variables (optional)
```bash
supabase secrets set ANIMEHINDI_CACHE_TTL=600
supabase secrets set ANIMEHINDI_RATE_LIMIT=20
```

## Next Steps

1. ✅ Document site structure
2. ✅ Create scraper function in Supabase
3. ⏳ Add source selection UI in video player
4. ⏳ Test with real anime titles
5. ⏳ Deploy and monitor

## Notes

- Provides Hindi-dubbed content
- All episodes on one page (efficient scraping)
- Three servers available (Filemoon recommended as primary)
- Episode format supports both simple numbers and season/episode notation
- WordPress structure may change - scraper uses fallback regex parsing
