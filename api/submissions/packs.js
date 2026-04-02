const { requireDashboardOrServiceAuth } = require("../../lib/auth");
const { sanitizeString } = require("../../lib/qa-core");
const { listSitePacks, listSupportedSites, recommendSitePack } = require("../../lib/site-packs");
const { buildSubmissionSiteScorecard } = require("../../lib/submission-scorecard");

function buildEffectiveProductSummary(sites = []) {
  const summary = {
    total_sites: sites.length,
    green_count: 0,
    yellow_count: 0,
    red_count: 0
  };

  for (const site of sites) {
    const status = sanitizeString(site?.effective_product_status || site?.product_status, 32).toLowerCase();
    if (status === "green" || status === "yellow" || status === "red") {
      summary[`${status}_count`] += 1;
    }
  }

  return summary;
}

function shouldIncludeInEffectivePack(packId, site = {}) {
  const safePackId = sanitizeString(packId, 128).toLowerCase();
  const tier = sanitizeString(site?.eligibility_tier, 32).toLowerCase();
  const staticLane = sanitizeString(site?.product_lane, 64).toLowerCase();
  const track = sanitizeString(site?.track, 64).toLowerCase();

  if (safePackId === "launch_starter") {
    return track === "startup" && tier === "starter";
  }
  if (safePackId === "launch_boosters") {
    return track === "startup" && tier === "booster";
  }
  if (safePackId === "community_launch") {
    return track === "startup" && staticLane === "community_launch";
  }
  if (safePackId === "presence_pack") {
    return track === "physical_local";
  }
  return true;
}

function buildEffectiveProductPacks(packs = [], scorecardSites = []) {
  const scorecardBySiteId = new Map(
    (Array.isArray(scorecardSites) ? scorecardSites : [])
      .map((site) => [sanitizeString(site?.site_id, 128).toLowerCase(), site])
      .filter((entry) => entry[0])
  );

  return (Array.isArray(packs) ? packs : []).map((pack) => {
    const effectiveSites = (Array.isArray(pack?.sites) ? pack.sites : [])
      .map((site) => {
        const siteId = sanitizeString(site?.site_id, 128).toLowerCase();
        const effectiveSite = scorecardBySiteId.get(siteId);
        return effectiveSite ? { ...site, ...effectiveSite } : site;
      })
      .filter((site) => shouldIncludeInEffectivePack(pack?.pack_id, site));

    return {
      ...pack,
      effective_site_count: effectiveSites.length,
      sites: effectiveSites,
      product_summary: buildEffectiveProductSummary(effectiveSites)
    };
  });
}

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
  const scorecard = await buildSubmissionSiteScorecard({
    ...(track ? { track } : {}),
    ...(packId ? { pack_id: packId } : {}),
    ...(productStatus ? { product_status: productStatus } : {}),
    telemetry_window_days: req.query?.telemetry_window_days || req.query?.telemetryWindowDays,
    telemetry_limit: req.query?.telemetry_limit || req.query?.telemetryLimit
  }, {
    ownerUserId: auth.user?.id || null
  });
  const productPacks = listSitePacks({
    ...(track ? { track } : {}),
    pack_kind: "product"
  });
  const effectiveProductPacks = buildEffectiveProductPacks(productPacks, scorecard.sites);
  return res.status(200).json({
    ok: true,
    recommended_pack: track ? recommendSitePack(track) : null,
    packs: listSitePacks(track ? { track } : {}),
    product_packs: productPacks,
    effective_product_packs: effectiveProductPacks,
    legacy_packs: listSitePacks({
      ...(track ? { track } : {}),
      pack_kind: "legacy"
    }),
    supported_sites: listSupportedSites({
      ...(track ? { track } : {}),
      ...(packId ? { pack_id: packId } : {}),
      ...(productStatus ? { product_status: productStatus } : {})
    }),
    scorecard_summary: scorecard.summary,
    scorecard_effective_summary: scorecard.effective_summary,
    scorecard_eligibility_summary: scorecard.eligibility_summary,
    scorecard_telemetry_summary: scorecard.telemetry_summary,
    scorecard_telemetry_error: scorecard.telemetry_error,
    scorecard: scorecard.sites
  });
};
