const crypto = require("crypto");
const { isPlainObject, sanitizeString } = require("./qa-core");

const ALLOWED_EXPERIENCE_LEVELS = new Set(["new", "some", "professional"]);
const ALLOWED_DEVICES = new Set(["computer", "ios", "android"]);
const ALLOWED_AVAILABILITY = new Set(["weekdays", "evenings_weekends", "flexible"]);
const ALLOWED_APPLICATION_STATUSES = new Set(["applied", "invited", "qualified", "approved", "declined"]);
const TESTER_APPLICATION_SELECT_FIELDS =
  "id,owner_email,name,country,experience_level,devices,availability,can_record,status,source,qualification_session_id,metadata,created_at,updated_at";

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

function normalizeOperatorEmails(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(values.map((item) => sanitizeString(item, 320).toLowerCase()).filter(Boolean))];
}

function getTesterOperatorEmails(options = {}) {
  return normalizeOperatorEmails(
    options.operatorEmails ??
      process.env.TESTER_OPERATOR_EMAILS ??
      process.env.BUD_OPERATOR_EMAILS ??
      ""
  );
}

function isTesterOperatorEmail(value, options = {}) {
  const email = sanitizeString(value, 320).toLowerCase();
  return Boolean(email && getTesterOperatorEmails(options).includes(email));
}

function normalizeTesterPublicName(value) {
  const publicName = sanitizeString(value, 80).normalize("NFKC");
  if (publicName.length < 2 || publicName.length > 40) {
    return null;
  }

  return /^[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*$/u.test(publicName) ? publicName : null;
}

function normalizeTesterApplicationRow(value) {
  const row = isPlainObject(value) ? value : {};
  const metadata = isPlainObject(row.metadata) ? row.metadata : {};
  const id = sanitizeString(row.id, 128);
  if (!id) {
    return null;
  }

  return {
    id,
    owner_email: sanitizeString(row.owner_email, 320).toLowerCase(),
    name: sanitizeString(row.name, 120),
    public_name: normalizeTesterPublicName(metadata.public_name),
    country: sanitizeString(row.country, 120),
    experience_level: sanitizeString(row.experience_level, 32),
    devices: sanitizeDevices(row.devices),
    availability: sanitizeString(row.availability, 32),
    can_record: row.can_record === true,
    status: sanitizeString(row.status, 32) || "applied",
    source: sanitizeString(row.source, 80) || "tester_application",
    qualification_session_id: sanitizeString(row.qualification_session_id, 128) || null,
    created_at: sanitizeString(row.created_at, 128) || null,
    updated_at: sanitizeString(row.updated_at, 128) || null
  };
}

function normalizeTesterApplicationPayload(input = {}) {
  const safeInput = isPlainObject(input) ? input : {};
  const ownerUserId = sanitizeString(safeInput.owner_user_id || safeInput.ownerUserId, 128);
  const ownerEmail = sanitizeString(safeInput.owner_email || safeInput.ownerEmail, 320).toLowerCase();
  const name = sanitizeString(safeInput.name, 120);
  const hasPublicName = Object.prototype.hasOwnProperty.call(safeInput, "public_name");
  const publicName = hasPublicName ? normalizeTesterPublicName(safeInput.public_name) : null;
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
  if (hasPublicName && !publicName) {
    return { ok: false, status: 400, error: "Enter a first name using letters only" };
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

  const payload = {
    owner_user_id: ownerUserId,
    owner_email: ownerEmail,
    name,
    country,
    experience_level: experienceLevel,
    devices,
    availability,
    can_record: true,
    source: sanitizeSource(safeInput.source)
  };
  if (hasPublicName) {
    payload.metadata = { public_name: publicName };
  }

  return { ok: true, payload };
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
  const ownerEmail = sanitizeString(filters.owner_email || filters.ownerEmail, 320).toLowerCase();
  if (!ownerUserId) {
    return { ok: false, status: 400, error: "owner_user_id is required" };
  }

  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_tester_applications`);
  requestUrl.searchParams.set("select", TESTER_APPLICATION_SELECT_FIELDS);
  requestUrl.searchParams.set("owner_user_id", `eq.${ownerUserId}`);
  requestUrl.searchParams.set("limit", "1");

  const response = await access.fetchImpl(requestUrl.toString(), {
    headers: buildSupabaseHeaders(access.serviceKey, "return=minimal")
  });
  const data = await readJsonResponse(response);
  if (!response.ok || !Array.isArray(data)) {
    return buildSupabaseError(response, data, "Could not load your tester application");
  }

  if (!data[0] && ownerEmail) {
    const emailUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_tester_applications`);
    emailUrl.searchParams.set("select", TESTER_APPLICATION_SELECT_FIELDS);
    emailUrl.searchParams.set("owner_email", `eq.${ownerEmail}`);
    emailUrl.searchParams.set("limit", "1");
    const emailResponse = await access.fetchImpl(emailUrl.toString(), {
      headers: buildSupabaseHeaders(access.serviceKey, "return=minimal")
    });
    const emailData = await readJsonResponse(emailResponse);
    if (!emailResponse.ok || !Array.isArray(emailData)) {
      return buildSupabaseError(emailResponse, emailData, "Could not load your tester application");
    }
    return {
      ok: true,
      status: 200,
      application: emailData[0] ? normalizeTesterApplicationRow(emailData[0]) : null,
      matched_by_email: Boolean(emailData[0])
    };
  }

  return {
    ok: true,
    status: 200,
    application: data[0] ? normalizeTesterApplicationRow(data[0]) : null
  };
}

