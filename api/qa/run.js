const {
  DEFAULT_EXECUTION_ENGINE,
  sanitizeRepoTriageState,
  buildTaskPrompt,
  buildSystemPrompt,
  getPublicBaseUrl,
  isPlainObject,
  normalizeExecutionEngine,
  parseRequestBody,
  sanitizeString,
  validateRunRequest
} = require("../../lib/qa-core");
const { enqueueQaRun } = require("../../lib/qa-queue");
const { buildInitialRepoTriageState } = require("../../lib/qa-repo-triage");
const { requireDashboardOrServiceAuth } = require("../../lib/auth");

function extractRunBrand(runRequest) {
  const metadata =
    runRequest && runRequest.metadata && typeof runRequest.metadata === "object"
      ? runRequest.metadata
      : {};

  const candidates = [
    metadata.brand_id,
    metadata.brandId,
    metadata.brand_key,
    metadata.brandKey,
    metadata.brand,
    metadata.brand_slug,
    metadata.brandSlug,
    metadata.workspace_id,
    metadata.workspaceId
  ];

  for (const candidate of candidates) {
    const value = sanitizeString(candidate, 256);
    if (value) {
      return value;
    }
  }

  return "";
}

function buildUiReportUrl(publicBaseUrl, runRequest) {
  const params = new URLSearchParams();
  params.set("view", "report");
  params.set("run_id", runRequest.run_id);
  const brand = extractRunBrand(runRequest);
  if (brand) {
    params.set("brand", brand);
  }
  return `${publicBaseUrl}/dashboard?${params.toString()}`;
}

function extractRequestedOwner(req, runRequest) {
  const metadata =
    runRequest && runRequest.metadata && typeof runRequest.metadata === "object"
      ? runRequest.metadata
      : {};

  const ownerUserId = sanitizeString(
    metadata.owner_user_id ||
      metadata.ownerUserId ||
      req?.headers?.["x-owner-user-id"] ||
      req?.headers?.["x-user-id"],
    128
  );
  const ownerEmail = sanitizeString(
    metadata.owner_email ||
      metadata.ownerEmail ||
      req?.headers?.["x-owner-email"],
    320
  ).toLowerCase();

  return { ownerUserId, ownerEmail };
}

function resolveRequestedExecutionEngine(body) {
  const metadata = isPlainObject(body?.metadata) ? body.metadata : {};
  return normalizeExecutionEngine(
    body?.execution_engine ||
      body?.executionEngine ||
      metadata.execution_engine ||
      metadata.executionEngine ||
      process.env.QA_EXECUTION_ENGINE,
    DEFAULT_EXECUTION_ENGINE
  );
}

async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const auth = await requireDashboardOrServiceAuth(req, res);
  if (!auth.ok) {
    return res.status(auth.status || 401).json({ ok: false, error: "Authentication required" });
  }

  let body;
  try {
    body = await parseRequestBody(req);
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid JSON body" });
  }

  const validation = validateRunRequest(body);
  if (!validation.ok) {
    return res.status(400).json({ ok: false, error: validation.error });
  }

  const runRequest = validation.data;
  const requestedOwner = extractRequestedOwner(req, runRequest);
  const requestedExecutionEngine = resolveRequestedExecutionEngine(body);
  const ownerUserId = sanitizeString(auth.user?.id, 128) || requestedOwner.ownerUserId;
  const ownerEmail = sanitizeString(auth.user?.email, 320).toLowerCase() || requestedOwner.ownerEmail;
  if (auth.is_service_token && !ownerUserId) {
    return res.status(400).json({
      ok: false,
      error: "owner_user_id is required when using service token auth"
    });
  }
  if (auth.is_service_token && !ownerEmail) {
    return res.status(400).json({
      ok: false,
      error: "owner_email is required when using service token auth"
    });
  }
  runRequest.metadata = {
    ...(runRequest.metadata && typeof runRequest.metadata === "object" ? runRequest.metadata : {}),
    owner_user_id: ownerUserId || null,
    owner_email: ownerEmail || null,
    launched_by: auth.is_service_token ? "service_token" : "dashboard_user",
    execution_engine: requestedExecutionEngine
  };
  const publicBaseUrl = getPublicBaseUrl(req);
  const callbackUrl = `${publicBaseUrl}/api/qa-report-callback`;
  const reportUrl = `${publicBaseUrl}/api/qa/report?run_id=${encodeURIComponent(runRequest.run_id)}`;
  const statusUrl = `${publicBaseUrl}/api/qa/status?run_id=${encodeURIComponent(runRequest.run_id)}`;
  const uiReportUrl = buildUiReportUrl(publicBaseUrl, runRequest);

  if (runRequest.dry_run) {
    return res.status(200).json({
      ok: true,
      dry_run: true,
      run_request: runRequest,
      scope: runRequest.scope,
      callback_url: callbackUrl,
      report_url: reportUrl,
      status_url: statusUrl,
      ui_report_url: uiReportUrl,
      system_prompt: buildSystemPrompt(runRequest),
      task_prompt: buildTaskPrompt(runRequest)
    });
  }

  const queued = await enqueueQaRun(runRequest, {
    publicBaseUrl,
    reportUrl,
    statusUrl,
    additionalPayload: {
      repo_triage: sanitizeRepoTriageState(buildInitialRepoTriageState(runRequest))
    }
  });

  if (!queued.ok) {
    return res.status(queued.status || 500).json({
      ok: false,
      error: queued.error || "Failed to enqueue QA run"
    });
  }

  return res.status(202).json({
    ok: true,
    queued: true,
    run_id: runRequest.run_id,
    report_url: reportUrl,
    status_url: statusUrl,
    ui_report_url: uiReportUrl,
    queue: queued.queue
  });
}

handler.__private = {
  resolveRequestedExecutionEngine
};

module.exports = handler;
