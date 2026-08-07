-- V6 typed content graph (browsing + metadata). No scraper payloads.

create extension if not exists pg_trgm;

create table if not exists public.content_items (
  tatakai_id uuid primary key default gen_random_uuid(),
  anilist_id integer unique,
  mal_id integer,
  kitsu_id integer,
  title_romaji text not null,
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
  genres text[] not null default '{}',
  tags jsonb not null default '[]',
  source text,
  is_adult boolean not null default false,
  country_of_origin text,
  next_airing_episode jsonb,
  trailer_url text,
  synonyms text[] not null default '{}',
  relations jsonb,
  characters jsonb,
  staff jsonb,
  external_links jsonb,
  streaming_episodes jsonb,
  rankings jsonb,
  studios jsonb,
  last_synced_from text not null default 'anilist',
  sync_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_content_items_mal on public.content_items (mal_id);
create index if not exists idx_content_items_season on public.content_items (season, season_year);
create index if not exists idx_content_items_popularity on public.content_items (popularity desc nulls last);
create index if not exists idx_content_items_score on public.content_items (average_score desc nulls last);
create index if not exists idx_content_items_genres on public.content_items using gin (genres);

create table if not exists public.content_titles (
  id uuid primary key default gen_random_uuid(),
  tatakai_id uuid not null references public.content_items (tatakai_id) on delete cascade,
  title text not null,
  title_type text not null,
  language text,
  is_primary boolean not null default false,
  search_vector tsvector generated always as (to_tsvector('simple', coalesce(title, ''))) stored,
  created_at timestamptz not null default now()
);

create index if not exists idx_content_titles_tatakai on public.content_titles (tatakai_id);
create index if not exists idx_content_titles_search on public.content_titles using gin (search_vector);
create index if not exists idx_content_titles_trgm on public.content_titles using gin (title gin_trgm_ops);

create table if not exists public.episode_items (
  id uuid primary key default gen_random_uuid(),
  tatakai_id uuid not null references public.content_items (tatakai_id) on delete cascade,
  episode_number integer not null,
  episode_internal_id text not null,
  title text,
  description text,
  thumbnail_url text,
  airing_at timestamptz,
  duration integer,
  is_filler boolean not null default false,
  is_recap boolean not null default false,
  is_special boolean not null default false,
  anidb_eid integer,
  tvdb_eid integer,
  created_at timestamptz not null default now(),
  unique (tatakai_id, episode_number)
);

create index if not exists idx_episode_items_tatakai on public.episode_items (tatakai_id);

create table if not exists public.content_provider_mappings (
  id uuid primary key default gen_random_uuid(),
  tatakai_id uuid not null references public.content_items (tatakai_id) on delete cascade,
  provider_id text not null,
  external_id text not null,
  episode_mapping jsonb not null default '{}',
  confidence_score double precision not null default 1,
  created_at timestamptz not null default now(),
  unique (tatakai_id, provider_id)
);

create index if not exists idx_content_provider_mappings_tatakai on public.content_provider_mappings (tatakai_id);

create table if not exists public.content_overrides (
  id uuid primary key default gen_random_uuid(),
  tatakai_id uuid not null references public.content_items (tatakai_id) on delete cascade,
  field_path text not null,
  old_value jsonb,
  new_value jsonb not null,
  reason text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists idx_content_overrides_tatakai on public.content_overrides (tatakai_id);

alter table public.content_items enable row level security;
alter table public.content_titles enable row level security;
alter table public.episode_items enable row level security;
alter table public.content_provider_mappings enable row level security;
alter table public.content_overrides enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'content_items' and policyname = 'content_items_select_public') then
    create policy content_items_select_public on public.content_items for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'content_titles' and policyname = 'content_titles_select_public') then
    create policy content_titles_select_public on public.content_titles for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'episode_items' and policyname = 'episode_items_select_public') then
    create policy episode_items_select_public on public.episode_items for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'content_provider_mappings' and policyname = 'content_provider_mappings_select_public') then
    create policy content_provider_mappings_select_public on public.content_provider_mappings for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'content_overrides' and policyname = 'content_overrides_select_public') then
    create policy content_overrides_select_public on public.content_overrides for select to anon, authenticated using (true);
  end if;
end $$;
