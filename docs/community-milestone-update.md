# Community milestone and analytics update

The 1,000-member celebration is a snapshot of existing profiles at migration
time. Future signups do not receive OG automatically. Existing OG grants are
preserved; the milestone grant uses the permanent admin source so background
badge recomputation cannot revoke it. All new badge grants create a private
reward notification. On the home screen the recipient can equip the badge as
their featured badge or keep it in their collection. Acknowledgement is stored
server-side, so it does not replay on every device.

Apply these migrations in order using the normal authenticated deployment flow:

- `20261015010000_milestone_rewards_and_community_controls.sql`
- `20261015011000_accurate_engagement_analytics.sql`
- `20261015012000_dashboard_server_aggregates.sql`

The linked CLI requires a Supabase access token. These changes do not grant
users a badge until the first migration is applied to the live database.

Image-post approval defaults off. Admin → Content moderation contains the approval
switch. When enabled, image posts below Jonin rank enter staff review; the
database trigger enforces the rule and prevents authors from approving their
own queued posts. This controls staff approval, independently of email ownership
verification and the existing content moderation checks.

## Analytics definitions

- DAU and visitor trends use distinct observed identities per UTC day. Signed-in
  members are deduplicated across devices. Guests remain device-based estimates.
- Device visits before and after sign-in are linked when the device has exactly
  one observed member account. Shared devices with multiple accounts keep guest
  visits separate rather than guessing which account they belong to.
- D1 and D7 retention use first-observed cohorts and actual activity on day 1 or
  day 7. The follow-up day must have finished before the cohort is eligible.
- Daily retained visitors were active on both the previous day and that day.
  Returning visitors have an observation before the day in question.
- Foreground active time is sampled every 30 seconds only for visible tabs with
  interaction within five minutes. Concurrent tabs/devices are deduplicated per
  identity and time bucket. This is measured activity, not inferred time between
  page views. No historical foreground time is fabricated.
- Visit sessions now expire after 30 minutes of inactivity. Historical session
  identifiers were persistent device identifiers, so legacy session totals are
  not directly comparable with new visits. Watch time remains separate from
  foreground time and is attributed to the watch session's start day.
- Server aggregates do not depend on the PostgREST response-row cap. Dashboard
  breakdowns return chart-sized payloads, with no client downloads of visit or
  watch-history tables. Each panel loads independently. Requests have a 15-second
  deadline and an explicit retry control instead of an indefinite loading screen.

## Translation and release notes

Settings → Display shows engine, readiness, cached-model state, and download
progress. Lite mode uses only browser language packs and never starts the large
fallback model. Pack sizes/support are controlled by the browser; there is no
claim of a universally smaller multilingual model. Automatic mode can use the
existing approximately 650 MB offline model. Post text stays on the device.

After the app version changes, release notes open in a sheet on a safe route.
The last acknowledged version is stored locally. A new install establishes a
baseline rather than reporting a fictitious update. Existing installations with
the earlier v6 announcement marker receive the new sheet on their first run.

Toko now includes a separate `atsu-novel` provider using Atsu's prose API; manga
image sources stay separate. Rebuild/reinstall the Toko bundle to use it. The
standalone health response and Tatakai discovery include novel routes.

Production builds retain console calls for Developer Mode. Ctrl/Cmd+Shift+I
opens the in-app log viewer when enabled. Listener cleanup prevents repeated
toggles; console objects with circular references cannot crash the viewer.

## Server B review, 2026-10-15

The badge and engagement RPCs were already present when reviewed. The dashboard
aggregate migration had invalid SQL aliases (`hour` and `returning`); these were
fixed and the approved dashboard migration was installed separately. Its admin
role check and seven-day / hourly aggregates were verified on B. Review live
migration history before future changes; do not blindly replay the OG cohort
grant against accounts created after the milestone.

All 139 migration files pass the PostgreSQL statement/function parser. Isolated
PostgreSQL tests cover the new reward, moderation, analytics and numeric trending
function contracts. Application release workflows do not apply database SQL.
