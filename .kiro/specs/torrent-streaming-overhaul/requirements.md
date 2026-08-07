# Requirements Document

## Introduction

This document captures the formal requirements for the Torrent Streaming Overhaul feature in TatakaiV5. The feature encompasses three tightly related improvements to the Electron app's torrent playback system:

1. **Torrent Streaming Overhaul** — Migrate from the fragile ffmpeg transcode path to `torrent-stream` for direct pipe-based MKV streaming, eliminate duplicate subtitle tracks, and add full multi-track audio and subtitle selection.
2. **Torrent Status Screen Redesign** — Replace the existing `TorrentStickyBanner` with a compact glass-aesthetic HUD panel anchored center-top, showing download speed, peers, progress, buffering state, and storage.
3. **Fullscreen Mode Fix** — Ensure the video player enters true fullscreen correctly on Windows, macOS, and Linux, with proper aspect ratio, subtitle positioning, and overlay control preservation.

---

## Glossary

- **TorrentStreamBridge**: The new main-process module that wraps `torrent-stream` and exposes a streaming API to the session manager.
- **RangeStreamServer**: A lightweight `http.Server` in the main process that serves byte-range requests against registered `torrent-stream` file streams.
- **SubtitleExtractor**: The main-process component that runs ffmpeg to extract subtitle tracks from MKV files as VTT data URLs.
- **SubtitleManager**: The renderer-side component that manages which subtitle track is active and injects `<track>` elements.
- **AudioTrackSelector**: The renderer-side UI component for selecting audio tracks in MKV torrent streams.
- **TorrentStatusPanel**: The new compact glass HUD component that replaces `TorrentStickyBanner`.
- **FullscreenController**: The renderer-side hook/component that manages fullscreen state across platforms.
- **EtaFormatter**: The pure function `formatEta(seconds)` that converts a raw ETA in seconds to a human-readable string.
- **BufferingStatusDeriver**: The pure function `deriveBufferingStatus(isBuffering, stats)` that maps live stats to a typed status enum.
- **StreamSession**: An active torrent download session tracked by `TorrentSessionManager`.
- **streamId**: A random UUID assigned to each registered stream in the `RangeStreamServer`.
- **infoHash**: The SHA-1 hash identifying a torrent.
- **VTT**: WebVTT subtitle format, the only format accepted by the HTML `<track>` element.
- **ffprobe**: The FFmpeg companion tool used to extract stream metadata (audio/subtitle track info) from media files.
- **data URL**: A `data:text/vtt;base64,...` URI embedding subtitle content directly without a file path.

---

## Requirements

### Requirement 1: MKV Streaming via torrent-stream

**User Story:** As a viewer, I want MKV torrent files to stream reliably without stalling or failing, so that I can watch anime without interruptions caused by the ffmpeg transcode path.

#### Acceptance Criteria

1. WHEN a torrent source file has an `.mkv` or `.webm` extension, THE TorrentStreamBridge SHALL open a `torrent-stream` engine for that file and register it with the RangeStreamServer.
2. WHEN the TorrentStreamBridge opens a stream, THE RangeStreamServer SHALL return a stream URL matching the pattern `http://127.0.0.1:{PORT}/ts/{streamId}` where `streamId` is a non-empty UUID string.
3. WHEN the RangeStreamServer receives a request with a `Range: bytes=X-Y` header, THE RangeStreamServer SHALL respond with HTTP status `206 Partial Content`, a `Content-Range: bytes X-Y/totalLength` header, and the requested byte slice.
4. WHEN the RangeStreamServer receives a request without a Range header, THE RangeStreamServer SHALL respond with HTTP status `200 OK` and stream the full file.
5. THE RangeStreamServer SHALL set `Accept-Ranges: bytes`, `Content-Length`, and `Access-Control-Allow-Origin: *` headers on all responses.
6. WHEN the `torrent-stream` engine fails to start, THE TorrentStreamBridge SHALL fall back to the existing WebTorrent HTTP transcode server and log a warning.
7. WHEN the RangeStreamServer cannot bind to a port, THE RangeStreamServer SHALL retry on the next available port up to 5 times before returning an error.

---

### Requirement 2: Track Metadata Extraction

**User Story:** As a viewer, I want the player to know all available audio and subtitle tracks in an MKV file, so that I can choose the language and subtitle track I prefer.

