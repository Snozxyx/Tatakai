-- =============================================================================
-- Staff comment pinning
--
-- Staff can pin a comment so it sorts to the top of its thread and shows a
-- "Pinned" badge. We add:
--   * comments.is_pinned / pinned_at / pinned_by,
--   * set_comment_pinned(comment_id, pinned) — SECURITY DEFINER, is_staff-gated,
--     stamps pinned_at/pinned_by and funnels through the staff audit trail.
--
-- Pin state is a plain column read by the client; sorting/badging is app-layer.
-- Requires public.is_staff() and log_staff_action() from 20260925000000.
--
-- WRITTEN, NOT APPLIED — repo standing rule.
-- =============================================================================

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_by uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'comments_pinned_by_fkey'
      AND table_name = 'comments'
  ) THEN
    ALTER TABLE public.comments
      ADD CONSTRAINT comments_pinned_by_fkey
      FOREIGN KEY (pinned_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Pinned-first ordering within a thread is the common read; a partial index
-- keeps it cheap without bloating the far more numerous unpinned rows.
CREATE INDEX IF NOT EXISTS idx_comments_pinned
  ON public.comments (entity_type, entity_id)
  WHERE is_pinned = true;

-- Pin/unpin a comment. SECURITY DEFINER so it writes past the comments RLS,
-- but re-checks staff itself first; actor is always auth.uid().
CREATE OR REPLACE FUNCTION public.set_comment_pinned(
  p_comment_id uuid,
  p_pinned boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT public.is_staff(v_actor) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.comments
    SET is_pinned = p_pinned,
        pinned_at = CASE WHEN p_pinned THEN now() ELSE NULL END,
        pinned_by = CASE WHEN p_pinned THEN v_actor ELSE NULL END
    WHERE id = p_comment_id;

  PERFORM public.log_staff_action(
    CASE WHEN p_pinned THEN 'pin_comment' ELSE 'unpin_comment' END,
    'comment', p_comment_id::text, NULL, NULL, NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.set_comment_pinned(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_comment_pinned(uuid, boolean) TO authenticated;

COMMENT ON COLUMN public.comments.is_pinned IS
  'Staff-pinned to the top of its thread. Set only via set_comment_pinned().';
