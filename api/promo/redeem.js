const { requireDashboardAuth, sanitizePublicUser } = require("../../lib/auth");
const { parseRequestBody, sanitizeString } = require("../../lib/qa-core");
const { redeemPromoForAccessToken } = require("../../lib/promo-offers");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const session = await requireDashboardAuth(req, res, { allowRefresh: true });
  if (!session.ok) {
    return res.status(session.status || 401).json({ ok: false, error: "Authentication required" });
  }

  let body = {};
  try {
    body = (await parseRequestBody(req)) || {};
  } catch {
    body = {};
  }

  const code = sanitizeString(body?.code || body?.coupon_code || body?.promo_code, 128);
  const shareRunId = sanitizeString(body?.share_run_id || body?.shareRunId, 128);
  if (!code) {
    return res.status(400).json({ ok: false, error: "Team code is required" });
  }

  const accessToken = sanitizeString(session.accessToken, 4096);
  if (!accessToken) {
    return res.status(401).json({ ok: false, error: "Authentication required" });
  }

  const redeemed = await redeemPromoForAccessToken(accessToken, code, {
    source: "dashboard_redeem",
    shareRunId
  });
  if (!redeemed.ok) {
    return res.status(redeemed.status || 400).json({
      ok: false,
      error: redeemed.error || "Could not redeem team code"
    });
  }

  return res.status(200).json({
    ok: true,
    code: redeemed.offer?.code || null,
    already_redeemed: redeemed.alreadyRedeemed === true,
    user: redeemed.user ? sanitizePublicUser(redeemed.user) : session.user
  });
};
