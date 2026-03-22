alter table if exists public.swarmtest_reports
add column if not exists owner_user_id text generated always as (
  coalesce(
    nullif(payload #>> '{run_request,metadata,owner_user_id}', ''),
    nullif(payload #>> '{run_request,metadata,ownerUserId}', ''),
    nullif(payload ->> 'owner_user_id', ''),
    nullif(payload ->> 'ownerUserId', '')
  )
) stored;

alter table if exists public.swarmtest_reports
add column if not exists brand_key text generated always as (
  coalesce(
    nullif(payload #>> '{run_request,metadata,brand_id}', ''),
    nullif(payload #>> '{run_request,metadata,brandId}', ''),
    nullif(payload #>> '{run_request,metadata,brand_key}', ''),
    nullif(payload #>> '{run_request,metadata,brandKey}', ''),
    nullif(payload #>> '{run_request,metadata,brand_slug}', ''),
    nullif(payload #>> '{run_request,metadata,brandSlug}', ''),
    nullif(payload #>> '{run_request,metadata,brand}', ''),
    nullif(payload #>> '{run_request,metadata,workspace_id}', ''),
    nullif(payload #>> '{run_request,metadata,workspaceId}', ''),
    nullif(payload ->> 'brand_id', ''),
    nullif(payload ->> 'brand', ''),
    nullif(target, '')
  )
) stored;

drop index if exists idx_swarmtest_reports_payload_gin;
drop index if exists idx_swarmtest_reports_request_meta_gin;

create index if not exists idx_swarmtest_reports_owner_delivered
  on public.swarmtest_reports(owner_user_id, delivered_at desc);

create index if not exists idx_swarmtest_reports_brand_delivered
  on public.swarmtest_reports(brand_key, delivered_at desc);
