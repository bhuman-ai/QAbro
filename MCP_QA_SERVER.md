# Before Users Do QA MCP Server

This repo includes both stdio and streamable HTTP MCP servers that let LLM agents request and retrieve real Before Users Do QA runs.

Public brand note: `Before Users Do` is the product brand and `beforeusersdo.com` is the primary domain. `SwarmTester` may still appear in internal service names, legacy paths, and backwards-compatible URLs during migration.

Public setup and workflow guide: `https://beforeusersdo.com/docs`

## Scripts

```bash
npm run mcp:qa:login
npm run mcp:qa
npm run mcp:qa:http
```

## Fastest install: hosted MCP

Use the hosted Streamable HTTP endpoint when you want Codex, Cursor, Claude Desktop, or another coding agent to call Before Users Do without running a local server.

1. Open `https://beforeusersdo.com/docs` and choose **Get MCP key**.
2. Sign in or create an account with email, Google, or GitHub.
3. Create an MCP key. The secret is shown once; no brand or GitHub setup is required first.
4. Paste the generated config into your MCP client:

```json
{
  "mcpServers": {
    "beforeusersdo-qa": {
      "url": "https://mcp.beforeusersdo.com/mcp",
      "headers": {
        "Authorization": "Bearer mcp_..."
      }
    }
  }
}
```

Then ask the coding agent to call `qa_check_work` with the preview URL, changed files, what changed, and the user task it should try.

For a real person, ask the agent to call `qa_request_human_test`. The agent uses the same work context and creates the request directly; there is no separate customer form.

## First-time setup

For most users, connect once with:

```bash
npm run mcp:qa:login
```

That opens the Before Users Do sign-in page, completes magic-link auth in the browser, and stores a local MCP session for future runs.

Optional login flags:

- `--mode signup`
- `--email you@example.com`
- `--invite-code CODE`
- `--base-url https://beforeusersdo.com`

## Authentication options

### Recommended: local stored dashboard session

No service token is required after `npm run mcp:qa:login`.

Stored auth file:

- `$QA_MCP_AUTH_PATH`
- otherwise `$CODEX_HOME/swarmtester/qa-mcp-auth.json`
- otherwise `~/.codex/swarmtester/qa-mcp-auth.json`

### Advanced: service-token mode

If you want fully headless service-token auth instead:

- `QA_SERVICE_TOKEN`
- `QA_MCP_OWNER_USER_ID`
- `QA_MCP_OWNER_EMAIL`

Optional:

- `QA_MCP_BASE_URL` default: `https://beforeusersdo.com`
- `QA_MCP_DEFAULT_BRAND`
- `QA_MCP_DEFAULT_PERSONA`
- `QA_MCP_DEFAULT_EXECUTION_ENGINE`
- `QA_MCP_AUTH_PATH`
- `HUMAN_TEST_CREDENTIALS_SECRET` recommended dedicated encryption secret for private tester logins
- `QA_MCP_HTTP_HOST` default: `127.0.0.1`
- `QA_MCP_HTTP_PORT` default: `8788`
- `QA_MCP_HTTP_PATH` default: `/mcp`
- `QA_MCP_HTTP_ALLOWED_HOSTS` optional comma-separated allowlist

## Tools

- `qa_check_work`
  - Coding-agent default. Pass a preview URL plus implementation context and get a final verdict or a client-safe polling handoff while browser QA continues.
- `qa_request_run`
  - Queue a QA run for a feature or flow.
- `qa_get_run_status`
  - Read current status for a run.
- `qa_wait_for_run`
  - Wait in short slices. If it returns `continue_polling: true`, call it again immediately in the same agent turn.
- `qa_get_run_report`
  - Fetch the normalized report JSON and markdown.
- `qa_share_run_report`
  - Create a team share link for a report.
- `qa_request_human_test`
  - Request a different real person or QA professional. The agent should infer the brief from its current work and ask only for a missing URL, specific flow, or selected test-account login. No separate intake form is used.
- `qa_get_human_test_status`
  - Read the request state (`queued`, `assigned`, `in_progress`, `submitted`, or `completed`) and retrieve the report after submission.
- `qa_start_manual_review`
  - Self-review tool. Use when the owner wants to test the product themselves with the widget, drawing, voice, recording, freestyle mode, or a checklist. For a different real tester, use `qa_request_human_test`.
- `qa_create_manual_session`
  - Strict manual QA session creation tool. Use when the agent already has the target URL and context.
- `qa_manual_review_guide`
  - Returns the manual-review workflow and the context an agent should gather before creating a session.
- `qa_get_manual_session`
  - Read checklist status for a manual QA session.
- `qa_get_manual_report`
  - Export the completed manual self-review checklist as redacted Markdown and JSON.
- `qa_get_manual_work_packets`
  - Split manual QA notes, transcript, drawings, videos, page anchors, console errors, and network signals into focused agent work packets. Use this after `qa_wait_for_manual_feedback` or `qa_wait_for_manual_evidence` before summarizing, previewing, coding, or spawning sub-agents.
