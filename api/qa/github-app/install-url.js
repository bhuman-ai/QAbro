const { requireDashboardOrServiceAuth } = require("../../../lib/auth");
const { parseRequestBody, sanitizeString } = require("../../../lib/qa-core");
const { buildGitHubAppInstallUrl, isGitHubAppConfigured } = require("../../../lib/github-app");
const {
  createPendingInstallStateToken,
  upsertBrandRepoConnection
} = require("../../../lib/qa-brand-repo-connections");

module.exports = async (req, res) => {
  const auth = await requireDashboardOrServiceAuth(req, res);
  if (!auth.ok) {
    return res.status(auth.status || 401).json({ ok: false, error: "Authentication required" });
  }

  const ownerUserId = sanitizeString(auth.user?.id, 128);
  const ownerEmail = sanitizeString(auth.user?.email, 320).toLowerCase();
  if (auth.is_service_token && !ownerUserId) {
    return res.status(400).json({
      ok: false,
      error: "Provide x-owner-user-id or owner_user_id when managing GitHub App connections via service token auth"
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  if (!isGitHubAppConfigured()) {
    return res.status(500).json({ ok: false, error: "GitHub App is not configured" });
  }

  let body;
  try {
    body = await parseRequestBody(req);
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid JSON body" });
  }

  const brandKey = sanitizeString(body?.brand_key || body?.brandKey, 256).toLowerCase();
  if (!brandKey) {
    return res.status(400).json({ ok: false, error: "brand_key is required" });
  }

  const stateToken = createPendingInstallStateToken();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const saved = await upsertBrandRepoConnection(
    {
      brand_key: brandKey,
      provider: "github",
      connection_status: "pending_install",
      pending_state_token: stateToken,
      pending_state_expires_at: expiresAt
    },
    {
      owner_user_id: ownerUserId,
      owner_email: ownerEmail
    }
  );
  if (!saved.ok) {
    return res.status(saved.status || 500).json({ ok: false, error: saved.error });
  }

  const installUrl = buildGitHubAppInstallUrl({ state: stateToken });
  if (!installUrl.ok) {
    return res.status(installUrl.status || 500).json({ ok: false, error: installUrl.error });
  }

  return res.status(200).json({
    ok: true,
    brand_key: brandKey,
    install_url: installUrl.url,
    expires_at: expiresAt
  });
};
