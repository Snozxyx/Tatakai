# Bugfix Requirements Document

## Introduction

Eight bugs have been reported in the TatakaiV5 Electron + React desktop app. They span the video player, downloads page, navigation, import flow, fullscreen handling, external link handling, manga page UI, and the offline mode fallback screen. All bugs require targeted fixes with no regressions to surrounding functionality.

---

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a downloaded local video file path (e.g. `C:\Videos\file.mp4`) is passed to the HTML `<video>` element in Electron, THEN the system throws `[object Event]` and "MEDIA_ELEMENT_ERROR: Media load rejected by URL safety check" because Electron blocks bare Windows path strings from the renderer.

1.2 WHEN the user imports a local video file via "Import Videos" on the downloads page, THEN the system imports the file directly to a generic "Imported" folder with no prompt to associate an anime, so the video lacks metadata (title, poster, episode number).

1.3 WHEN the user clicks the "Auto Download" button (tab trigger navigating to `/library/offline?tab=automation`) on the downloads page, THEN the system navigates to a route that does not exist, resulting in a 404 / NotFound page.

1.4 WHEN an external `http://` or `https://` link is clicked anywhere in the renderer (e.g., social share buttons, Discord links, download-app buttons), THEN the system either opens a blank Electron window, blocks the navigation, or fails silently instead of opening the URL in the system default browser.

1.5 WHEN the user clicks the fullscreen button inside the video player while in the Electron desktop app, THEN the system calls the browser Fullscreen API (`document.requestFullscreen`) which is blocked or degraded in the sandboxed Electron renderer, producing no visual change or a broken partial-fullscreen state.

1.6 WHEN the user is on the Downloads / Offline Library page, THEN the system does not display a button to start a new torrent download; only HLS and manual downloads are reachable from that page, leaving the torrent workflow undiscoverable.

1.7 WHEN recommendation or relation cards on the Manga info page contain varying amounts of text (long titles, subtitles, genre tags), THEN the system renders cards at inconsistent heights, causing the card grid to look uneven.

1.8 WHEN the device has no internet connection and the app renders the `NoInternetPage`, THEN the system shows a broken right-side video background (because `getVideoPath` returns a relative `./videos/N.mp4` path for Electron that is not loadable as a renderer URL) and an overall broken UI.

---

### Expected Behavior (Correct)

2.1 WHEN a local file path is passed to the video element in Electron, THEN the system SHALL convert it to a properly encoded `file://` URL (e.g., `file:///C:/Videos/file.mp4`) before assigning it as the `src`, allowing Electron's renderer to load the file without a URL safety check failure.

2.2 WHEN the user imports a local video file, THEN the system SHALL display a modal/dialog prompting the user to optionally search for and select an anime (returning at minimum the anime name and poster URL) to associate with the imported video; if the user skips, the system SHALL import to a generic "Imported" folder as before.

2.3 WHEN the user clicks the "Auto Download" button on the downloads page, THEN the system SHALL navigate to an existing, working route (the automation tab within `/downloads`, rendered by `OfflineLibraryPage` with `tab=automation`) or open the tab in-place, with no 404 error.

2.4 WHEN an external `http://` or `https://` link is activated anywhere in the Electron renderer, THEN the system SHALL call `window.electron.openExternal(url)` (IPC → `shell.openExternal`) to open the URL in the OS default browser, and SHALL NOT attempt to navigate within the app window.

2.5 WHEN the user clicks the fullscreen button in the Electron video player, THEN the system SHALL invoke `window.electron.setFullscreen(true)` via IPC (which calls `win.setFullScreen(true)` in the main process) and SHALL correctly enter or exit native OS fullscreen, with the fullscreen state properly reflected in the player UI.

2.6 WHEN the user is on the Downloads / Offline Library page in the desktop app, THEN the system SHALL display a prominently accessible "Download via Torrent" button (or equivalent entry point) that allows the user to start a new torrent download session from that page.

2.7 WHEN recommendation or relation cards are rendered on the Manga info page, THEN the system SHALL render every card at a uniform fixed height with overflowing text truncated (line-clamp), so the grid is visually consistent regardless of content length.

2.8 WHEN the app renders `NoInternetPage` in Electron, THEN the system SHALL use a correct absolute-style URL for background videos (or omit the video entirely as a graceful fallback), produce a fully functional and visually complete offline page with no broken background, and SHALL display a working "Go to Offline Library" button.

---

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a remote `http://https://` stream URL is passed to the video element, THEN the system SHALL CONTINUE TO play it without modification (the file:// conversion must only apply to local paths).

3.2 WHEN the user cancels the anime-search step during video import, THEN the system SHALL CONTINUE TO import to the generic "Imported" folder as it did before, preserving backward-compatible import behavior.

3.3 WHEN the user switches to the "Library" or "History" tabs on the Downloads page, THEN the system SHALL CONTINUE TO display library content and download history exactly as before.

3.4 WHEN internal app navigation links (relative paths, `/anime/…`, `/watch/…`) are clicked, THEN the system SHALL CONTINUE TO navigate within the app without triggering `shell.openExternal`.

3.5 WHEN the user is on a non-Electron (web or Capacitor mobile) platform and clicks fullscreen, THEN the system SHALL CONTINUE TO use the standard browser Fullscreen API as before.

3.6 WHEN the user is on the Downloads page on web or mobile, THEN the torrent download entry point SHALL be hidden or clearly marked as desktop-only, preserving the correct non-desktop experience.

3.7 WHEN manga recommendation cards are displayed in non-info-page contexts (e.g. home recommendations grid), THEN the system SHALL CONTINUE TO render them with their existing styles (the fix is scoped to MangaPage).

3.8 WHEN the device has internet and `NoInternetPage` is not shown, THEN all video backgrounds in other parts of the app SHALL CONTINUE TO work without modification.
