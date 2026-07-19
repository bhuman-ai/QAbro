const test = require("node:test");
const assert = require("node:assert/strict");

const {
  acceptQaTrial,
  acceptQaTrialRecordingAnalysis,
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
  appendManualQaItemEvidence,
  buildManualQaRecordingFingerprint,
  buildManualQaSessionPayload,
  collectManualQaRecordingMedia,
  normalizeManualQaSessionRow,
  verifyManualQaWidgetToken
} = require("../lib/manual-qa");
const qaTrialsApiPrivate = require("../api/qa-trials").__private;
const widgetSessionHandler = require("../api/manual-qa/widget-session");

function createSupabaseFetchMock() {
  const rows = new Map();
  const events = [];
  const calls = [];

  async function fetchImpl(url, options = {}) {
    calls.push({ url, options });
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

  return { fetchImpl, rows, events, calls };
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
    },
    end(payload) {
      this.body = payload || null;
      return this;
    }
  };
}

async function callWidgetSessionUpdate(body, token) {
  const req = {
    method: "POST",
    headers: {
      host: "beforeusersdo.com",
      "x-forwarded-proto": "https",
      "x-bud-widget-token": token
    },
    query: {},
    body
  };
  const res = createRes();
  await widgetSessionHandler(req, res);
  return res;
}

async function addTrustedTrialRecording(sessionId, options, index = 1) {
  const appended = await appendManualQaItemEvidence(
    sessionId,
    "freestyle",
    {
      evidence_id: `trial-video-${index}`,
      kind: "video",
      label: `Trial recording segment ${index}`,
      content_type: "video/webm",
      storage_bucket: "qa-evidence",
      storage_path: `${sessionId}/manual-widget-video/trial-video-${index}.webm`,
      byte_length: 2048 + index,
      duration_ms: 30000,
      created_at: "2026-07-19T00:00:00.000Z"
    },
    { ...options, widgetAccessOk: true }
  );
  assert.equal(appended.ok, true, appended.error);
  return appended;
}

