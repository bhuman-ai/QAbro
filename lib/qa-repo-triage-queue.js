const { extractTargetLabel, isPlainObject, sanitizeOptionalString, sanitizeString } = require("./qa-core");

const QA_REPO_TRIAGE_JOB_TYPE = "qa_repo_triage";
const ACTIVE_JOB_STATUSES = new Set(["queued", "processing", "retryable"]);
const QUEUEABLE_JOB_STATUSES = new Set(["queued", "retryable"]);

function getSupabaseAccess(options = {}) {
  const supabaseUrl = sanitizeString(options.supabaseUrl || process.env.SUPABASE_URL, 4096).replace(/\/$/, "");
  const serviceKey = sanitizeString(options.serviceKey || process.env.SUPABASE_SERVICE_KEY, 4096);
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  if (!supabaseUrl || !serviceKey) {
    return { ok: false, status: 500, error: "Server is not configured" };
  }
  if (typeof fetchImpl !== "function") {
    return { ok: false, status: 500, error: "fetch is not available" };
  }
  return { ok: true, supabaseUrl, serviceKey, fetchImpl };
}

function buildSupabaseHeaders(serviceKey, prefer = "return=representation") {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    Prefer: prefer
  };
}

function buildRepoTriageJobId(runId) {
  return `repo_triage:${sanitizeString(runId, 128)}`;
}

function sanitizeProgress(value) {
  const progress = isPlainObject(value) ? value : {};
  return {
    phase: sanitizeString(progress.phase, 64) || "queued",
    percent: Number.isFinite(Number(progress.percent)) ? Math.max(0, Math.min(100, Number(progress.percent))) : 0,
    message: sanitizeString(progress.message, 240) || "",
    updated_at: sanitizeOptionalString(progress.updated_at || progress.updatedAt, 128) || new Date().toISOString()
  };
}

function sanitizeRepoTriageJobPayload(value) {
  const payload = isPlainObject(value) ? value : {};
  return {
    job_request: isPlainObject(payload.job_request) ? payload.job_request : {},
    status_url: sanitizeOptionalString(payload.status_url, 4096) || null,
    report_url: sanitizeOptionalString(payload.report_url, 4096) || null,
    worker: isPlainObject(payload.worker) ? payload.worker : {},
    run_log: Array.isArray(payload.run_log) ? payload.run_log.slice(-120) : []
  };
}

function buildRepoTriageJobPayload(options = {}) {
  const existingPayload = sanitizeRepoTriageJobPayload(options.existingPayload);
  return {
    ...existingPayload,
    ...(options.jobRequest !== undefined ? { job_request: isPlainObject(options.jobRequest) ? options.jobRequest : {} } : {}),
    ...(options.statusUrl !== undefined ? { status_url: sanitizeOptionalString(options.statusUrl, 4096) || null } : {}),
    ...(options.reportUrl !== undefined ? { report_url: sanitizeOptionalString(options.reportUrl, 4096) || null } : {}),
    ...(options.worker !== undefined ? { worker: isPlainObject(options.worker) ? options.worker : {} } : {}),
    ...(options.runLog !== undefined ? { run_log: Array.isArray(options.runLog) ? options.runLog.slice(-120) : [] } : {})
  };
}

async function enqueueRepoTriageJob(jobRequest, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const ownerUserId = sanitizeString(options.ownerUserId || options.owner_user_id, 128);
  if (!ownerUserId) {
    return { ok: false, status: 400, error: "owner_user_id is required" };
  }

  const now = new Date().toISOString();
  const jobId = buildRepoTriageJobId(jobRequest.run_id);
  const payload = buildRepoTriageJobPayload({
    jobRequest: {
      ...jobRequest,
      job_id: jobId
    },
    statusUrl: options.statusUrl,
    reportUrl: options.reportUrl,
    worker: {},
    runLog: []
  });

  const row = {
    job_id: jobId,
    job_type: QA_REPO_TRIAGE_JOB_TYPE,
    owner_user_id: ownerUserId,
    owner_email: sanitizeOptionalString(options.ownerEmail || options.owner_email, 320) || null,
    brand_key: sanitizeOptionalString(options.brandKey || options.brand_key, 256) || null,
    site_id: null,
    target: sanitizeOptionalString(jobRequest.target, 320) || extractTargetLabel(jobRequest.target_url) || "repo-triage",
    status: "queued",
    priority: 40,
    attempt_count: 0,
    max_attempts: 3,
    claimed_by: null,
    not_before: null,
    payload,
    progress: sanitizeProgress({
      phase: "queued",
      percent: 0,
      message: "Queued for code-aware repo diagnosis.",
      updated_at: now
    }),
    result: {},
    started_at: null,
    completed_at: null
  };

  const response = await access.fetchImpl(`${access.supabaseUrl}/rest/v1/swarm_jobs?on_conflict=job_id`, {
    method: "POST",
    headers: buildSupabaseHeaders(access.serviceKey, "resolution=merge-duplicates,return=representation"),
    body: JSON.stringify([row])
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status || 500,
      error: data?.message || "Failed to enqueue repo triage job",
      data
    };
  }

  return {
    ok: true,
    status: 202,
    row: Array.isArray(data) && data[0] ? data[0] : row
  };
}

