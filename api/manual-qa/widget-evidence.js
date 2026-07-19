const crypto = require("node:crypto");
const { getPublicBaseUrl, parseRequestBody, sanitizeString } = require("../../lib/qa-core");
const {
  deleteStoredEvidenceObjects,
  hasExpectedVideoContainerSignature,
  measureStoredEvidenceForRun,
  uploadBufferToEvidenceStorage
} = require("../../lib/qa-evidence-storage");
const { createManualQaEventId } = require("../../lib/manual-qa-event-store");
const {
  appendManualQaItemEvidence,
  buildManualQaCaptureSessionView,
  manualQaRecordingUploadsAreLocked,
  reserveManualQaEvidenceUploadBytes,
  verifyManualQaWidgetToken
} = require("../../lib/manual-qa");

const MAX_WIDGET_EVIDENCE_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_SESSION_UPLOAD_BYTES = 384 * 1024 * 1024;
const DEFAULT_MAX_SESSION_STORAGE_BYTES = 768 * 1024 * 1024;
const ALLOWED_CONTENT_PREFIXES = {
  screenshot: ["image/png", "image/jpeg", "image/webp"],
  video: ["video/webm", "video/mp4", "video/quicktime"],
  audio: ["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav"]
};

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-bud-widget-token");
}

function decodeDataUrl(value) {
  const raw = sanitizeString(value, MAX_WIDGET_EVIDENCE_BYTES * 2);
  const match = raw.match(/^data:([^;,]+);base64,(.+)$/i);
  if (!match) {
    return null;
  }
  return {
    contentType: sanitizeString(match[1], 128).toLowerCase(),
    data: Buffer.from(match[2], "base64")
  };
}

function hasAllowedContentType(kind, contentType) {
  const allowed = ALLOWED_CONTENT_PREFIXES[kind] || [];
  return allowed.some((prefix) => contentType === prefix || contentType.startsWith(`${prefix};`));
}

function configuredPositiveNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return null;
}

function maxSessionUploadBytes() {
  return configuredPositiveNumber(
    process.env.QA_WIDGET_MAX_SESSION_UPLOAD_BYTES,
    process.env.QA_WIDGET_MAX_SESSION_RECORDING_BYTES
  ) || DEFAULT_MAX_SESSION_UPLOAD_BYTES;
}

function maxSessionStorageBytes() {
  const configured = configuredPositiveNumber(
    process.env.QA_WIDGET_MAX_SESSION_STORAGE_BYTES,
    process.env.QA_WIDGET_MAX_SESSION_RECORDING_BYTES
  );
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_MAX_SESSION_STORAGE_BYTES;
}

