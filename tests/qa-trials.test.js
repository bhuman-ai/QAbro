const test = require("node:test");
const assert = require("node:assert/strict");

const {
  acceptQaTrial,
  buildBuyerReportProjection,
  createQaTrial,
  deliverQaTrialReport,
  issueQaTrialTesterLink,
  listQaTrials,
  queueQaTrialRecordingAnalysis,
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
  updateManualQaQualificationTrial,
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
        return runId ? (row ? [row] : []) : Array.from(rows.values());
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

async function createSubmittedTrialForReportDelivery(mock, { complete = true } = {}) {
  const options = optionsFor(mock);
  const created = await createQaTrial(
    {
      product_name: "Report Delivery App",
      target_url: "https://example.com/signup",
      lead_email: "founder@example.com",
      tester_email: "tester@example.com",
      test_focus: "Try signup and explain any hesitation.",
      known_issues: ["The primary action is unclear"],
      lead_preapproved: true
    },
    options
  );
  assert.equal(created.ok, true, created.error);

  const leadToken = new URL(created.lead_url).searchParams.get("token");
  const testerToken = new URL(created.tester_url).searchParams.get("token");
  const accepted = await acceptQaTrial(created.session_id, testerToken, options);
  assert.equal(accepted.ok, true, accepted.error);
  const started = await startQaTrial(created.session_id, testerToken, options);
  assert.equal(started.ok, true, started.error);
  await addTrustedTrialRecording(created.session_id, options);
  const submitted = await submitQaTrial(
    created.session_id,
    testerToken,
    { note: "The primary action was unclear." },
    {
      ...options,
      queueManualQaFindingsAnalysis: async () => ({
        ok: false,
        status: 503,
        error: "Analysis will be picked up by the worker"
      })
    }
  );
  assert.equal(submitted.ok, true, submitted.error);
  if (complete) installCompleteRecordingAnalysis(mock, created.session_id);

  return { created, leadToken, testerToken, options };
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

test("new trials start with buyer report delivery pending", async () => {
  const mock = createSupabaseFetchMock();
  const created = await createQaTrial(
    {
      product_name: "Pending Report App",
      target_url: "https://example.com",
      lead_email: "founder@example.com",
      tester_email: "tester@example.com",
      test_focus: "Try the main flow.",
      known_issues: ["The primary action is unclear"],
      lead_preapproved: true
    },
    optionsFor(mock)
  );

  assert.equal(created.ok, true, created.error);
  assert.equal(created.trial.report_delivery.status, "pending");
  assert.equal(created.trial.report_delivery.recipient, "founder@example.com");
  assert.equal(created.trial.report_delivery.attempt_count, 0);
  const stored = mock.rows.get(created.session_id).payload.manual_qa.qualification_trial.report_delivery;
  assert.equal(stored.status, "pending");
  assert.equal(stored.retryable, true);
});

test("buyer report projection redacts private trial tokens from every finding field", async () => {
  const mock = createSupabaseFetchMock();
  const { created } = await createSubmittedTrialForReportDelivery(mock);
  const secretToken = "bud_trial_privateTesterCredential123456";
  const row = mock.rows.get(created.session_id);
  const analysis = row.payload.manual_qa.findings_analysis;
  analysis.transcript_event_count = 1;
  analysis.semantic_verification_version = 1;
  analysis.clip_results[0].speech_segments = [{
    start_ms: 1000,
    end_ms: 3000,
    text: `I can see ${secretToken} in the address bar.`
  }];
  analysis.clip_results[0].visual_events = [{
    start_ms: 1000,
    end_ms: 3000,
    description: `The page visibly shows ${secretToken}.`
  }];
  analysis.findings = [{
    finding_id: "finding_private_token",
    category: "bug",
    title: `Private token ${secretToken} was visible`,
    summary: `The recording exposed ${secretToken} during the test.`,
    suggested_fix: `Remove ${secretToken} from visible UI.`,
    evidence_anchors: [{
      evidence_id: analysis.clip_results[0].evidence_id,
      item_id: "freestyle",
      recording_index: 1,
      start_ms: 1000,
      end_ms: 3000,
      quote: `I can see ${secretToken} in the address bar.`,
      visual_evidence: `The page visibly shows ${secretToken}.`
    }],
    confidence: 0.99,
    support_verified: true
  }];

  const projection = buildBuyerReportProjection(normalizeManualQaSessionRow(row));
  const finding = projection.findings[0];
  assert.ok(finding);
  for (const value of [
    finding.title,
    finding.summary,
    finding.suggested_fix,
    finding.evidence_anchors[0].quote,
    finding.evidence_anchors[0].visual_evidence
  ]) {
    assert.equal(String(value).includes(secretToken), false);
    assert.match(String(value), /bud_trial_\[redacted\]/i);
  }
  assert.equal(JSON.stringify(projection).includes(secretToken), false);
});

test("report admins list every owner's trial while regular users stay owner-scoped", async () => {
  const mock = createSupabaseFetchMock();
  const firstOptions = optionsFor(mock);
  const secondOptions = {
    ...firstOptions,
    ownerUserId: "owner_2",
    ownerEmail: "second@example.com"
  };
  for (const [productName, leadEmail, options] of [
    ["First owner's app", "first@example.com", firstOptions],
    ["Second owner's app", "second@example.com", secondOptions]
  ]) {
    const created = await createQaTrial(
      {
        product_name: productName,
        target_url: "https://example.com",
        lead_email: leadEmail,
        tester_email: "tester@example.com",
        test_focus: "Try the main flow.",
        known_issues: ["The primary action is unclear"],
        lead_preapproved: true
      },
      options
    );
    assert.equal(created.ok, true, created.error);
  }

  const regularOptions = qaTrialsApiPrivate.trialListOptions({}, {
    ownerUserId: "owner_1",
    ownerEmail: "owner@example.com",
    user: { report_admin: false }
  });
  const adminOptions = qaTrialsApiPrivate.trialListOptions({}, {
    ownerUserId: "admin_1",
    ownerEmail: "admin@example.com",
    user: { report_admin: true }
  });
  const regular = await listQaTrials({ ...firstOptions, ...regularOptions });
  const admin = await listQaTrials({ ...firstOptions, ...adminOptions });

  assert.equal(regular.ok, true, regular.error);
  assert.equal(regular.items.length, 1);
  assert.equal(admin.ok, true, admin.error);
  assert.equal(adminOptions.ownerUserId, "");
  assert.equal(admin.items.length, 2);
});

test("completed analysis emails a fresh private report link and persists provider acceptance once", async () => {
  const mock = createSupabaseFetchMock();
  const { created, leadToken, options } = await createSubmittedTrialForReportDelivery(mock);
  const row = mock.rows.get(created.session_id);
  row.payload.manual_qa.findings_analysis.model = "INTERNAL_MODEL";
  row.payload.manual_qa.findings_analysis.ai_usage = {
    provider: "INTERNAL_PROVIDER",
    tracking_available: true,
    cost_complete: true,
    total_cost_usd: 99,
    request_count: 1,
    priced_request_count: 1
  };
  row.payload.manual_qa.findings_analysis.transcript_event_count = 1;
  row.payload.manual_qa.findings_analysis.semantic_verification_version = 1;
  row.payload.manual_qa.findings_analysis.clip_results[0].speech_segments = [{
    start_ms: 500,
    end_ms: 3000,
    text: "I do not know what this button does.",
    confidence: 0.99
  }];
  row.payload.manual_qa.findings_analysis.clip_results[0].visual_events = [{
    start_ms: 1000,
    end_ms: 2500,
    description: "The button label did not describe the next step."
  }];
  row.payload.manual_qa.findings_analysis.findings = [{
    finding_id: "finding_primary_action",
    category: "frustration_point",
    title: "The primary action was unclear",
    summary: "The tester hesitated because the button did not explain the next step.",
    suggested_fix: "Rename the button so the next action is explicit.",
    evidence_anchors: [{
      evidence_id: "trial-video-1",
      item_id: "freestyle",
      recording_index: 1,
      start_ms: 1000,
      end_ms: 2500,
      quote: "I do not know what this button does.",
      visual_evidence: "The button label did not describe the next step."
    }],
    confidence: 0.93,
    support_verified: true
  }];
  const completedAccess = await verifyQaTrialAccess(created.session_id, leadToken, options);
  assert.equal(
    completedAccess.session.findings_analysis.status,
    "complete",
    JSON.stringify(completedAccess.session.findings_analysis)
  );

  const sentEmails = [];
  const deliveryOptions = {
    ...options,
    now: "2026-07-19T01:00:00.000Z",
    createReportToken: () => "bud_trial_fresh_report_token",
    sendReportEmail: async (input) => {
      sentEmails.push(input);
      return {
        ok: true,
        accepted: [input.email],
        rejected: [],
        providerMessageId: "ses-message-123"
      };
    }
  };
  const delivered = await deliverQaTrialReport(created.session_id, deliveryOptions);

  assert.equal(delivered.ok, true, delivered.error);
  assert.equal(delivered.delivered, true);
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].email, "founder@example.com");
  assert.match(sentEmails[0].messageId, /^<bud-report-/);
  const reportToken = new URL(sentEmails[0].reportUrl).searchParams.get("token");
  assert.equal(reportToken, "bud_trial_fresh_report_token");
  assert.notEqual(reportToken, leadToken);

  const storedTrial = mock.rows.get(created.session_id).payload.manual_qa.qualification_trial;
  assert.equal(storedTrial.report_delivery.status, "accepted");
  assert.equal(storedTrial.report_delivery.provider_message_id, "ses-message-123");
  assert.equal(storedTrial.report_delivery.accepted_at, "2026-07-19T01:00:00.000Z");
  assert.equal(storedTrial.report_delivery.attempt_count, 1);
  assert.equal(storedTrial.report_delivery.retryable, false);
  assert.equal(JSON.stringify(storedTrial.access).includes(reportToken), false);

  const reportAccess = await verifyQaTrialAccess(created.session_id, reportToken, options);
  assert.equal(reportAccess.ok, true, reportAccess.error);
  assert.equal(reportAccess.role, "lead");
  assert.deepEqual(Object.keys(reportAccess.view.report).sort(), [
    "completed_at",
    "findings",
    "source",
    "status"
  ]);
  assert.equal(reportAccess.view.report.status, "complete");
  assert.equal(reportAccess.view.report.findings.length, 1);
  assert.equal(reportAccess.view.report.findings[0].title, "The primary action was unclear");
  const publicReportJson = JSON.stringify(reportAccess.view.report);
  assert.equal(publicReportJson.includes("INTERNAL_MODEL"), false);
  assert.equal(publicReportJson.includes("INTERNAL_PROVIDER"), false);
  assert.equal(publicReportJson.includes("total_cost_usd"), false);

  const repeated = await deliverQaTrialReport(created.session_id, deliveryOptions);
  assert.equal(repeated.ok, true, repeated.error);
  assert.equal(repeated.delivered, false);
  assert.equal(repeated.idempotent, true);
  assert.equal(sentEmails.length, 1);
  assert.equal((await verifyQaTrialAccess(created.session_id, leadToken, options)).role, "lead");
});

