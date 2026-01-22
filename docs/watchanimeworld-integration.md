# WatchAnimeWorld Integration

Tatakai now supports scraping streaming sources from WatchAnimeWorld.in to provide Hindi, Tamil, Telugu, Malayalam, and other regional language dubs.

## Features

- **Multi-language support**: Hindi, Tamil, Telugu, Malayalam, Bengali, Marathi, Kannada, English, Korean
- **Automatic language detection**: Extracts language metadata from provider sources
- **Cloudflare bypass**: Detects JS-protected providers and marks them for headless fallback
- **Caching**: 10-minute cache TTL to reduce server load
- **Rate limiting**: Configurable per-client rate limits
- **Retry logic**: Exponential backoff for failed requests

## Architecture

### Client-side
- `src/integrations/watchanimeworld.ts` - Parser utilities for episode URLs, language normalization, HTML extraction
- `src/hooks/useWatchanimeworldSources.ts` - React Query hook for fetching sources
- `src/lib/api.ts` - Extended with `fetchWatchanimeworldSources()` and language fields on `StreamingSource`

### Server-side
- `supabase/functions/watchanimeworld-scraper/index.ts` - Edge function that:
  1. Fetches episode page HTML
  2. Extracts `/api/player1.php` iframe data (base64-encoded server list)
  3. Resolves short links (e.g., `short.icu` redirects)
  4. Fetches provider pages and extracts m3u8 manifests
  5. Returns normalized `StreamingData` with language metadata

## Usage

### Fetch sources for an episode

```typescript
import { fetchWatchanimeworldSources } from '@/lib/api';

const sources = await fetchWatchanimeworldSources('https://watchanimeworld.in/episode/naruto-shippuden-1x1/');
// or with slug
const sources = await fetchWatchanimeworldSources('naruto-shippuden-1x1');
```

### Using the React hook

```typescript
import { useWatchanimeworldSources } from '@/hooks/useWatchanimeworldSources';

function MyComponent() {
  const { data, isLoading, error } = useWatchanimeworldSources('naruto-shippuden-1x1');
  
  if (isLoading) return <div>Loading sources...</div>;
  if (error) return <div>Error: {error.message}</div>;
  
  return (
    <div>
      {data?.sources.map(source => (
        <div key={source.url}>
          {source.language} - {source.isDub ? 'Dub' : 'Sub'} - {source.quality}
        </div>
      ))}
    </div>
  );
}
```

### Play sources in VideoPlayer

```typescript
import { getProxiedVideoUrl } from '@/lib/api';

// Get sources
const sourcesData = await fetchWatchanimeworldSources('naruto-1x1');

// Proxy the URL for CORS/referer handling
const proxiedUrl = getProxiedVideoUrl(
  sourcesData.sources[0].url,
  sourcesData.headers.Referer
);

// Pass to VideoPlayer
<VideoPlayer
  sources={[{ url: proxiedUrl, isM3U8: true }]}
  subtitles={sourcesData.subtitles}
/>
```

## Environment Variables

Configure in Supabase Dashboard → Edge Functions → Environment Variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `WATCHAW_CACHE_TTL` | `600` | Cache TTL in seconds (10 min default) |
| `WATCHAW_RATE_LIMIT` | `30` | Max requests per client per minute |
| `HEADLESS_ENABLED` | `false` | Enable Puppeteer/Playwright for JS-protected providers (future) |

## Deployment

### Deploy the edge function

```bash
cd supabase
supabase functions deploy watchanimeworld-scraper
```

### Set environment variables

```bash
supabase secrets set WATCHAW_CACHE_TTL=600
supabase secrets set WATCHAW_RATE_LIMIT=30
```

## Data Types

### StreamingSource (extended)

```typescript
interface StreamingSource {
  url: string;
  isM3U8: boolean;
  quality?: string;
  language?: string;        // "Hindi", "Tamil", etc.
  langCode?: string;        // ISO 639-1 code ("hi", "ta", etc.)
  isDub?: boolean;          // true for dubbed audio
  providerName?: string;    // "abysscdn", "zephyrflick", etc.
  needsHeadless?: boolean;  // true if requires JS/headless to resolve
}
```

### Episode URL Format

WatchAnimeWorld uses the format: `/episode/{anime-slug}-{season}x{episode}/`

Examples:
- `https://watchanimeworld.in/episode/naruto-shippuden-1x1/` → Season 1, Episode 1
- `naruto-shippuden-2x15` → Season 2, Episode 15

## Language Support

Supported languages with automatic dub detection:

| Language | ISO Code | Auto-detected as Dub |
|----------|----------|---------------------|
| Hindi | `hi` | ✅ |
| Tamil | `ta` | ✅ |
| Telugu | `te` | ✅ |
| Malayalam | `ml` | ✅ |
| Bengali | `bn` | ✅ |
| Marathi | `mr` | ✅ |
| Kannada | `kn` | ✅ |
| English | `en` | ✅ |
| Korean | `ko` | ✅ |
| Japanese | `ja` | ❌ (original) |

## Cloudflare Handling

When a provider page returns a Cloudflare challenge:
- The source is marked with `needsHeadless: true`
- The source URL is preserved for later resolution
- A future headless service (Puppeteer/Playwright) can resolve these

## Rate Limiting

- Default: 30 requests per client IP per minute
- Applies at the edge function level
- Returns `429 Too Many Requests` when exceeded
- Resets every 60 seconds

## Caching

- In-memory cache with 10-minute TTL (default)
- Cache key format: `watchaw:{episodeUrl}`
- Automatic cleanup of expired entries (10% probability per request)
- Configure with `WATCHAW_CACHE_TTL` env var

## Legal & Ethics

- ✅ robots.txt allows crawling of `/episode/` paths
- ⚠️ Check site Terms of Service before large-scale scraping
- Be conservative with request frequency
- Respect rate limits and cache aggressively
- Use polite user agents and referrers

## Troubleshooting

### No sources returned

1. Check if the episode URL is valid and accessible
2. Verify the episode exists on WatchAnimeWorld
3. Check Supabase function logs for errors
4. Try a different episode to rule out site-specific issues

### "Rate limit exceeded" errors

- Reduce request frequency
- Increase `WATCHAW_RATE_LIMIT` env var
- Implement client-side request batching

### Sources marked as `needsHeadless`

- These providers require JavaScript execution to resolve
- Implement headless fallback (Puppeteer/Playwright) for full support
- Or skip these sources and use others

### CORS errors during playback

- Ensure sources are proxied via `getProxiedVideoUrl()`
- Pass correct `Referer` header from `StreamingData.headers`
- Check `video-proxy` function is deployed and accessible

## Future Enhancements

1. **Headless fallback service**
   - Docker container with Puppeteer or Playwright
   - Queue-based architecture for async resolution
   - Support for JS-obfuscated providers

2. **Anime mapping service**
   - Fuzzy match WatchAnimeWorld slugs to Tatakai anime IDs
   - Manual override/correction interface
   - Persistent mapping database

3. **Subtitle extraction**
   - Parse VTT/SRT from provider pages
   - Multi-language subtitle support
   - Auto-proxy subtitle files

4. **Quality selection**
   - Parse quality variants from m3u8 master playlists
   - User preference for quality (auto/1080p/720p/etc.)

5. **Provider reliability scoring**
   - Track success rates per provider
   - Auto-fallback to more reliable providers
   - User feedback integration

## API Reference

See [API Reference](./api-reference.md#watchanimeworld-integration) for detailed endpoint documentation.
