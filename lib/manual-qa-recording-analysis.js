const { isPlainObject, sanitizeString } = require("./qa-core");
const { fetchStoredEvidenceObject } = require("./qa-evidence-storage");

const DEFAULT_RECORDING_ANALYZER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_RECORDING_ANALYZER_MODEL = "google/gemini-3.1-flash-lite";
const DEFAULT_RECORDING_AGGREGATOR_MODEL = "openai/gpt-4.1-mini";
const DEFAULT_RECORDING_ANALYZER_TIMEOUT_MS = 60000;
const DEFAULT_RECORDING_ANALYZER_CONCURRENCY = 4;
const DEFAULT_RECORDING_ANALYZER_MAX_NEW_CLIPS = 12;
const DEFAULT_RECORDING_ANALYZER_MAX_CLIP_BYTES = 12 * 1024 * 1024;
const MAX_RECORDINGS = 240;
const MAX_CLIP_DURATION_MS = 60 * 60 * 1000;
const MAX_CLIP_SEGMENTS = 240;
const MAX_FINDINGS = 16;
const MAX_FINDING_ANCHORS = 8;
const FINDING_CATEGORIES = new Set(["bug", "frustration", "aha_moment", "observation"]);
const SUPPORTED_VIDEO_CONTENT_TYPES = new Set(["video/webm", "video/mp4", "video/quicktime"]);
const GENERIC_CONTENT_TYPES = new Set(["", "application/octet-stream", "binary/octet-stream"]);

function optionalString(value, maxLength) {
  return sanitizeString(value, maxLength) || null;
}