- `qa_run_feature_check`
  - High-level tool for preview URLs and PR deploys. It queues the run and returns either the final report or the same required polling handoff.

## Prompts

- `manual_review_workflow`
  - Agent-facing workflow for “manual review with BeforeUsersDo”. It tells the agent to gather the preview URL, work summary, changed files, acceptance criteria, scenarios, PR/branch/commit metadata, and then call `qa_start_manual_review`.

## Resources

- `qa://runs/{run_id}/status`
  - JSON snapshot of the current queue/report status.
- `qa://runs/{run_id}/report`
  - JSON normalized report for the run.
- `qa://runs/{run_id}/report.md`
  - Markdown report body for the run.
- `qa://workflows/manual-review`
  - Markdown instructions for agents that need to understand manual review setup.
- `qa://manual/{session_id}/report.md`
  - Markdown export of a manual self-review session.

## Suggested use

### From a coding agent

After the agent has a running local tunnel, preview deploy, staging URL, or production URL, it should call `qa_check_work`:

```json
{
  "target_url": "https://preview.example.com",
  "work_summary": "Added the checkout discount field and validation states",
  "changed_files": ["src/Checkout.tsx", "src/api/discounts.ts"],
  "acceptance_criteria": [
    "Customer can apply a valid discount",
    "Invalid codes show a useful error",
    "Checkout still submits after removing a discount"
  ],
  "task_to_try": "Buy a product with and without a discount code",
  "expected_success": "The order review shows the correct discounted total",
  "auth_strategy": "signup_if_needed",
  "timeout_seconds": 1200,
  "share_after": true
}
```

Expected response shape:

```json
{
  "ok": true,
  "run_id": "mcp_preview_example_com_...",
  "verdict": "needs_fix",
  "pass": false,
  "reason": "QA found a likely blocker: Checkout submit does not advance.",
  "top_finding": {
    "title": "Checkout submit does not advance",
    "severity": "high"
  },
  "evidence": {
    "ui_report_url": "https://beforeusersdo.com/...",
    "share_url": "https://beforeusersdo.com/share/...",
    "status_resource": "qa://runs/.../status",
    "report_resource": "qa://runs/.../report",
    "markdown_resource": "qa://runs/.../report.md"
  }
}
```

Long browser runs may first return a processing handoff instead of the final shape:

```json
{
  "ok": true,
  "run_id": "mcp_preview_example_com_...",
  "verdict": "processing",
  "pass": false,
  "timed_out": false,
  "continue_polling": true,
  "next_tool": {
    "name": "qa_wait_for_run",
    "arguments": {
      "run_id": "mcp_preview_example_com_...",
      "wait_slice_seconds": 35
    }
  }
}
```

Agent policy:

- Treat `pass: true` as the only automatic green result.
- When `continue_polling` is true, immediately call the supplied `next_tool` and repeat without ending the agent turn.
- Treat `needs_fix` as a blocker to repair before merge.
- Treat `needs_review` as requiring a human or maintainer decision.
- Treat `timed_out` as inconclusive, not pass.
- Do not pass API keys, session tokens, private room tokens, or raw browser storage in tool inputs.
- Pass credentials only through the `credentials` object when the QA service is expected to use them.

For a feature branch or preview:

- `target_url`: preview deployment URL
- `feature_name`: short feature label
- `task_to_try`: what the tester should attempt
- `expected_success`: what successful completion looks like
- `auth_strategy`: usually `signup_if_needed`

The MCP layer converts that into a `feature_targeted` QA run and attaches brand/auth metadata automatically.

### Real human tester

If the user says “have a real person test this,” “send this to a QA professional,” or otherwise wants someone else to test:

1. Reuse the URL, work summary, changed files, acceptance criteria, and expected behavior already in the agent's context.
2. Infer `specific_flow` when the request is about current work. Use `general_first_time_user` when the user wants broad product feedback.
3. Choose the safest access mode that permits the flow: `public_only`, `signup_allowed`, or `test_account`.
4. Never infer permission for a real purchase or irreversible action.
5. Call `qa_request_human_test`. Do not send the user to an intake form.
6. Ask the user only if the target URL, an explicitly requested flow, or selected test-account login is missing.
7. BUD prepares the private review points and publishes the request either as a new-tester qualification or as a paid assignment for approved testers. Paid work shows the exact tester pay before it can be claimed.
8. Return the request id and use `qa_get_human_test_status` later for assignment, report, and paid-assignment payout state.

```json
{
  "target_url": "https://preview.example.com/signup",
  "work_summary": "Added phone and password validation to signup",
  "acceptance_criteria": [
    "A valid signup reaches OTP",
    "Validation errors explain how to recover"
  ],
  "access_mode": "signup_allowed",
  "purchase_allowed": false
}
```

### Manual self-review

If the user asks for manual QA or says “I want to do a manual review with BeforeUsersDo,” the agent should:

