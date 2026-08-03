# Feature: qa-replay-cursor-intent

## Request
Capture every AI browser click with coordinates, timestamp, and intended target; show one visible pointer, click ripple, and short Trying to click label in exact finding replays; explicitly request native cursor capture in human recordings.
## Autonomy Mode
holistic_autopilot
## Target Users
Product buyers and developers reviewing BeforeUsersDo QA evidence
## Optimization Target
Make every recorded interaction understandable without reading raw logs.
## Hard Constraints
- One unobtrusive cursor overlay
- No raw coordinate UI
- Use existing replay modal and brand tokens
- Finding clips must align cursor timing to the clip
- Human capture should request the native cursor without blocking unsupported browsers
## Scope
Optimize for Make every recorded interaction understandable without reading raw logs.. Start with smallest coherent slice that proves Capture every AI browser click with coordinates, timestamp, and intended target; show one visible pointer, click ripple, and short Trying to click label in exact finding replays; explicitly request native cursor capture in human recordings..
## Touched Surfaces
- AI action capture
- QA report replay modal
- human screen recorder
## Success Moment
Product buyers and developers reviewing BeforeUsersDo QA evidence completes Capture every AI browser click with coordinates, timestamp, and intended target; show one visible pointer, click ripple, and short Trying to click label in exact finding replays; explicitly request native cursor capture in human recordings. and sees explicit confirmation of successful outcome.
## Failure Policy
Retry inline when safe, preserve context, and escalate to support or fallback path if repeated failure continues.
## Primary Action
Product buyers and developers reviewing BeforeUsersDo QA evidence should be able to Capture every AI browser click with coordinates, timestamp, and intended target; show one visible pointer, click ripple, and short Trying to click label in exact finding replays; explicitly request native cursor capture in human recordings. with one obvious first move.
## Primary Risk
Product buyers and developers reviewing BeforeUsersDo QA evidence should not have to guess what matters first or what can go wrong.
## Information Budget
First screen shows the dominant task, the current state, and the recovery path. Secondary settings stay hidden until needed.
## View Model Contract
Primary user: Product buyers and developers reviewing BeforeUsersDo QA evidence
Current decision: Capture every AI browser click with coordinates, timestamp, and intended target; show one visible pointer, click ripple, and short Trying to click label in exact finding replays; explicitly request native cursor capture in human recordings.
Why now: Product buyers and developers reviewing BeforeUsersDo QA evidence needs immediate clarity on this flow.
Next action: Let Codex structure the surface around one dominant move.
Top risk: Product buyers and developers reviewing BeforeUsersDo QA evidence should not have to guess what matters first or what can go wrong.
## Concept Options
### Option A — Injected cursor inside the tested page
Draw a cursor and click ripple directly in the page during AI execution. The pointer would be baked into the raw video, but injection can alter tested pages, interfere with selectors, and become part of the behavior under test.

### Option B — Action-owned replay overlay
Record every successful AI click at the action layer with timestamp, viewport coordinates, and intended target. Preserve those cues with finding clips and render one existing-brand cursor, click ripple, and short “Trying to click…” label in replay. It leaves the tested product untouched and works for finding clips and full sessions.

### Option C — Post-process every video
Render cursor graphics into the MP4 after recording. This creates portable baked-in proof but adds FFmpeg work, delays reports, duplicates replay behavior, and raises storage/processing cost.
## Concept Winner
**Winner: Option B — Action-owned replay overlay.**

