const crypto = require("crypto");

const { isValidEmail } = require("./auth");
const {
  MANUAL_QA_RECORDING_ANALYSIS_CONSENT_VERSION,
  buildSafeExportSession,
  createManualQaSession,
  getManualQaSession,
  hasManualQaRecordingAnalysisConsent,
  inspectManualQaRecordingMediaSet,
  listManualQaSessions,
  queueManualQaFindingsAnalysis,
  updateManualQaQualificationTrial,
  updateManualQaWidgetItem
} = require("./manual-qa");
const {
  getPublicBaseUrl,
  isPlainObject,
  normalizeUrl,
  sanitizeOptionalString,
  sanitizeString
} = require("./qa-core");
const {
  sendHumanTestReportReadyEmail,
  sendQaTrialInviteEmail
} = require("./qa-alert-email");
const { openSecretObject, sealSecretObject } = require("./qa-secret-box");

const TRIAL_TOKEN_PREFIX = "bud_trial_";
const DEFAULT_QUALIFICATION_DURATION_MINUTES = 15;
const MAX_QA_TRIAL_DURATION_MINUTES = 60;
const REPORT_DELIVERY_LEASE_MS = 5 * 60 * 1000;
const MAX_REPORT_DELIVERY_ATTEMPTS = 5;
const CLARITY_SCORES = {
  needs_work: 0,
  good: 5,
  excellent: 10
};

function createTrialToken() {
  return `${TRIAL_TOKEN_PREFIX}${crypto.randomBytes(24).toString("base64url")}`;
}

function hashTrialToken(token) {
  return crypto.createHash("sha256").update(sanitizeString(token, 512)).digest("hex");
}

function compareTrialToken(token, expectedHash) {
  const actual = Buffer.from(hashTrialToken(token), "utf8");
  const expected = Buffer.from(sanitizeString(expectedHash, 256), "utf8");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function normalizeReportDelivery(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const rawStatus = sanitizeString(source.status, 40).toLowerCase();
  const status = ["disabled", "pending", "sending", "accepted", "failed", "unknown"].includes(rawStatus)
    ? rawStatus
    : "disabled";
  return {
    status,
    enabled_at: sanitizeOptionalString(source.enabled_at || source.enabledAt, 128) || null,
    analysis_id: sanitizeOptionalString(source.analysis_id || source.analysisId, 160) || null,
    recording_fingerprint:
      sanitizeOptionalString(source.recording_fingerprint || source.recordingFingerprint, 160) || null,
    delivery_key: sanitizeOptionalString(source.delivery_key || source.deliveryKey, 160) || null,
    recipient: sanitizeOptionalString(source.recipient, 320)?.toLowerCase() || null,
    attempt_count: Math.max(0, Math.round(Number(source.attempt_count || source.attemptCount || 0) || 0)),
    lease_id: sanitizeOptionalString(source.lease_id || source.leaseId, 160) || null,
    lease_expires_at:
      sanitizeOptionalString(source.lease_expires_at || source.leaseExpiresAt, 128) || null,
    last_attempt_at:
      sanitizeOptionalString(source.last_attempt_at || source.lastAttemptAt, 128) || null,
    accepted_at: sanitizeOptionalString(source.accepted_at || source.acceptedAt, 128) || null,
    failed_at: sanitizeOptionalString(source.failed_at || source.failedAt, 128) || null,
    next_retry_at: sanitizeOptionalString(source.next_retry_at || source.nextRetryAt, 128) || null,
    app_message_id:
      sanitizeOptionalString(source.app_message_id || source.appMessageId, 512) || null,
    provider_message_id:
      sanitizeOptionalString(source.provider_message_id || source.providerMessageId, 512) || null,
    provider_response:
      sanitizeOptionalString(source.provider_response || source.providerResponse, 1200) || null,
    error_code: sanitizeOptionalString(source.error_code || source.errorCode, 160) || null,
    retryable:
      typeof source.retryable === "boolean"
        ? source.retryable
        : !["accepted", "disabled", "unknown"].includes(status)
  };
}

function currentReportAnalysis(session = {}) {
  const analysis = isPlainObject(session.findings_analysis || session.findingsAnalysis)
    ? session.findings_analysis || session.findingsAnalysis
    : {};
  return {
    ...analysis,
    status: sanitizeString(analysis.status, 40).toLowerCase() || "not_started",
    analysis_id: sanitizeOptionalString(analysis.analysis_id || analysis.analysisId, 160) || null,
    recording_fingerprint:
      sanitizeOptionalString(analysis.recording_fingerprint || analysis.recordingFingerprint, 160) || null
  };
}

function reportAnalysisIdentity(analysis = {}) {
  return {
    analysisId:
      sanitizeString(analysis.analysis_id || analysis.analysisId, 160) ||
      sanitizeString(analysis.recording_fingerprint || analysis.recordingFingerprint, 160) ||
      "complete",
    recordingFingerprint:
      sanitizeString(analysis.recording_fingerprint || analysis.recordingFingerprint, 160) || null
  };
}

function deliveryMatchesAnalysis(delivery = {}, analysis = {}) {
  const identity = reportAnalysisIdentity(analysis);
  return Boolean(
    delivery.analysis_id === identity.analysisId &&
      (delivery.recording_fingerprint || null) === identity.recordingFingerprint
  );
}

function reportDeliveryNeedsAction(session = {}, nowMs = Date.now()) {
  const analysis = currentReportAnalysis(session);
  if (analysis.status !== "complete") return false;
  const delivery = normalizeReportDelivery(
    session.qualification_trial?.report_delivery ||
      session.qualification_trial?.reportDelivery ||
      session.qualificationTrial?.report_delivery ||
      session.qualificationTrial?.reportDelivery
  );
  const matchesAnalysis = deliveryMatchesAnalysis(delivery, analysis);
  if (delivery.status === "disabled" || delivery.status === "unknown") return false;
  if (delivery.status === "accepted" && matchesAnalysis) return false;
  if (delivery.status === "sending") {
    const leaseExpiresAt = Date.parse(delivery.lease_expires_at || "");
    return !Number.isFinite(leaseExpiresAt) || leaseExpiresAt <= nowMs;
  }
  if (matchesAnalysis && delivery.attempt_count >= MAX_REPORT_DELIVERY_ATTEMPTS) return false;
  if (delivery.status === "failed") {
    if (delivery.retryable !== true) return false;
    const retryAt = Date.parse(delivery.next_retry_at || "");
    return !Number.isFinite(retryAt) || retryAt <= nowMs;
  }
  return delivery.status === "pending" || !matchesAnalysis;
}

function buildBuyerReportProjection(session = {}) {
  const safe = buildSafeExportSession(session, { customer: true }) || {};
  const analysis = isPlainObject(safe.findings_analysis) ? safe.findings_analysis : {};
  const status = sanitizeString(analysis.status, 40).toLowerCase() || "not_started";
  return {
    status,
    source: sanitizeOptionalString(analysis.source, 80) || null,
    completed_at: sanitizeOptionalString(analysis.completed_at, 128) || null,
    findings: status === "complete" && Array.isArray(analysis.findings)
      ? analysis.findings
      : []
  };
}

function buildReportDeliveryView(value = {}) {
  const delivery = normalizeReportDelivery(value);
  return {
    status: delivery.status,
    recipient: delivery.recipient,
    attempt_count: delivery.attempt_count,
    last_attempt_at: delivery.last_attempt_at,
    accepted_at: delivery.accepted_at,
    failed_at: delivery.failed_at,
    next_retry_at: delivery.next_retry_at,
    app_message_id: delivery.app_message_id,
    provider_message_id: delivery.provider_message_id,
    provider_response: delivery.provider_response,
    error_code: delivery.error_code,
    retryable: delivery.retryable
  };
}

function reportDeliveryKey(sessionId, analysis = {}) {
  const identity = reportAnalysisIdentity(analysis);
  return crypto
    .createHash("sha256")
    .update(`${sanitizeString(sessionId, 128)}:${identity.analysisId}:${identity.recordingFingerprint || ""}`)
    .digest("hex");
}

function reportDeliveryMessageId(deliveryKey) {
  return `<bud-report-${sanitizeString(deliveryKey, 160).slice(0, 48)}@beforeusersdo.com>`;
}

function retryTimeForAttempt(attemptCount, nowMs) {
  const delayMinutes = [1, 5, 15, 30, 60][Math.max(0, Math.min(4, attemptCount - 1))];
  return new Date(nowMs + delayMinutes * 60 * 1000).toISOString();
}

function reportEmailErrorIsSafeToRetry(error) {
  const code = sanitizeString(error?.code, 80).toUpperCase();
  const syscall = sanitizeString(error?.syscall || error?.cause?.syscall, 80).toLowerCase();
  if (["EAUTH", "EDNS", "EENVELOPE"].includes(code)) return true;
  return syscall === "connect";
}

function normalizeBenchmarkIssues(value) {
  const source = Array.isArray(value)
    ? value
    : sanitizeString(value, 12000)
        .split(/\r?\n/)
        .map((line) => line.replace(/^\s*[-*0-9.)]+\s*/, ""));
  return source
    .map((entry, index) => {
      const issue = isPlainObject(entry) ? entry : { title: entry };
      const title = sanitizeString(issue.title || issue.name || issue.summary, 240);
      if (!title) return null;
      return {
        id: sanitizeString(issue.id, 80) || `issue_${index + 1}`,
        title,
        description: sanitizeOptionalString(issue.description || issue.details, 1200) || null
      };
    })
    .filter(Boolean)
    .slice(0, 24);
}

