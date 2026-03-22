const { isPlainObject, sanitizeOptionalString, sanitizeString } = require("./qa-core");

const DEFAULT_WORKER_HEARTBEAT_INTERVAL_MS = 15000;
const DEFAULT_WORKER_HEARTBEAT_STALE_AFTER_MS = 45000;
const DEFAULT_WORKER_HEARTBEAT_OFFLINE_AFTER_MS = 180000;
const DEFAULT_WORKER_LIST_LIMIT = 24;
const WORKER_STATUSES = new Set(["starting", "idle", "sleeping", "processing", "error", "stopped"]);

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

function getWorkerHeartbeatThresholds(options = {}) {
  const intervalMs = Math.max(
    5000,
    Number(options.intervalMs || process.env.QA_WORKER_HEARTBEAT_INTERVAL_MS) || DEFAULT_WORKER_HEARTBEAT_INTERVAL_MS
  );
  const staleAfterMs = Math.max(
    intervalMs * 2,
    Number(options.staleAfterMs || process.env.QA_WORKER_HEARTBEAT_STALE_AFTER_MS) || DEFAULT_WORKER_HEARTBEAT_STALE_AFTER_MS
  );
  const offlineAfterMs = Math.max(
    staleAfterMs + 1000,
    Number(options.offlineAfterMs || process.env.QA_WORKER_HEARTBEAT_OFFLINE_AFTER_MS) ||
      DEFAULT_WORKER_HEARTBEAT_OFFLINE_AFTER_MS
  );

  return {
    intervalMs,
    staleAfterMs,
    offlineAfterMs
  };
}

function sanitizeWorkerStatus(value) {
  const status = sanitizeString(value, 64).toLowerCase();
  if (WORKER_STATUSES.has(status)) {
    return status;
  }
  return "idle";
}

function sanitizeWorkerMetadata(value) {
  if (!isPlainObject(value)) {
    return {};
  }

  const metadata = {};
  for (const [key, rawValue] of Object.entries(value)) {
    const safeKey = sanitizeString(key, 128);
    if (!safeKey) {
      continue;
    }

    if (typeof rawValue === "string") {
      metadata[safeKey] = sanitizeString(rawValue, 512);
      continue;
    }
    if (typeof rawValue === "number" || typeof rawValue === "boolean" || rawValue === null) {
      metadata[safeKey] = rawValue;
    }
  }

  return metadata;
}

