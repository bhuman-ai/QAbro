const { requireDashboardOrServiceAuth } = require("../../lib/auth");
const { listQaWorkers } = require("../../lib/qa-workers");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const auth = await requireDashboardOrServiceAuth(req, res);
  if (!auth.ok) {
    return res.status(auth.status || 401).json({ ok: false, error: "Authentication required" });
  }

  const listed = await listQaWorkers();
  if (!listed.ok) {
    return res.status(listed.status || 500).json({ ok: false, error: listed.error });
  }

  return res.status(200).json({
    ok: true,
    checked_at: listed.checked_at,
    summary: listed.summary,
    items: listed.items
  });
};