It fixes the missing source data at the click owner, reuses `ReplayVideoWithOverlay`, avoids changing the product under test, and adds no new customer control. The replay shows one pointer, one brief click ripple, and one short target label. For human QA, request native cursor capture through `getDisplayMedia` while retaining browser fallback behavior.
## Decisions
- Object Definition: Core object centers on Capture every AI browser click with coordinates, timestamp, and intended target; show one visible pointer, click ripple, and short Trying to click label in exact finding replays; explicitly request native cursor capture in human recordings.. (source: agent_assumption; why: Autopilot inferred default for object_definition from request, audience, optimization target, and mode.)
- Magic Moment: Product buyers and developers reviewing BeforeUsersDo QA evidence completes Capture every AI browser click with coordinates, timestamp, and intended target; show one visible pointer, click ripple, and short Trying to click label in exact finding replays; explicitly request native cursor capture in human recordings. and immediately sees clear proof the workflow works. (source: agent_assumption; why: Autopilot inferred default for magic_moment from request, audience, optimization target, and mode.)
- Technical Constraints: Assume web-based product with async API work, role-aware access, and real loading/error states. Constraints: One unobtrusive cursor overlay; No raw coordinate UI; Use existing replay modal and brand tokens; Finding clips must align cursor timing to the clip; Human capture should request the native cursor without blocking unsupported browsers. (source: agent_assumption; why: Autopilot inferred default for technical_constraints from request, audience, optimization target, and mode.)
- Volume & Density: Low volume (source: agent_assumption; why: Autopilot inferred default for volume_density from request, audience, optimization target, and mode.)
- Primary Jobs to be Done: Product buyers and developers reviewing BeforeUsersDo QA evidence needs to Capture every AI browser click with coordinates, timestamp, and intended target; show one visible pointer, click ripple, and short Trying to click label in exact finding replays; explicitly request native cursor capture in human recordings. with minimal friction. (source: agent_assumption; why: Autopilot inferred default for primary_jtbd from request, audience, optimization target, and mode.)
- Primary Personas: Product buyers and developers reviewing BeforeUsersDo QA evidence (source: agent_assumption; why: Autopilot inferred default for primary_persona from request, audience, optimization target, and mode.)
- Baseline Anxiety / Stress States: Medium. User expects clarity and fast forward progress. (source: agent_assumption; why: Autopilot inferred default for baseline_anxiety_state from request, audience, optimization target, and mode.)
- Scope: Optimize for Make every recorded interaction understandable without reading raw logs.. Start with smallest coherent slice that proves Capture every AI browser click with coordinates, timestamp, and intended target; show one visible pointer, click ripple, and short Trying to click label in exact finding replays; explicitly request native cursor capture in human recordings.. (source: agent_assumption; why: Autopilot inferred default for feature_scope from request, audience, optimization target, and mode.)
- Technical Sitemap: - Entry / overview
- Core workspace or task screen
- Detail / edit flow
- Recovery or support path (source: agent_assumption; why: Autopilot inferred default for technical_sitemap from request, audience, optimization target, and mode.)
- Navigation Paradigm: Simple top-level navigation with one dominant next action per surface. (source: agent_assumption; why: Autopilot inferred default for navigation_paradigm from request, audience, optimization target, and mode.)
- Happy Paths: Enter flow. Understand current state. Complete Capture every AI browser click with coordinates, timestamp, and intended target; show one visible pointer, click ripple, and short Trying to click label in exact finding replays; explicitly request native cursor capture in human recordings.. Receive immediate confirmation and clear next step. (source: agent_assumption; why: Autopilot inferred default for happy_path from request, audience, optimization target, and mode.)
- Primary Action: Product buyers and developers reviewing BeforeUsersDo QA evidence should be able to Capture every AI browser click with coordinates, timestamp, and intended target; show one visible pointer, click ripple, and short Trying to click label in exact finding replays; explicitly request native cursor capture in human recordings. with one obvious first move. (source: agent_assumption; why: Autopilot inferred default for primary_action from request, audience, optimization target, and mode.)
- Primary Risk: Product buyers and developers reviewing BeforeUsersDo QA evidence should not have to guess what matters first or what can go wrong. (source: agent_assumption; why: Autopilot inferred default for primary_risk from request, audience, optimization target, and mode.)
- Information Budget: First screen shows the dominant task, the current state, and the recovery path. Secondary settings stay hidden until needed. (source: agent_assumption; why: Autopilot inferred default for information_budget from request, audience, optimization target, and mode.)
- View Model Contract: Primary user: Product buyers and developers reviewing BeforeUsersDo QA evidence
Current decision: Capture every AI browser click with coordinates, timestamp, and intended target; show one visible pointer, click ripple, and short Trying to click label in exact finding replays; explicitly request native cursor capture in human recordings.
Why now: Product buyers and developers reviewing BeforeUsersDo QA evidence needs immediate clarity on this flow.
Next action: Let Codex structure the surface around one dominant move.
Top risk: Product buyers and developers reviewing BeforeUsersDo QA evidence should not have to guess what matters first or what can go wrong. (source: agent_assumption; why: Autopilot inferred default for view_model_contract from request, audience, optimization target, and mode.)
- Psychological Sitemap: - Entry: orient user quickly
- Core task: reduce ambiguity and decision load
- Commit / launch step: reinforce confidence
- Failure path: provide obvious recovery (source: agent_assumption; why: Autopilot inferred default for psychological_sitemap from request, audience, optimization target, and mode.)
- Empty States: Explain why no data exists yet and point Product buyers and developers reviewing BeforeUsersDo QA evidence to one clear setup or creation action. (source: agent_assumption; why: Autopilot inferred default for empty_state from request, audience, optimization target, and mode.)
- Loading States: Preserve layout with sectional skeletons or inline pending states instead of blank resets. (source: agent_assumption; why: Autopilot inferred default for loading_state from request, audience, optimization target, and mode.)
- Error States: Explain failure clearly, preserve entered work where possible, and offer retry plus fallback path. (source: agent_assumption; why: Autopilot inferred default for error_state from request, audience, optimization target, and mode.)
- Partial States: Keep successful sections visible while isolating incomplete or failed sections with local recovery. (source: agent_assumption; why: Autopilot inferred default for partial_state from request, audience, optimization target, and mode.)
- Overflow & Edge Cases: Truncate long labels in dense surfaces, preserve critical values, and expose full content via detail view or tooltip. (source: agent_assumption; why: Autopilot inferred default for overflow_rules from request, audience, optimization target, and mode.)
- Typography Scale: Use existing repo typography rhythm first. If none exists, keep a tight hierarchy with distinct title, section, and body sizes. (source: agent_assumption; why: Autopilot inferred default for typography_scale from request, audience, optimization target, and mode.)
- Color Variables: Reuse semantic surface, text, and status colors from current design system before introducing new tokens. (source: agent_assumption; why: Autopilot inferred default for color_variables from request, audience, optimization target, and mode.)
- Spacing System: Use 8px-based spacing rhythm with predictable section gaps and consistent control padding. (source: agent_assumption; why: Autopilot inferred default for spacing_system from request, audience, optimization target, and mode.)
- Border & Shadow Logic: Prefer restrained borders and light elevation. Reserve heavier depth for modals and high-priority overlays. (source: agent_assumption; why: Autopilot inferred default for depth_rules from request, audience, optimization target, and mode.)
- Component Reuse Rules: Reuse existing shared primitives, shell components, tokens, and state patterns before creating local one-offs. (source: agent_assumption; why: Autopilot inferred default for component_reuse_plan from request, audience, optimization target, and mode.)
- Interaction States: Every interactive control needs hover, focus-visible, disabled, active, selected, and pending states. (source: agent_assumption; why: Autopilot inferred default for interaction_states from request, audience, optimization target, and mode.)
- Accessibility Defaults: Keep keyboard reachability, visible focus, semantic errors, and contrast-safe status cues by default. (source: agent_assumption; why: Autopilot inferred default for accessibility_defaults from request, audience, optimization target, and mode.)
- Success Moment: Product buyers and developers reviewing BeforeUsersDo QA evidence completes Capture every AI browser click with coordinates, timestamp, and intended target; show one visible pointer, click ripple, and short Trying to click label in exact finding replays; explicitly request native cursor capture in human recordings. and sees explicit confirmation of successful outcome. (source: agent_assumption; why: Autopilot inferred default for success_moment from request, audience, optimization target, and mode.)
- Failure Policy: Retry inline when safe, preserve context, and escalate to support or fallback path if repeated failure continues. (source: agent_assumption; why: Autopilot inferred default for failure_policy from request, audience, optimization target, and mode.)
## Open Questions
[TODO] Track unresolved blockers here.

