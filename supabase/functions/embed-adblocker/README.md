# Embed Ad-Blocker Function

## Overview

This Supabase Edge Function proxies embed URLs and neutralizes click-hijacking, popup ads, and tracking. It acts as a protective middleware layer between your app and third-party embed servers like abyss.to/abysscdn.com.

## How It Works

```
User Request → EmbedPlayer → embed-adblocker Function → Clean Embed
                                       ↓
                               Fetch Embed HTML
                                       ↓
                          Inject Protection Script
                                       ↓
                        Strip Ad Scripts & Tracking
                                       ↓
                         Return Sanitized HTML
```

## Click-Hijacking Protection (v2)

Based on research into the abyss CDN embed server, this function neutralizes the following attack patterns:

### 1. **Click-Hijacking (`mlCWFGuzX` Pattern)**
The embed server assigns a function to `document.onclick` and `document.ontouchend` that:
- Opens pop-under ads on every click
- Shuffles through multiple ad URLs
- Tracks popup blocks and shows error if too many are blocked

**Protection:** We use `Object.defineProperty` to make these properties unassignable.

### 2. **Popup Mechanisms**
- `window.open()` calls for pop-unders
- Stealth redirects via dynamically created `<a target="_blank">` elements

**Protection:** Both mechanisms are overridden to return fake/no-op objects.

### 3. **AdBlock Detection**
Uses `fuckadblock.min.js` to detect ad blockers and either:
- Switch to different ad URLs
- Block video playback entirely

**Protection:** We inject a fake `fuckAdBlock` object that never detects blocking.

### 4. **Extension Detection (`isUseExtension`)**
Checks if `setInterval.toString()` differs from native code to detect monitoring extensions.

**Protection:** We patch `toString()` on overridden functions to look native.

### 5. **Anti-Framing Check**
Checks `top.location == self.location` and redirects to `abyss.to` if not framed properly.

**Protection:** We override `window.top` to return `window.self`.

### 6. **Click-Capture Overlay**
An `#overlay` div blocks the video and captures all clicks for the hijacker.

**Protection:** Auto-removed after page load.

### 7. **Tracking Pixels**
Sends impressions to `pixel.morphify.net` via hidden `<img>` elements.

**Protection:** Image constructor is patched to block known tracking domains.

## API Usage

### Proxy Mode (Default)
Returns sanitized HTML ready to be embedded in an iframe.

```
GET /functions/v1/embed-adblocker?url={embedUrl}
Headers:
  apikey: {SUPABASE_ANON_KEY}
  Authorization: Bearer {SUPABASE_ANON_KEY}
```

### Response
Returns sanitized HTML content with protection script injected.

### Debug Mode
```
GET /functions/v1/embed-adblocker?url={embedUrl}&debug=1
```
Logs additional information about processing.

## Frontend Integration

### EmbedPlayer Component
```tsx
<iframe
  src={`${SUPABASE_URL}/functions/v1/embed-adblocker?url=${encodeURIComponent(embedUrl)}`}
  sandbox="allow-scripts allow-same-origin"
  allow="autoplay; encrypted-media; fullscreen"
/>
```

### Important: Sandbox Attributes
- **DO NOT** include `allow-popups` - this enables the popup ads
- **DO NOT** include `allow-top-navigation` - this enables redirects

## Ad Domains Blocked

The function blocks requests to:
- `doubleclick.net`, `googlesyndication.com`
- `popads.net`, `popcash.net`
- `propellerads.com`, `exoclick.com`  
- `usheebainaut.com`, `attirecideryeah.com` (abyss CDN ads)
- `pixel.morphify.net` (abyss CDN tracking)

## Script Patterns Stripped

- `fuckadblock.min.js` - AdBlock detection
- `googletagmanager.com/gtag/js` - Analytics
- `document.onclick = ...` - Click hijack assignments
- `reqTrack(...)` - Tracking function calls

## Deployment

```bash
# Link your project
supabase link --project-ref your-project-ref

# Deploy function
supabase functions deploy embed-adblocker

# Test
curl "https://your-project.supabase.co/functions/v1/embed-adblocker?url=https://abysscdn.com/?v=xxx"
```

## Environment Variables

None required. The function works standalone.

## Files

- `index.ts` - Main edge function with protection logic
- `vm-wrapper.html` - Legacy VM-based extraction wrapper (alternative approach)
- `README.md` - This documentation

## Technical Details

### Protection Script Flow
1. **Immediate execution** - Runs before any embed scripts
2. **Property lockdown** - Makes `document.onclick/ontouchend` unassignable
3. **Popup blocking** - Fakes `window.open` return value
4. **AdBlock spoofing** - Provides fake detection library
5. **Overlay removal** - Cleans up click-capture elements after load
6. **Auto-play trigger** - Attempts to bypass first-click requirement

### Why Not Just Extract Video URLs?
Some embed servers dynamically generate video URLs via JavaScript execution. The protection approach:
- Works with any embed server pattern
- Preserves the original player UI/controls
- Handles DRM-protected content
- Requires no provider-specific extractors

## Troubleshooting

### Video still shows ads
- Check browser console for `[Tatakai]` logs
- Ensure iframe sandbox doesn't include `allow-popups`
- Try clearing browser cache

### Video doesn't play
- The embed might use Canvas-based protection
- Try a different source
- Check if the original embed works directly

### CORS errors
- Ensure `Access-Control-Allow-Origin: *` header is present
- Check Supabase Edge Function logs

## Legal Notice

This tool is designed to:
- Improve user experience by removing intrusive ads
- Protect users from malicious redirects
- Extract publicly accessible video sources

You are responsible for complying with applicable laws and respecting content provider terms of service.
