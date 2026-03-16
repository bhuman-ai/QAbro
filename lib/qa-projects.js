const { isPlainObject, normalizeUrl, sanitizeString } = require("./qa-core");

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

function sanitizeBrandKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 256);
}

function normalizeProjectTargetUrl(value) {
  const raw = sanitizeString(value, 4096);
  if (!raw) {
    return null;
  }

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return normalizeUrl(withProtocol) || sanitizeString(raw, 4096) || null;
}

function normalizeProjectMetadata(value) {
  if (!isPlainObject(value)) {
    return {};
  }

  const metadata = {};
  for (const [key, rawValue] of Object.entries(value)) {
    const safeKey = sanitizeString(key, 128);
    if (!safeKey) {
      continue;
    }

    if (typeof rawValue === "string") {
      metadata[safeKey] = sanitizeString(rawValue, 512);
      continue;
    }
    if (typeof rawValue === "number" || typeof rawValue === "boolean" || rawValue === null) {
      metadata[safeKey] = rawValue;
    }
  }

  return metadata;
}

function normalizeProjectRow(row) {
  const safeRow = isPlainObject(row) ? row : {};
  const brandKey = sanitizeBrandKey(safeRow.brand_key || safeRow.brandKey);
  if (!brandKey) {
    return null;
  }

  return {
    brand_key: brandKey,
    brand_name: sanitizeString(safeRow.brand_name || safeRow.brandName, 256) || null,
    target_url: normalizeProjectTargetUrl(safeRow.target_url || safeRow.targetUrl) || null,
    owner_user_id: sanitizeString(safeRow.owner_user_id || safeRow.ownerUserId, 128) || null,
    owner_email: sanitizeString(safeRow.owner_email || safeRow.ownerEmail, 320).toLowerCase() || null,
    last_used_at: sanitizeString(safeRow.last_used_at || safeRow.lastUsedAt, 128) || null,
    created_at: sanitizeString(safeRow.created_at || safeRow.createdAt, 128) || null,
    updated_at: sanitizeString(safeRow.updated_at || safeRow.updatedAt, 128) || null,
    metadata: normalizeProjectMetadata(safeRow.metadata)
  };
}

function normalizeProjectPayload(project, owner = {}) {
  const safeProject = isPlainObject(project) ? project : {};
  const brandKey = sanitizeBrandKey(safeProject.brand_key || safeProject.brandKey);
  if (!brandKey) {
    return null;
  }

  const ownerUserId = sanitizeString(owner.owner_user_id || owner.ownerUserId, 128);
  if (!ownerUserId) {
    return null;
  }

  const ownerEmail = sanitizeString(owner.owner_email || owner.ownerEmail, 320).toLowerCase();
  const explicitLastUsedAt = sanitizeString(safeProject.last_used_at || safeProject.lastUsedAt, 128);

  return {
    owner_user_id: ownerUserId,
    owner_email: ownerEmail || null,
    brand_key: brandKey,
    brand_name: sanitizeString(safeProject.brand_name || safeProject.brandName, 256) || null,
    target_url: normalizeProjectTargetUrl(safeProject.target_url || safeProject.targetUrl) || null,
    metadata: normalizeProjectMetadata(safeProject.metadata),
    last_used_at: explicitLastUsedAt || new Date().toISOString()
  };
}

async function listQaProjects(filters = {}, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const ownerUserId = sanitizeString(filters.owner_user_id || filters.ownerUserId, 128);
  if (!ownerUserId) {
    return { ok: false, status: 400, error: "owner_user_id is required" };
  }

  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_projects`);
  requestUrl.searchParams.set("select", "brand_key,brand_name,target_url,owner_user_id,owner_email,last_used_at,created_at,updated_at,metadata");
  requestUrl.searchParams.set("owner_user_id", `eq.${ownerUserId}`);
  requestUrl.searchParams.set("order", "last_used_at.desc,created_at.desc");
  requestUrl.searchParams.set("limit", "200");

  const response = await access.fetchImpl(requestUrl.toString(), {
    headers: buildSupabaseHeaders(access.serviceKey, "return=minimal")
  });

  let rows = null;
  try {
    rows = await response.json();
  } catch {
    rows = null;
  }

  if (!response.ok || !Array.isArray(rows)) {
    return {
      ok: false,
      status: response.status || 500,
      error: sanitizeString(rows?.message || rows?.error || rows?.hint, 256) || "Failed to load projects"
    };
  }

  const items = rows.map(normalizeProjectRow).filter(Boolean);
  return {
    ok: true,
    status: 200,
    total: items.length,
    items
  };
}

async function upsertQaProjects(projects, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const owner = {
    owner_user_id: sanitizeString(options.owner_user_id || options.ownerUserId, 128),
    owner_email: sanitizeString(options.owner_email || options.ownerEmail, 320).toLowerCase()
  };
  if (!owner.owner_user_id) {
    return { ok: false, status: 400, error: "owner_user_id is required" };
  }

  const projectList = Array.isArray(projects) ? projects : [projects];
  const payload = projectList.map((project) => normalizeProjectPayload(project, owner)).filter(Boolean);
  if (!payload.length) {
    return { ok: false, status: 400, error: "At least one valid project is required" };
  }

  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_projects`);
  requestUrl.searchParams.set("on_conflict", "owner_user_id,brand_key");

  const response = await access.fetchImpl(requestUrl.toString(), {
    method: "POST",
    headers: buildSupabaseHeaders(access.serviceKey, "resolution=merge-duplicates,return=representation"),
    body: JSON.stringify(payload)
  });

  let rows = null;
  try {
    rows = await response.json();
  } catch {
    rows = null;
  }

  if (!response.ok || !Array.isArray(rows)) {
    return {
      ok: false,
      status: response.status || 500,
      error: sanitizeString(rows?.message || rows?.error || rows?.hint, 256) || "Failed to save projects"
    };
  }

  return {
    ok: true,
    status: 200,
    items: rows.map(normalizeProjectRow).filter(Boolean)
  };
}

module.exports = {
  listQaProjects,
  normalizeProjectRow,
  sanitizeBrandKey,
  upsertQaProjects
};
