create table if not exists public.swarmtest_waitlist (
  id bigserial primary key,
  email text not null,
  source text not null default 'website',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_swarmtest_waitlist_email_lower
  on public.swarmtest_waitlist(lower(email));

create index if not exists idx_swarmtest_waitlist_created_at
  on public.swarmtest_waitlist(created_at desc);

create index if not exists idx_swarmtest_waitlist_source_created_at
  on public.swarmtest_waitlist(source, created_at desc);

create index if not exists idx_swarmtest_waitlist_metadata_gin
  on public.swarmtest_waitlist using gin(metadata);

create or replace function public.set_swarmtest_waitlist_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_swarmtest_waitlist_updated_at on public.swarmtest_waitlist;

create trigger trg_swarmtest_waitlist_updated_at
before update on public.swarmtest_waitlist
for each row execute function public.set_swarmtest_waitlist_updated_at();
