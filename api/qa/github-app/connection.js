const { requireDashboardOrServiceAuth } = require("../../../lib/auth");
const { parseRequestBody, sanitizeString } = require("../../../lib/qa-core");
const {
  isGitHubAppConfigured,
  listGitHubInstallationRepositories
} = require("../../../lib/github-app");
const {
  deleteBrandRepoConnection,
  loadBrandRepoConnection,
  listOwnerBrandRepoConnections,
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
    associated_repo_full_names: Array.isArray(safeRow?.associated_repo_full_names)
      ? safeRow.associated_repo_full_names
      : safeRow?.selected_repo_full_name
        ? [safeRow.selected_repo_full_name]
        : [],
    default_branch: safeRow?.default_branch || null,
    path_allowlist: Array.isArray(safeRow?.path_allowlist) ? safeRow.path_allowlist : [],
    repositories: Array.isArray(repositories) ? repositories : [],
    updated_at: safeRow?.updated_at || null
  };
}

function sanitizeRepoList(value) {
  const input = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/\r?\n|,/g)
        .map((item) => item.trim())
        .filter(Boolean);
  const seen = new Set();
  const repos = [];
  for (const rawItem of input) {
    const safeItem = sanitizeString(rawItem, 320);
    if (!safeItem) {
      continue;
    }
    const key = safeItem.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    repos.push(safeItem);
    if (repos.length >= 8) {
      break;
    }
  }
  return repos;
}

async function reconcileBrandInstallation(connectionRow, owner) {
  const safeConnection = connectionRow && typeof connectionRow === "object" ? connectionRow : null;
  if (!safeConnection) {
    return { ok: false, status: 404, error: "Brand repo connection not found" };
  }

  const ownerUserId = sanitizeString(owner?.ownerUserId, 128);
  if (!ownerUserId) {
    return { ok: false, status: 400, error: "owner_user_id is required" };
  }

  const ownedConnections = await listOwnerBrandRepoConnections(ownerUserId, {
    includeSecrets: true
  });
  if (!ownedConnections.ok) {
    return ownedConnections;
  }

  const reusableConnections = (ownedConnections.rows || []).filter(
    (row) =>
      normalizeString(row?.brand_key) !== normalizeString(safeConnection.brand_key) &&
      Number.isFinite(Number(row?.installation_id)) &&
      String(row?.installation_id || "").trim()
  );
  const uniqueInstallationIds = Array.from(
    new Set(reusableConnections.map((row) => String(row.installation_id || "").trim()).filter(Boolean))
  );

  const installationId =
    String(safeConnection.installation_id || "").trim() ||
    (uniqueInstallationIds.length === 1 ? uniqueInstallationIds[0] : "");
  if (!installationId) {
    return {
      ok: false,
      status: 409,
      error:
        uniqueInstallationIds.length > 1
          ? "GitHub is installed for multiple accounts. Reconnect and choose the right account, then refresh."
          : "GitHub install is still pending. Finish the GitHub popup, then refresh."
    };
  }

  const reusableConnection =
    reusableConnections.find((row) => String(row.installation_id || "").trim() === installationId) || safeConnection;
  const listed = await listGitHubInstallationRepositories(installationId);
  if (!listed.ok) {
    return listed;
  }

  const repositories = Array.isArray(listed.repositories) ? listed.repositories : [];
  const autoSelectedRepo = repositories.length === 1 ? repositories[0] : null;
  const saved = await upsertBrandRepoConnection(
    {
      brand_key: safeConnection.brand_key,
      provider: "github",
      connection_status: autoSelectedRepo ? "connected" : "awaiting_repo_selection",
      installation_id: Number(installationId),
      installation_account_login: reusableConnection.installation_account_login || null,
      installation_account_type: reusableConnection.installation_account_type || null,
      installation_target_type: reusableConnection.installation_target_type || null,
      installation_target_id: reusableConnection.installation_target_id || null,
      selected_repo_id: autoSelectedRepo?.id || null,
      selected_repo_owner: autoSelectedRepo?.owner || null,
      selected_repo_name: autoSelectedRepo?.name || null,
      selected_repo_full_name: autoSelectedRepo?.full_name || null,
      default_branch: autoSelectedRepo?.default_branch || null,
      pending_state_token: null,
      pending_state_expires_at: null,
      connection: {
        ...(reusableConnection.connection && typeof reusableConnection.connection === "object" ? reusableConnection.connection : {}),
        reused_for_brand: safeConnection.brand_key,
        repository_count: repositories.length
      },
      associated_repo_full_names: autoSelectedRepo?.full_name ? [autoSelectedRepo.full_name] : []
    },
    {
      owner_user_id: ownerUserId,
      owner_email: safeConnection.owner_email || sanitizeString(owner?.ownerEmail, 320).toLowerCase()
    }
  );
  if (!saved.ok) {
    return saved;
  }

  return {
    ok: true,
    status: 200,
    row: saved.row,
    repositories
  };
}

