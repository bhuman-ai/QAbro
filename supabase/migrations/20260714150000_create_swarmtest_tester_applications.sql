create table if not exists public.swarmtest_tester_applications (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null unique,
  owner_email text not null,
  name text not null,
  country text not null,
  experience_level text not null,
  devices jsonb not null default '[]'::jsonb,
  availability text not null,
  can_record boolean not null default false,
  status text not null default 'applied',
  source text not null default 'tester_application',
  qualification_session_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint swarmtest_tester_applications_experience_check
    check (experience_level in ('new', 'some', 'professional')),
  constraint swarmtest_tester_applications_availability_check
    check (availability in ('weekdays', 'evenings_weekends', 'flexible')),
  constraint swarmtest_tester_applications_status_check
    check (status in ('applied', 'invited', 'qualified', 'approved', 'declined')),
  constraint swarmtest_tester_applications_devices_array_check
    check (jsonb_typeof(devices) = 'array')
);

create index if not exists idx_swarmtest_tester_applications_status_created
  on public.swarmtest_tester_applications(status, created_at desc);

create index if not exists idx_swarmtest_tester_applications_email
  on public.swarmtest_tester_applications(lower(owner_email));

create or replace function public.set_swarmtest_tester_applications_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_swarmtest_tester_applications_updated_at
  on public.swarmtest_tester_applications;

create trigger trg_swarmtest_tester_applications_updated_at
before update on public.swarmtest_tester_applications
for each row execute function public.set_swarmtest_tester_applications_updated_at();

alter table public.swarmtest_tester_applications enable row level security;

comment on table public.swarmtest_tester_applications is
  'Signed-in applications from people who want paid Before Users Do testing work.';
