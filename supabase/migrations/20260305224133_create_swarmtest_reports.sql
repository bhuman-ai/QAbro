create table if not exists public.swarmtest_reports (
  id bigserial primary key,
  run_id text not null unique,
  target text,
  status text not null default 'queued',
  report_url text,
  findings jsonb not null default '[]'::jsonb,
  summary text,
  source text,
  delivered_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_swarmtest_reports_status_delivered
  on public.swarmtest_reports(status, delivered_at desc);

create index if not exists idx_swarmtest_reports_delivered
  on public.swarmtest_reports(delivered_at desc);

create index if not exists idx_swarmtest_reports_payload_gin
  on public.swarmtest_reports using gin(payload);

create or replace function public.set_swarmtest_reports_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_swarmtest_reports_updated_at on public.swarmtest_reports;

create trigger trg_swarmtest_reports_updated_at
before update on public.swarmtest_reports
for each row execute function public.set_swarmtest_reports_updated_at();
