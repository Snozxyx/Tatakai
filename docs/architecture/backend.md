# Backend & Data Architecture

## Overview

The backend consists of **TatakaiAPI** (Edge Functions on Supabase) as a proxy/cache/auth layer, and **Supabase** (PostgreSQL + Auth + Realtime + Storage) as the data platform.

---

## TatakaiAPI (Edge Functions)

**Location:**  'This is private'

### Purpose

| Function | Why |
|----------|-----|
| **Rate Limiting** | Protect external APIs, prevent abuse |
| **Caching** | Reduce latency, reduce upstream load |
| **Auth Proxy** | Validate JWT once, forward claims |
| **Request Transform** | Normalize disparate external APIs |
| **Serverless Logic** | Webhooks, scheduled jobs, heavy compute |

### Architecture

```
Client (Web/Desktop/Mobile)
        │
        ▼
┌─────────────────────────────────────┐
│        Supabase Edge Runtime        │
│  (Deno, V8 isolates, global CDN)    │
├─────────────────────────────────────┤
│  TatakaiAPI Router                  │
│  ├─ /anime/*      → Anime handlers  │
│  ├─ /manga/*      → Manga handlers  │
│  ├─ /novels/*     → Novel handlers  │
│  ├─ /extensions/* → Extension catalog│
│  ├─ /community/*  → Social features │
│  ├─ /recommendations/* → ML engine  │
│  ├─ /sync/*       → MAL/AniList/MB  │
│  └─ /webhooks/*   → External callbacks│
└─────────────────────────────────────┘
        │
   ┌────┴────┐
   ▼         ▼
Cache    External APIs
(Redis)  (AniList, MAL, etc.)
```

### Key Middleware

```ts
// supabase/functions/tatakai-api/_shared/middleware.ts

// 1. Auth validation
export async function authMiddleware(req: Request, ctx: Context) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new HttpError(401, 'Missing token');
  }
  const jwt = authHeader.slice(7);
  const { data: { user }, error } = await supabase.auth.getUser(jwt);
  if (error || !user) throw new HttpError(401, 'Invalid token');
  ctx.user = user;
  ctx.claims = parseJwt(jwt);
}

// 2. Rate limiting (sliding window, per-user)
export async function rateLimitMiddleware(req: Request, ctx: Context) {
  const key = `ratelimit:${ctx.user.id}:${routeKey(req)}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 60); // 1 min window
  if (count > RATE_LIMITS[routeKey(req)] || 100) {
    throw new HttpError(429, 'Rate limited');
  }
}

// 3. Caching (GET only, TTL per route)
export async function cacheMiddleware(req: Request, ctx: Context) {
  if (req.method !== 'GET') return;
  const key = `cache:${req.url}`;
  const cached = await redis.get(key);
  if (cached) return new Response(cached, { headers: { 'X-Cache': 'HIT' } });
  ctx.cacheKey = key;
}
```

### Route Handlers (Examples)

```ts
// supabase/functions/tatakai-api/anime/search.ts
export async function handleAnimeSearch(req: Request, ctx: Context) {
  const { q, page = 1, limit = 20, filters } = await req.json();

  // Check cache
  const cached = await redis.get(`anime:search:${q}:${page}:${JSON.stringify(filters)}`);
  if (cached) return json(cached);

  // Query AniList (primary) + MAL (fallback)
  const [anilist, mal] = await Promise.allSettled([
    anilistApi.search(q, page, limit, filters),
    malApi.search(q, page, limit, filters),
  ]);

  // Merge & normalize
  const results = mergeResults(anilist, mal);

  // Cache for 5 min
  await redis.setex(ctx.cacheKey, 300, JSON.stringify(results));

  return json(results);
}

// supabase/functions/tatakai-api/sync/mal.ts
export async function handleMalSync(req: Request, ctx: Context) {
  const { accessToken, refreshToken } = await getMalTokens(ctx.user.id);
  if (!accessToken) throw new HttpError(400, 'MAL not connected');

  // Fetch user's list from MAL
  const malList = await malApi.getUserList(accessToken);

  // Compare with local (Supabase)
  const localList = await supabase.from('media_lists').select('*').eq('user_id', ctx.user.id);

  // Bidirectional merge (last-write-wins with conflict resolution)
  const merged = mergeLists(localList, malList, 'mal');

  // Upsert to Supabase
  await supabase.from('media_lists').upsert(merged);

  // Push realtime updates
  await supabase.channel(`sync:${ctx.user.id}`).send({ type: 'SYNC_COMPLETE', source: 'mal' });

  return json({ synced: merged.length, conflicts: merged.filter(m => m.conflict).length });
}
```

---

## Supabase Database Schema

### Core Tables

```sql
-- users/profiles (two ID spaces)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),  -- auth.uid()
  public_user_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),  -- public ID
  username TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  settings JSONB DEFAULT '{}',
  stats JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unified media list (anime, manga, novels)
