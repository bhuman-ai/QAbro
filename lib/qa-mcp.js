const crypto = require("crypto");
const {
  readQaMcpStoredAuth,
  resolveQaMcpAuthPath,
  writeQaMcpStoredAuth
} = require("./qa-mcp-auth");
const {
  DEFAULT_PUBLIC_BASE_URL,
  DEFAULT_EXECUTION_ENGINE,
  FALLBACK_PERSONA,
  normalizeExecutionEngine,
  normalizeUrl,
  sanitizeString,
  sleep,
  validateRunRequest
} = require("./qa-core");

const DEFAULT_TIMEOUT_SECONDS = 60 * 20;
const DEFAULT_POLL_INTERVAL_SECONDS = 5;
const TERMINAL_REPORT_STATUSES = new Set(["completed", "partial", "failed", "failed_validation"]);
const TERMINAL_QUEUE_STATUSES = new Set(["completed", "failed", "cancelled"]);
const MCP_QA_RESOURCE_TEMPLATES = Object.freeze({
  run_status: "qa://runs/{run_id}/status",
  run_report: "qa://runs/{run_id}/report",
  run_report_markdown: "qa://runs/{run_id}/report.md",
  manual_qa_report_markdown: "qa://manual/{session_id}/report.md"
});

const CODING_AGENT_QA_VERDICTS = Object.freeze({
  PASS: "pass",
  NEEDS_FIX: "needs_fix",
  NEEDS_REVIEW: "needs_review",
  TIMED_OUT: "timed_out"
});

function sanitizeHostname(value) {
  return sanitizeString(value, 512)
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function deriveBrandKey(targetUrl, explicitBrand = "") {
  const direct = sanitizeString(explicitBrand, 256);
  if (direct) {
    return direct;
  }

  const normalized = normalizeUrl(targetUrl);
  if (!normalized) {
    return "";
  }

  try {
    const parsed = new URL(normalized);
    return sanitizeHostname(parsed.hostname);
  } catch {
    return "";
  }
}

function buildRunId(targetUrl, brandKey = "") {
  const brand = sanitizeHostname(brandKey || deriveBrandKey(targetUrl) || "qa");
  const suffix = crypto.randomUUID().slice(0, 8);
  return sanitizeString(`mcp_${brand}_${Date.now()}_${suffix}`, 128).replace(/[^a-z0-9_-]/gi, "_");
}

function normalizeScopeMode(value, hasFeatureContext) {
  const raw = sanitizeString(value, 64).toLowerCase();
  if (["core_20m", "deep_45m", "feature_targeted"].includes(raw)) {
    return raw;
  }
  return hasFeatureContext ? "feature_targeted" : "core_20m";
}

function buildScenarioList(input = {}) {
  const scenarios = [];
  const featureName = sanitizeString(input.feature_name || input.featureName, 240);
  const taskToTry = sanitizeString(input.task_to_try || input.taskToTry, 1000);
  const expectedSuccess = sanitizeString(input.expected_success || input.expectedSuccess, 1000);
  const entryPath = sanitizeString(input.entry_path || input.entryPath, 1000);
  const extraScenarios = Array.isArray(input.scenario_list || input.scenarioList)
    ? input.scenario_list || input.scenarioList
    : [];
  const metadata = input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata) ? input.metadata : {};
  const instructionPriority = sanitizeString(metadata.instruction_priority || metadata.instructionPriority, 64)
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const callerKind = sanitizeString(metadata.caller_kind || metadata.callerKind, 64).toLowerCase();
  const customerScenarioCount = Number.isFinite(Number(metadata.customer_scenario_count))
    ? Math.max(0, Math.floor(Number(metadata.customer_scenario_count)))
    : 0;
  const shouldPrioritizeCustomerScenarios =
    instructionPriority === "customer_first" && callerKind === "coding_agent" && customerScenarioCount > 0;

  if (shouldPrioritizeCustomerScenarios) {
    const customerScenarios = extraScenarios.slice(0, customerScenarioCount);
    const contextScenarios = extraScenarios.slice(customerScenarioCount);
    const taskWasCustomerProvided = metadata.customer_task_to_try_present === true;
    const expectedWasCustomerProvided = metadata.customer_expected_success_present === true;

    if (entryPath) {
      scenarios.push(`Start from this path if possible: ${entryPath}.`);
    }
    if (taskWasCustomerProvided && taskToTry) {
      scenarios.push(`Try to do this: ${taskToTry}.`);
    }
    if (expectedWasCustomerProvided && expectedSuccess) {
      scenarios.push(`Only count the flow as successful if this happens: ${expectedSuccess}.`);
    }
    for (const rawScenario of customerScenarios) {
      const scenario = sanitizeString(rawScenario, 1000);
      if (scenario) {
        scenarios.push(scenario);
      }
    }
    if (featureName) {
      scenarios.push(`Focus on this feature: ${featureName}.`);
    }
    if (!taskWasCustomerProvided && taskToTry) {
      scenarios.push(`Try to do this: ${taskToTry}.`);
    }
    if (!expectedWasCustomerProvided && expectedSuccess) {
      scenarios.push(`Only count the flow as successful if this happens: ${expectedSuccess}.`);
    }
    for (const rawScenario of contextScenarios) {
      const scenario = sanitizeString(rawScenario, 1000);
      if (scenario) {
        scenarios.push(scenario);
      }
    }
  } else {
    if (featureName) {
      scenarios.push(`Focus on this feature: ${featureName}.`);
    }
    if (entryPath) {
      scenarios.push(`Start from this path if possible: ${entryPath}.`);
    }
    if (taskToTry) {
      scenarios.push(`Try to do this: ${taskToTry}.`);
    }
    if (expectedSuccess) {
      scenarios.push(`Only count the flow as successful if this happens: ${expectedSuccess}.`);
    }

    for (const rawScenario of extraScenarios) {
      const scenario = sanitizeString(rawScenario, 1000);
      if (scenario) {
        scenarios.push(scenario);
      }
    }
  }

  if (!scenarios.length) {
    scenarios.push("Open the site, reach the feature being worked on, and try to complete one meaningful user flow.");
  }

  const deduped = [];
  const seen = new Set();
  for (const rawScenario of scenarios) {
    const normalized = sanitizeString(rawScenario, 1000);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(normalized);
  }
  return deduped.slice(0, 12);
}

