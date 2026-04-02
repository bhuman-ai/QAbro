const crypto = require("crypto");

const {
  extractTargetLabel,
  isPlainObject,
  loadStoredReportByRunId,
  normalizeUrl,
  sanitizeRepoTriageState,
  sanitizeOptionalString,
  sanitizeReportMarkdown,
  sanitizeString,
  toIsoTimestamp
} = require("./qa-core");

const DEFAULT_QUEUE_MAX_ATTEMPTS = 3;
const FRESH_QUEUE_STATUS = "queued_vision";
const FRESH_RETRYABLE_STATUS = "retryable_vision";
const QUEUE_STATUS_ALIASES = new Map([
  [FRESH_QUEUE_STATUS, "queued"],
  [FRESH_RETRYABLE_STATUS, "retryable"]
]);
const QUEUEABLE_STATUSES = new Set(["queued", "retryable", FRESH_QUEUE_STATUS, FRESH_RETRYABLE_STATUS]);
const ACTIVE_QUEUE_STATUSES = new Set(["queued", "processing", "retryable", FRESH_QUEUE_STATUS, FRESH_RETRYABLE_STATUS]);
const QUEUE_INSIGHT_STATUSES = new Set(["queued", "retryable", FRESH_QUEUE_STATUS, FRESH_RETRYABLE_STATUS]);
const ESTIMATED_PROCESSING_SLOT_SECONDS = 210;
const ESTIMATED_QUEUED_SLOT_SECONDS = 80;
const REPORT_SHARE_TOKEN_BYTES = 24;
const REPORT_LIST_SELECT_COLUMNS =
  "run_id,target,status,report_url,findings,summary,source,delivered_at,payload,owner_user_id,brand_key";
const REPORT_LIST_LEGACY_SELECT_COLUMNS =
  "run_id,target,status,report_url,findings,summary,source,delivered_at,payload";

