const {
  isPlainObject,
  normalizeUrl,
  sanitizeOptionalString,
  sanitizeString,
  toIsoTimestamp
} = require("./qa-core");
const { normalizeAlertEmailList } = require("./qa-alert-email");

const DEFAULT_FREQUENCY_HOURS = 24;
const MAX_FREQUENCY_HOURS = 24 * 30;
const DEFAULT_SCOPE_MODE = "deep_45m";
const DEFAULT_PERSONA = "General non-developer business user with moderate technical comfort.";
const DEFAULT_MISSION = "Sign up or sign in as needed, enter the product, and finish one meaningful task.";
const ALERT_SEVERITY_ORDER = new Map([
  ["critical", 4],
  ["high", 3],
  ["medium", 2],
  ["low", 1]
]);
const ALERT_STATUSES = new Set(["open", "acknowledged", "resolved"]);

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

function sanitizeBrandKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 256);
}

function normalizeMetadata(value) {
  if (!isPlainObject(value)) {
    return {};
  }
  const next = {};
  for (const [key, rawValue] of Object.entries(value)) {
    const safeKey = sanitizeString(key, 120);
    if (!safeKey) {
      continue;
    }
    if (typeof rawValue === "string") {
      next[safeKey] = sanitizeOptionalString(rawValue, 1000) || "";
      continue;
    }
    if (typeof rawValue === "number" || typeof rawValue === "boolean" || rawValue === null) {
      next[safeKey] = rawValue;
    }
  }
  return next;
}

function normalizeFrequencyHours(value) {
  const hours = Math.round(Number(value) || DEFAULT_FREQUENCY_HOURS);
  if (!Number.isFinite(hours) || hours < 1) {
    return DEFAULT_FREQUENCY_HOURS;
  }
  return Math.min(MAX_FREQUENCY_HOURS, hours);
}

function normalizeScheduleName(value, brandName, brandKey) {
  const explicit = sanitizeOptionalString(value, 160);
  if (explicit) {
    return explicit;
  }
  const label = sanitizeOptionalString(brandName, 160) || sanitizeOptionalString(brandKey, 160) || "Project";
  return `${label} regular QA`;
}

function normalizeScheduleRow(row) {
  const safeRow = isPlainObject(row) ? row : {};
  const brandKey = sanitizeBrandKey(safeRow.brand_key || safeRow.brandKey);
  if (!brandKey) {
    return null;
  }
  const metadata = normalizeMetadata(safeRow.metadata);
  const alertEmailTo =
    normalizeAlertEmailList(
      safeRow.alert_email_to || safeRow.alertEmailTo || metadata.alert_email_to
    ).join(", ") || null;

  return {
    id: sanitizeOptionalString(safeRow.id, 128) || null,
    owner_user_id: sanitizeOptionalString(safeRow.owner_user_id || safeRow.ownerUserId, 128) || null,
    owner_email: sanitizeOptionalString(safeRow.owner_email || safeRow.ownerEmail, 320).toLowerCase() || null,
    brand_key: brandKey,
    brand_name: sanitizeOptionalString(safeRow.brand_name || safeRow.brandName, 256) || null,
    target_url: normalizeUrl(safeRow.target_url || safeRow.targetUrl) || null,
    name: normalizeScheduleName(safeRow.name, safeRow.brand_name || safeRow.brandName, brandKey),
    active: safeRow.active !== false,
    frequency_hours: normalizeFrequencyHours(safeRow.frequency_hours || safeRow.frequencyHours),
    scope_mode: sanitizeOptionalString(safeRow.scope_mode || safeRow.scopeMode, 64) || DEFAULT_SCOPE_MODE,
    persona: sanitizeOptionalString(safeRow.persona, 500) || DEFAULT_PERSONA,
    mission: sanitizeOptionalString(safeRow.mission, 1000) || DEFAULT_MISSION,
    alert_email_to: alertEmailTo,
    alert_webhook_url: normalizeUrl(safeRow.alert_webhook_url || safeRow.alertWebhookUrl) || null,
    alert_on_partial: safeRow.alert_on_partial !== false,
    alert_on_failed: safeRow.alert_on_failed !== false,
    alert_on_high_findings: safeRow.alert_on_high_findings !== false,
    last_run_id: sanitizeOptionalString(safeRow.last_run_id || safeRow.lastRunId, 128) || null,
    last_run_at: sanitizeOptionalString(safeRow.last_run_at || safeRow.lastRunAt, 128) || null,
    last_report_status: sanitizeOptionalString(safeRow.last_report_status || safeRow.lastReportStatus, 64) || null,
    last_alert_at: sanitizeOptionalString(safeRow.last_alert_at || safeRow.lastAlertAt, 128) || null,
    next_run_at: sanitizeOptionalString(safeRow.next_run_at || safeRow.nextRunAt, 128) || null,
    metadata,
    created_at: sanitizeOptionalString(safeRow.created_at || safeRow.createdAt, 128) || null,
    updated_at: sanitizeOptionalString(safeRow.updated_at || safeRow.updatedAt, 128) || null
  };
}

