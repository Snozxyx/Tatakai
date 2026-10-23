# Manga, Manhwa & Comics Reader

Tatakai's manga reader supports vertical scroll (webtoon), paged (manga), and spread views with extensive customization, multi-source aggregation, and offline reading.

---

## Architecture

```
MangaReader (React)
├── MangaViewer (canvas/img rendering)
├── Virtualized chapter list
├── Extension bridge (manga-extension-runtime.ts)
├── Progress tracking (Supabase + local)
└── Settings panel (reading modes, appearance)
```

**Key Files:**
- `src/features/manga/components/MangaReader.tsx`
- `src/features/manga/components/MangaViewer.tsx`
- `src/core/content/manga-extension-runtime.ts`
- `src/hooks/user/useMangaReadlist.ts`

---

## Reading Modes

| Mode | Description | Best For |
|------|-------------|----------|
| **Vertical Scroll** | Continuous infinite scroll | Webtoons, manhwa, long strips |
| **Paged (LTR)** | Left-to-right page turns | Traditional manga |
| **Paged (RTL)** | Right-to-left page turns | Japanese manga |
| **Spread** | Two-page spreads (landscape) | Double-page art |
| **Fit Width** | Scale to container width | All modes |

**Switch:** `V` key or toolbar button.

---

## Source Aggregation

### Multi-Source Chapters

```
Manga Detail Page
        │
        ▼
manga-extension-runtime.ts
        │
        ├── Fans out to ALL extensions with `manga` capability
        │
        ▼
Each extension → GET /api/v3/<ns>/manga/chapters
        │
        ▼
Host flattens → one row per (chapter, sub-provider)
        │
        ▼
Merge by chapter number → deduplicate
        │
        ▼
UI shows: Chapter 1 [MangaDex, MangaKakalot, AsuraScans]
```

### Sub-Provider → Namespace Mapping

```ts
// Lazy map populated during chapter fetch
const subProviderToNamespace = new Map<string, string>();
// "mangadex" → "toko"
// "allmanga" → "mangadex-ext"
```

Used for pages request routing.

---

## Chapter List

### Features

- **Grouped by volume** (collapsible)
- **Language badges** (🇺🇸 EN, 🇯🇵 JP, 🇰🇷 KR, etc.)
- **Scanlator tags** (Official, Fan Group)
- **Release date** sorting
- **Read/unread indicators** (progress sync)
- **Download buttons** per chapter
- **Batch download** (volume/arc/all)

### Filtering

- Language (multi-select)
- Scanlator (multi-select)
- Volume (dropdown)
- Status: Unread / Reading / Read

---

## MangaViewer

### Rendering

| Mode | Implementation |
|------|----------------|
| **Vertical** | `<img>` with `loading="lazy"`, `IntersectionObserver` for preload |
| **Paged** | Horizontal scroll snap, one page per viewport |
| **Spread** | Two images side-by-side, center gap |

### Page Loading

```ts
// Pages fetched via GET /api/v3/<ns>/manga/pages?chapterKey=...
// Each page image proxied via localProxy (headers replayed)
// Returns: { pages: [{ pageNumber, imageUrl, proxiedImageUrl, headers }] }
```

### Controls

| Control | Key | Touch |
|---------|-----|-------|
| Next page | → / Space | Swipe left |
| Previous page | ← / Shift+Space | Swipe right |
| Next chapter | `N` | Long press → next |
| Previous chapter | `B` | Long press → prev |
| Toggle mode | `V` | Toolbar |
| Zoom | `+/-` / wheel | Pinch |
| Fit width | `F` | Double tap |

---

## Progress & Sync

### Local Progress

- **Page index** (vertical: scroll position, paged: page number)
- **Chapter completion** (auto-mark at 90% scroll)
- **Per-chapter timestamps** (last read position)

### Cross-Device Sync

```ts
// Supabase tables
read_progress {
  user_id, media_type ('manga'), source_id, chapter_id,
  page_index, scroll_offset, completed, updated_at
}

// Synced via:
// 1. Real-time on app focus
// 2. Background sync (desktop)
// 3. Manual "Sync Now" in Settings
```

### AniList/MAL/MangaBaka Sync

- **Bidirectional** — local ↔ external
- **Matching:** AniList ID → MangaBaka ID → MAL ID
- **Conflict resolution:** Last-write-wins with timestamp

---

## Offline Reading

### Download

```ts
// Queue chapter for download
await downloadManager.queue({
  type: 'manga',
  sourceId: 'mangadex',        // sub-provider
  namespace: 'toko',           // extension namespace
  chapterKey: 'md:ch-123',
  title: 'Chapter 123',
  quality: 'original',         // or 'compressed'
});
```

### Offline Library

- **Settings → Downloads → Manga** — lists all downloaded
- **Filter:** Downloaded only / All
- **Read offline:** Opens in same MangaViewer (local files)
- **Storage:** `<userData>/downloads/manga/<namespace>/<sourceId>/<chapterKey>/`

### Cleanup

- Auto-delete read chapters (configurable)
- Max storage limit (Settings → Advanced → Disk Allocation)
- Manual delete per chapter/volume/series

---

## Settings (Settings → Manga)

| Category | Options |
|----------|---------|
| **Reading** | Default mode (vertical/paged/spread), RTL default, auto-advance chapter |
| **Appearance** | Background color, page gap, spread gap, fit width default |
| **Navigation** | Swipe sensitivity, long-press actions, double-tap zoom |
| **Progress** | Auto-mark chapter read (%), sync frequency, show progress badges |
| **Downloads** | Quality (original/compressed), auto-download next, WiFi only |
| **Sources** | Preferred language order, preferred scanlator, hide duplicates |

---

## Extension Integration

### Adding a Manga Source

1. Extension declares `capabilities: ["manga"]`
2. Implements `getMangaChapters` + `getMangaPages`
3. Host auto-discovers via `electron.listInstalledExtensions`
4. Appears in chapter list automatically

### Custom Source (kind=read)

```json
{
  "customSources": [{
    "id": "mywebtoon",
    "name": "My Webtoon",
    "kind": "read",
    "language": "ko"
  }]
}
```

- Renders in generic MangaReader at `/x/<ns>/mywebtoon/read/...`
- Progress isolated from main manga readlist

---

## Performance

| Optimization | Implementation |
|--------------|----------------|
| **Virtualized list** | `@tanstack/react-virtual` for chapter list |
| **Image preload** | Next 3 pages preloaded in background |
| **Canvas rendering** | Optional canvas for smooth zoom/pan |
| **Cache** | Chapter lists cached 30 min (host) |
| **Proxy tokens** | Re-minted per request (15 min TTL) |

---

## Accessibility

- **Screen reader:** Chapter list announced, page changes announced
- **Keyboard:** Full navigation without mouse
- **High contrast:** Theme respects OS high contrast
- **Reduced motion:** Disables page turn animations
- **Font scaling:** Respects system font size

---

## Related

- [Video Player](features/playback.md)
- [Novel Reader](features/novels.md)
- [Downloads](features/downloads.md)
- [Extension Manga Capability](extensions/capabilities/manga.md)
- [Custom Source](extensions/capabilities/custom-source.md)