test("an accepted report retries linked-request completion sync without resending email", async () => {
  const mock = createSupabaseFetchMock();
  const { created, options } = await createSubmittedTrialForReportDelivery(mock);
  mock.rows.get(created.session_id).payload.manual_qa.qualification_trial.source_request_id =
    "request_report_sync";
  let emailCount = 0;
  let requestSyncCount = 0;
  const deliveryOptions = {
    ...options,
    now: "2026-07-19T01:15:00.000Z",
    createReportToken: () => "bud_trial_request_sync_report",
    sendReportEmail: async (input) => {
      emailCount += 1;
      return {
        ok: true,
        accepted: [input.email],
        appMessageId: input.messageId,
        providerResponse: "250 Ok request-sync"
      };
    },
    patchHumanTestRequest: async (_requestId, patch) => {
      requestSyncCount += 1;
      return requestSyncCount === 1
        ? { ok: false, status: 503, error: "Request store was temporarily unavailable" }
        : { ok: true, status: 200, request: { status: patch.status } };
    }
  };

  const delivered = await deliverQaTrialReport(created.session_id, deliveryOptions);
  assert.equal(delivered.ok, true, delivered.error);
  assert.equal(delivered.delivered, true);
  assert.match(delivered.warning, /temporarily unavailable/i);

  const repeated = await deliverQaTrialReport(created.session_id, deliveryOptions);
  assert.equal(repeated.ok, true, repeated.error);
  assert.equal(repeated.idempotent, true);
  assert.equal(repeated.warning, undefined);
  assert.equal(emailCount, 1);
  assert.equal(requestSyncCount, 2);
});