1. Use the `manual_review_workflow` prompt or read `qa://workflows/manual-review` if supported.
2. Gather or infer the preview URL. If no reachable URL exists, ask the user for it.
3. Gather context from its own work: summary, changed files, branch, commit SHA, PR URL, acceptance criteria, and any explicit user instructions.
4. Call `qa_start_manual_review`.
5. Inject `widget_install.script_tag` into the preview/dev build. This is required, not optional.
6. Deploy or refresh the preview, open the target once yourself, and verify `window.__beforeUsersDoWidgetLoaded === true` or `document.querySelector("#beforeusersdo-widget-root")`.
7. Return `widget_install.review_url` as the primary test link. This opens the preview page itself with the in-page checklist widget.
8. Keep `manual_session_url` secondary as the report/dashboard link only. Do not send the human to the BeforeUsersDo dashboard as the place to start testing.
9. Do not send the human to the target page until the widget is verified.
10. Tell the human to click the floating `Review` button, draw/talk/record there, and mark checklist items.
11. If widget injection is impossible, stop and explain why. Do not silently fall back.
12. After the human clicks Send All, call `qa_wait_for_manual_feedback`, then call `qa_get_manual_work_packets`.
13. Use one work packet per focused task or sub-agent. Keep `packet_id` in your updates so the user can trace each fix back to the evidence.
14. Use `qa_get_manual_report` as the fallback historical export, not the first choice for active feedback.

Minimal call:

```json
{
  "target_url": "https://preview.example.com",
  "work_summary": "Updated onboarding recommendations and paywall layout",
  "changed_files": ["src/onboarding/Recommendations.tsx", "src/paywall/PlanModal.tsx"]
}
```

## Agent install examples

### Stdio MCP

Use this when the coding agent runs on the same machine or inside the same workspace:

```json
{
  "mcpServers": {
    "beforeusersdo-qa": {
      "command": "node",
      "args": ["/absolute/path/to/QAbro/scripts/qa-mcp-server.js"],
      "env": {
        "QA_MCP_BASE_URL": "https://beforeusersdo.com"
      }
    }
  }
}
```

Run `npm run mcp:qa:login` once on that machine, or provide service-token env vars:

```json
{
  "QA_SERVICE_TOKEN": "...",
  "QA_MCP_OWNER_USER_ID": "...",
  "QA_MCP_OWNER_EMAIL": "owner@example.com"
}
```

### Streamable HTTP MCP

Use this when multiple agents should call the same local or hosted MCP endpoint:

```bash
npm run mcp:qa:http
```

Default endpoint:

```text
http://127.0.0.1:8788/mcp
```

Health check:

```text
http://127.0.0.1:8788/health
```

## HTTP transport

The streamable HTTP server listens on:

- `http://127.0.0.1:8788/mcp` by default
- `http://127.0.0.1:8788/health` for a basic health check

## Hosted MCP

For real “any coding agent can call this” usage, deploy the streamable HTTP server as a Node service:

```bash
npm run mcp:qa:http
```

Recommended platforms:

- Cloud Run
- Fly.io
- Render
- Railway
- any Node host that supports Streamable HTTP

QA runs can take several minutes, but each MCP call waits at most 35 seconds by default and returns a structured `qa_wait_for_run` handoff. The coding agent must keep polling until `continue_polling` is false.

Hosted environment:

```bash
QA_MCP_BASE_URL=https://beforeusersdo.com
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
SUPABASE_ANON_KEY=...
QA_SERVICE_TOKEN=... # required for user MCP-key callers; also enables service-token callers
MCP_TOKEN_PEPPER=... # optional, but recommended before creating production keys
HUMAN_TEST_CREDENTIALS_SECRET=... # recommended dedicated key for private test logins
```

The server also honors platform `PORT` automatically and binds to `0.0.0.0` when `PORT` is present.

### Recommended hosted caller auth

Create a user-owned MCP key in the dashboard:

```text
Dashboard -> Settings -> Coding agents -> Create key
```

Then configure any Streamable HTTP MCP client with:

```json
{
  "mcpServers": {
    "beforeusersdo-qa": {
      "url": "https://mcp.beforeusersdo.com/mcp",
      "headers": {
        "Authorization": "Bearer mcp_..."
      }
    }
  }
}
```

MCP keys are stored server-side as hashes only. The dashboard shows the plaintext value once at creation, then only keeps the token prefix, creation time, last-used time, and revoke button.

### Internal hosted auth options

Dashboard session tokens still work for first-party flows:

```text
Authorization: Bearer <dashboard_access_token>
```

or:

```text
x-dashboard-access-token: <dashboard_access_token>
x-dashboard-refresh-token: <dashboard_refresh_token>
```

or service-token mode:

```text
x-qa-service-token: <service_token>
x-owner-user-id: <owner_user_id>
x-owner-email: <owner_email>
```

The hosted MCP server validates the caller, then forwards the correct owner context to Before Users Do QA APIs. That means one hosted MCP endpoint can serve many agents/users without baking a single owner into environment variables.