function installCompleteRecordingAnalysis(mock, sessionId) {
  const row = mock.rows.get(sessionId);
  const session = normalizeManualQaSessionRow(row);
  const recordings = collectManualQaRecordingMedia(session);
  assert.equal(recordings.length > 0, true);
  row.payload.manual_qa.findings_analysis = {
    analysis_id: "paid-analysis-complete",
    status: "complete",
    source: "recording_transcript",
    media_count: recordings.length,
    processed_media_count: recordings.length,
    transcript_event_count: 0,
    attempt_count: 1,
    recording_fingerprint: buildManualQaRecordingFingerprint(recordings),
    completed_at: "2026-07-19T00:10:00.000Z",
    retryable: false,
    clip_results: recordings.map((recording) => ({
      evidence_id: recording.evidence_id,
      item_id: recording.item_id,
      recording_index: recording.recording_index,
      status: "complete",
      duration_ms: recording.duration_ms,
      speech_segments: [],
      visual_events: [],
      summary: "No supported finding was observed.",
      confidence: 1
    })),
    findings: []
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
      duration_minutes: 60,
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

test("widget-session cannot forge a stored trial video that passes submission", async () => {
  const previousFetch = globalThis.fetch;
  const previousEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY
  };
  const mock = createSupabaseFetchMock();
  const options = optionsFor(mock);
  globalThis.fetch = mock.fetchImpl;
  process.env.SUPABASE_URL = options.supabaseUrl;
  process.env.SUPABASE_SERVICE_KEY = options.serviceKey;

  try {
    const created = await createQaTrial(
      {
        product_name: "Evidence Boundary App",
        target_url: "https://example.com/signup",
        lead_email: "founder@example.com",
        tester_email: "tester@example.com",
        test_focus: "Try signup.",
        known_issues: ["The first action is hard to find"],
        lead_preapproved: true
      },
      options
    );
    const testerToken = new URL(created.tester_url).searchParams.get("token");
    await acceptQaTrial(created.session_id, testerToken, options);
    await startQaTrial(created.session_id, testerToken, options);

    const injected = await callWidgetSessionUpdate(
      {
        session_id: created.session_id,
        token: testerToken,
        item_id: "freestyle",
        status: "reviewed",
        evidence_urls: ["https://attacker.example/fake-video.webm"],
        evidence_media: [
          {
            evidence_id: "FAKE_STORED_VIDEO",
            kind: "video",
            content_type: "video/webm",
            storage_bucket: "qa-evidence",
            storage_path: `${created.session_id}/manual-widget-video/FAKE_STORED_VIDEO.webm`,
            byte_length: 4096,
            duration_ms: 30000
          }
        ]
      },
      testerToken
    );
    assert.equal(injected.statusCode, 400);
    assert.match(injected.body.error, /evidence upload endpoint/i);
    assert.equal(JSON.stringify(mock.rows.get(created.session_id)).includes("FAKE_STORED_VIDEO"), false);

    const submitted = await submitQaTrial(
      created.session_id,
      testerToken,
      { note: "A forged storage reference is not evidence." },
      options
    );
    assert.equal(submitted.ok, false);
    assert.equal(submitted.status, 409);
    assert.match(submitted.error, /screen recording/i);
    assert.deepEqual(
      collectManualQaRecordingMedia(normalizeManualQaSessionRow(mock.rows.get(created.session_id))),
      []
    );
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
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
  assert.equal(testerView.view.duration_minutes, 15);
  assert.equal(leadView.view.benchmark, undefined);
  assert.equal(leadView.view.tester.email, undefined);
  assert.equal(testerView.view.lead.email, undefined);

  const leadAccepted = await acceptQaTrial(sessionId, leadToken, options);
  assert.equal(leadAccepted.ok, true);
  assert.equal(leadAccepted.view.status, "awaiting_consent");
  const testerAccepted = await acceptQaTrial(sessionId, testerToken, options);
  assert.equal(testerAccepted.ok, true);
  assert.equal(testerAccepted.view.status, "ready");
  assert.equal(testerAccepted.view.consent.recording_analysis_accepted, true);

  const started = await startQaTrial(sessionId, testerToken, options);
  assert.equal(started.ok, true);
  assert.equal(started.view.status, "in_progress");

  const missingRecording = await submitQaTrial(sessionId, testerToken, { note: "A note is not evidence." }, options);
  assert.equal(missingRecording.ok, false);
  assert.equal(missingRecording.status, 409);
  assert.match(missingRecording.error, /screen recording/i);
  await addTrustedTrialRecording(sessionId, options);

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
    {
      ...options,
      queueManualQaFindingsAnalysis: async () => {
        throw new Error("temporary recording-analysis queue failure");
      }
    }
  );
  assert.equal(submitted.ok, true);
  assert.equal(submitted.view.status, "submitted");
  assert.equal(submitted.view.qualification.status, "pending_review");

  const submittedRow = mock.rows.get(sessionId);
  delete submittedRow.payload.manual_qa.qualification_trial.tester.recording_analysis_consent_version;
  delete submittedRow.payload.manual_qa.qualification_trial.tester.recording_analysis_consent_at;
  installCompleteRecordingAnalysis(mock, sessionId);
  submittedRow.payload.manual_qa.findings_analysis.findings = [{
    category: "bug",
    title: "Unauthorized historical finding",
    evidence_anchors: [{
      evidence_id: "trial-video-1",
      recording_index: 1,
      start_ms: 0,
      end_ms: 1000,
      visual_evidence: "A historical event that must be discarded."
    }]
  }];
  submittedRow.payload.manual_qa.work_packets = [{ title: "Unauthorized historical finding" }];
  submittedRow.payload.manual_qa.checklist[0].widget_context = {
    transcript_events: [{
      source: "server_recording_analysis",
      text: "Unauthorized historical transcript"
    }]
  };
  const legacyView = await verifyQaTrialAccess(sessionId, testerToken, options);
  assert.equal(legacyView.view.consent.recording_analysis_accepted, false);
  const reconsented = await acceptQaTrialRecordingAnalysis(sessionId, testerToken, {
    ...options,
    queueManualQaFindingsAnalysis: async () => ({ ok: false, status: 500 })
  });
  assert.equal(reconsented.ok, true);
  assert.equal(reconsented.status, 202);
  assert.equal(reconsented.queue_pending, true);
  assert.equal(reconsented.error_code, "recording_analysis_queue_pending");
  assert.equal(reconsented.view.consent.recording_analysis_accepted, true);
  const scrubbed = mock.rows.get(sessionId).payload.manual_qa;
  assert.notEqual(scrubbed.findings_analysis.status, "complete");
  assert.deepEqual(scrubbed.findings_analysis.clip_results, []);
  assert.deepEqual(scrubbed.findings_analysis.findings, []);
  assert.deepEqual(scrubbed.work_packets, []);
  assert.equal(
    JSON.stringify(scrubbed.checklist).includes("Unauthorized historical transcript"),
    false
  );

  scrubbed.findings_analysis = {
    ...scrubbed.findings_analysis,
    analysis_id: "processing-must-survive-idempotent-consent",
    status: "processing"
  };
  const consentAt = scrubbed.qualification_trial.tester.recording_analysis_consent_at;
  const patchCountBefore = mock.calls.filter((call) => call.options?.method === "PATCH").length;
  let idempotentQueueOptions = null;
  const idempotentConsent = await acceptQaTrialRecordingAnalysis(sessionId, testerToken, {
    ...options,
    queueManualQaFindingsAnalysis: async (_queuedSessionId, queueOptions) => {
      idempotentQueueOptions = queueOptions;
      const row = mock.rows.get(sessionId);
      return { ok: true, status: 200, row, session: normalizeManualQaSessionRow(row) };
    }
  });
  assert.equal(idempotentConsent.ok, true);
  assert.equal(idempotentConsent.status, 200);
  assert.equal(idempotentQueueOptions.force, undefined);
  assert.equal(
    mock.calls.filter((call) => call.options?.method === "PATCH").length,
    patchCountBefore
  );
  assert.equal(
    mock.rows.get(sessionId).payload.manual_qa.findings_analysis.analysis_id,
    "processing-must-survive-idempotent-consent"
  );
  assert.equal(
    mock.rows.get(sessionId).payload.manual_qa.qualification_trial.tester.recording_analysis_consent_at,
    consentAt
  );

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
  assert.equal(scored.trial.qualification.evidence_score, 20);
  assert.equal(scored.trial.qualification.clarity_score, 10);
  assert.equal(scored.trial.qualification.score, 100);

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

test("generic re-accept cannot grant historical recording analysis consent", async () => {
  const mock = createSupabaseFetchMock();
  const options = optionsFor(mock);
  const created = await createQaTrial(
    {
      product_name: "Historical consent trial",
      target_url: "https://example.com/signup",
      lead_email: "founder@example.com",
      tester_email: "tester@example.com",
      test_focus: "Try signup.",
      known_issues: ["Password error is unclear"]
    },
    options
  );
  assert.equal(created.ok, true, created.error);

  const testerToken = new URL(created.tester_url).searchParams.get("token");
  const storedTrial = mock.rows.get(created.session_id).payload.manual_qa.qualification_trial;
  storedTrial.status = "submitted";
  storedTrial.started_at = "2026-07-18T20:00:00.000Z";
  storedTrial.submitted_at = "2026-07-18T20:15:00.000Z";
  storedTrial.tester.accepted_at = "2026-07-18T19:59:00.000Z";
  delete storedTrial.tester.recording_analysis_consent_version;
  delete storedTrial.tester.recording_analysis_consent_at;

  const reaccepted = await acceptQaTrial(created.session_id, testerToken, options);
  assert.equal(reaccepted.ok, true, reaccepted.error);
  assert.equal(reaccepted.view.consent.recording_analysis_accepted, false);
  const afterReaccept = mock.rows.get(created.session_id).payload.manual_qa.qualification_trial;
  assert.equal(Number(afterReaccept.tester.recording_analysis_consent_version || 0), 0);
  assert.equal(afterReaccept.tester.recording_analysis_consent_at || null, null);

  const explicitlyAccepted = await acceptQaTrialRecordingAnalysis(
    created.session_id,
    testerToken,
    {
      ...options,
      queueManualQaFindingsAnalysis: async () => ({ ok: false, status: 500 })
    }
  );
  assert.equal(explicitlyAccepted.ok, true, explicitlyAccepted.error);
  assert.equal(explicitlyAccepted.view.consent.recording_analysis_accepted, true);
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
  assert.match(created.error, /private review point/i);
});

test("paid assignments preserve pay through recording and approve payout without qualifying the tester", async () => {
  const mock = createSupabaseFetchMock();
  const options = optionsFor(mock);
  const created = await createQaTrial(
    {
      product_name: "Paid App",
      target_url: "https://example.com",
      lead_email: "founder@example.com",
      tester_email: "approved@example.com",
      test_focus: "Review the homepage.",
      known_issues: ["The primary action is unclear"],
      lead_preapproved: true,
      assignment_type: "paid",
      tester_pay_cents: 4000,
      tester_pay_currency: "USD"
    },
    options
  );

  assert.equal(created.ok, true);
  assert.equal(created.trial.assignment.type, "paid");
  assert.equal(created.trial.assignment.tester_pay_cents, 4000);
  const testerToken = new URL(created.tester_url).searchParams.get("token");
  const resumed = await issueQaTrialTesterLink(created.session_id, "approved@example.com", options);
  const dashboardToken = new URL(resumed.tester_url).searchParams.get("token");
  assert.equal((await verifyManualQaWidgetToken(created.session_id, dashboardToken, options)).ok, true);
  await acceptQaTrial(created.session_id, testerToken, options);
  await startQaTrial(created.session_id, testerToken, options);
  await addTrustedTrialRecording(created.session_id, options);
  await submitQaTrial(created.session_id, testerToken, { note: "The primary action was unclear." }, options);
  const prematureScore = await scoreQaTrial(
    created.session_id,
    { caught_issue_ids: ["issue_1"], clarity: "good" },
    options
  );
  assert.equal(prematureScore.ok, false);
  assert.match(prematureScore.error, /analysis must finish/i);
  installCompleteRecordingAnalysis(mock, created.session_id);
  const scored = await scoreQaTrial(
    created.session_id,
    { caught_issue_ids: ["issue_1"], clarity: "good" },
    options
  );

  assert.equal(scored.ok, true);
  assert.equal(scored.trial.status, "completed");
  assert.equal(scored.trial.assignment.payout_status, "approved");
  assert.equal(qaTrialsApiPrivate.shouldMarkTesterQualified(scored.trial, { is_service_token: true }), false);
  const submittedAt = mock.rows.get(created.session_id).payload.manual_qa.qualification_trial.submitted_at;
  const resubmitted = await submitQaTrial(
    created.session_id,
    testerToken,
    { note: "Attempt to replace a paid reviewed report." },
    options
  );
  assert.equal(resubmitted.ok, false);
  assert.equal(resubmitted.status, 409);
  assert.equal(mock.rows.get(created.session_id).payload.manual_qa.qualification_trial.submitted_at, submittedAt);
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
