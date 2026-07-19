# Tester Qualification Trial

## Job

Bootstrap both sides of human QA: a customer receives one useful test for free while a new tester earns a first verified platform score.

## Primary Flow

1. A customer request arrives through `qa_request_human_test`, or a BUD operator starts a pairing directly.
2. The operator adds private review points and publishes the request to eligible testers.
3. A tester claims it from `/testers/jobs`, or an operator sends it directly to an interested tester. BUD creates and emails separate private role links.
4. Direct MCP requests preapprove the customer; directly paired trials still ask both people to accept.
5. The tester opens the private link and uses one `Start test` action. That action accepts the trial, opens the product, and starts screen-and-voice recording. Evidence uploads in short segments.
6. The tester submits the test.
7. A BUD operator marks which private benchmark issues were caught and rates report clarity.
8. BUD publishes a `BUD Verified Trial` score.
9. The customer separately rates how useful the test was.

When a tester claims a qualification, the application is linked to the new session and moves to `Qualification sent`. Publishing the BUD score moves that same application to `Passed qualification` for final operator approval.

New qualification requests default to 15 minutes. Explicit paid-test durations remain unchanged.

## Information Budget

### Tester

- What to test
- Why this trial matters
- Start or finish test
- Saved-evidence count

### Customer

- Current status
- Submitted note and recordings
- Customer rating action

### BUD Operator

- Product URL and flow
- Customer and tester email
- Private benchmark issues
- Scoring action after submission

## Completed Report View

### Primary Action

`Watch recording`

### Primary Risk

A submitted recording is raw evidence, not automatically a passed, scored, or useful report.

### View Model Contract

- A submitted manual-QA session switches from the active testing workbench to a read-only report.
- Show one truthful state: `Needs review`, `Reviewed`, or `Recording missing`.
- Show one recording player that advances through the short saved segments in chronological order.
- Show the tester note and requested flow after the player.
- Keep operator scoring in the existing guarded operator workspace; the report shows whether that review is still pending.
- Hide widget installation, checklist metrics, note editors, status buttons, raw evidence URLs, agent context, and capture diagnostics from the default report view.
- Keep raw links, expected behavior, widget context, and diagnostics under `Technical details`.
- If there are no structured findings, the recording and tester note are the report; do not render an empty findings dashboard.

### States

- `submitted-unreviewed`: recording and note are available; BUD scoring is pending.
- `reviewed`: BUD score or review has been published.
- `recording-missing`: submission exists but no playable video evidence was saved.
- `clip-error`: keep the rest of the report visible and provide previous/next and direct clip fallback.

## Score Contract

- Benchmark coverage: 70 points
- Evidence completeness: 20 points
- Report clarity: 10 points
- Customer rating: separate 1-5 score, never folded into the BUD score

Private benchmark issues, access-token hashes, and encrypted credential envelopes must never appear in public trial responses. Plaintext test credentials are available only to the tester role through its private link.

## Reuse Boundary

Paid assignments reuse the same consent, recording, evidence, submission, and customer-rating machinery. They do not create a qualification score, change an approved tester back to `Qualification sent`, or describe the work as unpaid. Their displayed pay is copied into the private trial when claimed and cannot change for that claimed assignment.
