# Shipping Tatakai on sideload & open-source stores (step-by-step)

One page for everything: iOS sideload stores, Android open-source clients, and
F-Droid. GitHub Releases is the single source of truth — every release ships
`Tatakai-v<version>-android.apk` (developer-signed) and
`Tatakai-v<version>-ios-unsigned.ipa` (unsigned). Nothing below re-uploads or
mirrors those files.

> This repo does not use Vercel. The AltStore source works from any static host
> (see step 1) — no Vercel headers or rewrites required.

## Per-release maintainer checklist (do this every version)

1. Bump the version in **all three places** — they must agree or builds and
   store metadata break:
   - `package.json` (`version`)
   - `android/app/build.gradle` (`versionCode`, `versionName`)
   - `ios/App/App.xcodeproj/project.pbxproj` (`MARKETING_VERSION`,
     `CURRENT_PROJECT_VERSION`)
2. Regenerate the AltStore source so version, date, and download URL roll
   forward:
   ```bash
   npm run altstore:generate
   ```
   Commit the updated `public/altstore/apps.json`.
3. Push the tag (`v<version>`). CI builds the APK/IPA, regenerates the source
   with the real IPA byte size, attaches `altstore-apps.json` to the release,
   and writes store instructions into the release notes. Nothing else to do.

## 1. AltStore / SideStore / StikStore (iOS)

All three consume the same source format, so one hosted JSON covers them.

**Host the source file (pick one):**

- **A. Raw GitHub URL (simplest, works with any site host):**
  `https://raw.githubusercontent.com/snozxyx/tatakai/main/public/altstore/apps.json`
  Always tracks the latest committed version. (Tag-pinned variant for a fixed
  version: replace `main` with the tag, e.g. `.../v6.0.7/public/altstore/apps.json`.)
- **B. Your own site:** `public/altstore/apps.json` is copied into the web
  build output, so if your host serves it, the source lives at
  `https://tatakai.me/altstore/apps.json`. The `/download` page links this URL.

**User install steps (put these in release notes / Discord):**

1. Install AltStore (or SideStore / StikStore) and sign in with your Apple ID.
2. Sources tab → **+** → paste the source URL from above.
3. Open the Tatakai source → tap the app → install. The store signs the
   unsigned IPA on-device with the user's Apple ID.
4. Free Apple IDs expire every **7 days** — keep the store's refresh running
   (same Wi-Fi as the computer, or SideStore's WireGuard refresh). Paid
   developer accounts last a year.

## 2. TrollStore (iOS, no refresh needed)

1. Download `Tatakai-v<version>-ios-unsigned.ipa` from GitHub Releases.
2. Open it in TrollStore → install. No Apple ID, no 7-day expiry (requires a
   TrollStore-compatible iOS version).

## 3. Obtainium (Android, recommended)

1. Obtainium → **Add App** → paste `https://github.com/snozxyx/tatakai`.
2. Keep defaults (the APK filter matches `Tatakai-v<version>-android.apk`).
3. One-tap link: `https://apps.obtainium.imranr.dev/redirect?r=obtainium://add/https://github.com/snozxyx/tatakai`
4. The `/download` page links this. First install needs "Install unknown apps"
   allowed for the browser; the Play Protect warning is expected (not a Play
   build).

## 4. Droid-ify / Neo Store (Android)

Both track a GitHub repo's releases directly: add
`https://github.com/snozxyx/tatakai` as a source (Droid-ify → Repositories)
and enable update checks. Once F-Droid lists Tatakai, these clients pick it up
from the official repo automatically.

## 5. F-Droid (Android, NOT yet listed — submission is manual)

Repo-side preparation is done; a maintainer must submit:

1. `fastlane/metadata/android/en-US/` holds the listing (title, descriptions,
   `changelogs/<versionCode>.txt` — add one per release).
2. `fdroid/app.tatakai.me.yml` is the `fdroiddata` recipe. Copy it to
   `metadata/app.tatakai.me.yml` in a fork of
   `https://gitlab.com/fdroid/fdroiddata` (delete the REVIEWER NOTES comment
   first) and open the merge request.
3. Expect review questions on: **Tracking Anti-Feature** (Sentry + Datadog are
   compiled in — declared in the recipe), **build-time secrets** (the web
   bundle needs `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` or the app boots
   to a config-error screen), **Node prebuild** (`npm ci` → `vite build` →
   `cap sync android`, since web assets are gitignored — verify with
   `fdroid build`), and **native deps** (`libtorrent4j`, `ffmpeg-kit`,
   Media3 — versions pinned in `android/app/build.gradle`).
4. Until listed, point users at the APK or Obtainium (sections 3–4).

**Signer rule (tell users once):** F-Droid signs with its own key, so an
F-Droid build can never update over the GitHub APK and vice versa. Pick one
channel per device — switching means reinstalling.

## 6. IzzyOnDroid (Android)

Curated repo with faster approvals than F-Droid. Submission is a metadata MR
to Izzy's repo (maintainer task). Until then, Izzy users install via sections
3–4 — same APK, same key.

## 7. Accrescent (Android, not submitted)

Requires a dedicated signing key + console submission and rejects the current
debug-signed APK. Deliberately not done: that key can never rotate without
breaking updates, so it's a maintainer decision, not a config change.
