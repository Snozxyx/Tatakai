# Implementation Plan: Admin Dashboard Overhaul

## Overview

Implement three capability areas in the Tatakai admin dashboard (`/admin`): Electron Desktop Monitoring panels (Update Management, Log Viewer integration, Crash Reports), Analytics System Expansion (User Stats, Extension Analytics, Streaming & Download Analytics, Performance Insights), and Moderation/Ban System Enhancement (timed bans, device bans, IP bans, bulk bans, ban templates, ban audit log). All components use TypeScript + React with `@tanstack/react-query`, Tailwind CSS, `GlassPanel`, and `sonner`. New Supabase tables are added via migration files.

## Tasks

- [x] 1. Database migrations and shared type definitions
  - [x] 1.1 Create Supabase migration for new tables and profile column extensions
    - Write migration file adding `device_bans`, `ip_bans`, and `ban_templates` tables with all constraints, check constraints, and exclusion constraints as defined in the design
    - Add `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS app_version TEXT` and `device_id TEXT`
    - Add RLS policies: admin-only for `device_bans` and `ip_bans`; admin insert/update/delete + admin+moderator select for `ban_templates`
    - Add unique partial exclusion constraints for active device bans and IP bans
    - _Requirements: 9.1, 9.3, 10.1, 10.6, 12.1, 12.3, 7.1_
  - [x] 1.2 Create shared TypeScript type definitions file
    - Write `src/types/admin-dashboard.ts` containing all interfaces from the design: `UpdatePolicy`, `CreatePolicyForm`, `CrashReport`, `TimeRange`, `SignupGroup`, `DauPoint`, `CountrySignup`, `UserStatsData`, `ExtensionMetrics`, `StreamingMetrics`, `DownloadMetrics`, `VersionDistribution`, `PerfSnapshot`, `PerformanceInsightsData`, `BanDialogState`, `DeviceBan`, `IpBan`, `BanTemplate`, `BanAuditRecord`
    - Export the `UPDATE_STATUS_LABELS` constant record
    - _Requirements: 1.3, 1.8, 2.3, 3.3, 4.1–4.6, 5.1–5.4, 6.1–6.6, 7.1–7.4, 8.1–8.6, 9.1, 10.1, 11.3, 12.1, 13.2_

- [ ] 2. Update Management Panel
  - [x] 2.1 Implement `UpdateManagementPanel.tsx` — data fetching and policy list
    - Create `src/components/admin/UpdateManagementPanel.tsx`
    - Fetch all rows from `update_policies` ordered by `published_at` descending, limit 200, with loading indicator
    - Render each policy row with all seven fields: `channel`, `type`, `target_version`, `rollback_from_version` (when present), `active`, `notes`, `published_at`
    - Render "Deactivate" button on active rows that sets `active = false` and refreshes
    - Handle fetch failure with "Failed to load update policies" error state and "Retry" button
    - Handle deactivate mutation failure with inline sonner toast
    - _Requirements: 1.2, 1.3, 1.6, 1.12, 1.13_
  - [x] 2.2 Write property test for update policy row rendering completeness
    - **Property 1: Update policy row rendering completeness**
    - **Validates: Requirements 1.3**
  - [x] 2.3 Implement create-policy form with validation
    - Add create-policy form to `UpdateManagementPanel.tsx`
    - Validate `channel`, `type`, `target_version` (semver regex), conditional `rollback_from_version` when `type = 'rollback'`
    - Enable submit only when all required fields are valid
    - Catch unique-constraint error and display "A channel can only have one active policy at a time. Deactivate the existing policy first." inline above the form
    - Handle general insert failures with sonner toast
    - _Requirements: 1.4, 1.5, 1.7, 1.13_
  - [x] 2.4 Write property test for create-policy form validation gate
    - **Property 2: Create-policy form validation gate**
    - **Validates: Requirements 1.4, 1.5**
  - [ ] 2.5 Implement "Check Now" button and update status display
    - Add per-channel "Check Now" button that calls `window.electron.updateCheck(channel)` when available
    - Map returned status strings to labels using `UPDATE_STATUS_LABELS`
    - Render "Desktop app required" label when `window.electron` is undefined
    - _Requirements: 1.8, 1.11_
  - [ ] 2.6 Write property test for update status label mapping completeness
    - **Property 3: Update status label mapping completeness**
    - **Validates: Requirements 1.8**
  - [ ] 2.7 Implement version history section
    - On Updates tab mount, call `window.electron.updateGetHistory()` when available and render version history records
    - Display each record with `version`, `channel`, `installedAt` (human-readable), `source`, `previousVersion` ("—" when absent)
    - Hide section silently if IPC call fails or `window.electron` is undefined
    - _Requirements: 1.9, 1.10, 1.11_

