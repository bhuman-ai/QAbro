const { requireDashboardOrServiceAuth } = require("../../lib/auth");
const { parseRequestBody, sanitizeString } = require("../../lib/qa-core");
const { listQaProjects, upsertQaProjects } = require("../../lib/qa-projects");

module.exports = async (req, res) => {
  const auth = await requireDashboardOrServiceAuth(req, res);
  if (!auth.ok) {
    return res.status(auth.status || 401).json({ ok: false, error: "Authentication required" });
  }

  const ownerUserId = sanitizeString(auth.user?.id, 128);
  const ownerEmail = sanitizeString(auth.user?.email, 320).toLowerCase();
  if (auth.is_service_token && !ownerUserId) {
    return res.status(400).json({
      ok: false,
      error: "Provide x-owner-user-id or owner_user_id when managing projects via service token auth"
    });
  }

  if (req.method === "GET") {
    const listed = await listQaProjects({ owner_user_id: ownerUserId });
    if (!listed.ok) {
      return res.status(listed.status || 500).json({ ok: false, error: listed.error });
    }

    return res.status(200).json({
      ok: true,
      total: listed.total,
      items: listed.items
    });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await parseRequestBody(req);
    } catch {
      return res.status(400).json({ ok: false, error: "Invalid JSON body" });
    }

    const payload = Array.isArray(body?.projects) ? body.projects : [body];
    const saved = await upsertQaProjects(payload, {
      owner_user_id: ownerUserId,
      owner_email: ownerEmail
    });
    if (!saved.ok) {
      return res.status(saved.status || 500).json({ ok: false, error: saved.error });
    }

    return res.status(200).json({
      ok: true,
      items: saved.items
    });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
};
