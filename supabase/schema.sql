-- Student Planner tables, namespaced with planner_ prefix to coexist
-- safely in a shared Supabase project (Deepak).
--
-- NOTE: this reflects the schema actually deployed in the Deepak project.
-- Re-running this against a fresh project will recreate the same shape.

create table if not exists planner_fixed_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  title text not null,
  subject text default 'School',
  start_minutes int not null,
  end_minutes int not null,
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
  google_event_id text,
  created_at timestamptz not null default now()
);

create table if not exists planner_personal_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  title text not null,
  category text default 'hobby',
  duration_minutes int default 60,
  weekly_quota_minutes int,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

alter table planner_fixed_events enable row level security;
alter table planner_flex_tasks enable row level security;
alter table planner_personal_tasks enable row level security;

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