function normalizeAlertRow(row) {
  const safeRow = isPlainObject(row) ? row : {};
  const brandKey = sanitizeBrandKey(safeRow.brand_key || safeRow.brandKey);
  if (!brandKey) {
    return null;
  }
  const status = sanitizeOptionalString(safeRow.status, 32).toLowerCase();
  return {
    id: sanitizeOptionalString(safeRow.id, 128) || null,
    owner_user_id: sanitizeOptionalString(safeRow.owner_user_id || safeRow.ownerUserId, 128) || null,
    owner_email: sanitizeOptionalString(safeRow.owner_email || safeRow.ownerEmail, 320).toLowerCase() || null,
    schedule_id: sanitizeOptionalString(safeRow.schedule_id || safeRow.scheduleId, 128) || null,
    run_id: sanitizeOptionalString(safeRow.run_id || safeRow.runId, 128) || null,
    brand_key: brandKey,
    severity: normalizeAlertSeverity(safeRow.severity),
    status: ALERT_STATUSES.has(status) ? status : "open",
    title: sanitizeOptionalString(safeRow.title, 180) || "Scheduled QA found a problem",
    message: sanitizeOptionalString(safeRow.message, 1200) || "A scheduled QA run needs attention.",
    report_url: normalizeUrl(safeRow.report_url || safeRow.reportUrl) || null,
    ui_report_url: normalizeUrl(safeRow.ui_report_url || safeRow.uiReportUrl) || null,
    payload: normalizeMetadata(safeRow.payload),
    created_at: sanitizeOptionalString(safeRow.created_at || safeRow.createdAt, 128) || null,
    updated_at: sanitizeOptionalString(safeRow.updated_at || safeRow.updatedAt, 128) || null
  };
}

function normalizeAlertSeverity(value) {
  const severity = sanitizeOptionalString(value, 32).toLowerCase();
  return ALERT_SEVERITY_ORDER.has(severity) ? severity : "high";
}

function buildScheduleNextRunAt(baseValue, frequencyHours) {
  const baseTimestamp = Date.parse(sanitizeOptionalString(baseValue, 128) || "") || Date.now();
  return new Date(baseTimestamp + normalizeFrequencyHours(frequencyHours) * 60 * 60 * 1000).toISOString();
}

function buildScheduledRunId(schedule) {
  const slug = sanitizeBrandKey(schedule?.brand_key || schedule?.brandKey || "scheduled").replace(/[^a-z0-9]+/g, "_");
  return `scheduled_${slug || "run"}_${Date.now()}`;
}

