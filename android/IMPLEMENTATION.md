# Tatakai Android Scaffold - Notes

This folder contains an Android scaffold intended to implement the Tatakai web app feature-set natively.

## Current state (implemented)

- Project builds/config (Compose, Navigation, Retrofit, OkHttp, Media3, Room, WorkManager).
- HiAnime data models.
- API client with proxy routing + retry/fallback.
- Proxy URL builders for video/image/subtitle.
- ExoPlayer manager that supports HLS/DASH and subtitle attachment.
- Room entities/DAOs for watchlist, watch history, downloads.
- Basic navigation + placeholder composables for the 8 screens.

## Remaining work (to reach parity)

- Replace placeholder screens with real UI matching the web design (glassmorphism, sections, lists, etc.).
- Add ViewModels/state management + pagination.
- Implement Supabase Auth in-app.
- Implement progress sync (watch_history) with Supabase.
- Implement a real download/offline system (Media3 DownloadManager or WorkManager-based downloader), plus playback from local cache/files.
- Player UX: quality selector, subtitle selector/customization, skip intro/outro UX, next-episode flow.
- Notifications, PiP UX, background playback, lockscreen controls.

## Proxy edge function naming

The web client and Android scaffold expect `rapid-service` as the edge function name. This repo now includes:

- `supabase/functions/rapid-service/index.ts`

so deployments can provide `/functions/v1/rapid-service`.
