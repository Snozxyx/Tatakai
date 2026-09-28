-- =============================================================================
-- notifications: table definition, RLS, and realtime
--
-- `public.notifications` exists on the deployed database — it is in the pg_dump
-- snapshot at supabase/migrations/main.sql — but no migration in this directory
-- creates it, grants it, or gives it a policy. That has two consequences:
--
--   1. A fresh `supabase db reset` produces a database where the notification
--      bell is a 42P01 (undefined_table), not an empty list.
--   2. Nothing in version control says what RLS on it is, so the fact that
--      `useNotifications` filters by `user_id` client-side is the only thing
--      keeping one user's notifications away from another.
--
-- It is also absent from the `supabase_realtime` publication, which is what the
-- `postgres_changes` subscription in src/hooks/community/useNotifications.ts
-- depends on — without it that subscription connects and then never fires, so
-- the bell only updates on refetch.
--
-- Everything here is written to be safe against the live database as well as a
-- fresh one: IF NOT EXISTS on the table, DROP POLICY IF EXISTS before each
-- policy, and a publication guard.
-- =============================================================================

-- Shape copied from main.sql, so applying this to the deployed database is a
-- no-op rather than a conflict.
CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  body        TEXT        NOT NULL,
  data        JSONB,
  read        BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The only query the app makes: own notifications, newest first.
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);

-- Unread count is read on every page, so keep it off the main index.
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON public.notifications (user_id)
  WHERE read = false;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- Policies
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
CREATE POLICY "Users can read own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Marking read is the only field a recipient changes. RLS cannot restrict which
-- columns an UPDATE touches, so the WITH CHECK holds ownership and the trigger
-- below is what stops a recipient rewriting the title or body of their own
-- notification — which would otherwise let them forge a moderation notice and
-- screenshot it.
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- No self-insert. Notifications are authored by the broadcast panel in
-- AdminPage, by the send-notification edge function (service role, which bypasses
-- RLS), and from Phase 1 onward by SECURITY DEFINER triggers on follows and
-- comments. A user inserting their own is never legitimate.
DROP POLICY IF EXISTS "Staff can create notifications" ON public.notifications;
CREATE POLICY "Staff can create notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'moderator'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

-- -----------------------------------------------------------------------------
-- Recipients may flip `read`, and nothing else
--
-- The UPDATE policy above can only say *which rows* a user may touch, never which
-- columns, so on its own it lets a recipient rewrite the title and body of a
-- notification addressed to them. This is the part that actually restricts the
-- write. A column-level GRANT would also work, but a later `GRANT ALL` would
-- silently undo it, and the error it raises does not say what went wrong.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notifications_restrict_recipient_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  -- Fast path, and the only one a client should ever take. Checked before the
  -- role lookup because `markAllAsRead` updates every unread row in one
  -- statement, and this way that costs no extra queries.
  IF NEW.id         IS NOT DISTINCT FROM OLD.id
     AND NEW.user_id    IS NOT DISTINCT FROM OLD.user_id
     AND NEW.title      IS NOT DISTINCT FROM OLD.title
     AND NEW.body       IS NOT DISTINCT FROM OLD.body
     AND NEW.data       IS NOT DISTINCT FROM OLD.data
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
  THEN
    RETURN NEW;
  END IF;

  -- Something other than `read` changed. Triggers run for every role, including
  -- the service role, so the server-side writers have to be let through
  -- explicitly: the send-notification edge function, migrations, and the
  -- SECURITY DEFINER triggers Phase 1 adds. None of them carry an end-user JWT.
  -- Staff are exempt too, since the broadcast panel already lets them INSERT a
  -- notification with any title and body they like — denying UPDATE would not
  -- take away a capability they do not have.
  IF auth.uid() IS NULL
     OR current_setting('role', true) = 'service_role'
     OR public.has_role(auth.uid(), 'moderator')
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Only the read flag of a notification may be changed'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_restrict_recipient_update ON public.notifications;
CREATE TRIGGER trg_notifications_restrict_recipient_update
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notifications_restrict_recipient_update();

-- -----------------------------------------------------------------------------
-- Realtime
--
-- src/hooks/community/useNotifications.ts opens a `postgres_changes` channel for
-- INSERT and UPDATE filtered on `user_id=eq.<self>`. That requires the table to
-- be in the `supabase_realtime` publication; it is not, which is why the bell
-- currently only updates when something else refetches it.
--
-- Replica identity is left at the default (primary key). Realtime evaluates the
-- filter and the RLS policy against the *new* row for INSERT and UPDATE, and the
-- new row carries `user_id`, so the default is sufficient for both events this
-- hook listens to. A DELETE subscription would need `REPLICA IDENTITY FULL` —
-- the default sends only the primary key as `old_record`, so a `user_id` filter
-- could never match — but nothing subscribes to DELETE, and FULL writes every
-- column of every row to the WAL.
--
-- Guarded rather than bare: `ALTER PUBLICATION ... ADD TABLE` errors if the table
-- is already a member, and the deployed database may already have it. Pattern
-- copied from 20260409000001_watch2together_collaboration_expansion.sql.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END;
$$;