function rawTrialFromRow(row) {
  const payload = isPlainObject(row?.payload) ? row.payload : {};
  const manual = isPlainObject(payload.manual_qa) ? payload.manual_qa : {};
  return isPlainObject(manual.qualification_trial) ? manual.qualification_trial : null;
}

function assignmentTypeOf(trial) {
  return trial?.kind === "paid_assignment" || trial?.assignment?.type === "paid"
    ? "paid"
    : "qualification";
}

function trustedFinalTrialRecordings(session = {}) {
  const inspection = inspectManualQaRecordingMediaSet(session);
  if (!inspection.ok) return [];
  return inspection.recordings.filter((entry) => {
    const contentType = sanitizeString(entry.content_type, 128).toLowerCase();
    return Boolean(
      sanitizeString(entry.evidence_id, 160) &&
        contentType.startsWith("video/") &&
        Number.isFinite(Number(entry.byte_length)) &&
        Number(entry.byte_length) > 0 &&
        Number.isFinite(Number(entry.duration_ms)) &&
        Number(entry.duration_ms) > 0
    );
  });
}

function deriveTrialStatus(trial) {
  if (trial?.qualification?.status === "verified") {
    if (assignmentTypeOf(trial) === "paid") return "completed";
    return trial?.lead_rating?.score ? "completed" : "verified";
  }
  if (trial?.submitted_at) return "submitted";
  if (trial?.status === "in_progress") return "in_progress";
  if (trial?.lead?.accepted_at && trial?.tester?.accepted_at) return "ready";
  return "awaiting_consent";
}

function buildTrialUrl(baseUrl, sessionId, token) {
  const params = new URLSearchParams({ session_id: sessionId, token });
  return `${sanitizeString(baseUrl, 4096).replace(/\/$/, "")}/trial?${params.toString()}`;
}

function buildAdminTrialUrl(baseUrl, sessionId) {
  const params = new URLSearchParams({ session_id: sessionId });
  return `${sanitizeString(baseUrl, 4096).replace(/\/$/, "")}/trials?${params.toString()}`;
}

function normalizeTrialAccess(input = {}, options = {}) {
  const details = isPlainObject(input.access_details || input.accessDetails)
    ? input.access_details || input.accessDetails
    : {};
  const credentials = isPlainObject(input.credentials) ? input.credentials : null;
  const explicitMode = sanitizeString(input.access_mode || input.accessMode || details.mode, 60).toLowerCase();
  const mode = ["public_only", "signup_allowed", "test_account"].includes(explicitMode)
    ? explicitMode
    : credentials
      ? "test_account"
      : details.account_creation_allowed === true
        ? "signup_allowed"
        : "public_only";
  if (mode === "test_account" && !credentials) {
    return { ok: false, status: 400, error: "Test-account access requires credentials" };
  }
  const sealed = sealSecretObject(credentials, options);
  if (!sealed.ok) return sealed;
  return {
    ok: true,
    access: {
      mode,
      login_url:
        normalizeUrl(details.login_url || details.loginUrl || credentials?.login_url || credentials?.loginUrl) || null,
      credentials_supplied: Boolean(credentials),
      account_creation_allowed: mode === "signup_allowed",
      purchase_allowed: details.purchase_allowed === true || details.purchaseAllowed === true,
      irreversible_actions_allowed:
        details.irreversible_actions_allowed === true || details.irreversibleActionsAllowed === true,
      prohibited_actions: Array.isArray(details.prohibited_actions || details.prohibitedActions)
        ? (details.prohibited_actions || details.prohibitedActions)
            .map((entry) => sanitizeString(entry, 400))
            .filter(Boolean)
            .slice(0, 20)
        : [],
      private_credentials: sealed.envelope
    }
  };
}

async function syncHumanTestRequestStatus(trial, status, options = {}, patch = {}) {
  const requestId = sanitizeString(trial?.source_request_id || trial?.sourceRequestId, 128);
  if (!requestId) return { ok: true, skipped: true };
  try {
    const patchHumanTestRequest = typeof options.patchHumanTestRequest === "function"
      ? options.patchHumanTestRequest
      : require("./human-test-requests").patchHumanTestRequest;
    return await patchHumanTestRequest(requestId, { status, ...patch }, options);
  } catch (caught) {
    return {
      ok: false,
      error: caught instanceof Error ? caught.message : "Could not sync the human test request"
    };
  }
}

