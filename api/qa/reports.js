const { listQaReports } = require("../../lib/qa-queue");
const { sanitizeString } = require("../../lib/qa-core");
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

  const ownerUserId = sanitizeString(auth.user?.id, 128);
  const ownerEmail = sanitizeString(auth.user?.email, 320).toLowerCase();
  const reportAdmin = auth.user?.report_admin === true;
  if (auth.is_service_token && !ownerUserId) {
    return res.status(400).json({
      ok: false,
      error: "Provide x-owner-user-id or owner_user_id when listing runs via service token auth"
    });
  }

  const filters = {
    owner_user_id: reportAdmin ? "" : ownerUserId,
    owner_email: reportAdmin ? "" : ownerEmail,
    brand: sanitizeString(
      req.query?.brand ||
        req.query?.brand_key ||
        req.query?.brandKey ||
        req.query?.brand_id ||
        req.query?.brandId,
      256
    ),
    target: sanitizeString(req.query?.target, 320),
    status: sanitizeString(req.query?.status, 64),
    q: sanitizeString(req.query?.q, 320),
    limit: sanitizeString(req.query?.limit, 16),
    offset: sanitizeString(req.query?.offset, 16)
  };

  const listed = await listQaReports(filters);
  if (!listed.ok) {
    return res.status(listed.status || 500).json({ ok: false, error: listed.error });
  }

  return res.status(200).json({
    ok: true,
    filters,
    total: listed.total,
    limit: listed.limit,
    offset: listed.offset,
    items: listed.items
  });
};