function sanitizeStringList(value, maxItems = 30, maxLength = 400) {
  if (!Array.isArray(value)) {
    return [];
  }
  const output = [];
  const seen = new Set();
  for (const rawItem of value) {
    const item = sanitizeString(rawItem, maxLength);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(item);
    if (output.length >= maxItems) {
      break;
    }
  }
  return output;
}

function buildCodingAgentQaInput(input = {}) {
  const workSummary = sanitizeString(input.work_summary || input.workSummary, 1200);
  const repository = sanitizeString(input.repository || input.repo, 500);
  const branch = sanitizeString(input.branch, 240);
  const commitSha = sanitizeString(input.commit_sha || input.commitSha, 120);
  const pullRequestUrl = normalizeUrl(input.pull_request_url || input.pullRequestUrl || input.pr_url || input.prUrl);
  const changedFiles = sanitizeStringList(input.changed_files || input.changedFiles, 40, 320);
  const acceptanceCriteria = sanitizeStringList(input.acceptance_criteria || input.acceptanceCriteria, 20, 800);
  const developerNotes = sanitizeString(input.developer_notes || input.developerNotes, 1600);
  const baseScenarioList = sanitizeStringList(input.scenario_list || input.scenarioList, 12, 1000);
  const explicitTaskToTry = sanitizeString(input.task_to_try || input.taskToTry, 1000);
  const explicitExpectedSuccess = sanitizeString(input.expected_success || input.expectedSuccess, 1000);
  const explicitFeatureName = sanitizeString(input.feature_name || input.featureName, 240);
  const generatedScenarios = [];

  if (workSummary) {
    generatedScenarios.push(`Implementation under test: ${workSummary}.`);
  }
  if (repository || branch || commitSha || pullRequestUrl) {
    generatedScenarios.push(
      [
        "Source context:",
        repository ? `repo=${repository}` : "",
        branch ? `branch=${branch}` : "",
        commitSha ? `commit=${commitSha}` : "",
        pullRequestUrl ? `PR=${pullRequestUrl}` : ""
      ]
        .filter(Boolean)
        .join(" ")
    );
  }
  if (changedFiles.length) {
    generatedScenarios.push(`Changed files to keep in mind: ${changedFiles.join(", ")}.`);
  }
  if (acceptanceCriteria.length) {
    generatedScenarios.push(`Acceptance criteria: ${acceptanceCriteria.join(" | ")}.`);
  }
  if (developerNotes) {
    generatedScenarios.push(`Developer notes: ${developerNotes}.`);
  }

  const mergedScenarios = [...baseScenarioList, ...generatedScenarios].slice(0, 12);
  const expectedSuccess =
    explicitExpectedSuccess ||
    (acceptanceCriteria.length ? acceptanceCriteria.join(" | ") : "");
  const taskToTry =
    explicitTaskToTry ||
    (workSummary
      ? `Act like a real user and verify the implemented work: ${workSummary}.`
      : "Act like a real user and verify the recently implemented work on this preview.");

  return {
    ...input,
    feature_name:
      explicitFeatureName ||
      sanitizeString(workSummary, 120).replace(/[.!?]+$/g, "") ||
      "coding-agent work",
    task_to_try: taskToTry,
    expected_success: expectedSuccess || undefined,
    scenario_list: mergedScenarios.length ? mergedScenarios : undefined,
    metadata: {
      ...(input.metadata && typeof input.metadata === "object" ? input.metadata : {}),
      caller_kind: "coding_agent",
      instruction_priority: "customer_first",
      customer_scenario_count: baseScenarioList.length,
      generated_context_scenario_count: generatedScenarios.length,
      customer_task_to_try_present: Boolean(explicitTaskToTry),
      customer_expected_success_present: Boolean(explicitExpectedSuccess),
      customer_feature_name_present: Boolean(explicitFeatureName),
      repository: repository || null,
      branch: branch || null,
      commit_sha: commitSha || null,
      pull_request_url: pullRequestUrl || null,
      changed_files: changedFiles,
      acceptance_criteria: acceptanceCriteria,
      work_summary: workSummary || null,
      developer_notes: developerNotes || null
    }
  };
}

