const crypto = require("crypto");

const {
  extractTargetLabel,
  isPlainObject,
  loadStoredReportByRunId,
  normalizeUrl,
  sanitizeOptionalString,
  sanitizeString
} = require("./qa-core");
const { buildLiveStreamArtifacts } = require("./qa-live-stream");
const {
  extractBrandKey,
  extractOwnerEmail,
  extractOwnerUserId,
  resolveQaReportReadAccess
} = require("./qa-queue");

const MANUAL_QA_SOURCE = "manual_qa";
const MANUAL_QA_SCHEMA_VERSION = "manual_qa.v1";
const MAX_CHECKLIST_ITEMS = 24;
const MAX_WIDGET_EVENTS = 40;
const MAX_WIDGET_MEDIA_ITEMS = 24;
const MAX_AGENT_FEEDBACK_PACKAGES = 20;
const MAX_AGENT_FEEDBACK_MARKDOWN = 200000;
const MAX_PREVIEW_PROPOSAL_ITEMS = 12;
const MAX_POST_FIX_REVIEWS = 20;
const MAX_POST_FIX_REVIEW_ITEMS = 24;
const MAX_WORK_PACKETS = 16;
const MAX_WORK_PACKET_EVIDENCE = 8;
const MAX_TOPIC_SEGMENTS = 24;
const MAX_TOPIC_SEGMENT_TRANSCRIPTS = 12;
const TOPIC_SEGMENT_EVIDENCE_WINDOW_MS = 30000;
const WIDGET_TOKEN_PREFIX = "bud_widget_";
const SENSITIVE_URL_PARAMS = new Set([
  "access_token",
  "api_key",
  "auth",
  "code",
  "id_token",
  "key",
  "password",
  "refresh_token",
  "secret",
  "session",
  "signature",
  "token"
]);
const ITEM_STATUSES = new Set(["pending", "reviewed", "pass", "fail", "confusing", "blocked", "skip"]);
const WIDGET_MEDIA_KINDS = new Set(["screenshot", "video", "audio"]);
const AGENT_FEEDBACK_SCOPES = new Set(["all", "item"]);
const MANUAL_REVIEW_MODES = new Set(["checklist", "freestyle"]);
const AGENT_ACTION_MODES = new Set(["report_only", "preview_then_fix", "fix_and_retest"]);
const PREVIEW_PROPOSAL_STATUSES = new Set(["draft", "approved", "needs_changes"]);
const WORK_PACKET_STATUSES = new Set(["open", "needs_question", "in_progress", "done", "dismissed"]);
const POST_FIX_REVIEW_VERDICTS = new Set(["fixed", "missed", "still_unclear"]);

function getSupabaseAccess(options = {}) {
  const supabaseUrl = sanitizeString(options.supabaseUrl || process.env.SUPABASE_URL, 4096).replace(/\/$/, "");
  const serviceKey = sanitizeString(options.serviceKey || process.env.SUPABASE_SERVICE_KEY, 4096);
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  if (!supabaseUrl || !serviceKey) {
    return { ok: false, status: 500, error: "Server is not configured" };
  }

  if (typeof fetchImpl !== "function") {
    return { ok: false, status: 500, error: "fetch is not available" };
  }

  return { ok: true, supabaseUrl, serviceKey, fetchImpl };
}

function buildSupabaseHeaders(serviceKey, prefer = "return=representation") {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    Prefer: prefer
  };
}