test("a stale buyer rating cannot erase an accepted delivery or invalidate its report link", async () => {
  const mock = createSupabaseFetchMock();
  const { created, options } = await createSubmittedTrialForReportDelivery(mock);
  const staleTrial = JSON.parse(JSON.stringify(
    mock.rows.get(created.session_id).payload.manual_qa.qualification_trial
  ));
  let emailCount = 0;
  let reportToken = "";
  const deliveryOptions = {
    ...options,
    now: "2026-07-19T01:20:00.000Z",
    createReportToken: () => "bud_trial_race_safe_report",
    sendReportEmail: async (input) => {
      emailCount += 1;
      reportToken = new URL(input.reportUrl).searchParams.get("token") || "";
      return {
        ok: true,
        accepted: [input.email],
        appMessageId: input.messageId,
        providerResponse: "250 Ok race-safe"
      };
    }
  };
  const delivered = await deliverQaTrialReport(created.session_id, deliveryOptions);
  assert.equal(delivered.ok, true, delivered.error);
  assert.equal(delivered.delivered, true);
  const acceptedTrial = mock.rows.get(created.session_id).payload.manual_qa.qualification_trial;
  const acceptedHashes = [...acceptedTrial.access.lead_report_token_hashes];

  const staleRatingUpdate = await updateManualQaQualificationTrial(
    created.session_id,
    {
      ...staleTrial,
      lead_rating: {
        score: 5,
        note: "Useful report",
        rated_at: "2026-07-19T01:21:00.000Z"
      }
    },
    options
  );
  assert.equal(staleRatingUpdate.ok, true, staleRatingUpdate.error);
  const storedTrial = mock.rows.get(created.session_id).payload.manual_qa.qualification_trial;
  assert.equal(storedTrial.report_delivery.status, "accepted");
  assert.deepEqual(storedTrial.access.lead_report_token_hashes, acceptedHashes);
  assert.equal((await verifyQaTrialAccess(created.session_id, reportToken, options)).role, "lead");

  const repeated = await deliverQaTrialReport(created.session_id, deliveryOptions);
  assert.equal(repeated.ok, true, repeated.error);
  assert.equal(repeated.idempotent, true);
  assert.equal(emailCount, 1);
});

