# Requirements Document

## Introduction

This feature overhauling the Tatakai admin dashboard with three interconnected capability areas:

1. **Electron Desktop Monitoring** — three new panels integrated into the existing admin dashboard (accessible at `/admin`) that surface live log output, crash report history, and full update-policy management for the desktop app. The Electron services (`log-service.cjs`, `crash-service.cjs`, `update-manager.cjs`, `perf-monitor.cjs`) are already built and expose IPC channels (`log:tail`, `crash:previous`, `update:get-policy`, `update:get-history`, `update:check`, `perf:get-history`) via `window.electron` in `preload.cjs`. These panels are only rendered when `window.electron` is defined.

2. **Analytics System Expansion** — the existing `AnalyticsDashboard` component covers web visitor/watch-session analytics. This feature adds four new dedicated analytics panels for extensions, streaming/downloads, performance insights (app version distribution and crash/update adoption rates from desktop), and an improved user statistics view.

3. **Moderation/Ban System Enhancement** — the existing `ban_user` / `unban_user` RPCs and `ban_history` table support permanent and duration-based bans and the existing `ban_reason` / `is_banned` columns on `profiles`. This feature extends the moderation system with timed-ban presets, device-fingerprint bans, IP bans, bulk ban actions, ban templates, and a full audit log UI.

The admin dashboard route is `/admin` (rendered by `src/pages/admin/AdminPage.tsx`). Existing panel tabs include `analytics`, `users`, `reports`, `moderation`, `logs`, `settings`, etc. New panels integrate as additional navigation items within the same tab layout. Supabase is the backend; React/TypeScript with Tailwind and `@tanstack/react-query` is the frontend stack.

---

## Glossary

- **Admin_Dashboard**: The React page at route `/admin` rendered by `AdminPage.tsx`, accessible only to users with `is_admin = true` or `role = 'moderator'`.
- **Desktop_App**: The Electron build of Tatakai, detected by checking whether `window.electron` is defined.
- **Update_Management_Panel**: The new admin panel that manages `update_policies` rows in Supabase and reads local version history via `window.electron.updateGetHistory()`.
- **Log_Viewer_Panel**: The existing `LogViewerPanel` component (`src/components/desktop/LogViewerPanel.tsx`) that tails the desktop app log via `window.electron.logTail(n)`.
- **Crash_Report_Panel**: A new admin panel that surfaces previous crash reports received via the `crash:previous` IPC push and persisted in the renderer, allowing acknowledgment.
- **Analytics_Dashboard**: The existing `AnalyticsDashboard` component that covers visitor and watch-session analytics.
- **Extension_Analytics_Panel**: A new analytics panel querying extension install and usage data.
- **Streaming_Analytics_Panel**: A new analytics panel querying watch session and playback telemetry data.
- **Download_Analytics_Panel**: A new analytics panel querying content view and completion data.
- **Performance_Insights_Panel**: A new analytics panel aggregating app version distribution and update/crash adoption.
- **Ban_System**: The combination of the `ban_user`/`unban_user` Supabase RPCs, the `ban_history` table, and the `is_banned`/`banned_at`/`ban_reason` columns on `profiles`.
- **Device_Ban**: A ban keyed to a device fingerprint string rather than a user account.
- **IP_Ban**: A ban keyed to an IP address string rather than a user account.
- **Ban_Template**: A saved set of `{ name, reason, duration_hours }` that can be applied with one click.
- **Ban_Audit_Log**: The full history of all ban and unban events, including which admin performed the action, surfaced in the UI.
- **Bulk_Ban**: A UI operation that applies a ban to multiple selected users in a single action.
- **IPC**: Inter-Process Communication between Electron main process and renderer via `contextBridge`/`ipcMain`/`ipcRenderer`.
- **update_policies**: The Supabase table storing update directives per channel (`stable`, `beta`, `experimental`) and type (`mandatory`, `recommended`, `experimental`, `rollback`).
- **ban_history**: The Supabase table that records each ban/unban event with `user_id`, `banned_by`, `reason`, `duration_hours`, `expires_at`, `unbanned_at`, and `unbanned_by`.
- **Channel**: One of `stable`, `beta`, or `experimental` — the release channel a user's desktop app build subscribes to.

