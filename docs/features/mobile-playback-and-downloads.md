# Mobile playback and downloads

Android and iOS now have a native `TatakaiDownloads` Capacitor bridge. Native jobs own transfers, playlist discovery, disk files, and durable progress; the WebView submits commands and renders snapshots. The Android foreground service provides a persistent progress notification. iOS uses a background URLSession and forwards its completion handler through AppDelegate.

The native queue exposes enqueue, cancel, retry, snapshot/reconcile, import, remove, and offline playback resolution. Offline HLS packages retain initialization resources, AES-128 keys/IVs, byte ranges, discontinuities, and the selected variant/audio/subtitle group. Downloads exceeding 1,200 segments are preserved. Protected or live playlists return an actionable error. Every required local resource is checked before completion and on library reconciliation. Valid legacy files are copied without removing originals; incomplete imports appear in Downloads with a recovery action.

Playback uses a separate 256 MB temporary cache, 32 MB maximum cached objects, complete writes, and discarded partial files. Requests use six shared foreground slots on Wi-Fi and two on cellular. Android downloads share those slots; iOS pauses offline transfers while playback is active. Data Saver disables speculative playback fetching. HLS complete-resource prefetch follows a 30-second Wi-Fi / 10-second cellular target; byte-range playlists use the player's range buffer instead of speculative full-file reads. Direct-video parallel ranges require validated range responses and a stable validator; unsupported range servers use the ordinary relay. Subtitle appearance/timing, fullscreen, gestures, and playback progress remain in the existing player.

Native offline media and subtitle files are served through `/offline/<folder>/<resource>` on the app's local server. Native transfers always use upstream HTTP URLs and provider headers, independently of that server. Android torrent handling is retained; iOS torrent support and new OpenSubtitles/audio/video processing remain outside this change.

Refreshed poster rules apply only to the native shell. The existing Mobile design selector is also available in Mobile App Settings; Classic restores the original catalog rules. Portrait posters use 2:3 and stable two-line titles, while episode and Continue Watching landscape images retain their aspect ratios. The shared design preference also supports the workspace's separately added extension layouts.

## Verification on this Windows host

- Production Vite build passed.
- Native Android HLS tests cover AES-128, initialization segments, byte ranges, discontinuities, selected default audio, 1,400 segments, protected streams, and invalid resources.
- Android redirect tests exercise a local HTTP server and cross-host provider headers/ranges.
- Isolated Capacitor bridge tests cover upstream source unwrapping, expired proxy tokens, foreground reconciliation, offline subtitle resolution, failed states, and deletion.
- Source-selection unit/integration tests passed.
- Playwright mounts the real grid and settings selector at 320/360/393/430 px, checks Classic persistence, and verifies landscape/tablet/desktop and browser CSS comparisons.
- `21st review` on the new mobile library and refreshed CSS reported no findings.
- Repository-wide TypeScript checking reports 152 errors; no diagnostics were reported for the new native bridge/library files in that run. The earlier baseline comparison reported no added errors; a later full comparison was stopped because it repeated the lengthy repository-wide checks. The earlier subtitle overlap test failure is outside the modified subtitle implementation.

Reproduce: run `npm run build`, `npx cap sync android`, then `android/gradlew.bat :app:assembleDebug :app:testDebugUnitTest`. Run `bun test tests/native-mobile-downloads.test.ts tests/watch/source-selection.unit.test.js tests/watch/source-selection.integration.test.js`. With Vite on 8091, run `node scripts/check-native-mobile-layout.mjs` (override `MOBILE_TEST_URL` for a different port).

## Device validation still required

This host has no connected Android device and no Xcode/macOS toolchain. iOS source has not been compiled or device-tested here. On a Mac, sync iOS and run the existing `mobile:build:ios:unsigned` build or signed Xcode device build. Check header-gated CDN redirects, encrypted/fMP4/byte-range HLS, long episodes, range rejection, expired links, storage exhaustion, cancellation/retry, Wi-Fi/cellular transitions, screen lock, backgrounding, OS termination, relaunch, subtitles, deletion, and airplane-mode playback on both platforms.

Listen for `tatakai-mobile-playback-metric` CustomEvents to collect `source-resolution`, `first-frame`, and `rebuffer` durations. Compare identical sources/networks before and after, including request counts and disk occupancy. The first-frame target is three seconds from a valid source under controlled Wi-Fi conditions; no device timing result or universal speed multiplier is claimed.

iOS background transfers remain subject to OS scheduling. A user force-quit stops background transfer delivery; reopening reconciles tasks and resource state. Apple's background URLSession does not offer the same redirect delegate control as foreground sessions, so authenticated cross-host background redirects need explicit device coverage.