CREATE TABLE media_lists (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id),
  media_type TEXT NOT NULL CHECK (media_type IN ('anime', 'manga', 'novel')),
  anilist_id INTEGER,
  mal_id INTEGER,
  mangabaka_id INTEGER,
  title_romaji TEXT NOT NULL,
  title_english TEXT,
  title_native TEXT,
  status TEXT NOT NULL CHECK (status IN ('watching', 'completed', 'on_hold', 'dropped', 'planning')),
  progress INTEGER DEFAULT 0,  -- episodes/chapters read
  score INTEGER CHECK (score BETWEEN 1 AND 100),
  started_at DATE,
  completed_at DATE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',  -- custom fields per media type
  UNIQUE (user_id, media_type, anilist_id)
);

-- Watch progress (anime episodes)
CREATE TABLE watch_progress (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id),
  anilist_id INTEGER NOT NULL,
  episode_number INTEGER NOT NULL,
  timestamp_seconds REAL DEFAULT 0,
  duration_seconds REAL,
  completed BOOLEAN DEFAULT FALSE,
  auto_skip_markers JSONB DEFAULT '[]',  -- [{start, end, type}]
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, anilist_id, episode_number)
);

-- Read progress (manga/novel chapters)
CREATE TABLE read_progress (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id),
  media_type TEXT NOT NULL CHECK (media_type IN ('manga', 'novel')),
  source_id TEXT NOT NULL,  -- anilist_id or custom source ID
  chapter_id TEXT NOT NULL,
  page_index INTEGER DEFAULT 0,  -- for manga
  scroll_offset REAL DEFAULT 0,  -- for novels
  completed BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, media_type, source_id, chapter_id)
);

-- Downloads
CREATE TABLE downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  media_type TEXT NOT NULL CHECK (media_type IN ('anime', 'manga', 'novel')),
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  episode_or_chapter TEXT NOT NULL,
  quality TEXT,
  file_path TEXT,
  file_size BIGINT,
  downloaded_bytes BIGINT DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('queued', 'downloading', 'paused', 'completed', 'failed', 'cancelled')),
  error TEXT,
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Extensions
CREATE TABLE extensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace TEXT UNIQUE NOT NULL,
  manifest JSONB NOT NULL,
  version TEXT NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  trusted BOOLEAN DEFAULT FALSE,
  installed_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  config JSONB DEFAULT '{}',
  source TEXT CHECK (source IN ('bundled', 'sideloaded', 'store'))
);

-- Community posts
CREATE TABLE community_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES profiles(id),
  type TEXT NOT NULL CHECK (type IN ('text', 'image', 'gif', 'playlist', 'tierlist', 'discussion', 'watch_together')),
  content JSONB NOT NULL,  -- varies by type
  media_ids UUID[],  -- referenced media
  tags TEXT[],
  visibility TEXT DEFAULT 'public' CHECK (visibility IN ('public', 'followers', 'private')),
  stats JSONB DEFAULT '{}',  -- likes, comments, shares
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Watch together sessions
CREATE TABLE watch_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES profiles(id),
  anilist_id INTEGER NOT NULL,
  episode_number INTEGER NOT NULL,
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'paused', 'ended')),
  playback_state JSONB DEFAULT '{}',  -- {timestamp, speed, quality, audioTrack, subtitleTrack}
  participants UUID[] DEFAULT '{}',
  max_participants INTEGER DEFAULT 50,
  is_public BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

-- Recommendation signals (ML features)
CREATE TABLE recommendation_signals (
  user_id UUID NOT NULL REFERENCES profiles(id),
  anilist_id INTEGER NOT NULL,
  signal_type TEXT NOT NULL,  -- genre_fit, studio_fit, era_fit, theme_fit, community, popularity
  value REAL NOT NULL,
  weight REAL DEFAULT 1.0,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, anilist_id, signal_type)
);

