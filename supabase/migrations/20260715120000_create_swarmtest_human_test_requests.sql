create table if not exists public.swarmtest_human_test_requests (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null,
  owner_email text not null,
  product_name text not null,
  target_url text not null,
  review_type text not null,
  test_focus text not null,
  expected_success text,
  duration_minutes integer not null default 30,
  access_mode text not null default 'public_only',
  access_details jsonb not null default '{}'::jsonb,
  private_access jsonb,
  context jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  assigned_tester_application_id uuid,
  assigned_tester_name text,
  assigned_tester_email text,
  trial_session_id text,
  source text not null default 'mcp_human_test',
  request_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint swarmtest_human_test_requests_review_type_check
    check (review_type in ('specific_flow', 'general_first_time_user')),
  constraint swarmtest_human_test_requests_access_mode_check
    check (access_mode in ('public_only', 'signup_allowed', 'test_account')),
  constraint swarmtest_human_test_requests_status_check
    check (status in ('queued', 'assigned', 'in_progress', 'submitted', 'completed', 'cancelled')),
  constraint swarmtest_human_test_requests_duration_check
    check (duration_minutes between 10 and 60),
  constraint swarmtest_human_test_requests_access_details_object_check
    check (jsonb_typeof(access_details) = 'object'),
  constraint swarmtest_human_test_requests_context_object_check
    check (jsonb_typeof(context) = 'object')
);

create index if not exists idx_swarmtest_human_test_requests_status_created
  on public.swarmtest_human_test_requests(status, created_at desc);

create index if not exists idx_swarmtest_human_test_requests_owner_created
  on public.swarmtest_human_test_requests(owner_user_id, created_at desc);

create unique index if not exists idx_swarmtest_human_test_requests_owner_key
  on public.swarmtest_human_test_requests(owner_user_id, request_key)
  where request_key is not null;

create or replace function public.set_swarmtest_human_test_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_swarmtest_human_test_requests_updated_at
  on public.swarmtest_human_test_requests;

create trigger trg_swarmtest_human_test_requests_updated_at
before update on public.swarmtest_human_test_requests
for each row execute function public.set_swarmtest_human_test_requests_updated_at();

alter table public.swarmtest_human_test_requests enable row level security;

comment on table public.swarmtest_human_test_requests is
  'Human QA requests created by Before Users Do MCP clients and assigned by BUD operators.';