## Design Notes
[TODO] Record layout, IA, and state-machine notes here.

## Implementation Notes
- 2026-08-03 Implementation summary: AI QA now records a durable click-intent event immediately before every coordinate click attempt, preserves normalized click coordinates and target labels in report callbacks, and renders a branded pointer, click ripple, and plain-language “Trying to click…” label in full-session and finding-specific replays. Finding clips receive timing-rebased cues. Human screen capture explicitly requests the native cursor with a constrained-browser fallback.
- Files: lib/qa-browserbase.js, lib/qa-core.js, lib/manual-qa-widget.js, src/App.tsx, src/QaTrialPortal.tsx, src/lib/screen-capture.ts, src/types.ts, tests/qa-browserbase.test.js, tests/qa.test.js, tests/report-replay-cursor-ui.test.js, tests/screen-capture-cursor.test.js
- Components: ReplayVideoModal, SharedReportPage, AI coordinate click instrumentation, Report normalization and callback sanitization, Human screen capture helper, Manual QA widget recorder
- Assumptions used: The replay overlay is safer than injecting UI into the customer page during QA., A single short intent label is enough; raw coordinates remain hidden., Historical reports fall back to legacy successful coordinate-click events when standardized click-attempt events are unavailable., Browser permission errors must surface instead of being mistaken for unsupported cursor constraints.
## Doc Sync
- 2026-08-03 Synced after implementation.
- States touched: partial, error
- Code touched: lib/qa-browserbase.js, lib/qa-core.js, lib/manual-qa-widget.js, src/App.tsx, src/QaTrialPortal.tsx, src/lib/screen-capture.ts, src/types.ts, tests/qa-browserbase.test.js, tests/qa.test.js, tests/report-replay-cursor-ui.test.js, tests/screen-capture-cursor.test.js