#### Acceptance Criteria

1. WHEN at least 3 MB of an MKV file is available in the torrent buffer, THE SubtitleExtractor SHALL run `ffprobe` with `-analyzeduration 3000000 -probesize 3000000` to extract stream metadata.
2. WHEN `ffprobe` completes successfully, THE SubtitleExtractor SHALL return an `audioTracks` array and a `subtitleTracks` array, each containing objects with `index`, `language`, `title`, `codec`, and `isDefault` fields.
3. IF `ffprobe` is unavailable or exits with a non-zero code, THEN THE SubtitleExtractor SHALL return empty arrays for both `audioTracks` and `subtitleTracks` without throwing an exception.
4. THE SubtitleExtractor SHALL expose track metadata via the `torrent:track-info` IPC channel, accepting `{ sessionId, streamId }` and returning `{ audioTracks[], subtitleTracks[] }`.
5. WHEN track metadata has been extracted for a stream session, THE SubtitleExtractor SHALL cache the result for the lifetime of that stream session to avoid repeated `ffprobe` invocations.

---

### Requirement 3: Subtitle Extraction and Deduplication

**User Story:** As a viewer, I want subtitles to appear exactly once without duplicates, and I want to be able to select any subtitle track embedded in the MKV file, so that I can read subtitles in my preferred language.

#### Acceptance Criteria

1. WHEN a subtitle track is requested via `torrent:extract-subtitle`, THE SubtitleExtractor SHALL run `ffmpeg` with `-map 0:{trackIndex} -f webvtt pipe:1` and return the output as a `data:text/vtt;base64,...` URL.
2. IF the primary ffmpeg subtitle extraction exits with a non-zero code, THEN THE SubtitleExtractor SHALL attempt an ASS→SRT→VTT fallback conversion before returning `{ success: false, error }`.
3. WHEN the SubtitleManager deduplicates tracks, THE SubtitleManager SHALL ensure the filtered output length is less than or equal to the input length.
4. WHEN the SubtitleManager deduplicates tracks, THE SubtitleManager SHALL ensure no two tracks in the filtered output share the same `(normalizeLanguage(lang), normalizeLabel(label))` key.
5. WHEN an MKV file has native subtitle tracks exposed by the browser's `<video>` element, THE SubtitleManager SHALL activate those tracks via `video.textTracks[id].mode = 'showing'` and SHALL NOT inject a duplicate `<track>` element for the same language.
6. WHEN an external subtitle track (from the API) has no matching native track, THE SubtitleManager SHALL inject it as a `<track>` element.
7. THE SubtitleExtractor SHALL expose subtitle extraction via the `torrent:extract-subtitle` IPC channel, accepting `{ sessionId, streamId, trackIndex }` and returning a `SubtitleExtractResult`.

---

### Requirement 4: Multi-Track Audio Selection

**User Story:** As a viewer, I want to switch between audio tracks (e.g., Japanese and English dub) in an MKV torrent stream, so that I can watch in my preferred language without restarting the stream.

#### Acceptance Criteria

1. WHEN the AudioTrackSelector is rendered, THE AudioTrackSelector SHALL display all audio tracks returned by `torrent:track-info` with their language and title.
2. WHEN a user selects an audio track with index N, THE AudioTrackSelector SHALL notify the VideoPlayer via `onAudioTrackChange(N)`.
3. WHEN the VideoPlayer receives an audio track change for index N, THE VideoPlayer SHALL reload the stream using a URL with the `?audio=N` query parameter appended.
4. WHEN the RangeStreamServer receives a request with `?audio=N`, THE RangeStreamServer SHALL pipe the torrent file through an ffmpeg remux that selects video stream `0:v:0` and audio stream `0:N` using codec-copy (`-c:v copy -c:a copy`).
5. WHEN an audio track switch causes a video decode error, THE VideoPlayer SHALL revert to the previously active audio track index.
6. THE TorrentStreamBridge SHALL expose audio track switching via the `torrent:stream-audio-switch` IPC channel, accepting `{ streamId, audioTrackIndex }` and returning `{ success, newUrl }`.

---

### Requirement 5: IPC Channel Extensions

**User Story:** As a developer, I want well-defined IPC channels for the new streaming capabilities, so that the renderer and main process can communicate reliably about stream state, track selection, and subtitle extraction.

