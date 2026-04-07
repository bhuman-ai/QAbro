#!/usr/bin/env node
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  DEFAULT_EXECUTION_ENGINE,
  buildMarkdownReport,
  DEFAULT_PUBLIC_BASE_URL,
  isPlainObject,
  normalizeFinding,
  normalizeExecutionEngine,
  normalizeReport,
  parseBoolean,
  resolveRunWebhookConfig,
  sanitizeArtifactsForCallback,
  sanitizeOptionalString,
  sanitizeReportMarkdown,
  sanitizeReportForCallback,
  sanitizeRunLogForCallback,
  sanitizeString,
  sendFinalCallback,
  sendRunWebhook,
  sleep,
  validateReport
} = require("../lib/qa-core");
const { buildLiveStreamArtifacts } = require("../lib/qa-live-stream");
const { __private: qaLocalPublishPrivate } = require("../lib/qa-local-publish");
const {
  buildQueuePayload,
  claimNextQaRun,
  getRetryQueueStatus,
  sanitizeQueue,
  updateQueueRow
} = require("../lib/qa-queue");
const { enqueueRepoTriageJob } = require("../lib/qa-repo-triage-queue");
const { shouldEnqueueRepoTriage, updateStoredReportRepoTriage } = require("../lib/qa-repo-triage");
const {
  getWorkerHeartbeatThresholds,
  sanitizeWorkerStatus,
  upsertQaWorkerHeartbeat
} = require("../lib/qa-workers");
const { executeLocalAgentQaRun } = require("../lib/qa-local-agent");
const { executeBrowserbaseQaRun } = require("../lib/qa-browserbase");
const repoTriageWorker = require("./qa-repo-triage-worker");
const {
  buildEmbeddedEvidenceMedia,
  buildPortableEvidenceMedia,
  buildPublishedArtifacts,
  cleanupPublishedLocalArtifacts
} = qaLocalPublishPrivate;

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
  loadEnvFileIfPresent(path.resolve(process.cwd(), ".env.worker"));
  loadEnvFileIfPresent(path.resolve(process.cwd(), ".env.local"));
  loadEnvFileIfPresent(path.resolve(process.cwd(), ".tmp/vercel.env"));

  const rawCallbackSecret = String(process.env.QA_CALLBACK_SECRET || "");
  if (rawCallbackSecret) {
    process.env.QA_CALLBACK_SECRET = rawCallbackSecret
      .replaceAll("\\r", "\r")
      .replaceAll("\\n", "\n")
      .trim();
  }
}

function parseArgs(argv) {
  const args = {
    once: false,
    intervalMs: 10000,
    workerId: process.env.QA_WORKER_ID || `qa-worker-${process.pid}`
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--once") {
      args.once = true;
      continue;
    }
    if (arg === "--interval-ms") {
      const next = Number(argv[index + 1]);
      if (Number.isFinite(next) && next >= 0) {
        args.intervalMs = next;
        index += 1;
      }
      continue;
    }
    if (arg === "--worker-id") {
      const next = String(argv[index + 1] || "").trim();
      if (next) {
        args.workerId = next;
        index += 1;
      }
    }
  }

  return args;
}

function parseBooleanEnv(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

let cachedWorkerBuildMetadata = null;

function resolveWorkerBuildMetadata(options = {}) {
  if (cachedWorkerBuildMetadata && options.forceRefresh !== true) {
    return cachedWorkerBuildMetadata;
  }

  const env = isPlainObject(options.env) ? options.env : process.env;
  const cwd = sanitizeString(options.cwd || process.cwd(), 4096) || process.cwd();
  const execGit = typeof options.execFileSync === "function" ? options.execFileSync : execFileSync;
  const metadata = {
    app_version: sanitizeString(env.npm_package_version, 64) || null,
    git_commit_sha:
      sanitizeString(env.QA_APP_COMMIT_SHA || env.VERCEL_GIT_COMMIT_SHA || env.GITHUB_SHA, 64) || null,
    git_commit_short: null,
    advanced_browser_supported: true,
    browserbase_configured: Boolean(
      sanitizeString(env.BROWSERBASE_API_KEY, 32) &&
        sanitizeString(env.BROWSERBASE_PROJECT_ID, 128) &&
        hasAnyModelApiKey(env)
    )
  };

  if (!metadata.git_commit_sha) {
    try {
      metadata.git_commit_sha = sanitizeString(
        execGit("git", ["rev-parse", "HEAD"], {
          cwd,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"]
        }),
        64
      );
    } catch {
      metadata.git_commit_sha = null;
    }
  }

  metadata.git_commit_short = metadata.git_commit_sha ? metadata.git_commit_sha.slice(0, 7) : null;
  cachedWorkerBuildMetadata = metadata;
  return metadata;
}

function createWorkerHeartbeat(workerId, options = {}) {
  const heartbeatConfig = getWorkerHeartbeatThresholds(options);
  const workerHost =
    sanitizeString(process.env.QA_WORKER_HOSTNAME || options.hostname || os.hostname(), 256) || null;
  const startedAt = new Date().toISOString();
  const buildInfo = resolveWorkerBuildMetadata({
    env: isPlainObject(options.env) ? options.env : process.env,
    cwd: options.cwd
  });
  const state = {
    status: "starting",
    currentRunId: null,
    currentPhase: "booting",
    lastJobClaimedAt: null,
    lastJobCompletedAt: null,
    lastError: null
  };
  let timer = null;
  let pending = Promise.resolve();
  let stopped = false;

  const buildHeartbeatMetadata = () => ({
    hostname: workerHost,
    pid: process.pid,
    node_version: process.version,
    app_version: buildInfo.app_version,
    git_commit_sha: buildInfo.git_commit_sha,
    git_commit_short: buildInfo.git_commit_short,
    advanced_browser_supported: buildInfo.advanced_browser_supported,
    browserbase_configured: buildInfo.browserbase_configured,
    poll_interval_ms: Number.isFinite(Number(options.pollIntervalMs)) ? Number(options.pollIntervalMs) : null,
    heartbeat_interval_ms: heartbeatConfig.intervalMs,
    once_mode: options.once === true,
    started_at: startedAt,
    last_error: sanitizeString(state.lastError, 512) || null
  });

  const flush = () => {
    if (stopped) {
      return pending;
    }

    const payload = {
      worker_id: workerId,
      status: state.status,
      current_run_id: state.currentRunId,
      current_phase: state.currentPhase,
      last_seen_at: new Date().toISOString(),
      last_job_claimed_at: state.lastJobClaimedAt,
      last_job_completed_at: state.lastJobCompletedAt,
      metadata: buildHeartbeatMetadata()
    };

    pending = pending
      .then(() => upsertQaWorkerHeartbeat(payload))
      .catch(() => {
        // Heartbeat persistence should never crash the worker loop.
      });

    return pending;
  };

  const updateState = (nextState = {}, options = {}) => {
    if (nextState.status) {
      state.status = sanitizeWorkerStatus(nextState.status) || state.status;
    }
    if (nextState.currentRunId !== undefined) {
      state.currentRunId = sanitizeOptionalString(nextState.currentRunId, 128) || null;
    }
    if (nextState.currentPhase !== undefined) {
      state.currentPhase = sanitizeOptionalString(nextState.currentPhase, 128) || null;
    }
    if (nextState.lastJobClaimedAt !== undefined) {
      state.lastJobClaimedAt = sanitizeOptionalString(nextState.lastJobClaimedAt, 128) || null;
    }
    if (nextState.lastJobCompletedAt !== undefined) {
      state.lastJobCompletedAt = sanitizeOptionalString(nextState.lastJobCompletedAt, 128) || null;
    }
    if (nextState.lastError !== undefined) {
      state.lastError = sanitizeOptionalString(nextState.lastError, 512) || null;
    }

    if (options.flushNow !== false) {
      return flush();
    }
    return pending;
  };

  return {
    start() {
      if (timer) {
        return;
      }
      void flush();
      timer = setInterval(() => {
        void flush();
      }, heartbeatConfig.intervalMs);
    },
    onSleep(phase = "waiting_for_jobs") {
      return updateState({
        status: "sleeping",
        currentRunId: null,
        currentPhase: phase,
        lastError: null
      });
    },
    onClaimed(runId) {
      const now = new Date().toISOString();
      return updateState({
        status: "processing",
        currentRunId: runId,
        currentPhase: "claimed",
        lastJobClaimedAt: now,
        lastError: null
      });
    },
    onProgress(phase = "processing") {
      return updateState(
        {
          status: "processing",
          currentPhase: sanitizeOptionalString(phase, 128) || "processing"
        },
        { flushNow: false }
      );
    },
    onCompleted(resultStatus = "completed") {
      const now = new Date().toISOString();
      return updateState({
        status: "idle",
        currentRunId: null,
        currentPhase: sanitizeOptionalString(`completed:${resultStatus}`, 128) || "completed",
        lastJobCompletedAt: now,
        lastError: null
      });
    },
    onError(error, phase = "error") {
      const message = error instanceof Error ? error.message : String(error || "");
      return updateState({
        status: "error",
        currentPhase: sanitizeOptionalString(phase, 128) || "error",
        lastError: message
      });
    },
    async stop(finalStatus = "stopped") {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }

      await updateState({
        status: finalStatus,
        currentRunId: null,
        currentPhase: finalStatus
      });
      stopped = true;
    }
  };
}

