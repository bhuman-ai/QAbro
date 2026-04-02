const { requireDashboardOrServiceAuth } = require("../../lib/auth");
const { sanitizeString } = require("../../lib/qa-core");
const { buildSubmissionSiteScorecard } = require("../../lib/submission-scorecard");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const auth = await requireDashboardOrServiceAuth(req, res);
  if (!auth.ok) {
    return res.status(auth.status || 401).json({ ok: false, error: "Authentication required" });
  }

  const track = sanitizeString(req.query?.track, 64).toLowerCase();
  const packId = sanitizeString(req.query?.pack_id || req.query?.packId, 128).toLowerCase();
  const productStatus = sanitizeString(req.query?.product_status || req.query?.productStatus, 32).toLowerCase();
  const productLane = sanitizeString(req.query?.product_lane || req.query?.productLane, 64).toLowerCase();
  const supportTier = sanitizeString(req.query?.support_tier || req.query?.supportTier, 64).toLowerCase();

  const scorecard = await buildSubmissionSiteScorecard({
    ...(track ? { track } : {}),
    ...(packId ? { pack_id: packId } : {}),
    ...(productStatus ? { product_status: productStatus } : {}),
    ...(productLane ? { product_lane: productLane } : {}),
    ...(supportTier ? { support_tier: supportTier } : {}),
    telemetry_window_days: req.query?.telemetry_window_days || req.query?.telemetryWindowDays,
    telemetry_limit: req.query?.telemetry_limit || req.query?.telemetryLimit
  }, {
    ownerUserId: auth.user?.id || null
  });

  return res.status(200).json({
    ok: true,
    summary: scorecard.summary,
    effective_summary: scorecard.effective_summary,
    eligibility_summary: scorecard.eligibility_summary,
    telemetry_summary: scorecard.telemetry_summary,
    telemetry_error: scorecard.telemetry_error,
    sites: scorecard.sites
  });
};
