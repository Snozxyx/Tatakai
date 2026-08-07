-- Pre-computed feeds + aggregated scores

create table if not exists public.content_feeds (
  id uuid primary key default gen_random_uuid(),
  feed_type text not null,
  season text,
  season_year integer,
  items jsonb not null,
  computed_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (feed_type, season, season_year)
);

create index if not exists idx_content_feeds_type on public.content_feeds (feed_type, computed_at desc);

alter table public.content_feeds enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'content_feeds' and policyname = 'content_feeds_select_public') then
    create policy content_feeds_select_public on public.content_feeds for select to anon, authenticated using (true);
  end if;
end $$;

create table if not exists public.content_scores (
  tatakai_id uuid primary key references public.content_items (tatakai_id) on delete cascade,
  anilist_score double precision,
  mal_score double precision,
  kitsu_score double precision,
  tatakai_user_score double precision,
  score_count integer not null default 0,
  weighted_score double precision generated always as (
    (
      coalesce(anilist_score, 0) * 0.4
      + coalesce(mal_score, 0) * 0.3
      + coalesce(kitsu_score, 0) * 0.2
      + coalesce(tatakai_user_score, 0) * 0.1
    )
    / nullif(
      (case when anilist_score is not null then 0.4 else 0 end
       + case when mal_score is not null then 0.3 else 0 end
       + case when kitsu_score is not null then 0.2 else 0 end
       + case when tatakai_user_score is not null then 0.1 else 0 end),
      0
    )
  ) stored,
  updated_at timestamptz not null default now()
);

alter table public.content_scores enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'content_scores' and policyname = 'content_scores_select_public') then
    create policy content_scores_select_public on public.content_scores for select to anon, authenticated using (true);
  end if;
end $$;
