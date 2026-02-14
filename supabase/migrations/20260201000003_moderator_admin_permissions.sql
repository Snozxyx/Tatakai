-- Add moderator and admin permissions

-- 1. Create broadcast_messages table if it doesn't exist
create table if not exists public.broadcast_messages (
  id uuid default gen_random_uuid() primary key,
  message text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamp with time zone,
  is_active boolean default true
);

-- 2. Enable RLS on broadcast_messages
alter table public.broadcast_messages enable row level security;

-- 3. RLS Policies for broadcast_messages

-- Everyone can read active messages
create policy "Everyone can read active broadcast messages"
  on public.broadcast_messages for select
  using (is_active = true and (expires_at is null or expires_at > now()));

-- Moderators and Admins can insert
create policy "Moderators and Admins can insert broadcast messages"
  on public.broadcast_messages for insert
  with check (
    exists (
      select 1 from public.profiles
      where profiles.user_id = auth.uid()
      and (profiles.is_moderator = true or profiles.is_admin = true)
    )
  );

-- Admins can delete
create policy "Admins can delete broadcast messages"
  on public.broadcast_messages for delete
  using (
    exists (
      select 1 from public.profiles
      where profiles.user_id = auth.uid()
      and profiles.is_admin = true
    )
  );

-- Moderators can update (soft delete) their own messages or if they are admin
create policy "Moderators can update broadcast messages"
  on public.broadcast_messages for update
  using (
    (created_by = auth.uid() and exists (
      select 1 from public.profiles
      where profiles.user_id = auth.uid()
      and profiles.is_moderator = true
    ))
    or
    exists (
      select 1 from public.profiles
      where profiles.user_id = auth.uid()
      and profiles.is_admin = true
    )
  );

-- 4. Fix profiles_banned_by_fkey
-- First drop the existing constraint
alter table public.profiles drop constraint if exists profiles_banned_by_fkey;

-- Recreate it with ON DELETE SET NULL and referencing auth.users correctly
alter table public.profiles
  add constraint profiles_banned_by_fkey
  foreign key (banned_by)
  references auth.users(id)
  on delete set null;

-- 5. Grant permissions to moderator role (conceptual, implemented via RLS/Policy usually, but here checking field updates)
-- We need a policy to allow moderators to update specific columns in profiles
-- Assuming there is an existing "update" policy for profiles, we might need to adjust it.
-- Let's add a specific policy for moderators to ban users.

create policy "Moderators can ban users"
  on public.profiles for update
  using (
    exists (
      select 1 from public.profiles
      where profiles.user_id = auth.uid()
      and (profiles.is_moderator = true or profiles.is_admin = true)
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.user_id = auth.uid()
      and (profiles.is_moderator = true or profiles.is_admin = true)
    )
  );

-- 6. Add camera/image search related columns if needed (none requested for DB, just UI)

-- 7. Ensure broadcast_messages permissions for service role (if using service role)
grant all on public.broadcast_messages to service_role;
grant select on public.broadcast_messages to anon, authenticated;
grant insert on public.broadcast_messages to authenticated; -- Restricted by RLS
