const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { requireDashboardOrServiceAuth } = require("./auth");
const { isMcpBearerToken, verifyMcpToken } = require("./qa-mcp-tokens");
const {
  getPublicBaseUrl,
  normalizeUrl,
  parseRequestBody,
  sanitizeString
} = require("./qa-core");

function getHeader(req, name) {
  const headers = req?.headers || {};
  const direct = headers[name] || headers[name.toLowerCase()];
  if (Array.isArray(direct)) {
    return direct[0] || "";
  }
  return direct || "";
}

function setHeaderIfMissing(req, name, value) {
  if (!req || !req.headers || !name || !value) {
    return;
  }
  const lowerName = name.toLowerCase();
  if (req.headers[name] || req.headers[lowerName]) {
    return;
  }
  req.headers[lowerName] = value;
}

function extractBearerToken(req) {
  const authHeader = sanitizeString(getHeader(req, "authorization"), 4096);
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return sanitizeString(authHeader.slice(7), 4096);
}

function normalizeHostedMcpAuthHeaders(req) {
  const bearerToken = extractBearerToken(req);
  if (!bearerToken) {
    return { bearer_mapped_to_dashboard_token: false, bearer_is_mcp_token: false };
  }

  const hasDashboardAccessToken = Boolean(getHeader(req, "x-dashboard-access-token"));
  const hasServiceToken = Boolean(getHeader(req, "x-qa-service-token") || getHeader(req, "x-service-token") || getHeader(req, "x-api-key"));
  if (isMcpBearerToken(bearerToken) && !hasDashboardAccessToken && !hasServiceToken) {
    return { bearer_mapped_to_dashboard_token: false, bearer_is_mcp_token: true };
  }

  if (!hasDashboardAccessToken && !hasServiceToken) {
    setHeaderIfMissing(req, "x-dashboard-access-token", bearerToken);
    return { bearer_mapped_to_dashboard_token: true, bearer_is_mcp_token: false };
  }

  return { bearer_mapped_to_dashboard_token: false, bearer_is_mcp_token: isMcpBearerToken(bearerToken) };
}

function resolveHostedMcpBaseUrl(req, options = {}) {
  const configured =
    normalizeUrl(
      options.baseUrl ||
        options.base_url ||
        process.env.QA_MCP_BASE_URL ||
        process.env.SWARMTESTER_BASE_URL ||
        process.env.QA_PUBLIC_APP_URL
    ) || "";
  return (configured || getPublicBaseUrl(req)).replace(/\/$/, "");
}

function resolveHostedMcpServerOptions(req, auth, options = {}) {
  const baseUrl = resolveHostedMcpBaseUrl(req, options);
  const ownerUserId = sanitizeString(auth?.user?.id, 128);
  const ownerEmail = sanitizeString(auth?.user?.email, 320).toLowerCase();

  if (auth?.is_service_token || auth?.is_mcp_token) {
    return {
      baseUrl,
      serviceToken: sanitizeString(options.serviceToken || process.env.QA_SERVICE_TOKEN || process.env.SWARM_API_SERVICE_TOKEN, 512),
      ownerUserId,
      ownerEmail,
      defaultBrand: sanitizeString(options.defaultBrand || process.env.QA_MCP_DEFAULT_BRAND, 256),
      defaultPersona: sanitizeString(options.defaultPersona || process.env.QA_MCP_DEFAULT_PERSONA, 500),
      defaultExecutionEngine: sanitizeString(
        options.defaultExecutionEngine || process.env.QA_MCP_DEFAULT_EXECUTION_ENGINE,
        64
      )
    };
  }

  return {
    baseUrl,
    dashboardAccessToken: sanitizeString(auth?.accessToken, 4096),
    dashboardRefreshToken: sanitizeString(auth?.refreshToken, 4096),
    ownerUserId,
    ownerEmail,
    defaultBrand: sanitizeString(options.defaultBrand || process.env.QA_MCP_DEFAULT_BRAND, 256),
    defaultPersona: sanitizeString(options.defaultPersona || process.env.QA_MCP_DEFAULT_PERSONA, 500),
    defaultExecutionEngine: sanitizeString(options.defaultExecutionEngine || process.env.QA_MCP_DEFAULT_EXECUTION_ENGINE, 64)
  };
}

function sendJson(res, statusCode, payload) {
  if (typeof res.status === "function" && typeof res.json === "function") {
    return res.status(statusCode).json(payload);
  }
  res.statusCode = statusCode;
  if (typeof res.setHeader === "function") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
  }
  res.end(JSON.stringify(payload));
  return res;
}

function setCorsHeaders(req, res) {
  const origin = sanitizeString(getHeader(req, "origin"), 4096);
  if (!origin || typeof res.setHeader !== "function") {
    return;
  }
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    [
      "Content-Type",
      "Authorization",
      "x-dashboard-access-token",
      "x-dashboard-refresh-token",
      "x-qa-service-token",
      "x-service-token",
      "x-api-key",
      "x-owner-user-id",
      "x-owner-email",
      "mcp-session-id"
    ].join(", ")
  );
}

async function authenticateHostedMcpRequest(req, res, options = {}) {
  const bearerToken = extractBearerToken(req);
  const hasDashboardAccessToken = Boolean(getHeader(req, "x-dashboard-access-token"));
  const hasServiceToken = Boolean(getHeader(req, "x-qa-service-token") || getHeader(req, "x-service-token") || getHeader(req, "x-api-key"));
  if (isMcpBearerToken(bearerToken) && !hasDashboardAccessToken && !hasServiceToken) {
    return verifyMcpToken(bearerToken, options);
  }

  normalizeHostedMcpAuthHeaders(req);
  return requireDashboardOrServiceAuth(req, res, {
    allowRefresh: true,
    rejectInvalidServiceToken: false,
    serviceToken: options.serviceToken
  });
}

async function handleHostedMcpHttpRequest(req, res, options = {}) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end("");
    return;
  }

  if (req.method !== "POST") {
    if (typeof res.setHeader === "function") {
      res.setHeader("Allow", "POST, OPTIONS");
    }
    return sendJson(res, 405, {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed."
      },
      id: null
    });
  }

  const auth = await authenticateHostedMcpRequest(req, res, options);
  if (!auth.ok) {
    return sendJson(res, auth.status || 401, {
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message: auth.error || "Authentication required"
      },
      id: null
    });
  }

  const parsedBody = await parseRequestBody(req);
  const createServer = options.createQaMcpServer;
  if (typeof createServer !== "function") {
    throw new Error("createQaMcpServer is required");
  }

  const { server } = createServer(resolveHostedMcpServerOptions(req, auth, options));
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined
  });

  res.on?.("close", () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, parsedBody);
}

module.exports = {
  authenticateHostedMcpRequest,
  extractBearerToken,
  handleHostedMcpHttpRequest,
  normalizeHostedMcpAuthHeaders,
  resolveHostedMcpBaseUrl,
  resolveHostedMcpServerOptions
};
