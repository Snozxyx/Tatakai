-- Provider / extension health from client telemetry (not server scraping)

create table if not exists public.provider_health_states (
  provider_id text primary key,
  provider_name text not null,
  provider_type text not null,
  status text not null default 'unknown' check (status in ('healthy', 'degraded', 'unhealthy', 'unknown')),
  last_check_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  consecutive_failures integer not null default 0,
  consecutive_successes integer not null default 0,
  avg_response_time_ms double precision,
  p95_response_time_ms double precision,
  error_rate_24h double precision,
  circuit_state text not null default 'closed' check (circuit_state in ('closed', 'open', 'half_open')),
  circuit_opened_at timestamptz,
  circuit_failure_threshold integer not null default 5,
  circuit_recovery_timeout_ms integer not null default 60000,
  base_url text,
  regions text[],
  supports_dub text[],
  max_resolution text,
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.provider_incidents (
  id uuid primary key default gen_random_uuid(),
  provider_id text references public.provider_health_states (provider_id),
  incident_type text not null,
  started_at timestamptz not null default now(),
  resolved_at timestamptz,
  severity text not null default 'medium',
  description text,
  error_samples jsonb,
  affected_routes text[],
  resolved_by uuid references auth.users (id),
  resolution_notes text
);

create index if not exists idx_provider_incidents_provider on public.provider_incidents (provider_id, started_at desc);

alter table public.provider_health_states enable row level security;
alter table public.provider_incidents enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'provider_health_states' and policyname = 'provider_health_select_public') then
    create policy provider_health_select_public on public.provider_health_states for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'provider_incidents' and policyname = 'provider_incidents_select_public') then
    create policy provider_incidents_select_public on public.provider_incidents for select to anon, authenticated using (true);
  end if;
end $$;
