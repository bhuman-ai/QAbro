const { sanitizeString } = require("../../lib/qa-core");
const { requireDashboardOrServiceAuth } = require("../../lib/auth");
const { exportManualQaSession } = require("../../lib/manual-qa");

function resolveOwner(auth, req) {
  return {
    ownerUserId:
      sanitizeString(auth.user?.id, 128) ||
      sanitizeString(req?.headers?.["x-owner-user-id"] || req?.headers?.["x-user-id"], 128),
    ownerEmail:
      sanitizeString(auth.user?.email, 320).toLowerCase() ||
      sanitizeString(req?.headers?.["x-owner-email"], 320).toLowerCase()
  };
}

module.exports = async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const auth = await requireDashboardOrServiceAuth(req, res);
  if (!auth.ok) {
    return res.status(auth.status || 401).json({ ok: false, error: auth.error || "Authentication required" });
  }

  const owner = resolveOwner(auth, req);
  if (auth.is_service_token && !owner.ownerUserId) {
    return res.status(400).json({ ok: false, error: "owner_user_id is required when using service token auth" });
  }

  const sessionId = sanitizeString(req.query?.session_id || req.query?.sessionId || req.query?.run_id, 128);
  if (!sessionId) {
    return res.status(400).json({ ok: false, error: "session_id is required" });
  }

  const exported = await exportManualQaSession(sessionId, {
    authOk: true,
    ownerUserId: owner.ownerUserId,
    ownerEmail: owner.ownerEmail,
    request: req
  });
  if (!exported.ok) {
    return res.status(exported.status || 500).json({ ok: false, error: exported.error });
  }

  const format = sanitizeString(req.query?.format, 32).toLowerCase();
  if (format === "markdown" || format === "md") {
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    return res.status(200).send(exported.markdown);
  }

  return res.status(200).json(exported);
};
