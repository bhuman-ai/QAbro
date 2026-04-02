const {
  getPublicBaseUrl,
  parseRequestBody,
  sanitizeString
} = require("../../../lib/qa-core");
const { requireDashboardOrServiceAuth } = require("../../../lib/auth");
const { enqueueQaRun } = require("../../../lib/qa-queue");
const {
  buildScheduledRunId,
  buildScheduleNextRunAt,
  getQaScheduleById,
  listDueQaSchedules,
  markQaScheduleDispatched
} = require("../../../lib/qa-schedules");

function isCronAuthorized(req) {
  const configuredSecret = sanitizeString(process.env.QA_SCHEDULE_CRON_SECRET, 512);
  const providedSecret = sanitizeString(
    req?.headers?.authorization?.toLowerCase().startsWith("bearer ")
      ? String(req.headers.authorization).slice(7)
      : req?.headers?.["x-qa-schedule-secret"],
    512
  );
  if (configuredSecret && providedSecret && configuredSecret === providedSecret) {
    return true;
  }
  return Boolean(req?.headers?.["x-vercel-cron"]);
}

function buildScheduleRunRequest(schedule) {
  const now = new Date().toISOString();
  const runId = buildScheduledRunId(schedule);
  const mission = sanitizeString(schedule?.mission, 1000);
  return {
    run_id: runId,
    target_url: schedule.target_url,
    scope_mode: sanitizeString(schedule.scope_mode, 64) || "deep_45m",
    scenario_list: mission ? [mission] : [],
    brand_persona: sanitizeString(schedule.persona, 500),
    source: "qa_schedule",
    metadata: {
      goal: mission || null,
      brand_key: sanitizeString(schedule.brand_key, 256),
      brand_name: sanitizeString(schedule.brand_name, 256) || null,
      owner_user_id: sanitizeString(schedule.owner_user_id, 128),
      owner_email: sanitizeString(schedule.owner_email, 320).toLowerCase() || null,
      qa_schedule_id: sanitizeString(schedule.id, 128),
      qa_schedule_name: sanitizeString(schedule.name, 160),
      qa_scheduled_at: now
    },
    received_at: now
  };
}

function buildUiReportUrl(publicBaseUrl, runRequest) {
  const params = new URLSearchParams();
  params.set("view", "report");
  params.set("run_id", runRequest.run_id);
  if (runRequest?.metadata?.brand_key) {
    params.set("brand", String(runRequest.metadata.brand_key));
  }
  return `${publicBaseUrl}/dashboard?${params.toString()}`;
}

async function enqueueScheduledRun(schedule, req) {
  const publicBaseUrl = getPublicBaseUrl(req);
  const runRequest = buildScheduleRunRequest(schedule);
  const reportUrl = `${publicBaseUrl}/api/qa/report?run_id=${encodeURIComponent(runRequest.run_id)}`;
  const statusUrl = `${publicBaseUrl}/api/qa/status?run_id=${encodeURIComponent(runRequest.run_id)}`;
  const queued = await enqueueQaRun(runRequest, {
    publicBaseUrl,
    reportUrl,
    statusUrl
  });
  if (!queued.ok) {
    return queued;
  }
  const nextRunAt = buildScheduleNextRunAt(new Date().toISOString(), schedule.frequency_hours);
  await markQaScheduleDispatched(schedule.id, {
    run_id: runRequest.run_id,
    frequency_hours: schedule.frequency_hours,
    next_run_at: nextRunAt
  });
  return {
    ok: true,
    run_id: runRequest.run_id,
    report_url: reportUrl,
    status_url: statusUrl,
    ui_report_url: buildUiReportUrl(publicBaseUrl, runRequest),
    queue: queued.queue
  };
}

module.exports = async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  if (req.method === "GET") {
    if (!isCronAuthorized(req)) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    const due = await listDueQaSchedules({ limit: 10 });
    if (!due.ok) {
      return res.status(due.status || 500).json({ ok: false, error: due.error });
    }
    const queued = [];
    const errors = [];
    for (const schedule of due.items) {
      const result = await enqueueScheduledRun(schedule, req);
      if (result.ok) {
        queued.push({
          schedule_id: schedule.id,
          run_id: result.run_id,
          ui_report_url: result.ui_report_url
        });
      } else {
        errors.push({
          schedule_id: schedule.id,
          error: result.error || "Failed to enqueue scheduled run"
        });
      }
    }
    return res.status(200).json({
      ok: true,
      processed: due.items.length,
      queued,
      errors
    });
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

  const scheduleId = sanitizeString(body?.schedule_id || body?.scheduleId, 128);
  if (!scheduleId) {
    return res.status(400).json({ ok: false, error: "schedule_id is required" });
  }

  const scheduleResult = await getQaScheduleById(scheduleId);
  if (!scheduleResult.ok || !scheduleResult.item) {
    return res.status(scheduleResult.status || 404).json({ ok: false, error: scheduleResult.error || "Schedule not found" });
  }
  const schedule = scheduleResult.item;
  if (sanitizeString(auth.user?.id, 128) !== sanitizeString(schedule.owner_user_id, 128)) {
    return res.status(403).json({ ok: false, error: "You do not have access to this schedule" });
  }

  const queued = await enqueueScheduledRun(schedule, req);
  if (!queued.ok) {
    return res.status(queued.status || 500).json({ ok: false, error: queued.error || "Failed to queue scheduled run" });
  }

  return res.status(202).json({
    ok: true,
    queued: true,
    schedule_id: schedule.id,
    run_id: queued.run_id,
    report_url: queued.report_url,
    status_url: queued.status_url,
    ui_report_url: queued.ui_report_url
  });
};
