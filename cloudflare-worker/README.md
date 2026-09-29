# Tatakai Streaming Proxy — Cloudflare Worker

Edge proxy that serves the **exact same `/api/v1/streamingProxy` contract** the app
already speaks, so it drops into the `VITE_PROXY_CF_URL` slot with no app-side code
changes. It proxies:

- **Video** — HLS (`.m3u8`) playlists *and* their segments/keys, plus progressive
  `mp4`/`webm`. **Preview/trailer clips are ordinary media URLs**, so they're covered
  by the same path.
- **Subtitles** (`type=subtitle`) — `vtt`/`srt`/`ass`, with content-type sniffing.
- **"Other parts"** — cover images and any generic `http(s)` asset the renderer can't
  fetch cross-origin, returned with permissive CORS.

## Request contract

```
GET /api/v1/streamingProxy?url=<encoded>&type=video|subtitle
    [&referer=<r>][&userAgent=<ua>][&password=<pw>]
```

- Forwards the client `Range:` header and preserves `206`/`content-range` for seeking.
- For a playlist, rewrites every child URI back through the worker (inheriting
  `referer`/`userAgent`/`password`).
- Puts `Access-Control-Allow-Origin: *` on every response — errors included — so the
  player reads the real status instead of a masked CORS failure.

## Deploy

```bash
cd cloudflare-worker
npm install
npx wrangler login          # first time only
npx wrangler secret put PROXY_PASSWORD   # must match VITE_STREAM_PROXY_PASSWORD
npx wrangler deploy
```

Deploy prints your worker URL, e.g. `https://tatakai-streaming-proxy.<subdomain>.workers.dev`.

## Wire it into the app

Set the proxy base to the worker URL **plus the `/api/v1/streamingProxy` path**:

```env
VITE_PROXY_CF_URL=https://tatakai-streaming-proxy.<subdomain>.workers.dev/api/v1/streamingProxy
VITE_STREAM_PROXY_PASSWORD=<same value you set as PROXY_PASSWORD>
```

Or, at runtime, add it in **Settings → Proxy** as a *Cloud / Environment* proxy with
that same URL + password. Users can then make it the default.

To make it the primary proxy for everyone, also point `VITE_STREAM_PROXY_URL` /
`VITE_PROXY_NODE_URL` at it (the app prefers `VITE_STREAM_PROXY_URL` first).

## Local dev

```bash
cp .dev.vars.example .dev.vars   # set PROXY_PASSWORD
npm run dev                      # serves on http://localhost:8787
```

Smoke test:

```bash
curl "http://localhost:8787/api/v1/streamingProxy?url=https://example.com/&type=video&password=<pw>"
```

## Security

- **Password gate** — when `PROXY_PASSWORD` is set, requests without a matching
  `?password=` get `403`. Leave it unset only for local testing.
- **SSRF guard** — refuses loopback, link-local, private (`10/8`, `172.16/12`,
  `192.168/16`), and cloud-metadata (`169.254.169.254`, `metadata.google.internal`)
  targets, and non-`http(s)` protocols.
- **Host policy (optional)** — `ALLOWED_UPSTREAM_HOSTS` / `BLOCKED_UPSTREAM_HOSTS` in
  `wrangler.toml [vars]` (comma-separated) to allowlist/denylist upstream hosts.

## Notes / limits

- The body is streamed through, never buffered, so large videos don't hit Worker
  memory limits. Subtitles are small and are buffered for content-type sniffing.
- `content-encoding` is intentionally **not** copied and `Accept-Encoding: identity`
  is sent upstream, so byte ranges stay accurate and you avoid
  `ERR_CONTENT_DECODING_FAILED` (which hls.js treats as a fatal, infinitely-retried
  network error).
- This worker does **not** solve Cloudflare-challenge–protected origins (the Node
  runtime proxy's Playwright/FlareSolverr bypass has no equivalent at the edge). Those
  hosts still need the in-app runtime proxy.
