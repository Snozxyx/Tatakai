# Development Setup

Tatakai contributors use hosted development Supabase and run the frontend and
private TatakaiAPI on their own computer. Production user records are not copied
into this environment.

| Component | Address |
| --- | --- |
| Development Supabase | `https://dev.tatakai.app` |
| Invited-contributor Studio / SQL | `https://dev-studio.tatakai.app` |
| Local TatakaiAPI | `http://127.0.0.1:4001` |
| Local frontend | `http://127.0.0.1:8090` |
| Local Prisma catalog mirror | `127.0.0.1:55432` |

## Prerequisites and access

- Node.js 22 or later, with its bundled npm, and Git.
- An invitation to the private `Snozxyx/TatakaiAPI` repository.
- Membership in the **Tatakai Development Contributors** Cloudflare Access group.
- A separate confirmed development Auth account, created by the maintainer.

The Studio login uses the approved email address and Cloudflare's email code.
Studio access and the app's development Auth account are separate. Open signup
is disabled. Rust and mobile toolchains are needed only for native work; Docker
and Redis are not required for the local web/API workflow.

## Clone and install

```sh
git clone https://github.com/snozxyx/Tatakai.git
cd Tatakai
git clone https://github.com/Snozxyx/TatakaiAPI.git tatakaiapi
npm ci
npm --prefix tatakaiapi ci
```

The API remains an independent repository even when cloned into `tatakaiapi`.
Keep app, API, OPS and extension commits in their respective repositories.

## Configure development keys

Create the API's contributor file once. If it exists, edit it in place:

```sh
cp tatakaiapi/config/contributor/.env.example tatakaiapi/config/contributor/.env.local
```

PowerShell:

```powershell
Copy-Item -LiteralPath tatakaiapi/config/contributor/.env.example -Destination tatakaiapi/config/contributor/.env.local
```

Set `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` to the new development
keys supplied by the maintainer or shown in the protected development Studio.
Keep `SUPABASE_URL=https://dev.tatakai.app`. The service-role key belongs only
in this ignored API file; it must never be placed in a frontend or `VITE_*` file.
The launcher generates the remaining local secrets on first start.

The app's public defaults are in `config/contributor/.env.example`. Optional
public overrides belong in `config/contributor/.env.local`. Only the development
anon key is present in the browser profile. Existing operator `.env` files are
not loaded by the contributor launchers. Profiles reject production project
keys, production database/API addresses, mixed API origins and private browser
settings. Production build configuration is managed separately.

## Run locally

```sh
npm --prefix tatakaiapi run dev:check
npm run dev
```

The first run initializes the persistent local PostgreSQL mirror and applies
its Prisma schema before starting the API and frontend. PostgreSQL uses the
installed platform binary from `embedded-postgres`; no system database install
is required. Source edits restart the API while its mirror remains running.
Ctrl+C stops both services and checkpoints the local database.

To run them separately:

```sh
# Terminal 1: local API and its mirror
npm --prefix tatakaiapi run dev:contributor

# Terminal 2: frontend with the checked contributor profile
npm run dev:contributor
```

The shared development Supabase holds public catalog metadata and new test
records only. The local mirror is separate and persists in
`tatakaiapi/.cache/contributor-api`. The API uses memory caches by default.
Optional `REDIS_URL` and `REDIS_CONTROL_URL` in the API contributor file must
point to loopback Redis instances. Production OAuth, outbound email, webhooks,
telemetry and automatic import/refresh jobs are disabled in this workflow.

## Database work and invitations

Invited contributors can inspect and experiment with the development database
in Studio, including SQL. Submit lasting schema changes as migration PRs. The
initial database uses a reviewed end-state schema baseline; historical
migrations include duplicate versions and account-specific grants and must
not be replayed wholesale over development.

Maintainers create confirmed development Auth users in Studio and manage the
Cloudflare contributor group separately from private repository invitations.
The environment has no scheduled reset. Maintainers perform shared database
resets explicitly; restarting containers preserves data.

## Checks

```sh
npm run type-check
npm run check:migrations
npm test
npm --prefix tatakaiapi run typecheck
npm --prefix tatakaiapi run build
node --test scripts/contributor-env.test.mjs
node --test tatakaiapi/tests/contributor-env.test.mjs
```

Stop the API before generating Prisma or building it on Windows: a running
API can lock the Prisma query-engine DLL. Report unrelated existing check
failures separately from failures introduced by your contribution.

## Common issues

- **Repository access denied:** ask the maintainer for the private API invitation;
  Studio group membership does not grant GitHub repository access.
- **Studio login denied:** the maintainer must add the approved email to the
  development Access group. Production OPS membership is separate.
- **Port occupied:** the launcher fails without stopping another process.
  The combined workflow requires frontend port `8090`. Change API `PORT` or
  `CONTRIBUTOR_DB_PORT` in the API contributor file if needed. When changing
  `PORT`, update all local API aliases in the app contributor file too.
- **Wrong or missing keys:** run the API's `dev:check`; obtain development keys
  and never work around the check by using production configuration.
- **PostgreSQL binary missing:** reinstall API dependencies with optional
  dependencies and npm install scripts enabled. Run development without sudo.
- **Local cluster password changed:** restore the original contributor file.
  Existing mirror data is preserved rather than silently recreated.
- **API or database startup failure:** inspect the private
  `tatakaiapi/.cache/contributor-api/last-error.log` and `postgres.log` locally;
  redact credentials before sharing diagnostics.

## Native development

Native builds have their own platform prerequisites and backend configuration.
The contributor workflow above is for local web/API work.

### Desktop App (Electron)

```bash
# Development mode (hot reload)
npm run electron:dev

# Production build
npm run electron:build
```

Electron development builds the native helpers only when their inputs change.
Vite and the helpers start together; Electron uses Vite's selected loopback port
(starting at 8090), including when another application already uses 8090.
Closing Electron or pressing Ctrl+C stops this run's development server.
Use `npm run electron:dev -- --force` to rebuild both helpers, or
`npm run electron:dev -- --check` to verify startup without opening Electron.

### Mobile (Capacitor)

```sh
npm run mobile:sync
npm run mobile:dev
npm run mobile:ios
```

Use an explicitly configured development backend for native testing. Android
requires its SDK/toolchain; iOS requires macOS and Xcode. Packaged release
configuration is maintained separately from the contributor profile.

## Next steps

- [Architecture Overview](architecture/overview.md)
- [Contributing](contributing.md)
- [Extension System](extensions/overview.md)
