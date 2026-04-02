const fs = require("fs");
const path = require("path");
const { executeBrowserbaseQaRun } = require("../lib/qa-browserbase");

function loadEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
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

function toTimestampFragment(date = new Date()) {
  const iso = date.toISOString();
  return iso.replace(/[-:]/g, "").replace("T", "_").slice(0, 15);
}

function maskCredentials(runRequest) {
  if (!runRequest || typeof runRequest !== "object") {
    return runRequest;
  }

  const cloned = JSON.parse(JSON.stringify(runRequest));
  if (cloned.credentials && typeof cloned.credentials === "object") {
    cloned.credentials.password = cloned.credentials.password ? "***REDACTED***" : null;
  }
  return cloned;
}

function isModelAvailabilityFailure(result) {
  const note = String(result?.report?.summary?.note || "").toLowerCase();
  return (
    (note.includes("requested model") && note.includes("does not exist")) ||
    note.includes("unexpected server response: 500")
  );
}

function uniqueNonEmpty(values) {
  const output = [];
  for (const value of values) {
    if (!value || typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed || output.includes(trimmed)) {
      continue;
    }
    output.push(trimmed);
  }
  return output;
}

async function main() {
  loadEnvFile(path.resolve(".env.local"));
  loadEnvFile(path.resolve(".tmp/vercel.env"));

  const runId = `customerio_login_live_${Date.now()}`;
  const requestedModel = process.env.QA_MODEL || "gpt-4.1-mini";
  const fallbackModels = uniqueNonEmpty(
    (process.env.QA_MODEL_FALLBACKS || "gpt-4.1-mini")
      .split(",")
      .map((value) => value.trim())
  );
  const modelCandidates = uniqueNonEmpty([requestedModel, ...fallbackModels]);
  const outputDir = path.resolve("output");
  fs.mkdirSync(outputDir, { recursive: true });

  const baseRunRequest = {
    run_id: runId,
    target_url: "https://fly.customer.io/signup",
    scope_mode: "feature_targeted",
    scenario_list: [
      "Open Customer.io signup and complete account creation using Continue with Google.",
      "Use provided credentials to complete Google auth and return to Customer.io in authenticated state.",
      "After successful login, open startup program application and submit Istanbul Vibes startup details."
    ],
    brand_persona: "A startup founder completing Customer.io startup program onboarding.",
    source: "manual_live_login",
    credentials: {
      login_url: "https://fly.customer.io/signup",
      username: process.env.CUSTOMERIO_EMAIL || "elif@istanbulvibes.app",
      password: process.env.CUSTOMERIO_PASSWORD || "BHuman12$",
      otp_mode: "manual"
    },
    metadata: {
      company: "istanbulvibes.app",
      startup_program_url: "https://customer.io/startup-program-application",
      startup_solutions_url: "https://customer.io/solutions/startups",
      auth_requirement: "google_oauth"
    }
  };

  const options = {
    agentModeFallbackOrder: ["hybrid", "dom"],
    coordinateClickFallbackEnabled: true,
    coordinateClickFallbackMode: process.env.QA_COORDINATE_CLICK_FALLBACK_MODE || "always",
    browserbaseAdvancedStealth: true,
    browserbaseSolveCaptchas: true,
    browserbaseUseProxies: true,
    browserbaseProxyCountry: process.env.QA_BROWSERBASE_PROXY_COUNTRY || "us",
    agentMaxSteps: Number(process.env.QA_LOGIN_MAX_STEPS || 140)
  };

  const modelAttempts = [];
  let runRequest = null;
  let result = null;

  for (const model of modelCandidates) {
    runRequest = {
      ...baseRunRequest,
      model
    };

    result = await executeBrowserbaseQaRun(runRequest, options);
    modelAttempts.push({
      model,
      report_status: result?.report?.status || null,
      summary_note: result?.report?.summary?.note || null,
      agent_mode_used: result?.artifacts?.agent_mode_used || null
    });

    if (!isModelAvailabilityFailure(result)) {
      break;
    }
  }

  const artifactFile = path.join(outputDir, `${runId}_${toTimestampFragment()}_full.json`);
  fs.writeFileSync(
    artifactFile,
    JSON.stringify(
      {
        run_id: runId,
        generated_at: new Date().toISOString(),
        run_request: maskCredentials(runRequest),
        options,
        model_attempts: modelAttempts,
        report: result.report,
        artifacts: result.artifacts,
        runLog: Array.isArray(result.runLog) ? result.runLog : [],
        rawAgentMessage: result.rawAgentMessage || "",
        agentActions: result.agentActions || {},
        markdown: result.markdown || ""
      },
      null,
      2
    )
  );

  const tail = Array.isArray(result.runLog) ? result.runLog.slice(-12) : [];
  const summary = {
    run_id: runId,
    output_file: artifactFile,
    model_attempts: modelAttempts,
    report_status: result?.report?.status || null,
    report_note: result?.report?.summary?.note || null,
    agent_mode_used: result?.artifacts?.agent_mode_used || null,
    coordinate_click_fallback: result?.artifacts?.coordinate_click_fallback || null,
    session_url: result?.artifacts?.browserbase_session_url || null,
    debug_url: result?.artifacts?.browserbase_debug_url || null,
    runlog_tail: tail
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        message: error?.message || "Unknown error",
        stack: error?.stack || null
      },
      null,
      2
    )
  );
  process.exit(1);
});