function summarizeScheduledAlert(report = {}, row = {}, schedule = {}) {
  const safeReport = isPlainObject(report) ? report : {};
  const findings = Array.isArray(safeReport.findings) ? safeReport.findings : [];
  const normalizedStatus = (sanitizeOptionalString(safeReport.status || row.status, 64) || "").toLowerCase();
  const problemFindings = findings
    .filter((finding) => isPlainObject(finding))
    .map((finding) => ({
      severity: normalizeAlertSeverity(finding.severity),
      title: sanitizeOptionalString(finding.title, 180),
      observed: sanitizeOptionalString(finding.observed_behavior || finding.summary, 800),
      type: (sanitizeOptionalString(finding.type, 64) || "").toLowerCase()
    }))
    .sort((left, right) => {
      const severityDelta = (ALERT_SEVERITY_ORDER.get(right.severity) || 0) - (ALERT_SEVERITY_ORDER.get(left.severity) || 0);
      if (severityDelta !== 0) {
        return severityDelta;
      }
      const rightIsBlocker = right.type === "dead_end" ? 1 : 0;
      const leftIsBlocker = left.type === "dead_end" ? 1 : 0;
      return rightIsBlocker - leftIsBlocker;
    });

  const topFinding = problemFindings[0] || null;
  const summaryNote =
    sanitizeOptionalString(safeReport?.summary?.note, 1000) ||
    sanitizeOptionalString(row?.summary, 1000) ||
    "";
  const base = {
    shouldAlert: false,
    severity: "high",
    title: "",
    message: "",
    reason: ""
  };

  if (normalizedStatus === "failed" && schedule.alert_on_failed !== false) {
    return {
      shouldAlert: true,
      severity: topFinding?.severity || "critical",
      title: topFinding?.title || "Scheduled QA failed before it could finish",
      message:
        topFinding?.observed ||
        summaryNote ||
        "The scheduled QA run failed before it could complete the requested flow.",
      reason: "failed"
    };
  }

  if (normalizedStatus === "partial" && schedule.alert_on_partial !== false) {
    return {
      shouldAlert: true,
      severity: topFinding?.severity || "high",
      title: topFinding?.title || "Scheduled QA got stuck",
      message:
        topFinding?.observed ||
        summaryNote ||
        "The scheduled QA run got partway through the flow and then hit a blocker.",
      reason: "partial"
    };
  }

  if (topFinding && schedule.alert_on_high_findings !== false) {
    const severityRank = ALERT_SEVERITY_ORDER.get(topFinding.severity) || 0;
    if (severityRank >= ALERT_SEVERITY_ORDER.get("high")) {
      return {
        shouldAlert: true,
        severity: topFinding.severity,
        title: topFinding.title || "Scheduled QA found a blocker",
        message:
          topFinding.observed ||
          summaryNote ||
          "The scheduled QA run completed but found a serious issue.",
        reason: "high_finding"
      };
    }
  }

  return base;
}

function sanitizeOwner(owner = {}) {
  return {
    owner_user_id: sanitizeOptionalString(owner.owner_user_id || owner.ownerUserId, 128),
    owner_email: sanitizeOptionalString(owner.owner_email || owner.ownerEmail, 320).toLowerCase()
  };
}

function normalizeSchedulePayload(schedule, owner = {}, options = {}) {
  const safeSchedule = isPlainObject(schedule) ? schedule : {};
  const safeOwner = sanitizeOwner(owner);
  if (!safeOwner.owner_user_id) {
    return null;
  }
  const brandKey = sanitizeBrandKey(safeSchedule.brand_key || safeSchedule.brandKey);
  const targetUrl = normalizeUrl(safeSchedule.target_url || safeSchedule.targetUrl);
  if (!brandKey || !targetUrl) {
    return null;
  }
  const nowIso = options.nowIso || new Date().toISOString();
  const active = safeSchedule.active !== false;
  const frequencyHours = normalizeFrequencyHours(safeSchedule.frequency_hours || safeSchedule.frequencyHours);
  const nextRunAtInput = sanitizeOptionalString(safeSchedule.next_run_at || safeSchedule.nextRunAt, 128);
  const nextRunAt = nextRunAtInput || (active ? nowIso : buildScheduleNextRunAt(nowIso, frequencyHours));
  const metadata = normalizeMetadata(safeSchedule.metadata);
  const alertEmailTo =
    normalizeAlertEmailList(
      safeSchedule.alert_email_to || safeSchedule.alertEmailTo || metadata.alert_email_to
    ).join(", ") || null;
  if (alertEmailTo) {
    metadata.alert_email_to = alertEmailTo;
  } else {
    delete metadata.alert_email_to;
  }
  return {
    ...(sanitizeOptionalString(safeSchedule.id, 128) ? { id: sanitizeOptionalString(safeSchedule.id, 128) } : {}),
    owner_user_id: safeOwner.owner_user_id,
    owner_email: safeOwner.owner_email || null,
    brand_key: brandKey,
    brand_name: sanitizeOptionalString(safeSchedule.brand_name || safeSchedule.brandName, 256) || null,
    target_url: targetUrl,
    name: normalizeScheduleName(safeSchedule.name, safeSchedule.brand_name || safeSchedule.brandName, brandKey),
    active,
    frequency_hours: frequencyHours,
    scope_mode: sanitizeOptionalString(safeSchedule.scope_mode || safeSchedule.scopeMode, 64) || DEFAULT_SCOPE_MODE,
    persona: sanitizeOptionalString(safeSchedule.persona, 500) || DEFAULT_PERSONA,
    mission: sanitizeOptionalString(safeSchedule.mission, 1000) || DEFAULT_MISSION,
    alert_webhook_url: normalizeUrl(safeSchedule.alert_webhook_url || safeSchedule.alertWebhookUrl) || null,
    alert_on_partial: safeSchedule.alert_on_partial !== false,
    alert_on_failed: safeSchedule.alert_on_failed !== false,
    alert_on_high_findings: safeSchedule.alert_on_high_findings !== false,
    next_run_at: nextRunAt,
    metadata,
    updated_at: nowIso
  };
}

