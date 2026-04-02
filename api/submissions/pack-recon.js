const { getPublicBaseUrl, parseRequestBody, sanitizeString } = require("../../lib/qa-core");
const { requireDashboardOrServiceAuth } = require("../../lib/auth");
const { enqueueSubmissionPackRecon } = require("../../lib/submission-pack-jobs");

function extractRequestedOwner(req, source) {
  return {
    ownerUserId: sanitizeString(
      source?.owner_user_id ||
        source?.ownerUserId ||
        req?.headers?.["x-owner-user-id"] ||
        req?.headers?.["x-user-id"],
      128
    ),
    ownerEmail: sanitizeString(
      source?.owner_email ||
        source?.ownerEmail ||
        req?.headers?.["x-owner-email"],
      320
    ).toLowerCase()
  };
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

  const requestedOwner = extractRequestedOwner(req, body);
  const ownerUserId = sanitizeString(auth.user?.id, 128) || requestedOwner.ownerUserId;
  const ownerEmail = sanitizeString(auth.user?.email, 320).toLowerCase() || requestedOwner.ownerEmail;
  if (auth.is_service_token && !ownerUserId) {
    return res.status(400).json({ ok: false, error: "owner_user_id is required when using service token auth" });
  }
  if (auth.is_service_token && !ownerEmail) {
    return res.status(400).json({ ok: false, error: "owner_email is required when using service token auth" });
  }

  const result = await enqueueSubmissionPackRecon(body, {
    ownerUserId,
    ownerEmail,
    publicBaseUrl: getPublicBaseUrl(req)
  });

  if (!result.ok) {
    return res.status(result.status || 500).json({ ok: false, error: result.error });
  }

  return res.status(body?.dry_run ? 200 : 202).json({
    ok: true,
    dry_run: body?.dry_run === true || body?.dryRun === true,
    batch_id: result.batch_id,
    pack: result.pack,
    brand: result.brand,
    summary: result.summary,
    queued_jobs: result.queued_jobs,
    skipped_sites: result.skipped_sites,
    failed_sites: result.failed_sites,
    next_steps: result.next_steps
  });
};
