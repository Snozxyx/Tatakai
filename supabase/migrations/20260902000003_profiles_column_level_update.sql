-- =============================================================================
-- profiles: column-level UPDATE, and one path for privileged writes
--
-- `"Users can update own profile"` (20251231031018:652) is
--
--   FOR UPDATE USING (auth.uid() = user_id)
--
-- with no WITH CHECK and no column restriction. Postgres reuses USING as the
-- check when WITH CHECK is absent, so the row a user may write is indeed their
-- own — but *which columns* they may write is not something an RLS policy can
-- express at all. Every column of profiles is therefore writable by its owner:
--
--   is_admin, is_moderator, role, can_broadcast  -> promote self to staff
--   is_banned, banned_at, banned_by, ban_reason  -> unban self
--   total_watch_time_seconds                     -> forge leaderboard position
--
-- one PATCH /rest/v1/profiles?user_id=eq.<self> away. Two further UPDATE
-- policies widen it past the owner's own row:
--
--   "Moderators can ban users"       20260201000003:78
--   "Admins can update any profile"  20260102000002:156
--
-- The first tests only whether the *caller* is staff — not which row, not which
-- column. Policies are OR-ed, so it lets any moderator set is_admin = true on
-- their own profile. That is a moderator -> admin escalation, which is why this
-- file drops the policy rather than tightening it.
--
-- Three parts:
--
--   1. WITH CHECK on the self-service policy, so the row cannot be moved out of
--      its owner's hands. `user_id` is absent from the column grant below too,
--      so this is belt and braces — but a policy should say what it means.
--   2. REVOKE UPDATE on the table, then GRANT UPDATE on exactly the columns the
--      client writes. This is the part that actually restricts columns.
--   3. A SECURITY DEFINER RPC, `set_staff_role`, for the one privileged write
--      the UI still needs, replacing the direct table write in AdminPage.
--
-- What makes (2) workable is that privileges, not policies, carry it:
-- SECURITY DEFINER functions run as their owner, so ban_user, unban_user and
-- set_staff_role keep writing the staff columns after the revoke while the
-- PostgREST path cannot.
--
-- Nothing here revokes SELECT. The browser reads its own mal_access_token and
-- anilist_access_token out of this table and calls MAL/AniList with them
-- directly (SettingsPage:895, useWatchlist:163, useWatchHistory:223), so the
-- read side cannot be narrowed without moving that sync server-side. That is
-- tracked separately; it is not in scope here.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. preferred_title_language
--
-- SettingsPage writes this column (:354) and reads it back (:323), but no
-- migration ever added it, so the write has been failing with 42703 and the
-- setting silently reverts on reload. It has to exist before the grant below
-- can name it — GRANT on a missing column is an error, so this is not merely
-- adjacent work.
--
-- Values and default taken from the client's own type: `'romaji' | 'english' |
-- 'native'`, defaulting to 'romaji' (SettingsPage:309, :323). Follows the
-- guarded-CHECK pattern of 20260413000100, with the constraint lookup narrowed
-- to this table — constraint names are unique per table, not per schema.
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_title_language text DEFAULT 'romaji';

UPDATE public.profiles
SET preferred_title_language = 'romaji'
WHERE preferred_title_language IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_preferred_title_language_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_preferred_title_language_check
      CHECK (preferred_title_language = ANY (ARRAY['romaji'::text, 'english'::text, 'native'::text]));
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 1b. app_settings
--
-- Same class of problem as above, and it has to be fixed here for the same
-- mechanical reason: `app_settings` appears in the GRANT list in part 3, and
-- GRANT on a column that does not exist is a 42703 error that aborts the whole
-- migration. main.sql confirms the column is absent from the deployed table.
--
-- The client is already written for it and already knows it is missing.
-- src/lib/appSettingsPersistence.ts returns early with a local-only write and
-- keeps the remote path below the return, commented "once profiles.app_settings
-- exists again"; it also carries an explicit 42703 guard. Three hooks read
-- `profile?.app_settings` and fall back when it is undefined —
-- useVideoSettings:171, useTheme:856, useContentSafetySettings:110 — and
-- AuthContext declares it on the profile type at :35.
--
-- jsonb with a '{}' default, matching how `social_links` is declared on this
-- table. No CHECK: the shape is PersistedAppSettings in TypeScript
-- (contentSafety / video / theme), it is versioned by the client, and pinning it
-- in a constraint here would mean a migration every time a setting is added.
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS app_settings jsonb DEFAULT '{}'::jsonb;

UPDATE public.profiles
SET app_settings = '{}'::jsonb
WHERE app_settings IS NULL;

-- -----------------------------------------------------------------------------
-- 2. Policies
--
-- After this, `profiles` has exactly one UPDATE policy and it is self-service.
-- Every privileged write goes through a SECURITY DEFINER function: ban_user and
-- unban_user (20260902000002) and set_staff_role (below).
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- The escalation. Caller-is-staff with no row or column predicate, OR-ed with
-- everything else, so a moderator could write is_admin = true on any profile
-- including their own. Banning is what it was for, and ban_user() already does
-- that with an authorization check.
DROP POLICY IF EXISTS "Moderators can ban users" ON public.profiles;

-- Not an escalation — it does require is_admin — but with the column grant in
-- place the only columns it could still reach are the self-service ones, on
-- other people's rows. Nothing in the app writes another user's display name or
-- OAuth tokens, so this grants a capability with no consumer.
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;

-- -----------------------------------------------------------------------------
-- 3. Column-level UPDATE
--
-- REVOKE first, and in this order: revoking UPDATE on the table also revokes the
-- per-column UPDATE privileges, so granting before revoking would leave nothing.
-- Re-running the migration is therefore also safe.
--
-- The list is every column the client actually assigns, and no others. Each one
-- was traced to its write site; a column with no client write site is left out,
-- because the way to re-add one is to add it here deliberately:
--
--   total_watch_time_seconds  written only by update_user_watch_time(), which is
--                             SECURITY DEFINER (20260103000001:194) and so is
--                             unaffected by this revoke
--   country                   read by UserStatsPanel, written by nothing
--   app_version               read by PerformanceInsightsPanel (:74, :143) and
--                             written by nothing in src; if the desktop/mobile
--                             clients start reporting their version, that write
--                             needs a grant added here or a definer function
--   device_id                 no write site at all — every `device_id` match in
--                             src is device_bans.device_id, a different table.
--                             Device identity is plan item 8.2; when it lands it
--                             adds the grant deliberately
--   id, user_id, created_at   identity; changing them is never a user action
--   is_admin, is_moderator,
--   role, can_broadcast       set_staff_role() only
--   is_banned, banned_at,
--   banned_by, ban_reason     ban_user() / unban_user() only
--
-- `showcase_anime_ids` is granted under its real name. useProfileFeatures wrote
-- `showcase_anime`, a column that exists in no migration, so every one of those
-- writes failed with 42703 regardless of privileges; the client now writes the
-- real column. `anilist_refresh_token` is granted because disconnectAniList
-- clears it — it did not before, which left a usable refresh token behind after
-- a disconnect. `preferred_title_language` and `app_settings` are granted because
-- parts 1 and 1b create them in this same file — both were written by the client
-- against a column the deployed table does not have.
-- -----------------------------------------------------------------------------
REVOKE UPDATE ON public.profiles FROM authenticated, anon;

GRANT UPDATE (
  username,
  display_name,
  bio,
  avatar_url,
  banner_url,
  is_public,
  show_watchlist,
  show_history,
  social_links,
  showcase_anime_ids,
  preferred_title_language,
  preferred_manga_language,
  mal_auto_delete,
  mal_user_id,
  mal_access_token,
  mal_refresh_token,
  mal_token_expires_at,
  anilist_user_id,
  anilist_access_token,
  anilist_refresh_token,
  anilist_token_expires_at,
  app_settings,
  last_seen,
  updated_at
) ON public.profiles TO authenticated;

-- Unchanged, and stated rather than assumed: the mal-auth edge function writes
-- the token columns with this role, and the definer functions above run as the
-- table owner rather than as service_role, so neither depends on this line.
GRANT ALL ON public.profiles TO service_role;

-- -----------------------------------------------------------------------------
-- 4. set_staff_role
--
-- AdminPage promotes and demotes staff with a direct table write —
-- `.from('profiles').update(adminRolePatch(...)).eq('user_id', userId)` at :320
-- and the moderator equivalent at :372 — which the revoke above now blocks. The
-- semantics move here unchanged, patch for patch, from adminRolePatch and
-- moderatorRolePatch in src/lib/roles.ts:108-127:
--
--   admin,     enabled   -> is_admin = true,  role = 'admin'
--   admin,     disabled  -> is_admin = false, role = 'user' if it read 'admin',
--                           otherwise left alone
--   moderator, enabled   -> is_moderator = true, role = 'moderator' unless it
--                           reads 'admin', which outranks it
--   moderator, disabled  -> is_moderator = false, role = 'user' if it read
--                           'moderator', otherwise left alone
--
-- Both representations are written together so has_role(), the RLS policies and
-- the client can never disagree about who is staff — the reason roles.ts writes
-- both, kept intact here.
--
-- Authorization is `is_admin = true OR role = 'admin'`, inlined in the style of
-- ban_user rather than delegating to has_role(). has_role(uid, 'admin') reads
-- only is_admin (20260509000001:134), while the panel that calls this admits
-- either representation (deriveIsAdmin, roles.ts:38, and the note above it), so
-- delegating would lock out an admin whose status lives in `role`.
--
-- The requirement is admin, not moderator, which is what AdminPage:790 already
-- gates both toggle buttons on — so this is the same authorization the UI shows,
-- now enforced where it cannot be bypassed.
--
-- There is deliberately no self-demotion guard. An admin can already demote
-- themselves through the direct table write this replaces, and adding the check
-- here would change behaviour under cover of a security fix.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_staff_role(
  target_user_id uuid,
  p_role text,
  p_enabled boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_role IS NULL OR p_role NOT IN ('admin', 'moderator') THEN
    RAISE EXCEPTION 'Unknown role: %', p_role
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'p_enabled must be true or false'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = auth.uid()
      AND (is_admin = true OR role = 'admin')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can change staff roles'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Checked before the write so a mistyped id is an error rather than a silent
  -- no-op, matching how ban_user reports the same case.
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE user_id = target_user_id) THEN
    RAISE EXCEPTION 'Target user not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF p_role = 'admin' THEN
    IF p_enabled THEN
      UPDATE profiles
      SET is_admin = true,
          role     = 'admin'
      WHERE user_id = target_user_id;
    ELSE
      UPDATE profiles
      SET is_admin = false,
          role     = CASE WHEN profiles.role = 'admin' THEN 'user'
                          ELSE COALESCE(profiles.role, 'user') END
      WHERE user_id = target_user_id;
    END IF;
  ELSE
    IF p_enabled THEN
      UPDATE profiles
      SET is_moderator = true,
          role         = CASE WHEN profiles.role = 'admin' THEN 'admin'
                              ELSE 'moderator' END
      WHERE user_id = target_user_id;
    ELSE
      UPDATE profiles
      SET is_moderator = false,
          role         = CASE WHEN profiles.role = 'moderator' THEN 'user'
                              ELSE COALESCE(profiles.role, 'user') END
      WHERE user_id = target_user_id;
    END IF;
  END IF;
END;
$$;

-- PUBLIC first: a function is executable by everyone by default, so granting
-- `authenticated` without revoking PUBLIC would still leave it callable by
-- `anon`. The authorization check inside makes that a failed call rather than an
-- escalation, but an unauthenticated caller has no business reaching it.
REVOKE ALL ON FUNCTION public.set_staff_role(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_staff_role(uuid, text, boolean) TO authenticated;

COMMENT ON FUNCTION public.set_staff_role(uuid, text, boolean) IS
  'Promote or demote staff. Admin only. Writes is_admin/is_moderator and role together so has_role() and the client agree. target_user_id is an auth.users id, matching ban_user.';
