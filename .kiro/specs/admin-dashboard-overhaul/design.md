# Design Document — Admin Dashboard Overhaul

## Overview

This feature overhauling the Tatakai admin dashboard (`/admin`) across three capability areas:

1. **Electron Desktop Monitoring** — three new panels (Update Management, Log Viewer integration, Crash Reports) visible only when `window.electron` is defined.
2. **Analytics System Expansion** — four new analytics panels (User Statistics, Extension Analytics, Streaming & Download Analytics, Performance Insights) added to the existing analytics section.
3. **Moderation/Ban System Enhancement** — timed/preset bans, device ID bans, IP bans, bulk ban actions, ban templates, and a full ban audit log.

All new React components follow the existing patterns in `src/components/admin/`: self-contained TSX files using `@tanstack/react-query` for data fetching, Tailwind CSS + `GlassPanel` for layout, and `sonner` for toast notifications. New Supabase tables and RPCs are added via migration files. The existing `AdminPage.tsx` navigation list (`navItems`) is extended with new tab entries.

---

## Architecture

### High-Level Component Placement

```
AdminPage.tsx (route /admin)
  ├── navItems[]                       ← extended with new entries
  ├── TabsContent "analytics"
  │   ├── AnalyticsActiveUsers         (existing)
  │   ├── AnalyticsDashboard           (existing)
  │   ├── UserStatsPanel               (new)
  │   ├── ExtensionAnalyticsPanel      (new)
  │   ├── StreamingAnalyticsPanel      (new)
  │   └── PerformanceInsightsPanel     (new)
  ├── TabsContent "updates"            (new — admin + desktop only)
  │   └── UpdateManagementPanel        (new)
  ├── TabsContent "crashes"            (new — admin + desktop only)
  │   └── CrashReportPanel             (new)
  ├── TabsContent "logs" (admin tab)   (new — desktop only)
  │   └── LogViewerPanel               (existing, integrated here)
  ├── TabsContent "users"
  │   ├── [existing user table]        (extended: checkboxes, ban duration display)
  │   └── BulkBanToolbar               (new)
  └── TabsContent "moderation"
      ├── [existing moderation content]
      ├── BanManagementSection         (new)
      │   ├── TimedBanDialog           (new)
      │   ├── DeviceBanPanel           (new)
      │   ├── IPBanPanel               (new)
      │   └── BanTemplatesPanel        (new)
      └── BanAuditLogPanel             (new)
```

### Data Flow

```
Supabase (PostgreSQL)
  update_policies          ← read/write (Update Management Panel)
  ban_history              ← read (Ban Audit Log)
  device_bans              ← read/write (new — Device Ban Panel)
  ip_bans                  ← read/write (new — IP Ban Panel)
  ban_templates            ← read/write (new — Ban Templates Panel)
  profiles                 ← read/write (User Stats, bans, version distribution)
  watch_sessions           ← read (Streaming Analytics)
  page_visits              ← read (User Stats — DAU/country)
  playback_telemetry       ← read (Streaming/Download Analytics, Perf)
  extensions               ← read (Extension Analytics)
  extension_audit_log      ← read (Extension Analytics)

Electron IPC (window.electron)
  logTail(500)             ← Log Viewer Panel
  onCrashPrevious(cb)      ← Crash Report Panel
  updateCheck(channel)     ← Update Management Panel
  updateGetHistory()       ← Update Management Panel
  perfGetHistory(20)       ← Performance Insights Panel

Browser localStorage
  acknowledged_crash_ids   ← Crash Report Panel (acknowledged IDs)
```

### Electron Detection Pattern

All Electron-gated UI uses the existing `useIsDesktopApp` hook (which checks `window.electron`) to conditionally add nav items and render panels. The pattern mirrors how `LogViewerPanel` is already conditionally toggled.

---

## Components and Interfaces

### 1. Update Management Panel — `UpdateManagementPanel.tsx`

