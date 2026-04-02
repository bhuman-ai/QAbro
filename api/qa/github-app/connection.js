const { requireDashboardOrServiceAuth } = require("../../../lib/auth");
const { parseRequestBody, sanitizeString } = require("../../../lib/qa-core");
const {
  isGitHubAppConfigured,
  listGitHubInstallationRepositories
} = require("../../../lib/github-app");
const {
  deleteBrandRepoConnection,
  loadBrandRepoConnection,
  upsertBrandRepoConnection
} = require("../../../lib/qa-brand-repo-connections");

function buildConnectionSummary(row, repositories = []) {
  const safeRow = row && typeof row === "object" ? row : null;
  return {
    brand_key: safeRow?.brand_key || null,
    provider: safeRow?.provider || "github",
    connection_status: safeRow?.connection_status || "pending_install",
    installation_id: safeRow?.installation_id || null,
    installation_account_login: safeRow?.installation_account_login || null,
    installation_account_type: safeRow?.installation_account_type || null,
    selected_repo_id: safeRow?.selected_repo_id || null,
    selected_repo_owner: safeRow?.selected_repo_owner || null,
    selected_repo_name: safeRow?.selected_repo_name || null,
    selected_repo_full_name: safeRow?.selected_repo_full_name || null,
    default_branch: safeRow?.default_branch || null,
    path_allowlist: Array.isArray(safeRow?.path_allowlist) ? safeRow.path_allowlist : [],
    repositories: Array.isArray(repositories) ? repositories : [],
    updated_at: safeRow?.updated_at || null
  };
}

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

  if (req.method === "GET") {
    const brandKey = sanitizeString(req.query?.brand_key || req.query?.brandKey, 256).toLowerCase();
    if (!brandKey) {
      return res.status(400).json({ ok: false, error: "brand_key is required" });
    }

    const loaded = await loadBrandRepoConnection(brandKey, {
      ownerUserId
    });
    if (!loaded.ok && loaded.status !== 404) {
      return res.status(loaded.status || 500).json({ ok: false, error: loaded.error });
    }

    let repositories = [];
    let warning = "";
    const includeRepositories =
      String(req.query?.include_repositories || req.query?.includeRepositories || "").trim() === "1";
    if (includeRepositories && loaded.ok && loaded.row?.installation_id && isGitHubAppConfigured()) {
      const listed = await listGitHubInstallationRepositories(loaded.row.installation_id);
      if (listed.ok) {
        repositories = listed.repositories;
      } else {
        warning = listed.error || "Could not load GitHub repositories";
      }
    }

    return res.status(200).json({
      ok: true,
      app_configured: isGitHubAppConfigured(),
      connection: loaded.ok ? buildConnectionSummary(loaded.row, repositories) : null,
      repositories,
      warning: warning || null
    });
  }

  if (req.method === "POST") {
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

    const loaded = await loadBrandRepoConnection(brandKey, {
      ownerUserId
    });
    if (!loaded.ok) {
      return res.status(loaded.status || 500).json({ ok: false, error: loaded.error });
    }
    if (!loaded.row.installation_id) {
      return res.status(409).json({ ok: false, error: "Connect the GitHub App before choosing a repository" });
    }

    const listed = await listGitHubInstallationRepositories(loaded.row.installation_id);
    if (!listed.ok) {
      return res.status(listed.status || 502).json({ ok: false, error: listed.error });
    }

    const requestedFullName =
      sanitizeString(body?.repo_full_name || body?.repoFullName, 320) ||
      [
        sanitizeString(body?.repo_owner || body?.repoOwner, 200),
        sanitizeString(body?.repo_name || body?.repoName, 200)
      ]
        .filter(Boolean)
        .join("/");
    if (!requestedFullName) {
      return res.status(400).json({ ok: false, error: "repo_full_name is required" });
    }

    const selectedRepo = listed.repositories.find(
      (repo) => String(repo.full_name || "").toLowerCase() === requestedFullName.toLowerCase()
    );
    if (!selectedRepo) {
      return res.status(404).json({ ok: false, error: "Selected repository is not available to this installation" });
    }

    const saved = await upsertBrandRepoConnection(
      {
        brand_key: brandKey,
        provider: "github",
        connection_status: "connected",
        installation_id: loaded.row.installation_id,
        installation_account_login: loaded.row.installation_account_login,
        installation_account_type: loaded.row.installation_account_type,
        installation_target_type: loaded.row.installation_target_type,
        installation_target_id: loaded.row.installation_target_id,
        selected_repo_id: selectedRepo.id,
        selected_repo_owner: selectedRepo.owner,
        selected_repo_name: selectedRepo.name,
        selected_repo_full_name: selectedRepo.full_name,
        default_branch: selectedRepo.default_branch,
        path_allowlist: body?.path_allowlist || body?.pathAllowlist || loaded.row.path_allowlist,
        connection: {
          installed_via: "github_app"
        }
      },
      {
        owner_user_id: ownerUserId,
        owner_email: ownerEmail
      }
    );
    if (!saved.ok) {
      return res.status(saved.status || 500).json({ ok: false, error: saved.error });
    }

    return res.status(200).json({
      ok: true,
      app_configured: true,
      connection: buildConnectionSummary(saved.row, listed.repositories),
      repositories: listed.repositories
    });
  }

  if (req.method === "DELETE") {
    const brandKey = sanitizeString(req.query?.brand_key || req.query?.brandKey, 256).toLowerCase();
    if (!brandKey) {
      return res.status(400).json({ ok: false, error: "brand_key is required" });
    }

    const deleted = await deleteBrandRepoConnection(brandKey, {
      ownerUserId
    });
    if (!deleted.ok) {
      return res.status(deleted.status || 500).json({ ok: false, error: deleted.error });
    }

    return res.status(200).json({
      ok: true,
      brand_key: brandKey,
      disconnected: true
    });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
};
