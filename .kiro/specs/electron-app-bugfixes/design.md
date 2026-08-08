# Design Document: Electron App Bugfixes

## Overview

This document describes the technical design for fixing 8 bugs in the TatakaiV5 Electron + React desktop app.

---

## Fix 1: Downloaded Video URL Safety Check

### Problem
`toLocalFileUrl()` in `WatchPage.tsx` encodes Windows drive letters incorrectly. The path `C:\Videos\file.mp4` must become `file:///C:/Videos/file.mp4`. The current implementation may double-encode or misformat the drive colon, triggering Electron's URL safety check.

### Solution
Update `toLocalFileUrl` in `src/pages/watch/WatchPage.tsx`:

```ts
function toLocalFileUrl(filePath?: string): string {
  if (!filePath) return '';
  if (/^(https?:|file:|blob:|data:)/i.test(filePath)) return filePath;
  const normalized = filePath.replace(/\\/g, '/');
  // Windows absolute path: C:/... → file:///C:/...
  if (/^[A-Za-z]:\//.test(normalized)) {
    const parts = normalized.split('/');
    return 'file:///' + parts[0] + '/' + parts.slice(1).map(encodeURIComponent).join('/');
  }
  // Unix absolute
  if (normalized.startsWith('/')) return 'file://' + normalized;
  return 'file:///' + normalized;
}
```

**Files changed:** `src/pages/watch/WatchPage.tsx`

---

## Fix 2: Auto-Download Button 404

### Problem
In `OfflineLibraryPage.tsx`, the automation tab's "Open Auto-Download Hub" button navigates to `/library/offline?tab=automation` — a route that does not exist. The correct approach is to simply switch the active tab since we are already on `OfflineLibraryPage`.

### Solution
Replace the `navigate('/library/offline?tab=automation')` call with `setActiveTab('automation')`.

Also add `useEffect` on mount to read a `?tab=` query param so external links to `/downloads?tab=automation` work too.

```tsx
// On mount, read tab from URL
useEffect(() => {
  const params = new URLSearchParams(location.search);
  const tab = params.get('tab');
  if (tab && ['library', 'automation', 'history'].includes(tab)) {
    setActiveTab(tab);
  }
}, []);
```

**Files changed:** `src/pages/profile/OfflineLibraryPage.tsx`

---

## Fix 3: External Links Must Open in Browser

### Problem
- `window-factory.cjs` `setWindowOpenHandler` only handles `https://`, missing `http://`
- No `openExternal` method on `window.electron` in `preload.cjs`
- No `shell:open-external` IPC handler in `ipc-system.cjs`
- The renderer has no global click interceptor for `<a href="http...">` tags

### Solution

**Step 1:** Add IPC handler to `desktop/ipc/ipc-system.cjs`:
```js
const { shell } = require('electron');
ipcMain.handle('shell:open-external', async (_event, url) => {
  if (/^https?:\/\//i.test(url)) {
    await shell.openExternal(url);
    return { success: true };
  }
  return { success: false, error: 'invalid-url' };
});
```

**Step 2:** Add `openExternal` to `desktop/preload.cjs` inside `window.electron`:
```js
openExternal: (url) => {
  if (/^https?:\/\//i.test(String(url || ''))) {
    return ipcRenderer.invoke('shell:open-external', url);
  }
  return Promise.resolve({ success: false });
},
```

**Step 3:** Fix `window-factory.cjs` to handle both http and https:
```js
mainWindow.webContents.setWindowOpenHandler(({ url }) => {
  if (/^https?:\/\//i.test(url)) {
    shell.openExternal(url);
  }
  return { action: 'deny' };
});
```

**Step 4:** Add global anchor click interceptor in `src/App.tsx`:
```tsx
useEffect(() => {
  const el = window.electron;
  if (!el?.openExternal) return;

  const handler = (e: MouseEvent) => {
    const anchor = (e.target as HTMLElement).closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href') || '';
    if (/^https?:\/\//i.test(href)) {
      e.preventDefault();
      el.openExternal(href);
    }
  };
  document.addEventListener('click', handler, true);
  return () => document.removeEventListener('click', handler, true);
}, []);
```

**Files changed:**
- `desktop/ipc/ipc-system.cjs`
- `desktop/preload.cjs`
- `desktop/window/window-factory.cjs`
- `src/App.tsx`

---

