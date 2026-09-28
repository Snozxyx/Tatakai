# Custom Sources (`custom-source-v1`)

A **custom source** is a fully **isolated** read/watch vertical contributed by an
extension. It has its own home / info / watch (or read) UI — the same visual
design as the anime pages — but it **never touches the anime watchlist or manga
readlist**. Content is addressed by `(namespace, sourceId)`.

This is the flagship data-driven capability: the app owns all the UI; the
extension only serves data.

## Declaring a custom source

```jsonc
{
  "capabilities": ["custom-source"],
  "apiServer": {
    "namespace": "aurora",
    "contract": "custom-source-v1",
    "routes": ["custom/home", "custom/search", "custom/info", "custom/watch"]
  },
  "customSources": [
    { "id": "aurora-films", "kind": "watch", "name": "Aurora Open Films", "icon": "film" }
  ]
}
```

- `kind: "watch"` → implement `customWatch`; the terminal page is the VideoPlayer.
- `kind: "read"` → implement `customRead`; the terminal page is the manga reader.

## The bundle contract

Your Node `bundle.js` (default export a class or object) implements these
methods. Only `customHome` + one of `customWatch`/`customRead` are required for
the bundle to load; the router returns **501** if a called method is missing.

```ts
customHome(sourceId): Promise<{ sections: { title: string; items: CustomMediaCard[] }[] }>

customSearch(sourceId, query, page?): Promise<{ results: CustomMediaCard[]; hasNextPage?: boolean }>

customInfo(sourceId, id): Promise<{
  id: string; title: string; image?: string; description?: string;
  meta?: Record<string, string>;
  entries: { id: string; label: string; number?: number }[];
}>

// kind: "watch"
customWatch(sourceId, id, episodeId): Promise<{ sources: SourceResult[] }>

// kind: "read"
customRead(sourceId, id, chapterId): Promise<{ pages: { pageNumber: number; imageUrl: string; headers?: Record<string,string> }[] }>
```

### Shapes

```ts
interface CustomMediaCard { id: string; title: string; image?: string; subtitle?: string; badge?: string; }
interface CustomInfoEntry { id: string; label: string; number?: number; }
```

- **`SourceResult`** is the *same* shape the app's VideoPlayer already consumes
  (`{ url, sourceType, quality, language, audioLanguage, isM3U8, headers? }`).
  Reusing it means playback works unchanged. See [sources.md](sources.md).
- **`customRead` pages** reuse the manga page shape, so the manga reader renders
  them unchanged. See [manga.md](manga.md).

## Host routing

The host router (`host-server.cjs`) exposes an **ungated** branch (like the
manga block, *not* the anime source allowlist) for the `custom/*` routes:

```
GET /api/v3/<namespace>/custom/home?sourceId=<id>
GET /api/v3/<namespace>/custom/search?sourceId=<id>&query=<q>&page=<n>
GET /api/v3/<namespace>/custom/info?sourceId=<id>&id=<mediaId>
GET /api/v3/<namespace>/custom/watch?sourceId=<id>&id=<mediaId>&episodeId=<epId>
GET /api/v3/<namespace>/custom/read?sourceId=<id>&id=<mediaId>&chapterId=<chId>
```

Params arrive as query string. The namespace itself is only mounted for
**trusted** extensions (see [overview.md](../overview.md#trust-model)), so
untrusted code never executes even though the method routes are ungated.

### Proxying

- `custom/watch` `SourceResult`s run through the host's `applyProxy`: only
  hls/mp4 sources **carrying headers** get a tokenized localProxy URL; header-
  free public MP4s (like Aurora's) are served directly.
- `custom/read` page images are registered with the localProxy exactly like
  manga pages, so referer/UA-locked images load.

## App-side consumption

You don't write any of this — it already exists — but it's how your data
surfaces:

| Layer | File | Role |
| --- | --- | --- |
| Runtime client | `src/core/content/custom-source-runtime.ts` | `listAllCustomSources()`, `fetchCustomHome/Search/Info/Watch/Read` — HTTP-primary, `extension:invoke` IPC fallback |
| Hooks | `src/hooks/api/useCustomSource.ts` | `useCustomSources`, `useCustomHome/Search/Info/Watch/Read`; keys `['custom', namespace, sourceId, route, …]` |
| Pages | `src/pages/custom/` | `CustomHomePage`, `CustomInfoPage`, `CustomWatchPage`, `CustomReadPage` |
| Routes | `src/routes/AppRoutes.tsx` | `/x/:namespace/:sourceId[/info/:id \| /watch/:id/:episodeId \| /read/:id/:chapterId]` |
| Sidebar | `src/components/layout/Sidebar.tsx`, `MobileNav.tsx` | the **"+"** entry listing `useCustomSources()` grouped by extension |

## Isolation contract (hard rule)

A custom source **must never** write to the anime watchlist or manga readlist.
Its state stays under `['custom', …]` query keys and its own scoped storage; it
never calls media-list mutations. This is what makes a vertical "isolated."

## Worked example

`extension/aurora/src/index.ts` implements `custom-source-v1` over a static
catalog of Creative-Commons Blender films (`src/catalog.ts`):
`customHome` returns Featured + full-catalog sections, `customInfo` returns
metadata + a single `{ id: "full", label: "Full film", number: 1 }` entry, and
`customWatch` returns one header-free MP4 `SourceResult`. That's a complete,
runnable reference.