function getSupabaseAccess(options = {}) {
  const supabaseUrl = sanitizeString(options.supabaseUrl || process.env.SUPABASE_URL, 4096).replace(/\/$/, "");
  const serviceKey = sanitizeString(options.serviceKey || process.env.SUPABASE_SERVICE_KEY, 4096);
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  if (!supabaseUrl || !serviceKey) {
    return { ok: false, error: "Server is not configured" };
  }

  if (typeof fetchImpl !== "function") {
    return { ok: false, error: "fetch is not available" };
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

function normalizeQueueLifecycleStatus(value) {
  const status = sanitizeString(value, 64).toLowerCase();
  return QUEUE_STATUS_ALIASES.get(status) || status;
}

function getInitialQueueStatus() {
  return FRESH_QUEUE_STATUS;
}

function getRetryQueueStatus(currentStatus) {
  return normalizeQueueLifecycleStatus(currentStatus) === "retryable" || currentStatus === FRESH_RETRYABLE_STATUS
    ? FRESH_RETRYABLE_STATUS
    : FRESH_RETRYABLE_STATUS;
}

function sanitizeQueue(value) {
  const queue = isPlainObject(value) ? value : {};
  const attemptCount = Number(queue.attempt_count);
  const maxAttempts = Number(queue.max_attempts);
  const callbackAttempts = Number(queue.callback_attempts);

  return {
    status: sanitizeString(queue.status, 64) || getInitialQueueStatus(),
    enqueued_at: sanitizeOptionalString(queue.enqueued_at, 128) || null,
    started_at: sanitizeOptionalString(queue.started_at, 128) || null,
    completed_at: sanitizeOptionalString(queue.completed_at, 128) || null,
    last_claimed_at: sanitizeOptionalString(queue.last_claimed_at, 128) || null,
    worker_id: sanitizeOptionalString(queue.worker_id, 128) || null,
    attempt_count: Number.isFinite(attemptCount) ? attemptCount : 0,
    max_attempts: Number.isFinite(maxAttempts) ? maxAttempts : DEFAULT_QUEUE_MAX_ATTEMPTS,
    callback_attempts: Number.isFinite(callbackAttempts) ? callbackAttempts : 0,
    callback_ok: typeof queue.callback_ok === "boolean" ? queue.callback_ok : null,
    callback_status:
      typeof queue.callback_status === "number" && Number.isFinite(queue.callback_status)
        ? queue.callback_status
        : null,
    last_error: sanitizeOptionalString(queue.last_error, 4000) || null
  };
}

function buildQueuePayload(options = {}) {
  const existingPayload = isPlainObject(options.existingPayload) ? options.existingPayload : {};
  const runRequest = isPlainObject(options.runRequest) ? options.runRequest : existingPayload.run_request || {};
  const evidenceMedia = isPlainObject(options.evidenceMedia) ? options.evidenceMedia : existingPayload.evidence_media || null;

  return {
    ...existingPayload,
    schema_version: "1.1",
    run_request: runRequest,
    status_url: sanitizeOptionalString(options.statusUrl || existingPayload.status_url, 4096),
    report_url: sanitizeOptionalString(options.reportUrl || existingPayload.report_url, 4096),
    queue: sanitizeQueue(options.queue || existingPayload.queue),
    worker: isPlainObject(options.worker) ? options.worker : existingPayload.worker || null,
    report_json: isPlainObject(options.reportJson) ? options.reportJson : existingPayload.report_json || null,
    report_markdown:
      sanitizeReportMarkdown(options.reportMarkdown, 12000) || sanitizeReportMarkdown(existingPayload.report_markdown, 12000),
    artifacts: isPlainObject(options.artifacts) ? options.artifacts : existingPayload.artifacts || null,
    run_log: Array.isArray(options.runLog) ? options.runLog : existingPayload.run_log || null,
    evidence_media: evidenceMedia
  };
}

function summarizeQueueStatus(row) {
  const payload = isPlainObject(row?.payload) ? row.payload : {};
  const rowStatus = normalizeQueueLifecycleStatus(row?.status);
  const hasStoredQueue = isPlainObject(payload.queue);
  const queue = hasStoredQueue
    ? sanitizeQueue(payload.queue)
    : sanitizeQueue({
        status: rowStatus || getInitialQueueStatus(),
        enqueued_at: sanitizeOptionalString(row?.created_at || row?.delivered_at, 128) || null,
        completed_at:
          rowStatus && !QUEUEABLE_STATUSES.has(rowStatus)
            ? sanitizeOptionalString(row?.delivered_at, 128) || null
            : null
      });
  const queueStatus = normalizeQueueLifecycleStatus(queue.status);

  return {
    run_id: sanitizeString(row?.run_id, 128),
    status: rowStatus || queueStatus,
    queue_status: queueStatus,
    target: sanitizeOptionalString(row?.target, 320),
    report_url: sanitizeOptionalString(row?.report_url, 4096),
    status_url: sanitizeOptionalString(payload.status_url, 4096),
    enqueued_at: queue.enqueued_at,
    started_at: queue.started_at,
    completed_at: queue.completed_at,
    attempt_count: queue.attempt_count,
    max_attempts: queue.max_attempts,
    callback_ok: queue.callback_ok,
    callback_status: queue.callback_status,
    last_error: queue.last_error,
    report_ready: Boolean(payload.report_json),
    latest_report_status: isPlainObject(payload.report_json)
      ? sanitizeOptionalString(payload.report_json.status, 64)
      : rowStatus || sanitizeOptionalString(row?.status, 64)
  };
}

function getQueueStatusFromRow(row) {
  const payload = isPlainObject(row?.payload) ? row.payload : {};
  const queueSummary = summarizeQueueStatus(row);
  return normalizeQueueLifecycleStatus(queueSummary.queue_status || queueSummary.status || row?.status);
}

function getQueueSortTimestamp(row) {
  const payload = isPlainObject(row?.payload) ? row.payload : {};
  const queue = sanitizeQueue(payload.queue);
  const candidates = [queue.enqueued_at, row?.created_at, row?.delivered_at];
  for (const candidate of candidates) {
    const parsed = new Date(candidate || "");
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getTime();
    }
  }
  return 0;
}

async function estimateQueueInsight(row, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return null;
  }

  const currentStatus = getQueueStatusFromRow(row);
  if (!QUEUE_INSIGHT_STATUSES.has(currentStatus)) {
    return null;
  }

  const ownerUserId = extractOwnerUserId(row);
  if (!ownerUserId) {
    return null;
  }

  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_reports`);
  requestUrl.searchParams.set("select", "run_id,status,created_at,payload");
  requestUrl.searchParams.set("order", "created_at.asc");
  requestUrl.searchParams.set("limit", "100");

  const response = await access.fetchImpl(requestUrl.toString(), {
    headers: buildSupabaseHeaders(access.serviceKey, "return=minimal")
  });

  let rows = null;
  try {
    rows = await response.json();
  } catch {
    rows = null;
  }

  if (!response.ok || !Array.isArray(rows)) {
    return null;
  }

  const activeRows = rows
    .filter((candidate) => extractOwnerUserId(candidate) === ownerUserId)
    .filter((candidate) => ACTIVE_QUEUE_STATUSES.has(getQueueStatusFromRow(candidate)))
    .sort((left, right) => getQueueSortTimestamp(left) - getQueueSortTimestamp(right));

  const currentIndex = activeRows.findIndex((candidate) => sanitizeString(candidate?.run_id, 128) === sanitizeString(row?.run_id, 128));
  const aheadRows = currentIndex > 0 ? activeRows.slice(0, currentIndex) : [];
  const processingAhead = aheadRows.filter((candidate) => getQueueStatusFromRow(candidate) === "processing").length;
  const queuedAhead = aheadRows.length - processingAhead;
  const estimatedStartSeconds =
    currentStatus === "queued" || currentStatus === "retryable"
      ? Math.max(20, processingAhead * ESTIMATED_PROCESSING_SLOT_SECONDS + queuedAhead * ESTIMATED_QUEUED_SLOT_SECONDS)
      : 0;

  return {
    queue_ahead: Math.max(0, aheadRows.length),
    processing_ahead: Math.max(0, processingAhead),
    active_total: Math.max(0, activeRows.length),
    estimated_start_seconds: estimatedStartSeconds
  };
}

async function enqueueQaRun(runRequest, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return { ok: false, status: 500, error: access.error };
  }

  const publicBaseUrl = sanitizeString(options.publicBaseUrl, 4096).replace(/\/$/, "");
  const reportUrl = sanitizeString(options.reportUrl, 4096);
  const statusUrl = sanitizeString(options.statusUrl, 4096);
  const now = new Date().toISOString();
  const initialStatus = getInitialQueueStatus();
  const queue = sanitizeQueue({
    status: initialStatus,
    enqueued_at: now,
    attempt_count: 0,
    max_attempts: DEFAULT_QUEUE_MAX_ATTEMPTS
  });

  const payload = buildQueuePayload({
    runRequest,
    reportUrl,
    statusUrl,
    queue,
    worker: null,
    reportJson: null,
    reportMarkdown: null,
    artifacts: null,
    runLog: null
  });
  const additionalPayload = isPlainObject(options.additionalPayload) ? options.additionalPayload : {};
  const finalPayload = {
    ...additionalPayload,
    ...payload
  };

  const row = {
    run_id: runRequest.run_id,
    target: extractTargetLabel(runRequest.target_url),
    status: initialStatus,
    report_url: reportUrl || null,
    findings: [],
    summary: JSON.stringify({ note: "Queued for worker processing." }),
    source: sanitizeString(runRequest.source, 64) || "qa_bot",
    delivered_at: now,
    payload: finalPayload
  };

  const response = await access.fetchImpl(`${access.supabaseUrl}/rest/v1/swarmtest_reports?on_conflict=run_id`, {
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
      error: data?.message || "Failed to enqueue QA run",
      data
    };
  }

  const savedRow = Array.isArray(data) && data[0] ? data[0] : row;
  let queueInsight = null;
  try {
    queueInsight = await estimateQueueInsight(savedRow, access);
  } catch {
    queueInsight = null;
  }

  return {
    ok: true,
    status: 202,
    row: savedRow,
    queue: {
      ...summarizeQueueStatus(savedRow),
      ...(queueInsight || {})
    }
  };
}

async function updateQueueRow(runId, mutation, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return { ok: false, status: 500, error: access.error };
  }

  const safeRunId = sanitizeString(runId, 128);
  if (!safeRunId) {
    return { ok: false, status: 400, error: "run_id is required" };
  }

  const query = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_reports`);
  query.searchParams.set("run_id", `eq.${safeRunId}`);

  if (mutation.expectedStatus) {
    query.searchParams.set("status", `eq.${sanitizeString(mutation.expectedStatus, 64)}`);
  }

  const body = {};
  if (mutation.status) body.status = sanitizeString(mutation.status, 64);
  if (mutation.report_url !== undefined) body.report_url = mutation.report_url;
  if (mutation.findings !== undefined) body.findings = Array.isArray(mutation.findings) ? mutation.findings : [];
  if (mutation.summary !== undefined) {
    body.summary =
      typeof mutation.summary === "string"
        ? mutation.summary
        : mutation.summary && typeof mutation.summary === "object"
          ? JSON.stringify(mutation.summary)
          : null;
  }
  if (mutation.payload !== undefined) body.payload = mutation.payload;
  if (mutation.delivered_at !== undefined) body.delivered_at = mutation.delivered_at;
  if (mutation.target !== undefined) body.target = mutation.target;
  if (mutation.source !== undefined) body.source = mutation.source;

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
      error: data?.message || "Failed to update QA queue row",
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
    row,
    queue: row ? summarizeQueueStatus(row) : null
  };
}

