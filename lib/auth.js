const crypto = require("crypto");
const { sanitizeString } = require("./qa-core");
const { normalizePromoCode, readRedeemedOffersFromMetadata } = require("./promo-offers");

const SESSION_ACCESS_COOKIE = "swarmtester_access_token";
const SESSION_REFRESH_COOKIE = "swarmtester_refresh_token";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;
const DEFAULT_INVITE_CODE = "BreakStuffFast";
const DEFAULT_AUTH_REDIRECT_BASE_URL = "https://beforeusersdo.com";
const SESSION_ACCESS_HEADER = "x-dashboard-access-token";
const SESSION_REFRESH_HEADER = "x-dashboard-refresh-token";
const REFRESHED_ACCESS_RESPONSE_HEADER = "x-swarmtester-access-token";
const REFRESHED_REFRESH_RESPONSE_HEADER = "x-swarmtester-refresh-token";

function secureCompare(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (!left.length || !right.length || left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function getConfiguredServiceToken(options = {}) {
  return sanitizeString(
    options.serviceToken || process.env.QA_SERVICE_TOKEN || process.env.SWARM_API_SERVICE_TOKEN,
    512
  );
}

function extractBearerToken(req) {
  const authHeader = sanitizeString(req?.headers?.authorization, 4096);
  if (!authHeader) {
    return "";
  }
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return sanitizeString(authHeader.slice(7), 512);
}

function extractServiceToken(req) {
  const headerToken = sanitizeString(
    req?.headers?.["x-qa-service-token"] ||
      req?.headers?.["x-service-token"] ||
      req?.headers?.["x-api-key"],
    512
  );
  if (headerToken) {
    return headerToken;
  }
  return extractBearerToken(req);
}

function resolveServiceActor(req, options = {}) {
  const ownerUserId = sanitizeString(
    options.ownerUserId ||
      options.owner_user_id ||
      req?.headers?.["x-owner-user-id"] ||
      req?.headers?.["x-user-id"] ||
      req?.query?.owner_user_id ||
      req?.query?.ownerUserId,
    128
  );
  const ownerEmail = sanitizeEmail(
    options.ownerEmail ||
      options.owner_email ||
      req?.headers?.["x-owner-email"] ||
      req?.query?.owner_email ||
      req?.query?.ownerEmail
  );

  return {
    id: ownerUserId || null,
    email: ownerEmail || null,
    created_at: null,
    onboarding_seen: true
  };
}

function tryServiceTokenAuth(req, options = {}) {
  const configuredToken = getConfiguredServiceToken(options);
  if (!configuredToken) {
    return { ok: false, attempted: false };
  }

  const providedToken = extractServiceToken(req);
  if (!providedToken) {
    return { ok: false, attempted: false };
  }

  if (!secureCompare(providedToken, configuredToken)) {
    return {
      ok: false,
      attempted: true,
      status: 401,
      error: "Invalid service token"
    };
  }

  return {
    ok: true,
    attempted: true,
    status: 200,
    accessToken: null,
    user: resolveServiceActor(req, options),
    refreshed: false,
    auth_type: "service_token",
    is_service_token: true
  };
}

function sanitizeEmail(value) {
  return sanitizeString(value, 320).toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPassword(password) {
  const safePassword = sanitizeString(password, 256);
  return safePassword.length >= 8;
}

function normalizeUrl(value) {
  const raw = sanitizeString(value, 4096);
  if (!raw) {
    return null;
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function isLocalhostHostname(hostname) {
  const value = sanitizeString(hostname, 256).toLowerCase();
  return value === "localhost" || value === "127.0.0.1" || value === "::1" || value.endsWith(".localhost");
}

function getSupabaseAuthConfig(options = {}) {
  const supabaseUrl = sanitizeString(options.supabaseUrl || process.env.SUPABASE_URL, 4096).replace(/\/$/, "");
  const serviceKey = sanitizeString(options.serviceKey || process.env.SUPABASE_SERVICE_KEY, 4096);
  const anonKey = sanitizeString(options.anonKey || process.env.SUPABASE_ANON_KEY, 4096);
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  if (!supabaseUrl || (!serviceKey && !anonKey)) {
    return { ok: false, status: 500, error: "Server is not configured" };
  }

  if (typeof fetchImpl !== "function") {
    return { ok: false, status: 500, error: "fetch is not available" };
  }

  return {
    ok: true,
    supabaseUrl,
    serviceKey,
    authApiKey: anonKey || serviceKey,
    fetchImpl
  };
}

function getInviteCode() {
  return sanitizeString(process.env.DASHBOARD_INVITE_CODE, 128) || DEFAULT_INVITE_CODE;
}

function getMagicLinkRedirectBaseUrl(req) {
  const configured = normalizeUrl(
    process.env.AUTH_MAGIC_LINK_REDIRECT_BASE_URL || process.env.AUTH_MAGIC_LINK_REDIRECT_URL || process.env.QA_PUBLIC_APP_URL
  );
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  const forwardedProto = sanitizeString(req?.headers?.["x-forwarded-proto"], 64).split(",")[0].trim().toLowerCase();
  const protocol = forwardedProto === "http" ? "http" : "https";
  const host = sanitizeString(req?.headers?.["x-forwarded-host"] || req?.headers?.host, 512).split(",")[0].trim();
  if (!host) {
    return DEFAULT_AUTH_REDIRECT_BASE_URL;
  }

  const candidate = normalizeUrl(`${protocol}://${host}`);
  if (!candidate) {
    return DEFAULT_AUTH_REDIRECT_BASE_URL;
  }

  try {
    const parsed = new URL(candidate);
    const isHostedEnv = sanitizeString(process.env.VERCEL_ENV, 64).toLowerCase() === "production";
    if (isHostedEnv && isLocalhostHostname(parsed.hostname)) {
      return DEFAULT_AUTH_REDIRECT_BASE_URL;
    }
    return candidate.replace(/\/$/, "");
  } catch {
    return DEFAULT_AUTH_REDIRECT_BASE_URL;
  }
}

function resolveMagicLinkRedirectTo(req, rawValue) {
  const baseUrl = getMagicLinkRedirectBaseUrl(req);
  const fallbackUrl = new URL("/", baseUrl);
  fallbackUrl.searchParams.set("auth_callback", "1");
  const fallback = fallbackUrl.toString();
  const candidate = sanitizeString(rawValue, 2048);
  if (!candidate) {
    return fallback;
  }

  try {
    const base = new URL(baseUrl);
    const parsed = new URL(candidate, baseUrl);
    if (parsed.origin !== base.origin) {
      return fallback;
    }
    const isHostedEnv = sanitizeString(process.env.VERCEL_ENV, 64).toLowerCase() === "production";
    if (isHostedEnv && isLocalhostHostname(parsed.hostname)) {
      return fallback;
    }
    return parsed.toString();
  } catch {
    return fallback;
  }
}

function normalizeOAuthProvider(value) {
  const provider = sanitizeString(value, 32).toLowerCase();
  return provider === "google" || provider === "github" ? provider : "";
}

function buildOAuthAuthorizeUrl(supabaseUrl, provider, redirectTo) {
  const normalizedProvider = normalizeOAuthProvider(provider);
  const normalizedSupabaseUrl = normalizeUrl(supabaseUrl);
  const normalizedRedirectTo = normalizeUrl(redirectTo);
  if (!normalizedProvider || !normalizedSupabaseUrl || !normalizedRedirectTo) {
    return "";
  }

  const authorizeUrl = new URL("/auth/v1/authorize", normalizedSupabaseUrl);
  authorizeUrl.searchParams.set("provider", normalizedProvider);
  authorizeUrl.searchParams.set("redirect_to", normalizedRedirectTo);
  return authorizeUrl.toString();
}

function parseCookieHeader(cookieHeader) {
  const raw = sanitizeString(cookieHeader, 8000);
  if (!raw) {
    return {};
  }

  const pairs = raw.split(";");
  const cookies = {};
  for (const pair of pairs) {
    const [rawKey, ...rawValueParts] = pair.split("=");
    const key = sanitizeString(rawKey, 128);
    if (!key) {
      continue;
    }
    const value = sanitizeString(rawValueParts.join("="), 4096);
    cookies[key] = value;
  }
  return cookies;
}

function readAuthCookies(req) {
  const cookies = parseCookieHeader(req?.headers?.cookie);
  return {
    accessToken: sanitizeString(cookies[SESSION_ACCESS_COOKIE], 4096),
    refreshToken: sanitizeString(cookies[SESSION_REFRESH_COOKIE], 4096)
  };
}

function readAuthHeaderTokens(req) {
  return {
    accessToken: sanitizeString(req?.headers?.[SESSION_ACCESS_HEADER], 4096),
    refreshToken: sanitizeString(req?.headers?.[SESSION_REFRESH_HEADER], 4096)
  };
}

function readAuthTokens(req) {
  const headerTokens = readAuthHeaderTokens(req);
  if (headerTokens.accessToken || headerTokens.refreshToken) {
    return {
      accessToken: headerTokens.accessToken,
      refreshToken: headerTokens.refreshToken,
      source: "header"
    };
  }

  const cookieTokens = readAuthCookies(req);
  return {
    accessToken: cookieTokens.accessToken,
    refreshToken: cookieTokens.refreshToken,
    source: "cookie"
  };
}

function isSecureRequest(req) {
  const forwardedProto = sanitizeString(req?.headers?.["x-forwarded-proto"], 64).toLowerCase();
  if (forwardedProto.includes("https")) {
    return true;
  }

  const host = sanitizeString(req?.headers?.["x-forwarded-host"] || req?.headers?.host, 256).toLowerCase();
  if (!host || host.includes("localhost") || host.includes("127.0.0.1")) {
    return false;
  }

  return true;
}

function buildCookie(name, value, options = {}) {
  const safeName = sanitizeString(name, 128);
  const safeValue = sanitizeString(value, 4096);
  const parts = [`${safeName}=${encodeURIComponent(safeValue)}`];
  parts.push(`Path=${options.path || "/"}`);
  parts.push(`Max-Age=${Number.isFinite(options.maxAge) ? Math.max(0, Math.floor(options.maxAge)) : 0}`);
  parts.push(`SameSite=${options.sameSite || "Lax"}`);
  if (options.httpOnly !== false) {
    parts.push("HttpOnly");
  }
  if (options.secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

function setSessionCookies(res, req, session) {
  const secure = isSecureRequest(req);
  const accessToken = sanitizeString(session?.access_token, 4096);
  const refreshToken = sanitizeString(session?.refresh_token, 4096);

  const cookies = [];
  cookies.push(
    buildCookie(SESSION_ACCESS_COOKIE, accessToken, {
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
      sameSite: "Lax",
      secure
    })
  );

  if (refreshToken) {
    cookies.push(
      buildCookie(SESSION_REFRESH_COOKIE, refreshToken, {
        path: "/",
        maxAge: SESSION_MAX_AGE_SECONDS,
        sameSite: "Lax",
        secure
      })
    );
  } else {
    cookies.push(
      buildCookie(SESSION_REFRESH_COOKIE, "", {
        path: "/",
        maxAge: 0,
        sameSite: "Lax",
        secure
      })
    );
  }

  res.setHeader("Set-Cookie", cookies);
}

function clearSessionCookies(res, req) {
  const secure = isSecureRequest(req);
  res.setHeader("Set-Cookie", [
    buildCookie(SESSION_ACCESS_COOKIE, "", {
      path: "/",
      maxAge: 0,
      sameSite: "Lax",
      secure
    }),
    buildCookie(SESSION_REFRESH_COOKIE, "", {
      path: "/",
      maxAge: 0,
      sameSite: "Lax",
      secure
    })
  ]);
}

function setRefreshedSessionHeaders(res, session) {
  if (!res || typeof res.setHeader !== "function") {
    return;
  }
  const accessToken = sanitizeString(session?.access_token, 4096);
  const refreshToken = sanitizeString(session?.refresh_token, 4096);
  if (accessToken) {
    res.setHeader(REFRESHED_ACCESS_RESPONSE_HEADER, accessToken);
  }
  if (refreshToken) {
    res.setHeader(REFRESHED_REFRESH_RESPONSE_HEADER, refreshToken);
  }
}

async function parseResponseJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function fetchSupabaseUser(accessToken, config) {
  const response = await config.fetchImpl(`${config.supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: config.authApiKey,
      Authorization: `Bearer ${accessToken}`
    }
  });

  const data = await parseResponseJson(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: sanitizeString(data?.error_description || data?.msg || data?.message, 256) || "Unauthorized"
    };
  }

  return {
    ok: true,
    status: 200,
    user: data && typeof data === "object" ? data : null
  };
}

async function refreshSession(refreshToken, config) {
  const response = await config.fetchImpl(`${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: config.authApiKey,
      Authorization: `Bearer ${config.authApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      refresh_token: refreshToken
    })
  });

  const data = await parseResponseJson(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: sanitizeString(data?.error_description || data?.msg || data?.message, 256) || "Unauthorized"
    };
  }

  return {
    ok: true,
    status: 200,
    session: data && typeof data === "object" ? data : null
  };
}

function sanitizePublicUser(user) {
  const safeUser = user && typeof user === "object" ? user : {};
  const metadata = safeUser.user_metadata && typeof safeUser.user_metadata === "object" ? safeUser.user_metadata : {};
  const appMetadata = safeUser.app_metadata && typeof safeUser.app_metadata === "object" ? safeUser.app_metadata : {};
  const onboardingSeen =
    metadata.swarm_onboarding_seen === true ||
    metadata.swarm_onboarding_seen === "true" ||
    metadata.onboarding_seen === true ||
    metadata.onboarding_seen === "true";
  return {
    id: sanitizeString(safeUser.id, 128) || null,
    email: sanitizeEmail(safeUser.email),
    created_at: sanitizeString(safeUser.created_at, 128) || null,
    onboarding_seen: Boolean(onboardingSeen),
    ...(appMetadata.report_admin === true ? { report_admin: true } : {}),
    pending_offer_code: normalizePromoCode(metadata.swarm_pending_offer_code) || null,
    redeemed_offers: readRedeemedOffersFromMetadata(metadata)
  };
}

async function resolveAuthSession(req, res, options = {}) {
  const config = getSupabaseAuthConfig(options);
  if (!config.ok) {
    return config;
  }

  const allowRefresh = options.allowRefresh !== false;
  const { accessToken, refreshToken, source } = readAuthTokens(req);

  if (accessToken) {
    const userResult = await fetchSupabaseUser(accessToken, config);
    if (userResult.ok) {
      return {
        ok: true,
        status: 200,
        accessToken,
        refreshToken,
        user: sanitizePublicUser(userResult.user),
        refreshed: false,
        auth_source: source
      };
    }
  }

  if (!allowRefresh || !refreshToken) {
    if (source === "cookie") {
      clearSessionCookies(res, req);
    }
    return { ok: false, status: 401, error: "Authentication required" };
  }

  const refreshed = await refreshSession(refreshToken, config);
  if (!refreshed.ok) {
    if (source === "cookie") {
      clearSessionCookies(res, req);
    }
    return { ok: false, status: 401, error: "Authentication required" };
  }

  const refreshedAccessToken = sanitizeString(refreshed.session?.access_token, 4096);
  if (!refreshedAccessToken) {
    if (source === "cookie") {
      clearSessionCookies(res, req);
    }
    return { ok: false, status: 401, error: "Authentication required" };
  }

  if (source === "cookie") {
    setSessionCookies(res, req, refreshed.session);
  } else {
    setRefreshedSessionHeaders(res, refreshed.session);
  }
  const user = sanitizePublicUser(refreshed.session?.user || null);
  return {
    ok: true,
    status: 200,
    accessToken: refreshedAccessToken,
    refreshToken: sanitizeString(refreshed.session?.refresh_token, 4096) || refreshToken,
    user,
    refreshed: true,
    auth_source: source
  };
}

async function requireDashboardAuth(req, res, options = {}) {
  const session = await resolveAuthSession(req, res, options);
  if (!session.ok) {
    return session;
  }
  return {
    ...session,
    auth_type: "dashboard_session",
    is_service_token: false
  };
}

async function requireDashboardOrServiceAuth(req, res, options = {}) {
  const serviceAuth = tryServiceTokenAuth(req, options);
  if (serviceAuth.ok) {
    return serviceAuth;
  }

  if (serviceAuth.attempted && options.rejectInvalidServiceToken !== false) {
    return {
      ok: false,
      status: 401,
      error: serviceAuth.error || "Authentication required"
    };
  }

  return requireDashboardAuth(req, res, options);
}

module.exports = {
  REFRESHED_ACCESS_RESPONSE_HEADER,
  REFRESHED_REFRESH_RESPONSE_HEADER,
  SESSION_ACCESS_HEADER,
  SESSION_ACCESS_COOKIE,
  SESSION_REFRESH_HEADER,
  SESSION_REFRESH_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  sanitizeEmail,
  isValidEmail,
  isValidPassword,
  getSupabaseAuthConfig,
  getInviteCode,
  getMagicLinkRedirectBaseUrl,
  resolveMagicLinkRedirectTo,
  normalizeOAuthProvider,
  buildOAuthAuthorizeUrl,
  readAuthHeaderTokens,
  setSessionCookies,
  clearSessionCookies,
  setRefreshedSessionHeaders,
  sanitizePublicUser,
  resolveAuthSession,
  requireDashboardAuth,
  requireDashboardOrServiceAuth,
  tryServiceTokenAuth,
  getConfiguredServiceToken
};
