# Anime Streaming Sources

Anime streaming is the original data-driven capability. An extension provides
playable `SourceResult`s for an episode; the app's VideoPlayer consumes them.
This capability predates the overhaul and is documented here for completeness
and because **custom sources reuse the same `SourceResult` shape**.

## Roles (capabilities)

| Capability | Role | Host method group |
| --- | --- | --- |
| `sources` | Resolve provider search / episode lists | `sourcesAll` / batch / single |
| `preview` | Provide a preview/streaming source | `getPreviewSource` |
| `websiteIndex` | Provide a website episode index | `getWebsiteEpisodeIndex` |

`preview` and `websiteIndex` are now **capability-gated and generic** — the
runtime consults every extension declaring the capability, in `priority` order,
and takes the first non-null result (error `no_capable_extension` if none). They
are no longer hardcoded to a single extension. See [migration.md](../migration.md).

## `SourceResult`

The canonical shape (`src/core/extensions/sdk/types.ts`):

```ts
interface SourceResult {
  source: string;                     // label, e.g. "Nyaa"
  url: string;                        // HLS manifest, MP4, or magnet
  quality: string;                    // "1080p" | "720p" | …
  headers: Record<string, string>;    // Referer/User-Agent required to fetch url
  subtitles: SubtitleTrack[];
  audioLanguage?: string;             // BCP-47, e.g. "ja" — helps the language resolver
  sourceType?: 'torrent' | 'hls' | 'mp4' | 'custom';
}
```

### How the host handles a source

`applyProxy(normalizeSource(s), s.headers, localProxy)`:

- **Type detection** — `mp4` when `sourceType: 'mp4'` or the URL ends in
  `.mp4/.m4v/.webm/.mkv`; `hls` when `sourceType: 'hls'` or the URL looks like an
  HLS manifest; `torrent` for magnets.
- **Proxying** — only hls/mp4 sources that **carry headers** are rewritten to a
  tokenized localProxy URL (so referer/UA locks work). Header-free public URLs
  are returned untouched.
- **Subtitles** are proxied alongside when present.

## Relationship to custom sources

`customWatch` returns `{ sources: SourceResult[] }` and goes through the **same**
`applyProxy` path — so a custom watch source plays through the identical
pipeline. See [custom-source.md](custom-source.md). A minimal header-free MP4
source is just:

```ts
{ source: "Aurora", url: film.video, quality: "720p", headers: {}, subtitles: [], sourceType: "mp4" }
```