test("an active delivery lease prevents concurrent duplicate email sends", async () => {
  const mock = createSupabaseFetchMock();
  const { created, options } = await createSubmittedTrialForReportDelivery(mock);
  let markSendStarted;
  let releaseSend;
  const sendStarted = new Promise((resolve) => {
    markSendStarted = resolve;
  });
  const sendReleased = new Promise((resolve) => {
    releaseSend = resolve;
  });
  let sendCount = 0;
  const deliveryOptions = {
    ...options,
    now: "2026-07-19T01:30:00.000Z",
    createReportToken: () => "bud_trial_concurrent_report",
    sendReportEmail: async (input) => {
      sendCount += 1;
      markSendStarted();
      await sendReleased;
      return { ok: true, accepted: [input.email], providerMessageId: "ses-concurrent-1" };
    }
  };

  const firstPromise = deliverQaTrialReport(created.session_id, deliveryOptions);
  await sendStarted;
  const concurrent = await deliverQaTrialReport(created.session_id, deliveryOptions);
  releaseSend();
  const first = await firstPromise;

  assert.equal(concurrent.ok, true, concurrent.error);
  assert.equal(concurrent.status, 202);
  assert.equal(concurrent.delivered, false);
  assert.equal(concurrent.delivery.status, "sending");
  assert.equal(first.ok, true, first.error);
  assert.equal(first.delivered, true);
  assert.equal(sendCount, 1);
  assert.equal(
    mock.rows.get(created.session_id).payload.manual_qa.qualification_trial.report_delivery.status,
    "accepted"
  );
});