function verifiedInviteOwnerId(email) {
  const digest = crypto.createHash("sha256").update(email).digest("hex").slice(0, 40);
  return `verified-invite:${digest}`;
}

async function approveVerifiedInviteTester(input = {}, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) return access;
  const email = sanitizeString(input.email || input.owner_email || input.ownerEmail, 320).toLowerCase();
  const name = sanitizeString(input.name, 120);
  const publicName = normalizeTesterPublicName(input.public_name || input.publicName);
  const sessionId = sanitizeString(input.qualification_session_id || input.qualificationSessionId, 128);
  if (!email || !name || !sessionId) {
    return { ok: false, status: 400, error: "Verified tester name, email, and session are required" };
  }

  const lookupUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_tester_applications`);
  lookupUrl.searchParams.set("select", TESTER_APPLICATION_SELECT_FIELDS);
  lookupUrl.searchParams.set("owner_email", `eq.${email}`);
  lookupUrl.searchParams.set("limit", "1");
  const lookupResponse = await access.fetchImpl(lookupUrl.toString(), {
    headers: buildSupabaseHeaders(access.serviceKey, "return=minimal")
  });
  const lookupData = await readJsonResponse(lookupResponse);
  if (!lookupResponse.ok || !Array.isArray(lookupData)) {
    return buildSupabaseError(lookupResponse, lookupData, "Could not check the verified tester profile");
  }
  const existing = lookupData[0] ? normalizeTesterApplicationRow(lookupData[0]) : null;
  if (existing?.status === "declined") {
    return { ok: true, status: 200, skipped: true, reason: "declined_tester", application: existing };
  }
  if (existing) {
    if (existing.status === "approved") {
      return { ok: true, status: 200, idempotent: true, application: existing };
    }
    return updateTesterApplication({ id: existing.id, status: "approved" }, options);
  }

  const payload = {
    owner_user_id: verifiedInviteOwnerId(email),
    owner_email: email,
    name,
    country: "Not provided",
    experience_level: "some",
    devices: ["computer"],
    availability: "flexible",
    can_record: true,
    status: "approved",
    source: "verified_direct_invite",
    qualification_session_id: sessionId,
    metadata: {
      ...(publicName ? { public_name: publicName } : {}),
      profile_incomplete: true
    }
  };
  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_tester_applications`);
  requestUrl.searchParams.set("on_conflict", "owner_user_id");
  const response = await access.fetchImpl(requestUrl.toString(), {
    method: "POST",
    headers: buildSupabaseHeaders(access.serviceKey, "resolution=merge-duplicates,return=representation"),
    body: JSON.stringify(payload)
  });
  const data = await readJsonResponse(response);
  if (!response.ok || !Array.isArray(data) || !data[0]) {
    return buildSupabaseError(response, data, "Could not retain the verified tester");
  }
  return { ok: true, status: 201, application: normalizeTesterApplicationRow(data[0]) };
}

