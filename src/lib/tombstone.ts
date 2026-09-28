/**
 * Soft-deleted posts/comments survive as a tombstone so threads, quotes and
 * reposts don't break. The label reflects WHO removed it, driven by the
 * `deleted_by_role` column (set by the soft_delete_* RPCs):
 *   - platform admin        → "[Deleted by Admin]"
 *   - platform / community mod → "[Deleted by Moderator]"
 *   - community owner        → "[Deleted by Owner]"
 *   - author (or unknown)    → "[DELETED By User]"  (legacy fallback casing)
 *
 * Rows deleted before the moderation migration have no role → fall back to the
 * original author tombstone.
 */
export function tombstoneLabel(deletedByRole?: string | null): string {
  switch (deletedByRole) {
    case 'admin':
      return '[Deleted by Admin]';
    case 'moderator':
    case 'mod':
      return '[Deleted by Moderator]';
    case 'owner':
      return '[Deleted by Owner]';
    default:
      return '[DELETED By User]';
  }
}
