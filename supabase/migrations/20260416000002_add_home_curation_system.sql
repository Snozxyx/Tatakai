-- Home curation system for anime + manga surfaces.

create or replace function public.is_curator_role(target_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = target_user
      and (
        lower(coalesce(p.role, 'user')) in ('admin', 'moderator', 'curator')
        or coalesce(p.is_admin, false) = true
      )
  );
$$;

grant execute on function public.is_curator_role(uuid) to authenticated;

create table if not exists public.curated_home_sections (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('anime', 'manga')),
  mode text not null default 'query' check (mode in ('trending', 'genre', 'query', 'provider', 'media_type')),
  title text not null,
  description text,
  query text,
  genre text,
  provider text,
  media_type text,
  max_items integer not null default 12 check (max_items >= 1 and max_items <= 48),
  position integer not null default 100,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_curated_home_sections_scope_position
  on public.curated_home_sections(scope, position, created_at desc);

create index if not exists idx_curated_home_sections_active
  on public.curated_home_sections(is_active);

create or replace function public.set_curated_home_sections_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists trg_curated_home_sections_updated_at on public.curated_home_sections;
create trigger trg_curated_home_sections_updated_at
before update on public.curated_home_sections
for each row execute function public.set_curated_home_sections_updated_at();

alter table public.curated_home_sections enable row level security;

drop policy if exists "Public can read active curated home sections" on public.curated_home_sections;
create policy "Public can read active curated home sections"
  on public.curated_home_sections
  for select
  using (
    is_active = true
    or public.is_curator_role(auth.uid())
  );

drop policy if exists "Curators can create curated home sections" on public.curated_home_sections;
create policy "Curators can create curated home sections"
  on public.curated_home_sections
  for insert
  with check (
    public.is_curator_role(auth.uid())
    and (created_by is null or created_by = auth.uid())
  );

drop policy if exists "Curators can update curated home sections" on public.curated_home_sections;
create policy "Curators can update curated home sections"
  on public.curated_home_sections
  for update
  using (public.is_curator_role(auth.uid()))
  with check (public.is_curator_role(auth.uid()));

drop policy if exists "Curators can delete curated home sections" on public.curated_home_sections;
create policy "Curators can delete curated home sections"
  on public.curated_home_sections
  for delete
  using (public.is_curator_role(auth.uid()));

grant select on public.curated_home_sections to anon, authenticated;
grant insert, update, delete on public.curated_home_sections to authenticated;
grant all on public.curated_home_sections to service_role;