function normalizeCredentials(input = {}) {
  const credentials = input.credentials && typeof input.credentials === "object" ? input.credentials : null;
  if (!credentials) {
    return null;
  }

  const loginUrl = normalizeUrl(credentials.login_url || credentials.loginUrl);
  const username = sanitizeString(credentials.username, 320);
  const password = sanitizeString(credentials.password, 320);
  const otpMode = sanitizeString(credentials.otp_mode || credentials.otpMode, 64).toLowerCase() || "none";

  return {
    login_url: loginUrl || null,
    username: username || null,
    password: password || null,
    otp_mode: ["none", "manual_prompt", "provider_hook"].includes(otpMode) ? otpMode : "none"
  };
}

function resolveAuthPolicy(input = {}) {
  const raw = sanitizeString(input.auth_strategy || input.authStrategy || input.auth_policy || input.authPolicy, 64).toLowerCase();
  if (raw) {
    return raw;
  }
  if (normalizeCredentials(input)) {
    return "provided_credentials";
  }
  if (input.new_account_required === false || input.newAccountRequired === false) {
    return "public_only";
  }
  return "signup_if_needed";
}

function buildQaRunRequest(input = {}, options = {}) {
  const targetUrl = normalizeUrl(input.target_url || input.targetUrl || input.url);
  if (!targetUrl) {
    throw new Error("target_url must be a valid http or https URL");
  }

  const inputMetadata = input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata) ? input.metadata : {};
  const brandKey = deriveBrandKey(targetUrl, input.brand || input.brand_key || input.brandKey || options.defaultBrand);
  const scenarioList = buildScenarioList(input);
  const scopeMode = normalizeScopeMode(input.scope_mode || input.scopeMode, scenarioList.length > 0);
  const brandPersona = sanitizeString(input.persona || input.brand_persona || input.brandPersona || options.defaultPersona, 500) || FALLBACK_PERSONA;
  const executionEngine = normalizeExecutionEngine(
    input.execution_engine || input.executionEngine || options.defaultExecutionEngine,
    DEFAULT_EXECUTION_ENGINE
  );
  const newAccountRequired = input.new_account_required === true || input.newAccountRequired === true;

  const runRequest = {
    run_id: sanitizeString(input.run_id || input.runId, 128) || buildRunId(targetUrl, brandKey),
    target_url: targetUrl,
    scope_mode: scopeMode,
    scenario_list: scenarioList,
    brand_persona: brandPersona,
    source: sanitizeString(input.source, 64) || "mcp_server",
    dry_run: input.dry_run === true || input.dryRun === true,
    model: sanitizeString(input.model, 128) || null,
    metadata: {
      ...inputMetadata,
      brand_key: brandKey || null,
      brand: brandKey || null,
      feature_name: sanitizeString(input.feature_name || input.featureName, 240) || null,
      task_to_try: sanitizeString(input.task_to_try || input.taskToTry, 1000) || null,
      expected_success: sanitizeString(input.expected_success || input.expectedSuccess, 1000) || null,
      entry_path: sanitizeString(input.entry_path || input.entryPath, 1000) || null,
      auth_policy: resolveAuthPolicy(input),
      execution_engine: executionEngine,
      instruction_priority: "customer_first",
      ...(newAccountRequired ? { new_account_required: true } : {})
    }
  };

  const credentials = normalizeCredentials(input);
  if (credentials) {
    runRequest.credentials = credentials;
  }

  const validation = validateRunRequest(runRequest);
  if (!validation.ok) {
    throw new Error(validation.error || "Invalid QA run request");
  }

  return validation.data;
}

