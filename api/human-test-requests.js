const { requireDashboardOrServiceAuth } = require("../lib/auth");
const { getPublicBaseUrl, parseRequestBody, sanitizeString } = require("../lib/qa-core");
const {
  assignHumanTestRequest,
  createHumanTestRequest,
  getHumanTestRequest,
  listHumanTestRequests
} = require("../lib/human-test-requests");
const { isTesterOperatorEmail } = require("../lib/tester-applications");

function resolveOwner(auth, req) {
  return {
    owner_user_id:
      sanitizeString(auth?.user?.id, 128) ||
      sanitizeString(req?.headers?.["x-owner-user-id"] || req?.headers?.["x-user-id"], 128),
    owner_email:
      sanitizeString(auth?.user?.email, 320).toLowerCase() ||
      sanitizeString(req?.headers?.["x-owner-email"], 320).toLowerCase()
  };
}

async function requireOwner(req, res) {
  const auth = await requireDashboardOrServiceAuth(req, res, { allowRefresh: true });
  if (!auth.ok) return auth;
  const owner = resolveOwner(auth, req);
  if (!owner.owner_user_id || !owner.owner_email) {
    return { ok: false, status: 400, error: "Signed-in owner id and email are required" };
  }
  return { ...auth, ...owner };
}

function isOperator(auth) {
  return auth?.is_service_token === true || isTesterOperatorEmail(auth?.owner_email || auth?.user?.email);
}

function requestOptions(req, owner = {}) {
  return {
    request: req,
    publicBaseUrl: getPublicBaseUrl(req),
    ownerUserId: owner.owner_user_id,
    ownerEmail: owner.owner_email,
    authOk: Boolean(owner.owner_user_id),
    launchedBy: owner.is_service_token ? "service_token" : "dashboard_user"
  };
}

module.exports = async (req, res) => {
  const owner = await requireOwner(req, res);
  if (!owner.ok) return res.status(owner.status || 401).json({ ok: false, error: owner.error });
  const options = requestOptions(req, owner);
  const adminScope = sanitizeString(req.query?.scope, 32).toLowerCase() === "admin";

  if (req.method === "GET") {
    if (adminScope && !isOperator(owner)) {
      return res.status(403).json({ ok: false, error: "Tester operator access required" });
    }
    const requestId = sanitizeString(req.query?.request_id || req.query?.requestId, 128);
    if (requestId) {
      const loaded = await getHumanTestRequest(
        requestId,
        adminScope ? {} : { owner_user_id: owner.owner_user_id },
        options
      );
      if (!loaded.ok) return res.status(loaded.status || 500).json({ ok: false, error: loaded.error });
      return res.status(200).json({ ok: true, request: loaded.request });
    }
    const listed = await listHumanTestRequests(
      {
        status: req.query?.status,
        limit: req.query?.limit,
        ...(adminScope ? {} : { owner_user_id: owner.owner_user_id })
      },
      options
    );
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

  const action = sanitizeString(body?.action || "request", 40).toLowerCase();
  if (action === "request") {
    const created = await createHumanTestRequest(body || {}, owner, options);
    if (!created.ok) {
      return res.status(created.status || 500).json({
        ok: false,
        error: created.error,
        needs_input: created.needs_input === true
      });
    }
    return res.status(created.status || 201).json(created);
  }

  if (action === "assign") {
    if (!isOperator(owner)) {
      return res.status(403).json({ ok: false, error: "Tester operator access required" });
    }
    const requestId = sanitizeString(body?.request_id || body?.requestId, 128);
    if (!requestId) return res.status(400).json({ ok: false, error: "request_id is required" });
    const assigned = await assignHumanTestRequest(requestId, body || {}, options);
    if (!assigned.ok) return res.status(assigned.status || 500).json({ ok: false, error: assigned.error });
    return res.status(assigned.status || 201).json(assigned);
  }

  return res.status(400).json({ ok: false, error: "Unknown action" });
};

module.exports.__private = {
  isOperator,
  requestOptions,
  resolveOwner
};
