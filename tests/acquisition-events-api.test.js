const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createHandler,
  isRecentSignup,
  publicEventKeyIsScoped
} = require("../api/acquisition-events").__private;

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

test("recent signup detection excludes existing accounts", () => {
  const now = Date.parse("2026-07-30T15:00:00.000Z");
  assert.equal(isRecentSignup("2026-07-30T14:45:00.000Z", now), true);
  assert.equal(isRecentSignup("2026-07-29T14:45:00.000Z", now), false);
  assert.equal(isRecentSignup("", now), false);
});

test("public event keys must be scoped to the visitor", () => {
  const visitorId = "123e4567-e89b-42d3-a456-426614174000";
  assert.equal(publicEventKeyIsScoped("offer_viewed", `offer_viewed:${visitorId}`, visitorId), true);
  assert.equal(publicEventKeyIsScoped("offer_viewed", "offer_viewed:other", visitorId), false);
});

test("anonymous offer events preserve first-touch fields without accepting owner identity", async () => {
  const visitorId = "123e4567-e89b-42d3-a456-426614174000";
  let writtenInput = null;
  const handler = createHandler({
    parseRequestBody: async () => ({
      event_name: "offer_viewed",
      event_key: `offer_viewed:${visitorId}`,
      visitor_id: visitorId,
      owner_user_id: "spoofed_owner",
      landing_path: "/",
      attribution: {
        utm_source: "codex_test",
        utm_medium: "qa",
        utm_campaign: "install_funnel_v1"
      },
      properties: {
        surface: "homepage",
        path: "/"
      }
    }),
    writeAcquisitionEvent: async (input) => {
      writtenInput = input;
      return { ok: true, created: true };
    }
  });
  const res = createRes();

  await handler({ method: "POST" }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(writtenInput.owner_user_id, undefined);
  assert.equal(writtenInput.visitor_id, visitorId);
  assert.equal(writtenInput.is_test, true);
  assert.equal(writtenInput.attribution.utm_campaign, "install_funnel_v1");
});

test("signup association uses authenticated owner and ignores the browser event key", async () => {
  const visitorId = "123e4567-e89b-42d3-a456-426614174000";
  let writtenInput = null;
  const now = Date.parse("2026-07-30T15:00:00.000Z");
  const handler = createHandler({
    now: () => now,
    parseRequestBody: async () => ({
      event_name: "signup_completed",
      event_key: `signup_completed:${visitorId}`,
      visitor_id: visitorId,
      attribution: { utm_source: "founder_outreach" },
      properties: { auth_method: "github" }
    }),
    requireDashboardAuth: async () => ({
      ok: true,
      user: {
        id: "user_123",
        created_at: "2026-07-30T14:45:00.000Z"
      }
    }),
    writeAcquisitionEvent: async (input) => {
      writtenInput = input;
      return { ok: true, created: true };
    }
  });
  const res = createRes();

  await handler({ method: "POST" }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(writtenInput.event_key, "signup_completed:user_123");
  assert.equal(writtenInput.owner_user_id, "user_123");
  assert.equal(writtenInput.visitor_id, visitorId);
});

test("signup association ignores an existing account", async () => {
  let writeCalls = 0;
  const now = Date.parse("2026-07-30T15:00:00.000Z");
  const handler = createHandler({
    now: () => now,
    parseRequestBody: async () => ({
      event_name: "signup_completed",
      visitor_id: "123e4567-e89b-42d3-a456-426614174000",
      properties: { auth_method: "unknown" }
    }),
    requireDashboardAuth: async () => ({
      ok: true,
      user: {
        id: "user_123",
        created_at: "2026-06-30T15:00:00.000Z"
      }
    }),
    writeAcquisitionEvent: async () => {
      writeCalls += 1;
      return { ok: true, created: true };
    }
  });
  const res = createRes();

  await handler({ method: "POST" }, res);

  assert.equal(res.statusCode, 202);
  assert.equal(res.body.ignored, true);
  assert.equal(writeCalls, 0);
});

test("browser cannot emit server-confirmed milestones", async () => {
  const handler = createHandler({
    parseRequestBody: async () => ({
      event_name: "first_qa_report_completed",
      event_key: "first_qa_report_completed:user_123",
      visitor_id: "123e4567-e89b-42d3-a456-426614174000",
      properties: {}
    })
  });
  const res = createRes();

  await handler({ method: "POST" }, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /not accepted from the browser/);
});
