# WARP tunnel

`warp-tunnel.cjs` gives the desktop app a routing toggle for extension traffic.

## What it actually does

When WARP is **enabled** and its policy (`mode` + host hints) decides a host
`shouldRoute`, the extension source-resolve path in `desktop/ipc/ipc-runtime.cjs`
forces that source through the **in-app local proxy** (`desktop/runtime/proxy/`)
instead of a direct renderer fetch. That proxy already applies Cloudflare-bypass
(Playwright / FlareSolverr / embedded), so flagged hosts egress via the proxy
path and pick up that handling. This is real, observable behaviour and works on
Windows, macOS and Linux with no extra binary.

- `mode: 'always'` → route every host.
- `mode: 'auto'` → route only hosts hinted as gated (`cloudflare`, `nyaa`,
  `megacloud`).
- `routeExtensions` / `routeTorrent` gate the two contexts (set via
  `network:set-warp-routing`).

`connected` reflects a live egress probe against
`https://www.cloudflare.com/cdn-cgi/trace` — it is only `true` when that probe
succeeds, not merely when the toggle is on. The probe also surfaces `warpEgress`
(`warp=off|on|plus`) and the egress IP in the status payload.

## Tradeoff — this is not a WireGuard tunnel

A genuine Cloudflare WARP tunnel changes the host's egress IP via WireGuard and
would require bundling and supervising `warp-cli` / `cloudflared` per platform
(and elevated permissions on some OSes). That is **out of scope** here. The
egress probe will therefore report `warp=off` unless the user has a real WARP
client running on the machine.

The proxy-routing approach above is the pragmatic "it works" path. If a true
WARP egress is wanted later, the opt-in is: bundle `warp-cli`, register it as a
WireGuard interface, and point the OS/session proxy at the tunnel — then have
`_probeEgress()` confirm `warp=on` before reporting `connected`.

Torrent P2P traffic is **not** HTTP-proxyable the same way; `routeTorrent`
currently only affects HTTP tracker/metadata fetches, not the peer swarm, which
would likewise need a SOCKS-capable tunnel to reroute.