```typescript
interface UpdatePolicy {
  id: string;
  channel: 'stable' | 'beta' | 'experimental';
  type: 'mandatory' | 'recommended' | 'experimental' | 'rollback';
  target_version: string;            // semver \d+\.\d+\.\d+
  rollback_from_version?: string;
  active: boolean;
  notes?: string;
  published_at: string;              // ISO 8601
}

interface CreatePolicyForm {
  channel: UpdatePolicy['channel'];
  type: UpdatePolicy['type'];
  target_version: string;
  rollback_from_version?: string;
  notes?: string;
}

// Status label mapping
const UPDATE_STATUS_LABELS: Record<string, string> = {
  checking: 'Checking…',
  available: 'Update available',
  'not-available': 'Up to date',
  downloading: 'Downloading…',
  downloaded: 'Ready to install',
  'mandatory-update': 'Mandatory update required',
  error: 'Check failed',
};
```

Queries: `supabase.from('update_policies').select('*').order('published_at', { ascending: false }).limit(200)`

Mutations: insert new policy, update `active = false` for deactivation.

Error handling: the unique index `update_policies_one_active_per_channel` causes a Postgres constraint error when inserting a duplicate active policy per channel — catch and display the prescribed message.

### 2. Crash Report Panel — `CrashReportPanel.tsx`

```typescript
interface CrashReport {
  id: string;
  date: string;   // ISO 8601 timestamp from crash service
  path: string;   // path to crash dump file
}
```

State: `crashes: CrashReport[]` populated by `window.electron.onCrashPrevious` listener. On mount, reads `acknowledged_crash_ids` from localStorage and filters out any crash whose id is in that list. Max 50 crashes rendered.

### 3. User Statistics Panel — `UserStatsPanel.tsx`

```typescript
type TimeRange = 'day' | 'week' | 'month';

interface SignupGroup { date: string; count: number; }
interface DauPoint   { date: string; dau: number; }
interface CountrySignup { country: string; count: number; }

interface UserStatsData {
  totalCount: number;
  signupGroups: SignupGroup[];
  dauSeries: DauPoint[];
  retentionPercent: number;        // fixed trailing 30-day cohort
  topCountries: CountrySignup[];
}
```

Data source: `profiles` (total count, signups, country), `page_visits` (DAU proxy via user_id distinct counts per day). Retention computed client-side from two queries: cohort (signups last 30 days), activity (page_visits with user_id in cohort within 7 days of their created_at).

### 4. Extension Analytics Panel — `ExtensionAnalyticsPanel.tsx`

```typescript
interface ExtensionMetrics {
  id: string;
  name: string;
  totalInstalls: number;
  activeUsers: number;            // extensions.downloads - uninstalled (proxy via status='approved' entries)
  recentInstalls: number;         // installs in last 30 days
  healthScore: number;
  uninstallRate: number | null;   // null when totalInstalls === 0
}
```

Health score sourced from the `extensions` table (computed as `rating / 5` as a proxy, or from a dedicated health_score column if added). Extension analytics data sourced primarily from `extensions` table plus `extension_audit_log` (from `tatakaiRuntime.getExtensionAuditLog()`).

### 5. Streaming & Download Analytics — `StreamingAnalyticsPanel.tsx`

```typescript
interface StreamingMetrics {
  totalSessions: number;
  peakConcurrent: number;         // max count in any 1-hour bucket
  durationBuckets: { label: string; count: number }[];
  providerBreakdown: { provider: string; count: number }[];
}

interface DownloadMetrics {
  topContent: { content_id: string; title?: string; completedCount: number }[];
  completionRate: number | null;  // null when denominator = 0
}
```

Data source: `watch_sessions` (streaming), `playback_telemetry` (provider breakdown via `event_type = 'source_resolved'`), `watch_sessions` join logic for download completion.

### 6. Performance Insights Panel — `PerformanceInsightsPanel.tsx`

