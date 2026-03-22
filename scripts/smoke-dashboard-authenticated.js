#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const DEFAULT_URL = "https://swarmtester.com/dashboard.html?smoke=1";
const DEFAULT_TIMEOUT_MS = 20000;

function loadEnvFileIfPresent(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
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
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function bootstrapEnv() {
  loadEnvFileIfPresent(path.resolve(process.cwd(), ".tmp/vercel.env"));
  loadEnvFileIfPresent(path.resolve(process.cwd(), ".env.local"));
  loadEnvFileIfPresent(path.resolve(process.cwd(), ".env.worker"));
}

function parseArgs(argv) {
  const args = {
    url: DEFAULT_URL,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    headed: false,
    keepUser: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--url") {
      const next = String(argv[index + 1] || "").trim();
      if (next) {
        args.url = next;
        index += 1;
      }
      continue;
    }
    if (arg === "--timeout-ms") {
      const next = Number(argv[index + 1]);
      if (Number.isFinite(next) && next > 0) {
        args.timeoutMs = next;
        index += 1;
      }
      continue;
    }
    if (arg === "--headed") {
      args.headed = true;
      continue;
    }
    if (arg === "--keep-user") {
      args.keepUser = true;
    }
  }

  return args;
}

function sanitizeBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return DEFAULT_URL;
  }
  const parsed = new URL(raw);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Dashboard URL must use http or https.");
  }
  return parsed.toString();
}

function requireEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function createOutputPaths() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.resolve(process.cwd(), "output", "playwright", `authenticated-dashboard-smoke_${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  return {
    dir,
    screenshotPath: path.join(dir, "dashboard-authenticated-smoke.png"),
    jsonPath: path.join(dir, "dashboard-authenticated-smoke.json")
  };
}

function buildSupabaseConfig() {
  const supabaseUrl = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  const serviceKey = requireEnv("SUPABASE_SERVICE_KEY");
  const anonKey = requireEnv("SUPABASE_ANON_KEY");
  return { supabaseUrl, serviceKey, anonKey };
}

async function createTempDashboardUser(config) {
  const email = `codex-dashboard-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = `Codex!${Math.random().toString(36).slice(2)}Aa1`;

  const createResponse = await fetch(`${config.supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        swarm_onboarding_seen: true,
        created_by: "authenticated_dashboard_smoke"
      }
    })
  });

  const createPayload = await createResponse.json().catch(() => ({}));
  if (!createResponse.ok) {
    throw new Error(
      `Could not create temp dashboard user (${createResponse.status}): ${
        createPayload?.message || createPayload?.error_description || createPayload?.error || "unknown error"
      }`
    );
  }

  const tokenResponse = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });

  const tokenPayload = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok) {
    throw new Error(
      `Could not create temp dashboard session (${tokenResponse.status}): ${
        tokenPayload?.message || tokenPayload?.error_description || tokenPayload?.error || "unknown error"
      }`
    );
  }

  return {
    userId: String(createPayload?.id || createPayload?.user?.id || tokenPayload?.user?.id || "").trim(),
    email,
    accessToken: String(tokenPayload?.access_token || "").trim(),
    refreshToken: String(tokenPayload?.refresh_token || "").trim()
  };
}

async function deleteTempDashboardUser(config, userId) {
  const safeUserId = String(userId || "").trim();
  if (!safeUserId) {
    return;
  }

  await fetch(`${config.supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(safeUserId)}`, {
    method: "DELETE",
    headers: {
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`
    }
  }).catch(() => null);
}

function createDomSnapshot(state = {}) {
  return {
    url: state.url || "",
    authShellHidden: state.authShellHidden === true,
    appRootHidden: state.appRootHidden === true,
    shellReady: String(state.shellReady || ""),
    loading: String(state.loading || ""),
    projectStatus: String(state.projectStatus || ""),
    hasProjects: String(state.hasProjects || ""),
    topbarProjectHidden: state.topbarProjectHidden === true,
    recentRunsMeta: String(state.recentRunsMeta || ""),
    activeBrandLabel: String(state.activeBrandLabel || ""),
    activeBrandMeta: String(state.activeBrandMeta || "")
  };
}