function resolveMcpQaConfig(options = {}) {
  const storedAuthResult = readQaMcpStoredAuth(options);
  const storedAuth = storedAuthResult.ok ? storedAuthResult.auth : null;
  const baseUrl = normalizeUrl(
    options.baseUrl ||
      options.base_url ||
      process.env.QA_MCP_BASE_URL ||
      process.env.SWARMTESTER_BASE_URL ||
      storedAuth?.base_url ||
      process.env.QA_PUBLIC_APP_URL ||
      DEFAULT_PUBLIC_BASE_URL
  ) || DEFAULT_PUBLIC_BASE_URL;

  return {
    authPath: storedAuthResult.path || resolveQaMcpAuthPath(options),
    baseUrl: baseUrl.replace(/\/$/, ""),
    serviceToken: sanitizeString(
      options.serviceToken || options.service_token || process.env.QA_SERVICE_TOKEN || process.env.SWARM_API_SERVICE_TOKEN,
      512
    ),
    ownerUserId: sanitizeString(
      options.ownerUserId || options.owner_user_id || process.env.QA_MCP_OWNER_USER_ID || process.env.SWARM_OWNER_USER_ID,
      128
    ),
    ownerEmail: sanitizeString(
      options.ownerEmail || options.owner_email || process.env.QA_MCP_OWNER_EMAIL || process.env.SWARM_OWNER_EMAIL,
      320
    ).toLowerCase(),
    dashboardAccessToken: sanitizeString(
      options.dashboardAccessToken ||
        options.dashboard_access_token ||
        process.env.QA_MCP_ACCESS_TOKEN ||
        storedAuth?.access_token,
      4096
    ),
    dashboardRefreshToken: sanitizeString(
      options.dashboardRefreshToken ||
        options.dashboard_refresh_token ||
        process.env.QA_MCP_REFRESH_TOKEN ||
        storedAuth?.refresh_token,
      4096
    ),
    storedAuth,
    defaultBrand: sanitizeString(
      options.defaultBrand || options.default_brand || process.env.QA_MCP_DEFAULT_BRAND,
      256
    ),
    defaultPersona: sanitizeString(
      options.defaultPersona || options.default_persona || process.env.QA_MCP_DEFAULT_PERSONA,
      500
    ) || FALLBACK_PERSONA,
    defaultExecutionEngine: normalizeExecutionEngine(
      options.defaultExecutionEngine || options.default_execution_engine || process.env.QA_MCP_DEFAULT_EXECUTION_ENGINE,
      DEFAULT_EXECUTION_ENGINE
    ),
    fetchImpl: options.fetchImpl || globalThis.fetch
  };
}

function assertConfig(config, overrides = {}) {
  const ownerUserId = sanitizeString(overrides.ownerUserId || overrides.owner_user_id || config.ownerUserId, 128);
  const ownerEmail = sanitizeString(overrides.ownerEmail || overrides.owner_email || config.ownerEmail, 320).toLowerCase();
  if (!config.fetchImpl || typeof config.fetchImpl !== "function") {
    throw new Error("fetch is not available");
  }
  if (!config.baseUrl) {
    throw new Error("QA MCP base URL is not configured");
  }
  if (config.serviceToken) {
    if (!ownerUserId) {
      throw new Error("QA MCP owner_user_id is not configured");
    }
    if (!ownerEmail) {
      throw new Error("QA MCP owner_email is not configured");
    }
    return { ownerUserId, ownerEmail, authMode: "service_token" };
  }
  if (!config.dashboardAccessToken && !config.dashboardRefreshToken) {
    throw new Error("QA MCP is not connected. Run `npm run mcp:qa:login` or configure QA_SERVICE_TOKEN.");
  }
  return { ownerUserId, ownerEmail, authMode: "dashboard_session" };
}

function readRefreshedSessionHeaders(response) {
  const headers = response?.headers;
  const getHeader = typeof headers?.get === "function" ? headers.get.bind(headers) : () => null;
  return {
    accessToken: sanitizeString(getHeader("x-swarmtester-access-token"), 4096),
    refreshToken: sanitizeString(getHeader("x-swarmtester-refresh-token"), 4096)
  };
}

