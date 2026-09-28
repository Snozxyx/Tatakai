-- =============================================================================
-- Opportunistic watch-room reaper
--
-- Rooms have a 24h expires_at (cleanup_expired_watch_rooms), but a room whose
-- participants all walked away stays "active" for the rest of that day. This
-- RPC closes any active room idle longer than p_max_idle_minutes, where idle =
-- now() minus the most recent of: the newest participant heartbeat
-- (watch_room_participants.last_seen_at, refreshed ~25s), the room's updated_at,
-- and its created_at (so a brand-new empty room gets its grace period).
--
-- Idempotent and cheap; called opportunistically from the client whenever the
-- room lists load, so no scheduler is needed. "Closed" = is_active=false → drops
-- out of the active lists; the row and its 24h deletion path are untouched.
-- Safe for authenticated: it only ever flips a stale room off.
--
-- WRITTEN, NOT APPLIED — repo standing rule.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.close_inactive_watch_rooms(
  p_max_idle_minutes integer DEFAULT 5
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer;
  v_cutoff timestamptz := now() - make_interval(mins => GREATEST(p_max_idle_minutes, 1));
BEGIN
  UPDATE public.watch_rooms r
    SET is_active = false
    WHERE r.is_active = true
      AND GREATEST(
            r.updated_at,
            r.created_at,
            COALESCE((SELECT max(p.last_seen_at)
                        FROM public.watch_room_participants p
                        WHERE p.room_id = r.id),
                     r.created_at)
          ) < v_cutoff;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.close_inactive_watch_rooms(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_inactive_watch_rooms(integer) TO authenticated, anon;

COMMENT ON FUNCTION public.close_inactive_watch_rooms(integer) IS
  'Deactivates active watch rooms idle > N minutes (default 5). Idempotent; called opportunistically from room-list loads.';
