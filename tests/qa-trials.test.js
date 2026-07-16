const test = require("node:test");
const assert = require("node:assert/strict");

const {
  acceptQaTrial,
  createQaTrial,
  issueQaTrialTesterLink,
  rateQaTrial,
  scoreQaTrial,
  startQaTrial,
  submitQaTrial,
  verifyQaTrialAccess,
  __private
} = require("../lib/qa-trials");
const {
  buildManualQaSessionPayload,
  normalizeManualQaSessionRow,
  verifyManualQaWidgetToken
} = require("../lib/manual-qa");

function createSupabaseFetchMock() {
  const rows = new Map();
  const events = [];

  async function fetchImpl(url, options = {}) {
    const parsed = new URL(url);
    if (parsed.pathname === "/rest/v1/swarmtest_manual_qa_events") {
      if (options.method === "POST") {
        const body = JSON.parse(options.body || "[]");
        for (const candidate of body) {
          if (!events.some((entry) => entry.event_id === candidate.event_id)) {
            events.push({ id: events.length + 1, ...candidate });
          }
        }
        return {
          ok: true,
          status: 201,
          async json() {
            return body;
          }
        };
      }
      const sessionFilter = parsed.searchParams.get("session_id") || "";
      const sessionId = sessionFilter.startsWith("eq.") ? sessionFilter.slice(3) : "";
      return {
        ok: true,
        status: 200,
        async json() {
          return events.filter((entry) => !sessionId || entry.session_id === sessionId);
        }
      };
    }

    const runFilter = parsed.searchParams.get("run_id") || "";
    const runId = runFilter.startsWith("eq.") ? runFilter.slice(3) : "";
    if (options.method === "POST") {
      const body = JSON.parse(options.body || "[]");
      const inserted = body.map((row, index) => ({
        id: index + 1,
        created_at: "2026-07-14T00:00:00.000Z",
        updated_at: "2026-07-14T00:00:00.000Z",
        ...row
      }));
      inserted.forEach((row) => rows.set(row.run_id, row));
      return {
        ok: true,
        status: 201,
        async json() {
          return inserted;
        }
      };
    }
    if (options.method === "PATCH") {
      const body = JSON.parse(options.body || "{}");
      const current = rows.get(runId);
      const next = { ...current, ...body, updated_at: "2026-07-14T00:01:00.000Z" };
      rows.set(runId, next);
      return {
        ok: true,
        status: 200,
        async json() {
          return [next];
        }
      };
    }
    const row = rows.get(runId);
    return {
      ok: true,
      status: 200,
      async json() {
        return row ? [row] : [];
      }
    };
  }

  return { fetchImpl, rows, events };
}

function optionsFor(mock) {
  return {
    supabaseUrl: "https://supabase.example",
    serviceKey: "service-key",
    fetchImpl: mock.fetchImpl,
    publicBaseUrl: "https://beforeusersdo.com",
    ownerUserId: "owner_1",
    ownerEmail: "owner@example.com",
    authOk: true,
    credentialsSecret: "test-credentials-secret",
    sendInvites: false
  };
}

test("trial tokens are one-way and role-specific", () => {
  const token = __private.createTrialToken();
  const otherToken = __private.createTrialToken();
  const hash = __private.hashTrialToken(token);

  assert.match(token, /^bud_trial_/);
  assert.notEqual(hash, token);
  assert.equal(__private.compareTrialToken(token, hash), true);
  assert.equal(__private.compareTrialToken(otherToken, hash), false);
});

