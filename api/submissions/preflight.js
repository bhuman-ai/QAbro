const { parseRequestBody, sanitizeString } = require("../../lib/qa-core");
const { requireDashboardOrServiceAuth } = require("../../lib/auth");
const { runSubmissionPreflight } = require("../../lib/submission-preflight");

function extractRequestedOwner(req, source) {
  return sanitizeString(
    source?.owner_user_id ||
      source?.ownerUserId ||
      req?.headers?.["x-owner-user-id"] ||
      req?.headers?.["x-user-id"],
    128
  );
}

module.exports = async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const auth = await requireDashboardOrServiceAuth(req, res);
  if (!auth.ok) {
    return res.status(auth.status || 401).json({ ok: false, error: "Authentication required" });
  }

  let source = req.query;
  if (req.method === "POST") {
    try {
      source = await parseRequestBody(req);
    } catch {
      return res.status(400).json({ ok: false, error: "Invalid JSON body" });
    }
  }

  const ownerUserId = sanitizeString(auth.user?.id, 128) || extractRequestedOwner(req, source);
  if (auth.is_service_token && !ownerUserId) {
    return res.status(400).json({ ok: false, error: "owner_user_id is required when using service token auth" });
  }

  const result = await runSubmissionPreflight(source, {
    ownerUserId
  });
  if (!result.ok) {
    return res.status(result.status || 500).json({ ok: false, error: result.error });
  }

  return res.status(200).json({
    ok: true,
    checked_at: result.checked_at,
    request: result.request,
    pack: result.pack,
    brand: result.brand,
    manifest: result.manifest,
    overall_decision: result.overall_decision,
    summary: result.summary,
    items: result.items,
    next_steps: result.next_steps
  });
};