---

## Requirements

### Requirement 1: Update Management Panel

**User Story:** As an admin, I want to manage Electron app update policies from within the admin dashboard, so that I can control when and how users on each release channel receive updates without directly editing the database.

#### Acceptance Criteria

1. WHEN the Admin_Dashboard loads and `window.electron` is defined, THE Admin_Dashboard SHALL display an "Updates" navigation item visible only to users with `is_admin = true`.

2. WHEN an admin selects the Updates tab, THE Update_Management_Panel SHALL fetch all rows from `update_policies`, display up to 200 rows ordered by `published_at` descending, and show a loading indicator while fetching.

3. WHEN the fetch succeeds, THE Update_Management_Panel SHALL display each policy row with the fields: `channel`, `type`, `target_version`, `rollback_from_version` (when present), `active`, `notes`, and `published_at`.

4. WHEN an admin submits the create-policy form, THE Update_Management_Panel SHALL require all of: `channel` (one of `stable`, `beta`, `experimental`), `type` (one of `mandatory`, `recommended`, `experimental`, `rollback`), and `target_version` (matching format `\d+\.\d+\.\d+`). WHEN all fields are valid, THE Update_Management_Panel SHALL insert the new row into `update_policies` and refresh the list.

5. IF the `type` field is set to `rollback`, THEN THE Update_Management_Panel SHALL additionally require a non-empty `rollback_from_version` field (also matching `\d+\.\d+\.\d+`) before enabling the submit button.

6. WHEN an admin clicks "Deactivate" on an active policy row, THE Update_Management_Panel SHALL set `active = false` on that row in `update_policies` and refresh the list.

7. IF an admin attempts to insert an active policy for a channel that already has an active policy, THEN THE Update_Management_Panel SHALL display the error message "A channel can only have one active policy at a time. Deactivate the existing policy first." and not insert the row.

8. WHEN an admin clicks "Check Now" for a channel and `window.electron.updateCheck` is available, THE Update_Management_Panel SHALL invoke `window.electron.updateCheck(channel)` and display the resulting status to the admin using the following label mapping: `checking` → "Checking…", `available` → "Update available", `not-available` → "Up to date", `downloading` → "Downloading…", `downloaded` → "Ready to install", `mandatory-update` → "Mandatory update required", `error` → "Check failed".

9. WHEN an admin selects the Updates tab and `window.electron.updateGetHistory` is available, THE Update_Management_Panel SHALL invoke `window.electron.updateGetHistory()` and display the returned version history records below the policies list.

10. WHEN the version history fetch succeeds, THE Update_Management_Panel SHALL display each record with: `version`, `channel`, `installedAt` (formatted as a human-readable date/time), `source` (one of `fresh-install`, `update`, `rollback`), and `previousVersion` (displaying "—" when absent).

11. WHILE `window.electron` is not defined, THE Admin_Dashboard SHALL render the Updates tab in read-only mode: displaying current policies (fetched from Supabase) but rendering the "Check Now" button and version history section as disabled/hidden with the label "Desktop app required".

12. IF the `update_policies` fetch fails, THEN THE Update_Management_Panel SHALL display an error message "Failed to load update policies" and a "Retry" button that re-triggers the fetch.

13. IF an insert or deactivate operation fails, THEN THE Update_Management_Panel SHALL display an inline error toast describing the failure and leave the policy list unchanged.

---

### Requirement 2: Log Viewer Panel (Admin Integration)

**User Story:** As an admin, I want to view live application logs from the running desktop app directly in the admin dashboard, so that I can diagnose issues without accessing the file system.

#### Acceptance Criteria

1. WHEN the Admin_Dashboard loads and `window.electron` is defined, THE Admin_Dashboard SHALL display a "Logs" navigation item that renders the Log_Viewer_Panel inside the admin tab layout.

2. WHEN the Log_Viewer_Panel mounts, THE Log_Viewer_Panel SHALL invoke `window.electron.logTail(500)`, display the returned log lines in a virtualised scrollable list, and scroll to the bottom of the list after the lines are rendered.

