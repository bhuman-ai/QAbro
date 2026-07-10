const crypto = require("crypto");

const { isPlainObject, sanitizeOptionalString, sanitizeString } = require("./qa-core");

const EVENT_TABLE = "swarmtest_manual_qa_events";
const DEFAULT_EVENT_LIMIT = 2000;
const MAX_EVENT_PAYLOAD_BYTES = 512 * 1024;

function getSupabaseAccess(options = {}) {
  const supabaseUrl = sanitizeString(options.supabaseUrl || process.env.SUPABASE_URL, 4096).replace(/\/$/, "");
  const serviceKey = sanitizeString(
    options.serviceKey || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
    4096
  );
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (!supabaseUrl || !serviceKey || typeof fetchImpl !== "function") {
    return { ok: false, status: 500, error: "Server is not configured" };
  }
  return { ok: true, supabaseUrl, serviceKey, fetchImpl };
}

function buildHeaders(serviceKey, prefer = "return=representation") {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    Prefer: prefer
  };
}

function createManualQaEventId(prefix = "event") {
  const safePrefix = sanitizeString(prefix, 40).replace(/[^a-z0-9_-]+/gi, "-") || "event";
  return `${safePrefix}_${Date.now().toString(36)}_${crypto.randomBytes(8).toString("hex")}`;
}

function normalizeEventPayload(value) {
  const payload = isPlainObject(value) ? value : {};
  let encoded = "";
  try {
    encoded = JSON.stringify(payload);
  } catch {
    return { ok: false, error: "Manual QA event payload must be JSON serializable" };
  }
  if (Buffer.byteLength(encoded, "utf8") > MAX_EVENT_PAYLOAD_BYTES) {
    return { ok: false, error: "Manual QA event payload is too large" };
  }
  return { ok: true, payload: JSON.parse(encoded) };
}

function normalizeManualQaEvent(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const payload = normalizeEventPayload(source.payload);
  if (!payload.ok) {
    return payload;
  }
  const eventType = sanitizeString(source.event_type || source.eventType || source.type, 80)
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "_");
  if (!eventType) {
    return { ok: false, error: "Manual QA event type is required" };
  }
  return {
    ok: true,
    event: {
      event_id:
        sanitizeString(source.event_id || source.eventId || source.client_event_id || source.clientEventId, 160) ||
        createManualQaEventId(eventType),
      item_id: sanitizeOptionalString(source.item_id || source.itemId, 80) || null,
      event_type: eventType,
      payload: payload.payload,
      owner_user_id: sanitizeOptionalString(source.owner_user_id || source.ownerUserId, 128) || null,
      created_at: sanitizeOptionalString(source.created_at || source.createdAt, 128) || new Date().toISOString()
    }
  };
}

function journalRequired(options = {}) {
  const configured = sanitizeString(
    options.eventJournalRequired ?? options.event_journal_required ?? process.env.MANUAL_QA_EVENT_JOURNAL_REQUIRED,
    16
  ).toLowerCase();
  return configured === "1" || configured === "true" || configured === "yes";
}

function isMissingEventTable(status, data) {
  const code = sanitizeString(data?.code, 80).toUpperCase();
  const message = sanitizeString(data?.message || data?.error || data?.hint, 1000).toLowerCase();
  return (
    status === 404 ||
    code === "42P01" ||
    code === "PGRST205" ||
    (message.includes(EVENT_TABLE) && (message.includes("not found") || message.includes("does not exist")))
  );
}

async function readJson(response, fallback) {
  try {
    return await response.json();
  } catch {
    return fallback;
  }
}

async function appendManualQaEvent(sessionId, value = {}, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }
  const safeSessionId = sanitizeString(sessionId, 128);
  if (!safeSessionId) {
    return { ok: false, status: 400, error: "Manual QA session id is required" };
  }
  const normalized = normalizeManualQaEvent(value);
  if (!normalized.ok) {
    return { ...normalized, status: 400 };
  }
  const row = {
    ...normalized.event,
    session_id: safeSessionId
  };
  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/${EVENT_TABLE}`);
  requestUrl.searchParams.set("on_conflict", "event_id");
  const response = await access.fetchImpl(requestUrl.toString(), {
    method: "POST",
    headers: buildHeaders(access.serviceKey, "resolution=ignore-duplicates,return=representation"),
    body: JSON.stringify([row])
  });
  const data = await readJson(response, []);
  if (!response.ok) {
    if (isMissingEventTable(response.status, data) && !journalRequired(options)) {
      return { ok: true, status: 200, available: false, event: row };
    }
    return {
      ok: false,
      status: response.status,
      error: data?.message || data?.error || "Failed to append manual QA event",
      data
    };
  }
  return {
    ok: true,
    status: 201,
    available: true,
    duplicate: !Array.isArray(data) || data.length === 0,
    event: Array.isArray(data) && data[0] ? data[0] : row
  };
}

async function listManualQaEvents(sessionId, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }
  const safeSessionId = sanitizeString(sessionId, 128);
  if (!safeSessionId) {
    return { ok: false, status: 400, error: "Manual QA session id is required" };
  }
  const limit = Math.max(1, Math.min(10000, Number(options.eventLimit || options.event_limit) || DEFAULT_EVENT_LIMIT));
  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/${EVENT_TABLE}`);
  requestUrl.searchParams.set("select", "id,event_id,session_id,item_id,event_type,payload,owner_user_id,created_at");
  requestUrl.searchParams.set("session_id", `eq.${safeSessionId}`);
  requestUrl.searchParams.set("order", "id.asc");
  requestUrl.searchParams.set("limit", String(limit));
  const response = await access.fetchImpl(requestUrl.toString(), {
    headers: buildHeaders(access.serviceKey, "return=minimal")
  });
  const data = await readJson(response, []);
  if (!response.ok) {
    if (isMissingEventTable(response.status, data) && !journalRequired(options)) {
      return { ok: true, status: 200, available: false, events: [] };
    }
    return {
      ok: false,
      status: response.status,
      error: data?.message || data?.error || "Failed to load manual QA events",
      data
    };
  }
  return {
    ok: true,
    status: 200,
    available: true,
    events: Array.isArray(data) ? data : []
  };
}

module.exports = {
  EVENT_TABLE,
  appendManualQaEvent,
  createManualQaEventId,
  listManualQaEvents,
  normalizeManualQaEvent,
  __private: {
    isMissingEventTable,
    normalizeEventPayload
  }
};
