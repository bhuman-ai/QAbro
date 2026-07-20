const { requireDashboardOrServiceAuth } = require("../lib/auth");
const { getPublicBaseUrl, parseRequestBody, sanitizeString } = require("../lib/qa-core");
const {
  acceptQaTrial,
  createQaTrial,
  deliverQaTrialReport,
  getQaTrialForAdmin,
  listQaTrials,
  queueQaTrialRecordingAnalysis,
  rateQaTrial,
  scoreQaTrial,
  setQaTrialTesterPublicName,
  startQaTrial,
  submitQaTrial,
  verifyQaTrialAccess
} = require("../lib/qa-trials");
const {
  isTesterOperatorEmail,
  markTesterApplicationQualifiedBySession
} = require("../lib/tester-applications");

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
    adminOk: owner.user?.report_admin === true,
    launchedBy: owner.is_service_token ? "service_token" : "dashboard_user"
  };
}

function trialListOptions(req, owner = {}) {
  const options = trialOptions(req, owner);
  return {
    ...options,
    ownerUserId: options.adminOk ? "" : options.ownerUserId
  };
}

function shouldMarkTesterQualified(trial, owner = {}) {
  return (
    trial?.assignment?.type !== "paid" &&
    (owner.is_service_token === true || isTesterOperatorEmail(owner.ownerEmail))
  );
}

function canManageTesterPublicName(owner = {}) {
  return (
    owner.is_service_token === true ||
    owner.user?.report_admin === true ||
    isTesterOperatorEmail(owner.ownerEmail)
  );
}

function setPrivateTrialResponseHeaders(res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Referrer-Policy", "no-referrer");
}

module.exports = async (req, res) => {
  const sessionId = sanitizeString(req.query?.session_id || req.query?.sessionId, 128);
  const queryToken = sanitizeString(req.query?.token, 512);

  if (req.method === "GET" && queryToken) {
    setPrivateTrialResponseHeaders(res);
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
      ...trialListOptions(req, owner),
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

  if (["accept", "accept_analysis", "start", "submit", "rate"].includes(action)) {
    setPrivateTrialResponseHeaders(res);
    if (!bodySessionId || !bodyToken) {
      return res.status(400).json({ ok: false, error: "session_id and token are required" });
    }
    const options = { request: req };
    const result =
      action === "accept"
        ? await acceptQaTrial(bodySessionId, bodyToken, options)
        : action === "accept_analysis"
          ? await queueQaTrialRecordingAnalysis(bodySessionId, bodyToken, options)
        : action === "start"
          ? await startQaTrial(bodySessionId, bodyToken, options)
          : action === "submit"
            ? await submitQaTrial(bodySessionId, bodyToken, body || {}, options)
            : await rateQaTrial(bodySessionId, bodyToken, body || {}, options);
    if (!result.ok) return res.status(result.status || 500).json({ ok: false, error: result.error });
    return res.status(result.status || 200).json({
      ok: true,
      trial: result.view,
      ...(result.queue_pending === true ? { queue_pending: true } : {})
    });
  }

  const owner = await requireOwner(req, res);
  if (!owner.ok) return res.status(owner.status || 401).json({ ok: false, error: owner.error });
  const options = trialOptions(req, owner);

  if (action === "create") {
    const created = await createQaTrial(body || {}, options);
    if (!created.ok) return res.status(created.status || 500).json({ ok: false, error: created.error });
    return res.status(201).json(created);
  }

  if (action === "deliver_report") {
    if (!bodySessionId) return res.status(400).json({ ok: false, error: "session_id is required" });
    const delivered = await deliverQaTrialReport(bodySessionId, {
      ...options,
      forceEnable: true
    });
    if (!delivered.ok) {
      return res.status(delivered.status || 500).json({
        ok: false,
        error: delivered.error,
        delivery: delivered.delivery || null
      });
    }
    return res.status(delivered.status || 200).json({
      ok: true,
      delivered: delivered.delivered === true,
      idempotent: delivered.idempotent === true,
      skipped: delivered.skipped === true,
      delivery: delivered.delivery || null,
      ...(delivered.warning ? { warning: delivered.warning } : {})
    });
  }

  if (action === "set_tester_public_name") {
    if (!bodySessionId) return res.status(400).json({ ok: false, error: "session_id is required" });
    if (!canManageTesterPublicName(owner)) {
      return res.status(403).json({ ok: false, error: "Tester operator access required" });
    }
    const updated = await setQaTrialTesterPublicName(bodySessionId, body || {}, {
      ...options,
      adminOk: true,
      allowTesterPublicNameUpdate: true
    });
    if (!updated.ok) return res.status(updated.status || 500).json({ ok: false, error: updated.error });
    return res.status(200).json({ ok: true, trial: updated.trial });
  }

  if (action === "score") {
    if (!bodySessionId) return res.status(400).json({ ok: false, error: "session_id is required" });
    const scored = await scoreQaTrial(bodySessionId, body || {}, options);
    if (!scored.ok) return res.status(scored.status || 500).json({ ok: false, error: scored.error });
    let application = null;
    if (shouldMarkTesterQualified(scored.trial, owner)) {
      const synced = await markTesterApplicationQualifiedBySession(bodySessionId);
      if (synced.ok) {
        application = synced.application;
      }
    }
    return res.status(200).json({ ok: true, trial: scored.trial, application });
  }

  return res.status(400).json({ ok: false, error: "Unknown action" });
};

module.exports.__private = {
  canManageTesterPublicName,
  resolveOwner,
  setPrivateTrialResponseHeaders,
  shouldMarkTesterQualified,
  trialListOptions,
  trialOptions
};
