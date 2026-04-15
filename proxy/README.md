# Tatakai Streaming Proxy

API-only streaming proxy used by Tatakai for HLS playlists and media segments.

## Important Changes
- Public frontend/index page has been removed.
- Proxy access now requires a password.
- Password can be passed using one of:
  - `X-Proxy-Password` header
  - `X-Tatakai-Proxy-Password` header
  - `Authorization: Bearer <password>`
  - `password` query parameter

## Endpoints
- `GET /health`
- `GET /api/v1/streamingProxy`

Root (`/`) is intentionally disabled and returns `404`.

## Environment Variables
Required:
- `PROXY_PASSWORD`

Common:
- `PORT` default `3000`
- `ALLOWED_ORIGINS` default `*`
- `REFERER_URL` default `https://megacloud.club/`
- `PLAYLIST_TIMEOUT_MS` default `9000`
- `PLAYLIST_TOTAL_TIMEOUT_MS` default `14000`
- `PLAYLIST_MAX_RETRIES` default `1`
- `SEGMENT_TIMEOUT_MS` default `18000`
- `TIMEOUT_COOLDOWN_SEC` default `45`
- `BLOCKED_HOST_COOLDOWN_SEC` default `180`

## Local Run
1. Install dependencies:
```bash
npm install
```

2. Configure `.env`:
```env
PORT=3000
ALLOWED_ORIGINS=https://tatakai.me,https://www.tatakai.me
PROXY_PASSWORD=replace-with-strong-secret
REFERER_URL=https://megacloud.club/
```

3. Start:
```bash
npm run dev
```

## Usage Example
```text
GET /api/v1/streamingProxy?url=https://example.com/master.m3u8&type=video&password=YOUR_PROXY_PASSWORD
```

## Frontend (Tatakai) Configuration
Set these in the Tatakai frontend environment so playback requests use this proxy:

```env
VITE_STREAM_PROXY_URL=https://your-proxy-domain.com/api/v1/streamingProxy
VITE_STREAM_PROXY_PASSWORD=replace-with-the-same-proxy-password
```

## Cloudflare Worker
Set worker secret:
```bash
wrangler secret put PROXY_PASSWORD
```

Then deploy as usual:
```bash
npm run deploy:cf
```

