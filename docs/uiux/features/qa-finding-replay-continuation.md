# Feature: Finding replay continuation

## User job

Reviewers need to open the exact moment behind a finding, then freely continue watching or scrub elsewhere in the complete recording.

## Primary action

Play the finding replay.

## Primary risk

The evidence timestamp must orient playback without becoming an artificial end boundary.

## Information budget

- Keep the existing native video controls.
- Start at the finding timestamp.
- Explain in one sentence that the reviewer can continue or scrub anywhere.
- Add no second player or playback controls.

## Mode and concept

Patch the existing replay modal. The finding time range remains report context and cursor-cue timing, while the video element owns playback through its real media duration.

## Implementation

- Removed the finding end timestamp from the player component contract.
- Removed the `timeupdate` pause at the evidence-window end.
- Preserved the initial seek, native controls, full-session duration, overlay timing, and multi-part continuation.

## Files

- `src/App.tsx`
- `tests/report-finding-evidence-ui.test.js`
- `docs/uiux/features/report-finding-evidence-clips.md`