test("email acceptance persistence keeps a buyer rating saved while SMTP is in flight", async () => {
  const mock = createSupabaseFetchMock();
  const { created, leadToken, options } = await createSubmittedTrialForReportDelivery(mock);
  let markSendStarted;
  let releaseSend;
  const sendStarted = new Promise((resolve) => {
    markSendStarted = resolve;
  });
  const sendReleased = new Promise((resolve) => {
    releaseSend = resolve;
  });
  const deliveryPromise = deliverQaTrialReport(created.session_id, {
    ...options,
    now: "2026-07-19T01:45:00.000Z",
    createReportToken: () => "bud_trial_rating_during_send",
    sendReportEmail: async (input) => {
      markSendStarted();
      await sendReleased;
      return {
        ok: true,
        accepted: [input.email],
        appMessageId: input.messageId,
        providerResponse: "250 Ok rating-preserved"
      };
    }
  });

  await sendStarted;
  const rated = await rateQaTrial(
    created.session_id,
    leadToken,
    { score: 5, note: "This was useful." },
    options
  );
  assert.equal(rated.ok, true, rated.error);
  releaseSend();
  const delivered = await deliveryPromise;

  assert.equal(delivered.ok, true, delivered.error);
  const storedTrial = mock.rows.get(created.session_id).payload.manual_qa.qualification_trial;
  assert.equal(storedTrial.report_delivery.status, "accepted");
  assert.equal(storedTrial.lead_rating.score, 5);
  assert.equal(storedTrial.lead_rating.note, "This was useful.");
});

test("legacy report delivery stays disabled unless an operator force-enables it", async () => {
  const mock = createSupabaseFetchMock();
  const { created, options } = await createSubmittedTrialForReportDelivery(mock);
  delete mock.rows.get(created.session_id).payload.manual_qa.qualification_trial.report_delivery;
  let sendCount = 0;
  const sendReportEmail = async (input) => {
    sendCount += 1;
    return { ok: true, accepted: [input.email], providerMessageId: "ses-legacy-1" };
  };

  const skipped = await deliverQaTrialReport(created.session_id, {
    ...options,
    now: "2026-07-19T02:00:00.000Z",
    sendReportEmail
  });
  assert.equal(skipped.ok, true, skipped.error);
  assert.equal(skipped.skipped, true);
  assert.equal(skipped.delivery.status, "disabled");
  assert.equal(sendCount, 0);

  const forced = await deliverQaTrialReport(created.session_id, {
    ...options,
    now: "2026-07-19T02:01:00.000Z",
    forceEnable: true,
    createReportToken: () => "bud_trial_forced_legacy_report",
    sendReportEmail
  });
  assert.equal(forced.ok, true, forced.error);
  assert.equal(forced.delivered, true);
  assert.equal(sendCount, 1);
  const stored = mock.rows.get(created.session_id).payload.manual_qa.qualification_trial.report_delivery;
  assert.equal(stored.status, "accepted");
  assert.equal(stored.provider_message_id, "ses-legacy-1");
  assert.ok(stored.enabled_at);
});

test("an ambiguous SMTP connection close becomes unknown and is not retried", async () => {
  const mock = createSupabaseFetchMock();
  const { created, options } = await createSubmittedTrialForReportDelivery(mock);
  let sendCount = 0;
  const deliveryOptions = {
    ...options,
    now: "2026-07-19T03:00:00.000Z",
    createReportToken: () => "bud_trial_ambiguous_report",
    sendReportEmail: async () => {
      sendCount += 1;
      const error = new Error("Connection ended after DATA was accepted");
      error.code = "ECONNECTION";
      error.command = "CONN";
      throw error;
    }
  };

  const ambiguous = await deliverQaTrialReport(created.session_id, deliveryOptions);
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.status, 502);
  assert.equal(ambiguous.delivery.status, "unknown");
  assert.equal(ambiguous.delivery.retryable, false);
  assert.match(ambiguous.error, /automatic retries were stopped/i);
  const stored = mock.rows.get(created.session_id).payload.manual_qa.qualification_trial.report_delivery;
  assert.equal(stored.status, "unknown");
  assert.equal(stored.error_code, "email_send_result_unknown");
  assert.equal(stored.retryable, false);

  const repeated = await deliverQaTrialReport(created.session_id, {
    ...deliveryOptions,
    sendReportEmail: async () => {
      sendCount += 1;
      return { ok: true, providerMessageId: "must-not-send" };
    }
  });
  assert.equal(repeated.ok, true, repeated.error);
  assert.equal(repeated.skipped, true);
  assert.equal(repeated.delivery.status, "unknown");
  assert.equal(sendCount, 1);
});

