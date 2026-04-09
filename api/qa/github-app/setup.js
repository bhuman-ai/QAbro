const { requireDashboardOrServiceAuth } = require("../../../lib/auth");
const { getPublicBaseUrl, sanitizeString } = require("../../../lib/qa-core");
const {
  getGitHubInstallation,
  listGitHubInstallationRepositories
} = require("../../../lib/github-app");
const {
  isPendingStateExpired,
  loadBrandRepoConnectionByStateToken,
  upsertBrandRepoConnection
} = require("../../../lib/qa-brand-repo-connections");

function redirect(res, location) {
  res.setHeader("Location", location);
  return res.status(302).end();
}

function buildDashboardRedirect(req, params = {}) {
  const url = new URL("/dashboard", getPublicBaseUrl(req));
  for (const [key, rawValue] of Object.entries(params)) {
    const safeValue = sanitizeString(rawValue, 320);
    if (!safeValue) {
      continue;
    }
    url.searchParams.set(key, safeValue);
  }
  return url.toString();
}

function buildBrandRedirectParams(brandKey, params = {}) {
  const safeBrandKey = sanitizeString(brandKey, 256).toLowerCase();
  if (!safeBrandKey) {
    return { ...params };
  }
  return {
    brand: safeBrandKey,
    github_app_brand: safeBrandKey,
    ...params
  };
}

module.exports = async (req, res) => {
  const auth = await requireDashboardOrServiceAuth(req, res);
  if (!auth.ok) {
    return redirect(
      res,
      buildDashboardRedirect(req, {
        github_app_error: "auth_required"
      })
    );
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const ownerUserId = sanitizeString(auth.user?.id, 128);
  if (auth.is_service_token && !ownerUserId) {
    return res.status(400).json({ ok: false, error: "owner_user_id is required" });
  }

  const installationId = sanitizeString(req.query?.installation_id || req.query?.installationId, 64);
  const stateToken = sanitizeString(req.query?.state, 320);
  if (!installationId || !stateToken) {
    return redirect(
      res,
      buildDashboardRedirect(req, {
        github_app_error: "missing_installation_state"
      })
    );
  }

  const loaded = await loadBrandRepoConnectionByStateToken(stateToken, {
    includeSecrets: true
  });
  if (!loaded.ok) {
    return redirect(
      res,
      buildDashboardRedirect(req, {
        github_app_error: "invalid_state"
      })
    );
  }

  if (loaded.row.owner_user_id !== ownerUserId) {
    return redirect(
      res,
      buildDashboardRedirect(req, buildBrandRedirectParams(loaded.row.brand_key, {
        github_app_error: "state_owner_mismatch",
      }))
    );
  }

  if (isPendingStateExpired(loaded.row)) {
    return redirect(
      res,
      buildDashboardRedirect(req, buildBrandRedirectParams(loaded.row.brand_key, {
        github_app_error: "expired_state",
      }))
    );
  }

  const installation = await getGitHubInstallation(installationId);
  if (!installation.ok) {
    return redirect(
      res,
      buildDashboardRedirect(req, buildBrandRedirectParams(loaded.row.brand_key, {
        github_app_error: "installation_lookup_failed",
      }))
    );
  }

  const listed = await listGitHubInstallationRepositories(installationId);
  if (!listed.ok) {
    return redirect(
      res,
      buildDashboardRedirect(req, buildBrandRedirectParams(loaded.row.brand_key, {
        github_app_error: "repository_lookup_failed",
      }))
    );
  }

  const repos = Array.isArray(listed.repositories) ? listed.repositories : [];
  const autoSelectedRepo = repos.length === 1 ? repos[0] : null;
  const saved = await upsertBrandRepoConnection(
    {
      brand_key: loaded.row.brand_key,
      provider: "github",
      connection_status: autoSelectedRepo ? "connected" : "awaiting_repo_selection",
      installation_id: installationId,
      installation_account_login: installation.data?.account?.login || null,
      installation_account_type: installation.data?.account?.type || null,
      installation_target_type: installation.data?.target_type || null,
      installation_target_id: installation.data?.target_id || null,
      selected_repo_id: autoSelectedRepo?.id || null,
      selected_repo_owner: autoSelectedRepo?.owner || null,
      selected_repo_name: autoSelectedRepo?.name || null,
      selected_repo_full_name: autoSelectedRepo?.full_name || null,
      default_branch: autoSelectedRepo?.default_branch || null,
      pending_state_token: null,
      pending_state_expires_at: null,
      connection: {
        setup_action: sanitizeString(req.query?.setup_action || req.query?.setupAction, 64) || "install",
        repository_count: repos.length
      }
    },
    {
      owner_user_id: loaded.row.owner_user_id,
      owner_email: loaded.row.owner_email
    }
  );

  if (!saved.ok) {
    return redirect(
      res,
      buildDashboardRedirect(req, buildBrandRedirectParams(loaded.row.brand_key, {
        github_app_error: "connection_save_failed",
      }))
    );
  }

  return redirect(
    res,
    buildDashboardRedirect(req, buildBrandRedirectParams(loaded.row.brand_key, {
      panel: autoSelectedRepo ? "overview" : "settings",
      github_app_status: autoSelectedRepo ? "connected" : "repo_selection_required",
    }))
  );
};
