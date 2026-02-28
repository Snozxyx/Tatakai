# Changelog

All notable changes to Tatakai are documented here.

---

## [4.1.18] - 2026-02-28

### Added
- **High Quality Covers** — Anime info page fetches full-size cover art via Jikan (MAL) API (`large_image_url`, WebP preferred)
- **Achievement System** — 12 rank-tier achievements: Filler Watcher → Genin → Chunin → Week Warrior → Plus Ultra → Pro Hero → Soul Reaper → Bankai → Survey Corps → Month Legend → Demon Slayer → Hashira
- **Admin Achievement Manager** — Grant and revoke achievements manually per-user with optional notes; shows `auto` vs `admin` badge
- **`fetchJikanCover` utility** — Async helper that queries Jikan API and proxies the highest quality cover

### Fixed
- **Profile Rank** — Manual achievement grants now correctly reflect in rank badge and animated name color
- **Comment Textarea Border** — Fixed purple focus ring (changed from `ring-ring` to `ring-primary/50`)
- **Comments Rank Effects** — Animated rank name styles now render correctly for commenters

### Changed
- **Anime Page Comments** — Now uses the unified `EpisodeComments` component with anime title + episode context pill
- **Card Images** — All anime grid cards upgraded from `cover/medium/` to `cover/large/` on AniList CDN

---

## [4.1.17] - 2026-02-20

### Added
- Stability overhaul and developer ultra mode

---

## [4.1.16] - 2026-02-18

### Fixed
- Stability overhaul and developer ultra mode improvements

---

## [4.1.15] - 2026-02-15

### Fixed
- Electron black screen on launch
- Mobile performance optimizations

---

## [4.1.14] - 2026-02-10

### Fixed
- Main process errors
- Version bump

---

## [4.1.13] - 2026-02-05

### Changed
- Version bump and minor fixes

---

## [4.1.12] - 2026-02-01

### Added
- Download system migrated to database-driven approach
- Admin release manager
- Direct Windows/macOS/Linux artifact links
- Discord banner integration

---

## [4.0.0] - 2026-01-26

### Added
- Social Marketplace: contributor profiles and clickable usernames
- Custom Playback Speed: 0.1x to 10.0x
- Transparency: view pending marketplace items immediately

### Fixed
- Global Scraper Overhaul: fixed 404/500 errors on Desidubanime and Aniworld
- Primary Server Fix: restored HD-1 and HD-2 via optimized direct API access
- Stability: increased fetch timeouts and improved HLS referer handling

---

## [2.0.0] - 2026-01-08

### Added
- Upcoming anime section from Jikan API
- Changelog section in settings
- Fixed Vercel routing for direct URL access
- Enhanced privacy settings for watchlist and history

---

## [1.9.0] - 2026-01-03

### Added
- Playlists feature
- Tier lists with sharing
- Social links to profiles
- Public profile support with privacy controls

---

## [1.8.0] - 2026-01-02

### Added
- Admin dashboard
- Enhanced video player settings
- MyAnimeList and AniList integrations

---

## [1.7.0] - 2025-12-31

### Added
- Initial release with core features
- Multi-theme support
- Watch history tracking
- Watchlist management