- [ ] 3. Log Viewer Panel — admin integration
  - [x] 3.1 Implement log level colour utility and filter logic
    - Create or update `src/utils/logLevel.ts` with a `levelColour(level)` function returning distinct, non-empty CSS colour strings for DEBUG, INFO, WARN, ERROR, FATAL
    - Create `filterByLevels(entries, selectedLevels)` pure function (for use in `LogViewerPanel`)
    - _Requirements: 2.3, 2.4_
  - [x] 3.2 Write property test for log level colour distinctness
    - **Property 4: Log level colour distinctness**
    - **Validates: Requirements 2.3**
  - [x] 3.3 Write property test for log level filter OR semantics
    - **Property 5: Log level filter — OR semantics**
    - **Validates: Requirements 2.4**
  - [ ] 3.4 Integrate `LogViewerPanel` into admin navigation
    - Extend `AdminPage.tsx` `navItems` to include a "Logs" entry gated on `window.electron` being defined
    - Render existing `LogViewerPanel` inside a `TabsContent "logs"` panel
    - Ensure `LogViewerPanel` calls `window.electron.logTail(500)`, virtualises the list, scrolls to bottom after render
    - Wire level filter buttons (all five selected by default), "Refresh" button, IPC unavailable and error states
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.6, 2.7_

- [ ] 4. Crash Report Panel
  - [x] 4.1 Implement `CrashReportPanel.tsx`
    - Create `src/components/admin/CrashReportPanel.tsx`
    - On mount, read `acknowledged_crash_ids` from localStorage and register `window.electron.onCrashPrevious` listener
    - Store received crash reports in state; filter out acknowledged IDs on mount
    - Render up to 50 crash reports with `id`, `date` (locale-sensitive to the minute), and `path`
    - Display "No crash reports detected in this session" when list is empty
    - _Requirements: 3.2, 3.3, 3.4, 3.7_
  - [x] 4.2 Write property test for crash report list cap and field completeness
    - **Property 6: Crash report list cap and field completeness**
    - **Validates: Requirements 3.3**
  - [x] 4.3 Write property test for acknowledged crash IDs pre-filter on mount
    - **Property 8: Acknowledged crash IDs pre-filter on mount**
    - **Validates: Requirements 3.7**
  - [ ] 4.4 Implement crash report acknowledgment with localStorage persistence
    - Wire "Acknowledge" button to remove the report from state and append its `id` to `acknowledged_crash_ids` JSON array in localStorage
    - Handle localStorage write failure: retain report in list, show inline error indicator on that row
    - _Requirements: 3.5, 3.6_
  - [ ] 4.5 Write property test for crash report acknowledgment round-trip
    - **Property 7: Crash report acknowledgment round-trip**
    - **Validates: Requirements 3.5**
  - [ ] 4.6 Wire Crash Report Panel into admin navigation
    - Add "Crash Reports" nav item to `AdminPage.tsx` gated on `window.electron` defined AND `is_admin = true`
    - Render `CrashReportPanel` inside `TabsContent "crashes"`
    - Ensure nav item is hidden when `window.electron` is undefined
    - _Requirements: 3.1, 3.8_