async function updateRepoTriageJob(jobId, mutation = {}, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const safeJobId = sanitizeString(jobId, 128);
  if (!safeJobId) {
    return { ok: false, status: 400, error: "job_id is required" };
  }

  const query = new URL(`${access.supabaseUrl}/rest/v1/swarm_jobs`);
  query.searchParams.set("job_id", `eq.${safeJobId}`);
  query.searchParams.set("job_type", `eq.${QA_REPO_TRIAGE_JOB_TYPE}`);
  if (mutation.expectedStatus) {
    query.searchParams.set("status", `eq.${sanitizeString(mutation.expectedStatus, 64)}`);
  }

  const body = {};
  if (mutation.status !== undefined) body.status = sanitizeString(mutation.status, 64) || "queued";
  if (mutation.attempt_count !== undefined) body.attempt_count = Math.max(0, Number(mutation.attempt_count) || 0);
  if (mutation.claimed_by !== undefined) body.claimed_by = sanitizeOptionalString(mutation.claimed_by, 128) || null;
  if (mutation.payload !== undefined) body.payload = sanitizeRepoTriageJobPayload(mutation.payload);
  if (mutation.progress !== undefined) body.progress = sanitizeProgress(mutation.progress);
  if (mutation.result !== undefined) body.result = isPlainObject(mutation.result) ? mutation.result : {};
  if (mutation.started_at !== undefined) body.started_at = sanitizeOptionalString(mutation.started_at, 128) || null;
  if (mutation.completed_at !== undefined) body.completed_at = sanitizeOptionalString(mutation.completed_at, 128) || null;

  const response = await access.fetchImpl(query.toString(), {
    method: "PATCH",
    headers: buildSupabaseHeaders(access.serviceKey),
    body: JSON.stringify(body)
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status || 500,
      error: data?.message || "Failed to update repo triage job",
      data
    };
  }

  const row = Array.isArray(data) && data[0] ? data[0] : null;
  if (mutation.expectedStatus && !row) {
    return {
      ok: false,
      status: 409,
      error: "Job was already claimed by another worker"
    };
  }

  return {
    ok: true,
    status: 200,
    row
  };
}

async function claimNextRepoTriageJob(options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const workerId = sanitizeString(options.workerId, 128) || `repo-triage-worker-${Date.now()}`;
  const listUrl = new URL(`${access.supabaseUrl}/rest/v1/swarm_jobs`);
  listUrl.searchParams.set("select", "*");
  listUrl.searchParams.set("job_type", `eq.${QA_REPO_TRIAGE_JOB_TYPE}`);
  listUrl.searchParams.set("status", "in.(queued,retryable)");
  listUrl.searchParams.set("order", "created_at.asc");
  listUrl.searchParams.set("limit", "10");

  const response = await access.fetchImpl(listUrl.toString(), {
    headers: {
      apikey: access.serviceKey,
      Authorization: `Bearer ${access.serviceKey}`
    }
  });

  let rows = [];
  try {
    rows = await response.json();
  } catch {
    rows = [];
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status || 500,
      error: rows?.message || "Failed to load repo triage jobs",
      data: rows
    };
  }

  for (const row of Array.isArray(rows) ? rows : []) {
    if (!QUEUEABLE_JOB_STATUSES.has(sanitizeString(row?.status, 64))) {
      continue;
    }

    const payload = sanitizeRepoTriageJobPayload(row?.payload);
    const attemptCount = Math.max(0, Number(row?.attempt_count) || 0);
    const updated = await updateRepoTriageJob(
      row.job_id,
      {
        expectedStatus: row.status,
        status: "processing",
        attempt_count: attemptCount + 1,
        claimed_by: workerId,
        started_at: row.started_at || new Date().toISOString(),
        payload: buildRepoTriageJobPayload({
          existingPayload: payload,
          worker: {
            worker_id: workerId,
            claimed_at: new Date().toISOString()
          }
        }),
        progress: {
          phase: "processing",
          percent: 10,
          message: "Scanning the repo for likely root causes.",
          updated_at: new Date().toISOString()
        }
      },
      access
    );

    if (!updated.ok) {
      if (updated.status === 409) {
        continue;
      }
      return updated;
    }

    const claimedRow = updated.row;
    const claimedPayload = sanitizeRepoTriageJobPayload(claimedRow?.payload);
    const jobRequest = isPlainObject(claimedPayload.job_request) ? claimedPayload.job_request : {};
    return {
      ok: true,
      status: 200,
      row: claimedRow,
      payload: claimedPayload,
      jobRequest
    };
  }

  return { ok: true, status: 200, row: null, payload: null, jobRequest: null };
}

module.exports = {
  QA_REPO_TRIAGE_JOB_TYPE,
  ACTIVE_JOB_STATUSES,
  buildRepoTriageJobId,
  buildRepoTriageJobPayload,
  enqueueRepoTriageJob,
  updateRepoTriageJob,
  claimNextRepoTriageJob
};
