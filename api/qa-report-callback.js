const crypto = require("crypto");
const {
  isConcreteVideoEvidenceReference,
  sanitizeArtifactsForCallback,
  sanitizeReportMarkdown,
  sanitizeReportForCallback,
  sanitizeRunLogForCallback,
  validateFindingDiagnosticDetails,
  validateReport
} = require("../lib/qa-core");
const {
  createQaAlert,
  getQaScheduleById,
  markQaScheduleReported,
  sendQaAlertWebhook,
  summarizeScheduledAlert
} = require("../lib/qa-schedules");
const { sendQaAlertEmail, sendQaReportReadyEmail } = require("../lib/qa-alert-email");
const { resolveEvidenceRequirements } = require("../lib/qa-evidence-policy");

const ALLOWED_FINDING_TYPES = new Set([
  "bug",
  "frustration_point",
  "confusion_point",
  "aha_moment",
  "dead_end",
  "performance_issue",
  "accessibility_issue",
  "copy_issue",
  "visual_quality_issue"
]);

const ALLOWED_SEVERITIES = new Set(["low", "medium", "high", "critical"]);

const ALLOWED_EMOTIONS = new Set([
  "confidence",
  "uncertainty",
  "frustration",
  "delight",
  "confusion",
  "trust",
  "distrust"
]);

