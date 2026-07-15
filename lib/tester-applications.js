const { isPlainObject, sanitizeString } = require("./qa-core");

const ALLOWED_EXPERIENCE_LEVELS = new Set(["new", "some", "professional"]);
const ALLOWED_DEVICES = new Set(["computer", "ios", "android"]);
const ALLOWED_AVAILABILITY = new Set(["weekdays", "evenings_weekends", "flexible"]);

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

function sanitizeSource(value) {
  return (
    sanitizeString(value, 80)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "tester_application"
  );
}

function sanitizeDevices(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map((item) => sanitizeString(item, 32).toLowerCase()))]
    .filter((item) => ALLOWED_DEVICES.has(item))
    .slice(0, ALLOWED_DEVICES.size);
}

function normalizeTesterApplicationRow(value) {
  const row = isPlainObject(value) ? value : {};
  const id = sanitizeString(row.id, 128);
  if (!id) {
    return null;
  }

  return {
    id,
    name: sanitizeString(row.name, 120),
    country: sanitizeString(row.country, 120),
    experience_level: sanitizeString(row.experience_level, 32),
    devices: sanitizeDevices(row.devices),
    availability: sanitizeString(row.availability, 32),
    can_record: row.can_record === true,
    status: sanitizeString(row.status, 32) || "applied",
    created_at: sanitizeString(row.created_at, 128) || null,
    updated_at: sanitizeString(row.updated_at, 128) || null
  };
}

function normalizeTesterApplicationPayload(input = {}) {
  const safeInput = isPlainObject(input) ? input : {};
  const ownerUserId = sanitizeString(safeInput.owner_user_id || safeInput.ownerUserId, 128);
  const ownerEmail = sanitizeString(safeInput.owner_email || safeInput.ownerEmail, 320).toLowerCase();
  const name = sanitizeString(safeInput.name, 120);
  const country = sanitizeString(safeInput.country, 120);
  const experienceLevel = sanitizeString(
    safeInput.experience_level || safeInput.experienceLevel,
    32
  ).toLowerCase();
  const devices = sanitizeDevices(safeInput.devices);
  const availability = sanitizeString(safeInput.availability, 32).toLowerCase();
  const canRecord = safeInput.can_record === true || safeInput.canRecord === true;

  if (!ownerUserId || !ownerEmail) {
    return { ok: false, status: 400, error: "Signed-in user id and email are required" };
  }
  if (name.length < 2) {
    return { ok: false, status: 400, error: "Enter your name" };
  }
  if (country.length < 2) {
    return { ok: false, status: 400, error: "Enter where you are based" };
  }
  if (!ALLOWED_EXPERIENCE_LEVELS.has(experienceLevel)) {
    return { ok: false, status: 400, error: "Choose your testing experience" };
  }
  if (!devices.length) {
    return { ok: false, status: 400, error: "Choose at least one device" };
  }
  if (!ALLOWED_AVAILABILITY.has(availability)) {
    return { ok: false, status: 400, error: "Choose when you are usually available" };
  }
  if (!canRecord) {
    return { ok: false, status: 400, error: "Confirm that you can record your screen and speak in English" };
  }

  return {
    ok: true,
    payload: {
      owner_user_id: ownerUserId,
      owner_email: ownerEmail,
      name,
      country,
      experience_level: experienceLevel,
      devices,
      availability,
      can_record: true,
      source: sanitizeSource(safeInput.source)
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

function buildSupabaseError(response, data, fallback) {
  const tableMissing =
    response?.status === 404 &&
    sanitizeString(data?.message || data?.error, 512).toLowerCase().includes("swarmtest_tester_applications");

  return {
    ok: false,
    status: tableMissing ? 503 : response?.status || 500,
    error: tableMissing
      ? "Tester applications are not available yet"
      : sanitizeString(data?.message || data?.error || data?.hint, 256) || fallback
  };
}

async function getTesterApplication(filters = {}, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const ownerUserId = sanitizeString(filters.owner_user_id || filters.ownerUserId, 128);
  if (!ownerUserId) {
    return { ok: false, status: 400, error: "owner_user_id is required" };
  }

  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_tester_applications`);
  requestUrl.searchParams.set(
    "select",
    "id,name,country,experience_level,devices,availability,can_record,status,created_at,updated_at"
  );
  requestUrl.searchParams.set("owner_user_id", `eq.${ownerUserId}`);
  requestUrl.searchParams.set("limit", "1");

  const response = await access.fetchImpl(requestUrl.toString(), {
    headers: buildSupabaseHeaders(access.serviceKey, "return=minimal")
  });
  const data = await readJsonResponse(response);
  if (!response.ok || !Array.isArray(data)) {
    return buildSupabaseError(response, data, "Could not load your tester application");
  }

  return {
    ok: true,
    status: 200,
    application: data[0] ? normalizeTesterApplicationRow(data[0]) : null
  };
}

async function upsertTesterApplication(input = {}, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const normalized = normalizeTesterApplicationPayload(input);
  if (!normalized.ok) {
    return normalized;
  }

  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_tester_applications`);
  requestUrl.searchParams.set("on_conflict", "owner_user_id");

  const response = await access.fetchImpl(requestUrl.toString(), {
    method: "POST",
    headers: buildSupabaseHeaders(access.serviceKey, "resolution=merge-duplicates,return=representation"),
    body: JSON.stringify(normalized.payload)
  });
  const data = await readJsonResponse(response);
  if (!response.ok || !Array.isArray(data) || !data[0]) {
    return buildSupabaseError(response, data, "Could not save your tester application");
  }

  const application = normalizeTesterApplicationRow(data[0]);
  if (!application) {
    return { ok: false, status: 500, error: "Could not save your tester application" };
  }

  return { ok: true, status: 201, application };
}

module.exports = {
  ALLOWED_AVAILABILITY,
  ALLOWED_DEVICES,
  ALLOWED_EXPERIENCE_LEVELS,
  getTesterApplication,
  normalizeTesterApplicationPayload,
  normalizeTesterApplicationRow,
  sanitizeDevices,
  upsertTesterApplication
};
