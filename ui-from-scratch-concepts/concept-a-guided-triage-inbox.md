# Concept A

## Summary
- Primary archetype: guided triage inbox
- Primary user: founder, PM, or QA lead who wants one answer fast
- Primary action: `Start Test`
- Navigation model: one top bar and one list-detail workspace; everything advanced lives in a single utilities or disclosure layer
- Core screens: homepage launch pad, protected inbox, setup wizard, live watch, report reader, problem modal

## ASCII
```text
HOME

[Brand]                                   [Open Tests]
---------------------------------------------------------------
 Test your site like a real new user.
 [ site________________ ] [ email____________ ] [ Start Test ]
 We run it and email the report link.
 1. Open site  2. Try main flow  3. Read clear report
---------------------------------------------------------------


APP SHELL

[Brand] [Project ▼]                                   [Start Test]
===================================================================
| Tests                                                       |   |
| [search] [more filters ▾]                                  |   |
|-------------------------------------------------------------|   |
| Newest test                                                 |   |
| Queued test                                                 |   |
| Older completed test                                        |   |
| Failed test                                                 |   |
|-------------------------------------------------------------|   |
| Share, compare, schedules, repo help live in Utilities ▾    |   |
===================================================================
| Selected test reader                                            |
|-----------------------------------------------------------------|
| [status] What happened                                         |
| One-sentence summary + one obvious next action                 |
|                                                                 |
| Problems                                                        |
| 1. Problem row ....................................... [Details]|
| 2. Problem row ....................................... [Details]|
|                                                                 |
| Proof                                                          |
| screenshot thumb   replay chip   journey chip                  |
|                                                                 |
| More details ▾                                                  |
| journey timeline / engineering triage / share / automations    |
-------------------------------------------------------------------


SETUP WIZARD

[1 Site] [2 User] [3 Goal] [4 Start]
---------------------------------------------------------------
 Step 1: Start page
 [ your-site.com________________________ ]
 [Continue]

 Step 2: User
 [ First-time visitor ]
 [ Careful buyer      ]
 [ Busy visitor       ]
 [Use a different user ▾]

 Step 3: Goal
 [ Reach the first win           ]
 [ Finish setup                  ]
 [ Create the first saved thing  ]
 [Use a different goal ▾]

 Step 4: Review
 Site | User | Goal
 Start Test uses the live public flow and saves proof.
 [Back]                                     [Start Test]
---------------------------------------------------------------


LIVE / MODAL

Reader header flips to queue/live mode when active:
[Queued] Estimated start in 2m
[Open live watch]

Problem modal:
[Problem]
What went wrong
What should have happened
What to fix
Proof
Extra details ▾
```

## What Changed
- Simplified: one persistent history list, one persistent reader, one clear start button
- Merged: dashboard, reports, and live entry into one shell instead of three competing page models
- Hidden behind disclosure: advanced filters, share tools, engineering triage, schedules, operator tools
- Left unchanged: core product entities of tests, projects, problems, proof, and shared reports

## Flow Placement
- FL01: homepage launch pad queues directly into the inbox-reader shell
- FL02: auth gate protects the shell but shared report still bypasses full sign-in
- FL03: `Start Test` opens the four-step wizard
- FL04: tests stay in the left column with project and filters at the top
- FL05: the selected reader swaps from summary mode to queue/live mode while running
- FL06: the reader stays summary -> problems -> proof -> more details
- FL07: share lives in utilities and in the report header actions
- FL08: retry and older-test actions live beside the current test context, not in a separate analytics area
- FL09: engineering triage lives under `More details`
- FL10: schedules and alerts live under `Utilities`
- FL11: operator pack launcher lives under `Utilities` on a separate guarded route

## Risk
- What might confuse users: if the utilities layer accumulates too many actions, it will become a junk drawer
- What might be missing: a very explicit empty-state path for brand-new accounts with zero tests
- What needs validation: desktop-to-mobile collapse of the left list without turning the product into a scroll wall
