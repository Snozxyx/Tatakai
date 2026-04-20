# Tatakai Performance and 502 Optimization Plan

Date: 2026-04-18
Scope: Frontend startup latency, homepage perceived load time, provider/proxy 502 timeout resilience
Environment reviewed: http://localhost:8088/

## 1. Browser Findings (Live Review)

The live browser session shows the app can render shell content quickly but real content readiness is delayed by network fan-out and external dependency instability.

Measured from Performance API (live page):
- Navigation DCL: about 737 ms
- Load event end: about 1324 ms
- Home API (`/api/tatakai/home`) duration: about 608 ms
- Multiple genre fetches near 900-1030 ms each
- External image and third-party calls are among slowest entries

Observed failure patterns in browser events:
- Frequent failed calls to `db.gabhasti.tech` (profile/analytics/maintenance/image proxy)
- Frequent failed analytics/third-party calls (`google-analytics`, external image hosts)
- ORB-related image blocks and intermittent network IO suspension/abort errors

Practical impact:
- Users see UI shell but content modules lag while many parallel requests compete
- Upstream/provider instability can produce repeated 502-related playback issues

## 2. Optimization Goals

- Reduce time to first meaningful homepage content
- Keep core browsing usable when optional external services fail
- Prevent timeout/cooldown retry storms that amplify 502 failures
- Improve observability to pinpoint the true bottleneck quickly

## 3. Prioritized Plan

### Phase A: First Content Fast (Frontend UX)

1. Remove global auth-loading hard block for browse routes.
- Keep strict loading gate only for sensitive routes (admin, privileged actions).
- Allow homepage/content skeletons to render immediately.

2. Make auth bootstrap fail fast.
- Add session bootstrap timeout.
- Decouple profile loading from initial route paint.

3. Make home bootstrap request fail fast.
- Keep low retry budget and shorter timeout for `/home`.
- Show stable skeleton sections and progressively hydrate content.

4. De-prioritize non-critical startup calls.
- Delay analytics and optional profile/activity pings until after first content render.
- Batch low-priority events instead of immediate fan-out.

### Phase B: External Dependency Containment

1. Treat analytics and optional integrations as non-blocking.
- All failures must be swallowed without affecting user-visible rendering.

2. Reduce early parallel network pressure.
- Limit concurrent genre/image warmups on initial homepage load.
- Defer lower-importance sections until primary hero/trending/latest are shown.

3. Image strategy hardening.
- Keep robust fallback chain for images (proxied -> direct -> placeholder).
- Avoid startup dependence on fragile external image proxies.

### Phase C: 502 and Timeout Resilience (Proxy/API)

1. Add adaptive cooldown thresholds.
- Do not block host on first transient timeout.
- Require repeated failures before activating cooldown.

2. Add balancer circuit breaker.
- Open circuit temporarily after consecutive failures.
- Prevent cascading retries under upstream outages.

3. Cap fan-out attempts per request.
- Limit referer and retry combinations.
- Reduce per-attempt timeout to bounded values.

4. Add request coalescing for identical upstream targets.
- Deduplicate in-flight requests to avoid request storms.

### Phase D: Observability and Runtime Safety

1. Structured failure logs.
- Log status, host, referer, timeout reason, route, latency, cooldown/circuit state.

2. Runtime metrics endpoint.
- Expose balancer state, cooldown counts, circuit status, and active inflight requests.

3. Production process safety.
- Keep supervised start command and bounded restart strategy.
- Ensure graceful shutdown and crash diagnostics are always available.

## 4. Execution Checklist

1. Frontend startup path
- Verify browse routes are no longer blocked by auth bootstrap.
- Verify homepage skeleton appears instantly and content fills progressively.

2. Network containment
- Verify failure of analytics or external profile endpoints does not impact core page rendering.
- Verify reduction in startup parallel request pressure.

3. Proxy/API resilience
- Inject synthetic 502/503/timeouts.
- Verify no retry storm and bounded total request time.
- Verify circuit opens and recovers correctly.

4. Regression
- Run type checks and build for both root app and TatakaiAPI.
- Validate watch/search/home critical flows.

## 5. Success Metrics

Track these after rollout:
- p50/p95 time to first meaningful homepage content
- homepage API timeout/failure rate
- 502 rate for stream/proxy routes
- average retries per proxy request
- circuit-open frequency and recovery time
- user-reported "blank/slow homepage" incidents

## 6. Rollout Strategy

1. Deploy in canary mode (small percentage of users).
2. Monitor metrics for 24-48 hours.
3. Expand rollout gradually if no regressions.
4. Keep conservative fallback toggles available for quick rollback.
