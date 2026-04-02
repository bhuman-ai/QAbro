const { requireDashboardOrServiceAuth } = require("../../lib/auth");
const { sanitizeString } = require("../../lib/qa-core");
const { getSubmissionJobStatus, sanitizeSubmissionJobPayload } = require("../../lib/submission-queue");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const auth = await requireDashboardOrServiceAuth(req, res);
  if (!auth.ok) {
    return res.status(auth.status || 401).json({ ok: false, error: "Authentication required" });
  }

  const jobId = sanitizeString(req.query?.job_id || req.query?.jobId, 128);
  const ownerUserId =
    sanitizeString(auth.user?.id, 128) ||
    sanitizeString(req.headers?.["x-owner-user-id"] || req.query?.owner_user_id || req.query?.ownerUserId, 128);
  if (!jobId) {
    return res.status(400).json({ ok: false, error: "job_id is required" });
  }
  if (auth.is_service_token && !ownerUserId) {
    return res.status(400).json({ ok: false, error: "owner_user_id is required when using service token auth" });
  }

  const loaded = await getSubmissionJobStatus(jobId, {
    ownerUserId
  });
  if (!loaded.ok) {
    return res.status(loaded.status || 500).json({ ok: false, error: loaded.error });
  }

  const payload = sanitizeSubmissionJobPayload(loaded.row?.payload);
  const result = loaded.row?.result && typeof loaded.row.result === "object" ? loaded.row.result : {};
  const runLog = Array.isArray(payload.run_log) ? payload.run_log.slice(-40) : [];

  return res.status(200).json({
    ok: true,
    job_id: loaded.job.job_id,
    job: loaded.job,
    progress: loaded.row?.progress && typeof loaded.row.progress === "object" ? loaded.row.progress : null,
    report_ready: loaded.job.report_ready,
    status_url: payload.status_url,
    report_url: payload.report_url,
    artifacts: payload.artifacts || {},
    run_log: runLog,
    live_report:
      result && Object.keys(result).length
        ? {
            status: sanitizeString(result.status, 64) || null,
            summary: result.summary || null,
            site_profile: result.site_profile || null,
            asset_manifest:
              result.asset_manifest && typeof result.asset_manifest === "object"
                ? {
                    manifest_id: sanitizeString(result.asset_manifest.manifest_id, 128) || null,
                    brand_profile_id: sanitizeString(result.asset_manifest.brand_profile_id, 128) || null,
                    required_assets_count: Array.isArray(result.asset_manifest.required_assets)
                      ? result.asset_manifest.required_assets.length
                      : 0,
                    missing_items_count: Array.isArray(result.asset_manifest.missing_items)
                      ? result.asset_manifest.missing_items.length
                      : 0
                  }
                : null
          }
        : null
  });
};
