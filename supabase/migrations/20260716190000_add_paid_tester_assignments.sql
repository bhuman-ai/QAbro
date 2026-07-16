alter table public.swarmtest_human_test_requests
  add column if not exists assignment_type text not null default 'qualification',
  add column if not exists tester_pay_cents integer not null default 0,
  add column if not exists tester_pay_currency text not null default 'USD',
  add column if not exists payout_status text not null default 'not_applicable',
  add column if not exists payout_approved_at timestamptz,
  add column if not exists payout_paid_at timestamptz;

alter table public.swarmtest_human_test_requests
  drop constraint if exists swarmtest_human_test_requests_assignment_type_check,
  drop constraint if exists swarmtest_human_test_requests_tester_pay_check,
  drop constraint if exists swarmtest_human_test_requests_currency_check,
  drop constraint if exists swarmtest_human_test_requests_payout_status_check,
  drop constraint if exists swarmtest_human_test_requests_assignment_payment_check;

alter table public.swarmtest_human_test_requests
  add constraint swarmtest_human_test_requests_assignment_type_check
    check (assignment_type in ('qualification', 'paid')),
  add constraint swarmtest_human_test_requests_tester_pay_check
    check (tester_pay_cents >= 0),
  add constraint swarmtest_human_test_requests_currency_check
    check (tester_pay_currency ~ '^[A-Z]{3}$'),
  add constraint swarmtest_human_test_requests_payout_status_check
    check (payout_status in ('not_applicable', 'pending', 'approved', 'paid')),
  add constraint swarmtest_human_test_requests_assignment_payment_check
    check (
      (assignment_type = 'qualification' and tester_pay_cents = 0 and payout_status = 'not_applicable')
      or
      (assignment_type = 'paid' and tester_pay_cents > 0 and payout_status in ('pending', 'approved', 'paid'))
    );

create index if not exists idx_swarmtest_human_test_requests_paid_available
  on public.swarmtest_human_test_requests(published_at desc)
  where status = 'available' and assignment_type = 'paid';

create index if not exists idx_swarmtest_human_test_requests_payout
  on public.swarmtest_human_test_requests(payout_status, updated_at desc)
  where assignment_type = 'paid';

comment on column public.swarmtest_human_test_requests.assignment_type is
  'Whether the tester is completing an unpaid qualification or an approved paid assignment.';

comment on column public.swarmtest_human_test_requests.tester_pay_cents is
  'Exact tester compensation committed when a paid assignment is published.';

comment on column public.swarmtest_human_test_requests.payout_status is
  'Manual payout ledger: pending after publication, approved after report review, and paid after payment is recorded.';
