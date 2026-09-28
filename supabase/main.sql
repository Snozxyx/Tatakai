-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.admin_home_config (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  section text NOT NULL,
  anime_ids ARRAY NOT NULL DEFAULT '{}'::text[],
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.admin_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb,
  ip_address text,
  created_at timestamp with time zone DEFAULT now(),
  target_user_id uuid,
  CONSTRAINT admin_logs_pkey PRIMARY KEY (id),
  CONSTRAINT admin_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT admin_logs_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.admin_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  message_type text NOT NULL CHECK (message_type = ANY (ARRAY['broadcast'::text, 'individual'::text])),
  recipient_id uuid,
  sender_id uuid NOT NULL,
  is_read boolean DEFAULT false,
  priority text DEFAULT 'normal'::text CHECK (priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text])),
  created_at timestamp with time zone DEFAULT now(),
  read_at timestamp with time zone,
  CONSTRAINT admin_messages_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES auth.users(id),
  CONSTRAINT admin_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id)
);
CREATE TABLE public.admin_popups (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text,
  popup_type text NOT NULL DEFAULT 'banner'::text,
  background_color text DEFAULT '#1B1919'::text,
  text_color text DEFAULT '#FFFFFF'::text,
  accent_color text DEFAULT '#FF1493'::text,
  image_url text,
  action_text text,
  action_url text,
  dismiss_text text DEFAULT 'Dismiss'::text,
  target_pages ARRAY DEFAULT '{}'::text[],
  target_user_type text DEFAULT 'all'::text,
  show_on_mobile boolean DEFAULT true,
  show_on_desktop boolean DEFAULT true,
  start_date timestamp with time zone,
  end_date timestamp with time zone,
  frequency text DEFAULT 'once'::text,
  priority integer DEFAULT 1,
  is_active boolean DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT admin_popups_pkey PRIMARY KEY (id),
  CONSTRAINT admin_popups_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.admin_provider_config (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  provider_id text NOT NULL,
  name text NOT NULL,
  is_active boolean DEFAULT true,
  priority integer DEFAULT 1,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.airing_reminders_sent (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  anilist_id integer NOT NULL,
  episode integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT airing_reminders_sent_pkey PRIMARY KEY (id),
  CONSTRAINT airing_reminders_sent_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.analytics_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  event_type text NOT NULL,
  page_path text,
  metadata jsonb,
  ip_hash text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT analytics_events_pkey PRIMARY KEY (id),
  CONSTRAINT analytics_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.anime_metadata (
  anilist_id integer NOT NULL,
  title_romaji text,
  title_english text,
  title_native text,
  description text,
  cover_image text,
  banner_image text,
  genres ARRAY DEFAULT '{}'::text[],
  tags ARRAY DEFAULT '{}'::text[],
  studios ARRAY DEFAULT '{}'::text[],
  episodes integer,
  status text,
  season text,
  season_year integer,
  average_score integer,
  popularity integer,
  trending integer,
  format text,
  is_adult boolean DEFAULT false,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT anime_metadata_pkey PRIMARY KEY (anilist_id)
);
CREATE TABLE public.anime_similarity (
  anime_id text NOT NULL,
  similar_anime_id text NOT NULL,
  score numeric NOT NULL,
  source text NOT NULL DEFAULT 'cooccurrence'::text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT anime_similarity_pkey PRIMARY KEY (anime_id, similar_anime_id)
);
CREATE TABLE public.anime_trending_scores (
  anime_id text NOT NULL,
  trending_score numeric,
  last_computed timestamp with time zone DEFAULT now(),
  views_window integer,
  favorites_count integer,
  avg_watch_duration numeric,
  completion_rate numeric,
  sparkline jsonb,
  CONSTRAINT anime_trending_scores_pkey PRIMARY KEY (anime_id)
);
CREATE TABLE public.anime_view_counts (
  anime_id text NOT NULL,
  total_views integer DEFAULT 0,
  views_today integer DEFAULT 0,
  views_week integer DEFAULT 0,
  views_month integer DEFAULT 0,
  unique_viewers integer DEFAULT 0,
  last_updated timestamp with time zone DEFAULT now(),
  CONSTRAINT anime_view_counts_pkey PRIMARY KEY (anime_id)
);
CREATE TABLE public.anime_views (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  anime_id text NOT NULL,
  episode_id text NOT NULL,
  user_id uuid,
  session_id text,
  ip_hash text,
  viewed_at timestamp with time zone NOT NULL DEFAULT now(),
  watch_duration integer DEFAULT 0,
  completed boolean DEFAULT false,
  CONSTRAINT anime_views_pkey PRIMARY KEY (id),
  CONSTRAINT anime_views_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.api_job_runs (
  id bigint NOT NULL DEFAULT nextval('api_job_runs_id_seq'::regclass),
  job_name text NOT NULL,
  run_token text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status = ANY (ARRAY['running'::text, 'success'::text, 'failed'::text])),
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  finished_at timestamp with time zone,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  CONSTRAINT api_job_runs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.api_keys (
  key text NOT NULL,
  tier text NOT NULL DEFAULT 'FREE'::text CHECK (tier = ANY (ARRAY['FREE'::text, 'PREMIUM'::text, 'INTERNAL'::text])),
  user_id uuid,
  rate_limit integer NOT NULL DEFAULT 60,
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone,
  is_active boolean DEFAULT true,
  label text,
  CONSTRAINT api_keys_pkey PRIMARY KEY (key)
);
CREATE TABLE public.api_manga_home_daily (
  day_key date NOT NULL,
  provider text NOT NULL,
  payload jsonb NOT NULL,
  projection jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_snapshot_key text,
  refreshed_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT api_manga_home_daily_pkey PRIMARY KEY (day_key, provider)
);
CREATE TABLE public.api_source_validation_queue (
  id bigint NOT NULL DEFAULT nextval('api_source_validation_queue_id_seq'::regclass),
  source_hash text NOT NULL UNIQUE,
  source_url text NOT NULL,
  scope text NOT NULL CHECK (scope = ANY (ARRAY['anime'::text, 'manga'::text, 'hianime'::text])),
  provider text,
  anilist_id integer,
  mal_id integer,
  media_kind text NOT NULL DEFAULT 'source'::text CHECK (media_kind = ANY (ARRAY['source'::text, 'subtitle'::text, 'image'::text])),
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'healthy'::text, 'unhealthy'::text])),
  fail_count integer NOT NULL DEFAULT 0 CHECK (fail_count >= 0),
  success_count integer NOT NULL DEFAULT 0 CHECK (success_count >= 0),
  discovered_at timestamp with time zone NOT NULL DEFAULT now(),
  last_checked_at timestamp with time zone,
  next_check_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  last_http_status integer,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT api_source_validation_queue_pkey PRIMARY KEY (id)
);
CREATE TABLE public.app_config (
  key text NOT NULL,
  value text,
  CONSTRAINT app_config_pkey PRIMARY KEY (key)
);
CREATE TABLE public.app_releases (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  version text NOT NULL,
  platform text NOT NULL CHECK (platform = ANY (ARRAY['win'::text, 'mac'::text, 'linux'::text, 'android'::text])),
  url text NOT NULL,
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  is_latest boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT app_releases_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ban_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  user_id uuid NOT NULL,
  banned_by uuid NOT NULL,
  reason text NOT NULL,
  duration_hours integer,
  expires_at timestamp with time zone,
  unbanned_at timestamp with time zone,
  unbanned_by uuid,
  action text NOT NULL DEFAULT 'banned'::text CHECK (action = ANY (ARRAY['banned'::text, 'unbanned'::text])),
  performed_by uuid,
  CONSTRAINT ban_history_pkey PRIMARY KEY (id),
  CONSTRAINT ban_history_banned_by_fkey FOREIGN KEY (banned_by) REFERENCES public.profiles(id),
  CONSTRAINT ban_history_unbanned_by_fkey FOREIGN KEY (unbanned_by) REFERENCES public.profiles(id),
  CONSTRAINT ban_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT ban_history_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.profiles(id)
);
CREATE TABLE public.ban_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (char_length(name) >= 1 AND char_length(name) <= 100),
  reason text NOT NULL,
  duration_hours integer,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ban_templates_pkey PRIMARY KEY (id),
  CONSTRAINT ban_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.broadcast_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid NOT NULL,
  message text NOT NULL,
  type text DEFAULT 'info'::text CHECK (type = ANY (ARRAY['info'::text, 'warning'::text, 'error'::text, 'success'::text])),
  is_active boolean DEFAULT true,
  expires_at timestamp with time zone,
  deleted_at timestamp with time zone,
  deleted_by uuid,
  CONSTRAINT broadcast_messages_pkey PRIMARY KEY (id),
  CONSTRAINT broadcast_messages_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id),
  CONSTRAINT broadcast_messages_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.profiles(id)
);
CREATE TABLE public.cache_invalidation_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cache_key text NOT NULL,
  reason text,
  triggered_at timestamp with time zone DEFAULT now(),
  CONSTRAINT cache_invalidation_log_pkey PRIMARY KEY (id)
);
CREATE TABLE public.changelog (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  version text NOT NULL,
  release_date date NOT NULL DEFAULT CURRENT_DATE,
  title text,
  changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_published boolean DEFAULT false,
  is_latest boolean DEFAULT false,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT changelog_pkey PRIMARY KEY (id),
  CONSTRAINT changelog_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.character_favorites (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  character_id text NOT NULL,
  character_name text NOT NULL,
  character_image text,
  character_native_name text,
  source text NOT NULL DEFAULT 'anilist'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT character_favorites_pkey PRIMARY KEY (id),
  CONSTRAINT character_favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.comment_likes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  comment_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT comment_likes_pkey PRIMARY KEY (id),
  CONSTRAINT comment_likes_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.comments(id),
  CONSTRAINT comment_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.comment_poll_votes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL,
  user_id uuid NOT NULL,
  option_index integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT comment_poll_votes_pkey PRIMARY KEY (id),
  CONSTRAINT comment_poll_votes_poll_id_fkey FOREIGN KEY (poll_id) REFERENCES public.comment_polls(id),
  CONSTRAINT comment_poll_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.comment_polls (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL UNIQUE,
  question text NOT NULL DEFAULT ''::text,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid NOT NULL,
  ends_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT comment_polls_pkey PRIMARY KEY (id),
  CONSTRAINT comment_polls_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.comments(id),
  CONSTRAINT comment_polls_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.comments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  episode_id text,
  content text NOT NULL CHECK (char_length(content) <= 2000),
  parent_id uuid,
  likes_count integer DEFAULT 0,
  is_spoiler boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_pinned boolean DEFAULT false,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(attachments) = 'array'::text AND jsonb_array_length(attachments) <= 4),
  mentions ARRAY NOT NULL DEFAULT '{}'::uuid[],
  embeds jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(embeds) = 'array'::text AND jsonb_array_length(embeds) <= 4),
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamp with time zone,
  entity_type text NOT NULL CHECK (entity_type = ANY (ARRAY['anime'::text, 'manga'::text, 'playlist'::text, 'tier_list'::text, 'forum_post'::text])),
  entity_id text NOT NULL,
  deleted_by uuid,
  deleted_by_role text,
  pinned_at timestamp with time zone,
  pinned_by uuid,
  CONSTRAINT comments_pkey PRIMARY KEY (id),
  CONSTRAINT comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.comments(id),
  CONSTRAINT comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT comments_pinned_by_fkey FOREIGN KEY (pinned_by) REFERENCES auth.users(id)
);
CREATE TABLE public.communities (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  anime_id text,
  icon_url text,
  banner_url text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  is_verified boolean NOT NULL DEFAULT false,
  rules text,
  about text,
  CONSTRAINT communities_pkey PRIMARY KEY (id),
  CONSTRAINT communities_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.community_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  starts_at timestamp with time zone NOT NULL,
  ends_at timestamp with time zone,
  location text,
  link text,
  image_url text,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT community_events_pkey PRIMARY KEY (id),
  CONSTRAINT community_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.community_group_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  submitted_by uuid NOT NULL,
  media_type text NOT NULL CHECK (media_type = ANY (ARRAY['anime'::text, 'manga'::text])),
  content_type text NOT NULL DEFAULT 'link'::text CHECK (content_type = ANY (ARRAY['link'::text, 'dub'::text, 'scan_release'::text, 'note'::text])),
  external_id text,
  title text NOT NULL CHECK (char_length(title) >= 1 AND char_length(title) <= 200),
  episode_number integer,
  chapter_number text,
  source_name text,
  source_url text,
  subtitle_url text,
  language text,
  tags ARRAY NOT NULL DEFAULT '{}'::text[],
  notes text,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])),
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  review_notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT community_group_entries_pkey PRIMARY KEY (id),
  CONSTRAINT community_group_entries_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.community_groups(id),
  CONSTRAINT community_group_entries_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id),
  CONSTRAINT community_group_entries_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES auth.users(id)
);
CREATE TABLE public.community_group_invites (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  inviter_id uuid NOT NULL,
  invitee_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member'::text CHECK (role = ANY (ARRAY['editor'::text, 'member'::text])),
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'cancelled'::text])),
  message text,
  responded_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT community_group_invites_pkey PRIMARY KEY (id),
  CONSTRAINT community_group_invites_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.community_groups(id),
  CONSTRAINT community_group_invites_invitee_id_fkey FOREIGN KEY (invitee_id) REFERENCES auth.users(id),
  CONSTRAINT community_group_invites_inviter_id_fkey FOREIGN KEY (inviter_id) REFERENCES auth.users(id)
);
CREATE TABLE public.community_group_members (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member'::text CHECK (role = ANY (ARRAY['owner'::text, 'editor'::text, 'member'::text])),
  status text NOT NULL DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'removed'::text])),
  added_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT community_group_members_pkey PRIMARY KEY (id),
  CONSTRAINT community_group_members_added_by_fkey FOREIGN KEY (added_by) REFERENCES auth.users(id),
  CONSTRAINT community_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.community_groups(id),
  CONSTRAINT community_group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.community_groups (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(name) >= 3 AND char_length(name) <= 80),
  slug text NOT NULL UNIQUE CHECK (char_length(slug) >= 3 AND char_length(slug) <= 100),
  description text,
  group_type text NOT NULL DEFAULT 'mixed'::text CHECK (group_type = ANY (ARRAY['anime_dub'::text, 'manga_scan'::text, 'mixed'::text])),
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])),
  rejection_reason text,
  is_public boolean NOT NULL DEFAULT true,
  approved_by uuid,
  approved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  avatar_url text,
  banner_url text,
  CONSTRAINT community_groups_pkey PRIMARY KEY (id),
  CONSTRAINT community_groups_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id),
  CONSTRAINT community_groups_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id)
);
CREATE TABLE public.community_members (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member'::text CHECK (role = ANY (ARRAY['member'::text, 'mod'::text, 'owner'::text])),
  joined_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT community_members_pkey PRIMARY KEY (id),
  CONSTRAINT community_members_community_id_fkey FOREIGN KEY (community_id) REFERENCES public.communities(id),
  CONSTRAINT community_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.community_scan_uploads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  uploader_id uuid NOT NULL,
  manga_title text NOT NULL CHECK (char_length(manga_title) >= 1 AND char_length(manga_title) <= 200),
  manga_external_id text,
  chapter_number text NOT NULL CHECK (char_length(chapter_number) >= 1 AND char_length(chapter_number) <= 32),
  chapter_title text,
  release_title text,
  source_name text,
  source_url text,
  pages jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])),
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  review_notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT community_scan_uploads_pkey PRIMARY KEY (id),
  CONSTRAINT community_scan_uploads_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.community_groups(id),
  CONSTRAINT community_scan_uploads_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id),
  CONSTRAINT community_scan_uploads_uploader_id_fkey FOREIGN KEY (uploader_id) REFERENCES auth.users(id)
);
CREATE TABLE public.content_feeds (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  feed_type text NOT NULL,
  season text,
  season_year integer,
  items jsonb NOT NULL,
  computed_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone,
  CONSTRAINT content_feeds_pkey PRIMARY KEY (id)
);
CREATE TABLE public.content_items (
  tatakai_id uuid NOT NULL DEFAULT gen_random_uuid(),
  anilist_id integer UNIQUE,
  mal_id integer,
  kitsu_id integer,
  title_romaji text NOT NULL,
  title_english text,
  title_native text,
  description text,
  cover_image_large text,
  cover_image_medium text,
  banner_image text,
  color text,
  format text,
  status text,
  season text,
  season_year integer,
  episodes integer,
  duration integer,
  episode_sub_count integer,
  episode_dub_count integer,
  start_date jsonb,
  end_date jsonb,
  average_score integer,
  mean_score integer,
  popularity integer,
  favourites integer,
  rating text,
  genres ARRAY NOT NULL DEFAULT '{}'::text[],
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text,
  is_adult boolean NOT NULL DEFAULT false,
  country_of_origin text,
  next_airing_episode jsonb,
  trailer_url text,
  synonyms ARRAY NOT NULL DEFAULT '{}'::text[],
  relations jsonb,
  characters jsonb,
  staff jsonb,
  external_links jsonb,
  streaming_episodes jsonb,
  rankings jsonb,
  studios jsonb,
  last_synced_from text NOT NULL DEFAULT 'anilist'::text,
  sync_version integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  chapters integer,
  volumes integer,
  CONSTRAINT content_items_pkey PRIMARY KEY (tatakai_id)
);
CREATE TABLE public.content_moderation_flags (
  content_type text NOT NULL CHECK (content_type = ANY (ARRAY['forum_post'::text, 'tier_list'::text, 'anime'::text, 'playlist'::text, 'comment'::text])),
  content_id text NOT NULL,
  comments_paused boolean NOT NULL DEFAULT false,
  allow_repost boolean NOT NULL DEFAULT true,
  allow_requote boolean NOT NULL DEFAULT true,
  updated_by uuid,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT content_moderation_flags_pkey PRIMARY KEY (content_type, content_id),
  CONSTRAINT content_moderation_flags_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id)
);
CREATE TABLE public.content_overrides (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tatakai_id uuid NOT NULL,
  field_path text NOT NULL,
  old_value jsonb,
  new_value jsonb NOT NULL,
  reason text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT content_overrides_pkey PRIMARY KEY (id),
  CONSTRAINT content_overrides_tatakai_id_fkey FOREIGN KEY (tatakai_id) REFERENCES public.content_items(tatakai_id),
  CONSTRAINT content_overrides_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.content_provider_mappings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tatakai_id uuid NOT NULL,
  provider_id text NOT NULL,
  external_id text NOT NULL,
  episode_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence_score double precision NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT content_provider_mappings_pkey PRIMARY KEY (id),
  CONSTRAINT content_provider_mappings_tatakai_id_fkey FOREIGN KEY (tatakai_id) REFERENCES public.content_items(tatakai_id)
);
CREATE TABLE public.content_scores (
  tatakai_id uuid NOT NULL,
  anilist_score double precision,
  mal_score double precision,
  kitsu_score double precision,
  tatakai_user_score double precision,
  score_count integer NOT NULL DEFAULT 0,
  weighted_score double precision DEFAULT (((((COALESCE(anilist_score, (0)::double precision) * (0.4)::double precision) + (COALESCE(mal_score, (0)::double precision) * (0.3)::double precision)) + (COALESCE(kitsu_score, (0)::double precision) * (0.2)::double precision)) + (COALESCE(tatakai_user_score, (0)::double precision) * (0.1)::double precision)) / (NULLIF((((
CASE
    WHEN (anilist_score IS NOT NULL) THEN 0.4
    ELSE (0)::numeric
END +
CASE
    WHEN (mal_score IS NOT NULL) THEN 0.3
    ELSE (0)::numeric
END) +
CASE
    WHEN (kitsu_score IS NOT NULL) THEN 0.2
    ELSE (0)::numeric
END) +
CASE
    WHEN (tatakai_user_score IS NOT NULL) THEN 0.1
    ELSE (0)::numeric
END), (0)::numeric))::double precision),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT content_scores_pkey PRIMARY KEY (tatakai_id),
  CONSTRAINT content_scores_tatakai_id_fkey FOREIGN KEY (tatakai_id) REFERENCES public.content_items(tatakai_id)
);
CREATE TABLE public.content_titles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tatakai_id uuid NOT NULL,
  title text NOT NULL,
  title_type text NOT NULL,
  language text,
  is_primary boolean NOT NULL DEFAULT false,
  search_vector tsvector DEFAULT to_tsvector('simple'::regconfig, COALESCE(title, ''::text)),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT content_titles_pkey PRIMARY KEY (id),
  CONSTRAINT content_titles_tatakai_id_fkey FOREIGN KEY (tatakai_id) REFERENCES public.content_items(tatakai_id)
);
CREATE TABLE public.country_policy_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  iso_code character NOT NULL,
  changed_by uuid,
  changed_at timestamp with time zone NOT NULL DEFAULT now(),
  field_name text NOT NULL,
  old_value text,
  new_value text,
  reason text,
  ip_address inet,
  CONSTRAINT country_policy_audit_log_pkey PRIMARY KEY (id),
  CONSTRAINT country_policy_audit_log_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id)
);
CREATE TABLE public.country_torrent_policies (
  iso_code character NOT NULL,
  iso_code_3 character NOT NULL,
  country_name text NOT NULL,
  country_name_local text,
  torrent_policy text NOT NULL DEFAULT 'unclear'::text CHECK (torrent_policy = ANY (ARRAY['legal'::text, 'decriminalized'::text, 'illegal'::text, 'unclear'::text, 'vpn_required'::text])),
  enforcement_level text NOT NULL DEFAULT 'unknown'::text CHECK (enforcement_level = ANY (ARRAY['none'::text, 'low'::text, 'moderate'::text, 'high'::text, 'severe'::text, 'unknown'::text])),
  downloading_illegal boolean DEFAULT false,
  uploading_illegal boolean DEFAULT false,
  streaming_illegal boolean DEFAULT false,
  fines_applicable boolean DEFAULT false,
  imprisonment_possible boolean DEFAULT false,
  isp_monitoring boolean DEFAULT false,
  specific_law text,
  law_reference_url text,
  last_verified_at timestamp with time zone,
  verification_source text,
  notes text,
  vpn_recommended boolean DEFAULT ((torrent_policy = ANY (ARRAY['illegal'::text, 'vpn_required'::text])) OR (enforcement_level = ANY (ARRAY['high'::text, 'severe'::text]))),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid,
  update_reason text,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT country_torrent_policies_pkey PRIMARY KEY (iso_code),
  CONSTRAINT country_torrent_policies_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id)
);
CREATE TABLE public.crash_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  crash_id text NOT NULL,
  crashed_at timestamp with time zone,
  app_version text,
  platform text,
  arch text,
  node_version text,
  electron_version text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT crash_reports_pkey PRIMARY KEY (id)
);
CREATE TABLE public.curated_home_sections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope = ANY (ARRAY['anime'::text, 'manga'::text])),
  mode text NOT NULL DEFAULT 'query'::text CHECK (mode = ANY (ARRAY['trending'::text, 'genre'::text, 'query'::text, 'provider'::text, 'media_type'::text])),
  title text NOT NULL,
  description text,
  query text,
  genre text,
  provider text,
  media_type text,
  max_items integer NOT NULL DEFAULT 12 CHECK (max_items >= 1 AND max_items <= 48),
  position integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT curated_home_sections_pkey PRIMARY KEY (id),
  CONSTRAINT curated_home_sections_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT curated_home_sections_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id)
);
CREATE TABLE public.daily_analytics (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  date date NOT NULL UNIQUE,
  total_visitors integer DEFAULT 0,
  unique_visitors integer DEFAULT 0,
  guest_visitors integer DEFAULT 0,
  logged_in_visitors integer DEFAULT 0,
  total_page_views integer DEFAULT 0,
  total_watch_time_seconds bigint DEFAULT 0,
  new_users integer DEFAULT 0,
  new_comments integer DEFAULT 0,
  new_ratings integer DEFAULT 0,
  top_countries jsonb DEFAULT '[]'::jsonb,
  top_genres jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT daily_analytics_pkey PRIMARY KEY (id)
);
CREATE TABLE public.device_bans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  device_id text NOT NULL CHECK (char_length(device_id) >= 1 AND char_length(device_id) <= 255),
  reason text NOT NULL CHECK (char_length(reason) >= 1 AND char_length(reason) <= 500),
  banned_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone,
  is_active boolean NOT NULL DEFAULT (expires_at IS NULL),
  CONSTRAINT device_bans_pkey PRIMARY KEY (id),
  CONSTRAINT device_bans_banned_by_fkey FOREIGN KEY (banned_by) REFERENCES auth.users(id)
);
CREATE TABLE public.episode_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tatakai_id uuid NOT NULL,
  episode_number integer NOT NULL,
  episode_internal_id text NOT NULL,
  title text,
  description text,
  thumbnail_url text,
  airing_at timestamp with time zone,
  duration integer,
  is_filler boolean NOT NULL DEFAULT false,
  is_recap boolean NOT NULL DEFAULT false,
  is_special boolean NOT NULL DEFAULT false,
  anidb_eid integer,
  tvdb_eid integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT episode_items_pkey PRIMARY KEY (id),
  CONSTRAINT episode_items_tatakai_id_fkey FOREIGN KEY (tatakai_id) REFERENCES public.content_items(tatakai_id)
);
CREATE TABLE public.episodes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  anilist_id integer NOT NULL,
  episode_number integer NOT NULL,
  title text,
  thumbnail text,
  aired_at timestamp with time zone,
  duration integer,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT episodes_pkey PRIMARY KEY (id),
  CONSTRAINT episodes_anilist_id_fkey FOREIGN KEY (anilist_id) REFERENCES public.anime_metadata(anilist_id)
);
CREATE TABLE public.extension_audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  extension_id text,
  event_type text NOT NULL,
  performed_by uuid,
  performed_at timestamp with time zone NOT NULL DEFAULT now(),
  details jsonb,
  ip_address inet,
  user_agent text,
  CONSTRAINT extension_audit_logs_pkey PRIMARY KEY (id),
  CONSTRAINT extension_audit_logs_extension_id_fkey FOREIGN KEY (extension_id) REFERENCES public.extension_manifests(extension_id),
  CONSTRAINT extension_audit_logs_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES auth.users(id)
);
CREATE TABLE public.extension_manifests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  extension_id text NOT NULL UNIQUE,
  name text NOT NULL,
  version text NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['torrent'::text, 'onlinestream'::text, 'custom'::text, 'metadata'::text])),
  main_url text NOT NULL,
  update_url text,
  description text,
  speed text CHECK (speed = ANY (ARRAY['fast'::text, 'moderate'::text, 'slow'::text])),
  accuracy text CHECK (accuracy = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text])),
  regions ARRAY,
  nsfw boolean NOT NULL DEFAULT false,
  permissions ARRAY NOT NULL DEFAULT '{}'::text[],
  signature text,
  signed_by text,
  submission_status text NOT NULL DEFAULT 'pending'::text CHECK (submission_status = ANY (ARRAY['pending'::text, 'under_review'::text, 'approved'::text, 'rejected'::text, 'disabled'::text])),
  submitted_by uuid,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  is_killed boolean NOT NULL DEFAULT false,
  killed_at timestamp with time zone,
  kill_reason text,
  install_count integer NOT NULL DEFAULT 0,
  health_score double precision NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT extension_manifests_pkey PRIMARY KEY (id),
  CONSTRAINT extension_manifests_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES auth.users(id),
  CONSTRAINT extension_manifests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id)
);
CREATE TABLE public.extensions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL,
  version text NOT NULL,
  author text NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['torrent'::text, 'onlinestream'::text, 'custom'::text, 'metadata'::text])),
  icon text,
  banner text,
  screenshots ARRAY DEFAULT '{}'::text[],
  categories ARRAY DEFAULT '{}'::text[],
  permissions ARRAY DEFAULT '{}'::text[],
  downloads integer DEFAULT 0,
  rating double precision DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'disabled'::text])),
  isapproved boolean DEFAULT false,
  user_id uuid,
  manifest_url text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT extensions_pkey PRIMARY KEY (id),
  CONSTRAINT extensions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.forum_posts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  content_type text DEFAULT 'text'::text CHECK (content_type = ANY (ARRAY['text'::text, 'image'::text, 'link'::text, 'poll'::text])),
  anime_id text,
  anime_name text,
  anime_poster text,
  playlist_id uuid,
  tierlist_id uuid,
  character_id text,
  character_name text,
  flair text,
  is_pinned boolean DEFAULT false,
  is_locked boolean DEFAULT false,
  is_spoiler boolean DEFAULT false,
  is_nsfw boolean DEFAULT false,
  upvotes integer DEFAULT 0,
  downvotes integer DEFAULT 0,
  comments_count integer DEFAULT 0,
  views_count integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  image_url text,
  is_approved boolean DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  community_id uuid,
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamp with time zone,
  edited_at timestamp with time zone,
  deleted_by uuid,
  deleted_by_role text,
  CONSTRAINT forum_posts_pkey PRIMARY KEY (id),
  CONSTRAINT forum_posts_playlist_id_fkey FOREIGN KEY (playlist_id) REFERENCES public.playlists(id),
  CONSTRAINT forum_posts_tierlist_id_fkey FOREIGN KEY (tierlist_id) REFERENCES public.tier_lists(id),
  CONSTRAINT forum_posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT forum_posts_community_id_fkey FOREIGN KEY (community_id) REFERENCES public.communities(id)
);
CREATE TABLE public.forum_votes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  post_id uuid CHECK (post_id IS NOT NULL),
  vote_type smallint NOT NULL CHECK (vote_type = ANY (ARRAY['-1'::integer, 1])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT forum_votes_pkey PRIMARY KEY (id),
  CONSTRAINT forum_votes_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.forum_posts(id),
  CONSTRAINT forum_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.gif_bookmarks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  gif_url text NOT NULL,
  preview_url text,
  title text,
  width integer,
  height integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT gif_bookmarks_pkey PRIMARY KEY (id),
  CONSTRAINT gif_bookmarks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.ip_bans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ip_address inet NOT NULL,
  reason text NOT NULL CHECK (char_length(reason) >= 1 AND char_length(reason) <= 500),
  banned_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone,
  CONSTRAINT ip_bans_pkey PRIMARY KEY (id),
  CONSTRAINT ip_bans_banned_by_fkey FOREIGN KEY (banned_by) REFERENCES auth.users(id)
);
CREATE TABLE public.maintenance_mode (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  is_active boolean NOT NULL DEFAULT false,
  message text NOT NULL,
  enabled_at timestamp with time zone,
  enabled_by uuid,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT maintenance_mode_pkey PRIMARY KEY (id),
  CONSTRAINT maintenance_mode_enabled_by_fkey FOREIGN KEY (enabled_by) REFERENCES auth.users(id)
);
CREATE TABLE public.manga_readlist (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  manga_id text NOT NULL,
  manga_title text NOT NULL,
  manga_poster text,
  status text NOT NULL DEFAULT 'plan_to_read'::text CHECK (status = ANY (ARRAY['plan_to_read'::text, 'reading'::text, 'completed'::text, 'on_hold'::text, 'dropped'::text])),
  last_chapter_key text,
  last_chapter_number numeric,
  last_chapter_title text,
  last_provider text,
  last_language text,
  last_page_index integer NOT NULL DEFAULT 0 CHECK (last_page_index >= 0),
  total_pages integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  mal_id integer CHECK (mal_id IS NULL OR mal_id > 0),
  anilist_id integer CHECK (anilist_id IS NULL OR anilist_id > 0),
  format text CHECK (format IS NULL OR (format = ANY (ARRAY['manga'::text, 'manhwa'::text, 'manhua'::text, 'comic'::text, 'novel'::text]))),
  last_volume_number numeric,
  last_extension_id text,
  last_scanlator text,
  last_page_id text,
  CONSTRAINT manga_readlist_pkey PRIMARY KEY (id),
  CONSTRAINT manga_readlist_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.mappings (
  internal_id uuid NOT NULL DEFAULT gen_random_uuid(),
  anilist_id integer UNIQUE,
  mal_id integer,
  anidb_id integer,
  kitsu_id integer,
  thetvdb_id integer,
  imdb_id text,
  themoviedb_id integer,
  animeplanet_id text,
  notifymoe_id text,
  livechart_id integer,
  slug text,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT mappings_pkey PRIMARY KEY (internal_id)
);
CREATE TABLE public.marketplace_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  type text NOT NULL,
  anime_id text NOT NULL,
  anime_name text,
  episode_number integer,
  data jsonb NOT NULL,
  status text DEFAULT 'pending'::text,
  moderator_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  language text,
  quality text,
  source text,
  codec text,
  audio text,
  subtitle_type text,
  episode_range text,
  release_group text,
  notes text,
  source_type text CHECK (source_type IS NULL OR (source_type = ANY (ARRAY['subtitle'::text, 'server'::text, 'magnet'::text, 'torrent'::text, 'external'::text]))),
  stream_url text,
  external_url text,
  magnet_link text,
  torrent_file_url text,
  CONSTRAINT marketplace_items_pkey PRIMARY KEY (id),
  CONSTRAINT marketplace_items_moderator_id_fkey FOREIGN KEY (moderator_id) REFERENCES auth.users(id),
  CONSTRAINT marketplace_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(user_id)
);
CREATE TABLE public.mobile_analytics (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  device_id text NOT NULL,
  platform text NOT NULL CHECK (platform = ANY (ARRAY['android'::text, 'ios'::text])),
  app_version text NOT NULL,
  device_model text,
  os_version text,
  event_type text NOT NULL,
  event_data jsonb DEFAULT '{}'::jsonb,
  screen_name text,
  session_id text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT mobile_analytics_pkey PRIMARY KEY (id),
  CONSTRAINT mobile_analytics_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.moderation_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type = ANY (ARRAY['comment'::text, 'playlist'::text, 'tier_list'::text, 'forum_post'::text, 'profile'::text])),
  entity_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'flagged'::text])),
  flagged_by uuid,
  flagged_reason text,
  flagged_at timestamp with time zone DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  review_notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT moderation_queue_pkey PRIMARY KEY (id),
  CONSTRAINT moderation_queue_flagged_by_fkey FOREIGN KEY (flagged_by) REFERENCES auth.users(id),
  CONSTRAINT moderation_queue_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id)
);
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  data jsonb,
  read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.page_visits (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  session_id text NOT NULL,
  ip_address inet,
  country text,
  city text,
  user_agent text,
  page_path text NOT NULL,
  referrer text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT page_visits_pkey PRIMARY KEY (id),
  CONSTRAINT page_visits_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.playback_telemetry (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  event_type text NOT NULL,
  anime_id text,
  episode_id text,
  category text,
  server_name text,
  ok boolean,
  latency_ms integer,
  user_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text,
  CONSTRAINT playback_telemetry_pkey PRIMARY KEY (id)
);
CREATE TABLE public.playlist_collaborators (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'editor'::text CHECK (role = ANY (ARRAY['viewer'::text, 'editor'::text, 'admin'::text])),
  added_by uuid NOT NULL,
  added_at timestamp with time zone DEFAULT now(),
  CONSTRAINT playlist_collaborators_pkey PRIMARY KEY (id),
  CONSTRAINT playlist_collaborators_added_by_fkey FOREIGN KEY (added_by) REFERENCES auth.users(id),
  CONSTRAINT playlist_collaborators_playlist_id_fkey FOREIGN KEY (playlist_id) REFERENCES public.playlists(id),
  CONSTRAINT playlist_collaborators_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.playlist_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL,
  user_id uuid NOT NULL,
  content text NOT NULL CHECK (length(TRIM(BOTH FROM content)) > 0),
  parent_id uuid,
  likes_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT playlist_comments_pkey PRIMARY KEY (id),
  CONSTRAINT playlist_comments_playlist_id_fkey FOREIGN KEY (playlist_id) REFERENCES public.playlists(id),
  CONSTRAINT playlist_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT playlist_comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.playlist_comments(id)
);
CREATE TABLE public.playlist_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL,
  anime_id text NOT NULL,
  anime_name text NOT NULL,
  anime_poster text,
  position integer NOT NULL DEFAULT 0,
  added_at timestamp with time zone DEFAULT now(),
  media_format text,
  CONSTRAINT playlist_items_pkey PRIMARY KEY (id),
  CONSTRAINT playlist_items_playlist_id_fkey FOREIGN KEY (playlist_id) REFERENCES public.playlists(id)
);
CREATE TABLE public.playlist_likes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT playlist_likes_pkey PRIMARY KEY (id),
  CONSTRAINT playlist_likes_playlist_id_fkey FOREIGN KEY (playlist_id) REFERENCES public.playlists(id),
  CONSTRAINT playlist_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.playlists (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  cover_image text,
  is_public boolean DEFAULT false,
  items_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  share_slug text,
  share_description text,
  embed_allowed boolean DEFAULT false,
  is_flagged boolean DEFAULT false,
  flagged_by uuid,
  flagged_reason text,
  flagged_at timestamp with time zone,
  flag_count integer DEFAULT 0,
  admin_reviewed boolean DEFAULT false,
  likes_count integer NOT NULL DEFAULT 0,
  CONSTRAINT playlists_pkey PRIMARY KEY (id),
  CONSTRAINT playlists_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.popup_dismissals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  popup_id uuid NOT NULL,
  user_id uuid,
  session_id text,
  dismissed_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT popup_dismissals_pkey PRIMARY KEY (id),
  CONSTRAINT popup_dismissals_popup_id_fkey FOREIGN KEY (popup_id) REFERENCES public.popups(id),
  CONSTRAINT popup_dismissals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.popups (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text,
  popup_type text NOT NULL CHECK (popup_type = ANY (ARRAY['banner'::text, 'modal'::text, 'toast'::text, 'fullscreen'::text])),
  background_color text DEFAULT '#1B1919'::text,
  text_color text DEFAULT '#FFFFFF'::text,
  accent_color text DEFAULT '#FF1493'::text,
  image_url text,
  action_text text,
  action_url text,
  dismiss_text text DEFAULT 'Dismiss'::text,
  target_pages ARRAY DEFAULT '{}'::text[],
  target_user_type text DEFAULT 'all'::text CHECK (target_user_type = ANY (ARRAY['all'::text, 'guests'::text, 'logged_in'::text, 'premium'::text])),
  show_on_mobile boolean DEFAULT true,
  show_on_desktop boolean DEFAULT true,
  start_date timestamp with time zone,
  end_date timestamp with time zone,
  frequency text DEFAULT 'once'::text CHECK (frequency = ANY (ARRAY['once'::text, 'always'::text, 'daily'::text, 'weekly'::text])),
  priority integer DEFAULT 1,
  is_active boolean DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  use_theme_colors boolean DEFAULT false,
  CONSTRAINT popups_pkey PRIMARY KEY (id),
  CONSTRAINT popups_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.post_bookmarks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT post_bookmarks_pkey PRIMARY KEY (id),
  CONSTRAINT post_bookmarks_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.forum_posts(id),
  CONSTRAINT post_bookmarks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.post_hashtags (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  tag text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT post_hashtags_pkey PRIMARY KEY (id),
  CONSTRAINT post_hashtags_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.forum_posts(id)
);
CREATE TABLE public.post_poll_votes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL,
  user_id uuid NOT NULL,
  option_index integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT post_poll_votes_pkey PRIMARY KEY (id),
  CONSTRAINT post_poll_votes_poll_id_fkey FOREIGN KEY (poll_id) REFERENCES public.post_polls(id),
  CONSTRAINT post_poll_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.post_polls (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL UNIQUE,
  question text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid NOT NULL,
  ends_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT post_polls_pkey PRIMARY KEY (id),
  CONSTRAINT post_polls_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.forum_posts(id),
  CONSTRAINT post_polls_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.post_reposts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT post_reposts_pkey PRIMARY KEY (id),
  CONSTRAINT post_reposts_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.forum_posts(id),
  CONSTRAINT post_reposts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  username text UNIQUE,
  display_name text,
  avatar_url text,
  bio text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_admin boolean DEFAULT false,
  is_banned boolean DEFAULT false,
  banned_at timestamp with time zone,
  banned_by uuid,
  ban_reason text,
  is_public boolean DEFAULT true,
  banner_url text,
  total_watch_time_seconds bigint DEFAULT 0,
  showcase_anime_ids ARRAY DEFAULT '{}'::text[],
  mal_user_id text,
  mal_access_token text,
  mal_refresh_token text,
  mal_token_expires_at timestamp with time zone,
  anilist_user_id text,
  anilist_access_token text,
  anilist_token_expires_at timestamp with time zone,
  social_links jsonb DEFAULT '{}'::jsonb,
  show_watchlist boolean DEFAULT true,
  show_history boolean DEFAULT true,
  role text DEFAULT 'user'::text,
  last_seen timestamp with time zone DEFAULT now(),
  mal_auto_delete boolean DEFAULT false,
  anilist_refresh_token text,
  is_moderator boolean DEFAULT false,
  can_broadcast boolean DEFAULT false,
  preferred_manga_language text DEFAULT 'auto'::text CHECK (preferred_manga_language = ANY (ARRAY['auto'::text, 'jp'::text, 'en'::text, 'kr'::text, 'zh'::text])),
  app_version text,
  device_id text,
  country text,
  preferred_title_language text DEFAULT 'romaji'::text CHECK (preferred_title_language = ANY (ARRAY['romaji'::text, 'english'::text, 'native'::text])),
  app_settings jsonb DEFAULT '{}'::jsonb,
  show_calendar boolean DEFAULT true,
  is_official boolean DEFAULT false,
  storage_quota_bytes bigint NOT NULL DEFAULT 26214400,
  storage_used_bytes bigint NOT NULL DEFAULT 0,
  can_comment boolean NOT NULL DEFAULT true,
  can_post boolean NOT NULL DEFAULT true,
  can_tierlist boolean NOT NULL DEFAULT true,
  can_upload boolean NOT NULL DEFAULT true,
  can_access_community boolean NOT NULL DEFAULT true,
  last_login_at timestamp with time zone,
  device_name text,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_banned_by_fkey FOREIGN KEY (banned_by) REFERENCES auth.users(id),
  CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.provider_health (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  success boolean NOT NULL,
  latency_ms integer NOT NULL,
  recorded_at timestamp with time zone DEFAULT now(),
  CONSTRAINT provider_health_pkey PRIMARY KEY (id)
);
CREATE TABLE public.provider_health_states (
  provider_id text NOT NULL,
  provider_name text NOT NULL,
  provider_type text NOT NULL,
  status text NOT NULL DEFAULT 'unknown'::text CHECK (status = ANY (ARRAY['healthy'::text, 'degraded'::text, 'unhealthy'::text, 'unknown'::text])),
  last_check_at timestamp with time zone,
  last_success_at timestamp with time zone,
  last_failure_at timestamp with time zone,
  consecutive_failures integer NOT NULL DEFAULT 0,
  consecutive_successes integer NOT NULL DEFAULT 0,
  avg_response_time_ms double precision,
  p95_response_time_ms double precision,
  error_rate_24h double precision,
  circuit_state text NOT NULL DEFAULT 'closed'::text CHECK (circuit_state = ANY (ARRAY['closed'::text, 'open'::text, 'half_open'::text])),
  circuit_opened_at timestamp with time zone,
  circuit_failure_threshold integer NOT NULL DEFAULT 5,
  circuit_recovery_timeout_ms integer NOT NULL DEFAULT 60000,
  base_url text,
  regions ARRAY,
  supports_dub ARRAY,
  max_resolution text,
  disabled boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT provider_health_states_pkey PRIMARY KEY (provider_id)
);
CREATE TABLE public.provider_incidents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  provider_id text,
  incident_type text NOT NULL,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone,
  severity text NOT NULL DEFAULT 'medium'::text,
  description text,
  error_samples jsonb,
  affected_routes ARRAY,
  resolved_by uuid,
  resolution_notes text,
  CONSTRAINT provider_incidents_pkey PRIMARY KEY (id),
  CONSTRAINT provider_incidents_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.provider_health_states(provider_id),
  CONSTRAINT provider_incidents_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES auth.users(id)
);
CREATE TABLE public.push_notifications_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  target_type text NOT NULL CHECK (target_type = ANY (ARRAY['all'::text, 'user'::text])),
  target_user_id uuid,
  sent_count integer DEFAULT 0,
  sent_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT push_notifications_log_pkey PRIMARY KEY (id),
  CONSTRAINT push_notifications_log_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES auth.users(id),
  CONSTRAINT push_notifications_log_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.push_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  token text NOT NULL,
  platform text NOT NULL CHECK (platform = ANY (ARRAY['ios'::text, 'android'::text, 'web'::text])),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT push_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT push_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.rate_limits (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  ip_address inet,
  endpoint text NOT NULL,
  request_count integer DEFAULT 1,
  window_start timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT rate_limits_pkey PRIMARY KEY (id),
  CONSTRAINT rate_limits_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.ratings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  anime_id text NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 10),
  review text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ratings_pkey PRIMARY KEY (id),
  CONSTRAINT ratings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.reactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entity_type text NOT NULL CHECK (entity_type = ANY (ARRAY['comment'::text, 'forum_post'::text, 'tier_list'::text])),
  entity_id uuid NOT NULL,
  reaction_type text NOT NULL CHECK (reaction_type = ANY (ARRAY['like'::text, 'love'::text, 'laugh'::text, 'wow'::text, 'sad'::text, 'angry'::text])),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT reactions_pkey PRIMARY KEY (id),
  CONSTRAINT reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.recommendation_feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  anime_id text NOT NULL,
  feedback text NOT NULL CHECK (feedback = ANY (ARRAY['like'::text, 'dislike'::text, 'already_seen'::text, 'skip'::text])),
  recommendation_score integer,
  reasons_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  factors_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT recommendation_feedback_pkey PRIMARY KEY (id),
  CONSTRAINT recommendation_feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.recommendation_scores (
  user_id uuid NOT NULL,
  anilist_id integer NOT NULL,
  score double precision NOT NULL DEFAULT 0,
  computed_at timestamp with time zone DEFAULT now(),
  CONSTRAINT recommendation_scores_pkey PRIMARY KEY (user_id, anilist_id)
);
CREATE TABLE public.recommendations_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  recommendations jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  expires_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, (now() + '12:00:00'::interval)),
  CONSTRAINT recommendations_cache_pkey PRIMARY KEY (id),
  CONSTRAINT recommendations_cache_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.redirects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  target_url text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT redirects_pkey PRIMARY KEY (id)
);
CREATE TABLE public.reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  reporter_id uuid,
  target_type text NOT NULL CHECK (target_type = ANY (ARRAY['user'::text, 'comment'::text, 'server'::text, 'anime'::text, 'other'::text, 'forum_post'::text, 'post'::text, 'tier_list'::text, 'tierlist'::text, 'playlist'::text])),
  target_id text NOT NULL,
  reason text NOT NULL,
  details text,
  status text DEFAULT 'pending'::text,
  moderator_id uuid,
  admin_notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT reports_pkey PRIMARY KEY (id),
  CONSTRAINT reports_moderator_id_fkey FOREIGN KEY (moderator_id) REFERENCES auth.users(id),
  CONSTRAINT reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES auth.users(id)
);
CREATE TABLE public.saved_playlists (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  playlist_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT saved_playlists_pkey PRIMARY KEY (id),
  CONSTRAINT saved_playlists_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT saved_playlists_playlist_id_fkey FOREIGN KEY (playlist_id) REFERENCES public.playlists(id)
);
CREATE TABLE public.security_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  resource_type text,
  resource_id uuid,
  ip_address inet,
  user_agent text,
  success boolean DEFAULT true,
  error_message text,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT security_audit_log_pkey PRIMARY KEY (id),
  CONSTRAINT security_audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.status_incident_updates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL,
  message text NOT NULL,
  status text NOT NULL CHECK (status = ANY (ARRAY['investigating'::text, 'identified'::text, 'monitoring'::text, 'resolved'::text])),
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT status_incident_updates_pkey PRIMARY KEY (id),
  CONSTRAINT status_incident_updates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT status_incident_updates_incident_id_fkey FOREIGN KEY (incident_id) REFERENCES public.status_incidents(id)
);
CREATE TABLE public.status_incidents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  status text NOT NULL CHECK (status = ANY (ARRAY['investigating'::text, 'identified'::text, 'monitoring'::text, 'resolved'::text])),
  severity text NOT NULL CHECK (severity = ANY (ARRAY['minor'::text, 'major'::text, 'critical'::text])),
  affected_services ARRAY DEFAULT '{}'::text[],
  is_active boolean DEFAULT true,
  created_by uuid NOT NULL,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT status_incidents_pkey PRIMARY KEY (id),
  CONSTRAINT status_incidents_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.suggestions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  category text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  status text DEFAULT 'pending'::text,
  admin_notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  image_url text,
  priority text DEFAULT 'normal'::text,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  CONSTRAINT suggestions_pkey PRIMARY KEY (id),
  CONSTRAINT suggestions_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id),
  CONSTRAINT suggestions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.tier_list_collaborators (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tier_list_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'editor'::text CHECK (role = ANY (ARRAY['viewer'::text, 'editor'::text, 'owner'::text])),
  added_by uuid NOT NULL,
  added_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tier_list_collaborators_pkey PRIMARY KEY (id),
  CONSTRAINT tier_list_collaborators_added_by_fkey FOREIGN KEY (added_by) REFERENCES auth.users(id),
  CONSTRAINT tier_list_collaborators_tier_list_id_fkey FOREIGN KEY (tier_list_id) REFERENCES public.tier_lists(id),
  CONSTRAINT tier_list_collaborators_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.tier_list_likes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tier_list_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tier_list_likes_pkey PRIMARY KEY (id),
  CONSTRAINT tier_list_likes_tier_list_id_fkey FOREIGN KEY (tier_list_id) REFERENCES public.tier_lists(id),
  CONSTRAINT tier_list_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.tier_lists (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  is_public boolean DEFAULT true,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  share_code text UNIQUE,
  likes_count integer DEFAULT 0,
  views_count integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tier_lists_pkey PRIMARY KEY (id),
  CONSTRAINT tier_lists_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.tracked_shows (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  anime_id text NOT NULL,
  title text,
  image_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  anilist_id integer,
  CONSTRAINT tracked_shows_pkey PRIMARY KEY (id),
  CONSTRAINT tracked_shows_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.update_policies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  channel text NOT NULL CHECK (channel = ANY (ARRAY['stable'::text, 'beta'::text, 'experimental'::text])),
  type text NOT NULL CHECK (type = ANY (ARRAY['mandatory'::text, 'recommended'::text, 'experimental'::text, 'rollback'::text])),
  target_version text NOT NULL,
  rollback_from_version text,
  active boolean NOT NULL DEFAULT true,
  notes text,
  published_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT update_policies_pkey PRIMARY KEY (id)
);
CREATE TABLE public.user_achievements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  achievement_id text NOT NULL,
  granted_by uuid,
  granted_at timestamp with time zone NOT NULL DEFAULT now(),
  note text,
  CONSTRAINT user_achievements_pkey PRIMARY KEY (id),
  CONSTRAINT user_achievements_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES auth.users(id),
  CONSTRAINT user_achievements_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.user_badges (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  badge_key text NOT NULL,
  source text NOT NULL DEFAULT 'admin'::text CHECK (source = ANY (ARRAY['auto'::text, 'admin'::text])),
  granted_by uuid,
  granted_at timestamp with time zone NOT NULL DEFAULT now(),
  note text,
  CONSTRAINT user_badges_pkey PRIMARY KEY (id),
  CONSTRAINT user_badges_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT user_badges_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES auth.users(id)
);
CREATE TABLE public.user_extensions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  extension_id text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  installed_at timestamp with time zone NOT NULL DEFAULT now(),
  last_used_at timestamp with time zone,
  use_count integer NOT NULL DEFAULT 0,
  user_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT user_extensions_pkey PRIMARY KEY (id),
  CONSTRAINT user_extensions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT user_extensions_extension_id_fkey FOREIGN KEY (extension_id) REFERENCES public.extension_manifests(extension_id)
);
CREATE TABLE public.user_follows (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL,
  following_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_follows_pkey PRIMARY KEY (id),
  CONSTRAINT user_follows_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES auth.users(id),
  CONSTRAINT user_follows_following_id_fkey FOREIGN KEY (following_id) REFERENCES auth.users(id)
);
CREATE TABLE public.user_notification_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  platform text,
  last_seen timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_notification_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT user_notification_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.user_recommendations (
  user_id uuid NOT NULL,
  media_type text NOT NULL DEFAULT 'anime'::text,
  anime_id text NOT NULL,
  score integer NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0,
  factors jsonb NOT NULL DEFAULT '{}'::jsonb,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL DEFAULT 'hybrid'::text,
  model_version text NOT NULL DEFAULT 'v1'::text,
  generated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_recommendations_pkey PRIMARY KEY (user_id, media_type, anime_id),
  CONSTRAINT user_recommendations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.user_reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  rating integer CHECK (rating >= 1 AND rating <= 5),
  feedback text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_reviews_pkey PRIMARY KEY (id),
  CONSTRAINT user_reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role USER-DEFINED NOT NULL DEFAULT 'user'::app_role,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_roles_pkey PRIMARY KEY (id),
  CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.user_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_token text,
  ip_address text,
  device_id text,
  device_name text,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  revoked_at timestamp with time zone,
  CONSTRAINT user_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.user_stats (
  user_id uuid NOT NULL,
  xp bigint NOT NULL DEFAULT 0 CHECK (xp >= 0),
  reputation bigint NOT NULL DEFAULT 0,
  manga_count integer NOT NULL DEFAULT 0 CHECK (manga_count >= 0),
  manhwa_count integer NOT NULL DEFAULT 0 CHECK (manhwa_count >= 0),
  comic_count integer NOT NULL DEFAULT 0 CHECK (comic_count >= 0),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_stats_pkey PRIMARY KEY (user_id),
  CONSTRAINT user_stats_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.user_suggestions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL CHECK (category = ANY (ARRAY['feature'::text, 'bug'::text, 'improvement'::text, 'content'::text, 'other'::text])),
  priority text DEFAULT 'normal'::text CHECK (priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text])),
  status text DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'reviewing'::text, 'approved'::text, 'rejected'::text, 'implemented'::text])),
  admin_notes text,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  image_url text,
  CONSTRAINT user_suggestions_pkey PRIMARY KEY (id),
  CONSTRAINT user_suggestions_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id),
  CONSTRAINT user_suggestions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.user_tag_interests (
  user_id uuid NOT NULL,
  tag text NOT NULL,
  weight integer NOT NULL DEFAULT 1,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_tag_interests_pkey PRIMARY KEY (user_id, tag),
  CONSTRAINT user_tag_interests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.user_taste_profiles (
  user_id uuid NOT NULL,
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  sample_size integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_taste_profiles_pkey PRIMARY KEY (user_id),
  CONSTRAINT user_taste_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.watch_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  anime_id text NOT NULL,
  anime_name text NOT NULL,
  anime_poster text,
  episode_id text NOT NULL,
  episode_number integer NOT NULL,
  progress_seconds integer DEFAULT 0,
  duration_seconds integer,
  completed boolean DEFAULT false,
  watched_at timestamp with time zone NOT NULL DEFAULT now(),
  mal_id integer,
  anilist_id integer,
  CONSTRAINT watch_history_pkey PRIMARY KEY (id),
  CONSTRAINT watch_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.watch_room_invites (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL,
  invited_user_id uuid,
  invite_code text UNIQUE,
  used boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone DEFAULT (now() + '01:00:00'::interval),
  CONSTRAINT watch_room_invites_pkey PRIMARY KEY (id),
  CONSTRAINT watch_room_invites_invited_user_id_fkey FOREIGN KEY (invited_user_id) REFERENCES auth.users(id),
  CONSTRAINT watch_room_invites_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.watch_rooms(id)
);
CREATE TABLE public.watch_room_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL,
  user_id uuid,
  display_name text NOT NULL,
  avatar_url text,
  message text NOT NULL,
  message_type text DEFAULT 'chat'::text CHECK (message_type = ANY (ARRAY['chat'::text, 'system'::text, 'reaction'::text])),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT watch_room_messages_pkey PRIMARY KEY (id),
  CONSTRAINT watch_room_messages_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.watch_rooms(id),
  CONSTRAINT watch_room_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.watch_room_participants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL,
  user_id uuid NOT NULL,
  display_name text,
  avatar_url text,
  is_host boolean DEFAULT false,
  is_ready boolean DEFAULT false,
  joined_at timestamp with time zone DEFAULT now(),
  last_seen_at timestamp with time zone DEFAULT now(),
  CONSTRAINT watch_room_participants_pkey PRIMARY KEY (id),
  CONSTRAINT watch_room_participants_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.watch_rooms(id),
  CONSTRAINT watch_room_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.watch_room_poll_votes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL,
  room_id uuid NOT NULL,
  user_id uuid NOT NULL,
  option_index integer NOT NULL CHECK (option_index >= 0),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT watch_room_poll_votes_pkey PRIMARY KEY (id),
  CONSTRAINT watch_room_poll_votes_poll_id_fkey FOREIGN KEY (poll_id) REFERENCES public.watch_room_polls(id),
  CONSTRAINT watch_room_poll_votes_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.watch_rooms(id),
  CONSTRAINT watch_room_poll_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.watch_room_polls (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL,
  question text NOT NULL CHECK (length(TRIM(BOTH FROM question)) > 0),
  options jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(options) = 'array'::text),
  created_by uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  ends_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT watch_room_polls_pkey PRIMARY KEY (id),
  CONSTRAINT watch_room_polls_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT watch_room_polls_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.watch_rooms(id)
);
CREATE TABLE public.watch_room_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL,
  anime_id text NOT NULL,
  anime_title text NOT NULL,
  anime_poster text,
  episode_id text,
  episode_number integer,
  episode_title text,
  added_by uuid,
  position integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT watch_room_queue_pkey PRIMARY KEY (id),
  CONSTRAINT watch_room_queue_added_by_fkey FOREIGN KEY (added_by) REFERENCES auth.users(id),
  CONSTRAINT watch_room_queue_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.watch_rooms(id)
);
CREATE TABLE public.watch_rooms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  host_id uuid NOT NULL,
  anime_id text,
  anime_title text,
  anime_poster text,
  episode_id text,
  episode_number integer,
  access_type text DEFAULT 'public'::text CHECK (access_type = ANY (ARRAY['public'::text, 'invite'::text, 'password'::text])),
  password_hash text,
  current_time_seconds double precision DEFAULT 0,
  is_playing boolean DEFAULT false,
  is_active boolean DEFAULT true,
  max_participants integer DEFAULT 10,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval),
  scheduled_start_at timestamp with time zone,
  episode_title text,
  category text DEFAULT 'sub'::text CHECK (category = ANY (ARRAY['sub'::text, 'dub'::text])),
  manual_subtitle_url text,
  manual_stream_url text,
  manual_stream_type text DEFAULT 'direct'::text,
  selected_server text,
  share_stream_url text,
  share_stream_type text DEFAULT 'hls'::text,
  share_subtitle_url text,
  share_active boolean DEFAULT false,
  share_host_platform text,
  CONSTRAINT watch_rooms_pkey PRIMARY KEY (id),
  CONSTRAINT watch_rooms_host_id_fkey FOREIGN KEY (host_id) REFERENCES auth.users(id)
);
CREATE TABLE public.watch_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  session_id text NOT NULL,
  anime_id text NOT NULL,
  episode_id text NOT NULL,
  anime_name text,
  anime_poster text,
  genres ARRAY,
  start_time timestamp with time zone NOT NULL DEFAULT now(),
  end_time timestamp with time zone,
  watch_duration_seconds integer DEFAULT 0,
  ip_address inet,
  country text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  started_at timestamp with time zone DEFAULT now(),
  content_id text,
  completed boolean DEFAULT false,
  CONSTRAINT watch_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT watch_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.watchlist (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  anime_id text NOT NULL,
  anime_name text NOT NULL,
  anime_poster text,
  status text DEFAULT 'plan_to_watch'::text CHECK (status = ANY (ARRAY['watching'::text, 'completed'::text, 'plan_to_watch'::text, 'dropped'::text, 'on_hold'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  mal_id integer,
  anilist_id integer,
  CONSTRAINT watchlist_pkey PRIMARY KEY (id),
  CONSTRAINT watchlist_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);