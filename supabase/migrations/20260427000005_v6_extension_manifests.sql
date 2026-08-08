-- Extension Hub manifests (server stores + signs; execution is client-side)

create table if not exists public.extension_manifests (
  id uuid primary key default gen_random_uuid(),
  extension_id text unique not null,
  name text not null,
  version text not null,
  type text not null check (type in ('torrent', 'onlinestream', 'custom', 'metadata')),
  main_url text not null,
  update_url text,
  description text,
  speed text check (speed in ('fast', 'moderate', 'slow')),
  accuracy text check (accuracy in ('high', 'medium', 'low')),
  regions text[],
  nsfw boolean not null default false,
  permissions text[] not null default '{}',
  signature text,
  signed_by text,
  submission_status text not null default 'pending'
    check (submission_status in ('pending', 'under_review', 'approved', 'rejected', 'disabled')),
  submitted_by uuid references auth.users (id),
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  is_killed boolean not null default false,
  killed_at timestamptz,
  kill_reason text,
  install_count integer not null default 0,
  health_score double precision not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_extension_manifests_status on public.extension_manifests (submission_status, is_killed);

create table if not exists public.extension_audit_logs (
  id uuid primary key default gen_random_uuid(),
  extension_id text references public.extension_manifests (extension_id),
  event_type text not null,
  performed_by uuid references auth.users (id),
  performed_at timestamptz not null default now(),
  details jsonb,
  ip_address inet,
  user_agent text
);

create table if not exists public.user_extensions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  extension_id text not null references public.extension_manifests (extension_id),
  is_enabled boolean not null default true,
  installed_at timestamptz not null default now(),
  last_used_at timestamptz,
  use_count integer not null default 0,
  user_settings jsonb not null default '{}',
  unique (user_id, extension_id)
);

alter table public.extension_manifests enable row level security;
alter table public.extension_audit_logs enable row level security;
alter table public.user_extensions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'extension_manifests' and policyname = 'extension_manifests_select_public') then
    create policy extension_manifests_select_public
      on public.extension_manifests
      for select
      to anon, authenticated
      using (submission_status = 'approved' and is_killed = false);
  end if;
end $$;
