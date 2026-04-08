# Tatakai

<div align="center">
  <img src="https://img.shields.io/badge/React-18.2.0-blue" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.0.0-blue" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-5.x-yellow" alt="Vite" />
  <img src="https://img.shields.io/badge/Tailwind-3.x-blue" alt="Tailwind" />
  <img src="https://img.shields.io/badge/Supabase-2.x-green" alt="Supabase" />
</div>


<div align="center">
  <h3>The Next Generation Anime Streaming Platform</h3>
  <p>Cross-platform (web, desktop & Android (Soon)) — fast, accessible and community-driven.</p>
</div>

## Social
> Discord : https://dsc.gg/tatakai

Disclaimer 
- No other Social Media Handle is availaible right now, If you see then please report us as we only have **discord server** .

## 📸 Preview

> Screenshots below are high-resolution captures from the running app (web/Desktop/PWA). Click any image to view full size.

![Home — Tatakai home page preview](preview/Home.png)
*Home — featured/spotlight anime, trending sections and personalized feed.*

---

![AI Recommendations — personalized suggestions](preview/machinelearn.png)
*AI Recommendations — ML-powered suggestions based on your watching history.*

---

![Community — forums and discussions](preview/Communtiy.png)
*Community — forum threads, comments and social interactions.*

---

![Profile — user settings & playlists](preview/Profile.png)
*Profile — user settings, playlists and watch history.*


## Table of contents
- Features
- Quick start
- Platforms (Web / Desktop / Android)
- Configuration & secrets
- Development & testing
- CI / Release process
- Troubleshooting
- Contributing & governance

---

## Features

This project contains a large feature set focused on discovery, community and cross-platform playback. Key highlights are listed below.

### Community Tab
- Community Server: users can add fan-made video servers (dubs/subtitle sources) which become available to others after moderator verification.
- Tierlist: create and share ranked lists (example: assemble the correct Fate series order).
- Watch2Together: synchronous viewing / watch parties with friends.
- Forum (Reddit-style): threaded discussions and replies.
- Leaderboard: activity / contribution rankings for community engagement.
- Playlists: create public or private playlists (custom ordering supported).
- Follow/Profile System: follow users, inspect profiles and watchlists.

### Integration
- Auto-sync with MyAnimeList and AniList — import/export watchlists and keep progress in sync.

### Dubs (expanded)
- Coverage expanded from ~8 to 13 languages.
- Scraping: ~30 servers and 14 websites are scraped, including major sources (animekai, animelok, animepahe, etc.).
- Newly added dubs: German, French, Polish, Hindi, Telugu, Malayalam, English — and more coming.

### Video Player
- Use your own subtitles (upload/load local subtitle files).
- Default servers serve 1080p (HD) streams where available.
- Core features: adaptive quality, subtitle selection, custom action buttons and background playback support.

### Appearance
- Lite Mode: disable animations and gradients to boost performance on low-end devices.
- Theme options: 25+ selectable themes (light/dark + accent variants).

### Custom Recommendation
- Personalized recommendations powered by an ML algorithm using watch history and engagement signals.

### Search
- Visual search via Trace.moe integration — search by screenshot/image to find corresponding anime.

---
## Upcoming Features
- Mobile Development including IOS and Android **[More Important]**
- More Scrappers of different dubs including arabic,chinese (Mandarin),Thai and other server
- Adding Official Indian Server [No Ads]
- Community Upgrade
- Web ( Ads Removal from the embed server) + Android ( Ads Removal from the embed server)
- Abyss Server Reverse Engineering to remove ads
- Manga Support
- Adding Torrent Support [P2P] [Directly from torrent for more customization]

---

## Quick start (local)
1. Clone and install
```bash
git clone https://github.com/Snozxyx/Tatakai.git
cd Tatakai
npm ci
```

2. Copy env and add keys
```bash
cp .env.example .env
# edit .env with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY etc.
```

3. Run development server
```bash
npm run dev
# open http://localhost:8088
```

4. Run unit/type checks
```bash
npm run lint
npm run type-check
npm run test
```

---

## Platforms
### Web (PWA)
- Built with Vite + React + Tailwind.
- To build production web assets:
```bash
npm run build
npm run preview
```
- PWA support is included; manifest and service worker are in `public/`.