- [ ] 5. Checkpoint — Ensure all Electron monitoring panel tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. User Statistics Panel
  - [x] 6.1 Implement signup grouping and DAU computation utilities
    - Create `src/utils/userStats.ts` with `groupSignupsByPeriod(timestamps, period)` and `computeDau(pageVisits)` pure functions
    - Implement `computeRetention(cohortSignups, activityRecords)` computing 7-day retention as `(users with activity in 7 days after signup) / cohort_size * 100`
    - Implement `topCountries(signups, n)` returning at most `n` countries sorted by count descending
    - _Requirements: 4.2, 4.3, 4.4, 4.6_
  - [x] 6.2 Write property test for signup time-series grouping invariant
    - **Property 9: Signup time-series grouping invariant**
    - **Validates: Requirements 4.2**
  - [x] 6.3 Write property test for DAU count accuracy
    - **Property 10: DAU count accuracy**
    - **Validates: Requirements 4.3**
  - [x] 6.4 Write property test for 7-day retention formula
    - **Property 11: 7-day retention formula**
    - **Validates: Requirements 4.4**
  - [x] 6.5 Write property test for top-N countries selection
    - **Property 12: Top-N countries selection**
    - **Validates: Requirements 4.6**
  - [x] 6.6 Implement `UserStatsPanel.tsx`
    - Create `src/components/admin/UserStatsPanel.tsx`
    - Query total user count from `profiles`, signup groups from `profiles.created_at`, DAU series from `page_visits`, top 5 countries from `profiles`
    - Compute 7-day retention client-side from cohort + activity queries
    - Render charts, time range selector (Day/Week/Month), re-query within 2 seconds on selection change
    - Handle no-data case with "No data available for the selected period" and fetch failure with error + "Retry" button
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

- [ ] 7. Extension Analytics Panel
  - [x] 7.1 Implement extension analytics computation utilities
    - Create `src/utils/extensionAnalytics.ts` with `topNExtensions(extensions, n)` returning at most `n` rows ordered by `totalInstalls` descending
    - Implement `computeUninstallRate(totalInstalls, activeUsers)` returning `null` when `totalInstalls === 0`, else one-decimal percentage
    - _Requirements: 5.2, 5.4_
  - [x] 7.2 Write property test for extension top-10 ordering
    - **Property 13: Extension top-10 ordering**
    - **Validates: Requirements 5.2**
  - [x] 7.3 Write property test for uninstall rate formula
    - **Property 14: Uninstall rate formula**
    - **Validates: Requirements 5.4**
  - [ ] 7.4 Implement `ExtensionAnalyticsPanel.tsx`
    - Create `src/components/admin/ExtensionAnalyticsPanel.tsx`
    - Query `extensions` table for metrics (totalInstalls, activeUsers, recentInstalls, healthScore)
    - Query `extension_audit_log` for trailing 7-day event type summary
    - Render top-10 table with columns: name, total installs, active users, installs last 30 days, uninstall rate
    - Highlight rows with `healthScore < 0.5` with amber visual warning indicator
    - Handle fetch failure with "Failed to load extension analytics" + "Retry" button
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_
  - [ ] 7.5 Write property test for extension health warning threshold
    - **Property 15: Extension health warning threshold**
    - **Validates: Requirements 5.5**