async function listQaSchedules(filters = {}, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }
  const ownerUserId = sanitizeOptionalString(filters.owner_user_id || filters.ownerUserId, 128);
  if (!ownerUserId) {
    return { ok: false, status: 400, error: "owner_user_id is required" };
  }

  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_qa_schedules`);
  requestUrl.searchParams.set(
    "select",
    "id,owner_user_id,owner_email,brand_key,brand_name,target_url,name,active,frequency_hours,scope_mode,persona,mission,alert_webhook_url,alert_on_partial,alert_on_failed,alert_on_high_findings,last_run_id,last_run_at,last_report_status,last_alert_at,next_run_at,metadata,created_at,updated_at"
  );
  requestUrl.searchParams.set("owner_user_id", `eq.${ownerUserId}`);
  const brandKey = sanitizeBrandKey(filters.brand_key || filters.brandKey);
  if (brandKey) {
    requestUrl.searchParams.set("brand_key", `eq.${brandKey}`);
  }
  requestUrl.searchParams.set("order", "updated_at.desc");

  const response = await access.fetchImpl(requestUrl.toString(), {
    headers: buildSupabaseHeaders(access.serviceKey, "return=minimal")
  });
  const rows = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(rows)) {
    return {
      ok: false,
      status: response.status || 500,
      error: sanitizeOptionalString(rows?.message || rows?.error || rows?.hint, 256) || "Failed to load schedules"
    };
  }
  return { ok: true, status: 200, items: rows.map(normalizeScheduleRow).filter(Boolean) };
}

async function getQaScheduleById(id, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }
  const scheduleId = sanitizeOptionalString(id, 128);
  if (!scheduleId) {
    return { ok: false, status: 400, error: "schedule id is required" };
  }
  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_qa_schedules`);
  requestUrl.searchParams.set(
    "select",
    "id,owner_user_id,owner_email,brand_key,brand_name,target_url,name,active,frequency_hours,scope_mode,persona,mission,alert_webhook_url,alert_on_partial,alert_on_failed,alert_on_high_findings,last_run_id,last_run_at,last_report_status,last_alert_at,next_run_at,metadata,created_at,updated_at"
  );
  requestUrl.searchParams.set("id", `eq.${scheduleId}`);
  requestUrl.searchParams.set("limit", "1");
  const response = await access.fetchImpl(requestUrl.toString(), {
    headers: buildSupabaseHeaders(access.serviceKey, "return=minimal")
  });
  const rows = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(rows) || !rows[0]) {
    return {
      ok: false,
      status: response.status === 200 ? 404 : response.status || 500,
      error: sanitizeOptionalString(rows?.message || rows?.error || rows?.hint, 256) || "Schedule not found"
    };
  }
  return { ok: true, status: 200, item: normalizeScheduleRow(rows[0]) };
}