3. THE Log_Viewer_Panel SHALL colour-code log lines by level: DEBUG (grey), INFO (white/default), WARN (amber), ERROR (red), FATAL (bright red/bold).

4. WHEN the Log_Viewer_Panel mounts, all five log levels (DEBUG, INFO, WARN, ERROR, FATAL) SHALL be selected by default in the level filter. WHEN an admin toggles one or more level filter buttons, THE Log_Viewer_Panel SHALL display all log lines whose `level` field matches any of the currently selected levels (OR logic), updating the displayed list immediately.

5. WHEN an admin clicks "Refresh", THE Log_Viewer_Panel SHALL re-invoke `window.electron.logTail(500)` and replace the displayed lines with the fresh result.

6. IF `window.electron.logTail` is not defined, THEN THE Log_Viewer_Panel SHALL display the message "Log tail IPC not available — desktop build required" instead of the log list. IF `window.electron.logTail` is defined but the call rejects or returns an error, THEN THE Log_Viewer_Panel SHALL display the message "Failed to load logs — try refreshing" and show the Refresh button.

7. THE Log_Viewer_Panel SHALL display each log line with: timestamp (ISO 8601 formatted), level badge, message text, and context object serialised as JSON (omitted when absent).

---

### Requirement 3: Crash Report Panel

**User Story:** As an admin, I want to see previous crash reports from the desktop app and mark them as acknowledged, so that I can track crash incidents and confirm they have been reviewed.

#### Acceptance Criteria

1. WHEN the Admin_Dashboard loads and `window.electron` is defined, THE Admin_Dashboard SHALL display a "Crash Reports" navigation item visible only to users with `is_admin = true`.

2. WHEN the Crash_Report_Panel mounts, THE Crash_Report_Panel SHALL register a listener on `window.electron.onCrashPrevious` and store any received crash report objects in component state.

3. THE Crash_Report_Panel SHALL display each crash report with: `id`, `date` (formatted as a locale-sensitive date and time string showing at minimum the full date and time to the minute, e.g. "Jan 15, 2024, 10:30 AM"), and `path`, displaying at most 50 crash reports at a time.

4. WHEN no crash reports have been received during the current session, or when all received reports have been acknowledged and filtered out, THE Crash_Report_Panel SHALL display the message "No crash reports detected in this session".

5. WHEN an admin clicks "Acknowledge" on a crash report and the `acknowledged_crash_ids` localStorage write succeeds, THE Crash_Report_Panel SHALL remove that report from the displayed list and persist its `id` into the `acknowledged_crash_ids` localStorage key as a JSON array.

6. IF the `acknowledged_crash_ids` localStorage write fails when an admin clicks "Acknowledge", THEN THE Crash_Report_Panel SHALL retain that report in the displayed list and show an inline error indication on that report's row indicating the acknowledgment could not be saved.

7. WHEN the Crash_Report_Panel mounts, THE Crash_Report_Panel SHALL read `acknowledged_crash_ids` from localStorage and filter out any crash report whose `id` is present in that array before rendering the list.

8. WHERE `window.electron` is not defined, THE Admin_Dashboard SHALL NOT render the Crash Reports navigation tab.

---

### Requirement 4: User Statistics Panel

**User Story:** As an admin, I want a dedicated user statistics view that shows signups over time, active users, and retention metrics, so that I can track growth and engagement beyond what the existing analytics dashboard provides.

#### Acceptance Criteria

1. WHEN an admin selects the "User Stats" analytics sub-tab, THE Analytics_Dashboard SHALL display the total registered user count with an exact count query against `profiles`.

2. WHEN the User Stats panel is active, THE Analytics_Dashboard SHALL display new signup counts over the selected time range, grouped by day (daily), week (weekly), or calendar month (monthly) according to the active time range selection.

3. WHEN the User Stats panel is active, THE Analytics_Dashboard SHALL display Daily Active Users (DAU) as a series of daily counts — each count being the number of distinct users with at least one activity record on that date — within the selected time range.

4. WHEN the User Stats panel is active, THE Analytics_Dashboard SHALL display a 7-day retention metric: the percentage of users who signed up within the last 30 days and had at least one activity record within the 7 days immediately following their signup date. The 7-day retention metric SHALL remain fixed to the trailing 30-day cohort and SHALL NOT change when the time range selector is updated.

