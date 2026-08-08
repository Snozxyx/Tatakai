import type { VersionDistribution, UpdatePolicy } from '../types/admin-dashboard';

/**
 * Computes per-version percentage share from an array of profile records.
 * 
 * - Ignores null/empty app_version entries
 * - Each version's percent = (count / total) * 100
 * - Percentages are rounded to 2 decimal places
 * - The sum of all percentages should be close to 100%
 * 
 * Requirements: 7.1
 */
export function versionDistribution(
  profiles: { app_version: string | null }[]
): VersionDistribution[] {
  const counts = new Map<string, number>();
  
  for (const p of profiles) {
    if (!p.app_version) continue;
    counts.set(p.app_version, (counts.get(p.app_version) ?? 0) + 1);
  }
  
  const total = Array.from(counts.values()).reduce((sum, n) => sum + n, 0);
  if (total === 0) return [];
  
  const entries = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1]); // sort by count descending
  
  const result: VersionDistribution[] = entries.map(([version, count]) => ({
    version,
    count,
    percent: Math.round((count / total) * 10000) / 100,
  }));
  
  return result;
}

/**
 * Computes the update adoption rate for a given policy's target version.
 * 
 * Formula: count(app_version === policy.target_version) / total * 100
 * Returns 0 when the profiles array is empty.
 * 
 * Requirements: 7.2
 */
export function adoptionRate(
  profiles: { app_version: string | null }[],
  policy: Pick<UpdatePolicy, 'target_version'>
): number {
  if (profiles.length === 0) return 0;
  const matched = profiles.filter(p => p.app_version === policy.target_version).length;
  return (matched / profiles.length) * 100;
}