async function bestEffortDeleteStoredEvidence(entries) {
  try {
    await deleteStoredEvidenceObjects(entries);
  } catch {
    // Session quota still bounds abandoned objects if cleanup is temporarily unavailable.
  }
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  let body;
  try {
    body = await parseRequestBody(req);
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid JSON body" });
  }

  const sessionId = sanitizeString(body?.session_id || body?.sessionId, 128);
  const itemId = sanitizeString(body?.item_id || body?.itemId, 80);
  const token = sanitizeString(req.headers?.["x-bud-widget-token"] || body?.token, 512);
  const kind = sanitizeString(body?.kind || body?.type || "screenshot", 32).toLowerCase();
  const evidenceId =
    sanitizeString(
      body?.evidence_id || body?.evidenceId || body?.client_event_id || body?.clientEventId || body?.event_id || body?.eventId,
      160
    ) || createManualQaEventId("evidence");
  const requestedDurationMs = Number(body?.duration_ms ?? body?.durationMs);
  const durationMs = Number.isFinite(requestedDurationMs) && requestedDurationMs > 0
    ? Math.round(requestedDurationMs)
    : null;
  if (!sessionId || !itemId || !token) {
    return res.status(400).json({ ok: false, error: "session_id, item_id, and token are required" });
  }
  if (!Object.prototype.hasOwnProperty.call(ALLOWED_CONTENT_PREFIXES, kind)) {
    return res.status(400).json({ ok: false, error: "kind must be screenshot, video, or audio" });
  }

  const verified = await verifyManualQaWidgetToken(sessionId, token, { request: req });
  if (!verified.ok) {
    return res.status(verified.status || 500).json({ ok: false, error: verified.error });
  }
  const recordingKind = kind === "video" || kind === "audio";
  if (manualQaRecordingUploadsAreLocked(verified.session)) {
    return res.status(409).json({
      ok: false,
      error: "Evidence cannot be changed after the qualification is submitted"
    });
  }

  const decoded = decodeDataUrl(body?.data_url || body?.dataUrl);
  const contentType = sanitizeString(body?.content_type || body?.contentType || decoded?.contentType, 128).toLowerCase();
  if (!decoded?.data?.length || !contentType) {
    return res.status(400).json({ ok: false, error: "data_url is required" });
  }
  if (decoded.data.length > MAX_WIDGET_EVIDENCE_BYTES) {
    return res.status(413).json({ ok: false, error: "Evidence file is too large for direct upload" });
  }
  if (!hasAllowedContentType(kind, contentType)) {
    return res.status(415).json({ ok: false, error: "Unsupported evidence content type" });
  }
  if (kind === "video" && !hasExpectedVideoContainerSignature(decoded.data, contentType)) {
    return res.status(415).json({ ok: false, error: "Recording is not a valid WebM, MP4, or QuickTime file" });
  }

  const limit = maxSessionStorageBytes();
  let usage;
  try {
    usage = await measureStoredEvidenceForRun(sessionId, { stopAfterBytes: limit });
  } catch (error) {
    return res.status(503).json({
      ok: false,
      error: error.message || "Could not verify evidence storage quota"
    });
  }
  if (
    usage &&
    (usage.limit_exceeded === true || Number(usage.byte_length || 0) + decoded.data.length > limit)
  ) {
    return res.status(413).json({
      ok: false,
      error: "This session has reached its evidence storage limit"
    });
  }

  const contentHash = crypto.createHash("sha256").update(decoded.data).digest("hex");
  const reservation = await reserveManualQaEvidenceUploadBytes(
    sessionId,
    `direct:${evidenceId}:${contentHash}`,
    decoded.data.length,
    {
      request: req,
      widgetAccessOk: true,
      maxBytes: maxSessionUploadBytes()
    }
  );
  if (!reservation.ok) {
    return res.status(reservation.status || 500).json({ ok: false, error: reservation.error });
  }

  let uploaded;
  try {
    uploaded = await uploadBufferToEvidenceStorage(decoded.data, {
      runId: sessionId,
      kind: `manual-widget-${kind}`,
      filename: sanitizeString(body?.filename || body?.fileName, 240) || `beforeusersdo-${kind}`,
      contentType
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Could not upload evidence" });
  }
  if (!uploaded) {
    return res.status(500).json({ ok: false, error: "Evidence storage is not configured" });
  }

  const refreshed = await verifyManualQaWidgetToken(sessionId, token, { request: req });
  if (!refreshed.ok || manualQaRecordingUploadsAreLocked(refreshed.session)) {
    await bestEffortDeleteStoredEvidence([uploaded]);
    return res.status(refreshed.ok ? 409 : refreshed.status || 500).json({
      ok: false,
      error: refreshed.ok
        ? "Evidence cannot be changed after the qualification is submitted"
        : refreshed.error
    });
  }

  const evidenceUrl = `${getPublicBaseUrl(req).replace(/\/$/, "")}/api/manual-qa/evidence?session_id=${encodeURIComponent(sessionId)}&item_id=${encodeURIComponent(itemId)}&evidence_id=${encodeURIComponent(evidenceId)}`;
  const appended = await appendManualQaItemEvidence(
    sessionId,
    itemId,
    {
      evidence_id: evidenceId,
      kind,
      label: sanitizeString(body?.label || body?.filename || body?.fileName, 240) || `${kind} evidence`,
      content_type: contentType,
      storage_bucket: uploaded.storage_bucket,
      storage_path: uploaded.storage_path,
      byte_length: uploaded.byte_length,
      duration_ms: durationMs,
      url: evidenceUrl,
      created_at: new Date().toISOString()
    },
    {
      request: req,
      widgetAccessOk: true
    }
  );
  if (!appended.ok) {
    await bestEffortDeleteStoredEvidence([uploaded]);
    return res.status(appended.status || 500).json({ ok: false, error: appended.error, data: appended.data });
  }

  const session = buildManualQaCaptureSessionView(appended.session);
  const item = session.checklist.find((candidate) => candidate.id === itemId) || null;
  return res.status(201).json({
    ok: true,
    evidence_id: evidenceId,
    evidence_url: evidenceUrl,
    evidence: item?.evidence_media?.find((entry) => entry.evidence_id === evidenceId) || null,
    session,
    item
  });
};
