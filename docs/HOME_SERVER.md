# Tatakai Home Server

Self-host a Plex/Jellyfin-style media surface from the **Tatakai desktop app**. The Home Server wraps your local runtime (library, downloads, streams, extensions) behind an authenticated HTTP API for phones and browsers on your LAN - and optionally behind a reverse proxy for remote access.
  
## What it is (and is not)

| Home Server owns | Still uses central TatakaiAPI |
|------------------|-------------------------------|
| Offline library listing | Anime/manga catalog metadata (AniList) |
| Download inventory | Search / trending / mapping |
| Extension invoke (runs on host PC) | Account sync (MAL/AniList) |
| Auth tokens + household users | Public website |

Remote clients **never** execute extension code in the browser. They call `/api/home/extensions/invoke`; the desktop host runs the sandbox and returns results.

## Enable (desktop)

1. Open **Settings -> App**.
2. Find **Tatakai Home Server**.
3. Set an **admin password**.
4. Choose bind mode:
   - `localhost` - this machine only
   - `lan` - phones on the same Wi-Fi (recommended)
   - `all` - all interfaces (explicit opt-in)
5. Click **Start server**.
6. Copy the LAN URL (e.g. `http://192.168.1.20:8787`) and open it on your phone, TV browser, or tablet.

## Web UI (remote)

Visiting the Home Server root URL serves a **Tatakai-branded web app** (no separate install):

| Device | Experience |
|--------|------------|
| Phone / tablet | Responsive grid, bottom nav, touch-friendly cards |
| Smart TV / browser | Large focus targets, arrow-key / remote navigation |
| Desktop browser | Same dark glass theme as the main app |

Flow: sign in with your Home Server password -> browse the AniList catalog or local downloads -> pick a title and episode -> choose sub, dub, direct, HLS, or torrent playback.

The UI lives in `desktop/runtime/home-server/ui/` and is served at `/` and `/ui/*`.

## AniList catalog and playback

The Home Server web app mirrors the main Tatakai home catalog:

| Surface | Endpoint |
|---------|----------|
| Home bundle | `GET /api/home/catalog/home` |
| Browse/search | `GET /api/home/catalog/search?q={query}&page={page}&genres={genre}` |
| Media details | `GET /api/home/catalog/media/:anilistId` |

The host desktop app resolves playback. Remote browsers never run extension code or torrent clients directly.

| Step | Endpoint |
|------|----------|
| Resolve episode sources from loaded Tatakai extensions | `POST /api/home/playback/resolve` |
| Start a selected torrent source ticket | `POST /api/home/playback/start` |
| Proxy direct/HLS/torrent media back to the browser | `GET /api/home/streams/source/:token` |
| Proxy and normalize subtitles to WebVTT | `GET /api/home/subtitles/:token` |

Direct, HLS, and torrent-backed sources share the same player surface. Subtitle tracks are proxied through the host, and dub playback is requested by passing `category: "dub"` to the playback resolver.

## Shared download catalog

Hosts can share their offline download library so other household users can browse and stream:

| Setting | Effect |
|---------|--------|
| Share download catalog | Exposes `GET /api/home/catalog` and episode streams |
| Require host consent | Viewers must `POST /api/home/consent/request`; host approves in Settings |

### Viewer flow

1. Login: `POST /api/home/auth/login`
2. Request consent (if required): `POST /api/home/consent/request` `{ "label": "phone" }`
3. Wait for host approval (Settings -> pending requests)
4. List catalog: `GET /api/home/catalog`
5. Stream: `GET /api/home/catalog/:animeName/stream/:episodeNumber` (supports Range requests)

Extension code always runs on the host PC - remote clients only receive results.

## Auth

```http
POST /api/home/auth/login
Content-Type: application/json

{ "password": "your-admin-password", "label": "phone" }
```

Response includes a bearer token. Send it as:

```http
Authorization: Bearer <token>
```

or `X-Tatakai-Token: <token>`.

Video playback also accepts `?access_token=<token>` on stream URLs (used by the built-in web player) and an HttpOnly `tatakai_home_token` cookie set at login.

Localhost requests skip auth for convenience on the host machine.

## API surface

| Method | Path | Permission |
|--------|------|------------|
| GET | `/api/home/health` | public |
| POST | `/api/home/auth/login` | public |
| GET | `/api/home/status` | authenticated |
| GET | `/api/home/library` | `library` |
| GET | `/api/home/downloads` | `downloads` |
| GET | `/api/home/catalog/home` | `catalog` |
| GET | `/api/home/catalog/search` | `catalog` |
| GET | `/api/home/catalog/media/:anilistId` | `catalog` |
| POST | `/api/home/playback/resolve` | `streams` |
| POST | `/api/home/playback/start` | `streams` |
| GET | `/api/home/streams/source/:token` | `streams` |
| GET | `/api/home/subtitles/:token` | `streams` |
| GET | `/api/home/torrents` | `streams` |
| GET | `/api/home/torrents/search` | `streams` |
| POST | `/api/home/torrents/start` | `streams` |
| GET | `/api/home/torrents/:sessionId/stats` | `streams` |
| GET | `/api/home/extensions` | `extensions` |
| POST | `/api/home/extensions/invoke` | `extensions` |
| GET | `/api/home/streams/proxy-info` | `streams` |
| GET | `/api/home/users` | `users` (admin) |

## Household users

In Settings you can create a **viewer** profile with limited permissions (`library`, `streams`, `downloads`). Admins retain `users` + `extensions`.

## Remote access

Do **not** port-forward torrent DHT or WebTorrent ports.

Recommended path:

1. Keep Home Server on LAN (`bindMode: lan` or `all` behind firewall).
2. Terminate TLS with **Caddy** or **nginx** on a VPS / home gateway.
3. Reverse-proxy only the Home Server HTTP port (default `8787`).
4. Enable **Remote access** in Settings and set `remoteBaseUrl` to your HTTPS origin.
5. Restrict CORS origins when possible (avoid `*` on the public internet).
6. Use strong passwords + rotate device tokens.

### Example Caddy snippet

```caddy
home.example.com {
  reverse_proxy 192.168.1.20:8787
}
```

### Security checklist

- [ ] Admin password set before enabling LAN/remote
- [ ] Prefer viewer accounts for household devices
- [ ] Rate limit enabled (default 120 req/min per IP)
- [ ] TLS on any non-LAN exposure
- [ ] No public exposure of torrent engine ports
- [ ] Extensions remain host-side only

## Relay / TURN note

Watch2Together relay/TURN endpoints on the central API are separate from Home Server media hosting. Do not confuse peer-sync credentials with Home Server auth tokens.

## Troubleshooting

- **401 on phone** - login first; LAN clients are not treated as localhost.
- **Empty library** - download or import media in the desktop app first (`Videos/Tatakai`).
- **Extensions empty** - load extensions in the desktop Extension Hub before invoking remotely.
- **Autostart** - server restarts with the app only if it was left enabled and a password is configured.
