-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- ALREADY RAN THIS BEFORE? If your user_settings table already exists,
-- just run this one line to add the missing token column, then skip
-- straight to the bottom "canvas_token" policy line if needed:
-- alter table user_settings add column if not exists canvas_token text;

-- Table to store each user's assignments
create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  type text not null default 'hw',
  due integer not null default 1,
  total_mins integer not null default 60,
  done boolean not null default false,
  actual_mins integer,
  canvas_id text,
  created_at timestamptz default now()
);

-- Table to store each user's settings
create table if not exists user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sleep_start text default '22:30',
  sleep_end text default '07:00',
  eve_start text default '15:00',
  max_chunk integer default 60,
  dinner_time text default '18:00',
  dinner_dur integer default 30,
  shower_dur integer default 30,
  canvas_url text,
  canvas_token text,
  updated_at timestamptz default now()
);

-- Table to store each user's commitments (classes/activities)
create table if not exists commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  days text[] not null,
  start_time text not null,
  end_time text not null,
  type text not null default 'class',
  created_at timestamptz default now()
);

-- Table to store timing history for smart estimates
create table if not exists timing_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  assignment_key text not null,
  actual_mins integer not null,
  created_at timestamptz default now()
);

-- Enable Row Level Security on all tables
alter table assignments enable row level security;
alter table user_settings enable row level security;
alter table commitments enable row level security;
alter table timing_history enable row level security;

-- Policies: users can only see and edit their own data
create policy "users manage own assignments" on assignments for all using (auth.uid() = user_id);
create policy "users manage own settings" on user_settings for all using (auth.uid() = user_id);
create policy "users manage own commitments" on commitments for all using (auth.uid() = user_id);
create policy "users manage own history" on timing_history for all using (auth.uid() = user_id);
