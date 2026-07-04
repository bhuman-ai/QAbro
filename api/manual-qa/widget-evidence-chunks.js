const { getPublicBaseUrl, parseRequestBody, sanitizeString } = require("../../lib/qa-core");
const {
  DEFAULT_EVIDENCE_STORAGE_BUCKET,
  fetchStoredEvidenceObject,
  uploadBufferToEvidenceStorage,
  __private: evidenceStoragePrivate
} = require("../../lib/qa-evidence-storage");
const {
  appendManualQaItemEvidence,
  verifyManualQaWidgetToken
} = require("../../lib/manual-qa");

const MAX_WIDGET_CHUNK_BYTES = 2 * 1024 * 1024;
const MAX_WIDGET_CHUNKS = 1800;
const DEFAULT_MAX_RECORDING_BYTES = 160 * 1024 * 1024;
const ALLOWED_RECORDING_CONTENT_TYPES = {
  video: ["video/webm", "video/mp4", "video/quicktime"],
  audio: ["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav"]
};

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-bud-widget-token");
}

function maxRecordingBytes() {
  const configured = Number(process.env.QA_WIDGET_MAX_RECORDING_BYTES);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_RECORDING_BYTES;
}

function decodeDataUrl(value) {
  const raw = sanitizeString(value, MAX_WIDGET_CHUNK_BYTES * 3);
  const match = raw.match(/^data:([\s\S]*?);base64,([\s\S]+)$/i);
  if (!match) {
    return null;
  }
  return {
    contentType: sanitizeString(match[1], 128).toLowerCase(),
    data: Buffer.from(match[2], "base64")
  };
}

function hasAllowedContentType(kind, contentType) {
  const allowed = ALLOWED_RECORDING_CONTENT_TYPES[kind] || [];
  return allowed.some((prefix) => contentType === prefix || contentType.startsWith(`${prefix};`));
}

function sanitizeUploadId(value) {
  return sanitizeString(value, 80).replace(/[^a-z0-9_-]+/gi, "").slice(0, 80);
}

function normalizeChunkRef(value) {
  const source = value && typeof value === "object" ? value : {};
  const index = Number(source.index ?? source.chunk_index ?? source.chunkIndex);
  const storageBucket = sanitizeString(source.storage_bucket || source.storageBucket || source.bucket, 128);
  const storagePath = sanitizeString(source.storage_path || source.storagePath || source.path, 4096);
  const byteLength = Number(source.byte_length || source.byteLength || source.size || 0);
  return {
    index: Number.isInteger(index) ? index : -1,
    storage_bucket: storageBucket,
    storage_path: storagePath,
    content_type: sanitizeString(source.content_type || source.contentType, 128).toLowerCase(),
    byte_length: Number.isFinite(byteLength) && byteLength > 0 ? byteLength : 0
  };
}

function normalizeChunkRefs(value) {
  const deduped = new Map();
  for (const rawRef of Array.isArray(value) ? value : []) {
    const ref = normalizeChunkRef(rawRef);
    if (ref.index < 0 || !ref.storage_bucket || !ref.storage_path) {
      continue;
    }
    deduped.set(ref.index, ref);
  }
  return Array.from(deduped.values()).sort((a, b) => a.index - b.index).slice(0, MAX_WIDGET_CHUNKS);
}

function chunkRefBelongsToSession(ref, sessionId, kind) {
  const configuredBucket = sanitizeString(process.env.QA_EVIDENCE_STORAGE_BUCKET, 128) || DEFAULT_EVIDENCE_STORAGE_BUCKET;
  const runSegment = evidenceStoragePrivate.sanitizeStoragePathSegment(sessionId, "run");
  const requiredPrefix = `${runSegment}/manual-widget-${kind}-chunks-`;
  return ref.storage_bucket === configuredBucket && ref.storage_path.startsWith(requiredPrefix);
}

