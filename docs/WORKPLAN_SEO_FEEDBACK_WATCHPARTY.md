# Work plan — feedback/Discord, community cache, SEO/sitemap, deep-link, watch-party

Status legend: ⬜ todo · 🟡 in progress · ✅ done · 🧪 build-verified

## 1. Watch party — cloudflared ENOENT + auto-download
- Root cause: `build.files` packs `resources/**/*` into `app.asar`; `asarUnpack` doesn't
  cover cloudflared, and `extraResources` doesn't copy it to `<resources>/bin`. The
  resolver's `app.getAppPath()` candidate resolves an in-asar path that `fs.existsSync`
  accepts but `spawn` can't run.
- ✅ Exclude `resources/bin/**` from asar (`files` negation) + add `extraResources`
  copy of `resources/bin` → `<resources>/bin`.
- ✅ Harden `findBinary()`: reject any candidate whose path contains `app.asar`
  (never spawnable); prefer `process.resourcesPath/bin`.
- ✅ `ensureBinary()` already auto-downloads to userData/bin on miss — verify it triggers
  as the fallback when the bundled/installed copy is absent.

## 2. Feedback → Discord webhook
- Root cause: frontend POSTs `/api/v3/webhooks/discord` which doesn't exist → 404 → swallowed.
- ✅ Backend router `tatakaiapi/src/routes/webhooks.ts` mounted at `/api/v3/webhooks`,
  `POST /discord` maps `channel → DISCORD_WEBHOOK_*` and forwards embed server-side.
- ✅ Declare `DISCORD_WEBHOOK_{USER_CREATED,ERROR_LOGS,COMMENT,REVIEW_POPUP,STATUS}` in
  `tatakaiapi/src/config/env.ts` + `tatakaiapi/.env`.
- ✅ Wire `SuggestionsPage` submit to `notify*` (it never notified).
- ✅ Fix error-logger gating so prod webhooks fire.

## 3. Community — caching + optimistic updates
- ⬜ QueryClient defaults (staleTime/gcTime) in main.tsx.
- ⬜ Optimistic post create + comment create (show immediately).
- ⬜ Image loading fast-path.

## 4. Deep-link "Open in app"
- ⬜ Button on watch (`/watch/:episodeId`) + anime info (`/anime/:animeId`) firing
  `tatakai://<path>`; desktop already routes it via `navigate`.

## 5. SEO / sitemap / meta (host = own VPS, `npm run preview`)
- ⬜ Vite `configurePreviewServer` plugin: per-entity meta injection (reuse
  scripts/seo/{routes,inject}.mjs) + serve `/sitemap*.xml` + `/robots.txt`.
- ⬜ Backend sitemap: enumerate Tiger DB `Media` (anime+manga) + Supabase profiles/
  tierlists/playlists → sitemap index + paginated child sitemaps.
- ⬜ Ensure `<Seo>` present on all key pages (anime ✅, manga ✅, profile ✅ — audit rest).

## 6. General optimization
- ⬜ After the above: bundle/query/image polish.

Constraint: **do NOT push** anything (tatakaiapi included). Build-verify with `npx vite build --minify false`.