function hasAnyModelApiKey(env = process.env) {
  return Boolean(
    env.OPENAI_API_KEY ||
      env.QA_OPENAI_API_KEY ||
      env.BROWSERBASE_OPENAI_API_KEY ||
      env.GEMINI_API_KEY ||
      env.GOOGLE_API_KEY ||
      env.QA_COORDINATE_ANNOTATION_GEMINI_API_KEY ||
      env.QA_COORDINATE_ANNOTATION_FAL_API_KEY ||
      env.FAL_KEY
  );
}

function isPlaywrightInstalled() {
  try {
    require.resolve("playwright");
    return true;
  } catch {
    return false;
  }
}

function getLocalAgentAvailability(env = process.env) {
  const missing = [];

  if (!hasAnyModelApiKey(env)) {
    missing.push("OPENAI_API_KEY");
  }
  if (!isPlaywrightInstalled()) {
    missing.push("playwright");
  }

  return {
    ok: missing.length === 0,
    missing
  };
}

function resolveRequestedExecutionEngine(runRequest, env = process.env) {
  const metadata = isPlainObject(runRequest?.metadata) ? runRequest.metadata : {};
  const browserMode = sanitizeString(
    metadata.browser_mode || metadata.browserMode || metadata.browser_runtime || metadata.browserRuntime,
    64
  ).toLowerCase();
  return normalizeExecutionEngine(
    metadata.execution_engine ||
      metadata.executionEngine ||
      (browserMode === "advanced_browser" ? "browserbase" : "") ||
      env.QA_EXECUTION_ENGINE,
    DEFAULT_EXECUTION_ENGINE
  );
}

function buildExecutionPlan(runRequest, env = process.env) {
  const requestedEngine = resolveRequestedExecutionEngine(runRequest, env);
  const localAgent = getLocalAgentAvailability(env);

  if (requestedEngine === "browserbase") {
    return {
      requestedEngine,
      localAgent,
      attempts: [
        {
          engine: "browserbase",
          reason: "requested"
        }
      ]
    };
  }

  if (requestedEngine === "local_vision_agent") {
    return {
      requestedEngine,
      localAgent,
      attempts: [
        {
          engine: "local_vision_agent",
          reason: localAgent.ok ? "requested" : "requested_without_agent_config"
        }
      ]
    };
  }

  if (requestedEngine === "local_playwright") {
    return {
      requestedEngine,
      localAgent,
      attempts: [
        {
          engine: "local_vision_agent",
          reason: localAgent.ok ? "dom_runtime_disabled_use_ocr_stack" : "dom_runtime_disabled_missing_ocr_stack_config"
        }
      ]
    };
  }

  return {
    requestedEngine,
    localAgent,
    attempts: [
      {
        engine: "local_vision_agent",
        reason: localAgent.ok
          ? "auto_ocr_stack_only"
          : "ocr_stack_required_missing_agent_config"
      }
    ]
  };
}

function buildExecutionRunRequest(runRequest, requestedEngine, executionEngine, attempt, totalAttempts) {
  const metadata = isPlainObject(runRequest?.metadata) ? runRequest.metadata : {};
  return {
    ...runRequest,
    metadata: {
      ...metadata,
      requested_execution_engine: requestedEngine,
      execution_engine: executionEngine,
      execution_engine_attempt: attempt,
      execution_engine_attempts: totalAttempts
    }
  };
}

function shouldFallbackToNextEngine(execution, attempt) {
  if (!execution || attempt?.engine !== "local_vision_agent") {
    return false;
  }

  const status = sanitizeString(execution?.report?.status, 64).toLowerCase();
  const agentModeUsed = sanitizeString(execution?.artifacts?.agent_mode_used, 64);
  const failedVisionRun = status === "failed" || status === "failed_validation";
  if (!failedVisionRun) {
    return false;
  }

  return !agentModeUsed || agentModeUsed === "vision_only";
}

function resolveRunnerForEngine(engine) {
  if (engine === "local_vision_agent") {
    return executeLocalAgentQaRun;
  }
  if (engine === "browserbase") {
    return executeBrowserbaseQaRun;
  }
  throw new Error(`Unsupported execution engine: ${engine}`);
}

function buildRunnerOptions(runRequest, engine, liveProgress, reportUrl) {
  const metadata = isPlainObject(runRequest?.metadata) ? runRequest.metadata : {};
  const options = {
    reportUrl,
    skipCallbackPublication: true,
    onRunLog: liveProgress.onRunLog,
    onCandidateReport: liveProgress.onCandidateReport
  };

  if (engine === "browserbase") {
    options.browserbaseAdvancedStealth =
      parseBoolean(metadata.browserbase_advanced_stealth ?? metadata.browserbaseAdvancedStealth ?? true) !== false;
    options.browserbaseSolveCaptchas =
      parseBoolean(metadata.browserbase_solve_captchas ?? metadata.browserbaseSolveCaptchas ?? true) !== false;
  }

  return options;
}

async function executeRunWithPlan(claimed, workerId, liveProgress) {
  const plan = buildExecutionPlan(claimed.runRequest, process.env);
  let lastError = null;

  for (let index = 0; index < plan.attempts.length; index += 1) {
    const attempt = plan.attempts[index];
    const attemptNumber = index + 1;
    const runner = resolveRunnerForEngine(attempt.engine);
    const executionRunRequest = buildExecutionRunRequest(
      claimed.runRequest,
      plan.requestedEngine,
      attempt.engine,
      attemptNumber,
      plan.attempts.length
    );

    liveProgress.onRunLog({
      ts: new Date().toISOString(),
      event: "execution_engine_selected",
      data: {
        worker_id: workerId,
        requested_execution_engine: plan.requestedEngine,
        execution_engine: attempt.engine,
        attempt: attemptNumber,
        total_attempts: plan.attempts.length,
        reason: attempt.reason,
        agentic_available: plan.localAgent.ok,
        agentic_missing: plan.localAgent.missing
      }
    });

    try {
      const execution = await runner(
        executionRunRequest,
        buildRunnerOptions(executionRunRequest, attempt.engine, liveProgress, claimed.row.report_url)
      );

      if (index < plan.attempts.length - 1 && shouldFallbackToNextEngine(execution, attempt)) {
        liveProgress.onRunLog({
          ts: new Date().toISOString(),
          event: "execution_engine_fallback",
          data: {
            from_engine: attempt.engine,
            to_engine: plan.attempts[index + 1].engine,
            reason: "agentic_runtime_failed_before_valid_execution",
            report_status: sanitizeString(execution?.report?.status, 64) || null
          }
        });
        continue;
      }

      return execution;
    } catch (error) {
      lastError = error;

      liveProgress.onRunLog({
        ts: new Date().toISOString(),
        event: "execution_engine_attempt_failed",
        data: {
          execution_engine: attempt.engine,
          attempt: attemptNumber,
          total_attempts: plan.attempts.length,
          message: error && error.message ? error.message : String(error)
        }
      });

      if (index < plan.attempts.length - 1) {
        liveProgress.onRunLog({
          ts: new Date().toISOString(),
          event: "execution_engine_fallback",
          data: {
            from_engine: attempt.engine,
            to_engine: plan.attempts[index + 1].engine,
            reason: "execution_exception"
          }
        });
        continue;
      }

      throw error;
    }
  }

  throw lastError || new Error("No execution engine could process the run");
}

