const crypto = require("crypto");
const { isPlainObject, sanitizeString } = require("./qa-core");

const MCP_TOKEN_PREFIX = "mcp_";
const DEFAULT_TOKEN_NAME = "Coding agent MCP key";
const TOKEN_BYTES_PUBLIC = 9;
const TOKEN_BYTES_SECRET = 30;

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

function randomBase64Url(byteCount) {
  return crypto.randomBytes(byteCount).toString("base64url");
}

function generateMcpToken(options = {}) {
  const publicPart = sanitizeString(options.publicPart, 80) || randomBase64Url(TOKEN_BYTES_PUBLIC);
  const secretPart = sanitizeString(options.secretPart, 160) || randomBase64Url(TOKEN_BYTES_SECRET);
  return `${MCP_TOKEN_PREFIX}${publicPart}_${secretPart}`;
}

function isMcpBearerToken(value) {
  return sanitizeString(value, 4096).startsWith(MCP_TOKEN_PREFIX);
}

function hashMcpToken(token, options = {}) {
  const safeToken = sanitizeString(token, 4096);
  const pepper = sanitizeString(options.pepper || process.env.MCP_TOKEN_PEPPER || process.env.QA_MCP_TOKEN_PEPPER, 4096);
  if (!safeToken) {
    return "";
  }
  return crypto
    .createHash("sha256")
    .update(`${pepper}:${safeToken}`)
    .digest("hex");
}

function buildMcpTokenPrefix(token) {
  const safeToken = sanitizeString(token, 4096);
  if (!safeToken.startsWith(MCP_TOKEN_PREFIX)) {
    return "";
  }
  const parts = safeToken.slice(MCP_TOKEN_PREFIX.length).split("_");
  const publicPart = sanitizeString(parts[0], 80);
  if (!publicPart) {
    return MCP_TOKEN_PREFIX;
  }
  return `${MCP_TOKEN_PREFIX}${publicPart}`;
}

function normalizeMcpTokenName(value) {
  return sanitizeString(value, 80) || DEFAULT_TOKEN_NAME;
}

function sanitizeMcpTokenMetadata(value) {
  if (!isPlainObject(value)) {
    return {};
  }

  const metadata = {};
  let count = 0;
  for (const [key, rawValue] of Object.entries(value)) {
    if (count >= 12) {
      break;
    }
    const safeKey = sanitizeString(key, 80);
    if (!safeKey) {
      continue;
    }
    if (rawValue === null || ["string", "number", "boolean"].includes(typeof rawValue)) {
      metadata[safeKey] = typeof rawValue === "string" ? sanitizeString(rawValue, 512) : rawValue;
      count += 1;
    }
  }
  return metadata;
}

function sanitizeMcpTokenRow(row) {
  const safeRow = isPlainObject(row) ? row : {};
  const id = sanitizeString(safeRow.id, 128);
  if (!id) {
    return null;
  }
  const revokedAt = sanitizeString(safeRow.revoked_at || safeRow.revokedAt, 128) || null;
  return {
    id,
    name: normalizeMcpTokenName(safeRow.name),
    token_prefix: sanitizeString(safeRow.token_prefix || safeRow.tokenPrefix, 128) || MCP_TOKEN_PREFIX,
    created_at: sanitizeString(safeRow.created_at || safeRow.createdAt, 128) || null,
    last_used_at: sanitizeString(safeRow.last_used_at || safeRow.lastUsedAt, 128) || null,
    revoked_at: revokedAt,
    active: !revokedAt,
    metadata: sanitizeMcpTokenMetadata(safeRow.metadata)
  };
}

