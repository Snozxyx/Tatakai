# Streaming & Playback

How Tatakai turns "play this episode" into a working stream across many providers.

## Provider aggregation

Rather than binding to a single source, Tatakai aggregates **many** streaming
providers behind one pipeline. Provider logic lives partly in `src/core/providers/`
(client-side clients and debrid orchestration) and increasingly in **extensions**
(e.g. `extension/toko`) exposed through the extension-API surface
(`/api/v3/<ns>/…`). The clients never talk to raw provider hosts directly — traffic
goes through the [API proxy](../architecture/backend-and-data.md#the-api-proxy)
and, on desktop, the local proxy / anti-bot bypass in
[`desktop/runtime/proxy/`](../architecture/desktop.md#runtime-subsystems-desktopruntime).

## Source selection, health & failover

`src/core/player/` handles turning a resolved episode into a playable source:

- **Source health scoring** and preflight checks rank candidate servers.
- **Host priority** — for some provider families, specific CDN hosts are preferred
  over others (this kind of ordering is tuned over time as hosts change).
- **Failover** — dead or failing sources are skipped and the next candidate is
  tried, with referer/codec recovery where applicable.
- **Telemetry** — latency/failure signals are recorded to `playback_telemetry`
  (see [backend-and-data](../architecture/backend-and-data.md#notable-tables)) to
  inform future ordering.

## Torrent & debrid streaming (desktop)

On desktop, playback can come from torrents:

- `desktop/runtime/torrent/` runs the torrent session, discovers candidates,
  remuxes to HLS, and bridges the stream to the player.
- `src/core/providers/` includes **debrid** clients — `realdebrid-client`,
  `torbox-client`, and a `debrid-orchestrator` — so cached torrents can be streamed
  through a debrid service instead of peer-to-peer.
- Local/remuxed media is served to the renderer via the `tatakai-media://`
  protocol.

## The extension result cache

Revisiting an anime's server list (or a manga chapter) should feel instant. A
persistent, **SWR-style union-merge cache** stores prior provider results so
revisits render immediately while fresh data is fetched in the background:

- **Fresh-authoritative per provider** — freshly fetched results replace stale
  ones for that provider (e.g. rotated/expired URLs), so nothing serves a broken
  cached URL as truth.
- **No-drop union merge** — results accumulate across visits rather than being
  overwritten wholesale.
- **Kill-switch** — disable with `VITE_ENABLE_EXT_RESULT_CACHE`.

## Preview playback

Anime cards and trending rails support hover-preview playback (`useHoverPreview`,
`usePreviewSource`), with fallbacks for non-HLS sources and retry behavior.

## Related

- Downloads & offline playback: [downloads-and-offline.md](downloads-and-offline.md)
- Synced group playback: [watch-together.md](watch-together.md)
- Building a streaming source as an extension:
  [../extension/capabilities/sources.md](../extension/capabilities/sources.md)
