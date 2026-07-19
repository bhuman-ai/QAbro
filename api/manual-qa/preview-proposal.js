const { parseRequestBody, sanitizeString } = require("../../lib/qa-core");
const { requireDashboardOrServiceAuth } = require("../../lib/auth");
const {
  buildManualQaCaptureSessionView,
  recordManualQaPreviewProposal,
  verifyManualQaWidgetToken
} = require("../../lib/manual-qa");

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-bud-widget-token");
}

function readToken(req, body) {
  return sanitizeString(
    req.headers?.["x-bud-widget-token"] ||
      req.query?.token ||
      body?.token,
    512
  );
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
  const token = readToken(req, body);
  if (!sessionId) {
    return res.status(400).json({ ok: false, error: "session_id is required" });
  }

  if (token) {
    const status = sanitizeString(body?.status, 40).toLowerCase();
    if (!["approved", "needs_changes"].includes(status)) {
      return res.status(400).json({ ok: false, error: "status must be approved or needs_changes" });
    }
    const verified = await verifyManualQaWidgetToken(sessionId, token, { request: req });
    if (!verified.ok) {
      return res.status(verified.status || 500).json({ ok: false, error: verified.error });
    }
    const recorded = await recordManualQaPreviewProposal(
      verified,
      {
        status,
        response_note: body?.response_note || body?.responseNote || body?.note || ""
      },
      { request: req }
    );
    if (!recorded.ok) {
      return res.status(recorded.status || 500).json({ ok: false, error: recorded.error, data: recorded.data });
    }
    const session = buildManualQaCaptureSessionView(recorded.session);
    return res.status(200).json({
      ok: true,
      session_id: sessionId,
      preview_proposal: session.preview_proposal,
      session
    });
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

  const proposal = body?.proposal && typeof body.proposal === "object" ? body.proposal : body;
  const recorded = await recordManualQaPreviewProposal(sessionId, proposal, {
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
    preview_proposal: recorded.proposal,
    session: recorded.session
  });
};
