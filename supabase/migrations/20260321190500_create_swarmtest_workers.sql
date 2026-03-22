create table if not exists public.swarmtest_workers (
  worker_id text primary key,
  status text not null default 'idle',
  current_run_id text,
  current_phase text,
  last_seen_at timestamptz not null default now(),
  last_job_claimed_at timestamptz,
  last_job_completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_swarmtest_workers_last_seen
  on public.swarmtest_workers(last_seen_at desc, updated_at desc);

create index if not exists idx_swarmtest_workers_status_last_seen
  on public.swarmtest_workers(status, last_seen_at desc);

create index if not exists idx_swarmtest_workers_metadata_gin
  on public.swarmtest_workers using gin(metadata);

create or replace function public.set_swarmtest_workers_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_swarmtest_workers_updated_at on public.swarmtest_workers;

create trigger trg_swarmtest_workers_updated_at
before update on public.swarmtest_workers
for each row execute function public.set_swarmtest_workers_updated_at();