function clampNumber(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function normalizeConfidence(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : null;
}

function createRecordingAnalysisError(message, code, retryable = false) {
  const error = new Error(message);
  error.code = code;
  error.retryable = retryable;
  return error;
}

function isMeaningfulEvidenceText(value) {
  const text = sanitizeString(value, 1600);
  if (text.length < 3) return false;
  return (text.match(/[a-z0-9]/gi) || []).length >= 2;
}

function normalizeVideoContentType(value) {
  return sanitizeString(value, 128).toLowerCase().split(";")[0].trim();
}

function inferVideoContentTypeFromPath(value) {
  const storagePath = sanitizeString(value, 4096).toLowerCase().split(/[?#]/)[0];
  if (storagePath.endsWith(".webm")) return "video/webm";
  if (storagePath.endsWith(".mp4")) return "video/mp4";
  if (storagePath.endsWith(".mov")) return "video/quicktime";
  return "";
}

function parseJsonObject(value) {
  if (isPlainObject(value) || Array.isArray(value)) return value;
  const text = sanitizeString(value, 2000000);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {}

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {}
  }

  const firstObject = text.indexOf("{");
  const lastObject = text.lastIndexOf("}");
  if (firstObject >= 0 && lastObject > firstObject) {
    try {
      return JSON.parse(text.slice(firstObject, lastObject + 1));
    } catch {}
  }
  return null;
}

function extractMessageText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((entry) => (typeof entry === "string" ? entry : entry?.text || entry?.content || ""))
    .filter(Boolean)
    .join("\n");
}

function extractRecordingIndex(entry, fallbackIndex = 0) {
  const explicit = Number(entry?.recording_index ?? entry?.recordingIndex ?? entry?.segment_index ?? entry?.segmentIndex);
  if (Number.isFinite(explicit)) {
    return Math.max(1, Math.round(explicit <= 0 ? explicit + 1 : explicit));
  }
  const label = sanitizeString(
    entry?.label || entry?.filename || entry?.file_name || entry?.storage_path || entry?.storagePath,
    4096
  );
  const match = label.match(/(?:segment|part|clip)[-_ ]*0*(\d+)/i);
  if (match) return Math.max(1, Number(match[1]) || 1);
  return fallbackIndex + 1;
}

function isFinalVideoRecording(entry) {
  if (!isPlainObject(entry)) return false;
  const kind = sanitizeString(entry.kind || entry.type, 40).toLowerCase();
  const contentType = normalizeVideoContentType(
    entry.content_type || entry.contentType || entry.mime_type || entry.mimeType
  );
  const storagePath = sanitizeString(entry.storage_path || entry.storagePath || entry.path, 4096).toLowerCase();
  if (/\/(?:chunks?|parts?)\//.test(storagePath) || /(?:^|[-_.])chunk[-_.]?\d+/i.test(storagePath)) return false;
  if (kind && kind !== "video") return false;
  const pathContentType = inferVideoContentTypeFromPath(storagePath);
  if (contentType && !GENERIC_CONTENT_TYPES.has(contentType) && !SUPPORTED_VIDEO_CONTENT_TYPES.has(contentType)) return false;
  if (!SUPPORTED_VIDEO_CONTENT_TYPES.has(contentType) && !pathContentType) return false;
  if (SUPPORTED_VIDEO_CONTENT_TYPES.has(contentType) && pathContentType && contentType !== pathContentType) return false;
  return true;
}

const isFinalWebmRecording = isFinalVideoRecording;

function normalizeRecordingList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry, sourceIndex) => ({ entry, sourceIndex }))
    .filter(({ entry }) => isFinalVideoRecording(entry))
    .map(({ entry, sourceIndex }) => {
      const storagePath = optionalString(entry.storage_path || entry.storagePath || entry.path, 4096);
      const evidenceId = optionalString(
        entry.evidence_id || entry.evidenceId || entry.id || storagePath,
        240
      );
      if (!evidenceId || !storagePath) return null;
      const rawDuration = entry.duration_ms ?? entry.durationMs;
      const duration = rawDuration === null || rawDuration === undefined || rawDuration === ""
        ? null
        : Number(rawDuration);
      const declaredContentType = normalizeVideoContentType(entry.content_type || entry.contentType);
      return {
        item_id: optionalString(entry.item_id || entry.itemId || entry.checklist_item_id || entry.checklistItemId, 160),
        evidence_id: evidenceId,
        recording_index: extractRecordingIndex(entry, sourceIndex),
        duration_ms: Number.isFinite(duration) && duration > 0
          ? Math.round(clampNumber(duration, 1, MAX_CLIP_DURATION_MS, 1))
          : null,
        content_type: SUPPORTED_VIDEO_CONTENT_TYPES.has(declaredContentType)
          ? declaredContentType
          : inferVideoContentTypeFromPath(storagePath),
        storage_bucket: optionalString(entry.storage_bucket || entry.storageBucket || entry.bucket, 128),
        storage_path: storagePath,
        byte_length: Number.isFinite(Number(entry.byte_length || entry.byteLength || entry.size))
          ? Math.max(0, Math.round(Number(entry.byte_length || entry.byteLength || entry.size)))
          : null,
        label: optionalString(entry.label || entry.filename || entry.file_name, 240)
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.recording_index - right.recording_index);
}

function validateRecordingInputSet(value) {
  if (!Array.isArray(value) || !value.length) {
    return { ok: false, recordings: [], mediaCount: 0, errorCode: "recording_missing", error: "No recordings were supplied" };
  }
  if (value.length > MAX_RECORDINGS) {
    return {
      ok: false,
      recordings: [],
      mediaCount: value.length,
      errorCode: "recording_limit_exceeded",
      error: `Recording analysis accepts at most ${MAX_RECORDINGS} recordings`
    };
  }
  const recordings = normalizeRecordingList(value);
  if (recordings.length !== value.length) {
    return {
      ok: false,
      recordings,
      mediaCount: value.length,
      errorCode: "recording_set_invalid",
      error: "Every supplied item must be one final supported recording"
    };
  }
  const evidenceIds = new Set();
  const recordingIndexes = new Set();
  const storagePaths = new Set();
  for (const recording of recordings) {
    if (
      evidenceIds.has(recording.evidence_id) ||
      recordingIndexes.has(recording.recording_index) ||
      storagePaths.has(recording.storage_path)
    ) {
      return {
        ok: false,
        recordings,
        mediaCount: value.length,
        errorCode: "recording_set_invalid",
        error: "Recordings must have unique evidence IDs, indexes, and storage paths"
      };
    }
    evidenceIds.add(recording.evidence_id);
    recordingIndexes.add(recording.recording_index);
    storagePaths.add(recording.storage_path);
  }
  return { ok: true, recordings, mediaCount: recordings.length, errorCode: null, error: null };
}

function readEbmlVint(buffer, offset, stripMarker = true) {
  if (!Buffer.isBuffer(buffer) || offset < 0 || offset >= buffer.length) return null;
  const first = buffer[offset];
  let length = 1;
  let marker = 0x80;
  while (length <= 8 && !(first & marker)) {
    marker >>= 1;
    length += 1;
  }
  if (length > 8 || offset + length > buffer.length) return null;
  const firstValue = stripMarker ? first & (marker - 1) : first;
  const unknown = stripMarker && firstValue === marker - 1 &&
    Array.from(buffer.subarray(offset + 1, offset + length)).every((byte) => byte === 0xff);
  if (unknown) return { length, value: null, unknown: true };
  let value = firstValue;
  for (let index = 1; index < length; index += 1) {
    value = value * 256 + buffer[offset + index];
  }
  return Number.isSafeInteger(value) ? { length, value, unknown: false } : null;
}

function findByteSequence(buffer, sequence, from = 0) {
  return buffer.indexOf(Buffer.from(sequence), Math.max(0, from));
}

function extractWebmDurationMs(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 16) return null;
  let timecodeScale = 1000000;
  const infoAt = findByteSequence(buffer, [0x15, 0x49, 0xa9, 0x66]);
  const infoSize = infoAt >= 0 ? readEbmlVint(buffer, infoAt + 4) : null;
  const infoStart = infoSize ? infoAt + 4 + infoSize.length : -1;
  const firstClusterAt = findByteSequence(buffer, [0x1f, 0x43, 0xb6, 0x75], Math.max(0, infoStart));
  const infoEnd = infoSize
    ? infoSize.unknown
      ? firstClusterAt >= 0 ? firstClusterAt : buffer.length
      : Math.min(buffer.length, infoStart + infoSize.value)
    : -1;
  const scaleAt = infoStart >= 0 ? findByteSequence(buffer, [0x2a, 0xd7, 0xb1], infoStart) : -1;
  if (scaleAt >= infoStart && scaleAt < infoEnd) {
    const size = readEbmlVint(buffer, scaleAt + 3);
    if (
      size &&
      !size.unknown &&
      size.value > 0 &&
      size.value <= 8 &&
      scaleAt + 3 + size.length + size.value <= infoEnd
    ) {
      let value = 0;
      const start = scaleAt + 3 + size.length;
      for (let index = 0; index < size.value; index += 1) value = value * 256 + buffer[start + index];
      if (value > 0) timecodeScale = value;
    }
  }

  const durationAt = infoStart >= 0 ? findByteSequence(buffer, [0x44, 0x89], infoStart) : -1;
  if (durationAt >= infoStart && durationAt < infoEnd) {
    const size = readEbmlVint(buffer, durationAt + 2);
    const start = size ? durationAt + 2 + size.length : -1;
    if (size && !size.unknown && [4, 8].includes(size.value) && start + size.value <= infoEnd) {
      const rawDuration = size.value === 4 ? buffer.readFloatBE(start) : buffer.readDoubleBE(start);
      const durationMs = rawDuration * timecodeScale / 1000000;
      if (Number.isFinite(durationMs) && durationMs > 0 && durationMs <= MAX_CLIP_DURATION_MS) {
        return Math.round(durationMs);
      }
    }
  }

  let maximumTimecode = 0;
  let clusterAt = findByteSequence(buffer, [0x1f, 0x43, 0xb6, 0x75]);
  while (clusterAt >= 0) {
    const clusterSize = readEbmlVint(buffer, clusterAt + 4);
    if (!clusterSize) break;
    const clusterStart = clusterAt + 4 + clusterSize.length;
    const nextClusterAt = findByteSequence(buffer, [0x1f, 0x43, 0xb6, 0x75], clusterStart);
    const clusterEnd = clusterSize.unknown
      ? nextClusterAt >= 0 ? nextClusterAt : buffer.length
      : Math.min(buffer.length, clusterStart + clusterSize.value);
    let clusterTimecode = 0;
    let cursor = clusterStart;
    while (cursor < clusterEnd) {
      const id = readEbmlVint(buffer, cursor, false);
      if (!id) break;
      const size = readEbmlVint(buffer, cursor + id.length);
      if (!size) break;
      const payloadStart = cursor + id.length + size.length;
      const payloadEnd = payloadStart + size.value;
      if (payloadEnd > clusterEnd || payloadEnd <= payloadStart) break;
      if (id.value === 0xe7 && size.value <= 8) {
        let value = 0;
        for (let index = payloadStart; index < payloadEnd; index += 1) value = value * 256 + buffer[index];
        clusterTimecode = value;
      } else if (id.value === 0xa3 && size.value >= 4) {
        const track = readEbmlVint(buffer, payloadStart);
        const timecodeAt = track ? payloadStart + track.length : -1;
        if (timecodeAt >= 0 && timecodeAt + 2 <= payloadEnd) {
          const relativeTimecode = buffer.readInt16BE(timecodeAt);
          maximumTimecode = Math.max(maximumTimecode, clusterTimecode + relativeTimecode);
        }
      }
      cursor = payloadEnd;
    }
    clusterAt = nextClusterAt >= 0
      ? nextClusterAt
      : findByteSequence(buffer, [0x1f, 0x43, 0xb6, 0x75], Math.max(clusterEnd, clusterAt + 4));
  }
  const durationMs = maximumTimecode * timecodeScale / 1000000;
  return Number.isFinite(durationMs) && durationMs > 0
    ? Math.min(MAX_CLIP_DURATION_MS, Math.round(durationMs + 100))
    : null;
}