function sanitizeString(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeDataUrl(value, kind = "image", maxLength = kind === "video" ? 8000000 : 2000000) {
  const raw = sanitizeString(value, maxLength);
  if (!raw) {
    return "";
  }
  const prefix = kind === "video" ? "data:video/" : "data:image/";
  return raw.startsWith(prefix) ? raw : "";
}

function sanitizeEvidenceMediaEntries(entries, kind = "image") {
  if (!Array.isArray(entries)) {
    return [];
  }

  const maxItems = kind === "video" ? 64 : 24;
  const sanitized = [];
  const seen = new Set();

  for (const entry of entries) {
    if (!isPlainObject(entry)) {
      continue;
    }

    const source = sanitizeString(entry.source || entry.path || entry.raw, 4096).replaceAll("\\", "/");
    const dataUrl = sanitizeDataUrl(
      entry.data_url || entry.dataUrl || entry.value,
      kind === "video" ? "video" : "image"
    );
    const storageBucket = sanitizeString(
      entry.storage_bucket || entry.storageBucket || entry.bucket,
      128
    );
    const storagePath = sanitizeString(
      entry.storage_path || entry.storagePath || entry.object_path || entry.objectPath,
      4096
    ).replaceAll("\\", "/");
    const aliases = Array.from(
      new Set(
        (Array.isArray(entry.aliases) ? entry.aliases : [])
          .map((value) => sanitizeString(value, 4096).replaceAll("\\", "/"))
          .filter((value) => value && value !== source)
      )
    ).slice(0, 12);
    const segmentIndex = Number(entry.segment_index ?? entry.segmentIndex);
    const segmentCount = Number(entry.segment_count ?? entry.segmentCount);
    const hasSegmentMetadata =
      kind === "video" &&
      Number.isInteger(segmentIndex) &&
      segmentIndex >= 0 &&
      Number.isInteger(segmentCount) &&
      segmentCount > 1 &&
      segmentIndex < segmentCount;
    if (!source || seen.has(source) || (!dataUrl && !(storageBucket && storagePath))) {
      continue;
    }

    seen.add(source);
    sanitized.push({
      source,
      content_type: sanitizeString(entry.content_type || entry.contentType, 128) || null,
      ...(aliases.length ? { aliases } : {}),
      ...(hasSegmentMetadata
        ? {
            segment_index: segmentIndex,
            segment_count: segmentCount,
            segment_label:
              sanitizeString(entry.segment_label || entry.segmentLabel, 128) ||
              `Part ${segmentIndex + 1} of ${segmentCount}`
          }
        : {}),
      ...(dataUrl ? { data_url: dataUrl } : {}),
      ...(storageBucket && storagePath
        ? {
            storage_bucket: storageBucket,
            storage_path: storagePath,
            byte_length:
              typeof entry.byte_length === "number" && Number.isFinite(entry.byte_length)
                ? Math.max(0, Math.round(entry.byte_length))
                : null
          }
        : {})
    });
    if (sanitized.length >= maxItems) {
      break;
    }
  }

  return sanitized;
}

function sanitizeEvidenceMedia(value) {
  if (!isPlainObject(value)) {
    return null;
  }

  const screenshots = sanitizeEvidenceMediaEntries(value.screenshots, "image");
  const videos = sanitizeEvidenceMediaEntries(value.videos, "video");
  if (!screenshots.length && !videos.length) {
    return null;
  }

  return {
    ...(screenshots.length ? { screenshots } : {}),
    ...(videos.length ? { videos } : {})
  };
}

function normalizeEvidenceReference(value) {
  return sanitizeString(value, 4096).replaceAll("\\", "/");
}

function isPortableEvidenceReference(value) {
  const normalized = normalizeEvidenceReference(value);
  if (!normalized) {
    return false;
  }
  return normalized.startsWith("data:") || /^https?:\/\//i.test(normalized);
}

function collectPortableEvidenceEntries(report, artifacts, evidenceMedia, kind = "screenshots") {
  const safeReport = isPlainObject(report) ? report : {};
  const safeArtifacts = isPlainObject(artifacts) ? artifacts : {};
  const safeEvidenceMedia = isPlainObject(evidenceMedia) ? evidenceMedia : {};
  const entries = Array.isArray(safeEvidenceMedia[kind]) ? safeEvidenceMedia[kind] : [];
  const portableSources = new Set(
    entries
      .map((entry) => normalizeEvidenceReference(entry?.source || entry?.path || entry?.raw))
      .filter(Boolean)
  );
  const seen = new Set();
  const collected = [];

  const pushCandidate = (value) => {
    const normalized = normalizeEvidenceReference(value);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    if (kind === "videos" && !isConcreteVideoEvidenceReference(normalized)) {
      return;
    }
    if (!isPortableEvidenceReference(normalized) && !portableSources.has(normalized)) {
      return;
    }
    seen.add(normalized);
    collected.push(normalized);
  };

  const pushCandidates = (values) => {
    if (!Array.isArray(values)) {
      return;
    }
    for (const value of values) {
      pushCandidate(value);
    }
  };

  pushCandidates(safeReport?.evidence_gallery?.[kind]);
  if (Array.isArray(safeReport.findings)) {
    for (const finding of safeReport.findings) {
      pushCandidates(finding?.evidence?.[kind]);
    }
  }
  if (Array.isArray(safeReport.tested_journeys)) {
    for (const journey of safeReport.tested_journeys) {
      pushCandidates(journey?.evidence?.[kind]);
    }
  }

  if (kind === "screenshots") {
    pushCandidates(safeArtifacts.local_screenshots);
  } else {
    pushCandidates([
      safeArtifacts.blocker_clip_url,
      safeArtifacts.local_video_url,
      safeArtifacts.blocker_clip_path,
      safeArtifacts.local_video_path,
      safeArtifacts.video,
      safeArtifacts.browserbase_session_url,
      safeArtifacts.browserbase_debug_url
    ]);
  }

  for (const entry of entries) {
    pushCandidate(entry?.source || entry?.path || entry?.raw);
  }

  return collected;
}

function validateEvidenceCoverage(report, artifacts, evidenceMedia) {
  const hasBrowserbaseEvidence = Boolean(
    artifacts && (artifacts.browserbase_session_url || artifacts.browserbase_debug_url)
  );
  const screenshots = collectPortableEvidenceEntries(report, artifacts, evidenceMedia, "screenshots");
  const videos = collectPortableEvidenceEntries(report, artifacts, evidenceMedia, "videos");
  const { requiredScreenshots, requiredVideos } = resolveEvidenceRequirements({
    hasBrowserbaseEvidence,
    requiredScreenshots: process.env.QA_REQUIRED_SCREENSHOT_COUNT,
    requiredVideos: process.env.QA_REQUIRED_VIDEO_COUNT,
    videoCount: videos.length
  });
  const missing = [];

  if (screenshots.length < requiredScreenshots) {
    missing.push(`at least ${requiredScreenshots} screenshots`);
  }
  if (videos.length < requiredVideos) {
    missing.push(`at least ${requiredVideos} video artifact${requiredVideos === 1 ? "" : "s"}`);
  }

  if (!missing.length) {
    return { ok: true, screenshots, videos };
  }

  return {
    ok: false,
    error: `Evidence capture requirements not met: missing ${missing.join(" and ")}. Received ${screenshots.length} screenshot(s) and ${videos.length} video artifact(s).`
  };
}

function parseTimestamp(value) {
  const raw = sanitizeString(value, 100);
  if (!raw) return new Date().toISOString();
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

function extractToken(req) {
  const auth = String(req.headers.authorization || "").trim();
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }

  return sanitizeString(
    req.headers["x-callback-secret"] || req.headers["x-qa-callback-secret"],
    512
  );
}

function secureCompare(a, b) {
  const aBuffer = Buffer.from(String(a || ""));
  const bBuffer = Buffer.from(String(b || ""));
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function readField(object, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(object, key)) {
      return object[key];
    }
  }
  return undefined;
}

