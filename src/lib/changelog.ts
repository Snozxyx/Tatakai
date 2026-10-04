/**
 * Hardcoded release changelog surfaced in Settings → Changelog.
 *
 * Extracted from the old `SettingsPage` (`FALLBACK_CHANGELOG`) so the settings
 * modal's `ChangelogPanel` can consume it without dragging in the whole page.
 * Newest release first; `changes[0]` renders as "Latest".
 */

export interface ChangelogRelease {
  version: string;
  date: string;
  changes: string[];
}

export const CHANGELOG: ChangelogRelease[] = [
  {
    version: '6.0.4',
    date: '2026-10-04',
    changes: [
      'Mobile App: Tatakai can now be downloaded for Android — a signed APK is published with the desktop installers on GitHub Releases and installs straight from the release page, and the download page has its own Android button',
      'iOS App: iOS builds are now produced in CI as well, uploaded as an artifact — it ships unsigned, since there is no Apple signing identity',
      'Tablet Layout: On tablet-sized screens the app now uses the same floating sidebar as the web version instead of the bottom navigation bar — phones keep the bottom nav',
      'macOS Fix: The macOS desktop build is now ad-hoc signed in CI, so macOS no longer reports the download as damaged or from an unverified developer',
      'Mobile Download Stats: Admin analytics now splits downloads into mobile and desktop, and the landing page shows mobile downloads separately',
      'Repository Cleanup: Removed the vendored hentai database fork and other unreferenced scaffolding, including dead scratch scripts, leftover build output, and a duplicate lockfile',
      'Profile Banner Fix: The landscape banner feed no longer calls the external image API directly from the browser, which was failing with a 403 and a CORS error — those requests now go through the app backend instead',
      'Mobile Builds in CI: The release workflow now builds and uploads the Android APK and the iOS archive alongside the desktop app',
    ],
  },
  {
    version: '6.0.3',
    date: '2026-09-29',
    changes: [
      '6-Digit Email Codes: Signup verification, password reset, and email changes now use a 6-digit code you type in the app instead of an email link — codes never redirect, so they no longer expire early, get pre-fetched by mail scanners, or fail with "email link is invalid or has expired"',
      'Secure Email Change: Changing your account email now confirms a code sent to your current inbox first, then a code sent to the new one, before switching — your stored address stays masked until you reveal it',
      'Password Reset Rebuilt: A single guided flow — enter email, type the 6-digit code, set a new password — all on one page, with no more expiring reset links',
      'Branded Auth Emails: New dark, Tatakai-branded templates for signup, password recovery, and email change that show your 6-digit code front and centre',
      'Status Page Fixes: The Cloudflare proxy node no longer shows falsely offline, and the Image Delivery check no longer throws transient false alarms',
      'Desktop System Info: Settings now shows the running app version and Electron version',
    ],
  },
  {
    version: '6.0.2',
    date: '2026-09-28',
    changes: [
      'Packaged Desktop Fix: Resolved a black screen on launch in shipped desktop builds — release binaries now embed the correct client configuration at build time instead of booting with an empty key',
      'Graceful Config Errors: A missing configuration key now shows a readable error screen instead of a silent black window',
      'Download Page: The primary download now prefers the Windows installer over the portable build, and all version numbers come straight from GitHub Releases',
    ],
  },
  {
    version: '6.0.1',
    date: '2026-09-28',
    changes: [
      'Sign-In & Data Loading Fix: Resolved a site-wide authentication error that returned "401 Unauthorized" on every request — the community feed, profiles, tier lists, playlists, watch rooms, and realtime updates now load correctly for both guests and signed-in users',
      'Branding: The app favicon now uses the rounded Tatakai logo mark',
    ],
  },
  {
    version: '6.0.0',
    date: '2026-09-27',
    changes: [
      'V6 Platform Overhaul: A ground-up redesign across streaming, manga, community, desktop, and the extension system — the biggest release since launch',
      'Extension Ecosystem: Most advanced features are now modular extensions — streaming/manga sources, isolated custom read/watch verticals, themes, analytics, background services, platform modules, and full React pages/UI slots, with multiple extensions running at once by priority',
      'Manga Reader Rebuild: New comick-style reader with per-device display settings and keybinds, reliable progress persistence, and dual comment threads (global + per-chapter)',
      'Manga Offline Downloads: Download whole series for offline reading with a dedicated Offline Library, main-process downloading that preserves source headers, and offline rows in the Dynamic Island',
      'Continue Watching, Netflix-style: Cross-device resume, richer AnimeInfo, a release calendar, smarter list import, and automatic + manual downloads that stay in sync',
      'Watch2Together Rebuild: Host-streamed sessions over a secure tunnel, hashed-password protected rooms, and a redesigned ambient watch room',
      'Community Feed Platform: /community rebuilt feed-first with posts, polls, and rich embeds',
      'Recommendations Engine: New in-house hybrid recommender backed by a collaborative-filtering model, replacing the previous approach',
      'Ranks & Badges: Unified Mitsu rank with per-rank animated name effects (weighted across anime + manga activity) and collectible Chikra badges with rarity tiers',
      'Desktop Offline Resilience: The app now degrades gracefully offline — tri-state backend status, an offline banner, offline-safe routes — plus lower memory use via a disk-cache cap and deferred runtime services',
      'Extension Result Cache: Anime servers and manga chapters you have visited before appear instantly via a persistent, self-refreshing cache (toggleable)',
      'Admin & Moderation Overhaul: Rebuilt admin/mod tooling with automod, Turnstile challenges, a news surface, and broad analytics instrumentation',
      'Playlists Upgrade: Visual refresh with a single unified comment system across the app and per-item media formatting',
      'Integrations: AniList/MAL account linking now uses secure server-side OAuth, with deep-link sign-in on desktop',
      'Positioning: Tatakai is presented as an extension-based otaku community and companion app',
    ],
  },
  {
    version: '5.2.0',
    date: '2026-04-20',
    changes: [
      'Source Host Priority: Nebula/Goku stream selection now prefers vod.netmagcdn.com:2228 before watching.onl variants',
      'Preview Playback Stability: Fixed anime card/trending preview edge cases for non-HLS sources and retry behavior',
      'Homepage Startup Optimization: Deferred non-critical sections and startup listeners to improve first paint responsiveness',
      'Proxy Reliability Upgrade: Added bounded retries, no-repeat proxy attempts, and in-flight dedupe for proxy requests',
      'Subtitle Robustness: Added subtitle normalization-to-VTT and improved fetch fallbacks for desktop and mobile players',
      'Editor Draft Recovery: Added autosave/restore for tierlist and playlist editing with stale draft cleanup',
      'Auth/Session Bootstrap: Added fail-fast timeouts and reduced startup background request pressure',
    ],
  },
  {
    version: '5.0.1',
    date: '2026-04-18',
    changes: [
      'Producer Search Routing: Producer chips now open the dedicated producer search route and the search page loads producer results directly',
      'Tierlist Character Links: Tierlist character cards now prefer MAL numeric IDs for stable character page navigation',
      'Curated Discovery Lanes: Added manual homepage curation tools plus new manga/anime discovery lanes and quick filters',
      'Admin Surface Expansion: Added API health, canonical snapshot, and source validation tools to the admin dashboard',
      'Playback and Proxy Resilience: Improved codec recovery, source blocking, and provider refresh behavior during stream failures',
      'Version Sync: Bumped the package version and aligned the settings changelog with the new release entry',
    ],
  },
  {
    version: '5.0.0',
    date: '2026-04-08',
    changes: [
      'V5 Release Surface: Added hero release messaging across home, settings, and popup entry points for the new generation launch',
      'V4 Announcement Popup Migration: Repurposed the legacy V4 popup into a V5 launch popup with direct link to Settings > Changelog',
      'Mobile Rollout Behavior: While the announcement popup is active, mobile bottom navigation is disabled and hidden to prevent accidental route changes',
      'Motion Prompt Timing: Reduce-motion prompt is deferred for 1 minute during the mobile launch popup window',
      'Manga V5 Overhaul: Added Manga release banner, hero spotlight carousel, trending grid, index showcase, continue-reading rail, and infinite genre sections',
      'Manga Detail Upgrade: Added chapter search, chapter grouping for large catalogs, provider/language filters, and clickable volume-to-chapter navigation',
      'Manga Reader Upgrade: Improved source handling, chapter controls, keyboard shortcuts, and polished reader state persistence flow',
      'Content Safety Controls: Added mature manga visibility controls, warnings, and blur-aware card rendering',
      'Architecture Refresh: Split large pages into modular route folders (base/auth/watch/profile/admin/legal/error) and added AppRoutes composition',
      'Provider Core Upgrade: Added multi-provider aggregation pipeline (Animelok, AnimeKai, Animepahe, Animeya, WatchAW, DesiDub, Toonstream, ToonWorld, Hindi APIs)',
      'Playback Reliability: Added source health scoring, preflight checks, adaptive failover, referer retry fallback, and telemetry storage for stream diagnostics',
      'Integrations: MAL and AniList sync now map titles more reliably and import lists more accurately for anime and manga',
      'Watch2Together: Added reconnect recovery, host transfer controls, synced countdown start, and chat export support',
      'Search and Discovery: Added cleaner anime/character search filters and improved screenshot matching controls',
      'Recommendations: Added explainability cards and user feedback persistence for recommendation quality tuning',
      'Security and Ops: Strengthened auth/proxy handling, hardened headers, and expanded CI quality gates (lint/type/test)',
    ],
  },
  {
    version: '4.1.20',
    date: '2026-03-03',
    changes: [
      'Release Sync: Synchronized version metadata in package files, changelog, and desktop splash screen',
      'Publish Consistency: Finalized v4.1.20 release alignment for tagging and deployment',
    ],
  },
  {
    version: '4.1.19',
    date: '2026-03-03',
    changes: [
      'Production Security: Request signature verification is now production-only with replay protection',
      'Public API Stability: Signature checks are selective so public scraper routes remain accessible',
      'Review Popup Webhook: Review submissions now trigger Discord notifications via secure backend webhook proxy',
      'Security Hardening: Discord webhook URLs remain server-side env vars only and are never exposed in frontend',
      'Version Sync: Updated app version references and desktop splash screen to match release version',
    ],
  },
  {
    version: '4.1.18',
    date: '2026-02-28',
    changes: [
      'High Quality Covers: Anime info page now fetches full-size cover art from Jikan (MAL) API',
      'Achievement System: 12 rank-tier achievements from Filler Watcher to Hashira',
      'Admin: Grant and revoke achievements manually per-user via Admin panel',
      'Profile Rank: Manual achievement grants now reflect in rank badge and name color',
      'Comments: Fixed focus border color on comment textarea',
      'Comments: Rank name animated effects now visible in episode comments',
      'Comments: Added anime title and episode context pill to comments header',
      'Anime Page: Uses unified EpisodeComments component for consistent styling',
      'Card Images: All anime cards upgraded to AniList large CDN resolution',
    ],
  },
  {
    version: '4.0.0',
    date: '2026-01-26',
    changes: [
      'Social Marketplace: Added contributor profiles and clickable usernames',
      'Custom Playback Speed: Set any video speed from 0.1x to 10.0x',
      'Transparency: View your own pending marketplace items immediately',
      'Global Scraper Overhaul: Fixed 404/500 errors on Desidubanime and Aniworld',
      'Primary Server Fix: Restored HD-1 and HD-2 via optimized direct API access',
      'Stability: Increased fetch timeouts and improved HLS referer handling',
    ],
  },
  {
    version: '2.0.0',
    date: '2026-01-08',
    changes: [
      'Added upcoming anime section from Jikan API',
      'Added changelog section in settings',
      'Fixed Vercel routing for direct URL access',
      'Enhanced privacy settings for watchlist and history',
    ],
  },
  {
    version: '1.9.0',
    date: '2026-01-03',
    changes: [
      'Added playlists feature',
      'Added tier lists with sharing',
      'Added social links to profiles',
      'Public profile support with privacy controls',
    ],
  },
  {
    version: '1.8.0',
    date: '2026-01-02',
    changes: [
      'Added admin dashboard',
      'Enhanced video player settings',
      'Added MyAnimeList and AniList integrations',
    ],
  },
  {
    version: '1.7.0',
    date: '2025-12-31',
    changes: [
      'Initial release with core features',
      'Multi-theme support',
      'Watch history tracking',
      'Watchlist management',
    ],
  },
];