- [ ] 8. Streaming and Download Analytics Panel
  - [x] 8.1 Implement streaming and download analytics computation utilities
    - Create `src/utils/streamingAnalytics.ts` with `peakConcurrentViewers(startTimestamps)` bucketing into 1-hour windows and returning the max count
    - Implement `durationHistogram(sessions)` assigning each session to exactly one of four buckets: 0–299s, 300–1199s, 1200–3599s, 3600+s
    - Implement `topNContent(downloads, n)` returning at most `n` items ordered by completed download count descending
    - Implement `downloadCompletionRate(records)` returning `null` when denominator is zero, else one-decimal percentage
    - _Requirements: 6.2, 6.3, 6.5, 6.6, 6.7_
  - [x] 8.2 Write property test for peak concurrent viewer calculation
    - **Property 16: Peak concurrent viewer calculation**
    - **Validates: Requirements 6.2**
  - [x] 8.3 Write property test for stream duration histogram completeness
    - **Property 17: Stream duration histogram completeness**
    - **Validates: Requirements 6.3**
  - [x] 8.4 Write property test for top-10 content by download count
    - **Property 18: Top-10 content by download count**
    - **Validates: Requirements 6.5**
  - [x] 8.5 Write property test for download completion rate formula
    - **Property 19: Download completion rate formula**
    - **Validates: Requirements 6.6, 6.7**
  - [x] 8.6 Implement `StreamingAnalyticsPanel.tsx`
    - Create `src/components/admin/StreamingAnalyticsPanel.tsx`
    - Query `watch_sessions` for total session count, timestamps for peak concurrent, duration distribution
    - Query `playback_telemetry` for provider usage breakdown (event_type = 'source_resolved'), sorted by count descending
    - Render total sessions, peak concurrent viewer estimate, duration histogram, provider breakdown
    - Implement Download Analytics section: top 10 content by completed downloads, overall completion rate
    - Handle N/A for zero-denominator completion rate; handle load failures with "Failed to load data" + "Retry"
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

- [x] 9. Performance Insights Panel
  - [x] 9.1 Implement version distribution and adoption rate utilities
    - Create `src/utils/performanceInsights.ts` with `versionDistribution(profiles)` computing per-version percentage shares that sum to 100%
    - Implement `adoptionRate(profiles, policy)` computing adoption as `count(app_version = policy.target_version) / total * 100`
    - _Requirements: 7.1, 7.2_
  - [x] 9.2 Write property test for version distribution sums to 100%
    - **Property 20: Version distribution sums to 100%**
    - **Validates: Requirements 7.1**
  - [x] 9.3 Write property test for update adoption rate formula
    - **Property 21: Update adoption rate formula**
    - **Validates: Requirements 7.2**
  - [x] 9.4 Implement `PerformanceInsightsPanel.tsx`
    - Create `src/components/admin/PerformanceInsightsPanel.tsx`
    - Query `profiles.app_version` for version distribution; show "Version distribution data not available" if column absent
    - Query active `mandatory`/`recommended` stable policy for adoption rate; show "No active stable channel policy" if none
    - Query crash telemetry from `playback_telemetry` grouped by calendar day for selected time range (default 30 days, range 1–90); show "No crash telemetry data" if empty
    - When `window.electron` defined and tab is explicitly opened, call `window.electron.perfGetHistory(20)` and render `heapUsedMB` + `rssMB` line chart; show "No performance snapshot data available" on failure or empty array
    - Hide perf snapshot section entirely when `window.electron` is undefined
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 10. Wire new analytics panels into AdminPage
  - [ ] 10.1 Integrate all four analytics panels into `AdminPage.tsx`
    - Import and render `UserStatsPanel`, `ExtensionAnalyticsPanel`, `StreamingAnalyticsPanel`, and `PerformanceInsightsPanel` inside the existing `TabsContent "analytics"` section as sub-tabs or stacked panels
    - Add "Updates" nav item (gated: `is_admin = true` AND `window.electron` defined) with `TabsContent "updates"` rendering `UpdateManagementPanel`; also render `UpdateManagementPanel` in read-only mode when `window.electron` is undefined
    - _Requirements: 1.1, 1.11, 4.1, 5.1, 6.1, 7.1_

