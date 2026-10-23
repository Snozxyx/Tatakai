# Community & Social Features

Tatakai goes beyond watching and reading by bringing fans together through a connected community experience: posts, tier lists, playlists, watch together, profiles, and leaderboards.

---

## Architecture

```
Community Features
├── Posts (text, images, GIFs, playlists, tier lists, discussions, watch-together)
├── Tier Lists (create, rank, share)
├── Playlists (curate, organize, share)
├── Watch Together (synchronized playback)
├── Profiles (stats, badges, ranks, favorites)
├── Social (follow, followers, notifications)
└── Leaderboards (rankings, XP, activity)
```

**Key Files:**
- `src/features/community/` — All community components
- `supabase/migrations/*_community_*.sql` — Schema
- `supabase/functions/tatakai-api/community/*` — API

---

## Community Posts

### Post Types

| Type | Content | Rendering |
|------|---------|-----------|
| **Text** | Markdown content | Rich text editor |
| **Image** | Single/multiple images | Gallery grid |
| **GIF** | GIF/Video loop | Inline player |
| **Playlist** | Curated media list | Interactive cards |
| **Tier List** | Ranked tiers (S-F) | Visual tier list |
| **Discussion** | Threaded comments | Nested comments |
| **Watch Together** | Session invite | Join button + countdown |

### Post Features

- **Mentions** (`@username`) → notifications
- **Media tags** (`#anime-title`) → links to detail
- **Polls** (discussion type) — multiple choice, timed
- **Bookmarks** — save for later
- **Share** — copy link, native share sheet
- **Report** — moderation queue

### Feed Algorithms

| Feed | Algorithm |
|------|-----------|
| **Following** | Chronological from followed users |
| **For You** | ML-ranked (interest graph, engagement) |
| **Trending** | Velocity (likes/comments/time) |
| **Local** | Nearby users (optional, opt-in) |

---

## Tier Lists

### Creation

- **Template:** S/A/B/C/D/F or custom tiers
- **Drag-drop** ranking within tiers
- **Search** to add titles (anime/manga/novels)
- **Cover art** auto-fetched
- **Description** per tier + per item

### Sharing

- **Public/Private/Unlisted**
- **Embed** in posts
- **Export** as image
- **Compare** with friends' lists

---

## Playlists

### Types

| Type | Use Case |
|------|----------|
| **Watchlist** | "To watch this season" |
| **Favorites** | "My top 10 mecha anime" |
| **Thematic** | "Best OP songs 2024" |
| **Mood** | "Comfort watches for bad days" |
| **Collaborative** | Multi-user editing |

### Features

- **Ordering:** Drag-drop, sort by (date, rating, progress)
- **Privacy:** Public / Followers / Private
- **Collaboration:** Invite editors, comment on items
- **Export:** JSON, CSV, image

---

## Watch Together

### Session Types

| Type | Max Participants | Sync Method |
|------|------------------|-------------|
| **Public** | 50 | WebRTC mesh |
| **Private** | 20 | WebRTC mesh |
| **Hosted** | 100 | Host streams via Cloudflare tunnel |

### Synchronization

- **96% two-way sync** (host clock + WebRTC)
- **Controls:** Play/pause, seek, speed, quality, audio, subtitles
- **Host privileges:** Kick, mute, lock controls
- **Chat:** Side panel (text, emojis, timestamps)

### Join Flow

```
Host creates session → Gets session code/link
        │
        ▼
Participants join → WebRTC handshake
        │
        ▼
Host loads episode → Sources resolved
        │
        ▼
Host plays → Timestamp broadcast
        │
        ▼
Participants sync → Local player seeks
```

### Host-Streamed (Large Groups)

1. Host resolves sources locally
2. Streams via local proxy
3. Cloudflare quick tunnel exposes proxy publicly
4. Participants play single HLS stream
5. **Lower sync precision** but scales to 100+

---

## Profiles

### Profile Sections

