-- Drop legacy canonical snapshot store. Re-ingest catalog via apps/api-v3 jobs (AniList).

drop table if exists public.api_canonical_snapshots cascade;
