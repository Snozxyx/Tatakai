-- ============================================================
-- Migration: Community member role management
-- Date: 2026-09-22
-- Purpose:
--   Let a community's creator assign member roles ("issue rank": member / mod /
--   owner). The base table (20260922160000) only allowed self insert/delete;
--   this adds an owner-scoped UPDATE so the creator can promote/demote members.
-- ============================================================

DROP POLICY IF EXISTS "Owner manages member roles" ON public.community_members;
CREATE POLICY "Owner manages member roles"
  ON public.community_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.communities c
      WHERE c.id = community_id AND c.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.communities c
      WHERE c.id = community_id AND c.created_by = auth.uid()
    )
  );
