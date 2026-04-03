# Swarm Tester UI Archetype

## Product Job To Be Done

Help a product owner run a real first-time-user test on a public site, then quickly see what broke and what to fix first.

## Target Users

- Founders, PMs, and growth owners who need a quick answer without reading logs.
- Designers and QA leads who want proof from a real browser run.
- Engineers who need the smallest useful evidence bundle after the summary is clear.

## Single Main Action

- Before a run: `Start Test`
- After a run: `Open Test`

If a screen does not clearly support one of those actions, simplify it again.

## Primary Archetype

### Guided Triage Inbox

Swarm Tester should behave like a simple inbox of test runs with one selected detail view.
It should not behave like a broad analytics dashboard.

Use this product grammar:

- One list of tests.
- One selected test detail.
- One plain-language summary at the top.
- One obvious next step.
- Proof after the summary.
- Advanced details behind disclosure.

This matches the real job:

- Users are not here to explore metrics.
- Users are here to answer one question: what broke for a new user, and what should we fix next?

## Secondary References

### 1. Linear

Reference:

- https://linear.app/docs/inbox
- https://linear.app/docs/triage-intelligence

Borrow:

- List-detail triage flow
- Sparse navigation
- Clear selected-item state
- Calm surfaces with low visual noise
- Suggestions and metadata kept secondary to the main issue

Avoid:

- Dense workflow taxonomies
- Keyboard-heavy expert affordances in the main UI
- Too many filters visible at once
- Team and admin chrome competing with the issue itself

### 2. Typeform

Reference:

- https://help.typeform.com/hc/en-us/articles/360052366812-Welcome-Screen
- https://help.typeform.com/hc/en-us/articles/360054770931-Use-branching-logic-to-show-relevant-questions

Borrow:

- Strong welcome state
- One question or decision at a time
- Large click targets
- Simple step copy
- Branching that hides irrelevant choices

Avoid:

- Decorative filler
- Long intros
- Conversational fluff
- Optional settings shown too early

### 3. Sentry

Reference:

- https://docs.sentry.io/product/dev-toolbar/
- https://docs.sentry.io/pdfs/developer-quick-reference-guide.pdf

Borrow:

- Summary first, detail second
- Context grouped around the current issue
- Evidence ordered from most useful to least useful
- Secondary diagnostics collapsed until needed

Avoid:

- Telemetry walls
- Engineering-first jargon at the top of the page
- Multiple panels competing for attention
- Metrics as the default reading path

## What We Reuse From The Repo

### Tokens

- `Space Grotesk` as the main UI font
- `JetBrains Mono` only for logs or machine output
- Existing semantic colors in [`styles.css`](/Users/don/BHuman/QAbro/styles.css) and [`dashboard.css`](/Users/don/BHuman/QAbro/dashboard.css):
  - `--background`
  - `--foreground`
  - `--card`
  - `--border`
  - `--muted-foreground`
  - `--primary`
  - `--accent`
  - `--radius`

### Shared Patterns

- `.btn`
- `.card-surface`
- `.status-pill`
- Existing auth-card and form field patterns
- Existing report-detail and modal shells, simplified instead of replaced

## Naming Rules

Prefer plain words:

- `Test`, not `Run` when talking to users
- `User`, not `Persona`
- `Goal`, not `Mission`
- `Problem`, not `Finding` when the simpler word fits
- `Details`, `Live`, `Start Test`, `Open Test`, `Open Report`

Keep machine terms only where the user truly needs them.

## Kid-Simple Rules For This Repo

- One primary action per screen
- One main column or one clear work area by default
- One email entry path for auth, with team code hidden behind disclosure
- Hide advanced filters, diagnostics, and repo-aware controls behind disclosure
- Keep helper copy to one short sentence when possible
- Remove badges, pills, and metrics that do not change the next action
- Use summary, fix, proof order in report screens and modals
- If a child could not tell what to click in five seconds, simplify it again

## Page Intent

### Homepage

Use a launch-pad pattern.

- Show what the tool does
- Ask for the minimum inputs
- Let the user start a test immediately

### Dashboard

Use the guided triage inbox pattern.

- Show tests
- Open one test
- Show the next step first

### New Test Modal

Use the guided form pattern.

- One choice at a time
- Hide optional inputs
- Keep the submit action obvious

### Report And Problem Modal

Use the issue-detail pattern.

- What went wrong
- What should have happened
- What to fix
- Proof
- Extra details only on demand
