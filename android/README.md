# Tatakai Android (Scaffold)

This repository now contains an **Android app scaffold** under `android/` intended to become a native Tatakai client using the custom HiAnime API and the Supabase proxy edge function.

## What is implemented

- **Android project structure** (Gradle Kotlin DSL) with Jetpack Compose navigation.
- **HiAnime API models** mirroring the API payloads (`HomeData`, `AnimeInfo`, `EpisodeList`, `StreamingData`, etc.).
- **Network layer**
  - `HiAnimeClient` (Retrofit + Gson)
  - `ProxyInterceptor` with retry/backoff and AllOrigins fallback
  - `ResponseUnwrappingInterceptor` to handle response envelopes
- **Proxy helpers** (`ProxyManager`) to build proxied URLs for **video**, **images**, and **subtitles**.
- **ExoPlayer manager** (Media3) that can play HLS/DASH and attach subtitle tracks.
- **Room database schema** for watchlist, watch history, and downloads (entities + DAOs).
- **Screen scaffolds** for the 8 required screens and navigation routes.

## What is NOT implemented yet

This scaffold does **not** yet provide full feature parity with the web app (UI parity, real data binding, auth, downloads/offline, etc.). The screens currently contain placeholders and need ViewModels/state management and real rendering.

## Configuration

Create `android/local.properties` (do not commit it):

```properties
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

A template is provided at `android/local.properties.example`.

## Related proxy function

The repo also includes a Supabase edge function entrypoint at:

- `supabase/functions/rapid-service/index.ts`

This matches the client-side expectation of calling `/functions/v1/rapid-service`.
