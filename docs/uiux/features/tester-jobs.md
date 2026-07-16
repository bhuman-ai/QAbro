# Tester Jobs

## User Job

Let a new tester complete one qualification, then let an approved tester claim paid product tests with the price and expectations clear before accepting.

## Product Archetype

A small marketplace job board. The primary action is `Take test` for qualification or `Claim paid test` for approved testers, not dashboard analysis.

## Concept Packet

- **Primary Action:** Claim the one test the tester wants to complete.
- **Primary Risk:** A tester accepts work without knowing whether it is paid, how much it pays, or how long it should take.
- **Information Budget:** Product, plain-language scope, duration, access mode, exact tester pay, and one action.
- **View Model Contract:** Application status controls eligibility; job type controls qualification versus paid copy; active work blocks another claim; payout state appears only after paid work is claimed.
- **Concept Options:** Separate qualification and paid-work pages; one status-aware jobs page.
- **Concept Winner:** One status-aware jobs page, because the tester always has the same job: understand an assignment, claim it, record it, and submit it.

## Primary Flow

1. The tester signs in and completes `/testers/apply`.
2. The application confirmation links directly to `/testers/jobs`.
3. A BUD operator prepares an MCP request with private review points and publishes it.
4. Eligible desktop applicants see unpaid qualifications. Approved desktop testers see paid assignments.
5. Paid assignments show exact pay, duration, safe product brief, and access mode before acceptance.
6. `Take test` or `Claim paid test` atomically reserves the request so only one tester can claim it.
7. BUD creates the existing private recording trial and opens it immediately.
8. The tester can return to `/testers/jobs` and use `Start test`, `Continue test`, or `View submission`.
9. Completed work remains under a collapsed history section with payout state for paid assignments.

## Information Budget

- One current test, when one exists.
- Otherwise, available qualifications and one `Take test` action per request.
- Product name, plain-language brief, duration, safe access mode, and exact pay for paid work.
- Application status only when it changes the next action.

Do not show the customer email, target URL before claim, credentials, private review points, MCP setup, marketplace metrics, or operator controls.

## Safety And State

- The jobs route requires the tester's normal BUD login. It never requires MCP.
- Only an application owned by the signed-in user can claim or reopen a test.
- Qualification claiming currently requires `computer` because browser screen capture is desktop-Chrome-first.
- A conditional database update changes `available` to `assigned`; a second claimant receives a conflict.
- Test-account credentials remain encrypted and appear only inside the private tester portal.
- The original emailed tester token remains valid when the dashboard issues a resumable token.
- Publishing a paid assignment is a commitment by Before Users Do to the displayed tester pay.
- Paid work moves from `Pending` to `Approved` after BUD reviews the submitted report, then to `Paid` only when an operator records payment.

## Responsive Contract

- One column at every width.
- No permanent navigation rail.
- Primary actions remain at least 44 pixels high.
- Briefs wrap naturally without horizontal scrolling.