function shouldFinalizeOnCallbackFailure(callbackResult) {
  if (parseBooleanEnv(process.env.QA_CALLBACK_STRICT)) {
    return false;
  }

  const status = Number(callbackResult?.status || 0);
  if (status === 0) {
    return true;
  }

  // Callback endpoint can fail due ingress/body limits even when final report data is valid.
  // Keep run delivery resilient by finalizing from direct Supabase write unless strict mode is enabled.
  if (status === 413 || status === 414 || status === 431) {
    return true;
  }

  return status >= 500;
}

function extractBrandKey(runRequest) {
  const metadata = runRequest && typeof runRequest.metadata === "object" ? runRequest.metadata : {};
  const candidates = [
    metadata.brand_id,
    metadata.brandId,
    metadata.brand_key,
    metadata.brandKey,
    metadata.brand,
    metadata.brand_slug,
    metadata.brandSlug
  ];
  for (const candidate of candidates) {
    const value = sanitizeString(candidate, 256);
    if (value) {
      return value;
    }
  }
  return null;
}

function extractOwnerUserId(runRequest) {
  const metadata = runRequest && typeof runRequest.metadata === "object" ? runRequest.metadata : {};
  const candidates = [metadata.owner_user_id, metadata.ownerUserId, metadata.user_id, metadata.userId];
  for (const candidate of candidates) {
    const value = sanitizeString(candidate, 128);
    if (value) {
      return value;
    }
  }
  return null;
}

function isWebhookEventEnabled(webhook, eventType) {
  if (!webhook || !Array.isArray(webhook.events)) {
    return false;
  }
  return webhook.events.includes(String(eventType || "").toLowerCase());
}

function buildUiReportUrl(runId, runRequest) {
  const baseUrl = String(process.env.QA_PUBLIC_APP_URL || DEFAULT_PUBLIC_BASE_URL).replace(/\/$/, "");
  const params = new URLSearchParams({
    view: "report",
    run_id: runId
  });
  const brandKey = extractBrandKey(runRequest);
  if (brandKey) {
    params.set("brand", brandKey);
  }
  return `${baseUrl}/dashboard?${params.toString()}`;
}

function createRunWebhookSender(claimed, workerId, liveProgress) {
  const webhook = resolveRunWebhookConfig(claimed.runRequest);
  const basePayload = {
    run_id: claimed.row.run_id,
    target: sanitizeString(claimed.row?.target, 320) || null,
    target_url: sanitizeString(claimed.runRequest?.target_url, 4096) || null,
    source: sanitizeString(claimed.runRequest?.source, 64) || "qa_bot",
    owner_user_id: extractOwnerUserId(claimed.runRequest),
    brand_key: extractBrandKey(claimed.runRequest),
    status_url: sanitizeString(claimed.payload?.status_url, 4096) || null,
    report_url: sanitizeString(claimed.row?.report_url, 4096) || null,
    ui_report_url: buildUiReportUrl(claimed.row.run_id, claimed.runRequest),
    worker_id: workerId
  };

  return async (eventType, details = {}) => {
    const normalizedEvent = sanitizeString(eventType, 64).toLowerCase();
    if (!isWebhookEventEnabled(webhook, normalizedEvent)) {
      return { ok: true, skipped: true, attempts: 0, status: 0 };
    }

    const payload = {
      ...basePayload,
      ...details,
      run_id: basePayload.run_id
    };

    const result = await sendRunWebhook({
      webhook,
      event: normalizedEvent,
      run_id: basePayload.run_id,
      payload
    });

    if (liveProgress && typeof liveProgress.onRunLog === "function") {
      liveProgress.onRunLog({
        ts: new Date().toISOString(),
        event: "webhook_delivery",
        data: {
          event_type: normalizedEvent,
          ok: Boolean(result.ok),
          status: Number(result.status || 0) || 0,
          attempts: Number(result.attempts || 0) || 0,
          error: result.ok ? null : sanitizeString(result.error, 512) || "Webhook delivery failed"
        }
      });
    }

    return result;
  };
}

const PROGRESS_PERCENT_BY_EVENT = {
  local_runner_started: 3,
  run_started: 5,
  browser_context_ready: 10,
  target_loaded: 18,
  auth_entry_opened: 28,
  signup_form_filled: 40,
  signup_submitted: 50,
  otp_gate_detected: 58,
  otp_code_submitted: 65,
  otp_verified: 72,
  post_auth_detected: 76,
  feature_exploration_completed: 88,
  classification_finalized: 93,
  run_artifacts_written: 97,
  local_runner_finished: 99
};

function inferProgressMessage(entry) {
  const event = String(entry?.event || "").trim().toLowerCase();
  if (event === "local_runner_started") return "Starting local QA runner";
  if (event === "target_loaded") return "Target page loaded";
  if (event === "auth_entry_opened") return "Auth entry located";
  if (event === "signup_form_filled") return "Signup form filled";
  if (event === "signup_submitted") return "Signup submitted";
  if (event === "otp_gate_detected") return "OTP gate detected";
  if (event === "otp_verified") return "OTP verified";
  if (event === "post_auth_detected") return "Entered signed-in area";
  if (event === "feature_exploration_completed") return "Feature exploration completed";
  if (event === "classification_finalized") return "Classifying findings";
  if (event === "run_artifacts_written") return "Writing evidence artifacts";
  if (event === "local_runner_finished") return "Local QA runner finished";
  if (event === "run_failed") return "Run failed before completion";
  return "Processing run";
}

function clampProgressPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function createLiveProgressUpdater(claimed, workerId, options = {}) {
  const queueSeed = sanitizeQueue(claimed.payload?.queue);
  const baseWorker = claimed.payload?.worker && typeof claimed.payload.worker === "object" ? claimed.payload.worker : {};
  const baseArtifacts =
    claimed.payload?.artifacts && typeof claimed.payload.artifacts === "object" ? claimed.payload.artifacts : {};
  const liveStreamArtifacts = buildLiveStreamArtifacts(baseArtifacts);
  const flushIntervalMs = Math.max(2000, Number(process.env.QA_PROGRESS_FLUSH_INTERVAL_MS) || 12000);
  const maxRunLogEntries = Math.max(20, Number(process.env.QA_PROGRESS_MAX_LOG_ENTRIES) || 140);
  const maxPersistedRunLogEntries = Math.max(
    10,
    Math.min(maxRunLogEntries, Number(process.env.QA_PROGRESS_DB_MAX_LOG_ENTRIES) || 20)
  );
  const onProgressUpdate = typeof options.onProgressUpdate === "function" ? options.onProgressUpdate : null;
  const runLog = [];
  let previewReport = null;
  let hasRealCandidatePreview = false;
  const liveArtifactState = {
    local_matrix_dir: sanitizeString(baseArtifacts.local_matrix_dir, 4096) || null,
    local_run_json: sanitizeString(baseArtifacts.local_run_json, 4096) || null,
    local_trace_path: sanitizeString(baseArtifacts.local_trace_path, 4096) || null,
    local_video_path: sanitizeString(baseArtifacts.local_video_path, 4096) || null,
    local_qa_report_json: sanitizeString(baseArtifacts.local_qa_report_json, 4096) || null,
    local_qa_report_markdown: sanitizeString(baseArtifacts.local_qa_report_markdown, 4096) || null,
    live_stream_enabled: liveStreamArtifacts.live_stream_enabled === true,
    live_stream_mode: sanitizeString(liveStreamArtifacts.live_stream_mode, 64) || null,
    live_stream_public_base_url: sanitizeString(liveStreamArtifacts.live_stream_public_base_url, 4096) || null,
    live_stream_view_only: liveStreamArtifacts.live_stream_view_only !== false,
    live_stream_embed_url: sanitizeString(liveStreamArtifacts.live_stream_embed_url, 4096) || null,
    live_stream_viewer_url: sanitizeString(liveStreamArtifacts.live_stream_viewer_url, 4096) || null,
    local_screenshots: Array.isArray(baseArtifacts.local_screenshots)
      ? baseArtifacts.local_screenshots
          .map((item) => sanitizeString(item, 4096))
          .filter(Boolean)
          .slice(-120)
      : []
  };
  let progress = {
    phase: "queued",
    percent: 1,
    message: "Queued for local worker",
    updated_at: new Date().toISOString(),
    event_count: 0
  };
  let lastFlushAt = 0;
  let lastPersistedFingerprint = "";
  let pending = Promise.resolve();

  const maybeTrimRunLog = () => {
    if (runLog.length > maxRunLogEntries) {
      runLog.splice(0, runLog.length - maxRunLogEntries);
    }
  };

  const appendLiveScreenshot = (candidatePath) => {
    const screenshotPath = sanitizeString(candidatePath, 4096);
    if (!screenshotPath) {
      return;
    }
    if (!liveArtifactState.local_screenshots.includes(screenshotPath)) {
      liveArtifactState.local_screenshots.push(screenshotPath);
      if (liveArtifactState.local_screenshots.length > 120) {
        liveArtifactState.local_screenshots.splice(0, liveArtifactState.local_screenshots.length - 120);
      }
    }
  };

  const uniqueSanitizedValues = (values, maxItems = 60, maxLength = 4096) => {
    const normalized = [];
    const seen = new Set();

    for (const value of values || []) {
      const item = sanitizeString(value, maxLength);
      if (!item || seen.has(item)) {
        continue;
      }
      seen.add(item);
      normalized.push(item);
      if (normalized.length >= maxItems) {
        break;
      }
    }

    return normalized;
  };

  const getLatestLiveScreenshot = () =>
    Array.isArray(liveArtifactState.local_screenshots) && liveArtifactState.local_screenshots.length
      ? liveArtifactState.local_screenshots[liveArtifactState.local_screenshots.length - 1]
      : "";

  const buildPersistenceFingerprint = () => {
    const previewFindingIds = Array.isArray(previewReport?.findings)
      ? previewReport.findings
          .map((finding) => sanitizeString(finding?.id, 128))
          .filter(Boolean)
          .slice(0, 12)
          .join(",")
      : "";
    const percent = Number(progress?.percent);
    const progressBucket = Number.isFinite(percent)
      ? Math.max(0, Math.min(10, Math.floor(percent / 10)))
      : -1;

    return [
      sanitizeString(progress?.phase, 64) || "processing",
      String(progressBucket),
      previewFindingIds,
      sanitizeString(previewReport?.status, 64) || "",
      String(Boolean(previewReport))
    ].join("|");
  };

  const buildPreviewReportBase = () => {
    const existing = isPlainObject(previewReport) ? previewReport : {};
    const existingSummary = isPlainObject(existing.summary) ? existing.summary : {};
    const existingGallery = isPlainObject(existing.evidence_gallery) ? existing.evidence_gallery : {};

    return {
      ...existing,
      run_id:
        sanitizeString(existing.run_id || claimed.runRequest?.run_id || claimed.row?.run_id, 128) ||
        sanitizeString(claimed.row?.run_id, 128) ||
        null,
      target:
        sanitizeString(existing.target || claimed.runRequest?.target_url || claimed.row?.target, 4096) ||
        sanitizeString(claimed.row?.target, 4096) ||
        null,
      status: sanitizeString(existing.status, 64) || "processing",
      summary: {
        ...existingSummary,
        note:
          sanitizeString(existingSummary.note, 2000) ||
          "Live provisional findings are being captured while the worker explores."
      },
      findings: Array.isArray(existing.findings) ? existing.findings.slice(0, 30) : [],
      tested_journeys: Array.isArray(existing.tested_journeys) ? existing.tested_journeys.slice(0, 12) : [],
      recommendations: Array.isArray(existing.recommendations) ? existing.recommendations.slice(0, 12) : [],
      evidence_gallery: {
        ...existingGallery,
        screenshots: uniqueSanitizedValues(
          [
            ...(Array.isArray(existingGallery.screenshots) ? existingGallery.screenshots : []),
            ...liveArtifactState.local_screenshots
          ],
          60,
          4096
        ),
        videos: uniqueSanitizedValues(
          Array.isArray(existingGallery.videos) ? existingGallery.videos : [],
          20,
          4096
        )
      }
    };
  };

  const buildProvisionalFindingFromRunLog = (safeEntry) => {
    if (hasRealCandidatePreview) {
      return null;
    }

    const eventName = String(safeEntry?.event || "").trim().toLowerCase();
    const data = safeEntry?.data && typeof safeEntry.data === "object" ? safeEntry.data : {};
    const latestScreenshot = getLatestLiveScreenshot();
    const pageUrl =
      sanitizeString(
        data.url || data.page_url || data.pageUrl || claimed.runRequest?.target_url || claimed.row?.target_url,
        4096
      ) || null;

    if (eventName === "vision_only_step_failed") {
      const currentPreview = buildPreviewReportBase();
      const previousLiveFailures = currentPreview.findings.filter((finding) =>
        String(finding?.id || "").startsWith("live-provisional-vision-step-")
      ).length;
      const step = Number(data.step);
      const action = sanitizeString(data.action, 120) || "continue";
      const target = sanitizeString(data.target, 240) || "";
      const reason = sanitizeString(data.reason, 120).toLowerCase();
      const message =
        sanitizeString(data.message || data.reason, 4000) || "The planner could not complete the requested action.";
      const failureCount = previousLiveFailures + 1;
      const rawFinding = {
        id: `live-provisional-vision-step-${Number.isFinite(step) && step > 0 ? step : failureCount}`,
        type: failureCount >= 2 ? "dead_end" : "confusion_point",
        severity: failureCount >= 2 ? "high" : "medium",
        title: target ? `Could not ${action}: ${target}` : `Could not ${action}`,
        expected_behavior: target
          ? `The agent should be able to ${action} "${target}" and continue the flow.`
          : `The agent should be able to ${action} and continue the flow.`,
        observed_behavior: message,
        emotional_reaction: {
          primary: reason === "planner_error" ? "uncertainty" : "frustration",
          intensity: failureCount >= 2 ? 4 : 3
        },
        repro_steps: [
          `Open ${pageUrl || "the target page"}.`,
          target ? `Attempt to ${action} "${target}".` : `Attempt to ${action}.`,
          `Observe: ${message}.`
        ],
        page: {
          url: pageUrl
        },
        evidence: {
          screenshots: latestScreenshot ? [latestScreenshot] : []
        },
        fix_hint:
          "Review the UI state and interaction affordance around this step so the next action remains visible, understandable, and executable.",
        confidence: failureCount >= 2 ? 0.84 : 0.76,
        tags: ["live_provisional"]
      };

      return normalizeFinding(rawFinding, currentPreview.findings.length, {
        artifacts: {
          captured_screenshots: latestScreenshot ? [latestScreenshot] : []
        },
        target_url: pageUrl || claimed.runRequest?.target_url,
        runRequest: claimed.runRequest
      });
    }

    if (eventName === "run_failed") {
      const currentPreview = buildPreviewReportBase();
      if (currentPreview.findings.length) {
        return null;
      }
      const message =
        sanitizeString(data.message || data.error || data.reason, 4000) ||
        "The worker exited before completing the requested flow.";
      const rawFinding = {
        id: "live-provisional-run-failed",
        type: "dead_end",
        severity: "high",
        title: "Run failed before the flow completed",
        expected_behavior: "The worker should be able to complete the requested QA flow.",
        observed_behavior: message,
        emotional_reaction: {
          primary: "frustration",
          intensity: 4
        },
        repro_steps: [
          `Open ${pageUrl || claimed.runRequest?.target_url || "the target page"}.`,
          "Follow the primary flow.",
          `Observe the failure: ${message}.`
        ],
        page: {
          url: pageUrl || sanitizeString(claimed.runRequest?.target_url, 4096) || null
        },
        evidence: {
          screenshots: latestScreenshot ? [latestScreenshot] : []
        },
        fix_hint:
          "Review the step where the run aborts and ensure the flow can continue without hidden blockers or repeated action failures.",
        confidence: 0.82,
        tags: ["live_provisional"]
      };

      return normalizeFinding(rawFinding, currentPreview.findings.length, {
        artifacts: {
          captured_screenshots: latestScreenshot ? [latestScreenshot] : []
        },
        target_url: pageUrl || claimed.runRequest?.target_url,
        runRequest: claimed.runRequest
      });
    }

    return null;
  };

  const upsertPreviewFinding = (finding) => {
    if (!isPlainObject(finding)) {
      return false;
    }

    const nextPreview = buildPreviewReportBase();
    const findingId = sanitizeString(finding.id, 128);
    const findings = Array.isArray(nextPreview.findings) ? nextPreview.findings.slice(0, 30) : [];
    const existingIndex = findings.findIndex((item) => sanitizeString(item?.id, 128) === findingId);

    if (existingIndex >= 0) {
      findings[existingIndex] = finding;
    } else {
      findings.unshift(finding);
    }

    nextPreview.findings = findings.slice(0, 30);
    nextPreview.summary = {
      ...(isPlainObject(nextPreview.summary) ? nextPreview.summary : {}),
      note: `${nextPreview.findings.length} live finding${nextPreview.findings.length === 1 ? "" : "s"} detected so far. Final wording and severity may still change.`
    };
    previewReport = nextPreview;
    return true;
  };

  const buildLiveArtifactsPayload = () => {
    const existingArtifacts =
      claimed.payload?.artifacts && typeof claimed.payload.artifacts === "object" ? claimed.payload.artifacts : {};
    return {
      ...existingArtifacts,
      ...liveStreamArtifacts,
      local_matrix_dir: liveArtifactState.local_matrix_dir || existingArtifacts.local_matrix_dir || null,
      local_run_json: liveArtifactState.local_run_json || existingArtifacts.local_run_json || null,
      local_trace_path: liveArtifactState.local_trace_path || existingArtifacts.local_trace_path || null,
      local_video_path: liveArtifactState.local_video_path || existingArtifacts.local_video_path || null,
      local_qa_report_json:
        liveArtifactState.local_qa_report_json || existingArtifacts.local_qa_report_json || null,
      local_qa_report_markdown:
        liveArtifactState.local_qa_report_markdown || existingArtifacts.local_qa_report_markdown || null,
      live_stream_enabled:
        liveArtifactState.live_stream_enabled === true ||
        existingArtifacts.live_stream_enabled === true ||
        liveStreamArtifacts.live_stream_enabled === true,
      live_stream_mode:
        liveArtifactState.live_stream_mode || existingArtifacts.live_stream_mode || liveStreamArtifacts.live_stream_mode || null,
      live_stream_public_base_url:
        liveArtifactState.live_stream_public_base_url ||
        existingArtifacts.live_stream_public_base_url ||
        liveStreamArtifacts.live_stream_public_base_url ||
        null,
      live_stream_view_only:
        liveArtifactState.live_stream_view_only !== false &&
        existingArtifacts.live_stream_view_only !== false &&
        liveStreamArtifacts.live_stream_view_only !== false,
      live_stream_embed_url:
        liveArtifactState.live_stream_embed_url ||
        existingArtifacts.live_stream_embed_url ||
        liveStreamArtifacts.live_stream_embed_url ||
        null,
      live_stream_viewer_url:
        liveArtifactState.live_stream_viewer_url ||
        existingArtifacts.live_stream_viewer_url ||
        liveStreamArtifacts.live_stream_viewer_url ||
        null,
      local_screenshots: liveArtifactState.local_screenshots.length
        ? liveArtifactState.local_screenshots.slice(-120)
        : Array.isArray(existingArtifacts.local_screenshots)
          ? existingArtifacts.local_screenshots.slice(-120)
          : []
    };
  };

  const queueFlush = (force = false) => {
    pending = pending
      .then(async () => {
        const nextFingerprint = buildPersistenceFingerprint();
        const nowMs = Date.now();
        if (!force && nextFingerprint === lastPersistedFingerprint && nowMs - lastFlushAt < flushIntervalMs) {
          return;
        }
        lastFlushAt = nowMs;
        const now = new Date().toISOString();
        const payload = buildQueuePayload({
          existingPayload: claimed.payload,
          runRequest: claimed.runRequest,
          reportUrl: claimed.row?.report_url,
          statusUrl: claimed.payload?.status_url,
          queue: {
            ...queueSeed,
            status: "processing",
            started_at: queueSeed.started_at || now,
            worker_id: workerId,
            last_claimed_at: now,
            last_error: null
          },
          worker: {
            ...baseWorker,
            worker_id: workerId,
            heartbeat_at: now
          },
          reportJson: previewReport || claimed.payload?.report_json || null,
          reportMarkdown: claimed.payload?.report_markdown || null,
          artifacts: buildLiveArtifactsPayload(),
          runLog: runLog.slice(-maxPersistedRunLogEntries)
        });
        payload.progress = {
          ...progress,
          phase: sanitizeString(progress.phase, 64) || "processing",
          percent: clampProgressPercent(progress.percent),
          message: sanitizeString(progress.message, 240) || "Processing run",
          updated_at: now,
          event_count: runLog.length
        };

        const updated = await updateQueueRow(claimed.row.run_id, {
          status: "processing",
          findings: Array.isArray(previewReport?.findings) ? previewReport.findings : [],
          summary:
            previewReport?.summary ||
            claimed.row?.summary || {
              note: payload.progress.message
            },
          delivered_at: now,
          payload
        });

        if (updated.ok && updated.row && updated.row.payload && typeof updated.row.payload === "object") {
          claimed.payload = updated.row.payload;
          lastPersistedFingerprint = nextFingerprint;
        }

        if (onProgressUpdate) {
          Promise.resolve(
            onProgressUpdate({
              progress: payload.progress,
              queue: payload.queue,
              run_log: runLog.slice(-40),
              artifacts: payload.artifacts || null
            })
          ).catch(() => {
            // Ignore webhook/progress mirror errors to avoid interrupting run execution.
          });
        }
      })
      .catch(() => {
        // Progress write failures should not abort execution.
      });

    return pending;
  };

  return {
    onRunLog(entry) {
      const rawData =
        entry?.data && typeof entry.data === "object"
          ? entry.data
          : entry?.details && typeof entry.details === "object"
            ? entry.details
            : {};
      const safeEntry =
        entry && typeof entry === "object"
          ? {
              ts: sanitizeString(entry.ts || entry.timestamp, 128) || new Date().toISOString(),
              event: sanitizeString(entry.event, 128) || "progress",
              data: rawData
            }
          : {
              ts: new Date().toISOString(),
              event: "progress",
              data: {}
            };
      runLog.push(safeEntry);
      maybeTrimRunLog();

      const eventName = String(safeEntry.event || "").toLowerCase();
      if (eventName === "local_runner_started") {
        const outputDir = sanitizeString(safeEntry.data?.output_dir, 4096);
        if (outputDir) {
          liveArtifactState.local_matrix_dir = outputDir;
        }
      }
      if (eventName === "screenshot_captured") {
        appendLiveScreenshot(safeEntry.data?.path);
      }
      if (eventName === "run_artifacts_written") {
        const qaReportJsonPath = sanitizeString(safeEntry.data?.qa_report_json, 4096);
        const qaReportMarkdownPath = sanitizeString(safeEntry.data?.qa_report_md, 4096);
        const tracePath = sanitizeString(safeEntry.data?.trace, 4096);
        const videoPath = sanitizeString(safeEntry.data?.video, 4096);
        if (qaReportJsonPath) {
          liveArtifactState.local_qa_report_json = qaReportJsonPath;
        }
        if (qaReportMarkdownPath) {
          liveArtifactState.local_qa_report_markdown = qaReportMarkdownPath;
        }
        if (tracePath) {
          liveArtifactState.local_trace_path = tracePath;
        }
        if (videoPath) {
          liveArtifactState.local_video_path = videoPath;
        }
        if (Array.isArray(safeEntry.data?.screenshots)) {
          for (const candidate of safeEntry.data.screenshots.slice(-60)) {
            appendLiveScreenshot(candidate);
          }
        }
      }

      const nextPercent = PROGRESS_PERCENT_BY_EVENT[safeEntry.event];
      progress = {
        phase: safeEntry.event === "run_failed" ? "failed" : "processing",
        percent: Number.isFinite(nextPercent)
          ? Math.max(clampProgressPercent(progress.percent), clampProgressPercent(nextPercent))
          : clampProgressPercent(progress.percent),
        message: inferProgressMessage(safeEntry),
        updated_at: safeEntry.ts,
        event_count: runLog.length
      };

      const provisionalFinding = buildProvisionalFindingFromRunLog(safeEntry);
      const provisionalUpdated = provisionalFinding ? upsertPreviewFinding(provisionalFinding) : false;
      if (provisionalUpdated) {
        progress.message =
          sanitizeString(`Live finding detected: ${provisionalFinding.title}`, 240) || "Live finding detected";
        progress.percent = Math.max(progress.percent, 68);
      }

      queueFlush(provisionalUpdated);
    },
    onCandidateReport(report) {
      if (report && typeof report === "object") {
        previewReport = report;
        hasRealCandidatePreview = true;
      }
      progress = {
        phase: "processing",
        percent: Math.max(clampProgressPercent(progress.percent), 92),
        message: "Draft findings available",
        updated_at: new Date().toISOString(),
        event_count: runLog.length
      };
      queueFlush(true);
    },
    async flushNow() {
      await queueFlush(true);
    }
  };
}