function buildPublicTrialView(session, trial, role, options = {}) {
  const item = Array.isArray(session?.checklist) ? session.checklist[0] || null : null;
  const qualification = isPlainObject(trial?.qualification) ? trial.qualification : {};
  const leadRating = isPlainObject(trial?.lead_rating) ? trial.lead_rating : {};
  const qualificationScore = qualification.score === null || qualification.score === undefined || qualification.score === ""
    ? null
    : Number(qualification.score);
  const customerScore = leadRating.score === null || leadRating.score === undefined || leadRating.score === ""
    ? null
    : Number(leadRating.score);
  const rawAccess = isPlainObject(trial?.access) ? trial.access : {};
  const assignmentType = assignmentTypeOf(trial);
  const report = buildBuyerReportProjection(session);
  const rawAssignment = isPlainObject(trial?.assignment) ? trial.assignment : {};
  const assignment = {
    type: assignmentType,
    payout_status: ["not_applicable", "pending", "approved", "paid"].includes(rawAssignment.payout_status)
      ? rawAssignment.payout_status
      : assignmentType === "paid"
        ? "pending"
        : "not_applicable"
  };
  if (role !== "lead") {
    assignment.tester_pay_cents = Math.max(0, Math.round(Number(rawAssignment.tester_pay_cents) || 0));
    assignment.tester_pay_currency = sanitizeString(rawAssignment.tester_pay_currency, 3).toUpperCase() || "USD";
  }
  const publicAccess = {
    mode: ["public_only", "signup_allowed", "test_account"].includes(rawAccess.mode)
      ? rawAccess.mode
      : "public_only",
    login_url: normalizeUrl(rawAccess.login_url) || null,
    credentials_supplied: rawAccess.credentials_supplied === true,
    account_creation_allowed: rawAccess.account_creation_allowed === true,
    purchase_allowed: rawAccess.purchase_allowed === true,
    irreversible_actions_allowed: rawAccess.irreversible_actions_allowed === true,
    prohibited_actions: Array.isArray(rawAccess.prohibited_actions)
      ? rawAccess.prohibited_actions.map((entry) => sanitizeString(entry, 400)).filter(Boolean).slice(0, 20)
      : []
  };
  if (role === "tester" && rawAccess.private_credentials) {
    const opened = openSecretObject(rawAccess.private_credentials, options);
    if (opened.ok && opened.value) {
      publicAccess.credentials = {
        login_url: normalizeUrl(opened.value.login_url || opened.value.loginUrl) || publicAccess.login_url,
        username: sanitizeOptionalString(opened.value.username, 320) || null,
        password: sanitizeOptionalString(opened.value.password, 320) || null,
        otp_mode: sanitizeOptionalString(opened.value.otp_mode || opened.value.otpMode, 40) || "none"
      };
    }
  }
  return {
    session_id: session.session_id,
    role,
    status: deriveTrialStatus(trial),
    product_name: sanitizeString(trial?.product_name, 180) || session.brand_name || session.brand_key || "Product",
    target_url: session.target_url,
    test_focus: sanitizeString(trial?.test_focus, 2400),
    duration_minutes: Math.max(
      10,
      Math.min(
        MAX_QA_TRIAL_DURATION_MINUTES,
        Number(trial?.duration_minutes) || DEFAULT_QUALIFICATION_DURATION_MINUTES
      )
    ),
    assignment,
    access: publicAccess,
    consent: {
      accepted: Boolean(trial?.[role]?.accepted_at),
      lead_accepted: Boolean(trial?.lead?.accepted_at),
      tester_accepted: Boolean(trial?.tester?.accepted_at),
      recording_analysis_accepted: Boolean(
        trial?.submitted_at ||
          (
            Number(trial?.tester?.recording_analysis_consent_version || 0) >=
              MANUAL_QA_RECORDING_ANALYSIS_CONSENT_VERSION &&
            trial?.tester?.recording_analysis_consent_at
          )
      )
    },
    tester: {
      name: sanitizeOptionalString(trial?.tester?.name, 180) || "Your tester"
    },
    lead: {
      name: sanitizeOptionalString(trial?.lead?.name, 180) || "Product owner"
    },
    submission: {
      submitted_at: sanitizeOptionalString(trial?.submitted_at, 128) || null,
      note: sanitizeOptionalString(item?.note, 4000) || null,
      evidence_media: Array.isArray(item?.evidence_media)
        ? item.evidence_media.map((entry) => ({
            evidence_id: sanitizeOptionalString(entry.evidence_id, 160) || null,
            recording_index: Number.isInteger(Number(entry.recording_index)) && Number(entry.recording_index) > 0
              ? Number(entry.recording_index)
              : null,
            kind: sanitizeOptionalString(entry.kind, 32) || null,
            label: sanitizeOptionalString(entry.label, 240) || null,
            content_type: sanitizeOptionalString(entry.content_type, 128) || null,
            byte_length: Math.max(0, Number(entry.byte_length) || 0),
            duration_ms: Number.isFinite(Number(entry.duration_ms))
              ? Math.max(0, Math.round(Number(entry.duration_ms)))
              : null,
            url: sanitizeOptionalString(entry.url, 4096) || null,
            created_at: sanitizeOptionalString(entry.created_at, 128) || null
          }))
        : []
    },
    ...(role === "lead" || role === "admin" ? { report } : {}),
    qualification: {
      label: assignmentType === "paid" ? "BUD reviewed assignment" : "BUD Verified Trial",
      status: sanitizeString(qualification.status, 80) || "pending",
      score: Number.isFinite(qualificationScore) ? qualificationScore : null,
      reviewer_note: sanitizeOptionalString(qualification.reviewer_note, 2400) || null,
      scored_at: sanitizeOptionalString(qualification.scored_at, 128) || null
    },
    lead_rating: {
      score: Number.isFinite(customerScore) ? customerScore : null,
      note: sanitizeOptionalString(leadRating.note, 2400) || null,
      rated_at: sanitizeOptionalString(leadRating.rated_at, 128) || null
    }
  };
}

function buildAdminTrialView(session, trial, options = {}) {
  const publicView = buildPublicTrialView(session, trial, "admin", options);
  const optionalScore = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };
  return {
    ...publicView,
    source_request_id: sanitizeOptionalString(trial?.source_request_id, 128) || null,
    report_delivery: buildReportDeliveryView(trial?.report_delivery),
    lead: {
      name: sanitizeOptionalString(trial?.lead?.name, 180) || null,
      email: sanitizeOptionalString(trial?.lead?.email, 320) || null,
      accepted_at: sanitizeOptionalString(trial?.lead?.accepted_at, 128) || null
    },
    tester: {
      name: sanitizeOptionalString(trial?.tester?.name, 180) || null,
      email: sanitizeOptionalString(trial?.tester?.email, 320) || null,
      accepted_at: sanitizeOptionalString(trial?.tester?.accepted_at, 128) || null
    },
    benchmark: {
      issues: normalizeBenchmarkIssues(trial?.benchmark?.issues),
      issue_count: normalizeBenchmarkIssues(trial?.benchmark?.issues).length
    },
    qualification: {
      ...publicView.qualification,
      caught_issue_ids: Array.isArray(trial?.qualification?.caught_issue_ids)
        ? trial.qualification.caught_issue_ids.map((entry) => sanitizeString(entry, 80)).filter(Boolean)
        : [],
      coverage_score: optionalScore(trial?.qualification?.coverage_score),
      evidence_score: optionalScore(trial?.qualification?.evidence_score),
      clarity_score: optionalScore(trial?.qualification?.clarity_score)
    }
  };
}

