const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeHostedMcpAuthHeaders,
  resolveHostedMcpBaseUrl,
  resolveHostedMcpServerOptions
} = require("../lib/qa-mcp-hosted");
const { resolveHttpConfig } = require("../scripts/qa-mcp-http-server");

function withEnv(patch, fn) {
  const previous = {};
  for (const key of Object.keys(patch)) {
    previous[key] = process.env[key];
    if (patch[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = patch[key];
    }
  }

  try {
    return fn();
  } finally {
    for (const key of Object.keys(patch)) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

test("hosted MCP maps Authorization bearer to dashboard token when no service token header is present", () => {
  const req = {
    headers: {
      authorization: "Bearer dashboard_access_123"
    }
  };

  const result = normalizeHostedMcpAuthHeaders(req);

  assert.equal(result.bearer_mapped_to_dashboard_token, true);
  assert.equal(req.headers["x-dashboard-access-token"], "dashboard_access_123");
});

test("hosted MCP does not map MCP bearer tokens to dashboard tokens", () => {
  const req = {
    headers: {
      authorization: "Bearer mcp_public_secret"
    }
  };

  const result = normalizeHostedMcpAuthHeaders(req);

  assert.equal(result.bearer_mapped_to_dashboard_token, false);
  assert.equal(result.bearer_is_mcp_token, true);
  assert.equal(req.headers["x-dashboard-access-token"], undefined);
});

test("hosted MCP keeps explicit service-token header authoritative", () => {
  const req = {
    headers: {
      authorization: "Bearer dashboard_access_123",
      "x-qa-service-token": "svc_123"
    }
  };

  const result = normalizeHostedMcpAuthHeaders(req);

  assert.equal(result.bearer_mapped_to_dashboard_token, false);
  assert.equal(req.headers["x-dashboard-access-token"], undefined);
});

test("hosted MCP server options use dashboard auth tokens and configured API base URL", () => {
  const req = { headers: { host: "mcp.example.com", "x-forwarded-proto": "https" } };
  const auth = {
    is_service_token: false,
    accessToken: "access_123",
    refreshToken: "refresh_123",
    user: {
      id: "user_123",
      email: "owner@example.com"
    }
  };

  const options = resolveHostedMcpServerOptions(req, auth, {
    baseUrl: "https://swarmtester.com"
  });

  assert.equal(options.baseUrl, "https://swarmtester.com");
  assert.equal(options.dashboardAccessToken, "access_123");
  assert.equal(options.dashboardRefreshToken, "refresh_123");
  assert.equal(options.ownerUserId, "user_123");
  assert.equal(options.ownerEmail, "owner@example.com");
});

test("hosted MCP server options use service token auth with owner context", () => {
  const req = { headers: { host: "mcp.example.com", "x-forwarded-proto": "https" } };
  const auth = {
    is_service_token: true,
    user: {
      id: "user_123",
      email: "owner@example.com"
    }
  };

  const options = resolveHostedMcpServerOptions(req, auth, {
    baseUrl: "https://swarmtester.com",
    serviceToken: "svc_123"
  });

  assert.equal(options.baseUrl, "https://swarmtester.com");
  assert.equal(options.serviceToken, "svc_123");
  assert.equal(options.ownerUserId, "user_123");
  assert.equal(options.ownerEmail, "owner@example.com");
});

test("hosted MCP server options use service-token API calls after MCP token auth", () => {
  const req = { headers: { host: "mcp.example.com", "x-forwarded-proto": "https" } };
  const auth = {
    is_mcp_token: true,
    user: {
      id: "user_123",
      email: "owner@example.com"
    }
  };

  const options = resolveHostedMcpServerOptions(req, auth, {
    baseUrl: "https://swarmtester.com",
    serviceToken: "svc_123"
  });

  assert.equal(options.baseUrl, "https://swarmtester.com");
  assert.equal(options.serviceToken, "svc_123");
  assert.equal(options.dashboardAccessToken, undefined);
  assert.equal(options.ownerUserId, "user_123");
  assert.equal(options.ownerEmail, "owner@example.com");
});

test("hosted MCP base URL falls back to request host when no API base is configured", () => {
  const req = {
    headers: {
      host: "mcp.example.com",
      "x-forwarded-proto": "https"
    }
  };

  const baseUrl = withEnv(
    {
      QA_MCP_BASE_URL: undefined,
      SWARMTESTER_BASE_URL: undefined,
      QA_PUBLIC_APP_URL: undefined
    },
    () => resolveHostedMcpBaseUrl(req)
  );

  assert.equal(baseUrl, "https://mcp.example.com");
});

test("HTTP MCP server honors platform PORT with hosted bind defaults", () => {
  const config = withEnv(
    {
      PORT: "9090",
      QA_MCP_HTTP_HOST: undefined,
      QA_MCP_HTTP_PORT: undefined,
      HOST: undefined
    },
    () => resolveHttpConfig()
  );

  assert.equal(config.host, "0.0.0.0");
  assert.equal(config.port, 9090);
  assert.equal(config.path, "/mcp");
});
