# Testing Guide: Embed Proxy Feature

This guide provides instructions for testing the embed proxy feature that fixes AdBlock/Sandbox errors.

## Prerequisites

1. Deploy the updated Supabase function:
   ```bash
   supabase functions deploy watchanimeworld-scraper
   ```

2. Ensure environment variables are set:
   ```bash
   VITE_SUPABASE_URL=https://xkbzamfyupjafugqeaby.supabase.co
   VITE_SUPABASE_ANON_KEY=sb_publishable_hiKONZyoLpTAkFpQL5DWIQ_1_OWjmj3
   ```

## Testing the Embed Proxy Endpoint

### 1. Test with curl (Basic)

Test that the endpoint accepts embedUrl parameter:

```bash
curl -X GET 'https://xkbzamfyupjafugqeaby.supabase.co/functions/v1/watchanimeworld-scraper?embedUrl=https://example.com/embed/test' \
  -H 'Authorization: Bearer sb_publishable_hiKONZyoLpTAkFpQL5DWIQ_1_OWjmj3' \
  -H 'apikey: sb_publishable_hiKONZyoLpTAkFpQL5DWIQ_1_OWjmj3'
```

**Expected:** HTML response (even if example.com returns 404, you should see the fetch attempt)

### 2. Test with Real WatchAnimeWorld Episode

First, get an episode's sources to find an embed URL:

```bash
curl -X GET 'https://xkbzamfyupjafugqeaby.supabase.co/functions/v1/watchanimeworld-scraper?episodeUrl=naruto-shippuden-1x1' \
  -H 'Authorization: Bearer sb_publishable_hiKONZyoLpTAkFpQL5DWIQ_1_OWjmj3' \
  -H 'apikey: sb_publishable_hiKONZyoLpTAkFpQL5DWIQ_1_OWjmj3'
```

Look for a source with `"needsHeadless": true` or `"isM3U8": false` - this will have an embed URL.

Then test the proxy with that URL:

```bash
# Replace {embed-url} with actual URL from above
curl -X GET 'https://xkbzamfyupjafugqeaby.supabase.co/functions/v1/watchanimeworld-scraper?embedUrl={embed-url}' \
  -H 'Authorization: Bearer sb_publishable_hiKONZyoLpTAkFpQL5DWIQ_1_OWjmj3' \
  -H 'apikey: sb_publishable_hiKONZyoLpTAkFpQL5DWIQ_1_OWjmj3' \
  -o proxied.html
```

**Expected:** HTML file with injected protective script and removed ad detection code

### 3. Inspect the Proxied HTML

Check that the protective script was injected:

```bash
grep -A 10 "Prevent redirects and popups" proxied.html
```

**Expected:** Should show the injected JavaScript with window.open override and location method interception

## Testing in the Browser

### 1. Build and Run Locally

```bash
npm install
npm run dev
```

### 2. Navigate to Watch Page

1. Go to an anime page (e.g., `/anime/naruto-shippuden-355`)
2. Select an episode
3. On the watch page, toggle between Sub/Dub
4. Look for language options with globe icon (e.g., "Hindi", "Tamil")
5. Click on a language option to select WatchAnimeWorld source

### 3. Verify Embed Player Works

**What to check:**
- ✅ No "AdBlock/Sandbox" error message
- ✅ Video player loads successfully
- ✅ No popups or redirects occur
- ✅ Video plays when clicked
- ✅ Browser console shows "Proxying embed: {url}" in Supabase function logs

### 4. Check Browser Console

Open DevTools Console (F12) and look for:
- No error messages about blocked content
- No warnings about sandbox violations
- Protective script logs (if provider attempts popups/redirects)

### 5. Test Different Languages

Try multiple language sources to ensure they all work:
- Hindi (hi)
- Tamil (ta)
- Telugu (te)
- Malayalam (ml)
- English (en)

## Common Issues and Solutions

### Issue: "Missing episodeUrl or embedUrl parameter"

**Cause:** Function deployed but URL is incorrect or parameters missing

**Solution:** Check that embedUrl parameter is properly URL-encoded:
```javascript
const encodedUrl = encodeURIComponent(embedUrl);
const finalUrl = `${supabaseUrl}/functions/v1/watchanimeworld-scraper?embedUrl=${encodedUrl}`;
```

### Issue: Still getting AdBlock errors

**Cause:** Provider may be using different detection method not covered

**Solution:** 
1. Open browser DevTools Network tab
2. Check the HTML response from the proxy
3. Look for undetected ad/detection scripts
4. Update the regex patterns in `rewriteEmbedHtml()` function

### Issue: Video doesn't play but no error

**Cause:** Provider may require specific cookies or authentication

**Solution:**
- Check provider requirements
- May need to pass cookies through proxy
- Consider using video-proxy for the actual video stream

### Issue: Rate limit exceeded

**Cause:** Too many requests to the function

**Solution:**
```bash
# Increase rate limit
supabase secrets set WATCHAW_RATE_LIMIT=60
```

## Verification Checklist

- [ ] Function deployed successfully
- [ ] Endpoint responds to embedUrl parameter
- [ ] Proxied HTML contains protective script
- [ ] Proxied HTML has ad scripts removed
- [ ] Frontend uses proxied URLs automatically
- [ ] Embed player loads without sandbox error
- [ ] Video plays successfully
- [ ] No popups or unwanted redirects
- [ ] Multiple languages work
- [ ] CodeQL security scan passed

## Performance Testing

### Check Response Times

```bash
time curl -X GET 'https://xkbzamfyupjafugqeaby.supabase.co/functions/v1/watchanimeworld-scraper?embedUrl=https://example.com' \
  -H 'Authorization: Bearer sb_publishable_hiKONZyoLpTAkFpQL5DWIQ_1_OWjmj3' \
  -H 'apikey: sb_publishable_hiKONZyoLpTAkFpQL5DWIQ_1_OWjmj3'
```

**Expected:** Response in 1-3 seconds (depending on provider)

### Check Cache Effectiveness

Make the same request twice:

```bash
# First request
time curl ... > /dev/null
# Second request (should be faster if cached)
time curl ... > /dev/null
```

**Note:** Embed proxy responses are NOT cached (only episode source lists are cached)

## Monitoring

Check Supabase function logs:
1. Go to Supabase Dashboard
2. Navigate to Edge Functions → watchanimeworld-scraper
3. Check logs for:
   - "Proxying embed: {url}" messages
   - Error logs
   - Rate limit violations

## Success Criteria

✅ All tests pass
✅ No AdBlock/Sandbox errors
✅ Videos play successfully
✅ No security vulnerabilities (CodeQL passed)
✅ No unwanted popups or redirects
✅ Response times acceptable (<3s)
✅ Multiple languages work correctly

## Support

If issues persist:
1. Check Supabase function logs
2. Check browser console for errors
3. Verify environment variables are set
4. Try different anime/episodes
5. Report issue with:
   - Episode URL tested
   - Embed URL (if available)
   - Error messages
   - Browser/device info