async function handleChunk(body, verified, req, res) {
  const sessionId = sanitizeString(body?.session_id || body?.sessionId, 128);
  const uploadId = sanitizeUploadId(body?.upload_id || body?.uploadId);
  const kind = sanitizeString(body?.kind || "video", 32).toLowerCase();
  const chunkIndex = Number(body?.chunk_index ?? body?.chunkIndex);
  if (!uploadId) {
    return res.status(400).json({ ok: false, error: "upload_id is required" });
  }
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= MAX_WIDGET_CHUNKS) {
    return res.status(400).json({ ok: false, error: "chunk_index is invalid" });
  }
  if (!Object.prototype.hasOwnProperty.call(ALLOWED_RECORDING_CONTENT_TYPES, kind)) {
    return res.status(400).json({ ok: false, error: "kind must be video or audio" });
  }

  const decoded = decodeDataUrl(body?.data_url || body?.dataUrl);
  const contentType = sanitizeString(body?.content_type || body?.contentType || decoded?.contentType, 128).toLowerCase();
  if (!decoded?.data?.length || !contentType) {
    return res.status(400).json({ ok: false, error: "data_url is required" });
  }
  if (decoded.data.length > MAX_WIDGET_CHUNK_BYTES) {
    return res.status(413).json({ ok: false, error: "Recording chunk is too large" });
  }
  if (!hasAllowedContentType(kind, contentType)) {
    return res.status(415).json({ ok: false, error: "Unsupported recording content type" });
  }

  let uploaded;
  try {
    uploaded = await uploadBufferToEvidenceStorage(decoded.data, {
      runId: sessionId,
      kind: `manual-widget-${kind}-chunks-${uploadId}`,
      filename: `${String(chunkIndex).padStart(5, "0")}-${sanitizeString(body?.filename || body?.fileName, 160) || "recording.webm"}`,
      contentType
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Could not upload recording chunk" });
  }
  if (!uploaded) {
    return res.status(500).json({ ok: false, error: "Evidence storage is not configured" });
  }

  return res.status(201).json({
    ok: true,
    chunk: {
      index: chunkIndex,
      content_type: contentType,
      storage_bucket: uploaded.storage_bucket,
      storage_path: uploaded.storage_path,
      byte_length: uploaded.byte_length
    },
    session: verified.session
  });
}

async function fetchChunkBuffers(chunkRefs, kind, contentType, maxBytes) {
  const buffers = [];
  let totalBytes = 0;
  for (const chunkRef of chunkRefs) {
    if (chunkRef.byte_length && totalBytes + chunkRef.byte_length > maxBytes) {
      return { ok: false, status: 413, error: "Recording is too large" };
    }
    const stored = await fetchStoredEvidenceObject({
      ...chunkRef,
      content_type: chunkRef.content_type || contentType
    });
    if (!stored?.data?.length) {
      return { ok: false, status: 400, error: "Recording chunk could not be read" };
    }
    const storedContentType = sanitizeString(stored.contentType, 128).toLowerCase();
    if (!hasAllowedContentType(kind, storedContentType)) {
      return { ok: false, status: 415, error: "Unsupported recording chunk content type" };
    }
    totalBytes += stored.data.length;
    if (totalBytes > maxBytes) {
      return { ok: false, status: 413, error: "Recording is too large" };
    }
    buffers.push(stored.data);
  }
  return { ok: true, buffers, totalBytes };
}

async function handleFinish(body, verified, req, res) {
  const sessionId = sanitizeString(body?.session_id || body?.sessionId, 128);
  const itemId = sanitizeString(body?.item_id || body?.itemId, 80);
  const kind = sanitizeString(body?.kind || "video", 32).toLowerCase();
  const contentType = sanitizeString(body?.content_type || body?.contentType || "video/webm", 128).toLowerCase();
  const chunkRefs = normalizeChunkRefs(body?.chunks || body?.chunk_refs || body?.chunkRefs);
  if (!itemId) {
    return res.status(400).json({ ok: false, error: "item_id is required" });
  }
  if (!Object.prototype.hasOwnProperty.call(ALLOWED_RECORDING_CONTENT_TYPES, kind)) {
    return res.status(400).json({ ok: false, error: "kind must be video or audio" });
  }
  if (!hasAllowedContentType(kind, contentType)) {
    return res.status(415).json({ ok: false, error: "Unsupported recording content type" });
  }
  if (!chunkRefs.length) {
    return res.status(400).json({ ok: false, error: "At least one recording chunk is required" });
  }
  if (chunkRefs.length > MAX_WIDGET_CHUNKS) {
    return res.status(413).json({ ok: false, error: "Recording has too many chunks" });
  }
  if (chunkRefs.some((ref) => !chunkRefBelongsToSession(ref, sessionId, kind))) {
    return res.status(400).json({ ok: false, error: "Recording chunks do not belong to this session" });
  }

  const fetched = await fetchChunkBuffers(chunkRefs, kind, contentType, maxRecordingBytes());
  if (!fetched.ok) {
    return res.status(fetched.status || 500).json({ ok: false, error: fetched.error });
  }

  let uploaded;
  try {
    uploaded = await uploadBufferToEvidenceStorage(Buffer.concat(fetched.buffers, fetched.totalBytes), {
      runId: sessionId,
      kind: `manual-widget-${kind}`,
      filename: sanitizeString(body?.filename || body?.fileName, 240) || `beforeusersdo-${kind}.webm`,
      contentType
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Could not assemble recording" });
  }
  if (!uploaded) {
    return res.status(500).json({ ok: false, error: "Evidence storage is not configured" });
  }

  const currentItem = verified.session.checklist.find((item) => item.id === itemId);
  const mediaIndex = Array.isArray(currentItem?.evidence_media) ? currentItem.evidence_media.length : 0;
  const evidenceUrl = `${getPublicBaseUrl(req).replace(/\/$/, "")}/api/manual-qa/evidence?session_id=${encodeURIComponent(sessionId)}&item_id=${encodeURIComponent(itemId)}&index=${mediaIndex}`;
  const appended = await appendManualQaItemEvidence(
    sessionId,
    itemId,
    {
      kind,
      label: sanitizeString(body?.label || body?.filename || body?.fileName, 240) || `${kind} recording`,
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
    evidence_url: evidenceUrl,
    evidence: appended.item?.evidence_media?.[mediaIndex] || null,
    session: appended.session,
    item: appended.item
  });
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
  const token = sanitizeString(req.headers?.["x-bud-widget-token"] || body?.token, 512);
  if (!sessionId || !token) {
    return res.status(400).json({ ok: false, error: "session_id and token are required" });
  }

  const verified = await verifyManualQaWidgetToken(sessionId, token, { request: req });
  if (!verified.ok) {
    return res.status(verified.status || 500).json({ ok: false, error: verified.error });
  }

  const action = sanitizeString(body?.action || "chunk", 32).toLowerCase();
  if (action === "chunk") {
    return handleChunk(body, verified, req, res);
  }
  if (action === "finish") {
    return handleFinish(body, verified, req, res);
  }
  return res.status(400).json({ ok: false, error: "action must be chunk or finish" });
};

module.exports.__private = {
  decodeDataUrl,
  normalizeChunkRefs
};
