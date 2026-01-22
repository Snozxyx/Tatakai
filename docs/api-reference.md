# API Reference

This document describes the API endpoints and integrations used in Tatakai.

## Supabase API

All Supabase operations use the `@supabase/supabase-js` client.

### Authentication

#### Sign Up
```typescript
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password123'
});
```

#### Sign In
```typescript
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password123'
});
```

#### Sign Out
```typescript
const { error } = await supabase.auth.signOut();
```

#### Get Session
```typescript
const { data: { session } } = await supabase.auth.getSession();
```

### Database Operations

#### Profiles

**Get Profile**
```typescript
const { data, error } = await supabase
  .from('profiles')
  .select('*')
  .eq('user_id', userId)
  .single();
```

**Update Profile**
```typescript
const { error } = await supabase
  .from('profiles')
  .update({
    username: 'newusername',
    bio: 'New bio'
  })
  .eq('user_id', userId);
```

#### Watch History

**Get Continue Watching**
```typescript
const { data, error } = await supabase
  .from('watch_history')
  .select('*')
  .eq('user_id', userId)
  .eq('completed', false)
  .order('last_watched', { ascending: false })
  .limit(10);
```

**Update Watch Progress**
```typescript
const { error } = await supabase
  .from('watch_history')
  .upsert({
    user_id: userId,
    anime_id: animeId,
    episode_id: episodeId,
    episode_number: episodeNumber,
    current_time: currentTime,
    duration: duration,
    completed: completed,
    anime_title: title,
    anime_image: image,
    last_watched: new Date().toISOString()
  });
```

#### Watchlist

**Get Watchlist**
```typescript
const { data, error } = await supabase
  .from('watchlist')
  .select('*')
  .eq('user_id', userId)
  .order('added_at', { ascending: false });
```

**Add to Watchlist**
```typescript
const { error } = await supabase
  .from('watchlist')
  .insert({
    user_id: userId,
    anime_id: animeId,
    anime_title: title,
    anime_image: image,
    anime_type: type,
    status: 'plan_to_watch'
  });
```

**Remove from Watchlist**
```typescript
const { error } = await supabase
  .from('watchlist')
  .delete()
  .eq('user_id', userId)
  .eq('anime_id', animeId);
```

#### Comments

**Get Comments**
```typescript
const { data, error } = await supabase
  .from('comments')
  .select(`
    *,
    profiles:user_id (
      username,
      avatar_url
    )
  `)
  .eq('anime_id', animeId)
  .order('created_at', { ascending: false });
```

**Post Comment**
```typescript
const { error } = await supabase
  .from('comments')
  .insert({
    user_id: userId,
    anime_id: animeId,
    content: commentText
  });
```

**Delete Comment**
```typescript
const { error } = await supabase
  .from('comments')
  .delete()
  .eq('id', commentId);
```

#### Ratings

**Get User Rating**
```typescript
const { data, error } = await supabase
  .from('ratings')
  .select('rating')
  .eq('user_id', userId)
  .eq('anime_id', animeId)
  .single();
```

**Get Average Rating**
```typescript
const { data, error } = await supabase
  .from('ratings')
  .select('rating')
  .eq('anime_id', animeId);

// Calculate average in client
const average = data.reduce((sum, r) => sum + r.rating, 0) / data.length;
```

**Submit Rating**
```typescript
const { error } = await supabase
  .from('ratings')
  .upsert({
    user_id: userId,
    anime_id: animeId,
    rating: ratingValue
  });
```

### Realtime Subscriptions

#### Subscribe to Comments
```typescript
const subscription = supabase
  .channel('comments')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'comments',
      filter: `anime_id=eq.${animeId}`
    },
    (payload) => {
      console.log('New comment:', payload.new);
    }
  )
  .subscribe();
```

#### Subscribe to Admin Messages
```typescript
const subscription = supabase
  .channel('admin_messages')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'admin_messages'
    },
    (payload) => {
      if (payload.new.is_broadcast || payload.new.to_user_id === userId) {
        console.log('New message:', payload.new);
      }
    }
  )
  .subscribe();
```

