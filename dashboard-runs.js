(function initSwarmDashboardRuns(globalScope) {
  function fallbackNormalizeRunStatus(value) {
    return String(value || "").trim().toLowerCase();
  }

  function fallbackIsQueueActiveStatus(value) {
    const status = fallbackNormalizeRunStatus(value);
    return status === "queued" || status === "processing" || status === "running" || status === "pending";
  }

  function normalizeRunId(value) {
    return String(value || "").trim();
  }

  function buildPersonaOptions(items, helpers = {}) {
    const extractRunPersona =
      typeof helpers.extractRunPersona === "function" ? helpers.extractRunPersona : (row) => String(row?.persona || "").trim();
    const counts = new Map();

    for (const row of Array.isArray(items) ? items : []) {
      const persona = String(extractRunPersona(row) || "").trim();
      if (!persona) {
        continue;
      }
      counts.set(persona, (counts.get(persona) || 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
  }

  function upsertRunCollection(collection, draftRow) {
    if (!draftRow || typeof draftRow !== "object" || !normalizeRunId(draftRow.run_id)) {
      return Array.isArray(collection) ? collection.slice() : [];
    }

    const items = Array.isArray(collection) ? collection.slice() : [];
    const existingIndex = items.findIndex((item) => item && item.run_id === draftRow.run_id);
    if (existingIndex >= 0) {
      items[existingIndex] = {
        ...items[existingIndex],
        ...draftRow
      };
      const [existing] = items.splice(existingIndex, 1);
      items.unshift(existing);
      return items;
    }

    items.unshift(draftRow);
    return items;
  }

  function buildPinnedRunSnapshot(runId, config = {}, helpers = {}) {
    const safeRunId = normalizeRunId(runId);
    if (!safeRunId) {
      return null;
    }

    const optimisticRuns = config.optimisticRuns instanceof Map ? config.optimisticRuns : new Map();
    const allRuns = Array.isArray(config.allRuns) ? config.allRuns : [];
    const runs = Array.isArray(config.runs) ? config.runs : [];
    const candidate = config.candidate && typeof config.candidate === "object" ? config.candidate : null;
    const getLiveStatus = typeof helpers.getLiveStatus === "function" ? helpers.getLiveStatus : () => null;
    const normalizeRunStatus =
      typeof helpers.normalizeRunStatus === "function" ? helpers.normalizeRunStatus : fallbackNormalizeRunStatus;
    const base =
      candidate ||
      optimisticRuns.get(safeRunId) ||
      allRuns.find((item) => item?.run_id === safeRunId) ||
      runs.find((item) => item?.run_id === safeRunId) ||
      null;
    if (!base) {
      return null;
    }

    const liveStatus = getLiveStatus(safeRunId);
    const queueStatus = normalizeRunStatus(
      liveStatus?.queue?.queue_status || liveStatus?.queue?.status || base.queue_status || base.status
    );
    const reportStatus = normalizeRunStatus(
      liveStatus?.report_status || liveStatus?.live_report?.status || base.latest_report_status || base.status
    );
    const liveFindings = Array.isArray(liveStatus?.live_report?.findings) ? liveStatus.live_report.findings.length : null;
    const liveJourneys = Array.isArray(liveStatus?.live_report?.tested_journeys) ? liveStatus.live_report.tested_journeys.length : null;
    const deliveredAt =
      base.delivered_at ||
      liveStatus?.queue?.enqueued_at ||
      liveStatus?.progress?.updated_at ||
      new Date().toISOString();

    return {
      ...base,
      run_id: safeRunId,
      status: queueStatus || reportStatus || base.status,
      latest_report_status: reportStatus || base.latest_report_status || base.status,
      queue_status: queueStatus || base.queue_status || base.status,
      delivered_at: deliveredAt,
      report_ready: liveStatus?.report_ready ?? base.report_ready ?? false,
      findings_count: liveFindings ?? base.findings_count ?? 0,
      journeys_count: liveJourneys ?? base.journeys_count ?? 0,
      summary_note:
        liveStatus?.progress?.message ||
        liveStatus?.live_report?.summary?.note ||
        base.summary_note ||
        "Run queued and waiting for live updates."
    };
  }

  function rememberPinnedRun(config = {}, helpers = {}) {
    const optimisticRuns = config.optimisticRuns instanceof Map ? config.optimisticRuns : null;
    const row = config.row && typeof config.row === "object" ? config.row : null;
    const snapshot = buildPinnedRunSnapshot(row?.run_id, { ...config, candidate: row }, helpers);
    if (!snapshot || !(optimisticRuns instanceof Map)) {
      return null;
    }
    optimisticRuns.set(snapshot.run_id, snapshot);
    return snapshot;
  }

  function shouldKeepPinnedRun(runId, config = {}, helpers = {}) {
    const safeRunId = normalizeRunId(runId);
    if (!safeRunId) {
      return false;
    }

    const candidate = config.candidate && typeof config.candidate === "object" ? config.candidate : null;
    const selectedRunId = normalizeRunId(config.selectedRunId);
    const requestedRunId = normalizeRunId(config.requestedRunId);
    const getLiveStatus = typeof helpers.getLiveStatus === "function" ? helpers.getLiveStatus : () => null;
    const normalizeRunStatus =
      typeof helpers.normalizeRunStatus === "function" ? helpers.normalizeRunStatus : fallbackNormalizeRunStatus;
    const isQueueActiveStatus =
      typeof helpers.isQueueActiveStatus === "function" ? helpers.isQueueActiveStatus : fallbackIsQueueActiveStatus;
    const liveStatus = getLiveStatus(safeRunId);
    const queueStatus = normalizeRunStatus(
      liveStatus?.queue?.queue_status ||
        liveStatus?.queue?.status ||
        candidate?.queue_status ||
        candidate?.status ||
        candidate?.latest_report_status
    );

    if (isQueueActiveStatus(queueStatus)) {
      return true;
    }
    return safeRunId === selectedRunId || safeRunId === requestedRunId;
  }

  function reconcilePinnedRunsWithFetched(config = {}, helpers = {}) {
    const optimisticRuns = config.optimisticRuns instanceof Map ? config.optimisticRuns : null;
    if (!(optimisticRuns instanceof Map)) {
      return;
    }

    const fetchedItems = Array.isArray(config.fetchedItems) ? config.fetchedItems : [];
    const fetchedMap = new Map(
      fetchedItems
        .filter((item) => item && item.run_id)
        .map((item) => [String(item.run_id), item])
    );

    for (const [runId, pinnedRow] of optimisticRuns.entries()) {
      const fetchedRow = fetchedMap.get(runId) || null;
      if (fetchedRow) {
        rememberPinnedRun({ ...config, row: { ...pinnedRow, ...fetchedRow } }, helpers);
      }
      const candidate = fetchedRow || pinnedRow;
      if (!shouldKeepPinnedRun(runId, { ...config, candidate }, helpers)) {
        optimisticRuns.delete(runId);
      }
    }
  }

  function mergePinnedRunsIntoCollection(config = {}, helpers = {}) {
    let items = Array.isArray(config.collection) ? config.collection.slice() : [];
    const optimisticRuns = config.optimisticRuns instanceof Map ? config.optimisticRuns : new Map();

    for (const [runId, pinnedRow] of optimisticRuns.entries()) {
      if (!shouldKeepPinnedRun(runId, { ...config, candidate: pinnedRow }, helpers)) {
        continue;
      }
      const snapshot = buildPinnedRunSnapshot(runId, { ...config, candidate: pinnedRow }, helpers);
      if (!snapshot) {
        continue;
      }
      items = upsertRunCollection(items, snapshot);
    }

    return items;
  }

  function getPinnedRunRow(config = {}, helpers = {}) {
    const safeRunId = normalizeRunId(config.runId);
    if (!safeRunId) {
      return null;
    }

    const optimisticRuns = config.optimisticRuns instanceof Map ? config.optimisticRuns : null;
    const candidate = optimisticRuns instanceof Map ? optimisticRuns.get(safeRunId) : null;
    if (!candidate) {
      return null;
    }

    return buildPinnedRunSnapshot(safeRunId, { ...config, candidate }, helpers);
  }

  function ensureSelectedRunVisibleInRuns(config = {}, helpers = {}) {
    const safeRunId = normalizeRunId(config.selectedRunId || config.requestedRunId);
    const runs = Array.isArray(config.runs) ? config.runs.slice() : [];
    const allRuns = Array.isArray(config.allRuns) ? config.allRuns.slice() : [];

    if (!safeRunId || runs.some((item) => item?.run_id === safeRunId)) {
      return { runs, allRuns };
    }

    const pinnedRow =
      getPinnedRunRow({ ...config, runId: safeRunId }, helpers) ||
      allRuns.find((item) => item?.run_id === safeRunId) ||
      null;
    if (!pinnedRow) {
      return { runs, allRuns };
    }

    return {
      runs: upsertRunCollection(runs, pinnedRow),
      allRuns: upsertRunCollection(allRuns, pinnedRow)
    };
  }

  function ensureActiveRunSelection(config = {}, helpers = {}) {
    let runs = Array.isArray(config.runs) ? config.runs.slice() : [];
    if (!runs.length) {
      return {
        runs,
        selectedRunId: ""
      };
    }

    const selectedRunId = normalizeRunId(config.selectedRunId);
    const requestedRunId = normalizeRunId(config.requestedRunId);
    if (selectedRunId && runs.some((item) => item?.run_id === selectedRunId)) {
      return {
        runs,
        selectedRunId
      };
    }

    const pinnedRow = getPinnedRunRow({ ...config, runId: selectedRunId || requestedRunId }, helpers);
    if (pinnedRow) {
      runs = upsertRunCollection(runs, pinnedRow);
      return {
        runs,
        selectedRunId: normalizeRunId(pinnedRow.run_id)
      };
    }

    return {
      runs,
      selectedRunId: normalizeRunId(runs[0]?.run_id)
    };
  }

  globalScope.SwarmDashboardRuns = {
    buildPersonaOptions,
    upsertRunCollection,
    buildPinnedRunSnapshot,
    rememberPinnedRun,
    shouldKeepPinnedRun,
    reconcilePinnedRunsWithFetched,
    mergePinnedRunsIntoCollection,
    getPinnedRunRow,
    ensureSelectedRunVisibleInRuns,
    ensureActiveRunSelection
  };
})(window);
