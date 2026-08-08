create schema if not exists relay;

create table if not exists relay.install_devices (
  device_id uuid primary key,
  user_id uuid references auth.users(id),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ua text,
  last_ip inet,
  revoked boolean not null default false
);

create table if not exists relay.peer_tickets (
  id bigserial primary key,
  device_id uuid not null references relay.install_devices(device_id) on delete cascade,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  scope text not null,
  jti text not null unique
);

create index if not exists idx_relay_peer_tickets_device on relay.peer_tickets (device_id, issued_at desc);

create table if not exists relay.swarm_rooms (
  room_key text primary key,
  tatakai_id text,
  episode text,
  quality text,
  member_count integer not null default 0,
  opened_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);

create table if not exists relay.relay_audit (
  id bigserial primary key,
  device_id uuid,
  event text not null,
  room_key text,
  ip inet,
  at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);

revoke all on schema relay from public;
revoke all on all tables in schema relay from anon, authenticated;