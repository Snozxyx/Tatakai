# Embed Ad-Blocker Deployment Guide

## Quick Start

### 1. Deploy Edge Function to Supabase

```bash
# Navigate to project root
cd d:/Tatakai

# Make sure Supabase CLI is installed
# npm install -g supabase

# Login to Supabase (if not already)
supabase login

# Link your project (if not already linked)
supabase link --project-ref your-project-ref

# Deploy the embed-adblocker function
supabase functions deploy embed-adblocker --no-verify-jwt
```

### 2. Test the Function

```bash
# Test with curl (replace with your Supabase URL and key)
curl "https://your-project.supabase.co/functions/v1/embed-adblocker?url=https://example.com/embed/video" \
  -H "apikey: your-anon-key" \
  -H "Authorization: Bearer your-anon-key"
```

### 3. Frontend Already Integrated! ✅

The frontend code has been automatically updated:
- ✅ `src/lib/api.ts` - Added `embedAdBlocker()` helper
- ✅ `src/hooks/useCombinedSources.ts` - Auto-extracts from embeds
- ✅ `src/components/video/EmbedPlayer.tsx` - Hardened security

Just build and deploy your frontend normally:

```bash
npm run build
# Then deploy to Vercel/Netlify as usual
```

## What Happens Now?

### Flow Diagram
```
┌─────────────────────────────────────────────────────────────┐
│ User selects WatchAnimeWorld/AnimeHindiDubbed server        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ useCombinedSources Hook detects embed source                │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ Calls embedAdBlocker() Edge Function                        │
│ • Fetches embed page HTML                                   │
│ • Blocks ad domains                                         │
│ • Extracts M3U8/MP4 URLs                                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
                ┌──────┴──────┐
                │             │
                ▼             ▼
    ┌───────────────┐   ┌─────────────────┐
    │ Success: ✅   │   │ Failed: ⚠️      │
    │ Direct Video  │   │ Fallback to     │
    │ Source Found  │   │ Iframe Embed    │
    └───────┬───────┘   └────────┬────────┘
            │                    │
            ▼                    ▼
    ┌───────────────┐   ┌─────────────────┐
    │ VideoPlayer   │   │ EmbedPlayer     │
    │ (HLS.js)      │   │ (Sandboxed)     │
    │ No Ads! 🎉    │   │ Popups Blocked  │
    └───────────────┘   └─────────────────┘
```

## Expected Behavior

### Scenario 1: Successful Extraction
1. User clicks WatchAnimeWorld (Hindi/Tamil/etc) server
2. Edge function extracts direct M3U8 URL
3. Video plays in custom VideoPlayer
4. **No ads, no redirects, no popups** ✨

### Scenario 2: Extraction Failed
1. User clicks embed server
2. Edge function can't find direct source
3. Falls back to iframe EmbedPlayer
4. Popups **blocked by sandbox**
5. Redirect attempts **detected and counted**
6. User sees "X ad redirects blocked" badge

### Scenario 3: No Embed Sources
1. User plays HiAnime server (HD-1, HD-2, etc)
2. Already direct M3U8 sources
3. No ad-blocker needed
4. Plays normally

## Monitoring

### Check Edge Function Logs
```bash
supabase functions logs embed-adblocker --follow
```

Look for:
```
[Embed AdBlocker] Processing: https://...
[Blocked Ad] https://doubleclick.net/...
[Video Detected] https://cdn.example.com/video.m3u8
[Embed AdBlocker] Completed in 1234ms, found 1 sources
```

### Check Browser Console
Open DevTools → Console, watch for:
```
[Ad-Blocker] Attempting to extract video from embed: https://...
[Ad-Blocker] Successfully extracted 1 video sources
[Ad-Blocker] Failed to extract from Provider: No sources found
```

## Troubleshooting

### Function Not Deployed
```bash
# Check deployed functions
supabase functions list

# Should show: embed-adblocker
```

### CORS Errors
The function includes proper CORS headers. If you still see errors:
```typescript
// Already included in index.ts:
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
```

### No Sources Extracted
Common reasons:
1. **JavaScript-loaded videos** - Current version only parses static HTML
   - **Solution**: Upgrade to headless browser (see README.md)
2. **Encrypted/obfuscated sources** - Provider hides video URLs
   - **Solution**: Add provider-specific extractors
3. **CAPTCHA/DDoS protection** - Provider blocks automated access
   - **Solution**: Rotate User-Agent, add delays, use residential proxies

### Environment Variables Missing
Verify in your `.env`:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Advanced Configuration

### Adjust Extraction Timeout
In `useCombinedSources.ts`:
```typescript
// Change from 15000 to 30000 for slower providers
await embedAdBlocker(source.url, 30000);
```

### Add Custom Ad Domains
In `embed-adblocker/index.ts`:
```typescript
const AD_DOMAINS = [
  // Existing domains...
  'your-ad-domain.com',
  'another-tracker.net',
];
```

### Skip Ad-Blocker for Specific Providers
In `useCombinedSources.ts`:
```typescript
// Don't process certain providers
if (source.providerName === 'TrustedProvider') {
  processedSources.push(source);
  continue;
}
```

## Performance Impact

### Expected Latency
- **Without extraction**: Instant iframe load
- **With extraction**: +2-5 seconds per embed
- **After extraction**: Same speed as direct sources

### Optimization Tips
1. **Cache results** - Store extracted URLs with episode ID
2. **Background processing** - Pre-extract for next episode
3. **Provider allowlist** - Skip extraction for known-good providers
4. **Parallel processing** - Extract multiple sources simultaneously

## Security Notes

### What's Protected
✅ Popup windows blocked (removed from sandbox)  
✅ Ad domain requests filtered  
✅ Redirect attempts detected  
✅ Minimal permissions in iframe  

### What's NOT Protected
⚠️ Canvas fingerprinting (iframe still executes JS)  
⚠️ Cookies/tracking (cross-origin isolation limits this)  
⚠️ DRM-protected content (shouldn't try to bypass)  

## Next Steps

1. **Test with real embed URLs**
   - Try WatchAnimeWorld Hindi/Tamil servers
   - Try AnimeHindiDubbed Berlin/Madrid servers
   - Check console logs for extraction results

2. **Monitor user feedback**
   - Do users see fewer ads?
   - Are redirects being blocked?
   - Any new ad patterns to add?

3. **Consider upgrades**
   - Headless browser for JavaScript-heavy embeds
   - Provider-specific extractors
   - Caching layer for performance
   - User settings toggle

## Support

If extraction isn't working for specific providers:
1. Copy the embed URL
2. Test with curl:
   ```bash
   curl "https://your-project.supabase.co/functions/v1/embed-adblocker?url=EMBED_URL" -H "apikey: KEY"
   ```
3. Check response for error messages
4. Update extraction patterns as needed

---

**That's it!** Your ad-blocking middleware is ready. Deploy the function and enjoy cleaner video playback! 🎬✨
