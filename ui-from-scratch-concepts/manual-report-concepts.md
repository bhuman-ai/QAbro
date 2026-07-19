# Completed Human-Test Report Concepts

## Concept Packet

- **Primary Action:** Watch the tester's recording, then open the exact recording moment behind a completed finding.
- **Primary Risk:** Presenting a tester note, an unfinished analysis, or a missing signal as if it were a finding from the recording.
- **Information Budget:** One recording-analysis state, one recording player, one completed findings digest, one supplemental tester note, one test brief, and one secondary review handoff.
- **View Model Contract:** Submitted sessions show read-only evidence. The system transcribes the recording's audio and inspects its visible activity; only that analysis may produce findings. Notes and the requested flow are supplemental context, never findings sources. Before analysis completes, one status replaces the entire digest and `Copy report` is disabled. Setup controls, checklist metrics, note editors, raw URLs, raw transcript, and capture diagnostics are hidden from the default view. Active sessions keep the existing workbench.
- **Archetype:** Focused report reader inside the repo's guided-triage inbox.

## R1 — Recording-First Story

```text
[Dashboard]                     [Copy report]
Ciaro Pro free QA trial
[Findings ready] Recording analysis complete.

RECORDING                         Part 1 of 82
+--------------------------------------------------+
|                                                  |
|                large video player                |
|                                                  |
+--------------------------------------------------+
[Previous]          Continue through clips          [Next]

WHAT THE TESTER FOUND
Bugs
• The primary action did not respond in Chrome.
  [Watch part 23 at 0:06]

Frustrations
• The tester hesitated after the action produced no response.
  [Watch part 23 at 0:08]

Aha moments
None found in the recording.

TESTER'S NOTE · SUPPLEMENTAL
“...”

WHAT THEY WERE ASKED TO DO
...

[Qualification review pending]   Technical details ▾
```

- Simplified: one reading column and one proof surface.
- Merged: 82 segments become one playlist.
- Explained: completed audio transcription and visual analysis become one vertical Bugs / Frustrations / Aha digest immediately after proof.
- Evidence-linked: every supported finding can select its clip and seek to its clip-relative timestamp.
- Safe to share: `Copy report` is disabled until analysis completes, then mirrors only the recording-derived digest and omits the tester note as evidence, internal agent tasks, benchmark data, developer context, raw transcript, and raw evidence URLs.
- Hidden: widget setup, checklist metrics, status editor, raw transcript, raw links, agent context, capture logs.
- Risk: long recordings need reliable clip order and visible fallback controls.

### R1 analysis states

```text
not_started  Preparing the report… [automatic]
queued       Preparing the report…
processing   Analyzing the recording and speech… 23 of 82 parts.
complete     Recording-derived digest + timestamp evidence + [Copy report]
failed       We couldn't analyze the recording. [Try again, only when retryable]
```

Category headings and empty-category claims stay hidden in `not_started`, `queued`, `processing`, and `failed`. `Copy report` stays disabled in those states. The recording remains playable whenever media is available. The raw transcript appears only inside collapsed `Technical details`.
Submitted legacy recordings enter the same automatic analysis queue without a second tester action.

## R2 — Proof And Takeaway Split

```text
[Needs review]
----------------------------------------------------
| large recording player | Tester note             |
| Part 1 of 82           | Test brief              |
| Previous / Next        | Review handoff          |
----------------------------------------------------
Technical details ▾
```

- Strength: recording and interpretation remain visible together.
- Risk: recreates the screenshot's narrow side column and collapses poorly on smaller laptops.

## R3 — Filmstrip Reader

```text
[Needs review]
| clip 1 |  +---------------------------------------+
| clip 2 |  | main recording                        |
| clip 3 |  +---------------------------------------+
| ...    |  Tester note
```

- Strength: rapid navigation for expert reviewers.
- Risk: 82 clips turn navigation into noise and compete with the video.

## R4 — Review Workstation

```text
[Recording]                         [Private benchmarks]
[large player]                      [ ] issue 1
[clip controls]                     [ ] issue 2
[tester note]                       [clarity score]
                                    [Publish score]
```

- Strength: shortest operator scoring path.
- Risk: makes private scoring controls dominate before the recording is understood; wrong default for customer/admin report access.

## R5 — Evidence Timeline

```text
[Submitted]
Tester note
10:01 clip 1 [play]
10:11 clip 2 [play]
10:21 clip 3 [play]
...
```

- Strength: preserves capture chronology.
- Risk: 82 repeated rows create a scroll wall and fragment playback.

## R6 — Setup / Report Hybrid

```text
[Checklist metrics] [Widget setup] [Pending item editor]
[Recording links]
```

- Strength: smallest code change.
- Risk: fails the primary action, truth state, and information budget. This is the current screen and is gated out.

## Coverage And Gates

| Requirement | R1 | R2 | R3 | R4 | R5 | R6 |
|---|---|---|---|---|---|---|
| F14 truthful submitted state | D | D | D | D | D | M |
| F15 continuous recording | D | D | D | D | P | M |
| F16 takeaway and brief | D | D | S | S | D | P |
| F17 review handoff | S | D | H | D | H | P |
| F18 technical disclosure | H | H | H | H | H | D |
| F19 human-test findings digest | D | D | S | D | P | M |
| FL12 watch and understand | D | D | D | P | P | M |
| FL13 continue to review | D | D | P | D | P | P |

R6 fails P0 coverage. R4 and R5 fail the P0 flow-integrity gate. R1, R2, and R3 survive.

## Persona Walkthrough On Survivors

This is simulated feedback from the supplied desktop screenshot and the ASCII concepts, not real user research.

- **Stressed founder:** R1 makes the recording the first unmistakable object and explains why the report is not yet a verdict. R2's second column still feels like work to scan. R3 makes 82 clips look more complicated than the test itself.
- **Speed-focused BUD operator:** R1 provides enough status before the operator returns to the existing guarded scoring workspace. R2 is fast on a large monitor but cramped on a laptop. R3 is useful only when hunting a known moment.
- **Low-confidence occasional user:** R1 has one safe top-to-bottom path. R2 creates uncertainty about which side to read first. R3's filmstrip looks like an editing tool.

Full-page sweep: R1 uses the viewport for the evidence and removes accidental dead space. R2 risks a narrow note column. R3 overweights navigation chrome. All three must collapse to one column on mobile; only R1 does so without changing its mental model.

## Professional Critique

- **R1:** strongest hierarchy and archetype fit. It avoids the generic card-grid pattern by using one editorial evidence surface and plain section breaks. The only meaningful visual emphasis is the recording.
- **R2:** competent but visually repeats the current split-panel mistake. The sidebar can become a tall rounded card with little useful density.
- **R3:** has expert-tool character, but the filmstrip is ornamental until clips have thumbnails or annotations. It adds interaction before it adds meaning.

## Score

| Concept | Coverage (30) | Flow (25) | Clarity (20) | Hierarchy (10) | Density (5) | Archetype (5) | Risk (5) | Total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| R1 | 30 | 25 | 20 | 10 | 5 | 5 | 4 | 99 |
| R2 | 30 | 25 | 15 | 7 | 3 | 4 | 4 | 88 |
| R3 | 28 | 22 | 13 | 6 | 2 | 3 | 2 | 76 |

## Winner

**R1 — Recording-First Story.** It is the only survivor that keeps the recording, truth state, takeaway, and next step obvious at desktop and mobile widths without introducing a second navigation model.
