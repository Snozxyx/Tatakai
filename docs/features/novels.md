# Novel & Light Novel Reader

Tatakai's novel reader provides a distraction-free reading experience with customizable typography, multi-source aggregation, and **5 TTS engines** for audio narration.

---

## Architecture

```
NovelReader (React)
├── NovelViewer (text rendering, pagination)
├── TTSController (5 engines)
├── Extension bridge (novel-extension-runtime.ts)
├── Progress tracking (Supabase + local)
└── Settings panel (typography, TTS, appearance)
```

**Key Files:**
- `src/features/novels/components/NovelReader.tsx`
- `src/features/novels/components/NovelViewer.tsx`
- `src/core/content/novel-extension-runtime.ts`
- `src/hooks/user/useNovelReadlist.ts`

---

## Reading Experience

### Typography Customization

| Setting | Range | Default |
|---------|-------|---------|
| **Font Family** | System, Serif, Sans, Mono, Custom (upload .ttf/.otf) | System Sans |
| **Font Size** | 12px – 28px | 16px |
| **Line Height** | 1.2 – 2.5 | 1.7 |
| **Paragraph Spacing** | 0 – 2em | 1em |
| **Text Align** | Left, Justify, Center | Justify |
| **Max Width** | 40ch – 100ch / full | 70ch |

### Themes

| Theme | Background | Text |
|-------|------------|------|
| **Light** | `#ffffff` | `#1a1a1a` |
| **Dark** | `#1a1a1a` | `#eaeaea` |
| **Sepia** | `#f4ecd8` | `#3c2e1e` |
| **Custom** | User color | User color |

**CSS Variables:** `--novel-bg`, `--novel-fg`, `--novel-accent`

### Layout Modes

| Mode | Description |
|------|-------------|
| **Scroll** | Continuous vertical scroll |
| **Paginated** | Page-by-page (click/swipe) |
| **Auto-paginate** | Split by screen height |

---

## Text-to-Speech (TTS)

### Supported Engines

| Engine | Type | Platform | Quality |
|--------|------|----------|---------|
| **System TTS** | Native OS | All | Basic |
| **KittenTTS** | On-device ML | Desktop (Python daemon) | Good |
| **OpenAI** | Cloud API | All | Excellent |
| **ElevenLabs** | Cloud API | All | Excellent |
| **Local Server** | OpenAI-compatible | Desktop | Varies |

### TTSController

```ts
interface TTSController {
  // Engine management
  engines: TTSEngine[];
  activeEngine: string;
  setEngine(id: string): Promise<void>;
  
  // Playback
  speak(text: string, options?: TTSOptions): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): void;
  
  // State
  isPlaying: boolean;
  currentUtterance: SpeechSynthesisUtterance | null;
  progress: number;  // 0-1
  
  // Queue
  queue: TTSQueueItem[];
  addToQueue(chapterId: string): void;
  playQueue(): void;
}

interface TTSOptions {
  rate?: number;      // 0.5 – 2.0
  pitch?: number;     // 0.5 – 2.0
  voice?: string;     // Voice ID
  volume?: number;    // 0 – 1
}
```

### KittenTTS (Desktop)

- **Python daemon** (`desktop/services/kitten-tts-daemon.py`)
- **Model:** `kitten-tts-nano` (fast, good quality)
- **Auto-starts** when selected
- **Voices:** 10+ built-in voices

### Cloud TTS (OpenAI / ElevenLabs)

- **API keys** stored encrypted in settings
- **Caching:** Generated audio cached locally (7 days)
- **Streaming:** Progressive playback while generating
- **Voices:** All provider voices available

### Local Server

- **OpenAI-compatible** endpoint (e.g., `http://localhost:8080/v1`)
- **Use cases:** Self-hosted Whisper, Piper, Coqui, etc.
- **Auto-detects** voices from `/v1/models` or `/v1/audio/voices`

---

## Source Aggregation

Same pattern as manga — fans out to all extensions with `novel` capability:

```
Novel Detail
      │
      ▼
novel-extension-runtime.ts
      │
      ├── Fans out to ALL extensions with `novel` capability
      │
      ▼
Each extension → GET /api/v3/<ns>/novel/chapters
      │
      ▼
Merge by chapter number → deduplicate by provider
      │
      ▼
UI shows: Chapter 1 [NovelFull, RoyalRoad, WuxiaWorld]
```

---

## Chapter Content

