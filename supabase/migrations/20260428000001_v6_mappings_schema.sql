create schema if not exists mappings;

create table if not exists mappings.anime_id_map (
  anidb_id integer primary key,
  anilist_id integer,
  mal_id integer,
  kitsu_id integer,
  anime_planet_id text,
  anisearch_id integer,
  livechart_id integer,
  simkl_id integer,
  animecountdown_id integer,
  animenewsnetwork_id integer,
  imdb_id text,
  themoviedb_id integer,
  tvdb_id integer,
  season_tmdb integer,
  season_tvdb integer,
  type text,
  source_revision text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_map_anime_anilist on mappings.anime_id_map (anilist_id);
create index if not exists idx_map_anime_mal on mappings.anime_id_map (mal_id);
create index if not exists idx_map_anime_kitsu on mappings.anime_id_map (kitsu_id);
create index if not exists idx_map_anime_imdb on mappings.anime_id_map (imdb_id);
create index if not exists idx_map_anime_tvdb on mappings.anime_id_map (tvdb_id);

create table if not exists mappings.manga_id_map (
  anilist_id integer primary key,
  mal_id integer,
  kitsu_id integer,
  anime_planet_id text,
  mangaupdates_id integer,
  mangadex_slug text,
  source_revision text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_map_manga_mal on mappings.manga_id_map (mal_id);
create index if not exists idx_map_manga_kitsu on mappings.manga_id_map (kitsu_id);

create table if not exists mappings.tatakai_id_link (
  tatakai_id uuid primary key,
  anilist_id integer not null,
  kind text not null check (kind in ('anime', 'manga'))
);

create index if not exists idx_map_tatakai_link_anilist on mappings.tatakai_id_link (anilist_id, kind);

create table if not exists mappings.ingest_runs (
  id bigserial primary key,
  source text not null,
  ran_at timestamptz not null default now(),
  items_total integer not null default 0,
  items_changed integer not null default 0,
  payload_sha text
);