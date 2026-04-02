create table if not exists public.swarm_jobs (
  id uuid primary key default gen_random_uuid(),
  job_id text not null unique,
  job_type text not null,
  owner_user_id text not null,
  owner_email text,
  brand_key text,
  site_id text,
  target text,
  status text not null default 'queued',
  priority integer not null default 100,
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  claimed_by text,
  not_before timestamptz,
  payload jsonb not null default '{}'::jsonb,
  progress jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists idx_swarm_jobs_claim
  on public.swarm_jobs(job_type, status, priority desc, created_at asc);

create index if not exists idx_swarm_jobs_owner
  on public.swarm_jobs(owner_user_id, created_at desc);

create index if not exists idx_swarm_jobs_brand
  on public.swarm_jobs(brand_key, created_at desc);

create index if not exists idx_swarm_jobs_payload_gin
  on public.swarm_jobs using gin(payload);

create table if not exists public.submission_site_profiles (
  id uuid primary key default gen_random_uuid(),
  site_id text not null,
  version integer not null default 1,
  site_name text not null,
  track text not null,
  status text not null default 'draft',
  submission_policy text not null default 'assist',
  submit_url text not null,
  profile jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  source_job_id text,
  last_recon_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, version)
);

create unique index if not exists idx_submission_site_profiles_active
  on public.submission_site_profiles(site_id)
  where is_active = true;

create index if not exists idx_submission_site_profiles_track
  on public.submission_site_profiles(track, status, updated_at desc);

create index if not exists idx_submission_site_profiles_profile_gin
  on public.submission_site_profiles using gin(profile);

create or replace function public.set_swarm_jobs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_swarm_jobs_updated_at on public.swarm_jobs;

create trigger trg_swarm_jobs_updated_at
before update on public.swarm_jobs
for each row execute function public.set_swarm_jobs_updated_at();

create or replace function public.set_submission_site_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_submission_site_profiles_updated_at on public.submission_site_profiles;

create trigger trg_submission_site_profiles_updated_at
before update on public.submission_site_profiles
for each row execute function public.set_submission_site_profiles_updated_at();
