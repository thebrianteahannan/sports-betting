-- Parlay of the Day — run once in the new project's SQL editor.
-- Creates kv + chat tables and grants the service_role key access.

create table if not exists public.kv (
  k text primary key,
  v jsonb not null default '{}'::jsonb
);

create table if not exists public.chat_rooms (
  id text primary key,
  name text not null default '',
  members text[] not null,
  pair text unique,
  made_by text not null,
  at timestamptz not null default now(),
  last_at timestamptz not null default now()
);
create index if not exists chat_rooms_members on public.chat_rooms using gin (members);

create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  room text not null references public.chat_rooms(id) on delete cascade,
  from_id text not null,
  from_name text not null default '',
  at timestamptz not null default now(),
  body text not null default '',
  bet jsonb,
  reply bigint,
  gone boolean not null default false
);
create index if not exists chat_messages_room on public.chat_messages (room, id);

create table if not exists public.chat_reacts (
  message bigint not null references public.chat_messages(id) on delete cascade,
  room text not null,
  user_id text not null,
  emoji text not null,
  primary key (message, user_id)
);
create index if not exists chat_reacts_room on public.chat_reacts (room, message);

create table if not exists public.chat_reads (
  room text not null references public.chat_rooms(id) on delete cascade,
  user_id text not null,
  last bigint not null default 0,
  primary key (room, user_id)
);

alter table public.kv enable row level security;
alter table public.chat_rooms enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_reacts enable row level security;
alter table public.chat_reads enable row level security;

grant usage on schema public to service_role;
grant all on table public.kv to service_role;
grant all on table public.chat_rooms to service_role;
grant all on table public.chat_messages to service_role;
grant all on table public.chat_reacts to service_role;
grant all on table public.chat_reads to service_role;
grant all on all sequences in schema public to service_role;