function buildStoredExecutionPayload(finalReport, markdown, execution = {}) {
  const sanitizedReport = sanitizeReportForCallback(finalReport);
  const evidenceMedia =
    isPlainObject(execution.evidenceMedia) ||
    Array.isArray(execution.evidenceMedia?.screenshots) ||
    Array.isArray(execution.evidenceMedia?.videos)
      ? execution.evidenceMedia
      : buildEmbeddedEvidenceMedia(finalReport, execution.artifacts || {});
  const callbackArtifacts = sanitizeArtifactsForCallback(
    isPlainObject(execution.publishedArtifacts) ? execution.publishedArtifacts : execution.artifacts || {}
  );
  return {
    reportJson: sanitizedReport,
    findings: Array.isArray(sanitizedReport?.findings) ? sanitizedReport.findings : [],
    reportMarkdown: sanitizeReportMarkdown(markdown, 12000),
    artifacts: callbackArtifacts,
    runLog: sanitizeRunLogForCallback(execution.runLog),
    evidenceMedia
  };
}

function uniqueEvidenceItems(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => sanitizeString(value, 4096))
        .filter(Boolean)
    )
  );
}

function collectExecutionScreenshotEvidence(finalReport, execution = {}) {
  const report = finalReport && typeof finalReport === "object" ? finalReport : {};
  const artifacts = execution.artifacts && typeof execution.artifacts === "object" ? execution.artifacts : {};
  const screenshots = [
    ...(Array.isArray(report?.evidence_gallery?.screenshots) ? report.evidence_gallery.screenshots : []),
    ...((Array.isArray(report?.findings) ? report.findings : []).flatMap((finding) =>
      Array.isArray(finding?.evidence?.screenshots) ? finding.evidence.screenshots : []
    )),
    ...((Array.isArray(report?.tested_journeys) ? report.tested_journeys : []).flatMap((journey) =>
      Array.isArray(journey?.evidence?.screenshots) ? journey.evidence.screenshots : []
    )),
    ...(Array.isArray(artifacts.local_screenshots) ? artifacts.local_screenshots : []),
    ...(Array.isArray(artifacts.captured_screenshots) ? artifacts.captured_screenshots : [])
  ];
  return uniqueEvidenceItems(screenshots);
}

