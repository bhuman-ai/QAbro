alter table if exists public.swarmtest_reports
add column if not exists request_meta jsonb not null default '{}'::jsonb;

create index if not exists idx_swarmtest_reports_request_meta_gin
  on public.swarmtest_reports using gin(request_meta);
