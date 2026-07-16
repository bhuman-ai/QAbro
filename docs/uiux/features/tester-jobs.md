# Tester Jobs

## User Job

Let an accepted tester see a prepared qualification request, take it without waiting for an operator email, and reopen the private recording portal until submission.

## Product Archetype

A small marketplace job board. The primary action is `Take test`, not dashboard analysis.

## Primary Flow

1. The tester signs in and completes `/testers/apply`.
2. The application confirmation links directly to `/testers/jobs`.
3. A BUD operator prepares an MCP request with private review points and publishes it.
4. Eligible desktop applicants see only the safe product brief, duration, and access mode.
5. `Take test` atomically reserves the request so only one tester can claim it.
6. BUD creates the existing private qualification trial and opens it immediately.
7. The tester can return to `/testers/jobs` and use `Start test`, `Continue test`, or `View submission`.
8. Completed work remains under a collapsed history section.

## Information Budget

- One current test, when one exists.
- Otherwise, available qualifications and one `Take test` action per request.
- Product name, plain-language brief, duration, and safe access mode.
- Application status only when it changes the next action.

Do not show the customer email, target URL before claim, credentials, private review points, MCP setup, marketplace metrics, or operator controls.

## Safety And State

- The jobs route requires the tester's normal BUD login. It never requires MCP.
- Only an application owned by the signed-in user can claim or reopen a test.
- Qualification claiming currently requires `computer` because browser screen capture is desktop-Chrome-first.
- A conditional database update changes `available` to `assigned`; a second claimant receives a conflict.
- Test-account credentials remain encrypted and appear only inside the private tester portal.
- The original emailed tester token remains valid when the dashboard issues a resumable token.

## Responsive Contract

- One column at every width.
- No permanent navigation rail.
- Primary actions remain at least 44 pixels high.
- Briefs wrap naturally without horizontal scrolling.