```typescript
interface VersionDistribution { version: string; percent: number; count: number; }
interface PerfSnapshot { timestamp: number; heapUsedMB: number; rssMB: number; }

interface PerformanceInsightsData {
  versionDistribution: VersionDistribution[];
  adoptionRate: number | null;    // null when no active stable policy
  crashRateSeries: { date: string; count: number }[];
  perfSnapshots: PerfSnapshot[];  // from IPC, empty when window.electron undefined
}
```

### 7. Ban System Extensions

```typescript
// Existing ban dialog — extended
interface BanDialogState {
  userId: string;
  durationType: 'permanent' | '7d' | '30d' | 'custom';
  customHours?: number;           // 1–8760
  reason: string;
  templateId?: string;
}

interface DeviceBan {
  id: string;
  device_id: string;              // 1–255 chars
  reason: string;                 // 1–500 chars
  banned_by: string;              // admin user_id
  created_at: string;
  expires_at?: string | null;
}

interface IpBan {
  id: string;
  ip_address: string;             // IPv4 or IPv6
  reason: string;                 // 1–500 chars
  banned_by: string;
  created_at: string;
  expires_at?: string | null;
}

interface BanTemplate {
  id: string;
  name: string;                   // 1–100 chars, unique
  reason: string;
  duration_hours: number | null;  // null = permanent
  created_by: string;
  created_at: string;
}

interface BanAuditRecord {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  action: 'banned' | 'unbanned';
  reason: string;
  duration_hours: number | null;
  expires_at: string | null;
  performed_by_display_name: string;
  timestamp: string;
}
```

---

## Data Models

### New Supabase Tables

#### `device_bans`
```sql
CREATE TABLE public.device_bans (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id   TEXT        NOT NULL CHECK (char_length(device_id) BETWEEN 1 AND 255),
  reason      TEXT        NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  banned_by   UUID        NOT NULL REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ,
  CONSTRAINT device_bans_unique_active
    EXCLUDE (device_id WITH =) WHERE (expires_at IS NULL OR expires_at > now())
);
```

RLS: only admins (`is_admin = true`) may select, insert, delete.

#### `ip_bans`
```sql
CREATE TABLE public.ip_bans (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address  INET        NOT NULL,
  reason      TEXT        NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  banned_by   UUID        NOT NULL REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ,
  CONSTRAINT ip_bans_unique_active
    EXCLUDE (ip_address WITH =) WHERE (expires_at IS NULL OR expires_at > now())
);
```

Using PostgreSQL `INET` type for built-in IPv4/IPv6 validation. The unique partial exclusion prevents duplicate active bans for the same IP.

RLS: only admins may select, insert, delete.

#### `ban_templates`
```sql
CREATE TABLE public.ban_templates (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT        NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 1 AND 100),
  reason         TEXT        NOT NULL,
  duration_hours INTEGER,    -- NULL = permanent
  created_by     UUID        NOT NULL REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

RLS: only admins may insert, update, delete; admins and moderators may select.

### Existing Table Extensions

#### `profiles` — new columns
```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS app_version TEXT,
  ADD COLUMN IF NOT EXISTS device_id   TEXT;
```

`app_version`: populated by the desktop app on first launch / after update. Used by Performance Insights Panel.
`device_id`: populated by the desktop app. Used for device ban enforcement.

### Existing `ban_history` Schema (as-is)
```
ban_history (
  id UUID PK,
  user_id    UUID  -- references profiles.id (not auth.users.id)
  banned_by  UUID  -- references profiles.id
  reason     TEXT
  duration_hours INTEGER
  expires_at TIMESTAMPTZ
  unbanned_at TIMESTAMPTZ
  unbanned_by UUID -- references profiles.id
  created_at TIMESTAMPTZ DEFAULT now()
)
```

The existing `ban_user` / `unban_user` RPCs are extended to accept the `duration_hours` parameter (already supported per current migration — `duration_hours DEFAULT NULL`). The admin UI simply passes the selected hours value.

### Automatic Ban Expiry

A Supabase Edge Function (or pg_cron job) runs hourly:

```sql
-- Scheduled hourly: lift expired bans
UPDATE profiles
SET
  is_banned  = false,
  banned_at  = NULL,
  banned_by  = NULL,
  ban_reason = NULL
