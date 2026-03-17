const { isPlainObject, normalizeUrl, sanitizeString } = require("./qa-core");
const { listQaReports } = require("./qa-queue");

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

function isMissingProjectsTableError(result) {
  const safeResult = result && typeof result === "object" ? result : {};
  const status = Number(safeResult.status) || 0;
  const errorText = sanitizeString(safeResult.error, 512).toLowerCase();
  return (
    status === 404 &&
    errorText.includes("swarmtest_projects") &&
    (errorText.includes("schema cache") || errorText.includes("could not find the table"))
  );
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
    metadata: normalizeProjectMetadata(safeRow.metadata),
    run_count: Math.max(0, Number(safeRow.run_count || safeRow.runCount) || 0),
    latest_run_at: sanitizeString(safeRow.latest_run_at || safeRow.latestRunAt, 128) || null
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

function timestampValue(value) {
  const parsed = Date.parse(String(value || "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function chooseCanonicalProjectField(currentValue, nextValue) {
  const current = sanitizeString(currentValue, 4096);
  if (current) {
    return current;
  }
  return sanitizeString(nextValue, 4096) || null;
}

function buildCanonicalProjects(savedProjects, reportItems) {
  const entries = new Map();

  for (const row of Array.isArray(savedProjects) ? savedProjects : []) {
    const normalized = normalizeProjectRow(row);
    if (!normalized) {
      continue;
    }
    entries.set(normalized.brand_key, normalized);
  }

  for (const report of Array.isArray(reportItems) ? reportItems : []) {
    const brandKey = sanitizeBrandKey(report?.brand_key);
    if (!brandKey) {
      continue;
    }

    const current = entries.get(brandKey) || {
      brand_key: brandKey,
      brand_name: null,
      target_url: null,
      owner_user_id: sanitizeString(report?.owner_user_id, 128) || null,
      owner_email: null,
      last_used_at: null,
      created_at: null,
      updated_at: null,
      metadata: {},
      run_count: 0,
      latest_run_at: null
    };
    const deliveredAt = sanitizeString(report?.delivered_at, 128) || null;

    entries.set(brandKey, {
      ...current,
      brand_name: chooseCanonicalProjectField(current.brand_name, report?.brand_name),
      target_url: chooseCanonicalProjectField(current.target_url, report?.target_url),
      run_count: Math.max(0, Number(current.run_count) || 0) + 1,
      latest_run_at: timestampValue(deliveredAt) > timestampValue(current.latest_run_at) ? deliveredAt : current.latest_run_at,
      last_used_at: timestampValue(deliveredAt) > timestampValue(current.last_used_at) ? deliveredAt : current.last_used_at
    });
  }

  return Array.from(entries.values()).sort((left, right) => {
    return (
      timestampValue(right.latest_run_at || right.last_used_at || right.created_at) -
        timestampValue(left.latest_run_at || left.last_used_at || left.created_at) ||
      String(left.brand_key || "").localeCompare(String(right.brand_key || ""))
    );
  });
}

function deriveProjectsFromReports(reportItems, owner = {}) {
  const ownerUserId = sanitizeString(owner.owner_user_id || owner.ownerUserId, 128);
  const ownerEmail = sanitizeString(owner.owner_email || owner.ownerEmail, 320).toLowerCase();
  const entries = new Map();

  for (const report of Array.isArray(reportItems) ? reportItems : []) {
    const brandKey = sanitizeBrandKey(report?.brand_key);
    if (!brandKey || entries.has(brandKey)) {
      continue;
    }

    entries.set(brandKey, {
      owner_user_id: ownerUserId,
      owner_email: ownerEmail || null,
      brand_key: brandKey,
      brand_name: sanitizeString(report?.brand_name, 256) || null,
      target_url: normalizeProjectTargetUrl(report?.target_url) || null,
      metadata: {
        source: "report_backfill"
      },
      last_used_at: sanitizeString(report?.delivered_at, 128) || new Date().toISOString()
    });
  }

  return Array.from(entries.values());
}

async function listCanonicalQaProjects(filters = {}, options = {}) {
  const ownerUserId = sanitizeString(filters.owner_user_id || filters.ownerUserId, 128);
  if (!ownerUserId) {
    return { ok: false, status: 400, error: "owner_user_id is required" };
  }

  const ownerEmail = sanitizeString(filters.owner_email || filters.ownerEmail, 320).toLowerCase();
  const preferSavedProjects = options.preferSavedProjects === true;
  const savedProjectsResult = await listQaProjects({ owner_user_id: ownerUserId }, options);

  const canPersistSavedProjects = savedProjectsResult.ok;
  if (!savedProjectsResult.ok && !isMissingProjectsTableError(savedProjectsResult)) {
    return savedProjectsResult;
  }

  const savedProjects = savedProjectsResult.ok && Array.isArray(savedProjectsResult.items) ? savedProjectsResult.items : [];
  if (preferSavedProjects && savedProjects.length) {
    const items = buildCanonicalProjects(savedProjects, []);
    return {
      ok: true,
      status: 200,
      total: items.length,
      items,
      source: "saved_projects"
    };
  }

  const reportsResult = await listQaReports({ owner_user_id: ownerUserId, limit: "200", offset: "0" }, options);
  if (!reportsResult.ok) {
    return reportsResult;
  }

  const reportItems = Array.isArray(reportsResult.items) ? reportsResult.items : [];
  const savedKeys = new Set(savedProjects.map((project) => sanitizeBrandKey(project?.brand_key)));
  const missingProjects = deriveProjectsFromReports(reportItems, {
    owner_user_id: ownerUserId,
    owner_email: ownerEmail
  }).filter((project) => !savedKeys.has(project.brand_key));

  let mergedSavedProjects = savedProjects.slice();
  if (missingProjects.length && canPersistSavedProjects) {
    const upserted = await upsertQaProjects(missingProjects, {
      ...options,
      owner_user_id: ownerUserId,
      owner_email: ownerEmail
    });
    if (!upserted.ok) {
      return upserted;
    }
    mergedSavedProjects = mergedSavedProjects.concat(upserted.items || []);
  } else if (missingProjects.length) {
    mergedSavedProjects = mergedSavedProjects.concat(missingProjects);
  }

  const items = buildCanonicalProjects(mergedSavedProjects, reportItems);
  return {
    ok: true,
    status: 200,
    total: items.length,
    items,
    source: "canonical"
  };
}

module.exports = {
  isMissingProjectsTableError,
  listCanonicalQaProjects,
  listQaProjects,
  normalizeProjectRow,
  sanitizeBrandKey,
  upsertQaProjects
};