async function createQaTrial(input = {}, options = {}) {
  const targetUrl = normalizeUrl(input.target_url || input.targetUrl || input.url);
  const leadEmail = sanitizeString(input.lead_email || input.leadEmail, 320).toLowerCase();
  const testerEmail = sanitizeString(input.tester_email || input.testerEmail, 320).toLowerCase();
  const productName = sanitizeString(input.product_name || input.productName || input.brand_name || input.brand, 180);
  const testFocus = sanitizeString(input.test_focus || input.testFocus || input.flow || input.what_to_test, 2400);
  const benchmarkIssues = normalizeBenchmarkIssues(
    input.known_issues || input.knownIssues || input.benchmark_issues || input.benchmarkIssues
  );
  const assignmentType = sanitizeString(input.assignment_type || input.assignmentType, 40).toLowerCase() === "paid"
    ? "paid"
    : "qualification";
  const testerPayCents = Math.max(0, Math.round(Number(input.tester_pay_cents || input.testerPayCents) || 0));
  const testerPayCurrency = sanitizeString(
    input.tester_pay_currency || input.testerPayCurrency,
    3
  ).toUpperCase() || "USD";

  if (!targetUrl) return { ok: false, status: 400, error: "target_url must be a valid http or https URL" };
  if (!isValidEmail(leadEmail)) return { ok: false, status: 400, error: "lead_email must be a valid email" };
  if (!isValidEmail(testerEmail)) return { ok: false, status: 400, error: "tester_email must be a valid email" };
  if (!productName) return { ok: false, status: 400, error: "product_name is required" };
  if (!testFocus) return { ok: false, status: 400, error: "test_focus is required" };
  if (!benchmarkIssues.length) {
    return { ok: false, status: 400, error: "Add at least one private review point before assigning this test" };
  }
  if (assignmentType === "paid" && testerPayCents < 1) {
    return { ok: false, status: 400, error: "Paid assignments require an exact tester payment" };
  }

  const accessResult = normalizeTrialAccess(input, options);
  if (!accessResult.ok) return accessResult;

  const now = new Date().toISOString();
  const leadToken = createTrialToken();
  const testerToken = createTrialToken();
  const trial = {
    version: 1,
    kind: assignmentType === "paid" ? "paid_assignment" : "tester_qualification",
    status: "awaiting_consent",
    product_name: productName,
    test_focus: testFocus,
    duration_minutes: Math.max(
      10,
      Math.min(
        MAX_QA_TRIAL_DURATION_MINUTES,
        Number(input.duration_minutes || input.durationMinutes) ||
          DEFAULT_QUALIFICATION_DURATION_MINUTES
      )
    ),
    created_at: now,
    updated_at: now,
    submitted_at: null,
    report_delivery: {
      status: "pending",
      enabled_at: now,
      analysis_id: null,
      recording_fingerprint: null,
      delivery_key: null,
      recipient: leadEmail,
      attempt_count: 0,
      lease_id: null,
      lease_expires_at: null,
      last_attempt_at: null,
      accepted_at: null,
      failed_at: null,
      next_retry_at: null,
      provider_message_id: null,
      app_message_id: null,
      provider_response: null,
      error_code: null,
      retryable: true
    },
    assignment: {
      type: assignmentType,
      tester_pay_cents: assignmentType === "paid" ? testerPayCents : 0,
      tester_pay_currency: testerPayCurrency,
      payout_status: assignmentType === "paid" ? "pending" : "not_applicable",
      payout_approved_at: null,
      payout_paid_at: null
    },
    lead: {
      name: sanitizeOptionalString(input.lead_name || input.leadName, 180) || null,
      email: leadEmail,
      accepted_at: input.lead_preapproved === true || input.leadPreapproved === true ? now : null
    },
    tester: {
      name: sanitizeOptionalString(input.tester_name || input.testerName, 180) || null,
      email: testerEmail,
      accepted_at: null
    },
    access: {
      lead_token_hash: hashTrialToken(leadToken),
      tester_token_hash: hashTrialToken(testerToken),
      ...accessResult.access
    },
    source_request_id: sanitizeOptionalString(input.source_request_id || input.sourceRequestId, 128) || null,
    benchmark: {
      issues: benchmarkIssues,
      issue_count: benchmarkIssues.length
    },
    qualification: {
      label: assignmentType === "paid" ? "BUD reviewed assignment" : "BUD Verified Trial",
      status: "pending",
      score: null,
      caught_issue_ids: [],
      coverage_score: null,
      evidence_score: null,
      clarity_score: null,
      reviewer_note: null,
      scored_at: null
    },
    lead_rating: {
      score: null,
      note: null,
      rated_at: null
    }
  };

  const created = await createManualQaSession(
    {
      target_url: targetUrl,
      brand_name: productName,
      title: assignmentType === "paid" ? `${productName} paid QA assignment` : `${productName} free QA trial`,
      review_mode: "freestyle",
      feedback_action: "share_feedback",
      work_summary: testFocus,
      freestyle_title: assignmentType === "paid" ? `${productName} paid product test` : `${productName} qualification review`,
      freestyle_prompt: `Spend ${trial.duration_minutes} minutes trying the requested flow. Record your screen and voice, explain what is confusing or broken, and include clear proof.`,
      expected_success: "The product owner receives a useful recording and evidence-backed list of problems.",
      widget_token: testerToken,
      qualification_trial: trial
    },
    {
      ...options,
      launchedBy: options.launchedBy || "qa_trial_pairing"
    }
  );
  if (!created.ok) return created;

  const baseUrl = sanitizeString(options.publicBaseUrl, 4096).replace(/\/$/, "");
  const leadUrl = buildTrialUrl(baseUrl, created.session.session_id, leadToken);
  const testerUrl = buildTrialUrl(baseUrl, created.session.session_id, testerToken);
  const sendInvite = async (input) => {
    if (options.sendInvites === false) return { ok: false, skipped: true, error: "Invitation delivery disabled" };
    try {
      return await sendQaTrialInviteEmail(input, options);
    } catch (caught) {
      return {
        ok: false,
        skipped: false,
        error: caught instanceof Error ? caught.message : "Invitation could not be sent"
      };
    }
  };
  const [leadDelivery, testerDelivery] = await Promise.all([
    sendInvite({
      email: leadEmail,
      role: "lead",
      productName,
      testFocus,
      durationMinutes: trial.duration_minutes,
      trialUrl: leadUrl,
      leadPreapproved: Boolean(trial.lead.accepted_at),
      assignmentType,
      testerPayCents,
      testerPayCurrency
    }),
    sendInvite({
      email: testerEmail,
      role: "tester",
      productName,
      testFocus,
      durationMinutes: trial.duration_minutes,
      trialUrl: testerUrl,
      assignmentType,
      testerPayCents,
      testerPayCurrency
    })
  ]);
  return {
    ok: true,
    status: 201,
    session_id: created.session.session_id,
    trial: buildAdminTrialView(created.session, trial, options),
    lead_url: leadUrl,
    tester_url: testerUrl,
    admin_url: buildAdminTrialUrl(baseUrl, created.session.session_id),
    delivery: {
      lead: leadDelivery,
      tester: testerDelivery
    }
  };
}

async function verifyQaTrialAccess(sessionId, token, options = {}) {
  const loaded = await getManualQaSession(sessionId, {
    ...options,
    widgetAccessOk: true
  });
  if (!loaded.ok) return loaded;
  const trial = rawTrialFromRow(loaded.row);
  if (!trial) return { ok: false, status: 404, error: "QA trial not found" };
  const access = isPlainObject(trial.access) ? trial.access : {};
  const leadReportTokenHashes = Array.isArray(access.lead_report_token_hashes)
    ? access.lead_report_token_hashes
    : [];
  const role = compareTrialToken(token, access.lead_token_hash) ||
      leadReportTokenHashes.some((expectedHash) => compareTrialToken(token, expectedHash))
    ? "lead"
    : compareTrialToken(token, access.tester_token_hash) ||
        compareTrialToken(token, access.tester_dashboard_token_hash)
      ? "tester"
      : "";
  if (!role) return { ok: false, status: 401, error: "Trial link is invalid" };
  return {
    ok: true,
    status: 200,
    role,
    trial,
    session: loaded.session,
    row: loaded.row,
    view: buildPublicTrialView(loaded.session, trial, role, options)
  };
}

