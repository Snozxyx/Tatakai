-- =============================================================================
-- Bulk-delete a target user's content from the admin user page
--
-- Lets staff (admin OR moderator) wipe all of one user's comments, forum posts,
-- playlists, tier lists — or everything at once — in a single call. Gated by
-- public.is_staff() and funnelled through the staff audit trail.
--
--   * Comments / forum posts are SOFT-deleted (tombstone: is_deleted/deleted_at,
--     20260923100000) so thread structure survives, matching the per-item staff
--     delete. Also stamps deleted_by/deleted_by_role (20260924000100) so the
--     tombstone reads "[Deleted by Admin/Moderator]", not "[DELETED By User]".
--     Falls back to a basic tombstone, then a hard delete, if those columns are absent.
--   * Playlists / tier lists have no tombstone, so they are HARD-deleted after a
--     defensive sweep of their known child rows. Each child statement is wrapped
--     so a missing/renamed table under live-DB drift skips instead of aborting
--     the batch. Forum reposts pointing at them (FK has no cascade) are detached
--     first.
--
-- All table references are dynamic EXECUTE so an unapplied prerequisite (the
-- comment/post tombstone columns) degrades gracefully rather than failing to
-- create the function.
--
-- Requires public.is_staff() + log_staff_action() (20260925000000).
--
-- WRITTEN, NOT APPLIED — repo standing rule.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_delete_user_content(
  p_target_user_id uuid,
  p_scope text DEFAULT 'all'
) RETURNS TABLE (comments integer, posts integer, playlists integer, tierlists integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_comments  integer := 0;
  v_posts     integer := 0;
  v_playlists integer := 0;
  v_tierlists integer := 0;
  v_tbl text;
  v_actor uuid := auth.uid();
  v_role text;
  v_is_admin boolean;
  v_prole text;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_scope NOT IN ('comments','posts','playlists','tierlists','all') THEN
    RAISE EXCEPTION 'invalid scope: %', p_scope;
  END IF;

  -- Attribution for the soft-delete tombstone (deleted_by_role drives the
  -- "[Deleted by Admin/Moderator]" label). The gate above guarantees staff, so
  -- the actor is admin or moderator — never 'user'.
  SELECT is_admin, role INTO v_is_admin, v_prole FROM public.profiles WHERE user_id = v_actor;
  v_role := CASE WHEN COALESCE(v_is_admin, false) OR v_prole = 'admin' THEN 'admin' ELSE 'moderator' END;

  -- Comments: soft-delete tombstone (with attribution); hard-delete fallback under drift.
  IF p_scope IN ('comments','all') THEN
    BEGIN
      EXECUTE 'UPDATE public.comments SET is_deleted = true, deleted_at = now(),
                 deleted_by = $2, deleted_by_role = $3
               WHERE user_id = $1 AND COALESCE(is_deleted, false) = false'
        USING p_target_user_id, v_actor, v_role;
      GET DIAGNOSTICS v_comments = ROW_COUNT;
    EXCEPTION
      WHEN undefined_column THEN
        BEGIN
          EXECUTE 'UPDATE public.comments SET is_deleted = true, deleted_at = now()
                   WHERE user_id = $1 AND COALESCE(is_deleted, false) = false'
            USING p_target_user_id;
          GET DIAGNOSTICS v_comments = ROW_COUNT;
        EXCEPTION
          WHEN undefined_column THEN
            EXECUTE 'DELETE FROM public.comments WHERE user_id = $1' USING p_target_user_id;
            GET DIAGNOSTICS v_comments = ROW_COUNT;
          WHEN undefined_table THEN v_comments := 0;
        END;
      WHEN undefined_table THEN v_comments := 0;
    END;
  END IF;

  -- Forum posts: soft-delete tombstone (with attribution); hard-delete fallback under drift.
  IF p_scope IN ('posts','all') THEN
    BEGIN
      EXECUTE 'UPDATE public.forum_posts SET is_deleted = true, deleted_at = now(),
                 deleted_by = $2, deleted_by_role = $3
               WHERE user_id = $1 AND COALESCE(is_deleted, false) = false'
        USING p_target_user_id, v_actor, v_role;
      GET DIAGNOSTICS v_posts = ROW_COUNT;
    EXCEPTION
      WHEN undefined_column THEN
        BEGIN
          EXECUTE 'UPDATE public.forum_posts SET is_deleted = true, deleted_at = now()
                   WHERE user_id = $1 AND COALESCE(is_deleted, false) = false'
            USING p_target_user_id;
          GET DIAGNOSTICS v_posts = ROW_COUNT;
        EXCEPTION
          WHEN undefined_column THEN
            EXECUTE 'DELETE FROM public.forum_posts WHERE user_id = $1' USING p_target_user_id;
            GET DIAGNOSTICS v_posts = ROW_COUNT;
          WHEN undefined_table THEN v_posts := 0;
        END;
      WHEN undefined_table THEN v_posts := 0;
    END;
  END IF;

  -- Playlists: hard delete + defensive child cleanup.
  IF p_scope IN ('playlists','all') THEN
    BEGIN
      EXECUTE 'UPDATE public.forum_posts SET playlist_id = NULL WHERE playlist_id IN
               (SELECT id FROM public.playlists WHERE user_id = $1)'
        USING p_target_user_id;
    EXCEPTION WHEN undefined_column OR undefined_table THEN NULL;
    END;
    FOREACH v_tbl IN ARRAY ARRAY[
      'playlist_items','playlist_comments','playlist_collaborators',
      'playlist_likes','saved_playlists'
    ] LOOP
      BEGIN
        EXECUTE format(
          'DELETE FROM public.%I WHERE playlist_id IN
             (SELECT id FROM public.playlists WHERE user_id = $1)', v_tbl)
          USING p_target_user_id;
      EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
      END;
    END LOOP;
    BEGIN
      EXECUTE 'DELETE FROM public.playlists WHERE user_id = $1' USING p_target_user_id;
      GET DIAGNOSTICS v_playlists = ROW_COUNT;
    EXCEPTION WHEN undefined_table THEN v_playlists := 0;
    END;
  END IF;

  -- Tier lists: hard delete + defensive child cleanup.
  IF p_scope IN ('tierlists','all') THEN
    BEGIN
      EXECUTE 'UPDATE public.forum_posts SET tierlist_id = NULL WHERE tierlist_id IN
               (SELECT id FROM public.tier_lists WHERE user_id = $1)'
        USING p_target_user_id;
    EXCEPTION WHEN undefined_column OR undefined_table THEN NULL;
    END;
    FOREACH v_tbl IN ARRAY ARRAY[
      'tier_list_collaborators','tier_list_comment_likes',
      'tier_list_comments','tier_list_likes'
    ] LOOP
      BEGIN
        EXECUTE format(
          'DELETE FROM public.%I WHERE tier_list_id IN
             (SELECT id FROM public.tier_lists WHERE user_id = $1)', v_tbl)
          USING p_target_user_id;
      EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
      END;
    END LOOP;
    BEGIN
      EXECUTE 'DELETE FROM public.tier_lists WHERE user_id = $1' USING p_target_user_id;
      GET DIAGNOSTICS v_tierlists = ROW_COUNT;
    EXCEPTION WHEN undefined_table THEN v_tierlists := 0;
    END;
  END IF;

  PERFORM public.log_staff_action('bulk_delete_user_content','profile',
    p_target_user_id::text,
    jsonb_build_object('scope',p_scope,'comments',v_comments,'posts',v_posts,
      'playlists',v_playlists,'tierlists',v_tierlists),
    p_target_user_id, NULL);

  comments  := v_comments;
  posts     := v_posts;
  playlists := v_playlists;
  tierlists := v_tierlists;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user_content(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_content(uuid,text) TO authenticated;
