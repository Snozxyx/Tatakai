-- Canonical content persistence for TatakaiAPI snapshot-first architecture.
-- Stores durable response snapshots, source verification queue, and prebuilt manga home payloads.

create table if not exists public.api_canonical_snapshots (
  snapshot_key text primary key,
  scope text not null check (scope in ('anime', 'manga', 'hianime')),
  route_path text not null,
  query_string text not null default '',
  status_code integer not null default 200,
  projection jsonb not null default '{}'::jsonb,
  payload jsonb not null,
  response_headers jsonb not null default '{}'::jsonb,
  source_mode text not null default 'live',
  refreshed_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_api_canonical_snapshots_scope_route_refreshed
  on public.api_canonical_snapshots (scope, route_path, refreshed_at desc);

create index if not exists idx_api_canonical_snapshots_expires
  on public.api_canonical_snapshots (expires_at);

create table if not exists public.api_source_validation_queue (
  id bigserial primary key,
  source_hash text not null unique,
  source_url text not null,
  scope text not null check (scope in ('anime', 'manga', 'hianime')),
  provider text,
  anilist_id integer,
  mal_id integer,
  media_kind text not null default 'source' check (media_kind in ('source', 'subtitle', 'image')),
  status text not null default 'pending' check (status in ('pending', 'healthy', 'unhealthy')),
  fail_count integer not null default 0 check (fail_count >= 0),
  success_count integer not null default 0 check (success_count >= 0),
  discovered_at timestamptz not null default now(),
  last_checked_at timestamptz,
  next_check_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_http_status integer,
  last_error text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_api_source_validation_queue_due
  on public.api_source_validation_queue (status, next_check_at);

create index if not exists idx_api_source_validation_queue_provider
  on public.api_source_validation_queue (provider, scope);

create table if not exists public.api_manga_home_daily (
  day_key date not null,
  provider text not null,
  payload jsonb not null,
  projection jsonb not null default '{}'::jsonb,
  source_snapshot_key text,
  refreshed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (day_key, provider)
);

create index if not exists idx_api_manga_home_daily_refreshed
  on public.api_manga_home_daily (refreshed_at desc);

create table if not exists public.api_job_runs (
  id bigserial primary key,
  job_name text not null,
  run_token text not null unique,
  status text not null check (status in ('running', 'success', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  stats jsonb not null default '{}'::jsonb,
  error_message text
);

create index if not exists idx_api_job_runs_name_started
  on public.api_job_runs (job_name, started_at desc);
