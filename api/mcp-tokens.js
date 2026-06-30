const { requireDashboardAuth } = require("../lib/auth");
const { parseRequestBody, sanitizeString } = require("../lib/qa-core");
const { createMcpToken, listMcpTokens, revokeMcpToken } = require("../lib/qa-mcp-tokens");

function extractOwner(auth) {
  return {
    owner_user_id: sanitizeString(auth?.user?.id, 128),
    owner_email: sanitizeString(auth?.user?.email, 320).toLowerCase()
  };
}

module.exports = async (req, res) => {
  const auth = await requireDashboardAuth(req, res, { allowRefresh: true });
  if (!auth.ok) {
    return res.status(auth.status || 401).json({ ok: false, error: "Authentication required" });
  }

  const owner = extractOwner(auth);
  if (!owner.owner_user_id || !owner.owner_email) {
    return res.status(400).json({ ok: false, error: "Dashboard user id and email are required" });
  }

  if (req.method === "GET") {
    const listed = await listMcpTokens(owner);
    if (!listed.ok) {
      return res.status(listed.status || 500).json({ ok: false, error: listed.error });
    }
    return res.status(200).json({
      ok: true,
      total: listed.total || 0,
      items: listed.items || []
    });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await parseRequestBody(req);
    } catch {
      return res.status(400).json({ ok: false, error: "Invalid JSON body" });
    }

    const created = await createMcpToken({
      ...owner,
      name: body?.name,
      metadata: {
        source: "dashboard_settings"
      }
    });
    if (!created.ok) {
      return res.status(created.status || 500).json({ ok: false, error: created.error });
    }

    return res.status(201).json({
      ok: true,
      token: created.token,
      item: created.item
    });
  }

  if (req.method === "DELETE") {
    const tokenId = sanitizeString(req.query?.id || req.query?.token_id, 128);
    let body = null;
    if (!tokenId) {
      try {
        body = await parseRequestBody(req);
      } catch {
        body = null;
      }
    }
    const revoked = await revokeMcpToken({
      ...owner,
      token_id: tokenId || body?.id || body?.token_id
    });
    if (!revoked.ok) {
      return res.status(revoked.status || 500).json({ ok: false, error: revoked.error });
    }
    return res.status(200).json({
      ok: true,
      revoked: revoked.revoked,
      item: revoked.item
    });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
};
