#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { executeLocalAgentQaRun } = require("../lib/qa-local-agent");
const { createOtpBroker } = require("../lib/otp-broker");
const { exportQaDevHandoff } = require("../lib/qa-dev-handoff");

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

function parseBoolean(value, fallbackValue) {
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return fallbackValue;
  }
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallbackValue;
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

function maskRequest(request) {
  const redact = (value, key = "") => {
    if (Array.isArray(value)) {
      return value.map((item) => redact(item));
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redact(entryValue, entryKey)]));
    }
    const normalizedKey = String(key || "").toLowerCase();
    if (
      normalizedKey === "password" ||
      normalizedKey === "token" ||
      normalizedKey === "accesstoken" ||
      normalizedKey === "access_token" ||
      normalizedKey === "refreshtoken" ||
      normalizedKey === "refresh_token" ||
      normalizedKey === "authtoken" ||
      normalizedKey === "auth_token" ||
      normalizedKey === "authorization" ||
      normalizedKey === "api_key" ||
      normalizedKey === "apikey" ||
      normalizedKey.endsWith("_secret") ||
      normalizedKey === "secret"
    ) {
      return value ? "***REDACTED***" : value;
    }
    return value;
  };

  const clone = redact(JSON.parse(JSON.stringify(request || {})));
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
  loadEnvFile(path.resolve(".env.worker"));
  loadEnvFile(path.resolve(".tmp/vercel.env"));

  const args = parseCliArgs(process.argv.slice(2));
  const targetUrl = sanitizeString(args.target || process.env.QA_AGENT_TARGET_URL);
  const goal = sanitizeString(args.goal || process.env.QA_AGENT_GOAL);
  const scenarioList = parseScenarioList(args.scenarios || process.env.QA_AGENT_SCENARIOS, goal);
  const persona =
    sanitizeString(
      args.persona ||
        args.brand_persona ||
        args.brandPersona ||
        process.env.QA_AGENT_PERSONA ||
        process.env.QA_AGENT_BRAND_PERSONA
    ) || "A determined end user completing a high-value workflow in production with minimal tolerance for blockers.";

  if (!targetUrl) {
    throw new Error("Missing target URL. Provide --target or QA_AGENT_TARGET_URL.");
  }
  if (!goal) {
    throw new Error("Missing goal instruction. Provide --goal or QA_AGENT_GOAL.");
  }

  const runId = sanitizeString(args.run_id || process.env.QA_AGENT_RUN_ID) || `local_agent_task_${Date.now()}`;
  const username = sanitizeString(args.username || process.env.QA_AGENT_USERNAME || process.env.CUSTOMERIO_EMAIL);
  const password = sanitizeString(args.password || process.env.QA_AGENT_PASSWORD || process.env.CUSTOMERIO_PASSWORD);
  const loginUrl = sanitizeString(args.login_url || process.env.QA_AGENT_LOGIN_URL || targetUrl);
  const otpMode = sanitizeString(args.otp_mode || process.env.QA_AGENT_OTP_MODE, 64) || "provider_hook";
  const otpProvider =
    sanitizeString(args.otp_provider || process.env.QA_AGENT_OTP_PROVIDER || process.env.QA_OTP_PROVIDER, 64) ||
    "mailtm";
  const useManagedInbox = parseBoolean(
    args.managed_inbox ?? args.managedInbox ?? process.env.QA_AGENT_MANAGED_INBOX,
    false
  );
  const otpSubjectPattern =
    sanitizeString(args.otp_subject_pattern || process.env.QA_AGENT_OTP_SUBJECT_PATTERN || process.env.QA_OTP_SUBJECT_PATTERN) ||
    "";
  const otpTimeoutMs = parseInteger(args.otp_timeout_ms || process.env.QA_AGENT_OTP_TIMEOUT_MS || process.env.QA_OTP_TIMEOUT_MS, 180000);
  const otpPollIntervalMs = parseInteger(
    args.otp_poll_interval_ms || process.env.QA_AGENT_OTP_POLL_INTERVAL_MS || process.env.QA_OTP_POLL_INTERVAL_MS,
    5000
  );
  const authPolicy =
    sanitizeString(args.auth_policy || process.env.QA_AGENT_AUTH_POLICY, 64) ||
    (username || password ? "login" : "public_only");
  const headless = parseBoolean(args.headless ?? process.env.QA_LOCAL_HEADLESS, true);
  const outputRoot = sanitizeString(args.output_root || process.env.QA_LOCAL_OUTPUT_ROOT) || "output/playwright";
  const visionWaitStreak = parseInteger(
    args.max_wait_streak || process.env.QA_VISION_MAX_WAIT_STREAK,
    6
  );
  const exportDevHandoff = parseBoolean(
    args.dev_handoff ?? args.devHandoff ?? process.env.QA_AGENT_DEV_HANDOFF,
    true
  );
  const zipDevHandoff = parseBoolean(
    args.dev_handoff_zip ?? args.devHandoffZip ?? process.env.QA_AGENT_DEV_HANDOFF_ZIP,
    true
  );
  let managedOtpInbox = null;
  if (useManagedInbox) {
    const otpBroker = createOtpBroker({
      provider: otpProvider,
      mailtmBaseUrl: sanitizeString(args.otp_mailtm_base_url || process.env.QA_AGENT_OTP_MAILTM_BASE_URL || process.env.QA_OTP_MAILTM_BASE_URL) || undefined,
      httpUrl: sanitizeString(args.otp_provider_url || process.env.QA_AGENT_OTP_PROVIDER_URL || process.env.QA_OTP_PROVIDER_URL) || undefined,
      httpCreateUrl:
        sanitizeString(args.otp_provider_create_url || process.env.QA_AGENT_OTP_PROVIDER_CREATE_URL || process.env.QA_OTP_PROVIDER_CREATE_URL) ||
        undefined,
      httpHeaders: process.env.QA_AGENT_OTP_PROVIDER_HEADERS || process.env.QA_OTP_PROVIDER_HEADERS || undefined,
      httpAuthToken:
        sanitizeString(args.otp_provider_auth_token || process.env.QA_AGENT_OTP_PROVIDER_AUTH_TOKEN || process.env.QA_OTP_PROVIDER_AUTH_TOKEN) ||
        undefined,
      httpMethod:
        sanitizeString(args.otp_provider_method || process.env.QA_AGENT_OTP_PROVIDER_METHOD || process.env.QA_OTP_PROVIDER_METHOD) || undefined
    });
    if (!otpBroker.enabled) {
      throw new Error(`Managed inbox requested, but OTP provider "${otpProvider}" is not enabled.`);
    }
    managedOtpInbox = await otpBroker.createIdentity({
      runTag: runId
    });
  }

  const runRequest = {
    run_id: runId,
    target_url: targetUrl,
    scope_mode: "feature_targeted",
    scenario_list: scenarioList,
    brand_persona: persona,
    source: "manual_local_agent_task",
    credentials:
      username || password
        ? {
            login_url: loginUrl,
            username: username || null,
            password: password || null,
            otp_mode: otpMode
          }
        : null,
    metadata: {
      goal,
      execution_engine: "local_vision_agent",
      owner_user_id: sanitizeString(args.owner_user_id || process.env.QA_OWNER_USER_ID) || "local_cli",
      owner_email: sanitizeString(args.owner_email || process.env.QA_OWNER_EMAIL) || "local-cli@qabro.test",
      auth_policy: authPolicy,
      vision_max_wait_streak: visionWaitStreak,
      ...(managedOtpInbox
        ? {
            vision_forced_email: managedOtpInbox.email,
            otp_provider: managedOtpInbox.provider || otpProvider,
            otp_inbox: managedOtpInbox,
            otp_timeout_ms: otpTimeoutMs,
            otp_poll_interval_ms: otpPollIntervalMs,
            ...(otpSubjectPattern ? { otp_subject_pattern: otpSubjectPattern } : {})
          }
        : {})
    }
  };

  const result = await executeLocalAgentQaRun(runRequest, {
    skipCallbackPublication: true,
    headless,
    outputRoot,
    coordinateClickFallbackEnabled: true,
    coordinateClickFallbackMode: sanitizeString(process.env.QA_COORDINATE_CLICK_FALLBACK_MODE) || "always"
  });

  const outputDir = path.resolve("output");
  fs.mkdirSync(outputDir, { recursive: true });
  const artifactFile = path.join(outputDir, `${runId}_${timestampFragment()}_local_agent_full.json`);
  fs.writeFileSync(
    artifactFile,
    JSON.stringify(
      {
        run_id: runId,
        generated_at: new Date().toISOString(),
        run_request: maskRequest(runRequest),
        report: result.report,
        artifacts: result.artifacts,
        runLog: result.runLog || [],
        rawAgentMessage: result.rawAgentMessage || "",
        agentActions: result.agentActions || {},
        markdown: result.markdown || "",
        publish: result.publish || null
      },
      null,
      2
    )
  );

  let devHandoffResult = null;
  let devHandoffError = null;
  if (exportDevHandoff) {
    try {
      devHandoffResult = await exportQaDevHandoff({
        artifactPath: artifactFile,
        outputRoot:
          sanitizeString(args.dev_handoff_output_root || process.env.QA_AGENT_DEV_HANDOFF_OUTPUT_ROOT) ||
          "output/dev-handoffs",
        zip: zipDevHandoff
      });
    } catch (error) {
      devHandoffError = error?.message || String(error || "Dev handoff export failed");
    }
  }

  console.log(
    JSON.stringify(
      {
        run_id: runId,
        target_url: targetUrl,
        goal,
        execution_engine: "local_vision_agent",
        headless,
        report_status: result?.report?.status || null,
        report_note: result?.report?.summary?.note || null,
        persona,
        agent_mode_used: result?.artifacts?.agent_mode_used || null,
        local_run_dir: result?.artifacts?.local_run_dir || null,
        local_video_path: result?.artifacts?.local_video_path || null,
        blocker_clip_path: result?.artifacts?.blocker_clip_path || null,
        artifact_file: artifactFile,
        dev_handoff_dir: devHandoffResult?.bundleDir || null,
        dev_handoff_zip: devHandoffResult?.zipPath || null,
        dev_handoff_error: devHandoffError,
        console_events: devHandoffResult?.consoleEventCount ?? null,
        network_events: devHandoffResult?.networkEventCount ?? null,
        failed_network_events: devHandoffResult?.failedNetworkEventCount ?? null,
        relevant_failed_network_events: devHandoffResult?.relevantFailedNetworkEventCount ?? null,
        managed_inbox_provider: managedOtpInbox?.provider || null,
        managed_inbox_email: managedOtpInbox?.email || null
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
