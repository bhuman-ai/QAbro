# Human Tester Requests Through MCP

## Job

Let a product owner ask their coding agent for a real person to test the current work without opening or repeating an intake form.

## Product Archetype

This is a marketplace handoff inside an existing developer tool. The coding agent prepares the brief, a BUD operator assigns the tester, and the tester completes the work in the existing private trial portal.

## Primary Flow

1. The owner tells their coding agent to have a real person or QA professional test the product.
2. The agent calls `qa_request_human_test` with the URL and context it already has: changed feature, expected behavior, scenarios, changed files, and safe access policy.
3. If the URL, specific flow, or selected test-account login is genuinely missing, MCP asks only for that missing information.
4. BUD creates a queued request. The owner does not fill out another form.
5. A BUD operator sees the request under `Waiting for a tester`, selects it, chooses a tester, and adds private benchmark issues.
6. The existing private trial flow records the tester's screen, voice, notes, and evidence.
7. `qa_get_human_test_status` reports queued, assigned, in-progress, submitted, or completed state and returns the report after submission.

## Information Budget

### Product Owner

- One request to the coding agent
- Only missing access questions
- Request id and current status
- Final evidence-backed report

### BUD Operator

- Waiting product and tester brief
- Access mode, never plaintext credentials
- One primary action: `Pair tester`
- Tester identity and private benchmark during assignment

### Tester

- What to test
- Whether to stay public, create an account, or use a test account
- Private test credentials only when needed
- Explicit prohibited actions
- Start and finish recording

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
- The agent must infer details from its current work and must not send the owner to a separate customer form.

## Reused System

- Brand tokens and one-column operator layout come from the existing BUD operator UI.
- Assignment, email delivery, recording, evidence storage, scoring, and customer rating reuse the tester qualification trial.
- No new customer-facing dashboard or intake form is introduced.
