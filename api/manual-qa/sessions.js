const {
  getPublicBaseUrl,
  parseRequestBody,
  sanitizeString
} = require("../../lib/qa-core");
const { requireDashboardOrServiceAuth } = require("../../lib/auth");
const {
  createManualQaSession,
  getManualQaSession,
  listManualQaSessions
} = require("../../lib/manual-qa");

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

function requireServiceOwner(auth, owner) {
  if (!auth.is_service_token) {
    return null;
  }
  if (!owner.ownerUserId) {
    return "owner_user_id is required when using service token auth";
  }
  if (!owner.ownerEmail) {
    return "owner_email is required when using service token auth";
  }
  return null;
}

module.exports = async (req, res) => {
  const auth = await requireDashboardOrServiceAuth(req, res);
  if (!auth.ok) {
    return res.status(auth.status || 401).json({ ok: false, error: auth.error || "Authentication required" });
  }

  const owner = resolveOwner(auth, req);
  const ownerError = requireServiceOwner(auth, owner);
  if (ownerError) {
    return res.status(400).json({ ok: false, error: ownerError });
  }

  if (req.method === "GET") {
    const sessionId = sanitizeString(req.query?.session_id || req.query?.sessionId || req.query?.run_id, 128);
    if (sessionId) {
      const loaded = await getManualQaSession(sessionId, {
        authOk: true,
        ownerUserId: owner.ownerUserId,
        ownerEmail: owner.ownerEmail,
        request: req
      });
      if (!loaded.ok) {
        return res.status(loaded.status || 500).json({ ok: false, error: loaded.error });
      }
      return res.status(200).json({ ok: true, session: loaded.session });
    }

    const listed = await listManualQaSessions({
      ownerUserId: owner.ownerUserId,
      ownerEmail: owner.ownerEmail,
      limit: req.query?.limit
    });
    if (!listed.ok) {
      return res.status(listed.status || 500).json({ ok: false, error: listed.error });
    }
    return res.status(200).json({ ok: true, items: listed.items });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await parseRequestBody(req);
    } catch {
      return res.status(400).json({ ok: false, error: "Invalid JSON body" });
    }

    const created = await createManualQaSession(body || {}, {
      publicBaseUrl: getPublicBaseUrl(req),
      ownerUserId: owner.ownerUserId,
      ownerEmail: owner.ownerEmail,
      launchedBy: auth.is_service_token ? "service_token" : "dashboard_user"
    });
    if (!created.ok) {
      return res.status(created.status || 500).json({ ok: false, error: created.error, data: created.data });
    }
    return res.status(201).json({
      ok: true,
      session: created.session,
      session_id: created.session.session_id,
      review_url: created.widget_install?.review_url || created.session.target_url,
      manual_session_url: created.session.session_url,
      widget_install: created.widget_install
    });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
};
