-- Enable admin review updates for extension submissions and .kai upload bucket.

-- ---------------------------------------------------------------------------
-- 1) Admin review policy for extensions table (legacy publish flow)
-- ---------------------------------------------------------------------------
alter table if exists public.extensions enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'extensions'
      and policyname = 'extensions_admin_review_update'
  ) then
    create policy extensions_admin_review_update
      on public.extensions
      for update
      to authenticated
      using (
        exists (
          select 1
          from public.profiles p
          where p.user_id = auth.uid()
            and p.is_admin = true
        )
      )
      with check (
        exists (
          select 1
          from public.profiles p
          where p.user_id = auth.uid()
            and p.is_admin = true
        )
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Admin review policy for v6 extension_manifests table
-- ---------------------------------------------------------------------------
alter table if exists public.extension_manifests enable row level security;

do $$
begin
  if to_regclass('public.extension_manifests') is not null then
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'extension_manifests'
        and policyname = 'extension_manifests_admin_review_update'
    ) then
      create policy extension_manifests_admin_review_update
        on public.extension_manifests
        for update
        to authenticated
        using (
          exists (
            select 1
            from public.profiles p
            where p.user_id = auth.uid()
              and p.is_admin = true
          )
        )
        with check (
          exists (
            select 1
            from public.profiles p
            where p.user_id = auth.uid()
              and p.is_admin = true
          )
        );
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3) Storage bucket for .kai uploads
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('extension-files', 'extension-files', true)
on conflict (id) do nothing;

-- Authenticated users can upload only into their own folder namespace:
-- submissions/<uid>/...
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'extension_files_insert_own_folder'
  ) then
    create policy extension_files_insert_own_folder
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'extension-files'
        and name like 'submissions/' || auth.uid()::text || '/%'
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'extension_files_select_public'
  ) then
    create policy extension_files_select_public
      on storage.objects
      for select
      using (bucket_id = 'extension-files');
  end if;
end $$;

