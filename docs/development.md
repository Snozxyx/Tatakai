# Development Setup

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | 20.x LTS | Runtime, package manager |
| **pnpm** | 9.x | Fast, disk-efficient package manager |
| **Git** | Latest | Version control |
| **Rust** | Stable | Native modules (torrent, ffmpeg) |
| **Docker** | Optional | Local Supabase for backend dev |

> **Windows:** Use [Volta](https://volta.sh) or [fnm](https://github.com/Schniz/fnm) for Node version management.

---

## Clone & Install

```bash
# Clone the repository
git clone https://github.com/snozxyx/Tatakai.git
cd Tatakai

# Install dependencies (uses pnpm workspaces)
pnpm install

# Generate Prisma client (for backend types)
pnpm db:generate
```

---

## Environment Configuration

Create `.env` files from templates:

```bash
# Root .env (for frontend/build)
cp .env.example .env

# Desktop .env (for Electron main process)
cp desktop/.env.example desktop/.env

# Supabase local (if running local backend)
cp supabase/.env.example supabase/.env
```

### Required Variables

| Variable | Description | Required For |
|----------|-------------|--------------|
| `VITE_SUPABASE_URL` | Supabase project URL | All |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key | All |
| `TAKATAI_API_URL` | TatakaiAPI proxy URL | Desktop, Mobile |
| `ENCRYPTION_KEY` | 32-char key for local encryption | Desktop |

---

## Running Locally

### Web App (Vite Dev Server)

```bash
# Start frontend only (no backend)
pnpm dev

# Start with local Supabase (requires Docker)
pnpm dev:full
```

Opens at `http://localhost:5173`

### Desktop App (Electron)

```bash
# Development mode (hot reload)
pnpm dev:desktop

# Production build
pnpm build:desktop
```

### Mobile (Capacitor)

```bash
# Android
pnpm cap:add:android
pnpm cap:sync:android
pnpm cap:run:android

# iOS (macOS only)
pnpm cap:add:ios
pnpm cap:sync:ios
pnpm cap:run:ios
```

---

## Project Structure (Monorepo)

```
Tatakai/
├── src/                    # React web app (shared)
│   ├── core/               # Domain layer (extensions, content, api)
│   ├── features/           # Feature modules (player, reader, community)
│   ├── components/         # Shared UI components
│   ├── hooks/              # Shared React hooks
│   └── utils/              # Utilities
├── desktop/                # Electron main process
│   ├── main.ts             # Entry point
│   ├── ipc/                # IPC handlers
│   ├── runtime/            # Native services (torrent, proxy, extension-host)
│   └── preload/            # Preload scripts
├── mobile/                 # Capacitor config & native bridges
├── supabase/               # Backend schema, migrations, functions
│   ├── migrations/         # SQL migrations
│   └── functions/          # Edge functions (TatakaiAPI)
├── extensions/             # Built-in extensions
│   └── aurora/             # Reference extension (all capabilities)
├── shared/                 # Shared types, constants, schemas
└── docs/                   # This documentation
```

---

## Key Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start web dev server |
| `pnpm dev:desktop` | Start Electron with hot reload |
| `pnpm build` | Build web app for production |
| `pnpm build:desktop` | Build Electron app (all platforms) |
| `pnpm lint` | Run ESLint + Prettier check |
| `pnpm typecheck` | TypeScript compile check |
| `pnpm test` | Run Vitest unit tests |
| `pnpm test:e2e` | Run Playwright E2E tests |
| `pnpm db:push` | Push schema to local Supabase |
| `pnpm db:studio` | Open Supabase Studio UI |

---

## Local Supabase (Optional)

For full backend features (auth, sync, community):

```bash
# Start local Supabase stack (requires Docker)
pnpm supabase:start

# Apply migrations
pnpm db:push

# Open Studio UI at http://localhost:54323
pnpm db:studio
```

**Local URLs:**
- API: `http://localhost:54321`
- Studio: `http://localhost:54323`
- Inbucket (email): `http://localhost:54324`

---

## Building Extensions

Extensions live in `extensions/` or can be developed externally.

```bash
# Build all bundled extensions
pnpm ext:build

# Build specific extension
pnpm ext:build --filter=aurora

# Package as .kai for distribution
pnpm ext:pack --filter=aurora
```

See [Extension System](extensions/overview.md) for full extension development guide.

---

## Common Issues

### Type Errors After Pull
```bash
pnpm install
pnpm db:generate
pnpm typecheck
```

### Electron Won't Start
- Ensure `desktop/.env` exists with `TAKATAI_API_URL`
- Check Rust toolchain: `rustup update`
- Clear cache: `rm -rf desktop/dist node_modules/.cache`

### Mobile Build Fails
- Android: `pnpm cap:sync:android` after any native changes
- iOS: Open `mobile/ios/App.xcworkspace` in Xcode, build there

### Supabase Connection Errors
- Verify `.env` has correct `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- For local: `pnpm supabase:status` to check container health

---

## IDE Setup (VS Code Recommended)

### Extensions
- **ESLint** — Linting
- **Prettier** — Formatting
- **TypeScript Vue Plugin (Volar)** — TS support
- **Tailwind CSS IntelliSense** — Class completion
- **Prisma** — Schema editing

### Settings (`.vscode/settings.json`)
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "typescript.tsdk": "node_modules/typescript/lib",
  "eslint.validate": ["typescript", "typescriptreact"]
}
```

---

## Debugging

### Web App
- Chrome DevTools (F12)
- React DevTools browser extension
- TanStack Query DevTools (in-app, bottom-right)

### Electron Main Process
```bash
# Start with inspector
pnpm dev:desktop --inspect=9229
```
- Attach VS Code debugger (`Attach to Node Process`)

### Extension Host
- Logs output to Electron console (`View → Toggle Developer Tools` in main window)
- HTTP API at `http://127.0.0.1:<port>/api/v3/<namespace>/...`

---

## Useful Scripts

```bash
# Check for unused dependencies
pnpm depcheck

# Update all dependencies
pnpm up -Lri

# Generate migration from schema changes
pnpm db:migrate:dev --name="description"

# Type-check extensions
pnpm ext:typecheck
```

---

## Next Steps

- [Architecture Overview](architecture/overview.md) — Understand the system
- [Extension System](extensions/overview.md) — Build your first extension
- [Contributing](contributing.md) — Code style, PR process