function slugify(value, fallback = "manual") {
  const slug = sanitizeString(value, 160)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function deriveBrandKey(input = {}) {
  const explicit = sanitizeString(input.brand || input.brand_key || input.brandKey || input.project || input.project_key, 256);
  if (explicit) {
    return slugify(explicit, "manual");
  }
  const targetUrl = normalizeUrl(input.target_url || input.targetUrl || input.url);
  if (!targetUrl) {
    return "manual";
  }
  try {
    return slugify(new URL(targetUrl).hostname.replace(/^www\./, ""), "manual");
  } catch {
    return "manual";
  }
}

function buildManualSessionId(input = {}) {
  const explicit = sanitizeString(input.session_id || input.sessionId || input.run_id || input.runId, 128);
  if (explicit) {
    return explicit;
  }
  const brand = deriveBrandKey(input);
  return `manual-${brand}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
}

function createWidgetToken() {
  return `${WIDGET_TOKEN_PREFIX}${crypto.randomBytes(24).toString("base64url")}`;
}

function hashWidgetToken(token) {
  const safeToken = sanitizeString(token, 512);
  if (!safeToken) {
    return "";
  }
  return crypto.createHash("sha256").update(safeToken).digest("hex");
}

function compareWidgetTokenHash(token, expectedHash) {
  const actualHash = hashWidgetToken(token);
  const safeExpected = sanitizeString(expectedHash, 128);
  if (!actualHash || !safeExpected || actualHash.length !== safeExpected.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(actualHash, "hex"), Buffer.from(safeExpected, "hex"));
  } catch {
    return false;
  }
}

function resolveManualQaDirectReviewUrl(session = {}) {
  const checklist = Array.isArray(session.checklist) ? session.checklist : [];
  const firstStartUrl = checklist.find((item) => sanitizeString(item?.start_url, 4096))?.start_url;
  return (
    normalizeUrl(firstStartUrl) ||
    normalizeUrl(session.target_url) ||
    normalizeUrl(session.browser?.target_url) ||
    sanitizeOptionalString(firstStartUrl || session.target_url || session.browser?.target_url, 4096) ||
    null
  );
}

function buildManualChecklistReviewUrls(session = {}) {
  const fallbackUrl = resolveManualQaDirectReviewUrl(session);
  const checklist = Array.isArray(session.checklist) ? session.checklist : [];
  return checklist.map((item, index) => ({
    item_id: sanitizeString(item?.id, 80) || `item_${index + 1}`,
    title: sanitizeString(item?.title, 180) || `Manual check ${index + 1}`,
    review_url:
      normalizeUrl(item?.start_url) ||
      normalizeUrl(session.target_url) ||
      fallbackUrl ||
      sanitizeOptionalString(item?.start_url || session.target_url, 4096) ||
      null
  }));
}

function buildFirstPartyWidgetReviewUrl(reviewUrl, sessionId, token, publicBaseUrl) {
  const rawReviewUrl = sanitizeOptionalString(reviewUrl, 4096);
  const safeSessionId = sanitizeString(sessionId, 128);
  const safeToken = sanitizeString(token, 512);
  const baseUrl = sanitizeString(publicBaseUrl, 4096).replace(/\/$/, "");
  if (!rawReviewUrl || !safeSessionId || !safeToken || !baseUrl) {
    return rawReviewUrl || null;
  }
  try {
    const parsedReview = new URL(rawReviewUrl);
    const parsedBase = new URL(baseUrl);
    if (parsedReview.origin !== parsedBase.origin) {
      return rawReviewUrl;
    }
    parsedReview.searchParams.set("bud_session_id", safeSessionId);
    parsedReview.searchParams.set("bud_token", safeToken);
    return parsedReview.toString();
  } catch {
    return rawReviewUrl;
  }
}

function buildManualWidgetInstall(session, token, publicBaseUrl) {
  const baseUrl = sanitizeString(publicBaseUrl, 4096).replace(/\/$/, "");
  const sessionId = sanitizeString(session?.session_id, 128);
  const safeToken = sanitizeString(token, 512);
  if (!baseUrl || !sessionId || !safeToken) {
    return null;
  }
  const scriptParams = new URLSearchParams({
    session_id: sessionId,
    token: safeToken
  });
  const scriptUrl = `${baseUrl}/api/manual-qa/widget.js?${scriptParams.toString()}`;
  const reviewUrl = buildFirstPartyWidgetReviewUrl(resolveManualQaDirectReviewUrl(session), sessionId, safeToken, baseUrl);
  const checklistReviewUrls = buildManualChecklistReviewUrls(session).map((item) => ({
    ...item,
    review_url: buildFirstPartyWidgetReviewUrl(item.review_url, sessionId, safeToken, baseUrl)
  }));
  return {
    mode: "in_page_overlay",
    script_url: scriptUrl,
    script_tag: `<script async src="${scriptUrl}"></script>`,
    review_url: reviewUrl,
    direct_review_url: reviewUrl,
    checklist_review_urls: checklistReviewUrls,
    required: true,
    target_locked_until_widget_loads: true,
    verify_selector: "#beforeusersdo-widget-root",
    verify_expression: "window.__beforeUsersDoWidgetLoaded === true",
    review_note:
      "After verifying the widget is installed, send review_url as the primary test link. Keep the dashboard/report URL secondary.",
    install_note:
      "Required: inject this script into the preview/dev build, load the preview once, and verify the floating Review button before giving the user the page."
  };
}

function normalizeStringList(value, maxItems = 20, maxLength = 800) {
  const source = Array.isArray(value)
    ? value
    : sanitizeString(value, maxItems * maxLength)
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*[-*0-9.)]+\s*/, ""));
  return source
    .map((item) => sanitizeString(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeAgentActionMode(input = {}, fallback = "report_only") {
  const explicit = sanitizeString(
    input.feedback_action || input.feedbackAction || input.feedback_mode || input.feedbackMode || input.agent_action_mode || input.agentActionMode,
    80
  ).toLowerCase();
  if (AGENT_ACTION_MODES.has(explicit)) {
    return explicit;
  }
  if (["share_feedback", "share_only", "save_feedback", "save_only"].includes(explicit)) {
    return "report_only";
  }
  if (
    [
      "preview_then_fix",
      "preview_fix_first",
      "preview_first",
      "simulate_first",
      "simulate_fix",
      "mockup_first",
      "mock_first"
    ].includes(explicit)
  ) {
    return "preview_then_fix";
  }
  if (["share_feedback_and_start_work", "share_and_start_work", "auto_start_work", "start_work"].includes(explicit)) {
    return "fix_and_retest";
  }
  if (input.auto_start_work === true || input.autoStartWork === true) {
    return "fix_and_retest";
  }
  if (input.auto_start_work === false || input.autoStartWork === false) {
    return "report_only";
  }
  return AGENT_ACTION_MODES.has(fallback) ? fallback : "report_only";
}

function feedbackActionForAgentMode(mode) {
  if (mode === "fix_and_retest") return "share_feedback_and_start_work";
  if (mode === "preview_then_fix") return "preview_fix_first";
  return "share_feedback";
}

function shouldAutoStartWorkForAgentMode(mode) {
  return mode === "fix_and_retest";
}

function normalizeItemStatus(value) {
  const status = sanitizeString(value, 32).toLowerCase();
  return ITEM_STATUSES.has(status) ? status : "pending";
}

function normalizeManualReviewMode(input = {}) {
  if (input.freestyle === true || input.freeform === true) {
    return "freestyle";
  }
  const raw = sanitizeString(input.review_mode || input.reviewMode || input.manual_mode || input.manualMode || input.mode, 64)
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (["freestyle", "freeform", "free_style", "free_form", "screen_recording", "recording"].includes(raw)) {
    return "freestyle";
  }
  return MANUAL_REVIEW_MODES.has(raw) ? raw : "checklist";
}

function coerceStartUrl(value, targetUrl) {
  const raw = sanitizeString(value, 4096);
  const fallback = normalizeUrl(targetUrl) || "";
  if (!raw) {
    return fallback;
  }
  const absolute = normalizeUrl(raw);
  if (absolute) {
    return absolute;
  }
  if (!fallback) {
    return "";
  }
  try {
    return new URL(raw, fallback).toString();
  } catch {
    return fallback;
  }
}

function redactSensitiveUrl(value) {
  const raw = sanitizeString(value, 4096);
  if (!raw) {
    return "";
  }
  try {
    const parsed = new URL(raw);
    for (const key of Array.from(parsed.searchParams.keys())) {
      const normalized = key.toLowerCase();
      if (SENSITIVE_URL_PARAMS.has(normalized) || normalized.includes("token") || normalized.includes("secret")) {
        parsed.searchParams.set(key, "[redacted]");
      }
    }
    return parsed.toString();
  } catch {
    return raw.replace(/([?&][^=\s]*(?:token|secret|password|key|session)[^=\s]*=)[^&\s]+/gi, "$1[redacted]");
  }
}

function redactSensitiveText(value, maxLength = 1000) {
  const raw = sanitizeString(value, maxLength);
  if (!raw) {
    return "";
  }
  return redactSensitiveUrl(raw)
    .replace(/\b(bud_widget_)[A-Za-z0-9._-]+/g, "$1[redacted]")
    .replace(/\b(mcp_)[A-Za-z0-9._-]+/g, "$1[redacted]")
    .replace(/\b(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1[redacted]");
}

function normalizeWidgetEventList(value, maxItems = MAX_WIDGET_EVENTS) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .slice(-maxItems)
    .map((entry) => {
      const item = isPlainObject(entry) ? entry : { message: entry };
      return {
        type: sanitizeOptionalString(item.type || item.level || item.kind, 40) || null,
        message: redactSensitiveText(item.message || item.text || item.error || item.url || "", 1000),
        url: item.url ? redactSensitiveUrl(item.url) : null,
        method: sanitizeOptionalString(item.method, 16) || null,
        status: Number.isFinite(Number(item.status)) ? Number(item.status) : null,
        duration_ms: Number.isFinite(Number(item.duration_ms || item.durationMs))
          ? Number(item.duration_ms || item.durationMs)
          : null,
        at: sanitizeOptionalString(item.at || item.time || item.timestamp, 128) || null
      };
    })
    .filter((entry) => entry.message || entry.url);
}

function normalizePageVisitList(value, maxItems = MAX_WIDGET_EVENTS) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .slice(-maxItems)
    .map((entry) => {
      const item = isPlainObject(entry) ? entry : { page_url: entry };
      return {
        page_url: item.page_url || item.pageUrl || item.url ? redactSensitiveUrl(item.page_url || item.pageUrl || item.url) : null,
        page_title: sanitizeOptionalString(item.page_title || item.pageTitle || item.title, 300) || null,
        at: sanitizeOptionalString(item.at || item.time || item.timestamp, 128) || null
      };
    })
    .filter((entry) => entry.page_url || entry.page_title);
}

function normalizeTranscriptEventList(value, maxItems = MAX_WIDGET_EVENTS) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .slice(-maxItems)
    .map((entry) => {
      const item = isPlainObject(entry) ? entry : { text: entry };
      const confidence = Number(item.confidence);
      return {
        type: sanitizeOptionalString(item.type || item.kind || "speech", 40) || "speech",
        text: redactSensitiveText(item.text || item.transcript || item.message || "", 2000),
        source: sanitizeOptionalString(item.source, 80) || null,
        is_final: item.is_final === true || item.isFinal === true || item.final === true,
        confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : null,
        item_id: sanitizeOptionalString(item.item_id || item.itemId, 80) || null,
        page_url: item.page_url || item.pageUrl || item.url ? redactSensitiveUrl(item.page_url || item.pageUrl || item.url) : null,
        page_title: sanitizeOptionalString(item.page_title || item.pageTitle || item.title, 300) || null,
        started_at: sanitizeOptionalString(item.started_at || item.startedAt, 128) || null,
        ended_at: sanitizeOptionalString(item.ended_at || item.endedAt, 128) || null,
        at: sanitizeOptionalString(item.at || item.time || item.timestamp, 128) || null
      };
    })
    .filter((entry) => entry.text);
}

function normalizeDrawingBounds(value) {
  const source = isPlainObject(value) ? value : {};
  const output = {};
  for (const key of ["x", "y", "width", "height"]) {
    const nextValue = Number(source[key]);
    if (Number.isFinite(nextValue)) {
      output[key] = Math.round(nextValue);
    }
  }
  return Object.keys(output).length ? output : null;
}

function normalizeEvidenceEventList(value, maxItems = MAX_WIDGET_EVENTS) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .slice(-maxItems)
    .map((entry) => {
      const item = isPlainObject(entry) ? entry : { label: entry };
      const mediaIndex = Number(item.media_index ?? item.mediaIndex);
      const durationMs = Number(item.duration_ms ?? item.durationMs);
      const strokeCount = Number(item.stroke_count ?? item.strokeCount);
      return {
        type: sanitizeOptionalString(item.type || item.kind || "evidence", 60) || "evidence",
        label: redactSensitiveText(item.label || item.message || item.filename || "", 300) || null,
        item_id: sanitizeOptionalString(item.item_id || item.itemId, 80) || null,
        media_index: Number.isInteger(mediaIndex) && mediaIndex >= 0 ? mediaIndex : null,
        media_url: item.media_url || item.mediaUrl || item.url ? redactSensitiveUrl(item.media_url || item.mediaUrl || item.url) : null,
        page_url: item.page_url || item.pageUrl ? redactSensitiveUrl(item.page_url || item.pageUrl) : null,
        page_title: sanitizeOptionalString(item.page_title || item.pageTitle, 300) || null,
        started_at: sanitizeOptionalString(item.started_at || item.startedAt, 128) || null,
        ended_at: sanitizeOptionalString(item.ended_at || item.endedAt, 128) || null,
        at: sanitizeOptionalString(item.at || item.time || item.timestamp, 128) || null,
        duration_ms: Number.isFinite(durationMs) && durationMs >= 0 ? Math.round(durationMs) : null,
        stroke_count: Number.isFinite(strokeCount) && strokeCount >= 0 ? Math.round(strokeCount) : null,
        bounds: normalizeDrawingBounds(item.bounds || item.drawing_bounds || item.drawingBounds)
      };
    })
    .filter((entry) => entry.type || entry.label || entry.media_url);
}

function normalizeTopicSegmentList(value, maxItems = MAX_TOPIC_SEGMENTS) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .slice(-maxItems)
    .map((entry, index) => {
      const item = isPlainObject(entry) ? entry : {};
      const startIndex = Number(item.transcript_start_index ?? item.transcriptStartIndex ?? item.start_index ?? item.startIndex);
      const endIndex = Number(item.transcript_end_index ?? item.transcriptEndIndex ?? item.end_index ?? item.endIndex);
      const confidence = Number(item.confidence);
      const segmentId =
        sanitizeOptionalString(item.segment_id || item.segmentId || item.id, 128) ||
        `topic_${index + 1}`;
      return {
        segment_id: segmentId.replace(/[^a-zA-Z0-9_.:-]+/g, "-").slice(0, 128),
        title: sanitizeOptionalString(item.title || item.name, 180) || "Captured topic",
        summary: redactSensitiveText(item.summary || item.description || item.note || "", 1200) || null,
        transcript_start_index: Number.isInteger(startIndex) && startIndex >= 0 ? startIndex : null,
        transcript_end_index: Number.isInteger(endIndex) && endIndex >= 0 ? endIndex : null,
        started_at: sanitizeOptionalString(item.started_at || item.startedAt || item.start_at || item.startAt, 128) || null,
        ended_at: sanitizeOptionalString(item.ended_at || item.endedAt || item.end_at || item.endAt, 128) || null,
        page_url: item.page_url || item.pageUrl || item.url ? redactSensitiveUrl(item.page_url || item.pageUrl || item.url) : null,
        page_title: sanitizeOptionalString(item.page_title || item.pageTitle || item.title, 300) || null,
        confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : null,
        source: sanitizeOptionalString(item.source, 80) || "llm",
        created_at: sanitizeOptionalString(item.created_at || item.createdAt, 128) || null,
        updated_at: sanitizeOptionalString(item.updated_at || item.updatedAt, 128) || null
      };
    })
    .filter((entry) => entry.title || entry.summary);
}

function normalizeWidgetContext(value) {
  const source = isPlainObject(value) ? value : {};
  const viewport = isPlainObject(source.viewport) ? source.viewport : {};
  return {
    page_url: source.page_url || source.pageUrl ? redactSensitiveUrl(source.page_url || source.pageUrl) : null,
    page_title: sanitizeOptionalString(source.page_title || source.pageTitle, 300) || null,
    user_agent: sanitizeOptionalString(source.user_agent || source.userAgent, 500) || null,
    viewport: {
      width: Number.isFinite(Number(viewport.width)) ? Number(viewport.width) : null,
      height: Number.isFinite(Number(viewport.height)) ? Number(viewport.height) : null,
      device_pixel_ratio: Number.isFinite(Number(viewport.device_pixel_ratio || viewport.devicePixelRatio))
        ? Number(viewport.device_pixel_ratio || viewport.devicePixelRatio)
        : null
    },
    console_events: normalizeWidgetEventList(source.console_events || source.consoleEvents),
    network_events: normalizeWidgetEventList(source.network_events || source.networkEvents),
    page_errors: normalizeWidgetEventList(source.page_errors || source.pageErrors, 20),
    page_visits: normalizePageVisitList(source.page_visits || source.pageVisits || source.visited_pages || source.visitedPages),
    transcript_events: normalizeTranscriptEventList(source.transcript_events || source.transcriptEvents || source.transcripts),
    transcript_status: sanitizeOptionalString(source.transcript_status || source.transcriptStatus, 160) || null,
    evidence_events: normalizeEvidenceEventList(source.evidence_events || source.evidenceEvents || source.timeline_events || source.timelineEvents),
    topic_segments: normalizeTopicSegmentList(source.topic_segments || source.topicSegments)
  };
}

function normalizeEvidenceMediaList(value, maxItems = MAX_WIDGET_MEDIA_ITEMS) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .slice(0, maxItems)
    .map((entry) => {
      const item = isPlainObject(entry) ? entry : {};
      const kind = sanitizeString(item.kind || item.type, 32).toLowerCase();
      return {
        kind: WIDGET_MEDIA_KINDS.has(kind) ? kind : "screenshot",
        label: sanitizeOptionalString(item.label || item.filename || item.file_name, 240) || null,
        content_type: sanitizeOptionalString(item.content_type || item.contentType, 128) || null,
        storage_bucket: sanitizeOptionalString(item.storage_bucket || item.storageBucket || item.bucket, 128) || null,
        storage_path: sanitizeOptionalString(item.storage_path || item.storagePath || item.path, 4096) || null,
        byte_length: Number.isFinite(Number(item.byte_length || item.byteLength || item.size))
          ? Number(item.byte_length || item.byteLength || item.size)
          : null,
        url: item.url || item.evidence_url || item.evidenceUrl ? redactSensitiveUrl(item.url || item.evidence_url || item.evidenceUrl) : null,
        created_at: sanitizeOptionalString(item.created_at || item.createdAt, 128) || null
      };
    })
    .filter((entry) => entry.storage_path || entry.url);
}

function normalizeManualAgentFeedbackPackage(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const markdown = sanitizeString(source.markdown, MAX_AGENT_FEEDBACK_MARKDOWN);
  const feedbackId =
    sanitizeString(source.feedback_id || source.feedbackId || source.id, 128) ||
    `feedback-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
  const scope = sanitizeString(source.scope, 24).toLowerCase();
  const itemId = sanitizeOptionalString(source.item_id || source.itemId, 80) || null;
  const hasFeedbackAction = Boolean(
    sanitizeString(
      source.feedback_action ||
        source.feedbackAction ||
        source.feedback_mode ||
        source.feedbackMode ||
        source.agent_action_mode ||
        source.agentActionMode,
      80
    )
  ) || source.auto_start_work === true || source.auto_start_work === false || source.autoStartWork === true || source.autoStartWork === false;
  const agentActionMode = hasFeedbackAction ? normalizeAgentActionMode(source, "fix_and_retest") : "";
  return {
    feedback_id: feedbackId,
    scope: AGENT_FEEDBACK_SCOPES.has(scope) ? scope : itemId ? "item" : "all",
    item_id: itemId,
    markdown,
    ...(agentActionMode
      ? {
          agent_action_mode: agentActionMode,
          feedback_action: feedbackActionForAgentMode(agentActionMode),
          auto_start_work: shouldAutoStartWorkForAgentMode(agentActionMode)
        }
      : {}),
    generated_at: sanitizeOptionalString(source.generated_at || source.generatedAt, 128) || new Date().toISOString(),
    created_at: sanitizeOptionalString(source.created_at || source.createdAt, 128) || new Date().toISOString(),
    media_count: Number.isFinite(Number(source.media_count || source.mediaCount))
      ? Number(source.media_count || source.mediaCount)
      : null
  };
}

function normalizeManualAgentFeedback(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const rawPackages = Array.isArray(source.packages)
    ? source.packages
    : Array.isArray(source.items)
      ? source.items
      : [];
  const packages = rawPackages
    .map(normalizeManualAgentFeedbackPackage)
    .filter((entry) => entry.markdown)
    .slice(-MAX_AGENT_FEEDBACK_PACKAGES);
  const rawLatest = isPlainObject(source.latest) ? normalizeManualAgentFeedbackPackage(source.latest) : null;
  const latest = rawLatest?.markdown ? rawLatest : packages[packages.length - 1] || null;
  return {
    ready: Boolean(latest?.markdown),
    latest,
    packages
  };
}

function normalizePreviewProposalStatus(value, fallback = "draft") {
  const status = sanitizeString(value, 40).toLowerCase();
  return PREVIEW_PROPOSAL_STATUSES.has(status) ? status : fallback;
}

function normalizeManualPreviewProposal(value = {}) {
  const source = isPlainObject(value) ? value : {};
  if (!Object.keys(source).length) {
    return null;
  }

  const proposalId =
    sanitizeString(source.proposal_id || source.proposalId || source.id, 128) ||
    `preview-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
  const title = sanitizeString(source.title || source.headline, 180) || "Proposed fix";
  const summary =
    sanitizeOptionalString(source.summary || source.description || source.rationale || source.preview, 2400) || null;
  const visualPreviewUrl =
    source.visual_preview_url || source.visualPreviewUrl || source.preview_url || source.previewUrl || source.image_url || source.imageUrl
      ? redactSensitiveUrl(
          source.visual_preview_url || source.visualPreviewUrl || source.preview_url || source.previewUrl || source.image_url || source.imageUrl
        )
      : null;
  const changes = normalizeStringList(
    source.changes || source.change_list || source.changeList || source.items || source.fix_points || source.fixPoints,
    MAX_PREVIEW_PROPOSAL_ITEMS,
    700
  );
  const expectedBehavior = normalizeStringList(
    source.expected_behavior || source.expectedBehavior || source.behavior_trace || source.behaviorTrace || source.trace,
    MAX_PREVIEW_PROPOSAL_ITEMS,
    700
  );
  const openQuestions = normalizeStringList(
    source.open_questions || source.openQuestions || source.questions,
    6,
    500
  );
  const now = new Date().toISOString();

  return {
    proposal_id: proposalId,
    status: normalizePreviewProposalStatus(source.status),
    title,
    summary,
    visual_preview_url: visualPreviewUrl,
    changes,
    expected_behavior: expectedBehavior,
    open_questions: openQuestions,
    response_note: sanitizeOptionalString(source.response_note || source.responseNote || source.note, 2000) || null,
    created_at: sanitizeOptionalString(source.created_at || source.createdAt, 128) || now,
    updated_at: sanitizeOptionalString(source.updated_at || source.updatedAt, 128) || now,
    responded_at: sanitizeOptionalString(source.responded_at || source.respondedAt, 128) || null
  };
}

function normalizePostFixReviewVerdict(value, fallback = "still_unclear") {
  const verdict = sanitizeString(value, 40).toLowerCase();
  return POST_FIX_REVIEW_VERDICTS.has(verdict) ? verdict : fallback;
}

function normalizeManualPostFixReview(value = {}) {
  const source = isPlainObject(value) ? value : {};
  if (!Object.keys(source).length) {
    return null;
  }
  const verdict = normalizePostFixReviewVerdict(source.verdict || source.status);
  const missedItems = normalizeStringList(source.missed_items || source.missedItems || source.misses, MAX_POST_FIX_REVIEW_ITEMS, 900);
  const unclearItems = normalizeStringList(source.unclear_items || source.unclearItems || source.still_unclear, MAX_POST_FIX_REVIEW_ITEMS, 900);
  const mayMarkDone = verdict === "fixed" && !missedItems.length && !unclearItems.length;
  const now = new Date().toISOString();
  return {
    review_id:
      sanitizeString(source.review_id || source.reviewId || source.id, 128) ||
      `postfix-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`,
    feedback_id: sanitizeOptionalString(source.feedback_id || source.feedbackId, 128) || null,
    run_id: sanitizeOptionalString(source.run_id || source.runId, 128) || null,
    reviewer: sanitizeOptionalString(source.reviewer || source.reviewer_agent || source.reviewerAgent, 160) || "fresh_contextless_agent",
    verdict,
    may_mark_done: mayMarkDone,
    fixed_url:
      source.fixed_url || source.fixedUrl || source.url
        ? redactSensitiveUrl(source.fixed_url || source.fixedUrl || source.url)
        : null,
    changed_files: normalizeStringList(source.changed_files || source.changedFiles, 80, 500),
    commit_sha: sanitizeOptionalString(source.commit_sha || source.commitSha, 120) || null,
    packet_ids: normalizeStringList(source.packet_ids || source.packetIds || source.packet_id || source.packetId, MAX_POST_FIX_REVIEW_ITEMS, 128),
    fixed_items: normalizeStringList(source.fixed_items || source.fixedItems, MAX_POST_FIX_REVIEW_ITEMS, 900),
    missed_items: missedItems,
    unclear_items: unclearItems,
    summary: sanitizeOptionalString(source.summary || source.reviewer_summary || source.reviewerSummary || source.note, 4000) || null,
    evidence_urls: normalizeStringList(source.evidence_urls || source.evidenceUrls || source.proof_urls || source.proofUrls, MAX_POST_FIX_REVIEW_ITEMS, 4096).map(redactSensitiveUrl),
    test_results: normalizeStringList(source.test_results || source.testResults || source.checks, MAX_POST_FIX_REVIEW_ITEMS, 500),
    created_at: sanitizeOptionalString(source.created_at || source.createdAt, 128) || now
  };
}

function normalizeManualPostFixReviews(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const rawReviews = Array.isArray(source.reviews)
    ? source.reviews
    : Array.isArray(source.items)
      ? source.items
      : [];
  const reviews = rawReviews
    .map(normalizeManualPostFixReview)
    .filter(Boolean)
    .slice(-MAX_POST_FIX_REVIEWS);
  const rawLatest = isPlainObject(source.latest) ? normalizeManualPostFixReview(source.latest) : null;
  const latest = rawLatest || reviews[reviews.length - 1] || null;
  return {
    ready: Boolean(latest),
    may_mark_done: latest?.may_mark_done === true,
    latest,
    reviews
  };
}

function countManualEvidenceMedia(session = {}) {
  return (Array.isArray(session.checklist) ? session.checklist : []).reduce((total, item) => {
    return total + normalizeEvidenceMediaList(item.evidence_media).length;
  }, 0);
}

function formatEvidenceMediaKind(entry = {}) {
  const kind = sanitizeString(entry.kind || entry.type, 32).toLowerCase();
  const contentType = sanitizeString(entry.content_type || entry.contentType, 128).toLowerCase();
  const label = sanitizeString(entry.label || entry.filename || entry.file_name, 240).toLowerCase();
  if (kind === "video" || contentType.startsWith("video/")) return "Video recording";
  if (kind === "audio" || contentType.startsWith("audio/")) return "Audio recording";
  if (label.includes("drawing") || label.includes("annotation")) return "Drawing";
  if (kind === "screenshot" || kind === "image" || contentType.startsWith("image/")) return "Screenshot";
  return "Evidence";
}

function formatEvidenceMediaSize(byteLength) {
  const bytes = Number(byteLength);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function pushEvidenceMediaLines(lines, item) {
  const media = normalizeEvidenceMediaList(item.evidence_media);
  if (!media.length) return;
  lines.push("- Captured media:");
  media.forEach((entry, index) => {
    const details = [
      entry.label,
      entry.content_type,
      formatEvidenceMediaSize(entry.byte_length),
      entry.created_at
    ].filter(Boolean);
    lines.push(
      `  - ${index + 1}. ${formatEvidenceMediaKind(entry)}${details.length ? ` (${details.join(", ")})` : ""}${entry.url ? `: ${entry.url}` : ""}`
    );
  });
}

function timestampMs(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
}

function eventTimestamp(entry = {}) {
  return entry.ended_at || entry.at || entry.started_at || entry.created_at || null;
}

function formatDigestTime(value) {
  const parsed = timestampMs(value);
  if (!Number.isFinite(parsed)) {
    return "";
  }
  return new Date(parsed).toISOString();
}

function formatDurationMs(value) {
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration <= 0) {
    return "";
  }
  if (duration >= 1000) {
    return `${Math.round(duration / 1000)}s`;
  }
  return `${Math.round(duration)}ms`;
}

function truncateDigestText(value, maxLength = 220) {
  const text = redactSensitiveText(value, maxLength + 100).replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function formatTranscriptSnippet(entry = {}) {
  const time = formatDigestTime(eventTimestamp(entry));
  const confidence = Number.isFinite(Number(entry.confidence)) ? `, confidence ${Math.round(Number(entry.confidence) * 100)}%` : "";
  return `${time ? `${time}: ` : ""}"${truncateDigestText(entry.text, 260)}"${confidence}`;
}

function evidenceEventTitle(entry = {}) {
  const rawType = sanitizeString(entry.type || "evidence", 60).replace(/[_-]+/g, " ");
  const type = rawType ? rawType[0].toUpperCase() + rawType.slice(1) : "Evidence";
  return entry.label ? `${type}: ${entry.label}` : type;
}

function findNearbyTranscript(transcriptEvents, evidenceEvent, windowMs = 30000) {
  const eventTime = timestampMs(eventTimestamp(evidenceEvent));
  if (!Number.isFinite(eventTime)) {
    return [];
  }
  return transcriptEvents
    .map((entry) => ({ entry, distance: Math.abs((timestampMs(eventTimestamp(entry)) || 0) - eventTime) }))
    .filter((candidate) => Number.isFinite(candidate.distance) && candidate.distance <= windowMs)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 2)
    .map((candidate) => candidate.entry);
}

function itemWidgetSignals(item = {}) {
  const context = normalizeWidgetContext(item.widget_context);
  const transcriptEvents = context.transcript_events.filter((entry) => entry.text);
  const evidenceEvents = context.evidence_events;
  const media = normalizeEvidenceMediaList(item.evidence_media);
  const pageErrors = Array.isArray(context.page_errors) ? context.page_errors : [];
  const consoleFindings = Array.isArray(context.console_events)
    ? context.console_events.filter((entry) => ["error", "warn"].includes(String(entry.type || "").toLowerCase()))
    : [];
  const networkFindings = Array.isArray(context.network_events)
    ? context.network_events.filter(isNetworkFailureEvent)
    : [];
  return {
    context,
    transcriptEvents,
    evidenceEvents,
    topicSegments: context.topic_segments || [],
    media,
    pageErrors,
    consoleFindings,
    networkFindings
  };
}

function itemHasProcessedEvidence(item = {}) {
  const signals = itemWidgetSignals(item);
  return Boolean(
    item.note ||
      signals.transcriptEvents.length ||
      signals.evidenceEvents.length ||
      signals.topicSegments.length ||
      signals.media.length ||
      signals.pageErrors.length ||
      signals.consoleFindings.length ||
      signals.networkFindings.length
  );
}

function firstUsefulSentence(value, maxLength = 120) {
  const text = truncateDigestText(value, maxLength + 80).replace(/\s+/g, " ").trim();
  if (!text) return "";
  const sentence = text.split(/(?<=[.!?])\s+/).find((entry) => entry.replace(/[.!?]+$/, "").trim().length >= 8) || text;
  return truncateDigestText(sentence.replace(/^["']|["']$/g, ""), maxLength);
}

function workPacketStatus(value) {
  const status = sanitizeString(value, 40).toLowerCase();
  return WORK_PACKET_STATUSES.has(status) ? status : "open";
}

function inferWorkPacketOwner(sourceKind, signals = {}) {
  if (sourceKind === "technical") {
    if ((signals.networkFindings || []).length) return "backend_or_integration";
    return "frontend_engineer";
  }
  if (sourceKind === "drawing" || sourceKind === "feedback") return "frontend_or_product";
  return "full_stack";
}

function normalizeWorkPacketEvidenceMedia(value) {
  return normalizeEvidenceMediaList(value, MAX_WORK_PACKET_EVIDENCE).map((entry) => ({
    kind: entry.kind,
    label: entry.label,
    content_type: entry.content_type,
    byte_length: entry.byte_length,
    url: entry.url ? redactSensitiveUrl(entry.url) : null,
    created_at: entry.created_at
  }));
}

function normalizeWorkPacketEvent(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    type: sanitizeOptionalString(source.type || source.kind, 80) || "event",
    label: sanitizeOptionalString(source.label || source.message || source.text, 300) || null,
    at: sanitizeOptionalString(source.at || source.ended_at || source.endedAt || source.started_at || source.startedAt, 128) || null,
    page_url: source.page_url || source.pageUrl || source.url ? redactSensitiveUrl(source.page_url || source.pageUrl || source.url) : null,
    media_url: source.media_url || source.mediaUrl ? redactSensitiveUrl(source.media_url || source.mediaUrl) : null,
    bounds: normalizeDrawingBounds(source.bounds || source.drawing_bounds || source.drawingBounds),
    stroke_count: Number.isFinite(Number(source.stroke_count || source.strokeCount)) ? Number(source.stroke_count || source.strokeCount) : null
  };
}

function normalizeTechnicalSignal(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    type: sanitizeOptionalString(source.type || source.kind, 40) || null,
    method: sanitizeOptionalString(source.method, 16) || null,
    status: Number.isFinite(Number(source.status)) ? Number(source.status) : null,
    message: truncateDigestText(source.message || source.text || source.error || source.url || "", 500) || null,
    url: source.url ? redactSensitiveUrl(source.url) : null,
    at: sanitizeOptionalString(source.at || source.time || source.timestamp, 128) || null
  };
}

function normalizeManualWorkPacket(value = {}, index = 0, session = {}) {
  const source = isPlainObject(value) ? value : {};
  const itemId = sanitizeOptionalString(source.item_id || source.itemId, 80) || null;
  const sourceKind = sanitizeString(source.source_kind || source.sourceKind || source.kind, 80).toLowerCase() || "feedback";
  const title =
    sanitizeString(source.title, 180) ||
    firstUsefulSentence(source.summary || source.note || source.agent_task || source.agentTask, 140) ||
    "Review QA feedback";
  const pageAnchor = isPlainObject(source.page_anchor || source.pageAnchor) ? source.page_anchor || source.pageAnchor : {};
  const packetId =
    sanitizeString(source.packet_id || source.packetId || source.id, 128) ||
    [
      "packet",
      sanitizeString(session.session_id, 80) || "manual",
      itemId || "item",
      sourceKind,
      index + 1
    ].join("-");
  const evidenceUrls = normalizeStringList(source.evidence_urls || source.evidenceUrls || source.urls, MAX_WORK_PACKET_EVIDENCE, 4096)
    .map(redactSensitiveUrl);
  const transcriptSnippets = normalizeStringList(
    source.transcript_snippets || source.transcriptSnippets || source.transcripts || source.speech,
    8,
    700
  );
  const drawingEvents = Array.isArray(source.drawing_events || source.drawingEvents)
    ? (source.drawing_events || source.drawingEvents).slice(0, MAX_WORK_PACKET_EVIDENCE).map(normalizeWorkPacketEvent)
    : [];
  const videoEvents = Array.isArray(source.video_events || source.videoEvents)
    ? (source.video_events || source.videoEvents).slice(0, MAX_WORK_PACKET_EVIDENCE).map(normalizeWorkPacketEvent)
    : [];
  const technicalSignals = Array.isArray(source.technical_signals || source.technicalSignals)
    ? (source.technical_signals || source.technicalSignals).slice(0, MAX_WORK_PACKET_EVIDENCE).map(normalizeTechnicalSignal)
    : [];
  const media = normalizeWorkPacketEvidenceMedia(source.evidence_media || source.evidenceMedia || source.media);
  const pageUrl =
    pageAnchor.url || pageAnchor.page_url || pageAnchor.pageUrl || source.page_url || source.pageUrl || source.start_url || source.startUrl
      ? redactSensitiveUrl(pageAnchor.url || pageAnchor.page_url || pageAnchor.pageUrl || source.page_url || source.pageUrl || source.start_url || source.startUrl)
      : null;
  return {
    packet_id: packetId.replace(/[^a-zA-Z0-9_.:-]+/g, "-").slice(0, 128),
    status: workPacketStatus(source.status),
    title,
    summary: sanitizeOptionalString(source.summary || source.description || source.note, 1600) || null,
    item_id: itemId,
    item_title: sanitizeOptionalString(source.item_title || source.itemTitle, 180) || null,
    source_kind: sourceKind,
    suggested_owner: sanitizeOptionalString(source.suggested_owner || source.suggestedOwner || source.owner, 80) || inferWorkPacketOwner(sourceKind),
    confidence: sanitizeOptionalString(source.confidence, 40) || "needs_triage",
    page_anchor: {
      url: pageUrl,
      title: sanitizeOptionalString(pageAnchor.title || pageAnchor.page_title || pageAnchor.pageTitle || source.page_title || source.pageTitle, 300) || null,
      viewport: isPlainObject(pageAnchor.viewport || source.viewport) ? pageAnchor.viewport || source.viewport : null,
      bounds: normalizeDrawingBounds(pageAnchor.bounds || source.bounds)
    },
    evidence_urls: evidenceUrls,
    evidence_media: media,
    transcript_snippets: transcriptSnippets,
    drawing_events: drawingEvents,
    video_events: videoEvents,
    technical_signals: technicalSignals,
    agent_task:
      sanitizeOptionalString(source.agent_task || source.agentTask, 2200) ||
      `Investigate and fix: ${title}. Use the evidence URLs, page anchor, transcript, drawing bounds, console, and network context before changing code.`,
    user_question: sanitizeOptionalString(source.user_question || source.userQuestion, 800) || null,
    created_at: sanitizeOptionalString(source.created_at || source.createdAt, 128) || new Date().toISOString(),
    updated_at: sanitizeOptionalString(source.updated_at || source.updatedAt, 128) || null
  };
}

function buildPacketBase(session = {}, item = {}, signals = {}) {
  const context = signals.context || normalizeWidgetContext(item.widget_context);
  const pageUrl = context.page_url || item.start_url || session.target_url || null;
  const evidenceUrls = Array.isArray(item.evidence_urls) ? item.evidence_urls.map(redactSensitiveUrl) : [];
  const media = normalizeWorkPacketEvidenceMedia(item.evidence_media);
  return {
    item_id: sanitizeOptionalString(item.id, 80) || null,
    item_title: sanitizeOptionalString(item.title, 180) || null,
    page_anchor: {
      url: pageUrl ? redactSensitiveUrl(pageUrl) : null,
      title: context.page_title || null,
      viewport: context.viewport || null
    },
    evidence_urls: evidenceUrls,
    evidence_media: media
  };
}

function transcriptEventsForTopicSegment(transcriptEvents = [], segment = {}) {
  const startIndex = Number(segment.transcript_start_index);
  const endIndex = Number(segment.transcript_end_index);
  if (Number.isInteger(startIndex) && Number.isInteger(endIndex) && endIndex >= startIndex) {
    return transcriptEvents.slice(startIndex, endIndex + 1).filter((entry) => entry.text);
  }
  const startedAt = timestampMs(segment.started_at);
  const endedAt = timestampMs(segment.ended_at);
  if (Number.isFinite(startedAt) || Number.isFinite(endedAt)) {
    return transcriptEvents.filter((entry) => {
      const at = timestampMs(eventTimestamp(entry));
      if (!Number.isFinite(at)) return false;
      if (Number.isFinite(startedAt) && at < startedAt) return false;
      if (Number.isFinite(endedAt) && at > endedAt) return false;
      return true;
    });
  }
  return [];
}

function evidenceEventsForTopicSegment(evidenceEvents = [], segment = {}, windowMs = TOPIC_SEGMENT_EVIDENCE_WINDOW_MS) {
  const startedAt = timestampMs(segment.started_at);
  const endedAt = timestampMs(segment.ended_at);
  if (!Number.isFinite(startedAt) && !Number.isFinite(endedAt)) {
    return [];
  }
  const windowStart = Number.isFinite(startedAt) ? startedAt - windowMs : null;
  const windowEnd = Number.isFinite(endedAt) ? endedAt + windowMs : null;
  return evidenceEvents.filter((entry) => {
    const at = timestampMs(eventTimestamp(entry));
    if (!Number.isFinite(at)) return false;
    if (Number.isFinite(windowStart) && at < windowStart) return false;
    if (Number.isFinite(windowEnd) && at > windowEnd) return false;
    return true;
  });
}

function pushTopicSegmentWorkPackets({ packets, maxPackets, session, item, signals, base }) {
  const topicSegments = Array.isArray(signals.topicSegments) ? signals.topicSegments : [];
  for (const segment of topicSegments.slice(-MAX_TOPIC_SEGMENTS)) {
    if (packets.length >= maxPackets) break;
    const transcriptEvents = transcriptEventsForTopicSegment(signals.transcriptEvents, segment);
    const evidenceEvents = evidenceEventsForTopicSegment(signals.evidenceEvents, segment);
    const drawingEvents = evidenceEvents.filter((entry) => /drawing|annotation/i.test(`${entry.type || ""} ${entry.label || ""}`));
    const videoEvents = evidenceEvents.filter((entry) => /video|recording/i.test(`${entry.type || ""} ${entry.label || ""}`));
    const transcriptSnippets = transcriptEvents.slice(-MAX_TOPIC_SEGMENT_TRANSCRIPTS).map(formatTranscriptSnippet);
    packets.push(normalizeManualWorkPacket({
      ...base,
      source_kind: "topic",
      title: segment.title || firstUsefulSentence(segment.summary || transcriptEvents[0]?.text || item.title, 130),
      summary: [
        segment.summary || "",
        transcriptSnippets.length ? `Speech captured: ${transcriptSnippets.slice(-3).join(" | ")}` : ""
      ].filter(Boolean).join(" "),
      page_anchor: {
        ...(base.page_anchor || {}),
        url: segment.page_url || base.page_anchor?.url || null,
        title: segment.page_title || base.page_anchor?.title || null,
        bounds: drawingEvents.find((entry) => entry.bounds)?.bounds || null
      },
      transcript_snippets: transcriptSnippets,
      drawing_events: drawingEvents.slice(-MAX_WORK_PACKET_EVIDENCE),
      video_events: videoEvents.slice(-MAX_WORK_PACKET_EVIDENCE),
      suggested_owner: "frontend_or_product",
      confidence: segment.confidence !== null && segment.confidence !== undefined ? String(segment.confidence) : "medium",
      agent_task:
        `Investigate and fix the captured QA topic: ${segment.title || "Captured topic"}. ` +
        "Use the segment transcript, screenshots/media, drawings, page anchor, console, and network evidence before changing code."
    }, packets.length, session));
  }
}

function buildManualQaWorkPackets(session = {}, options = {}) {
  const items = Array.isArray(session.checklist) ? session.checklist : [];
  const packets = [];
  const maxPackets = Math.max(1, Math.min(MAX_WORK_PACKETS, Number(options.max_packets || options.maxPackets || MAX_WORK_PACKETS) || MAX_WORK_PACKETS));

  for (const item of items) {
    if (packets.length >= maxPackets || !itemHasProcessedEvidence(item)) continue;
    const signals = itemWidgetSignals(item);
    const base = buildPacketBase(session, item, signals);
    const drawingEvents = signals.evidenceEvents.filter((entry) => /drawing|annotation/i.test(`${entry.type || ""} ${entry.label || ""}`));
    const videoEvents = signals.evidenceEvents.filter((entry) => /video|recording/i.test(`${entry.type || ""} ${entry.label || ""}`));
    const itemTitle = item.title || "Manual QA feedback";

    pushTopicSegmentWorkPackets({ packets, maxPackets, session, item, signals, base });

    for (const drawingEvent of drawingEvents.slice(-4)) {
      if (packets.length >= maxPackets) break;
      const nearby = findNearbyTranscript(signals.transcriptEvents, drawingEvent);
      const speech = nearby.map(formatTranscriptSnippet);
      const drawingTitle = firstUsefulSentence(nearby[0]?.text || drawingEvent.label || item.note || itemTitle, 120);
      packets.push(normalizeManualWorkPacket({
        ...base,
        source_kind: "drawing",
        title: drawingTitle || `Review drawing on ${itemTitle}`,
        summary: [
          drawingEvent.label ? evidenceEventTitle(drawingEvent) : "The reviewer drew on the page.",
          speech.length ? `Nearby speech: ${speech.join(" | ")}` : "",
          item.note ? `Typed note: ${truncateDigestText(item.note, 220)}` : ""
        ].filter(Boolean).join(" "),
        page_anchor: {
          ...(base.page_anchor || {}),
          bounds: drawingEvent.bounds
        },
        transcript_snippets: speech,
        drawing_events: [drawingEvent],
        video_events: videoEvents.slice(-3),
        suggested_owner: "frontend_or_product",
        confidence: speech.length || item.note ? "medium" : "needs_triage"
      }, packets.length, session));
    }

    if (packets.length < maxPackets && (signals.pageErrors.length || signals.consoleFindings.length || signals.networkFindings.length)) {
      const technicalSignals = [
        ...signals.pageErrors,
        ...signals.consoleFindings,
        ...signals.networkFindings
      ].slice(-MAX_WORK_PACKET_EVIDENCE);
      const firstSignal = technicalSignals[0] || {};
      packets.push(normalizeManualWorkPacket({
        ...base,
        source_kind: "technical",
        title: firstUsefulSentence(firstSignal.message || firstSignal.url || `Technical issue on ${itemTitle}`, 130),
        summary: `Technical evidence was captured while reviewing ${itemTitle}.`,
        technical_signals: technicalSignals,
        video_events: videoEvents.slice(-3),
        suggested_owner: inferWorkPacketOwner("technical", signals),
        confidence: "high"
      }, packets.length, session));
    }

    const transcriptCandidates = signals.transcriptEvents
      .filter((entry) => entry.text)
      .slice(-4);
    const hasTopicPackets = packets.some((packet) => packet.item_id === item.id && packet.source_kind === "topic");
    if (!hasTopicPackets && packets.length < maxPackets && (item.note || transcriptCandidates.length || videoEvents.length || signals.media.length)) {
      const transcriptSnippets = transcriptCandidates.map(formatTranscriptSnippet);
      const titleSource = item.note || transcriptCandidates[0]?.text || itemTitle;
      packets.push(normalizeManualWorkPacket({
        ...base,
        source_kind: "feedback",
        title: firstUsefulSentence(titleSource, 130) || `Review ${itemTitle}`,
        summary: [
          item.note ? `Typed note: ${truncateDigestText(item.note, 260)}` : "",
          transcriptSnippets.length ? `Speech captured: ${transcriptSnippets.slice(-2).join(" | ")}` : "",
          videoEvents.length ? `${videoEvents.length} video event${videoEvents.length === 1 ? "" : "s"} captured.` : ""
        ].filter(Boolean).join(" "),
        transcript_snippets: transcriptSnippets,
        drawing_events: drawingEvents.slice(-3),
        video_events: videoEvents.slice(-4),
        suggested_owner: inferWorkPacketOwner("feedback", signals),
        confidence: item.note || transcriptSnippets.length ? "medium" : "needs_triage"
      }, packets.length, session));
    }
  }

  return packets.slice(0, maxPackets);
}

function normalizeManualWorkPackets(value, session = {}) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry, index) => normalizeManualWorkPacket(entry, index, session))
    .filter((entry) => entry.title || entry.summary || entry.evidence_urls.length || entry.evidence_media.length)
    .slice(0, MAX_WORK_PACKETS);
}

function pushManualQaWorkPacketLines(lines, packets = []) {
  const selectedPackets = (Array.isArray(packets) ? packets : []).slice(0, MAX_WORK_PACKETS);
  if (!selectedPackets.length) return;
  lines.push("## Work Packets", "");
  lines.push("Use these as separate agent or sub-agent tasks. Each packet preserves where the feedback happened and the proof to inspect.", "");
  selectedPackets.forEach((packet, index) => {
    lines.push(`### ${index + 1}. ${packet.title || "Work packet"}`);
    lines.push(`- Packet ID: ${packet.packet_id}`);
    lines.push(`- Suggested owner: ${packet.suggested_owner || "full_stack"}`);
    if (packet.page_anchor?.url) lines.push(`- Page: ${packet.page_anchor.url}`);
    if (packet.page_anchor?.bounds) {
      const bounds = packet.page_anchor.bounds;
      lines.push(`- Drawn area: ${bounds.width || "?"}x${bounds.height || "?"} at ${bounds.x || 0},${bounds.y || 0}`);
    }
    if (packet.summary) lines.push(`- Summary: ${packet.summary}`);
    if (packet.transcript_snippets?.length) {
      lines.push(`- Speech: ${packet.transcript_snippets.slice(0, 3).join(" | ")}`);
    }
    if (packet.evidence_urls?.length) {
      lines.push(`- Evidence URLs: ${packet.evidence_urls.slice(0, 4).join(", ")}`);
    }
    if (packet.evidence_media?.length) {
      lines.push(`- Media: ${packet.evidence_media.map((entry) => entry.label || entry.kind || "evidence").slice(0, 4).join(", ")}`);
    }
    if (packet.technical_signals?.length) {
      lines.push(`- Technical signals: ${packet.technical_signals.map((entry) => entry.message || entry.url || entry.type).filter(Boolean).slice(0, 4).join(" | ")}`);
    }
    lines.push(`- Agent task: ${packet.agent_task}`);
    if (packet.user_question) lines.push(`- Ask user: ${packet.user_question}`);
    lines.push("");
  });
}

