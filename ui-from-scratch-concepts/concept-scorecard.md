# Concept Scorecard

## Source Of Truth
- Primary archetype reused: guided triage inbox from `/Users/don/BHuman/QAbro/UI_ARCHETYPE.md`
- Brand system reused: `Bricolage Grotesque`, `Plus Jakarta Sans`, semantic colors, `.btn`, `.card-surface`, `.status-pill`, existing auth and modal shells
- Kid-simple pressure held constant: one obvious action, one dominant work area, advanced items hidden until asked for

## Concept Thumbnails

### Concept A: Guided Triage Inbox
```text
[Top bar: Brand | Project | Start Test]
---------------------------------------------------------
| Tests / filters | Selected test                         |
| - current run   | [Summary + next step]                |
| - older runs    | [Problems list]                      |
| - queued runs   | [Proof strip]                        |
|                 | [More details ▾ journey / replay /   |
|                 |  engineering / share / automation]   |
---------------------------------------------------------
```

### Concept B: Single-Column Test Story
```text
[Top bar: Brand | Start Test]
--------------------------------------------
[Current project]
[Current or selected test summary]
[Problems]
[Proof]
[Older tests accordion]
[More tools accordion]
--------------------------------------------
```

### Concept C: Reader With History Drawer
```text
[Top bar: Brand | Start Test | Tests ▸]
---------------------------------------------------------
| (drawer closed by default)                             |
| [Full-width selected test reader]                      |
| [Summary + next step]                                  |
| [Problems]                                             |
| [Proof]                                                |
| [More details ▾]                                       |
---------------------------------------------------------
| Slide-out drawer: project + run history + filters      |
---------------------------------------------------------
```

### Concept D: Status Board Dashboard
```text
[Top bar: Brand | Start Test | Automations]
---------------------------------------------------------
| Queued | Running | Ready | Failed                      |
| card   | card    | card  | card                        |
---------------------------------------------------------
| Side panel: selected detail                            |
---------------------------------------------------------
```

### Concept E: Fullscreen Wizard Then Reader
```text
Step 1 site -> Step 2 user -> Step 3 goal -> Start
---------------------------------------------------
[Waiting room while queued]
---------------------------------------------------
[Single report reader]
[History only in a later drawer]
---------------------------------------------------
```

### Concept F: Command Palette Workspace
```text
[Top bar: Brand | Search tests / actions | +]
---------------------------------------------
[Sparse landing screen]
[Everything else opened from search / panels]
---------------------------------------------
```

## Hard Gates
- No `P0` feature is `M`
- No `P0` flow is `M` or `P`
- Primary action is obvious
- Navigation can be explained in one sentence
- Critical states exist somewhere in the concept

## Gate Results
- `A` passes
- `B` passes
- `C` passes
- `D` fails: primary action is diluted by status columns and it drifts back into “dashboard” behavior
- `E` fails: `FL04` and `FL05` are only partial because existing-test browsing and live monitoring get buried
- `F` fails: launch and selection become too expert-only for the repo’s child-simple bar

## Persona QA On Survivors

This is simulated concept QA on ASCII concepts, not real user research.

### Concept A
- Cautious first-time user: immediately understands “pick a test on the left, read the answer on the right”; pauses only on the hidden utilities surface
- Speed-focused repeat user: clicks `Start Test` or the newest row immediately and likes that history never disappears
- Low-confidence user: benefits from the visible list and summary-first detail because nothing important feels hidden
- Full-page visual risk: if the left list gets too narrow or too tall with empty padding, it could still feel like a dashboard; density must stay tight

### Concept B
- Cautious first-time user: understands the story flow but is unsure where “current test” ends and “older tests” begin
- Speed-focused repeat user: dislikes extra scrolling and the loss of quick compare behavior
- Low-confidence user: reads safely top to bottom but may not realize the old tests accordion matters
- Full-page visual risk: the page can become a long stack of cards with weak rhythm and too much vertical drag

### Concept C
- Cautious first-time user: loves the focused report once it is open but may miss the history drawer trigger
- Speed-focused repeat user: appreciates the clean reader and quick switching once the drawer habit is learned
- Low-confidence user: can get stuck wondering how to “go back to all tests”
- Full-page visual risk: a hidden drawer can make the page feel empty if the reader header does not anchor the left edge strongly enough

## Professional Critique On Survivors

### Concept A
- Strongest hierarchy: one obvious `Start Test` action, one visible history source, one dominant reader
- Best archetype fit: closest to the repo’s written guided triage inbox without inheriting dashboard clutter
- Best simplification pattern: list stays for retrieval, detail stays for comprehension, everything advanced moves into one disclosure lane

### Concept B
- Clear enough, but it collapses list and detail into one long narrative that slows repeat use
- Too easy to regress into stacked-card AI sludge if not aggressively compressed
- Better as a mobile fallback than as the primary desktop concept

### Concept C
- The cleanest reader composition, but its simplicity depends on a drawer many users will not discover instantly
- Great density for reading, weaker clarity for “where are my other tests?”
- Strong candidate for a later refinement if the app becomes more report-reader-first than inbox-first

## Scoring
Scale: `1` poor to `5` excellent

| Concept | Coverage (30) | Flow Integrity (25) | Clarity (20) | Hierarchy (10) | Density (5) | Archetype Fit (5) | Impl Risk (5) | Total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| A | 30 | 25 | 20 | 10 | 5 | 5 | 4 | 99 |
| B | 24 | 20 | 14 | 7 | 3 | 4 | 4 | 76 |
| C | 30 | 25 | 16 | 8 | 4 | 5 | 3 | 91 |
| D | gated out | gated out | gated out | gated out | gated out | gated out | gated out | gated out |
| E | gated out | gated out | gated out | gated out | gated out | gated out | gated out | gated out |
| F | gated out | gated out | gated out | gated out | gated out | gated out | gated out | gated out |

## Winner
- Winner: `A` Guided Triage Inbox
- Why it won: it is the only concept that keeps retrieval, launch, live progress, and report reading all obvious without looking like a metrics dashboard
- What it risks: left-rail bloat, over-padded empty states, and too many secondary actions leaking back into the main frame
- What gets coded next: homepage and dashboard should both collapse into the same grammar, with a tight launch pad on home and an inbox-reader shell in app

## Completed Human-Test Report Addendum

The global shell winner remains Concept A. Inside its selected-reader area, the completed human-test report uses the report-specific `R1 — Recording-First Story` winner documented in `manual-report-concepts.md`. This preserves the guided-triage shell while giving raw human evidence a truthful, focused reading mode.