function extractOwnerInfo(body, payloadReport) {
  const sources = [
    body,
    isPlainObject(body?.run_request) ? body.run_request : null,
    isPlainObject(body?.run_request?.metadata) ? body.run_request.metadata : null,
    isPlainObject(body?.metadata) ? body.metadata : null,
    isPlainObject(body?.report_json) ? body.report_json : null,
    isPlainObject(body?.report_json?.metadata) ? body.report_json.metadata : null,
    isPlainObject(payloadReport) ? payloadReport : null,
    isPlainObject(payloadReport?.metadata) ? payloadReport.metadata : null
  ].filter(Boolean);

  let ownerUserId = "";
  let ownerEmail = "";
  for (const source of sources) {
    if (!ownerUserId) {
      ownerUserId = sanitizeString(
        readField(source, ["owner_user_id", "ownerUserId", "user_id", "userId"]),
        128
      );
    }
    if (!ownerEmail) {
      ownerEmail = sanitizeString(readField(source, ["owner_email", "ownerEmail"]), 320).toLowerCase();
    }
    if (ownerUserId && ownerEmail) {
      break;
    }
  }

  return { ownerUserId, ownerEmail };
}

function extractScheduleInfo(body, payloadReport) {
  const sources = [
    body,
    isPlainObject(body?.run_request) ? body.run_request : null,
    isPlainObject(body?.run_request?.metadata) ? body.run_request.metadata : null,
    isPlainObject(body?.metadata) ? body.metadata : null,
    isPlainObject(body?.report_json) ? body.report_json : null,
    isPlainObject(body?.report_json?.metadata) ? body.report_json.metadata : null,
    isPlainObject(payloadReport) ? payloadReport : null,
    isPlainObject(payloadReport?.metadata) ? payloadReport.metadata : null
  ].filter(Boolean);

  let scheduleId = "";
  let scheduleName = "";
  let brandKey = "";
  for (const source of sources) {
    if (!scheduleId) {
      scheduleId = sanitizeString(readField(source, ["qa_schedule_id", "qaScheduleId"]), 128);
    }
    if (!scheduleName) {
      scheduleName = sanitizeString(readField(source, ["qa_schedule_name", "qaScheduleName"]), 160);
    }
    if (!brandKey) {
      brandKey = sanitizeString(readField(source, ["brand_key", "brandKey"]), 256);
    }
    if (scheduleId && scheduleName && brandKey) {
      break;
    }
  }

  return { scheduleId, scheduleName, brandKey };
}