-- Ranks & badges
CREATE TABLE user_ranks (
  user_id UUID PRIMARY KEY REFERENCES profiles(id),
  rank_id TEXT NOT NULL,
  xp BIGINT DEFAULT 0,
  tier TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE badge_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  criteria JSONB NOT NULL,  -- {type: 'watch_count', threshold: 100}
  tier TEXT CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum', 'diamond')),
  xp_reward INTEGER DEFAULT 0
);

CREATE TABLE user_badges (
  user_id UUID NOT NULL REFERENCES profiles(id),
  badge_id TEXT NOT NULL REFERENCES badge_definitions(id),
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  progress JSONB DEFAULT '{}',
  PRIMARY KEY (user_id, badge_id)
);
```

### Row Level Security (RLS)

```sql
-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_lists ENABLE ROW LEVEL SECURITY;
-- ... all tables

-- Profiles: users see all public, own private
CREATE POLICY "Public profiles readable" ON profiles
  FOR SELECT USING (true);
CREATE POLICY "Own profile writable" ON profiles
  FOR ALL USING (auth.uid() = id);

-- Media lists: own only (unless public profile)
CREATE POLICY "Own media lists" ON media_lists
  FOR ALL USING (auth.uid() = user_id);

-- Community posts: public + followers + own
CREATE POLICY "Visible posts" ON community_posts
  FOR SELECT USING (
    visibility = 'public'
    OR author_id = auth.uid()
    OR (visibility = 'followers' AND author_id IN (
      SELECT following_id FROM follows WHERE follower_id = auth.uid()
    ))
  );

-- Watch sessions: participants + public
CREATE POLICY "Session access" ON watch_sessions
  FOR SELECT USING (
    is_public = true
    OR host_id = auth.uid()
    OR auth.uid() = ANY(participants)
  );
```

---

## Realtime Channels

| Channel | Pattern | Events |
|---------|---------|--------|
| `community:posts` | `community:posts` | `INSERT`, `UPDATE`, `DELETE` on posts |
| `community:comments` | `community:comments:{postId}` | Comments on a post |
| `watch_together:{sessionId}` | `watch_together:{sessionId}` | `playback_state`, `user_join`, `user_leave`, `chat` |
| `notifications:{userId}` | `notifications:{userId}` | `mention`, `reply`, `follow`, `badge_earned`, `sync_status` |
| `downloads:{userId}` | `downloads:{userId}` | `progress`, `completed`, `failed` |
| `sync:{userId}` | `sync:{userId}` | `sync_start`, `sync_progress`, `sync_complete`, `conflict` |
| `extensions:{userId}` | `extensions:{userId}` | `installed`, `updated`, `disabled`, `error` |

**Client Subscription:**
```ts
// src/core/hooks/useRealtime.ts
export function useRealtime(channel: string, filter?: RealtimeFilter) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const ch = supabase.channel(channel);
    if (filter) ch.filter(filter);
    ch.on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: extractKeys(payload) });
    }).subscribe();

    return () => ch.unsubscribe();
  }, [channel, filter]);
}
```

---

## Authentication

### Providers

| Provider | Type | Config |
|----------|------|--------|
| **Email/Password** | Native | Supabase Auth |
| **Discord** | OAuth 2.0 | Discord Developer Portal |
| **Google** | OAuth 2.0 | Google Cloud Console |
| **GitHub** | OAuth 2.0 | GitHub OAuth Apps |
| **Magic Link** | Email | Supabase Auth |

### Token Flow

```
User logs in via OAuth
        │
        ▼
Supabase Auth → Returns JWT (access_token) + Refresh Token
        │
        ▼
Client stores in secure storage (HttpOnly cookie / Keychain / Keystore)
        │
        ▼
All API requests: Authorization: Bearer <access_token>
        │
        ▼
TatakaiAPI middleware validates JWT → extracts user_id, claims
        │
        ▼
Supabase RLS policies enforce row-level access
```

### Token Refresh

- **Access token:** 1 hour (JWT)
- **Refresh token:** 30 days (rotating)
- **Auto-refresh:** Client intercepts 401, calls `/auth/refresh`, retries

---

## Storage (Supabase Storage)

| Bucket | Purpose | Access |
|--------|---------|--------|
| `avatars` | User profile images | Public read, authenticated write |
| `media-covers` | Anime/manga/novel covers (cached) | Public read, service write |
| `extensions` | `.kai` packages for store | Public read, admin write |
| `downloads` | User download manifests (not files) | Private, user-only |
| `community-media` | Post images, GIFs | Public read, authenticated write |
| `backups` | User data exports | Private, user-only |

---

## Migrations

### Workflow

```bash
# 1. Create migration
pnpm db:migrate:create --name="add_watch_together_participants"

