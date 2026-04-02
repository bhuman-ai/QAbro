const {
  extractTargetLabel,
  isPlainObject,
  normalizeUrl,
  sanitizeOptionalString,
  sanitizeString
} = require("./qa-core");
const {
  sanitizeJobStatus,
  sanitizeJobType,
  SUBMISSION_JOB_TYPE_RECON,
  SUBMISSION_JOB_TYPE_ASSET_PREPARE,
  SUBMISSION_JOB_TYPE_SUBMIT
} = require("./submission-core");

const ACTIVE_JOB_STATUSES = new Set(["queued", "processing", "retryable", "paused"]);
const QUEUEABLE_JOB_STATUSES = new Set(["queued", "retryable"]);
const STALE_RECLAIMABLE_JOB_STATUSES = new Set(["processing"]);

function getSubmissionWorkerTiming(options = {}) {
  const heartbeatIntervalMs = Math.max(
    5000,
    Math.min(
      300000,
      sanitizePositiveInteger(
        options.heartbeatIntervalMs ??
          process.env.SUBMISSION_WORKER_HEARTBEAT_INTERVAL_MS ??
          process.env.SUBMISSION_JOB_HEARTBEAT_INTERVAL_MS,
        15000,
        300000
      ) || 15000
    )
  );
  const staleAfterMs = Math.max(
    heartbeatIntervalMs * 2,
    Math.min(
      24 * 60 * 60 * 1000,
      sanitizePositiveInteger(
        options.staleAfterMs ??
          process.env.SUBMISSION_WORKER_STALE_AFTER_MS ??
          process.env.SUBMISSION_JOB_STALE_AFTER_MS,
        5 * 60 * 1000,
        24 * 60 * 60 * 1000
      ) || 5 * 60 * 1000
    )
  );

  return {
    heartbeatIntervalMs,
    staleAfterMs
  };
}

function sanitizePositiveInteger(value, fallbackValue, maxValue) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallbackValue;
  }
  return Math.max(0, Math.min(maxValue, Math.floor(numeric)));
}