5. WHEN the time range selector is changed (Day / Week / Month), THE Analytics_Dashboard SHALL re-query and refresh the signup chart and DAU chart within 2 seconds.

6. WHEN the User Stats panel is active, THE Analytics_Dashboard SHALL display up to 5 countries by new signup count for the selected time range. IF fewer than 5 countries have signups in the selected time range, THE Analytics_Dashboard SHALL display only the countries that do have signups.

7. IF the user statistics data fetch fails, THEN THE Analytics_Dashboard SHALL display an error message "Failed to load user statistics" and a "Retry" button.

8. IF no signups or DAU data exist for the selected time range, THEN THE Analytics_Dashboard SHALL display "No data available for the selected period" in the relevant chart area.

---

### Requirement 5: Extension Analytics Panel

**User Story:** As an admin, I want to see per-extension install, uninstall, and usage analytics, so that I can understand which extensions are popular and whether any are experiencing high error rates.

#### Acceptance Criteria

1. WHEN an admin opens the Extension Analytics panel, THE Extension_Analytics_Panel SHALL load and display per-extension metrics: total install count, active user count (users with the extension currently enabled), and installs in the trailing 30 calendar days.

2. THE Extension_Analytics_Panel SHALL display the top 10 extensions by total install count. IF fewer than 10 extensions exist, THE Extension_Analytics_Panel SHALL display all available extensions.

3. THE Extension_Analytics_Panel SHALL display each extension row with columns: extension name, total installs, active users, and installs in the last 30 days.

4. THE Extension_Analytics_Panel SHALL compute and display the uninstall rate per extension as `(total_installs - active_user_count) / total_installs` rounded to one decimal place as a percentage. IF `total_installs` is zero, THE Extension_Analytics_Panel SHALL display "N/A" for that extension's uninstall rate.

5. WHEN an extension's health score falls below 0.5, THE Extension_Analytics_Panel SHALL highlight that extension row with a distinct visual warning indicator (e.g., an amber icon or border) that is visually distinguishable from rows with a health score of 0.5 or above.

6. WHEN an admin opens the Extension Analytics panel, THE Extension_Analytics_Panel SHALL also display a summary of audit log events for the trailing 7 calendar days, grouped by event type, showing the count of each event type.

7. IF the extension data fetch fails, THEN THE Extension_Analytics_Panel SHALL display "Failed to load extension analytics" and a "Retry" button.

---

### Requirement 6: Streaming and Download Analytics Panel

**User Story:** As an admin, I want visibility into streaming activity, concurrent viewer estimates, stream duration distribution, and download completion rates, so that I can understand platform usage and content popularity.

#### Acceptance Criteria

1. WHEN an admin opens the Streaming Analytics panel, THE Streaming_Analytics_Panel SHALL display the total number of watch sessions started within the selected time range.

2. WHEN an admin opens the Streaming Analytics panel, THE Streaming_Analytics_Panel SHALL display the peak concurrent viewer estimate: the maximum count of watch sessions whose start timestamp falls within any single 1-hour bucket in the selected time range.

3. WHEN an admin opens the Streaming Analytics panel, THE Streaming_Analytics_Panel SHALL display a stream duration distribution histogram with four buckets based on session duration: 0–299 seconds (0–5 min), 300–1199 seconds (5–20 min), 1200–3599 seconds (20–60 min), and 3600+ seconds (60+ min).

4. WHEN an admin opens the Streaming Analytics panel, THE Streaming_Analytics_Panel SHALL display a provider usage breakdown showing the count of resolved source events per provider for the selected time range, sorted by count descending.

5. WHEN an admin opens the Download Analytics section, THE Download_Analytics_Panel SHALL display the top 10 content items by completed download count for the selected time range. IF fewer than 10 items have completed downloads in the selected time range, THE Download_Analytics_Panel SHALL display all available items.

6. WHEN an admin opens the Download Analytics section, THE Download_Analytics_Panel SHALL display the overall download completion rate for the selected time range, calculated as the number of completed downloads divided by the total number of download attempts where the session had any watch duration, expressed as a percentage rounded to one decimal place.