WHERE is_banned = true
  AND user_id IN (
    SELECT p.user_id
    FROM profiles p
    JOIN ban_history bh ON bh.user_id = p.id
    WHERE bh.unbanned_at IS NULL
      AND bh.expires_at IS NOT NULL
      AND bh.expires_at < now()
  );

UPDATE ban_history
SET unbanned_at = now(), unbanned_by = NULL
WHERE unbanned_at IS NULL
  AND expires_at IS NOT NULL
  AND expires_at < now();
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Update policy row rendering completeness

*For any* `UpdatePolicy` object, the rendered policy row should contain visible text for all seven required fields: `channel`, `type`, `target_version`, `active` status, `notes`, `published_at`, and `rollback_from_version` when present.

**Validates: Requirements 1.3**

### Property 2: Create-policy form validation gate

*For any* combination of `channel`, `type`, and `target_version` inputs, the form submit button is enabled if and only if: `channel` is one of `{stable, beta, experimental}`, `type` is one of `{mandatory, recommended, experimental, rollback}`, `target_version` matches `/^\d+\.\d+\.\d+$/`, and — when `type = 'rollback'` — `rollback_from_version` is also a non-empty semver string matching the same pattern.

**Validates: Requirements 1.4, 1.5**

### Property 3: Update status label mapping completeness

*For any* status string from the set `{checking, available, not-available, downloading, downloaded, mandatory-update, error}`, the `UPDATE_STATUS_LABELS` mapping function returns a non-empty, human-readable label string distinct from the raw status key.

**Validates: Requirements 1.8**

### Property 4: Log level colour distinctness

*For any* log level from the set `{DEBUG, INFO, WARN, ERROR, FATAL}`, the `levelColour` function returns a non-empty CSS colour string, and all five returned values are pairwise distinct.

**Validates: Requirements 2.3**

### Property 5: Log level filter — OR semantics

*For any* collection of log entries and *any* non-empty subset of log levels selected in the filter, the resulting filtered list contains exactly those entries whose `level` field is a member of the selected subset.

**Validates: Requirements 2.4**

### Property 6: Crash report list cap and field completeness

*For any* array of `CrashReport` objects of arbitrary length, the panel renders at most 50 items; for each rendered item, the output contains the `id`, a formatted `date` string, and the `path` value.

**Validates: Requirements 3.3**

### Property 7: Crash report acknowledgment round-trip

*For any* crash report currently in the displayed list, after the admin clicks "Acknowledge", that report's `id` should be present in the `acknowledged_crash_ids` JSON array stored in `localStorage`, and the report should no longer appear in the rendered list.

**Validates: Requirements 3.5**

### Property 8: Acknowledged crash IDs pre-filter on mount

*For any* array of crash reports and *any* set of IDs stored in `localStorage` under `acknowledged_crash_ids`, mounting the `CrashReportPanel` should display only those reports whose `id` is **not** in the acknowledged set.

**Validates: Requirements 3.7**

### Property 9: Signup time-series grouping invariant

*For any* array of profile `created_at` timestamps and *any* grouping period (day / week / month), the sum of all group counts equals the count of timestamps that fall within the selected time range, and each timestamp is assigned to exactly one group bucket.

**Validates: Requirements 4.2**

### Property 10: DAU count accuracy

*For any* day `D` and *any* set of `page_visits` records, the DAU value for day `D` equals the count of distinct `user_id` values where `user_id IS NOT NULL` and `created_at` falls within day `D`.

**Validates: Requirements 4.3**

### Property 11: 7-day retention formula

*For any* set of user sign-up records (the cohort: users created within the last 30 days) and *any* set of activity records, the computed 7-day retention percentage equals `(count of cohort users with at least one activity record within 7 days of their signup date) / (cohort size) * 100`, clamped to the range `[0, 100]`.

**Validates: Requirements 4.4**

### Property 12: Top-N countries selection