function readIsoBox(buffer, offset, limit = buffer.length) {
  if (!Buffer.isBuffer(buffer) || offset < 0 || offset + 8 > limit) return null;
  let size = buffer.readUInt32BE(offset);
  const type = buffer.toString("ascii", offset + 4, offset + 8);
  let headerSize = 8;
  if (size === 1) {
    if (offset + 16 > limit) return null;
    const largeSize = buffer.readBigUInt64BE(offset + 8);
    if (largeSize > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    size = Number(largeSize);
    headerSize = 16;
  } else if (size === 0) {
    size = limit - offset;
  }
  if (size < headerSize || offset + size > limit) return null;
  return { type, offset, size, headerSize, payloadStart: offset + headerSize, end: offset + size };
}

function findIsoChildBox(buffer, type, start, end) {
  let cursor = start;
  while (cursor + 8 <= end) {
    const box = readIsoBox(buffer, cursor, end);
    if (!box) return null;
    if (box.type === type) return box;
    cursor = box.end;
  }
  return null;
}

function extractMp4DurationMs(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 32) return null;
  const moov = findIsoChildBox(buffer, "moov", 0, buffer.length);
  if (!moov) return null;
  const mvhd = findIsoChildBox(buffer, "mvhd", moov.payloadStart, moov.end);
  if (!mvhd) return null;
  const payloadStart = mvhd.payloadStart;
  const version = buffer[payloadStart];
  if (version === 1 && payloadStart + 32 <= mvhd.end) {
    const timescale = buffer.readUInt32BE(payloadStart + 20);
    const duration = Number(buffer.readBigUInt64BE(payloadStart + 24));
    const durationMs = timescale > 0 ? duration / timescale * 1000 : 0;
    return Number.isFinite(durationMs) && durationMs > 0 && durationMs <= MAX_CLIP_DURATION_MS
      ? Math.round(durationMs)
      : null;
  }
  if (version !== 0 || payloadStart + 20 > mvhd.end) return null;
  const timescale = buffer.readUInt32BE(payloadStart + 12);
  const duration = buffer.readUInt32BE(payloadStart + 16);
  const durationMs = timescale > 0 ? duration / timescale * 1000 : 0;
  return Number.isFinite(durationMs) && durationMs > 0 && durationMs <= MAX_CLIP_DURATION_MS
    ? Math.round(durationMs)
    : null;
}

function hasExpectedVideoSignature(buffer, contentType) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) return false;
  if (contentType === "video/webm") {
    const hasEbmlSignature = buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
    return hasEbmlSignature && buffer.subarray(0, Math.min(buffer.length, 1024)).includes(Buffer.from("webm", "ascii"));
  }
  if (contentType === "video/mp4" || contentType === "video/quicktime") {
    return buffer.toString("ascii", 4, 8) === "ftyp";
  }
  return false;
}

function resolveEffectiveVideoContentType(media, recording) {
  const storedContentType = normalizeVideoContentType(media?.contentType);
  const declaredContentType = normalizeVideoContentType(recording?.content_type);
  if (storedContentType && !GENERIC_CONTENT_TYPES.has(storedContentType) && !SUPPORTED_VIDEO_CONTENT_TYPES.has(storedContentType)) {
    throw createRecordingAnalysisError("Stored recording has an unsupported MIME type", "unsupported_recording_type", false);
  }
  if (
    SUPPORTED_VIDEO_CONTENT_TYPES.has(storedContentType) &&
    SUPPORTED_VIDEO_CONTENT_TYPES.has(declaredContentType) &&
    storedContentType !== declaredContentType
  ) {
    throw createRecordingAnalysisError("Stored recording MIME type does not match its evidence metadata", "recording_type_mismatch", false);
  }
  const contentType = SUPPORTED_VIDEO_CONTENT_TYPES.has(storedContentType)
    ? storedContentType
    : declaredContentType;
  if (!SUPPORTED_VIDEO_CONTENT_TYPES.has(contentType)) {
    throw createRecordingAnalysisError("Stored recording type could not be verified", "unsupported_recording_type", false);
  }
  return contentType;
}

function resolveTrustedDurationMs(media, recording, contentType) {
  const data = Buffer.isBuffer(media?.data) ? media.data : Buffer.from(media?.data || []);
  const parsed = contentType === "video/webm" ? extractWebmDurationMs(data) : extractMp4DurationMs(data);
  if (Number.isFinite(parsed) && parsed > 0 && parsed <= MAX_CLIP_DURATION_MS) {
    return Math.round(parsed);
  }
  return null;
}

function prepareRecordingMedia(media, recording, config = {}) {
  const data = Buffer.isBuffer(media?.data) ? media.data : Buffer.from(media?.data || []);
  if (!data.length) {
    throw createRecordingAnalysisError("Stored recording could not be loaded", "recording_missing", true);
  }
  const maximumBytes = Math.min(
    DEFAULT_RECORDING_ANALYZER_MAX_CLIP_BYTES,
    Math.max(1, Number(config.maxClipBytes) || DEFAULT_RECORDING_ANALYZER_MAX_CLIP_BYTES)
  );
  if (data.length > maximumBytes) {
    throw createRecordingAnalysisError(
      `Recording exceeds the ${Math.round(maximumBytes / 1024 / 1024)} MiB analysis limit`,
      "recording_too_large",
      false
    );
  }
  const contentType = resolveEffectiveVideoContentType(media, recording);
  if (!hasExpectedVideoSignature(data, contentType)) {
    throw createRecordingAnalysisError(
      "Stored recording bytes do not match the declared video container",
      "recording_signature_invalid",
      false
    );
  }
  const durationMs = resolveTrustedDurationMs({ ...media, data }, recording, contentType);
  if (!durationMs) {
    throw createRecordingAnalysisError(
      "Stored recording duration could not be verified",
      "recording_duration_unavailable",
      false
    );
  }
  return { data, contentType, durationMs };
}