7. IF the denominator for the download completion rate is zero (no download attempts with watch duration > 0 in the selected time range), THEN THE Download_Analytics_Panel SHALL display "N/A" instead of a percentage.

8. IF either analytics panel fails to load its data, THEN the respective panel SHALL display "Failed to load data" and a "Retry" button.

---

### Requirement 7: Performance Insights Panel

**User Story:** As an admin, I want to see app version distribution across the user base, crash rate trends, and update adoption rates, so that I can understand how quickly users are upgrading and whether particular versions have stability issues.

#### Acceptance Criteria

1. WHEN an admin opens the Performance Insights panel, IF `profiles.app_version` exists as a column, THEN THE Performance_Insights_Panel SHALL display the version distribution as a percentage breakdown of users across distinct version values. IF `profiles.app_version` does not exist, THEN THE Performance_Insights_Panel SHALL display "Version distribution data not available".

2. WHEN an admin opens the Performance Insights panel and an active `mandatory` or `recommended` policy exists for the `stable` channel, THE Performance_Insights_Panel SHALL display update adoption rate as the percentage of users whose recorded app version matches that policy's target version. IF no such active policy exists, THE Performance_Insights_Panel SHALL display "No active stable channel policy".

3. WHEN an admin opens the Performance Insights panel, THE Performance_Insights_Panel SHALL display a crash rate trend chart grouped by calendar day for the selected time range (default: last 30 days, range: 1–90 days). IF no crash telemetry data exists for the selected range, THE Performance_Insights_Panel SHALL display "No crash telemetry data".

4. WHEN an admin explicitly opens the Performance Insights tab and `window.electron` is defined, THE Performance_Insights_Panel SHALL call `window.electron.perfGetHistory(20)` and render a time-series line chart of `heapUsedMB` and `rssMB` over the returned snapshots. IF the IPC call fails or returns an empty array, THE Performance_Insights_Panel SHALL display "No performance snapshot data available" in the chart area.

5. WHERE `window.electron` is not defined, THE Performance_Insights_Panel SHALL NOT render the perf snapshot chart section.

---

### Requirement 8: Timed and Preset Bans

**User Story:** As an admin or moderator, I want to apply time-limited bans with preset durations (7 days, 30 days) or a custom duration, in addition to permanent bans, so that moderation responses are proportional and bans expire automatically.

#### Acceptance Criteria

1. WHEN a moderator or admin opens the ban dialog for a user, THE Ban_System SHALL present four duration options: Permanent, 7 days, 30 days, and Custom.

2. WHEN "Custom" duration is selected in the ban dialog, THE Ban_System SHALL display a numeric input field that accepts whole-number hour values between 1 and 8760 inclusive.

3. WHEN a moderator or admin submits the ban dialog with a duration other than Permanent, THE Ban_System SHALL call the `ban_user` RPC with the selected number of hours as the `duration_hours` argument, resulting in an `expires_at` value equal to the current time plus the specified hours.

4. WHEN a moderator or admin submits the ban dialog with the Permanent option selected, THE Ban_System SHALL call the `ban_user` RPC with `duration_hours` set to null, resulting in no expiry (`expires_at` remains null).

5. IF a ban's expiry timestamp is in the past, THEN THE Ban_System SHALL automatically lift the ban for that user, with the automated unban running at least once per hour via a scheduled server-side process.

6. THE Admin_Dashboard SHALL display the remaining ban duration for each currently banned user in the Users tab: "Banned · expires in X days Y hours" for timed bans (omitting zero-value units), or "Banned · permanent" for permanent bans.

7. IF a custom duration value outside the range 1–8760 is submitted, THEN THE Ban_System SHALL reject the submission and display a validation message indicating the allowed range.

8. IF the `ban_user` RPC call fails, THEN THE Ban_System SHALL display an error message indicating the ban could not be applied and leave the user's ban status unchanged.

---

### Requirement 9: Device ID Bans

**User Story:** As an admin, I want to ban a user by their device fingerprint (device ID), so that users who create new accounts to evade account-level bans can be blocked at the device level.