function sanitizeStringArray(value, maxItems = 20, maxLength = 128) {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return Array.from(
    new Set(
      values
        .map((item) => sanitizeString(item, maxLength).toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, maxItems);
}

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

function sanitizeProgress(value) {
  const progress = isPlainObject(value) ? value : {};
  return {
    phase: sanitizeString(progress.phase, 64) || "queued",
    percent: Number.isFinite(Number(progress.percent)) ? Math.max(0, Math.min(100, Number(progress.percent))) : 0,
    message: sanitizeString(progress.message, 240) || "",
    updated_at: sanitizeOptionalString(progress.updated_at || progress.updatedAt, 128) || new Date().toISOString()
  };
}

function sanitizeSubmissionJobPayload(value) {
  const payload = isPlainObject(value) ? value : {};
  return {
    job_request: isPlainObject(payload.job_request) ? payload.job_request : {},
    status_url: sanitizeOptionalString(payload.status_url, 4096) || null,
    report_url: sanitizeOptionalString(payload.report_url, 4096) || null,
    run_log: Array.isArray(payload.run_log) ? payload.run_log.slice(-200) : [],
    artifacts: isPlainObject(payload.artifacts) ? payload.artifacts : {},
    worker: isPlainObject(payload.worker) ? payload.worker : {},
    webhook: isPlainObject(payload.webhook) ? payload.webhook : null
  };
}

function buildSubmissionJobPayload(options = {}) {
  const existingPayload = sanitizeSubmissionJobPayload(options.existingPayload);
  return {
    ...existingPayload,
    ...(options.jobRequest !== undefined ? { job_request: isPlainObject(options.jobRequest) ? options.jobRequest : {} } : {}),
    ...(options.statusUrl !== undefined ? { status_url: sanitizeOptionalString(options.statusUrl, 4096) || null } : {}),
    ...(options.reportUrl !== undefined ? { report_url: sanitizeOptionalString(options.reportUrl, 4096) || null } : {}),
    ...(options.runLog !== undefined ? { run_log: Array.isArray(options.runLog) ? options.runLog.slice(-200) : [] } : {}),
    ...(options.artifacts !== undefined ? { artifacts: isPlainObject(options.artifacts) ? options.artifacts : {} } : {}),
    ...(options.worker !== undefined ? { worker: isPlainObject(options.worker) ? options.worker : {} } : {}),
    ...(options.webhook !== undefined ? { webhook: isPlainObject(options.webhook) ? options.webhook : null } : {})
  };
}

function getSubmissionJobHeartbeatAt(row) {
  const payload = sanitizeSubmissionJobPayload(row?.payload);
  return (
    sanitizeOptionalString(payload.worker?.heartbeat_at || payload.worker?.heartbeatAt, 128) ||
    sanitizeOptionalString(payload.worker?.claimed_at || payload.worker?.claimedAt, 128) ||
    sanitizeOptionalString(row?.progress?.updated_at || row?.progress?.updatedAt, 128) ||
    sanitizeOptionalString(row?.updated_at, 128) ||
    sanitizeOptionalString(row?.started_at, 128) ||
    null
  );
}

function summarizeSubmissionJob(row) {
  const payload = sanitizeSubmissionJobPayload(row?.payload);
  return {
    job_id: sanitizeString(row?.job_id, 128),
    job_type: sanitizeJobType(row?.job_type, SUBMISSION_JOB_TYPE_RECON),
    owner_user_id: sanitizeOptionalString(row?.owner_user_id, 128) || null,
    brand_key: sanitizeOptionalString(row?.brand_key, 256) || null,
    site_id: sanitizeOptionalString(row?.site_id, 128) || null,
    target: sanitizeOptionalString(row?.target, 320) || null,
    status: sanitizeJobStatus(row?.status),
    priority: Number.isFinite(Number(row?.priority)) ? Math.floor(Number(row.priority)) : 100,
    attempt_count: Number.isFinite(Number(row?.attempt_count)) ? Math.floor(Number(row.attempt_count)) : 0,
    max_attempts: Number.isFinite(Number(row?.max_attempts)) ? Math.floor(Number(row.max_attempts)) : 3,
    claimed_by: sanitizeOptionalString(row?.claimed_by, 128) || null,
    not_before: sanitizeOptionalString(row?.not_before, 128) || null,
    created_at: sanitizeOptionalString(row?.created_at, 128) || null,
    updated_at: sanitizeOptionalString(row?.updated_at, 128) || null,
    started_at: sanitizeOptionalString(row?.started_at, 128) || null,
    completed_at: sanitizeOptionalString(row?.completed_at, 128) || null,
    status_url: payload.status_url,
    report_url: payload.report_url,
    report_ready: isPlainObject(row?.result) && Object.keys(row.result).length > 0 && !ACTIVE_JOB_STATUSES.has(sanitizeJobStatus(row?.status))
  };
}

function resolveJobTarget(jobRequest) {
  const jobType = sanitizeJobType(jobRequest?.job_type, SUBMISSION_JOB_TYPE_RECON);
  if (jobType === SUBMISSION_JOB_TYPE_RECON) {
    return extractTargetLabel(jobRequest?.submit_url);
  }
  if (jobType === SUBMISSION_JOB_TYPE_ASSET_PREPARE) {
    return sanitizeString(jobRequest?.brand_profile_id, 128) || "asset-manifest";
  }
  if (jobType === SUBMISSION_JOB_TYPE_SUBMIT) {
    return sanitizeString(jobRequest?.site_id, 128) || sanitizeString(jobRequest?.brand_profile_id, 128) || "directory-submit";
  }
  return sanitizeString(jobRequest?.site_id || jobRequest?.brand_profile_id, 128) || "submission-job";
}

function validateQueuedJobRequest(jobRequest) {
  const jobType = sanitizeJobType(jobRequest?.job_type, SUBMISSION_JOB_TYPE_RECON);

  if (jobType === SUBMISSION_JOB_TYPE_RECON) {
    return Boolean(normalizeUrl(jobRequest?.submit_url));
  }

  if (jobType === SUBMISSION_JOB_TYPE_ASSET_PREPARE) {
    return (
      Boolean(sanitizeString(jobRequest?.brand_profile_id, 128)) &&
      Array.isArray(jobRequest?.site_ids) &&
      jobRequest.site_ids.length > 0
    );
  }

  if (jobType === SUBMISSION_JOB_TYPE_SUBMIT) {
    return (
      Boolean(sanitizeString(jobRequest?.brand_profile_id, 128)) &&
      Boolean(sanitizeString(jobRequest?.site_id, 128))
    );
  }

  return false;
}

async function enqueueSubmissionJob(jobRequest, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const ownerUserId = sanitizeString(options.ownerUserId, 128);
  if (!ownerUserId) {
    return { ok: false, status: 400, error: "owner_user_id is required" };
  }

  const publicBaseUrl = sanitizeString(options.publicBaseUrl, 4096).replace(/\/$/, "");
  const statusUrl = sanitizeString(options.statusUrl, 4096) || `${publicBaseUrl}/api/submissions/status?job_id=${encodeURIComponent(jobRequest.job_id)}`;
  const reportUrl = sanitizeString(options.reportUrl, 4096) || `${publicBaseUrl}/api/submissions/report?job_id=${encodeURIComponent(jobRequest.job_id)}`;
  const now = new Date().toISOString();

  const payload = buildSubmissionJobPayload({
    jobRequest,
    statusUrl,
    reportUrl,
    runLog: [],
    artifacts: {},
    worker: {},
    webhook: jobRequest.webhook || null
  });

  const row = {
    job_id: jobRequest.job_id,
    job_type: sanitizeJobType(jobRequest.job_type, SUBMISSION_JOB_TYPE_RECON),
    owner_user_id: ownerUserId,
    owner_email: sanitizeOptionalString(options.ownerEmail, 320) || null,
    brand_key: sanitizeOptionalString(options.brandKey, 256) || sanitizeOptionalString(jobRequest.metadata?.brand_key, 256) || null,
    site_id: sanitizeOptionalString(jobRequest.site_id, 128) || null,
    target: resolveJobTarget(jobRequest),
    status: "queued",
    priority: Number.isFinite(Number(jobRequest.priority)) ? Math.floor(Number(jobRequest.priority)) : 100,
    attempt_count: 0,
    max_attempts: Number.isFinite(Number(jobRequest.max_attempts)) ? Math.floor(Number(jobRequest.max_attempts)) : 3,
    claimed_by: null,
    not_before: sanitizeOptionalString(jobRequest.not_before, 128) || null,
    payload,
    progress: sanitizeProgress({
      phase: "queued",
      percent: 0,
      message: "Queued for submission worker processing.",
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
      status: response.status,
      error: data?.message || "Failed to enqueue submission job",
      data
    };
  }

  const storedRow = Array.isArray(data) && data[0] ? data[0] : row;
  return {
    ok: true,
    status: 202,
    row: storedRow,
    job: summarizeSubmissionJob(storedRow)
  };
}

async function updateSubmissionJob(jobId, mutation = {}, options = {}) {
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
  if (mutation.expectedStatus) {
    query.searchParams.set("status", `eq.${sanitizeJobStatus(mutation.expectedStatus)}`);
  }

  const body = {};
  if (mutation.status !== undefined) body.status = sanitizeJobStatus(mutation.status);
  if (mutation.priority !== undefined) body.priority = Number(mutation.priority) || 100;
  if (mutation.attempt_count !== undefined) body.attempt_count = Math.max(0, Number(mutation.attempt_count) || 0);
  if (mutation.max_attempts !== undefined) body.max_attempts = Math.max(1, Number(mutation.max_attempts) || 3);
  if (mutation.claimed_by !== undefined) body.claimed_by = sanitizeOptionalString(mutation.claimed_by, 128) || null;
  if (mutation.payload !== undefined) body.payload = sanitizeSubmissionJobPayload(mutation.payload);
  if (mutation.progress !== undefined) body.progress = sanitizeProgress(mutation.progress);
  if (mutation.result !== undefined) body.result = isPlainObject(mutation.result) ? mutation.result : {};
  if (mutation.started_at !== undefined) body.started_at = mutation.started_at;
  if (mutation.completed_at !== undefined) body.completed_at = mutation.completed_at;
  if (mutation.not_before !== undefined) body.not_before = mutation.not_before;

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
      status: response.status,
      error: data?.message || "Failed to update submission job",
      data
    };
  }

  const row = Array.isArray(data) && data[0] ? data[0] : null;
  if (mutation.expectedStatus && !row) {
    return { ok: false, status: 409, error: "Job was already claimed by another worker" };
  }

  return {
    ok: true,
    status: 200,
    row,
    job: row ? summarizeSubmissionJob(row) : null
  };
}

async function claimNextSubmissionJob(options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const workerId = sanitizeString(options.workerId, 128) || `submission-worker-${Date.now()}`;
  const requestedTypes = Array.isArray(options.jobTypes)
    ? options.jobTypes.map((item) => sanitizeJobType(item)).filter(Boolean)
    : [SUBMISSION_JOB_TYPE_RECON];
  const uniqueTypes = Array.from(new Set(requestedTypes));
  if (!uniqueTypes.length) {
    return { ok: false, status: 400, error: "At least one job type is required" };
  }

  await reclaimStaleSubmissionJobs({
    ...options,
    workerId,
    jobTypes: uniqueTypes
  });

  const listUrl = new URL(`${access.supabaseUrl}/rest/v1/swarm_jobs`);
  listUrl.searchParams.set("select", "*");
  listUrl.searchParams.set("job_type", `in.(${uniqueTypes.join(",")})`);
  listUrl.searchParams.set("status", "in.(queued,retryable)");
  listUrl.searchParams.set("order", "priority.desc,created_at.asc");
  listUrl.searchParams.set("limit", "20");

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
      status: response.status,
      error: rows?.message || "Failed to load queued submission jobs",
      data: rows
    };
  }

  for (const row of Array.isArray(rows) ? rows : []) {
    const status = sanitizeJobStatus(row?.status);
    if (!QUEUEABLE_JOB_STATUSES.has(status)) {
      continue;
    }

    const notBefore = Date.parse(sanitizeOptionalString(row?.not_before, 128) || "");
    if (Number.isFinite(notBefore) && notBefore > Date.now()) {
      continue;
    }

    const attemptCount = Number.isFinite(Number(row?.attempt_count)) ? Number(row.attempt_count) : 0;
    const maxAttempts = Number.isFinite(Number(row?.max_attempts)) ? Number(row.max_attempts) : 3;
    if (attemptCount >= maxAttempts) {
      const now = new Date().toISOString();
      await updateSubmissionJob(
        row.job_id,
        {
          expectedStatus: row.status,
          status: "failed",
          completed_at: now,
          progress: {
            phase: "failed",
            percent: 100,
            message: "Job exceeded max queue attempts before it could be claimed.",
            updated_at: now
          },
          result: {
            status: "failed",
            summary: {
              note: "Job exceeded max queue attempts before it could be claimed."
            }
          }
        },
        access
      );
      continue;
    }

    const payload = sanitizeSubmissionJobPayload(row.payload);
    const jobRequest = isPlainObject(payload.job_request) ? payload.job_request : {};
    if (!validateQueuedJobRequest(jobRequest)) {
      const now = new Date().toISOString();
      await updateSubmissionJob(
        row.job_id,
        {
          expectedStatus: row.status,
          status: "failed",
          completed_at: now,
          progress: {
            phase: "failed",
            percent: 100,
            message: "Queued submission job is missing required request data.",
            updated_at: now
          },
          result: {
            status: "failed",
            summary: {
              note: "Queued submission job is missing required request data."
            }
          }
        },
        access
      );
      continue;
    }

    const now = new Date().toISOString();
    const updated = await updateSubmissionJob(
      row.job_id,
      {
        expectedStatus: row.status,
        status: "processing",
        claimed_by: workerId,
        attempt_count: attemptCount + 1,
        progress: {
          phase: "processing",
          percent: 1,
          message: "Job claimed by submission worker.",
          updated_at: now
        },
        payload: buildSubmissionJobPayload({
          existingPayload: payload,
          worker: {
            worker_id: workerId,
            claimed_at: now,
            heartbeat_at: now
          }
        }),
        started_at: sanitizeOptionalString(row.started_at, 128) || now
      },
      access
    );

    if (!updated.ok) {
      if (updated.status === 409) {
        continue;
      }
      return updated;
    }

    return {
      ok: true,
      status: 200,
      row: updated.row,
      job: updated.job,
      jobRequest: isPlainObject(updated.row?.payload?.job_request) ? updated.row.payload.job_request : jobRequest,
      payload: sanitizeSubmissionJobPayload(updated.row?.payload)
    };
  }

  return { ok: true, status: 200, row: null, job: null, jobRequest: null, payload: null };
}