*For any* sign-up dataset with country data, the returned top-countries list contains at most 5 entries, each entry's count equals the actual count for that country in the dataset, and the list is sorted by count descending.

**Validates: Requirements 4.6**

### Property 13: Extension top-10 ordering

*For any* extension dataset, the displayed list contains `min(dataset.length, 10)` extensions ordered by `totalInstalls` descending.

**Validates: Requirements 5.2**

### Property 14: Uninstall rate formula

*For any* extension record where `totalInstalls > 0`, the displayed uninstall rate equals `Math.round((totalInstalls - activeUsers) / totalInstalls * 1000) / 10` (one decimal place percentage). When `totalInstalls === 0`, the display shows "N/A".

**Validates: Requirements 5.4**

### Property 15: Extension health warning threshold

*For any* extension record, the rendered row includes a visible warning indicator if and only if `healthScore < 0.5`.

**Validates: Requirements 5.5**

### Property 16: Peak concurrent viewer calculation

*For any* array of watch session start timestamps within a given time range, the peak concurrent estimate equals the maximum count of start timestamps falling within any single 1-hour calendar bucket (i.e., sessions grouped by `floor(timestamp / 3600000)`).

**Validates: Requirements 6.2**

### Property 17: Stream duration histogram completeness

*For any* array of watch sessions with `watch_duration_seconds` values, the sum of counts across the four duration buckets `[0–299, 300–1199, 1200–3599, 3600+]` equals the total number of sessions, and each session's duration falls in exactly one bucket.

**Validates: Requirements 6.3**

### Property 18: Top-10 content by download count

*For any* download dataset, the displayed top-content list contains `min(dataset.length, 10)` items ordered by completed download count descending.

**Validates: Requirements 6.5**

### Property 19: Download completion rate formula

*For any* set of download records where at least one record has `watch_duration_seconds > 0` (denominator > 0), the displayed completion rate equals `Math.round((completedDownloads / totalAttemptsWithWatchDuration) * 1000) / 10` (one decimal place). When the denominator is zero, the display shows "N/A".

**Validates: Requirements 6.6, 6.7**

### Property 20: Version distribution sums to 100%

*For any* set of `profiles` records with `app_version` values, the sum of all version percentage shares equals exactly 100% (within floating-point rounding tolerance), and each version's share equals `(count_for_version / total_count) * 100`.

**Validates: Requirements 7.1**

### Property 21: Update adoption rate formula

*For any* active `mandatory` or `recommended` policy for the `stable` channel and *any* set of profiles, the displayed adoption rate equals `(count of profiles where app_version = policy.target_version) / (total profile count) * 100`.

**Validates: Requirements 7.2**

### Property 22: Custom ban duration validation range

*For any* integer value submitted to the custom duration field, the validation accepts values in `[1, 8760]` and rejects all values outside this range (including zero, negative values, and values > 8760).

**Validates: Requirements 8.2, 8.7**

### Property 23: Ban duration display format

*For any* timed ban with `expires_at` in the future and a known current time, the formatted remaining duration string shows days and hours (e.g. "Banned · expires in 6 days 12 hours") and omits zero-value units (e.g. "Banned · expires in 2 hours" when days = 0). For `expires_at = null`, the display shows "Banned · permanent".

**Validates: Requirements 8.6**

### Property 24: Device ban form field validation

*For any* (device_id, reason) input pair, form submission is allowed if and only if `1 ≤ length(device_id) ≤ 255` and `1 ≤ length(reason) ≤ 500`.

**Validates: Requirements 9.1**

### Property 25: Device ID display truncation

*For any* device ban with a `device_id` string longer than 20 characters, the rendered table cell displays the first 20 characters, and a tooltip attribute contains the full `device_id` value.

**Validates: Requirements 9.5**

### Property 26: IP address format validation

*For any* string submitted to the IP address field, the client-side validator returns `true` if and only if the string is a valid IPv4 address (four octets in `0–255` separated by dots) or a valid IPv6 address (standard notation).

**Validates: Requirements 10.1, 10.3**

