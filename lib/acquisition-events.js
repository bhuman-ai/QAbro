const { isPlainObject, sanitizeString } = require("./qa-core");

const ACQUISITION_EVENT_NAMES = Object.freeze([
  "offer_viewed",
  "primary_cta_clicked",
  "signup_completed",
  "mcp_key_created",
  "agent_install_step_copied",
  "mcp_key_first_used",
  "first_qa_requested",
  "first_qa_report_completed"
]);

const ACQUISITION_EVENT_NAME_SET = new Set(ACQUISITION_EVENT_NAMES);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UTM_FIELDS = Object.freeze(["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]);

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

function buildSupabaseHeaders(serviceKey) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    Prefer: "resolution=ignore-duplicates,return=representation"
  };
}

function normalizeVisitorId(value) {
  const visitorId = sanitizeString(value, 64).toLowerCase();
  return UUID_PATTERN.test(visitorId) ? visitorId : "";
}

function normalizeLandingPath(value) {
  const rawValue = sanitizeString(value, 2048);
  if (!rawValue) {
    return "";
  }

  let pathValue = rawValue;
  try {
    if (/^https?:\/\//i.test(rawValue)) {
      pathValue = new URL(rawValue).pathname;
    }
  } catch {
    return "";
  }

  pathValue = pathValue.split("?")[0].split("#")[0];
  if (!pathValue.startsWith("/")) {
    return "";
  }
  return sanitizeString(pathValue, 512);
}

function normalizeAttribution(input = {}) {
  const safeInput = isPlainObject(input) ? input : {};
  const attribution = {};
  for (const field of UTM_FIELDS) {
    attribution[field] = sanitizeString(safeInput[field], 160) || null;
  }
  return attribution;
}

function normalizeStringProperty(properties, field, maxLength = 128) {
  return sanitizeString(properties[field], maxLength);
}

function requireStringProperties(properties, fieldLimits) {
  const normalized = {};
  for (const [field, maxLength] of Object.entries(fieldLimits)) {
    const value = normalizeStringProperty(properties, field, maxLength);
    if (!value) {
      return { ok: false, error: `${field} is required` };
    }
    normalized[field] = value;
  }
  return { ok: true, properties: normalized };
}

function normalizeEventProperties(eventName, value) {
  const properties = isPlainObject(value) ? value : {};

  if (eventName === "offer_viewed") {
    const required = requireStringProperties(properties, { surface: 64 });
    if (!required.ok) return required;
    const path = normalizeLandingPath(properties.path);
    if (!path) return { ok: false, error: "path is required" };
    return { ok: true, properties: { ...required.properties, path } };
  }

  if (eventName === "primary_cta_clicked") {
    const required = requireStringProperties(properties, { surface: 64, cta_label: 120 });
    if (!required.ok) return required;
    const destinationPath = normalizeLandingPath(properties.destination_path);
    if (!destinationPath) return { ok: false, error: "destination_path is required" };
    return { ok: true, properties: { ...required.properties, destination_path: destinationPath } };
  }

  if (eventName === "signup_completed") {
    const authMethod = normalizeStringProperty(properties, "auth_method", 32).toLowerCase();
    if (!["email", "google", "github", "unknown"].includes(authMethod)) {
      return { ok: false, error: "auth_method is invalid" };
    }
    return { ok: true, properties: { auth_method: authMethod } };
  }

  if (eventName === "mcp_key_created") {
    return requireStringProperties(properties, { token_id: 128, source: 64 });
  }

  if (eventName === "agent_install_step_copied") {
    const step = normalizeStringProperty(properties, "step", 32).toLowerCase();
    if (!["mcp_config", "skill_command"].includes(step)) {
      return { ok: false, error: "step is invalid" };
    }
    return { ok: true, properties: { step } };
  }

  if (eventName === "mcp_key_first_used") {
    return requireStringProperties(properties, { token_id: 128 });
  }

  if (eventName === "first_qa_requested") {
    return requireStringProperties(properties, { run_id: 128, launch_surface: 64, qa_mode: 64 });
  }

  if (eventName === "first_qa_report_completed") {
    const required = requireStringProperties(properties, { run_id: 128 });
    if (!required.ok) return required;
    const reportStatus = normalizeStringProperty(properties, "report_status", 64).toLowerCase();
    if (!["completed", "complete"].includes(reportStatus)) {
      return { ok: false, error: "report_status must be completed" };
    }
    const findingCount = Number(properties.finding_count);
    const activationLatencySeconds = Number(properties.activation_latency_seconds);
    if (!Number.isInteger(findingCount) || findingCount < 0 || findingCount > 10000) {
      return { ok: false, error: "finding_count must be a non-negative integer" };
    }
    if (
      !Number.isInteger(activationLatencySeconds) ||
      activationLatencySeconds < 0 ||
      activationLatencySeconds > 31536000
    ) {
      return { ok: false, error: "activation_latency_seconds must be a non-negative integer" };
    }
    return {
      ok: true,
      properties: {
        ...required.properties,
        report_status: reportStatus,
        finding_count: findingCount,
        activation_latency_seconds: activationLatencySeconds
      }
    };
  }

  return { ok: false, error: "event_name is invalid" };
}

