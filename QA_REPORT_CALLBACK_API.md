# Swarm Tester QA Report Callback API

Last updated: March 3, 2026 (UTC)  
Environment: Production live

## 1) Purpose

This endpoint is where the QA bot sends a completed run report to Swarm Tester.

The callback stores:
- Normalized top-level run data
- Full raw payload
- Request metadata (IP, user-agent, content type, origin)

Writes are idempotent by `run_id` (same `run_id` updates existing row).

---

## 2) Endpoint

- Method: `POST`
- URL (main): `https://swarmtester.com/api/qa-report-callback`
- Content-Type: `application/json`

Other domains may route to the same deployment, but use `swarmtester.com` as canonical.

---

## 3) Authentication

Send one of these:

- `Authorization: Bearer <secret>`
- `x-callback-secret: <secret>`
- `x-qa-callback-secret: <secret>`

Current shared secret (production, as configured now):

`91381fb706c0f8b7c523a6716b5fbe506b0533fb0c403a32b49823d4541f81e9`

Security note:
- If this doc is shared outside your trusted team/vendors, rotate this secret immediately after onboarding.

---

## 4) Top-Level Request Contract

Required:
- `run_id` (string)  
  Aliases accepted: `runId`, `job_id`, `jobId`
- `findings` (array)

Optional top-level fields:
- `target` (string)
  Aliases accepted: `domain`, `app`, `url`
- `status` (string) default: `"completed"`
- `report_url` (string)
  Aliases accepted: `reportUrl`, `report_link`
- `summary` (string or object)
  - If object, backend stringifies it before storing `summary`
- `source` (string) default: `"qa_bot"`
- `delivered_at` (ISO timestamp string)
  Aliases accepted: `completed_at`, `finished_at`

Behavior:
- Invalid or missing timestamp falls back to current server time.
- Unknown extra fields are allowed and stored in raw `payload`.

---

## 5) `findings[]` Contract (strictly validated)

Each item in `findings` must be an object with:

- `id` (string, required)
- `type` (string, required)
- `expected_behavior` (string, required)
  Alias accepted: `expectedBehavior`
- `observed_behavior` (string, required)
  Alias accepted: `observedBehavior`
- `emotional_reaction` (object, required)
  Alias accepted: `emotionalReaction`

Allowed `type` values:
- `bug`
- `frustration_point`
- `confusion_point`
- `aha_moment`
- `dead_end`
- `performance_issue`
- `accessibility_issue`
- `copy_issue`

Optional fields per finding:
- `severity` (string)
  Allowed: `low`, `medium`, `high`, `critical`
- Any other custom fields (allowed and preserved in raw payload)

`emotional_reaction` rules:
- `primary` (required, string)  
  Aliases accepted: `primary_emotion`, `primaryEmotion`
- `intensity` (optional number)  
  Must be `1..5` if provided
- `signals` (optional array of non-empty strings)

Allowed `emotional_reaction.primary` values:
- `confidence`
- `uncertainty`
- `frustration`
- `delight`
- `confusion`
- `trust`
- `distrust`

---

## 6) Valid Example Payload (recommended full shape)

```json
{
  "schema_version": "1.1",
  "run_id": "run_20260303_001",
  "target": "bhuman",
  "status": "completed",
  "report_url": "https://cdn.your-bot.com/reports/run_20260303_001",
  "source": "qa_bot",
  "delivered_at": "2026-03-03T12:00:00Z",
  "summary": {
    "counts": {
      "bug": 1,
      "frustration_point": 6,
      "confusion_point": 3,
      "aha_moment": 2
    },
    "risk_score": 74
  },
  "findings": [
    {
      "id": "f_001",
      "type": "confusion_point",
      "severity": "medium",
      "title": "Onboarding CTA unclear",
      "expected_behavior": "User should understand next step and click CTA quickly.",
      "observed_behavior": "User paused, hovered away, then abandoned.",
      "emotional_reaction": {
        "primary": "uncertainty",
        "intensity": 4,
        "signals": ["hesitation", "cursor drift", "abandonment"]
      },
      "page": {
        "url": "https://app.example.com/signup",
        "route": "/signup"
      },
      "element": {
        "selector": "[data-testid='start-btn']",
        "text": "Continue"
      },
      "evidence": {
        "screenshots": [
          "https://cdn.your-bot.com/runs/run_20260303_001/f_001_1.png"
        ],
        "videos": [
          "https://cdn.your-bot.com/runs/run_20260303_001/f_001.mp4"
        ]
      },
      "suggested_fix": "Rename CTA to 'Create account'."
    }
  ]
}
```

---

## 7) Minimal Valid Payload

```json
{
  "run_id": "run_minimal_001",
  "findings": [
    {
      "id": "f1",
      "type": "bug",
      "expected_behavior": "Submit should create account successfully.",
      "observed_behavior": "Submit returns 500 error.",
      "emotional_reaction": {
        "primary": "frustration"
      }
    }
  ]
}
```

---

## 8) Responses

Success (`200`):

```json
{
  "ok": true,
  "run_id": "run_20260303_001",
  "id": 123
}
```

Meaning:
- `id` is DB row id in `public.swarmtest_reports`.
- Same `run_id` may return existing row id after merge-update.

---

## 9) Error Codes and Messages

