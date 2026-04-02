# Swarm Tester Programmatic E2E Runbook

This runbook explains how to use Swarm Tester end to end from another system (for example, your AI talking-head walkthrough platform).

It covers:

- machine setup (worker host)
- API authentication
- queueing runs
- live progress (webhook first, polling fallback)
- final report + evidence retrieval
- signature verification
- production-safe retry/error handling

## 1) Architecture (current production)

Components:

1. API plane (Vercel, `swarmtester.com`)
2. Queue + report store (Supabase table `swarmtest_reports`)
3. Worker plane (your machine running `scripts/qa-worker.js`)
4. Optional consumer (your video pipeline webhook receiver)

Flow:

1. Your backend calls `POST /api/qa/run`.
2. API validates and enqueues job in Supabase (`status=queued`).
3. Worker machine claims queued jobs and executes local Playwright QA.
4. Worker writes live progress into the queue row.
5. Worker emits optional webhooks (`run.started`, `run.progress`, `run.completed`, `run.failed`).
6. Worker finalizes report in Supabase.
7. Your system fetches final report and evidence media.

## 2) Base URLs

Use production base URL:

- `https://swarmtester.com`

Notes:

- `https://qaswarm.dev` redirects to `https://swarmtester.com`.
- If using `curl` with redirected hosts, add `-L`.

## 3) Auth model

Server-to-server auth uses a service token.

Supported headers:

- `x-qa-service-token: <QA_SERVICE_TOKEN>`
- `Authorization: Bearer <QA_SERVICE_TOKEN>`

Owner scoping:

- Always send `x-owner-user-id: <SUPABASE_USER_ID>`.
- This is required for service-token run creation and listing.

## 4) Worker machine setup

### 4.1 Prerequisites

- Ubuntu 22.04+ (or similar Linux)
- Node.js 20+
- npm
- Playwright Chromium dependencies

One-time install example:

```bash
sudo apt-get update
sudo apt-get install -y curl git ca-certificates
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 4.2 Pull code and install

```bash
git clone <your-repo-url> /opt/qabro
cd /opt/qabro
npm ci
npx playwright install --with-deps chromium
```

### 4.3 Worker env (`/opt/qabro/.env.local`)

```bash
SUPABASE_URL=https://<your-supabase>.supabase.co
SUPABASE_SERVICE_KEY=<supabase_service_role_key>
QA_CALLBACK_SECRET=<internal_callback_secret_used_by_worker>
QA_PUBLIC_APP_URL=https://swarmtester.com
QA_LOCAL_HEADLESS=true
QA_LOCAL_OUTPUT_ROOT=/opt/qabro/output/playwright
```

### 4.4 Start worker

Foreground:

```bash
cd /opt/qabro
npm run qa:worker
```

Single job then exit:

```bash
npm run qa:worker:once
```

Long-running service example (systemd):

```ini
[Unit]
Description=Swarm Tester QA Worker
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/qabro
EnvironmentFile=/opt/qabro/.env.local
ExecStart=/usr/bin/node /opt/qabro/scripts/qa-worker.js
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
```

## 5) Queueing runs programmatically

Endpoint:

- `POST /api/qa/run`

Required body fields:

- `run_id` (string, make unique)
- `target_url` (`http/https`)

Recommended fields for walkthroughs:

- `scope_mode: "feature_targeted"`
- `scenario_list: [...]`
- `brand_persona`
- `credentials` (if login required)
- `metadata.owner_user_id` (also send header)
- `webhook` (recommended)

### 5.1 Request example (recommended)

```bash
curl -X POST "https://swarmtester.com/api/qa/run" \
  -H "Content-Type: application/json" \
  -H "x-qa-service-token: $QA_SERVICE_TOKEN" \
  -H "x-owner-user-id: $OWNER_USER_ID" \
  -d '{
    "run_id": "walkthrough_1741300000000",
    "target_url": "https://app.example.com",
    "scope_mode": "feature_targeted",
    "scenario_list": [
      "Log in and reach dashboard",
      "Create first project",
      "Invite one teammate"
    ],
    "brand_persona": "A first-time PM narrating confusion, trust, and aha moments.",
    "credentials": {
      "login_url": "https://app.example.com/login",
      "username": "qa@example.com",
      "password": "secret",
      "otp_mode": "provider_hook"
    },
    "metadata": {
      "owner_user_id": "<SUPABASE_USER_ID>",
      "brand_key": "app.example.com",
      "workflow_type": "walkthrough_video"
    },
    "webhook": {
      "url": "https://video-pipeline.example.com/hooks/swarm",
      "secret": "optional-signing-secret",
      "events": ["run.started", "run.progress", "run.completed", "run.failed"],
      "headers": {
        "x-vendor-account": "acct_123"
      }
    }
  }'