# 2. Edit SQL in supabase/migrations/YYYYMMDDHHMMSS_add_watch_together_participants.sql

# 3. Apply locally
pnpm db:push

# 4. Test, then commit

# 5. Deploy to production (via Supabase Dashboard or CI)
#    supabase db push --project-ref <ref>
```

### Rules

- **Never edit applied migrations** — create new ones
- **Always include `DOWN` migration** for rollback
- **Test locally** before pushing
- **Name descriptively:** `add_<table>_<column>`, `create_<table>`, `modify_<table>_<change>`

---

## Edge Functions (Beyond TatakaiAPI)

| Function | Trigger | Purpose |
|----------|---------|---------|
| `tatakai-api` | HTTP | Main API proxy |
| `webhook-anilist` | HTTP (AniList webhook) | Sync list changes in real-time |
| `webhook-mal` | HTTP (MAL webhook) | Sync list changes |
| `cron-recommendations` | Daily 03:00 UTC | Recompute recommendation signals |
| `cron-ranks` | Hourly | Update user ranks/XP |
| `cron-cleanup` | Daily 04:00 UTC | Prune old sessions, temp data |
| `extension-catalog` | HTTP | Public extension catalog API |

---

## Local Development

```bash
# Start Supabase stack (Docker required)
pnpm supabase:start

# Status
pnpm supabase:status

# Open Studio (DB UI)
pnpm db:studio  # http://localhost:54323

# Run migrations
pnpm db:push

# Generate types
pnpm db:generate

# Seed data
pnpm db:seed

# Stop
pnpm supabase:stop
```

### Local URLs

| Service | URL |
|---------|-----|
| API Gateway | `http://localhost:54321` |
| Database (PostgreSQL) | `postgresql://postgres:postgres@localhost:54322/postgres` |
| Studio | `http://localhost:54323` |
| Inbucket (Email) | `http://localhost:54324` |
| Redis | `redis://localhost:54325` |

---

## Production Deployment

### Supabase Project Settings

- **Region:** Closest to users (auto-detect)
- **Plan:** Pro (for Edge Functions, Realtime, larger DB)
- **Auth Providers:** Configure OAuth callbacks
- **RLS:** Enforced on all tables
- **Backups:** Daily (PITR on Pro)

### Edge Function Deploy

```bash
# Deploy all functions
pnpm supabase:functions:deploy

# Deploy single function
pnpm supabase:functions:deploy tatakai-api --project-ref <ref>

# View logs
pnpm supabase:functions:logs tatakai-api --project-ref <ref>
```

### Environment Variables (Production)

Set in Supabase Dashboard → Edge Functions → Environment Variables:

| Variable | Description |
|----------|-------------|
| `ANILIST_CLIENT_ID` | AniList OAuth app ID |
| `ANILIST_CLIENT_SECRET` | AniList OAuth secret |
| `MAL_CLIENT_ID` | MyAnimeList OAuth app ID |
| `MAL_CLIENT_SECRET` | MyAnimeList OAuth secret |
| `MANGABAKA_API_KEY` | MangaBaka API key |
| `REDIS_URL` | Upstash/Redis connection string |
| `ENCRYPTION_KEY` | 32-char key for settings encryption |
| `WEBHOOK_SECRET` | Shared secret for webhook validation |

---

## Monitoring & Observability

| Tool | Purpose |
|------|---------|
| **Supabase Dashboard** | DB metrics, API latency, auth stats |
| **Edge Function Logs** | Request/response, errors, duration |
| **PostgreSQL Stats** | `pg_stat_statements`, slow queries |
| **Realtime Metrics** | Connection count, message throughput |
| **Custom Events** | Business metrics (sync success, watch time) |

---

## Related Documents

- [Architecture Overview](architecture/overview.md) — Full system
- [Frontend Architecture](architecture/frontend.md) — React app
- [Desktop Architecture](architecture/desktop.md) — Electron
- [Extension System](extensions/overview.md) — Extension data contracts