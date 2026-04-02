# Service-Token Walkthrough API Guide

This guide is for server-to-server integrations (for example an AI talking-head video platform)
that need to run QA/walkthrough sessions without dashboard browser cookies.

## 1) Configure API Service Token

Set on the Swarm Tester API deployment:

- `QA_SERVICE_TOKEN=<long-random-secret>`

Recommended:

- 64+ hex chars (or equivalent entropy)
- rotate periodically
- keep separate per environment

## 2) Auth Headers

Use either:

- `x-qa-service-token: <QA_SERVICE_TOKEN>`
- `Authorization: Bearer <QA_SERVICE_TOKEN>`

For user-scoped operations include owner:

- `x-owner-user-id: <supabase_user_id>`

## 3) Queue a walkthrough run

`POST /api/qa/run`

Notes:

- `owner_user_id` is required for service-token run creation.
- For targeted walkthroughs use `scope_mode=feature_targeted` with explicit `scenario_list`.
- Optional webhook mode can push run updates to your system without polling.

Example:

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
      "Log in and reach dashboard.",
      "Create a project and configure first setting.",
      "Invite teammate and confirm invite state."
    ],
    "brand_persona": "A first-time PM narrating each action and confusion point.",
    "credentials": {
      "login_url": "https://app.example.com/login",
      "username": "qa@example.com",
      "password": "secret",
      "otp_mode": "provider_hook"
    },
    "metadata": {
      "owner_user_id": "<SUPABASE_USER_ID>",
      "brand_key": "example.com",
      "workflow_type": "walkthrough_video"
    },
    "webhook": {
      "url": "https://video-pipeline.example.com/hooks/swarm",
      "secret": "optional-signing-secret",
      "events": ["run.started", "run.progress", "run.completed", "run.failed"]
    }
  }'
```

## 4) Poll live status

`GET /api/qa/status?run_id=<RUN_ID>`

Response includes:

- `queue` (queued/processing/completed)
- `progress` (phase, percent, message)
- `run_log` (ordered execution events)
- `live_report` (incremental findings/journeys while running)
- `artifacts.local_video_path` when available

## 5) Fetch final report

`GET /api/qa/report?run_id=<RUN_ID>`

Response includes:

- `report` (normalized structured JSON)
- `markdown` (developer-ready narrative)
- `ui_report_url` (shareable dashboard report view)

## 6) Fetch media for narration/video render

`GET /api/qa/evidence?run_id=<RUN_ID>&kind=video&index=0`

`GET /api/qa/evidence?run_id=<RUN_ID>&kind=screenshot&index=0`

Use these URLs in your video pipeline to compose:

- walkthrough base video (browser replay/evidence video)
- overlay voiceover/talking-head narration
- chapter markers from `tested_journeys`
- issue callouts from `findings`

## 7) Optional run listing

`GET /api/qa/reports?owner_user_id=<SUPABASE_USER_ID>&limit=50`

For service-token auth this endpoint requires owner scoping via:

- `x-owner-user-id` header or
- `owner_user_id` query param

## 8) Recommended pipeline

1. `POST /api/qa/run`
2. poll `GET /api/qa/status`
3. when `report_ready=true`, fetch `GET /api/qa/report`
4. fetch media via `GET /api/qa/evidence`
5. feed `run_log + tested_journeys + findings` into narration/scene builder
6. render final talking-head walkthrough video

## 8.1) Webhook mode (optional, replaces most polling)

When `webhook.url` is provided in run creation, Swarm Tester can emit:

- `run.started`
- `run.progress`
- `run.completed`
- `run.failed`

Delivery headers:

- `x-swarm-event`: event type
- `x-swarm-sent-at`: unix seconds timestamp
- `x-swarm-signature`: `t=<ts>,v1=<hmac_sha256(ts + "." + raw_body)>` (only when `webhook.secret` is set)

Webhook body shape:

```json
{
  "event": "run.progress",
  "sent_at": "2026-03-06T19:00:00.000Z",
  "run_id": "walkthrough_1741280000000",
  "data": {
    "run_id": "walkthrough_1741280000000",
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

For `run.completed` / `run.failed`, `data.report` includes the normalized final report JSON.

## 9) Ready-to-run Node example

Use:

```bash
QA_SERVICE_TOKEN=... \
OWNER_USER_ID=... \
node scripts/walkthrough-api-client-example.mjs https://workolo.com
```

Optional env for authenticated walkthroughs:

- `LOGIN_URL`
- `LOGIN_USERNAME`
- `LOGIN_PASSWORD`
- `OTP_MODE` (`none`, `manual_prompt`, or `provider_hook`)
- `SCENARIOS` (pipe-delimited, for example `step 1|step 2|step 3`)
- `WEBHOOK_URL` (optional)
- `WEBHOOK_SECRET` (optional)
- `WEBHOOK_EVENTS` (optional pipe/comma-delimited list, for example `run.started|run.progress|run.completed`)

The script writes:

- `output/walkthrough-api/<run_id>/report.json`
- `output/walkthrough-api/<run_id>/report.md`
- `output/walkthrough-api/<run_id>/narration-input.json`
- evidence media files (`screenshot-*.png`, `video-*.mp4`, etc.)