function normalizeString(value) {
  return sanitizeString(value, 256).toLowerCase();
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
    const shouldReconcile =
      String(req.query?.reconcile || req.query?.refresh || "").trim() === "1";
    let connectionRow = loaded.ok ? loaded.row : null;
    if (
      shouldReconcile &&
      connectionRow &&
      connectionRow.connection_status === "pending_install" &&
      isGitHubAppConfigured()
    ) {
      const reconciled = await reconcileBrandInstallation(connectionRow, {
        ownerUserId,
        ownerEmail
      });
      if (reconciled.ok) {
        connectionRow = reconciled.row;
        repositories = Array.isArray(reconciled.repositories) ? reconciled.repositories : [];
      } else {
        warning = reconciled.error || "";
      }
    }
    if (includeRepositories && connectionRow?.installation_id && isGitHubAppConfigured() && !repositories.length) {
      const listed = await listGitHubInstallationRepositories(connectionRow.installation_id);
      if (listed.ok) {
        repositories = listed.repositories;
      } else {
        warning = listed.error || "Could not load GitHub repositories";
      }
    }

    return res.status(200).json({
      ok: true,
      app_configured: isGitHubAppConfigured(),
      connection: connectionRow ? buildConnectionSummary(connectionRow, repositories) : null,
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
    const requestedAssociatedRepoFullNames = sanitizeRepoList(
      body?.associated_repo_full_names || body?.associatedRepoFullNames || []
    );
    const effectivePrimaryRepoFullName =
      requestedFullName ||
      sanitizeString(loaded.row.selected_repo_full_name, 320) ||
      requestedAssociatedRepoFullNames[0] ||
      "";
    if (!effectivePrimaryRepoFullName) {
      return res.status(400).json({ ok: false, error: "repo_full_name is required" });
    }

    const selectedRepo = listed.repositories.find(
      (repo) => String(repo.full_name || "").toLowerCase() === effectivePrimaryRepoFullName.toLowerCase()
    );
    if (!selectedRepo) {
      return res.status(404).json({ ok: false, error: "Selected repository is not available to this installation" });
    }

    const effectiveAssociatedRepoFullNames = Array.from(
      new Set([selectedRepo.full_name, ...requestedAssociatedRepoFullNames].filter(Boolean))
    );
    const availableRepoMap = new Map(
      listed.repositories
        .filter((repo) => repo.full_name)
        .map((repo) => [String(repo.full_name).toLowerCase(), repo])
    );
    const invalidAssociatedRepo = effectiveAssociatedRepoFullNames.find(
      (repoFullName) => !availableRepoMap.has(String(repoFullName).toLowerCase())
    );
    if (invalidAssociatedRepo) {
      return res.status(404).json({
        ok: false,
        error: `Repository ${invalidAssociatedRepo} is not available to this installation`
      });
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
          ...(loaded.row.connection && typeof loaded.row.connection === "object" ? loaded.row.connection : {}),
          installed_via: "github_app"
        },
        associated_repo_full_names: effectiveAssociatedRepoFullNames
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
