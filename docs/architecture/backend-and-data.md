# Backend & Data

Two things sit behind the clients: a thin **API proxy** and a **Supabase**
project. This document covers both, plus the data-model quirks that most often
trip people up.

## The API proxy

Location: `tatakaiapi/` (tracked alongside the `TatakaiAPI` submodule) with an
increasing amount of provider logic living in **extensions** such as
`extension/toko`.

Responsibilities:

- **Provider aggregation** — unify many streaming/manga providers behind one
  surface so clients don't special-case each host.
- **CORS / request proxying** — reach provider hosts that browsers can't, and
  normalize responses.
- **Secret custody** — provider keys, OAuth client secrets, and webhook URLs stay
  server-side. For example, AniList/MAL account linking uses a **server-side OAuth
  exchange**; if it returns `invalid_client`, the secrets are missing from the
  API's `.env` (not the repo-root `.env`). Desktop completes OAuth via the
  `tatakai://` deep link.
- **Webhooks** — outbound notifications (e.g. review-popup → Discord) go through
  the proxy so no webhook URL is exposed to the client.

Provider work is exposed through an **extension-API** surface (e.g.
`/api/v3/<ns>/…`) that both the proxy and the desktop
[extension-API host](desktop.md#runtime-subsystems-desktopruntime) can serve, which
is why the same provider can back the web and desktop apps.

## Supabase (`supabase/`)

```
supabase/
├── config.toml       local config
├── main.sql          baseline schema
├── migrations/       ~125 timestamped migration files
└── functions/        edge functions
```

Auth, Postgres (via PostgREST + RPCs), storage, and edge functions. A few
characteristics strongly shape how you work with the schema.

### Profiles and the two id-spaces

`profiles` has **two different identifiers** for "a user":

- `profiles.id` — the profile row's own primary key.
- `profiles.user_id` — the auth user id.

They are **not interchangeable**. Querying with the wrong one returns *no rows*
rather than an error, so bugs here are silent. Always be explicit about which id a
query, foreign key, or RPC expects.

### Writes go through RPCs

Privileged columns on `profiles` are protected by **column-level grants**, so
privileged writes are performed by `SECURITY DEFINER` functions (RPCs) rather than
direct `UPDATE`s from the client. When adding a profile write, add/extend an RPC
instead of granting broad table access.

### The `mappings` schema is not exposed to PostgREST

The `mappings` schema is **not reachable through PostgREST**, so id-mapping calls
against it don't resolve; the resolver falls back to stubs. Don't assume live id
mapping is available through the normal data API.

Related: **manga and anime ids can collide.** Classify a written work by its
`format`, never by inferring from chapter/volume counts.

### Notable tables

- `playback_telemetry` — source latency/failure instrumentation for stream
  diagnostics.
- `recommendation_feedback` — like/dislike/already-seen signals feeding the
  recommender.
- A **single polymorphic comments table** — the four previously separate comment
  systems were unified into one table (with per-item `media_format`), used for
  playlists, episodes, manga (global + per-chapter), and more.

### Ranks & badges

The rank/badge model lives in the schema and is surfaced across profiles and
comments:

- **Mitsu** — ONE unified rank computed from a weighted score across a user's
  anime + manga activity, with per-rank animated name effects (`rn-1`…`rn-16`).
  Reading contribution uses a chapter-sum proxy.
- **Chikra** — collectible badges with rarity tiers.

See [features/ranks-and-badges.md](../features/ranks-and-badges.md).

## Working with migrations

This repo treats migrations as **written, not applied** — authoring a migration
and applying it are always separate steps, and applying is a separate ask.

- There is no local Postgres/`psql` in this workflow; **`npm run check:migrations`**
  (validation, run to convergence — it needs two passes) is the check that runs.
- The migration history is **not cleanly replayable** from an empty database
  (`supabase db reset` fails on the first file), so "verified on a fresh database"
  is not a claim this project can make. Validate SQL with the parser-based check
  instead.

See [guides/development.md](../guides/development.md) for the exact commands.
