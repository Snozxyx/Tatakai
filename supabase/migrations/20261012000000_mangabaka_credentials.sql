-- =============================================================================
-- MangaBaka tracker credentials (OAuth2 + OpenID Connect, server-side sync).
--
-- MangaBaka is an OpenID Connect provider
-- (https://mangabaka.org/.well-known/openid-configuration):
--   authorization: https://mangabaka.org/auth/oauth2/authorize
--   token:         https://mangabaka.org/auth/oauth2/token
--   userinfo:      https://mangabaka.org/auth/oauth2/userinfo
-- Scopes used: openid profile library.read library.write offline_access.
--
-- The access/refresh tokens are bearer secrets: anyone holding them can read
-- and write the user's MangaBaka library. They MUST NOT live on `profiles`:
-- that table is SELECT-visible to everyone ("Profiles are viewable by
-- everyone", 20251231031018:568), which already over-exposes the MAL/AniList
-- tokens and must not be repeated for a new secret. Instead this dedicated
-- table holds the tokens with Row Level Security enabled and NO policy for
-- `authenticated`/`anon` — reads and writes go only through TatakaiAPI, whose
-- service_role client bypasses RLS. The UI learns only `{ connected,
-- username, avatar }` from `GET /api/v3/sync/mangabaka/status`, never the
-- tokens themselves.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.mangabaka_credentials (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text,
  token_expires_at timestamptz,
  mangabaka_user_id text,
  mangabaka_username text,
  connected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mangabaka_credentials ENABLE ROW LEVEL SECURITY;

-- Deliberately no CREATE POLICY for authenticated/anon: with RLS enabled and
-- no policy, every direct PostgREST read/write is denied. All access is via
-- the service_role client in TatakaiAPI (bypasses RLS), same as the OAuth
-- token writes on profiles.
GRANT ALL ON public.mangabaka_credentials TO service_role;

COMMENT ON TABLE public.mangabaka_credentials IS
  'MangaBaka OAuth2 tokens for server-side library sync. Bearer secrets — service_role only, never SELECT-able by clients. UI reads connection state via the sync API, not this table.';
