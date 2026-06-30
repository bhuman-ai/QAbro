#!/usr/bin/env node

const http = require("http");
const { createQaMcpServer } = require("./qa-mcp-server");
const { handleHostedMcpHttpRequest } = require("../lib/qa-mcp-hosted");

function sanitizeInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveHttpConfig() {
  const defaultHost = process.env.PORT ? "0.0.0.0" : "127.0.0.1";
  const host = String(process.env.QA_MCP_HTTP_HOST || process.env.HOST || defaultHost).trim() || defaultHost;
  const port = sanitizeInteger(process.env.QA_MCP_HTTP_PORT || process.env.PORT, 8788);
  const path = String(process.env.QA_MCP_HTTP_PATH || "/mcp").trim() || "/mcp";
  const allowedHosts = String(process.env.QA_MCP_HTTP_ALLOWED_HOSTS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    host,
    port,
    path: path.startsWith("/") ? path : `/${path}`,
    allowedHosts: allowedHosts.length ? allowedHosts : undefined
  };
}

function buildHelpText(config = resolveHttpConfig()) {
  return [
    "SwarmTester QA MCP hosted streamable HTTP server",
    "",
    "Environment:",
    "- QA_MCP_BASE_URL optional SwarmTester API base URL, default: https://swarmtester.com",
    "- SUPABASE_URL/SUPABASE_SERVICE_KEY/SUPABASE_ANON_KEY for dashboard-token auth",
    "- QA_SERVICE_TOKEN optional service-token auth; callers must also send x-owner-user-id and x-owner-email",
    `- QA_MCP_HTTP_HOST optional, default: ${config.host}`,
    `- QA_MCP_HTTP_PORT optional, default: ${config.port}`,
    `- QA_MCP_HTTP_PATH optional, default: ${config.path}`,
    "- QA_MCP_HTTP_ALLOWED_HOSTS optional comma-separated allowlist",
    "",
    "Caller auth:",
    "- Dashboard token: Authorization: Bearer <dashboard_access_token>",
    "- or dashboard headers: x-dashboard-access-token / x-dashboard-refresh-token",
    "- or service token: x-qa-service-token plus x-owner-user-id and x-owner-email"
  ].join("\n");
}

async function handleMcpHttpRequest(req, res) {
  try {
    await handleHostedMcpHttpRequest(req, res, {
      createQaMcpServer
    });
  } catch (error) {
    console.error("Error handling SwarmTester QA MCP request:", error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error"
        },
        id: null
      }));
    }
  }
}

async function main() {
  const config = resolveHttpConfig();
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    process.stdout.write(`${buildHelpText(config)}\n`);
    return;
  }

  const server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || `${config.host}:${config.port}`}`);
    const pathname = requestUrl.pathname;
    req.query = Object.fromEntries(requestUrl.searchParams.entries());

    if (config.allowedHosts) {
      const host = String(req.headers.host || "").split(":")[0].toLowerCase();
      const allowed = config.allowedHosts.map((item) => String(item || "").split(":")[0].toLowerCase());
      if (!allowed.includes(host)) {
        res.statusCode = 403;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: "Host is not allowed" }));
        return;
      }
    }

    if (pathname === "/health" && req.method === "GET") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({
          ok: true,
          service: "swarmtester-qa-mcp",
          transport: "streamable-http",
          mode: "hosted",
          path: config.path
        })
      );
      return;
    }

    if (pathname === config.path) {
      await handleMcpHttpRequest(req, res);
      return;
    }

    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false, error: "Not found" }));
  });

  await new Promise((resolve, reject) => {
    const listener = server.listen(config.port, config.host, () => {
      console.error(`SwarmTester QA MCP HTTP server listening on http://${config.host}:${config.port}${config.path}`);
      resolve(listener);
    });
    listener.on("error", reject);
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error("SwarmTester QA MCP HTTP server failed:", error);
    process.exit(1);
  });
}

module.exports = {
  buildHelpText,
  handleMcpHttpRequest,
  main,
  resolveHttpConfig
};
