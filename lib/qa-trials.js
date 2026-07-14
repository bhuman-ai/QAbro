const crypto = require("crypto");

const { isValidEmail } = require("./auth");
const {
  createManualQaSession,
  getManualQaSession,
  listManualQaSessions,
  updateManualQaQualificationTrial,
  updateManualQaWidgetItem
} = require("./manual-qa");
const {
  isPlainObject,
  normalizeUrl,
  sanitizeOptionalString,
  sanitizeString
} = require("./qa-core");
const { sendQaTrialInviteEmail } = require("./qa-alert-email");

const TRIAL_TOKEN_PREFIX = "bud_trial_";
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

function deriveTrialStatus(trial) {
  if (trial?.qualification?.status === "verified") {
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

function buildPublicTrialView(session, trial, role) {
  const item = Array.isArray(session?.checklist) ? session.checklist[0] || null : null;
  const qualification = isPlainObject(trial?.qualification) ? trial.qualification : {};
  const leadRating = isPlainObject(trial?.lead_rating) ? trial.lead_rating : {};
  const qualificationScore = qualification.score === null || qualification.score === undefined || qualification.score === ""
    ? null
    : Number(qualification.score);
  const customerScore = leadRating.score === null || leadRating.score === undefined || leadRating.score === ""
    ? null
    : Number(leadRating.score);
  return {
    session_id: session.session_id,
    role,
    status: deriveTrialStatus(trial),
    product_name: sanitizeString(trial?.product_name, 180) || session.brand_name || session.brand_key || "Product",
    target_url: session.target_url,
    test_focus: sanitizeString(trial?.test_focus, 2400),
    duration_minutes: Math.max(10, Math.min(60, Number(trial?.duration_minutes) || 30)),
    consent: {
      accepted: Boolean(trial?.[role]?.accepted_at),
      lead_accepted: Boolean(trial?.lead?.accepted_at),
      tester_accepted: Boolean(trial?.tester?.accepted_at)
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
            kind: sanitizeOptionalString(entry.kind, 32) || null,
            label: sanitizeOptionalString(entry.label, 240) || null,
            content_type: sanitizeOptionalString(entry.content_type, 128) || null,
            byte_length: Math.max(0, Number(entry.byte_length) || 0),
            url: sanitizeOptionalString(entry.url, 4096) || null,
            created_at: sanitizeOptionalString(entry.created_at, 128) || null
          }))
        : []
    },
    qualification: {
      label: "BUD Verified Trial",
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

function buildAdminTrialView(session, trial) {
  const publicView = buildPublicTrialView(session, trial, "admin");
  const optionalScore = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };
  return {
    ...publicView,
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

  if (!targetUrl) return { ok: false, status: 400, error: "target_url must be a valid http or https URL" };
  if (!isValidEmail(leadEmail)) return { ok: false, status: 400, error: "lead_email must be a valid email" };
  if (!isValidEmail(testerEmail)) return { ok: false, status: 400, error: "tester_email must be a valid email" };
  if (!productName) return { ok: false, status: 400, error: "product_name is required" };
  if (!testFocus) return { ok: false, status: 400, error: "test_focus is required" };
  if (!benchmarkIssues.length) {
    return { ok: false, status: 400, error: "Add at least one private benchmark issue before assigning a qualification trial" };
  }

  const now = new Date().toISOString();
  const leadToken = createTrialToken();
  const testerToken = createTrialToken();
  const trial = {
    version: 1,
    kind: "tester_qualification",
    status: "awaiting_consent",
    product_name: productName,
    test_focus: testFocus,
    duration_minutes: Math.max(10, Math.min(60, Number(input.duration_minutes || input.durationMinutes) || 30)),
    created_at: now,
    updated_at: now,
    submitted_at: null,
    lead: {
      name: sanitizeOptionalString(input.lead_name || input.leadName, 180) || null,
      email: leadEmail,
      accepted_at: null
    },
    tester: {
      name: sanitizeOptionalString(input.tester_name || input.testerName, 180) || null,
      email: testerEmail,
      accepted_at: null
    },
    access: {
      lead_token_hash: hashTrialToken(leadToken),
      tester_token_hash: hashTrialToken(testerToken)
    },
    benchmark: {
      issues: benchmarkIssues,
      issue_count: benchmarkIssues.length
    },
    qualification: {
      label: "BUD Verified Trial",
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
      title: `${productName} free QA trial`,
      review_mode: "freestyle",
      feedback_action: "share_feedback",
      work_summary: testFocus,
      freestyle_title: `${productName} qualification review`,
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
      trialUrl: leadUrl
    }),
    sendInvite({
      email: testerEmail,
      role: "tester",
      productName,
      testFocus,
      durationMinutes: trial.duration_minutes,
      trialUrl: testerUrl
    })
  ]);
  return {
    ok: true,
    status: 201,
    session_id: created.session.session_id,
    trial: buildAdminTrialView(created.session, trial),
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
  const role = compareTrialToken(token, access.lead_token_hash)
    ? "lead"
    : compareTrialToken(token, access.tester_token_hash)
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
    view: buildPublicTrialView(loaded.session, trial, role)
  };
}

