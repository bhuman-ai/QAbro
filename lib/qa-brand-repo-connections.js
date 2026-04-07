const crypto = require("crypto");

const { isPlainObject, sanitizeOptionalString, sanitizeString } = require("./qa-core");

const ALLOWED_CONNECTION_STATUSES = new Set([
  "pending_install",
  "awaiting_repo_selection",
  "connected",
  "error"
]);
const DEFAULT_PROVIDER = "github";

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

function sanitizeProvider(value) {
  return sanitizeString(value, 64).toLowerCase() || DEFAULT_PROVIDER;
}

function sanitizeConnectionStatus(value) {
  const status = sanitizeString(value, 64).toLowerCase();
  return ALLOWED_CONNECTION_STATUSES.has(status) ? status : "pending_install";
}

function sanitizeStringList(value, maxItems = 8, maxLength = 320) {
  const input = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/\r?\n|,/g)
        .map((item) => item.trim())
        .filter(Boolean);
  const items = [];
  const seen = new Set();
  for (const rawItem of input) {
    const safeItem = sanitizeString(rawItem, maxLength);
    if (!safeItem) {
      continue;
    }
    const dedupeKey = safeItem.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    items.push(safeItem);
    if (items.length >= maxItems) {
      break;
    }
  }
  return items;
}

function sanitizeConnectionMetadata(value) {
  return isPlainObject(value) ? value : {};
}

function normalizeBrandRepoConnectionRow(row, options = {}) {
  const safeRow = isPlainObject(row) ? row : {};
  return {
    id: sanitizeOptionalString(safeRow.id, 128) || null,
    owner_user_id: sanitizeOptionalString(safeRow.owner_user_id, 128) || null,
    owner_email: sanitizeOptionalString(safeRow.owner_email, 320) || null,
    brand_key: sanitizeString(safeRow.brand_key, 256),
    provider: sanitizeProvider(safeRow.provider),
    connection_status: sanitizeConnectionStatus(safeRow.connection_status),
    installation_id:
      Number.isFinite(Number(safeRow.installation_id)) && String(safeRow.installation_id).trim()
        ? Number(safeRow.installation_id)
        : null,
    installation_account_login: sanitizeOptionalString(safeRow.installation_account_login, 200) || null,
    installation_account_type: sanitizeOptionalString(safeRow.installation_account_type, 64) || null,
    installation_target_type: sanitizeOptionalString(safeRow.installation_target_type, 64) || null,
    installation_target_id:
      Number.isFinite(Number(safeRow.installation_target_id)) && String(safeRow.installation_target_id).trim()
        ? Number(safeRow.installation_target_id)
        : null,
    selected_repo_id:
      Number.isFinite(Number(safeRow.selected_repo_id)) && String(safeRow.selected_repo_id).trim()
        ? Number(safeRow.selected_repo_id)
        : null,
    selected_repo_owner: sanitizeOptionalString(safeRow.selected_repo_owner, 200) || null,
    selected_repo_name: sanitizeOptionalString(safeRow.selected_repo_name, 200) || null,
    selected_repo_full_name: sanitizeOptionalString(safeRow.selected_repo_full_name, 320) || null,
    default_branch: sanitizeOptionalString(safeRow.default_branch, 128) || null,
    path_allowlist: sanitizeStringList(safeRow.path_allowlist, 8, 320),
    pending_state_token:
      options.includeSecrets === true ? sanitizeOptionalString(safeRow.pending_state_token, 320) || null : null,
    pending_state_expires_at:
      options.includeSecrets === true
        ? sanitizeOptionalString(safeRow.pending_state_expires_at, 128) || null
        : null,
    connection: sanitizeConnectionMetadata(safeRow.connection),
    created_at: sanitizeOptionalString(safeRow.created_at, 128) || null,
    updated_at: sanitizeOptionalString(safeRow.updated_at, 128) || null
  };
}

