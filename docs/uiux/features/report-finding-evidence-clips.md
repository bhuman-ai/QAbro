# Feature: Finding-level video proof

## User job

Buyers and developers need to verify every report claim without searching a full recording.

## Primary action

Each finding has one **Watch this moment** action that opens its exact clip or timestamp range.

## Primary risk

The report must never present an unrelated recording or a fabricated neutral sentiment as proof.

## Information budget

- Show the finding, severity, explanation, and one proof action.
- Keep the full-session recording collapsed as secondary context.
- If no verified mapping exists, say **Video proof unavailable for this finding**.

## Concept options

1. Full recording with markers: compact, but forces buyers to search.
2. Finding-owned proof moment: one exact proof action per finding.
3. Split-pane evidence workstation: powerful, but too dense for shared reports and mobile.

## Concept winner

Finding-owned proof moment. It matches the buyer's immediate decision, reuses the existing cards and replay modal, and works in one column on mobile.

## Implementation

- Every generated finding receives timestamped experience spans.
- Stored step clips retain finding ID, title, type, severity level, and clip timing.
- Shared reports resolve finding-tagged clips first, then verified timeline spans.
- Replay seeks to the finding start and pauses at the end of the proof window.
- No reaction label renders when timestamped reaction data is absent.
- Long full-session recordings retain their existing multi-part playback.

## Files

- `src/App.tsx`
- `src/lib/format.ts`
- `src/types.ts`
- `lib/qa-core.js`
- `lib/qa-local-publish.js`
- `tests/qa.test.js`
- `tests/qa-local-publish.test.js`
- `tests/report-finding-evidence-ui.test.js`
