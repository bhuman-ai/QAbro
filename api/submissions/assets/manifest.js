const { sanitizeString } = require("../../../lib/qa-core");
const { loadSubmissionAssetManifest } = require("../../../lib/submission-asset-manifests");
const { requireDashboardOrServiceAuth } = require("../../../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const auth = await requireDashboardOrServiceAuth(req, res);
  if (!auth.ok) {
    return res.status(auth.status || 401).json({ ok: false, error: "Authentication required" });
  }

  const filters = {
    manifest_id: sanitizeString(req.query?.manifest_id || req.query?.manifestId, 128),
    brand_profile_id: sanitizeString(req.query?.brand_profile_id || req.query?.brandProfileId, 128),
    latest: !["0", "false", "no"].includes(
      sanitizeString(req.query?.latest, 16).toLowerCase()
    )
  };

  if (!filters.manifest_id && !filters.brand_profile_id) {
    return res.status(400).json({ ok: false, error: "manifest_id or brand_profile_id is required" });
  }

  const ownerUserId =
    sanitizeString(auth.user?.id, 128) ||
    sanitizeString(req.headers?.["x-owner-user-id"] || req.query?.owner_user_id || req.query?.ownerUserId, 128);
  if (auth.is_service_token && !ownerUserId) {
    return res.status(400).json({ ok: false, error: "owner_user_id is required when using service token auth" });
  }

  const loaded = await loadSubmissionAssetManifest(filters, {
    ownerUserId
  });
  if (!loaded.ok) {
    return res.status(loaded.status || 500).json({ ok: false, error: loaded.error });
  }

  return res.status(200).json({
    ok: true,
    asset_manifest: loaded.row
  });
};
