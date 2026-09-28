-- =============================================================================
-- admin_logs: the staff audit trail the client already writes to
--
-- `public.admin_logs` does not exist on the deployed database. main.sql — the
-- dashboard export of the live schema — has 107 tables and this is not one of
-- them. Two things are broken by that, both silently:
--
--   1. Eleven client call sites insert into it and none of them check the
--      result: approve/reject/pin/unpin forum posts and comments (useForum:555,
--      :589, :656, :695), moderation decisions (useModerationQueue:163),
--      suggestion decisions (useSuggestions:204), comment moderation
--      (useComments:327), watch-room actions (useWatchRoom:940), the shared
--      logAdminAction helper (useAdminLogs:127) and the opt-in frontend error
--      sink (errorLogger:39). PostgREST answers 404 for an unknown table, the
--      returned `error` is discarded, and the action itself succeeds — so every
--      admin action appears to work while the audit trail stays empty. The
--      Admin dashboard's log panel reads an empty table and reports "No logs
--      found" (useAdminLogs:50), which looks like "nothing happened yet".
--
--   2. 20260128000002_moderator_suggestions_rls.sql creates two policies ON
--      public.admin_logs (:40, :53). `DROP POLICY IF EXISTS` tolerates a missing
--      *policy*, not a missing *table*: against the live database that statement
--      raises 42P01 and aborts the whole migration, taking the moderator
--      suggestion policies in the same file down with it. Creating the table
--      makes that file applicable again.
--
-- The table was only ever declared in supabase/migrations/DATABASE_SETUP.sql,
-- which is not timestamped, so the CLI never applied it and it is not part of
-- the migration history. The column list below is that file's, unchanged, and it
-- matches the `AdminLog` interface the client reads (useAdminLogs:5-19) field for
-- field.
--
-- One deliberate deviation: DATABASE_SETUP declared user_id
-- `ON DELETE CASCADE`. An audit trail that erases the record of what a user did
-- when that user is deleted is not an audit trail, so this is SET NULL. user_id
-- is nullable either way, and the read path already tolerates a null actor —
-- `logs.map(l => l.user_id).filter(Boolean)` at useAdminLogs:54 and the
-- `|| null` profile fallback at :64.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.admin_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb,
  ip_address text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT admin_logs_pkey PRIMARY KEY (id),
  CONSTRAINT admin_logs_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE SET NULL
);

-- The three access patterns the log panel has: newest-first paging, and the two
-- filters it exposes (useAdminLogs:34-35).
CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON public.admin_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_action ON public.admin_logs (action);
CREATE INDEX IF NOT EXISTS idx_admin_logs_entity_type ON public.admin_logs (entity_type);
CREATE INDEX IF NOT EXISTS idx_admin_logs_user_id ON public.admin_logs (user_id);

-- -----------------------------------------------------------------------------
-- Access
--
-- Staff read and write; nobody updates; admins alone delete.
--
-- The staff predicate admits both representations — is_admin/is_moderator and
-- role — for the same reason set_staff_role does (20260902000003:232): the two
-- are written together now, but rows predating that are only guaranteed to carry
-- one, and a log panel that silently shows nothing to a real admin is worse than
-- a slightly wider predicate. `= true` rather than a bare boolean because both
-- columns are nullable and NULL is not false.
--
-- 20260128000002 declares two policies with the same intent keyed on
-- `user_roles` instead. Both are dropped here and replaced, so which of the two
-- files applies last does not change the outcome. `user_roles` is a separate
-- staff table from `profiles`; keying the audit log off the same source the
-- Admin UI itself checks is what keeps "can see the button" and "can read the
-- log" from diverging.
--
-- There is no UPDATE policy and no UPDATE grant: an audit row is a statement
-- about something that already happened, so it is append-only by construction.
--
-- errorLogger:39 inserts `action = 'client_error'` as whatever user is logged
-- in, behind VITE_LOG_FRONTEND_ERRORS_TO_DB. Under these policies that insert
-- is a no-op for non-staff, which is the intended outcome — this table is a
-- staff audit trail, not a general client error sink.
-- -----------------------------------------------------------------------------
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Moderators can view admin logs" ON public.admin_logs;
CREATE POLICY "Moderators can view admin logs"
  ON public.admin_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
        AND (profiles.is_admin = true
             OR profiles.is_moderator = true
             OR profiles.role = ANY (ARRAY['admin'::text, 'moderator'::text]))
    )
  );

DROP POLICY IF EXISTS "Moderators can insert admin logs" ON public.admin_logs;
CREATE POLICY "Moderators can insert admin logs"
  ON public.admin_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
        AND (profiles.is_admin = true
             OR profiles.is_moderator = true
             OR profiles.role = ANY (ARRAY['admin'::text, 'moderator'::text]))
    )
  );

-- Admin, not moderator. useDeleteAdminLogs (useAdminLogs:141) accepts an empty
-- filter set, in which case it issues an unqualified DELETE and clears the whole
-- table; its only client-side guard is that someone is logged in. Restricting the
-- policy to admins is what actually bounds that.
DROP POLICY IF EXISTS "Admins can delete admin logs" ON public.admin_logs;
CREATE POLICY "Admins can delete admin logs"
  ON public.admin_logs FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
        AND (profiles.is_admin = true OR profiles.role = 'admin')
    )
  );

GRANT SELECT, INSERT, DELETE ON public.admin_logs TO authenticated;
GRANT ALL ON public.admin_logs TO service_role;

COMMENT ON TABLE public.admin_logs IS
  'Append-only staff audit trail. Staff read and insert, admins delete, nobody updates. user_id is an auth.users id and survives that user''s deletion as NULL.';
