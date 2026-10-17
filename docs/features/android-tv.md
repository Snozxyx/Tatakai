# Android / Google TV

Tatakai uses an Android `device` flavor dimension. Mobile keeps `app.tatakai.me`; TV uses `app.tatakai.me.tv` and Android 9 / API 28 or newer. Native flavor detection selects the TV interface before React renders. Desktop and mobile retain their existing layouts.

## Local commands

- `npm run tv:dev` previews the TV interface in a browser.
- `npm run tv:build` builds web assets, synchronizes Capacitor, and assembles TV release.
- `npm run mobile:build` assembles the mobile release.
- In `android`, use `gradlew.bat assembleTvDebug assembleTvRelease assembleMobileDebug assembleMobileRelease` on Windows; `./gradlew` elsewhere.

Flavor APKs are under `android/app/build/outputs/apk/{tv,mobile}/{debug,release}/`. Release CI preserves the mobile artifact name and adds a distinct Android TV artifact. The native updater rejects a different application ID; the client selects the matching flavor artifact.

## Remote interface

Home, search, anime details, playback/source selection, IPTV, manga/novel discovery and chapters, extensions, library, saved items, downloads, settings and community have TV surfaces. Profiles reuse the same profile implementation as desktop/mobile, including customization and privacy. Remaining shared routes receive TV adaptation rather than a separate feature implementation.

Arrow keys move directional focus; Select activates; Back dismisses the current popup or returns to the previous route. Modal, menu and select scopes constrain focus. Route focus and scroll positions are remembered. Readers are experimental and use existing reading progress/offline storage.

Discovery search, books, extensions and community load more on scroll with an explicit remote-accessible fallback control. Media cards reveal a delayed glass preview with factual metadata and synopsis. The hero uses AniList-backed catalogue metadata plus existing ani.zip clear-logo mappings, falling back to readable title text. Muted previews reuse the existing preview resolver and player lifecycle. They fade in only after video actually plays, preserving artwork on unavailable sources.

Settings → TV appearance changes the HTTPS video wallpaper, enables/disables motion, and restores the supplied default. The wallpaper uses a dark overlay and warm rose/ink palette. Reduced-motion preferences suppress background video and trailers. All TV CSS is scoped to `.tatakai-tv` / TV components.

Public writing opens a contextual phone QR link. Replies include post/comment identity and preserve authentication return context. TV messaging routes remain unavailable.

## Shared media and IPTV

The existing NativePlayer bridge dispatches TV playback to TvPlayerActivity, sharing media-source/lifecycle logic with mobile. TV adds MediaSession, remote menus and bounded adjacent-channel zapping. SurfaceView and supported device decoding/audio capabilities determine HDR and passthrough; seamless refresh matching is default, disruptive mode changes are opt-in.

IPTV supports M3U channel lists (separate from HLS media playlists), Xtream live/VOD/series, header directives and relative links, favorites, cached Now/Next schedules and incremental XMLTV worker parsing. Imports retain successful cache on failure/cancellation. Dexie v8 appends IPTV tables. Sensitive provider/IPTV data uses Android Keystore-backed encryption; browser preview storage is not equivalent to device secure storage.

## Pairing backend

The local `tatakaiapi` service contains `/api/v3/tv/pairing` create, lookup, approve, poll, acknowledge and cancel handlers. `supabase/migrations/20261016000001_tv_pairing.sql` prepares service-only expiring state and atomic attempt limits. The service-only migration was reviewed, explicitly approved, and installed on Server B on 17 October 2026. API releases include the pairing handlers and periodic expiry cleanup. No Edge Functions are introduced.

The API requires a verified companion account and issues an independent, single-use TV login token. RSA-OAEP / AES-GCM envelopes bind transfer to the originating TV. PIN lookup never retrieves credentials. Approval checks the matching phrase and selected categories. Acknowledgement clears the payload; retries remain idempotent. Extensions reinstall through trusted normal installers. Existing account sync hydrates history/library.

## Validation and acceptance boundaries

Focused parser, geometry, encryption, migration/cache and existing media/update regressions run with Bun. Backend tests exercise authorization, concurrent approval, expiry/guess limits and replay/acknowledgement. The SQL checker validates migration syntax, not production execution.

Physical acceptance remains necessary on Android/Google TV: full remote-only journeys, voice permissions/search, launcher Watch Next/preview behavior and dismissal, offline playback, authenticated streams and child resources, HDR10/Dolby Vision, HDMI route changes/passthrough and refresh switching. Browser screenshots and Gradle compilation cannot verify these hardware capabilities. Fire TV certification is outside scope.