function persistDashboardSession(config, session = {}) {
  const accessToken = sanitizeString(session.accessToken || config.dashboardAccessToken, 4096);
  const refreshToken = sanitizeString(session.refreshToken || config.dashboardRefreshToken, 4096);
  const ownerUserId =
    sanitizeString(session.ownerUserId || session.user?.id || config.ownerUserId || config.storedAuth?.owner_user_id, 128) || null;
  const ownerEmail =
    sanitizeString(session.ownerEmail || session.user?.email || config.ownerEmail || config.storedAuth?.owner_email, 320).toLowerCase() || null;

  if (!accessToken && !refreshToken) {
    return null;
  }

  const written = writeQaMcpStoredAuth(
    {
      base_url: config.baseUrl,
      access_token: accessToken,
      refresh_token: refreshToken,
      owner_user_id: ownerUserId,
      owner_email: ownerEmail,
      user: {
        id: ownerUserId,
        email: ownerEmail
      },
      created_at: config.storedAuth?.created_at || null
    },
    {
      authPath: config.authPath
    }
  );

  config.dashboardAccessToken = written.auth.access_token || "";
  config.dashboardRefreshToken = written.auth.refresh_token || "";
  config.ownerUserId = written.auth.owner_user_id || config.ownerUserId;
  config.ownerEmail = written.auth.owner_email || config.ownerEmail;
  config.storedAuth = written.auth;
  return written.auth;
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: text };
  }
}

function isTerminalStatus(statusPayload = {}) {
  const reportReady = statusPayload.report_ready === true;
  if (reportReady) {
    return true;
  }
  const reportStatus = sanitizeString(statusPayload.report_status, 64).toLowerCase();
  if (TERMINAL_REPORT_STATUSES.has(reportStatus)) {
    return true;
  }
  const queueStatus = sanitizeString(
    statusPayload?.queue?.queue_status || statusPayload?.queue?.status,
    64
  ).toLowerCase();
  return TERMINAL_QUEUE_STATUSES.has(queueStatus);
}

function summarizeReportPayload(payload = {}) {
  const report = payload.report && typeof payload.report === "object" ? payload.report : payload;
  const summaryNote = sanitizeString(report?.summary?.note, 2000);
  const findings = Array.isArray(report?.findings) ? report.findings : [];
  const topFinding = findings[0] && typeof findings[0] === "object" ? findings[0] : null;
  return {
    status: sanitizeString(report?.status, 64) || null,
    summary_note: summaryNote || null,
    top_finding_title: sanitizeString(topFinding?.title, 240) || null,
    top_finding_observed_behavior: sanitizeString(topFinding?.observed_behavior, 4000) || null,
    ui_report_url: sanitizeString(payload?.ui_report_url || "", 4096) || null
  };
}

function normalizeSeverity(value) {
  const raw = sanitizeString(value, 64).toLowerCase();
  if (!raw) {
    return "";
  }
  if (raw === "blocker") {
    return "critical";
  }
  return raw;
}