async function claimNextQaRun(options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return { ok: false, status: 500, error: access.error };
  }

  const workerId = sanitizeString(options.workerId, 128) || `worker-${Date.now()}`;
  const listUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_reports`);
  listUrl.searchParams.set(
    "select",
    "id,run_id,target,status,report_url,findings,summary,source,delivered_at,payload,created_at,updated_at"
  );
  listUrl.searchParams.set("status", `in.(${FRESH_QUEUE_STATUS},${FRESH_RETRYABLE_STATUS},queued,retryable)`);
  listUrl.searchParams.set("order", "delivered_at.asc");
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
      error: rows?.message || "Failed to load queued QA runs",
      data: rows
    };
  }

  for (const row of Array.isArray(rows) ? rows : []) {
    if (!QUEUEABLE_STATUSES.has(sanitizeString(row.status, 64))) {
      continue;
    }

    const payload = isPlainObject(row.payload) ? row.payload : {};
    const queue = sanitizeQueue(payload.queue);
    if (queue.attempt_count >= queue.max_attempts) {
      await updateQueueRow(row.run_id, {
        status: "failed",
        summary: { note: "Job exceeded max queue attempts before it could be claimed." },
        delivered_at: new Date().toISOString(),
        payload: buildQueuePayload({
          existingPayload: payload,
          queue: {
            ...queue,
            status: "failed",
            completed_at: new Date().toISOString(),
            last_error: "Job exceeded max queue attempts before it could be claimed."
          }
        })
      }, access);
      continue;
    }

    const now = new Date().toISOString();
    const claimedQueue = {
      ...queue,
      status: "processing",
      started_at: queue.started_at || now,
      last_claimed_at: now,
      worker_id: workerId,
      attempt_count: queue.attempt_count + 1,
      last_error: null
    };

    const updated = await updateQueueRow(
      row.run_id,
      {
        expectedStatus: row.status,
        status: "processing",
        findings: Array.isArray(row.findings) ? row.findings : [],
        summary: { note: "Processing by QA worker." },
        delivered_at: now,
        payload: buildQueuePayload({
          existingPayload: payload,
          runRequest: payload.run_request,
          reportUrl: row.report_url,
          statusUrl: payload.status_url,
          queue: claimedQueue,
          worker: {
            worker_id: workerId,
            claimed_at: now
          }
        })
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
    const claimedPayload = isPlainObject(claimedRow?.payload) ? claimedRow.payload : payload;
    const runRequest = isPlainObject(claimedPayload.run_request) ? claimedPayload.run_request : null;

    if (!runRequest || !normalizeUrl(runRequest.target_url)) {
      await updateQueueRow(
        row.run_id,
        {
          status: "failed",
          findings: [],
          summary: { note: "Queued run is missing a valid run_request payload." },
          delivered_at: new Date().toISOString(),
          payload: buildQueuePayload({
            existingPayload: claimedPayload,
            queue: {
              ...claimedQueue,
              status: "failed",
              completed_at: new Date().toISOString(),
              last_error: "Queued run is missing a valid run_request payload."
            }
          })
        },
        access
      );
      continue;
    }

    return {
      ok: true,
      status: 200,
      row: claimedRow,
      queue: summarizeQueueStatus(claimedRow),
      runRequest,
      payload: claimedPayload
    };
  }

  return { ok: true, status: 200, row: null, queue: null, runRequest: null, payload: null };
}

async function getQaRunStatus(runId, options = {}) {
  const loaded = await loadStoredReportByRunId(runId, options);
  if (!loaded.ok) {
    return loaded;
  }

  const access = resolveQaReportReadAccess(loaded.row, {
    authOk: options.authOk === true || Boolean(options.ownerUserId || options.owner_user_id),
    ownerUserId: options.ownerUserId || options.owner_user_id,
    shareKey: options.shareKey || options.share_key,
    request: options.request || options.req
  });
  if (!access.ok) {
    return {
      ok: false,
      status: access.status || 401,
      error: access.error || "Run not found"
    };
  }

  const queueSummary = summarizeQueueStatus(loaded.row);
  let queueInsight = null;
  try {
    queueInsight = await estimateQueueInsight(loaded.row, options);
  } catch {
    queueInsight = null;
  }

  return {
    ok: true,
    status: 200,
    row: loaded.row,
    queue: {
      ...queueSummary,
      ...(queueInsight || {})
    }
  };
}

function extractBrandKey(row) {
  const payload = isPlainObject(row?.payload) ? row.payload : {};
  const runRequest = isPlainObject(payload.run_request) ? payload.run_request : {};
  const metadata = isPlainObject(runRequest.metadata) ? runRequest.metadata : {};

  const candidates = [
    row?.brand_key,
    row?.brandKey,
    metadata.brand_id,
    metadata.brandId,
    metadata.brand_key,
    metadata.brandKey,
    metadata.brand_slug,
    metadata.brandSlug,
    metadata.brand,
    metadata.workspace_id,
    metadata.workspaceId,
    payload.brand_id,
    payload.brand,
    row?.target
  ];

  for (const candidate of candidates) {
    const value = sanitizeString(candidate, 256);
    if (value) {
      return value;
    }
  }

  return null;
}

function extractOwnerUserId(row) {
  const payload = isPlainObject(row?.payload) ? row.payload : {};
  const runRequest = isPlainObject(payload.run_request) ? payload.run_request : {};
  const metadata = isPlainObject(runRequest.metadata) ? runRequest.metadata : {};

  const candidates = [
    row?.owner_user_id,
    row?.ownerUserId,
    metadata.owner_user_id,
    metadata.ownerUserId,
    metadata.user_id,
    metadata.userId,
    payload.owner_user_id,
    payload.ownerUserId
  ];

  for (const candidate of candidates) {
    const value = sanitizeString(candidate, 128);
    if (value) {
      return value;
    }
  }

  return null;
}

function readReportShareSettings(row) {
  const payload = isPlainObject(row?.payload) ? row.payload : {};
  const share = isPlainObject(payload.share) ? payload.share : {};
  const token = sanitizeString(share.token, 512);
  const enabled = share.enabled === true && Boolean(token);

  return {
    enabled,
    token: enabled ? token : "",
    created_at: sanitizeOptionalString(share.created_at, 128) || null,
    updated_at: sanitizeOptionalString(share.updated_at, 128) || null,
    revoked_at: sanitizeOptionalString(share.revoked_at, 128) || null
  };
}

function generateQaReportShareToken(options = {}) {
  const randomBytesImpl = typeof options.randomBytesImpl === "function" ? options.randomBytesImpl : crypto.randomBytes;
  try {
    return randomBytesImpl(REPORT_SHARE_TOKEN_BYTES).toString("base64url");
  } catch {
    return randomBytesImpl(REPORT_SHARE_TOKEN_BYTES).toString("hex");
  }
}

function readQaShareKey(valueOrReq) {
  if (typeof valueOrReq === "string") {
    return sanitizeString(valueOrReq, 512);
  }

  return sanitizeString(
    valueOrReq?.query?.share_key ||
      valueOrReq?.query?.shareKey ||
      valueOrReq?.headers?.["x-qa-share-key"] ||
      valueOrReq?.headers?.["x-share-key"],
    512
  );
}

function resolveQaReportReadAccess(row, options = {}) {
  const authOk = options.authOk === true;
  const ownerUserId = sanitizeString(options.ownerUserId || options.owner_user_id, 128);
  const rowOwnerUserId = extractOwnerUserId(row);
  if (authOk) {
    if (!ownerUserId) {
      return { ok: true, status: 200, access_type: "owner" };
    }
    if (rowOwnerUserId && rowOwnerUserId === ownerUserId) {
      return { ok: true, status: 200, access_type: "owner" };
    }
  }

  const shareKey = readQaShareKey(options.shareKey || options.share_key || options.request || options.req);
  const share = readReportShareSettings(row);
  if (share.enabled && share.token && shareKey && share.token === shareKey) {
    return { ok: true, status: 200, access_type: "shared_link", share_key: shareKey };
  }

  if (authOk || shareKey) {
    return { ok: false, status: 404, error: "Run not found" };
  }

  return { ok: false, status: 401, error: "Authentication required" };
}

function buildLegacyOwnerPayloadFilter(ownerFilter) {
  return `cs.${JSON.stringify({
    run_request: {
      metadata: {
        owner_user_id: ownerFilter
      }
    }
  })}`;
}

function isMissingReportComputedColumnsError(result) {
  const safeResult = result && typeof result === "object" ? result : {};
  const errorText = [
    sanitizeString(safeResult.message, 512),
    sanitizeString(safeResult.error, 512),
    sanitizeString(safeResult.hint, 512)
  ]
    .join(" ")
    .toLowerCase();

  return (
    (errorText.includes("owner_user_id") || errorText.includes("brand_key")) &&
    (errorText.includes("column") || errorText.includes("schema cache"))
  );
}

function buildListQaReportsUrl(access, filters, fetchLimit, useComputedColumns = true) {
  const ownerFilter = sanitizeString(filters.owner_user_id || filters.ownerUserId, 128);
  const statusFilter = sanitizeString(filters.status, 64);
  const listUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_reports`);

  listUrl.searchParams.set(
    "select",
    useComputedColumns ? REPORT_LIST_SELECT_COLUMNS : REPORT_LIST_LEGACY_SELECT_COLUMNS
  );
  listUrl.searchParams.set("order", "delivered_at.desc");
  listUrl.searchParams.set("limit", String(fetchLimit));

  if (ownerFilter) {
    if (useComputedColumns) {
      listUrl.searchParams.set("owner_user_id", `eq.${ownerFilter}`);
    } else {
      listUrl.searchParams.set("payload", buildLegacyOwnerPayloadFilter(ownerFilter));
    }
  }
  if (statusFilter) {
    listUrl.searchParams.set("status", `eq.${normalizeQueueLifecycleStatus(statusFilter)}`);
  }

  return listUrl;
}

