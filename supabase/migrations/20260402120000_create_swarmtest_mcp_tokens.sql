create table if not exists public.swarmtest_mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null,
  owner_email text not null,
  name text not null,
  token_hash text not null unique,
  token_prefix text not null,
  metadata jsonb not null default '{}'::jsonb,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_swarmtest_mcp_tokens_owner_created
  on public.swarmtest_mcp_tokens(owner_user_id, created_at desc);

create index if not exists idx_swarmtest_mcp_tokens_owner_active
  on public.swarmtest_mcp_tokens(owner_user_id, revoked_at, created_at desc);

create index if not exists idx_swarmtest_mcp_tokens_hash_active
  on public.swarmtest_mcp_tokens(token_hash, revoked_at);

create or replace function public.set_swarmtest_mcp_tokens_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_swarmtest_mcp_tokens_updated_at on public.swarmtest_mcp_tokens;

create trigger trg_swarmtest_mcp_tokens_updated_at
before update on public.swarmtest_mcp_tokens
for each row execute function public.set_swarmtest_mcp_tokens_updated_at();
