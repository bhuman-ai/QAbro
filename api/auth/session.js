const { resolveAuthSession } = require("../../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const session = await resolveAuthSession(req, res, { allowRefresh: true });
  if (!session.ok) {
    return res.status(session.status || 401).json({ ok: false, error: "Authentication required" });
  }

  return res.status(200).json({
    ok: true,
    user: session.user
  });
};
