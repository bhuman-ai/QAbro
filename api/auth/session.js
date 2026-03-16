const { resolveAuthSession } = require("../../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const session = await resolveAuthSession(req, res, { allowRefresh: true });
  if (!session.ok) {
    if ((session.status || 401) === 401) {
      return res.status(200).json({
        ok: false,
        user: null,
        error: "Authentication required"
      });
    }

    return res.status(session.status || 500).json({
      ok: false,
      user: null,
      error: session.error || "Could not resolve session"
    });
  }

  return res.status(200).json({
    ok: true,
    user: session.user
  });
};