async function listTesterApplications(filters = {}, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const status = sanitizeString(filters.status, 32).toLowerCase();
  if (status && !ALLOWED_APPLICATION_STATUSES.has(status)) {
    return { ok: false, status: 400, error: "Unsupported tester application status" };
  }

  const requestedLimit = Number(filters.limit);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(200, Math.floor(requestedLimit))) : 100;
  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_tester_applications`);
  requestUrl.searchParams.set("select", TESTER_APPLICATION_SELECT_FIELDS);
  requestUrl.searchParams.set("order", "created_at.desc");
  requestUrl.searchParams.set("limit", String(limit));
  if (status) {
    requestUrl.searchParams.set("status", `eq.${status}`);
  }

  const response = await access.fetchImpl(requestUrl.toString(), {
    headers: buildSupabaseHeaders(access.serviceKey, "return=minimal")
  });
  const data = await readJsonResponse(response);
  if (!response.ok || !Array.isArray(data)) {
    return buildSupabaseError(response, data, "Could not load tester applications");
  }

  return {
    ok: true,
    status: 200,
    items: data.map(normalizeTesterApplicationRow).filter(Boolean)
  };
}

async function updateTesterApplication(input = {}, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const safeInput = isPlainObject(input) ? input : {};
  const id = sanitizeString(safeInput.id || safeInput.application_id || safeInput.applicationId, 128);
  const status = sanitizeString(safeInput.status, 32).toLowerCase();
  if (!id) {
    return { ok: false, status: 400, error: "Tester application id is required" };
  }
  if (!ALLOWED_APPLICATION_STATUSES.has(status)) {
    return { ok: false, status: 400, error: "Unsupported tester application status" };
  }

  const payload = { status };
  const hasSessionId =
    Object.prototype.hasOwnProperty.call(safeInput, "qualification_session_id") ||
    Object.prototype.hasOwnProperty.call(safeInput, "qualificationSessionId");
  if (hasSessionId) {
    payload.qualification_session_id =
      sanitizeString(safeInput.qualification_session_id || safeInput.qualificationSessionId, 128) || null;
  } else if (status === "applied") {
    payload.qualification_session_id = null;
  }
  if (status === "invited" && !payload.qualification_session_id) {
    return { ok: false, status: 400, error: "Qualification session id is required when inviting a tester" };
  }

  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_tester_applications`);
  requestUrl.searchParams.set("id", `eq.${id}`);
  requestUrl.searchParams.set("select", TESTER_APPLICATION_SELECT_FIELDS);

  const response = await access.fetchImpl(requestUrl.toString(), {
    method: "PATCH",
    headers: buildSupabaseHeaders(access.serviceKey, "return=representation"),
    body: JSON.stringify(payload)
  });
  const data = await readJsonResponse(response);
  if (!response.ok || !Array.isArray(data)) {
    return buildSupabaseError(response, data, "Could not update tester application");
  }
  if (!data[0]) {
    return { ok: false, status: 404, error: "Tester application not found" };
  }

  return { ok: true, status: 200, application: normalizeTesterApplicationRow(data[0]) };
}

async function markTesterApplicationQualifiedBySession(sessionId, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const normalizedSessionId = sanitizeString(sessionId, 128);
  if (!normalizedSessionId) {
    return { ok: false, status: 400, error: "Qualification session id is required" };
  }

  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_tester_applications`);
  requestUrl.searchParams.set("qualification_session_id", `eq.${normalizedSessionId}`);
  requestUrl.searchParams.set("status", "eq.invited");
  requestUrl.searchParams.set("select", TESTER_APPLICATION_SELECT_FIELDS);

  const response = await access.fetchImpl(requestUrl.toString(), {
    method: "PATCH",
    headers: buildSupabaseHeaders(access.serviceKey, "return=representation"),
    body: JSON.stringify({ status: "qualified" })
  });
  const data = await readJsonResponse(response);
  if (!response.ok || !Array.isArray(data)) {
    return buildSupabaseError(response, data, "Could not update tester qualification status");
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
  ALLOWED_APPLICATION_STATUSES,
  ALLOWED_AVAILABILITY,
  ALLOWED_DEVICES,
  ALLOWED_EXPERIENCE_LEVELS,
  approveVerifiedInviteTester,
  getTesterOperatorEmails,
  getTesterApplication,
  isTesterOperatorEmail,
  listTesterApplications,
  markTesterApplicationQualifiedBySession,
  normalizeTesterApplicationPayload,
  normalizeTesterApplicationRow,
  normalizeTesterPublicName,
  normalizeOperatorEmails,
  sanitizeDevices,
  updateTesterApplication,
  upsertTesterApplication
};
