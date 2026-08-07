/**
 * banUtils.ts — Pure utility functions for the Ban System.
 *
 * Requirements: 8.2, 8.6, 8.7
 *
 * More functions will be added in subsequent tasks (14.1, 14.3, 15.1, 17.1, 18.1, 18.4).
 */

import type { BanAuditRecord, BanTemplate } from '../types/admin-dashboard';

// ---------------------------------------------------------------------------
// validateCustomDuration
// ---------------------------------------------------------------------------

/**
 * Returns `true` if `hours` is a whole-number (integer) value in the
 * inclusive range [1, 8760] (1 hour to 1 year), `false` otherwise.
 *
 * Rejects:
 *   - zero or negative values
 *   - values greater than 8760
 *   - non-integer values (e.g. 1.5)
 *   - NaN, Infinity, -Infinity
 *
 * Requirements: 8.2, 8.7
 */
export function validateCustomDuration(hours: number): boolean {
  return Number.isInteger(hours) && hours >= 1 && hours <= 8760;
}

// ---------------------------------------------------------------------------
// formatBanDuration
// ---------------------------------------------------------------------------

/**
 * Formats the remaining ban duration for display in the Users tab.
 *
 * - `expiresAt = null`  → "Banned · permanent"
 * - future expiry       → "Banned · expires in X days Y hours"
 *                         Zero-value units are omitted:
 *                           e.g. exactly 2 days → "Banned · expires in 2 days"
 *                           e.g. < 1 hour remaining → "Banned · expires in 0 hours"
 *                           (degenerate: sub-hour remainder treated as 0 hours)
 *
 * @param expiresAt  ISO 8601 expiry timestamp, or `null` for permanent bans.
 * @param now        Current date/time — defaults to `new Date()`. Provided as
 *                   a parameter to allow deterministic unit testing.
 *
 * Requirements: 8.6
 */
export function formatBanDuration(
  expiresAt: string | null,
  now: Date = new Date(),
): string {
  if (expiresAt === null) {
    return 'Banned · permanent';
  }

  const expiryMs = new Date(expiresAt).getTime();
  const nowMs = now.getTime();

  // Total milliseconds remaining (floor to whole hours)
  const totalHoursRemaining = Math.floor((expiryMs - nowMs) / (1000 * 60 * 60));

  const days = Math.floor(totalHoursRemaining / 24);
  const hours = totalHoursRemaining % 24;

  // Build the human-readable parts, omitting zero-value units
  const parts: string[] = [];
  if (days > 0) {
    parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
  }
  if (hours > 0) {
    parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  }

  // Edge case: < 1 hour remaining — show "0 hours" rather than an empty string
  if (parts.length === 0) {
    parts.push('0 hours');
  }

  return `Banned · expires in ${parts.join(' ')}`;
}

// ---------------------------------------------------------------------------
// validateDeviceBan
// ---------------------------------------------------------------------------

/**
 * Returns `true` if both `device_id` and `reason` meet the required length
 * constraints, `false` otherwise.
 *
 * - `device_id`: 1–255 characters (inclusive)
 * - `reason`:    1–500 characters (inclusive)
 *
 * Requirements: 9.1
 */
export function validateDeviceBan(device_id: string, reason: string): boolean {
  return (
    device_id.length >= 1 &&
    device_id.length <= 255 &&
    reason.length >= 1 &&
    reason.length <= 500
  );
}

// ---------------------------------------------------------------------------
// truncateDeviceId
// ---------------------------------------------------------------------------

/**
 * Truncates a device ID for display purposes.
 *
 * - `display`: the first 20 characters of `device_id`; unchanged if the
 *              string is 20 characters or fewer.
 * - `full`:    always the complete, unmodified `device_id` value (for use
 *              as a tooltip so the full ID is accessible to the user).
 *
 * Requirements: 9.5
 */
export function truncateDeviceId(device_id: string): { display: string; full: string } {
  return {
    display: device_id.length <= 20 ? device_id : device_id.slice(0, 20),
    full: device_id,
  };
}

// ---------------------------------------------------------------------------
// validateIpAddress
// ---------------------------------------------------------------------------

/**
 * Returns `true` if `ip` is a valid IPv4 or IPv6 address string.
 *
 * IPv4: four dot-separated octets each in range 0–255, no leading zeros.
 * IPv6: standard notation (full, compressed with ::, loopback ::1, etc.).
 *
 * Requirements: 10.1, 10.3
 */
