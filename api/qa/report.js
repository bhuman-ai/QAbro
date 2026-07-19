const {
  buildMarkdownReport,
  getPublicBaseUrl,
  loadStoredReportByRunId,
  normalizeReport,
  sanitizeString
} = require("../../lib/qa-core");
const {
  extractBrandKey,
  normalizeQueueLifecycleStatus,
  resolveQaReportReadAccess,
  readQaShareKey
} = require("../../lib/qa-queue");
const { buildLiveStreamArtifacts } = require("../../lib/qa-live-stream");
const { requireDashboardOrServiceAuth } = require("../../lib/auth");

const FALLBACK_BRAND_PERSONA =
  "General non-developer business user with moderate technical comfort.";
const FINAL_REPORT_STATUSES = new Set(["completed", "partial", "failed", "failed_validation"]);

function redactEngineeringTriage(report) {
  if (!report || typeof report !== "object") {
    return report;
  }

  const nextReport = {
    ...report
  };
  delete nextReport.engineering_triage;

  if (nextReport.metadata && typeof nextReport.metadata === "object") {
    nextReport.metadata = {
      ...nextReport.metadata
    };
    delete nextReport.metadata.repo_triage;
  }

  return nextReport;
}

function buildStoredReportCandidate(row, payload, mergedArtifacts) {
  const rowStatus = sanitizeString(row?.status, 64).toLowerCase();
  const hasExplicitReportJson = payload.report_json && typeof payload.report_json === "object";
  if (!FINAL_REPORT_STATUSES.has(rowStatus) && !hasExplicitReportJson) {
    return null;
  }

  if (payload.report_json && typeof payload.report_json === "object") {
    return payload.report_json;
  }

  return {
    schema_version: "1.1",
    run_id: row.run_id,
    target: row.target,
    status: row.status,
    report_url: row.report_url,
    source: row.source,
    delivered_at: row.delivered_at,
    summary: payload.summary || row.summary || null,
    findings: Array.isArray(row.findings) ? row.findings : [],
    artifacts: mergedArtifacts,
    metadata: {
      stored_row_id: row.id || null,
      stored_at: row.delivered_at || null
    }
  };
}

function buildStoredRunRequest(row, payload) {
  const rawRunRequest =
    payload.run_request && typeof payload.run_request === "object" ? payload.run_request : {};
  const payloadMetadata =
    payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {};
  const runRequestMetadata =
    rawRunRequest.metadata && typeof rawRunRequest.metadata === "object" ? rawRunRequest.metadata : {};
  const targetUrl =
    sanitizeString(
      rawRunRequest.target_url || payloadMetadata.target_url || payload.target || row.target,
      4096
    ) || "";

  return {
    ...rawRunRequest,
    run_id: sanitizeString(rawRunRequest.run_id || row.run_id, 128) || row.run_id,
    target_url: targetUrl,
    scope_mode:
      sanitizeString(
        rawRunRequest.scope_mode || payloadMetadata.scope_mode || payload.scope_mode,
        64
      ) || "core_20m",
    brand_persona:
      sanitizeString(rawRunRequest.brand_persona || payloadMetadata.brand_persona, 2000) ||
      FALLBACK_BRAND_PERSONA,
    source: sanitizeString(rawRunRequest.source || row.source, 64) || "qa_bot",
    metadata: {
      ...payloadMetadata,
      ...runRequestMetadata
    }
  };
}

