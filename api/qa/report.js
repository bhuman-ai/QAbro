const {
  buildMarkdownReport,
  getPublicBaseUrl,
  loadStoredReportByRunId,
  sanitizeString
} = require("../../lib/qa-core");
const { extractBrandKey, extractOwnerUserId } = require("../../lib/qa-queue");
const { buildLiveStreamArtifacts } = require("../../lib/qa-live-stream");
const { requireDashboardOrServiceAuth } = require("../../lib/auth");

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
  const reportJson = payload.report_json && typeof payload.report_json === "object"
    ? payload.report_json
    : {
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

  if (!reportJson.artifacts || typeof reportJson.artifacts !== "object") {
    reportJson.artifacts = mergedArtifacts;
  } else {
    reportJson.artifacts = {
      ...reportJson.artifacts,
      ...mergedArtifacts
    };
  }

  const markdown =
    sanitizeString(payload.report_markdown, 200000) ||
    buildMarkdownReport(reportJson, {
      scope_mode: payload.metadata?.scope_mode || payload.scope_mode || "core_20m",
      brand_persona:
        payload.metadata?.brand_persona ||
        "General non-developer business user with moderate technical comfort.",
      target_url: payload.metadata?.target_url || payload.target || row.target || ""
    });

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
