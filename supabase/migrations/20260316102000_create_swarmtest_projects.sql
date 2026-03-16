create table if not exists public.swarmtest_projects (
  id bigserial primary key,
  owner_user_id text not null,
  owner_email text,
  brand_key text not null,
  brand_name text,
  target_url text,
  metadata jsonb not null default '{}'::jsonb,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint swarmtest_projects_owner_brand_key_unique unique (owner_user_id, brand_key)
);

create index if not exists idx_swarmtest_projects_owner_last_used
  on public.swarmtest_projects(owner_user_id, last_used_at desc, created_at desc);

create index if not exists idx_swarmtest_projects_owner_created
  on public.swarmtest_projects(owner_user_id, created_at desc);

create index if not exists idx_swarmtest_projects_metadata_gin
  on public.swarmtest_projects using gin(metadata);

create or replace function public.set_swarmtest_projects_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_swarmtest_projects_updated_at on public.swarmtest_projects;

create trigger trg_swarmtest_projects_updated_at
before update on public.swarmtest_projects
for each row execute function public.set_swarmtest_projects_updated_at();
