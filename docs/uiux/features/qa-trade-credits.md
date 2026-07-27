# QA Trade Credits

## User Job

Let an approved tester choose cash or reusable QA credit for a paid test, then spend earned credit to request QA for their own product.

This is an optional path. It does not replace cash compensation, qualification tests, or the existing paid-request flow.

## Product Archetype

A small marketplace balance, not a financial dashboard.

## Concept Packet

- **Primary Action:** On a paid job, `Claim test`; on the credit page, `Use credit for QA`.
- **Primary Risk:** A tester accidentally accepts credit instead of cash, or credit is issued before a report passes review.
- **Information Budget:** Exact dollar value, cash-or-credit choice, current credit balance, and one next action.
- **View Model Contract:** Cash is the default; the reward choice is locked when the job is claimed; credit is awarded only after report approval; spending credit reserves the exact tester reward for a new paid request.
- **Concept Options:** Put cash and credit controls on every job card; ask after the tester clicks `Claim test`.
- **Concept Winner:** Ask after `Claim test`, keeping the normal jobs board unchanged until a tester expresses intent.

## Flow

1. An approved tester opens a paid job and clicks `Claim test`.
2. The tester chooses the displayed amount as `cash` or `QA credit`.
3. The choice is saved atomically with the job reservation and copied into the private tester trial.
4. BUD reviews the submitted report.
5. Cash keeps the existing `Mark paid` flow. Credit uses `Add QA credit`.
6. The tester sees the balance on `/testers/jobs`.
7. `Use credits for QA` opens `/qa-credits`.
8. The tester enters a product URL, a flow to test, and the exact credit amount to reserve.
9. The request enters the existing operator preparation queue as a paid request. Its tester reward cannot be changed after credit is reserved.

## Credit Contract

- QA credit is dollar-denominated in integer cents; there is no hidden conversion rate.
- Choosing `$25 QA credit` earns exactly `$25 QA credit`.
- Ledger entries are immutable and idempotent.
- Balance changes use database functions with a per-user transaction lock.
- A credit reward requires a completed paid request, an approved payout, and the signed-in tester user id.
- A credit-funded request must be owned by the spender, still queued, and fully covered by the current balance.
- Existing cash rows normalize to `cash`; existing flows do not require a new choice.

## UI Contract

- Keep one `Claim test` action on a paid job card.
- Reveal the cash-or-credit choice only after that action.
- Make cash the visually primary/default option and credit the explicit alternative.
- Show the credit balance as one compact link, not a wallet dashboard.
- Keep the spend form to URL, flow, amount, and one submit action.
- Do not show ledger history, conversion math, marketplace metrics, or internal settlement state by default.