async function upsertQaSchedules(schedules, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }
  const owner = sanitizeOwner(options);
  if (!owner.owner_user_id) {
    return { ok: false, status: 400, error: "owner_user_id is required" };
  }
  const payload = (Array.isArray(schedules) ? schedules : [schedules])
    .map((schedule) => normalizeSchedulePayload(schedule, owner, options))
    .filter(Boolean);
  if (!payload.length) {
    return { ok: false, status: 400, error: "At least one valid schedule is required" };
  }

  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_qa_schedules`);
  requestUrl.searchParams.set("on_conflict", "owner_user_id,brand_key");

  const response = await access.fetchImpl(requestUrl.toString(), {
    method: "POST",
    headers: buildSupabaseHeaders(access.serviceKey, "resolution=merge-duplicates,return=representation"),
    body: JSON.stringify(payload)
  });
  const rows = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(rows)) {
    return {
      ok: false,
      status: response.status || 500,
      error: sanitizeOptionalString(rows?.message || rows?.error || rows?.hint, 256) || "Failed to save schedule"
    };
  }

  return { ok: true, status: 200, items: rows.map(normalizeScheduleRow).filter(Boolean) };
}

async function deleteQaSchedule(id, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }
  const owner = sanitizeOwner(options);
  const scheduleId = sanitizeOptionalString(id, 128);
  if (!owner.owner_user_id || !scheduleId) {
    return { ok: false, status: 400, error: "owner_user_id and id are required" };
  }
  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_qa_schedules`);
  requestUrl.searchParams.set("id", `eq.${scheduleId}`);
  requestUrl.searchParams.set("owner_user_id", `eq.${owner.owner_user_id}`);

  const response = await access.fetchImpl(requestUrl.toString(), {
    method: "DELETE",
    headers: buildSupabaseHeaders(access.serviceKey, "return=representation")
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    return {
      ok: false,
      status: response.status || 500,
      error: sanitizeOptionalString(payload?.message || payload?.error || payload?.hint, 256) || "Failed to delete schedule"
    };
  }
  return { ok: true, status: 200 };
}

async function listDueQaSchedules(filters = {}, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }
  const nowIso = toIsoTimestamp(filters.now || filters.nowIso || new Date().toISOString()) || new Date().toISOString();
  const limit = Math.max(1, Math.min(25, Number(filters.limit) || 10));
  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_qa_schedules`);
  requestUrl.searchParams.set(
    "select",
    "id,owner_user_id,owner_email,brand_key,brand_name,target_url,name,active,frequency_hours,scope_mode,persona,mission,alert_webhook_url,alert_on_partial,alert_on_failed,alert_on_high_findings,last_run_id,last_run_at,last_report_status,last_alert_at,next_run_at,metadata,created_at,updated_at"
  );
  requestUrl.searchParams.set("active", "eq.true");
  requestUrl.searchParams.set("next_run_at", `lte.${nowIso}`);
  requestUrl.searchParams.set("order", "next_run_at.asc");
  requestUrl.searchParams.set("limit", String(limit));

  const response = await access.fetchImpl(requestUrl.toString(), {
    headers: buildSupabaseHeaders(access.serviceKey, "return=minimal")
  });
  const rows = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(rows)) {
    return {
      ok: false,
      status: response.status || 500,
      error: sanitizeOptionalString(rows?.message || rows?.error || rows?.hint, 256) || "Failed to load due schedules"
    };
  }
  return { ok: true, status: 200, items: rows.map(normalizeScheduleRow).filter(Boolean) };
}

async function markQaScheduleDispatched(scheduleId, details = {}, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }
  const id = sanitizeOptionalString(scheduleId, 128);
  if (!id) {
    return { ok: false, status: 400, error: "schedule id is required" };
  }
  const nowIso = toIsoTimestamp(details.now || new Date().toISOString()) || new Date().toISOString();
  const frequencyHours = normalizeFrequencyHours(details.frequency_hours || details.frequencyHours);
  const nextRunAt =
    sanitizeOptionalString(details.next_run_at || details.nextRunAt, 128) || buildScheduleNextRunAt(nowIso, frequencyHours);
  const payload = {
    last_run_id: sanitizeOptionalString(details.run_id || details.runId, 128) || null,
    last_run_at: nowIso,
    next_run_at: nextRunAt,
    updated_at: nowIso
  };

  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_qa_schedules`);
  requestUrl.searchParams.set("id", `eq.${id}`);
  const response = await access.fetchImpl(requestUrl.toString(), {
    method: "PATCH",
    headers: buildSupabaseHeaders(access.serviceKey, "return=representation"),
    body: JSON.stringify(payload)
  });
  const rows = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(rows)) {
    return {
      ok: false,
      status: response.status || 500,
      error: sanitizeOptionalString(rows?.message || rows?.error || rows?.hint, 256) || "Failed to update schedule dispatch"
    };
  }
  return { ok: true, status: 200, item: normalizeScheduleRow(rows[0]) };
}

