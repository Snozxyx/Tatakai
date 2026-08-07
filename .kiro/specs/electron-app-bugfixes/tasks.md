# Implementation Tasks: Electron App Bugfixes

## Task 1: Fix local file URL encoding for downloaded video playback
Update the `toLocalFileUrl` function in `src/pages/watch/WatchPage.tsx` to correctly encode Windows absolute paths as `file:///C:/path/file.ext` without double-encoding the drive letter colon.

### Sub-tasks
- [ ] 1.1 Update `toLocalFileUrl` in `src/pages/watch/WatchPage.tsx` to handle Windows paths (`C:\` → `file:///C:/...`) by splitting on `/` after normalizing backslashes, keeping the drive letter unencoded, and `encodeURIComponent`-encoding all subsequent path segments
- [ ] 1.2 Verify the fix handles Unix paths, already-URL strings (http/https/file/blob), and UNC paths gracefully (no double-encoding)

## Task 2: Fix auto-download button navigating to 404
Replace the broken `navigate('/library/offline?tab=automation')` call in `OfflineLibraryPage.tsx` with an in-page tab switch, and add URL param support so `/downloads?tab=automation` also works.

### Sub-tasks
- [ ] 2.1 In `src/pages/profile/OfflineLibraryPage.tsx`, replace the `navigate('/library/offline?tab=automation')` call inside the automation tab's "Open Auto-Download Hub" button with `setActiveTab('automation')` (direct state mutation — no navigation needed since we are already on the page)
- [ ] 2.2 Add a `useEffect` that reads `?tab=` from the URL search params on mount (using `useLocation`) and calls `setActiveTab(tab)` if the value is one of `library`, `automation`, or `history`

## Task 3: Make all external links open in the system browser
Add `openExternal` IPC plumbing and a global renderer-side click interceptor so every `<a href="http...">` and `<a href="https...">` click in the Electron window opens in the OS default browser.

### Sub-tasks
- [ ] 3.1 Add `shell:open-external` IPC handler in `desktop/ipc/ipc-system.cjs` — validate that URL starts with `http://` or `https://` before calling `shell.openExternal(url)`; the `shell` object is available via `require('electron')`
- [ ] 3.2 Add `openExternal` method to `window.electron` in `desktop/preload.cjs` — call `ipcRenderer.invoke('shell:open-external', url)` after validating the URL starts with `http://` or `https://`
- [ ] 3.3 Update `setWindowOpenHandler` in `desktop/window/window-factory.cjs` to call `shell.openExternal(url)` for both `http://` AND `https://` URLs (currently only `https://` is handled)
- [ ] 3.4 Add a global `click` event listener in `src/App.tsx` that intercepts clicks on anchor elements with `http://` or `https://` hrefs, calls `window.electron.openExternal(href)`, and calls `e.preventDefault()` — only active when `window.electron?.openExternal` is available

## Task 4: Fix video player fullscreen in Electron
Modify `VideoPlayer.tsx` to use the `window.electron.setFullscreen(bool)` / `isFullscreen()` IPC bridge (which calls the native `win.setFullScreen()`) when running in Electron, instead of the browser Fullscreen API.

### Sub-tasks
- [ ] 4.1 In `src/components/video/VideoPlayer.tsx`, locate the fullscreen toggle handler (the function that calls `container.requestFullscreen()`). Add an Electron-specific branch at the top: if `window.electron?.setFullscreen` is available, call `await window.electron.setFullscreen(!isFullscreen)` then `setIsFullscreen(!isFullscreen)` and return early — skipping the browser Fullscreen API path
- [ ] 4.2 Add a `keydown` listener `useEffect` that runs only in Electron: on `Escape` key press when `isFullscreen` is true, call `window.electron.setFullscreen(false)` and `setIsFullscreen(false)` to keep state in sync when the user dismisses fullscreen via keyboard

## Task 5: Fix NoInternetPage background video path in Electron
Fix `getVideoPath()` in `src/pages/error/NoInternetPage.tsx` so the background video resolves to the correct `file://` URL in the Electron production build, and add a graceful `onError` fallback.

### Sub-tasks
- [ ] 5.1 Update `getVideoPath` in `src/pages/error/NoInternetPage.tsx` to derive the base URL from `window.location.href` when running in Electron: strip the trailing filename segment and append the video filename, producing a valid `file:///...` absolute URL
- [ ] 5.2 Add an `onError` handler to the `<video>` element that sets `display: none` on the video element when the source fails to load, so the page remains functional even if videos are unavailable

## Task 6: Add anime search step to video import flow
Create `ImportAnimeModal.tsx` and wire it into `OfflineLibraryPage.tsx` so that when the user clicks "Import Videos", they can optionally search for and associate an anime (name + poster) before files are copied, or skip to import into the generic "Imported Videos" folder.

### Sub-tasks
- [ ] 6.1 Create `src/components/modals/ImportAnimeModal.tsx` — a multi-step modal dialog using Radix UI Dialog that: (a) shows the list of files selected via `window.electron.selectImportFiles()`; (b) provides an AniList search input (debounced, 400ms) that fetches results from the AniList GraphQL API and renders poster + title cards; (c) has a "Skip — import as Imported Videos" button; (d) on anime selection or skip, calls `window.electron.finalizeImport({ items, mode: 'copy', customPath: null })` with `targetAnimeName` set to the selected anime title or `'Imported Videos'`; (e) shows a success/error state and closes the modal
- [ ] 6.2 In `src/pages/profile/OfflineLibraryPage.tsx`, replace the `handleImportVideos` function body: instead of calling `window.electron.importVideoFiles()`, call `window.electron.selectImportFiles()` to get file paths, then open `ImportAnimeModal` with those paths; keep the old `importVideoFiles` call as fallback if no files are returned

## Task 7: Fix manga info page card sizing inconsistency
Fix uniform card heights in `UnifiedMediaCard.tsx` and `MangaPage.tsx` so relation and recommendation cards are consistent regardless of title length or metadata count.

### Sub-tasks
- [ ] 7.1 In `src/components/UnifiedMediaCard.tsx`, change the bottom text container from `absolute bottom-0 w-full p-4` to `absolute bottom-0 w-full p-4 min-h-[80px] flex flex-col justify-end` so all cards reserve the same space for text content
- [ ] 7.2 In `src/pages/manga/MangaPage.tsx`, update the `RelationTree` component to use `w-[160px] md:w-[200px] flex-shrink-0` (fixed width, no min-w) on each card wrapper so relation cards are a uniform fixed width
- [ ] 7.3 In `src/pages/manga/MangaPage.tsx`, update the recommendations grid to ensure each card wrapper uses `flex flex-col` so `UnifiedMediaCard` with `flex-1` fills available height consistently

## Task 8: Add torrent download button to downloads page
Add a "Torrent Download" button to `OfflineLibraryPage.tsx` and create a `TorrentDownloadModal.tsx` that lets users search Nyaa.si for a torrent, select a candidate, and start a torrent download session directly from the downloads page.

### Sub-tasks
- [ ] 8.1 Create `src/components/modals/TorrentDownloadModal.tsx` — a Radix UI Dialog modal that: (a) provides an anime name + episode number search form; (b) calls `window.tatakaiRuntime.searchTorrentCandidates({ query, episode })` on submit; (c) renders candidate results with title, quality badge, seeders, leechers, and file size; (d) on "Download" click calls `window.tatakaiRuntime.startTorrentSession(infoHash, { downloadPath })` where `downloadPath` is the saved download path from `localStorage`; (e) shows a success toast with a "Watch Now" link on completion
- [ ] 8.2 In `src/pages/profile/OfflineLibraryPage.tsx`, add a `torrentModalOpen` state boolean and a "Torrent Download" button in the header action row — show the button only when `isNative` is true and `window.tatakaiRuntime?.searchTorrentCandidates` is available; clicking it sets `torrentModalOpen` to true and renders `<TorrentDownloadModal>`