function collectExecutionVideoEvidence(finalReport, execution = {}) {
  const report = finalReport && typeof finalReport === "object" ? finalReport : {};
  const artifacts = execution.artifacts && typeof execution.artifacts === "object" ? execution.artifacts : {};
  const videos = [
    ...(Array.isArray(report?.evidence_gallery?.videos) ? report.evidence_gallery.videos : []),
    ...((Array.isArray(report?.findings) ? report.findings : []).flatMap((finding) =>
      Array.isArray(finding?.evidence?.videos) ? finding.evidence.videos : []
    )),
    ...((Array.isArray(report?.tested_journeys) ? report.tested_journeys : []).flatMap((journey) =>
      Array.isArray(journey?.evidence?.videos) ? journey.evidence.videos : []
    )),
    [
      artifacts.blocker_clip_url,
      artifacts.local_video_url,
      artifacts.blocker_clip_path,
      artifacts.local_video_path
    ]
  ].flat();
  return uniqueEvidenceItems(videos);
}

function assessExecutionEvidence(finalReport, execution = {}, options = {}) {
  const requiredScreenshots = Math.max(
    1,
    Number(options.requiredScreenshots || process.env.QA_REQUIRED_SCREENSHOT_COUNT) || 4
  );
  const requiredVideos = Math.max(
    0,
    Number(options.requiredVideos || process.env.QA_REQUIRED_VIDEO_COUNT) || 1
  );
  const screenshots = collectExecutionScreenshotEvidence(finalReport, execution);
  const videos = collectExecutionVideoEvidence(finalReport, execution);
  const missing = [];
  if (screenshots.length < requiredScreenshots) {
    missing.push(`at least ${requiredScreenshots} screenshots`);
  }
  if (videos.length < requiredVideos) {
    missing.push(`at least ${requiredVideos} video artifact${requiredVideos === 1 ? "" : "s"}`);
  }

  return {
    screenshots,
    videos,
    screenshotCount: screenshots.length,
    videoCount: videos.length,
    requiredScreenshots,
    requiredVideos,
    ok: missing.length === 0,
    missing
  };
}

async function markCallbackFailure(claimed, finalReport, markdown, execution, callbackResult, workerId) {
  const now = new Date().toISOString();
  const existingQueue = sanitizeQueue(claimed.payload?.queue);
  const nextAttemptCount = existingQueue.attempt_count;
  const maxAttempts = existingQueue.max_attempts || 3;
  const shouldRetry = nextAttemptCount < maxAttempts;
  const queueStatus = shouldRetry ? getRetryQueueStatus(existingQueue.status) : "failed";
  const storedExecution = buildStoredExecutionPayload(finalReport, markdown, execution);

  const payload = buildQueuePayload({
    existingPayload: claimed.payload,
    runRequest: claimed.runRequest,
    reportUrl: claimed.row?.report_url,
    statusUrl: claimed.payload?.status_url,
    queue: {
      ...existingQueue,
      status: queueStatus,
      completed_at: shouldRetry ? null : now,
      worker_id: workerId,
      callback_attempts: callbackResult.attempts,
      callback_ok: false,
      callback_status: callbackResult.status || null,
      last_error: callbackResult.error || "Failed to deliver final callback"
    },
    worker: {
      worker_id: workerId,
      completed_at: shouldRetry ? null : now
    },
    reportJson: storedExecution.reportJson,
    reportMarkdown: storedExecution.reportMarkdown,
    artifacts: storedExecution.artifacts,
    runLog: storedExecution.runLog,
    evidenceMedia: storedExecution.evidenceMedia
  });

  return updateQueueRow(claimed.row.run_id, {
    status: queueStatus,
    findings: storedExecution.findings,
    summary: finalReport.summary,
    report_url: claimed.row?.report_url || finalReport.report_url || null,
    delivered_at: now,
    payload
  });
}

async function markCallbackSuccess(claimed, finalReport, markdown, execution, callbackResult, workerId) {
  const now = new Date().toISOString();
  const existingQueue = sanitizeQueue(claimed.payload?.queue);
  const callbackOk = Boolean(callbackResult?.ok);
  const callbackStatus = Number(callbackResult?.status || 0) || null;
  const callbackError = callbackOk
    ? null
    : sanitizeString(callbackResult?.error || "Callback delivery failed; finalized from worker update", 4000);
  const storedExecution = buildStoredExecutionPayload(finalReport, markdown, execution);

  const payload = buildQueuePayload({
    existingPayload: claimed.payload,
    runRequest: claimed.runRequest,
    reportUrl: claimed.row?.report_url,
    statusUrl: claimed.payload?.status_url,
    queue: {
      ...existingQueue,
      status: "completed",
      completed_at: now,
      worker_id: workerId,
      callback_attempts: Number(callbackResult?.attempts) || 0,
      callback_ok: callbackOk,
      callback_status: callbackStatus,
      last_error: callbackError
    },
    worker: {
      worker_id: workerId,
      completed_at: now
    },
    reportJson: storedExecution.reportJson,
    reportMarkdown: storedExecution.reportMarkdown,
    artifacts: storedExecution.artifacts,
    runLog: storedExecution.runLog,
    evidenceMedia: storedExecution.evidenceMedia
  });

  return updateQueueRow(claimed.row.run_id, {
    status: finalReport.status,
    findings: storedExecution.findings,
    summary: finalReport.summary,
    report_url: claimed.row?.report_url || finalReport.report_url || null,
    delivered_at: now,
    payload
  });
}

