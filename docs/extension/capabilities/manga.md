# Manga

An extension can provide manga chapters and pages. This capability is **generic
across any manga-capable extension** and is served
HTTP-primary through the in-app extension-API host, with an `extension:invoke`
IPC fallback.

## Capability

```jsonc
{ "capabilities": ["manga"] }
```

The bundle exposes:

```ts
getMangaChapters(params): Promise<ChapterRow[]>   // flat chapter list for a title
getMangaPages(params): Promise<PageRow[]>         // pages for a chapter
```

The host mounts these only when the bundle actually implements them (**501**
otherwise), so a manga-declaring extension that lacks the method fails loudly
rather than silently.

## Host routes

```
GET /api/v3/<namespace>/manga/chapters   → getMangaChapters(params)
GET /api/v3/<namespace>/manga/pages      → getMangaPages(params)
```

- Page rows use `{ pageNumber, imageUrl, headers? }`. Page images are registered
  with the **localProxy** so referer/UA-locked CDNs load in the reader.
- Routing from a title to the owning namespace is generic
  (`subProviderToNamespace`), not hardcoded to one extension.

## Reader

The app's comick-style manga reader consumes the page rows. Because
**`custom-source-v1`'s `customRead` returns the same page shape**, a custom
`kind: "read"` source renders in the same reader without forking it — see
[custom-source.md](custom-source.md).

## Notes

- Manga is app-owned UI fed by extension data — the extension serves rows, the
  app renders the reader, progress, and comments.
- This is the template the custom-source vertical was modeled on: **the app owns
  the UI; the extension serves data.**
