-- =============================================================================
-- Per-content moderation flags: pause comments, disable repost / requote
--
-- Applies to any content the toolbar can act on (forum_post, tier_list, anime,
-- playlist, comment) via a (content_type, content_id) key, rather than adding
-- columns to each table — the live comments table is still anime-only and the
-- polymorphic redesign is unapplied, so a single side table is the schema-safe
-- store the app and Phase 3 toolbar read from.
--
-- Enforcement is app-layer (the client consults these flags before allowing a
-- comment / repost / requote); the table is the source of truth. Writes go
-- through set_content_flags(): staff always, or the forum_post's own author.
-- Staff writes are logged. Requires public.is_staff()/log_staff_action() from
-- 20260925000000.
--
-- WRITTEN, NOT APPLIED — repo standing rule.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.content_moderation_flags (
  content_type   text NOT NULL,
  content_id     text NOT NULL,
  comments_paused boolean NOT NULL DEFAULT false,
  allow_repost   boolean NOT NULL DEFAULT true,
  allow_requote  boolean NOT NULL DEFAULT true,
  updated_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_moderation_flags_pkey PRIMARY KEY (content_type, content_id),
  CONSTRAINT content_moderation_flags_type_chk
    CHECK (content_type IN ('forum_post','tier_list','anime','playlist','comment'))
);

ALTER TABLE public.content_moderation_flags ENABLE ROW LEVEL SECURITY;

-- Flags are not secret — anyone may read them so the UI can hide repost/comment
-- affordances. Writes are RPC-only (no INSERT/UPDATE policy).
DROP POLICY IF EXISTS "Anyone can read content flags" ON public.content_moderation_flags;
CREATE POLICY "Anyone can read content flags" ON public.content_moderation_flags
  FOR SELECT USING (true);

GRANT SELECT ON public.content_moderation_flags TO anon, authenticated;
GRANT ALL ON public.content_moderation_flags TO service_role;

-- Staff, or a forum post's own author, sets the flags. NULL args leave the
-- existing value unchanged (COALESCE against the current row).
CREATE OR REPLACE FUNCTION public.set_content_flags(
  p_content_type text,
  p_content_id text,
  p_comments_paused boolean DEFAULT NULL,
  p_allow_repost boolean DEFAULT NULL,
  p_allow_requote boolean DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_staff    boolean := public.is_staff(auth.uid());
  v_is_owner boolean := false;
BEGIN
  IF p_content_type NOT IN ('forum_post','tier_list','anime','playlist','comment') THEN
    RAISE EXCEPTION 'unknown content_type %', p_content_type;
  END IF;

  IF NOT v_staff AND p_content_type = 'forum_post' THEN
    SELECT (user_id = auth.uid()) INTO v_is_owner
      FROM public.forum_posts WHERE id = p_content_id::uuid;
  END IF;

  IF NOT v_staff AND NOT COALESCE(v_is_owner, false) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  INSERT INTO public.content_moderation_flags
    (content_type, content_id, comments_paused, allow_repost, allow_requote, updated_by, updated_at)
  VALUES (
    p_content_type, p_content_id,
    COALESCE(p_comments_paused, false),
    COALESCE(p_allow_repost, true),
    COALESCE(p_allow_requote, true),
    auth.uid(), now()
  )
  ON CONFLICT (content_type, content_id) DO UPDATE SET
    comments_paused = COALESCE(p_comments_paused, content_moderation_flags.comments_paused),
    allow_repost    = COALESCE(p_allow_repost,    content_moderation_flags.allow_repost),
    allow_requote   = COALESCE(p_allow_requote,   content_moderation_flags.allow_requote),
    updated_by      = auth.uid(),
    updated_at      = now();

  IF v_staff THEN
    PERFORM public.log_staff_action('set_content_flags', p_content_type, p_content_id,
      jsonb_build_object('comments_paused', p_comments_paused,
                         'allow_repost', p_allow_repost,
                         'allow_requote', p_allow_requote),
      NULL, NULL);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_content_flags(text,text,boolean,boolean,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_content_flags(text,text,boolean,boolean,boolean) TO authenticated;

COMMENT ON TABLE public.content_moderation_flags IS
  'Per-content moderation switches (comments_paused / allow_repost / allow_requote). Public read; written via set_content_flags() by staff or the forum_post author.';
