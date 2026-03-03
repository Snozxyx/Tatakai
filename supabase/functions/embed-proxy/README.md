# Embed Proxy Edge Function

This Supabase Edge Function acts as a proxy for embed video sources that block iframe embedding through X-Frame-Options headers.

## Problem

Many video hosting providers (mixdrop, filemoon, streamtape, etc.) set `X-Frame-Options: DENY` or `SAMEORIGIN` headers to prevent their pages from being embedded in iframes from external sites. This causes "refused to connect" errors in the browser.

## Solution

This proxy function:
1. Fetches the embed page server-side
2. Strips the `X-Frame-Options` header
3. Strips CSP `frame-ancestors` directives
4. Adds CORS headers to allow cross-origin access
5. Returns the content allowing it to be embedded

## Usage

The EmbedPlayer component automatically detects URLs from blocked domains and routes them through this proxy:

```typescript
const proxiedUrl = `${supabaseUrl}/functions/v1/embed-proxy?url=${encodeURIComponent(embedUrl)}`;
```

## Blocked Domains

The following domains are automatically proxied:
- mixdrop.*
- filemoon.*
- streamtape.com
- doodstream.com / dood.*
- upstream.to
- streamlare.com
- mp4upload.com

## Deployment

Deploy this function to Supabase:

```bash
supabase functions deploy embed-proxy
```

## Security Considerations

- This proxy only forwards video embed pages, not arbitrary URLs
- CORS is enabled to allow the frontend to access the proxied content
- The proxy preserves the original content-type and body
- No credentials or sensitive data is forwarded