`401 Unauthorized`
- Missing/invalid callback secret.
- Response:
```json
{"ok": false, "error": "Unauthorized"}
```

`405 Method Not Allowed`
- Non-POST request.
- `Allow: POST` header included.

`400 Bad Request`
- Invalid JSON body:
  - `"Invalid JSON body"`
- Invalid payload shape:
  - `"Invalid payload"`
- Missing `run_id`:
  - `"Missing run_id"`
- Findings validation failures (examples):
  - ``"`findings` must be an array"``
  - `"findings[0].id is required"`
  - `"findings[0].type is invalid"`
  - `"findings[0].expected_behavior is required"`
  - `"findings[0].observed_behavior is required"`
  - `"findings[0].emotional_reaction is required"`
  - `"findings[0].emotional_reaction.primary is invalid"`
  - `"findings[0].emotional_reaction.intensity must be a number between 1 and 5"`
  - `"findings[0].emotional_reaction.signals must be an array"`

`500 Internal Server Error`
- Missing server config (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `QA_CALLBACK_SECRET`)
- Failed DB save
- Response format:
```json
{
  "ok": false,
  "error": "Failed to save QA report",
  "details": "..."
}
```

---

## 10) Idempotency and Update Semantics

- DB write uses upsert on conflict key: `run_id`
- First callback inserts row
- Re-sending same `run_id` updates row with latest values
- Use stable `run_id` for retries and progress updates

Recommended retry policy:
- Retry on `5xx` and network errors
- Do not retry on `4xx` until payload/auth fixed
- Backoff suggestion: 1s, 2s, 5s, 10s, 20s

---

## 11) cURL Example

```bash
curl -X POST "https://swarmtester.com/api/qa-report-callback" \
  -H "Content-Type: application/json" \
  -H "x-callback-secret: 91381fb706c0f8b7c523a6716b5fbe506b0533fb0c403a32b49823d4541f81e9" \
  --data '{
    "run_id":"run_20260303_001",
    "target":"bhuman",
    "status":"completed",
    "findings":[
      {
        "id":"f1",
        "type":"confusion_point",
        "severity":"medium",
        "expected_behavior":"User quickly understands next step.",
        "observed_behavior":"User paused and bounced.",
        "emotional_reaction":{
          "primary":"uncertainty",
          "intensity":4,
          "signals":["hesitation","abandonment"]
        }
      }
    ]
  }'
```

---

## 12) JavaScript Example (fetch)

```js
const endpoint = "https://swarmtester.com/api/qa-report-callback";
const secret = process.env.SWARMTESTER_CALLBACK_SECRET;

const payload = {
  run_id: "run_20260303_001",
  target: "bhuman",
  findings: [
    {
      id: "f1",
      type: "bug",
      expected_behavior: "Submission should succeed.",
      observed_behavior: "Submission failed with 500.",
      emotional_reaction: { primary: "frustration", intensity: 5 }
    }
  ]
};

const res = await fetch(endpoint, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-callback-secret": secret
  },
  body: JSON.stringify(payload)
});

const data = await res.json();
if (!res.ok) {
  throw new Error(`Callback failed: ${res.status} ${JSON.stringify(data)}`);
}
console.log("Delivered:", data);
```

---

## 13) Python Example (requests)

```python
import os
import requests

endpoint = "https://swarmtester.com/api/qa-report-callback"
secret = os.environ["SWARMTESTER_CALLBACK_SECRET"]

payload = {
    "run_id": "run_20260303_001",
    "target": "bhuman",
    "findings": [
        {
            "id": "f1",
            "type": "frustration_point",
            "severity": "high",
            "expected_behavior": "Checkout should complete in one pass.",
            "observed_behavior": "Validation loop forced multiple retries.",
            "emotional_reaction": {
                "primary": "frustration",
                "intensity": 4,
                "signals": ["repeat_clicks", "rage_click"]
            }
        }
    ]
}

r = requests.post(
    endpoint,
    headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {secret}"
    },
    json=payload,
    timeout=30
)

print(r.status_code, r.text)
r.raise_for_status()
```

---

## 14) Storage Mapping (Supabase)

Table: `public.swarmtest_reports`

Columns populated by callback:
- `run_id`
- `target`
- `status`
- `report_url`
- `findings` (jsonb, stores findings array)
- `summary` (text)
- `source`
- `delivered_at`
- `payload` (full raw incoming object)
- `request_meta` (ip/user_agent/content_type/origin)

Other DB-managed columns:
- `id`
- `created_at`
- `updated_at`

Notes:
- Table has unique constraint on `run_id`
- RLS enabled on table; callback uses service role key server-side

---

## 15) Integration Checklist for QA Bot Dev

- Implement `POST` to callback URL
- Include callback secret header
- Send `run_id` + `findings[]`
- Ensure every finding has:
  - `id`
  - `type`
  - `expected_behavior`
  - `observed_behavior`
  - `emotional_reaction.primary`
- Use allowed enums for `type`, `severity`, emotion `primary`
- Retry only on network/5xx
- Reuse same `run_id` for retries (idempotent update)
- Log non-200 response body for debugging

---

## 16) Suggested Future Enhancements (optional)

- Add HMAC signature header (`X-Signature`) over raw body for stronger request authenticity
- Add `schema_version` strict validation
- Add endpoint-level request size guard
- Add deduplicated child table for findings if querying/filtering in SQL becomes important