### Property 27: Bulk ban progress counter accuracy

*For any* array of N selected users undergoing a bulk ban, after each individual `ban_user` RPC call completes, the progress indicator displays "Processing X of N" where X equals the number of calls completed so far (1-indexed).

**Validates: Requirements 11.4**

### Property 28: Bulk ban success count in toast

*For any* bulk ban operation completing with S successful bans out of N total, the success toast message contains the exact number S and says "Banned S users successfully".

**Validates: Requirements 11.5**

### Property 29: Bulk ban error toast lists failed users

*For any* bulk ban operation where a non-empty subset of users F failed, after all calls complete the error toast lists exactly the display names of users in F.

**Validates: Requirements 11.6**

### Property 30: Ban templates alphabetical ordering

*For any* set of saved ban templates, both the Templates list and the "Use Template" dropdown display templates sorted alphabetically (case-insensitive) by `name`.

**Validates: Requirements 12.1, 12.4**

### Property 31: Ban template name uniqueness and length

*For any* (proposed_name, existing_templates) pair, saving the template succeeds if and only if `1 ≤ length(proposed_name) ≤ 100` and no existing template has `name = proposed_name` (case-sensitive comparison).

**Validates: Requirements 12.2, 12.3**

### Property 32: Ban audit log pagination ordering

*For any* ban audit log dataset, the first page of results contains at most 50 records, all records are ordered by `timestamp` descending, and no record appears more than once across all pages.

**Validates: Requirements 13.1**

### Property 33: Ban audit log record field completeness

*For any* `BanAuditRecord` object, the rendered row contains visible text for all six required fields: target user (display name + username), action label, reason, duration, performed-by admin name, and timestamp.

**Validates: Requirements 13.2**

### Property 34: Audit log search filter — case-insensitive containment

*For any* search string `q` and *any* set of audit records, the filtered result contains exactly those records where `LOWER(display_name)` or `LOWER(username)` contains `LOWER(q)`.

**Validates: Requirements 13.4**

### Property 35: Audit log action type filter

*For any* action-type filter selection `f ∈ {All, Banned, Unbanned}` and *any* audit record set, the filtered result contains exactly those records where: `f = All` (no filtering), `f = Banned` and `action = 'banned'`, or `f = Unbanned` and `action = 'unbanned'`.

**Validates: Requirements 13.5**

### Property 36: CSV export reflects active filters

*For any* state of the ban audit log panel (with active search text `q` and action filter `f`), the downloaded CSV contains exactly the rows currently visible in the UI — i.e., the intersection of the search-filter and action-filter results — with the specified seven column headers.

**Validates: Requirements 13.6**

---

## Error Handling

### Fetch Errors

All panels use `@tanstack/react-query` with default retry behavior (3 retries, exponential backoff). On final failure, each panel renders an error state:

| Panel | Error Message | Recovery |
|---|---|---|
| Update Management | "Failed to load update policies" | "Retry" button re-triggers query |
| User Statistics | "Failed to load user statistics" | "Retry" button |
| Extension Analytics | "Failed to load extension analytics" | "Retry" button |
| Streaming/Download Analytics | "Failed to load data" | "Retry" button per sub-panel |
| Performance Insights | "Version distribution data not available" / "No crash telemetry data" | Displayed inline |
| Ban Audit Log | Error toast via sonner | Automatic retry |

### Mutation Errors

- **Insert/deactivate policy failures**: inline toast via `sonner` describing the failure; list unchanged.
- **Duplicate active policy**: constraint error caught and displayed as: "A channel can only have one active policy at a time. Deactivate the existing policy first." — not via generic toast, displayed inline above the form.
- **ban_user / unban_user RPC failure**: toast error; user ban status unchanged.
- **Device ban duplicate**: unique constraint violation caught, displayed as field-level error.
- **IP ban invalid format**: client-side validation before submission (using native INET cast via regex). If server rejects: display "Invalid IP address format".
- **Template name duplicate/invalid**: field-level validation error before submission.

### IPC Errors