function pushProcessedEvidenceDigestLines(lines, items = []) {
  const selectedItems = (Array.isArray(items) ? items : []).filter(itemHasProcessedEvidence);
  if (!selectedItems.length) {
    return;
  }

  lines.push("## Processed Evidence Digest", "");
  lines.push("This groups notes, speech transcript, drawings, media, and page context into agent-readable signals.", "");

  for (const item of selectedItems) {
    const signals = itemWidgetSignals(item);
    const drawingEvents = signals.evidenceEvents.filter((entry) => /drawing|annotation/i.test(`${entry.type || ""} ${entry.label || ""}`));
    const videoEvents = signals.evidenceEvents.filter((entry) => /video|recording/i.test(`${entry.type || ""} ${entry.label || ""}`));
    lines.push(`### ${item.title || "Checklist item"}`);

    if (item.note) {
      lines.push(`- Typed note: ${truncateDigestText(item.note, 320)}`);
    }
    if (signals.transcriptEvents.length) {
      lines.push(`- Transcript captured: ${signals.transcriptEvents.length} snippet${signals.transcriptEvents.length === 1 ? "" : "s"}.`);
    } else if (signals.media.some((entry) => formatEvidenceMediaKind(entry).includes("recording"))) {
      lines.push("- Transcript captured: not available yet; inspect the linked recording media.");
    }
    if (drawingEvents.length) {
      lines.push(`- Drawing context: ${drawingEvents.length} drawing/annotation event${drawingEvents.length === 1 ? "" : "s"} captured.`);
    }
    if (videoEvents.length) {
      lines.push(`- Recording timeline: ${videoEvents.length} video event${videoEvents.length === 1 ? "" : "s"} captured.`);
    }
    if (signals.pageErrors.length || signals.consoleFindings.length || signals.networkFindings.length) {
      const parts = [
        signals.pageErrors.length ? `${signals.pageErrors.length} page error${signals.pageErrors.length === 1 ? "" : "s"}` : "",
        signals.consoleFindings.length ? `${signals.consoleFindings.length} console warning/error${signals.consoleFindings.length === 1 ? "" : "s"}` : "",
        signals.networkFindings.length ? `${signals.networkFindings.length} network failure${signals.networkFindings.length === 1 ? "" : "s"}` : ""
      ].filter(Boolean);
      lines.push(`- Technical context: ${parts.join(", ")}.`);
    }

    if (signals.transcriptEvents.length) {
      lines.push("- Transcript snippets:");
      for (const entry of signals.transcriptEvents.slice(-6)) {
        lines.push(`  - ${formatTranscriptSnippet(entry)}`);
      }
    }

    if (drawingEvents.length) {
      lines.push("- Drawings with nearby speech:");
      for (const entry of drawingEvents.slice(-6)) {
        const time = formatDigestTime(eventTimestamp(entry));
        const bounds = entry.bounds
          ? `, area ${entry.bounds.width || "?"}x${entry.bounds.height || "?"} at ${entry.bounds.x || 0},${entry.bounds.y || 0}`
          : "";
        const strokes = entry.stroke_count ? `, ${entry.stroke_count} stroke${entry.stroke_count === 1 ? "" : "s"}` : "";
        lines.push(`  - ${time ? `${time}: ` : ""}${evidenceEventTitle(entry)}${strokes}${bounds}${entry.media_url ? ` (${entry.media_url})` : ""}`);
        const nearby = findNearbyTranscript(signals.transcriptEvents, entry);
        for (const transcript of nearby) {
          lines.push(`    - Nearby speech: ${formatTranscriptSnippet(transcript)}`);
        }
      }
    }

    const timelineEvents = signals.evidenceEvents
      .filter((entry) => !/drawing|annotation/i.test(`${entry.type || ""} ${entry.label || ""}`))
      .slice(-10);
    if (timelineEvents.length) {
      lines.push("- Evidence timeline:");
      for (const entry of timelineEvents) {
        const time = formatDigestTime(eventTimestamp(entry));
        const duration = formatDurationMs(entry.duration_ms);
        lines.push(`  - ${time ? `${time}: ` : ""}${evidenceEventTitle(entry)}${duration ? ` (${duration})` : ""}${entry.media_url ? `: ${entry.media_url}` : ""}`);
      }
    }

    if (!item.note && !signals.transcriptEvents.length && !drawingEvents.length && signals.media.length) {
      lines.push("- Agent hint: raw media exists, but no note/transcript/drawing timeline was captured for this item.");
    }
    lines.push("");
  }
}

