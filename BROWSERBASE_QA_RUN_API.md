# Browserbase QA Queue API

This is the current production architecture for Browserbase QA runs.

## Architecture

Vercel no longer waits for the Browserbase session to finish.

Current flow:

1. Client calls `POST /api/qa/run`
2. Vercel validates the request
3. Vercel enqueues the job into Supabase
4. Vercel returns immediately with `202 Accepted`
5. An external worker claims the queued job from Supabase
6. The worker runs Browserbase
7. The worker normalizes the report and sends the final callback
8. Final report remains stored in Supabase and can be fetched by `run_id`

Practical result:
- Vercel is only used for intake and status/report reads.
- Vercel is not in the critical path while Browserbase is actually running.
- Long QA runs no longer need to keep the original API request open.

## Storage Model

To avoid a migration, the queue currently uses the existing `swarmtest_reports` table.

That table now acts as both:
- queue storage for in-flight jobs
- final result storage for completed jobs

Queue state is stored inside `payload.queue`.

Top-level `status` moves through states such as:
- `queued`
- `processing`
- `retryable`
- final report statuses:
  - `completed`
  - `partial`
  - `failed`
  - `failed_validation`

## Endpoints

- `POST https://swarmtester.com/api/qa/run`
- `GET https://swarmtester.com/api/qa/status?run_id=<RUN_ID>`
- `GET https://swarmtester.com/api/qa/report?run_id=<RUN_ID>`
- `GET https://swarmtester.com/api/qa/report?run_id=<RUN_ID>&format=markdown`

The worker still sends the final callback to:

- `POST https://swarmtester.com/api/qa-report-callback`

## Required Environment Variables

### Vercel API Side

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `QA_CALLBACK_SECRET`
- `QA_SERVICE_TOKEN` (required for server-to-server API access without dashboard cookies)

### Worker Side

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `QA_CALLBACK_SECRET`
- `BROWSERBASE_API_KEY`
- `BROWSERBASE_PROJECT_ID`
- `OPENAI_API_KEY`

Optional:

- `QA_MODEL`
- `QA_VISION_API_KEY` (overrides `OPENAI_API_KEY` for `vision_only` planner calls)
- `QA_VISION_BASE_URL` (OpenAI-compatible `/v1` base URL for `vision_only`; for example OpenRouter)
- `QA_VISION_MODEL` (supports provider-prefixed model IDs when `QA_VISION_BASE_URL` is not OpenAI)
- `QA_PUBLIC_APP_URL`
- `QA_CALLBACK_URL`
- `QA_WORKER_ID`

Optional coordinate localization:

- `QA_COORDINATE_LOCALIZATION_ORDER` (default prefers configured clients in this order: `ocr_qwen`, `vision_llm`)
- `QA_COORDINATE_ANNOTATION_QWEN_API_KEY` (enables OCR candidate localization with DashScope/Qwen OCR)
- `QA_COORDINATE_ANNOTATION_QWEN_BASE_URL` (default `https://dashscope-intl.aliyuncs.com`)
- `QA_COORDINATE_ANNOTATION_QWEN_MODEL` (default `qwen-vl-ocr`)
- `QA_COORDINATE_OCR_JUDGE_API_KEY` (optional LLM judge for duplicate OCR labels; falls back to `OPENAI_API_KEY` when set)
- `QA_COORDINATE_OCR_JUDGE_MODEL` (default `gpt-4.1-mini`)
- `QA_COORDINATE_VISION_API_KEY` (enables direct vision coordinate localization; falls back to `OPENROUTER_API_KEY`)
- `QA_COORDINATE_VISION_BASE_URL` (default `https://openrouter.ai/api/v1`)
- `QA_COORDINATE_VISION_MODEL` (default `qwen/qwen2.5-vl-72b-instruct`)
- `QA_COORDINATE_VISION_MAX_TOKENS` (default `180`)
- `QA_COORDINATE_ANNOTATION_PROVIDER` (only used by `yellow_box_diff`; supports `openai`, `openrouter_image`, `gemini`, `fal`, `replicate`)
- `QA_COORDINATE_ANNOTATION_OPENROUTER_API_KEY` (enables OpenRouter image annotation; falls back to `OPENROUTER_API_KEY`)
- `QA_COORDINATE_ANNOTATION_MODEL` (for `openrouter_image`, default `openai/gpt-image-1-mini`)
- `QA_COORDINATE_ANNOTATION_OPENROUTER_BASE_URL` (default `https://openrouter.ai/api/v1`)