async function acceptQaTrial(sessionId, token, options = {}) {
  const verified = await verifyQaTrialAccess(sessionId, token, options);
  if (!verified.ok) return verified;
  const now = new Date().toISOString();
  const trial = {
    ...verified.trial,
    [verified.role]: {
      ...verified.trial[verified.role],
      accepted_at: verified.trial[verified.role]?.accepted_at || now
    },
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
    view: buildPublicTrialView(updated.session, rawTrialFromRow(updated.row), verified.role)
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
  return { ok: true, status: 200, view: buildPublicTrialView(updated.session, rawTrialFromRow(updated.row), "tester") };
}

async function submitQaTrial(sessionId, token, input = {}, options = {}) {
  const verified = await verifyQaTrialAccess(sessionId, token, options);
  if (!verified.ok) return verified;
  if (verified.role !== "tester") return { ok: false, status: 403, error: "Only the tester can submit this trial" };
  if (!verified.trial.lead?.accepted_at || !verified.trial.tester?.accepted_at) {
    return { ok: false, status: 409, error: "Both people must accept before the trial can be submitted" };
  }
  const item = verified.session.checklist?.[0];
  if (!item) return { ok: false, status: 404, error: "Trial review item not found" };
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
    }
  };
  const updated = await updateManualQaQualificationTrial(sessionId, nextTrial, {
    ...options,
    widgetAccessOk: true
  });
  if (!updated.ok) return updated;
  return { ok: true, status: 200, view: buildPublicTrialView(updated.session, rawTrialFromRow(updated.row), "tester") };
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
  const nextTrial = {
    ...trial,
    status: trial.lead_rating?.score ? "completed" : "verified",
    updated_at: now,
    qualification: {
      ...trial.qualification,
      label: "BUD Verified Trial",
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
  return { ok: true, status: 200, trial: buildAdminTrialView(updated.session, rawTrialFromRow(updated.row)) };
}

async function rateQaTrial(sessionId, token, input = {}, options = {}) {
  const verified = await verifyQaTrialAccess(sessionId, token, options);
  if (!verified.ok) return verified;
  if (verified.role !== "lead") return { ok: false, status: 403, error: "Only the product owner can rate this trial" };
  if (!verified.trial.submitted_at) return { ok: false, status: 409, error: "The tester has not submitted a report yet" };
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
  return { ok: true, status: 200, view: buildPublicTrialView(updated.session, rawTrialFromRow(updated.row), "lead") };
}

async function getQaTrialForAdmin(sessionId, options = {}) {
  const loaded = await getManualQaSession(sessionId, options);
  if (!loaded.ok) return loaded;
  const trial = rawTrialFromRow(loaded.row);
  if (!trial) return { ok: false, status: 404, error: "QA trial not found" };
  return { ok: true, status: 200, trial: buildAdminTrialView(loaded.session, trial) };
}

async function listQaTrials(options = {}) {
  const listed = await listManualQaSessions(options);
  if (!listed.ok) return listed;
  return {
    ok: true,
    status: 200,
    items: listed.items
      .filter((session) => session.qualification_trial?.kind === "tester_qualification")
      .map((session) => ({
        session_id: session.session_id,
        product_name: session.qualification_trial.product_name,
        status: deriveTrialStatus(session.qualification_trial),
        tester_name: session.qualification_trial.tester?.name || null,
        lead_name: session.qualification_trial.lead?.name || null,
        score: session.qualification_trial.qualification?.score ?? null,
        customer_rating: session.qualification_trial.lead_rating?.score ?? null,
        created_at: session.created_at
      }))
  };
}

module.exports = {
  acceptQaTrial,
  buildAdminTrialView,
  buildPublicTrialView,
  calculateEvidenceScore,
  createQaTrial,
  getQaTrialForAdmin,
  listQaTrials,
  rateQaTrial,
  scoreQaTrial,
  startQaTrial,
  submitQaTrial,
  verifyQaTrialAccess,
  __private: {
    compareTrialToken,
    createTrialToken,
    deriveTrialStatus,
    hashTrialToken,
    normalizeBenchmarkIssues,
    rawTrialFromRow
  }
};
