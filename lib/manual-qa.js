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
const AGENT_ACTION_MODES = new Set(["report_only", "fix_and_retest"]);

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
  const reviewUrl = resolveManualQaDirectReviewUrl(session);
  return {
    mode: "in_page_overlay",
    script_url: scriptUrl,
    script_tag: `<script async src="${scriptUrl}"></script>`,
    review_url: reviewUrl,
    direct_review_url: reviewUrl,
    checklist_review_urls: buildManualChecklistReviewUrls(session),
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
  return mode === "fix_and_retest" ? "share_feedback_and_start_work" : "share_feedback";
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
    evidence_events: normalizeEvidenceEventList(source.evidence_events || source.evidenceEvents || source.timeline_events || source.timelineEvents)
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
          auto_start_work: agentActionMode === "fix_and_retest"
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
      signals.media.length ||
      signals.pageErrors.length ||
      signals.consoleFindings.length ||
      signals.networkFindings.length
  );
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
      feedback_action: agentActionMode === "fix_and_retest" ? "share_feedback_and_start_work" : "share_feedback",
      auto_start_work: agentActionMode === "fix_and_retest"
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

  return {
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
    context: isPlainObject(manual.context) ? manual.context : {},
    requested_by: isPlainObject(manual.requested_by)
      ? manual.requested_by
      : {
          owner_user_id: extractOwnerUserId(row),
          owner_email: extractOwnerEmail(row)
        }
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
    updated_at: now
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
  const nextChecklist = session.checklist.map((item) => {
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
    checklist: nextChecklist
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
    checklist: (session.checklist || []).map((item) => ({
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
    }))
  };
}

function buildManualQaReportMarkdown(session) {
  const safe = buildSafeExportSession(session);
  const counts = safe.counts || summarizeManualSessionStatus(safe.checklist).counts;
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

  if (Array.isArray(safe.context?.changed_files) && safe.context.changed_files.length) {
    lines.push("## Changed Files", "");
    for (const file of safe.context.changed_files) {
      lines.push(`- ${file}`);
    }
    lines.push("");
  }

  pushProcessedEvidenceDigestLines(lines, safe.checklist || []);

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
    lines.push("- Fix the target product/code for every actionable bug, copy issue, confusing UI, or requested change.");
    lines.push("- Run the relevant tests/build checks and include what passed or what is blocked.");
    lines.push("- Deploy or refresh the preview/production target the user should retest.");
    lines.push("- Create a fresh BeforeUsersDo manual QA session/link for the fixed version so old evidence does not carry over.");
    lines.push("- Do not claim the work is done until the fixes are shipped and the new QA link is ready, unless you clearly state the blocker.");
  } else {
    lines.push("- Mode: share feedback only.");
    lines.push("- Extract and summarize the concrete feedback points from notes, transcript, drawings, screenshots, videos, page context, console, and network evidence.");
    lines.push("- Do not edit code, deploy, or create a replacement QA link unless the user explicitly asks you to start work.");
    lines.push("- If the user asks you to start work, switch to report-and-fix behavior: fix, verify, deploy or refresh the target, then create a fresh BeforeUsersDo QA link.");
  }
  lines.push("");

  if (Array.isArray(safe.context?.changed_files) && safe.context.changed_files.length) {
    lines.push("## Changed Files", "");
    for (const file of safe.context.changed_files) {
      lines.push(`- ${file}`);
    }
    lines.push("");
  }

  pushProcessedEvidenceDigestLines(lines, selectedItems);

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
    normalizeEvidenceMediaList,
    normalizeManualReviewMode,
    normalizeWidgetContext
  }
};
