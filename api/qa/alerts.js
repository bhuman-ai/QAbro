const { requireDashboardOrServiceAuth } = require("../../lib/auth");
const { parseRequestBody, sanitizeString } = require("../../lib/qa-core");
const { listQaAlerts, updateQaAlertStatus } = require("../../lib/qa-schedules");

module.exports = async (req, res) => {
  const auth = await requireDashboardOrServiceAuth(req, res);
  if (!auth.ok) {
    return res.status(auth.status || 401).json({ ok: false, error: "Authentication required" });
  }

  const ownerUserId = sanitizeString(auth.user?.id, 128);
  const ownerEmail = sanitizeString(auth.user?.email, 320).toLowerCase();
  if (auth.is_service_token && !ownerUserId) {
    return res.status(400).json({ ok: false, error: "owner_user_id is required for service auth" });
  }

  if (req.method === "GET") {
    const listed = await listQaAlerts(
      {
        owner_user_id: ownerUserId,
        brand_key: req.query?.brand_key || req.query?.brandKey,
        status: req.query?.status || "open"
      },
      {}
    );
    if (!listed.ok) {
      return res.status(listed.status || 500).json({ ok: false, error: listed.error });
    }
    return res.status(200).json({ ok: true, items: listed.items });
  }

  if (req.method === "POST" || req.method === "PATCH") {
    let body;
    try {
      body = await parseRequestBody(req);
    } catch {
      return res.status(400).json({ ok: false, error: "Invalid JSON body" });
    }
    const id = sanitizeString(body?.id, 128);
    const status = sanitizeString(body?.status, 32).toLowerCase() || "acknowledged";
    const updated = await updateQaAlertStatus(id, status, {
      owner_user_id: ownerUserId,
      owner_email: ownerEmail
    });
    if (!updated.ok) {
      return res.status(updated.status || 500).json({ ok: false, error: updated.error });
    }
    return res.status(200).json({ ok: true, item: updated.item });
  }

  res.setHeader("Allow", "GET, POST, PATCH");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
};