test("a definite pre-send SMTP connection failure is retried without risking a duplicate", async () => {
  const mock = createSupabaseFetchMock();
  const { created, options } = await createSubmittedTrialForReportDelivery(mock);
  let sendCount = 0;
  const firstAttempt = await deliverQaTrialReport(created.session_id, {
    ...options,
    now: "2026-07-19T03:30:00.000Z",
    createReportToken: () => "bud_trial_connection_failure_report",
    sendReportEmail: async () => {
      sendCount += 1;
      const error = new Error("Could not connect to SMTP");
      error.code = "ESOCKET";
      error.command = "CONN";
      error.syscall = "connect";
      error.errno = -61;
      throw error;
    }
  });

  assert.equal(firstAttempt.ok, false);
  assert.equal(firstAttempt.delivery.status, "failed");
  assert.equal(firstAttempt.delivery.retryable, true);
  assert.equal(firstAttempt.delivery.error_code, "email_transport_not_accepted");
  assert.ok(firstAttempt.delivery.next_retry_at);

  const retried = await deliverQaTrialReport(created.session_id, {
    ...options,
    now: "2026-07-19T03:32:00.000Z",
    createReportToken: () => "bud_trial_connection_retry_report",
    sendReportEmail: async (input) => {
      sendCount += 1;
      return { ok: true, accepted: [input.email], providerMessageId: "ses-after-retry" };
    }
  });
  assert.equal(retried.ok, true, retried.error);
  assert.equal(retried.delivered, true);
  assert.equal(retried.delivery.status, "accepted");
  assert.equal(retried.delivery.attempt_count, 2);
  assert.equal(sendCount, 2);
});

test("the buyer cannot rate a submitted trial before analysis completes", async () => {
  const mock = createSupabaseFetchMock();
  const { created, leadToken, options } = await createSubmittedTrialForReportDelivery(mock, {
    complete: false
  });

  const rated = await rateQaTrial(
    created.session_id,
    leadToken,
    { score: 5, note: "Too early." },
    options
  );
  assert.equal(rated.ok, false);
  assert.equal(rated.status, 409);
  assert.match(rated.error, /report must finish/i);
  assert.equal(
    mock.rows.get(created.session_id).payload.manual_qa.qualification_trial.lead_rating.score,
    null
  );
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
  assert.equal(legacyView.view.consent.recording_analysis_accepted, true);
  const scrubbed = normalizeManualQaSessionRow(submittedRow);
  assert.equal(scrubbed.findings_analysis.status, "not_started");
  assert.deepEqual(scrubbed.findings_analysis.findings, []);
  assert.deepEqual(scrubbed.work_packets, []);
  assert.equal(
    JSON.stringify(scrubbed.checklist).includes("Unauthorized historical transcript"),
    false
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

  const completedRow = mock.rows.get(sessionId);
  completedRow.payload.manual_qa.qualification_trial.tester.recording_analysis_consent_version = 1;
  completedRow.payload.manual_qa.qualification_trial.tester.recording_analysis_consent_at =
    "2026-07-19T00:09:00.000Z";
  installCompleteRecordingAnalysis(mock, sessionId);

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

test("legacy analysis action queues without requiring a post-submit permission", async () => {
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
  assert.equal(reaccepted.view.consent.recording_analysis_accepted, true);
  const afterReaccept = mock.rows.get(created.session_id).payload.manual_qa.qualification_trial;
  assert.equal(Number(afterReaccept.tester.recording_analysis_consent_version || 0), 0);
  assert.equal(afterReaccept.tester.recording_analysis_consent_at || null, null);

  let queueCalls = 0;
  const queued = await queueQaTrialRecordingAnalysis(created.session_id, testerToken, {
    ...options,
    queueManualQaFindingsAnalysis: async () => {
      queueCalls += 1;
      const row = mock.rows.get(created.session_id);
      return { ok: true, status: 200, row, session: normalizeManualQaSessionRow(row) };
    }
  });
  assert.equal(queued.ok, true, queued.error);
  assert.equal(queueCalls, 1);
  assert.equal(queued.view.consent.recording_analysis_accepted, true);
  assert.equal(Number(afterReaccept.tester.recording_analysis_consent_version || 0), 0);
  assert.equal(afterReaccept.tester.recording_analysis_consent_at || null, null);
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
