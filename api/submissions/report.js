const { requireDashboardOrServiceAuth } = require("../../lib/auth");
const { sanitizeString } = require("../../lib/qa-core");
const { buildSubmissionMarkdown } = require("../../lib/submission-core");
const { loadSubmissionJobById, sanitizeSubmissionJobPayload } = require("../../lib/submission-queue");

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
  const format = sanitizeString(req.query?.format, 32).toLowerCase();
  const ownerUserId =
    sanitizeString(auth.user?.id, 128) ||
    sanitizeString(req.headers?.["x-owner-user-id"] || req.query?.owner_user_id || req.query?.ownerUserId, 128);
  if (!jobId) {
    return res.status(400).json({ ok: false, error: "job_id is required" });
  }
  if (auth.is_service_token && !ownerUserId) {
    return res.status(400).json({ ok: false, error: "owner_user_id is required when using service token auth" });
  }

  const loaded = await loadSubmissionJobById(jobId, {
    ownerUserId
  });
  if (!loaded.ok) {
    return res.status(loaded.status || 500).json({ ok: false, error: loaded.error });
  }

  const payload = sanitizeSubmissionJobPayload(loaded.row?.payload);
  const result = loaded.row?.result && typeof loaded.row.result === "object" ? loaded.row.result : {};
  const request = payload.job_request && typeof payload.job_request === "object" ? payload.job_request : {};
  const markdown = sanitizeString(result.markdown, 200000) || buildSubmissionMarkdown(result, request);

  if (format === "markdown") {
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    return res.status(200).send(markdown);
  }

  return res.status(200).json({
    ok: true,
    job_id: loaded.job.job_id,
    job: loaded.job,
    report: result,
    markdown,
    artifacts: payload.artifacts || {},
    row: {
      created_at: loaded.row?.created_at || null,
      updated_at: loaded.row?.updated_at || null,
      started_at: loaded.row?.started_at || null,
      completed_at: loaded.row?.completed_at || null
    }
  });
};
