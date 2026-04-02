create table if not exists public.swarmtest_qa_schedules (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null,
  owner_email text not null,
  brand_key text not null,
  brand_name text,
  target_url text not null,
  name text not null,
  active boolean not null default true,
  frequency_hours integer not null default 24,
  scope_mode text not null default 'deep_45m',
  persona text not null,
  mission text not null,
  alert_webhook_url text,
  alert_on_partial boolean not null default true,
  alert_on_failed boolean not null default true,
  alert_on_high_findings boolean not null default true,
  last_run_id text,
  last_run_at timestamptz,
  last_report_status text,
  last_alert_at timestamptz,
  next_run_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_swarmtest_qa_schedules_owner_brand_unique
  on public.swarmtest_qa_schedules(owner_user_id, brand_key);

create index if not exists idx_swarmtest_qa_schedules_owner_next_run
  on public.swarmtest_qa_schedules(owner_user_id, next_run_at);

create index if not exists idx_swarmtest_qa_schedules_active_next_run
  on public.swarmtest_qa_schedules(active, next_run_at);

create table if not exists public.swarmtest_qa_alerts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null,
  owner_email text not null,
  schedule_id uuid references public.swarmtest_qa_schedules(id) on delete cascade,
  run_id text not null,
  brand_key text not null,
  severity text not null default 'high',
  status text not null default 'open',
  title text not null,
  message text not null,
  report_url text,
  ui_report_url text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_swarmtest_qa_alerts_schedule_run_unique
  on public.swarmtest_qa_alerts(schedule_id, run_id);

create index if not exists idx_swarmtest_qa_alerts_owner_status_created
  on public.swarmtest_qa_alerts(owner_user_id, status, created_at desc);

create index if not exists idx_swarmtest_qa_alerts_brand_created
  on public.swarmtest_qa_alerts(brand_key, created_at desc);