## TV presentation

Home and anime details share a cinematic artwork billboard with title logos when available, readable metadata, two primary actions and an optional muted preview. The top navigation includes Community; IPTV and its guide are available under My Tatakai with an Experimental label. Cards retain real unified-card metadata, including genres/tags and Tatakai views.

Profile shelves, history, overview widgets and vault links participate in directional focus. TV tab selection survives opening a title and returning, with card focus restored. Long analytics sections can be scrolled with Up/Down when the next action is offscreen. These adaptations are scoped to TV.

## Native TV player

TV playback uses a custom native overlay on the shared Media3 SurfaceView. The bottom bar provides a seek timeline, transport controls, Servers, Audio, Subtitles, Episodes/Channels and Settings. A high-contrast side drawer traps remote focus and returns it to the opening button on Back. Controls hide after four seconds during playback and stay visible while paused, buffering or editing a drawer.

When controls are hidden, Up reveals server/settings controls, Down reveals Episodes, Select toggles play/pause, and Left/Right seek progressively. With controls visible, D-Pad moves between actions; Left/Right on the timeline seeks. Back closes a nested settings page, drawer, or controls before leaving playback. Non-seekable streams disable timeline and seek actions.

Server menus carry stable source identities rather than relying on discovery order. Selection returns through the existing source-resolution/proxy/torrent path, retaining position and pause state. Audio/subtitle and supported video-quality tracks come from Media3. Playback speed, picture sizing and subtitle size are remembered on the TV. Offline items without alternate sources do not offer an empty source handoff.

TV-only Android instrumentation lives under `android/app/src/androidTestTv`. It exercises actual D-Pad drawer navigation and settings changes. The test APK also includes a developer preview runner for the supplied wallpaper video; neither its sample source labels nor its runner ship in the application APK.

## TV appearance, catalogue and transport fixes

TV settings use dedicated wallpaper, playback, remote/accessibility, accounts, downloads/sources and device sections. The generic mobile Preferences panels are not mounted on TV. Six bundled video wallpapers have still-image fallbacks; selected scenes color the glass palette without repeated video-frame readback. Custom wallpapers accept HTTPS URLs. Reduced motion uses still artwork.

Home, Shows and Movies browse the paginated catalogue feed rather than an empty search. Pagination responds to scrolling, intersection and D-Pad focus, retains focus when rows append, bounds empty-page retries and stops repeated pages. A manual Load more action remains available for recovery.

Native playback carries an explicit HLS/DASH MIME hint through opaque loopback proxy URLs, including IPTV queue transitions. This prevents Media3 treating extensionless HLS playlists as progressive files. TV instrumentation includes a local HLS fixture with an opaque playlist path, alongside remote drawer/source-switch tests.

Android WebView instrumentation verifies that focusing the loading control appends catalogue cards, the bundled video reaches a playable ready state, and the settings route exposes all six presets. Native HLS instrumentation reaches Media3 READY using the extensionless local endpoint. New Android Back callbacks close one drawer level at a time; legacy TV remotes retain key-event handling.

## Wallpaper resource budget

TV uses dedicated H.264 Baseline derivatives capped at 1280×720, 12 fps, with no audio. The six files total about 6.95 MB instead of 72.23 MB for their shared originals (about 90% smaller). Desktop/mobile originals remain untouched. `node scripts/optimize-tv-wallpapers.mjs` regenerates the TV files and their provenance/size manifest; ffmpeg is required.

Palette tokens now come from the selected scene, with no repeated canvas frame readback. The wallpaper video pauses, clears its source/buffer and unmounts when the app/document is inactive, a title preview plays, or a watch/IPTV/reader route is open. The corresponding still poster remains visible. Existing wallpaper choices migrate to the lightweight TV asset. Custom HTTPS videos retain their supplied encoding and can use more resources than bundled scenes.

Local verification (17 October 2026): 55 focused Bun tests passed; targeted semantic checks passed for all 45 TV/player files. Android instrumentation passed all three journeys: remote player settings/source switching, opaque loopback HLS loading, and WebView pagination/wallpaper/settings with wallpaper teardown on a watch route. TV/mobile debug and release variants compile locally. Full-project type checking still reports existing shared Supabase/profile/type errors; the full localization check still reports the existing Spanish migration interpolation mismatch. Hardware HDR/passthrough acceptance remains separate.

TV horizontal scrollbars are hidden with both standard scrollbar styling and Android WebView's horizontal WebKit scrollbar rule. Scrollable overflow and remote focus scrolling remain enabled; profile tabs and shared horizontally scrolling TV surfaces are included.