Recommended low-cost order for `vision_only` QA:

```sh
QA_COORDINATE_LOCALIZATION_ORDER=ocr_qwen,vision_llm
QA_COORDINATE_VISION_MODEL=qwen/qwen2.5-vl-72b-instruct
```

Keep `ui_tars` and `yellow_box_diff` out of the order unless they are explicitly being evaluated. `ui_tars` has been unreliable on small unlabeled controls, and `yellow_box_diff` is the image-generation fallback that costs materially more per click than coordinate localization.

Local managed-inbox smoke for email-code flows:

```sh
node scripts/run-local-agent-task.js \
  --target https://bhuman.ai/ \
  --goal "Start free signup, use the managed inbox email, submit the emailed security code, and stop at onboarding." \
  --managed_inbox true \
  --otp_provider mailtm \
  --otp_subject_pattern "BHuman|security|code|verification|verify"
```

The local artifact redacts managed-inbox tokens and passwords while keeping the generated test email visible for debugging.

Developer handoff bundles are generated automatically by `scripts/run-local-agent-task.js` unless disabled with `--dev_handoff false`.
The bundle includes a redacted report, run log, extracted screenshots, copied videos/blocker clips, console logs, network logs, and failed-request JSONL:

```sh
node scripts/run-local-agent-task.js \
  --target https://bhuman.ai/ \
  --goal "Start free signup and stop at the first blocker." \
  --managed_inbox true \
  --dev_handoff true \
  --dev_handoff_zip true
```

To export an already saved local artifact:

```sh
npm run qa:export-dev-handoff -- \
  --artifact output/<run_id>_local_agent_full.json \
  --zip true
```

If `--artifact` is omitted, the exporter uses the newest `*_local_agent_full.json` under `output/`.

## Service Token Auth (for external walkthrough-video services)

You can call QA endpoints without dashboard cookies by sending a service token:

- Header: `x-qa-service-token: <QA_SERVICE_TOKEN>`
- or `Authorization: Bearer <QA_SERVICE_TOKEN>`

When listing runs (`GET /api/qa/reports`), include owner identity:

- Header: `x-owner-user-id: <supabase_user_id>`
- or query: `owner_user_id=<supabase_user_id>`

When creating runs (`POST /api/qa/run`) with service token auth, `owner_user_id` is required.
Provide it in either:

- request metadata: `metadata.owner_user_id`
- or header: `x-owner-user-id`

## `POST /api/qa/run`

### Purpose

Validate the request and enqueue a QA job. It does not execute Browserbase inline anymore.

### Request Body

```json
{
  "run_id": "string-unique",
  "target_url": "https://example.com",
  "scope_mode": "core_20m",
  "scenario_list": ["optional scenario text"],
  "brand_persona": "John Doe, 32-year-old marketer from Brooklyn, technical but non-developer",
  "credentials": {
    "login_url": "https://example.com/login",
    "username": "qa@example.com",
    "password": "secret",
    "otp_mode": "none"
  },
  "source": "qa_bot",
  "metadata": {
    "campaign_id": "camp_123",
    "operator_id": "op_456"
  },
  "webhook": {
    "url": "https://video-pipeline.example.com/hooks/swarm",
    "secret": "optional-signing-secret",
    "events": ["run.started", "run.progress", "run.completed", "run.failed"],
    "headers": {
      "x-vendor-account": "acct_123"
    }
  },
  "dry_run": false,
  "model": "gpt-4.1-mini"
}
```

### Validation Rules

Same request validation as before:

- `run_id` required
- `target_url` must be valid `http` or `https`
- `scope_mode` must be one of:
  - `core_20m`
  - `deep_45m`
  - `feature_targeted`
- `scenario_list` required when `scope_mode=feature_targeted`
- `credentials`, if present, must be valid
- `credentials.otp_mode` must be one of:
  - `none`
  - `manual_prompt`
  - `provider_hook`
- `webhook`, if present, must include a valid `https://` URL
- `webhook.events`, if provided, must be one or more of:
  - `run.started`
  - `run.progress`
  - `run.completed`
  - `run.failed`

### Dry Run Behavior

If `dry_run=true`, nothing is queued.

