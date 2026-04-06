const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const INDEX_HTML_PATH = path.join(ROOT, "index.html");
const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const MAX_BODY_BYTES = Number.parseInt(process.env.DEV_SERVER_MAX_BODY_BYTES || "", 10) || 25 * 1024 * 1024;
let activePort = PORT;

function loadEnvFileIfPresent(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1);
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function loadLocalEnv() {
  loadEnvFileIfPresent(path.resolve(ROOT, ".env.local"));
  loadEnvFileIfPresent(path.resolve(ROOT, ".env.worker"));
  loadEnvFileIfPresent(path.resolve(ROOT, ".tmp/vercel.env"));
  loadEnvFileIfPresent(path.resolve(ROOT, ".env"));
}

function clearProjectRequireCache() {
  for (const moduleId of Object.keys(require.cache)) {
    if (moduleId === __filename) {
      continue;
    }
    if (!moduleId.startsWith(ROOT)) {
      continue;
    }
    if (moduleId.includes(`${path.sep}node_modules${path.sep}`)) {
      continue;
    }
    delete require.cache[moduleId];
  }
}

async function readRequestBody(req) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(String(req.method || "").toUpperCase())) {
    return undefined;
  }

  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > MAX_BODY_BYTES) {
      const error = new Error(`Request body exceeded ${MAX_BODY_BYTES} bytes`);
      error.statusCode = 413;
      throw error;
    }
    chunks.push(buffer);
  }

  if (!chunks.length) {
    return undefined;
  }

  const rawBuffer = Buffer.concat(chunks);
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  const rawText = rawBuffer.toString("utf8");

  if (contentType.includes("application/json")) {
    return rawText ? JSON.parse(rawText) : {};
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(rawText).entries());
  }

  return rawText;
}

function decorateRequest(req) {
  const requestUrl = new URL(req.url || "/", "http://localhost");
  req.query = Object.fromEntries(requestUrl.searchParams.entries());
  req.headers["x-forwarded-host"] = req.headers["x-forwarded-host"] || req.headers.host || `localhost:${activePort}`;
  req.headers["x-forwarded-proto"] = req.headers["x-forwarded-proto"] || "http";
  return req;
}

function decorateResponse(res) {
  res.status = (statusCode) => {
    res.statusCode = statusCode;
    return res;
  };

  res.json = (payload) => {
    if (!res.headersSent) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    res.end(JSON.stringify(payload));
    return res;
  };

  res.send = (payload) => {
    if (payload === undefined || payload === null) {
      res.end("");
      return res;
    }

    if (Buffer.isBuffer(payload) || payload instanceof Uint8Array) {
      res.end(payload);
      return res;
    }

    if (typeof payload === "object") {
      return res.json(payload);
    }

    if (!res.headersSent && !res.getHeader("Content-Type")) {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
    }
    res.end(String(payload));
    return res;
  };

  res.redirect = (statusOrLocation, maybeLocation) => {
    const statusCode = typeof statusOrLocation === "number" ? statusOrLocation : 302;
    const location = typeof statusOrLocation === "number" ? maybeLocation : statusOrLocation;
    if (location) {
      res.setHeader("Location", location);
    }
    res.statusCode = statusCode;
    res.end("");
    return res;
  };

  return res;
}

function resolveApiHandlerPath(pathname) {
  if (!pathname.startsWith("/api/")) {
    return null;
  }

  const filePath = path.join(ROOT, pathname.replace(/^\/+/, "")) + ".js";
  const normalized = path.normalize(filePath);
  if (!normalized.startsWith(path.join(ROOT, "api"))) {
    return null;
  }

  return normalized;
}