async function maybeQueueRepoTriageAfterRun(claimed, finalReport) {
  const now = new Date().toISOString();
  const decision = shouldEnqueueRepoTriage(finalReport, claimed.runRequest);
  if (!decision.enabled) {
    return updateStoredReportRepoTriage(claimed.row.run_id, {
      repoTriage: {
        status: "disabled",
        updated_at: now
      }
    });
  }

  if (!decision.shouldQueue) {
    return updateStoredReportRepoTriage(claimed.row.run_id, {
      repoTriage: {
        ...decision.config,
        status: "skipped",
        signal_count: 0,
        signal_types: [],
        summary: decision.reason,
        reason: decision.reason,
        completed_at: now,
        updated_at: now
      }
    });
  }

  const ownerMetadata = isPlainObject(claimed.runRequest?.metadata) ? claimed.runRequest.metadata : {};
  const queued = await enqueueRepoTriageJob(
    {
      run_id: claimed.row.run_id,
      target: finalReport.target,
      target_url: claimed.runRequest?.target_url || finalReport?.metadata?.target_url || "",
      report_status: finalReport.status,
      finding_count: Array.isArray(finalReport.findings) ? finalReport.findings.length : 0,
      repo_triage: decision.config
    },
    {
      ownerUserId: sanitizeString(ownerMetadata.owner_user_id || ownerMetadata.ownerUserId, 128),
      ownerEmail: sanitizeString(ownerMetadata.owner_email || ownerMetadata.ownerEmail, 320),
      brandKey: sanitizeString(ownerMetadata.brand_key || ownerMetadata.brandId || ownerMetadata.brand_id, 256),
      statusUrl: claimed.payload?.status_url,
      reportUrl: claimed.row?.report_url
    }
  );

  if (!queued.ok) {
    return updateStoredReportRepoTriage(claimed.row.run_id, {
      repoTriage: {
        ...decision.config,
        status: "failed",
        signal_count: decision.findings.length,
        signal_types: decision.signalTypes || [],
        summary: queued.error || "Could not enqueue repo triage.",
        reason: queued.error || "Could not enqueue repo triage.",
        completed_at: now,
        updated_at: now
      }
    });
  }

  return updateStoredReportRepoTriage(claimed.row.run_id, {
    repoTriage: {
      ...decision.config,
      status: "queued",
      job_id: queued.row?.job_id || null,
      signal_count: decision.findings.length,
      signal_types: decision.signalTypes || [],
      summary: "Blind QA finished. Code-aware diagnosis is queued.",
      queued_at: now,
      updated_at: now
    }
  });
}

