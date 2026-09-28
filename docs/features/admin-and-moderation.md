# Admin & Moderation

V6 includes a multi-phase rebuild of the admin, moderation, security, and news
tooling. Work began 2026-09-25 and is **foundations-first**: shared plumbing and
data model before individual surfaces.

## Approach

- **Foundations first** — establish the admin data model, access checks, and
  shared components before building out each admin surface.
- **Drop retired sections** — tables backing retired admin sections are removed
  rather than left dangling, so the schema reflects what actually ships.
- **Broad analytics instrumentation** — admin surfaces are instrumented so the app
  records the signals needed for moderation and operational insight.

## Automod & Turnstile

Abuse-prone actions across the app are protected by:

- **Automod** — automated moderation rules on user-generated content and actions.
- **Turnstile challenges** — Cloudflare Turnstile is required on abuse-prone
  actions to raise the cost of automated abuse.

These cover community and other user-facing write surfaces (see
[community.md](community.md#moderation)).

## Where it lives

- Admin UI: `src/pages/` admin surfaces and `src/components/` admin modules. The
  large `AdminPage` has been split into presentational + logic modules
  (e.g. `UserManagementTab`, `StatTile`) as part of the ongoing code-cleanup pass.
- Access control and privileged writes go through Supabase RPCs
  (`SECURITY DEFINER`), consistent with the rest of the app — see
  [../architecture/backend-and-data.md](../architecture/backend-and-data.md#writes-go-through-rpcs).

## Migrations

Schema changes for the admin/moderation rebuild (including dropping retired-section
tables) are **written but applied separately**, per this project's
[migration policy](../guides/development.md#migrations).
