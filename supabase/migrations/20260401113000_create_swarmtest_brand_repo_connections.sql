create table if not exists public.swarmtest_brand_repo_connections (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null,
  owner_email text,
  brand_key text not null,
  provider text not null default 'github',
  connection_status text not null default 'pending_install',
  installation_id bigint,
  installation_account_login text,
  installation_account_type text,
  installation_target_type text,
  installation_target_id bigint,
  selected_repo_id bigint,
  selected_repo_owner text,
  selected_repo_name text,
  selected_repo_full_name text,
  default_branch text,
  path_allowlist jsonb not null default '[]'::jsonb,
  pending_state_token text,
  pending_state_expires_at timestamptz,
  connection jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint swarmtest_brand_repo_connections_owner_brand_provider_unique unique (owner_user_id, brand_key, provider)
);

create index if not exists idx_swarmtest_brand_repo_connections_owner
  on public.swarmtest_brand_repo_connections(owner_user_id, updated_at desc);

create index if not exists idx_swarmtest_brand_repo_connections_brand
  on public.swarmtest_brand_repo_connections(brand_key, updated_at desc);

create unique index if not exists idx_swarmtest_brand_repo_connections_pending_state
  on public.swarmtest_brand_repo_connections(pending_state_token)
  where pending_state_token is not null;

create index if not exists idx_swarmtest_brand_repo_connections_path_allowlist_gin
  on public.swarmtest_brand_repo_connections using gin(path_allowlist);

create index if not exists idx_swarmtest_brand_repo_connections_connection_gin
  on public.swarmtest_brand_repo_connections using gin(connection);

create or replace function public.set_swarmtest_brand_repo_connections_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_swarmtest_brand_repo_connections_updated_at on public.swarmtest_brand_repo_connections;

create trigger trg_swarmtest_brand_repo_connections_updated_at
before update on public.swarmtest_brand_repo_connections
for each row execute function public.set_swarmtest_brand_repo_connections_updated_at();
