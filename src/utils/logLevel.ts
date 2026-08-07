/**
 * Log level colour utility and filter logic for the Log Viewer Panel.
 *
 * Requirements: 2.3, 2.4
 */

/** Supported log level strings. */
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

/**
 * Returns a distinct, non-empty CSS colour string for the given log level.
 *
 * Colour scheme (Requirements 2.3):
 *   DEBUG → grey
 *   INFO  → white / default
 *   WARN  → amber
 *   ERROR → red
 *   FATAL → bright red / bold (distinct from ERROR)
 */
export function levelColour(level: string): string {
  switch (level.toUpperCase()) {
    case 'DEBUG':
      return '#9ca3af'; // Tailwind gray-400
    case 'INFO':
      return '#f3f4f6'; // Tailwind gray-100 — white/default
    case 'WARN':
      return '#f59e0b'; // Tailwind amber-500
    case 'ERROR':
      return '#ef4444'; // Tailwind red-500
    case 'FATAL':
      return '#ff2222'; // bright red — distinct from ERROR (#ef4444)
    default:
      return '#f3f4f6'; // unknown levels fall back to INFO colour
  }
}

/** A log entry with at minimum a level and message field. */
export interface LogEntry {
  level: string;
  message: string;
  [key: string]: unknown;
}

/**
 * Filters log entries by the selected levels using OR semantics.
 *
 * Pure function with no side effects (Requirements 2.4).
 *
 * @param entries       Array of log entry objects, each with a `level` field.
 * @param selectedLevels  The set of levels to include — may be a Set<string>
 *                        or a plain string array.
 * @returns             A new array containing only entries whose `level` is a
 *                      member of `selectedLevels`.
 */
export function filterByLevels(
  entries: LogEntry[],
  selectedLevels: Set<string> | string[],
): LogEntry[] {
  const levelSet =
    selectedLevels instanceof Set
      ? selectedLevels
      : new Set(selectedLevels);

  return entries.filter((entry) => levelSet.has(entry.level));
}