#### Acceptance Criteria

1. THE ipc-torrent module SHALL register a `torrent:stream-v2` channel that accepts `{ sessionId, fileIndex, audioTrackIndex?, startTime? }` and returns a `StreamResult` containing `{ success, url, streamId, audioTracks[], subtitleTracks[] }`.
2. THE ipc-torrent module SHALL preserve the existing `torrent:stream` channel for backward compatibility with non-MKV sources.
3. THE ipc-torrent module SHALL register a `torrent:extract-subtitle` channel that accepts `{ sessionId, streamId, trackIndex }` and returns a `SubtitleExtractResult`.
4. THE ipc-torrent module SHALL register a `torrent:track-info` channel that accepts `{ sessionId, streamId }` and returns `{ audioTracks[], subtitleTracks[] }`.
5. THE ipc-torrent module SHALL register a `torrent:stream-audio-switch` channel that accepts `{ streamId, audioTrackIndex }` and returns `{ success, newUrl }`.

---

### Requirement 6: Torrent Status Panel

**User Story:** As a viewer, I want a compact, non-intrusive status panel that shows me the torrent download progress while I watch, so that I can monitor buffering and download state without it blocking the content.

#### Acceptance Criteria

1. THE TorrentStatusPanel SHALL be positioned `fixed top-4 left-1/2 -translate-x-1/2` (center-top) with a maximum width of `min(480px, 90vw)`.
2. THE TorrentStatusPanel SHALL use a glass aesthetic: `bg-background/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl`.
3. WHEN in collapsed state, THE TorrentStatusPanel SHALL display download speed, upload speed, a progress bar, progress percentage, and ETA in a single row of height `48px`.
4. WHEN the user clicks the expand toggle, THE TorrentStatusPanel SHALL expand to show peer count, seeder count, leecher count, storage usage, buffering status, a Repair button, and a Stop button.
5. WHEN the panel transitions between collapsed and expanded states, THE TorrentStatusPanel SHALL animate the height change using `transition-all duration-300 ease-out`.
6. WHEN `isFullscreen` is `true`, THE TorrentStatusPanel SHALL not render (return null).
7. WHEN `stats.done` and `stats.verified` are both `true` for more than 5 seconds, THE TorrentStatusPanel SHALL auto-hide.
8. WHEN `sessionId` is empty or null, THE TorrentStatusPanel SHALL not render.

---

### Requirement 7: Buffering Status Derivation

**User Story:** As a viewer, I want the status panel to show me an accurate, human-readable description of the current download/buffering state, so that I understand why playback may be paused or slow.

#### Acceptance Criteria

1. WHEN `stats` is null, THE BufferingStatusDeriver SHALL return the status `'connecting'`.
2. WHEN `stats.availability` is `'no_peers'`, THE BufferingStatusDeriver SHALL return the status `'no_peers'`.
3. WHEN `stats.done` and `stats.verified` are both `true`, THE BufferingStatusDeriver SHALL return the status `'complete'`.
4. WHEN `isBuffering` is `true` and `stats.downloadSpeed` is greater than 0, THE BufferingStatusDeriver SHALL return the status `'buffering_downloading'`.
5. WHEN `isBuffering` is `true` and `stats.downloadSpeed` is 0, THE BufferingStatusDeriver SHALL return the status `'buffering_stalled'`.
6. WHEN `stats.stalledForMs` exceeds 45000 milliseconds, THE BufferingStatusDeriver SHALL return the status `'stalled'`.
7. WHEN `stats.repair` is non-null and the repair occurred within the last 120 seconds, THE BufferingStatusDeriver SHALL return the status `'repairing'`.
8. THE BufferingStatusDeriver SHALL return one of the eight defined status values (`'connecting'`, `'downloading'`, `'buffering_downloading'`, `'buffering_stalled'`, `'stalled'`, `'repairing'`, `'no_peers'`, `'complete'`) for any valid combination of `isBuffering` and `stats` inputs.

---

### Requirement 8: ETA Formatting

**User Story:** As a viewer, I want the ETA displayed in the status panel to be human-readable (e.g., "2m 14s", "1h 5m"), so that I can quickly understand how long until the download completes.

#### Acceptance Criteria