function summarizeCodingAgentQaOutcome({ reportPayload = null, waitResult = null, share = null } = {}) {
  if (waitResult?.timed_out === true) {
    return {
      verdict: CODING_AGENT_QA_VERDICTS.TIMED_OUT,
      pass: false,
      reason: "QA did not finish before the timeout.",
      report_status: summarizeStatusPayload(waitResult.status || {}).report_status,
      top_finding: null,
      summary_note: null,
      ui_report_url: sanitizeString(waitResult?.status?.ui_report_url, 4096) || null,
      share_url: sanitizeString(share?.share_url, 4096) || null
    };
  }

  const report = reportPayload?.report && typeof reportPayload.report === "object" ? reportPayload.report : reportPayload || {};
  const reportSummary = summarizeReportPayload(reportPayload || report);
  const findings = Array.isArray(report.findings) ? report.findings : [];
  const topFinding = findings[0] && typeof findings[0] === "object" ? findings[0] : null;
  const topSeverity = normalizeSeverity(topFinding?.severity || topFinding?.impact || topFinding?.priority);
  const reportStatus = sanitizeString(report.status || reportSummary.status, 64).toLowerCase();
  const hasBlockingFinding = ["critical", "high", "p0", "p1"].includes(topSeverity);
  const hasAnyFinding = findings.length > 0;

  if (["failed", "failed_validation"].includes(reportStatus) || hasBlockingFinding) {
    return {
      verdict: CODING_AGENT_QA_VERDICTS.NEEDS_FIX,
      pass: false,
      reason: topFinding?.title
        ? `QA found a likely blocker: ${sanitizeString(topFinding.title, 240)}.`
        : "QA finished with a failing status.",
      report_status: reportStatus || null,
      top_finding: topFinding
        ? {
            title: sanitizeString(topFinding.title, 240) || null,
            severity: sanitizeString(topFinding.severity, 64) || null,
            observed_behavior: sanitizeString(topFinding.observed_behavior, 4000) || null
          }
        : null,
      summary_note: reportSummary.summary_note,
      ui_report_url: reportSummary.ui_report_url,
      share_url: sanitizeString(share?.share_url, 4096) || null
    };
  }

  if (reportStatus === "completed" && !hasAnyFinding) {
    return {
      verdict: CODING_AGENT_QA_VERDICTS.PASS,
      pass: true,
      reason: "QA completed without reported findings.",
      report_status: reportStatus,
      top_finding: null,
      summary_note: reportSummary.summary_note,
      ui_report_url: reportSummary.ui_report_url,
      share_url: sanitizeString(share?.share_url, 4096) || null
    };
  }

  if (reportStatus === "completed" && hasAnyFinding && !hasBlockingFinding) {
    return {
      verdict: CODING_AGENT_QA_VERDICTS.NEEDS_REVIEW,
      pass: false,
      reason: "QA completed with non-blocking findings that need human review.",
      report_status: reportStatus,
      top_finding: topFinding
        ? {
            title: sanitizeString(topFinding.title, 240) || null,
            severity: sanitizeString(topFinding.severity, 64) || null,
            observed_behavior: sanitizeString(topFinding.observed_behavior, 4000) || null
          }
        : null,
      summary_note: reportSummary.summary_note,
      ui_report_url: reportSummary.ui_report_url,
      share_url: sanitizeString(share?.share_url, 4096) || null
    };
  }

  return {
    verdict: CODING_AGENT_QA_VERDICTS.NEEDS_REVIEW,
    pass: false,
    reason: "QA result is partial or ambiguous and should be reviewed.",
    report_status: reportStatus || null,
    top_finding: topFinding
      ? {
          title: sanitizeString(topFinding.title, 240) || null,
          severity: sanitizeString(topFinding.severity, 64) || null,
          observed_behavior: sanitizeString(topFinding.observed_behavior, 4000) || null
        }
      : null,
    summary_note: reportSummary.summary_note,
    ui_report_url: reportSummary.ui_report_url,
    share_url: sanitizeString(share?.share_url, 4096) || null
  };
}

function summarizeStatusPayload(payload = {}) {
  return {
    run_id: sanitizeString(payload.run_id, 128) || null,
    report_ready: payload.report_ready === true,
    report_status: sanitizeString(payload.report_status, 64) || null,
    queue_status: sanitizeString(payload?.queue?.queue_status || payload?.queue?.status, 64) || null,
    ui_report_url: sanitizeString(payload.ui_report_url, 4096) || null,
    latest_frame_url: sanitizeString(payload?.live_report?.latest_frame_url, 4096) || null,
    progress: payload.progress && typeof payload.progress === "object" ? payload.progress : null
  };
}

function buildQaResourceUri(kind, runId) {
  const safeRunId = sanitizeString(runId, 128);
  if (!safeRunId) {
    throw new Error("run_id is required");
  }
  switch (kind) {
    case "run_status":
      return `qa://runs/${encodeURIComponent(safeRunId)}/status`;
    case "run_report":
      return `qa://runs/${encodeURIComponent(safeRunId)}/report`;
    case "run_report_markdown":
      return `qa://runs/${encodeURIComponent(safeRunId)}/report.md`;
    case "manual_qa_report_markdown":
      return `qa://manual/${encodeURIComponent(safeRunId)}/report.md`;
    default:
      throw new Error(`Unsupported QA resource kind: ${kind}`);
  }
}

