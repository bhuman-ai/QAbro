const { clearSessionCookies } = require("../../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  clearSessionCookies(res, req);
  return res.status(200).json({ ok: true });
};
