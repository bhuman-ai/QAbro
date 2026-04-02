const { isPlainObject, sanitizeOptionalString, sanitizeString } = require("./qa-core");

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

function toManifestId(brandProfileId) {
  const slug = sanitizeString(brandProfileId, 128)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${slug || "brand"}_${Date.now()}`;
}

function normalizeAssetManifestRow(row) {
  const safeRow = isPlainObject(row) ? row : {};
  return {
    id: sanitizeOptionalString(safeRow.id, 128) || null,
    manifest_id: sanitizeString(safeRow.manifest_id, 128),
    owner_user_id: sanitizeOptionalString(safeRow.owner_user_id, 128) || null,
    owner_email: sanitizeOptionalString(safeRow.owner_email, 320) || null,
    brand_profile_id: sanitizeString(safeRow.brand_profile_id, 128),
    version: Number.isFinite(Number(safeRow.version)) ? Math.floor(Number(safeRow.version)) : 1,
    status: sanitizeString(safeRow.status, 64) || "pending_approval",
    brand_key: sanitizeOptionalString(safeRow.brand_key, 256) || null,
    track: sanitizeString(safeRow.track, 64) || "custom",
    source_job_id: sanitizeOptionalString(safeRow.source_job_id, 128) || null,
    manifest: isPlainObject(safeRow.manifest) ? safeRow.manifest : {},
    approval: isPlainObject(safeRow.approval) ? safeRow.approval : {},
    is_active: safeRow.is_active !== false,
    created_at: sanitizeOptionalString(safeRow.created_at, 128) || null,
    updated_at: sanitizeOptionalString(safeRow.updated_at, 128) || null
  };
}

async function createSubmissionAssetManifest(input, options = {}) {
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

  const currentUrl = new URL(`${access.supabaseUrl}/rest/v1/submission_asset_manifests`);
  currentUrl.searchParams.set("select", "version");
  currentUrl.searchParams.set("owner_user_id", `eq.${ownerUserId}`);
  currentUrl.searchParams.set("brand_profile_id", `eq.${brandProfileId}`);
  currentUrl.searchParams.set("order", "version.desc");
  currentUrl.searchParams.set("limit", "20");

  const currentResponse = await access.fetchImpl(currentUrl.toString(), {
    headers: {
      apikey: access.serviceKey,
      Authorization: `Bearer ${access.serviceKey}`
    }
  });

  let currentRows = [];
  try {
    currentRows = await currentResponse.json();
  } catch {
    currentRows = [];
  }

  if (!currentResponse.ok) {
    return {
      ok: false,
      status: currentResponse.status,
      error: currentRows?.message || "Failed to load existing asset manifests",
      data: currentRows
    };
  }

  const latestVersion = Array.isArray(currentRows) && currentRows[0] ? Number(currentRows[0].version) || 0 : 0;

  const deactivateUrl = new URL(`${access.supabaseUrl}/rest/v1/submission_asset_manifests`);
  deactivateUrl.searchParams.set("owner_user_id", `eq.${ownerUserId}`);
  deactivateUrl.searchParams.set("brand_profile_id", `eq.${brandProfileId}`);
  deactivateUrl.searchParams.set("is_active", "eq.true");

  const deactivateResponse = await access.fetchImpl(deactivateUrl.toString(), {
    method: "PATCH",
    headers: buildSupabaseHeaders(access.serviceKey),
    body: JSON.stringify({ is_active: false })
  });

  if (!deactivateResponse.ok) {
    let deactivateData = null;
    try {
      deactivateData = await deactivateResponse.json();
    } catch {
      deactivateData = null;
    }
    return {
      ok: false,
      status: deactivateResponse.status,
      error: deactivateData?.message || "Failed to deactivate previous asset manifests",
      data: deactivateData
    };
  }

  const row = {
    manifest_id: sanitizeString(input?.manifest_id, 128) || toManifestId(brandProfileId),
    owner_user_id: ownerUserId,
    owner_email: sanitizeOptionalString(options.ownerEmail || input?.owner_email, 320) || null,
    brand_profile_id: brandProfileId,
    version: latestVersion + 1,
    status: sanitizeString(input?.status, 64) || "pending_approval",
    brand_key: sanitizeOptionalString(input?.brand_key, 256) || null,
    track: sanitizeString(input?.track, 64) || "custom",
    source_job_id: sanitizeOptionalString(input?.source_job_id, 128) || null,
    manifest: isPlainObject(input?.manifest) ? input.manifest : {},
    approval: isPlainObject(input?.approval) ? input.approval : {},
    is_active: input?.is_active !== false
  };

  const insertResponse = await access.fetchImpl(`${access.supabaseUrl}/rest/v1/submission_asset_manifests`, {
    method: "POST",
    headers: buildSupabaseHeaders(access.serviceKey),
    body: JSON.stringify([row])
  });

  let data = null;
  try {
    data = await insertResponse.json();
  } catch {
    data = null;
  }

  if (!insertResponse.ok) {
    return {
      ok: false,
      status: insertResponse.status,
      error: data?.message || "Failed to create submission asset manifest",
      data
    };
  }

  const storedRow = Array.isArray(data) && data[0] ? data[0] : row;
  return {
    ok: true,
    status: 200,
    row: normalizeAssetManifestRow(storedRow)
  };
}

async function loadSubmissionAssetManifest(filters = {}, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/submission_asset_manifests`);
  requestUrl.searchParams.set("select", "*");

  const manifestId = sanitizeString(filters.manifest_id || filters.manifestId, 128);
  const brandProfileId = sanitizeString(filters.brand_profile_id || filters.brandProfileId, 128);
  const ownerUserId = sanitizeString(options.ownerUserId || filters.owner_user_id, 128);

  if (manifestId) {
    requestUrl.searchParams.set("manifest_id", `eq.${manifestId}`);
  } else if (brandProfileId) {
    requestUrl.searchParams.set("brand_profile_id", `eq.${brandProfileId}`);
    if (filters.latest !== false) {
      requestUrl.searchParams.set("is_active", "eq.true");
      requestUrl.searchParams.set("order", "version.desc");
    }
  } else {
    return { ok: false, status: 400, error: "manifest_id or brand_profile_id is required" };
  }

  if (ownerUserId) {
    requestUrl.searchParams.set("owner_user_id", `eq.${ownerUserId}`);
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
      error: data?.message || "Failed to load submission asset manifest",
      data
    };
  }

  const row = Array.isArray(data) && data[0] ? data[0] : null;
  if (!row) {
    return { ok: false, status: 404, error: "Submission asset manifest not found" };
  }

  return {
    ok: true,
    status: 200,
    row: normalizeAssetManifestRow(row)
  };
}

module.exports = {
  normalizeAssetManifestRow,
  createSubmissionAssetManifest,
  loadSubmissionAssetManifest
};