The endpoint returns:
- normalized request
- generated scope config
- generated Browserbase prompts
- callback URL
- report URL
- status URL
- UI report URL (`/?run_id=...&brand=...#qa-dashboard` when brand metadata is available)

### Queue Response

If `dry_run=false`, the endpoint returns immediately with `202`.

Example:

```json
{
  "ok": true,
  "queued": true,
  "run_id": "run_123",
  "report_url": "https://swarmtester.com/api/qa/report?run_id=run_123",
  "status_url": "https://swarmtester.com/api/qa/status?run_id=run_123",
  "ui_report_url": "https://swarmtester.com/?run_id=run_123&brand=brand_123#qa-dashboard",
  "queue": {
    "run_id": "run_123",
    "status": "queued",
    "queue_status": "queued",
    "target": "example.com",
    "report_url": "https://swarmtester.com/api/qa/report?run_id=run_123",
    "status_url": "https://swarmtester.com/api/qa/status?run_id=run_123",
    "enqueued_at": "2026-03-04T00:00:00.000Z",
    "started_at": null,
    "completed_at": null,
    "attempt_count": 0,
    "max_attempts": 3,
    "callback_ok": null,
    "callback_status": null,
    "last_error": null,
    "report_ready": false,
    "latest_report_status": "queued"
  }
}
```

### Service-token example

```bash
curl -X POST "https://swarmtester.com/api/qa/run" \
  -H "Content-Type: application/json" \
  -H "x-qa-service-token: $QA_SERVICE_TOKEN" \
  -H "x-owner-user-id: <SUPABASE_USER_ID>" \
  -d '{
    "run_id": "walkthrough_1741280000000",
    "target_url": "https://app.example.com",
    "scope_mode": "feature_targeted",
    "scenario_list": [
      "Log in with provided credentials.",
      "Create a new workspace.",
      "Invite a teammate."
    ],
    "brand_persona": "A first-time product manager narrating each step and confusion point.",
    "credentials": {
      "login_url": "https://app.example.com/login",
      "username": "qa@example.com",
      "password": "secret",
      "otp_mode": "provider_hook"
    },
    "metadata": {
      "brand_key": "example.com",
      "owner_user_id": "<SUPABASE_USER_ID>",
      "workflow_type": "walkthrough_video"
    }
  }'
```

## `GET /api/qa/status`

### Purpose

Fetch the current queue state for a `run_id`.

### Query Params

- `run_id` required

### Response

```json
{
  "ok": true,
  "run_id": "run_123",
  "queue": {
    "run_id": "run_123",
    "status": "processing",
    "queue_status": "processing",
    "target": "example.com",
    "report_url": "https://swarmtester.com/api/qa/report?run_id=run_123",
    "status_url": "https://swarmtester.com/api/qa/status?run_id=run_123",
    "enqueued_at": "2026-03-04T00:00:00.000Z",
    "started_at": "2026-03-04T00:01:00.000Z",
    "completed_at": null,
    "attempt_count": 1,
    "max_attempts": 3,
    "callback_ok": null,
    "callback_status": null,
    "last_error": null,
    "report_ready": false,
    "latest_report_status": "processing"
  },
  "report_ready": false,
  "report_url": "https://swarmtester.com/api/qa/report?run_id=run_123",
  "status_url": "https://swarmtester.com/api/qa/status?run_id=run_123",
  "report_status": "processing",
  "ui_report_url": "https://swarmtester.com/?run_id=run_123&brand=brand_123#qa-dashboard"
}
```

## Webhook Mode (no polling required)

If `webhook.url` is provided in `POST /api/qa/run`, the worker emits selected events directly:

- `run.started`
- `run.progress`
- `run.completed`
- `run.failed`

Headers:

- `x-swarm-event`: event name
- `x-swarm-sent-at`: unix timestamp (seconds)
- `x-swarm-signature`: `t=<ts>,v1=<hmac_sha256(ts + "." + raw_body)>` (when `webhook.secret` exists)

Webhook payload:

```json
{
  "event": "run.progress",
  "sent_at": "2026-03-06T19:00:00.000Z",
  "run_id": "run_123",
  "data": {
    "run_id": "run_123",
    "target_url": "https://example.com",
    "status_url": "https://swarmtester.com/api/qa/status?run_id=run_123",
    "report_url": "https://swarmtester.com/api/qa/report?run_id=run_123",
    "ui_report_url": "https://swarmtester.com/dashboard?view=report&run_id=run_123",
    "queue_status": "processing",
    "progress": {
      "phase": "processing",
      "percent": 58,
      "message": "OTP gate detected"
    }
  }
}
```