| Section | Content |
|---------|---------|
| **Header** | Avatar, banner, username, bio, links |
| **Stats** | Days watched, episodes, chapters, novels, mean score |
| **Badges** | Earned badges (display up to 6 featured) |
| **Rank** | Community rank + XP progress |
| **Favorites** | Characters, anime, manga, novels (grid) |
| **Activity** | Recent posts, reviews, list updates |
| **Lists** | Quick links to anime/manga/novel lists |

### Customization

- **Theme:** Per-profile theme (overrides app theme for visitors)
- **Layout:** Compact / Comfortable / Dense
- **Featured:** Pin 3 posts, 1 tier list, 1 playlist
- **Privacy:** Public / Followers / Private

---

## Social Graph

### Follow System

- **Follow** → See their posts in Following feed
- **Followers** → Who follows you
- **Mutuals** → Both follow each other
- **Block** → Hide all interaction

### Notifications

| Type | Trigger |
|------|---------|
| **Mention** | `@username` in post/comment |
| **Reply** | Comment on your post |
| **Follow** | New follower |
| **Like** | Like on your post |
| **Badge** | New badge earned |
| **Watch Together** | Invite to session |
| **System** | Updates, maintenance, moderation |

**Delivery:** In-app (real-time), Push (mobile), Email (digest)

---

## Leaderboards

### Ranking Dimensions

| Leaderboard | Metric |
|-------------|--------|
| **Global XP** | Total experience points |
| **Watch Time** | Hours watched (anime) |
| **Read Count** | Chapters read (manga/novels) |
| **Completionist** | Completed series count |
| **Reviewer** | Reviews written × helpful votes |
| **Social** | Followers × engagement |
| **Monthly** | Reset monthly (seasonal) |

### Ranks & Badges

| Rank | XP Required | Perks |
|------|-------------|-------|
| **Novice** | 0 | — |
| **Fan** | 1,000 | Custom profile accent |
| **Otaku** | 5,000 | Animated badge frame |
| **Senpai** | 15,000 | Profile theme slot |
| **Sensei** | 50,000 | Custom profile CSS |
| **Legend** | 150,000 | Name in credits |

**Badges:** 50+ badges for milestones (first 100 anime, all Ghibli, night owl, etc.)

---

## Moderation

### Tools

- **Report queue** (posts, comments, profiles)
- **Content filter** (NSFW, spoilers, spam)
- **User actions:** Warn, mute, ban, shadowban
- **Audit log** — all moderator actions

### Community Guidelines

- No piracy links (discussion OK, direct links removed)
- NSFW marked and hidden by default
- Spoiler tags required for unaired content
- Respectful discourse enforced

---

## API

### Posts

```ts
// GET /api/v3/community/posts?feed=following&limit=20
// POST /api/v3/community/posts
// GET /api/v3/community/posts/:id
// POST /api/v3/community/posts/:id/like
// POST /api/v3/community/posts/:id/comments
```

### Profiles

```ts
// GET /api/v3/community/profiles/:userId
// PATCH /api/v3/community/profiles/me
// GET /api/v3/community/profiles/:userId/badges
// GET /api/v3/community/profiles/:userId/rank
```

### Watch Together

```ts
// POST /api/v3/community/watch-together/create
// POST /api/v3/community/watch-together/:id/join
// WS /api/v3/community/watch-together/:id/sync
```

---

## Settings (Settings → Community)

| Category | Options |
|----------|---------|
| **Profile** | Visibility, customization, featured content |
| **Notifications** | Per-type toggles, push, email digest |
| **Privacy** | Profile visibility, follow requests, block list |
| **Feed** | Default feed, content filters, NSFW handling |
| **Watch Together** | Auto-join permissions, chat settings, host preferences |

---

## Related

- [Video Player](features/playback.md#watch-together)
- [Recommendations](features/recommendations.md)
- [Profiles](features/community.md#profiles)
- [Architecture → Backend](architecture/backend.md#realtime-channels)