function rowMatchesFilters(row, filters) {
  const brandKey = extractBrandKey(row);
  const ownerUserId = extractOwnerUserId(row);
  const ownerFilter = sanitizeString(filters.owner_user_id || filters.ownerUserId, 128).toLowerCase();
  const brandFilter = sanitizeString(filters.brand, 256).toLowerCase();
  const targetFilter = sanitizeString(filters.target, 320).toLowerCase();
  const statusFilter = sanitizeString(filters.status, 64).toLowerCase();
  const queryFilter = sanitizeString(filters.q, 320).toLowerCase();

  if (ownerFilter && String(ownerUserId || "").toLowerCase() !== ownerFilter) {
    return false;
  }

  if (brandFilter && !String(brandKey || "").toLowerCase().includes(brandFilter)) {
    return false;
  }

  if (targetFilter && !String(row?.target || "").toLowerCase().includes(targetFilter)) {
    return false;
  }

  if (statusFilter && normalizeQueueLifecycleStatus(row?.status) !== statusFilter) {
    return false;
  }

  if (queryFilter) {
    const haystack = [
      sanitizeString(row?.run_id, 128),
      sanitizeString(row?.target, 320),
      sanitizeString(row?.status, 64),
      sanitizeString(brandKey, 256),
      sanitizeString(ownerUserId, 128)
    ]
      .join(" ")
      .toLowerCase();

    if (!haystack.includes(queryFilter)) {
      return false;
    }
  }

  return true;
}