async function processOne(workerId, options = {}) {
  const heartbeat = options.heartbeat || null;
  const claimed = await claimNextQaRun({ workerId });
  if (!claimed.ok) {
    throw new Error(claimed.error || "Failed to claim queued run");
  }

  if (!claimed.row) {
    if (heartbeat) {
      await heartbeat.onSleep("waiting_for_jobs");
    }
    return { processed: false, reason: "no_jobs" };
  }

  if (heartbeat) {
    await heartbeat.onClaimed(claimed.row.run_id);
  }

  let sendWebhook = async () => ({ ok: true, skipped: true, attempts: 0, status: 0 });
  let progressWebhookState = { bucket: -1, phase: "" };

  const liveProgress = createLiveProgressUpdater(claimed, workerId, {
    onProgressUpdate: async ({ progress, queue }) => {
      if (heartbeat) {
        await heartbeat.onProgress(progress?.phase || queue?.status || "processing");
      }
      const phase = sanitizeString(progress?.phase, 64).toLowerCase() || "processing";
      const percent = Number(progress?.percent);
      const bucket = Number.isFinite(percent)
        ? Math.max(0, Math.min(10, Math.floor(percent / 10)))
        : -1;
      const shouldDispatch =
        phase !== progressWebhookState.phase ||
        (bucket >= 0 && bucket > progressWebhookState.bucket);

      if (!shouldDispatch) {
        return;
      }

      progressWebhookState = {
        bucket,
        phase
      };

      await sendWebhook("run.progress", {
        queue_status: sanitizeString(queue?.status, 64) || "processing",
        progress: progress && typeof progress === "object" ? progress : null
      });
    }
  });

  sendWebhook = createRunWebhookSender(claimed, workerId, liveProgress);
  await sendWebhook("run.started", {
    queue_status: "processing",
    progress: {
      phase: "processing",
      percent: 1,
      message: "Run claimed by worker",
      updated_at: new Date().toISOString()
    }
  });

  let execution = null;
  try {
    execution = await executeRunWithPlan(claimed, workerId, liveProgress);
  } catch (error) {
    const failureMessage = error && error.message ? error.message : String(error);
    execution = {
      report: normalizeReport({
        candidateReport: {
          run_id: claimed.runRequest.run_id,
          target: claimed.runRequest.target_url,
          status: "failed",
          findings: []
        },
        runRequest: claimed.runRequest,
        artifacts: {},
        actions: {},
        reportUrl: claimed.row.report_url,
        deliveredAt: new Date().toISOString(),
        failureMessage,
        runLog: [
          {
            ts: new Date().toISOString(),
            event: "run_failed",
            data: { message: failureMessage }
          }
        ]
      }),
      markdown: "",
      artifacts: {},
      runLog: [
        {
          ts: new Date().toISOString(),
          event: "run_failed",
          data: { message: failureMessage }
        }
      ],
      agentActions: {}
    };
    liveProgress.onRunLog({
      ts: new Date().toISOString(),
      event: "run_failed",
      data: { message: failureMessage }
    });
  }

  await liveProgress.flushNow();

  let finalReport = execution.report;
  let markdown = execution.markdown;
  let reportValidation = validateReport(finalReport);

  if (!reportValidation.ok) {
    const normalizedReport = normalizeReport({
      candidateReport: {
        ...finalReport
      },
      runRequest: claimed.runRequest,
      artifacts: execution.artifacts,
      actions: execution.agentActions || {},
      reportUrl: claimed.row.report_url,
      deliveredAt: new Date().toISOString(),
      runLog: Array.isArray(execution.runLog) ? execution.runLog : []
    });
    reportValidation = validateReport(normalizedReport);

    if (reportValidation.ok) {
      finalReport = normalizedReport;
      markdown = buildMarkdownReport(finalReport, claimed.runRequest, {
        generated_at: new Date().toISOString(),
        raw_agent_message_excerpt: execution.rawAgentMessage || ""
      });
    } else {
      finalReport = normalizeReport({
        candidateReport: {
          ...finalReport,
          status: "failed_validation"
        },
        runRequest: claimed.runRequest,
        artifacts: execution.artifacts,
        actions: execution.agentActions || {},
        reportUrl: claimed.row.report_url,
        deliveredAt: new Date().toISOString(),
        failureMessage: `Local validation failed before callback delivery: ${reportValidation.error}`,
        runLog: Array.isArray(execution.runLog) ? execution.runLog : [],
        rawAgentMessage: execution.rawAgentMessage || ""
      });
      finalReport.status = "failed_validation";
      markdown = buildMarkdownReport(finalReport, claimed.runRequest, {
        generated_at: new Date().toISOString(),
        raw_agent_message_excerpt: reportValidation.error
      });
    }
  }

  const evidenceAssessment = assessExecutionEvidence(finalReport, execution);
  if (!evidenceAssessment.ok) {
    const evidenceFailureMessage = `Evidence capture requirements not met: missing ${evidenceAssessment.missing.join(
      " and "
    )}. Captured ${evidenceAssessment.screenshotCount} screenshot(s) and ${evidenceAssessment.videoCount} video artifact(s).`;
    finalReport = normalizeReport({
      candidateReport: {
        ...finalReport,
        status: "failed_validation"
      },
      runRequest: claimed.runRequest,
      artifacts: execution.artifacts,
      actions: execution.agentActions || {},
      reportUrl: claimed.row.report_url,
      deliveredAt: new Date().toISOString(),
      failureMessage: evidenceFailureMessage,
      runLog: Array.isArray(execution.runLog) ? execution.runLog : [],
      failureDiagnostics:
        finalReport && typeof finalReport.failure_diagnostics === "object" ? finalReport.failure_diagnostics : null,
      rawAgentMessage: execution.rawAgentMessage || ""
    });
    finalReport.status = "failed_validation";
    markdown = buildMarkdownReport(finalReport, claimed.runRequest, {
      generated_at: new Date().toISOString(),
      raw_agent_message_excerpt: evidenceFailureMessage
    });
    liveProgress.onRunLog({
      ts: new Date().toISOString(),
      event: "evidence_requirements_failed",
      data: {
        screenshot_count: evidenceAssessment.screenshotCount,
        video_count: evidenceAssessment.videoCount,
        required_screenshots: evidenceAssessment.requiredScreenshots,
        required_videos: evidenceAssessment.requiredVideos,
        message: evidenceFailureMessage
      }
    });
    await liveProgress.flushNow();
  }

  const portableEvidenceMedia = await buildPortableEvidenceMedia(finalReport, execution.artifacts || {}, {
    runId: claimed.row.run_id
  });
  const publishedArtifacts = buildPublishedArtifacts(execution.artifacts || {}, {
    evidenceMedia: portableEvidenceMedia
  });
  const executionForStorage = {
    ...execution,
    evidenceMedia: portableEvidenceMedia,
    publishedArtifacts
  };

  const callbackUrl =
    process.env.QA_CALLBACK_URL || `${process.env.QA_PUBLIC_APP_URL || DEFAULT_PUBLIC_BASE_URL}/api/qa-report-callback`;
  const callbackResult = await sendFinalCallback({
    report: finalReport,
    markdown,
    artifacts: publishedArtifacts,
    runLog: execution.runLog,
    callbackUrl,
    callbackSecret: process.env.QA_CALLBACK_SECRET,
    extraPayload: {
      queue: {
        ...sanitizeQueue(claimed.payload?.queue),
        status: "completed",
        worker_id: workerId
      },
      status_url: claimed.payload?.status_url || null,
      run_request: claimed.runRequest,
      ...(portableEvidenceMedia ? { evidence_media: portableEvidenceMedia } : {}),
      worker: {
        worker_id: workerId
      }
    }
  });

  if (!callbackResult.ok) {
    if (shouldFinalizeOnCallbackFailure(callbackResult)) {
      const finalized = await markCallbackSuccess(
        claimed,
        finalReport,
        markdown,
        executionForStorage,
        callbackResult,
        workerId
      );
      cleanupPublishedLocalArtifacts(finalReport, execution.artifacts || {}, portableEvidenceMedia);
      await maybeQueueRepoTriageAfterRun(claimed, finalReport);
      const finalEventType = ["completed", "partial"].includes(
        String(finalReport.status || "").toLowerCase()
      )
        ? "run.completed"
        : "run.failed";
      await sendWebhook(finalEventType, {
        queue_status: sanitizeString(finalized.queue?.queue_status, 64) || "completed",
        report_status: sanitizeString(finalReport.status, 64) || "completed",
        report_ready: true,
        findings_count: Array.isArray(finalReport.findings) ? finalReport.findings.length : 0,
        summary: finalReport.summary || null,
        report: finalReport,
        callback_delivery: {
          ok: false,
          status: Number(callbackResult?.status || 0) || 0,
          attempts: Number(callbackResult?.attempts || 0) || 0,
          warning: sanitizeString(callbackResult?.error, 512) || "Final callback delivery failed"
        }
      });
      if (heartbeat) {
        await heartbeat.onCompleted(finalReport.status);
      }
      return {
        processed: true,
        run_id: claimed.row.run_id,
        status: finalReport.status,
        callback: callbackResult,
        warning: "callback_delivery_failed_finalized_from_worker"
      };
    }

    const callbackFailed = await markCallbackFailure(
      claimed,
      finalReport,
      markdown,
      executionForStorage,
      callbackResult,
      workerId
    );
    await sendWebhook("run.failed", {
      queue_status: sanitizeString(callbackFailed.queue?.queue_status, 64) || "failed",
      report_status: sanitizeString(finalReport.status, 64) || "failed",
      report_ready: Boolean(finalReport),
      findings_count: Array.isArray(finalReport.findings) ? finalReport.findings.length : 0,
      summary: finalReport.summary || null,
      report: finalReport,
      callback_delivery: {
        ok: false,
        status: Number(callbackResult?.status || 0) || 0,
        attempts: Number(callbackResult?.attempts || 0) || 0,
        error: sanitizeString(callbackResult?.error, 512) || "Final callback delivery failed"
      },
      will_retry: sanitizeString(callbackFailed.queue?.queue_status, 64) === "retryable"
    });
    if (heartbeat) {
      await heartbeat.onCompleted("callback_failed");
    }
    return {
      processed: true,
      run_id: claimed.row.run_id,
      status: "callback_failed",
      callback: callbackResult
    };
  }

  const callbackOk = await markCallbackSuccess(
    claimed,
    finalReport,
    markdown,
    executionForStorage,
    callbackResult,
    workerId
  );
  cleanupPublishedLocalArtifacts(finalReport, execution.artifacts || {}, portableEvidenceMedia);
  await maybeQueueRepoTriageAfterRun(claimed, finalReport);
  const finalEventType = ["completed", "partial"].includes(String(finalReport.status || "").toLowerCase())
    ? "run.completed"
    : "run.failed";
  await sendWebhook(finalEventType, {
    queue_status: sanitizeString(callbackOk.queue?.queue_status, 64) || "completed",
    report_status: sanitizeString(finalReport.status, 64) || "completed",
    report_ready: true,
    findings_count: Array.isArray(finalReport.findings) ? finalReport.findings.length : 0,
    summary: finalReport.summary || null,
    report: finalReport,
    callback_delivery: {
      ok: true,
      status: Number(callbackResult?.status || 0) || 0,
      attempts: Number(callbackResult?.attempts || 0) || 0
    }
  });

  if (heartbeat) {
    await heartbeat.onCompleted(finalReport.status);
  }

  return {
    processed: true,
    run_id: claimed.row.run_id,
    status: finalReport.status,
    callback: callbackResult
  };
}

async function main() {
  bootstrapEnv();
  const args = parseArgs(process.argv.slice(2));

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY are required for the QA worker");
  }

  const heartbeat = createWorkerHeartbeat(args.workerId, {
    once: args.once,
    pollIntervalMs: args.intervalMs
  });
  heartbeat.start();

  try {
    for (;;) {
      const result = await processOne(args.workerId, { heartbeat });
      if (!result.processed) {
        const repoTriageResult = await repoTriageWorker.processOne(`${args.workerId}-repo-triage`);
        if (repoTriageResult?.processed) {
          console.log(JSON.stringify(repoTriageResult, null, 2));
          if (args.once) {
            return;
          }
          await heartbeat.onSleep("awaiting_next_job");
          continue;
        }

        if (args.once) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        await heartbeat.onSleep("waiting_for_jobs");
        await sleep(args.intervalMs);
        continue;
      }

      console.log(JSON.stringify(result, null, 2));

      if (args.once) {
        return;
      }

      await heartbeat.onSleep("awaiting_next_job");
    }
  } catch (error) {
    await heartbeat.onError(error, "worker_error");
    throw error;
  } finally {
    await heartbeat.stop("stopped");
  }
}

module.exports = {
  processOne,
  __private: {
    hasAnyModelApiKey,
    getLocalAgentAvailability,
    resolveRequestedExecutionEngine,
    buildExecutionPlan,
    buildExecutionRunRequest,
    shouldFallbackToNextEngine,
    buildStoredExecutionPayload,
    collectExecutionScreenshotEvidence,
    collectExecutionVideoEvidence,
    assessExecutionEvidence,
    createWorkerHeartbeat,
    resolveWorkerBuildMetadata
  }
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  });
}
