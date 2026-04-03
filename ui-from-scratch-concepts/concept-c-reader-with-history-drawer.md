# Concept C

## Summary
- Primary archetype: report reader with retrieval drawer
- Primary user: repeat user who reads reports often and launches new tests occasionally
- Primary action: `Start Test`
- Navigation model: focused reader first, history drawer second
- Core screens: homepage launch pad, auth gate, reader shell, slide-out history drawer, wizard, modal

## ASCII
```text
[Brand] [Tests ▸]                                   [Start Test]
=================================================================
|                                                               |
| Selected test reader                                          |
|---------------------------------------------------------------|
| [status] What happened                                        |
| One-sentence summary + next action                            |
|                                                               |
| Problems                                                      |
| [problem] [Details]                                           |
| [problem] [Details]                                           |
|                                                               |
| Proof                                                         |
| screenshots / replay / journey                                |
|                                                               |
| More details ▾ engineering / share / schedules / ops          |
|                                                               |
=================================================================

Drawer opened:
-------------------------------------------------
| Project ▼                                      |
| [search] [filters ▾]                           |
| newest run                                     |
| queued run                                     |
| older run                                      |
| failed run                                     |
-------------------------------------------------
```

## What Changed
- Simplified: the reader gets the full viewport first
- Merged: live and report states reuse the same reader surface
- Hidden behind disclosure: history drawer, advanced filters, engineering, schedules, operator tools
- Left unchanged: wizard and problem modal logic

## Flow Placement
- FL01: home launch pad is unchanged
- FL02: auth gate unlocks the reader shell
- FL03: `Start Test` opens the wizard from the top bar
- FL04: project and run retrieval live in the slide-out drawer
- FL05: live status takes over the reader header while running
- FL06: report reading is maximally focused
- FL07: share stays in the reader action row or advanced disclosure
- FL08: retry and older runs stay in the drawer
- FL09: engineering lives in `More details`
- FL10: schedules live in `More details`
- FL11: operator tools live in a guarded utilities panel

## Risk
- What might confuse users: people may not notice the drawer quickly enough
- What might be missing: immediate visibility of “all my tests” for low-confidence users
- What needs validation: whether the drawer trigger remains obvious on desktop and mobile
