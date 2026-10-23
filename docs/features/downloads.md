# Downloads & Offline Access

Tatakai provides comprehensive offline support for anime episodes, manga chapters, and novel chapters with a unified download manager, resume capability, and storage management.

---

## Architecture

```
DownloadManager (Desktop Service)
├── Queue (priority, concurrency)
├── HTTP Downloader (HLS/MP4, range requests)
├── Torrent Downloader (WebTorrent + native)
├── Manga/Novel Downloader (chapter images + content)
├── Storage Manager (disk allocation, cleanup)
└── IPC → Renderer (progress, controls)
```

**Key Files:**
- `desktop/runtime/download/` — Native download engine
- `src/features/downloads/components/DownloadManager.tsx`
- `src/hooks/user/useDownloads.ts`
- `desktop/ipc/ipc-download-manager.cjs`

---

## Supported Content

| Content | Formats | Methods |
|---------|---------|---------|
| **Anime** | MKV, MP4 | HLS (segmented), Torrent, Direct MP4 |
| **Manga** | CBZ (images), PDF | Chapter images (parallel) |
| **Novels** | EPUB, HTML | Chapter HTML + images |

---

## Download Manager

### Queue

```ts
interface DownloadItem {
  id: string;                    // UUID
  type: 'anime' | 'manga' | 'novel';
  mediaId: string;               // anilistId or custom source ID
  sourceId: string;              // Provider namespace::sourceId
  title: string;                 // "Episode 5" / "Chapter 123"
  quality?: string;              // "1080p", "original"
  url: string;                   // Source URL
  headers?: Record<string, string>;
  subtitles?: SubtitleTrack[];   // Anime only
  totalSize?: number;            // Bytes (if known)
  downloadedSize: number;        // Bytes
  status: DownloadStatus;
  priority: number;              // 0 = high, 100 = normal
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

type DownloadStatus = 
  | 'queued' 
  | 'downloading' 
  | 'paused' 
  | 'completed' 
  | 'failed' 
  | 'cancelled';
```

### Concurrency

| Type | Max Concurrent | Configurable |
|------|----------------|--------------|
| **HTTP (HLS/MP4)** | 3 | Yes (1-5) |
| **Torrent** | 2 | Yes (1-3) |
| **Manga/Novel** | 5 chapters | Yes (1-10) |

### Priority

- **User-initiated** → Priority 0 (immediate)
- **Auto-download next** → Priority 50
- **Batch/background** → Priority 100

---

## Anime Downloads

### HLS Download

1. Fetch manifest → parse segments
2. Download segments in parallel (concurrency limit)
3. Merge with FFmpeg (MKV container)
4. Embed subtitles (if selected)
5. Write metadata (title, episode, cover)

### Torrent Download

1. Add magnet/torrent to engine
2. Select files (video + subtitles)
3. Prioritize pieces for sequential playback
4. Stream to file + seed (configurable ratio)

### Direct MP4

- Range requests for resume
- Single file, fastest

### Subtitles

- Downloaded alongside video
- Embedded in MKV or separate .srt/.vtt/.ass
- Language preserved

---

## Manga Downloads

### Chapter Images

```ts
// Parallel download of all pages
const pages = await getMangaPages(chapterKey);
await Promise.all(pages.map(page => 
  downloadImage(page.proxiedImageUrl, page.headers)
));

// Package as CBZ (ZIP with images) or keep as folder
```

### Options

| Option | Description |
|--------|-------------|
| **Quality** | Original / Compressed (WebP, 85%) |
| **Format** | CBZ / Folder / PDF |
| **Naming** | `{series} - Ch{number} - {title}` |
| **Cover** | Download volume/series cover |

---

## Novel Downloads

### Chapter Content

```ts
// Download chapter HTML + images
const content = await getNovelContent(chapterKey);
const html = sanitizeAndPackage(content);

// Package as EPUB (with cover, metadata) or HTML folder
```

### Options

