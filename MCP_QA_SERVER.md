# Before Users Do QA MCP Server

This repo includes both stdio and streamable HTTP MCP servers that let LLM agents request and retrieve real Before Users Do QA runs.

Public brand note: `Before Users Do` is the product brand and `beforeusersdo.com` is the primary domain. `SwarmTester` may still appear in internal service names, legacy paths, and backwards-compatible URLs during migration.

## Scripts

```bash
npm run mcp:qa:login
npm run mcp:qa
npm run mcp:qa:http
```

## Fastest install: hosted MCP

Use the hosted Streamable HTTP endpoint when you want Codex, Cursor, Claude Desktop, or another coding agent to call Before Users Do without running a local server.

1. Sign in at `https://beforeusersdo.com`. Legacy `https://swarmtester.com` remains supported during the domain cutover.
2. Open Dashboard -> Settings -> Coding agents.
3. Create an MCP key. The secret is shown once.
4. Paste this into your MCP client config:

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
- `QA_MCP_HTTP_HOST` default: `127.0.0.1`
- `QA_MCP_HTTP_PORT` default: `8788`
- `QA_MCP_HTTP_PATH` default: `/mcp`
- `QA_MCP_HTTP_ALLOWED_HOSTS` optional comma-separated allowlist

## Tools

- `qa_check_work`
  - Coding-agent default. Pass a preview URL plus implementation context, wait for browser QA, and get a `pass`, `needs_fix`, `needs_review`, or `timed_out` verdict with evidence resources.
- `qa_request_run`
  - Queue a QA run for a feature or flow.
- `qa_get_run_status`
  - Read current status for a run.
- `qa_wait_for_run`
  - Poll until a run finishes or times out.
- `qa_get_run_report`
  - Fetch the normalized report JSON and markdown.
- `qa_share_run_report`
  - Create a team share link for a report.
- `qa_start_manual_review`
  - Default manual QA tool. Use when the user says “manual review with BeforeUsersDo”, “manual QA”, “human review”, or asks for a checklist for recent code changes. It returns a required widget snippet the coding agent must inject into the preview before the human opens the target page. If `target_url` is missing, it returns the exact missing field to ask for.
- `qa_create_manual_session`
  - Strict manual QA session creation tool. Use when the agent already has the target URL and context.
- `qa_manual_review_guide`
  - Returns the manual-review workflow and the context an agent should gather before creating a session.
- `qa_get_manual_session`
  - Read checklist status for a manual QA session.
- `qa_get_manual_report`
  - Export the completed human checklist as redacted Markdown and JSON.
- `qa_run_feature_check`
  - High-level one-shot tool: queue, wait, and return the final report. This is the best default for preview URLs and PR deploys.

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
  - Markdown export of a human manual QA session.

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

Agent policy:

- Treat `pass: true` as the only automatic green result.
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

### Manual human review

If the user asks for manual QA or says “I want to do a manual review with BeforeUsersDo,” the agent should:

1. Use the `manual_review_workflow` prompt or read `qa://workflows/manual-review` if supported.
2. Gather or infer the preview URL. If no reachable URL exists, ask the user for it.
3. Gather context from its own work: summary, changed files, branch, commit SHA, PR URL, acceptance criteria, and any explicit user instructions.
4. Call `qa_start_manual_review`.
5. Inject `widget_install.script_tag` into the preview/dev build. This is required, not optional.
6. Deploy or refresh the preview, open the target once yourself, and verify `window.__beforeUsersDoWidgetLoaded === true` or `document.querySelector("#beforeusersdo-widget-root")`.
7. Return the `manual_session_url`, but tell the human the target button stays locked until the widget loads once.
8. Do not send the human to the target page until the widget is verified.
9. Tell the human to click the floating `Review` button, draw/talk/record there, and mark checklist items.
10. If widget injection is impossible, stop and explain why. Do not silently fall back.
11. After the human finishes the checklist, call `qa_get_manual_report` and use the Markdown as implementation feedback.

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

For real “any coding agent can call this” usage, deploy the streamable HTTP server as a long-lived Node service:

```bash
npm run mcp:qa:http
```

Recommended platforms:

- Cloud Run
- Fly.io
- Render
- Railway
- any Node host that supports long request timeouts

Avoid putting the wait-heavy `qa_check_work` path behind a short serverless timeout. A QA run can legitimately take several minutes while the tester navigates, waits for pages, records proof, and polls for completion.

Hosted environment:

```bash
QA_MCP_BASE_URL=https://beforeusersdo.com
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
SUPABASE_ANON_KEY=...
QA_SERVICE_TOKEN=... # required for user MCP-key callers; also enables service-token callers
MCP_TOKEN_PEPPER=... # optional, but recommended before creating production keys
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
