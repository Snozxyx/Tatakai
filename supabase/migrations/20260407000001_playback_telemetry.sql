create table if not exists public.playback_telemetry (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_type text not null,
  anime_id text,
  episode_id text,
  category text,
  server_name text,
  ok boolean,
  latency_ms integer,
  user_id uuid,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_playback_telemetry_created_at on public.playback_telemetry(created_at desc);
create index if not exists idx_playback_telemetry_event_type on public.playback_telemetry(event_type);
create index if not exists idx_playback_telemetry_anime_episode on public.playback_telemetry(anime_id, episode_id);
create index if not exists idx_playback_telemetry_user on public.playback_telemetry(user_id);

alter table public.playback_telemetry enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'playback_telemetry'
      and policyname = 'Users insert own playback telemetry'
  ) then
    create policy "Users insert own playback telemetry"
      on public.playback_telemetry
      for insert
      to authenticated, anon
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'playback_telemetry'
      and policyname = 'Users read own playback telemetry'
  ) then
    create policy "Users read own playback telemetry"
      on public.playback_telemetry
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;