1. WHEN `etaSeconds` is `null`, THE EtaFormatter SHALL return `'—'`.
2. WHEN `etaSeconds` is `0`, THE EtaFormatter SHALL return `'Done'`.
3. WHEN `etaSeconds` is greater than 0 and less than 60, THE EtaFormatter SHALL return a string in the format `'{N}s'`.
4. WHEN `etaSeconds` is at least 60 and less than 3600, THE EtaFormatter SHALL return a string in the format `'{M}m {S}s'`.
5. WHEN `etaSeconds` is at least 3600, THE EtaFormatter SHALL return a string in the format `'{H}h {M}m'`.
6. FOR ALL non-negative finite integers, THE EtaFormatter SHALL return a non-empty string.

---

### Requirement 9: Fullscreen Mode — Electron Desktop

**User Story:** As a desktop viewer, I want the video player to enter true fullscreen reliably on Windows, macOS, and Linux, so that I can watch without window chrome or aspect ratio distortion.

#### Acceptance Criteria

1. WHEN the FullscreenController is running in an Electron desktop context, THE FullscreenController SHALL call `window.tatakaiRuntime.setWindowFullscreen(true)` via IPC instead of `document.requestFullscreen()`.
2. WHEN `setWindowFullscreen(true)` succeeds, THE FullscreenController SHALL set the `data-fullscreen="true"` attribute on the video container element.
3. WHEN `setWindowFullscreen(false)` succeeds, THE FullscreenController SHALL remove the `data-fullscreen` attribute from the video container element.
4. WHEN the Electron fullscreen IPC call returns `{ success: false }`, THE FullscreenController SHALL fall back to calling `containerRef.current.requestFullscreen()`.
5. THE ipc-system module SHALL register a `window:set-fullscreen` channel that calls `BrowserWindow.setFullScreen(Boolean(value))` and returns `{ success, isFullscreen }`.
6. THE ipc-system module SHALL register a `window:is-fullscreen` channel that returns `{ isFullscreen: boolean }`.
7. WHEN the BrowserWindow emits `enter-full-screen` or `leave-full-screen`, THE main process SHALL send a `window:fullscreen-changed` event to the renderer so the FullscreenController can sync its state.

---

### Requirement 10: Fullscreen Mode — Web / Cross-Platform Fallback

**User Story:** As a web or mobile viewer, I want the video player to enter fullscreen using the standard DOM API with cross-browser vendor prefix support, so that fullscreen works regardless of platform.

#### Acceptance Criteria

1. WHEN the FullscreenController is running in a non-Electron context, THE FullscreenController SHALL call `containerRef.current.requestFullscreen()` or `containerRef.current.webkitRequestFullscreen()` to enter fullscreen.
2. WHEN exiting fullscreen in a non-Electron context, THE FullscreenController SHALL call `document.exitFullscreen()` or `document.webkitExitFullscreen()`.
3. WHEN the `fullscreenchange` DOM event fires, THE FullscreenController SHALL update its `isFullscreen` state to reflect the current fullscreen status.

---

### Requirement 11: Fullscreen Layout — Aspect Ratio and Overlays

**User Story:** As a viewer, I want the video to fill the screen with correct aspect ratio and for subtitles and controls to remain correctly positioned in fullscreen, so that the viewing experience is not degraded.

#### Acceptance Criteria

1. WHEN the video container has `data-fullscreen="true"` or matches `:fullscreen`, THE VideoContainer CSS SHALL apply `position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: 9999; background: #000`.
2. WHEN in fullscreen, THE video element SHALL use `object-fit: contain` to preserve aspect ratio with letterboxing.
3. WHEN in fullscreen, THE subtitle overlay SHALL be positioned `position: absolute; bottom: calc(var(--controls-height) + 16px); left: 50%; transform: translateX(-50%); width: 80%; z-index: 10000`.
4. WHEN in fullscreen, THE controls overlay SHALL be positioned `position: absolute; bottom: 0; left: 0; right: 0; z-index: 10001`.
5. WHEN the controls auto-hide after 3 seconds of inactivity, THE VideoContainer SHALL set `--controls-height` to `0px` so the subtitle overlay slides down smoothly.
6. WHEN the controls become visible again, THE VideoContainer SHALL restore `--controls-height` to `64px`.
