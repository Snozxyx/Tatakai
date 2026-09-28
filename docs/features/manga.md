# Manga

The V6 manga stack is a ground-up rebuild: a new reader, HTTP-primary sourcing
through the extension-API host, saved progress, and dual comment threads.

## Reading is HTTP-primary via the extension-API host

Manga reading is served over HTTP from the in-app **extension-API host**
(`desktop/runtime/extension-api-host/`) at:

```
/api/v3/<ns>/manga/chapters
/api/v3/<ns>/manga/pages
```

This is **generic across any manga-capable extension** — not tied to one provider
— with an **IPC fallback** when HTTP isn't available. Pages are routed to the
right extension via `subProviderToNamespace`. Because the same extension-API
surface is served by both the proxy and the desktop host, the web and desktop
apps read manga through the same contract.

> Manga and anime ids can collide. Always classify a written work by its `format`,
> never by inferring from chapter/volume counts. See
> [../architecture/backend-and-data.md](../architecture/backend-and-data.md#the-mappings-schema-is-not-exposed-to-postgrest).

## The reader

A **comick-style reader** rebuilt for V6:

- **Per-device display settings and keybinds** — layout/reading preferences and
  keyboard shortcuts persist per device.
- **Progress persistence** — reading position is saved and restored, and feeds the
  continue-reading rails and reading-based rank contribution.
- Polished chapter navigation, chapter search/grouping for large catalogs, and
  provider/language controls.

UI lives under `src/components/reader/` and `src/components/manga/`; the reader
screen is in `src/pages/manga/`.

## Comments

Manga supports **dual comment threads**:

- **Global** — per-series discussion.
- **Per-chapter** — scoped to a single chapter.

Both are backed by the single **polymorphic comments table** shared with the rest
of the app (see
[backend-and-data](../architecture/backend-and-data.md#notable-tables)); enabling
per-chapter comments requires the corresponding migration to be applied.

## Sources & providers

Manga sources are contributed by extensions (the same mechanism as streaming
sources). Provider coverage evolves; shipped support has focused on Madara-style
sources first, with others held or infeasible depending on the site. To add a
manga source, see
[../extension/capabilities/manga.md](../extension/capabilities/manga.md).

## Offline

Whole series can be downloaded for offline reading — see
[downloads-and-offline.md](downloads-and-offline.md).