function summarizeReportRow(row) {
  const payload = isPlainObject(row?.payload) ? row.payload : {};
  const reportJson = isPlainObject(payload.report_json) ? payload.report_json : {};
  const queue = sanitizeQueue(payload.queue);
  const counts = isPlainObject(reportJson.summary?.counts) ? reportJson.summary.counts : {};
  const evidenceGallery = isPlainObject(reportJson.evidence_gallery) ? reportJson.evidence_gallery : {};
  const runRequest = isPlainObject(payload.run_request) ? payload.run_request : {};
  const runRequestMetadata = isPlainObject(runRequest.metadata) ? runRequest.metadata : {};
  const reportMetadata = isPlainObject(reportJson.metadata) ? reportJson.metadata : {};
  const repoTriage = sanitizeRepoTriageState(
    payload.repo_triage,
    reportMetadata.repo_triage || runRequestMetadata.repo_triage || runRequestMetadata.repoTriage
  );

  const persona =
    sanitizeOptionalString(reportMetadata.brand_persona, 500) ||
    sanitizeOptionalString(reportMetadata.persona, 500) ||
    sanitizeOptionalString(payload?.metadata?.brand_persona, 500) ||
    sanitizeOptionalString(payload?.metadata?.persona, 500) ||
    sanitizeOptionalString(runRequest.brand_persona, 500) ||
    sanitizeOptionalString(runRequest.brandPersona, 500) ||
    sanitizeOptionalString(runRequestMetadata.brand_persona, 500) ||
    sanitizeOptionalString(runRequestMetadata.brandPersona, 500) ||
    sanitizeOptionalString(runRequestMetadata.persona, 500) ||
    sanitizeOptionalString(runRequestMetadata.bot_personality, 500) ||
    null;
  const goal =
    sanitizeOptionalString(reportMetadata.goal, 1000) ||
    sanitizeOptionalString(reportMetadata.user_goal, 1000) ||
    sanitizeOptionalString(reportMetadata.objective, 1000) ||
    sanitizeOptionalString(runRequest.goal, 1000) ||
    sanitizeOptionalString(runRequest.user_goal, 1000) ||
    sanitizeOptionalString(runRequest.objective, 1000) ||
    sanitizeOptionalString(runRequestMetadata.goal, 1000) ||
    sanitizeOptionalString(runRequestMetadata.user_goal, 1000) ||
    sanitizeOptionalString(runRequestMetadata.objective, 1000) ||
    null;

  return {
    run_id: sanitizeString(row?.run_id, 128) || null,
    brand_key: extractBrandKey(row),
    owner_user_id: extractOwnerUserId(row),
    persona,
    goal,
    target_url:
      sanitizeOptionalString(runRequest.target_url, 4096) ||
      sanitizeOptionalString(runRequest.targetUrl, 4096) ||
      sanitizeOptionalString(runRequestMetadata.target_url, 4096) ||
      sanitizeOptionalString(runRequestMetadata.targetUrl, 4096) ||
      sanitizeOptionalString(reportMetadata.target_url, 4096) ||
      null,
    scope_mode:
      sanitizeOptionalString(reportMetadata.scope_mode, 64) ||
      sanitizeOptionalString(runRequest.scope_mode, 64) ||
      sanitizeOptionalString(runRequest.scopeMode, 64) ||
      "core_20m",
    scenario_list:
      Array.isArray(reportMetadata.scenario_list)
        ? reportMetadata.scenario_list.map((item) => sanitizeOptionalString(item, 500)).filter(Boolean)
        : Array.isArray(runRequest.scenario_list)
          ? runRequest.scenario_list.map((item) => sanitizeOptionalString(item, 500)).filter(Boolean)
          : Array.isArray(runRequest.scenarioList)
            ? runRequest.scenarioList.map((item) => sanitizeOptionalString(item, 500)).filter(Boolean)
            : [],
    brand_name:
      sanitizeOptionalString(runRequestMetadata.brand_name, 256) ||
      sanitizeOptionalString(runRequestMetadata.brandName, 256) ||
      sanitizeOptionalString(reportMetadata.brand_name, 256) ||
      null,
    target: sanitizeOptionalString(row?.target, 320),
    status: normalizeQueueLifecycleStatus(row?.status) || normalizeQueueLifecycleStatus(queue.status),
    latest_report_status:
      sanitizeOptionalString(reportJson.status, 64) ||
      normalizeQueueLifecycleStatus(row?.status) ||
      sanitizeOptionalString(row?.status, 64),
    delivered_at: sanitizeOptionalString(row?.delivered_at, 128),
    source: sanitizeOptionalString(row?.source, 64),
    report_url: sanitizeOptionalString(row?.report_url, 4096),
    report_ready: Boolean(payload.report_json),
    queue_status: queue.status,
    summary_note:
      sanitizeOptionalString(reportJson.summary?.note, 2000) ||
      sanitizeOptionalString(payload.summary?.note, 2000),
    repo_triage_enabled: repoTriage.enabled,
    repo_triage_status: repoTriage.status,
    repo_triage_summary: repoTriage.summary,
    repo_triage: repoTriage,
    risk_score:
      typeof reportJson.summary?.risk_score === "number" && Number.isFinite(reportJson.summary.risk_score)
        ? reportJson.summary.risk_score
        : null,
    findings_count: Array.isArray(reportJson.findings)
      ? reportJson.findings.length
      : Array.isArray(row?.findings)
        ? row.findings.length
        : 0,
    journeys_count: Array.isArray(reportJson.tested_journeys) ? reportJson.tested_journeys.length : 0,
    recommendations_count: Array.isArray(reportJson.recommendations) ? reportJson.recommendations.length : 0,
    counts,
    hero_screenshot:
      sanitizeOptionalString(evidenceGallery.screenshots?.[0], 4096) ||
      sanitizeOptionalString(reportJson.findings?.[0]?.evidence?.screenshots?.[0], 4096) ||
      sanitizeOptionalString(payload.artifacts?.browserbase_debug_url, 4096),
    session_url:
      sanitizeOptionalString(evidenceGallery.session_url, 4096) ||
      sanitizeOptionalString(payload.artifacts?.browserbase_session_url, 4096),
    debug_url:
      sanitizeOptionalString(evidenceGallery.debug_url, 4096) ||
      sanitizeOptionalString(payload.artifacts?.browserbase_debug_url, 4096)
  };
}