function extractPublicRequestInfo(body, payloadReport) {
  const sources = [
    body,
    isPlainObject(body?.run_request) ? body.run_request : null,
    isPlainObject(body?.run_request?.metadata) ? body.run_request.metadata : null,
    isPlainObject(body?.metadata) ? body.metadata : null,
    isPlainObject(body?.report_json) ? body.report_json : null,
    isPlainObject(body?.report_json?.metadata) ? body.report_json.metadata : null,
    isPlainObject(payloadReport) ? payloadReport : null,
    isPlainObject(payloadReport?.metadata) ? payloadReport.metadata : null
  ].filter(Boolean);

  let email = "";
  let source = "";
  let shareToken = "";
  let brandKey = "";
  let targetUrl = "";

  for (const candidate of sources) {
    if (!email) {
      email = sanitizeString(readField(candidate, ["public_request_email", "publicRequestEmail"]), 320).toLowerCase();
    }
    if (!source) {
      source = sanitizeString(readField(candidate, ["public_request_source", "publicRequestSource"]), 128);
    }
    if (!shareToken) {
      shareToken = sanitizeString(readField(candidate, ["public_request_share_token", "publicRequestShareToken"]), 256);
    }
    if (!brandKey) {
      brandKey = sanitizeString(readField(candidate, ["brand_key", "brandKey"]), 256);
    }
    if (!targetUrl) {
      targetUrl = sanitizeString(readField(candidate, ["target_url", "targetUrl", "target", "url"]), 2048);
    }
    if (email && source && shareToken && brandKey && targetUrl) {
      break;
    }
  }

  return { email, source, shareToken, brandKey, targetUrl };
}

function buildFallbackUiReportUrl(runId, brandKey) {
  const baseUrl = sanitizeString(process.env.QA_PUBLIC_APP_URL || process.env.AUTH_MAGIC_LINK_REDIRECT_BASE_URL, 4096).replace(/\/$/, "");
  const publicBaseUrl = baseUrl || "https://swarmtester.com";
  const params = new URLSearchParams();
  params.set("view", "report");
  params.set("run_id", runId);
  if (brandKey) {
    params.set("brand", brandKey);
  }
  return `${publicBaseUrl}/dashboard?${params.toString()}`;
}

function buildSharedUiReportUrl(runId, brandKey, shareToken) {
  const url = new URL(buildFallbackUiReportUrl(runId, brandKey));
  if (shareToken) {
    url.searchParams.set("share_key", shareToken);
  }
  url.hash = "qa-dashboard";
  return url.toString();
}

