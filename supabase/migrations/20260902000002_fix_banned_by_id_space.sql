-- =============================================================================
-- One id space for "who performed this ban"
--
-- `banned_by` means two different things depending on which table it is on:
--
--   profiles.banned_by     -> auth.users(id)   (main.sql:508)
--   ban_history.banned_by  -> profiles(id)     (main.sql:120)
--
-- and `ban_user()` in 20260202091508 dutifully writes each one in its own space:
-- `auth.uid()` into profiles (line 54), `caller_profile_id` into ban_history
-- (line 60). So neither write violates its own foreign key, and nothing errors —
-- which is the problem. Any query that treats the two columns as the same kind of
-- value returns zero rows instead of failing, and a reader of either column has
-- no way to know which space it is in without going and looking at the FK.
--
-- This collapses it to one space: profiles(id), which is the space that has
-- actual consumers. ban_history is read by BanAuditLogPanel (which joins
-- `profiles.id`), by the `action`/`performed_by` backfill in 20260510000001, and
-- by the ban-expiry check in 20260201000001:289. profiles.banned_by, by contrast,
-- is written and never read anywhere in the app — so it is the side that moves.
--
-- The RPC signatures are unchanged. `target_user_id` is still an auth.users id,
-- because that is what both callers pass: AdminPage:861 sends `user.user_id` and
-- BulkBanToolbar receives `{id: u.user_id}` from AdminPage:701/722.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Translate existing values
--
-- The two id spaces are disjoint sets of random UUIDs, so "matches some
-- profiles.user_id" is a reliable test for a value that is still an auth id, and
-- re-running this is a no-op. (A profiles.id that coincidentally equalled some
-- other row's profiles.user_id would be translated twice; with v4 UUIDs that is
-- not a case worth writing code for.)
-- -----------------------------------------------------------------------------
UPDATE public.profiles AS p
SET banned_by = actor.id
FROM public.profiles AS actor
WHERE p.banned_by IS NOT NULL
  AND p.banned_by = actor.user_id;

-- Anything left that does not resolve to a profile is an auth id whose profile
-- has since been deleted. It cannot satisfy the new foreign key and it does not
-- identify anyone any more, so it becomes NULL rather than blocking the ALTER.
UPDATE public.profiles AS p
SET banned_by = NULL
WHERE p.banned_by IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.profiles AS actor WHERE actor.id = p.banned_by);

-- -----------------------------------------------------------------------------
-- 2. Re-point the foreign key
--
-- Only the referenced table changes, auth.users(id) -> public.profiles(id). The
-- ON DELETE SET NULL is carried over rather than introduced: 20260201000003:64
-- already dropped and re-created this constraint with it, and without it every
-- row a moderator had ever banned would block the deletion of their account.
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_banned_by_fkey;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_banned_by_fkey
  FOREIGN KEY (banned_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- 3. ban_user
--
-- Three changes from 20260202091508:
--   * profiles.banned_by receives caller_profile_id, not auth.uid().
--   * the ban_history insert fills `action` and `performed_by`. Both columns were
--     added later (20260510000001:128, :141) and neither function was updated, so
--     every row written since has left performed_by NULL.
--   * `expires` is timestamptz. Declared as bare `timestamp` it dropped the zone
--     on the way in and had it reapplied as the session's on the way out, so an
--     expiry was only correct when the writer's session was already in UTC.
--
-- search_path is pinned because this is SECURITY DEFINER: without it the function
-- resolves `profiles` and `ban_history` against the caller's search_path, and a
-- caller who can create a schema can shadow either one.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ban_user(
  target_user_id uuid,
  reason text,
  duration_hours integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  expires timestamptz;
  caller_profile_id uuid;
  target_profile_id uuid;
BEGIN
  SELECT id INTO caller_profile_id FROM profiles WHERE user_id = auth.uid();

  IF caller_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = auth.uid()
      AND (role = 'admin' OR role = 'moderator' OR is_moderator = true OR is_admin = true)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only moderators can ban users';
  END IF;

  SELECT id INTO target_profile_id FROM profiles WHERE user_id = target_user_id;

  IF target_profile_id IS NULL THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  IF duration_hours IS NOT NULL THEN
    expires := now() + make_interval(hours => duration_hours);
  END IF;

  UPDATE profiles
  SET is_banned  = true,
      banned_at  = now(),
      banned_by  = caller_profile_id,
      ban_reason = reason
  WHERE user_id = target_user_id;

  INSERT INTO ban_history (user_id, banned_by, performed_by, action, reason, duration_hours, expires_at)
  VALUES (target_profile_id, caller_profile_id, caller_profile_id, 'banned', reason, duration_hours, expires);
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. unban_user
--
-- Only the audit row changes. `action` stayed 'banned' on unban, and the panel
-- reads `row.action === 'unbanned' || (row.unbanned_at && !row.action)` — with
-- `action` NOT NULL DEFAULT 'banned' the second arm can never be true, so every
-- unban has been displaying as a ban (BanAuditLogPanel.tsx:89).
--
-- One row still covers both halves of a ban, rather than a second row being
-- inserted for the unban: 20260201000001:289 finds expired bans with
-- `unbanned_at IS NULL`, and that only works while unbanning mutates the original
-- row. `performed_by` follows `action`, so on an unbanned row it is the unbanner
-- — matching the backfill at 20260510000001:148. The original banner is still in
-- `banned_by`, so nothing is lost.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unban_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_profile_id uuid;
  target_profile_id uuid;
BEGIN
  SELECT id INTO caller_profile_id FROM profiles WHERE user_id = auth.uid();

  IF caller_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = auth.uid()
      AND (role = 'admin' OR role = 'moderator' OR is_moderator = true OR is_admin = true)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only moderators can unban users';
  END IF;

  SELECT id INTO target_profile_id FROM profiles WHERE user_id = target_user_id;

  IF target_profile_id IS NULL THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  UPDATE profiles
  SET is_banned  = false,
      banned_at  = NULL,
      banned_by  = NULL,
      ban_reason = NULL
  WHERE user_id = target_user_id;

  UPDATE ban_history
  SET unbanned_at  = now(),
      unbanned_by  = caller_profile_id,
      performed_by = caller_profile_id,
      action       = 'unbanned'
  WHERE user_id = target_profile_id
    AND unbanned_at IS NULL;
END;
$$;