| Option | Description |
|--------|-------------|
| **Format** | EPUB / HTML folder |
| **Images** | Include illustrations / Text only |
| **TOC** | Auto-generate from chapters |
| **Metadata** | Title, author, cover, tags |

---

## Offline Library

### Access

- **Settings → Downloads** — Unified view
- **Tabs:** Anime / Manga / Novels / All
- **Filters:** Status, Type, Date, Size
- **Actions:** Play/Read, Open Folder, Delete, Retry

### Offline Mode

- **No internet required** for downloaded content
- **Player/Reader** detects local files automatically
- **Progress** synced when online

### Storage Location

```
<userData>/
├── downloads/
│   ├── anime/
│   │   └── <namespace>/<sourceId>/<episodeId>/
│   │       ├── video.mkv
│   │       └── subs/
│   ├── manga/
│   │   └── <namespace>/<sourceId>/<chapterKey>/
│   │       ├── 001.jpg
│   │       └── chapter.cbz
│   └── novels/
│       └── <namespace>/<sourceId>/<chapterKey>/
│           ├── chapter.epub
│           └── images/
```

---

## Storage Management

### Disk Allocation

```ts
// Settings → Advanced → Disk Allocation
interface DiskAllocation {
  maxSizeGB: number;        // 0 = unlimited
  currentSizeGB: number;
  autoCleanup: boolean;     // Delete oldest watched/read
  keepCompleted: boolean;   // Keep completed downloads
}
```

### Cleanup Policies

| Policy | Trigger |
|--------|---------|
| **Max size** | Exceeds `maxSizeGB` |
| **Auto-delete watched** | Anime episode marked completed |
| **Auto-delete read** | Manga/novel chapter marked completed |
| **Manual** | User deletes from library |

### Quota Enforcement

- Checked before each download
- Pauses queue if quota exceeded
- Notifies user

---

## Resume & Recovery

### HTTP Resume

- **Range requests** for partial content
- **Checkpoint** every 1MB (configurable)
- **Recovery store** tracks segment completion

### Torrent Resume

- **Piece completion** tracked in torrent engine
- **Fast resume** data saved on pause/stop
- **Recheck** on restart (configurable)

### Crash Recovery

- **Atomic file writes** (temp → final)
- **Journal** for multi-file downloads (manga/novel)
- **Verify** on resume (checksum for completed pieces)

---

## UI Features

### Download Page

- **Progress bars** with speed, ETA, peers (torrent)
- **Pause/Resume/Cancel** per item
- **Retry** failed downloads
- **Reorder** queue (drag-drop)
- **Batch actions** (pause all, clear completed)

### Notifications

- **Desktop:** Native notification on complete/fail
- **In-app:** Toast + badge on Downloads tab
- **Watch Together:** Share download status

### Integration

- **Player context menu:** "Download this episode"
- **Chapter list:** Download button per chapter
- **Batch download:** Select multiple → "Download selected"
- **Auto-download:** "Download next episode" toggle

---

## Settings (Settings → Downloads)

| Category | Options |
|----------|---------|
| **General** | Download folder, concurrency, priority defaults |
| **Anime** | Container (MKV/MP4), embed subs, preferred quality |
| **Manga** | Format (CBZ/PDF/Folder), quality, naming template |
| **Novels** | Format (EPUB/HTML), include images, TOC |
| **Storage** | Max size, auto-cleanup, cleanup policies |
| **Network** | WiFi only, metered network pause, proxy for downloads |
| **Advanced** | Checkpoint interval, verify checksums, seed ratio (torrent) |

---

## API (Extension)

```ts
// Extension can trigger downloads via service
const downloadService = extensionRegistry.getService('download-manager');
await downloadService.api.queue({
  type: 'anime',
  mediaId: '12345',
  sourceId: 'toko:gogoanime',
  // ...
});
```

---

## Related

- [Video Player](features/playback.md)
- [Manga Reader](features/manga.md)
- [Novel Reader](features/novels.md)
- [Torrent & Networking](architecture/desktop.md#torrent-engine)
- [Extension Custom Source](extensions/capabilities/custom-source.md#offline-support)