#!/usr/bin/env node

const { createMcpExpressApp } = require("@modelcontextprotocol/sdk/server/express.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { createQaMcpServer } = require("./qa-mcp-server");

function sanitizeInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveHttpConfig() {
  const host = String(process.env.QA_MCP_HTTP_HOST || "127.0.0.1").trim() || "127.0.0.1";
  const port = sanitizeInteger(process.env.QA_MCP_HTTP_PORT, 8788);
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
    "SwarmTester QA MCP streamable HTTP server",
    "",
    "Environment:",
    "- QA_SERVICE_TOKEN",
    "- QA_MCP_OWNER_USER_ID",
    "- QA_MCP_OWNER_EMAIL",
    `- QA_MCP_HTTP_HOST optional, default: ${config.host}`,
    `- QA_MCP_HTTP_PORT optional, default: ${config.port}`,
    `- QA_MCP_HTTP_PATH optional, default: ${config.path}`,
    "- QA_MCP_HTTP_ALLOWED_HOSTS optional comma-separated allowlist"
  ].join("\n");
}

async function handleMcpHttpRequest(req, res) {
  const { server } = createQaMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined
  });
  res.on("close", () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling SwarmTester QA MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error"
        },
        id: null
      });
    }
  }
}

async function main() {
  const config = resolveHttpConfig();
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    process.stdout.write(`${buildHelpText(config)}\n`);
    return;
  }

  const app = createMcpExpressApp({
    host: config.host,
    allowedHosts: config.allowedHosts
  });

  app.post(config.path, handleMcpHttpRequest);
  app.get(config.path, async (_req, res) => {
    res.writeHead(405).end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Method not allowed."
        },
        id: null
      })
    );
  });
  app.delete(config.path, async (_req, res) => {
    res.writeHead(405).end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Method not allowed."
        },
        id: null
      })
    );
  });
  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "swarmtester-qa-mcp",
      transport: "streamable-http",
      path: config.path
    });
  });

  await new Promise((resolve, reject) => {
    const listener = app.listen(config.port, config.host, () => {
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