function buildBrandRepoConnectionPayload(input, owner = {}) {
  const brandKey = sanitizeString(input?.brand_key || input?.brandKey, 256).toLowerCase();
  const ownerUserId = sanitizeString(owner.owner_user_id || owner.ownerUserId, 128);
  if (!brandKey || !ownerUserId) {
    return null;
  }

  const payload = {
    owner_user_id: ownerUserId,
    owner_email: sanitizeOptionalString(owner.owner_email || owner.ownerEmail, 320) || null,
    brand_key: brandKey,
    provider: sanitizeProvider(input?.provider)
  };

  if (input?.connection_status !== undefined || input?.connectionStatus !== undefined) {
    payload.connection_status = sanitizeConnectionStatus(input?.connection_status || input?.connectionStatus);
  }
  if (input?.installation_id !== undefined || input?.installationId !== undefined) {
    const installationId = Number(input?.installation_id || input?.installationId);
    payload.installation_id = Number.isFinite(installationId) ? installationId : null;
  }
  if (input?.installation_account_login !== undefined || input?.installationAccountLogin !== undefined) {
    payload.installation_account_login =
      sanitizeOptionalString(input?.installation_account_login || input?.installationAccountLogin, 200) || null;
  }
  if (input?.installation_account_type !== undefined || input?.installationAccountType !== undefined) {
    payload.installation_account_type =
      sanitizeOptionalString(input?.installation_account_type || input?.installationAccountType, 64) || null;
  }
  if (input?.installation_target_type !== undefined || input?.installationTargetType !== undefined) {
    payload.installation_target_type =
      sanitizeOptionalString(input?.installation_target_type || input?.installationTargetType, 64) || null;
  }
  if (input?.installation_target_id !== undefined || input?.installationTargetId !== undefined) {
    const targetId = Number(input?.installation_target_id || input?.installationTargetId);
    payload.installation_target_id = Number.isFinite(targetId) ? targetId : null;
  }
  if (input?.selected_repo_id !== undefined || input?.selectedRepoId !== undefined) {
    const repoId = Number(input?.selected_repo_id || input?.selectedRepoId);
    payload.selected_repo_id = Number.isFinite(repoId) ? repoId : null;
  }
  if (input?.selected_repo_owner !== undefined || input?.selectedRepoOwner !== undefined) {
    payload.selected_repo_owner =
      sanitizeOptionalString(input?.selected_repo_owner || input?.selectedRepoOwner, 200) || null;
  }
  if (input?.selected_repo_name !== undefined || input?.selectedRepoName !== undefined) {
    payload.selected_repo_name =
      sanitizeOptionalString(input?.selected_repo_name || input?.selectedRepoName, 200) || null;
  }
  if (input?.selected_repo_full_name !== undefined || input?.selectedRepoFullName !== undefined) {
    payload.selected_repo_full_name =
      sanitizeOptionalString(input?.selected_repo_full_name || input?.selectedRepoFullName, 320) || null;
  }
  if (input?.default_branch !== undefined || input?.defaultBranch !== undefined) {
    payload.default_branch =
      sanitizeOptionalString(input?.default_branch || input?.defaultBranch, 128) || null;
  }
  if (input?.path_allowlist !== undefined || input?.pathAllowlist !== undefined) {
    payload.path_allowlist = sanitizeStringList(input?.path_allowlist || input?.pathAllowlist, 8, 320);
  }
  if (input?.pending_state_token !== undefined || input?.pendingStateToken !== undefined) {
    payload.pending_state_token =
      sanitizeOptionalString(input?.pending_state_token || input?.pendingStateToken, 320) || null;
  }
  if (input?.pending_state_expires_at !== undefined || input?.pendingStateExpiresAt !== undefined) {
    payload.pending_state_expires_at =
      sanitizeOptionalString(input?.pending_state_expires_at || input?.pendingStateExpiresAt, 128) || null;
  }
  if (input?.connection !== undefined) {
    payload.connection = sanitizeConnectionMetadata(input.connection);
  }

  return payload;
}

async function upsertBrandRepoConnection(input, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const payload = buildBrandRepoConnectionPayload(input, options);
  if (!payload) {
    return { ok: false, status: 400, error: "owner_user_id and brand_key are required" };
  }

  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_brand_repo_connections`);
  requestUrl.searchParams.set("on_conflict", "owner_user_id,brand_key,provider");

  const response = await access.fetchImpl(requestUrl.toString(), {
    method: "POST",
    headers: buildSupabaseHeaders(access.serviceKey, "resolution=merge-duplicates,return=representation"),
    body: JSON.stringify([payload])
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
      status: response.status || 500,
      error: data?.message || "Failed to save brand repo connection",
      data
    };
  }

  return {
    ok: true,
    status: 200,
    row: normalizeBrandRepoConnectionRow(Array.isArray(data) ? data[0] : payload, {
      includeSecrets: options.includeSecrets === true
    })
  };
}

async function loadBrandRepoConnection(brandKey, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const safeBrandKey = sanitizeString(brandKey, 256).toLowerCase();
  const ownerUserId = sanitizeString(options.ownerUserId || options.owner_user_id, 128);
  if (!safeBrandKey || !ownerUserId) {
    return { ok: false, status: 400, error: "owner_user_id and brand_key are required" };
  }

  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_brand_repo_connections`);
  requestUrl.searchParams.set("select", "*");
  requestUrl.searchParams.set("owner_user_id", `eq.${ownerUserId}`);
  requestUrl.searchParams.set("brand_key", `eq.${safeBrandKey}`);
  requestUrl.searchParams.set("provider", `eq.${sanitizeProvider(options.provider)}`);
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
      status: response.status || 500,
      error: data?.message || "Failed to load brand repo connection",
      data
    };
  }

  const row = Array.isArray(data) && data[0] ? data[0] : null;
  if (!row) {
    return { ok: false, status: 404, error: "Brand repo connection not found" };
  }

  return {
    ok: true,
    status: 200,
    row: normalizeBrandRepoConnectionRow(row, {
      includeSecrets: options.includeSecrets === true
    })
  };
}

