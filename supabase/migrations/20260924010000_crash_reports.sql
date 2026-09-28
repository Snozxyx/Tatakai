-- ─────────────────────────────────────────────────────────────────────────────
-- crash_reports — desktop crash metadata (no dumps, no PII)
--
-- The Electron main process auto-forwards crash METADATA ONLY on next launch to
-- POST /api/v3/crash, which inserts here via the service-role client
-- (see desktop/services/crash-service.cjs and tatakaiapi/src/routes/crash.ts).
--
-- RLS:
--   • SELECT — staff only (admin or moderator) for the admin CrashReportPanel.
--   • INSERT — no policy: writes go exclusively through the service-role client,
--     which bypasses RLS. Regular/anon users can never insert or read.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.crash_reports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crash_id          text NOT NULL,
  crashed_at        timestamptz,
  app_version       text,
  platform          text,
  arch              text,
  node_version      text,
  electron_version  text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- One row per native crash id (auto-forward runs on next launch; a duplicate
-- launch must not double-insert the same crash).
CREATE UNIQUE INDEX IF NOT EXISTS crash_reports_crash_id_key
  ON public.crash_reports (crash_id);

CREATE INDEX IF NOT EXISTS crash_reports_created_at_idx
  ON public.crash_reports (created_at DESC);

ALTER TABLE public.crash_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read crash reports" ON public.crash_reports;
CREATE POLICY "Staff can read crash reports"
  ON public.crash_reports
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'moderator'::public.app_role)
  );
