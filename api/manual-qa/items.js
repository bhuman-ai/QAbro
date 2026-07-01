const { parseRequestBody, sanitizeString } = require("../../lib/qa-core");
const { requireDashboardOrServiceAuth } = require("../../lib/auth");
const { updateManualQaItem } = require("../../lib/manual-qa");

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
  if (req.method !== "PATCH" && req.method !== "POST") {
    res.setHeader("Allow", "PATCH, POST");
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

  let body;
  try {
    body = await parseRequestBody(req);
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid JSON body" });
  }

  const sessionId = sanitizeString(body?.session_id || body?.sessionId || req.query?.session_id, 128);
  const itemId = sanitizeString(body?.item_id || body?.itemId || req.query?.item_id, 80);
  if (!sessionId) {
    return res.status(400).json({ ok: false, error: "session_id is required" });
  }
  if (!itemId) {
    return res.status(400).json({ ok: false, error: "item_id is required" });
  }

  const updated = await updateManualQaItem(sessionId, itemId, body || {}, {
    authOk: true,
    ownerUserId: owner.ownerUserId,
    ownerEmail: owner.ownerEmail,
    request: req
  });
  if (!updated.ok) {
    return res.status(updated.status || 500).json({ ok: false, error: updated.error, data: updated.data });
  }

  return res.status(200).json({
    ok: true,
    session: updated.session,
    item: updated.item
  });
};
