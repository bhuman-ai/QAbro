create table if not exists public.swarmtest_acquisition_events (
  id bigserial primary key,
  event_name text not null,
  event_key text not null unique,
  visitor_id uuid,
  owner_user_id text,
  occurred_at timestamptz not null default now(),
  landing_path text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  is_test boolean not null default false,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint swarmtest_acquisition_events_identity_check
    check (visitor_id is not null or nullif(owner_user_id, '') is not null),
  constraint swarmtest_acquisition_events_name_check
    check (
      event_name in (
        'offer_viewed',
        'primary_cta_clicked',
        'signup_completed',
        'mcp_key_created',
        'agent_install_step_copied',
        'mcp_key_first_used',
        'first_qa_requested',
        'first_qa_report_completed'
      )
    ),
  constraint swarmtest_acquisition_events_key_length_check
    check (char_length(event_key) between 1 and 320),
  constraint swarmtest_acquisition_events_properties_object_check
    check (jsonb_typeof(properties) = 'object')
);

create index if not exists idx_swarmtest_acquisition_events_name_occurred
  on public.swarmtest_acquisition_events(event_name, occurred_at desc);

create index if not exists idx_swarmtest_acquisition_events_owner_occurred
  on public.swarmtest_acquisition_events(owner_user_id, occurred_at desc)
  where owner_user_id is not null;

create index if not exists idx_swarmtest_acquisition_events_visitor_occurred
  on public.swarmtest_acquisition_events(visitor_id, occurred_at desc)
  where visitor_id is not null;

create index if not exists idx_swarmtest_acquisition_events_campaign_occurred
  on public.swarmtest_acquisition_events(utm_source, utm_medium, utm_campaign, occurred_at desc);

alter table public.swarmtest_acquisition_events enable row level security;