function validateFindingsArray(value) {
  if (!Array.isArray(value)) {
    return { ok: false, error: "`findings` must be an array" };
  }

  for (let index = 0; index < value.length; index += 1) {
    const finding = value[index];

    if (!finding || typeof finding !== "object" || Array.isArray(finding)) {
      return { ok: false, error: `findings[${index}] must be an object` };
    }

    const findingId = sanitizeString(readField(finding, ["id"]), 128);
    if (!findingId) {
      return { ok: false, error: `findings[${index}].id is required` };
    }

    const findingType = sanitizeString(readField(finding, ["type"]), 64);
    if (!findingType) {
      return { ok: false, error: `findings[${index}].type is required` };
    }
    if (!ALLOWED_FINDING_TYPES.has(findingType)) {
      return { ok: false, error: `findings[${index}].type is invalid` };
    }

    const severity = sanitizeString(readField(finding, ["severity"]), 32).toLowerCase();
    if (severity && !ALLOWED_SEVERITIES.has(severity)) {
      return { ok: false, error: `findings[${index}].severity is invalid` };
    }

    const expectedBehavior = sanitizeString(
      readField(finding, ["expected_behavior", "expectedBehavior"]),
      4000
    );
    if (!expectedBehavior) {
      return { ok: false, error: `findings[${index}].expected_behavior is required` };
    }

    const observedBehavior = sanitizeString(
      readField(finding, ["observed_behavior", "observedBehavior"]),
      4000
    );
    if (!observedBehavior) {
      return { ok: false, error: `findings[${index}].observed_behavior is required` };
    }

    const page = readField(finding, ["page"]);
    const pageUrl =
      page && typeof page === "object" && !Array.isArray(page)
        ? sanitizeString(readField(page, ["url", "href"]), 4096)
        : "";
    const diagnosticsValidation = validateFindingDiagnosticDetails(
      readField(finding, ["diagnostic_details", "diagnosticDetails", "problem_details", "problemDetails"]),
      `findings[${index}]`,
      { pageUrl }
    );
    if (!diagnosticsValidation.ok) {
      return diagnosticsValidation;
    }

    const emotionalReaction = readField(finding, ["emotional_reaction", "emotionalReaction"]);
    if (!emotionalReaction || typeof emotionalReaction !== "object" || Array.isArray(emotionalReaction)) {
      return { ok: false, error: `findings[${index}].emotional_reaction is required` };
    }

    const primaryEmotion = sanitizeString(
      readField(emotionalReaction, ["primary", "primary_emotion", "primaryEmotion"]),
      64
    ).toLowerCase();
    if (!primaryEmotion) {
      return { ok: false, error: `findings[${index}].emotional_reaction.primary is required` };
    }
    if (!ALLOWED_EMOTIONS.has(primaryEmotion)) {
      return { ok: false, error: `findings[${index}].emotional_reaction.primary is invalid` };
    }

    const intensity = readField(emotionalReaction, ["intensity"]);
    if (intensity !== undefined && intensity !== null) {
      if (typeof intensity !== "number" || Number.isNaN(intensity) || intensity < 1 || intensity > 5) {
        return { ok: false, error: `findings[${index}].emotional_reaction.intensity must be a number between 1 and 5` };
      }
    }

    const signals = readField(emotionalReaction, ["signals"]);
    if (signals !== undefined && signals !== null) {
      if (!Array.isArray(signals)) {
        return { ok: false, error: `findings[${index}].emotional_reaction.signals must be an array` };
      }

      for (let signalIndex = 0; signalIndex < signals.length; signalIndex += 1) {
        const signal = sanitizeString(signals[signalIndex], 120);
        if (!signal) {
          return {
            ok: false,
            error: `findings[${index}].emotional_reaction.signals[${signalIndex}] must be a non-empty string`
          };
        }
      }
    }
  }

  return { ok: true };
}

function validateFailureDiagnosticsForReport(report, fallbackSource = {}) {
  const status = sanitizeString(readField(report, ["status"]), 64).toLowerCase();
  if (!["failed", "failed_validation"].includes(status)) {
    return { ok: true };
  }

  return validateFindingDiagnosticDetails(
    readField(report, ["failure_diagnostics", "failureDiagnostics"]),
    "report.failure_diagnostics",
    {
      pageUrl: sanitizeString(
        readField(report?.metadata || {}, ["target_url", "targetUrl"]) ||
          readField(fallbackSource, ["target_url", "targetUrl", "target"]),
        4096
      )
    }
  );
}