## Fix 4: Video Player Fullscreen in Electron

### Problem
`VideoPlayer.tsx` uses the browser Fullscreen API (`container.requestFullscreen()`). In Electron with `webSecurity: true` and a sandboxed renderer, this can fail silently or not produce native OS fullscreen. The IPC bridge `window.electron.setFullscreen(bool)` already exists but is unused by the video player.

### Solution
In `VideoPlayer.tsx`, modify the fullscreen toggle handler to use the Electron IPC bridge when running in Electron:

```ts
const handleFullscreenToggle = useCallback(async () => {
  const isElectron = typeof window !== 'undefined' && !!(window as any).electron?.setFullscreen;

  if (isElectron) {
    const newState = !isFullscreen;
    try {
      await (window as any).electron.setFullscreen(newState);
      setIsFullscreen(newState);
    } catch {
      // fallback to browser API
    }
    return;
  }

  // existing browser fullscreen code below...
}, [isFullscreen]);
```

Also add a `keydown` listener for `Escape` in Electron to sync state:
```ts
useEffect(() => {
  if (!(window as any).electron?.isFullscreen) return;
  const onKey = async (e: KeyboardEvent) => {
    if (e.key === 'Escape' && isFullscreen) {
      await (window as any).electron.setFullscreen(false);
      setIsFullscreen(false);
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, [isFullscreen]);
```

**Files changed:** `src/components/video/VideoPlayer.tsx`

---

## Fix 5: NoInternetPage Background Video Path

### Problem
`getVideoPath()` in `NoInternetPage.tsx` returns `./videos/1.mp4` for Electron. In Electron production, the app loads from `file:///path/to/dist/index.html`. Relative paths like `./videos/1.mp4` do not resolve to the filesystem correctly for `<video>` `src`.

### Solution
Derive the base URL from `window.location.href`:

```ts
const getVideoPath = (filename: string): string => {
  const isElectron = typeof window !== 'undefined' && !!(window as any).electron;
  if (!isElectron) return `/${filename}`;
  try {
    // In Electron: window.location.href = file:///C:/...dist/index.html
    // Strip the filename to get base directory
    const base = window.location.href
      .replace(/[?#].*$/, '')
      .replace(/\/[^/]*$/, '/');
    return `${base}${filename}`;
  } catch {
    return `/${filename}`;
  }
};
```

Also add `onError` to the video element to silently hide it if it fails:
```tsx
<video
  autoPlay muted loop playsInline
  className="absolute inset-0 w-full h-full object-cover"
  onError={(e) => { (e.currentTarget as HTMLVideoElement).style.display = 'none'; }}
>
  <source src={randomVideoSrc} type={...} />
</video>
```

**Files changed:** `src/pages/error/NoInternetPage.tsx`

---

## Fix 6: Video Import Anime Search Modal

### Problem
`OfflineLibraryPage.tsx` calls `window.electron.importVideoFiles()` which immediately opens a native dialog and copies files to `Imported/` with no chance to associate an anime. Users want to optionally search for an anime during import.

### Solution

**Phase 1 — IPC:** `select-import-files` already exists in `ipc-library.cjs` and returns file paths without copying. The `finalize-import` handler already copies files to a named directory. These are already wired in `preload.cjs`.

**Phase 2 — New component:** Create `src/components/modals/ImportAnimeModal.tsx`:

```
ImportAnimeModal
  ├── Step 1: File list preview (files picked via selectImportFiles)
  ├── Step 2: Anime search (optional)
  │    ├── Search input → calls AniList search API
  │    ├── Results grid (poster + name)
  │    └── "Skip — import as 'Imported Videos'" button
  └── Step 3: Confirm & import (calls finalize-import IPC)
```

State machine:
- `idle` → show trigger button
- `picking` → call `window.electron.selectImportFiles()`, await file list
- `searching` → show modal with anime search, file list
- `importing` → call `window.electron.finalizeImport(...)`, show progress
- `done` → close modal, reload library