function buildFallbackMarkdown(report, runRequest, row) {
  const findings = Array.isArray(report?.findings) ? report.findings : [];
  const summaryNote = sanitizeString(report?.summary?.note, 2000) || "No summary note available.";
  const lines = [
    "# QA Report",
    "",
    "## Executive Summary",
    "",
    `- Run ID: ${report?.run_id || row?.run_id || "n/a"}`,
    `- Target: ${report?.target || runRequest?.target_url || row?.target || "n/a"}`,
    `- Status: ${report?.status || row?.status || "unknown"}`,
    `- Scope mode: ${runRequest?.scope_mode || "core_20m"}`,
    `- Summary note: ${summaryNote}`,
    "",
    "## Findings",
    ""
  ];

  if (!findings.length) {
    lines.push("- No findings were recorded.");
  } else {
    for (const finding of findings) {
      const title = sanitizeString(finding?.title, 180) || sanitizeString(finding?.id, 128) || "Finding";
      const observedBehavior =
        sanitizeString(finding?.observed_behavior, 4000) || "Observed behavior was not recorded.";
      lines.push(`- ${title}: ${observedBehavior}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const auth = await requireDashboardOrServiceAuth(req, res, { rejectInvalidServiceToken: false });

  const runId = sanitizeString(req.query?.run_id || req.query?.runId, 128);
  const format = sanitizeString(req.query?.format, 32).toLowerCase();
  const skipMarkdown =
    format !== "markdown" &&
    ["1", "true", "yes"].includes(
      sanitizeString(req.query?.skip_markdown || req.query?.skipMarkdown, 16).toLowerCase()
    );

  if (!runId) {
    return res.status(400).json({ ok: false, error: "run_id is required" });
  }

  const loaded = await loadStoredReportByRunId(runId);
  if (!loaded.ok) {
    return res.status(loaded.status || 500).json({ ok: false, error: loaded.error });
  }

  const row = loaded.row;
  const access = resolveQaReportReadAccess(row, {
    authOk: auth.ok,
    adminOk: auth.user?.report_admin === true,
    ownerUserId: sanitizeString(auth.user?.id, 128),
    shareKey: readQaShareKey(req),
    request: req
  });
  if (!access.ok) {
    return res.status(access.status || 401).json({ ok: false, error: access.error || "Authentication required" });
  }

  const payload = row && row.payload && typeof row.payload === "object" ? row.payload : {};
  const queueStatus = normalizeQueueLifecycleStatus(
    sanitizeString(payload.queue?.queue_status || payload.queue?.status || row.status, 64)
  );
  const hasStoredReport = payload.report_json && typeof payload.report_json === "object";
  if (!hasStoredReport && ["queued", "processing", "retryable"].includes(queueStatus)) {
    const publicBaseUrl = getPublicBaseUrl(req);
    const brand = sanitizeString(extractBrandKey(row), 256);
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
      report_ready: false,
      queue_status: queueStatus,
      report: null,
      markdown: null,
      ui_report_url: `${publicBaseUrl}/dashboard?${uiParams.toString()}`,
      row: {
        id: row.id || null,
        delivered_at: row.delivered_at || null,
        created_at: row.created_at || null,
        updated_at: row.updated_at || null
      }
    });
  }
  const storedArtifacts = payload.artifacts && typeof payload.artifacts === "object" ? payload.artifacts : {};
  const mergedArtifacts = {
    ...storedArtifacts,
    ...buildLiveStreamArtifacts(storedArtifacts)
  };
  const runRequest = buildStoredRunRequest(row, payload);
  const candidateReport = buildStoredReportCandidate(row, payload, mergedArtifacts);
  let reportJson = null;
  if (candidateReport) {
    reportJson = normalizeReport({
      candidateReport,
      runRequest,
      artifacts: mergedArtifacts,
      actions: payload.actions && typeof payload.actions === "object" ? payload.actions : {},
      reportUrl: row.report_url,
      deliveredAt: row.delivered_at,
      failureMessage: sanitizeString(payload.failure_message || payload.error, 2000),
      rawAgentMessage: sanitizeString(payload.raw_agent_output || payload.agent_output, 4000),
      runLog: Array.isArray(payload.run_log) ? payload.run_log : [],
      failureDiagnostics:
        payload.failure_diagnostics && typeof payload.failure_diagnostics === "object"
          ? payload.failure_diagnostics
          : payload.report_json?.failure_diagnostics && typeof payload.report_json.failure_diagnostics === "object"
            ? payload.report_json.failure_diagnostics
            : null
    });
    if (!["owner", "admin"].includes(access.access_type)) {
      reportJson = redactEngineeringTriage(reportJson);
    }
  }

  let markdown = null;
  if (!skipMarkdown && reportJson) {
    markdown = sanitizeString(payload.report_markdown, 200000);
    if (!markdown) {
      try {
        markdown = buildMarkdownReport(reportJson, {
          scope_mode: runRequest.scope_mode || "core_20m",
          brand_persona: runRequest.brand_persona || FALLBACK_BRAND_PERSONA,
          target_url: runRequest.target_url || payload.target || row.target || ""
        });
      } catch (error) {
        console.warn("Failed to build stored QA markdown", {
          run_id: row.run_id || null,
          error: error instanceof Error ? error.message : String(error || "Unknown error")
        });
        markdown = buildFallbackMarkdown(reportJson, runRequest, row);
      }
    }
  }

  if (format === "markdown") {
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    return res.status(200).send(markdown);
  }

  const publicBaseUrl = getPublicBaseUrl(req);
  const brand = sanitizeString(extractBrandKey(row), 256);
  const uiParams = new URLSearchParams({ view: "report", run_id: runId });
  if (brand) {
    uiParams.set("brand", brand);
  }
  if (access.access_type === "shared_link" && access.share_key) {
    uiParams.set("share_key", access.share_key);
  }

  return res.status(200).json({
    ok: true,
    run_id: runId,
    ui_report_url: `${publicBaseUrl}/dashboard?${uiParams.toString()}`,
    report: reportJson,
    markdown,
    row: {
      id: row.id || null,
      delivered_at: row.delivered_at || null,
      created_at: row.created_at || null,
      updated_at: row.updated_at || null
    }
  });
};