- [ ] 11. Checkpoint — Ensure all analytics panel tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Timed bans and ban dialog extensions
  - [x] 12.1 Implement ban duration validation and display utilities
    - Create `src/utils/banUtils.ts` with `validateCustomDuration(hours)` accepting only integers in [1, 8760]
    - Implement `formatBanDuration(expiresAt)` returning "Banned · permanent" for null or "Banned · expires in X days Y hours" omitting zero-value units
    - _Requirements: 8.2, 8.6, 8.7_
  - [x] 12.2 Write property test for custom ban duration validation range
    - **Property 22: Custom ban duration validation range**
    - **Validates: Requirements 8.2, 8.7**
  - [x] 12.3 Write property test for ban duration display format
    - **Property 23: Ban duration display format**
    - **Validates: Requirements 8.6**
  - [ ] 12.4 Extend the ban dialog component with duration presets
    - Update the existing ban dialog to add four duration options: Permanent, 7 days, 30 days, Custom
    - Show numeric input (1–8760 hours) only when "Custom" is selected; validate before enabling submit
    - Pass `duration_hours` (or `null` for Permanent) to `ban_user` RPC
    - Display remaining ban duration in the Users tab per currently banned user using `formatBanDuration`
    - Handle `ban_user` RPC failure with error toast; leave ban status unchanged
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.6, 8.7, 8.8_

- [x] 13. Automated ban expiry
  - [x] 13.1 Implement Supabase Edge Function (or pg_cron job) for hourly ban expiry
    - Write `supabase/functions/expire-bans/index.ts` (or a migration adding a pg_cron job) that runs the expiry SQL: update `profiles` to clear ban fields for users whose `ban_history` row has `expires_at < now()` and `unbanned_at IS NULL`; also update `ban_history.unbanned_at = now()`
    - _Requirements: 8.5_

- [x] 14. Device Ban Panel
  - [x] 14.1 Implement device ban form field validation utility
    - Add `validateDeviceBan(device_id, reason)` to `src/utils/banUtils.ts`: accepts when `1 ≤ length(device_id) ≤ 255` and `1 ≤ length(reason) ≤ 500`
    - _Requirements: 9.1_
  - [x] 14.2 Write property test for device ban form field validation
    - **Property 24: Device ban form field validation**
    - **Validates: Requirements 9.1**
  - [x] 14.3 Implement device ID display truncation utility
    - Add `truncateDeviceId(device_id)` to `src/utils/banUtils.ts`: returns first 20 characters for display; full value available as tooltip
    - _Requirements: 9.5_
  - [x] 14.4 Write property test for device ID display truncation
    - **Property 25: Device ID display truncation**
    - **Validates: Requirements 9.5**
  - [x] 14.5 Implement `DeviceBanPanel.tsx`
    - Create `src/components/admin/DeviceBanPanel.tsx`
    - Render device ban form with fields: device ID, reason, optional expiry date/time; validate with `validateDeviceBan`
    - On submit, insert to `device_bans`; catch duplicate-active constraint and show field-level error; show confirmation on success
    - Render active device bans table: device ID (truncated + tooltip), reason, banned by, expiry
    - Show "No active device bans" when list is empty
    - Wire "Remove" button to delete record; handle already-removed error; non-admin rejection
    - _Requirements: 9.1, 9.2, 9.3, 9.5, 9.6, 9.7_

- [x] 15. IP Ban Panel
  - [x] 15.1 Implement IP address format validation utility
    - Add `validateIpAddress(ip)` to `src/utils/banUtils.ts` returning `true` for valid IPv4 (four octets 0–255) or valid IPv6 addresses, `false` otherwise
    - _Requirements: 10.1, 10.3_
  - [x] 15.2 Write property test for IP address format validation
    - **Property 26: IP address format validation**
    - **Validates: Requirements 10.1, 10.3**
  - [x] 15.3 Implement `IPBanPanel.tsx`
    - Create `src/components/admin/IPBanPanel.tsx`
    - Render IP ban form with fields: IP address (validated), reason (non-empty required), optional expiry; validate before submit
    - On submit, insert to `ip_bans`; catch duplicate-active constraint; display "Invalid IP address format" on server rejection
    - Render active IP bans table: IP address, reason, banned by, expiry ("Permanent" if null)
    - Wire "Remove" button to delete the record; non-admin rejection
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.6, 10.7, 10.8_

