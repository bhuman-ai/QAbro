const { requireDashboardAuth } = require("../../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const session = await requireDashboardAuth(req, res, { allowRefresh: true });
  if (!session.ok) {
    return res.status(session.status || 401).json({ ok: false, error: "Authentication required" });
  }

  if (!session.accessToken || !session.refreshToken) {
    return res.status(401).json({ ok: false, error: "Authentication required" });
  }

  return res.status(200).json({
    ok: true,
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
    user: session.user || null
  });
};
