const {
  buildMarkdownReport,
  getPublicBaseUrl,
  loadStoredReportByRunId,
  normalizeReport,
  sanitizeString
} = require("../../lib/qa-core");
const { extractBrandKey, extractOwnerUserId } = require("../../lib/qa-queue");
const { buildLiveStreamArtifacts } = require("../../lib/qa-live-stream");
const { requireDashboardOrServiceAuth } = require("../../lib/auth");

const FALLBACK_BRAND_PERSONA =
  "General non-developer business user with moderate technical comfort.";

function buildStoredReportCandidate(row, payload, mergedArtifacts) {
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

  const auth = await requireDashboardOrServiceAuth(req, res);
  if (!auth.ok) {
    return res.status(auth.status || 401).json({ ok: false, error: "Authentication required" });
  }

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
  const ownerUserId = sanitizeString(auth.user?.id, 128);
  if (ownerUserId) {
    const rowOwnerUserId = sanitizeString(extractOwnerUserId(row), 128);
    if (!rowOwnerUserId || rowOwnerUserId !== ownerUserId) {
      return res.status(404).json({ ok: false, error: "Run not found" });
    }
  }

  const payload = row && row.payload && typeof row.payload === "object" ? row.payload : {};
  const storedArtifacts = payload.artifacts && typeof payload.artifacts === "object" ? payload.artifacts : {};
  const mergedArtifacts = {
    ...storedArtifacts,
    ...buildLiveStreamArtifacts(storedArtifacts)
  };
  const runRequest = buildStoredRunRequest(row, payload);
  const reportJson = normalizeReport({
    candidateReport: buildStoredReportCandidate(row, payload, mergedArtifacts),
    runRequest,
    artifacts: mergedArtifacts,
    actions: payload.actions && typeof payload.actions === "object" ? payload.actions : {},
    reportUrl: row.report_url,
    deliveredAt: row.delivered_at,
    failureMessage: sanitizeString(payload.failure_message || payload.error, 2000),
    rawAgentMessage: sanitizeString(payload.raw_agent_output || payload.agent_output, 4000)
  });

  let markdown = null;
  if (!skipMarkdown) {
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