test("tester dashboard can issue a resumable link without invalidating the emailed link", async () => {
  const mock = createSupabaseFetchMock();
  const options = optionsFor(mock);
  const created = await createQaTrial(
    {
      product_name: "Example App",
      target_url: "https://example.com",
      lead_email: "founder@example.com",
      tester_email: "tester@example.com",
      test_focus: "Try the main flow.",
      known_issues: ["The first action is hard to find"],
      lead_preapproved: true
    },
    options
  );
  const emailedToken = new URL(created.tester_url).searchParams.get("token");
  const resumed = await issueQaTrialTesterLink(created.session_id, "tester@example.com", options);
  const dashboardToken = new URL(resumed.tester_url).searchParams.get("token");

  assert.equal(resumed.ok, true);
  assert.notEqual(dashboardToken, emailedToken);
  assert.equal((await verifyQaTrialAccess(created.session_id, emailedToken, options)).role, "tester");
  assert.equal((await verifyQaTrialAccess(created.session_id, dashboardToken, options)).role, "tester");
  assert.equal((await verifyManualQaWidgetToken(created.session_id, emailedToken, options)).ok, true);
  assert.equal((await verifyManualQaWidgetToken(created.session_id, dashboardToken, options)).ok, true);
  assert.equal((await issueQaTrialTesterLink(created.session_id, "other@example.com", options)).status, 403);
});

test("manual QA normalization keeps qualification secrets private", () => {
  const built = buildManualQaSessionPayload(
    {
      target_url: "https://example.com",
      review_mode: "freestyle",
      qualification_trial: {
        product_name: "Example",
        test_focus: "Try signup",
        access: {
          lead_token_hash: "lead-secret-hash",
          tester_token_hash: "tester-secret-hash"
        },
        benchmark: {
          issues: [{ id: "issue_1", title: "Hidden issue" }]
        }
      }
    },
    { publicBaseUrl: "https://beforeusersdo.com" }
  );

  assert.equal(built.ok, true);
  assert.equal(built.session.qualification_trial.access.lead_token_hash, "lead-secret-hash");
  const normalized = normalizeManualQaSessionRow({
    run_id: built.session.session_id,
    source: "manual_qa",
    payload: { manual_qa: built.session }
  });
  assert.equal(normalized.qualification_trial.access, undefined);
  assert.deepEqual(normalized.qualification_trial.benchmark, { issue_count: 1 });
  assert.equal(normalized.qualification_trial.qualification.score, null);
  assert.equal(normalized.qualification_trial.lead_rating.score, null);
});

