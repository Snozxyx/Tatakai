# Recommendations

V6 ships an **in-house recommendation engine**. The previous "Sprout" recommender
was dropped because it wasn't reproducible — its model weights and atlas data were
gitignored and absent, so it couldn't be rebuilt or verified. In its place is a
hybrid engine plus a SQL collaborative model that live entirely in this repo.

## Hybrid engine

Recommendations combine two signals:

- **Content-based** — similarity over media attributes (genres, tags, format,
  and related metadata) so a title can be recommended from a cold start.
- **Collaborative** — a SQL-side model over aggregate user activity (what
  co-watches/co-reads with what), so popular co-engagement surfaces relevant
  titles.

The two are blended into a single ranked list rather than shown as separate rails.

## Why the rebuild

The old recommender depended on artifacts that aren't in version control, which
made it impossible to reproduce a build or reason about its output. The V6 engine
is intentionally **self-contained**: everything it needs to run is either in the
client code or expressed as SQL against tables the app already owns.

## Where it lives

- Client scoring/blending: `src/core/` recommendation logic.
- Collaborative model: SQL against Supabase (see
  [../architecture/backend-and-data.md](../architecture/backend-and-data.md)).

## Related

- Continue Watching and resume state feed engagement signals:
  [downloads-and-offline.md](downloads-and-offline.md#continue-watching-netflix-style).
- Ranks reflect activity too, but are a separate system:
  [ranks-and-badges.md](ranks-and-badges.md).