function isNetworkFailureEvent(entry = {}) {
  const status = Number(entry.status);
  if (Number.isFinite(status) && status > 0) {
    return status >= 400;
  }
  return Boolean(entry.message);
}

function normalizePlanItem(rawItem, index, input = {}) {
  const item = isPlainObject(rawItem) ? rawItem : { title: rawItem };
  const targetUrl = normalizeUrl(input.target_url || input.targetUrl || input.url) || "";
  const title =
    sanitizeString(item.title || item.name || item.label || item.task || item.check, 180) ||
    `Manual check ${index + 1}`;
  const instructions =
    sanitizeString(item.instructions || item.description || item.task || item.check || item.notes, 1600) ||
    title;
  const expected =
    sanitizeOptionalString(item.expected || item.expected_success || item.success || item.assertion, 1200) || null;
  const startUrl = coerceStartUrl(item.start_url || item.startUrl || item.url || item.path || input.entry_path, targetUrl);

  return {
    id: sanitizeString(item.id, 80) || `item_${index + 1}`,
    title,
    instructions,
    expected,
    start_url: startUrl || null,
    area: sanitizeOptionalString(item.area || item.surface || item.page, 180) || null,
    source: sanitizeOptionalString(item.source, 80) || "agent_plan",
    status: normalizeItemStatus(item.status),
    note: sanitizeOptionalString(item.note || item.feedback, 4000) || null,
    evidence_urls: normalizeStringList(item.evidence_urls || item.evidenceUrls || item.evidence, 12, 4096).map(redactSensitiveUrl),
    evidence_media: normalizeEvidenceMediaList(item.evidence_media || item.evidenceMedia),
    widget_context: normalizeWidgetContext(item.widget_context || item.widgetContext),
    created_at: sanitizeOptionalString(item.created_at || item.createdAt, 128) || null,
    reviewed_at: sanitizeOptionalString(item.reviewed_at || item.reviewedAt, 128) || null
  };
}

function pushGeneratedItem(items, input, title, instructions, expected, source) {
  if (items.length >= MAX_CHECKLIST_ITEMS) {
    return;
  }
  items.push(
    normalizePlanItem(
      {
        title,
        instructions,
        expected,
        source,
        start_url: input.entry_path || input.target_url || input.targetUrl || input.url
      },
      items.length,
      input
    )
  );
}

function extractExplicitPlan(input = {}) {
  const candidates = [
    input.test_plan,
    input.testPlan,
    input.manual_test_plan,
    input.manualTestPlan,
    input.checklist_items,
    input.checklistItems
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length) {
      return candidate;
    }
  }
  return [];
}