function normalizeTimedSegments(value, durationMs, textKey, maxTextLength) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, MAX_CLIP_SEGMENTS)
    .map((entry) => {
      const source = isPlainObject(entry) ? entry : {};
      const text = optionalString(
        source[textKey] || source.text || source.description || source.transcript,
        maxTextLength
      );
      if (!text) return null;
      const startMs = Math.round(clampNumber(
        source.start_ms ?? source.startMs ?? source.started_at_ms ?? source.startedAtMs,
        0,
        durationMs,
        0
      ));
      const endMs = Math.round(clampNumber(
        source.end_ms ?? source.endMs ?? source.ended_at_ms ?? source.endedAtMs,
        startMs,
        durationMs,
        startMs
      ));
      return { start_ms: startMs, end_ms: endMs, [textKey]: text };
    })
    .filter(Boolean)
    .sort((left, right) => left.start_ms - right.start_ms || left.end_ms - right.end_ms);
}

function validateTimedEventList(value, textKey) {
  if (!Array.isArray(value) || value.length > MAX_CLIP_SEGMENTS) return false;
  return value.every((entry) => {
    if (!isPlainObject(entry)) return false;
    const startMs = entry.start_ms;
    const endMs = entry.end_ms;
    const text = entry[textKey];
    return (
      Number.isFinite(startMs) &&
      Number.isFinite(endMs) &&
      startMs >= 0 &&
      endMs >= startMs &&
      typeof text === "string" &&
      Boolean(text.trim())
    );
  });
}

function canonicalizeTimedEventList(value, textKey) {
  if (!Array.isArray(value)) return value;
  return value.map((entry) => {
    if (!isPlainObject(entry)) return entry;
    const text = textKey === "description"
      ? entry.description || entry.text
      : entry.text || entry.transcript;
    return {
      ...entry,
      start_ms: entry.start_ms ?? entry.startMs ?? entry.started_at_ms ?? entry.startedAtMs,
      end_ms: entry.end_ms ?? entry.endMs ?? entry.ended_at_ms ?? entry.endedAtMs,
      [textKey]: text
    };
  });
}

function validateClipAnalysisPayload(value) {
  const wrapper = isPlainObject(value) ? value : null;
  const raw = isPlainObject(wrapper?.analysis)
    ? wrapper.analysis
    : isPlainObject(wrapper?.clip)
      ? wrapper.clip
      : wrapper;
  if (!isPlainObject(raw)) {
    return { ok: false, value: null, error: "Recording analyzer response must be an object" };
  }
  if (raw.error || (raw.status && raw.status !== "complete")) {
    return { ok: false, value: null, error: optionalString(raw.error, 600) || "Recording analyzer reported failure" };
  }
  const speechSegments = canonicalizeTimedEventList(raw.speech_segments, "text");
  const visualEvents = canonicalizeTimedEventList(raw.visual_events, "description");
  if (!validateTimedEventList(speechSegments, "text")) {
    return { ok: false, value: null, error: "Recording analyzer returned invalid speech_segments" };
  }
  if (!validateTimedEventList(visualEvents, "description")) {
    return { ok: false, value: null, error: "Recording analyzer returned invalid visual_events" };
  }
  if (typeof raw.summary !== "string" || !raw.summary.trim()) {
    return { ok: false, value: null, error: "Recording analyzer returned an invalid summary" };
  }
  if (!Number.isFinite(raw.confidence) || raw.confidence < 0 || raw.confidence > 1) {
    return { ok: false, value: null, error: "Recording analyzer returned invalid confidence" };
  }
  return {
    ok: true,
    value: {
      ...raw,
      speech_segments: speechSegments,
      visual_events: visualEvents
    },
    error: null
  };
}

function buildFailedClipResult(recording, error) {
  const duration = Number(recording.duration_ms);
  return {
    item_id: optionalString(recording.item_id, 160),
    evidence_id: recording.evidence_id,
    recording_index: recording.recording_index,
    status: "failed",
    duration_ms: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 0,
    speech_segments: [],
    visual_events: [],
    summary: null,
    confidence: null,
    error: optionalString(error?.message || error, 600) || "Recording analysis failed",
    error_code: optionalString(error?.code, 120) || "clip_analysis_failed",
    retryable: error?.retryable !== false
  };
}

function normalizeClipAnalysisResult(value, recording = {}, options = {}) {
  const validation = validateClipAnalysisPayload(value);
  if (!validation.ok) {
    return buildFailedClipResult(
      recording,
      createRecordingAnalysisError(validation.error, "clip_response_invalid", true)
    );
  }
  const raw = validation.value;
  const trustedDuration = Number(options.trustedDurationMs ?? recording.duration_ms);
  if (!Number.isFinite(trustedDuration) || trustedDuration <= 0 || trustedDuration > MAX_CLIP_DURATION_MS) {
    return buildFailedClipResult(
      recording,
      createRecordingAnalysisError("Recording duration was not verified", "recording_duration_unavailable", false)
    );
  }
  const durationMs = Math.round(trustedDuration);
  const timedEvents = [...raw.speech_segments, ...raw.visual_events];
  if (timedEvents.some((entry) => entry.start_ms > durationMs || entry.end_ms > durationMs)) {
    return buildFailedClipResult(
      recording,
      createRecordingAnalysisError("Recording analyzer returned timestamps outside the verified duration", "clip_response_invalid", true)
    );
  }
  return {
    item_id: optionalString(recording.item_id, 160),
    evidence_id: optionalString(recording.evidence_id, 240),
    recording_index: Math.max(1, Math.round(Number(recording.recording_index) || 1)),
    status: "complete",
    duration_ms: durationMs,
    speech_segments: normalizeTimedSegments(raw.speech_segments || raw.speechSegments, durationMs, "text", 4000),
    visual_events: normalizeTimedSegments(raw.visual_events || raw.visualEvents, durationMs, "description", 4000),
    summary: optionalString(raw.summary, 4000),
    confidence: normalizeConfidence(raw.confidence),
    error: null,
    error_code: null,
    retryable: false
  };
}

function normalizeFindingCategory(value) {
  const raw = sanitizeString(value, 80).toLowerCase();
  return FINDING_CATEGORIES.has(raw) ? raw : null;
}

