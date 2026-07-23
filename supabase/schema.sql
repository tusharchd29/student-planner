-- Student Planner tables, namespaced with planner_ prefix to coexist
-- safely in a shared Supabase project.

create table if not exists planner_fixed_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  title text not null,
  start_time text not null,
  end_time text not null,
  created_at timestamptz not null default now()
);

create table if not exists planner_flex_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  title text not null,
  estimated_minutes int not null default 60,
  due_date date not null,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists planner_personal_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  title text not null,
  weekly_quota_minutes int not null default 60,
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
