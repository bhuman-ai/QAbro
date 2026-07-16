alter table public.swarmtest_human_test_requests
  add column if not exists private_benchmark jsonb not null default '[]'::jsonb,
  add column if not exists published_at timestamptz,
  add column if not exists claimed_at timestamptz;

alter table public.swarmtest_human_test_requests
  drop constraint if exists swarmtest_human_test_requests_status_check;

alter table public.swarmtest_human_test_requests
  add constraint swarmtest_human_test_requests_status_check
    check (status in ('queued', 'available', 'assigned', 'in_progress', 'submitted', 'completed', 'cancelled'));

alter table public.swarmtest_human_test_requests
  drop constraint if exists swarmtest_human_test_requests_private_benchmark_array_check;

alter table public.swarmtest_human_test_requests
  add constraint swarmtest_human_test_requests_private_benchmark_array_check
    check (jsonb_typeof(private_benchmark) = 'array');

create index if not exists idx_swarmtest_human_test_requests_available
  on public.swarmtest_human_test_requests(published_at desc)
  where status = 'available';

create unique index if not exists idx_swarmtest_human_test_requests_one_active_tester
  on public.swarmtest_human_test_requests(assigned_tester_application_id)
  where assigned_tester_application_id is not null
    and status in ('assigned', 'in_progress', 'submitted');

comment on column public.swarmtest_human_test_requests.private_benchmark is
  'Private review points prepared by BUD before a qualification job is visible to testers.';