function sanitizeMcpTokenAuthRow(row) {
  const safeRow = isPlainObject(row) ? row : {};
  const summary = sanitizeMcpTokenRow(safeRow);
  if (!summary) {
    return null;
  }
  const ownerUserId = sanitizeString(safeRow.owner_user_id || safeRow.ownerUserId, 128);
  const ownerEmail = sanitizeString(safeRow.owner_email || safeRow.ownerEmail, 320).toLowerCase();
  if (!ownerUserId || !ownerEmail) {
    return null;
  }
  return {
    ...summary,
    owner_user_id: ownerUserId,
    owner_email: ownerEmail
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
  return {
    ok: false,
    status: response?.status || 500,
    error: sanitizeString(data?.message || data?.error || data?.hint, 256) || fallback
  };
}

async function listMcpTokens(filters = {}, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const ownerUserId = sanitizeString(filters.owner_user_id || filters.ownerUserId, 128);
  if (!ownerUserId) {
    return { ok: false, status: 400, error: "owner_user_id is required" };
  }

  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_mcp_tokens`);
  requestUrl.searchParams.set("select", "id,name,token_prefix,created_at,last_used_at,revoked_at,metadata");
  requestUrl.searchParams.set("owner_user_id", `eq.${ownerUserId}`);
  requestUrl.searchParams.set("order", "created_at.desc");
  requestUrl.searchParams.set("limit", "100");

  const response = await access.fetchImpl(requestUrl.toString(), {
    headers: buildSupabaseHeaders(access.serviceKey, "return=minimal")
  });
  const rows = await readJsonResponse(response);
  if (!response.ok || !Array.isArray(rows)) {
    return buildSupabaseError(response, rows, "Failed to load MCP tokens");
  }

  const items = rows.map(sanitizeMcpTokenRow).filter(Boolean);
  return { ok: true, status: 200, total: items.length, items };
}

async function createMcpToken(input = {}, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const ownerUserId = sanitizeString(input.owner_user_id || input.ownerUserId, 128);
  const ownerEmail = sanitizeString(input.owner_email || input.ownerEmail, 320).toLowerCase();
  if (!ownerUserId) {
    return { ok: false, status: 400, error: "owner_user_id is required" };
  }
  if (!ownerEmail) {
    return { ok: false, status: 400, error: "owner_email is required" };
  }

  const token = generateMcpToken(options);
  const row = {
    owner_user_id: ownerUserId,
    owner_email: ownerEmail,
    name: normalizeMcpTokenName(input.name),
    token_hash: hashMcpToken(token, options),
    token_prefix: buildMcpTokenPrefix(token),
    metadata: {
      ...sanitizeMcpTokenMetadata(input.metadata),
      created_by: "dashboard"
    }
  };

  const response = await access.fetchImpl(`${access.supabaseUrl}/rest/v1/swarmtest_mcp_tokens`, {
    method: "POST",
    headers: buildSupabaseHeaders(access.serviceKey),
    body: JSON.stringify(row)
  });
  const rows = await readJsonResponse(response);
  if (!response.ok || !Array.isArray(rows) || !rows[0]) {
    return buildSupabaseError(response, rows, "Failed to create MCP token");
  }

  const item = sanitizeMcpTokenRow(rows[0]);
  if (!item) {
    return { ok: false, status: 500, error: "Failed to create MCP token" };
  }

  return {
    ok: true,
    status: 201,
    token,
    item
  };
}

async function revokeMcpToken(input = {}, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const ownerUserId = sanitizeString(input.owner_user_id || input.ownerUserId, 128);
  const tokenId = sanitizeString(input.id || input.token_id || input.tokenId, 128);
  if (!ownerUserId) {
    return { ok: false, status: 400, error: "owner_user_id is required" };
  }
  if (!tokenId) {
    return { ok: false, status: 400, error: "token_id is required" };
  }

  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_mcp_tokens`);
  requestUrl.searchParams.set("id", `eq.${tokenId}`);
  requestUrl.searchParams.set("owner_user_id", `eq.${ownerUserId}`);

  const response = await access.fetchImpl(requestUrl.toString(), {
    method: "PATCH",
    headers: buildSupabaseHeaders(access.serviceKey),
    body: JSON.stringify({
      revoked_at: new Date().toISOString()
    })
  });
  const rows = await readJsonResponse(response);
  if (!response.ok || !Array.isArray(rows)) {
    return buildSupabaseError(response, rows, "Failed to revoke MCP token");
  }

  const item = rows.map(sanitizeMcpTokenRow).filter(Boolean)[0] || null;
  return { ok: true, status: 200, revoked: Boolean(item), item };
}

async function updateMcpTokenLastUsed(tokenId, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }
  const safeTokenId = sanitizeString(tokenId, 128);
  if (!safeTokenId) {
    return { ok: false, status: 400, error: "token_id is required" };
  }
  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_mcp_tokens`);
  requestUrl.searchParams.set("id", `eq.${safeTokenId}`);
  const response = await access.fetchImpl(requestUrl.toString(), {
    method: "PATCH",
    headers: buildSupabaseHeaders(access.serviceKey, "return=minimal"),
    body: JSON.stringify({
      last_used_at: new Date().toISOString()
    })
  });
  if (!response.ok) {
    const data = await readJsonResponse(response);
    return buildSupabaseError(response, data, "Failed to update MCP token usage");
  }
  return { ok: true, status: 200 };
}

async function verifyMcpToken(token, options = {}) {
  const safeToken = sanitizeString(token, 4096);
  if (!isMcpBearerToken(safeToken)) {
    return { ok: false, attempted: false, status: 401, error: "MCP token required" };
  }

  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_mcp_tokens`);
  requestUrl.searchParams.set(
    "select",
    "id,owner_user_id,owner_email,name,token_prefix,created_at,last_used_at,revoked_at,metadata"
  );
  requestUrl.searchParams.set("token_hash", `eq.${hashMcpToken(safeToken, options)}`);
  requestUrl.searchParams.set("revoked_at", "is.null");
  requestUrl.searchParams.set("limit", "1");

  const response = await access.fetchImpl(requestUrl.toString(), {
    headers: buildSupabaseHeaders(access.serviceKey, "return=minimal")
  });
  const rows = await readJsonResponse(response);
  if (!response.ok || !Array.isArray(rows)) {
    return buildSupabaseError(response, rows, "Failed to verify MCP token");
  }

  const item = sanitizeMcpTokenAuthRow(rows[0]);
  if (!item) {
    return { ok: false, attempted: true, status: 401, error: "Invalid MCP token" };
  }

  const updateUsage = options.updateUsage === false ? null : updateMcpTokenLastUsed(item.id, options);
  if (updateUsage && options.waitForUsageUpdate) {
    await updateUsage.catch(() => null);
  } else if (updateUsage) {
    updateUsage.catch(() => null);
  }

  return {
    ok: true,
    attempted: true,
    status: 200,
    token: item,
    user: {
      id: item.owner_user_id,
      email: item.owner_email,
      created_at: null,
      onboarding_seen: true
    },
    auth_type: "mcp_token",
    is_mcp_token: true,
    is_service_token: false,
    accessToken: null,
    refreshToken: null,
    refreshed: false
  };
}

module.exports = {
  MCP_TOKEN_PREFIX,
  buildMcpTokenPrefix,
  createMcpToken,
  generateMcpToken,
  hashMcpToken,
  isMcpBearerToken,
  listMcpTokens,
  normalizeMcpTokenName,
  revokeMcpToken,
  sanitizeMcpTokenRow,
  verifyMcpToken
};