async function reclaimStaleSubmissionJobs(options = {}, accessOptions = {}) {
  const mergedOptions = {
    ...(isPlainObject(accessOptions) ? accessOptions : {}),
    ...(isPlainObject(options) ? options : {})
  };
  const access = getSupabaseAccess(mergedOptions);
  if (!access.ok) {
    return access;
  }

  const workerId = sanitizeString(mergedOptions.workerId, 128) || `submission-worker-${Date.now()}`;
  const requestedTypes = Array.isArray(options.jobTypes)
    ? options.jobTypes.map((item) => sanitizeJobType(item)).filter(Boolean)
    : [];
  const uniqueTypes = Array.from(new Set(requestedTypes));
  const timings = getSubmissionWorkerTiming(mergedOptions);
  const now = Date.now();

  const listUrl = new URL(`${access.supabaseUrl}/rest/v1/swarm_jobs`);
  listUrl.searchParams.set("select", "*");
  if (uniqueTypes.length) {
    listUrl.searchParams.set("job_type", `in.(${uniqueTypes.join(",")})`);
  }
  listUrl.searchParams.set("status", "in.(processing)");
  listUrl.searchParams.set("order", "updated_at.asc");
  listUrl.searchParams.set("limit", String(sanitizePositiveInteger(mergedOptions.limit, 50, 200) || 50));

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
      status: response.status,
      error: rows?.message || "Failed to inspect processing submission jobs",
      data: rows
    };
  }

  const reclaimed = [];
  const inspected = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    const status = sanitizeJobStatus(row?.status);
    if (!STALE_RECLAIMABLE_JOB_STATUSES.has(status)) {
      continue;
    }

    const heartbeatAt = getSubmissionJobHeartbeatAt(row);
    const heartbeatMs = Date.parse(heartbeatAt || "");
    if (!Number.isFinite(heartbeatMs) || now - heartbeatMs < timings.staleAfterMs) {
      continue;
    }

    const payload = sanitizeSubmissionJobPayload(row?.payload);
    const requeueAt = new Date().toISOString();
    inspected.push({
      job_id: sanitizeString(row?.job_id, 128),
      previous_worker_id:
        sanitizeOptionalString(payload.worker?.worker_id || payload.worker?.workerId, 128) ||
        sanitizeOptionalString(row?.claimed_by, 128) ||
        null,
      stale_heartbeat_at: heartbeatAt
    });

    const updated = await updateSubmissionJob(
      row.job_id,
      {
        expectedStatus: row.status,
        status: "retryable",
        claimed_by: null,
        not_before: requeueAt,
        progress: {
          phase: "retryable",
          percent: 0,
          message: "Requeued after stale submission worker heartbeat.",
          updated_at: requeueAt
        },
        payload: buildSubmissionJobPayload({
          existingPayload: payload,
          worker: {
            ...payload.worker,
            worker_id: sanitizeOptionalString(payload.worker?.worker_id || payload.worker?.workerId, 128) || null,
            previous_worker_id:
              sanitizeOptionalString(payload.worker?.worker_id || payload.worker?.workerId, 128) ||
              sanitizeOptionalString(row?.claimed_by, 128) ||
              null,
            stale_reclaimed_at: requeueAt,
            stale_reclaimed_by: workerId,
            stale_heartbeat_at: heartbeatAt,
            heartbeat_at: requeueAt
          }
        })
      },
      access
    );

    if (updated.ok) {
      reclaimed.push({
        job_id: sanitizeString(row?.job_id, 128),
        previous_worker_id:
          sanitizeOptionalString(payload.worker?.worker_id || payload.worker?.workerId, 128) ||
          sanitizeOptionalString(row?.claimed_by, 128) ||
          null,
        stale_heartbeat_at: heartbeatAt
      });
    }
  }

  return {
    ok: true,
    status: 200,
    stale_after_ms: timings.staleAfterMs,
    reclaimed,
    inspected
  };
}

