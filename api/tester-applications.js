const { requireDashboardAuth } = require("../lib/auth");
const { parseRequestBody, sanitizeString } = require("../lib/qa-core");
const { getTesterApplication, upsertTesterApplication } = require("../lib/tester-applications");

function extractOwner(auth) {
  return {
    owner_user_id: sanitizeString(auth?.user?.id, 128),
    owner_email: sanitizeString(auth?.user?.email, 320).toLowerCase()
  };
}

module.exports = async (req, res) => {
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

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
};
