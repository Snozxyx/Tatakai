-- =============================================================================
-- Fresh-site reset: wipe community + social content.
--
-- One-time destructive cleanup that returns the community/social surfaces to a
-- brand-new state. Scope confirmed as "Community + social" — NOT personal
-- libraries, NOT user accounts, NOT analytics.
--
-- WIPED (every row):
--   * public.comments      — the ONE polymorphic comment table (entity_type
--                            anime | manga | playlist | tier_list | forum_post,
--                            incl. episode + manga-chapter comments); cascades:
--                            comment_likes, comment_polls, comment_poll_votes
--   * public.post_hashtags — hashtags (no separate registry; also cascades off
--                            forum_posts below)
--   * public.forum_posts   — community posts; cascades: post_reposts,
--                            post_bookmarks, post_hashtags, post_polls,
--                            post_poll_votes, forum_votes
--   * public.tier_lists    — cascades: tier_list_likes, tier_list_collaborators
--   * public.playlists     — cascades: playlist_items, playlist_collaborators,
--                            playlist_likes, saved_playlists
--   * public.watch_rooms   — Watch2Together rooms; cascades:
--                            watch_room_participants, watch_room_messages,
--                            watch_room_invites, watch_room_queue,
--                            watch_room_polls, watch_room_poll_votes
--   * public.watch_sessions — per-view watch-time rows (requested explicitly
--                            alongside the room wipe; standalone table)
--   * public.communities   — user-made communities; cascades: community_members
--   * public.community_events
--   * public.reactions     — social reactions
--   * public.user_follows  — the follow graph
--
-- KEPT (intentionally NOT touched):
--   * identity — profiles, auth.users, user_roles
--   * personal libraries — watch_history, watchlist, manga_readlist, ratings,
--     character_favorites, tracked_shows, notifications, user_badges,
--     user_achievements, gif_bookmarks
--   * analytics — page_visits, daily_analytics, mobile_analytics, anime_views*
--     (retention was dropped from scope on request)
--   * moderation / ops / config — bans, audit + security logs, reports,
--     moderation_queue, content_moderation_flags, user_sessions, popups,
--     changelog, app_releases, etc.
--
-- SCOPE — "all comments" is literal: this clears anime/manga, episode and
-- manga-chapter comments too (all in the single polymorphic public.comments).
-- To keep media comments and wipe only community/social ones, use the scoped
-- DELETE in 1b instead of 1a.
--
-- DELETE (not TRUNCATE) is deliberate: ON DELETE CASCADE fires and the
-- count-sync triggers (e.g. forum_posts.comments_count) stay consistent.
--
-- DESTRUCTIVE + IRREVERSIBLE. WRITTEN, NOT APPLIED — repo standing rule.
-- Validate: npm run check:migrations
-- =============================================================================

-- 1) Comments (polymorphic). comment_likes / comment_polls / comment_poll_votes
--    cascade off public.comments.
-- 1a) All comments (see SCOPE note above):
DELETE FROM public.comments;
-- 1b) Scoped alternative — community/social only; keeps anime/manga comments:
--     DELETE FROM public.comments
--      WHERE entity_type IN ('forum_post', 'playlist', 'tier_list');

-- 2) Hashtags. Explicit per request; also cascades off forum_posts in step 3.
DELETE FROM public.post_hashtags;

-- 3) Posts. Cascades: post_reposts, post_bookmarks, post_hashtags, post_polls,
--    post_poll_votes, forum_votes.
DELETE FROM public.forum_posts;

-- 4) Tier lists. Cascades: tier_list_likes, tier_list_collaborators.
DELETE FROM public.tier_lists;

-- 5) Playlists. Cascades: playlist_items, playlist_collaborators, playlist_likes,
--    saved_playlists.
DELETE FROM public.playlists;

-- 6) Watch2Together rooms. Cascades: watch_room_participants,
--    watch_room_messages, watch_room_invites, watch_room_queue,
--    watch_room_polls, watch_room_poll_votes.
DELETE FROM public.watch_rooms;

-- 7) Watch sessions (per-view watch-time rows). Standalone table, no cascade
--    parent — deleted directly.
DELETE FROM public.watch_sessions;

-- 8) Communities. Cascades: community_members. (forum_posts.community_id is
--    ON DELETE SET NULL, but those posts are already gone in step 3.)
DELETE FROM public.communities;

-- 9) Community events.
DELETE FROM public.community_events;

-- 10) Social reactions + follow graph.
DELETE FROM public.reactions;
DELETE FROM public.user_follows;
