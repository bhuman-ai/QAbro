const { isPlainObject, normalizeUrl, sanitizeOptionalString, sanitizeString } = require("./qa-core");
const { hasSubmissionIdentity, normalizeSubmissionIdentityProfile } = require("./submission-identity");

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

function normalizeBrandProfileRow(row, options = {}) {
  const safeRow = isPlainObject(row) ? row : {};
  const safeProfile = isPlainObject(safeRow.profile) ? { ...safeRow.profile } : {};
  const identity = normalizeSubmissionIdentityProfile(safeProfile.identity, {
    includeSecrets: options.includeSecrets === true
  });
  if (hasSubmissionIdentity(identity)) {
    safeProfile.identity = identity;
  }
  return {
    id: sanitizeOptionalString(safeRow.id, 128) || null,
    owner_user_id: sanitizeOptionalString(safeRow.owner_user_id, 128) || null,
    owner_email: sanitizeOptionalString(safeRow.owner_email, 320) || null,
    brand_profile_id: sanitizeString(safeRow.brand_profile_id, 128),
    brand_key: sanitizeOptionalString(safeRow.brand_key, 256) || null,
    track: sanitizeString(safeRow.track, 64) || "custom",
    display_name: sanitizeString(safeRow.display_name, 180) || "",
    legal_name: sanitizeOptionalString(safeRow.legal_name, 240) || null,
    website_url: normalizeUrl(safeRow.website_url) || sanitizeOptionalString(safeRow.website_url, 4096) || null,
    profile: safeProfile,
    created_at: sanitizeOptionalString(safeRow.created_at, 128) || null,
    updated_at: sanitizeOptionalString(safeRow.updated_at, 128) || null
  };
}

async function upsertSubmissionBrandProfile(input, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const ownerUserId = sanitizeString(options.ownerUserId || input?.owner_user_id, 128);
  if (!ownerUserId) {
    return { ok: false, status: 400, error: "owner_user_id is required" };
  }

  const brandProfileId = sanitizeString(input?.brand_profile_id, 128);
  if (!brandProfileId) {
    return { ok: false, status: 400, error: "brand_profile_id is required" };
  }

  const displayName = sanitizeString(input?.display_name, 180);
  if (!displayName) {
    return { ok: false, status: 400, error: "display_name is required" };
  }

  const row = {
    owner_user_id: ownerUserId,
    owner_email: sanitizeOptionalString(options.ownerEmail || input?.owner_email, 320) || null,
    brand_profile_id: brandProfileId,
    brand_key: sanitizeOptionalString(input?.brand_key, 256) || null,
    track: sanitizeString(input?.track, 64) || "custom",
    display_name: displayName,
    legal_name: sanitizeOptionalString(input?.legal_name, 240) || null,
    website_url: normalizeUrl(input?.website_url) || sanitizeOptionalString(input?.website_url, 4096) || null,
    profile: isPlainObject(input?.profile) ? input.profile : {}
  };

  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/submission_brand_profiles`);
  requestUrl.searchParams.set("on_conflict", "owner_user_id,brand_profile_id");

  const response = await access.fetchImpl(requestUrl.toString(), {
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
      error: data?.message || "Failed to upsert submission brand profile",
      data
    };
  }

  const storedRow = Array.isArray(data) && data[0] ? data[0] : row;
  return {
    ok: true,
    status: 200,
    row: normalizeBrandProfileRow(storedRow, {
      includeSecrets: options.includeSecrets === true
    })
  };
}

async function loadSubmissionBrandProfile(brandProfileId, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const safeBrandProfileId = sanitizeString(brandProfileId, 128);
  if (!safeBrandProfileId) {
    return { ok: false, status: 400, error: "brand_profile_id is required" };
  }

  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/submission_brand_profiles`);
  requestUrl.searchParams.set("select", "*");
  requestUrl.searchParams.set("brand_profile_id", `eq.${safeBrandProfileId}`);
  if (options.ownerUserId) {
    requestUrl.searchParams.set("owner_user_id", `eq.${sanitizeString(options.ownerUserId, 128)}`);
  }
  requestUrl.searchParams.set("limit", "1");

  const response = await access.fetchImpl(requestUrl.toString(), {
    headers: {
      apikey: access.serviceKey,
      Authorization: `Bearer ${access.serviceKey}`
    }
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
      error: data?.message || "Failed to load submission brand profile",
      data
    };
  }

  const row = Array.isArray(data) && data[0] ? data[0] : null;
  if (!row) {
    return { ok: false, status: 404, error: "Submission brand profile not found" };
  }

  return {
    ok: true,
    status: 200,
    row: normalizeBrandProfileRow(row, {
      includeSecrets: options.includeSecrets === true
    })
  };
}

async function listSubmissionBrandProfiles(filters = {}, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/submission_brand_profiles`);
  requestUrl.searchParams.set("select", "*");

  const ownerUserId = sanitizeString(options.ownerUserId || filters.owner_user_id || filters.ownerUserId, 128);
  const track = sanitizeString(filters.track, 64);
  const brandKey = sanitizeString(filters.brand_key || filters.brandKey, 256);
  const limit = Math.max(1, Math.min(100, Number(filters.limit) || 50));

  if (ownerUserId) {
    requestUrl.searchParams.set("owner_user_id", `eq.${ownerUserId}`);
  }
  if (track) {
    requestUrl.searchParams.set("track", `eq.${track}`);
  }
  if (brandKey) {
    requestUrl.searchParams.set("brand_key", `eq.${brandKey}`);
  }
  requestUrl.searchParams.set("order", "updated_at.desc");
  requestUrl.searchParams.set("limit", String(limit));

  const response = await access.fetchImpl(requestUrl.toString(), {
    headers: {
      apikey: access.serviceKey,
      Authorization: `Bearer ${access.serviceKey}`
    }
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
      error: data?.message || "Failed to list submission brand profiles",
      data
    };
  }

  return {
    ok: true,
    status: 200,
    rows: Array.isArray(data)
      ? data.map((row) =>
          normalizeBrandProfileRow(row, {
            includeSecrets: options.includeSecrets === true
          })
        )
      : []
  };
}

module.exports = {
  normalizeBrandProfileRow,
  upsertSubmissionBrandProfile,
  loadSubmissionBrandProfile,
  listSubmissionBrandProfiles
};