function rangesOverlap(leftStart, leftEnd, rightStart, rightEnd) {
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

function findQuoteSupport(clip, quote, startMs, endMs) {
  if (!isMeaningfulEvidenceText(quote)) return null;
  return clip.speech_segments.find((segment) => (
    segment.text === quote && rangesOverlap(startMs, endMs, segment.start_ms, segment.end_ms)
  )) || null;
}

function findVisualSupport(clip, visualEvidence, startMs, endMs) {
  if (!isMeaningfulEvidenceText(visualEvidence)) return null;
  return clip.visual_events.find((event) => (
    event.description === visualEvidence && rangesOverlap(startMs, endMs, event.start_ms, event.end_ms)
  )) || null;
}

function normalizeEvidenceAnchor(value, clipsById, clipsByIndex) {
  if (!isPlainObject(value)) return null;
  const requestedEvidenceId = optionalString(value.evidence_id || value.evidenceId, 240);
  const requestedIndex = Number(value.recording_index ?? value.recordingIndex);
  const byId = requestedEvidenceId ? clipsById.get(requestedEvidenceId) : null;
  const byIndex = Number.isFinite(requestedIndex) ? clipsByIndex.get(Math.max(1, Math.round(requestedIndex))) : null;
  if (requestedEvidenceId && !byId) return null;
  if (Number.isFinite(requestedIndex) && !byIndex) return null;
  if (byId && byIndex && byId.evidence_id !== byIndex.evidence_id) return null;
  const clip = byId || byIndex;
  if (!clip || clip.status !== "complete") return null;

  const rawStartMs = Number(value.start_ms ?? value.startMs);
  const rawEndMs = Number(value.end_ms ?? value.endMs);
  if (
    !Number.isFinite(rawStartMs) ||
    !Number.isFinite(rawEndMs) ||
    rawStartMs < 0 ||
    rawEndMs < rawStartMs ||
    rawStartMs > clip.duration_ms ||
    rawEndMs > clip.duration_ms
  ) return null;
  let startMs = Math.round(rawStartMs);
  let endMs = Math.round(rawEndMs);
  const requestedQuote = optionalString(value.quote || value.transcript_quote || value.transcriptQuote, 1600);
  const requestedVisual = optionalString(
    value.visual_evidence || value.visualEvidence || value.visual_event || value.visualEvent,
    1600
  );
  if (!isMeaningfulEvidenceText(requestedQuote) && !isMeaningfulEvidenceText(requestedVisual)) return null;
  const quoteSupport = findQuoteSupport(clip, requestedQuote, startMs, endMs);
  const visualSupport = findVisualSupport(clip, requestedVisual, startMs, endMs);
  if (requestedQuote && !quoteSupport) return null;
  if (requestedVisual && !visualSupport) return null;
  if (!quoteSupport && !visualSupport) return null;

  const supports = [quoteSupport, visualSupport].filter(Boolean);
  startMs = Math.min(...supports.map((support) => support.start_ms));
  endMs = Math.max(...supports.map((support) => support.end_ms));
  return {
    evidence_id: clip.evidence_id,
    recording_index: clip.recording_index,
    start_ms: startMs,
    end_ms: endMs,
    quote: quoteSupport ? requestedQuote : null,
    visual_evidence: visualSupport ? requestedVisual : null
  };
}

function validateAggregationPayload(value) {
  if (!isPlainObject(value) || !Array.isArray(value.findings) || value.findings.length > MAX_FINDINGS) {
    return { ok: false, value: null, error: "Recording findings response must contain a findings array" };
  }
  for (const finding of value.findings) {
    if (!isPlainObject(finding) || !FINDING_CATEGORIES.has(finding.category)) {
      return { ok: false, value: null, error: "Recording finding has an invalid category" };
    }
    if (typeof finding.title !== "string" || !isMeaningfulEvidenceText(finding.title)) {
      return { ok: false, value: null, error: "Recording finding has an invalid title" };
    }
    if (typeof finding.summary !== "string" || !isMeaningfulEvidenceText(finding.summary)) {
      return { ok: false, value: null, error: "Recording finding has an invalid summary" };
    }
    if (!Number.isFinite(finding.confidence) || finding.confidence < 0 || finding.confidence > 1) {
      return { ok: false, value: null, error: "Recording finding has invalid confidence" };
    }
    if (
      !Array.isArray(finding.evidence_anchors) ||
      !finding.evidence_anchors.length ||
      finding.evidence_anchors.length > MAX_FINDING_ANCHORS
    ) {
      return { ok: false, value: null, error: "Recording finding must contain evidence anchors" };
    }
    for (const anchor of finding.evidence_anchors) {
      if (!isPlainObject(anchor)) {
        return { ok: false, value: null, error: "Recording finding has an invalid evidence anchor" };
      }
      const hasQuote = typeof anchor.quote === "string" && isMeaningfulEvidenceText(anchor.quote);
      const hasVisualEvidence = typeof anchor.visual_evidence === "string" && isMeaningfulEvidenceText(anchor.visual_evidence);
      if (
        typeof anchor.evidence_id !== "string" ||
        !anchor.evidence_id.trim() ||
        !Number.isInteger(anchor.recording_index) ||
        anchor.recording_index < 1 ||
        !Number.isFinite(anchor.start_ms) ||
        !Number.isFinite(anchor.end_ms) ||
        anchor.start_ms < 0 ||
        anchor.end_ms < anchor.start_ms ||
        (!hasQuote && !hasVisualEvidence)
      ) {
        return { ok: false, value: null, error: "Recording finding has an invalid evidence anchor" };
      }
    }
  }
  return { ok: true, value, error: null };
}

function normalizeRecordingFindings(value, clipResults, maxFindings = MAX_FINDINGS) {
  const rawFindings = Array.isArray(value?.findings) ? value.findings : [];
  const successfulClips = (Array.isArray(clipResults) ? clipResults : []).filter(
    (clip) => clip?.status === "complete" && clip.evidence_id
  );
  const clipsById = new Map(successfulClips.map((clip) => [clip.evidence_id, clip]));
  const clipsByIndex = new Map(successfulClips.map((clip) => [clip.recording_index, clip]));
  const seen = new Set();
  return rawFindings
    .slice(0, Math.max(1, Math.min(MAX_FINDINGS, Number(maxFindings) || MAX_FINDINGS)))
    .map((entry) => {
      if (!isPlainObject(entry)) return null;
      const category = normalizeFindingCategory(entry.category || entry.type);
      const title = optionalString(entry.title || entry.name, 240);
      const summary = optionalString(entry.summary || entry.description, 2400);
      if (!category || !title || !summary) return null;
      const anchors = (Array.isArray(entry.evidence_anchors || entry.evidenceAnchors)
        ? entry.evidence_anchors || entry.evidenceAnchors
        : [])
        .slice(0, MAX_FINDING_ANCHORS)
        .map((anchor) => normalizeEvidenceAnchor(anchor, clipsById, clipsByIndex))
        .filter(Boolean);
      if (!anchors.length) return null;
      const key = `${category}::${title.toLowerCase()}::${anchors[0].evidence_id}::${anchors[0].start_ms}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return {
        category,
        title,
        summary,
        evidence_anchors: anchors,
        confidence: normalizeConfidence(entry.confidence)
      };
    })
    .filter(Boolean);
}

function buildRecordingTranscriptEvents(clipResults) {
  return (Array.isArray(clipResults) ? clipResults : [])
    .filter((clip) => clip?.status === "complete")
    .sort((left, right) => left.recording_index - right.recording_index)
    .flatMap((clip) => clip.speech_segments.map((segment) => ({
      source: "server_recording_analysis",
      item_id: optionalString(clip.item_id, 160),
      evidence_id: clip.evidence_id,
      recording_index: clip.recording_index,
      start_ms: segment.start_ms,
      end_ms: segment.end_ms,
      text: segment.text
    })));
}

function buildRecordingAggregationInput(clipResults) {
  return {
    recordings: (Array.isArray(clipResults) ? clipResults : [])
      .filter((clip) => clip?.status === "complete")
      .sort((left, right) => left.recording_index - right.recording_index)
      .map((clip) => ({
        evidence_id: clip.evidence_id,
        recording_index: clip.recording_index,
        duration_ms: clip.duration_ms,
        speech_segments: clip.speech_segments,
        visual_events: clip.visual_events
      }))
  };
}

function isApprovedOpenRouterBaseUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "openrouter.ai" &&
      parsed.pathname.replace(/\/+$/, "") === "/api/v1" &&
      !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash
    );
  } catch {
    return false;
  }
}

function resolveManualQaRecordingAnalyzerConfig(options = {}) {
  const explicitBaseUrl = sanitizeString(
    options.baseUrl ||
      options.recordingAnalyzerBaseUrl ||
      options.recording_analyzer_base_url ||
      process.env.MANUAL_QA_RECORDING_ANALYZER_BASE_URL,
    4096
  ).replace(/\/$/, "");
  const topicBaseUrl = sanitizeString(
    process.env.MANUAL_QA_TOPIC_SEGMENTER_BASE_URL,
    4096
  ).replace(/\/$/, "");
  const approvedTopicFallback = !explicitBaseUrl && (
    !topicBaseUrl || isApprovedOpenRouterBaseUrl(topicBaseUrl)
  );
  const baseUrl = explicitBaseUrl || (approvedTopicFallback && topicBaseUrl) || DEFAULT_RECORDING_ANALYZER_BASE_URL;
  const apiKey = sanitizeString(
    options.apiKey ||
      options.recordingAnalyzerApiKey ||
      options.recording_analyzer_api_key ||
      process.env.MANUAL_QA_RECORDING_ANALYZER_API_KEY ||
      (approvedTopicFallback ? process.env.MANUAL_QA_TOPIC_SEGMENTER_API_KEY : "") ||
      process.env.OPENROUTER_API_KEY,
    4096
  );
  const analyzerModel = sanitizeString(
    options.analyzerModel ||
      options.recordingAnalyzerModel ||
      options.recording_analyzer_model ||
      process.env.MANUAL_QA_RECORDING_ANALYZER_MODEL ||
      DEFAULT_RECORDING_ANALYZER_MODEL,
    256
  );
  const aggregatorModel = sanitizeString(
    options.aggregatorModel ||
      options.recordingAggregatorModel ||
      options.recording_aggregator_model ||
      process.env.MANUAL_QA_RECORDING_AGGREGATOR_MODEL ||
      (approvedTopicFallback ? process.env.MANUAL_QA_TOPIC_SEGMENTER_MODEL : "") ||
      DEFAULT_RECORDING_AGGREGATOR_MODEL,
    256
  );
  const timeoutMs = Math.round(clampNumber(
    options.timeoutMs || options.recordingAnalyzerTimeoutMs || process.env.MANUAL_QA_RECORDING_ANALYZER_TIMEOUT_MS,
    5000,
    180000,
    DEFAULT_RECORDING_ANALYZER_TIMEOUT_MS
  ));
  const concurrency = Math.round(clampNumber(
    options.concurrency || options.recordingAnalyzerConcurrency || process.env.MANUAL_QA_RECORDING_ANALYZER_CONCURRENCY,
    1,
    8,
    DEFAULT_RECORDING_ANALYZER_CONCURRENCY
  ));
  const maxNewClips = Math.round(clampNumber(
    options.maxNewClips || options.recordingAnalyzerMaxNewClips || process.env.MANUAL_QA_RECORDING_ANALYZER_MAX_NEW_CLIPS,
    1,
    DEFAULT_RECORDING_ANALYZER_MAX_NEW_CLIPS,
    DEFAULT_RECORDING_ANALYZER_MAX_NEW_CLIPS
  ));
  const maxClipBytes = Math.round(clampNumber(
    options.maxClipBytes || options.recordingAnalyzerMaxClipBytes || process.env.MANUAL_QA_RECORDING_ANALYZER_MAX_CLIP_BYTES,
    1,
    DEFAULT_RECORDING_ANALYZER_MAX_CLIP_BYTES,
    DEFAULT_RECORDING_ANALYZER_MAX_CLIP_BYTES
  ));
  return {
    apiKey,
    baseUrl,
    analyzerModel,
    aggregatorModel,
    privacyEnforced: isApprovedOpenRouterBaseUrl(baseUrl),
    timeoutMs,
    concurrency,
    maxNewClips,
    maxClipBytes,
    fetchImpl: options.aiFetchImpl || options.fetchImpl || globalThis.fetch
  };
}

async function requestOpenRouterJson({ config, model, messages }) {
  if (!config.apiKey) throw new Error("Recording analyzer API key is missing");
  if (!config.baseUrl || !model) throw new Error("Recording analyzer model is not configured");
  if (!config.privacyEnforced || !isApprovedOpenRouterBaseUrl(config.baseUrl)) {
    throw createRecordingAnalysisError(
      "Recording analysis provider does not have the required enforced privacy route",
      "recording_provider_privacy_unverified",
      false
    );
  }
  if (typeof config.fetchImpl !== "function") throw new Error("fetch is not available for recording analysis");
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
        model,
        temperature: 0,
        provider: { zdr: true, data_collection: "deny" },
        response_format: { type: "json_object" },
        messages
      })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = optionalString(payload?.error?.message || payload?.message, 500);
      throw new Error(message || `Recording analysis request failed (${response.status})`);
    }
    const parsed = parseJsonObject(extractMessageText(payload));
    if (!parsed) throw new Error("Recording analysis response was not valid JSON");
    return parsed;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Recording analysis request timed out after ${config.timeoutMs}ms`);
    }
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function requestOpenRouterClipAnalysis({ recording, media, config }) {
  const prepared = prepareRecordingMedia(media, recording, config);
  return requestOpenRouterJson({
    config,
    model: config.analyzerModel,
    messages: [
      {
        role: "system",
        content:
          "Analyze one product-QA screen-and-voice recording. Transcribe only words actually spoken and describe only interface events actually visible. Do not infer bugs, intent, sentiment, or findings. Never invent speech. Return JSON only."
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              `This is recording part ${recording.recording_index}, with a verified duration of ${prepared.durationMs} ms. ` +
              "Return exactly speech_segments, visual_events, summary, and confidence. Each speech segment must have clip-relative numeric start_ms/end_ms and verbatim text. Each visual event must have clip-relative numeric start_ms/end_ms and a literal description. Summary must be a nonempty string and confidence a number from 0 to 1. Empty event arrays are correct when nothing is spoken or visible."
          },
          {
            type: "video_url",
            video_url: { url: `data:${prepared.contentType};base64,${prepared.data.toString("base64")}` }
          }
        ]
      }
    ]
  });
}

