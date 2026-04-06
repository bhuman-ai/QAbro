const {
  extractBrandKey,
  getQaRunStatus,
  normalizeQueueLifecycleStatus,
  readQaShareKey,
  resolveQaReportReadAccess
} = require("../../lib/qa-queue");
const { getPublicBaseUrl, sanitizeRepoTriageState, sanitizeString } = require("../../lib/qa-core");
const { buildLiveStreamArtifacts } = require("../../lib/qa-live-stream");
const { requireDashboardOrServiceAuth } = require("../../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const auth = await requireDashboardOrServiceAuth(req, res, { rejectInvalidServiceToken: false });

  const runId = sanitizeString(req.query?.run_id || req.query?.runId, 128);
  if (!runId) {
    return res.status(400).json({ ok: false, error: "run_id is required" });
  }

  const loaded = await getQaRunStatus(runId, {
    authOk: auth.ok,
    ownerUserId: sanitizeString(auth.user?.id, 128),
    shareKey: readQaShareKey(req),
    request: req
  });
  if (!loaded.ok) {
    return res.status(loaded.status || 500).json({ ok: false, error: loaded.error });
  }

  const access = resolveQaReportReadAccess(loaded.row, {
    authOk: auth.ok,
    ownerUserId: sanitizeString(auth.user?.id, 128),
    shareKey: readQaShareKey(req),
    request: req
  });
  if (!access.ok) {
    return res.status(access.status || 401).json({ ok: false, error: access.error || "Authentication required" });
  }

  const payload = loaded.row && loaded.row.payload && typeof loaded.row.payload === "object"
    ? loaded.row.payload
    : {};
  const publicBaseUrl = getPublicBaseUrl(req);
  const brand = sanitizeString(extractBrandKey(loaded.row), 256);
  const liveReport = payload.report_json && typeof payload.report_json === "object" ? payload.report_json : null;
  const liveReportEvidence =
    liveReport && liveReport.evidence_gallery && typeof liveReport.evidence_gallery === "object"
      ? liveReport.evidence_gallery
      : null;
  const liveLatestFrameUrl = Array.isArray(liveReportEvidence?.screenshots)
    ? liveReportEvidence.screenshots
        .map((item) => sanitizeString(item, 2000000))
        .filter(Boolean)
        .slice(-1)[0] || null
    : null;
  const liveProgress = payload.progress && typeof payload.progress === "object" ? payload.progress : null;
  const storedArtifacts = payload.artifacts && typeof payload.artifacts === "object" ? payload.artifacts : {};
  const mergedLiveArtifacts = {
    ...storedArtifacts,
    ...buildLiveStreamArtifacts(storedArtifacts)
  };
  const hasMergedArtifacts = Object.keys(mergedLiveArtifacts).length > 0;
  const queueStatus = normalizeQueueLifecycleStatus(
    sanitizeString(loaded.queue?.queue_status || loaded.queue?.status, 64)
  );
  const reportReady = Boolean(payload.report_json) && !["queued", "processing", "retryable"].includes(queueStatus);
  const repoTriage =
    access.access_type === "owner"
      ? sanitizeRepoTriageState(
          payload.repo_triage,
          payload.report_json?.metadata?.repo_triage || payload.run_request?.metadata?.repo_triage
        )
      : null;
  const runLog = Array.isArray(payload.run_log) ? payload.run_log.slice(-40) : [];
  const uiParams = new URLSearchParams({ view: "report", run_id: runId });
  if (brand) {
    uiParams.set("brand", brand);
  }
  const shareKey = readQaShareKey(req);
  if (shareKey) {
    uiParams.set("share_key", shareKey);
  }

  return res.status(200).json({
    ok: true,
    run_id: runId,
    queue: loaded.queue,
    report_ready: reportReady,
    report_url: loaded.queue?.report_url || null,
    status_url: loaded.queue?.status_url || null,
    report_status: payload.report_json?.status || sanitizeString(loaded.row?.status, 64) || null,
    repo_triage: repoTriage,
    progress: liveProgress,
    artifacts: hasMergedArtifacts
      ? {
          live_stream_enabled: mergedLiveArtifacts.live_stream_enabled === true,
          live_stream_mode: sanitizeString(mergedLiveArtifacts.live_stream_mode, 64) || null,
          live_stream_public_base_url: sanitizeString(mergedLiveArtifacts.live_stream_public_base_url, 4096) || null,
          live_stream_view_only: mergedLiveArtifacts.live_stream_view_only !== false,
          live_stream_embed_url: sanitizeString(mergedLiveArtifacts.live_stream_embed_url, 4096) || null,
          live_stream_viewer_url: sanitizeString(mergedLiveArtifacts.live_stream_viewer_url, 4096) || null,
          local_matrix_dir: sanitizeString(mergedLiveArtifacts.local_matrix_dir, 4096) || null,
          local_trace_path: sanitizeString(mergedLiveArtifacts.local_trace_path, 4096) || null,
          local_video_path: sanitizeString(mergedLiveArtifacts.local_video_path, 4096) || null,
          started_at: sanitizeString(mergedLiveArtifacts.started_at, 128) || null,
          finished_at: sanitizeString(mergedLiveArtifacts.finished_at, 128) || null,
          viewport_width: Number.isFinite(Number(mergedLiveArtifacts.viewport_width))
            ? Math.max(0, Math.round(Number(mergedLiveArtifacts.viewport_width)))
            : null,
          viewport_height: Number.isFinite(Number(mergedLiveArtifacts.viewport_height))
            ? Math.max(0, Math.round(Number(mergedLiveArtifacts.viewport_height)))
            : null,
          local_screenshots: Array.isArray(mergedLiveArtifacts.local_screenshots)
            ? mergedLiveArtifacts.local_screenshots
                .map((item) => sanitizeString(item, 4096))
                .filter(Boolean)
                .slice(-60)
            : []
        }
      : null,
    run_log: runLog,
    live_report: liveReport
      ? {
          status: sanitizeString(liveReport.status, 64) || null,
          summary: liveReport.summary || null,
          findings: Array.isArray(liveReport.findings) ? liveReport.findings.slice(0, 30) : [],
          tested_journeys: Array.isArray(liveReport.tested_journeys) ? liveReport.tested_journeys.slice(0, 12) : [],
          latest_frame_url: liveLatestFrameUrl
        }
      : null,
    ui_report_url: `${publicBaseUrl}/dashboard?${uiParams.toString()}`
  });
};
