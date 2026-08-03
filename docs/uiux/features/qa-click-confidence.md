# Feature: qa-click-confidence

## Request
On BeforeUsersDo report pages, uncertain or misplaced AI clicks must never appear as product bugs. Show them plainly as a test that needs a rerun, do not put them under product Problems or Next fix, and retain evidence and details.
## Autonomy Mode
holistic_autopilot
## Target Users
Founder or buyer reading a QA report
## Optimization Target
Make the difference between a proven product problem and an inconclusive automated interaction immediately obvious.
## Hard Constraints
- One primary action for inconclusive results: rerun or verify manually
- Do not label automation uncertainty as a product bug
- blocker
- problem
- or next product fix
## Scope
Optimize for Make the difference between a proven product problem and an inconclusive automated interaction immediately obvious.. Start with smallest coherent slice that proves On BeforeUsersDo report pages, uncertain or misplaced AI clicks must never appear as product bugs. Show them plainly as a test that needs a rerun, do not put them under product Problems or Next fix, and retain evidence and details..
## Touched Surfaces
- QA report page
## Success Moment
Founder or buyer reading a QA report completes On BeforeUsersDo report pages, uncertain or misplaced AI clicks must never appear as product bugs. Show them plainly as a test that needs a rerun, do not put them under product Problems or Next fix, and retain evidence and details. and sees explicit confirmation of successful outcome.
## Failure Policy
[TODO] Describe recovery path on failure.

## Primary Action
Founder or buyer reading a QA report should be able to On BeforeUsersDo report pages, uncertain or misplaced AI clicks must never appear as product bugs. Show them plainly as a test that needs a rerun, do not put them under product Problems or Next fix, and retain evidence and details. with one obvious first move.
## Primary Risk
Founder or buyer reading a QA report should not have to guess what matters first or what can go wrong.
## Information Budget
First screen shows one primary decision, one primary risk, and one current rationale. Audit detail stays behind an explicit drilldown.
## View Model Contract
Primary user: Founder or buyer reading a QA report
Current decision: On BeforeUsersDo report pages, uncertain or misplaced AI clicks must never appear as product bugs. Show them plainly as a test that needs a rerun, do not put them under product Problems or Next fix, and retain evidence and details.
Why now: Founder or buyer reading a QA report needs immediate clarity on this flow.
Next action: Let Codex structure the surface around one dominant move.
Top risk: Founder or buyer reading a QA report should not have to guess what matters first or what can go wrong.
## Concept Options
1. Mixed list with an explicit “Inconclusive” label: smallest code change, but still mixes automation uncertainty with product problems.
2. Separate “Needs a rerun” section below proven “Problems”: keeps the product decision clear and gives inconclusive checks one obvious action.
3. Hide inconclusive checks under technical details: cleanest default view, but too easy to miss that coverage is incomplete.
## Concept Winner
Choose option 2. Proven product findings remain under “Problems.” Unverified automated interactions move to a separate “Needs a rerun” section. When only inconclusive checks exist, replace “Next fix” with “Needs a rerun” and make the rationale explicit: the tester did not prove a product bug. Keep evidence available in the expanded row; add no new controls beyond the existing evidence/replay affordance.
## Decisions
- Primary Action: Founder or buyer reading a QA report should be able to On BeforeUsersDo report pages, uncertain or misplaced AI clicks must never appear as product bugs. Show them plainly as a test that needs a rerun, do not put them under product Problems or Next fix, and retain evidence and details. with one obvious first move. (source: agent_assumption; why: Autopilot inferred default for primary_action from request, audience, optimization target, and mode.)
- Primary Risk: Founder or buyer reading a QA report should not have to guess what matters first or what can go wrong. (source: agent_assumption; why: Autopilot inferred default for primary_risk from request, audience, optimization target, and mode.)
- Information Budget: First screen shows one primary decision, one primary risk, and one current rationale. Audit detail stays behind an explicit drilldown. (source: agent_assumption; why: Autopilot inferred default for information_budget from request, audience, optimization target, and mode.)
- View Model Contract: Primary user: Founder or buyer reading a QA report
Current decision: On BeforeUsersDo report pages, uncertain or misplaced AI clicks must never appear as product bugs. Show them plainly as a test that needs a rerun, do not put them under product Problems or Next fix, and retain evidence and details.
Why now: Founder or buyer reading a QA report needs immediate clarity on this flow.
Next action: Let Codex structure the surface around one dominant move.
Top risk: Founder or buyer reading a QA report should not have to guess what matters first or what can go wrong. (source: agent_assumption; why: Autopilot inferred default for view_model_contract from request, audience, optimization target, and mode.)
- Scope: Optimize for Make the difference between a proven product problem and an inconclusive automated interaction immediately obvious.. Start with smallest coherent slice that proves On BeforeUsersDo report pages, uncertain or misplaced AI clicks must never appear as product bugs. Show them plainly as a test that needs a rerun, do not put them under product Problems or Next fix, and retain evidence and details.. (source: agent_assumption; why: Autopilot inferred default for feature_scope from request, audience, optimization target, and mode.)
- Success Moment: Founder or buyer reading a QA report completes On BeforeUsersDo report pages, uncertain or misplaced AI clicks must never appear as product bugs. Show them plainly as a test that needs a rerun, do not put them under product Problems or Next fix, and retain evidence and details. and sees explicit confirmation of successful outcome. (source: agent_assumption; why: Autopilot inferred default for success_moment from request, audience, optimization target, and mode.)
## Open Questions
[TODO] Track unresolved blockers here.

## Design Notes
[TODO] Record layout, IA, and state-machine notes here.

## Implementation Notes
- 2026-08-03 Implementation summary: Verified click targeting now validates every localization retry before clicking and records target-hit verification metadata. Repeated or explicitly unverified interactions become test_inconclusive with partial/inconclusive coverage, never bug/dead_end or product-blocked. Report normalization provides defense in depth. Report pages separate proven Problems from Needs a rerun, remove inconclusive checks from Next fix and score/friction calculations, and keep evidence in the expandable rerun item.
- Files: api/qa-report-callback.js, lib/qa-browserbase.js, lib/qa-core.js, src/App.tsx, src/lib/format.ts, src/types.ts, tests/qa-browserbase.test.js, tests/qa.test.js
- Components: Vision-only click localization, Vision-only report builder, QA report normalizer, ReportReader, SharedReportPage, getPrimaryFinding, QA score and friction summaries
- Assumptions used: An interaction without explicit target_hit_verified=true is not sufficient evidence for a product interaction bug., Inconclusive checks remain visible with evidence but are separated from proven product problems.
## Doc Sync
- 2026-08-03 Synced after implementation.
- States touched: partial
- Code touched: api/qa-report-callback.js, lib/qa-browserbase.js, lib/qa-core.js, src/App.tsx, src/lib/format.ts, src/types.ts, tests/qa-browserbase.test.js, tests/qa.test.js
