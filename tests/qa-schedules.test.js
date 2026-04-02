const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_FREQUENCY_HOURS,
  DEFAULT_MISSION,
  DEFAULT_PERSONA,
  buildScheduleNextRunAt,
  listDueQaSchedules,
  normalizeSchedulePayload,
  summarizeScheduledAlert
} = require("../lib/qa-schedules");

async function withEnv(overrides, callback) {
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined || value === null) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  }
  try {
    return await callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("normalizeSchedulePayload fills recurring QA defaults", () => {
  const nowIso = "2026-03-30T12:00:00.000Z";
  const payload = normalizeSchedulePayload(
    {
      brand_key: "clusterseo.com",
      target_url: "https://clusterseo.com"
    },
    {
      owner_user_id: "user_123",
      owner_email: "don@example.com"
    },
    { nowIso }
  );

  assert.equal(payload.owner_user_id, "user_123");
  assert.equal(payload.owner_email, "don@example.com");
  assert.equal(payload.frequency_hours, DEFAULT_FREQUENCY_HOURS);
  assert.equal(payload.persona, DEFAULT_PERSONA);
  assert.equal(payload.mission, DEFAULT_MISSION);
  assert.equal(payload.active, true);
  assert.equal(payload.next_run_at, nowIso);
});

test("normalizeSchedulePayload stores alert email in schedule metadata", () => {
  const payload = normalizeSchedulePayload(
    {
      brand_key: "clusterseo.com",
      target_url: "https://clusterseo.com",
      alert_email_to: "Team@Example.com, qa@example.com"
    },
    {
      owner_user_id: "user_123",
      owner_email: "don@example.com"
    }
  );

  assert.equal(payload.metadata.alert_email_to, "team@example.com, qa@example.com");
});

test("listDueQaSchedules filters due schedules without double-encoding timestamps", async () => {
  let requestedUrl = "";
  const responseRows = [
    {
      id: "schedule_1",
      owner_user_id: "user_123",
      owner_email: "don@example.com",
      brand_key: "clusterseo.com",
      target_url: "https://clusterseo.com",
      name: "ClusterSEO regular QA",
      active: true,
      frequency_hours: 24,
      scope_mode: "deep_45m",
      persona: DEFAULT_PERSONA,
      mission: DEFAULT_MISSION,
      next_run_at: "2026-03-30T11:00:00.000Z",
      metadata: {}
    }
  ];

  const result = await withEnv(
    {
      SUPABASE_URL: "https://supabase.example",
      SUPABASE_SERVICE_KEY: "service-key"
    },
    () =>
      listDueQaSchedules(
        { nowIso: "2026-03-30T12:34:56.000Z", limit: 5 },
        {
          fetchImpl: async (url) => {
            requestedUrl = String(url);
            return {
              ok: true,
              status: 200,
              async json() {
                return responseRows;
              }
            };
          }
        }
      )
  );

  assert.equal(result.ok, true);
  assert.equal(result.items.length, 1);
  assert.match(requestedUrl, /next_run_at=lte\.2026-03-30T12%3A34%3A56\.000Z/);
  assert.doesNotMatch(requestedUrl, /%253A/);
});

test("summarizeScheduledAlert turns partial runs into plain scheduled QA alerts", () => {
  const summary = summarizeScheduledAlert(
    {
      status: "partial",
      summary: {
        note: "The tester got through sign-up, then the site sent them back to the login page."
      },
      findings: [
        {
          severity: "high",
          title: "Sign-up returned to the login screen",
          observed_behavior: "The tester clicked Sign up and ended back on the login form."
        }
      ]
    },
    {},
    {
      alert_on_partial: true
    }
  );

  assert.equal(summary.shouldAlert, true);
  assert.equal(summary.reason, "partial");
  assert.equal(summary.title, "Sign-up returned to the login screen");
  assert.match(summary.message, /clicked Sign up/i);
});

test("buildScheduleNextRunAt advances by the configured cadence", () => {
  const next = buildScheduleNextRunAt("2026-03-30T12:00:00.000Z", 12);
  assert.equal(next, "2026-03-31T00:00:00.000Z");
});