function normalizeAcquisitionEvent(input = {}, options = {}) {
  const safeInput = isPlainObject(input) ? input : {};
  const eventName = sanitizeString(safeInput.event_name || safeInput.eventName, 80).toLowerCase();
  if (!ACQUISITION_EVENT_NAME_SET.has(eventName)) {
    return { ok: false, status: 400, error: "event_name is invalid" };
  }

  const rawEventKey = String(safeInput.event_key || safeInput.eventKey || "").trim();
  if (!rawEventKey || rawEventKey.length > 320) {
    return { ok: false, status: 400, error: "event_key is required and must be at most 320 characters" };
  }
  const eventKey = sanitizeString(rawEventKey, 320);
  const ownerUserId = sanitizeString(safeInput.owner_user_id || safeInput.ownerUserId, 128) || null;
  const rawVisitorId = sanitizeString(safeInput.visitor_id || safeInput.visitorId, 128);
  const visitorId = normalizeVisitorId(rawVisitorId) || null;
  if (rawVisitorId && !visitorId) {
    return { ok: false, status: 400, error: "visitor_id must be a UUID" };
  }
  if (!ownerUserId && !visitorId) {
    return { ok: false, status: 400, error: "visitor_id or owner_user_id is required" };
  }

  const propertyResult = normalizeEventProperties(eventName, safeInput.properties);
  if (!propertyResult.ok) {
    return { ok: false, status: 400, error: propertyResult.error };
  }

  const attributionInput = isPlainObject(safeInput.attribution) ? safeInput.attribution : safeInput;
  const attribution = normalizeAttribution(attributionInput);
  const landingPath = normalizeLandingPath(
    safeInput.landing_path || safeInput.landingPath || attributionInput.landing_path || attributionInput.landingPath
  );
  const now = new Date(options.now || Date.now());
  if (Number.isNaN(now.getTime())) {
    return { ok: false, status: 500, error: "Invalid server timestamp" };
  }

  return {
    ok: true,
    status: 200,
    payload: {
      event_name: eventName,
      event_key: eventKey,
      visitor_id: visitorId,
      owner_user_id: ownerUserId,
      occurred_at: now.toISOString(),
      landing_path: landingPath || null,
      ...attribution,
      is_test: safeInput.is_test === true || safeInput.isTest === true,
      properties: propertyResult.properties
    }
  };
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function writeAcquisitionEvent(input = {}, options = {}) {
  const normalized = normalizeAcquisitionEvent(input, options);
  if (!normalized.ok) {
    return normalized;
  }

  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_acquisition_events`);
  requestUrl.searchParams.set("on_conflict", "event_key");
  const response = await access.fetchImpl(requestUrl.toString(), {
    method: "POST",
    headers: buildSupabaseHeaders(access.serviceKey),
    body: JSON.stringify(normalized.payload)
  });
  const rows = await readJsonResponse(response);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status || 500,
      error: sanitizeString(rows?.message || rows?.error || rows?.hint, 256) || "Failed to write acquisition event"
    };
  }

  const item = Array.isArray(rows) && rows[0] ? rows[0] : null;
  return {
    ok: true,
    status: response.status || 200,
    created: Boolean(item),
    item
  };
}

module.exports = {
  ACQUISITION_EVENT_NAMES,
  normalizeAcquisitionEvent,
  normalizeAttribution,
  normalizeLandingPath,
  normalizeVisitorId,
  writeAcquisitionEvent
};
