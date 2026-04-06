const { requireDashboardOrServiceAuth } = require("../../../lib/auth");
const { sanitizeString } = require("../../../lib/qa-core");
const { inferRoutesFromGitHubTree } = require("../../../lib/qa-github-routes");
const { getGitHubInstallationRepositoryTree, isGitHubAppConfigured } = require("../../../lib/github-app");
const { loadBrandRepoConnection } = require("../../../lib/qa-brand-repo-connections");

module.exports = async (req, res) => {
  const auth = await requireDashboardOrServiceAuth(req, res);
  if (!auth.ok) {
    return res.status(auth.status || 401).json({ ok: false, error: "Authentication required" });
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  if (!isGitHubAppConfigured()) {
    return res.status(500).json({ ok: false, error: "GitHub App is not configured" });
  }

  const ownerUserId = sanitizeString(auth.user?.id, 128);
  const brandKey = sanitizeString(req.query?.brand_key || req.query?.brandKey, 256).toLowerCase();
  if (!brandKey) {
    return res.status(400).json({ ok: false, error: "brand_key is required" });
  }

  const loaded = await loadBrandRepoConnection(brandKey, {
    ownerUserId
  });
  if (!loaded.ok) {
    return res.status(loaded.status || 500).json({ ok: false, error: loaded.error });
  }

  const connection = loaded.row || {};
  if (!connection.installation_id || !connection.selected_repo_full_name) {
    return res.status(409).json({ ok: false, error: "Connect a GitHub repository before loading route hints" });
  }

  const treeResult = await getGitHubInstallationRepositoryTree(connection.installation_id, connection.selected_repo_full_name, {
    ref: connection.default_branch || undefined
  });
  if (!treeResult.ok) {
    return res.status(treeResult.status || 502).json({ ok: false, error: treeResult.error || "Could not load repository tree" });
  }

  const routes = inferRoutesFromGitHubTree(treeResult.tree);
  return res.status(200).json({
    ok: true,
    repo_full_name: connection.selected_repo_full_name,
    default_branch: treeResult.repository?.default_branch || connection.default_branch || null,
    truncated: treeResult.truncated === true,
    routes
  });
};