function buildManualQaChecklist(input = {}) {
  const reviewMode = normalizeManualReviewMode(input);
  if (reviewMode === "freestyle") {
    return [
      normalizePlanItem(
        {
          id: "freestyle",
          title: sanitizeString(input.freestyle_title || input.freestyleTitle || input.title, 180) || "Freestyle review",
          instructions:
            sanitizeString(input.freestyle_prompt || input.freestylePrompt, 1600) ||
            "Record the screen, talk through what you notice, draw on the page when useful, and move through the product freely.",
          expected:
            sanitizeOptionalString(input.expected_success || input.expectedSuccess, 1200) ||
            "The recording, drawings, notes, visited pages, console, network, and page errors are captured for the developer.",
          source: "freestyle",
          start_url: input.entry_path || input.target_url || input.targetUrl || input.url
        },
        0,
        input
      )
    ];
  }

  const explicitPlan = extractExplicitPlan(input);
  const items = explicitPlan
    .slice(0, MAX_CHECKLIST_ITEMS)
    .map((item, index) => normalizePlanItem(item, index, input));

  if (items.length) {
    return items.map((item, index) => ({ ...item, id: item.id || `item_${index + 1}` }));
  }

  const workSummary = sanitizeString(input.work_summary || input.workSummary || input.change_summary || input.changeSummary, 2400);
  const featureName = sanitizeString(input.feature_name || input.featureName || input.title, 180) || "changed experience";
  const acceptanceCriteria = normalizeStringList(input.acceptance_criteria || input.acceptanceCriteria, 12, 800);
  const scenarioList = normalizeStringList(input.scenario_list || input.scenarioList || input.scenarios, 12, 900);
  const changedFiles = normalizeStringList(input.changed_files || input.changedFiles, 20, 320);

  pushGeneratedItem(
    items,
    input,
    `Open ${featureName} from the correct start point`,
    "Open the supplied preview URL and confirm the changed surface is reachable before judging any details.",
    "The page loads and the user can start the intended flow.",
    "baseline"
  );

  for (const scenario of scenarioList) {
    pushGeneratedItem(items, input, scenario.slice(0, 180), scenario, null, "scenario");
  }

  for (const criterion of acceptanceCriteria) {
    pushGeneratedItem(
      items,
      input,
      criterion.slice(0, 180),
      `Validate this acceptance criterion: ${criterion}`,
      criterion,
      "acceptance_criteria"
    );
  }

  const summaryLines = normalizeStringList(workSummary, 6, 500);
  for (const line of summaryLines) {
    pushGeneratedItem(items, input, line.slice(0, 180), `Check the shipped change: ${line}`, line, "work_summary");
  }

  if (changedFiles.length) {
    pushGeneratedItem(
      items,
      input,
      "Check the touched surfaces for regressions",
      `The coding agent changed: ${changedFiles.join(", ")}. Walk the affected flow and note any visible mismatch, broken state, or missing behavior.`,
      "Touched files do not introduce visible regressions in the target flow.",
      "changed_files"
    );
  }

  if (!items.length) {
    pushGeneratedItem(
      items,
      input,
      "Run a manual smoke test",
      "Open the preview, follow the primary user path, and mark what passes, fails, or feels confusing.",
      "The core path works without obvious blockers.",
      "fallback"
    );
  }

  return items.slice(0, MAX_CHECKLIST_ITEMS).map((item, index) => ({
    ...item,
    id: `item_${index + 1}`
  }));
}

function resetManualQaItemForNewSession(item, now) {
  return {
    ...item,
    status: "pending",
    note: null,
    evidence_urls: [],
    evidence_media: [],
    widget_context: normalizeWidgetContext(null),
    created_at: now,
    reviewed_at: null
  };
}

function summarizeManualSessionStatus(items = []) {
  const counts = {
    pending: 0,
    reviewed: 0,
    pass: 0,
    fail: 0,
    confusing: 0,
    blocked: 0,
    skip: 0
  };
  for (const item of Array.isArray(items) ? items : []) {
    const status = normalizeItemStatus(item?.status);
    counts[status] += 1;
  }
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const reviewed = total - counts.pending;
  const status =
    total > 0 && counts.pending === 0
      ? "manual_completed"
      : reviewed > 0
        ? "manual_in_progress"
        : "manual_ready";

  return {
    status,
    total,
    reviewed,
    counts
  };
}

function buildBrowserState(targetUrl, existingArtifacts = {}) {
  const liveArtifacts = buildLiveStreamArtifacts(existingArtifacts);
  const viewerUrl = sanitizeOptionalString(liveArtifacts.live_stream_viewer_url, 4096) || null;
  const embedUrl = sanitizeOptionalString(liveArtifacts.live_stream_embed_url, 4096) || viewerUrl;
  const hasRemoteFallback = Boolean(viewerUrl || embedUrl);
  return {
    mode: "local_browser_sidecar",
    status: hasRemoteFallback ? "viewer_ready" : "local_sidecar_ready",
    target_url: normalizeUrl(targetUrl) || sanitizeOptionalString(targetUrl, 4096) || null,
    viewer_url: viewerUrl,
    embed_url: embedUrl,
    remote_fallback_ready: hasRemoteFallback,
    view_only: liveArtifacts.live_stream_view_only !== false,
    live_stream_enabled: liveArtifacts.live_stream_enabled === true,
    public_base_url: sanitizeOptionalString(liveArtifacts.live_stream_public_base_url, 4096) || null,
    note:
      hasRemoteFallback
        ? "Primary review uses the agent-injected page widget on the tester's own browser. Advanced recording tools unlock after the widget is verified."
        : "Primary review uses the agent-injected page widget on the tester's own browser."
  };
}

function buildManualQaSessionPayload(input = {}, context = {}) {
  const targetUrl = normalizeUrl(input.target_url || input.targetUrl || input.url);
  if (!targetUrl) {
    return { ok: false, status: 400, error: "target_url must be a valid http or https URL" };
  }

  const now = new Date().toISOString();
  const sessionId = buildManualSessionId(input);
  const brandKey = deriveBrandKey(input);
  const reviewMode = normalizeManualReviewMode(input);
  const agentActionMode = normalizeAgentActionMode(input, "fix_and_retest");
  const checklist = buildManualQaChecklist({
    ...input,
    target_url: targetUrl
  }).map((item) => resetManualQaItemForNewSession(item, now));
  const summary = summarizeManualSessionStatus(checklist);
  const browser = buildBrowserState(targetUrl, input.artifacts);
  const publicBaseUrl = sanitizeString(context.publicBaseUrl, 4096).replace(/\/$/, "");
  const widgetToken = sanitizeString(input.widget_token || input.widgetToken, 512) || createWidgetToken();
  const uiParams = new URLSearchParams({
    panel: "manual_qa",
    session_id: sessionId,
    brand: brandKey
  });
  const sessionUrl = publicBaseUrl ? `${publicBaseUrl}/dashboard?${uiParams.toString()}` : null;

  const session = {
    session_id: sessionId,
    title:
      sanitizeString(input.title || input.feature_name || input.featureName, 180) ||
      "Manual QA session",
    target_url: targetUrl,
    review_mode: reviewMode,
    brand_key: brandKey,
    brand_name: sanitizeOptionalString(input.brand_name || input.brandName || input.brand, 180) || null,
    status: summary.status,
    counts: summary.counts,
    created_at: now,
    updated_at: now,
    completed_at: null,
    session_url: sessionUrl,
    browser,
    widget: {
      enabled: true,
      mode: "in_page_overlay",
      status: "install_required",
      installed: false,
      token_hash: hashWidgetToken(widgetToken),
      created_at: now,
      note:
        reviewMode === "freestyle"
          ? "Agent-injected page widget for freestyle screen recording, drawing, notes, and page context capture."
          : "Agent-injected page widget for drawing, recording, checklist updates, and page context capture."
    },
    checklist,
    context: {
      work_summary: sanitizeOptionalString(input.work_summary || input.workSummary || input.change_summary || input.changeSummary, 4000) || null,
      feature_name: sanitizeOptionalString(input.feature_name || input.featureName, 180) || null,
      acceptance_criteria: normalizeStringList(input.acceptance_criteria || input.acceptanceCriteria, 24, 900),
      scenario_list: normalizeStringList(input.scenario_list || input.scenarioList || input.scenarios, 24, 1000),
      changed_files: normalizeStringList(input.changed_files || input.changedFiles, 60, 400),
      repository: sanitizeOptionalString(input.repository || input.repo, 500) || null,
      branch: sanitizeOptionalString(input.branch, 240) || null,
      commit_sha: sanitizeOptionalString(input.commit_sha || input.commitSha, 120) || null,
      pull_request_url: sanitizeOptionalString(input.pull_request_url || input.pullRequestUrl, 4096) || null,
      developer_notes: sanitizeOptionalString(input.developer_notes || input.developerNotes, 4000) || null,
      review_mode: reviewMode,
      agent_action_mode: agentActionMode,
      feedback_action: feedbackActionForAgentMode(agentActionMode),
      auto_start_work: shouldAutoStartWorkForAgentMode(agentActionMode)
    },
    requested_by: {
      owner_user_id: sanitizeOptionalString(context.ownerUserId || input.owner_user_id || input.ownerUserId, 128) || null,
      owner_email: sanitizeOptionalString(context.ownerEmail || input.owner_email || input.ownerEmail, 320) || null,
      launched_by: sanitizeOptionalString(context.launchedBy, 80) || "dashboard_user"
    }
  };

  return {
    ok: true,
    session,
    summary,
    liveArtifacts: buildLiveStreamArtifacts(input.artifacts),
    widgetToken,
    widgetInstall: buildManualWidgetInstall(session, widgetToken, publicBaseUrl)
  };
}

function buildManualQaRow(session, liveArtifacts = {}) {
  return {
    run_id: session.session_id,
    target: extractTargetLabel(session.target_url),
    status: session.status,
    report_url: session.session_url || null,
    findings: [],
    summary: JSON.stringify({
      note: "Manual QA session is ready for a human tester.",
      counts: session.counts || {}
    }),
    source: MANUAL_QA_SOURCE,
    delivered_at: session.updated_at || session.created_at || new Date().toISOString(),
    payload: {
      schema_version: MANUAL_QA_SCHEMA_VERSION,
      brand: session.brand_key || null,
      owner_user_id: session.requested_by?.owner_user_id || null,
      owner_email: session.requested_by?.owner_email || null,
      manual_qa: session,
      artifacts: liveArtifacts
    }
  };
}

function normalizeManualQaSessionRow(row) {
  const payload = isPlainObject(row?.payload) ? row.payload : {};
  const manual = isPlainObject(payload.manual_qa) ? payload.manual_qa : {};
  const checklist = Array.isArray(manual.checklist)
    ? manual.checklist.map((item, index) => normalizePlanItem(item, index, manual))
    : [];
  const summary = summarizeManualSessionStatus(checklist);
  const targetUrl = normalizeUrl(manual.target_url || row?.target) || sanitizeOptionalString(manual.target_url || row?.target, 4096) || null;
  const browser = isPlainObject(manual.browser)
    ? {
        ...buildBrowserState(targetUrl || "", payload.artifacts),
        ...manual.browser
      }
    : buildBrowserState(targetUrl || "", payload.artifacts);
  const rawWidget = isPlainObject(manual.widget) ? manual.widget : {};
  const widgetInstalled = rawWidget.installed === true;

  const session = {
    session_id: sanitizeString(manual.session_id || row?.run_id, 128),
    title: sanitizeString(manual.title, 180) || "Manual QA session",
    target_url: targetUrl,
    review_mode: normalizeManualReviewMode(manual),
    brand_key: sanitizeString(manual.brand_key || extractBrandKey(row), 256),
    brand_name: sanitizeOptionalString(manual.brand_name, 180) || null,
    status: sanitizeString(manual.status || row?.status || summary.status, 80) || summary.status,
    counts: isPlainObject(manual.counts) ? manual.counts : summary.counts,
    created_at: sanitizeOptionalString(manual.created_at || row?.created_at || row?.delivered_at, 128) || null,
    updated_at: sanitizeOptionalString(manual.updated_at || row?.updated_at || row?.delivered_at, 128) || null,
    completed_at: sanitizeOptionalString(manual.completed_at, 128) || null,
    session_url: sanitizeOptionalString(manual.session_url || row?.report_url, 4096) || null,
    browser,
    widget: {
      enabled: rawWidget.enabled !== false,
      mode: sanitizeOptionalString(rawWidget.mode, 80) || "in_page_overlay",
      status:
        rawWidget.enabled === false
          ? "disabled"
          : widgetInstalled
            ? "installed"
            : rawWidget.token_hash
              ? "install_required"
              : "not_configured",
      installed: widgetInstalled,
      installed_at: sanitizeOptionalString(rawWidget.installed_at || rawWidget.installedAt, 128) || null,
      last_seen_at: sanitizeOptionalString(rawWidget.last_seen_at || rawWidget.lastSeenAt, 128) || null,
      note:
        sanitizeOptionalString(rawWidget.note, 500) ||
        "Agent can inject the BeforeUsersDo widget into the preview page."
    },
    checklist,
    agent_feedback: normalizeManualAgentFeedback(manual.agent_feedback || manual.agentFeedback),
    preview_proposal: normalizeManualPreviewProposal(manual.preview_proposal || manual.previewProposal),
    post_fix_reviews: normalizeManualPostFixReviews(manual.post_fix_reviews || manual.postFixReviews),
    context: isPlainObject(manual.context) ? manual.context : {},
    requested_by: isPlainObject(manual.requested_by)
      ? manual.requested_by
      : {
          owner_user_id: extractOwnerUserId(row),
          owner_email: extractOwnerEmail(row)
        }
  };
  const storedPackets = normalizeManualWorkPackets(manual.work_packets || manual.workPackets, session);
  return {
    ...session,
    work_packets: storedPackets.length ? storedPackets : buildManualQaWorkPackets(session)
  };
}

function assertManualAccess(row, options = {}) {
  if (options.widgetAccessOk === true) {
    return { ok: true };
  }
  const access = resolveQaReportReadAccess(row, {
    authOk: options.authOk === true || Boolean(options.ownerUserId || options.owner_user_id),
    ownerUserId: options.ownerUserId || options.owner_user_id,
    shareKey: options.shareKey || options.share_key,
    request: options.request || options.req
  });
  if (!access.ok) {
    return {
      ok: false,
      status: access.status || 401,
      error: access.error || "Manual QA session not found"
    };
  }
  return { ok: true };
}

async function verifyManualQaWidgetToken(sessionId, token, options = {}) {
  const loaded = await loadStoredReportByRunId(sessionId, options);
  if (!loaded.ok) {
    return loaded;
  }
  if (sanitizeString(loaded.row?.source, 80) !== MANUAL_QA_SOURCE) {
    return {
      ok: false,
      status: 404,
      error: "Manual QA session not found"
    };
  }
  const payload = isPlainObject(loaded.row?.payload) ? loaded.row.payload : {};
  const manual = isPlainObject(payload.manual_qa) ? payload.manual_qa : {};
  const widget = isPlainObject(manual.widget) ? manual.widget : {};
  if (widget.enabled === false || !compareWidgetTokenHash(token, widget.token_hash)) {
    return {
      ok: false,
      status: 401,
      error: "Widget token is invalid"
    };
  }
  return {
    ok: true,
    status: 200,
    row: loaded.row,
    session: normalizeManualQaSessionRow(loaded.row)
  };
}

async function getManualQaWidgetSession(sessionId, token, options = {}) {
  const verified = await verifyManualQaWidgetToken(sessionId, token, options);
  if (!verified.ok) {
    return verified;
  }
  return markManualQaWidgetInstalled(verified, options);
}

