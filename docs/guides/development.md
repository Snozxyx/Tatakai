# Development Guide

How to set up, run, build, and verify Tatakai locally. Read the
[architecture overview](../architecture/overview.md) first for the big picture.

## Prerequisites

- **Node.js** — note the Electron caveat below re: very new Node majors.
- **npm** — lockfile is `package-lock.json`.
- A Supabase project + env vars for anything that touches the backend.

## Environment files

There are **multiple** env files and they are not interchangeable:

- Repo-root `.env` / `.env.example` — the web/desktop app.
- `.env.web` — web-specific values.
- The **API proxy** has its **own** `.env`. Server secrets (provider keys,
  AniList/MAL OAuth client secret, webhook URLs) belong there — *not* in the root
  `.env`. An `invalid_client` from AniList/MAL almost always means the secret is
  missing from the API's `.env`.

## Install

```bash
npm install
```

`postinstall` runs `scripts/fix-electron-install.cjs`.

> **Electron + very new Node:** some Node majors break Electron's postinstall zip
> extractor (the download itself is fine). If Electron reports it "failed to
> install correctly," the fix is to unzip the cached Electron zip into place and
> write its `path.txt` — see `scripts/fix-electron-install.cjs`.

## Run

| Command | What it does |
| --- | --- |
| `npm run dev` | Web app + the API (v3/toko) together (via `concurrently`). |
| `npm run dev:web` | Just the Vite web dev server. |
| `npm run electron:dev` | Vite + Electron against the dev server. |
| `npm run mobile:dev` | Build + open the Android project (Capacitor). |

## Build

| Command | What it does |
| --- | --- |
| `npm run build` | Production web build (`vite build`). |
| `npm run electron:build` | Electron build + `electron-builder`. |
| `npm run mobile:build` | Capacitor sync + Gradle release. |

> **Production build can OOM at minify.** `npm run build` may die out-of-memory
> during the terser/esbuild minify step on constrained machines. To verify a
> build compiles without fighting the minifier, use:
>
> ```bash
> npx vite build --minify false
> ```
>
> This is the reliable "does it build" check; treat Vite (not `tsc`) as the real
> build gate.

## Verify

| Command | Notes |
| --- | --- |
| `npx vite build --minify false` | The dependable build check (see above). |
| `npm run type-check` | `tsc --noEmit` for app + node configs. **Does not pass clean** — the repo has pre-existing, repo-wide type errors. Grep the output for the files *you* changed rather than expecting zero errors. |
| `npm run lint` | ESLint. |
| `npm test` | `bun test tests`. |
| `npm run check:migrations` | Validates SQL migrations with parsers. **Run it to convergence — it needs two passes.** There is no local Postgres here, so this is the only migration check. |

## Migrations

Migrations are **written, not applied** in this workflow — authoring and applying
are separate steps, and applying is always a separate, explicit action. The
history is **not cleanly replayable** from an empty database, so validate with
`npm run check:migrations` rather than resetting. Details:
[../architecture/backend-and-data.md](../architecture/backend-and-data.md#working-with-migrations).

## Extensions & providers

Provider logic increasingly lives in extensions (e.g. `extension/toko`). Relevant
scripts:

```bash
npm run build:toko      # build the toko extension
npm run dev:toko-api    # build toko + run its api in watch mode
npm run toko:api        # build toko + start its api
```

To build your own extension, start with [../extension/README.md](../extension/README.md).

## Gotchas checklist

- Two id-spaces in `profiles` (`id` vs `user_id`) — mixing them returns no rows,
  not an error.
- Privileged profile writes go through `SECURITY DEFINER` RPCs, not direct
  `UPDATE`s.
- The `mappings` schema isn't exposed to PostgREST; live id mapping falls back to
  stubs.
- Manga/anime ids can collide — classify by `format`, not by chapter/volume count.
- Public assets moved under `public/assets/…`; reference them by served path and
  keep `manifest.json` / `robots.txt` / `sitemap.xml` / `sw.js` at the public root.