- [ ] 16. Bulk Ban Actions
  - [ ] 16.1 Add checkbox column and bulk-actions toolbar to Users tab
    - Extend the existing users table in `AdminPage.tsx` (or its child component) with a checkbox column for multi-select
    - Render `BulkBanToolbar` with "Bulk Ban" button when at least one user is selected; hide toolbar when selection is empty
    - _Requirements: 11.1, 11.2_
  - [ ] 16.2 Implement bulk ban dialog with progress tracking
    - Create `src/components/admin/BulkBanToolbar.tsx`
    - Open ban dialog prompting for shared reason (1–500 chars) and shared duration (Permanent, 7 days, 30 days, 1–365 days custom)
    - On confirm, call `ban_user` RPC sequentially per selected user; update "Processing X of N" progress indicator after each call
    - On completion, show success toast "Banned N users successfully" (auto-dismisses after 5 seconds) and refresh user list
    - If any calls fail, continue; show separate dismissible error toast listing failed users' display names
    - _Requirements: 11.3, 11.4, 11.5, 11.6_
  - [ ] 16.3 Write property test for bulk ban progress counter accuracy
    - **Property 27: Bulk ban progress counter accuracy**
    - **Validates: Requirements 11.4**
  - [ ] 16.4 Write property test for bulk ban success count in toast
    - **Property 28: Bulk ban success count in toast**
    - **Validates: Requirements 11.5**
  - [ ] 16.5 Write property test for bulk ban error toast lists failed users
    - **Property 29: Bulk ban error toast lists failed users**
    - **Validates: Requirements 11.6**

- [x] 17. Ban Templates Panel
  - [x] 17.1 Implement ban template sorting and name validation utilities
    - Add `sortTemplatesAlpha(templates)` to `src/utils/banUtils.ts` returning templates sorted case-insensitively by `name`
    - Add `validateTemplateName(name, existingNames)` accepting when `1 ≤ length(name) ≤ 100` and `name` is not already in `existingNames` (case-sensitive)
    - _Requirements: 12.1, 12.3, 12.4_
  - [x] 17.2 Write property test for ban templates alphabetical ordering
    - **Property 30: Ban templates alphabetical ordering**
    - **Validates: Requirements 12.1, 12.4**
  - [x] 17.3 Write property test for ban template name uniqueness and length
    - **Property 31: Ban template name uniqueness and length**
    - **Validates: Requirements 12.2, 12.3**
  - [x] 17.4 Implement `BanTemplatesPanel.tsx`
    - Create `src/components/admin/BanTemplatesPanel.tsx`
    - Render templates list sorted alphabetically; display "No templates saved yet" when empty
    - Add "Save as Template" flow: prompt for name (unique, 1–100 chars); persist to `ban_templates`; show specific validation error for blank/too-long/duplicate name
    - Render "Use Template" dropdown in ban dialog sorted alphabetically; pre-fill reason and duration on selection
    - Wire "Delete" button with confirmation prompt; remove template on confirm; non-admin rejection
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