async function markQaScheduleReported(scheduleId, details = {}, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }
  const id = sanitizeOptionalString(scheduleId, 128);
  if (!id) {
    return { ok: false, status: 400, error: "schedule id is required" };
  }
  const nowIso = toIsoTimestamp(details.now || new Date().toISOString()) || new Date().toISOString();
  const payload = {
    last_report_status: sanitizeOptionalString(details.last_report_status || details.lastReportStatus, 64) || null,
    last_alert_at: sanitizeOptionalString(details.last_alert_at || details.lastAlertAt, 128) || null,
    updated_at: nowIso
  };
  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_qa_schedules`);
  requestUrl.searchParams.set("id", `eq.${id}`);
  const response = await access.fetchImpl(requestUrl.toString(), {
    method: "PATCH",
    headers: buildSupabaseHeaders(access.serviceKey, "return=representation"),
    body: JSON.stringify(payload)
  });
  const rows = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(rows)) {
    return {
      ok: false,
      status: response.status || 500,
      error: sanitizeOptionalString(rows?.message || rows?.error || rows?.hint, 256) || "Failed to update schedule report state"
    };
  }
  return { ok: true, status: 200, item: normalizeScheduleRow(rows[0]) };
}

async function listQaAlerts(filters = {}, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }
  const ownerUserId = sanitizeOptionalString(filters.owner_user_id || filters.ownerUserId, 128);
  if (!ownerUserId) {
    return { ok: false, status: 400, error: "owner_user_id is required" };
  }
  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_qa_alerts`);
  requestUrl.searchParams.set(
    "select",
    "id,owner_user_id,owner_email,schedule_id,run_id,brand_key,severity,status,title,message,report_url,ui_report_url,payload,created_at,updated_at"
  );
  requestUrl.searchParams.set("owner_user_id", `eq.${ownerUserId}`);
  const brandKey = sanitizeBrandKey(filters.brand_key || filters.brandKey);
  if (brandKey) {
    requestUrl.searchParams.set("brand_key", `eq.${brandKey}`);
  }
  const status = sanitizeOptionalString(filters.status, 32).toLowerCase();
  if (ALERT_STATUSES.has(status)) {
    requestUrl.searchParams.set("status", `eq.${status}`);
  }
  requestUrl.searchParams.set("order", "created_at.desc");
  requestUrl.searchParams.set("limit", String(Math.max(1, Math.min(100, Number(filters.limit) || 30))));

  const response = await access.fetchImpl(requestUrl.toString(), {
    headers: buildSupabaseHeaders(access.serviceKey, "return=minimal")
  });
  const rows = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(rows)) {
    return {
      ok: false,
      status: response.status || 500,
      error: sanitizeOptionalString(rows?.message || rows?.error || rows?.hint, 256) || "Failed to load alerts"
    };
  }
  return { ok: true, status: 200, items: rows.map(normalizeAlertRow).filter(Boolean) };
}