async function loadBrandRepoConnectionByStateToken(stateToken, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const safeStateToken = sanitizeString(stateToken, 320);
  if (!safeStateToken) {
    return { ok: false, status: 400, error: "state token is required" };
  }

  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_brand_repo_connections`);
  requestUrl.searchParams.set("select", "*");
  requestUrl.searchParams.set("pending_state_token", `eq.${safeStateToken}`);
  requestUrl.searchParams.set("provider", `eq.${sanitizeProvider(options.provider)}`);
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
      status: response.status || 500,
      error: data?.message || "Failed to load brand repo connection by state",
      data
    };
  }

  const row = Array.isArray(data) && data[0] ? data[0] : null;
  if (!row) {
    return { ok: false, status: 404, error: "Brand repo connection not found" };
  }

  return {
    ok: true,
    status: 200,
    row: normalizeBrandRepoConnectionRow(row, {
      includeSecrets: options.includeSecrets === true
    })
  };
}

async function listOwnerBrandRepoConnections(ownerUserId, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const safeOwnerUserId = sanitizeString(ownerUserId || options.ownerUserId || options.owner_user_id, 128);
  if (!safeOwnerUserId) {
    return { ok: false, status: 400, error: "owner_user_id is required" };
  }

  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_brand_repo_connections`);
  requestUrl.searchParams.set("select", "*");
  requestUrl.searchParams.set("owner_user_id", `eq.${safeOwnerUserId}`);
  requestUrl.searchParams.set("provider", `eq.${sanitizeProvider(options.provider)}`);
  requestUrl.searchParams.set("order", "updated_at.desc");
  requestUrl.searchParams.set("limit", String(Number.isFinite(Number(options.limit)) ? Number(options.limit) : 50));

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
      status: response.status || 500,
      error: data?.message || "Failed to list brand repo connections",
      data
    };
  }

  return {
    ok: true,
    status: 200,
    rows: Array.isArray(data)
      ? data.map((row) =>
          normalizeBrandRepoConnectionRow(row, {
            includeSecrets: options.includeSecrets === true
          })
        )
      : []
  };
}

async function deleteBrandRepoConnection(brandKey, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const safeBrandKey = sanitizeString(brandKey, 256).toLowerCase();
  const ownerUserId = sanitizeString(options.ownerUserId || options.owner_user_id, 128);
  if (!safeBrandKey || !ownerUserId) {
    return { ok: false, status: 400, error: "owner_user_id and brand_key are required" };
  }

  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_brand_repo_connections`);
  requestUrl.searchParams.set("owner_user_id", `eq.${ownerUserId}`);
  requestUrl.searchParams.set("brand_key", `eq.${safeBrandKey}`);
  requestUrl.searchParams.set("provider", `eq.${sanitizeProvider(options.provider)}`);

  const response = await access.fetchImpl(requestUrl.toString(), {
    method: "DELETE",
    headers: buildSupabaseHeaders(access.serviceKey, "return=representation")
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
      status: response.status || 500,
      error: data?.message || "Failed to delete brand repo connection",
      data
    };
  }

  return {
    ok: true,
    status: 200,
    row: Array.isArray(data) && data[0] ? normalizeBrandRepoConnectionRow(data[0]) : null
  };
}

function createPendingInstallStateToken() {
  return crypto.randomBytes(24).toString("hex");
}

function isPendingStateExpired(row) {
  const expiresAt = Date.parse(sanitizeOptionalString(row?.pending_state_expires_at, 128) || "");
  return Number.isFinite(expiresAt) ? expiresAt <= Date.now() : true;
}

module.exports = {
  DEFAULT_PROVIDER,
  normalizeBrandRepoConnectionRow,
  upsertBrandRepoConnection,
  loadBrandRepoConnection,
  loadBrandRepoConnectionByStateToken,
  listOwnerBrandRepoConnections,
  deleteBrandRepoConnection,
  createPendingInstallStateToken,
  isPendingStateExpired
};