```

Response:

- `202 Accepted`
- includes `status_url`, `report_url`, `ui_report_url`, queue metadata

### 5.2 Dry-run validation (no queue write)

Send `"dry_run": true`.

Use this to validate payloads, prompts, and webhook shape before real execution.

## 6) Webhook mode (recommended)

If `webhook.url` is provided, worker emits events.

Supported events:

- `run.started`
- `run.progress`
- `run.completed`
- `run.failed`

Headers sent:

- `x-swarm-event`
- `x-swarm-sent-at` (unix seconds)
- `x-swarm-signature` when `webhook.secret` exists

Signature format:

- `x-swarm-signature: t=<timestamp>,v1=<hex_hmac_sha256>`
- signed payload: `<timestamp>.<raw_body>`

Envelope shape:

```json
{
  "event": "run.progress",
  "sent_at": "2026-03-06T19:00:00.000Z",
  "run_id": "walkthrough_1741300000000",
  "data": {
    "run_id": "walkthrough_1741300000000",
    "target_url": "https://app.example.com",
    "status_url": "https://swarmtester.com/api/qa/status?run_id=...",
    "report_url": "https://swarmtester.com/api/qa/report?run_id=...",
    "ui_report_url": "https://swarmtester.com/dashboard?view=report&run_id=...",
    "queue_status": "processing",
    "progress": {
      "phase": "processing",
      "percent": 58,
      "message": "OTP gate detected"
    }
  }
}
```

Completion events include:

- `data.report` (normalized full report JSON)
- `data.summary`
- `data.findings_count`

`run.progress` cadence:

- emitted when phase changes or progress crosses a 10% bucket

### 6.1 Node signature verification example

```js
import crypto from "node:crypto";

function verifySwarmSignature({ secret, rawBody, signatureHeader }) {
  if (!signatureHeader) return false;
  const parts = Object.fromEntries(
    String(signatureHeader)
      .split(",")
      .map((x) => x.trim().split("="))
      .filter((x) => x.length === 2)
  );
  const ts = parts.t;
  const sig = parts.v1;
  if (!ts || !sig) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${ts}.${rawBody}`)
    .digest("hex");

  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}
```

## 7) Polling mode (fallback)

If you do not use webhooks, poll:

- `GET /api/qa/status?run_id=<RUN_ID>`

Stop when:

- `report_ready=true`, or
- queue reaches terminal state

Terminal queue/report statuses to treat as done:

- `completed`
- `partial`
- `failed`
- `failed_validation`

Recommended polling strategy:

1. Poll every 5 seconds for first 2 minutes.
2. Then every 10 seconds.
3. Timeout at 45 minutes for feature-targeted runs.

## 8) Fetch final report and media

### 8.1 Final report

- `GET /api/qa/report?run_id=<RUN_ID>`
- optional markdown: `GET /api/qa/report?run_id=<RUN_ID>&format=markdown`

Response includes:

- `report` (structured JSON)
- `markdown`
- `ui_report_url`

### 8.2 Evidence media

- `GET /api/qa/evidence?run_id=<RUN_ID>&kind=screenshot&index=0`
- `GET /api/qa/evidence?run_id=<RUN_ID>&kind=video&index=0`

Increment `index` until 404.

### 8.3 List runs for one owner

- `GET /api/qa/reports?owner_user_id=<OWNER_USER_ID>&limit=50`

For service-token auth this owner scope is mandatory.

## 9) End-to-end integration pattern (recommended)

1. Generate unique `run_id`.
2. `POST /api/qa/run` with `webhook` and `owner_user_id`.
3. On `run.started`, create pipeline record in your DB.
4. On `run.progress`, update UI/live timeline.
5. On `run.completed` or `run.failed`:
   - persist final `data.report`
   - fetch extra media via `/api/qa/evidence`
   - generate narration script from `findings` + `tested_journeys`
   - render talking-head output
6. Store `ui_report_url` for deep-link back to Swarm Tester report.

## 10) Error handling and retries

HTTP handling:

- `400`: payload invalid (fix request)
- `401`: invalid/missing service token
- `404`: run/evidence not found (wrong run_id/owner)
- `415`: evidence kind/index not embeddable
- `5xx`: transient server/infra issue, retry with backoff

Recommended retries:

1. For `POST /api/qa/run`, retry only on network/5xx.
2. Do not retry 4xx without correcting input.
3. Webhook receiver should be idempotent by `(event, run_id, sent_at)`.

## 11) Security checklist

1. Keep `QA_SERVICE_TOKEN` server-side only.
2. Rotate token periodically.
3. Always send `x-owner-user-id`.
4. Use webhook signature verification when `webhook.secret` is set.
5. Reject webhook events with invalid signature.
6. Optionally reject very old timestamps to reduce replay risk.

## 12) Quick Node client

Ready example script:

- `/Users/don/QAbro/scripts/walkthrough-api-client-example.mjs`

Usage:

```bash
QA_SERVICE_TOKEN=... \
OWNER_USER_ID=... \
WEBHOOK_URL=https://video-pipeline.example.com/hooks/swarm \
WEBHOOK_SECRET=... \
node scripts/walkthrough-api-client-example.mjs https://app.example.com
```

Outputs saved to:

- `output/walkthrough-api/<run_id>/report.json`
- `output/walkthrough-api/<run_id>/report.md`
- `output/walkthrough-api/<run_id>/narration-input.json`
- downloaded evidence files

## 13) Source-of-truth files in this repo

- `/Users/don/QAbro/api/qa/run.js`
- `/Users/don/QAbro/api/qa/status.js`
- `/Users/don/QAbro/api/qa/report.js`
- `/Users/don/QAbro/api/qa/evidence.js`
- `/Users/don/QAbro/api/qa/reports.js`
- `/Users/don/QAbro/lib/auth.js`
- `/Users/don/QAbro/lib/qa-core.js`
- `/Users/don/QAbro/lib/qa-queue.js`
- `/Users/don/QAbro/scripts/qa-worker.js`
- `/Users/don/QAbro/scripts/walkthrough-api-client-example.mjs`
