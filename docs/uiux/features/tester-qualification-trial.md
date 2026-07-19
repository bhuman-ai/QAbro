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
7. BUD queues the saved recording parts for audio transcription and visual analysis without making the tester wait.
8. The report shows one analysis state until every eligible recording part is processed, then publishes recording-derived findings with timestamped proof.
9. A BUD operator marks which private benchmark issues were caught and rates report clarity.
10. BUD publishes a `BUD Verified Trial` score.
11. The customer separately rates how useful the test was.

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
- Submitted recording and supplemental tester note
- Recording-analysis status
- Problems, what worked, suggested fixes, and optional observations derived from the recording's speech and visible activity
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

A submitted recording is raw evidence. A tester note or an unfinished analysis must not be presented as recording-derived findings.

### View Model Contract

- A submitted manual-QA session switches from the active testing workbench to a read-only report.
- Keep qualification review status separate from recording-analysis status. `Reviewed` means the operator reviewed the qualification; it does not mean the recording was analyzed.
- Show one recording player that advances through the short saved segments in chronological order.
- When timed speech is available, attach it to each matching recording part as an enabled captions track; keep the raw transcript as a secondary technical view.
- Analyze the actual recording: transcribe its audio and inspect its visible activity. Findings may be derived only from that recording analysis.
- Treat the tester note as supplemental context below the digest. Never use the note, private benchmark data, requested flow, or unsupported assumptions to generate findings.
- While analysis is `not_started`, `queued`, or `processing`, replace the digest with one plain status line. Do not show category headings or claim that a category is empty.
- When analysis is `complete`, show one vertical `What the tester found` digest. Merge bugs and frustrations under `Problems` with a plain `Bug` or `Friction` label, rename aha moments to `What worked`, show verified AI recommendations under `Suggested fixes`, and collapse neutral items under `More observations`.
- Hide empty sections. If the entire digest is empty, show only `No clear findings were identified in the recording.`
- Each finding links to its supporting moment with a plain action such as `Watch part 23 at 0:06`. The action selects the referenced clip and seeks to the clip-relative timestamp.
- Show the raw tester note and requested flow after the completed findings digest as supplemental context.
- Keep operator scoring in the existing guarded operator workspace; the report shows whether that review is still pending.
- Hide widget installation, checklist metrics, note editors, status buttons, raw evidence URLs, agent context, and capture diagnostics from the default report view.
- Keep the raw transcript, raw links, expected behavior, widget context, and diagnostics under collapsed `Technical details`.
- Disable `Copy report` until recording analysis is `complete`. The completed export mirrors the visible Problems / What worked / Suggested fixes / More observations organization. Suggested fixes are labeled as AI recommendations, never tester evidence. It excludes the tester note as a findings source, agent tasks, private benchmark data, developer context, raw transcript, raw evidence URLs, provider usage, and internal model details.
- If analysis fails, keep the recording available and show one plain failure message. Offer one `Try again` action only while the job remains retryable; after the retry cap, direct the operator to support. Do not fabricate findings or render analytics-style metrics.

### Recording-analysis states

- `not_started`: `Preparing the report…` Queue automatically. Keep the recording playable, hide findings categories, and disable `Copy report`.
- `queued`: `Preparing the report…` Keep the recording playable. Hide findings categories and disable `Copy report`.
- `processing`: `Analyzing the recording and speech… N of M parts.` Keep the recording playable. Hide findings categories and disable `Copy report`.
- `complete`: show recording-derived findings and enable `Copy report`. Hide empty sections; show one all-empty conclusion only in this state.
- `failed`: `We couldn't analyze the recording.` Keep the recording playable, hide findings categories, and disable `Copy report`. Show `Try again` only when the backend marks the job retryable and its retry cap is not exhausted.

### Evidence and failure states

- `recording-missing`: submission exists but no playable recording was saved, so analysis cannot claim findings or empty categories.
- `clip-error`: keep the rest of the report visible and provide previous/next and direct clip fallback.
- `review-pending` / `reviewed`: describe qualification scoring only and remain independent of recording analysis.

### Source integrity contract

- Persist the analysis source as `recording_transcript`. Missing analysis data is legacy `not_started`, never an implicit success.
- `complete` requires every eligible saved recording part to finish successfully. Partial results may be retained for retry but must not publish findings or empty-category conclusions.
- Preserve each transcript segment's `evidence_id`, numeric recording index, `start_ms`, and `end_ms`.
- Persist recorder-measured clip duration and verify it against the saved media container before accepting timestamps. Never use a model-reported duration as the source of truth.
- Every published finding carries at least one valid evidence anchor to a successfully analyzed recording part. A quoted speech excerpt must exist in that part's transcript; visible evidence must exist in that part's visual analysis.
- Before a new finding is published, an independent text-only verifier must confirm that its title and summary follow from its exact anchors and that its category fits the evidence. A failed or malformed verdict fails closed. The verifier never rewrites findings.
- A problem may carry one optional `suggested_fix`. It is an AI recommendation tied to a semantically verified finding, never a new evidence category or a tester quote. An unacceptable suggestion is dropped without discarding the verified finding.
- The tester note, requested flow, private benchmark, and existing note-derived work packets never enter the recording findings input.
- Retries may reuse already completed clip analyses, but a changed recording fingerprint requires a fresh analysis before findings can be published.
- Persist provider-reported AI cost cumulatively across same-recording batches and retries. Reset it when the recording fingerprint changes, including invalid replacement sets. Legacy reports keep cost unavailable rather than displaying `$0.00`; report API responses and customer-safe exports omit provider, model, token, cost, lease, and fingerprint internals.
- Analyze bounded durable batches and publish only after the complete fingerprinted recording set succeeds. Exhausted retries stay terminal until support intervenes.
- Keep each analyzer job inside a four-minute processing deadline; divide the remaining request budget across clip analysis, aggregation, and verification so the server retains time to persist progress, failure state, and provider-reported cost.
- Recording bytes sent for transcription and visual analysis use a third-party AI route configured for zero retention and denied data collection. A plain disclosure names that processing and the product-owner audience before capture starts.
- Starting the test acknowledges the recording disclosure. Every submitted trial with a complete trusted recording is automatically eligible for analysis, including legacy submissions; no second post-submission permission step exists.

## Score Contract

- Benchmark coverage: 70 points
- Evidence completeness: 20 points
- Report clarity: 10 points
- Customer rating: separate 1-5 score, never folded into the BUD score

Private benchmark issues, access-token hashes, and encrypted credential envelopes must never appear in public trial responses. Plaintext test credentials are available only to the tester role through its private link.

## Reuse Boundary

Paid assignments reuse the same recording disclosure, evidence, submission, analysis, and customer-rating machinery. They do not create a qualification score, change an approved tester back to `Qualification sent`, or describe the work as unpaid. Their displayed pay is copied into the private trial when claimed and cannot change for that claimed assignment.