### Desktop (Electron)
- Electron app packaged with `electron-builder`.
- Development: `npm run electron:dev` (runs Vite + Electron)
- Build: `npm run electron:build`
- Auto-update is configured using GitHub Releases and `electron-updater`.

### Android (Capacitor) [Under Development]
- Capacitor is used to create Android project under `android/`.
- Local dev flow:
  1. `npm run build` (produces web assets)
  2. `npm run mobile:sync` or `npm run mobile:dev`
  3. Open/Run in Android Studio or `cd android && ./gradlew assembleRelease`
- Release strategy: Android remains a manual release track for now. Desktop/web CI is automated in GitHub Actions, while Android signing/builds run locally or in a dedicated Android workflow when secrets/cadence are ready.

---

## Configuration & required secrets
- Environment variables (.env / Vercel):
  - VITE_SUPABASE_URL
  - VITE_SUPABASE_ANON_KEY
  - VITE_GA_MEASUREMENT_ID (optional)
  - VITE_DD_CLIENT_TOKEN (optional)
- GitHub Actions secrets (for release CI):
  - GH_PAT (personal access token for publishing desktop installers)
  - ANDROID_KEYSTORE (base64-encoded keystore file)
  - KEYSTORE_PASSWORD
  - KEY_ALIAS
  - KEY_PASSWORD

How to add Android keystore to GitHub Actions (recommended):
1. Base64-encode your `release.keystore`:
```bash
base64 release.keystore | pbcopy  # or redirect to file
```
2. In repo Settings → Secrets → Actions, add `ANDROID_KEYSTORE` and the other key variables.

Security note: Do NOT commit keystore files or secrets to the repository. Use GitHub Secrets or CI artifacts.

---

## CI / Release process (GitHub Actions)
- Workflow: `.github/workflows/build.yml`
- Jobs:
  - quality-gates → runs `lint`, `type-check`, and `test`
  - build-desktop → builds Electron packages and optionally publishes on tag (after quality gates pass)
  - build-android → currently disabled in this workflow (manual Android release track)
  - release → collects desktop artifacts and publishes GitHub Release assets when tagging

Tag-release flow:
1. Create a tag (e.g. `v4.1.0`) and push
2. Actions run quality gates and build desktop installers
3. Release job uploads artifacts and updates the GitHub Release

---

## Development & testing
- Primary scripts (see `package.json`):
  - `npm run dev` — start Vite dev server
  - `npm run build` — production build
  - `npm run preview` — serve production build locally
  - `npm run mobile:dev` / `mobile:sync` — Capacitor workflows
  - `npm run electron:dev` / `electron:build` — Electron workflows

- Tests: `npm run test` executes Bun-based tests under `tests/`.

---

## Troubleshooting (common issues)
- Android Lint failures during `gradlew assembleRelease` — often caused by incorrect manifest entries or missing service classes. Example fix committed: register `AndroidForegroundService` in `android/app/src/main/AndroidManifest.xml`.
- CI secret expression errors — ensure `secrets.*` are referenced directly in workflow `if:` conditions.
- Large binary files (APK, keystore) accidentally committed — remove with `git rm` and add to `.gitignore`; rotate keys if a keystore was exposed.

If you hit a problem not covered here, open an issue with logs and steps-to-reproduce.

---

## Release checklist
1. Bump `package.json` version
2. Create a Git tag `vX.Y.Z`
3. Push tag to origin → GitHub Actions runs release pipeline
4. Verify artifacts in Release and CI logs

---

## Contributing & governance
- Please follow the commit message guidelines and use feature branches.
- Open PRs against `main` or the appropriate release branch.
- Add tests for new features and update documentation.

Code of conduct: Be respectful. Report violations to repo maintainers.

---

## Maintainers
- Primary: Snozxyx (GitHub)
- Secondary : GabhastiGiri (Github)
## License
- MIT

---

## Where to get help
- Open an issue on GitHub
- For security-sensitive issues (exposed keys), email the maintainer directly or open a private security issue

---
  I used the **AI** in this project for more detail <a href="/docs/disclaimerai.md" > Click  Here </a>
  ---
<p align="center">Made with 
❤️ for anime fans — contributions welcome</p>