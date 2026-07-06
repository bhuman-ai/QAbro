const { parseRequestBody, sanitizeString } = require("../../lib/qa-core");
const { requireDashboardOrServiceAuth } = require("../../lib/auth");
const { recordManualQaPostFixReview } = require("../../lib/manual-qa");

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

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
  setCors(res);
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  let body;
  try {
    body = await parseRequestBody(req);
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid JSON body" });
  }

  const sessionId = sanitizeString(body?.session_id || body?.sessionId || req.query?.session_id, 128);
  if (!sessionId) {
    return res.status(400).json({ ok: false, error: "session_id is required" });
  }

  const auth = await requireDashboardOrServiceAuth(req, res);
  if (!auth.ok) {
    return res.status(auth.status || 401).json({ ok: false, error: auth.error || "Authentication required" });
  }

  const owner = resolveOwner(auth, req);
  const ownerError = requireServiceOwner(auth, owner);
  if (ownerError) {
    return res.status(400).json({ ok: false, error: ownerError });
  }

  const review = body?.review && typeof body.review === "object" ? body.review : body;
  const recorded = await recordManualQaPostFixReview(sessionId, review, {
    authOk: true,
    ownerUserId: owner.ownerUserId,
    ownerEmail: owner.ownerEmail,
    request: req
  });
  if (!recorded.ok) {
    return res.status(recorded.status || 500).json({ ok: false, error: recorded.error, data: recorded.data });
  }

  return res.status(200).json({
    ok: true,
    session_id: sessionId,
    post_fix_review: recorded.post_fix_review,
    may_mark_done: recorded.may_mark_done === true,
    session: recorded.session
  });
};