function toTimestamp(value) {
  const parsed = Date.parse(String(value || "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildHeartbeatStatus(workerStatus, ageMs, thresholds) {
  if (workerStatus === "stopped") {
    return "offline";
  }
  if (workerStatus === "error") {
    return ageMs <= thresholds.offlineAfterMs ? "stale" : "offline";
  }
  if (ageMs <= thresholds.staleAfterMs) {
    return "healthy";
  }
  if (ageMs <= thresholds.offlineAfterMs) {
    return "stale";
  }
  return "offline";
}

function formatAgeLabel(seconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  if (safeSeconds < 60) {
    return `${safeSeconds}s`;
  }

  const minutes = Math.floor(safeSeconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function normalizeQaWorkerRow(row, options = {}) {
  const safeRow = isPlainObject(row) ? row : {};
  const workerId = sanitizeString(safeRow.worker_id || safeRow.workerId, 128);
  if (!workerId) {
    return null;
  }

  const thresholds = getWorkerHeartbeatThresholds(options);
  const nowMs = Number.isFinite(options.nowMs) ? Number(options.nowMs) : Date.now();
  const lastSeenAt = sanitizeOptionalString(safeRow.last_seen_at || safeRow.lastSeenAt, 128) || null;
  const lastSeenMs = toTimestamp(lastSeenAt);
  const ageMs = lastSeenMs > 0 ? Math.max(0, nowMs - lastSeenMs) : Number.POSITIVE_INFINITY;
  const ageSeconds = Number.isFinite(ageMs) ? Math.round(ageMs / 1000) : null;
  const workerStatus = sanitizeWorkerStatus(safeRow.status || safeRow.worker_status || safeRow.workerStatus);
  const heartbeatStatus = buildHeartbeatStatus(workerStatus, ageMs, thresholds);

  return {
    worker_id: workerId,
    worker_status: workerStatus,
    heartbeat_status: heartbeatStatus,
    current_run_id: sanitizeOptionalString(safeRow.current_run_id || safeRow.currentRunId, 128) || null,
    current_phase: sanitizeOptionalString(safeRow.current_phase || safeRow.currentPhase, 128) || null,
    last_seen_at: lastSeenAt,
    heartbeat_age_seconds: ageSeconds,
    heartbeat_age_label: ageSeconds === null ? null : formatAgeLabel(ageSeconds),
    last_job_claimed_at:
      sanitizeOptionalString(safeRow.last_job_claimed_at || safeRow.lastJobClaimedAt, 128) || null,
    last_job_completed_at:
      sanitizeOptionalString(safeRow.last_job_completed_at || safeRow.lastJobCompletedAt, 128) || null,
    created_at: sanitizeOptionalString(safeRow.created_at || safeRow.createdAt, 128) || null,
    updated_at: sanitizeOptionalString(safeRow.updated_at || safeRow.updatedAt, 128) || null,
    metadata: sanitizeWorkerMetadata(safeRow.metadata)
  };
}

function pluralize(value, noun) {
  return `${value} ${noun}${value === 1 ? "" : "s"}`;
}

function buildWorkerHealthSummary(items, options = {}) {
  const normalizedItems = Array.isArray(items) ? items.filter(Boolean) : [];
  const healthy = normalizedItems.filter((item) => item.heartbeat_status === "healthy").length;
  const stale = normalizedItems.filter((item) => item.heartbeat_status === "stale").length;
  const offline = normalizedItems.filter((item) => item.heartbeat_status === "offline").length;
  const active = normalizedItems.filter(
    (item) => item.heartbeat_status !== "offline" && item.worker_status === "processing"
  ).length;
  const latestSeenAt = normalizedItems[0]?.last_seen_at || null;
  const latestAgeSeconds =
    typeof normalizedItems[0]?.heartbeat_age_seconds === "number" ? normalizedItems[0].heartbeat_age_seconds : null;

  let overallStatus = "offline";
  if (healthy > 0 || active > 0) {
    overallStatus = "healthy";
  } else if (stale > 0) {
    overallStatus = "stale";
  }

  let label = "No workers detected";
  if (active > 0) {
    label = `${pluralize(active, "worker")} active`;
  } else if (healthy > 0) {
    label = `${pluralize(healthy, "worker")} healthy`;
  } else if (stale > 0) {
    label = stale === 1 ? "Worker stale" : "Workers stale";
  } else if (offline > 0) {
    label = offline === 1 ? "Worker offline" : "Workers offline";
  }

  const detailSegments = [];
  if (latestAgeSeconds !== null) {
    detailSegments.push(`Last heartbeat ${formatAgeLabel(latestAgeSeconds)} ago`);
  } else {
    detailSegments.push("No worker heartbeat has been recorded yet");
  }
  if (healthy > 0) {
    detailSegments.push(`${healthy} healthy`);
  }
  if (active > 0) {
    detailSegments.push(`${active} processing`);
  }
  if (stale > 0) {
    detailSegments.push(`${stale} stale`);
  }
  if (offline > 0) {
    detailSegments.push(`${offline} offline`);
  }

  return {
    total: normalizedItems.length,
    healthy,
    stale,
    offline,
    active,
    latest_seen_at: latestSeenAt,
    latest_heartbeat_age_seconds: latestAgeSeconds,
    overall_status: overallStatus,
    label,
    detail: detailSegments.join(". ").replace(/\. ([0-9]+ (healthy|processing|stale|offline))/g, " · $1")
  };
}

async function upsertQaWorkerHeartbeat(heartbeat, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const workerId = sanitizeString(heartbeat?.worker_id || heartbeat?.workerId, 128);
  if (!workerId) {
    return { ok: false, status: 400, error: "worker_id is required" };
  }

  const row = {
    worker_id: workerId,
    status: sanitizeWorkerStatus(heartbeat?.status || heartbeat?.worker_status || heartbeat?.workerStatus),
    current_run_id: sanitizeOptionalString(heartbeat?.current_run_id || heartbeat?.currentRunId, 128) || null,
    current_phase: sanitizeOptionalString(heartbeat?.current_phase || heartbeat?.currentPhase, 128) || null,
    last_seen_at:
      sanitizeOptionalString(heartbeat?.last_seen_at || heartbeat?.lastSeenAt, 128) || new Date().toISOString(),
    last_job_claimed_at:
      sanitizeOptionalString(heartbeat?.last_job_claimed_at || heartbeat?.lastJobClaimedAt, 128) || null,
    last_job_completed_at:
      sanitizeOptionalString(heartbeat?.last_job_completed_at || heartbeat?.lastJobCompletedAt, 128) || null,
    metadata: sanitizeWorkerMetadata(heartbeat?.metadata)
  };

  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_workers`);
  requestUrl.searchParams.set("on_conflict", "worker_id");

  const response = await access.fetchImpl(requestUrl.toString(), {
    method: "POST",
    headers: buildSupabaseHeaders(access.serviceKey, "resolution=merge-duplicates,return=representation"),
    body: JSON.stringify([row])
  });

  let rows = null;
  try {
    rows = await response.json();
  } catch {
    rows = null;
  }

  if (!response.ok || !Array.isArray(rows)) {
    return {
      ok: false,
      status: response.status || 500,
      error: sanitizeString(rows?.message || rows?.error || rows?.hint, 256) || "Failed to store worker heartbeat"
    };
  }

  const item = normalizeQaWorkerRow(rows[0], options);
  return {
    ok: true,
    status: 200,
    item
  };
}

async function listQaWorkers(options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }

  const limit = Math.max(1, Math.min(100, Number(options.limit) || DEFAULT_WORKER_LIST_LIMIT));
  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_workers`);
  requestUrl.searchParams.set(
    "select",
    "worker_id,status,current_run_id,current_phase,last_seen_at,last_job_claimed_at,last_job_completed_at,metadata,created_at,updated_at"
  );
  requestUrl.searchParams.set("order", "last_seen_at.desc,updated_at.desc");
  requestUrl.searchParams.set("limit", String(limit));

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
    return {
      ok: false,
      status: response.status || 500,
      error: sanitizeString(rows?.message || rows?.error || rows?.hint, 256) || "Failed to load worker heartbeats"
    };
  }

  const items = rows
    .map((row) => normalizeQaWorkerRow(row, options))
    .filter(Boolean)
    .sort((left, right) => {
      return (
        toTimestamp(right.last_seen_at || right.updated_at || right.created_at) -
          toTimestamp(left.last_seen_at || left.updated_at || left.created_at) ||
        String(left.worker_id || "").localeCompare(String(right.worker_id || ""))
      );
    });

  return {
    ok: true,
    status: 200,
    checked_at: new Date(Number.isFinite(options.nowMs) ? Number(options.nowMs) : Date.now()).toISOString(),
    summary: buildWorkerHealthSummary(items, options),
    items
  };
}

module.exports = {
  DEFAULT_WORKER_HEARTBEAT_INTERVAL_MS,
  DEFAULT_WORKER_HEARTBEAT_STALE_AFTER_MS,
  DEFAULT_WORKER_HEARTBEAT_OFFLINE_AFTER_MS,
  getWorkerHeartbeatThresholds,
  sanitizeWorkerStatus,
  sanitizeWorkerMetadata,
  normalizeQaWorkerRow,
  buildWorkerHealthSummary,
  upsertQaWorkerHeartbeat,
  listQaWorkers
};
