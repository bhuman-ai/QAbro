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

async function upsertSubmissionSiteProfile(input, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const siteId = sanitizeString(input?.site_id, 128).toLowerCase();
  if (!siteId) {
    return { ok: false, status: 400, error: "site_id is required" };
  }

  const siteName = sanitizeString(input?.site_name, 180) || siteId;
  const submitUrl = sanitizeString(input?.submit_url, 4096);
  if (!submitUrl) {
    return { ok: false, status: 400, error: "submit_url is required" };
  }

  const currentUrl = new URL(`${access.supabaseUrl}/rest/v1/submission_site_profiles`);
  currentUrl.searchParams.set("select", "id,version,is_active");
  currentUrl.searchParams.set("site_id", `eq.${siteId}`);
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
      error: currentRows?.message || "Failed to load existing site profiles",
      data: currentRows
    };
  }

  const latestVersion = Array.isArray(currentRows) && currentRows[0] ? Number(currentRows[0].version) || 0 : 0;

  const deactivateResponse = await access.fetchImpl(
    `${access.supabaseUrl}/rest/v1/submission_site_profiles?site_id=eq.${encodeURIComponent(siteId)}&is_active=eq.true`,
    {
      method: "PATCH",
      headers: buildSupabaseHeaders(access.serviceKey),
      body: JSON.stringify({ is_active: false })
    }
  );

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
      error: deactivateData?.message || "Failed to deactivate previous site profile versions",
      data: deactivateData
    };
  }

  const row = {
    site_id: siteId,
    version: latestVersion + 1,
    site_name: siteName,
    track: sanitizeString(input?.track, 64) || "custom",
    status: sanitizeString(input?.status, 64) || "active",
    submission_policy: sanitizeString(input?.submission_policy, 64) || "assist",
    submit_url: submitUrl,
    profile: input?.profile && typeof input.profile === "object" ? input.profile : {},
    evidence: input?.evidence && typeof input.evidence === "object" ? input.evidence : {},
    source_job_id: sanitizeOptionalString(input?.source_job_id, 128) || null,
    last_recon_at: sanitizeOptionalString(input?.last_recon_at, 128) || new Date().toISOString(),
    is_active: true
  };

  const insertResponse = await access.fetchImpl(`${access.supabaseUrl}/rest/v1/submission_site_profiles`, {
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
      error: data?.message || "Failed to insert site profile",
      data
    };
  }

  return {
    ok: true,
    status: 200,
    row: normalizeSubmissionSiteProfileRow(Array.isArray(data) && data[0] ? data[0] : row)
  };
}

function normalizeSubmissionSiteProfileRow(row) {
  const safeRow = isPlainObject(row) ? row : {};
  return {
    id: sanitizeOptionalString(safeRow.id, 128) || null,
    site_id: sanitizeString(safeRow.site_id, 128),
    version: Number.isFinite(Number(safeRow.version)) ? Math.floor(Number(safeRow.version)) : 1,
    site_name: sanitizeString(safeRow.site_name, 180) || "",
    track: sanitizeString(safeRow.track, 64) || "custom",
    status: sanitizeString(safeRow.status, 64) || "active",
    submission_policy: sanitizeString(safeRow.submission_policy, 64) || "assist",
    submit_url: sanitizeOptionalString(safeRow.submit_url, 4096) || null,
    profile: isPlainObject(safeRow.profile) ? safeRow.profile : {},
    evidence: isPlainObject(safeRow.evidence) ? safeRow.evidence : {},
    source_job_id: sanitizeOptionalString(safeRow.source_job_id, 128) || null,
    last_recon_at: sanitizeOptionalString(safeRow.last_recon_at, 128) || null,
    is_active: safeRow.is_active !== false,
    created_at: sanitizeOptionalString(safeRow.created_at, 128) || null,
    updated_at: sanitizeOptionalString(safeRow.updated_at, 128) || null
  };
}

async function loadActiveSubmissionSiteProfiles(siteIds, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const ids = Array.from(
    new Set(
      (Array.isArray(siteIds) ? siteIds : [])
        .map((value) => sanitizeString(value, 128).toLowerCase())
        .filter(Boolean)
    )
  );
  if (!ids.length) {
    return { ok: false, status: 400, error: "site_ids is required" };
  }

  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/submission_site_profiles`);
  requestUrl.searchParams.set("select", "*");
  requestUrl.searchParams.set("site_id", `in.(${ids.join(",")})`);
  requestUrl.searchParams.set("is_active", "eq.true");
  requestUrl.searchParams.set("order", "site_id.asc");

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
      error: data?.message || "Failed to load active submission site profiles",
      data
    };
  }

  const rows = Array.isArray(data) ? data.map(normalizeSubmissionSiteProfileRow) : [];
  return {
    ok: true,
    status: 200,
    rows
  };
}

module.exports = {
  normalizeSubmissionSiteProfileRow,
  upsertSubmissionSiteProfile,
  loadActiveSubmissionSiteProfiles
};
