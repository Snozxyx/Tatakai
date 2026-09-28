# Ranks & Badges

Tatakai has **two distinct progression systems** that are often confused. They are
separate and should stay separate in copy and code.

## Mitsu — one unified rank

**Mitsu** is a single, unified rank per user. It is **not** per-media and **not** a
set of parallel ladders — it's one rank computed from a **weighted score** across
the user's activity in different media (watching, reading, and other tracked
engagement).

- Each rank tier has its own visual effect, keyed `rn-1` through `rn-16`.
- Reading contribution uses a **chapter-sum proxy** — total chapters read stands in
  for reading effort in the weighted score.

Because it's one score, a user has exactly one Mitsu rank at a time; media types
contribute to it with different weights rather than producing separate ranks.

## Chikra — collectible badges

**Chikra** are **collectible badges** with rarity. Unlike Mitsu (a computed rank),
Chikra are discrete collectibles a user earns/collects, each with its own rarity
tier. They decorate a profile but do not feed the Mitsu score.

## Where it lives

- Rank/badge computation is backed by Supabase; writes to profile-owned fields go
  through **RPCs** (column-level grants mean privileged writes need a
  `SECURITY DEFINER` function — see
  [../architecture/backend-and-data.md](../architecture/backend-and-data.md#writes-go-through-rpcs)).
- Comments and other surfaces render a user's rank/badges consistently because they
  read from the shared profile model.

## Don't conflate them

- Mitsu = **one** rank, weighted across media, tiered `rn-1..16`.
- Chikra = **many** badges, collectible, rarity-tiered.

Treating Chikra as ranks (or Mitsu as per-media) is the common mistake — keep the
distinction.
