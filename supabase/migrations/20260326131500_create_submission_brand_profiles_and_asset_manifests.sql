create table if not exists public.submission_brand_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null,
  owner_email text,
  brand_profile_id text not null,
  brand_key text,
  track text not null default 'custom',
  display_name text not null,
  legal_name text,
  website_url text,
  profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, brand_profile_id)
);

create index if not exists idx_submission_brand_profiles_owner
  on public.submission_brand_profiles(owner_user_id, updated_at desc);

create index if not exists idx_submission_brand_profiles_brand_key
  on public.submission_brand_profiles(brand_key, updated_at desc);

create index if not exists idx_submission_brand_profiles_profile_gin
  on public.submission_brand_profiles using gin(profile);

create table if not exists public.submission_asset_manifests (
  id uuid primary key default gen_random_uuid(),
  manifest_id text not null unique,
  owner_user_id text not null,
  owner_email text,
  brand_profile_id text not null,
  version integer not null default 1,
  status text not null default 'pending_approval',
  brand_key text,
  track text not null default 'custom',
  source_job_id text,
  manifest jsonb not null default '{}'::jsonb,
  approval jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, brand_profile_id, version)
);

create unique index if not exists idx_submission_asset_manifests_active
  on public.submission_asset_manifests(owner_user_id, brand_profile_id)
  where is_active = true;

create index if not exists idx_submission_asset_manifests_owner
  on public.submission_asset_manifests(owner_user_id, updated_at desc);

create index if not exists idx_submission_asset_manifests_brand
  on public.submission_asset_manifests(brand_profile_id, updated_at desc);

create index if not exists idx_submission_asset_manifests_manifest_gin
  on public.submission_asset_manifests using gin(manifest);

create or replace function public.set_submission_brand_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_submission_brand_profiles_updated_at on public.submission_brand_profiles;

create trigger trg_submission_brand_profiles_updated_at
before update on public.submission_brand_profiles
for each row execute function public.set_submission_brand_profiles_updated_at();

create or replace function public.set_submission_asset_manifests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_submission_asset_manifests_updated_at on public.submission_asset_manifests;

create trigger trg_submission_asset_manifests_updated_at
before update on public.submission_asset_manifests
for each row execute function public.set_submission_asset_manifests_updated_at();