## Consumet API

Base URL: `https://api.consumet.org`

### Anime Endpoints

#### Search Anime
```typescript
GET /anime/gogoanime/{query}

// Example
fetch('https://api.consumet.org/anime/gogoanime/naruto')
  .then(res => res.json())
  .then(data => console.log(data));
```

**Response:**
```json
{
  "currentPage": 1,
  "hasNextPage": true,
  "results": [
    {
      "id": "naruto",
      "title": "Naruto",
      "url": "https://gogoanime.com/naruto",
      "image": "https://image.url",
      "releaseDate": "2002",
      "subOrDub": "sub"
    }
  ]
}
```

#### Get Anime Info
```typescript
GET /anime/gogoanime/info/{id}

// Example
const info = await fetch(
  'https://api.consumet.org/anime/gogoanime/info/naruto'
).then(res => res.json());
```

**Response:**
```json
{
  "id": "naruto",
  "title": "Naruto",
  "url": "https://gogoanime.com/naruto",
  "genres": ["Action", "Adventure"],
  "totalEpisodes": 220,
  "image": "https://image.url",
  "releaseDate": "2002",
  "description": "...",
  "subOrDub": "sub",
  "type": "TV",
  "status": "Completed",
  "episodes": [
    {
      "id": "naruto-episode-1",
      "number": 1,
      "url": "https://gogoanime.com/naruto-episode-1"
    }
  ]
}
```

#### Get Streaming Links
```typescript
GET /anime/gogoanime/watch/{episodeId}

// Example
const links = await fetch(
  'https://api.consumet.org/anime/gogoanime/watch/naruto-episode-1'
).then(res => res.json());
```

**Response:**
```json
{
  "headers": {
    "Referer": "https://gogoanime.com/"
  },
  "sources": [
    {
      "url": "https://streaming.url/master.m3u8",
      "isM3U8": true,
      "quality": "default"
    }
  ],
  "download": "https://download.url"
}
```

#### Recent Episodes
```typescript
GET /anime/gogoanime/recent-episodes?page=1

// Example
const recent = await fetch(
  'https://api.consumet.org/anime/gogoanime/recent-episodes'
).then(res => res.json());
```

#### Top Airing
```typescript
GET /anime/gogoanime/top-airing?page=1

// Example
const topAiring = await fetch(
  'https://api.consumet.org/anime/gogoanime/top-airing'
).then(res => res.json());
```

#### Popular Anime
```typescript
GET /anime/gogoanime/popular?page=1

// Example
const popular = await fetch(
  'https://api.consumet.org/anime/gogoanime/popular'
).then(res => res.json());
```

## AniSkip API

Base URL: `https://api.aniskip.com/v2`

### Skip Timestamps

#### Get Skip Times
```typescript
GET /skip-times/{malId}/{episodeNumber}

// Example
const skipTimes = await fetch(
  'https://api.aniskip.com/v2/skip-times/21/1'
).then(res => res.json());
```

**Parameters:**
- `malId`: MyAnimeList ID
- `episodeNumber`: Episode number
- Optional query params:
  - `types`: Comma-separated list (op, ed, mixed-op, mixed-ed, recap)
  - `episodeLength`: Episode duration in seconds

**Response:**
```json
{
  "found": true,
  "results": [
    {
      "interval": {
        "startTime": 90.5,
        "endTime": 180.3
      },
      "skipType": "op",
      "skipId": "uuid",
      "episodeLength": 1420
    },
    {
      "interval": {
        "startTime": 1350.2,
        "endTime": 1420.0
      },
      "skipType": "ed",
      "skipId": "uuid",
      "episodeLength": 1420
    }
  ],
  "statusCode": 200
}
```

**Skip Types:**
- `op`: Opening
- `ed`: Ending
- `mixed-op`: Mixed opening (OP with story)
- `mixed-ed`: Mixed ending (ED with story)
- `recap`: Recap

