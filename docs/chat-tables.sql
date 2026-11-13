-- Chat tables for Parlay of the Day. Run once in the Supabase SQL editor.
-- The site talks to these with the service role key, so row level security stays on with no public policies.

create table if not exists chat_rooms (
  id text primary key,
  name text not null default '',
  members text[] not null,
  pair text unique,
  made_by text not null,
  at timestamptz not null default now(),
  last_at timestamptz not null default now()
);
create index if not exists chat_rooms_members on chat_rooms using gin (members);

create table if not exists chat_messages (
  id bigint generated always as identity primary key,
  room text not null references chat_rooms(id) on delete cascade,
  from_id text not null,
  from_name text not null default '',
  at timestamptz not null default now(),
  body text not null default '',
  bet jsonb,
  reply bigint,
  gone boolean not null default false
);
create index if not exists chat_messages_room on chat_messages (room, id);

create table if not exists chat_reacts (
  message bigint not null references chat_messages(id) on delete cascade,
  room text not null,
  user_id text not null,
  emoji text not null,
  primary key (message, user_id)
);
create index if not exists chat_reacts_room on chat_reacts (room, message);

create table if not exists chat_reads (
  room text not null references chat_rooms(id) on delete cascade,
  user_id text not null,
  last bigint not null default 0,
  primary key (room, user_id)
);

alter table chat_rooms enable row level security;
alter table chat_messages enable row level security;
alter table chat_reacts enable row level security;
alter table chat_reads enable row level security;