async function markManualQaWidgetInstalled(verified, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const payload = isPlainObject(verified.row?.payload) ? verified.row.payload : {};
  const manual = isPlainObject(payload.manual_qa) ? payload.manual_qa : {};
  const widget = isPlainObject(manual.widget) ? manual.widget : {};
  const now = new Date().toISOString();
  const nextManual = {
    ...manual,
    updated_at: now,
    widget: {
      ...widget,
      status: "installed",
      installed: true,
      installed_at: sanitizeOptionalString(widget.installed_at || widget.installedAt, 128) || now,
      last_seen_at: now
    }
  };
  const nextPayload = {
    ...payload,
    schema_version: MANUAL_QA_SCHEMA_VERSION,
    manual_qa: nextManual
  };
  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_reports`);
  requestUrl.searchParams.set("run_id", `eq.${sanitizeString(nextManual.session_id || verified.session?.session_id, 128)}`);
  const response = await access.fetchImpl(requestUrl.toString(), {
    method: "PATCH",
    headers: buildSupabaseHeaders(access.serviceKey),
    body: JSON.stringify({
      delivered_at: now,
      payload: nextPayload
    })
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: data?.message || "Failed to mark widget installed",
      data
    };
  }

  const savedRow = Array.isArray(data) && data[0] ? data[0] : { ...verified.row, delivered_at: now, payload: nextPayload };
  return {
    ok: true,
    status: 200,
    session: normalizeManualQaSessionRow(savedRow)
  };
}

async function updateManualQaWidgetItem(sessionId, token, itemId, patch = {}, options = {}) {
  const verified = await verifyManualQaWidgetToken(sessionId, token, options);
  if (!verified.ok) {
    return verified;
  }
  return updateManualQaItem(sessionId, itemId, patch, {
    ...options,
    widgetAccessOk: true
  });
}

async function recordManualQaAgentFeedback(verified, feedback = {}, options = {}) {
  if (!verified?.ok || !verified.row) {
    return {
      ok: false,
      status: 401,
      error: "Widget token is invalid"
    };
  }
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const payload = isPlainObject(verified.row?.payload) ? verified.row.payload : {};
  const manual = isPlainObject(payload.manual_qa) ? payload.manual_qa : {};
  const session = normalizeManualQaSessionRow(verified.row);
  const now = new Date().toISOString();
  const currentFeedback = normalizeManualAgentFeedback(manual.agent_feedback || manual.agentFeedback);
  let nextPackage = normalizeManualAgentFeedbackPackage({
    ...feedback,
    created_at: feedback.created_at || feedback.createdAt || now,
    generated_at: feedback.generated_at || feedback.generatedAt || now,
    media_count: feedback.media_count ?? feedback.mediaCount ?? countManualEvidenceMedia(session)
  });
  if (!nextPackage.markdown) {
    return {
      ok: false,
      status: 400,
      error: "feedback markdown is required"
    };
  }
  const feedbackItemId = sanitizeString(nextPackage.item_id, 80);
  const nextChecklist = (session.checklist || []).map((item) => {
    const shouldMarkReviewed =
      item.status === "pending" &&
      (nextPackage.scope === "all" || (nextPackage.scope === "item" && item.id === feedbackItemId));
    return shouldMarkReviewed
      ? {
          ...item,
          status: "reviewed",
          reviewed_at: item.reviewed_at || now
        }
      : item;
  });
  const nextSummary = summarizeManualSessionStatus(nextChecklist);
  const nextManualBase = {
    ...manual,
    ...session,
    checklist: nextChecklist,
    status: nextSummary.status,
    counts: nextSummary.counts,
    updated_at: now,
    work_packets: buildManualQaWorkPackets({
      ...session,
      checklist: nextChecklist,
      status: nextSummary.status,
      counts: nextSummary.counts
    })
  };
  nextPackage = {
    ...nextPackage,
    markdown: buildManualQaAgentFeedbackMarkdown(nextManualBase, {
      item_id: nextPackage.scope === "item" ? nextPackage.item_id : "",
      feedback_action: nextPackage.feedback_action,
      agent_action_mode: nextPackage.agent_action_mode,
      auto_start_work: nextPackage.auto_start_work
    })
  };

  const packages = [
    ...currentFeedback.packages.filter((entry) => entry.feedback_id !== nextPackage.feedback_id),
    nextPackage
  ].slice(-MAX_AGENT_FEEDBACK_PACKAGES);
  const nextAgentFeedback = {
    ready: true,
    latest: nextPackage,
    packages
  };
  const nextManual = {
    ...nextManualBase,
    agent_feedback: nextAgentFeedback
  };
  const nextPayload = {
    ...payload,
    schema_version: MANUAL_QA_SCHEMA_VERSION,
    manual_qa: nextManual
  };
  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_reports`);
  requestUrl.searchParams.set("run_id", `eq.${sanitizeString(session.session_id || verified.row?.run_id, 128)}`);
  const response = await access.fetchImpl(requestUrl.toString(), {
    method: "PATCH",
    headers: buildSupabaseHeaders(access.serviceKey),
    body: JSON.stringify({
      delivered_at: now,
      payload: nextPayload
    })
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: data?.message || "Failed to record manual QA feedback",
      data
    };
  }

  const savedRow = Array.isArray(data) && data[0] ? data[0] : { ...verified.row, delivered_at: now, payload: nextPayload };
  return {
    ok: true,
    status: 200,
    feedback: nextPackage,
    session: normalizeManualQaSessionRow(savedRow)
  };
}

async function recordManualQaPreviewProposal(sessionOrVerified, proposal = {}, options = {}) {
  let loaded = null;
  if (sessionOrVerified?.ok && sessionOrVerified.row) {
    loaded = sessionOrVerified;
  } else {
    const sessionId = sanitizeString(sessionOrVerified?.session_id || sessionOrVerified?.sessionId || sessionOrVerified, 128);
    loaded = await loadManualQaSessionRow(sessionId, options);
  }
  if (!loaded?.ok || !loaded.row) {
    return loaded?.ok === false
      ? loaded
      : {
          ok: false,
          status: 404,
          error: "Manual QA session not found"
        };
  }

  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const payload = isPlainObject(loaded.row?.payload) ? loaded.row.payload : {};
  const manual = isPlainObject(payload.manual_qa) ? payload.manual_qa : {};
  const session = normalizeManualQaSessionRow(loaded.row);
  const existingProposal = normalizeManualPreviewProposal(manual.preview_proposal || manual.previewProposal);
  const source = isPlainObject(proposal) ? proposal : {};
  const now = new Date().toISOString();
  const requestedStatus = source.status !== undefined ? normalizePreviewProposalStatus(source.status, existingProposal?.status || "draft") : "";
  const hasProposalContent = Boolean(
    sanitizeString(source.title || source.headline || source.summary || source.description || source.rationale || source.preview, 3000) ||
      sanitizeString(source.visual_preview_url || source.visualPreviewUrl || source.preview_url || source.previewUrl || source.image_url || source.imageUrl, 4096) ||
      normalizeStringList(source.changes || source.change_list || source.changeList || source.items || source.fix_points || source.fixPoints, 1, 500).length ||
      normalizeStringList(source.expected_behavior || source.expectedBehavior || source.behavior_trace || source.behaviorTrace || source.trace, 1, 500).length ||
      normalizeStringList(source.open_questions || source.openQuestions || source.questions, 1, 500).length
  );

  if (!existingProposal && !hasProposalContent) {
    return {
      ok: false,
      status: 400,
      error: "preview proposal content is required"
    };
  }

  const responseStatus = requestedStatus && requestedStatus !== "draft" ? requestedStatus : "";
  const nextProposal = normalizeManualPreviewProposal({
    ...(existingProposal || {}),
    ...source,
    proposal_id: existingProposal?.proposal_id || source.proposal_id || source.proposalId || source.id,
    created_at: existingProposal?.created_at || source.created_at || source.createdAt || now,
    updated_at: now,
    status: requestedStatus || source.status || existingProposal?.status || "draft",
    response_note:
      source.response_note !== undefined || source.responseNote !== undefined || source.note !== undefined
        ? source.response_note || source.responseNote || source.note
        : existingProposal?.response_note || null,
    responded_at:
      responseStatus
        ? now
        : source.responded_at || source.respondedAt || existingProposal?.responded_at || null
  });

  const nextManual = {
    ...manual,
    updated_at: now,
    preview_proposal: nextProposal
  };
  const nextPayload = {
    ...payload,
    schema_version: MANUAL_QA_SCHEMA_VERSION,
    manual_qa: nextManual
  };
  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_reports`);
  requestUrl.searchParams.set("run_id", `eq.${sanitizeString(session.session_id || loaded.row?.run_id, 128)}`);
  const response = await access.fetchImpl(requestUrl.toString(), {
    method: "PATCH",
    headers: buildSupabaseHeaders(access.serviceKey),
    body: JSON.stringify({
      delivered_at: now,
      payload: nextPayload
    })
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: data?.message || "Failed to record preview proposal",
      data
    };
  }

  const savedRow = Array.isArray(data) && data[0] ? data[0] : { ...loaded.row, delivered_at: now, payload: nextPayload };
  return {
    ok: true,
    status: 200,
    proposal: normalizeManualQaSessionRow(savedRow).preview_proposal,
    session: normalizeManualQaSessionRow(savedRow)
  };
}

async function recordManualQaPostFixReview(sessionOrVerified, review = {}, options = {}) {
  let loaded = null;
  if (sessionOrVerified?.ok && sessionOrVerified.row) {
    loaded = sessionOrVerified;
  } else {
    const sessionId = sanitizeString(sessionOrVerified?.session_id || sessionOrVerified?.sessionId || sessionOrVerified, 128);
    loaded = await loadManualQaSessionRow(sessionId, options);
  }
  if (!loaded?.ok || !loaded.row) {
    return loaded?.ok === false
      ? loaded
      : {
          ok: false,
          status: 404,
          error: "Manual QA session not found"
        };
  }

  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const nextReview = normalizeManualPostFixReview(review);
  if (!nextReview) {
    return {
      ok: false,
      status: 400,
      error: "post-fix review content is required"
    };
  }

  const payload = isPlainObject(loaded.row?.payload) ? loaded.row.payload : {};
  const manual = isPlainObject(payload.manual_qa) ? payload.manual_qa : {};
  const session = normalizeManualQaSessionRow(loaded.row);
  const existing = normalizeManualPostFixReviews(manual.post_fix_reviews || manual.postFixReviews);
  const now = new Date().toISOString();
  const reviews = [
    ...existing.reviews.filter((entry) => entry.review_id !== nextReview.review_id),
    nextReview
  ].slice(-MAX_POST_FIX_REVIEWS);
  const nextPostFixReviews = {
    ready: true,
    may_mark_done: nextReview.may_mark_done === true,
    latest: nextReview,
    reviews
  };
  const nextManual = {
    ...manual,
    ...session,
    updated_at: now,
    post_fix_reviews: nextPostFixReviews
  };
  const nextPayload = {
    ...payload,
    schema_version: MANUAL_QA_SCHEMA_VERSION,
    manual_qa: nextManual
  };
  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_reports`);
  requestUrl.searchParams.set("run_id", `eq.${sanitizeString(session.session_id || loaded.row?.run_id, 128)}`);
  const response = await access.fetchImpl(requestUrl.toString(), {
    method: "PATCH",
    headers: buildSupabaseHeaders(access.serviceKey),
    body: JSON.stringify({
      delivered_at: now,
      payload: nextPayload
    })
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: data?.message || "Failed to record post-fix review",
      data
    };
  }

  const savedRow = Array.isArray(data) && data[0] ? data[0] : { ...loaded.row, delivered_at: now, payload: nextPayload };
  return {
    ok: true,
    status: 200,
    post_fix_review: normalizeManualQaSessionRow(savedRow).post_fix_reviews.latest,
    may_mark_done: normalizeManualQaSessionRow(savedRow).post_fix_reviews.may_mark_done,
    session: normalizeManualQaSessionRow(savedRow)
  };
}

async function createManualQaSession(input = {}, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const built = buildManualQaSessionPayload(input, options);
  if (!built.ok) {
    return built;
  }

  const row = buildManualQaRow(built.session, built.liveArtifacts);
  const response = await access.fetchImpl(`${access.supabaseUrl}/rest/v1/swarmtest_reports?on_conflict=run_id`, {
    method: "POST",
    headers: buildSupabaseHeaders(access.serviceKey, "resolution=merge-duplicates,return=representation"),
    body: JSON.stringify([row])
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: data?.message || "Failed to create manual QA session",
      data
    };
  }

  const savedRow = Array.isArray(data) && data[0] ? data[0] : row;
  return {
    ok: true,
    status: 201,
    session: normalizeManualQaSessionRow(savedRow),
    widget_install: built.widgetInstall,
    row: savedRow
  };
}

async function loadManualQaSessionRow(sessionId, options = {}) {
  const loaded = await loadStoredReportByRunId(sessionId, options);
  if (!loaded.ok) {
    return loaded;
  }
  if (sanitizeString(loaded.row?.source, 80) !== MANUAL_QA_SOURCE) {
    return {
      ok: false,
      status: 404,
      error: "Manual QA session not found"
    };
  }
  const access = assertManualAccess(loaded.row, options);
  if (!access.ok) {
    return access;
  }
  return loaded;
}

async function getManualQaSession(sessionId, options = {}) {
  const loaded = await loadManualQaSessionRow(sessionId, options);
  if (!loaded.ok) {
    return loaded;
  }
  return {
    ok: true,
    status: 200,
    session: normalizeManualQaSessionRow(loaded.row),
    row: loaded.row
  };
}