## Custom API Wrapper

Located in `src/lib/api.ts`:

### searchAnime
```typescript
export async function searchAnime(query: string) {
  const response = await fetch(
    `https://api.consumet.org/anime/gogoanime/${encodeURIComponent(query)}`
  );
  return response.json();
}
```

### getAnimeInfo
```typescript
export async function getAnimeInfo(id: string) {
  const response = await fetch(
    `https://api.consumet.org/anime/gogoanime/info/${id}`
  );
  return response.json();
}
```

### getStreamingLinks
```typescript
export async function getStreamingLinks(episodeId: string) {
  const response = await fetch(
    `https://api.consumet.org/anime/gogoanime/watch/${episodeId}`
  );
  return response.json();
}
```

### getSkipTimes
```typescript
export async function getSkipTimes(
  malId: number,
  episodeNumber: number
) {
  const response = await fetch(
    `https://api.aniskip.com/v2/skip-times/${malId}/${episodeNumber}`
  );
  return response.json();
}
```

## Error Handling

### API Error Types
```typescript
interface APIError {
  message: string;
  status: number;
  code?: string;
}
```

### Error Handling Pattern
```typescript
try {
  const data = await fetchAnime(id);
  return data;
} catch (error) {
  if (error instanceof Error) {
    console.error('API Error:', error.message);
    throw new APIError(error.message, 500);
  }
  throw error;
}
```

## Rate Limiting

### Consumet API
- No official rate limit documented
- Recommended: Max 100 requests/minute

### AniSkip API
- Rate limit: 90 requests per minute
- Returns 429 status when exceeded

### Best Practices
- Cache API responses when possible
- Implement exponential backoff for retries
- Use request debouncing for search

## CORS Handling

Some streaming sources require CORS proxying:

```typescript
// Supabase Edge Function
const proxyUrl = `${supabaseUrl}/functions/v1/video-proxy`;

const response = await fetch(proxyUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${supabaseAnonKey}`
  },
  body: JSON.stringify({
    url: streamingUrl
  })
});
```

## WatchAnimeWorld Integration

### Fetch Sources

**Endpoint**: `GET /functions/v1/watchanimeworld-scraper`

**Parameters**:
- `episodeUrl` (required): Full URL or slug (e.g., `naruto-shippuden-1x1`)

**Example Request**:
```typescript
import { fetchWatchanimeworldSources } from '@/lib/api';

const sources = await fetchWatchanimeworldSources('naruto-shippuden-1x1');
```

**Response**:
```typescript
{
  headers: {
    Referer: "https://watchanimeworld.in/episode/naruto-shippuden-1x1/",
    "User-Agent": "Mozilla/5.0 ..."
  },
  sources: [
    {
      url: "https://example.com/video.m3u8",
      isM3U8: true,
      quality: "HD",
      language: "Hindi",
      langCode: "hi",
      isDub: true,
      providerName: "abysscdn",
      needsHeadless: false
    }
  ],
  subtitles: [],
  anilistID: null,
  malID: null
}
```

**Extended Source Fields**:
- `language`: Display name (Hindi, Tamil, etc.)
- `langCode`: ISO 639-1 code (hi, ta, etc.)
- `isDub`: Boolean indicating dubbed audio
- `providerName`: Source provider identifier
- `needsHeadless`: Requires JS/headless to resolve

**React Hook**:
```typescript
import { useWatchanimeworldSources } from '@/hooks/useWatchanimeworldSources';

const { data, isLoading, error } = useWatchanimeworldSources('naruto-1x1');
```

**Rate Limiting**:
- Default: 30 requests/minute per IP
- Returns 429 when exceeded
- Configure via `WATCHAW_RATE_LIMIT` env var

**Caching**:
- 10-minute TTL (default)
- Configure via `WATCHAW_CACHE_TTL` env var

See [WatchAnimeWorld Integration Guide](./watchanimeworld-integration.md) for detailed documentation.
