-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- 1. Ghost snapshots table
create table ghost_snapshots (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references auth.users not null,
  run_id uuid not null,
  wins int not null,
  losses int not null,
  stage int not null,
  roster jsonb not null,
  team_size int not null,
  nickname text,
  created_at timestamptz default now()
);

create index idx_ghost_matchmaking on ghost_snapshots (wins, losses);

-- Migration for existing instances (run in Supabase SQL Editor if the table already exists):
-- alter table ghost_snapshots add column if not exists nickname text;

-- 2. Hall of fame table
create table hall_of_fame (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references auth.users not null,
  run_id uuid unique not null,
  nickname text,
  roster jsonb not null,
  wins int not null,
  losses int not null,
  created_at timestamptz default now()
);

-- 3. Enable RLS
alter table ghost_snapshots enable row level security;
alter table hall_of_fame enable row level security;

-- 4. RLS policies: anyone can read, authenticated users insert own rows
create policy "Anyone can read ghost snapshots"
  on ghost_snapshots for select
  using (true);

create policy "Users can insert own ghost snapshots"
  on ghost_snapshots for insert
  with check (auth.uid() = player_id);

create policy "Anyone can read hall of fame"
  on hall_of_fame for select
  using (true);

create policy "Users can insert own hall of fame entries"
  on hall_of_fame for insert
  with check (auth.uid() = player_id);

-- player_progress: achievements + lifetime stats mirror
create table player_progress (
  player_id  uuid primary key references auth.users(id),
  unlocked   jsonb not null default '{}'::jsonb,
  stats      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table player_progress enable row level security;

create policy "Users can read own progress"
  on player_progress for select
  using (auth.uid() = player_id);

create policy "Users can upsert own progress"
  on player_progress for insert
  with check (auth.uid() = player_id);

create policy "Users can update own progress"
  on player_progress for update
  using (auth.uid() = player_id);
