# Full Feature and Tools Optimization Master Plan

Date: 2026-04-18
Environment audited: https://api.tatakai.me:8088/
Account action completed: test user registered with display name `bot`
Goal: Optimize performance, reliability, and UX across all features and tools without removing or compromising capability.

## 1. Audit Summary

### 1.1 What was validated in browser

The following feature routes were navigated and loaded:
- `/`
- `/search`
- `/search/producer/Funimation`
- `/trending`
- `/collections`
- `/favorites`
- `/profile`
- `/community`
- `/suggestions`
- `/languages`
- `/genre/action`
- `/manga`
- `/status`
- `/downloads`
- `/settings`
- `/recommendations`
- `/tierlists`
- `/playlists`
- `/auth`
- `/terms`
- `/privacy`
- `/dmca`

Additional deep checks:
- `/watch/one-piece-100?ep=107149`
- Registration flow on `/auth` completed successfully (toast observed: account created).

### 1.2 Runtime issues observed during audit

- Repeated CORS failures to external backend endpoints under `db.gabhasti.tech` for analytics/maintenance/popups in local runtime.
- Non-critical external request failures are noisy and can delay perceived readiness.
- Startup request fan-out remains high (multiple sections/images/feeds loading in parallel).

## 2. Non-Negotiable Constraints (No Feature Compromise)

1. No route, module, or user-facing capability is removed.
2. Security controls remain enabled (auth, admin checks, devtools guard logic, proxy password, abuse controls).
3. Existing API contracts remain backward-compatible.
4. UX quality is improved via progressive rendering, not by reducing content scope.
5. Analytics and diagnostics remain available, but must not block critical user flows.

## 3. Complete Feature and Tool Surface (From Route and Runtime Inventory)

### 3.1 Base Discovery and Browsing
- Home, Search, Producer Search, Genre, Trending, Languages, Recommendations, Suggestions, Schedule.

### 3.2 Watch Stack
- Anime detail, episode watch, stream source selection, server failover, watch room, isshoni rooms.

### 3.3 Manga Stack
- Manga home, genre browse, manga detail, reader.

### 3.4 Social and Community
- Community feed, forum posts/new post, playlists, tierlists, wrapped/stats, profile/public profile.

### 3.5 Account and Policy
- Auth, onboarding, setup, password reset/update, terms, privacy, DMCA, ban/maintenance/status pages.

### 3.6 Platform/Tooling Layer
- AuthContext bootstrap + profile load
- React Query cache/retry policies
- API client failover/proxy strategy
- Stream proxy (Node proxy + TatakaiAPI balancer)
- Analytics + popup/maintenance probes
- PWA/service worker behavior
- Production runner scripts and restart guard

## 4. Optimization Plan by Feature Cluster

## Phase A: Global Startup and Shell Performance

1. Prioritize first contentful experience across all route groups.
- Render route shells immediately with deterministic skeletons.
- Keep auth/profile checks asynchronous for non-sensitive pages.

2. Apply startup budget policy.
- Mark startup calls as `critical` or `non-critical`.
- Non-critical calls must be deferred until first meaningful paint.

3. Add startup concurrency governor.
- Limit parallel initial fetches to prevent request bursts.
- Queue lower-priority sections (community extras, long-tail recommendation blocks).

## Phase B: Auth and User Bootstrap (No Access Regression)

1. Keep strict access control for privileged routes only.
- Admin/moderation flows remain strict-gated.
- Browse routes render while auth/profile finalizes.

2. Make profile and ancillary account lookups fail-fast and resilient.
- Timeout + fallback behavior to avoid full UI stalls.
- Retry only where user action requires strong consistency.

3. Preserve account flows while reducing friction.
- Signup/signin continues unchanged in behavior.
- Improve toast/error clarity for backend/CORS/network failures.

## Phase C: Home/Search/Discovery Throughput