### Fetching

```ts
// GET /api/v3/<ns>/novel/content?chapterKey=...
// Returns: { content: "<p>HTML content</p>", nextChapterKey, prevChapterKey }
```

### Rendering

- **Sanitized HTML** (DOMPurify) — preserves formatting, strips scripts
- **Ruby text** (furigana) support
- **Illustrations** — inline images with lazy load
- **Footnotes** — clickable references

### Navigation

| Control | Key | Touch |
|---------|-----|-------|
| Next chapter | `N` | Swipe left |
| Previous chapter | `B` | Swipe right |
| Scroll down | `Space` / `↓` | Swipe up |
| Scroll up | `Shift+Space` / `↑` | Swipe down |
| TTS play/pause | `T` | Toolbar |
| Font size | `+/-` | Pinch |
| Theme cycle | `Th` | Toolbar |

---

## Progress & Sync

### Local Progress

- **Chapter** + **scroll position** (or page number)
- **Auto-save** on scroll/chapter change (debounced 500ms)
- **Completion** — marked at chapter end

### Cross-Device Sync

```ts
// Supabase: read_progress (media_type = 'novel')
{
  user_id, media_type: 'novel', source_id, chapter_id,
  page_index, scroll_offset, completed, updated_at
}
```

### AniList/MAL/MangaBaka Sync

- Novel tracking via AniList (media type: NOVEL)
- MangaBaka for web novels
- Bidirectional sync same as manga

---

## Offline Reading

### Download

```ts
await downloadManager.queue({
  type: 'novel',
  sourceId: 'novelfull',
  namespace: 'toko',
  chapterKey: 'nf:ch-1',
  title: 'Chapter 1',
  // Downloads full chapter HTML + images
});
```

### Offline Library

- Settings → Downloads → Novels
- Reads in same NovelViewer (local files)
- TTS works offline with System/KittenTTS

---

## Library Management

### Readlist

- **Status:** Reading, Completed, On Hold, Dropped, Planning
- **Progress:** Chapter + position
- **Rating:** 1-10 (decimal)
- **Tags:** Custom tags per novel
- **Notes:** Private notes per novel

### Discovery

- **Unified Search** — searches across novel sources
- **Recommendations** — ML engine includes novels
- **Filters:** Genre, tags, status, language, completion
- **Image Search** — not applicable for novels

---

## Settings (Settings → Novels)

| Category | Options |
|----------|---------|
| **Reading** | Default mode, auto-advance, scroll speed, keep screen on |
| **Typography** | Font, size, line height, spacing, align, width |
| **Appearance** | Theme, custom colors, paragraph indent, first-line indent |
| **TTS** | Default engine, voice, rate, pitch, volume, auto-play next |
| **Downloads** | Quality, auto-download, WiFi only, include images |
| **Sync** | Sync frequency, conflict resolution, external services |
| **Advanced** | Content sanitization level, ruby text, footnote handling |

---

## Extension Integration

### Adding a Novel Source

1. Extension declares `capabilities: ["novel"]`
2. Implements `getNovelChapters` + `getNovelContent`
3. Host auto-discovers via `electron.listInstalledExtensions`
4. Appears in chapter list automatically

### Custom Source (kind=read)

```json
{
  "customSources": [{
    "id": "mynovel",
    "name": "My Novel Site",
    "kind": "read",
    "language": "en"
  }]
}
```

- Renders in generic NovelReader at `/x/<ns>/mynovel/read/...`

---

## Performance

| Optimization | Implementation |
|--------------|----------------|
| **Virtualized chapters** | Chapter list virtualized |
| **Content pagination** | Large chapters split into pages |
| **TTS caching** | Generated audio cached (LRU, 500MB default) |
| **Image lazy load** | Illustrations loaded on scroll |
| **Sanitization** | DOMPurify with minimal allowed tags |

---

## Accessibility

- **Screen reader:** Full text accessible, TTS as alternative
- **Keyboard:** Full navigation
- **High contrast:** Theme support
- **Reduced motion:** Disables page transitions
- **Dyslexia fonts:** OpenDyslexic, Lexend included
- **TTS highlight:** Current sentence highlighted during playback

---

## Related

- [Video Player](features/playback.md)
- [Manga Reader](features/manga.md)
- [Downloads](features/downloads.md)
- [Extension Novel Capability](extensions/capabilities/novels.md)
- [Recommendations](features/recommendations.md)