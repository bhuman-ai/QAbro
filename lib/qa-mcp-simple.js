const crypto = require("crypto");

const SIMPLE_QA_FLOWS = Object.freeze({
  AI: "ai",
  SELF: "self",
  HUMAN: "human"
});

const AFTER_FEEDBACK_VALUES = new Set(["report", "preview", "fix_and_retest"]);
const ACCESS_VALUES = new Set(["public_only", "signup_allowed", "test_account"]);
const SELF_REVIEW_STYLES = new Set(["guided", "freestyle"]);
const RESUME_PREFIX = "bud1.";

function safeString(value, maxLength = 4000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function normalizeAfterFeedback(value) {
  const normalized = safeString(value, 40).toLowerCase();
  return AFTER_FEEDBACK_VALUES.has(normalized) ? normalized : "report";
}

function feedbackActionForAfterFeedback(value) {
  const normalized = normalizeAfterFeedback(value);
  if (normalized === "preview") return "preview_fix_first";
  if (normalized === "fix_and_retest") return "share_feedback_and_start_work";
  return "share_feedback";
}

function normalizeAccess(value) {
  const normalized = safeString(value, 40).toLowerCase();
  return ACCESS_VALUES.has(normalized) ? normalized : "public_only";
}

function normalizeSelfReviewStyle(value) {
  const normalized = safeString(value, 40).toLowerCase();
  return SELF_REVIEW_STYLES.has(normalized) ? normalized : "guided";
}

function sanitizeResumeInput(input = {}) {
  const output = {};
  const stringFields = [
    ["target_url", 4096],
    ["goal", 2400],
    ["expected_result", 1600],
    ["product_name", 180],
    ["payment_method", 40],
    ["access", 40],
    ["style", 40],
    ["depth", 40],
    ["after_feedback", 40],
    ["idempotency_key", 180]
  ];
  for (const [field, maxLength] of stringFields) {
    const value = safeString(input[field], maxLength);
    if (value) output[field] = value;
  }
  if (Number.isFinite(Number(input.budget_usd))) {
    output.budget_usd = Number(input.budget_usd);
  }
  if (Number.isFinite(Number(input.duration_minutes))) {
    output.duration_minutes = Number(input.duration_minutes);
  }
  if (typeof input.purchase_allowed === "boolean") {
    output.purchase_allowed = input.purchase_allowed;
  }
  return output;
}

function buildResumeToken({ flow, id = "", input = {} } = {}) {
  const safeFlow = safeString(flow, 20).toLowerCase();
  if (!Object.values(SIMPLE_QA_FLOWS).includes(safeFlow)) {
    throw new Error("Unknown BeforeUsersDo QA flow");
  }
  const payload = {
    v: 1,
    flow: safeFlow,
    id: safeString(id, 128) || null,
    input: sanitizeResumeInput(input)
  };
  return `${RESUME_PREFIX}${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}`;
}

function parseResumeToken(token) {
  const raw = safeString(token, 16000);
  if (!raw.startsWith(RESUME_PREFIX)) {
    return { ok: false, error: "Invalid BeforeUsersDo resume token" };
  }
  try {
    const payload = JSON.parse(Buffer.from(raw.slice(RESUME_PREFIX.length), "base64url").toString("utf8"));
    if (
      payload?.v !== 1 ||
      !Object.values(SIMPLE_QA_FLOWS).includes(payload?.flow) ||
      (payload.id !== null && typeof payload.id !== "string")
    ) {
      return { ok: false, error: "Invalid BeforeUsersDo resume token" };
    }
    return {
      ok: true,
      flow: payload.flow,
      id: safeString(payload.id, 128) || null,
      input: sanitizeResumeInput(payload.input)
    };
  } catch {
    return { ok: false, error: "Invalid BeforeUsersDo resume token" };
  }
}

function buildIdempotencyId(prefix, input = {}, explicitKey = "") {
  const safePrefix = safeString(prefix, 32).toLowerCase().replace(/[^a-z0-9_-]+/g, "_") || "qa";
  const explicit = safeString(explicitKey, 180);
  const timeBucket = Math.floor(Date.now() / (10 * 60 * 1000));
  const fingerprint = explicit || JSON.stringify({
    target_url: safeString(input.target_url, 4096),
    goal: safeString(input.goal, 2400),
    expected_result: safeString(input.expected_result, 1600),
    payment_method: safeString(input.payment_method, 40),
    budget_usd: Number(input.budget_usd) || 0,
    time_bucket: timeBucket
  });
  const digest = crypto.createHash("sha256").update(fingerprint).digest("hex").slice(0, 24);
  return `${safePrefix}_${digest}`.slice(0, 128);
}

function mergeResumeInput(saved = {}, answer = {}) {
  const merged = { ...sanitizeResumeInput(saved) };
  for (const [key, value] of Object.entries(sanitizeResumeInput(answer))) {
    merged[key] = value;
  }
  if (answer.credentials && typeof answer.credentials === "object") {
    merged.credentials = answer.credentials;
  }
  return merged;
}

function buildAiRunInput(input = {}) {
  const access = normalizeAccess(input.access);
  const goal = safeString(input.goal, 2400);
  const expectedResult = safeString(input.expected_result, 1600);
  return {
    target_url: safeString(input.target_url, 4096),
    task_to_try: goal || undefined,
    expected_success: expectedResult || undefined,
    scope_mode: safeString(input.depth, 40) === "deep" ? "deep_45m" : goal ? "feature_targeted" : "core_20m",
    auth_strategy:
      access === "test_account"
        ? "provided_credentials"
        : access === "signup_allowed"
          ? "signup_if_needed"
          : "public_only",
    new_account_required: access === "signup_allowed",
    credentials: access === "test_account" ? input.credentials : undefined,
    feedback_action: feedbackActionForAfterFeedback(input.after_feedback),
    share_after: input.share_report !== false,
    run_id: buildIdempotencyId("mcp_simple_ai", input, input.idempotency_key)
  };
}

function buildSelfReviewInput(input = {}) {
  const goal = safeString(input.goal, 2400);
  return {
    session_id: buildIdempotencyId("manual_simple_self", input, input.idempotency_key),
    target_url: safeString(input.target_url, 4096),
    title: goal ? `Self-review: ${goal.slice(0, 140)}` : "BeforeUsersDo self-review",
    review_mode: normalizeSelfReviewStyle(input.style) === "freestyle" ? "freestyle" : "checklist",
    work_summary: goal || undefined,
    scenario_list: goal ? [goal] : undefined,
    feedback_action: feedbackActionForAfterFeedback(input.after_feedback)
  };
}

function buildHumanTestInput(input = {}) {
  const goal = safeString(input.goal, 2400);
  const access = normalizeAccess(input.access);
  return {
    target_url: safeString(input.target_url, 4096),
    product_name: safeString(input.product_name, 180) || undefined,
    payment_method: safeString(input.payment_method, 40).toLowerCase() || undefined,
    budget_usd: Number.isFinite(Number(input.budget_usd)) ? Number(input.budget_usd) : undefined,
    review_type: goal ? "specific_flow" : "general_first_time_user",
    test_focus: goal || undefined,
    expected_success: safeString(input.expected_result, 1600) || undefined,
    duration_minutes: Number.isFinite(Number(input.duration_minutes)) ? Number(input.duration_minutes) : undefined,
    access_mode: access,
    account_creation_allowed: access === "signup_allowed",
    purchase_allowed: input.purchase_allowed === true,
    irreversible_actions_allowed: false,
    credentials: access === "test_account" ? input.credentials : undefined,
    request_key: buildIdempotencyId("mcp_simple_human", input, input.idempotency_key)
  };
}

function choicesForMissingField(field) {
  if (field === "payment_method") {
    return [
      { value: "cash", label: "Paid in dollars", requires: ["budget_usd"] },
      { value: "qa_credit", label: "Paid with QA credit", requires: ["budget_usd"] },
      {
        value: "qualification_trial",
        label: "Explicit free qualification trial",
        warning: "Use only when the user explicitly asks for the tester-and-buyer trial."
      }
    ];
  }
  if (field === "access") {
    return [
      { value: "public_only", label: "Public pages only" },
      { value: "signup_allowed", label: "Tester may create an account" },
      { value: "test_account", label: "Use a supplied test account", requires: ["credentials"] }
    ];
  }
  return [];
}

function buildNeedsInputState({ flow, input = {}, missingFields = [], question = "" } = {}) {
  const firstMissing = missingFields[0] || "input";
  const resumeToken = buildResumeToken({ flow, input });
  return {
    ok: false,
    state: "needs_input",
    flow,
    needs_input: true,
    missing_fields: missingFields,
    question: safeString(question, 1200) || "BeforeUsersDo needs one more detail.",
    choices: choicesForMissingField(firstMissing),
    resume_token: resumeToken,
    next_tool: {
      name: "qa_continue",
      arguments: { resume_token: resumeToken }
    }
  };
}

function countVideoEvidence(report = {}) {
  const checklist = Array.isArray(report?.session?.checklist) ? report.session.checklist : [];
  return checklist.reduce((count, item) => {
    const media = Array.isArray(item?.evidence_media) ? item.evidence_media : [];
    return (
      count +
      media.filter(
        (entry) =>
          safeString(entry?.kind, 40).toLowerCase() === "video" ||
          safeString(entry?.content_type, 120).toLowerCase().startsWith("video/")
      ).length
    );
  }, 0);
}

function getHumanReportReadiness(report = {}) {
  const videoCount = countVideoEvidence(report);
  const analysisStatus = safeString(report?.session?.findings_analysis?.status, 40).toLowerCase() || "pending";
  const hasMarkdown = Boolean(safeString(report?.markdown, 100));
  if (!videoCount) {
    return {
      ready: false,
      state: "needs_review",
      reason: "The tester submitted, but the report has no video evidence.",
      video_count: 0,
      analysis_status: analysisStatus
    };
  }
  if (["failed", "failed_validation", "cancelled"].includes(analysisStatus)) {
    return {
      ready: false,
      state: "needs_review",
      reason: "The video exists, but video-and-transcript analysis failed and needs review or retry.",
      video_count: videoCount,
      analysis_status: analysisStatus
    };
  }
  if (analysisStatus !== "complete") {
    return {
      ready: false,
      state: "processing_report",
      reason: "The recording exists, but video-and-transcript analysis is not finished.",
      video_count: videoCount,
      analysis_status: analysisStatus
    };
  }
  if (!hasMarkdown) {
    return {
      ready: false,
      state: "processing_report",
      reason: "The evidence is ready, but the final report is still being generated.",
      video_count: videoCount,
      analysis_status: analysisStatus
    };
  }
  return {
    ready: true,
    state: "complete",
    reason: "The human QA report, video, and transcript-derived analysis are ready.",
    video_count: videoCount,
    analysis_status: analysisStatus
  };
}

module.exports = {
  SIMPLE_QA_FLOWS,
  buildAiRunInput,
  buildHumanTestInput,
  buildIdempotencyId,
  buildNeedsInputState,
  buildResumeToken,
  buildSelfReviewInput,
  countVideoEvidence,
  feedbackActionForAfterFeedback,
  getHumanReportReadiness,
  mergeResumeInput,
  normalizeAccess,
  normalizeAfterFeedback,
  normalizeSelfReviewStyle,
  parseResumeToken,
  sanitizeResumeInput
};