test("paired qualification trial completes consent, submission, scoring, and rating", async () => {
  const mock = createSupabaseFetchMock();
  const options = optionsFor(mock);
  const created = await createQaTrial(
    {
      product_name: "Example App",
      target_url: "https://example.com/signup",
      lead_email: "founder@example.com",
      tester_email: "tester@example.com",
      test_focus: "Try signup and reach the dashboard.",
      known_issues: ["Phone field is easy to miss", "Password error is unclear"]
    },
    options
  );

  assert.equal(created.ok, true);
  assert.match(created.lead_url, /^https:\/\/beforeusersdo\.com\/trial\?/);
  assert.match(created.tester_url, /^https:\/\/beforeusersdo\.com\/trial\?/);
  assert.notEqual(created.lead_url, created.tester_url);
  assert.equal(created.delivery.lead.skipped, true);
  assert.equal(created.delivery.tester.skipped, true);

  const leadToken = new URL(created.lead_url).searchParams.get("token");
  const testerToken = new URL(created.tester_url).searchParams.get("token");
  const sessionId = created.session_id;
  const leadView = await verifyQaTrialAccess(sessionId, leadToken, options);
  const testerView = await verifyQaTrialAccess(sessionId, testerToken, options);

  assert.equal(leadView.role, "lead");
  assert.equal(testerView.role, "tester");
  assert.equal(leadView.view.benchmark, undefined);
  assert.equal(leadView.view.tester.email, undefined);
  assert.equal(testerView.view.lead.email, undefined);

  const leadAccepted = await acceptQaTrial(sessionId, leadToken, options);
  assert.equal(leadAccepted.ok, true);
  assert.equal(leadAccepted.view.status, "awaiting_consent");
  const testerAccepted = await acceptQaTrial(sessionId, testerToken, options);
  assert.equal(testerAccepted.ok, true);
  assert.equal(testerAccepted.view.status, "ready");

  const started = await startQaTrial(sessionId, testerToken, options);
  assert.equal(started.ok, true);
  assert.equal(started.view.status, "in_progress");

  const submitted = await submitQaTrial(
    sessionId,
    testerToken,
    {
      note: "The phone field was easy to miss and the form did not explain the password error.",
      widget_context: {
        page_url: "https://example.com/signup",
        viewport: { width: 1280, height: 800, device_pixel_ratio: 2 }
      }
    },
    options
  );
  assert.equal(submitted.ok, true);
  assert.equal(submitted.view.status, "submitted");
  assert.equal(submitted.view.qualification.status, "pending_review");

  const scored = await scoreQaTrial(
    sessionId,
    {
      caught_issue_ids: ["issue_1", "issue_2"],
      clarity: "excellent",
      reviewer_note: "Clear report with useful reproduction context."
    },
    options
  );
  assert.equal(scored.ok, true, scored.error);
  assert.equal(scored.trial.qualification.status, "verified");
  assert.equal(scored.trial.qualification.coverage_score, 70);
  assert.equal(scored.trial.qualification.evidence_score, 10);
  assert.equal(scored.trial.qualification.clarity_score, 10);
  assert.equal(scored.trial.qualification.score, 90);

  const rated = await rateQaTrial(
    sessionId,
    leadToken,
    { score: 5, note: "Very useful." },
    options
  );
  assert.equal(rated.ok, true);
  assert.equal(rated.view.status, "completed");
  assert.equal(rated.view.lead_rating.score, 5);
});

test("qualification trials require a real private benchmark", async () => {
  const mock = createSupabaseFetchMock();
  const created = await createQaTrial(
    {
      product_name: "Example App",
      target_url: "https://example.com",
      lead_email: "founder@example.com",
      tester_email: "tester@example.com",
      test_focus: "Try the main flow."
    },
    optionsFor(mock)
  );

  assert.equal(created.ok, false);
  assert.equal(created.status, 400);
  assert.match(created.error, /private benchmark issue/i);
});

test("MCP-requested trials preapprove the owner and reveal test credentials only to the tester", async () => {
  const mock = createSupabaseFetchMock();
  const options = optionsFor(mock);
  const created = await createQaTrial(
    {
      product_name: "Private App",
      target_url: "https://private.example.com/settings",
      lead_email: "founder@example.com",
      tester_email: "tester@example.com",
      test_focus: "Open settings and update the profile name.",
      known_issues: ["Save confirmation is easy to miss"],
      lead_preapproved: true,
      source_request_id: "request_123",
      access_mode: "test_account",
      access_details: {
        login_url: "https://private.example.com/login",
        prohibited_actions: ["Do not make a real purchase"]
      },
      credentials: {
        login_url: "https://private.example.com/login",
        username: "qa@example.com",
        password: "TestPassword1!",
        otp_mode: "none"
      }
    },
    options
  );

  assert.equal(created.ok, true);
  const leadToken = new URL(created.lead_url).searchParams.get("token");
  const testerToken = new URL(created.tester_url).searchParams.get("token");
  const lead = await verifyQaTrialAccess(created.session_id, leadToken, options);
  const tester = await verifyQaTrialAccess(created.session_id, testerToken, options);

  assert.equal(lead.view.consent.accepted, true);
  assert.equal(lead.view.access.credentials, undefined);
  assert.equal(tester.view.access.mode, "test_account");
  assert.equal(tester.view.access.credentials.username, "qa@example.com");
  assert.equal(tester.view.access.credentials.password, "TestPassword1!");

  const accepted = await acceptQaTrial(created.session_id, testerToken, options);
  assert.equal(accepted.view.status, "ready");
});
