(function initSwarmDashboardReportRuntime(globalScope) {
  function fallbackIsQueueActiveStatus(value) {
    const status = String(value || "").trim().toLowerCase();
    return status === "queued" || status === "processing" || status === "retryable";
  }

  function fallbackIsRepoTriageActiveStatus(value) {
    const status = String(value || "").trim().toLowerCase();
    return status === "queued" || status === "processing";
  }

  function normalizeRunId(value) {
    return String(value || "").trim();
  }

  function getLiveStatus(liveStatusCache, runId) {
    const safeRunId = normalizeRunId(runId);
    if (!safeRunId || !(liveStatusCache instanceof Map)) {
      return null;
    }
    return liveStatusCache.get(safeRunId) || null;
  }

  function getCachedReport(reportCache, runId) {
    const safeRunId = normalizeRunId(runId);
    if (!safeRunId || !(reportCache instanceof Map)) {
      return null;
    }
    return reportCache.get(safeRunId) || null;
  }

  function resolveSelectedRunRow(config = {}, helpers = {}) {
    const runId = normalizeRunId(config.runId || config.selectedRunId || config.requestedRunId);
    if (!runId) {
      return null;
    }

    const runs = Array.isArray(config.runs) ? config.runs : [];
    const allRuns = Array.isArray(config.allRuns) ? config.allRuns : [];
    const getPinnedRunRow = typeof helpers.getPinnedRunRow === "function" ? helpers.getPinnedRunRow : () => null;

    return (
      runs.find((item) => item?.run_id === runId) ||
      allRuns.find((item) => item?.run_id === runId) ||
      getPinnedRunRow(runId) ||
      null
    );
  }

  function resolveActiveReportContext(config = {}, helpers = {}) {
    const report = config.activeRenderedReport && typeof config.activeRenderedReport === "object" ? config.activeRenderedReport : null;
    const row = config.activeRenderedRow && typeof config.activeRenderedRow === "object" ? config.activeRenderedRow : null;
    if (report) {
      return { report, row };
    }

    const selectedRunId = normalizeRunId(config.selectedRunId || config.requestedRunId);
    if (!selectedRunId) {
      return { report: null, row: row || null };
    }

    const cached = getCachedReport(config.reportCache, selectedRunId);
    const cachedReport = cached && typeof cached === "object" ? cached.report || null : null;
    const cachedRow = resolveSelectedRunRow({ ...config, runId: selectedRunId }, helpers);
    return { report: cachedReport, row: cachedRow };
  }

  function shouldPollSelectedRun(config = {}, helpers = {}) {
    const runId = normalizeRunId(config.selectedRunId || config.requestedRunId);
    if (!runId) {
      return { runId: "", row: null, cachedStatus: null, shouldPoll: false };
    }

    const row = resolveSelectedRunRow({ ...config, runId }, helpers);
    const cachedStatus = getLiveStatus(config.liveStatusCache, runId);
    const isQueueActiveStatus =
      typeof helpers.isQueueActiveStatus === "function" ? helpers.isQueueActiveStatus : fallbackIsQueueActiveStatus;
    const isRepoTriageActiveStatus =
      typeof helpers.isRepoTriageActiveStatus === "function"
        ? helpers.isRepoTriageActiveStatus
        : fallbackIsRepoTriageActiveStatus;
    const rowStatus = String(row?.queue_status || row?.status || "").toLowerCase();
    const cachedQueueStatus = String(cachedStatus?.queue?.queue_status || cachedStatus?.queue?.status || "").toLowerCase();
    const rowRepoTriageStatus = String(row?.repo_triage_status || row?.repo_triage?.status || "").toLowerCase();
    const cachedRepoTriageStatus = String(cachedStatus?.repo_triage?.status || "").toLowerCase();
    const shouldPoll =
      isQueueActiveStatus(rowStatus) ||
      isQueueActiveStatus(cachedQueueStatus) ||
      isRepoTriageActiveStatus(rowRepoTriageStatus) ||
      isRepoTriageActiveStatus(cachedRepoTriageStatus) ||
      (!row && !cachedStatus?.report_ready);

    return { runId, row, cachedStatus, shouldPoll };
  }

  function applyLiveStatusToRunCollection(config = {}) {
    const runId = normalizeRunId(config.runId);
    const statusPayload = config.statusPayload && typeof config.statusPayload === "object" ? config.statusPayload : null;
    const items = Array.isArray(config.runs) ? config.runs.slice() : [];
    if (!runId || !statusPayload) {
      return items;
    }

    const queueStatus = String(statusPayload?.queue?.queue_status || statusPayload?.queue?.status || "").toLowerCase();
    const rowIndex = items.findIndex((item) => item?.run_id === runId);
    if (rowIndex < 0) {
      return items;
    }

    const draftFindingsCount = Array.isArray(statusPayload?.live_report?.findings)
      ? statusPayload.live_report.findings.length
      : items[rowIndex].findings_count;
    items[rowIndex] = {
      ...items[rowIndex],
      status: queueStatus || items[rowIndex].status,
      queue_status: queueStatus || items[rowIndex].queue_status,
      findings_count: draftFindingsCount,
      repo_triage_status: String(statusPayload?.repo_triage?.status || items[rowIndex].repo_triage_status || "").toLowerCase(),
      repo_triage_summary: statusPayload?.repo_triage?.summary || items[rowIndex].repo_triage_summary || null,
      repo_triage: statusPayload?.repo_triage || items[rowIndex].repo_triage || null
    };
    return items;
  }

  async function resolveSelectedReportRuntime(config = {}, helpers = {}) {
    const runId = normalizeRunId(config.selectedRunId || config.requestedRunId);
    if (!runId) {
      return { runId: "", row: null, statusPayload: null, report: null, queueStatus: "" };
    }

    const row = resolveSelectedRunRow({ ...config, runId }, helpers) || null;
    const rowStatus = String(row?.queue_status || row?.status || "").toLowerCase();
    const isQueueActiveStatus =
      typeof helpers.isQueueActiveStatus === "function" ? helpers.isQueueActiveStatus : fallbackIsQueueActiveStatus;
    const isRepoTriageActiveStatus =
      typeof helpers.isRepoTriageActiveStatus === "function"
        ? helpers.isRepoTriageActiveStatus
        : fallbackIsRepoTriageActiveStatus;
    const rowRepoTriageStatus = String(row?.repo_triage_status || row?.repo_triage?.status || "").toLowerCase();
    let statusPayload = getLiveStatus(config.liveStatusCache, runId);
    if (
      !statusPayload &&
      typeof helpers.fetchRunStatus === "function" &&
      (!row || isQueueActiveStatus(rowStatus) || isRepoTriageActiveStatus(rowRepoTriageStatus))
    ) {
      try {
        statusPayload = await helpers.fetchRunStatus(runId);
      } catch {
        statusPayload = null;
      }
    }

    const queueStatus = String(statusPayload?.queue?.queue_status || statusPayload?.queue?.status || rowStatus).toLowerCase();
    const buildLiveFallbackReport =
      typeof helpers.buildLiveFallbackReport === "function" ? helpers.buildLiveFallbackReport : () => null;
    let report = null;

    if (statusPayload && isQueueActiveStatus(queueStatus) && !statusPayload.report_ready) {
      report = buildLiveFallbackReport(runId, row, statusPayload);
    } else if (typeof helpers.fetchReport === "function") {
      const payload = await helpers.fetchReport(runId);
      report = payload?.report || null;
    }

    if (!report || typeof report !== "object") {
      report = buildLiveFallbackReport(runId, row, statusPayload || {
        queue: { queue_status: rowStatus || "queued", status: rowStatus || "queued" },
        progress: null,
        live_report: null,
        artifacts: null
      });
    }

    return {
      runId,
      row,
      statusPayload,
      report,
      queueStatus
    };
  }

  globalScope.SwarmDashboardReportRuntime = {
    getLiveStatus,
    getCachedReport,
    resolveSelectedRunRow,
    resolveActiveReportContext,
    shouldPollSelectedRun,
    applyLiveStatusToRunCollection,
    resolveSelectedReportRuntime
  };
})(window);
