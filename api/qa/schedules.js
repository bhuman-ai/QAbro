const { requireDashboardOrServiceAuth } = require("../../lib/auth");
const { parseRequestBody, sanitizeString } = require("../../lib/qa-core");
const { isQaAlertEmailConfigured } = require("../../lib/qa-alert-email");
const {
  deleteQaSchedule,
  listQaSchedules,
  upsertQaSchedules
} = require("../../lib/qa-schedules");

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
    const listed = await listQaSchedules(
      {
        owner_user_id: ownerUserId,
        brand_key: req.query?.brand_key || req.query?.brandKey
      },
      {}
    );
    if (!listed.ok) {
      return res.status(listed.status || 500).json({ ok: false, error: listed.error });
    }
    return res.status(200).json({
      ok: true,
      items: listed.items,
      email_alerts_configured: isQaAlertEmailConfigured(),
      default_alert_email: ownerEmail || null
    });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await parseRequestBody(req);
    } catch {
      return res.status(400).json({ ok: false, error: "Invalid JSON body" });
    }
    const payload = body?.schedule && typeof body.schedule === "object" ? body.schedule : body;
    const saved = await upsertQaSchedules(payload, {
      owner_user_id: ownerUserId,
      owner_email: ownerEmail
    });
    if (!saved.ok) {
      return res.status(saved.status || 500).json({ ok: false, error: saved.error });
    }
    return res.status(200).json({
      ok: true,
      item: Array.isArray(saved.items) ? saved.items[0] || null : null,
      items: saved.items,
      email_alerts_configured: isQaAlertEmailConfigured(),
      default_alert_email: ownerEmail || null
    });
  }

  if (req.method === "DELETE") {
    const id = sanitizeString(req.query?.id, 128);
    if (!id) {
      return res.status(400).json({ ok: false, error: "id is required" });
    }
    const removed = await deleteQaSchedule(id, {
      owner_user_id: ownerUserId,
      owner_email: ownerEmail
    });
    if (!removed.ok) {
      return res.status(removed.status || 500).json({ ok: false, error: removed.error });
    }
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
};