`run.completed` and `run.failed` include `data.report` with the normalized final report JSON.

## `GET /api/qa/report`

### Purpose

Fetch the stored final report by `run_id`.

### Query Params

- `run_id` required
- `format=markdown` optional

The JSON response also includes:

- `ui_report_url` so clients can deep-link directly to the report view in the main dashboard.

### Behavior

- If a final report exists, returns the stored normalized report JSON and Markdown.
- If the job is only queued/processing and no final `report_json` is stored yet, it falls back to a minimal report view built from the row.
- If the `run_id` does not exist, returns:

```json
{
  "ok": false,
  "error": "QA report not found"
}
```

## Worker Runtime

The worker is now a standalone script in this repo:

- [qa-worker.js](/Users/don/QAbro/scripts/qa-worker.js)

### Worker Behavior

1. Polls Supabase for the next `queued` or `retryable` row.
2. Claims exactly one row by transitioning it to `processing`.
3. Reads the queued `run_request` from `payload.run_request`.
4. Runs Browserbase via the shared executor.
5. Normalizes and validates the report.
6. Sends the final callback.
7. Updates queue metadata in Supabase.

### Worker Commands

Run continuously:

```bash
npm run qa:worker
```

Run once and exit:

```bash
npm run qa:worker:once
```

Direct invocation:

```bash
node scripts/qa-worker.js --once
node scripts/qa-worker.js --interval-ms 5000
node scripts/qa-worker.js --worker-id worker-a --interval-ms 15000
```

### Local Env Bootstrap

For convenience, the worker auto-loads these files if the key env vars are missing:

- `.tmp/vercel.env`
- `.env.local`

That makes it easier to run locally after pulling envs from Vercel.

## Browserbase Prompting and Report Schema

The shared prompt/report logic still uses the same strict model:

- persona-driven QA behavior
- required taxonomy-based findings
- full QA packet output on every run:
  - `findings`
  - `tested_journeys`
  - `evidence_gallery`
  - `recommendations`
- required per-finding fields:
  - `expected_behavior`
  - `observed_behavior`
  - `emotional_reaction.primary`
- screenshot evidence required for every finding
- Markdown developer report generated from normalized JSON

Even when findings are sparse, the normalized report still includes:

- multiple tested journey entries (with steps/pages/evidence)
- a run-level evidence gallery (screenshots/videos/session/debug links)
- concrete recommendation list for next actions

Allowed finding types:

- `bug`
- `frustration_point`
- `confusion_point`
- `aha_moment`
- `dead_end`
- `performance_issue`
- `accessibility_issue`
- `copy_issue`

Allowed emotions:

- `confidence`
- `uncertainty`
- `frustration`
- `delight`
- `confusion`
- `trust`
- `distrust`

## Callback Delivery

The worker still uses the existing callback endpoint:

- `POST https://swarmtester.com/api/qa-report-callback`

Retry behavior:
- retries on network and `5xx`
- backoff: `1s`, `2s`, `5s`, `10s`, `20s`
- no retry on `400` or `401`

If callback delivery fails:
- queue state becomes `retryable` while attempts remain
- queue state becomes `failed` when max attempts is exhausted
- the report JSON and Markdown are still stored in the row payload for recovery

## Security Note

The queued `run_request` is stored in Supabase inside `payload.run_request`.

That means:
- if you pass login credentials in the request, they are currently stored in the queue payload
- this is pragmatic and lets the external worker run without another secrets broker
- if you want tighter security later, the next upgrade is replacing raw credentials with a secure credential reference

## Verified In This Refactor

Verified locally:
- queue insert logic
- queue claim logic
- core schema tests
- worker script syntax

Verified in production before this refactor:
- `POST /api/qa/run` dry-run path
- `GET /api/qa/report` not-found path

After deploying this refactor, re-verify these live:

1. `POST /api/qa/run` returns `202` and queue metadata
2. `GET /api/qa/status` reflects `queued`
3. `npm run qa:worker:once` claims and processes a real queued run
4. `GET /api/qa/report` returns the final stored report