async function claimSubmissionJobById(jobId, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const workerId = sanitizeString(options.workerId, 128) || `submission-worker-${Date.now()}`;
  const safeJobId = sanitizeString(jobId, 128);
  if (!safeJobId) {
    return { ok: false, status: 400, error: "job_id is required" };
  }

  const loaded = await loadSubmissionJobById(safeJobId, access);
  if (!loaded.ok) {
    return loaded;
  }

  const row = loaded.row;
  const status = sanitizeJobStatus(row?.status);
  if (!QUEUEABLE_JOB_STATUSES.has(status)) {
    return { ok: false, status: 409, error: "Submission job is not claimable" };
  }

  const notBefore = Date.parse(sanitizeOptionalString(row?.not_before, 128) || "");
  if (Number.isFinite(notBefore) && notBefore > Date.now()) {
    return { ok: false, status: 409, error: "Submission job is not ready to run yet" };
  }

  const attemptCount = Number.isFinite(Number(row?.attempt_count)) ? Number(row.attempt_count) : 0;
  const maxAttempts = Number.isFinite(Number(row?.max_attempts)) ? Number(row.max_attempts) : 3;
  if (attemptCount >= maxAttempts) {
    const now = new Date().toISOString();
    await updateSubmissionJob(
      row.job_id,
      {
        expectedStatus: row.status,
        status: "failed",
        completed_at: now,
        progress: {
          phase: "failed",
          percent: 100,
          message: "Job exceeded max queue attempts before it could be claimed.",
          updated_at: now
        },
        result: {
          status: "failed",
          summary: {
            note: "Job exceeded max queue attempts before it could be claimed."
          }
        }
      },
      access
    );
    return { ok: false, status: 409, error: "Submission job exceeded max queue attempts" };
  }

  const payload = sanitizeSubmissionJobPayload(row.payload);
  const jobRequest = isPlainObject(payload.job_request) ? payload.job_request : {};
  if (!validateQueuedJobRequest(jobRequest)) {
    const now = new Date().toISOString();
    await updateSubmissionJob(
      row.job_id,
      {
        expectedStatus: row.status,
        status: "failed",
        completed_at: now,
        progress: {
          phase: "failed",
          percent: 100,
          message: "Queued submission job is missing required request data.",
          updated_at: now
        },
        result: {
          status: "failed",
          summary: {
            note: "Queued submission job is missing required request data."
          }
        }
      },
      access
    );
    return { ok: false, status: 400, error: "Queued submission job is missing required request data" };
  }

  const now = new Date().toISOString();
  const updated = await updateSubmissionJob(
    row.job_id,
    {
      expectedStatus: row.status,
      status: "processing",
      claimed_by: workerId,
      attempt_count: attemptCount + 1,
      progress: {
        phase: "processing",
        percent: 1,
        message: "Job claimed by submission worker.",
        updated_at: now
      },
      payload: buildSubmissionJobPayload({
        existingPayload: payload,
        worker: {
          worker_id: workerId,
          claimed_at: now,
          heartbeat_at: now
        }
      }),
      started_at: sanitizeOptionalString(row.started_at, 128) || now
    },
    access
  );

  if (!updated.ok) {
    return updated;
  }

  return {
    ok: true,
    status: 200,
    row: updated.row,
    job: updated.job,
    jobRequest: isPlainObject(updated.row?.payload?.job_request) ? updated.row.payload.job_request : jobRequest,
    payload: sanitizeSubmissionJobPayload(updated.row?.payload)
  };
}

