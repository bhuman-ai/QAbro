# Tester Operations

## User Job

Let a Before Users Do operator publish either a qualification or a paid customer assignment, review the submitted work, and record payment without maintaining a spreadsheet.

## Primary Action

`Publish test`

After a paid report passes review, the primary action becomes `Mark paid`.

## Concept Packet

- **Primary Action:** Publish the waiting request.
- **Primary Risk:** Publishing a paid test without an explicit tester price, or sending it to applicants who are not approved.
- **Information Budget:** Request scope, job type, tester pay, duration, private review points, and one publish action.
- **View Model Contract:** Qualification jobs target `applied` testers; paid jobs target `approved` testers; only paid jobs carry payout state.
- **Concept Options:** Add a second paid-work admin area; extend the existing request preparation area.
- **Concept Winner:** Extend the existing preparation area and change its copy and fields from the selected job type.

## Flow

1. The operator opens `/trials` to see MCP-created requests waiting for a tester, or `/testers/admin` to see the newest applications.
2. Selecting a waiting request shows its product, URL, and brief.
3. The operator chooses `Qualification` or `Paid`, adds private review points, and sets exact tester pay for paid work.
4. An eligible tester claims it from `/testers/jobs`.
5. A qualification claim creates the existing trial, links it to the application, and marks the application `Qualification sent`.
6. A paid claim keeps the tester approved and creates the same private recording experience with paid-work copy.
7. Publishing a qualification score marks the linked application `Passed qualification`.
8. Reviewing paid work marks its payment `Approved`; the operator records `Paid` after sending payment.

## Information Budget

- Waiting request list: product, brief, scope, access mode, and one `Prepare test` action.
- Available request list: product and waiting-to-be-claimed state.
- Request preparation: job type, exact tester pay when paid, private review points, and one `Publish test` action.
- Applicant list: name, location, and current status.
- Applicant detail: matching information and one next action.
- Source, dates, decline, and manual status repair remain secondary.
- No marketplace metrics, score dashboards, bulk actions, or permanent filter bar.

## Security

- The application form remains scoped to the signed-in applicant.
- The global list and status changes require a dashboard session whose email appears in `TESTER_OPERATOR_EMAILS` (or `BUD_OPERATOR_EMAILS`), or valid service-token authentication.
- The browser can update only known application statuses and an existing qualification session id.
- Supabase service credentials remain server-only.

## Responsive Contract

- Use one column on mobile and desktop.
- Keep applicant rows and primary actions at least 44 pixels tall.
- Wrap email, device, and location text instead of causing horizontal scrolling.
