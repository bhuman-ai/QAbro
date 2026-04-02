const fs = require("fs");
const path = require("path");
const { executeBrowserbaseQaRun } = require("../lib/qa-browserbase");

function loadEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
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

function parseCliArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function sanitizeString(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function parseInteger(value, fallbackValue) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallbackValue;
  }
  return Math.floor(numeric);
}

function parseScenarioList(rawScenarios, fallbackGoal) {
  if (typeof rawScenarios === "string" && rawScenarios.trim()) {
    const parsed = rawScenarios
      .split(/\|\||\n/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (parsed.length) {
      return parsed;
    }
  }

  if (fallbackGoal) {
    return [fallbackGoal];
  }
  return ["Complete the primary conversion flow end-to-end."];
}

function parseModeOrder(rawModes) {
  const source = sanitizeString(rawModes || "cua,hybrid,dom");
  const modes = source
    .split(",")
    .map((mode) => mode.trim().toLowerCase())
    .filter(Boolean);
  const aliases = {
    vision: "vision_only",
    "vision-only": "vision_only"
  };
  const allowed = new Set(["cua", "hybrid", "dom", "vision_only"]);
  const deduped = [];
  for (const rawMode of modes) {
    const mode = aliases[rawMode] || rawMode;
    if (!allowed.has(mode) || deduped.includes(mode)) {
      continue;
    }
    deduped.push(mode);
  }
  return deduped.length ? deduped : ["cua", "hybrid", "dom"];
}

function maskRequest(request) {
  const clone = JSON.parse(JSON.stringify(request));
  if (clone.credentials?.password) {
    clone.credentials.password = "***REDACTED***";
  }
  return clone;
}

function timestampFragment(date = new Date()) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "_")
    .slice(0, 15);
}

async function main() {
  loadEnvFile(path.resolve(".env.local"));
  loadEnvFile(path.resolve(".tmp/vercel.env"));

  const args = parseCliArgs(process.argv.slice(2));
  const targetUrl = sanitizeString(args.target || process.env.QA_AGENT_TARGET_URL);
  const goal = sanitizeString(args.goal || process.env.QA_AGENT_GOAL);
  const scenarioList = parseScenarioList(args.scenarios || process.env.QA_AGENT_SCENARIOS, goal);

  if (!targetUrl) {
    throw new Error("Missing target URL. Provide --target or QA_AGENT_TARGET_URL.");
  }
  if (!goal) {
    throw new Error("Missing goal instruction. Provide --goal or QA_AGENT_GOAL.");
  }

  const runId = sanitizeString(args.run_id || process.env.QA_AGENT_RUN_ID) || `agent_task_${Date.now()}`;
  const model = sanitizeString(args.model || process.env.QA_MODEL) || "gpt-4.1";
  const cuaModel =
    sanitizeString(args.cua_model || process.env.QA_CUA_MODEL) || "openai/computer-use-preview";
  const visionModel = sanitizeString(args.vision_model || process.env.QA_VISION_MODEL) || "gpt-4.1-mini";
  const modeOrder = parseModeOrder(args.modes || process.env.QA_AGENT_MODES);
  const maxSteps = parseInteger(args.max_steps || process.env.QA_LOGIN_MAX_STEPS, 120);
  const sessionTimeout = parseInteger(
    args.session_timeout || process.env.QA_BROWSERBASE_SESSION_TIMEOUT_MS,
    1800
  );

  const username = sanitizeString(args.username || process.env.QA_AGENT_USERNAME || process.env.CUSTOMERIO_EMAIL);
  const password = sanitizeString(args.password || process.env.QA_AGENT_PASSWORD || process.env.CUSTOMERIO_PASSWORD);
  const loginUrl = sanitizeString(args.login_url || process.env.QA_AGENT_LOGIN_URL || targetUrl);

  const runRequest = {
    run_id: runId,
    target_url: targetUrl,
    scope_mode: "feature_targeted",
    scenario_list: scenarioList,
    brand_persona:
      "A determined end user completing a high-value workflow in production with minimal tolerance for blockers.",
    source: "manual_agent_task",
    model,
    cua_model: cuaModel,
    credentials:
      username || password
        ? {
            login_url: loginUrl,
            username: username || null,
            password: password || null,
            otp_mode: "manual"
          }
        : null,
    metadata: {
      goal
    }
  };

  const options = {
    agentModeFallbackOrder: modeOrder,
    coordinateClickFallbackEnabled: true,
    coordinateClickFallbackMode:
      sanitizeString(process.env.QA_COORDINATE_CLICK_FALLBACK_MODE) || "always",
    browserbaseAdvancedStealth: true,
    browserbaseSolveCaptchas: true,
    browserbaseUseProxies: true,
    browserbaseSessionTimeoutMs: sessionTimeout,
    agentMaxSteps: maxSteps,
    cuaModel,
    visionModel
  };

  const result = await executeBrowserbaseQaRun(runRequest, options);
  const outputDir = path.resolve("output");
  fs.mkdirSync(outputDir, { recursive: true });
  const artifactFile = path.join(outputDir, `${runId}_${timestampFragment()}_full.json`);
  fs.writeFileSync(
    artifactFile,
    JSON.stringify(
      {
        run_id: runId,
        generated_at: new Date().toISOString(),
        run_request: maskRequest(runRequest),
        options,
        report: result.report,
        artifacts: result.artifacts,
        runLog: result.runLog || [],
        rawAgentMessage: result.rawAgentMessage || "",
        agentActions: result.agentActions || {},
        markdown: result.markdown || ""
      },
      null,
      2
    )
  );

  console.log(
    JSON.stringify(
      {
        run_id: runId,
        target_url: targetUrl,
        goal,
        model,
        cua_model: cuaModel,
        vision_model: visionModel,
        mode_order: modeOrder,
        browserbase_session_timeout: sessionTimeout,
        report_status: result?.report?.status || null,
        report_note: result?.report?.summary?.note || null,
        agent_mode_used: result?.artifacts?.agent_mode_used || null,
        session_url: result?.artifacts?.browserbase_session_url || null,
        debug_url: result?.artifacts?.browserbase_debug_url || null,
        artifact_file: artifactFile
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        message: error?.message || "Unhandled error",
        stack: error?.stack || null
      },
      null,
      2
    )
  );
  process.exit(1);
});
