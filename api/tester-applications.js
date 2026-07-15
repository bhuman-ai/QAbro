const { requireDashboardAuth, requireDashboardOrServiceAuth } = require("../lib/auth");
const { parseRequestBody, sanitizeString } = require("../lib/qa-core");
const {
  getTesterApplication,
  isTesterOperatorEmail,
  listTesterApplications,
  updateTesterApplication,
  upsertTesterApplication
} = require("../lib/tester-applications");

function extractOwner(auth) {
  return {
    owner_user_id: sanitizeString(auth?.user?.id, 128),
    owner_email: sanitizeString(auth?.user?.email, 320).toLowerCase()
  };
}

async function requireTesterOperator(req, res) {
  const auth = await requireDashboardOrServiceAuth(req, res, { allowRefresh: true });
  if (!auth.ok) {
    return auth;
  }
  if (auth.is_service_token || isTesterOperatorEmail(auth?.user?.email)) {
    return auth;
  }
  return { ok: false, status: 403, error: "Tester operator access required" };
}

module.exports = async (req, res) => {
  const adminScope = sanitizeString(req.query?.scope, 32).toLowerCase() === "admin";

  if (req.method === "GET" && adminScope) {
    const operator = await requireTesterOperator(req, res);
    if (!operator.ok) {
      return res.status(operator.status || 403).json({ ok: false, error: operator.error });
    }
    const result = await listTesterApplications({
      status: req.query?.status,
      limit: req.query?.limit
    });
    if (!result.ok) {
      return res.status(result.status || 500).json({ ok: false, error: result.error });
    }
    return res.status(200).json({ ok: true, items: result.items });
  }

  if (req.method === "PATCH") {
    const operator = await requireTesterOperator(req, res);
    if (!operator.ok) {
      return res.status(operator.status || 403).json({ ok: false, error: operator.error });
    }

    let body;
    try {
      body = await parseRequestBody(req);
    } catch {
      return res.status(400).json({ ok: false, error: "Invalid JSON body" });
    }
    const result = await updateTesterApplication(body || {});
    if (!result.ok) {
      return res.status(result.status || 500).json({ ok: false, error: result.error });
    }
    return res.status(200).json({ ok: true, application: result.application });
  }

  const auth = await requireDashboardAuth(req, res, { allowRefresh: true });
  if (!auth.ok) {
    return res.status(auth.status || 401).json({ ok: false, error: "Sign in to apply" });
  }

  const owner = extractOwner(auth);
  if (!owner.owner_user_id || !owner.owner_email) {
    return res.status(400).json({ ok: false, error: "Signed-in user id and email are required" });
  }

  if (req.method === "GET") {
    const result = await getTesterApplication(owner);
    if (!result.ok) {
      return res.status(result.status || 500).json({ ok: false, error: result.error });
    }
    return res.status(200).json({ ok: true, application: result.application });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await parseRequestBody(req);
    } catch {
      return res.status(400).json({ ok: false, error: "Invalid JSON body" });
    }

    const result = await upsertTesterApplication({
      ...body,
      ...owner
    });
    if (!result.ok) {
      return res.status(result.status || 500).json({ ok: false, error: result.error });
    }

    return res.status(201).json({ ok: true, application: result.application });
  }

  res.setHeader("Allow", "GET, POST, PATCH");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
};

module.exports.__private = {
  extractOwner,
  requireTesterOperator
};