- **logTail unavailable**: `"Log tail IPC not available — desktop build required"` replaces the log list.
- **logTail rejects**: `"Failed to load logs — try refreshing"` with Refresh button shown.
- **perfGetHistory fails**: `"No performance snapshot data available"` in the chart area.
- **updateCheck fails**: status label shows "Check failed".
- **updateGetHistory fails**: version history section hidden with no error shown (non-critical).

### Crash Acknowledgment localStorage Failure

If `localStorage.setItem` throws (e.g. storage quota exceeded), the report is retained in the list and an inline error indicator is shown on that report's row (e.g., a red exclamation icon with tooltip "Could not save acknowledgment").

### Bulk Ban Partial Failures

Bulk ban continues processing remaining users even when individual calls fail. On completion, two toasts are shown:
- Success toast (auto-dismisses after 5 seconds): "Banned N users successfully"
- Error toast (dismissible, stays until dismissed): lists display names of failed users

---

## Testing Strategy

### Approach

This feature uses a **dual testing approach**:

- **Property-based tests** (via [fast-check](https://github.com/dubzzz/fast-check) for TypeScript) for all 36 correctness properties above — run with minimum 100 iterations each.
- **Unit/example tests** (via Vitest + React Testing Library) for specific UI states, conditional rendering, IPC mock interactions, and error states.
- **Integration tests** for server-side concerns (RLS policies, scheduled expiry, IP/device ban enforcement at auth layer).

### Property-Based Tests

Each correctness property maps to one `fc.assert(fc.property(...))` test. Tests are tagged with a comment referencing the property:

```typescript
// Feature: admin-dashboard-overhaul, Property 5: Log level filter — OR semantics
test('log level filter returns exactly matching levels', () => {
  fc.assert(
    fc.property(
      fc.array(fc.record({ level: fc.constantFrom('DEBUG','INFO','WARN','ERROR','FATAL'), message: fc.string() })),
      fc.subarray(['DEBUG','INFO','WARN','ERROR','FATAL'] as const, { minLength: 1 }),
      (entries, selectedLevels) => {
        const filtered = filterByLevels(entries, new Set(selectedLevels));
        return filtered.every(e => selectedLevels.includes(e.level))
          && entries.filter(e => selectedLevels.includes(e.level)).length === filtered.length;
      }
    ),
    { numRuns: 100 }
  );
});
```

Key generators needed:
- `UpdatePolicy` — arbitrary channel/type/version combos including invalid semver strings
- `LogEntry` — random levels, messages, optional contexts
- `CrashReport[]` — arrays of length 0–200
- Signup timestamps and country data
- Extension metrics with edge cases (totalInstalls = 0, healthScore boundary at 0.5)
- Watch session durations across all four histogram buckets
- Ban durations including boundary values (0, 1, 8760, 8761)
- Audit log records with Unicode display names (for case-insensitive search)
- Template name sets including duplicates and boundary lengths

### Unit/Example Tests

Focus areas:
- Conditional nav item rendering (`window.electron` defined/undefined, role checks)
- Ban dialog flow: selecting each duration preset, custom input, template selection
- Crash report panel: mount → listener registration → receive crash → acknowledge flow
- Update Management Panel: form validation for rollback type requiring `rollback_from_version`
- Bulk ban dialog: progress indicator updates, toast messages
- CSV export: verifying the generated blob content with active filters
- Error state rendering for each panel's error path

### Integration Tests

- RLS policy enforcement for `device_bans`, `ip_bans`, `ban_templates` (non-admin rejection)
- Scheduled ban expiry: verify expired bans are lifted within one processing cycle
- `INET` column validation: database-level rejection of invalid IP strings
- Unique constraint on `device_bans`/`ip_bans` for duplicate active bans

### Test Configuration

- fast-check: `numRuns: 100` minimum per property test
- Vitest with `@testing-library/react` for component tests
- Supabase local instance (via `supabase start`) for integration tests
- `window.electron` mocked via `vi.stubGlobal('electron', mockElectron)` in component tests