1. Stage homepage content loading.
- Priority order: hero + trending + latest episodes.
- Secondary: genre clouds, long-tail curated sections, community widgets.

2. Reduce duplicate fetches.
- Ensure query keys and refetch settings avoid accidental over-fetch.
- Reuse cache between related pages (search/genre/trending cards).

3. Adopt image loading strategy per viewport.
- Eager load only above-the-fold media.
- Lazy + placeholder + retry fallback for lower sections.

## Phase D: Watch + Proxy + 502 Hardening

1. Keep stream reliability features, reduce cascade failure probability.
- Circuit breaker and adaptive cooldown in balancer/proxy path.
- Bounded retry fan-out per request (referer/host attempts capped).

2. Add in-flight deduplication for stream/proxy calls.
- Coalesce identical requests to avoid storms under instability.

3. Strengthen source switch UX.
- Fast switch on repeated upstream errors.
- Preserve subtitle/audio/position state through server switch.

4. Add per-host health scoring and quarantine expiry metrics.
- Better host rotation decisions without suppressing viable sources too long.

## Phase E: Community/Playlist/Tierlist Stability

1. Keep collaborative features intact while lowering load cost.
- Cursor-based pagination defaults for long lists.
- Partial hydration of comments/reactions blocks.

2. Improve editor-heavy pages.
- Debounce expensive operations in tierlist/playlist editors.
- Cache draft state locally and sync in background.

## Phase F: Observability and Operational Tools

1. Introduce structured logs for all critical flows.
- Startup stages, auth transitions, proxy failover, section readiness.

2. Add metrics endpoint/dashboard contract.
- p50/p95 first content render, failed external calls, 502 rate, retry counts, circuit-open duration.

3. Alerting policy.
- Trigger on sustained spikes in startup failures, 502 loops, auth bootstrap timeouts.

## 5. Route-Level Action Matrix (No Feature Removal)

1. Home (`/`)
- Keep all sections.
- Progressive section hydration + concurrency cap.

2. Search/Discovery (`/search`, `/genre/*`, `/trending`, `/languages`)
- Cache reuse + incremental image loading.

3. Watch (`/anime/*`, `/watch/*`, `/isshoni*`)
- Proxy failover hardening + dedup + host scoring.

4. Manga (`/manga*`)
- Keep full feature set; lazy lower blocks in reader page.

5. Profile/Social (`/profile`, `/community`, `/tierlists`, `/playlists`)
- Keep interactions; optimize initial payload and lazy heavy subpanels.

6. Settings/Admin/Status (`/settings`, `/admin`, `/status`)
- Keep strict auth/role behavior.
- Improve diagnostics surfaces for runtime health.

## 6. Implementation Order

1. Startup orchestration and auth/bootstrap tuning.
2. Discovery/home progressive hydration and query policy tuning.
3. Proxy/balancer 502 anti-cascade reinforcement.
4. Community/editor page optimization.
5. Metrics, alerting, and release hardening.

## 7. Verification Checklist

1. Functional parity
- All audited routes still render and operate.
- No route removed, no action disabled.

2. Performance
- First meaningful content time reduced on `/` and `/search`.
- Lower startup network concurrency peaks.

3. Reliability
- Simulated 502/timeout tests show bounded retries and faster recovery.
- No retry storms for identical stream targets.

4. Account flow
- Signup/signin still succeeds (bot registration already validated in audit).

5. Production
- Build/typecheck pass for root and TatakaiAPI.
- Production startup script remains stable with restart controls.

## 8. Success KPIs

- Homepage first meaningful content p95
- Search result first paint p95
- Watch start success rate
- Stream 502 rate and median recovery time
- Auth bootstrap timeout incidence
- External non-critical failure impact score (must trend toward zero user-visible impact)

## 9. Rollout Strategy

1. Canary deployment with metrics watch.
2. Expand to staged rollout after 24-48h stability.
3. Keep config toggles for fast rollback of specific optimizations.