async function deliverQaTrialReport(sessionId, options = {}) {
  const safeSessionId = sanitizeString(sessionId, 128);
  if (!safeSessionId) return { ok: false, status: 400, error: "session_id is required" };
  const loadSession = options.loadManualQaSession || getManualQaSession;
  const updateTrial = options.updateManualQaQualificationTrial || updateManualQaQualificationTrial;
  const sendReportEmail = options.sendReportEmail || sendHumanTestReportReadyEmail;
  const createReportToken = options.createReportToken || createTrialToken;
  const nowValue = typeof options.now === "function" ? options.now() : options.now;
  const nowDate = nowValue ? new Date(nowValue) : new Date();
  const nowMs = Number.isFinite(nowDate.getTime()) ? nowDate.getTime() : Date.now();
  const now = new Date(nowMs).toISOString();

  let loaded = await loadSession(safeSessionId, options);
  if (!loaded.ok) return loaded;
  let trial = rawTrialFromRow(loaded.row);
  if (!trial) return { ok: false, status: 404, error: "QA trial not found" };
  const analysis = currentReportAnalysis(loaded.session);
  if (analysis.status !== "complete") {
    return { ok: false, status: 409, error: "Recording analysis must finish before the report is delivered" };
  }
  const identity = reportAnalysisIdentity(analysis);
  let delivery = normalizeReportDelivery(trial.report_delivery);

  if (delivery.status === "disabled") {
    if (options.forceEnable !== true) {
      return {
        ok: true,
        status: 200,
        skipped: true,
        delivery: buildReportDeliveryView(delivery)
      };
    }
    const enabledTrial = {
      ...trial,
      report_delivery: {
        ...delivery,
        status: "pending",
        enabled_at: delivery.enabled_at || now,
        recipient: sanitizeString(trial.lead?.email, 320).toLowerCase() || null,
        retryable: true
      },
      updated_at: now
    };
    const enabled = await updateTrial(safeSessionId, enabledTrial, {
      ...options,
      allowReportDeliveryMutation: true,
      reportDeliveryOnlyMutation: true,
      expectedReportDeliveryStatus: "disabled",
      expectedReportDeliveryLeaseId: delivery.lease_id,
      expectedReportDeliveryAnalysisId: delivery.analysis_id
    });
    if (!enabled.ok) return enabled;
    loaded = enabled;
    trial = rawTrialFromRow(enabled.row);
    if (!trial) return { ok: false, status: 500, error: "The enabled report delivery could not be reloaded" };
    delivery = normalizeReportDelivery(trial?.report_delivery);
  }

  if (delivery.status === "accepted" && deliveryMatchesAnalysis(delivery, analysis)) {
    const requestSync = await syncHumanTestRequestStatus(trial, "completed", options);
    return {
      ok: true,
      status: 200,
      delivered: false,
      idempotent: true,
      delivery: buildReportDeliveryView(delivery),
      ...(requestSync.ok ? {} : { warning: requestSync.error || "The linked request status was not updated" })
    };
  }

  if (delivery.status === "sending") {
    const leaseExpiresAt = Date.parse(delivery.lease_expires_at || "");
    if (Number.isFinite(leaseExpiresAt) && leaseExpiresAt > nowMs) {
      return {
        ok: true,
        status: 202,
        delivered: false,
        delivery: buildReportDeliveryView(delivery)
      };
    }
    const uncertainTrial = {
      ...trial,
      report_delivery: {
        ...delivery,
        status: "unknown",
        lease_id: null,
        lease_expires_at: null,
        error_code: "email_send_result_unknown",
        retryable: false
      },
      updated_at: now
    };
    const uncertain = await updateTrial(safeSessionId, uncertainTrial, {
      ...options,
      allowReportDeliveryMutation: true,
      reportDeliveryOnlyMutation: true,
      expectedReportDeliveryStatus: "sending",
      expectedReportDeliveryLeaseId: delivery.lease_id,
      expectedReportDeliveryAnalysisId: delivery.analysis_id
    });
    const uncertainDelivery = uncertain.ok
      ? rawTrialFromRow(uncertain.row)?.report_delivery
      : uncertain.trial?.report_delivery || delivery;
    return {
      ok: false,
      status: uncertain.ok ? 409 : uncertain.status || 409,
      delivered: false,
      error: uncertain.ok
        ? "Email acceptance could not be confirmed; automatic retries were stopped to prevent a duplicate"
        : uncertain.error,
      delivery: buildReportDeliveryView(uncertainDelivery)
    };
  }

  if (!reportDeliveryNeedsAction({
    ...loaded.session,
    qualification_trial: { ...loaded.session.qualification_trial, report_delivery: delivery }
  }, nowMs)) {
    return {
      ok: true,
      status: 200,
      skipped: true,
      delivered: false,
      delivery: buildReportDeliveryView(delivery)
    };
  }

  const recipient = sanitizeString(trial.lead?.email, 320).toLowerCase();
  if (!isValidEmail(recipient)) {
    return { ok: false, status: 409, error: "The product owner does not have a valid email address" };
  }

  const token = createReportToken();
  const tokenHash = hashTrialToken(token);
  const access = isPlainObject(trial.access) ? trial.access : {};
  const existingReportHashes = Array.isArray(access.lead_report_token_hashes)
    ? access.lead_report_token_hashes.map((entry) => sanitizeString(entry, 256)).filter(Boolean)
    : [];
  const deliveryKey = reportDeliveryKey(safeSessionId, analysis);
  const leaseId = `report_delivery_${crypto.randomBytes(12).toString("hex")}`;
  const attemptCount = deliveryMatchesAnalysis(delivery, analysis)
    ? delivery.attempt_count + 1
    : 1;
  const claimedDelivery = {
    ...delivery,
    status: "sending",
    analysis_id: identity.analysisId,
    recording_fingerprint: identity.recordingFingerprint,
    delivery_key: deliveryKey,
    recipient,
    attempt_count: attemptCount,
    lease_id: leaseId,
    lease_expires_at: new Date(nowMs + REPORT_DELIVERY_LEASE_MS).toISOString(),
    last_attempt_at: now,
    accepted_at: null,
    failed_at: null,
    next_retry_at: null,
    provider_message_id: null,
    app_message_id: null,
    provider_response: null,
    error_code: null,
    retryable: true
  };
  const claimTrial = {
    ...trial,
    access: {
      ...access,
      lead_report_token_hashes: [...existingReportHashes.slice(-4), tokenHash]
    },
    report_delivery: claimedDelivery,
    updated_at: now
  };
  const claimed = await updateTrial(safeSessionId, claimTrial, {
    ...options,
    allowReportDeliveryMutation: true,
    allowLeadReportTokenHashesMutation: true,
    reportDeliveryOnlyMutation: true,
    expectedReportDeliveryStatus: delivery.status,
    expectedReportDeliveryLeaseId: delivery.lease_id,
    expectedReportDeliveryAnalysisId: delivery.analysis_id
  });
  if (!claimed.ok) return claimed;

  const baseUrl = sanitizeString(options.publicBaseUrl, 4096).replace(/\/$/, "") ||
    getPublicBaseUrl(options.request);
  const reportUrl = buildTrialUrl(baseUrl, safeSessionId, token);
  let sent;
  try {
    sent = await sendReportEmail(
      {
        email: recipient,
        brandName: sanitizeString(trial.product_name, 180) || "Your product",
        reportUrl,
        messageId: reportDeliveryMessageId(deliveryKey)
      },
      options
    );
  } catch (caught) {
    if (reportEmailErrorIsSafeToRetry(caught)) {
      const retryable = attemptCount < MAX_REPORT_DELIVERY_ATTEMPTS;
      const failedDelivery = {
        ...claimedDelivery,
        status: "failed",
        lease_id: null,
        lease_expires_at: null,
        failed_at: now,
        next_retry_at: retryable ? retryTimeForAttempt(attemptCount, nowMs) : null,
        error_code: "email_transport_not_accepted",
        retryable
      };
      const failed = await updateTrial(
        safeSessionId,
        { ...rawTrialFromRow(claimed.row), report_delivery: failedDelivery, updated_at: now },
        {
          ...options,
          allowReportDeliveryMutation: true,
          reportDeliveryOnlyMutation: true,
          expectedReportDeliveryStatus: "sending",
          expectedReportDeliveryLeaseId: leaseId,
          expectedReportDeliveryAnalysisId: identity.analysisId
        }
      );
      return {
        ok: false,
        status: failed.ok ? 502 : failed.status || 500,
        delivered: false,
        error: retryable
          ? "The email was not accepted and will be retried"
          : "The email was not accepted after the retry limit",
        delivery: buildReportDeliveryView(failed.ok ? failedDelivery : claimedDelivery)
      };
    }
    const unknownDelivery = {
      ...claimedDelivery,
      status: "unknown",
      lease_id: null,
      lease_expires_at: null,
      error_code: "email_send_result_unknown",
      retryable: false
    };
    await updateTrial(
      safeSessionId,
      { ...rawTrialFromRow(claimed.row), report_delivery: unknownDelivery, updated_at: now },
      {
        ...options,
        allowReportDeliveryMutation: true,
        reportDeliveryOnlyMutation: true,
        expectedReportDeliveryStatus: "sending",
        expectedReportDeliveryLeaseId: leaseId,
        expectedReportDeliveryAnalysisId: identity.analysisId
      }
    );
    return {
      ok: false,
      status: 502,
      delivered: false,
      error: "Email acceptance could not be confirmed; automatic retries were stopped to prevent a duplicate",
      delivery: buildReportDeliveryView(unknownDelivery)
    };
  }

  if (!sent?.ok) {
    const retryable = (sent?.retryable === true || sent?.skipped === true) &&
      attemptCount < MAX_REPORT_DELIVERY_ATTEMPTS;
    const failedDelivery = {
      ...claimedDelivery,
      status: "failed",
      lease_id: null,
      lease_expires_at: null,
      failed_at: now,
      next_retry_at: retryable ? retryTimeForAttempt(attemptCount, nowMs) : null,
      provider_message_id:
        sanitizeOptionalString(sent?.providerMessageId, 512) || null,
      app_message_id: sanitizeOptionalString(sent?.appMessageId || sent?.messageId, 512) || null,
      provider_response: sanitizeOptionalString(sent?.providerResponse, 1200) || null,
      error_code: sent?.skipped === true ? "email_not_configured" : "email_not_accepted",
      retryable
    };
    const failed = await updateTrial(
      safeSessionId,
      { ...rawTrialFromRow(claimed.row), report_delivery: failedDelivery, updated_at: now },
      {
        ...options,
        allowReportDeliveryMutation: true,
        reportDeliveryOnlyMutation: true,
        expectedReportDeliveryStatus: "sending",
        expectedReportDeliveryLeaseId: leaseId,
        expectedReportDeliveryAnalysisId: identity.analysisId
      }
    );
    return {
      ok: false,
      status: failed.ok ? 502 : failed.status || 500,
      delivered: false,
      error: sent?.error || failed.error || "The email provider did not accept the report email",
      delivery: buildReportDeliveryView(failed.ok ? failedDelivery : delivery)
    };
  }

  const acceptedDelivery = {
    ...claimedDelivery,
    status: "accepted",
    lease_id: null,
    lease_expires_at: null,
    accepted_at: now,
    failed_at: null,
    next_retry_at: null,
    provider_message_id:
      sanitizeOptionalString(sent.providerMessageId, 512) || null,
    app_message_id: sanitizeOptionalString(sent.appMessageId || sent.messageId, 512) || null,
    provider_response: sanitizeOptionalString(sent.providerResponse, 1200) || null,
    error_code: null,
    retryable: false
  };
  const accepted = await updateTrial(
    safeSessionId,
    { ...rawTrialFromRow(claimed.row), report_delivery: acceptedDelivery, updated_at: now },
    {
      ...options,
      allowReportDeliveryMutation: true,
      reportDeliveryOnlyMutation: true,
      expectedReportDeliveryStatus: "sending",
      expectedReportDeliveryLeaseId: leaseId,
      expectedReportDeliveryAnalysisId: identity.analysisId
    }
  );
  if (!accepted.ok) {
    return {
      ok: false,
      status: accepted.status || 500,
      delivered: false,
      error: "The provider accepted the email, but its delivery receipt could not be saved",
      delivery: buildReportDeliveryView(claimedDelivery)
    };
  }
  const requestSync = await syncHumanTestRequestStatus(trial, "completed", options);
  return {
    ok: true,
    status: 200,
    delivered: true,
    delivery: buildReportDeliveryView(acceptedDelivery),
    ...(requestSync.ok ? {} : { warning: requestSync.error || "The linked request status was not updated" })
  };
}

