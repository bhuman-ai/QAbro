#!/usr/bin/env node

const http = require("http");
const { URL } = require("url");
const { spawn } = require("child_process");
const { sanitizeString } = require("../lib/qa-core");
const { createQaApiClient } = require("../lib/qa-mcp");
const { resolveQaMcpAuthPath, clearQaMcpStoredAuth } = require("../lib/qa-mcp-auth");

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    mode: "signin",
    baseUrl: process.env.QA_MCP_BASE_URL || process.env.SWARMTESTER_BASE_URL || "https://swarmtester.com",
    host: "127.0.0.1",
    port: 0,
    email: "",
    inviteCode: "",
    openBrowser: true,
    timeoutSeconds: 900,
    authPath: process.env.QA_MCP_AUTH_PATH || "",
    reset: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    switch (key) {
      case "mode":
        args.mode = sanitizeString(next, 32).toLowerCase() || args.mode;
        index += 1;
        break;
      case "base-url":
        args.baseUrl = sanitizeString(next, 4096) || args.baseUrl;
        index += 1;
        break;
      case "host":
        args.host = sanitizeString(next, 128) || args.host;
        index += 1;
        break;
      case "port":
        args.port = Number.parseInt(String(next || ""), 10) || 0;
        index += 1;
        break;
      case "email":
        args.email = sanitizeString(next, 320).toLowerCase();
        index += 1;
        break;
      case "invite-code":
        args.inviteCode = sanitizeString(next, 128);
        index += 1;
        break;
      case "timeout-seconds":
        args.timeoutSeconds = Math.max(30, Number.parseInt(String(next || ""), 10) || args.timeoutSeconds);
        index += 1;
        break;
      case "auth-path":
        args.authPath = sanitizeString(next, 4096);
        index += 1;
        break;
      case "no-open":
        args.openBrowser = false;
        break;
      case "reset":
        args.reset = true;
        break;
      default:
        break;
    }
  }

  args.mode = args.mode === "signup" ? "signup" : "signin";
  return args;
}

function buildHelpText() {
  return [
    "SwarmTester QA MCP login",
    "",
    "Usage:",
    "  npm run mcp:qa:login -- [--mode signin|signup] [--email you@example.com] [--invite-code CODE]",
    "",
    "Options:",
    "  --base-url <url>         default: https://swarmtester.com",
    "  --host <host>            default: 127.0.0.1",
    "  --port <port>            default: 0 (ephemeral)",
    "  --timeout-seconds <n>    default: 900",
    "  --auth-path <path>       override local stored auth file path",
    "  --no-open                do not open the browser automatically",
    "  --reset                  clear stored MCP auth before starting login"
  ].join("\n");
}

function openBrowser(url) {
  const platform = process.platform;
  const commands =
    platform === "darwin"
      ? [["open", [url]]]
      : platform === "win32"
        ? [["cmd", ["/c", "start", "", url]]]
        : [["xdg-open", [url]]];

  for (const [command, args] of commands) {
    try {
      const child = spawn(command, args, {
        detached: true,
        stdio: "ignore"
      });
      child.unref();
      return true;
    } catch {
      // Try the next launcher.
    }
  }

  return false;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk.toString("utf8");
      if (raw.length > 20000) {
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload, origin) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(JSON.stringify(payload));
}

