alter table public.swarmtest_human_test_requests
  add column if not exists assigned_tester_user_id text,
  add column if not exists tester_reward_type text not null default 'cash',
  add column if not exists qa_credit_awarded_at timestamptz,
  add column if not exists funding_type text not null default 'cash',
  add column if not exists qa_credit_spent_cents integer not null default 0,
  add column if not exists qa_credit_spent_at timestamptz;

alter table public.swarmtest_human_test_requests
  drop constraint if exists swarmtest_human_test_requests_tester_reward_type_check,
  drop constraint if exists swarmtest_human_test_requests_funding_type_check,
  drop constraint if exists swarmtest_human_test_requests_credit_spend_check;

alter table public.swarmtest_human_test_requests
  add constraint swarmtest_human_test_requests_tester_reward_type_check
    check (tester_reward_type in ('cash', 'qa_credit')),
  add constraint swarmtest_human_test_requests_funding_type_check
    check (funding_type in ('cash', 'qa_credit')),
  add constraint swarmtest_human_test_requests_credit_spend_check
    check (qa_credit_spent_cents >= 0);

create table if not exists public.swarmtest_qa_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null,
  owner_email text not null,
  amount_cents integer not null,
  currency text not null default 'USD',
  entry_type text not null,
  human_test_request_id uuid references public.swarmtest_human_test_requests(id),
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  constraint swarmtest_qa_credit_ledger_nonzero_check check (amount_cents <> 0),
  constraint swarmtest_qa_credit_ledger_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint swarmtest_qa_credit_ledger_entry_type_check
    check (entry_type in ('earned', 'spent', 'refund', 'adjustment'))
);

create index if not exists idx_swarmtest_qa_credit_ledger_owner
  on public.swarmtest_qa_credit_ledger(owner_user_id, currency, created_at desc);

alter table public.swarmtest_qa_credit_ledger enable row level security;

create or replace function public.swarmtest_spend_qa_credit(
  p_owner_user_id text,
  p_owner_email text,
  p_request_id uuid,
  p_amount_cents integer,
  p_currency text default 'USD'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_balance integer;
  normalized_currency text := upper(p_currency);
begin
  if p_amount_cents <= 0 then
    raise exception 'Credit amount must be positive';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_owner_user_id || ':' || normalized_currency));

  select coalesce(sum(amount_cents), 0)::integer
    into current_balance
  from public.swarmtest_qa_credit_ledger
  where owner_user_id = p_owner_user_id
    and currency = normalized_currency;

  if exists (
    select 1
    from public.swarmtest_qa_credit_ledger
    where idempotency_key = 'spend:' || p_request_id::text
  ) then
    return current_balance;
  end if;

  if current_balance < p_amount_cents then
    raise exception 'Not enough QA credit';
  end if;

  insert into public.swarmtest_qa_credit_ledger (
    owner_user_id,
    owner_email,
    amount_cents,
    currency,
    entry_type,
    human_test_request_id,
    idempotency_key
  )
  values (
    p_owner_user_id,
    lower(p_owner_email),
    -p_amount_cents,
    normalized_currency,
    'spent',
    p_request_id,
    'spend:' || p_request_id::text
  )
  on conflict (idempotency_key) do nothing;

  update public.swarmtest_human_test_requests
  set funding_type = 'qa_credit',
      qa_credit_spent_cents = p_amount_cents,
      qa_credit_spent_at = coalesce(qa_credit_spent_at, now())
  where id = p_request_id
    and owner_user_id = p_owner_user_id
    and status = 'queued';

  if not found then
    raise exception 'QA request is not available for credit funding';
  end if;

  return current_balance - p_amount_cents;
end;
$$;

create or replace function public.swarmtest_award_qa_credit(
  p_request_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.swarmtest_human_test_requests%rowtype;
  current_balance integer;
begin
  select *
    into request_row
  from public.swarmtest_human_test_requests
  where id = p_request_id
  for update;

  if request_row.id is null then
    raise exception 'QA request not found';
  end if;
  if request_row.assignment_type <> 'paid'
    or request_row.tester_reward_type <> 'qa_credit'
    or request_row.status <> 'completed'
    or request_row.payout_status <> 'approved'
    or request_row.assigned_tester_user_id is null then
    raise exception 'QA credit reward is not ready';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(request_row.assigned_tester_user_id || ':' || request_row.tester_pay_currency)
  );

  insert into public.swarmtest_qa_credit_ledger (
    owner_user_id,
    owner_email,
    amount_cents,
    currency,
    entry_type,
    human_test_request_id,
    idempotency_key
  )
  values (
    request_row.assigned_tester_user_id,
    lower(request_row.assigned_tester_email),
    request_row.tester_pay_cents,
    request_row.tester_pay_currency,
    'earned',
    request_row.id,
    'earn:' || request_row.id::text
  )
  on conflict (idempotency_key) do nothing;

  update public.swarmtest_human_test_requests
  set payout_status = 'paid',
      payout_paid_at = coalesce(payout_paid_at, now()),
      qa_credit_awarded_at = coalesce(qa_credit_awarded_at, now())
  where id = request_row.id;

  select coalesce(sum(amount_cents), 0)::integer
    into current_balance
  from public.swarmtest_qa_credit_ledger
  where owner_user_id = request_row.assigned_tester_user_id
    and currency = request_row.tester_pay_currency;

  return current_balance;
end;
$$;

revoke all on function public.swarmtest_spend_qa_credit(text, text, uuid, integer, text) from public;
revoke all on function public.swarmtest_award_qa_credit(uuid) from public;
grant execute on function public.swarmtest_spend_qa_credit(text, text, uuid, integer, text) to service_role;
grant execute on function public.swarmtest_award_qa_credit(uuid) to service_role;

comment on table public.swarmtest_qa_credit_ledger is
  'Immutable dollar-denominated QA credit entries. Positive entries are earned; negative entries fund new human QA requests.';

comment on column public.swarmtest_human_test_requests.tester_reward_type is
  'The tester choice made at claim time: cash or reusable QA credit.';

comment on column public.swarmtest_human_test_requests.funding_type is
  'How the product owner funds the tester compensation: cash or previously earned QA credit.';
