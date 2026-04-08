-- Recommendation feedback for explainability controls
create table if not exists public.recommendation_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  anime_id text not null,
  feedback text not null check (feedback in ('like', 'dislike', 'already_seen')),
  recommendation_score integer,
  reasons_snapshot jsonb not null default '[]'::jsonb,
  factors_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, anime_id)
);

alter table public.recommendation_feedback enable row level security;

create policy "Users can view own recommendation feedback"
on public.recommendation_feedback
for select
using (auth.uid() = user_id);

create policy "Users can insert own recommendation feedback"
on public.recommendation_feedback
for insert
with check (auth.uid() = user_id);

create policy "Users can update own recommendation feedback"
on public.recommendation_feedback
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.set_recommendation_feedback_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists recommendation_feedback_updated_at
on public.recommendation_feedback;

create trigger recommendation_feedback_updated_at
before update on public.recommendation_feedback
for each row
execute function public.set_recommendation_feedback_updated_at();

create index if not exists idx_recommendation_feedback_user_id
on public.recommendation_feedback (user_id);