function createQaResourceReaders(apiClient) {
  if (!apiClient || typeof apiClient.getRunStatus !== "function" || typeof apiClient.getRunReport !== "function") {
    throw new Error("A valid QA API client is required to build MCP resource readers");
  }

  return {
    async readRunStatus(runId, requestOptions = {}) {
      const payload = await apiClient.getRunStatus(runId, requestOptions);
      return {
        uri: buildQaResourceUri("run_status", runId),
        mimeType: "application/json",
        payload,
        text: JSON.stringify(
          {
            summary: summarizeStatusPayload(payload),
            status: payload
          },
          null,
          2
        )
      };
    },
    async readRunReport(runId, requestOptions = {}) {
      const payload = await apiClient.getRunReport(runId, requestOptions);
      return {
        uri: buildQaResourceUri("run_report", runId),
        mimeType: "application/json",
        payload,
        text: JSON.stringify(
          {
            summary: summarizeReportPayload(payload),
            report: payload
          },
          null,
          2
        )
      };
    },
    async readRunReportMarkdown(runId, requestOptions = {}) {
      const payload = await apiClient.getRunReport(runId, requestOptions);
      const markdown = sanitizeString(payload.markdown, 200000);
      const summary = summarizeReportPayload(payload);
      return {
        uri: buildQaResourceUri("run_report_markdown", runId),
        mimeType: "text/markdown",
        payload,
        text:
          markdown ||
          buildTextSummary([
            `# QA Report`,
            summary.status ? `Status: ${summary.status}` : "",
            summary.summary_note ? `Summary: ${summary.summary_note}` : "",
            summary.top_finding_title ? `Top finding: ${summary.top_finding_title}` : "",
            summary.top_finding_observed_behavior ? `What happened: ${summary.top_finding_observed_behavior}` : ""
          ])
      };
    },
    async readManualQaReportMarkdown(sessionId, requestOptions = {}) {
      if (typeof apiClient.exportManualQaSession !== "function") {
        throw new Error("Manual QA export is not available");
      }
      const payload = await apiClient.exportManualQaSession(sessionId, requestOptions);
      return {
        uri: buildQaResourceUri("manual_qa_report_markdown", sessionId),
        mimeType: "text/markdown",
        payload,
        text: sanitizeString(payload.markdown, 200000) || "# Manual QA Report\n"
      };
    }
  };
}

function buildTextSummary(parts = []) {
  return parts
    .map((part) => sanitizeString(part, 4000))
    .filter(Boolean)
    .join("\n");
}