async function loadSubmissionJobById(jobId, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const safeJobId = sanitizeString(jobId, 128);
  if (!safeJobId) {
    return { ok: false, status: 400, error: "job_id is required" };
  }

  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarm_jobs`);
  requestUrl.searchParams.set("select", "*");
  requestUrl.searchParams.set("job_id", `eq.${safeJobId}`);
  if (options.ownerUserId) {
    requestUrl.searchParams.set("owner_user_id", `eq.${sanitizeString(options.ownerUserId, 128)}`);
  }
  requestUrl.searchParams.set("limit", "1");

  const response = await access.fetchImpl(requestUrl.toString(), {
    headers: {
      apikey: access.serviceKey,
      Authorization: `Bearer ${access.serviceKey}`
    }
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
      status: response.status,
      error: data?.message || "Failed to load submission job",
      data
    };
  }

  const row = Array.isArray(data) && data[0] ? data[0] : null;
  if (!row) {
    return { ok: false, status: 404, error: "Submission job not found" };
  }

  return {
    ok: true,
    status: 200,
    row,
    job: summarizeSubmissionJob(row),
    payload: sanitizeSubmissionJobPayload(row.payload)
  };
}

async function getSubmissionJobStatus(jobId, options = {}) {
  return loadSubmissionJobById(jobId, options);
}

async function listSubmissionJobs(filters = {}, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const limit = Math.max(1, sanitizePositiveInteger(filters.limit, 50, 200) || 50);
  const offset = sanitizePositiveInteger(filters.offset, 0, 10000);
  const ownerUserId = sanitizeString(options.ownerUserId || filters.owner_user_id || filters.ownerUserId, 128);
  const siteId = sanitizeString(filters.site_id || filters.siteId, 128).toLowerCase();
  const brandKey = sanitizeString(filters.brand_key || filters.brandKey, 256).toLowerCase();
  const claimedBy = sanitizeString(filters.claimed_by || filters.claimedBy, 128);
  const createdAfter = sanitizeOptionalString(filters.created_after || filters.createdAfter, 128) || null;
  const statuses = sanitizeStringArray(filters.statuses || filters.status, 20, 64).map((item) =>
    sanitizeJobStatus(item)
  );
  const jobTypes = sanitizeStringArray(filters.job_types || filters.job_type || filters.jobType, 20, 64).map((item) =>
    sanitizeJobType(item)
  );
  const listUrl = new URL(`${access.supabaseUrl}/rest/v1/swarm_jobs`);
  listUrl.searchParams.set("select", "*");
  listUrl.searchParams.set("order", "created_at.desc");
  listUrl.searchParams.set("limit", String(limit));
  listUrl.searchParams.set("offset", String(offset));

  if (ownerUserId) {
    listUrl.searchParams.set("owner_user_id", `eq.${ownerUserId}`);
  }
  if (siteId) {
    listUrl.searchParams.set("site_id", `eq.${siteId}`);
  }
  if (brandKey) {
    listUrl.searchParams.set("brand_key", `eq.${brandKey}`);
  }
  if (claimedBy) {
    listUrl.searchParams.set("claimed_by", `eq.${claimedBy}`);
  }
  if (createdAfter) {
    listUrl.searchParams.set("created_at", `gte.${createdAfter}`);
  }
  if (statuses.length === 1) {
    listUrl.searchParams.set("status", `eq.${statuses[0]}`);
  } else if (statuses.length > 1) {
    listUrl.searchParams.set("status", `in.(${statuses.join(",")})`);
  }
  if (jobTypes.length === 1) {
    listUrl.searchParams.set("job_type", `eq.${jobTypes[0]}`);
  } else if (jobTypes.length > 1) {
    listUrl.searchParams.set("job_type", `in.(${jobTypes.join(",")})`);
  }

  const response = await access.fetchImpl(listUrl.toString(), {
    headers: {
      apikey: access.serviceKey,
      Authorization: `Bearer ${access.serviceKey}`
    }
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
      status: response.status,
      error: data?.message || "Failed to list submission jobs",
      data
    };
  }

  const search = sanitizeString(filters.search, 240).toLowerCase();
  let rows = Array.isArray(data) ? data : [];
  if (search) {
    rows = rows.filter((row) => {
      const payload = sanitizeSubmissionJobPayload(row?.payload);
      const request = isPlainObject(payload.job_request) ? payload.job_request : {};
      return [
        row?.job_id,
        row?.brand_key,
        row?.site_id,
        row?.target,
        request?.brand_profile_id,
        request?.site_name,
        request?.submit_url
      ]
        .map((value) => sanitizeOptionalString(value, 4096)?.toLowerCase() || "")
        .some((value) => value.includes(search));
    });
  }

  return {
    ok: true,
    status: 200,
    total: rows.length,
    limit,
    offset,
    rows,
    items: rows.map(summarizeSubmissionJob)
  };
}

module.exports = {
  ACTIVE_JOB_STATUSES,
  buildSubmissionJobPayload,
  getSubmissionJobHeartbeatAt,
  getSubmissionWorkerTiming,
  enqueueSubmissionJob,
  updateSubmissionJob,
  claimNextSubmissionJob,
  claimSubmissionJobById,
  loadSubmissionJobById,
  getSubmissionJobStatus,
  listSubmissionJobs,
  reclaimStaleSubmissionJobs,
  sanitizeSubmissionJobPayload,
  summarizeSubmissionJob
};
