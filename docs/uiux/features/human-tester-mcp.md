# Human Tester Requests Through MCP

## Job

Let a product owner ask their coding agent for a real person to test the current work without opening or repeating an intake form.

## Product Archetype

This is a marketplace handoff inside an existing developer tool. The coding agent prepares the brief, a BUD operator publishes it, and a signed-in tester claims and completes it in the browser.

## Primary Flow

1. The owner tells their coding agent to have a real person or QA professional test the product.
2. The agent calls `qa_request_human_test` with the URL and context it already has: changed feature, expected behavior, scenarios, changed files, and safe access policy.
3. MCP asks the owner to choose cash, QA credit, or an explicit free qualification trial. Cash and QA credit require an exact budget.
4. If the URL, funding choice, paid budget, specific flow, or selected test-account login is genuinely missing, MCP asks only for that missing information.
5. BUD creates a queued request. Queued means awaiting preparation and publication, not matching a tester. The owner does not fill out another form.
6. A BUD operator adds private review points and publishes the request. A customer-confirmed paid budget cannot be changed.
7. An eligible tester claims it from `/testers/jobs`, or a BUD operator reserves it for a specific person who already said they are available. No MCP is installed or used by the tester.
8. A directly invited tester receives one private link and skips the application and jobs pages. The existing private trial flow records the tester's screen, voice, notes, and evidence.
9. `qa_get_human_test_status` reports queued, available, assigned, in-progress, submitted, or completed state and returns the report after submission.

## Information Budget

### Product Owner

- One request to the coding agent
- Only missing URL, funding, budget, or access questions
- Request id and current status
- Final evidence-backed report

### BUD Operator

- Waiting product and tester brief
- Access mode, never plaintext credentials
- Confirmed job type and exact tester pay when paid
- One primary action: `Publish test`
- One follow-up action after publication: `Invite tester`
- Private review points before publication

### Tester

- What to test
- Whether to stay public, create an account, or use a test account
- Private test credentials only when needed
- Explicit prohibited actions
- Start and finish recording
- No MCP, coding agent, or code access

## Access Contract

- `public_only` is the default.
- `signup_allowed` permits a fresh test account.
- `test_account` requires a complete username and password.
- Real purchases and irreversible actions default to forbidden.
- Test credentials are encrypted at rest and omitted from MCP responses, request lists, admin views, exports, and customer links.
- Plaintext credentials are exposed only through the assigned tester's private role link.

## Scope Contract

- Context about a changed feature produces `specific_flow`.
- A request without feature context becomes `general_first_time_user` rather than forcing another question.
- Funding is never inferred. Paid human QA requires `cash` or `qa_credit` plus an exact budget.
- `qualification_trial` is available only as an explicit tester-and-buyer trial choice.
- The agent must infer details from its current work and must not send the owner to a separate customer form.

## Reused System

- Brand tokens and one-column operator layout come from the existing BUD operator UI.
- Assignment, email delivery, recording, evidence storage, scoring, and customer rating reuse the tester qualification trial.
- No new customer-facing dashboard or intake form is introduced.