async function requestOpenRouterFindingsAggregation({ clipResults, config }) {
  return requestOpenRouterJson({
    config,
    model: config.aggregatorModel,
    messages: [
      {
        role: "system",
        content:
          "Derive product-QA findings only from the supplied timestamped recording transcript and visual events. No tester note is supplied or allowed as evidence. Allowed categories: bug, frustration, aha_moment, observation. Do not infer unsupported findings. Copy one complete transcript event or complete visual-event description exactly into each evidence field; never use a fragment. Return JSON only."
      },
      {
        role: "user",
        content:
          "Return {findings:[...]}, at most 16. Every finding needs category, title, summary, confidence, and evidence_anchors. " +
          "Every anchor needs evidence_id, recording_index, clip-relative start_ms/end_ms, and at least one of exact quote or exact visual_evidence. If the evidence does not support a finding, omit it.\n\n" +
          JSON.stringify(buildRecordingAggregationInput(clipResults))
      }
    ]
  });
}

function clipKey(value) {
  return `${sanitizeString(value?.evidence_id, 240)}::${Math.max(1, Math.round(Number(value?.recording_index) || 1))}`;
}

function buildAnalysisState({
  analysisId,
  status,
  recordings,
  clipResults,
  findings,
  config,
  errorCode,
  retryable,
  startedAt,
  queuedAt,
  completedAt,
  failedAt,
  mediaCount
}) {
  const orderedClips = recordings.map((recording) => clipResults.get(clipKey(recording))).filter(Boolean);
  const transcriptEvents = buildRecordingTranscriptEvents(orderedClips);
  return {
    analysis_id: analysisId,
    status,
    source: "recording_transcript",
    started_at: startedAt || null,
    queued_at: queuedAt || null,
    completed_at: completedAt || null,
    failed_at: failedAt || null,
    media_count: Number.isFinite(Number(mediaCount)) ? Number(mediaCount) : recordings.length,
    processed_media_count: orderedClips.filter((clip) => clip.status === "complete").length,
    transcript_event_count: transcriptEvents.length,
    model: config.analyzerModel,
    aggregation_model: config.aggregatorModel,
    clip_results: orderedClips,
    transcript_events: transcriptEvents,
    findings: status === "complete" ? findings : [],
    error_code: errorCode || null,
    retryable: Boolean(retryable)
  };
}