async function issueQaTrialTesterLink(sessionId, testerEmail, options = {}) {
  const loaded = await getManualQaSession(sessionId, options);
  if (!loaded.ok) return loaded;
  const trial = rawTrialFromRow(loaded.row);
  if (!trial) return { ok: false, status: 404, error: "QA trial not found" };
  const expectedEmail = sanitizeString(trial?.tester?.email, 320).toLowerCase();
  const signedInEmail = sanitizeString(testerEmail, 320).toLowerCase();
  if (!expectedEmail || expectedEmail !== signedInEmail) {
    return { ok: false, status: 403, error: "This test belongs to another tester" };
  }

  const token = createTrialToken();
  const nextTrial = {
    ...trial,
    access: {
      ...trial.access,
      tester_dashboard_token_hash: hashTrialToken(token)
    },
    updated_at: new Date().toISOString()
  };
  const updated = await updateManualQaQualificationTrial(sessionId, nextTrial, options);
  if (!updated.ok) return updated;
  const baseUrl = sanitizeString(options.publicBaseUrl, 4096).replace(/\/$/, "");
  return {
    ok: true,
    status: 200,
    session_id: sessionId,
    tester_url: buildTrialUrl(baseUrl, sessionId, token)
  };
}

async function acceptQaTrial(sessionId, token, options = {}) {
  const verified = await verifyQaTrialAccess(sessionId, token, options);
  if (!verified.ok) return verified;
  const now = new Date().toISOString();
  const trialStatus = sanitizeString(verified.trial.status, 40).toLowerCase();
  const initialTesterAcceptance = Boolean(
    verified.role === "tester" &&
      !verified.trial.tester?.accepted_at &&
      !verified.trial.started_at &&
      !verified.trial.submitted_at &&
      !["in_progress", "submitted", "verified", "completed"].includes(trialStatus)
  );
  const roleAcceptance = {
    ...verified.trial[verified.role],
    accepted_at: verified.trial[verified.role]?.accepted_at || now,
    ...(initialTesterAcceptance
      ? {
          recording_analysis_consent_version: MANUAL_QA_RECORDING_ANALYSIS_CONSENT_VERSION,
          recording_analysis_consent_at:
            verified.trial.tester?.recording_analysis_consent_at || now
        }
      : {})
  };
  const trial = {
    ...verified.trial,
    [verified.role]: roleAcceptance,
    updated_at: now
  };
  trial.status = deriveTrialStatus(trial);
  const updated = await updateManualQaQualificationTrial(sessionId, trial, {
    ...options,
    widgetAccessOk: true
  });
  if (!updated.ok) return updated;
  return {
    ok: true,
    status: 200,
    role: verified.role,
    view: buildPublicTrialView(updated.session, rawTrialFromRow(updated.row), verified.role, options)
  };
}