async function parseBody(req) {
  if (req.body !== undefined && req.body !== null && req.body !== "") {
    if (typeof req.body === "string") return JSON.parse(req.body);
    return req.body;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const callbackSecret = sanitizeString(process.env.QA_CALLBACK_SECRET, 512);

  if (!supabaseUrl || !serviceKey || !callbackSecret) {
    return res.status(500).json({ ok: false, error: "Server is not configured" });
  }

  const providedToken = extractToken(req);
  if (!providedToken || !secureCompare(providedToken, callbackSecret)) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  let body;
  try {
    body = await parseBody(req);
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid JSON body" });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({ ok: false, error: "Invalid payload" });
  }

  const runId = sanitizeString(body.run_id || body.runId || body.job_id || body.jobId, 128);
  if (!runId) {
    return res.status(400).json({ ok: false, error: "Missing run_id" });
  }

  const findings = body.findings;
  const findingsValidation = validateFindingsArray(findings);
  if (!findingsValidation.ok) {
    return res.status(400).json({ ok: false, error: findingsValidation.error });
  }

  const payloadReport = sanitizeReportForCallback(isPlainObject(body.report_json) ? body.report_json : body);
  const failureDiagnosticsValidation = validateFailureDiagnosticsForReport(payloadReport, body);
  if (!failureDiagnosticsValidation.ok) {
    return res.status(400).json({ ok: false, error: failureDiagnosticsValidation.error });
  }
  const reportValidation = validateReport(payloadReport);
  if (!reportValidation.ok) {
    return res.status(400).json({ ok: false, error: reportValidation.error });
  }
  const owner = extractOwnerInfo(body, payloadReport);
  if (!owner.ownerUserId) {
    return res.status(400).json({ ok: false, error: "owner_user_id is required" });
  }
  if (!owner.ownerEmail) {
    return res.status(400).json({ ok: false, error: "owner_email is required" });
  }
  const payloadArtifacts = sanitizeArtifactsForCallback(body.artifacts || payloadReport?.artifacts || {});
  const payloadFindings = Array.isArray(payloadReport?.findings) ? payloadReport.findings : [];
  const evidenceMedia = sanitizeEvidenceMedia(body.evidence_media || body.evidenceMedia);
  const evidenceCoverageValidation = validateEvidenceCoverage(payloadReport, payloadArtifacts, evidenceMedia);
  if (!evidenceCoverageValidation.ok) {
    return res.status(400).json({ ok: false, error: evidenceCoverageValidation.error });
  }
  const payload = {
    ...body,
    ...payloadReport,
    owner_user_id: owner.ownerUserId,
    owner_email: owner.ownerEmail,
    findings: payloadFindings,
    report_json: payloadReport,
    report_markdown: sanitizeReportMarkdown(body.report_markdown || body.reportMarkdown, 12000),
    artifacts: payloadArtifacts,
    run_log: sanitizeRunLogForCallback(body.run_log || body.runLog),
    ...(evidenceMedia ? { evidence_media: evidenceMedia } : {}),
    artifact_expires_at:
      sanitizeString(
        body.artifact_expires_at ||
          body.artifactExpiresAt ||
          payloadArtifacts?.artifact_expires_at ||
          payloadReport?.artifacts?.artifact_expires_at,
        128
      ) || null
  };

  const summarySource = body.summary;
  const summary =
    typeof summarySource === "string"
      ? sanitizeString(summarySource, 4000)
      : summarySource && typeof summarySource === "object"
        ? sanitizeString(JSON.stringify(summarySource), 4000)
        : "";

  const forwardedFor = req.headers["x-forwarded-for"];
  const ip = Array.isArray(forwardedFor)
    ? String(forwardedFor[0]).split(",")[0].trim()
    : String(forwardedFor || "").split(",")[0].trim();

  const row = {
    run_id: runId,
    target: sanitizeString(body.target || body.domain || body.app || body.url, 320) || null,
    status: sanitizeString(body.status, 64) || "completed",
    report_url: sanitizeString(body.report_url || body.reportUrl || body.report_link, 2048) || null,
    findings: payloadFindings,
    summary: summary || null,
    source: sanitizeString(body.source, 64) || "qa_bot",
    delivered_at: parseTimestamp(body.delivered_at || body.completed_at || body.finished_at),
    payload,
    request_meta: {
      ip,
      user_agent: sanitizeString(req.headers["user-agent"], 512),
      content_type: sanitizeString(req.headers["content-type"], 128),
      origin: sanitizeString(req.headers.origin || req.headers.referer, 512)
    }
  };

  const response = await fetch(`${supabaseUrl}/rest/v1/swarmtest_reports?on_conflict=run_id`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify([row])
  });

  if (!response.ok) {
    let errorBody = {};
    try {
      errorBody = await response.json();
    } catch {
      // Ignore parse errors.
    }
    return res.status(500).json({
      ok: false,
      error: "Failed to save QA report",
      details: errorBody.message || undefined
    });
  }

  let saved = [];
  try {
    saved = await response.json();
  } catch {
    // Ignore parse errors; success already confirmed.
  }

  const savedRow = Array.isArray(saved) && saved[0] ? saved[0] : row;
  const scheduleInfo = extractScheduleInfo(body, payloadReport);
  const publicRequestInfo = extractPublicRequestInfo(body, payloadReport);
  if (scheduleInfo.scheduleId) {
    const scheduleResult = await getQaScheduleById(scheduleInfo.scheduleId).catch(() => ({ ok: false }));
    const schedule = scheduleResult?.ok ? scheduleResult.item : null;
    const alertSummary = summarizeScheduledAlert(payloadReport, savedRow, schedule || {});
    let alertCreatedAt = null;

    if (schedule && alertSummary.shouldAlert) {
      const alertPayload = {
        owner_user_id: owner.ownerUserId,
        owner_email: owner.ownerEmail,
        schedule_id: schedule.id,
        run_id: runId,
        brand_key: schedule.brand_key || scheduleInfo.brandKey,
        severity: alertSummary.severity,
        title: alertSummary.title,
        message: alertSummary.message,
        report_url:
          sanitizeString(body.report_url || body.reportUrl || savedRow.report_url, 2048) || null,
        ui_report_url:
          sanitizeString(body.ui_report_url || body.uiReportUrl || payloadReport.ui_report_url || payloadReport.uiReportUrl, 2048) ||
          buildFallbackUiReportUrl(runId, schedule.brand_key || scheduleInfo.brandKey),
        payload: {
          reason: alertSummary.reason,
          schedule_name: schedule.name || scheduleInfo.scheduleName || null,
          run_status: sanitizeString(payloadReport.status || savedRow.status, 64) || null
        }
      };
      const created = await createQaAlert(alertPayload, {
        owner_user_id: owner.ownerUserId,
        owner_email: owner.ownerEmail
      }).catch(() => ({ ok: false }));
      if (created?.ok && created.item) {
        alertCreatedAt = created.item.created_at || new Date().toISOString();
        if (schedule.alert_webhook_url) {
          await sendQaAlertWebhook(
            schedule.alert_webhook_url,
            {
              ok: true,
              type: "scheduled_qa_alert",
              schedule: {
                id: schedule.id,
                name: schedule.name,
                brand_key: schedule.brand_key,
                target_url: schedule.target_url
              },
              alert: created.item,
              report: {
                run_id: runId,
                status: sanitizeString(payloadReport.status || savedRow.status, 64) || null,
                summary: payloadReport?.summary?.note || null
              }
            },
            {}
          ).catch(() => null);
        }
        await sendQaAlertEmail(
          {
            schedule,
            alert: created.item,
            report: {
              run_id: runId,
              status: sanitizeString(payloadReport.status || savedRow.status, 64) || null,
              summary: payloadReport?.summary?.note || null
            }
          },
          {}
        ).catch(() => null);
      }
    }

    await markQaScheduleReported(
      scheduleInfo.scheduleId,
      {
        last_report_status: sanitizeString(payloadReport.status || savedRow.status, 64) || null,
        ...(alertCreatedAt ? { last_alert_at: alertCreatedAt } : {})
      },
      {}
    ).catch(() => null);
  }

  if (publicRequestInfo.source === "homepage" && publicRequestInfo.email) {
    const topFindingTitle = Array.isArray(payloadReport?.findings)
      ? sanitizeString(payloadReport.findings[0]?.title, 180)
      : "";
    const shareUrl = buildSharedUiReportUrl(
      runId,
      publicRequestInfo.brandKey || scheduleInfo.brandKey,
      publicRequestInfo.shareToken
    );

    await sendQaReportReadyEmail(
      {
        email: publicRequestInfo.email,
        targetUrl: publicRequestInfo.targetUrl || savedRow.target || "",
        shareUrl,
        report: {
          run_id: runId,
          title: topFindingTitle || sanitizeString(payloadReport?.summary?.note || row.summary, 240) || "Your QA report is ready",
          top_finding_title: topFindingTitle,
          summary: sanitizeString(payloadReport?.summary?.note || row.summary, 2000) || ""
        }
      },
      {}
    ).catch(() => null);
  }

  return res.status(200).json({
    ok: true,
    run_id: runId,
    id: Array.isArray(saved) && saved[0] ? saved[0].id : null
  });
};

module.exports.__private = {
  validateEvidenceCoverage
};
