# Concept B

## Summary
- Primary archetype: guided story feed
- Primary user: first-time or occasional user who prefers one vertical path
- Primary action: `Start Test`
- Navigation model: one top bar and one stacked page; history and extra tools collapse into accordions
- Core screens: homepage launch pad, auth gate, stacked report page, problem modal, optional live block

## ASCII
```text
[Brand]                                              [Start Test]
=================================================================
[Current project]
[Latest test summary + next step]

[Problems]
- Problem card ..................................... [Details]
- Problem card ..................................... [Details]

[Proof]
- replay
- screenshots
- journey

[Live status]  (only while active)
- queue / progress / open live watch

[Older tests ▾]
- prior run
- prior run
- prior run

[More tools ▾]
- share
- compare
- engineering
- schedules
- ops
=================================================================
```

## What Changed
- Simplified: everything becomes a single reading column
- Merged: report, live, and history become stacked blocks instead of separate panes
- Hidden behind disclosure: history, share, engineering, schedules, operator tools
- Left unchanged: homepage launch and problem modal structure

## Flow Placement
- FL01: home launch pad stays the same
- FL02: auth gate unlocks the story page
- FL03: `Start Test` opens the same wizard
- FL04: existing tests live under `Older tests`
- FL05: active runs insert a live block near the top
- FL06: report reading is naturally linear
- FL07: sharing lives in `More tools`
- FL08: compare and retry live in `Older tests`
- FL09: engineering lives in `More tools`
- FL10: schedules and alerts live in `More tools`
- FL11: operator tools stay in `More tools`

## Risk
- What might confuse users: “current test” versus “older tests” can blur together
- What might be missing: fast compare behavior for repeat users
- What needs validation: whether the long vertical stack feels too slow on desktop
