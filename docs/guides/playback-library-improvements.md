# Playback and local library tools

These features extend Tatakai's existing desktop and mobile runtimes. Download preferences and debrid credentials stay on the current device.

## Where to find them

- **Offline Library → Auto-download:** select Balanced (1080p), Best quality, or Data saver (720p), then use **Simulate** to inspect scores and rejection reasons. Simulation does not enqueue downloads, advance subscriptions, or add debrid transfers. Existing subscriptions keep their preferences until changed.
- **Settings → App/Mobile → Debrid:** configure Real-Debrid, TorBox, AllDebrid, or Premiumize. Torrent source rows display Cached, Uncached, Unknown, or Check failed where the active provider supports a read-only availability check.
- **Player → Add subtitles:** load SRT, ASS/SSA, or VTT from the device. The player generates VTT locally; ASS originals remain available to compatible rendering paths. Subtitle failures do not fail video playback.
- **Player → External player:** desktop uses the selected installed player, Android presents an installed-player chooser, and iOS supports VLC streaming intents and Open In for local files. Progress is saved before launch. Handoff does not imply episode completion.
- **Settings → About → Export diagnostics:** save a ZIP containing bounded logs, extension versions, recent errors, and available provider health. Credentials and local paths are redacted; collection failures are listed in the archive. Nothing is uploaded automatically.
- **App update settings:** view release notes, the release channel, and staging metadata when supplied by the update feed. Missing staging information is explicitly shown as unavailable.

## Preloading

Folder match review is removed for now, including its automatic scans, candidate editor, and matched-file playback list. Existing downloaded manifests and the established desktop video import/sync workflow remain available. Stored matching metadata and original files are retained.

Next-episode torrent preloading is **off by default**. Enable it in Torrent settings or the Auto-download tab. At 80% playback, Tatakai first looks for the next episode inside the active pack. If needed, an installed torrent-capable provider can resolve a separate release. Only a bounded 20 MiB piece range is selected; current playback retains priority. Source changes cancel preload selections and release owned preload sessions. Existing active sessions are not stopped. Cached pieces remain available for subsequent playback.

Mobile automatic transfers default to Wi-Fi only, with a setting to allow mobile data. Native queued downloads also retain that restriction. Suspended mobile apps do not promise periodic extension/source discovery. iOS does not contain a native torrent engine; debrid-resolved HTTP playback remains available there.

## Runtime interfaces

- `PlaybackCoordinator` owns continuity, cancellation generations, progress throttling, native milliseconds-to-seconds conversion, and completion deduplication. Adapter switching is serialized and releases obsolete loads.
- Desktop `autoDownload.simulate(id, episode?)` and the shared `simulateAutoDownload(ruleId, episode?)` use the same candidate evaluator as execution. `autoDownload.setProfile(id, profile)` changes desktop subscription profiles.
- The shared subtitle core is packaged with Electron and reused for player uploads and downloaded sidecars. Desktop's media-probe extraction and Android's `TatakaiMux.extractSubtitle` expose embedded text tracks. Bitmap tracks require a compatible native/external player; OCR is not included.
- All four debrid clients expose account verification, provider capabilities, availability checks, and resolution. Unknown availability is not treated as uncached, and availability checks do not create transfers. URL caches are account/provider/file-specific, concurrent requests are deduplicated, and signed URL expiry is respected when present.
- Android's `TatakaiMedia` bridge owns network checks and external-player intents. iOS's bridge exposes network checks and supported handoff intents.

## Validation and platform limits

Regression coverage includes source-switch races, native progress units, simulation side effects, match ambiguity, season/numeric-title handling, subtitle formats/encodings, provider failures/cache isolation, bounded preload selection, and diagnostics redaction. Android unit tests also verify that HTTP ranges do not read unverified holes and that seeking does not require earlier pieces to finish.

Browser smoke checks cover simulation, desktop/phone widths, and inspection of the actual exported diagnostics ZIP. Android compilation and unit tests run on Windows. iOS source and configuration are present but need compilation and device verification on a macOS runner before release. External-player support for headers, subtitle arguments, and returned progress depends on the selected player's protocol.

## Seanime comparison used for this refinement

The local Seanime checkout was inspected, specifically `internal/library/autodownloader/autodownloader_helpers.go`, `internal/library/autodownloader/autodownloader.go`, `internal/mediacore/mediacore.go`, `internal/directstream/subtitles.go`, and the web auto-downloader containers.

- **Rule eligibility before scoring:** Tatakai now rejects wrong episode/season candidates before assigning match bonuses. Its existing deterministic provider order and stable ID tie-breaks remain.
- **Subtitle event identity:** VTT deduplication now includes cue settings and exact text, preserving different simultaneous placements while dropping actual duplicate events.
- **Rules and preview as distinct states:** one rule list replaces the duplicated management lists; simulation identifies the series/episode, explains rejected releases, and clears when preferences change.
- **Playback session ownership:** Seanime's coordinator confirms the value of session identity and stale-event rejection. Tatakai's existing generation-based coordinator already supplies these safeguards.

These patterns are independently implemented in Tatakai's TypeScript/JavaScript runtimes. Seanime's Go server and source files were not copied into the app.
