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
export function tombstoneLabel(deletedByRole?: string | null, language?: string): string {
  const lang = (language || (typeof localStorage !== 'undefined' ? localStorage.getItem('tatakai-ui-lang') : null) || 'en').split('-')[0];
  const es = lang === 'es';
  switch (deletedByRole) {
    case 'admin':
      return es ? '[Eliminado por un administrador]' : '[Deleted by Admin]';
    case 'moderator':
    case 'mod':
      return es ? '[Eliminado por un moderador]' : '[Deleted by Moderator]';
    case 'owner':
      return es ? '[Eliminado por el propietario]' : '[Deleted by Owner]';
    default:
      return es ? '[Eliminado por el usuario]' : '[DELETED By User]';
  }
}
