# Tester Application

## User Job

Let a person who is interested in paid product testing apply in about two minutes without learning the rest of the Before Users Do platform.

## Primary Action

`Apply to be a tester`

Before sign-in, `Continue with Google` is the primary version of that same action. GitHub is the secondary sign-in option.

## Flow

1. The visitor opens `/testers/apply` from outreach or the homepage.
2. Google or GitHub returns the visitor to the same application URL.
3. The visitor gives their name, location, available devices, experience, and usual availability.
4. The visitor confirms they can record their screen and speak their thoughts in English.
5. Before Users Do stores one application for the signed-in user.
6. The confirmation opens `/testers/jobs`, where the applicant can choose an available qualification.

## Information Budget

- One benefit: paid testing work.
- One form: information needed for matching.
- One next step: see available tests.
- One clear disclosure: the first qualification test is unpaid; approved customer tests are paid.

Do not show scores, trial administration, or job details on this page. Those belong on `/testers/jobs`.

## States

- Loading: quiet centered progress indicator.
- Signed out: benefit, real tester faces, Google, and GitHub.
- Applying: one form with large selections and a single submit action.
- Error: one short inline explanation near the action.
- Received: a direct `See available tests` action.

## Data And Safety

- Authentication owns the applicant id and email; browser input cannot override them.
- One application is stored per authenticated user.
- The server accepts only known device, experience, and availability values.
- Qualification status and session assignment remain server-managed.
- The table is protected by row-level security and accessed through authenticated server routes.

## Responsive Contract

- Keep one reading column at every width.
- Stack identity fields and choice groups on small screens.
- Keep every tap target at least 44 pixels high.
- Never require horizontal scrolling.