async function runManualQaRecordingAnalysis(input = {}, options = {}) {
  const rawRecordings = input.recordings || input.evidence_media || input.evidenceMedia;
  const inputSet = validateRecordingInputSet(rawRecordings);
  const recordings = inputSet.recordings;
  const analysisId = optionalString(input.analysis_id || input.analysisId, 160) || `recording_analysis_${Date.now()}`;
  const now = typeof options.now === "function" ? options.now : () => new Date().toISOString();
  const startedAt = now();
  const config = resolveManualQaRecordingAnalyzerConfig(options);
  const persistAnalysis = typeof options.persistAnalysis === "function"
    ? options.persistAnalysis
    : typeof options.onProgress === "function"
      ? options.onProgress
      : async () => {};
  const fetchEvidenceObject = typeof options.fetchEvidenceObject === "function"
    ? options.fetchEvidenceObject
    : fetchStoredEvidenceObject;
  const analyzeClip = typeof options.analyzeClip === "function"
    ? options.analyzeClip
    : requestOpenRouterClipAnalysis;
  const aggregateFindings = typeof options.aggregateFindings === "function"
    ? options.aggregateFindings
    : requestOpenRouterFindingsAggregation;
  const existingSource = input.existing_clip_results || input.existingClipResults ||
    input.existingAnalysis?.clip_results || input.existingAnalysis?.clipResults || [];
  const existingByKey = new Map();
  if (inputSet.ok) {
    for (const raw of Array.isArray(existingSource) ? existingSource : []) {
      if (raw?.status !== "complete") continue;
      const matchingRecording = recordings.find((recording) => clipKey(recording) === clipKey(raw));
      if (!matchingRecording) continue;
      const normalized = normalizeClipAnalysisResult(raw, matchingRecording, {
        trustedDurationMs: raw.duration_ms
      });
      if (normalized.status === "complete") existingByKey.set(clipKey(matchingRecording), normalized);
    }
  }
  const clipResults = new Map(existingByKey);

  if (!inputSet.ok) {
    const failed = buildAnalysisState({
      analysisId,
      status: "failed",
      recordings,
      clipResults,
      findings: [],
      config,
      errorCode: inputSet.errorCode,
      retryable: false,
      startedAt,
      failedAt: now(),
      mediaCount: inputSet.mediaCount
    });
    failed.error = inputSet.error;
    await persistAnalysis(failed);
    return failed;
  }

  await persistAnalysis(buildAnalysisState({
    analysisId,
    status: "processing",
    recordings,
    clipResults,
    findings: [],
    config,
    errorCode: null,
    retryable: false,
    startedAt
  }));

  const pending = recordings.filter((recording) => !clipResults.has(clipKey(recording)));
  const selectedPending = pending.slice(0, config.maxNewClips);
  let cursor = 0;
  let persistChain = Promise.resolve();
  const persistProgress = () => {
    const state = buildAnalysisState({
      analysisId,
      status: "processing",
      recordings,
      clipResults,
      findings: [],
      config,
      errorCode: null,
      retryable: false,
      startedAt
    });
    persistChain = persistChain.then(() => persistAnalysis(state));
    return persistChain;
  };
  const workers = Array.from({ length: Math.min(config.concurrency, selectedPending.length) }, async () => {
    while (cursor < selectedPending.length) {
      const recording = selectedPending[cursor++];
      let analyzedRecording = recording;
      try {
        if (Number.isFinite(recording.byte_length) && recording.byte_length > config.maxClipBytes) {
          throw createRecordingAnalysisError(
            `Recording exceeds the ${Math.round(config.maxClipBytes / 1024 / 1024)} MiB analysis limit`,
            "recording_too_large",
            false
          );
        }
        const media = await fetchEvidenceObject(recording, {
          ...(options.evidenceStorageOptions || options.storageOptions || {}),
          maxBytes: config.maxClipBytes
        });
        const prepared = prepareRecordingMedia(media, recording, config);
        analyzedRecording = {
          ...recording,
          content_type: prepared.contentType,
          duration_ms: prepared.durationMs
        };
        const raw = await analyzeClip({
          recording: analyzedRecording,
          media: {
            data: prepared.data,
            contentType: prepared.contentType,
            durationMs: prepared.durationMs
          },
          config
        });
        const normalized = normalizeClipAnalysisResult(raw, analyzedRecording, {
          trustedDurationMs: prepared.durationMs
        });
        if (normalized.status !== "complete") {
          throw createRecordingAnalysisError(
            normalized.error || "Recording analysis failed",
            normalized.error_code || "clip_analysis_failed",
            normalized.retryable !== false
          );
        }
        clipResults.set(clipKey(recording), normalized);
      } catch (error) {
        clipResults.set(clipKey(recording), buildFailedClipResult(analyzedRecording, error));
      }
      await persistProgress();
    }
  });
  await Promise.all(workers);
  await persistChain;

  const orderedClips = recordings.map((recording) => clipResults.get(clipKey(recording))).filter(Boolean);
  const failedClips = orderedClips.filter((clip) => clip.status !== "complete");
  if (failedClips.length) {
    const failed = buildAnalysisState({
      analysisId,
      status: "failed",
      recordings,
      clipResults,
      findings: [],
      config,
      errorCode: "clip_analysis_failed",
      retryable: failedClips.every((clip) => clip.retryable !== false),
      startedAt,
      failedAt: now()
    });
    await persistAnalysis(failed);
    return failed;
  }

  if (orderedClips.length < recordings.length) {
    const queued = buildAnalysisState({
      analysisId,
      status: "queued",
      recordings,
      clipResults,
      findings: [],
      config,
      errorCode: null,
      retryable: false,
      startedAt,
      queuedAt: now()
    });
    await persistAnalysis(queued);
    return queued;
  }

  try {
    const rawFindings = await aggregateFindings({ clipResults: orderedClips, config });
    const aggregationValidation = validateAggregationPayload(rawFindings);
    if (!aggregationValidation.ok) {
      throw createRecordingAnalysisError(
        aggregationValidation.error,
        "aggregation_response_invalid",
        true
      );
    }
    const findings = normalizeRecordingFindings(aggregationValidation.value, orderedClips);
    const rawAnchorCount = aggregationValidation.value.findings.reduce(
      (total, finding) => total + finding.evidence_anchors.length,
      0
    );
    const normalizedAnchorCount = findings.reduce(
      (total, finding) => total + finding.evidence_anchors.length,
      0
    );
    if (
      findings.length !== aggregationValidation.value.findings.length ||
      normalizedAnchorCount !== rawAnchorCount
    ) {
      throw createRecordingAnalysisError(
        "Recording findings were not fully supported by exact transcript or visual events",
        "aggregation_evidence_invalid",
        true
      );
    }
    const complete = buildAnalysisState({
      analysisId,
      status: "complete",
      recordings,
      clipResults,
      findings,
      config,
      errorCode: null,
      retryable: false,
      startedAt,
      completedAt: now()
    });
    await persistAnalysis(complete);
    return complete;
  } catch (error) {
    const failed = buildAnalysisState({
      analysisId,
      status: "failed",
      recordings,
      clipResults,
      findings: [],
      config,
      errorCode: optionalString(error?.code, 120) || "aggregation_failed",
      retryable: error?.retryable !== false,
      startedAt,
      failedAt: now()
    });
    failed.error = optionalString(error?.message || error, 600) || "Recording findings aggregation failed";
    await persistAnalysis(failed);
    return failed;
  }
}

