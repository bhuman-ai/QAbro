const { requireDashboardOrServiceAuth } = require("../lib/auth");
const { getPublicBaseUrl, parseRequestBody, sanitizeString } = require("../lib/qa-core");
const {
  acceptQaTrial,
  createQaTrial,
  getQaTrialForAdmin,
  listQaTrials,
  rateQaTrial,
  scoreQaTrial,
  startQaTrial,
  submitQaTrial,
  verifyQaTrialAccess
} = require("../lib/qa-trials");

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

async function requireOwner(req, res) {
  const auth = await requireDashboardOrServiceAuth(req, res);
  if (!auth.ok) return auth;
  const owner = resolveOwner(auth, req);
  if (auth.is_service_token && (!owner.ownerUserId || !owner.ownerEmail)) {
    return {
      ok: false,
      status: 400,
      error: "owner_user_id and owner_email are required when using service token auth"
    };
  }
  return { ...auth, ...owner };
}

function trialOptions(req, owner = {}) {
  return {
    request: req,
    publicBaseUrl: getPublicBaseUrl(req),
    ownerUserId: owner.ownerUserId,
    ownerEmail: owner.ownerEmail,
    authOk: Boolean(owner.ownerUserId),
    launchedBy: owner.is_service_token ? "service_token" : "dashboard_user"
  };
}

module.exports = async (req, res) => {
  const sessionId = sanitizeString(req.query?.session_id || req.query?.sessionId, 128);
  const queryToken = sanitizeString(req.query?.token, 512);

  if (req.method === "GET" && queryToken) {
    if (!sessionId) return res.status(400).json({ ok: false, error: "session_id is required" });
    const verified = await verifyQaTrialAccess(sessionId, queryToken, { request: req });
    if (!verified.ok) return res.status(verified.status || 500).json({ ok: false, error: verified.error });
    return res.status(200).json({ ok: true, trial: verified.view });
  }

  if (req.method === "GET") {
    const owner = await requireOwner(req, res);
    if (!owner.ok) return res.status(owner.status || 401).json({ ok: false, error: owner.error });
    if (sessionId) {
      const loaded = await getQaTrialForAdmin(sessionId, trialOptions(req, owner));
      if (!loaded.ok) return res.status(loaded.status || 500).json({ ok: false, error: loaded.error });
      return res.status(200).json({ ok: true, trial: loaded.trial });
    }
    const listed = await listQaTrials({
      ...trialOptions(req, owner),
      limit: req.query?.limit
    });
    if (!listed.ok) return res.status(listed.status || 500).json({ ok: false, error: listed.error });
    return res.status(200).json({ ok: true, items: listed.items });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  let body;
  try {
    body = await parseRequestBody(req);
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid JSON body" });
  }

  const action = sanitizeString(body?.action || "create", 40).toLowerCase();
  const bodySessionId = sanitizeString(body?.session_id || body?.sessionId || sessionId, 128);
  const bodyToken = sanitizeString(body?.token || queryToken, 512);

  if (["accept", "start", "submit", "rate"].includes(action)) {
    if (!bodySessionId || !bodyToken) {
      return res.status(400).json({ ok: false, error: "session_id and token are required" });
    }
    const options = { request: req };
    const result =
      action === "accept"
        ? await acceptQaTrial(bodySessionId, bodyToken, options)
        : action === "start"
          ? await startQaTrial(bodySessionId, bodyToken, options)
          : action === "submit"
            ? await submitQaTrial(bodySessionId, bodyToken, body || {}, options)
            : await rateQaTrial(bodySessionId, bodyToken, body || {}, options);
    if (!result.ok) return res.status(result.status || 500).json({ ok: false, error: result.error });
    return res.status(result.status || 200).json({ ok: true, trial: result.view });
  }

  const owner = await requireOwner(req, res);
  if (!owner.ok) return res.status(owner.status || 401).json({ ok: false, error: owner.error });
  const options = trialOptions(req, owner);

  if (action === "create") {
    const created = await createQaTrial(body || {}, options);
    if (!created.ok) return res.status(created.status || 500).json({ ok: false, error: created.error });
    return res.status(201).json(created);
  }

  if (action === "score") {
    if (!bodySessionId) return res.status(400).json({ ok: false, error: "session_id is required" });
    const scored = await scoreQaTrial(bodySessionId, body || {}, options);
    if (!scored.ok) return res.status(scored.status || 500).json({ ok: false, error: scored.error });
    return res.status(200).json({ ok: true, trial: scored.trial });
  }

  return res.status(400).json({ ok: false, error: "Unknown action" });
};

module.exports.__private = {
  resolveOwner,
  trialOptions
};
