create table if not exists public.swarmtest_manual_qa_events (
  id bigserial primary key,
  event_id text not null unique,
  session_id text not null references public.swarmtest_reports(run_id) on delete cascade,
  item_id text,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  owner_user_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_manual_qa_events_session_id
  on public.swarmtest_manual_qa_events(session_id, id);

create index if not exists idx_manual_qa_events_session_item
  on public.swarmtest_manual_qa_events(session_id, item_id, id)
  where item_id is not null;

create index if not exists idx_manual_qa_events_type_created
  on public.swarmtest_manual_qa_events(event_type, created_at desc);

alter table public.swarmtest_manual_qa_events enable row level security;

comment on table public.swarmtest_manual_qa_events is
  'Append-only recovery journal for BeforeUsersDo manual QA widget state and evidence.';

comment on column public.swarmtest_manual_qa_events.event_id is
  'Stable client or server idempotency key. Retried writes reuse this value.';
