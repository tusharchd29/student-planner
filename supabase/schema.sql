-- Student Planner tables. Originally created in the shared Deepak project's
-- `public` schema (alongside unrelated Meraki client data and fitness
-- tracking tables) with a planner_ prefix for namespacing. Later moved into
-- their own `planner` Postgres schema for real isolation — see the
-- migration `move_planner_tables_to_own_schema`. This file still creates
-- them in `public` with the `planner_` prefix for a from-scratch setup;
-- if recreating against a fresh project, either leave them in `public`
-- (the prefix alone is enough there) or `create schema planner;` first and
-- adjust these `create table` statements to `planner.<name>`.
--
-- NOTE: this reflects the schema actually deployed in the Deepak project's
-- `planner` schema. Table names still carry the historical `planner_`
-- prefix even though the schema name now makes that partly redundant —
-- not worth a rename given the number of query strings across the app
-- that would need to change in lockstep.
--
-- Requires 'planner' to be added to Project Settings -> Data API ->
-- Exposed schemas in the Supabase dashboard, or PostgREST won't serve it.

create table if not exists planner_fixed_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  title text not null,
  subject text default 'School',
  start_minutes int not null,
  end_minutes int not null,
  -- Recurrence: if event_date is set, this is a one-off event on that date.
  -- Else if day_of_week is set (0=Sun..6=Sat, matching JS Date.getDay()),
  -- it recurs weekly on that day. If neither is set, treated as every day
  -- (legacy fallback for rows created before recurrence was implemented).
  day_of_week int,
  event_date date,
  google_event_id text,
  created_at timestamptz not null default now()
);

create table if not exists planner_flex_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  title text not null,
  duration_minutes int not null default 60,
  deadline date not null,
  done boolean not null default false,
  -- When the task was actually marked done — powers the weekly report's
  -- "what you completed this week".
  completed_at timestamptz,
  google_event_id text,
  created_at timestamptz not null default now()
);

-- Per-user preferences. Currently just timezone — replaces what used to be
-- a hardcoded Asia/Kolkata constant used for every date/day-of-week
-- calculation in the app, which silently gave every non-Indian user wrong
-- days (including tasks disappearing from view — see the earlier bug
-- writeup). Detected from the browser on first login; see resolveTimezone()
-- in app/dashboard/page.tsx.
create table if not exists planner_user_settings (
  user_id uuid primary key references auth.users default auth.uid(),
  timezone text not null default 'Asia/Kolkata',
  updated_at timestamptz not null default now()
);

alter table planner_user_settings enable row level security;

create policy "Users manage their own settings"
  on planner_user_settings for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table if not exists planner_weekly_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  week_start date not null,
  content text not null,
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create table if not exists planner_personal_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  title text not null,
  category text default 'hobby',
  duration_minutes int default 60,
  weekly_quota_minutes int,
  done boolean not null default false,
  -- Monday-anchored week key + minutes logged against it, so the weekly
  -- quota actually persists instead of resetting to full every day.
  week_start date,
  minutes_logged int not null default 0,
  -- Consecutive weeks the quota was actually met, and the best run ever.
  -- Rolled over by POST /api/tasks/roll-week when a new week starts.
  current_streak int not null default 0,
  longest_streak int not null default 0,
  created_at timestamptz not null default now()
);

alter table planner_fixed_events enable row level security;
alter table planner_flex_tasks enable row level security;
alter table planner_personal_tasks enable row level security;
alter table planner_weekly_reports enable row level security;

create policy "Users manage their own weekly reports"
  on planner_weekly_reports for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage their own fixed events"
  on planner_fixed_events for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage their own flex tasks"
  on planner_flex_tasks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage their own personal tasks"
  on planner_personal_tasks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Daily reports (mirrors planner_weekly_reports, but per-day). Added for
-- the "daily recap" feature — see /api/reports/daily.
create table if not exists planner_daily_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  report_date date not null,
  content text not null,
  created_at timestamptz not null default now(),
  unique (user_id, report_date)
);
alter table planner_daily_reports enable row level security;
create policy "Users manage their own daily reports"
  on planner_daily_reports for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Gamification: XP, level, and a daily "did you do anything today" streak.
-- Separate from planner_personal_tasks' own weekly-quota streak columns.
create table if not exists planner_user_stats (
  user_id uuid primary key references auth.users default auth.uid(),
  xp int not null default 0,
  level int not null default 1,
  current_daily_streak int not null default 0,
  longest_daily_streak int not null default 0,
  last_active_date date,
  updated_at timestamptz not null default now()
);
alter table planner_user_stats enable row level security;
create policy "Users manage their own stats"
  on planner_user_stats for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