The anime search uses the existing AniList search API (same used in `SearchPage.tsx`):
```ts
const searchAnime = async (query: string) => {
  const res = await fetch(`https://graphql.anilist.co`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `query($q:String){Page(perPage:8){media(search:$q,type:ANIME){id title{romaji english}coverImage{large}}}}`,
      variables: { q: query }
    })
  });
  const data = await res.json();
  return data?.data?.Page?.media || [];
};
```

When an anime is selected, `finalizeImport` is called with `targetAnimeName` set to the selected anime title. The poster is downloaded separately by the existing `repair-anime` IPC handler.

**Files changed:**
- `src/components/modals/ImportAnimeModal.tsx` (new)
- `src/pages/profile/OfflineLibraryPage.tsx` (replace `handleImportVideos` to open modal)

---

## Fix 7: Manga Info Page — Uniform Card Heights

### Problem
In `MangaPage.tsx`, relation cards wrap `UnifiedMediaCard` in `min-w-[160px]` divs but no fixed height, so cards with longer titles or more metadata grow taller. In `UnifiedMediaCard.tsx`, the bottom text section has no min-height.

### Solution

**In `MangaPage.tsx` — RelationTree:**
```tsx
<div key={rel.id} className="w-[160px] md:w-[200px] flex-shrink-0 flex flex-col">
  <UnifiedMediaCard ... className="flex-1" />
</div>
```

**In `MangaPage.tsx` — Recommendations grid:**
Wrap each card in a fixed-height container:
```tsx
<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
  {recommendationCards.map((card) => (
    <div key={...} className="flex flex-col">
      <UnifiedMediaCard item={card} className="flex-1" />
    </div>
  ))}
</div>
```

**In `UnifiedMediaCard.tsx`:**
Add a fixed minimum height to the bottom text section:
```tsx
<div className="absolute bottom-0 w-full p-4 min-h-[80px] flex flex-col justify-end">
  <h3 className="font-display font-bold text-base md:text-lg leading-tight line-clamp-2 text-white">
    {item.name}
  </h3>
  {renderMetadata()}
</div>
```

**Files changed:**
- `src/components/UnifiedMediaCard.tsx`
- `src/pages/manga/MangaPage.tsx`

---

## Fix 8: Torrent Download Button on Downloads Page

### Problem
`OfflineLibraryPage.tsx` has no way to start a torrent download. The torrent system exists (`tatakaiRuntime.searchTorrentCandidates`, `startTorrentSession`), and there are torrent components in `src/components/torrent/`.

### Solution
Check existing torrent components first. If `TorrentSearchModal` or similar exists, add a trigger button. If not, add a simple "Download via Torrent" button that navigates to a watch page with a torrent search prompt, or opens a lightweight search dialog.

**Button to add in `OfflineLibraryPage.tsx` header:**
```tsx
{isNative && (window as any).tatakaiRuntime && (
  <Button
    variant="outline"
    size="sm"
    onClick={() => setTorrentModalOpen(true)}
    className="gap-2"
  >
    <Magnet className="w-4 h-4" />
    Torrent Download
  </Button>
)}
```

**New component `src/components/modals/TorrentDownloadModal.tsx`:**
- Search input for anime name
- Calls `tatakaiRuntime.searchTorrentCandidates({ query, episode })`
- Shows candidate list with seeders/leechers/quality
- "Download" button calls `tatakaiRuntime.startTorrentSession(infoHash, { downloadPath })`
- Shows download progress and navigates to watch page on success

**Files changed:**
- `src/components/modals/TorrentDownloadModal.tsx` (new)
- `src/pages/profile/OfflineLibraryPage.tsx`

---

## Summary of Files Changed

| File | Change |
|------|--------|
| `src/pages/watch/WatchPage.tsx` | Fix `toLocalFileUrl()` encoding |
| `src/pages/profile/OfflineLibraryPage.tsx` | Fix auto-download tab navigation, add import modal, add torrent button |
| `desktop/ipc/ipc-system.cjs` | Add `shell:open-external` IPC handler |
| `desktop/preload.cjs` | Add `openExternal` to `window.electron` |
| `desktop/window/window-factory.cjs` | Fix `setWindowOpenHandler` for http+https |
| `src/App.tsx` | Add global anchor click interceptor |
| `src/components/video/VideoPlayer.tsx` | Use Electron IPC for fullscreen |
| `src/pages/error/NoInternetPage.tsx` | Fix video background path + add error handler |
| `src/components/modals/ImportAnimeModal.tsx` | New anime import modal |
| `src/components/modals/TorrentDownloadModal.tsx` | New torrent download modal |
| `src/components/UnifiedMediaCard.tsx` | Fix card text section min-height |
| `src/pages/manga/MangaPage.tsx` | Fix card container sizing |