async function createQaAlert(alert, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }
  const safeAlert = isPlainObject(alert) ? alert : {};
  const owner = sanitizeOwner(options.owner_user_id ? options : safeAlert);
  const runId = sanitizeOptionalString(safeAlert.run_id || safeAlert.runId, 128);
  const scheduleId = sanitizeOptionalString(safeAlert.schedule_id || safeAlert.scheduleId, 128) || null;
  const brandKey = sanitizeBrandKey(safeAlert.brand_key || safeAlert.brandKey);
  if (!owner.owner_user_id || !runId || !brandKey) {
    return { ok: false, status: 400, error: "owner_user_id, run_id, and brand_key are required" };
  }
  const nowIso = options.nowIso || new Date().toISOString();
  const payload = {
    owner_user_id: owner.owner_user_id,
    owner_email: owner.owner_email || null,
    schedule_id: scheduleId,
    run_id: runId,
    brand_key: brandKey,
    severity: normalizeAlertSeverity(safeAlert.severity),
    status: ALERT_STATUSES.has(String(safeAlert.status || "").toLowerCase()) ? String(safeAlert.status).toLowerCase() : "open",
    title: sanitizeOptionalString(safeAlert.title, 180) || "Scheduled QA found a problem",
    message: sanitizeOptionalString(safeAlert.message, 1200) || "A scheduled QA run needs attention.",
    report_url: normalizeUrl(safeAlert.report_url || safeAlert.reportUrl) || null,
    ui_report_url: normalizeUrl(safeAlert.ui_report_url || safeAlert.uiReportUrl) || null,
    payload: normalizeMetadata(safeAlert.payload),
    updated_at: nowIso
  };
  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_qa_alerts`);
  requestUrl.searchParams.set("on_conflict", "schedule_id,run_id");
  const response = await access.fetchImpl(requestUrl.toString(), {
    method: "POST",
    headers: buildSupabaseHeaders(access.serviceKey, "resolution=merge-duplicates,return=representation"),
    body: JSON.stringify([payload])
  });
  const rows = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(rows)) {
    return {
      ok: false,
      status: response.status || 500,
      error: sanitizeOptionalString(rows?.message || rows?.error || rows?.hint, 256) || "Failed to save alert"
    };
  }
  return { ok: true, status: 200, item: normalizeAlertRow(rows[0]) };
}

async function updateQaAlertStatus(id, status, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) {
    return access;
  }
  const alertId = sanitizeOptionalString(id, 128);
  const owner = sanitizeOwner(options);
  const nextStatus = sanitizeOptionalString(status, 32).toLowerCase();
  if (!alertId || !owner.owner_user_id || !ALERT_STATUSES.has(nextStatus)) {
    return { ok: false, status: 400, error: "Valid alert id, owner_user_id, and status are required" };
  }
  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/swarmtest_qa_alerts`);
  requestUrl.searchParams.set("id", `eq.${alertId}`);
  requestUrl.searchParams.set("owner_user_id", `eq.${owner.owner_user_id}`);
  const response = await access.fetchImpl(requestUrl.toString(), {
    method: "PATCH",
    headers: buildSupabaseHeaders(access.serviceKey, "return=representation"),
    body: JSON.stringify({
      status: nextStatus,
      updated_at: new Date().toISOString()
    })
  });
  const rows = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(rows)) {
    return {
      ok: false,
      status: response.status || 500,
      error: sanitizeOptionalString(rows?.message || rows?.error || rows?.hint, 256) || "Failed to update alert"
    };
  }
  return { ok: true, status: 200, item: normalizeAlertRow(rows[0]) };
}

async function sendQaAlertWebhook(url, payload, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl || typeof fetchImpl !== "function") {
    return { ok: false, error: "Webhook is not configured" };
  }
  try {
    const response = await fetchImpl(normalizedUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    return {
      ok: response.ok,
      status: response.status || 0,
      error: response.ok ? null : "Webhook responded with an error"
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: sanitizeOptionalString(error?.message, 256) || "Webhook delivery failed"
    };
  }
}

module.exports = {
  DEFAULT_FREQUENCY_HOURS,
  DEFAULT_PERSONA,
  DEFAULT_MISSION,
  DEFAULT_SCOPE_MODE,
  buildScheduledRunId,
  buildScheduleNextRunAt,
  createQaAlert,
  deleteQaSchedule,
  getQaScheduleById,
  listDueQaSchedules,
  listQaAlerts,
  listQaSchedules,
  markQaScheduleDispatched,
  markQaScheduleReported,
  normalizeAlertRow,
  normalizeFrequencyHours,
  normalizeSchedulePayload,
  normalizeScheduleRow,
  sendQaAlertWebhook,
  summarizeScheduledAlert,
  updateQaAlertStatus,
  upsertQaSchedules
};