async function queueQaTrialRecordingAnalysis(sessionId, token, options = {}) {
  const verified = await verifyQaTrialAccess(sessionId, token, options);
  if (!verified.ok) return verified;
  if (verified.role !== "tester") {
    return { ok: false, status: 403, error: "Only the tester can update this recording" };
  }
  if (!verified.trial.submitted_at) {
    return { ok: false, status: 409, error: "The recording has not been submitted yet" };
  }
  let queued = null;
  try {
    const queueFindingsAnalysis =
      typeof options.queueManualQaFindingsAnalysis === "function"
        ? options.queueManualQaFindingsAnalysis
        : queueManualQaFindingsAnalysis;
    queued = await queueFindingsAnalysis(sessionId, {
      ...options,
      widgetAccessOk: true
    });
  } catch {
    queued = null;
  }
  return {
    ok: true,
    status: queued?.ok ? 200 : 202,
    queue_pending: !queued?.ok,
    role: verified.role,
    view: buildPublicTrialView(
      queued?.ok ? queued.session : verified.session,
      rawTrialFromRow(queued?.ok ? queued.row : verified.row),
      verified.role,
      options
    )
  };
}

async function startQaTrial(sessionId, token, options = {}) {
  const verified = await verifyQaTrialAccess(sessionId, token, options);
  if (!verified.ok) return verified;
  if (verified.role !== "tester") return { ok: false, status: 403, error: "Only the tester can start this trial" };
  if (!verified.trial.lead?.accepted_at || !verified.trial.tester?.accepted_at) {
    return { ok: false, status: 409, error: "Both people must accept before testing starts" };
  }
  const trial = {
    ...verified.trial,
    status: verified.trial.submitted_at ? deriveTrialStatus(verified.trial) : "in_progress",
    started_at: verified.trial.started_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  const updated = await updateManualQaQualificationTrial(sessionId, trial, {
    ...options,
    widgetAccessOk: true
  });
  if (!updated.ok) return updated;
  await syncHumanTestRequestStatus(trial, "in_progress", options);
  return { ok: true, status: 200, view: buildPublicTrialView(updated.session, rawTrialFromRow(updated.row), "tester", options) };
}

async function submitQaTrial(sessionId, token, input = {}, options = {}) {
  const verified = await verifyQaTrialAccess(sessionId, token, options);
  if (!verified.ok) return verified;
  if (verified.role !== "tester") return { ok: false, status: 403, error: "Only the tester can submit this trial" };
  if (!verified.trial.lead?.accepted_at || !verified.trial.tester?.accepted_at) {
    return { ok: false, status: 409, error: "Both people must accept before the trial can be submitted" };
  }
  if (verified.trial.submitted_at) {
    const payoutStatus = sanitizeString(verified.trial.assignment?.payout_status, 40);
    const finalized =
      verified.trial.qualification?.status === "verified" ||
      ["verified", "completed"].includes(sanitizeString(verified.trial.status, 40)) ||
      ["approved", "paid"].includes(payoutStatus);
    if (finalized) {
      return { ok: false, status: 409, error: "This trial has already been reviewed and cannot be resubmitted" };
    }
    return {
      ok: true,
      status: 200,
      idempotent: true,
      view: buildPublicTrialView(verified.session, verified.trial, "tester", options)
    };
  }
  const item = verified.session.checklist?.[0];
  if (!item) return { ok: false, status: 404, error: "Trial review item not found" };
  if (!trustedFinalTrialRecordings(verified.session).length) {
    return {
      ok: false,
      status: 409,
      error: "Save at least one complete screen recording before submitting this trial"
    };
  }
  const updatedItem = await updateManualQaWidgetItem(
    sessionId,
    token,
    item.id,
    {
      status: "reviewed",
      note: sanitizeOptionalString(input.note, 4000) || item.note || null,
      widget_context: isPlainObject(input.widget_context || input.widgetContext)
        ? input.widget_context || input.widgetContext
        : item.widget_context
    },
    options
  );
  if (!updatedItem.ok) return updatedItem;

  const now = new Date().toISOString();
  const nextTrial = {
    ...verified.trial,
    status: "submitted",
    submitted_at: now,
    updated_at: now,
    qualification: {
      ...verified.trial.qualification,
      status: "pending_review"
    },
    report_delivery:
      normalizeReportDelivery(verified.trial.report_delivery).status === "disabled"
        ? {
            ...normalizeReportDelivery(verified.trial.report_delivery),
            status: "pending",
            enabled_at: now,
            recipient: sanitizeString(verified.trial.lead?.email, 320).toLowerCase() || null,
            retryable: true
          }
        : verified.trial.report_delivery
  };
  const updated = await updateManualQaQualificationTrial(sessionId, nextTrial, {
    ...options,
    widgetAccessOk: true,
    allowReportDeliveryMutation: true,
    expectedReportDeliveryStatus: normalizeReportDelivery(verified.trial.report_delivery).status,
    expectedReportDeliveryLeaseId: normalizeReportDelivery(verified.trial.report_delivery).lease_id,
    expectedReportDeliveryAnalysisId: normalizeReportDelivery(verified.trial.report_delivery).analysis_id
  });
  if (!updated.ok) return updated;
  let queuedAnalysis = null;
  try {
    const queueFindingsAnalysis =
      typeof options.queueManualQaFindingsAnalysis === "function"
        ? options.queueManualQaFindingsAnalysis
        : queueManualQaFindingsAnalysis;
    queuedAnalysis = await queueFindingsAnalysis(sessionId, {
      ...options,
      widgetAccessOk: true
    });
  } catch {
    queuedAnalysis = null;
  }
  await syncHumanTestRequestStatus(nextTrial, "submitted", options);
  const finalSession = queuedAnalysis?.ok ? queuedAnalysis.session : updated.session;
  const finalRow = queuedAnalysis?.ok ? queuedAnalysis.row : updated.row;
  return {
    ok: true,
    status: 200,
    view: buildPublicTrialView(finalSession, rawTrialFromRow(finalRow), "tester", options)
  };
}

function calculateEvidenceScore(session) {
  const item = session?.checklist?.[0] || {};
  const media = Array.isArray(item.evidence_media) ? item.evidence_media : [];
  const widgetContext = isPlainObject(item.widget_context) ? item.widget_context : {};
  const transcriptEvents = Array.isArray(widgetContext.transcript_events) ? widgetContext.transcript_events : [];
  const evidenceEvents = Array.isArray(widgetContext.evidence_events) ? widgetContext.evidence_events : [];
  let score = media.some((entry) => entry.kind === "video") ? 10 : 0;
  if (sanitizeString(item.note, 4000).length >= 20 || transcriptEvents.length) score += 5;
  if (
    sanitizeString(widgetContext.page_url, 4096) ||
    evidenceEvents.length ||
    (Array.isArray(widgetContext.page_errors) && widgetContext.page_errors.length) ||
    (Array.isArray(widgetContext.console_events) && widgetContext.console_events.length) ||
    (Array.isArray(widgetContext.network_events) && widgetContext.network_events.length)
  ) {
    score += 5;
  }
  return Math.min(20, score);
}

async function scoreQaTrial(sessionId, input = {}, options = {}) {
  const loaded = await getManualQaSession(sessionId, options);
  if (!loaded.ok) return loaded;
  const trial = rawTrialFromRow(loaded.row);
  if (!trial) return { ok: false, status: 404, error: "QA trial not found" };
  if (!trial.submitted_at) return { ok: false, status: 409, error: "The tester has not submitted this trial yet" };
  const issues = normalizeBenchmarkIssues(trial.benchmark?.issues);
  if (!issues.length) return { ok: false, status: 409, error: "This trial has no private benchmark issues" };
  const knownIds = new Set(issues.map((issue) => issue.id));
  const caughtIds = Array.from(
    new Set(
      (Array.isArray(input.caught_issue_ids || input.caughtIssueIds)
        ? input.caught_issue_ids || input.caughtIssueIds
        : [])
        .map((entry) => sanitizeString(entry, 80))
        .filter((entry) => knownIds.has(entry))
    )
  );
  const clarity = sanitizeString(input.clarity, 40).toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(CLARITY_SCORES, clarity)) {
    return { ok: false, status: 400, error: "clarity must be needs_work, good, or excellent" };
  }
  const coverageScore = Math.round((caughtIds.length / issues.length) * 70);
  const evidenceScore = calculateEvidenceScore(loaded.session);
  const clarityScore = CLARITY_SCORES[clarity];
  const now = new Date().toISOString();
  const assignmentType = assignmentTypeOf(trial);
  if (assignmentType === "paid" && loaded.session.findings_analysis?.status !== "complete") {
    return {
      ok: false,
      status: 409,
      error: "Recording analysis must finish before a paid assignment can be approved"
    };
  }
  const nextTrial = {
    ...trial,
    status: assignmentType === "paid" || trial.lead_rating?.score ? "completed" : "verified",
    updated_at: now,
    assignment: {
      ...trial.assignment,
      type: assignmentType,
      payout_status: assignmentType === "paid" ? "approved" : "not_applicable",
      payout_approved_at: assignmentType === "paid" ? now : null
    },
    qualification: {
      ...trial.qualification,
      label: assignmentType === "paid" ? "BUD reviewed assignment" : "BUD Verified Trial",
      status: "verified",
      score: coverageScore + evidenceScore + clarityScore,
      caught_issue_ids: caughtIds,
      coverage_score: coverageScore,
      evidence_score: evidenceScore,
      clarity_score: clarityScore,
      reviewer_note: sanitizeOptionalString(input.reviewer_note || input.reviewerNote, 2400) || null,
      scored_at: now
    }
  };
  const updated = await updateManualQaQualificationTrial(sessionId, nextTrial, options);
  if (!updated.ok) return updated;
  await syncHumanTestRequestStatus(
    nextTrial,
    "completed",
    options,
    assignmentType === "paid"
      ? { payout_status: "approved", payout_approved_at: now }
      : {}
  );
  return { ok: true, status: 200, trial: buildAdminTrialView(updated.session, rawTrialFromRow(updated.row), options) };
}

