# Tatakai — Security Audit

**Status:** living document · **Last full pass:** 2026-10-24 · **Branch:** `arena/a577baef-tatakai`
**Licence:** MPL-2.0 · **Disclosure policy:** [../../SECURITY.md](../../SECURITY.md)

This is a self-assessment by the Tatakai maintainers, written while hardening
the codebase. It records what was checked, what was found, what was fixed, and —
importantly — **what is still open**. Nothing here is a certification, a pentest
report from a third party, or a claim of completeness.

---

## Contents

| Section | What it covers |
|---|---|
| [A. Scope, method and honesty notes](#a-scope-method-and-honesty-notes) | What was reviewed, how, and the limits of that review |
| [B. System model and trust boundaries](#b-system-model-and-trust-boundaries) | The surfaces an attacker can reach and what each is allowed to do |
| [C. Findings at a glance](#c-findings-at-a-glance) | One table: id, severity, status |
| [D. Fixed findings (evidence)](#d-fixed-findings-evidence) | The bug, the exploit, the change, the regression test |
| [E. Open findings and residual risk](#e-open-findings-and-residual-risk) | What is known and not yet fixed, with the recommended fix |
| [F. Supply chain and dependency posture](#f-supply-chain-and-dependency-posture) | Advisories, the audit gate, bundled binaries, licences |
| [G. Verification](#g-verification) | How to reproduce every claim on this page |

---

## A. Scope, method and honesty notes

### What was reviewed

| Area | Paths |
|---|---|
| Desktop main process | `desktop/main.cjs`, `desktop/window/`, `desktop/security/`, `desktop/services/` |
| Desktop IPC surface | `desktop/preload.cjs`, `desktop/ipc/*.cjs` (188 distinct channels, 241 bridge entries) |
| Extension runtime | `desktop/runtime/extension/`, `desktop/runtime/extension-api-host/`, `.kai` packaging |
| Local network services | `desktop/runtime/home-server/`, `desktop/runtime/proxy/` |
| Web entry points | `cloudflare-worker/`, `scripts/ptero-start.mjs`, `vercel.json`, `supabase/functions/` |
| Database | `supabase/migrations/*.sql` (146 migrations), `supabase/main.sql`, storage buckets |
| Renderer | `src/lib/`, `src/pages/auth/`, `src/components/ui/safe-html.tsx`, deep-link handling |
| Mobile shells | `android/`, `ios/`, `capacitor.config.ts` |
| Build & CI | `package.json` build config, `.github/workflows/`, `scripts/` |

### Method

Read-only source review, plus the checks that can actually be executed in this
environment: type-check, ESLint, the repository's own invariant script, the
`bun test` regression programs, migration lint, XML validation of the Android
resources, and `npm audit` against the lockfile. Each fix below is paired with a
regression test that fails when the fix is reverted — that pairing is the point;
an untested "fixed" is just a claim.

### Honesty notes — read these before quoting the document

1. **No runtime verification was possible on several platforms.** There is no
   Android SDK, no Xcode, and no Windows host in the review environment. Android
   manifest changes are validated as XML and reviewed by hand but **not built**;
   macOS/Windows installer behaviour is **not tested**. Where that matters the
   finding says so explicitly ("fixed in source, unverified at runtime").
2. **Severity is a judgement call, not a CVSS computation.** Ratings reflect
   what an attacker gains *in this application's deployment model* — a
   single-user desktop app, a public web build, and a self-hostable home server —
   not an abstract worst case.
3. **No third-party systems were touched.** No live infrastructure of AniList,
   MyAnimeList, MangaBaka, Cloudflare, Supabase or any scraping target was
   probed. The review is of the code that talks to them.
4. **Findings are not all equal in confidence.** Items marked *inference* are
   based on reading code whose runtime behaviour could not be exercised here.
5. **Line numbers drift.** Findings cite files and symbols rather than line
   numbers.

---

## B. System model and trust boundaries

Tatakai is four runtimes sharing one TypeScript codebase:

```
┌─────────────────────────────── Electron main process ────────────────────────────────┐
│  Renderer (React, sandboxed)  ──IPC──▶  188 handlers                                     │
│   contextIsolation:true, nodeIntegration:false, sandbox:true, webSecurity:true           │
│                                                                                          │
│  Extension workers (Node permission model, no fs/net by default)                          │
│  Extension-API host  http://127.0.0.1:8099   ← in-process require() of trusted bundles     │
│  Local stream proxy  http://127.0.0.1:<ephemeral>                                          │
│  Home server         http://0.0.0.0:<port>  ← LAN-exposed, optional                        │
└──────────────────────────────────────────────────────────────────────────────────────────┘
        │ web: tatakai.me            │ mobile: Capacitor shells          │ data
   Cloudflare Worker + Vercel    Android / iOS WebView              Supabase (Postgres+RLS,
   TatakaiAPI (self-host)                                            Storage, Edge Functions)
```

**Boundaries, and what each one is allowed to do**

| # | Boundary | Trust rule |
|---|---|---|
| B1 | Remote page → local HTTP services (`127.0.0.1`) | Never trusted. Host + Origin validated; no wildcard CORS; no implicit loopback trust. |
| B2 | Renderer → main process | Renderer is untrusted (it renders third-party embeds). Every channel is named, sender-checked, and validates its arguments. |
| B3 | Third-party embed (iframe) → app | Blocked navigation, no webview attach, popups denied, media protocol refused for remote initiators. |
| B4 | Extension bundle → OS | Worker sandbox + Node permission model; no filesystem/network unless the manifest declares it. |
| B5 | Anonymous client → database | RLS on every client-reachable table; `anon` key is public and treated as a hostile input. |
| B6 | Update channel → binary | Must be signed or digest-checked before install. **Partially enforced — see E1/E2.** |

The recurring bug class in this codebase was **missing B1 and B5 enforcement** —
"it's only 127.0.0.1" and "the table is only written by the app" were both false
assumptions.

---

## C. Findings at a glance

### Fixed (with regression coverage)

| ID | Finding | Severity | Where |
|---|---|---|---|
| DESK-1 | Preload exposed a generic `invoke(channel, …)` passthrough | High | `desktop/preload.cjs` |
| DESK-2 | IPC handlers were registered before the sender guard | High | `desktop/main.cjs`, `desktop/security/ipc-guard.cjs` |
| DESK-3 | `cache:read/write` interpolated a caller key into a path (traversal) | High | `desktop/ipc/ipc-runtime.cjs` |
| DESK-4 | Navigation allowlist used `startsWith` (`api.tatakai.me.evil.example`) | High | `desktop/window/window-factory.cjs` |
| DESK-5 | `file://` protocol handler served any path on disk | High | `desktop/main.cjs` |
| DESK-6 | `tatakai-media://` was `bypassCSP` and readable from remote frames | High | `desktop/main.cjs` |
| DESK-7 | Media probe/extract passed caller strings to ffmpeg (`concat:`, `subfile:`, `pipe:`) | High | `desktop/ipc/ipc-media.cjs` |
| DESK-8 | `media:read-local-file` read *any* `.txt/.vtt/.srt` on disk | Medium | `desktop/ipc/ipc-media.cjs` |
| DESK-9 | `open-path` forwarded any path to `shell.openPath()` (`.exe` → execution) | High | `desktop/ipc/ipc-library.cjs` |
| EXT-1 | Extension workers had no process isolation | High | `desktop/runtime/extension/extension-worker-pool.cjs` |
| EXT-2 | Extension ids used as paths without validation | Medium | `desktop/ipc/ipc-runtime.cjs` |
| EXT-3 | Extension-API host answered `Access-Control-Allow-Origin: *` on a fixed port | High | `desktop/runtime/extension-api-host/host-server.cjs` |
| HOME-1 | Home server trusted all loopback traffic as admin with `ACAO: *` | Critical | `desktop/runtime/home-server/` |
| HOME-2 | `/auth/login` only covered by a 120/min global bucket | Medium | `desktop/runtime/home-server/server.cjs` |
| PW-1 | Streaming-proxy password treated as a secret (it is shipped to browsers) | Medium | `cloudflare-worker/src/index.js` |
| PW-2 | Proxy followed redirects, defeating the SSRF host guard | High | `cloudflare-worker/src/index.js` |
| PW-3 | Proxy echoed upstream error text | Low | `cloudflare-worker/src/index.js` |
| SRV-1 | `send-notification` had **no authorization** — anyone could push to all users | Critical | `supabase/functions/send-notification/index.ts` |
| DB-1 | 11 `public` tables without RLS (incl. `app_config` → **`android_download_url`**); `mappings` schema never revoked | Critical | `supabase/migrations/20261024000001_*` |
| WEB-1 | Self-hosted entrypoint (`ptero-start`) sent no security headers | Medium | `scripts/ptero-start.mjs` |
| WEB-2 | Static server path containment relied on `normalize()` | Medium | `scripts/ptero-start.mjs` |
| MOB-1 | Android backed up the session token and library index via ADB/device transfer | High | `AndroidManifest.xml`, `res/xml/data_extraction_rules.xml` |
| AUTH-1 | AniList OAuth link flow had no CSRF `state` (login CSRF) | High | `src/lib/externalIntegrations.ts`, `src/pages/auth/AniListRedirectPage.tsx` |
| XSS-1 | Raw `dangerouslySetInnerHTML` sinks outside the sanitizer | High | `src/` (see D12) |
| SEC-1 | Committed credentials / env files | High | repo-wide |
| CI-1 | CI patterns that run PR code with tokens | High | `.github/workflows/` |

### Open

| ID | Finding | Severity | Section |
|---|---|---|---|
| E1 | Android updater installs an APK without signature or digest verification | High | [E1](#e1--android-updater-has-no-signature-or-digest-check) |
| E2 | Desktop auto-update installs unsigned artefacts; no code signing at all | Medium | [E2](#e2--desktop-builds-are-unsigned-and-the-updater-does-not-verify-artefacts) |
| E3 | Extension-API host `require()`s bundles in-process (sandbox bypass for `apiServer`) | Medium | [E3](#e3--extension-api-host-requires-bundles-in-process) |
| E4 | `write-client-env.mjs` allowlist ships proxy passwords into the browser bundle | Medium | [E4](#e4--proxy-passwords-are-shipped-in-the-client-bundle-by-design) |
| E5 | CSP duplicated between `vercel.json` and `ptero-start.mjs` (already diverged) | Medium | [E5](#e5--csp-is-duplicated-and-has-already-diverged) |
| E6 | `media:read-local-file` is path-restricted but not *root*-restricted | Low | [E6](#e6--local-subtitle-reader-is-not-restricted-to-library-roots) |
| E7 | Android `file_paths.xml` exposes whole storage roots to FileProvider | Low | [E7](#e7--android-fileprovider-exposes-whole-storage-roots) |
| E8 | Home server accepts `?access_token=` in the query string | Low | [E8](#e8--home-server-accepts-a-token-in-the-query-string) |
| E9 | Desktop deep links are not declared in the packaged app metadata | Medium (functional) | [E9](#e9--packaged-macos-builds-do-not-declare-the-tatakai-url-scheme) |
| E10 | Ad-blocker / embed trust depends on runtime flags only | Low | [E10](#e10--ad-blocker-scope-depends-on-a-renderer-set-flag) |

---

## D. Fixed findings (evidence)

Each entry states the bug, why it mattered, what changed, and the test that now
guards it. Test files are under `tests/`; the invariant script is
`scripts/check-security-baseline.mjs`.

### D1. DESK-1 — generic IPC passthrough on the preload bridge
`contextBridge` exposed `invoke(channel, ...args)`, so any renderer script could
reach **every** channel, including ones that take filesystem paths.
**Fix:** removed; the bridge is a flat list of named methods (241 of them).
**Guard:** `DESK-1` invariant fails on `/invoke:\s*\([^)]*\)\s*=>\s*ipcRenderer\.(invoke|send)/`.

### D2. DESK-2 — handlers registered before the sender guard
Handler modules were `require()`d before `installIpcSenderGuard()` ran, leaving
early channels unvalidated.
**Fix:** `desktop/security/ipc-guard.cjs` installs first and checks the sender
frame's URL for every call. **Guard:** `DESK-2` compares the position of the two
statements in `main.cjs`.

### D3. DESK-3 — cache key path traversal
`cache:read`/`cache:write` did `path.join(userData, 'runtime_cache', key + '.json')`
with an unvalidated `key`, so `{"key":"../../evil"}` wrote attacker-controlled
JSON anywhere the process could write, and read arbitrary `*.json` back.
**Fix:** flat charset regex (`^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`, no `..`) plus a
post-resolve containment check.

### D4. DESK-4 — `startsWith` navigation allowlist
`https://api.tatakai.me.evil.example/` passed the check.
**Fix:** compare parsed components — exact `app://` host, exact
`https://api.tatakai.me` origin, `localhost:8090` only, and `file:` paths resolved
and confined to `dist/`. **Guard:** `will-navigate` refuses everything else.

### D5/D6. DESK-5, DESK-6 — protocol handlers as file readers
`file://` served any path (`registerFileProtocol` with raw `substr(7)`), and
`tatakai-media://` was registered `bypassCSP` + `corsEnabled`, so a third-party
embed iframe could fetch `tatakai-media:///…/secret`.
**Fix:** DESK-5 confines `file://` to `dist/`; DESK-6 inspects the initiating
`referrer`/`Origin`/`Referer` and refuses remote `http(s)` initiators.

### D7. DESK-7 — ffmpeg protocol injection
`media:probe`, `media:extract-subtitle` and `media:extract-audio-track` handed
caller strings to fluent-ffmpeg. ffmpeg also speaks `concat:`, `subfile:`,
`pipe:` and `playlist:` — local file reads and internal endpoint probes.
**Fix:** `ALLOWED_MEDIA_SCHEMES = {http, https, file, tatakai-media}` checked with
`new URL()`. **Test:** `tests/desktop-media-guard.test.js` (7 assertions).

### D8. DESK-8 — subtitle reader was a generic text-file reader
**Fix:** extension allowlist (`.vtt .srt .ass .ssa .txt`), 8 MB cap, regular-file
check, and a denylist for `.ssh/.gnupg/.aws/.config/.kube/.docker/.npmrc/.env`
segments plus keychain/credential roots and `/etc`, `/var/root`. Served as
`data:text/vtt`. **Test:** same file as D7.

### D9. DESK-9 — `open-path` was local code execution
`shell.openPath()` opens with the OS default handler; pointed at a `.exe`,
`.bat`, `.lnk` or `.desktop` that is code execution, reachable from a renderer
script-injection bug.
**Fix:** directories and a media/document extension allowlist only; everything
else returns `unsupported-target`. **Test:** `tests/desktop-open-path-guard.test.js`.
**Guard:** `DESK-9` invariant.

### D10. EXT-1, EXT-2 — extension sandbox
Workers are spawned with `buildPermissionExecArgv` (Node permission model) and a
bootstrap strip that removes `process.getBuiltinModule`-style escape hatches;
extension ids are validated before use as path segments.
**Tests:** `tests/extension-worker-isolation.test.mjs`, `tests/extension-sandbox.test.js`.

### D11. EXT-3 — extension-API host was readable by any web page
The host binds `127.0.0.1` on a **stable preferred port** (8099) and answered
every request with `Access-Control-Allow-Origin: *` and no request-origin check.
Any page the user had open — or a DNS-rebinding hostname aimed at that port —
could read `/api/v3/<namespace>/sources` and `/api/v3/probe` (a request relay).
**Fix:** `evaluateRequestOrigin()` validates `Host` (loopback names, IP literals,
OS hostname — the DNS-rebinding defence) and `Origin` (renderer protocols
`app:/file:/capacitor:/ionic:/chrome-extension:` plus loopback `http(s)`), echoes
the caller's own origin instead of a wildcard, and refuses `Origin: null` when
`Sec-Fetch-*` says a browser initiated it. **Test:**
`tests/extension-api-host-origin-guard.test.js`. **Guard:** `EXT-3` invariant
fails if a hard-coded `ACAO: '*'` returns.

### D12. HOME-1, HOME-2 — home server
`createHomeServer` defaulted to `corsOrigins: ['*']` while `authenticate()`
treated *every* loopback request as admin — so any web page, or a rebinding
domain, could read the library, delete files and start torrents on a LAN-exposed
server without a token. `/auth/login` was only covered by a generous global
bucket.
**Fix:** no CORS headers unless the operator lists explicit origins, `Host`
validation (`isAllowedHostHeader`), `Origin` validation (`isAllowedOrigin`), and a
dedicated tight rate-limit bucket for login.
Previously saved wildcard origins are removed on read and write, with the
upgrade persisted when possible. Explicit origin allowlists, credentials and
other configuration are retained. Wildcards are no longer supported, including
when supplied directly to the request handler.
**Tests:** `tests/home-server-origin-guard.test.js` (upgraded existing config),
`tests/home-server-store.test.js` (persistence and read-only disk).
**Guard:** `HOME-1` invariant.

### D13. PW-1..PW-3 — streaming proxy worker
PW-2 is the important one: `redirect: 'follow'` let an allowed upstream bounce the
proxy to a private address, defeating the `isBlockedHost()` SSRF guard. Redirects
are now followed manually, re-validated per hop, capped at 3. PW-1: the shared
password is shipped to browsers, so it is documented as a speed bump, compared in
constant time, with a per-IP rate limit. PW-3: upstream error text is no longer
echoed. **Test:** `tests/streaming-proxy-worker.test.js`.

### D14. SRV-1 — `send-notification` had no authorization
The Edge Function runs with the **service role key**, can read every push token
and address every user. It performed no authorization at all: any signed-in user
could `POST {target:'all', title, body}` and push arbitrary text to the entire
user base. It also answered `ACAO: *` and returned raw Postgres/Deno errors.
**Fix:** caller JWT required, profile resolved server-side, staff-only broadcast,
per-caller rate limit, origin allowlist, and no internal error detail.
Staff checks include `is_admin`, `is_moderator`, and the textual role. Attempts
are recorded in the existing `admin_logs` schema, including zero-recipient
attempts. A returned database error from the audit insert returns HTTP 503
instead of silently reporting success. Push delivery itself still requires an
FCM implementation; this fix does not add one.
**Test:** `tests/send-notification-security.test.ts` executes the actual handler
with injected authentication/database dependencies.

### D15. DB-1 — eleven `public` tables without RLS, including the updater's download URL
Supabase grants `anon` and `authenticated` `ALL` on new tables by default, so an
un-RLS'd table is **writable by anyone holding the public anon key**.
`public.app_config` — read and **upserted** by `src/hooks/ui/useAppConfig.ts` —
holds `min_supported_version`, `latest_version`, `force_update_message` and
`android_download_url`. An anonymous client could rewrite `android_download_url`
and point the in-app Android updater at an attacker's APK.
**Fix:** `supabase/migrations/20261026000007_rls_hardening_internal_tables.sql`:
`app_config` → public `SELECT`, admin-only (`is_admin_user()`) writes;
`redirects`/`admin_popups` → public read, staff write; `analytics_events` →
append-only for clients, staff read; `anime_trending_scores` → public read (its
`Anyone can read` policy existed but was inert), writes revoked; the five
`api_*`/`country_policy_audit_log` backend tables plus the legacy
`public.mappings` id map → RLS on with **no** policy and client privileges
revoked; the whole `mappings` schema revoked (`relay` and `tatakai_private`
already were, which is why those were reported as "no RLS" but not reachable). Service-role
access is unaffected. **Guard:** `DB-1` (the named decisions still exist) and **`DB-2`**, which is the
structural one: every table created by any versioned migration must have an RLS
decision — an `ENABLE ROW LEVEL SECURITY`, a `DROP TABLE`, a schema-level
`REVOKE`, or an entry in the hardening migration's backend-only list. A new
migration that creates a table without one now fails CI. Lint via
`node scripts/check-migrations.mjs`.

### D16. WEB-1, WEB-2 — self-hosted web entrypoint
`scripts/ptero-start.mjs` (`npm run start:web`, the documented Pterodactyl
deployment) served with **no security headers** — no CSP, HSTS, nosniff or frame
protection — unlike the Vercel build which gets them from `vercel.json`. The
static handler also relied on `normalize()` for containment.
**Fix:** full header set applied to every response, and an explicit
`resolve()`-based containment check against `dist/` (escape → 404).

### D17. MOB-1 — Android backed up app-private state
`android:allowBackup` defaulted to true, so `adb backup` and Android's device
transfer copied the WebView storage: the Supabase **session token** (full account
takeover) and the offline library index.
**Fix:** `allowBackup="false"`, `fullBackupContent="false"`, and a
`data_extraction_rules.xml` that excludes root/file/database/shared-pref/external
from both `<cloud-backup>` and `<device-transfer>`. **Guard:** `MOB-1` invariant.
**Status: fixed in source, unverified at runtime** — no Android toolchain here, so
both files are validated as XML and reviewed by hand, not built.

### D18. AUTH-1 — AniList link flow had no CSRF `state`
The web AniList authorize URL carried no `state`, and `AniListRedirectPage`
exchanged any `code` it was given. That is a login CSRF: someone holding an
authorization code for *their* AniList account could send a victim to
`/integration/anilist/redirect?code=<their code>` and the victim's Tatakai profile
would link the attacker's AniList account — after which the attacker's account is
the one being updated, and profile/activity data flows the wrong way.
**Fix:** `getAniListAuthUrl()` always mints (16 random bytes) and stores a state;
`readAniListOAuthState()` exposes it; the redirect page refuses a callback with a
missing or mismatching state **before** spending the single-use code (mirroring
the checks MAL and MangaBaka already had). New i18n keys `auth.stateMissing`,
`auth.stateMismatch` in en/es/ja.
**Test:** `tests/anilist-oauth-state.test.ts`. **Guard:** `AUTH-1` invariant.

### D19. Cross-cutting: XSS-1, SEC-1, CI-1
- **XSS-1** — every `dangerouslySetInnerHTML` must be `<SafeHtml>`
  (`src/components/ui/safe-html.tsx`), which re-sanitizes at render time. The
  three allowlisted exceptions are library-generated SVG, static markup, and the
  sanitizer itself. Invariant enforced repo-wide.
- **SEC-1** — no tracked `.env` files and no credential-shaped strings
  (service-role JWT, GitHub/AWS/Stripe/Slack tokens, private keys); the public
  anon JWT is allowlisted.
- **CI-1** — no `pull_request_target` + PR-head checkout, and no unquoted
  interpolation of event text into `run:` blocks. Workflows run with
  `permissions: contents: read`.

### Positive patterns worth keeping
`android/app/src/main/res/xml/network_security_config.xml` (cleartext disabled
except loopback), `supabase/migrations/20260923140000_user_media_bucket.sql`
(per-`auth.uid()` folder + MIME + size limit), `src/lib/urlHost.ts` (parsed-host
SSRF checks), `src/lib/adminSecret.ts`, `src/components/ui/safe-html.tsx`,
`desktop/window/app-scheme.cjs` (privileged custom scheme instead of `file://`),
and the per-handler argument validation in `desktop/ipc/`.

---

## E. Open findings and residual risk

Nothing in this section is fixed. Each entry names the fix so it can be picked up
independently.

### E1 — Android updater has no signature or digest check
**Severity: High** · `android/app/src/main/java/**/TatakaiUpdaterPlugin.java`
`downloadApk` accepts any `https://` URL, and `installApk` only checks that the
downloaded archive's `packageName` matches. A swapped asset on the same host, or
a compromised release, installs silently. Combined with DB-1 (before the fix,
`android_download_url` was anonymously writable) this was a full
remote-install chain; DB-1 is closed, the missing verification is not.
**Fix:** publish a SHA-256 with the release, verify it before the install intent,
and compare the archive's signing certificate
(`getPackageArchiveInfo(..., GET_SIGNING_CERTIFICATES)`) with the installed app's.
Better: `android:autoVerify`-style release manifest signing. **Unverified at
runtime** — no Android toolchain here.

### E2 — Desktop builds are unsigned and the updater does not verify artefacts
**Severity: Medium** · `package.json` (`build.win.signExecutable: false`,
`build.mac.identity: "-"`, `hardenedRuntime: false`, `notarize: false`),
`desktop/services/update-manager.cjs`
electron-updater does verify the SHA-512 in `latest.yml` for GitHub releases, but
with no Authenticode signature and no notarization the OS gives the user no
independent signal, and `hardenedRuntime: false` removes a macOS mitigation.
**Fix:** acquire signing certificates (Azure Trusted Signing / Apple Developer ID),
enable `hardenedRuntime` + `notarize`, and keep `latest.yml` generation inside CI.

### E3 — extension-API host `require()`s bundles in-process
**Severity: Medium** · `desktop/runtime/extension-api-host/host-server.cjs`
The host contract needs in-process `require()`, which bypasses the worker-thread
sandbox. It is gated to first-party/`sideloaded` extensions (documented in the
file header), so the residual risk is a malicious *sideloaded* bundle gaining
main-process-equivalent access through `apiServer`.
**Fix:** run the `apiServer` contract in a utility process with an explicit
capability list, or require a signature for any extension declaring `apiServer`.

### E4 — proxy passwords are shipped in the client bundle by design
**Severity: Medium** · `scripts/write-client-env.mjs`, `cloudflare-worker/src/index.js`
`VITE_PROXY_PASSWORD` / `VITE_STREAM_PROXY_PASSWORD` are on the public-key
allowlist, so the worker's "password" is in every browser bundle and the desktop
asar. That is documented at the call site (PW-1) and is a deliberate speed bump,
not a secret — but it should not be mistaken for access control.
**Fix:** move the gate to a per-user signed token (or a Cloudflare Access policy)
if the proxy ever needs real access control.

### E5 — CSP is duplicated and has already diverged
**Severity: Medium** · `vercel.json` vs `scripts/ptero-start.mjs`
The two definitions differ: `ptero-start` appends `upgrade-insecure-requests` and
is missing nothing else material, but `vercel.json` carries `X-XSS-Protection`
(obsolete, and can introduce vulnerabilities in old browsers) and the `connect-src`
lists are maintained by hand in two places. Drift here silently weakens one
deployment.
**Fix:** generate both from one source (`scripts/` module → a `_headers` file and
the server constant), and drop `X-XSS-Protection` (rely on CSP).

### E6 — local subtitle reader is not restricted to library roots
**Severity: Low** · `desktop/ipc/ipc-media.cjs`
DESK-8 blocks credential paths, but any non-denylisted `.txt`/`.srt`/`.vtt`
anywhere on disk is still readable by the renderer. The renderer is same-origin
trusted, so this is defence in depth.
**Fix:** resolve against the library/temp roots the app hands out and require
containment, instead of a denylist.

### E7 — Android FileProvider exposes whole storage roots
**Severity: Low** · `android/app/src/main/res/xml/file_paths.xml`
`files-path "."`, `cache-path "."`, `external-path "."` are all shared. Any
component granted a FileProvider URI can read the lot.
**Fix:** narrow to `tatakai-updates/` and the downloaded-media directory.

### E8 — home server accepts a token in the query string
**Severity: Low** · `desktop/runtime/home-server/server.cjs`
`?access_token=` is accepted for the bundled web UI. It works, but tokens in URLs
leak via history, `Referer` and logs.
**Fix:** accept the token in the `X-Tatakai-Token` header only, and exchange a
one-time code for it on first load.

### E9 — packaged macOS builds do not declare the `tatakai://` URL scheme
**Severity: Medium (functional, security-adjacent)** · `package.json` (`build`),
`desktop/window/deep-link.cjs`
`registerProtocolClient()` calls `app.setAsDefaultProtocolClient()` at runtime,
but the electron-builder config declares no `protocols` block and no
`CFBundleURLTypes` exists for the desktop app, so a packaged macOS build cannot
receive `tatakai://` callbacks. The desktop OAuth bridge (AUTH-1's counterpart)
depends on those callbacks. **Inference** — not verified in a packaged build.
**Fix:** add a `protocols: [{ name: "Tatakai", schemes: ["tatakai"] }]` entry (plus
`magnet` if wanted) and re-test the browser → app handoff.

### E10 — ad-blocker scope depends on a renderer-set flag
**Severity: Low** · `desktop/security/ad-blocker.cjs`
Network filtering is armed by `security:set-watch-active` from the renderer; with
the flag down only the ad-network popup blocklist runs. That is intentional (the
watch page is the only place untrusted markup loads) but means a compromised
renderer can lower the shield.
**Fix:** drive the flag from the main process's own navigation state.

### Also open, tracked elsewhere
- **Dependency advisories** that are accepted rather than fixed — see § F.
- **Licence questions** (ffmpeg GPL builds, libvips LGPL) — see § F and `NOTICE`;
  they are compliance questions, not vulnerabilities, and are not resolved here.

---

## F. Supply chain and dependency posture

### The gate
`npm audit --omit=dev --audit-level=high` is all-or-nothing: one advisory in an
unmaintained transitive package blocks every PR until someone ships a major
upgrade, which in practice means the gate gets deleted. CI now runs
`scripts/check-audit-gate.mjs` against `scripts/security-audit-allowlist.json`:

- new high/critical advisory → **build fails**;
- a listed package that picks up an advisory id it was not listed for → **fails**;
- a listed entry past its `expires` date → **fails** (accepted risk must be
  re-confirmed, not inherited);
- the full accepted list is printed in every CI log, so the decision stays
  visible.

### Accepted advisories (as of this pass)

`npm audit --omit=dev` → **0 critical, 6 high, 36 moderate**.

| Package | Advisory | Why accepted | Expiry |
|---|---|---|---|
| `ip` (and the `bittorrent-tracker` → `torrent-discovery` → `webtorrent` chain that pulls it in) | GHSA-2p57-rm9w-gvfp | Unmaintained upstream, no patched 2.x. `ip.isPublic()` is used to classify peers, not as a trust boundary — Tatakai's own SSRF guard is `urlHost.ts` / the worker's `isBlockedHost`. Fix path is webtorrent 3 (major). | 2027-01-31 |
| `zod` (+ `@discord/embedded-app-sdk`'s bundled v3) | GHSA-mrhx-c7xc-m3w5 | Memory exhaustion on oversized constrained *collections*; Tatakai's own schemas validate scalars. Held at v3 because the Discord SDK pins `^3.9.8`. | 2027-01-31 |

The 36 moderate findings are mostly `@tiptap/*` (transitive `@tiptap/core`
`mergeAttributes()` prototype issue) and `react-router` open-redirect advisories.
They are real, rated moderate, and tracked here rather than in the allowlist so
they stay visible; upgrading `@tiptap/starter-kit` to 3.x and `react-router-dom`
to 7.x are breaking changes that need their own regression pass.

### Fixed in this pass
- **`sharp` 0.34.5 → 0.35.5** — clears the libvips advisories
  (CVE-2026-33327/33328/35590/35591, GHSA-f88m-g3jw-g9cj).
- **`icon-gen` moved from `dependencies` to `devDependencies`** — it is only
  used by `scripts/generate-assets.cjs`, and it dragged a second `sharp@0.33.5`
  and a vulnerable `ip` into the shipped dependency tree.

### Bundled binaries and licences
`NOTICE` now documents the third-party executables the desktop build ships or
downloads: **ffmpeg/ffprobe** (`@ffmpeg-installer`, `@ffprobe-installer`) — note
the licence is **not uniform per platform**: linux-x64 and win32-x64 ship GPLv3
ffmpeg, darwin-x64 ships LGPL-2.1 ffmpeg, and ffprobe is GPL-3.0 on all three;
**libvips** via `sharp` (LGPL-3.0-or-later); **UnRAR** (called only if present on
the user's system, never bundled); Rust crates in `translate-engine/`; and
locally downloaded model weights. Tatakai itself is MPL-2.0.
This is a **disclosure**, not legal advice: redistributing a GPL ffmpeg build
carries GPL obligations for that binary.

---

## G. Verification

Everything below was run on the audit branch. Reproduce with:

```bash
node scripts/check-security-baseline.mjs     # repository invariants
bun test tests/<file>                        # regression programs
node scripts/check-migrations.mjs            # migration lint (all 146)
node scripts/check-audit-gate.mjs            # dependency gate
npx tsc --noEmit -p tsconfig.app.json        # type baseline
npx eslint <files>                           # lint
node --check desktop/<file>.cjs              # CJS syntax
python3 -c "import xml.dom.minidom; xml.dom.minidom.parse('<file>.xml')"
```

### Current results

| Check | Result |
|---|---|
| `scripts/check-security-baseline.mjs` | **20 / 20 invariants hold** |
| Security regression tests (9 files, `bun test`) | **73 pass, 0 fail**, 202 assertions |
| `scripts/check-migrations.mjs` | **146 / 146 migrations valid** (including the new RLS migration) |
| `scripts/check-audit-gate.mjs` | **pass** — 0 unaccepted high/critical; 6 accepted, all within expiry |
| `npx tsc --noEmit -p tsconfig.app.json` | **138 errors**, all pre-existing and none in audit-touched files |
| `npx eslint` on touched files | **0 errors**; remaining warnings are pre-existing `react-hooks/exhaustive-deps` |
| Full `bun test` (1017 tests) | 926 pass / 82 fail — **all pre-existing**; a clean worktree of the base commit fails 84, so this branch introduces none (the suite is order-sensitive, hence the small delta) |
| Android/iOS builds | **not run** — no gradle/Xcode toolchain in the review environment |

The 20 invariants are the durable part: DESK-1, DESK-2, DESK-7, DESK-8, DESK-9,
EXT-1 (×2), EXT-2, EXT-3, HOME-1 (×2), PW-2 (×2), XSS-1, SEC-1, CI-1, DB-1,
DB-2, MOB-1, AUTH-1. Each is a specific regression that a future change would otherwise
reintroduce silently.

### What was explicitly *not* done
- No penetration testing of live services; no traffic to AniList, MAL, MangaBaka,
  Cloudflare or Supabase infrastructure.
- No fuzzing beyond the unit-level regression tests.
- No review of `node_modules` internals or of the Rust translate engine's memory
  safety (only its dependency licences).
- No mobile runtime testing (see honesty notes).

---

## Change log

| Date | Change |
|---|---|
| 2026-10-24 | Initial published audit: sections A–G; DESK-1…9, EXT-1…3, HOME-1/2, PW-1…3, SRV-1, DB-1, WEB-1/2, MOB-1, AUTH-1, XSS-1, SEC-1, CI-1 documented; dependency gate + `NOTICE` additions; 10 open findings recorded. |