async function handleApiRequest(req, res, vite) {
  const pathname = new URL(req.url || "/", "http://localhost").pathname;
  const handlerPath = resolveApiHandlerPath(pathname);
  if (!handlerPath || !fs.existsSync(handlerPath)) {
    return res.status(404).json({ ok: false, error: "API route not found" });
  }

  try {
    req.body = await readRequestBody(req);
  } catch (error) {
    const statusCode = Number.isFinite(error?.statusCode) ? error.statusCode : 400;
    return res.status(statusCode).json({
      ok: false,
      error: error instanceof Error ? error.message : "Invalid request body"
    });
  }

  try {
    clearProjectRequireCache();
    const handler = require(handlerPath);
    if (typeof handler !== "function") {
      throw new Error(`API route does not export a handler: ${pathname}`);
    }

    await handler(req, res);
    if (!res.writableEnded) {
      res.end("");
    }
  } catch (error) {
    vite.ssrFixStacktrace(error);
    console.error(`[dev-server] API error for ${pathname}`);
    console.error(error);
    if (!res.headersSent) {
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : "Internal server error"
      });
      return;
    }
    if (!res.writableEnded) {
      res.end("");
    }
  }
}

function shouldServeSpaFallback(pathname) {
  if (pathname.startsWith("/api/")) {
    return false;
  }
  if (pathname.startsWith("/@")) {
    return false;
  }
  if (pathname === "/dashboard.html" || pathname === "/reports.html") {
    return false;
  }
  return path.extname(pathname) === "";
}

async function serveSpaShell(req, res, vite) {
  const template = await fs.promises.readFile(INDEX_HTML_PATH, "utf8");
  const html = await vite.transformIndexHtml(req.url || "/", template);
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(html);
}

function redirectLegacyHtmlRoute(req, res, pathname) {
  const targetPath = pathname === "/dashboard.html" ? "/dashboard" : pathname === "/reports.html" ? "/reports" : null;
  if (!targetPath) {
    return false;
  }

  const requestUrl = new URL(req.url || "/", "http://localhost");
  const location = `${targetPath}${requestUrl.search || ""}`;
  res.statusCode = 302;
  res.setHeader("Location", location);
  res.end("");
  return true;
}

async function listenWithPortFallback(server, host, preferredPort, maxAttempts = 20) {
  let nextPort = preferredPort;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      await new Promise((resolve, reject) => {
        const onError = (error) => {
          cleanup();
          reject(error);
        };
        const onListening = () => {
          cleanup();
          resolve();
        };
        const cleanup = () => {
          server.off("error", onError);
          server.off("listening", onListening);
        };

        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(nextPort, host);
      });
      return nextPort;
    } catch (error) {
      if (error?.code !== "EADDRINUSE" || attempt === maxAttempts - 1) {
        throw error;
      }
      nextPort += 1;
    }
  }

  throw new Error(`Could not find an open port starting from ${preferredPort}`);
}

async function main() {
  loadLocalEnv();

  const httpServer = http.createServer();
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    root: ROOT,
    appType: "custom",
    server: {
      middlewareMode: true,
      hmr: {
        server: httpServer
      }
    }
  });

  httpServer.on("request", async (req, res) => {
    decorateRequest(req);
    decorateResponse(res);

    const pathname = new URL(req.url || "/", "http://localhost").pathname;

    if (pathname.startsWith("/api/")) {
      await handleApiRequest(req, res, vite);
      return;
    }

    if (redirectLegacyHtmlRoute(req, res, pathname)) {
      return;
    }

    if (shouldServeSpaFallback(pathname)) {
      try {
        await serveSpaShell(req, res, vite);
      } catch (error) {
        vite.ssrFixStacktrace(error);
        console.error("[dev-server] SPA shell error");
        console.error(error);
        res.statusCode = 500;
        res.end(error instanceof Error ? error.stack || error.message : "Internal server error");
      }
      return;
    }

    vite.middlewares(req, res, async (error) => {
      if (error) {
        vite.ssrFixStacktrace(error);
        console.error("[dev-server] Frontend middleware error");
        console.error(error);
        res.statusCode = 500;
        res.end(error instanceof Error ? error.stack || error.message : "Internal server error");
        return;
      }

      if (!res.writableEnded) {
        res.statusCode = 404;
        res.end("Not found");
      }
    });
  });

  activePort = await listenWithPortFallback(httpServer, HOST, PORT);
  console.log(`[dev-server] running at http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${activePort}`);
}

main().catch((error) => {
  console.error("[dev-server] failed to start");
  console.error(error);
  process.exit(1);
});
