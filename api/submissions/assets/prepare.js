const { getPublicBaseUrl, parseRequestBody, sanitizeString } = require("../../../lib/qa-core");
const { validateAssetPrepareRequest } = require("../../../lib/submission-core");
const { enqueueSubmissionJob } = require("../../../lib/submission-queue");
const { requireDashboardOrServiceAuth } = require("../../../lib/auth");

function extractRequestedOwner(req, request) {
  const metadata = request && request.metadata && typeof request.metadata === "object" ? request.metadata : {};
  const ownerUserId = sanitizeString(
    metadata.owner_user_id ||
      metadata.ownerUserId ||
      req?.headers?.["x-owner-user-id"] ||
      req?.headers?.["x-user-id"],
    128
  );
  const ownerEmail = sanitizeString(
    metadata.owner_email ||
      metadata.ownerEmail ||
      req?.headers?.["x-owner-email"],
    320
  ).toLowerCase();

  return { ownerUserId, ownerEmail };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
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

  const validation = validateAssetPrepareRequest(body);
  if (!validation.ok) {
    return res.status(400).json({ ok: false, error: validation.error });
  }

  const request = validation.data;
  const requestedOwner = extractRequestedOwner(req, request);
  const ownerUserId = sanitizeString(auth.user?.id, 128) || requestedOwner.ownerUserId;
  const ownerEmail = sanitizeString(auth.user?.email, 320).toLowerCase() || requestedOwner.ownerEmail;
  if (auth.is_service_token && !ownerUserId) {
    return res.status(400).json({ ok: false, error: "owner_user_id is required when using service token auth" });
  }
  if (auth.is_service_token && !ownerEmail) {
    return res.status(400).json({ ok: false, error: "owner_email is required when using service token auth" });
  }

  request.metadata = {
    ...(request.metadata && typeof request.metadata === "object" ? request.metadata : {}),
    owner_user_id: ownerUserId || null,
    owner_email: ownerEmail || null,
    launched_by: auth.is_service_token ? "service_token" : "dashboard_user"
  };

  const publicBaseUrl = getPublicBaseUrl(req);
  const statusUrl = `${publicBaseUrl}/api/submissions/status?job_id=${encodeURIComponent(request.job_id)}`;
  const reportUrl = `${publicBaseUrl}/api/submissions/report?job_id=${encodeURIComponent(request.job_id)}`;

  if (request.dry_run) {
    return res.status(200).json({
      ok: true,
      dry_run: true,
      request,
      status_url: statusUrl,
      report_url: reportUrl
    });
  }

  const queued = await enqueueSubmissionJob(request, {
    ownerUserId,
    ownerEmail,
    brandKey: sanitizeString(request.brand_key || request.metadata?.brand_key, 256) || null,
    publicBaseUrl,
    statusUrl,
    reportUrl
  });
  if (!queued.ok) {
    return res.status(queued.status || 500).json({
      ok: false,
      error: queued.error || "Failed to enqueue asset preparation job"
    });
  }

  return res.status(202).json({
    ok: true,
    queued: true,
    job_id: request.job_id,
    status_url: statusUrl,
    report_url: reportUrl,
    job: queued.job
  });
};
