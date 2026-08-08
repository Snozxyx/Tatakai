-- Extension Hub Persistance for Community Submissions
-- This table matches the ExtensionManifest interface in the frontend

create table if not exists public.extensions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null,
  version text not null,
  author text not null,
  type text not null check (type in ('torrent', 'onlinestream', 'custom', 'metadata')),
  icon text,
  banner text,
  screenshots text[] default '{}',
  categories text[] default '{}',
  permissions text[] default '{}',
  downloads integer default 0,
  rating double precision default 0,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'disabled')),
  isApproved boolean default false,
  user_id uuid references auth.users(id) on delete set null,
  manifest_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS
alter table public.extensions enable row level security;

-- Policies
create policy "Extensions are viewable by everyone" 
  on public.extensions for select 
  using (status = 'approved' or auth.uid() = user_id);

create policy "Authenticated users can submit extensions" 
  on public.extensions for insert 
  to authenticated 
  with check (auth.uid() = user_id);

create policy "Users can update their own pending extensions" 
  on public.extensions for update 
  to authenticated 
  using (auth.uid() = user_id and status = 'pending');

-- Admin policies (assuming there's an is_admin column in profiles or similar)
-- For now, let's allow all authenticated users to see their own, and admins to see all
-- We can refine this if an admin role system is in place.
