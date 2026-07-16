# Tester Operations

## User Job

Let a Before Users Do operator prepare customer requests for self-service tester claiming and approve submitted qualifications without maintaining a spreadsheet.

## Primary Action

`Publish test`

After a qualification passes, the primary action becomes `Approve for paid tests`.

## Flow

1. The operator opens `/trials` to see MCP-created requests waiting for a tester, or `/testers/admin` to see the newest applications.
2. Selecting a waiting request shows its product, URL, and brief.
3. The operator adds private review points and publishes the request.
4. An eligible tester claims it from `/testers/jobs`.
5. Claiming creates the existing trial, links it to the application, and marks the application `Qualification sent`.
6. Publishing the trial score marks the linked application `Passed qualification`.
7. The operator approves the tester for paid work or declines the application.

## Information Budget

- Waiting request list: product, brief, scope, access mode, and one `Prepare test` action.
- Available request list: product and waiting-to-be-claimed state.
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
