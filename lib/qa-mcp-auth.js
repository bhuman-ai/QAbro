const fs = require("fs");
const os = require("os");
const path = require("path");
const { normalizeUrl, sanitizeString } = require("./qa-core");

function resolveQaMcpAuthPath(options = {}) {
  const explicit = sanitizeString(options.authPath || options.auth_path || process.env.QA_MCP_AUTH_PATH, 4096);
  if (explicit) {
    return explicit;
  }

  const codexHome = sanitizeString(process.env.CODEX_HOME, 4096);
  const baseDir = codexHome || path.join(os.homedir(), ".codex");
  return path.join(baseDir, "swarmtester", "qa-mcp-auth.json");
}

function normalizeStoredUser(rawUser) {
  const safeUser = rawUser && typeof rawUser === "object" ? rawUser : {};
  return {
    id: sanitizeString(safeUser.id, 128) || null,
    email: sanitizeString(safeUser.email, 320).toLowerCase() || null
  };
}

function normalizeQaMcpStoredAuth(input = {}) {
  const safe = input && typeof input === "object" ? input : {};
  const user = normalizeStoredUser(safe.user);
  return {
    version: 1,
    auth_type: "dashboard_session",
    base_url: normalizeUrl(safe.base_url || safe.baseUrl) || null,
    access_token: sanitizeString(safe.access_token || safe.accessToken, 4096) || null,
    refresh_token: sanitizeString(safe.refresh_token || safe.refreshToken, 4096) || null,
    owner_user_id: sanitizeString(safe.owner_user_id || safe.ownerUserId || user.id, 128) || null,
    owner_email: sanitizeString(safe.owner_email || safe.ownerEmail || user.email, 320).toLowerCase() || null,
    user,
    created_at: sanitizeString(safe.created_at || safe.createdAt, 128) || null,
    updated_at: sanitizeString(safe.updated_at || safe.updatedAt, 128) || null
  };
}

function readQaMcpStoredAuth(options = {}) {
  const authPath = resolveQaMcpAuthPath(options);
  try {
    const raw = fs.readFileSync(authPath, "utf8");
    const parsed = JSON.parse(raw);
    const auth = normalizeQaMcpStoredAuth(parsed);
    if (!auth.access_token && !auth.refresh_token) {
      return { ok: true, path: authPath, auth: null };
    }
    return { ok: true, path: authPath, auth };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return { ok: true, path: authPath, auth: null };
    }
    return {
      ok: false,
      path: authPath,
      error: error instanceof Error ? error.message : "Could not read stored QA MCP auth"
    };
  }
}

function writeQaMcpStoredAuth(input = {}, options = {}) {
  const authPath = resolveQaMcpAuthPath(options);
  const next = normalizeQaMcpStoredAuth({
    ...input,
    updated_at: new Date().toISOString(),
    created_at: sanitizeString(input.created_at || input.createdAt, 128) || new Date().toISOString()
  });

  if (!next.access_token && !next.refresh_token) {
    throw new Error("Stored QA MCP auth requires an access token or refresh token");
  }

  const dir = path.dirname(authPath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dir, 0o700);
  } catch {
    // Ignore chmod failures on unsupported filesystems.
  }

  const tmpPath = `${authPath}.tmp-${process.pid}`;
  fs.writeFileSync(tmpPath, JSON.stringify(next, null, 2), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tmpPath, authPath);
  try {
    fs.chmodSync(authPath, 0o600);
  } catch {
    // Ignore chmod failures on unsupported filesystems.
  }

  return {
    ok: true,
    path: authPath,
    auth: next
  };
}

function clearQaMcpStoredAuth(options = {}) {
  const authPath = resolveQaMcpAuthPath(options);
  try {
    fs.unlinkSync(authPath);
    return { ok: true, path: authPath, cleared: true };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return { ok: true, path: authPath, cleared: false };
    }
    return {
      ok: false,
      path: authPath,
      error: error instanceof Error ? error.message : "Could not clear stored QA MCP auth"
    };
  }
}

module.exports = {
  clearQaMcpStoredAuth,
  normalizeQaMcpStoredAuth,
  readQaMcpStoredAuth,
  resolveQaMcpAuthPath,
  writeQaMcpStoredAuth
};
