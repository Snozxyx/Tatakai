# Security Policy

Tatakai is an open-source anime/manga/novel hub — a web app, an Electron desktop
app, and Android/iOS shells sharing one codebase. It runs a local network
service, installs extensions, and stores third-party integration tokens, so
security reports are welcome and taken seriously.

- **Full self-assessment:** [`docs/security/SECURITY_AUDIT.md`](docs/security/SECURITY_AUDIT.md)
- **Licence:** MPL-2.0 — see [`LICENSE`](LICENSE)
- **Third-party components:** [`NOTICE`](NOTICE)

---

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Use GitHub's private reporting: go to the
[Security tab](https://github.com/Snozxyx/Tatakai/security) →
**Report a vulnerability**. That opens a private advisory visible only to the
maintainers, and lets us credit you when it is published.

If private reporting is unavailable to you, open a normal issue that contains
*no details* — just "I have a security report, please contact me" — and a
maintainer will move the conversation to a private channel.

### What to include

- What the issue is and where (file, function, endpoint, IPC channel, table).
- Which component: web build, desktop (Electron), Android/iOS app, Cloudflare
  worker / streaming proxy, self-hosted server (`npm run start:web`), or the
  Supabase schema.
- Steps to reproduce, or a proof-of-concept. A minimal snippet is far more
  useful than a scanner report.
- Impact as you see it — what an attacker gains.
- Whether you want public credit, and under what name.

### What to expect

This is a volunteer-maintained project, so these are targets rather than a
contract, but we aim for:

| Stage | Target |
|---|---|
| Acknowledgement of your report | 5 days |
| Initial assessment (severity, whether we agree) | 14 days |
| Fix or documented mitigation for High/Critical | 90 days |
| Public advisory | After a fix ships, coordinated with you |

If a fix is going to take longer, we will say so and keep you updated rather than
going quiet.

### Scope

**In scope**

- The web app and its build/deploy configuration (`src/`, `cloudflare-worker/`,
  `scripts/ptero-start.mjs`, `vercel.json`).
- The desktop app: IPC bridge, protocol handlers, extension sandbox, update path,
  local services (`desktop/`).
- The Android and iOS shells (`android/`, `ios/`, `capacitor.config.ts`) —
  including backup, FileProvider and updater behaviour.
- Supabase schema, RLS policies, storage buckets and Edge Functions
  (`supabase/`).
- Authentication and OAuth flows, session handling, and anything that could let
  one account act as another.
- CI workflows under `.github/`.

**Out of scope**

- Third-party services and their infrastructure (AniList, MyAnimeList,
  MangaBaka, Cloudflare, Supabase, GitHub, and the sites extensions fetch from).
  Report those to the relevant vendor.
- Findings that require an already-compromised device, a rooted/jailbroken OS, or
  administrative access to the user's machine.
- Missing hardening headers or "best practice" scan output with no demonstrated
  impact — mention them, but they are not treated as vulnerabilities.
- Denial of service by resource exhaustion against your own local instance.
- Social engineering, spam, or physical attacks.
- Automated scanner dumps and LLM-generated reports without a reproduction.
- **The legality of the content extensions can access.** Tatakai is a client; it
  hosts no media and ships no sources. Copyright complaints belong with the site
  hosting the material, not this project's security channel.

### Safe harbour

Testing that stays inside these rules — your own account, your own instance, no
data exfiltration beyond what is needed to demonstrate the issue, no traffic to
other users — is authorised, and we will not take action against you for it.
Do not test against other people's accounts or instances, and do not run
destructive or availability-impacting tests against any deployment.

---

## Supported versions

Fixes land on the default branch and ship in the next release. Only the latest
released version of each target receives security fixes; older versions are not
backported. If you are running a fork or a self-hosted instance, pull the fix and
redeploy — schema fixes arrive as new files in `supabase/migrations/`.

---

## For contributors: how security changes are expected to be made

These are the conventions the project holds itself to, and the reason some files
look defensive:

1. **A fix ships with a test that fails without it.** Regression programs live in
   `tests/` and are listed in `.github/workflows/security.yml`.
2. **Repo invariants are executable.** `node scripts/check-security-baseline.mjs`
   encodes the trust-boundary decisions (20 checks: preload surface, IPC sender
   guard, extension sandbox, origin guards, sanitizer sinks, RLS coverage per
   migration, Android backup, OAuth state, and more). A change that breaks one fails CI — if you
   believe an invariant is wrong, change it deliberately in that file rather than
   deleting the check.
3. **Dependency findings are never silenced.** `scripts/check-audit-gate.mjs`
   fails on any new high/critical advisory. Accepting one means adding an entry to
   `scripts/security-audit-allowlist.json` with a reason **and an expiry date**,
   and recording it in `docs/security/SECURITY_AUDIT.md` § F.
4. **No feature is removed for a hypothetical risk.** Hardening narrows what a
   capability can touch, it does not disable the capability.
5. **Only public configuration goes to the client.** `scripts/write-client-env.mjs`
   allowlists keys; anything added there is public by definition.
6. **Never commit secrets.** The baseline script scans for credential-shaped
   strings and fails if it finds one. If a secret did land in history, rotate it —
   removing the commit is not enough.

Running the checks locally:

```bash
node scripts/check-security-baseline.mjs
node scripts/check-migrations.mjs
node scripts/check-audit-gate.mjs
bun test tests/desktop-media-guard.test.js   # or any security regression file
```

---

## Known open items

The audit's § E lists what is known and not yet fixed — for example, the Android
updater does not yet verify APK signatures, and the desktop builds are not code
signed. They are documented rather than hidden so nobody mistakes "not listed
here" for "not a problem". Reports against those items are still welcome; a
working exploit path is much more useful than a restatement.