async function listManualQaSessions(options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const limit = Math.max(1, Math.min(100, Number(options.limit || 40) || 40));
  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_reports`);
  requestUrl.searchParams.set("select", "*");
  requestUrl.searchParams.set("source", `eq.${MANUAL_QA_SOURCE}`);
  requestUrl.searchParams.set("order", "delivered_at.desc");
  requestUrl.searchParams.set("limit", String(limit));

  const response = await access.fetchImpl(requestUrl.toString(), {
    headers: buildSupabaseHeaders(access.serviceKey, "return=minimal")
  });

  let rows = [];
  try {
    rows = await response.json();
  } catch {
    rows = [];
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: rows?.message || "Failed to list manual QA sessions",
      data: rows
    };
  }

  const ownerUserId = sanitizeString(options.ownerUserId || options.owner_user_id, 128);
  const filtered = (Array.isArray(rows) ? rows : []).filter((row) => {
    if (!ownerUserId) {
      return true;
    }
    return extractOwnerUserId(row) === ownerUserId;
  });

  return {
    ok: true,
    status: 200,
    items: filtered.map(normalizeManualQaSessionRow)
  };
}

function resolveManualQaTopicSegmenterConfig(options = {}) {
  const explicitEnabled = sanitizeString(
    options.topicSegmenterEnabled ?? options.topic_segmenter_enabled ?? process.env.MANUAL_QA_TOPIC_SEGMENTER_ENABLED,
    20
  ).toLowerCase();
  const apiKey = sanitizeString(
    options.topicSegmenterApiKey ||
      options.topic_segmenter_api_key ||
      process.env.MANUAL_QA_TOPIC_SEGMENTER_API_KEY ||
      process.env.QA_TOPIC_SEGMENTER_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.QA_OPENAI_API_KEY ||
      process.env.OPENROUTER_API_KEY,
    4096
  );
  const openRouterDefault = Boolean(process.env.OPENROUTER_API_KEY && !process.env.OPENAI_API_KEY && !process.env.QA_OPENAI_API_KEY);
  const baseUrl = sanitizeString(
    options.topicSegmenterBaseUrl ||
      options.topic_segmenter_base_url ||
      process.env.MANUAL_QA_TOPIC_SEGMENTER_BASE_URL ||
      process.env.QA_TOPIC_SEGMENTER_BASE_URL ||
      process.env.OPENAI_BASE_URL ||
      (openRouterDefault ? "https://openrouter.ai/api/v1" : "https://api.openai.com/v1"),
    4096
  ).replace(/\/$/, "");
  const model = sanitizeString(
    options.topicSegmenterModel ||
      options.topic_segmenter_model ||
      process.env.MANUAL_QA_TOPIC_SEGMENTER_MODEL ||
      process.env.QA_TOPIC_SEGMENTER_MODEL ||
      (openRouterDefault ? "openai/gpt-4.1-mini" : "gpt-4.1-mini"),
    256
  );
  return {
    enabled: explicitEnabled === "0" || explicitEnabled === "false" ? false : Boolean(options.topicSegmenter || apiKey),
    apiKey,
    baseUrl,
    model,
    timeoutMs: Math.max(1000, Math.min(30000, Number(options.topicSegmenterTimeoutMs || process.env.MANUAL_QA_TOPIC_SEGMENTER_TIMEOUT_MS) || 12000)),
    fetchImpl: options.fetchImpl || globalThis.fetch
  };
}

function buildTopicSegmenterInput(item = {}) {
  const context = normalizeWidgetContext(item.widget_context);
  const transcriptEvents = context.transcript_events.map((entry, index) => ({
    index,
    text: entry.text,
    at: entry.at || entry.ended_at || entry.started_at || null,
    page_url: entry.page_url || context.page_url || null,
    page_title: entry.page_title || context.page_title || null
  }));
  return {
    item_id: item.id || null,
    item_title: item.title || null,
    page: {
      url: context.page_url || item.start_url || null,
      title: context.page_title || null
    },
    transcript_events: transcriptEvents,
    evidence_events: context.evidence_events.slice(-20).map((entry) => ({
      type: entry.type,
      label: entry.label,
      at: entry.at || entry.ended_at || entry.started_at || null,
      page_url: entry.page_url || context.page_url || null,
      bounds: entry.bounds || null
    })),
    page_visits: context.page_visits.slice(-12),
    existing_topic_segments: context.topic_segments || []
  };
}

function normalizeLlmTopicSegments(value, transcriptEvents = []) {
  const source = Array.isArray(value?.topic_segments)
    ? value.topic_segments
    : Array.isArray(value?.topicSegments)
      ? value.topicSegments
      : Array.isArray(value)
        ? value
        : [];
  const maxTranscriptIndex = Math.max(0, transcriptEvents.length - 1);
  const normalized = source.slice(0, MAX_TOPIC_SEGMENTS).map((entry, index) => {
    const item = isPlainObject(entry) ? entry : {};
    const startIndex = Math.max(0, Math.min(maxTranscriptIndex, Number(item.start_index ?? item.startIndex ?? item.transcript_start_index ?? item.transcriptStartIndex) || 0));
    const rawEndIndex = Number(item.end_index ?? item.endIndex ?? item.transcript_end_index ?? item.transcriptEndIndex);
    const endIndex = Math.max(startIndex, Math.min(maxTranscriptIndex, Number.isFinite(rawEndIndex) ? rawEndIndex : startIndex));
    const startEvent = transcriptEvents[startIndex] || {};
    const endEvent = transcriptEvents[endIndex] || startEvent;
    return {
      segment_id: item.segment_id || item.segmentId || item.id || `topic_${index + 1}`,
      title: item.title || firstUsefulSentence(item.summary || startEvent.text || `Topic ${index + 1}`, 120),
      summary: item.summary || item.description || "",
      transcript_start_index: startIndex,
      transcript_end_index: endIndex,
      started_at: startEvent.at || startEvent.ended_at || startEvent.started_at || null,
      ended_at: endEvent.at || endEvent.ended_at || endEvent.started_at || null,
      page_url: item.page_url || item.pageUrl || startEvent.page_url || null,
      page_title: item.page_title || item.pageTitle || startEvent.page_title || null,
      confidence: item.confidence,
      source: "llm",
      updated_at: new Date().toISOString()
    };
  });
  return normalizeTopicSegmentList(normalized);
}

function parseTopicSegmenterJson(raw) {
  const text = sanitizeString(raw, 20000);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

async function requestLlmTopicSegments(input, config) {
  if (!config.enabled || !config.apiKey || !config.baseUrl || !config.model || typeof config.fetchImpl !== "function") {
    return [];
  }
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), config.timeoutMs) : null;
  try {
    const response = await config.fetchImpl(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      signal: controller?.signal,
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You segment streaming manual QA transcript into semantic work topics. Do not use fixed phrase triggers. Decide topic boundaries from meaning, page context, drawings, and evidence events. Return compact JSON only."
          },
          {
            role: "user",
            content:
              "Return JSON with topic_segments. Each segment needs title, summary, start_index, end_index, confidence. " +
              "Keep contiguous transcript ranges. Split only when the user's focus meaningfully changes. Merge chatter into the nearest relevant topic.\n\n" +
              JSON.stringify(input)
          }
        ]
      })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return [];
    }
    const content = payload?.choices?.[0]?.message?.content || "";
    return normalizeLlmTopicSegments(parseTopicSegmenterJson(content), input.transcript_events || []);
  } catch {
    return [];
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function buildManualQaTopicSegmentsForItem(item = {}, options = {}) {
  const context = normalizeWidgetContext(item.widget_context);
  const transcriptEvents = context.transcript_events || [];
  if (!transcriptEvents.length) {
    return context.topic_segments || [];
  }
  const input = buildTopicSegmenterInput({ ...item, widget_context: context });
  if (typeof options.topicSegmenter === "function") {
    const result = await options.topicSegmenter(input);
    const customSegments = normalizeLlmTopicSegments(result, input.transcript_events || []);
    return customSegments.length ? customSegments : context.topic_segments || [];
  }
  const segments = await requestLlmTopicSegments(input, resolveManualQaTopicSegmenterConfig(options));
  return segments.length ? segments : context.topic_segments || [];
}

async function maybeEnrichManualQaChecklistTopics(checklist = [], itemId = "", options = {}) {
  if (!itemId) return checklist;
  return Promise.all(checklist.map(async (item) => {
    if (item.id !== itemId) return item;
    const context = normalizeWidgetContext(item.widget_context);
    const topicSegments = await buildManualQaTopicSegmentsForItem(item, options);
    return {
      ...item,
      widget_context: {
        ...context,
        topic_segments: topicSegments
      }
    };
  }));
}

async function updateManualQaItem(sessionId, itemId, patch = {}, options = {}) {
  const loaded = await loadManualQaSessionRow(sessionId, options);
  if (!loaded.ok) {
    return loaded;
  }

  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const existingPayload = isPlainObject(loaded.row.payload) ? loaded.row.payload : {};
  const existingManual = isPlainObject(existingPayload.manual_qa) ? existingPayload.manual_qa : {};
  const existingWidget = isPlainObject(existingManual.widget) ? existingManual.widget : {};
  const session = normalizeManualQaSessionRow(loaded.row);
  const safeItemId = sanitizeString(itemId, 80);
  const now = new Date().toISOString();
  let found = false;
  let nextChecklist = session.checklist.map((item) => {
    if (item.id !== safeItemId) {
      return item;
    }
    found = true;
    const nextStatus = patch.status !== undefined ? normalizeItemStatus(patch.status) : normalizeItemStatus(item.status);
    const nextEvidenceUrls =
      patch.evidence_urls !== undefined || patch.evidenceUrls !== undefined
        ? normalizeStringList(patch.evidence_urls || patch.evidenceUrls, 12, 4096).map(redactSensitiveUrl)
        : Array.isArray(item.evidence_urls)
          ? item.evidence_urls.map(redactSensitiveUrl)
          : [];
    const nextEvidenceMedia =
      patch.evidence_media !== undefined || patch.evidenceMedia !== undefined
        ? normalizeEvidenceMediaList(patch.evidence_media || patch.evidenceMedia)
        : Array.isArray(item.evidence_media)
          ? normalizeEvidenceMediaList(item.evidence_media)
          : [];
    return {
      ...item,
      status: nextStatus,
      note:
        patch.note !== undefined
          ? sanitizeOptionalString(patch.note, 4000) || null
          : sanitizeOptionalString(item.note, 4000) || null,
      evidence_urls: nextEvidenceUrls,
      evidence_media: nextEvidenceMedia,
      widget_context:
        patch.widget_context !== undefined || patch.widgetContext !== undefined
          ? normalizeWidgetContext(patch.widget_context || patch.widgetContext)
          : normalizeWidgetContext(item.widget_context),
      reviewed_at: nextStatus === "pending" ? null : now
    };
  });

  if (!found) {
    return {
      ok: false,
      status: 404,
      error: "Checklist item not found"
    };
  }

  nextChecklist = await maybeEnrichManualQaChecklistTopics(nextChecklist, safeItemId, options);

  const summary = summarizeManualSessionStatus(nextChecklist);
  const nextSession = {
    ...existingManual,
    ...session,
    status: summary.status,
    counts: summary.counts,
    updated_at: now,
    completed_at: summary.status === "manual_completed" ? now : null,
    widget: {
      ...existingWidget,
      ...session.widget
    },
    checklist: nextChecklist,
    work_packets: buildManualQaWorkPackets({
      ...session,
      checklist: nextChecklist,
      status: summary.status,
      counts: summary.counts
    })
  };
  const payload = {
    ...existingPayload,
    schema_version: MANUAL_QA_SCHEMA_VERSION,
    manual_qa: nextSession
  };
  const body = {
    status: nextSession.status,
    summary: JSON.stringify({
      note:
        summary.status === "manual_completed"
          ? "Manual QA checklist completed."
          : "Manual QA checklist in progress.",
      counts: summary.counts
    }),
    delivered_at: now,
    payload
  };

  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_reports`);
  requestUrl.searchParams.set("run_id", `eq.${session.session_id}`);
  const response = await access.fetchImpl(requestUrl.toString(), {
    method: "PATCH",
    headers: buildSupabaseHeaders(access.serviceKey),
    body: JSON.stringify(body)
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: data?.message || "Failed to update manual QA item",
      data
    };
  }

  const savedRow = Array.isArray(data) && data[0] ? data[0] : { ...loaded.row, ...body };
  return {
    ok: true,
    status: 200,
    session: normalizeManualQaSessionRow(savedRow),
    item: normalizeManualQaSessionRow(savedRow).checklist.find((item) => item.id === safeItemId) || null
  };
}

async function appendManualQaItemEvidence(sessionId, itemId, evidence = {}, options = {}) {
  const loaded = await loadManualQaSessionRow(sessionId, options);
  if (!loaded.ok) {
    return loaded;
  }
  const session = normalizeManualQaSessionRow(loaded.row);
  const item = session.checklist.find((candidate) => candidate.id === sanitizeString(itemId, 80));
  if (!item) {
    return {
      ok: false,
      status: 404,
      error: "Checklist item not found"
    };
  }
  const currentMedia = normalizeEvidenceMediaList(item.evidence_media);
  const currentUrls = Array.isArray(item.evidence_urls) ? item.evidence_urls.map(redactSensitiveUrl) : [];
  const normalizedMedia = normalizeEvidenceMediaList([...currentMedia, evidence]);
  const evidenceUrl = sanitizeOptionalString(evidence.url || evidence.evidence_url || evidence.evidenceUrl, 4096);
  const nextUrls = evidenceUrl ? [...currentUrls, redactSensitiveUrl(evidenceUrl)] : currentUrls;

  return updateManualQaItem(
    sessionId,
    item.id,
    {
      status: item.status,
      note: item.note,
      evidence_urls: nextUrls,
      evidence_media: normalizedMedia,
      widget_context: item.widget_context
    },
    options
  );
}

function buildSafeExportSession(session) {
  const checklist = (session.checklist || []).map((item) => ({
    ...item,
    start_url: redactSensitiveUrl(item.start_url),
    evidence_urls: Array.isArray(item.evidence_urls) ? item.evidence_urls.map(redactSensitiveUrl) : [],
    evidence_media: normalizeEvidenceMediaList(item.evidence_media).map((entry) => ({
      ...entry,
      url: redactSensitiveUrl(entry.url),
      storage_bucket: entry.storage_bucket ? "[stored evidence]" : null,
      storage_path: entry.storage_path ? "[stored evidence]" : null
    })),
    widget_context: normalizeWidgetContext(item.widget_context)
  }));
  const safeBase = {
    ...session,
    checklist
  };
  const storedPackets = normalizeManualWorkPackets(session.work_packets, safeBase);
  return {
    ...session,
    target_url: redactSensitiveUrl(session.target_url),
    session_url: redactSensitiveUrl(session.session_url),
    browser: {
      ...session.browser,
      target_url: redactSensitiveUrl(session.browser?.target_url),
      viewer_url: session.browser?.viewer_url ? "[redacted in export]" : null,
      embed_url: session.browser?.embed_url ? "[redacted in export]" : null,
      public_base_url: session.browser?.public_base_url || null
    },
    widget: session.widget
      ? {
          enabled: session.widget.enabled !== false,
          mode: session.widget.mode || "in_page_overlay",
          status: session.widget.status || "unknown",
          installed: session.widget.installed === true
        }
      : null,
    preview_proposal: normalizeManualPreviewProposal(session.preview_proposal || session.previewProposal),
    checklist,
    work_packets: storedPackets.length ? storedPackets : buildManualQaWorkPackets(safeBase)
  };
}

function resolveManualSessionAgentActionMode(session, fallback = "report_only") {
  const fromContext = normalizeAgentActionMode(session?.context || {}, "");
  if (fromContext) {
    return fromContext;
  }
  const latestFeedback = session?.agent_feedback?.latest || session?.agentFeedback?.latest || {};
  const fromLatestFeedback = normalizeAgentActionMode(latestFeedback, "");
  return fromLatestFeedback || fallback;
}

function pushIndependentPostFixReviewGateLines(lines, mode) {
  if (!["fix_and_retest", "preview_then_fix"].includes(mode)) {
    return;
  }
  lines.push("## Independent Post-Fix Review Gate", "");
  lines.push("- The implementing agent cannot mark this feedback done by itself.");
  lines.push("- After fixes are deployed or refreshed, start a fresh contextless reviewer agent.");
  lines.push("- Give that reviewer only the original feedback package/work packets, changed files or commit, fixed URL, and test/build results.");
  if (mode === "preview_then_fix") {
    lines.push("- Also give the reviewer the approved preview/checklist so it can compare the final result against what the user approved.");
  }
  lines.push("- The reviewer must compare each original feedback point against the fixed result and return: fixed, missed, or still unclear.");
  lines.push("- If the reviewer finds missed or unchanged feedback, continue work instead of marking done.");
  lines.push("- If the reviewer passes, share the reviewer verdict and create a fresh BeforeUsersDo QA link for the user to retest.");
  lines.push("");
}

