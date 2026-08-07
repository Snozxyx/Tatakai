-- Marketplace typed metadata upgrade (idempotent)
-- Adds first-class columns while keeping legacy data JSON compatibility.

alter table if exists public.marketplace_items
  add column if not exists language text,
  add column if not exists quality text,
  add column if not exists source text,
  add column if not exists codec text,
  add column if not exists audio text,
  add column if not exists subtitle_type text,
  add column if not exists episode_range text,
  add column if not exists release_group text,
  add column if not exists notes text,
  add column if not exists source_type text,
  add column if not exists stream_url text,
  add column if not exists external_url text,
  add column if not exists magnet_link text,
  add column if not exists torrent_file_url text;

-- Backfill typed columns from legacy JSON data (safe, idempotent).
update public.marketplace_items
set
  language = coalesce(language, nullif(data ->> 'lang', ''), nullif(data ->> 'language', '')),
  quality = coalesce(quality, nullif(data ->> 'quality', '')),
  source = coalesce(source, nullif(data ->> 'source', '')),
  codec = coalesce(codec, nullif(data ->> 'codec', '')),
  audio = coalesce(audio, nullif(data ->> 'audio', '')),
  subtitle_type = coalesce(subtitle_type, nullif(data ->> 'subtitleType', '')),
  episode_range = coalesce(episode_range, nullif(data ->> 'episodeRange', '')),
  release_group = coalesce(release_group, nullif(data ->> 'releaseGroup', '')),
  notes = coalesce(notes, nullif(data ->> 'notes', '')),
  source_type = coalesce(source_type, nullif(data ->> 'sourceType', '')),
  stream_url = coalesce(stream_url, nullif(data ->> 'stream_url', ''), nullif(data ->> 'url', '')),
  external_url = coalesce(external_url, nullif(data ->> 'external_url', '')),
  magnet_link = coalesce(magnet_link, nullif(data ->> 'magnet_link', '')),
  torrent_file_url = coalesce(torrent_file_url, nullif(data ->> 'torrent_file_url', ''))
where data is not null;

-- Ensure source_type is constrained if present.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'marketplace_items_source_type_check'
      and conrelid = 'public.marketplace_items'::regclass
  ) then
    alter table public.marketplace_items
      add constraint marketplace_items_source_type_check
      check (
        source_type is null
        or source_type in ('subtitle', 'server', 'magnet', 'torrent', 'external')
      );
  end if;
end $$;

-- Useful indexes for watch-page filtering and moderation review.
create index if not exists idx_marketplace_items_anime_episode
  on public.marketplace_items (anime_id, episode_number);

create index if not exists idx_marketplace_items_status_type
  on public.marketplace_items (status, type);

create index if not exists idx_marketplace_items_created_at
  on public.marketplace_items (created_at desc);

create index if not exists idx_marketplace_items_language
  on public.marketplace_items (language);

create index if not exists idx_marketplace_items_source_type
  on public.marketplace_items (source_type);

-- RLS enablement + baseline policies (idempotent).
alter table public.marketplace_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'marketplace_items'
      and policyname = 'marketplace_items_select_approved'
  ) then
    create policy marketplace_items_select_approved
      on public.marketplace_items
      for select
      using (
        status = 'approved'
        or auth.uid() = user_id
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'marketplace_items'
      and policyname = 'marketplace_items_insert_own'
  ) then
    create policy marketplace_items_insert_own
      on public.marketplace_items
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'marketplace_items'
      and policyname = 'marketplace_items_update_own_pending'
  ) then
    create policy marketplace_items_update_own_pending
      on public.marketplace_items
      for update
      to authenticated
      using (auth.uid() = user_id and status = 'pending')
      with check (auth.uid() = user_id and status = 'pending');
  end if;
end $$;

-- Rollback strategy:
-- This migration is additive. Existing payloads remain in `data`.
-- If needed, app can ignore new columns and continue reading legacy JSON.
