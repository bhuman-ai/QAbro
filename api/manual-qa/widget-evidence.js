const { getPublicBaseUrl, parseRequestBody, sanitizeString } = require("../../lib/qa-core");
const { uploadBufferToEvidenceStorage } = require("../../lib/qa-evidence-storage");
const { createManualQaEventId } = require("../../lib/manual-qa-event-store");
const {
  appendManualQaItemEvidence,
  verifyManualQaWidgetToken
} = require("../../lib/manual-qa");

const MAX_WIDGET_EVIDENCE_BYTES = 4 * 1024 * 1024;
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
      url: evidenceUrl,
      created_at: new Date().toISOString()
    },
    {
      request: req,
      widgetAccessOk: true
    }
  );
  if (!appended.ok) {
    return res.status(appended.status || 500).json({ ok: false, error: appended.error, data: appended.data });
  }

  return res.status(201).json({
    ok: true,
    evidence_id: evidenceId,
    evidence_url: evidenceUrl,
    evidence:
      appended.item?.evidence_media?.find((entry) => entry.evidence_id === evidenceId) ||
      appended.item?.evidence_media?.find((entry) => entry.storage_path === uploaded.storage_path) ||
      null,
    session: appended.session,
    item: appended.item
  });
};
