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

Then ask naturally for the kind of QA you want. The agent should use one of the three primary start tools and continue the flow with `qa_continue`.

- AI tests the product: `qa_ai_test`
- You personally review it with the recording widget: `qa_self_review`
- Another real person tests it: `qa_hire_tester`

The optional routing skill lives at `skills/beforeusersdo-qa`. It helps agents recognize these intents, but all payment, setup, and completion rules are enforced by the MCP server even without the skill.

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

- `qa_ai_test`
  - Primary AI QA tool. Starts an automated browser test and returns a structured state plus a `qa_continue` resume token.
- `qa_self_review`
  - Primary self-review tool. Creates the page widget flow and remains in `needs_setup` until the server detects that the widget loaded.
- `qa_hire_tester`
  - Primary real-person QA tool. Requires explicit cash, QA-credit, or qualification-trial funding. Cash and QA credit require an exact budget.
- `qa_continue`
  - Primary next-step tool for missing questions, widget verification, progress, evidence processing, and finished reports.

The tools below are legacy compatibility tools. New agents should not select them unless an existing integration explicitly depends on their older schemas:

- `qa_check_work`
  - Legacy coding-agent check.
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
  - Legacy real-person request. Prefer `qa_hire_tester`.
- `qa_get_human_test_status`
  - Read the request state (`queued`, `assigned`, `in_progress`, `submitted`, or `completed`) and retrieve the report after submission.
- `qa_start_manual_review`
  - Legacy self-review tool. Prefer `qa_self_review`.
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
  - Agent-facing self-review workflow. It routes new sessions through `qa_self_review` and all subsequent states through `qa_continue`.

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

### AI QA

Call `qa_ai_test` with the reachable URL and a plain-English goal:

```json
{
  "target_url": "https://preview.example.com",
  "goal": "Buy a product with and without a discount code",
  "expected_result": "The order review shows the correct discounted total",
  "access": "signup_allowed",
  "after_feedback": "report"
}
```

If it returns `state: "running"`, call `qa_continue` with the returned `resume_token`. Do not use the legacy run/status/report tools for a new flow.

### Real human tester

Call `qa_hire_tester`. If funding is missing, relay its exact question and resume with `qa_continue`.

```json
{
  "target_url": "https://preview.example.com/signup",
  "goal": "Create an account and reach the dashboard",
  "payment_method": "cash",
  "budget_usd": 25,
  "access": "signup_allowed",
  "purchase_allowed": false
}
```

Never select `qualification_trial` unless the user explicitly asks for the free tester-and-buyer trial. The flow does not return `state: "complete"` until the report has video evidence and completed transcript-derived analysis.

### Manual self-review

Call `qa_self_review`. Install the exact widget returned in `required_action`, load the target page, and then call `qa_continue`. The server keeps the flow in `needs_setup` until it detects the widget.

Minimal call:

```json
{
  "target_url": "https://preview.example.com",
  "goal": "Review the new onboarding recommendations",
  "style": "guided",
  "after_feedback": "report"
}
```

For every flow, default to report-only. Use `preview` or `fix_and_retest` only when the user explicitly authorizes that behavior.

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
