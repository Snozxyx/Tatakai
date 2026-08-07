import type { ExtensionMetrics } from '../types/admin-dashboard';

/**
 * Returns the top `n` extensions ordered by `totalInstalls` descending.
 * If fewer than `n` extensions exist, returns all of them.
 *
 * @param extensions - Array of extension metrics to rank
 * @param n          - Maximum number of results to return
 * @returns Sorted slice of at most `n` extensions
 */
export function topNExtensions(extensions: ExtensionMetrics[], n: number): ExtensionMetrics[] {
  return extensions
    .slice()
    .sort((a, b) => b.totalInstalls - a.totalInstalls)
    .slice(0, n);
}

/**
 * Computes the uninstall rate as a one-decimal percentage.
 *
 * Formula: `Math.round((totalInstalls - activeUsers) / totalInstalls * 1000) / 10`
 *
 * @param totalInstalls - Total number of installs for the extension
 * @param activeUsers   - Number of currently active users
 * @returns One-decimal percentage, or `null` when `totalInstalls === 0`
 */
export function computeUninstallRate(totalInstalls: number, activeUsers: number): number | null {
  if (totalInstalls === 0) {
    return null;
  }
  return Math.round((totalInstalls - activeUsers) / totalInstalls * 1000) / 10;
}
