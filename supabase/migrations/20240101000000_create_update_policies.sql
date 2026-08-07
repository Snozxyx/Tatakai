-- Electron app update policies table
-- Stores admin-controlled update directives per release channel.
-- Public (anon) can read; writes require service role.

CREATE TABLE IF NOT EXISTS public.update_policies (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  channel               TEXT         NOT NULL
                                       CHECK (channel IN ('stable', 'beta', 'experimental')),
  type                  TEXT         NOT NULL
                                       CHECK (type IN ('mandatory', 'recommended', 'experimental', 'rollback')),
  target_version        TEXT         NOT NULL,
  rollback_from_version TEXT,
  active                BOOLEAN      NOT NULL DEFAULT true,
  notes                 TEXT,
  published_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_by            UUID
);

-- Enforce at most one active policy per channel at a time
CREATE UNIQUE INDEX IF NOT EXISTS update_policies_one_active_per_channel
  ON public.update_policies (channel)
  WHERE active = true;

-- Index to speed up the most common query: channel + active
CREATE INDEX IF NOT EXISTS idx_update_policies_channel_active
  ON public.update_policies (channel, active);

-- -----------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------
ALTER TABLE public.update_policies ENABLE ROW LEVEL SECURITY;

-- Public read: the Electron app uses the anon key to fetch policies
DROP POLICY IF EXISTS "update_policies_select_public" ON public.update_policies;
CREATE POLICY "update_policies_select_public"
  ON public.update_policies
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Writes are restricted to the service role (admin dashboard / server-side)
DROP POLICY IF EXISTS "update_policies_insert_service_role" ON public.update_policies;
CREATE POLICY "update_policies_insert_service_role"
  ON public.update_policies
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'role') = 'service_role'
  );

DROP POLICY IF EXISTS "update_policies_update_service_role" ON public.update_policies;
CREATE POLICY "update_policies_update_service_role"
  ON public.update_policies
  FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() ->> 'role') = 'service_role'
  )
  WITH CHECK (
    (auth.jwt() ->> 'role') = 'service_role'
  );

DROP POLICY IF EXISTS "update_policies_delete_service_role" ON public.update_policies;
CREATE POLICY "update_policies_delete_service_role"
  ON public.update_policies
  FOR DELETE
  TO authenticated
  USING (
    (auth.jwt() ->> 'role') = 'service_role'
  );
