/**
 * Staff role resolution
 *
 * The database decides staff status with `public.has_role(uuid, text)`, which reads
 * `profiles.is_admin`, `profiles.is_moderator` and `profiles.role`. Nearly every RLS
 * policy under `supabase/migrations` inlines the same expression. The client used to
 * derive it from `profiles.role` alone, so the two disagreed: a user promoted through
 * the admin panel (which writes `is_admin`) passed every RLS policy while the UI still
 * treated them as a normal user.
 *
 * This module is the single client-side definition, mirroring the database expression.
 * Prefer `resolveStaffRoles`, which asks the database and only falls back to the local
 * derivation when the RPC is unreachable.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** The subset of `profiles` that carries staff status. */
export interface StaffRoleSource {
  is_admin?: boolean | null;
  is_moderator?: boolean | null;
  role?: string | null;
}

export interface StaffRoles {
  isAdmin: boolean;
  isModerator: boolean;
}

/**
 * Local admin derivation, matching the RLS expression
 * `is_admin = true OR role = 'admin'`.
 *
 * Note this is broader than the deployed `has_role(uid, 'admin')`, which checks only
 * `is_admin`. The union is deliberate: it keeps admins whose status lives in `role`
 * from being locked out of the panel before the two representations converge.
 */
export function deriveIsAdmin(source: StaffRoleSource | null | undefined): boolean {
  if (!source) return false;
  return source.is_admin === true || source.role === 'admin';
}

/** Local moderator derivation. Admins are always moderators. */
export function deriveIsModerator(source: StaffRoleSource | null | undefined): boolean {
  if (!source) return false;
  return deriveIsAdmin(source) || source.is_moderator === true || source.role === 'moderator';
}

/** True when the user holds either staff role. */
export function deriveIsStaff(source: StaffRoleSource | null | undefined): boolean {
  return deriveIsModerator(source);
}

async function callHasRole(
  client: SupabaseClient<any>,
  userId: string,
  role: 'admin' | 'moderator'
): Promise<boolean | null> {
  try {
    const { data, error } = await client.rpc('has_role' as any, {
      p_user_id: userId,
      p_role: role,
    } as any);
    // A missing function (42883) or a permission error means the instance predates
    // the helper; treat it as "unknown" so the caller can fall back rather than
    // silently demoting the user.
    if (error) return null;
    return data === true;
  } catch {
    return null;
  }
}

/**
 * Resolve staff roles for a user, preferring the database's own answer.
 *
 * The RPC result is OR-ed with the local derivation rather than replacing it. The two
 * only diverge while a profile carries staff status in one representation and not the
 * other, and in that window the union is what the RLS policies already grant — so the
 * UI matches what the user can actually do.
 */
export async function resolveStaffRoles(
  client: SupabaseClient<any>,
  userId: string,
  source: StaffRoleSource | null | undefined
): Promise<StaffRoles> {
  const localAdmin = deriveIsAdmin(source);
  const localModerator = deriveIsModerator(source);

  const [remoteAdmin, remoteModerator] = await Promise.all([
    callHasRole(client, userId, 'admin'),
    callHasRole(client, userId, 'moderator'),
  ]);

  const isAdmin = localAdmin || remoteAdmin === true;
  const isModerator = isAdmin || localModerator || remoteModerator === true;

  return { isAdmin, isModerator };
}

/**
 * The `profiles` patch that promotes or demotes an admin.
 *
 * Writes both representations so `has_role`, the RLS policies and the client can never
 * disagree. Demotion clears `role` only when it currently reads `admin`, to avoid
 * clobbering an unrelated value.
 *
 * No longer applied to the database from the client: `authenticated` holds no UPDATE
 * privilege on the role columns (20260902000003), and AdminPage calls the
 * `set_staff_role` RPC instead. This function and its tests stay as the reference
 * definition of the transition table that RPC implements — the SQL was written from
 * them, and `tests/roles.test.ts` is the only executable check on it, since there is no
 * local Postgres to run the function against.
 */
export function adminRolePatch(makeAdmin: boolean, currentRole?: string | null) {
  if (makeAdmin) {
    return { is_admin: true, role: 'admin' };
  }
  return {
    is_admin: false,
    role: currentRole === 'admin' ? 'user' : (currentRole ?? 'user'),
  };
}

/** The `profiles` patch that promotes or demotes a moderator. See `adminRolePatch`. */
export function moderatorRolePatch(makeModerator: boolean, currentRole?: string | null) {
  if (makeModerator) {
    return { is_moderator: true, role: currentRole === 'admin' ? 'admin' : 'moderator' };
  }
  return {
    is_moderator: false,
    role: currentRole === 'moderator' ? 'user' : (currentRole ?? 'user'),
  };
}