async function rateQaTrial(sessionId, token, input = {}, options = {}) {
  const verified = await verifyQaTrialAccess(sessionId, token, options);
  if (!verified.ok) return verified;
  if (verified.role !== "lead") return { ok: false, status: 403, error: "Only the product owner can rate this trial" };
  if (!verified.trial.submitted_at) return { ok: false, status: 409, error: "The tester has not submitted a report yet" };
  if (currentReportAnalysis(verified.session).status !== "complete") {
    return { ok: false, status: 409, error: "The report must finish before it can be rated" };
  }
  const score = Number(input.score);
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    return { ok: false, status: 400, error: "score must be between 1 and 5" };
  }
  const now = new Date().toISOString();
  const nextTrial = {
    ...verified.trial,
    status: verified.trial.qualification?.status === "verified" ? "completed" : deriveTrialStatus(verified.trial),
    updated_at: now,
    lead_rating: {
      score,
      note: sanitizeOptionalString(input.note, 2400) || null,
      rated_at: now
    }
  };
  const updated = await updateManualQaQualificationTrial(sessionId, nextTrial, {
    ...options,
    widgetAccessOk: true
  });
  if (!updated.ok) return updated;
  return { ok: true, status: 200, view: buildPublicTrialView(updated.session, rawTrialFromRow(updated.row), "lead", options) };
}

async function markQaTrialPaid(sessionId, options = {}) {
  const loaded = await getManualQaSession(sessionId, options);
  if (!loaded.ok) return loaded;
  const trial = rawTrialFromRow(loaded.row);
  if (!trial) return { ok: false, status: 404, error: "QA trial not found" };
  if (assignmentTypeOf(trial) !== "paid" || trial.qualification?.status !== "verified") {
    return { ok: false, status: 409, error: "The paid assignment must be reviewed before payment is recorded" };
  }
  if (loaded.session.findings_analysis?.status !== "complete") {
    return {
      ok: false,
      status: 409,
      error: "Recording analysis must finish before payment is recorded"
    };
  }
  const nextTrial = {
    ...trial,
    assignment: {
      ...trial.assignment,
      payout_status: "paid",
      payout_paid_at: new Date().toISOString()
    },
    updated_at: new Date().toISOString()
  };
  const updated = await updateManualQaQualificationTrial(sessionId, nextTrial, options);
  if (!updated.ok) return updated;
  return { ok: true, status: 200, trial: buildAdminTrialView(updated.session, rawTrialFromRow(updated.row), options) };
}

async function getQaTrialForAdmin(sessionId, options = {}) {
  const loaded = await getManualQaSession(sessionId, options);
  if (!loaded.ok) return loaded;
  const trial = rawTrialFromRow(loaded.row);
  if (!trial) return { ok: false, status: 404, error: "QA trial not found" };
  return { ok: true, status: 200, trial: buildAdminTrialView(loaded.session, trial, options) };
}

async function listQaTrials(options = {}) {
  const listed = await listManualQaSessions(options);
  if (!listed.ok) return listed;
  return {
    ok: true,
    status: 200,
    items: listed.items
      .filter((session) => ["tester_qualification", "paid_assignment"].includes(session.qualification_trial?.kind))
      .map((session) => ({
        session_id: session.session_id,
        product_name: session.qualification_trial.product_name,
        status: deriveTrialStatus(session.qualification_trial),
        tester_name: session.qualification_trial.tester?.name || null,
        lead_name: session.qualification_trial.lead?.name || null,
        score: session.qualification_trial.qualification?.score ?? null,
        customer_rating: session.qualification_trial.lead_rating?.score ?? null,
        assignment_type: assignmentTypeOf(session.qualification_trial),
        tester_pay_cents: Math.max(
          0,
          Math.round(Number(session.qualification_trial.assignment?.tester_pay_cents) || 0)
        ),
        tester_pay_currency:
          sanitizeString(session.qualification_trial.assignment?.tester_pay_currency, 3).toUpperCase() || "USD",
        payout_status: sanitizeString(session.qualification_trial.assignment?.payout_status, 40) || "not_applicable",
        created_at: session.created_at
      }))
  };
}

module.exports = {
  MAX_QA_TRIAL_DURATION_MINUTES,
  acceptQaTrial,
  buildAdminTrialView,
  buildBuyerReportProjection,
  buildPublicTrialView,
  calculateEvidenceScore,
  createQaTrial,
  deliverQaTrialReport,
  getQaTrialForAdmin,
  issueQaTrialTesterLink,
  listQaTrials,
  markQaTrialPaid,
  queueQaTrialRecordingAnalysis,
  rateQaTrial,
  reportDeliveryNeedsAction,
  scoreQaTrial,
  startQaTrial,
  submitQaTrial,
  verifyQaTrialAccess,
  __private: {
    compareTrialToken,
    createTrialToken,
    deriveTrialStatus,
    buildReportDeliveryView,
    currentReportAnalysis,
    deliveryMatchesAnalysis,
    hashTrialToken,
    assignmentTypeOf,
    normalizeBenchmarkIssues,
    normalizeReportDelivery,
    reportDeliveryKey,
    reportDeliveryMessageId,
    reportEmailErrorIsSafeToRetry,
    trustedFinalTrialRecordings,
    rawTrialFromRow
  }
};