module.exports = {
  DEFAULT_RECORDING_AGGREGATOR_MODEL,
  DEFAULT_RECORDING_ANALYZER_BASE_URL,
  DEFAULT_RECORDING_ANALYZER_MAX_CLIP_BYTES,
  DEFAULT_RECORDING_ANALYZER_MAX_NEW_CLIPS,
  DEFAULT_RECORDING_ANALYZER_MODEL,
  MAX_RECORDINGS,
  analyzeManualQaRecordings: runManualQaRecordingAnalysis,
  buildRecordingAggregationInput,
  buildRecordingTranscriptEvents,
  normalizeClipAnalysisResult,
  normalizeRecordingFindings,
  normalizeRecordingList,
  requestOpenRouterClipAnalysis,
  requestOpenRouterFindingsAggregation,
  resolveManualQaRecordingAnalyzerConfig,
  runManualQaRecordingAnalysis,
  __private: {
    buildAnalysisState,
    buildFailedClipResult,
    createRecordingAnalysisError,
    extractMp4DurationMs,
    extractMessageText,
    extractRecordingIndex,
    extractWebmDurationMs,
    findQuoteSupport,
    findVisualSupport,
    hasExpectedVideoSignature,
    isFinalVideoRecording,
    isFinalWebmRecording,
    isMeaningfulEvidenceText,
    normalizeEvidenceAnchor,
    normalizeFindingCategory,
    prepareRecordingMedia,
    parseJsonObject,
    requestOpenRouterJson,
    resolveEffectiveVideoContentType,
    resolveTrustedDurationMs,
    validateAggregationPayload,
    validateClipAnalysisPayload,
    validateRecordingInputSet
  }
};
