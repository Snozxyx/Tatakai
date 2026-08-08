-- Add manga chapter/volume counts to content graph
alter table public.content_items
  add column if not exists chapters integer,
  add column if not exists volumes integer;

-- Unified mapping table keyed by tatakai_id
create table if not exists mappings.tatakai_id_map (
  tatakai_id uuid primary key,
  kind text not null check (kind in ('anime', 'manga')),
  anilist_id integer,
  mal_id integer,
  anidb_id integer,
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
  mangaupdates_id integer,
  mangadex_slug text,
  source_revision text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_map_tatakai_anilist on mappings.tatakai_id_map (anilist_id);
create index if not exists idx_map_tatakai_mal on mappings.tatakai_id_map (mal_id);
create index if not exists idx_map_tatakai_anidb on mappings.tatakai_id_map (anidb_id);
create index if not exists idx_map_tatakai_kitsu on mappings.tatakai_id_map (kitsu_id);
create index if not exists idx_map_tatakai_imdb on mappings.tatakai_id_map (imdb_id);
create index if not exists idx_map_tatakai_tvdb on mappings.tatakai_id_map (tvdb_id);

-- Backfill from existing mapping tables and tatakai links
insert into mappings.tatakai_id_map (
  tatakai_id,
  kind,
  anilist_id,
  mal_id,
  anidb_id,
  kitsu_id,
  anime_planet_id,
  anisearch_id,
  livechart_id,
  simkl_id,
  animecountdown_id,
  animenewsnetwork_id,
  imdb_id,
  themoviedb_id,
  tvdb_id,
  season_tmdb,
  season_tvdb,
  type,
  mangaupdates_id,
  mangadex_slug,
  source_revision,
  updated_at
)
select
  l.tatakai_id,
  l.kind,
  l.anilist_id,
  case when l.kind = 'anime' then a.mal_id else m.mal_id end as mal_id,
  a.anidb_id,
  case when l.kind = 'anime' then a.kitsu_id else m.kitsu_id end as kitsu_id,
  case when l.kind = 'anime' then a.anime_planet_id else m.anime_planet_id end as anime_planet_id,
  a.anisearch_id,
  a.livechart_id,
  a.simkl_id,
  a.animecountdown_id,
  a.animenewsnetwork_id,
  a.imdb_id,
  a.themoviedb_id,
  a.tvdb_id,
  a.season_tmdb, 
  a.season_tvdb,
  a.type,
  m.mangaupdates_id,
  m.mangadex_slug,
  coalesce(a.source_revision, m.source_revision) as source_revision,
  now()
from mappings.tatakai_id_link l
left join mappings.anime_id_map a on l.kind = 'anime' and a.anilist_id = l.anilist_id
left join mappings.manga_id_map m on l.kind = 'manga' and m.anilist_id = l.anilist_id
on conflict (tatakai_id) do update set
  kind = excluded.kind,
  anilist_id = excluded.anilist_id,
  mal_id = excluded.mal_id,
  anidb_id = excluded.anidb_id,
  kitsu_id = excluded.kitsu_id,
  anime_planet_id = excluded.anime_planet_id,
  anisearch_id = excluded.anisearch_id,
  livechart_id = excluded.livechart_id,
  simkl_id = excluded.simkl_id,
  animecountdown_id = excluded.animecountdown_id,
  animenewsnetwork_id = excluded.animenewsnetwork_id,
  imdb_id = excluded.imdb_id,
  themoviedb_id = excluded.themoviedb_id,
  tvdb_id = excluded.tvdb_id,
  season_tmdb = excluded.season_tmdb,
  season_tvdb = excluded.season_tvdb,
  type = excluded.type,
  mangaupdates_id = excluded.mangaupdates_id,
  mangadex_slug = excluded.mangadex_slug,
  source_revision = excluded.source_revision,
  updated_at = excluded.updated_at;