function buildManualQaReportMarkdown(session) {
  const safe = buildSafeExportSession(session);
  const counts = safe.counts || summarizeManualSessionStatus(safe.checklist).counts;
  const agentActionMode = resolveManualSessionAgentActionMode(safe, "report_only");
  const lines = [
    "# Manual QA Report",
    "",
    `- Session: ${safe.session_id || "n/a"}`,
    `- Title: ${safe.title || "Manual QA session"}`,
    `- Target: ${safe.target_url || "n/a"}`,
    `- Status: ${safe.status || "unknown"}`,
    `- ${safe.review_mode === "freestyle" ? "Freestyle capture" : "Checklist"}: ${counts.reviewed || 0} reviewed, ${counts.pass || 0} pass, ${counts.fail || 0} fail, ${counts.confusing || 0} confusing, ${counts.blocked || 0} blocked, ${counts.pending || 0} pending`,
    safe.session_url ? `- Dashboard: ${safe.session_url}` : "",
    "",
    "## Change Context",
    "",
    safe.context?.work_summary ? safe.context.work_summary : "No change summary was provided.",
    ""
  ].filter((line) => line !== "");

  pushIndependentPostFixReviewGateLines(lines, agentActionMode);

  if (Array.isArray(safe.context?.changed_files) && safe.context.changed_files.length) {
    lines.push("## Changed Files", "");
    for (const file of safe.context.changed_files) {
      lines.push(`- ${file}`);
    }
    lines.push("");
  }

  pushProcessedEvidenceDigestLines(lines, safe.checklist || []);
  pushManualQaWorkPacketLines(lines, safe.work_packets || []);

  lines.push(safe.review_mode === "freestyle" ? "## Freestyle Capture" : "## Checklist", "");
  for (const item of safe.checklist || []) {
    lines.push(`### ${item.status.toUpperCase()} - ${item.title}`);
    if (item.start_url) {
      lines.push(`- Start: ${item.start_url}`);
    }
    if (item.instructions) {
      lines.push(`- Test: ${item.instructions}`);
    }
    if (item.expected) {
      lines.push(`- Expected: ${item.expected}`);
    }
    if (item.note) {
      lines.push(`- Tester note: ${item.note}`);
    }
    if (Array.isArray(item.evidence_urls) && item.evidence_urls.length) {
      lines.push(`- Evidence: ${item.evidence_urls.join(", ")}`);
    }
    pushEvidenceMediaLines(lines, item);
    if (item.widget_context?.page_url) {
      lines.push(`- Page: ${item.widget_context.page_url}`);
    }
    const pageVisits = Array.isArray(item.widget_context?.page_visits) ? item.widget_context.page_visits : [];
    if (pageVisits.length) {
      lines.push(`- Pages visited: ${pageVisits.map((entry) => entry.page_url).filter(Boolean).slice(-8).join(", ")}`);
    }
    const pageErrors = Array.isArray(item.widget_context?.page_errors) ? item.widget_context.page_errors : [];
    if (pageErrors.length) {
      lines.push(`- Page errors: ${pageErrors.map((entry) => entry.message).filter(Boolean).slice(0, 3).join(" | ")}`);
    }
    const consoleErrors = Array.isArray(item.widget_context?.console_events)
      ? item.widget_context.console_events.filter((entry) => ["error", "warn"].includes(String(entry.type || "").toLowerCase()))
      : [];
    if (consoleErrors.length) {
      lines.push(`- Console: ${consoleErrors.map((entry) => entry.message).filter(Boolean).slice(0, 3).join(" | ")}`);
    }
    lines.push("");
  }

  lines.push("## Browser Context", "");
  lines.push(`- Mode: ${safe.browser?.mode || "local_browser_sidecar"}`);
  lines.push(`- Widget: ${safe.widget?.status || "unknown"}`);
  lines.push(`- Viewer status: ${safe.browser?.status || "unknown"}`);
  lines.push("- Remote fallback credentials and sensitive URL parameters are redacted from this export.");
  lines.push("");

  return `${lines.join("\n")}\n`;
}

function pushManualQaItemFeedbackLines(lines, item, index) {
  lines.push(`## ${index + 1}. ${item.title || "Checklist item"}`, "");
  lines.push(`- Status: ${item.status || "pending"}`);
  if (item.start_url) {
    lines.push(`- Start URL: ${item.start_url}`);
  }
  if (item.instructions) {
    lines.push(`- What to test: ${item.instructions}`);
  }
  if (item.expected) {
    lines.push(`- Expected: ${item.expected}`);
  }
  if (item.note) {
    lines.push(`- Tester feedback: ${item.note}`);
  } else {
    lines.push("- Tester feedback: No note entered.");
  }
  if (Array.isArray(item.evidence_urls) && item.evidence_urls.length) {
    lines.push(`- Evidence URLs: ${item.evidence_urls.join(", ")}`);
  }
  pushEvidenceMediaLines(lines, item);
  if (item.widget_context?.page_url) {
    lines.push(`- Page at capture: ${item.widget_context.page_url}`);
  }
  if (item.widget_context?.page_title) {
    lines.push(`- Page title: ${item.widget_context.page_title}`);
  }
  const viewport = item.widget_context?.viewport || {};
  if (viewport.width || viewport.height) {
    lines.push(
      `- Viewport: ${viewport.width || "?"}x${viewport.height || "?"} @ ${viewport.device_pixel_ratio || 1}x`
    );
  }
  const pageErrors = Array.isArray(item.widget_context?.page_errors) ? item.widget_context.page_errors : [];
  if (pageErrors.length) {
    lines.push("- Page errors:");
    for (const entry of pageErrors.slice(-6)) {
      lines.push(`  - ${entry.type || "error"}: ${entry.message || entry.url || "unknown error"}`);
    }
  }
  const consoleEvents = Array.isArray(item.widget_context?.console_events) ? item.widget_context.console_events : [];
  const consoleFindings = consoleEvents
    .filter((entry) => ["error", "warn"].includes(String(entry.type || "").toLowerCase()))
    .slice(-8);
  if (consoleFindings.length) {
    lines.push("- Console warnings/errors:");
    for (const entry of consoleFindings) {
      lines.push(`  - ${entry.type || "console"}: ${entry.message || "empty message"}`);
    }
  }
  const networkEvents = Array.isArray(item.widget_context?.network_events) ? item.widget_context.network_events : [];
  const networkFindings = networkEvents.filter(isNetworkFailureEvent).slice(-8);
  if (networkFindings.length) {
    lines.push("- Network failures:");
    for (const entry of networkFindings) {
      const status = entry.status ? `${entry.status} ` : "";
      const method = entry.method ? `${entry.method} ` : "";
      lines.push(`  - ${method}${status}${entry.url || entry.message || "unknown request"}`);
    }
  }
  const pageVisits = Array.isArray(item.widget_context?.page_visits) ? item.widget_context.page_visits : [];
  if (pageVisits.length) {
    lines.push("- Pages visited:");
    for (const entry of pageVisits.slice(-12)) {
      const title = entry.page_title ? ` (${entry.page_title})` : "";
      lines.push(`  - ${entry.page_url || "unknown page"}${title}`);
    }
  }
  lines.push("");
}

function buildManualQaAgentFeedbackMarkdown(session, options = {}) {
  const safe = buildSafeExportSession(session);
  const itemId = sanitizeString(options.item_id || options.itemId, 80);
  const allItems = Array.isArray(safe.checklist) ? safe.checklist : [];
  const selectedItems = itemId ? allItems.filter((item) => item.id === itemId) : allItems;
  const counts = safe.counts || summarizeManualSessionStatus(allItems).counts;
  const feedbackActionOverride = sanitizeString(
    options.feedback_action || options.feedbackAction || options.feedback_mode || options.feedbackMode,
    80
  );
  const agentActionModeOverride = sanitizeString(options.agent_action_mode || options.agentActionMode, 80);
  const hasAutoStartOverride = options.auto_start_work !== undefined || options.autoStartWork !== undefined;
  const agentActionMode = normalizeAgentActionMode(
    {
      ...(safe.context || {}),
      ...(feedbackActionOverride ? { feedback_action: feedbackActionOverride } : {}),
      ...(agentActionModeOverride ? { agent_action_mode: agentActionModeOverride } : {}),
      ...(hasAutoStartOverride ? { auto_start_work: options.auto_start_work ?? options.autoStartWork } : {})
    },
    "fix_and_retest"
  );
  const lines = [
    "# BeforeUsersDo Manual QA Feedback",
    "",
    `- Scope: ${safe.review_mode === "freestyle" ? "freestyle review" : itemId ? "single checklist item" : "all checklist items"}`,
    `- Session: ${safe.session_id || "n/a"}`,
    `- Title: ${safe.title || "Manual QA session"}`,
    `- Target: ${safe.target_url || "n/a"}`,
    `- Overall status: ${safe.status || "unknown"}`,
    `- Counts: ${counts.reviewed || 0} reviewed, ${counts.pass || 0} pass, ${counts.fail || 0} fail, ${counts.confusing || 0} confusing, ${counts.blocked || 0} blocked, ${counts.pending || 0} pending`,
    safe.session_url ? `- Dashboard/report: ${safe.session_url}` : "",
    "",
    "## Change Context",
    "",
    safe.context?.work_summary || "No change summary was provided.",
    ""
  ].filter((line) => line !== "");

  lines.push("## Required Agent Next Steps", "");
  if (agentActionMode === "fix_and_retest") {
    lines.push("- Mode: share feedback and auto-start work.");
    lines.push("- Treat this feedback as user instructions, not as a passive report.");
    lines.push("- Extract the concrete feedback points from notes, transcript, drawings, screenshots, videos, page context, console, and network evidence.");
    lines.push("- Use the Work Packets section below as task boundaries; keep packet_id in sub-agent work and updates.");
    lines.push("- Fix the target product/code for every actionable bug, copy issue, confusing UI, or requested change.");
    lines.push("- Run the relevant tests/build checks and include what passed or what is blocked.");
    lines.push("- Deploy or refresh the preview/production target the user should retest.");
    lines.push("- Before calling the work done, start a fresh contextless reviewer agent with only this feedback package, the changed files/commit, and the fixed URL.");
    lines.push("- That reviewer must compare the original feedback point-by-point against the fixed result and return: fixed, missed, or still unclear.");
    lines.push("- If the reviewer finds missed or unchanged feedback, continue work instead of marking done.");
    lines.push("- Create a fresh BeforeUsersDo manual QA session/link for the fixed version so old evidence does not carry over.");
    lines.push("- Do not claim the work is done until the fixes are shipped, the independent reviewer passes or remaining misses are named, and the new QA link is ready, unless you clearly state the blocker.");
  } else if (agentActionMode === "preview_then_fix") {
    lines.push("- Mode: preview fix first.");
    lines.push("- Treat this feedback as user instructions, but do not edit code yet.");
    lines.push("- Extract the concrete feedback points from notes, transcript, drawings, screenshots, videos, page context, console, and network evidence.");
    lines.push("- Use the Work Packets section below as task boundaries; keep packet_id in preview proposals and sub-agent work.");
    lines.push("- Produce a proposed future-state preview before implementation: edited screenshot/mockup for UI issues, expected event/API trace for non-UI issues, and a checklist mapping every feedback point to the proposed result.");
    lines.push("- Ask the user to confirm or correct the preview.");
    lines.push("- After confirmation, fix the target product/code, run checks, deploy or refresh, and create a fresh BeforeUsersDo QA session/link for the fixed version.");
    lines.push("- Before calling the work done, start a fresh contextless reviewer agent with only this feedback package, the approved preview/checklist, the changed files/commit, and the fixed URL.");
    lines.push("- If the reviewer finds missed or unchanged feedback, continue work instead of marking done.");
    lines.push("- Do not claim the work is done until the user has approved the preview, the fixes are shipped, the independent reviewer passes or remaining misses are named, and the new QA link is ready, unless you clearly state the blocker.");
  } else {
    lines.push("- Mode: share feedback only.");
    lines.push("- Extract and summarize the concrete feedback points from notes, transcript, drawings, screenshots, videos, page context, console, and network evidence.");
    lines.push("- Use the Work Packets section below as the summary structure when present.");
    lines.push("- Do not edit code, deploy, or create a replacement QA link unless the user explicitly asks you to start work.");
    lines.push("- If the user asks you to start work, switch to report-and-fix behavior: fix, verify, deploy or refresh the target, then create a fresh BeforeUsersDo QA link.");
  }
  lines.push("");

  pushIndependentPostFixReviewGateLines(lines, agentActionMode);

  if (Array.isArray(safe.context?.changed_files) && safe.context.changed_files.length) {
    lines.push("## Changed Files", "");
    for (const file of safe.context.changed_files) {
      lines.push(`- ${file}`);
    }
    lines.push("");
  }

  pushProcessedEvidenceDigestLines(lines, selectedItems);
  const selectedPacketItemIds = new Set(selectedItems.map((item) => item.id).filter(Boolean));
  const selectedPackets = itemId
    ? (safe.work_packets || []).filter((packet) => packet.item_id === itemId)
    : (safe.work_packets || []).filter((packet) => !selectedPacketItemIds.size || !packet.item_id || selectedPacketItemIds.has(packet.item_id));
  pushManualQaWorkPacketLines(lines, selectedPackets);

  if (!selectedItems.length) {
    lines.push("## Checklist", "", "No matching checklist item was found.", "");
  } else {
    selectedItems.forEach((item, index) => pushManualQaItemFeedbackLines(lines, item, index));
  }

  lines.push("## Redaction", "");
  lines.push("- Sensitive URL parameters, remote browser credentials, storage paths, and widget tokens are redacted.");
  lines.push("");

  return `${lines.join("\n")}\n`;
}

async function exportManualQaSession(sessionId, options = {}) {
  const loaded = await getManualQaSession(sessionId, options);
  if (!loaded.ok) {
    return loaded;
  }
  const safeSession = buildSafeExportSession(loaded.session);
  return {
    ok: true,
    status: 200,
    session: safeSession,
    markdown: buildManualQaReportMarkdown(loaded.session)
  };
}

module.exports = {
  MANUAL_QA_SCHEMA_VERSION,
  MANUAL_QA_SOURCE,
  appendManualQaItemEvidence,
  buildManualQaAgentFeedbackMarkdown,
  buildManualWidgetInstall,
  buildManualQaWorkPackets,
  buildManualQaChecklist,
  buildManualQaReportMarkdown,
  buildManualQaSessionPayload,
  buildSafeExportSession,
  buildManualChecklistReviewUrls,
  createManualQaSession,
  exportManualQaSession,
  getManualQaSession,
  getManualQaWidgetSession,
  listManualQaSessions,
  normalizeManualQaSessionRow,
  recordManualQaAgentFeedback,
  recordManualQaPostFixReview,
  recordManualQaPreviewProposal,
  redactSensitiveUrl,
  resolveManualQaDirectReviewUrl,
  summarizeManualSessionStatus,
  updateManualQaItem,
  updateManualQaWidgetItem,
  verifyManualQaWidgetToken,
  __private: {
    compareWidgetTokenHash,
    hashWidgetToken,
    normalizeManualAgentFeedback,
    normalizeManualAgentFeedbackPackage,
    normalizeManualPreviewProposal,
    normalizeManualWorkPacket,
    normalizeManualWorkPackets,
    normalizePreviewProposalStatus,
    normalizeEvidenceMediaList,
    normalizeManualReviewMode,
    normalizeWidgetContext
  }
};