async function listQaReports(filters = {}, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return { ok: false, status: 500, error: access.error };
  }

  const limit = Math.max(1, Math.min(200, Number(filters.limit) || 50));
  const offset = Math.max(0, Number(filters.offset) || 0);
  const brandFilter = sanitizeString(filters.brand, 256);
  const targetFilter = sanitizeString(filters.target, 320);
  const queryFilter = sanitizeString(filters.q, 320);
  const baseFetchLimit = Math.max(limit + offset, limit);
  const fetchLimit =
    brandFilter || targetFilter || queryFilter
      ? Math.min(200, Math.max(baseFetchLimit, 120))
      : baseFetchLimit;
  const headers = {
    apikey: access.serviceKey,
    Authorization: `Bearer ${access.serviceKey}`
  };
  const primaryUrl = buildListQaReportsUrl(access, filters, fetchLimit, true);
  let response = await access.fetchImpl(primaryUrl.toString(), {
    headers
  });

  let rows = [];
  try {
    rows = await response.json();
  } catch {
    rows = [];
  }

  if ((!response.ok || !Array.isArray(rows)) && isMissingReportComputedColumnsError(rows)) {
    const legacyUrl = buildListQaReportsUrl(access, filters, fetchLimit, false);
    response = await access.fetchImpl(legacyUrl.toString(), {
      headers
    });

    try {
      rows = await response.json();
    } catch {
      rows = [];
    }
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: rows?.message || "Failed to list QA reports",
      data: rows
    };
  }

  const filtered = (Array.isArray(rows) ? rows : []).filter((row) => rowMatchesFilters(row, filters));
  const total = filtered.length;
  const pagedRows = filtered.slice(offset, offset + limit);
  const items = pagedRows.map(summarizeReportRow);

  return {
    ok: true,
    status: 200,
    total,
    limit,
    offset,
    items
  };
}

module.exports = {
  DEFAULT_QUEUE_MAX_ATTEMPTS,
  FRESH_QUEUE_STATUS,
  FRESH_RETRYABLE_STATUS,
  buildQueuePayload,
  getInitialQueueStatus,
  getRetryQueueStatus,
  normalizeQueueLifecycleStatus,
  sanitizeQueue,
  summarizeQueueStatus,
  summarizeReportRow,
  extractBrandKey,
  extractOwnerUserId,
  readReportShareSettings,
  generateQaReportShareToken,
  readQaShareKey,
  resolveQaReportReadAccess,
  enqueueQaRun,
  updateQueueRow,
  claimNextQaRun,
  getQaRunStatus,
  listQaReports
};