- [ ] 18. Ban Audit Log Panel
  - [x] 18.1 Implement audit log filtering utilities
    - Add `filterAuditLog(records, searchText, actionFilter)` to `src/utils/banUtils.ts`: case-insensitive containment search on `display_name` and `username`; action filter for All/Banned/Unbanned
    - _Requirements: 13.4, 13.5_
  - [x] 18.2 Write property test for audit log search filter (case-insensitive containment)
    - **Property 34: Audit log search filter — case-insensitive containment**
    - **Validates: Requirements 13.4**
  - [x] 18.3 Write property test for audit log action type filter
    - **Property 35: Audit log action type filter**
    - **Validates: Requirements 13.5**
  - [x] 18.4 Implement CSV export for audit log
    - Add `exportAuditLogCsv(visibleRecords)` to `src/utils/banUtils.ts` generating a CSV blob with headers: `user_id`, `username`, `action`, `reason`, `duration_hours`, `expires_at`, `performed_by`, `timestamp`
    - _Requirements: 13.6_
  - [x] 18.5 Write property test for CSV export reflects active filters
    - **Property 36: CSV export reflects active filters**
    - **Validates: Requirements 13.6**
  - [x] 18.6 Implement `BanAuditLogPanel.tsx`
    - Create `src/components/admin/BanAuditLogPanel.tsx`
    - Query `ban_history` joined with `profiles` for all required fields; paginate at 50 rows per page ordered by timestamp descending
    - Render each record with all six fields: target user (display name + username), action, reason, duration (largest whole unit), performed by, timestamp
    - Wire search box (case-insensitive filter) and action-type selector (All/Banned/Unbanned)
    - Show "No matching records found" when search yields no results
    - Wire "Export CSV" button to trigger browser download of currently visible filtered records
    - Deny access to non-admin/non-moderator roles; handle fetch failure with error toast
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7_
  - [ ] 18.7 Write property test for audit log pagination ordering
    - **Property 32: Ban audit log pagination ordering**
    - **Validates: Requirements 13.1**
  - [ ] 18.8 Write property test for audit log record field completeness
    - **Property 33: Ban audit log record field completeness**
    - **Validates: Requirements 13.2**

- [ ] 19. Wire ban system panels into AdminPage moderation section
  - [ ] 19.1 Integrate all ban panels into the Moderation tab
    - Import and render `TimedBanDialog` (updated), `DeviceBanPanel`, `IPBanPanel`, `BanTemplatesPanel` inside a new `BanManagementSection` in `TabsContent "moderation"`
    - Render `BanAuditLogPanel` below ban management
    - Add "Updates" tab nav item for read-only mode (no `window.electron`) and `BulkBanToolbar` to Users tab
    - Ensure the `ban_templates` RLS restriction surfaces as a permission error in the UI for non-admin users
    - _Requirements: 8.1, 9.1, 10.1, 11.1, 12.1, 13.1, 10.9_

- [ ] 20. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- All components use TypeScript, `@tanstack/react-query`, Tailwind CSS, `GlassPanel`, and `sonner` — follow existing patterns in `src/components/admin/`
- Property-based tests use `fast-check` with `numRuns: 100` minimum; unit tests use Vitest + `@testing-library/react`
- `window.electron` is mocked in component tests via `vi.stubGlobal('electron', mockElectron)`
- All Supabase integration tests require a local Supabase instance (`supabase start`)
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation across the three major capability areas

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1", "6.1", "7.1", "8.1", "9.1", "12.1", "13.1", "14.1", "14.3", "15.1", "17.1", "18.1", "18.4"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.2", "3.3", "4.2", "4.3", "6.2", "6.3", "6.4", "6.5", "7.2", "7.3", "8.2", "8.3", "8.4", "8.5", "9.2", "9.3", "12.2", "12.3", "14.2", "14.4", "15.2", "17.2", "17.3", "18.2", "18.3", "18.5"] },
    { "id": 3, "tasks": ["2.4", "2.5", "3.4", "4.4", "4.5", "6.6", "7.4", "8.6", "9.4", "12.4", "14.5", "15.3", "16.1", "17.4", "18.6"] },
    { "id": 4, "tasks": ["2.6", "2.7", "4.6", "7.5", "16.2", "18.7", "18.8"] },
    { "id": 5, "tasks": ["16.3", "16.4", "16.5", "10.1"] },
    { "id": 6, "tasks": ["19.1"] }
  ]
}
```