async function readDashboardState(page) {
  const rawState = await page.evaluate(() => ({
    url: window.location.href,
    authShellHidden: document.getElementById("dashboardAuthShell")?.hidden ?? null,
    appRootHidden: document.getElementById("appQaDashboard")?.hidden ?? null,
    shellReady: document.getElementById("appQaDashboard")?.getAttribute("data-shell-ready") || "",
    loading: document.getElementById("appQaDashboard")?.getAttribute("data-loading") || "",
    projectStatus: document.getElementById("appQaDashboard")?.getAttribute("data-project-catalog-status") || "",
    hasProjects: document.getElementById("appQaDashboard")?.getAttribute("data-has-projects") || "",
    topbarProjectHidden: document.getElementById("topbarProjectShell")?.hidden ?? null,
    recentRunsMeta: document.getElementById("recentRunsMeta")?.textContent || "",
    activeBrandLabel: document.getElementById("activeBrandLabel")?.textContent || "",
    activeBrandMeta: document.getElementById("activeBrandMeta")?.textContent || ""
  }));

  return createDomSnapshot(rawState);
}

async function main() {
  bootstrapEnv();

  const args = parseArgs(process.argv.slice(2));
  const targetUrl = sanitizeBaseUrl(args.url);
  const targetOrigin = new URL(targetUrl).origin;
  const output = createOutputPaths();
  const supabase = buildSupabaseConfig();

  const consoleMessages = [];
  const networkEvents = [];
  const pageErrors = [];

  let tempUser = null;
  let browser = null;

  try {
    tempUser = await createTempDashboardUser(supabase);
    if (!tempUser.userId || !tempUser.accessToken) {
      throw new Error("Temp dashboard session was created without a usable access token.");
    }

    browser = await chromium.launch({ headless: !args.headed });
    const context = await browser.newContext();
    const page = await context.newPage();

    page.on("console", (message) => {
      consoleMessages.push({
        type: message.type(),
        text: message.text()
      });
    });
    page.on("pageerror", (error) => {
      pageErrors.push(String(error?.message || error || ""));
    });
    page.on("response", (response) => {
      const url = response.url();
      if (!url.includes("/api/auth/session") && !url.includes("/api/qa/reports") && !url.includes("/api/qa/projects")) {
        return;
      }
      networkEvents.push({
        url,
        status: response.status(),
        method: response.request().method()
      });
    });

    await context.addCookies([
      {
        name: "swarmtester_access_token",
        value: tempUser.accessToken,
        url: targetOrigin,
        httpOnly: true,
        secure: targetOrigin.startsWith("https://"),
        sameSite: "Lax"
      },
      {
        name: "swarmtester_refresh_token",
        value: tempUser.refreshToken,
        url: targetOrigin,
        httpOnly: true,
        secure: targetOrigin.startsWith("https://"),
        sameSite: "Lax"
      }
    ]);

    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });

    await page.waitForFunction(
      () => {
        const authShell = document.getElementById("dashboardAuthShell");
        const appRoot = document.getElementById("appQaDashboard");
        const projectStatus = String(appRoot?.getAttribute("data-project-catalog-status") || "").toLowerCase();
        return (
          authShell?.hidden === true &&
          appRoot?.hidden === false &&
          appRoot?.getAttribute("data-shell-ready") === "true" &&
          appRoot?.getAttribute("data-loading") !== "true" &&
          (projectStatus === "ready" || projectStatus === "empty")
        );
      },
      { timeout: args.timeoutMs }
    );

    const state = await readDashboardState(page);
    await page.screenshot({ path: output.screenshotPath, fullPage: true });

    const result = {
      ok: true,
      url: targetUrl,
      readiness: state,
      temp_user: {
        id: tempUser.userId,
        email: tempUser.email
      },
      artifacts: {
        screenshot: output.screenshotPath
      },
      network: networkEvents,
      console: consoleMessages,
      page_errors: pageErrors
    };

    fs.writeFileSync(output.jsonPath, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    const result = {
      ok: false,
      url: targetUrl,
      error: String(error?.message || error || "Unknown error"),
      temp_user: tempUser
        ? {
            id: tempUser.userId,
            email: tempUser.email
          }
        : null,
      artifacts: {
        screenshot: output.screenshotPath
      },
      network: networkEvents,
      console: consoleMessages,
      page_errors: pageErrors
    };

    try {
      if (browser) {
        const context = browser.contexts()[0];
        const page = context?.pages?.()[0];
        if (page) {
          await page.screenshot({ path: output.screenshotPath, fullPage: true });
          result.readiness = await readDashboardState(page).catch(() => null);
        }
      }
    } catch {
      // Ignore artifact capture failures during error handling.
    }

    fs.writeFileSync(output.jsonPath, JSON.stringify(result, null, 2));
    console.error(JSON.stringify(result, null, 2));
    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close().catch(() => null);
    }
    if (tempUser && !args.keepUser) {
      await deleteTempDashboardUser(supabase, tempUser.userId);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