#### Acceptance Criteria

1. THE Admin_Dashboard SHALL provide a "Device Ban" form in the Ban Management section with three fields: device ID (1–255 characters, required), reason (1–500 characters, required), and an optional expiry date/time (if absent, the ban is permanent).

2. WHEN an admin submits a valid device ban form, THE Ban_System SHALL record the device ban (storing device ID, reason, the submitting admin's identity, creation time, and expiry if provided) and display a confirmation to the admin.

3. IF an active device ban already exists for the submitted device ID, THEN THE Ban_System SHALL reject the submission and display an error indicating that device is already banned.

4. WHEN a user attempts to authenticate and their device fingerprint matches an active device ban (one that has not expired), THE Ban_System SHALL reject the authentication attempt and return an error message indicating the device is banned.

5. THE Admin_Dashboard SHALL list all active device bans in the Ban Management section with columns: device ID (truncated to 20 characters with a tooltip showing the full value), reason, banned by (admin display name), and expiry ("Permanent" if no expiry set). IF no active device bans exist, THE Admin_Dashboard SHALL display "No active device bans".

6. WHEN an admin clicks "Remove" on a device ban row, THE Ban_System SHALL permanently delete that device ban record. IF the record no longer exists at deletion time, THE Ban_System SHALL display an error message indicating the ban was already removed.

7. WHEN a non-admin user attempts any device ban operation, THE Ban_System SHALL reject the request and return an error indicating insufficient permissions.

---

### Requirement 10: IP Bans

**User Story:** As an admin, I want to ban users by IP address, so that I can block access from specific IP addresses independently of user accounts or device IDs.

#### Acceptance Criteria

1. THE Admin_Dashboard SHALL provide an "IP Ban" form in the Ban Management section with three fields: IP address (IPv4 or IPv6, required), reason (1–500 characters, required), and an optional expiry date/time (if absent, the ban is permanent).

2. WHEN an admin submits a valid IP ban form, THE Ban_System SHALL record the IP ban (storing IP address, reason, the submitting admin's identity, creation time, and expiry if provided) and display a confirmation to the admin.

3. IF the submitted IP address is not a valid IPv4 or IPv6 address, THEN THE Ban_System SHALL reject the submission and display the message "Invalid IP address format".

4. IF the reason field is empty or contains only whitespace, THEN THE Ban_System SHALL reject the submission and display a validation error requiring a non-empty reason.

5. WHEN a request arrives at the application from an IP address matching an active IP ban (one that has not expired), THE Ban_System SHALL reject the request and return an error response indicating the IP address is banned.

6. IF an active IP ban already exists for the submitted IP address, THEN THE Ban_System SHALL reject the submission and display an error indicating that IP is already banned.

7. THE Admin_Dashboard SHALL list all active IP bans with columns: IP address, reason, banned by (admin display name), and expiry ("Permanent" if no expiry). WHEN an admin clicks "Remove" on an IP ban row, THE Ban_System SHALL delete that IP ban record.

8. WHEN a non-admin user attempts any IP ban operation, THE Ban_System SHALL reject the request and return an error indicating insufficient permissions.

9. THE ban_templates table SHALL restrict all operations to authenticated admin users, returning an error for any operation attempted by a non-admin user.

---

### Requirement 11: Bulk Ban Actions

**User Story:** As an admin, I want to select multiple users and apply a ban action to all of them at once, so that I can efficiently respond to coordinated abuse or spam campaigns.

#### Acceptance Criteria

1. THE Admin_Dashboard Users tab SHALL display a checkbox column allowing admins to select one or more user rows. WHEN the selection count drops to zero, THE Admin_Dashboard SHALL hide the bulk-actions toolbar.

2. WHEN at least one user is selected, THE Admin_Dashboard SHALL display a bulk-actions toolbar with a "Bulk Ban" button.

3. WHEN an admin clicks "Bulk Ban", THE Admin_Dashboard SHALL open a ban dialog prompting for: a shared reason (1–500 characters, required) and a shared duration (Permanent, 7 days, 30 days, or 1–365 days custom) to apply to all selected users.

4. WHEN the bulk-ban dialog is confirmed, THE Admin_Dashboard SHALL call the `ban_user` RPC sequentially for each selected user with the shared reason and duration, displaying a "Processing X of N" progress indicator updated after each call completes.

5. WHEN all `ban_user` calls complete, THE Admin_Dashboard SHALL display a summary toast "Banned N users successfully" (N = count of successful bans) that auto-dismisses after 5 seconds, and refresh the user list.

6. IF any `ban_user` call fails during a bulk ban, THEN THE Admin_Dashboard SHALL continue processing the remaining users and, after all calls complete, display a separate dismissible error toast listing the display names of users whose ban failed.

---

### Requirement 12: Ban Templates

**User Story:** As an admin, I want to save and reuse ban reason/duration combinations as named templates, so that common moderation actions are consistent and fast to apply.

#### Acceptance Criteria

1. THE Admin_Dashboard Ban Management section SHALL display a "Templates" sub-section listing all saved ban templates alphabetically by name. IF no templates exist, THE Admin_Dashboard SHALL display "No templates saved yet".

2. WHEN an admin fills in a reason and duration in the ban dialog and clicks "Save as Template", THE Admin_Dashboard SHALL prompt for a template name (1–100 characters, unique among existing template names). WHEN the admin confirms with a valid name, THE Admin_Dashboard SHALL save the template and add it to the templates list.

3. IF the template name is blank, exceeds 100 characters, or duplicates an existing template name, THEN THE Admin_Dashboard SHALL reject the save and display a validation error describing the specific constraint violated.

4. WHEN an admin opens the ban dialog for a user, THE Admin_Dashboard SHALL display a "Use Template" dropdown populated from all saved ban templates, sorted alphabetically.

5. WHEN an admin selects a template from the dropdown, THE Admin_Dashboard SHALL pre-fill the `reason` field with the template's reason and the `duration` field with the template's duration value (displaying "Permanent" when `duration_hours` is null).

6. WHEN an admin clicks "Delete" on a ban template, THE Admin_Dashboard SHALL display a confirmation prompt. WHEN the admin confirms deletion, THE Admin_Dashboard SHALL delete that template from storage and remove it from the templates list.

7. WHEN a non-admin user attempts any ban template operation, THE Ban_System SHALL reject the request and return an error indicating insufficient permissions.

---

### Requirement 13: Ban Audit Log

**User Story:** As an admin, I want a full audit log of all ban and unban events including which admin performed each action, so that moderation decisions are transparent and accountable.

#### Acceptance Criteria

1. WHEN an admin navigates to the "Ban Audit Log" section under Moderation, THE Admin_Dashboard SHALL display ban/unban records ordered by timestamp descending, paginated at 50 rows per page.

2. THE Ban_Audit_Log SHALL display each record with: target user (display name and username), action ("Banned" or "Unbanned"), reason, duration ("Permanent" when no expiry is set; otherwise displayed in the largest whole unit, e.g. "7 days" or "720 hours"), performed by (admin display name), and timestamp (formatted as a human-readable date/time).

3. WHEN an unban event is displayed, THE Ban_Audit_Log SHALL show the action label "Unbanned" and the display name of the admin who performed the unban.

4. WHEN an admin enters text in the search box, THE Ban_Audit_Log SHALL filter displayed rows to those where the target user's display name or username contains the search text (case-insensitive). IF no records match the search text, THE Ban_Audit_Log SHALL display "No matching records found".

5. WHEN an admin selects a filter from the action-type control (All / Banned / Unbanned), THE Ban_Audit_Log SHALL immediately update the displayed records to show only those matching the selected action type.

6. WHEN an admin clicks "Export CSV", THE Ban_Audit_Log SHALL generate and trigger a browser download of a CSV file containing all currently visible (filtered) records with headers: `user_id`, `username`, `action`, `reason`, `duration_hours`, `expires_at`, `performed_by`, `timestamp`. The exported data SHALL reflect both the active search filter and the active action-type filter simultaneously.

7. WHEN a user without admin or moderator role attempts to access the Ban Audit Log, THE Admin_Dashboard SHALL deny access and display an error message indicating they are not authorised to view this section.