export function validateIpAddress(ip: string): boolean {
  // IPv4: four octets 0-255, no leading zeros
  const ipv4 = /^((25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.){3}(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)$/;
  if (ipv4.test(ip)) return true;

  // IPv6: full or compressed notation
  // Strategy: use URL constructor trick — if it doesn't throw, the address is valid.
  // We do NOT compare url.hostname to the input because the URL parser normalises
  // IPv6 addresses (removes leading zeros, compresses consecutive zero groups, etc.),
  // so a valid but non-canonical address like "2001:0db8:0000:..." would not match
  // its own bracketed form after normalisation.
  try {
    new URL(`http://[${ip}]`);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// filterAuditLog
// ---------------------------------------------------------------------------

/**
 * Filters a list of ban audit records by search text and/or action type.
 *
 * - `searchText`: case-insensitive containment match against `display_name`
 *   OR `username`. Empty string matches all records.
 * - `actionFilter`: restricts to 'banned' or 'unbanned' actions; 'all'
 *   bypasses the action filter.
 *
 * Requirements: 13.4, 13.5
 */
export function filterAuditLog(
  records: BanAuditRecord[],
  searchText: string,
  actionFilter: 'all' | 'banned' | 'unbanned',
): BanAuditRecord[] {
  const needle = searchText.toLowerCase();

  return records.filter((record) => {
    // Text filter: match display_name or username (case-insensitive containment)
    const matchesText =
      needle === '' ||
      record.display_name.toLowerCase().includes(needle) ||
      record.username.toLowerCase().includes(needle);

    // Action filter
    const matchesAction =
      actionFilter === 'all' || record.action === actionFilter;

    return matchesText && matchesAction;
  });
}

// ---------------------------------------------------------------------------
// exportAuditLogCsv
// ---------------------------------------------------------------------------

/**
 * Generates a CSV Blob from the provided audit log records.
 *
 * CSV columns (in order):
 *   user_id, username, action, reason, duration_hours, expires_at,
 *   performed_by, timestamp
 *
 * Field escaping rules (RFC 4180):
 *   - Fields containing commas, double-quotes, or newlines are wrapped in
 *     double-quotes.
 *   - Any double-quote character within a field is escaped as `""`.
 *
 * Null values:
 *   - `duration_hours` and `expires_at` are written as empty strings when null.
 *
 * @param visibleRecords  The already-filtered records to export (caller applies
 *                        any active search/filter before passing them in).
 * @returns  A `Blob` of type `text/csv` ready for download via
 *           `URL.createObjectURL`.
 *
 * Requirements: 13.6
 */
export function exportAuditLogCsv(visibleRecords: BanAuditRecord[]): Blob {
  /**
   * Escapes a single CSV field value according to RFC 4180:
   * wrap in double-quotes if the value contains a comma, double-quote,
   * carriage return, or newline; escape internal double-quotes as "".
   */
  function escapeCsvField(value: string): string {
    const needsQuoting = /[",\r\n]/.test(value);
    if (!needsQuoting) return value;
    return `"${value.replace(/"/g, '""')}"`;
  }

  const headers = [
    'user_id',
    'username',
    'action',
    'reason',
    'duration_hours',
    'expires_at',
    'performed_by',
    'timestamp',
  ];

  const rows: string[] = [headers.join(',')];

  for (const record of visibleRecords) {
    const fields = [
      escapeCsvField(record.user_id),
      escapeCsvField(record.username),
      escapeCsvField(record.action),
      escapeCsvField(record.reason),
      record.duration_hours !== null ? String(record.duration_hours) : '',
      record.expires_at !== null ? escapeCsvField(record.expires_at) : '',
      escapeCsvField(record.performed_by_display_name),
      escapeCsvField(record.timestamp),
    ];
    rows.push(fields.join(','));
  }

  const csvContent = rows.join('\r\n');
  return new Blob([csvContent], { type: 'text/csv' });
}

// ---------------------------------------------------------------------------
// sortTemplatesAlpha
// ---------------------------------------------------------------------------

/**
 * Returns a new array of ban templates sorted case-insensitively by name.
 * Does not mutate the input array.
 *
 * Requirements: 12.1, 12.4
 */
export function sortTemplatesAlpha(templates: BanTemplate[]): BanTemplate[] {
  return [...templates].sort((a, b) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  );
}

// ---------------------------------------------------------------------------
// validateTemplateName
// ---------------------------------------------------------------------------

/**
 * Returns true if the template name is valid:
 *   - 1 to 100 characters (inclusive)
 *   - Not already in existingNames (case-sensitive comparison)
 *
 * Requirements: 12.2, 12.3
 */
export function validateTemplateName(name: string, existingNames: string[]): boolean {
  return name.length >= 1 && name.length <= 100 && !existingNames.includes(name);
}
