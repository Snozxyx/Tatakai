# Community

`/community` was rebuilt for V6 as a **feed-first platform** rather than a
thread/board layout.

## Feed-first

The community centers on a scrolling feed of posts. Posts support:

- **Rich embeds** — anime/manga/media references render as cards inline.
- **Polls** — create and vote on polls within the feed.

UI lives under `src/components/community/` and `src/pages/community/`, with data
hooks in `src/hooks/community/`.

## Data model

Community content is backed by Supabase. Comments across the app — including
community — use the single **polymorphic comments table** (see
[../architecture/backend-and-data.md](../architecture/backend-and-data.md#notable-tables)),
so ranks/badges and comment features behave consistently everywhere.

> Polls and embeds depend on their migration being applied. Per this project's
> [migration policy](../guides/development.md#migrations), migrations are written
> but applied separately.

## Moderation

Community surfaces are covered by the moderation tooling — automod and Turnstile
challenges on abuse-prone actions. See
[admin-and-moderation.md](admin-and-moderation.md).

## Positioning

Community copy reflects Tatakai's positioning as an **extension-based otaku
community and companion app**. Keep public-facing copy aligned with that — avoid
"watch free / stream online" framing.