function createQaApiClient(options = {}) {
  const config = resolveMcpQaConfig(options);

  async function request(path, requestOptions = {}) {
    const auth = assertConfig(config, requestOptions);
    const url = new URL(path, `${config.baseUrl}/`);
    if (requestOptions.query && typeof requestOptions.query === "object") {
      for (const [key, rawValue] of Object.entries(requestOptions.query)) {
        const value = sanitizeString(rawValue, 2000);
        if (value) {
          url.searchParams.set(key, value);
        }
      }
    }

    const response = await config.fetchImpl(url.toString(), {
      method: requestOptions.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(auth.authMode === "service_token"
          ? {
              "x-qa-service-token": config.serviceToken,
              "x-owner-user-id": auth.ownerUserId,
              "x-owner-email": auth.ownerEmail
            }
          : {
              ...(config.dashboardAccessToken ? { "x-dashboard-access-token": config.dashboardAccessToken } : {}),
              ...(config.dashboardRefreshToken ? { "x-dashboard-refresh-token": config.dashboardRefreshToken } : {})
            }),
        ...(requestOptions.headers || {})
      },
      body: requestOptions.body ? JSON.stringify(requestOptions.body) : undefined,
      signal: requestOptions.signal
    });
    if (auth.authMode === "dashboard_session") {
      const refreshed = readRefreshedSessionHeaders(response);
      if (refreshed.accessToken || refreshed.refreshToken) {
        persistDashboardSession(config, {
          accessToken: refreshed.accessToken || config.dashboardAccessToken,
          refreshToken: refreshed.refreshToken || config.dashboardRefreshToken
        });
      }
    }
    const data = await readJsonResponse(response);
    if (!response.ok || data.ok === false) {
      const message = sanitizeString(data.error || data.message, 2000) || `Request failed with status ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.payload = data;
      throw error;
    }
    return data;
  }

  return {
    config,
    persistDashboardSession(session) {
      return persistDashboardSession(config, session);
    },
    buildRunRequest(input) {
      return buildQaRunRequest(input, {
        defaultBrand: config.defaultBrand,
        defaultPersona: config.defaultPersona,
        defaultExecutionEngine: config.defaultExecutionEngine
      });
    },
    async requestRun(input = {}, requestOptions = {}) {
      const runRequest = buildQaRunRequest(input, {
        defaultBrand: config.defaultBrand,
        defaultPersona: config.defaultPersona,
        defaultExecutionEngine: config.defaultExecutionEngine
      });
      const response = await request("api/qa/run", {
        method: "POST",
        body: runRequest,
        signal: requestOptions.signal,
        ownerUserId: input.owner_user_id || input.ownerUserId,
        ownerEmail: input.owner_email || input.ownerEmail
      });
      return {
        ...response,
        run_request: runRequest
      };
    },
    async getRunStatus(runId, requestOptions = {}) {
      return request("api/qa/status", {
        method: "GET",
        query: { run_id: runId },
        signal: requestOptions.signal,
        ownerUserId: requestOptions.ownerUserId,
        ownerEmail: requestOptions.ownerEmail
      });
    },
    async waitForRun(runId, waitOptions = {}) {
      const timeoutSeconds = Math.max(1, Number(waitOptions.timeout_seconds || waitOptions.timeoutSeconds || DEFAULT_TIMEOUT_SECONDS));
      const pollIntervalSeconds = Math.max(0.1, Number(waitOptions.poll_interval_seconds || waitOptions.pollIntervalSeconds || DEFAULT_POLL_INTERVAL_SECONDS));
      const startedAt = Date.now();
      let pollCount = 0;
      let latest = null;

      while (Date.now() - startedAt < timeoutSeconds * 1000) {
        if (waitOptions.signal?.aborted) {
          const abortError = new Error("QA wait aborted");
          abortError.name = "AbortError";
          throw abortError;
        }
        latest = await this.getRunStatus(runId, waitOptions);
        pollCount += 1;
        if (typeof waitOptions.onPoll === "function") {
          await waitOptions.onPoll(latest, {
            poll_count: pollCount,
            elapsed_ms: Date.now() - startedAt
          });
        }
        if (isTerminalStatus(latest)) {
          return {
            ok: true,
            timed_out: false,
            poll_count: pollCount,
            elapsed_ms: Date.now() - startedAt,
            status: latest
          };
        }
        await sleep(pollIntervalSeconds * 1000);
      }

      return {
        ok: true,
        timed_out: true,
        poll_count: pollCount,
        elapsed_ms: Date.now() - startedAt,
        status: latest
      };
    },
    async getRunReport(runId, requestOptions = {}) {
      return request("api/qa/report", {
        method: "GET",
        query: { run_id: runId },
        signal: requestOptions.signal,
        ownerUserId: requestOptions.ownerUserId,
        ownerEmail: requestOptions.ownerEmail
      });
    },
    async shareRunReport(runId, requestOptions = {}) {
      return request("api/qa/share", {
        method: "POST",
        query: { run_id: runId },
        signal: requestOptions.signal,
        ownerUserId: requestOptions.ownerUserId,
        ownerEmail: requestOptions.ownerEmail
      });
    },
    async createManualQaSession(input = {}, requestOptions = {}) {
      return request("api/manual-qa/sessions", {
        method: "POST",
        body: input,
        signal: requestOptions.signal,
        ownerUserId: input.owner_user_id || input.ownerUserId || requestOptions.ownerUserId,
        ownerEmail: input.owner_email || input.ownerEmail || requestOptions.ownerEmail
      });
    },
    async getManualQaSession(sessionId, requestOptions = {}) {
      return request("api/manual-qa/sessions", {
        method: "GET",
        query: { session_id: sessionId },
        signal: requestOptions.signal,
        ownerUserId: requestOptions.ownerUserId,
        ownerEmail: requestOptions.ownerEmail
      });
    },
    async exportManualQaSession(sessionId, requestOptions = {}) {
      return request("api/manual-qa/export", {
        method: "GET",
        query: { session_id: sessionId },
        signal: requestOptions.signal,
        ownerUserId: requestOptions.ownerUserId,
        ownerEmail: requestOptions.ownerEmail
      });
    },
    async getDashboardSession(requestOptions = {}) {
      return request("api/auth/session", {
        method: "GET",
        signal: requestOptions.signal
      });
    },
    summarizeReportPayload,
    summarizeStatusPayload
  };
}

module.exports = {
  CODING_AGENT_QA_VERDICTS,
  DEFAULT_POLL_INTERVAL_SECONDS,
  DEFAULT_TIMEOUT_SECONDS,
  MCP_QA_RESOURCE_TEMPLATES,
  buildCodingAgentQaInput,
  buildQaResourceUri,
  buildQaRunRequest,
  buildRunId,
  buildScenarioList,
  createQaResourceReaders,
  createQaApiClient,
  deriveBrandKey,
  isTerminalStatus,
  resolveMcpQaConfig,
  summarizeCodingAgentQaOutcome,
  summarizeReportPayload,
  summarizeStatusPayload
};
