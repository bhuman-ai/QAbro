# Tester Operations

## User Job

Let a Before Users Do operator turn a new tester application into an approved tester without maintaining a spreadsheet.

## Primary Action

`Set up qualification`

After a qualification passes, the primary action becomes `Approve for paid tests`.

## Flow

1. The operator opens `/testers/admin` and sees the newest applications first.
2. The operator opens one applicant and reviews their location, devices, experience, and availability.
3. `Set up qualification` opens the existing paired-trial flow with the tester name and email already filled in.
4. Creating the trial links its session to the application and marks the application `Qualification sent`.
5. Publishing the trial score marks the linked application `Passed qualification`.
6. The operator approves the tester for paid work or declines the application.

## Information Budget

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