async function startLocalCallbackServer(options = {}) {
  const baseUrl = new URL(options.baseUrl);
  const origin = baseUrl.origin;
  const state = {
    resolved: false,
    result: null
  };

  const server = http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.end();
      return;
    }

    if (req.method !== "POST" || req.url !== "/callback") {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }

    try {
      const body = await readJsonBody(req);
      const accessToken = sanitizeString(body?.access_token || body?.accessToken, 4096);
      const refreshToken = sanitizeString(body?.refresh_token || body?.refreshToken, 4096);
      if (!accessToken || !refreshToken) {
        sendJson(res, 400, { ok: false, error: "Missing auth tokens" }, origin);
        return;
      }

      const apiClient = createQaApiClient({
        baseUrl: baseUrl.toString(),
        dashboardAccessToken: accessToken,
        dashboardRefreshToken: refreshToken,
        authPath: options.authPath
      });
      const session = await apiClient.getDashboardSession();
      if (!session.ok || !session.user?.id || !session.user?.email) {
        sendJson(res, 401, { ok: false, error: "Could not verify dashboard session" }, origin);
        return;
      }

      const stored = apiClient.persistDashboardSession({
        accessToken,
        refreshToken,
        user: session.user
      });

      state.resolved = true;
      state.result = {
        ok: true,
        user: session.user,
        stored
      };

      sendJson(
        res,
        200,
        {
          ok: true,
          message: "SwarmTester MCP is connected. You can close this tab.",
          user: session.user
        },
        origin
      );

      setTimeout(() => {
        server.close();
      }, 150);
    } catch (error) {
      sendJson(
        res,
        500,
        {
          ok: false,
          error: error instanceof Error ? error.message : "Could not complete MCP login"
        },
        origin
      );
    }
  });

  await new Promise((resolve, reject) => {
    server.listen(options.port || 0, options.host || "127.0.0.1", () => resolve());
    server.on("error", reject);
  });

  const address = server.address();
  if (!address || typeof address !== "object") {
    throw new Error("Could not start local MCP callback server");
  }

  const callbackUrl = `http://${options.host || "127.0.0.1"}:${address.port}/callback`;
  return {
    callbackUrl,
    server,
    waitForResult(timeoutSeconds = 900) {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          server.close();
          reject(new Error("Timed out waiting for MCP login to complete"));
        }, timeoutSeconds * 1000);

        const interval = setInterval(() => {
          if (!state.resolved) {
            return;
          }
          clearInterval(interval);
          clearTimeout(timeout);
          resolve(state.result);
        }, 250);
      });
    }
  };
}

function buildLoginUrl(options = {}) {
  const loginUrl = new URL("/dashboard", options.baseUrl);
  loginUrl.searchParams.set("mcp_callback", options.callbackUrl);
  loginUrl.searchParams.set("mode", options.mode === "signup" ? "signup" : "signin");
  if (options.email) {
    loginUrl.searchParams.set("email", options.email);
  }
  if (options.inviteCode) {
    loginUrl.searchParams.set("invite_code", options.inviteCode);
  }
  return loginUrl.toString();
}

async function main() {
  const args = parseArgs();
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    process.stdout.write(`${buildHelpText()}\n`);
    return;
  }

  if (args.reset) {
    clearQaMcpStoredAuth({ authPath: args.authPath });
  }

  const authPath = resolveQaMcpAuthPath({ authPath: args.authPath });
  const callbackServer = await startLocalCallbackServer({
    baseUrl: args.baseUrl,
    host: args.host,
    port: args.port,
    authPath
  });
  const loginUrl = buildLoginUrl({
    baseUrl: args.baseUrl,
    callbackUrl: callbackServer.callbackUrl,
    mode: args.mode,
    email: args.email,
    inviteCode: args.inviteCode
  });

  process.stdout.write(`Connect SwarmTester MCP by signing in here:\n${loginUrl}\n\n`);
  process.stdout.write(`Local auth file: ${authPath}\n`);

  if (args.openBrowser) {
    const opened = openBrowser(loginUrl);
    if (!opened) {
      process.stdout.write("Could not open the browser automatically. Open the URL above manually.\n");
    }
  }

  const result = await callbackServer.waitForResult(args.timeoutSeconds);
  process.stdout.write(
    `Connected as ${result.user.email || result.user.id}. Stored local MCP auth in ${authPath}\n`
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error("SwarmTester QA MCP login failed:", error);
    process.exit(1);
  });
}

module.exports = {
  buildHelpText,
  buildLoginUrl,
  parseArgs,
  startLocalCallbackServer
};
