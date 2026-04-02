# SwarmTester QA MCP Server

This repo now includes both stdio and streamable HTTP MCP servers that let LLM agents request and retrieve real SwarmTester QA runs.

## Scripts

```bash
npm run mcp:qa:login
npm run mcp:qa
npm run mcp:qa:http
```

## First-time setup

For most users, connect once with:

```bash
npm run mcp:qa:login
```

That opens the SwarmTester sign-in page, completes magic-link auth in the browser, and stores a local MCP session for future runs.

Optional login flags:

- `--mode signup`
- `--email you@example.com`
- `--invite-code CODE`
- `--base-url https://swarmtester.com`

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

- `QA_MCP_BASE_URL` default: `https://swarmtester.com`
- `QA_MCP_DEFAULT_BRAND`
- `QA_MCP_DEFAULT_PERSONA`
- `QA_MCP_DEFAULT_EXECUTION_ENGINE`
- `QA_MCP_AUTH_PATH`
- `QA_MCP_HTTP_HOST` default: `127.0.0.1`
- `QA_MCP_HTTP_PORT` default: `8788`
- `QA_MCP_HTTP_PATH` default: `/mcp`
- `QA_MCP_HTTP_ALLOWED_HOSTS` optional comma-separated allowlist

## Tools

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
- `qa_run_feature_check`
  - High-level one-shot tool: queue, wait, and return the final report. This is the best default for preview URLs and PR deploys.

## Resources

- `qa://runs/{run_id}/status`
  - JSON snapshot of the current queue/report status.
- `qa://runs/{run_id}/report`
  - JSON normalized report for the run.
- `qa://runs/{run_id}/report.md`
  - Markdown report body for the run.

## Suggested use

For a feature branch or preview:

- `target_url`: preview deployment URL
- `feature_name`: short feature label
- `task_to_try`: what the tester should attempt
- `expected_success`: what successful completion looks like
- `auth_strategy`: usually `signup_if_needed`

The MCP layer converts that into a `feature_targeted` QA run and attaches brand/auth metadata automatically.

## HTTP transport

The streamable HTTP server listens on:

- `http://127.0.0.1:8788/mcp` by default
- `http://127.0.0.1:8788/health` for a basic health check
