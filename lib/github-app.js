const crypto = require("crypto");

const { isPlainObject, sanitizeOptionalString, sanitizeString } = require("./qa-core");

const DEFAULT_GITHUB_API_BASE_URL = "https://api.github.com";
const DEFAULT_GITHUB_API_VERSION = "2026-03-10";

function normalizeGitHubPrivateKey(value) {
  const raw = sanitizeString(value, 32000);
  if (!raw) {
    return "";
  }
  return raw.replace(/\\n/g, "\n").trim();
}

function getGitHubAppConfig(options = {}) {
  const appId = sanitizeString(
    options.appId || process.env.GITHUB_APP_ID || process.env.QA_GITHUB_APP_ID,
    128
  );
  const slug = sanitizeString(
    options.slug || process.env.GITHUB_APP_SLUG || process.env.QA_GITHUB_APP_SLUG,
    200
  );
  const privateKey = normalizeGitHubPrivateKey(
    options.privateKey || process.env.GITHUB_APP_PRIVATE_KEY || process.env.QA_GITHUB_APP_PRIVATE_KEY
  );
  const apiBaseUrl = sanitizeString(
    options.apiBaseUrl || process.env.GITHUB_API_BASE_URL,
    4096
  ).replace(/\/$/, "") || DEFAULT_GITHUB_API_BASE_URL;
  const apiVersion =
    sanitizeString(options.apiVersion || process.env.GITHUB_API_VERSION, 64) ||
    DEFAULT_GITHUB_API_VERSION;
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  if (!appId || !slug || !privateKey) {
    return {
      ok: false,
      status: 500,
      error: "GitHub App is not configured"
    };
  }

  if (typeof fetchImpl !== "function") {
    return {
      ok: false,
      status: 500,
      error: "fetch is not available"
    };
  }

  return {
    ok: true,
    appId,
    slug,
    privateKey,
    apiBaseUrl,
    apiVersion,
    fetchImpl
  };
}

function isGitHubAppConfigured(options = {}) {
  return getGitHubAppConfig(options).ok;
}

function base64UrlEncode(value) {
  return Buffer.from(String(value || ""), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createGitHubAppJwt(options = {}) {
  const config = getGitHubAppConfig(options);
  if (!config.ok) {
    return config;
  }

  const now = Math.floor((Number.isFinite(Number(options.nowSeconds)) ? Number(options.nowSeconds) : Date.now() / 1000));
  const issuedAt = Math.max(0, now - 60);
  const expiresAt = issuedAt + 9 * 60;
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      iat: issuedAt,
      exp: expiresAt,
      iss: config.appId
    })
  );
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  signer.end();
  const signature = signer
    .sign(config.privateKey)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  return {
    ok: true,
    token: `${header}.${payload}.${signature}`,
    expires_at: new Date(expiresAt * 1000).toISOString()
  };
}

async function parseGitHubResponse(response) {
  const contentType = sanitizeString(response?.headers?.get?.("content-type"), 256).toLowerCase();
  if (!contentType.includes("json")) {
    const text = await response.text().catch(() => "");
    return text ? { message: text } : null;
  }
  return response.json().catch(() => null);
}

async function githubRequest(pathname, requestOptions = {}, runtimeOptions = {}) {
  const config = getGitHubAppConfig(runtimeOptions);
  if (!config.ok) {
    return config;
  }

  const method = sanitizeString(requestOptions.method, 16).toUpperCase() || "GET";
  const authMode = sanitizeString(requestOptions.auth, 32).toLowerCase() || "app";
  const extraHeaders = isPlainObject(requestOptions.headers) ? requestOptions.headers : {};
  const query = isPlainObject(requestOptions.query) ? requestOptions.query : {};
  const body = requestOptions.body;

  let authorization = "";
  if (authMode === "app") {
    const jwt = createGitHubAppJwt(runtimeOptions);
    if (!jwt.ok) {
      return jwt;
    }
    authorization = `Bearer ${jwt.token}`;
  } else if (authMode === "installation") {
    const installationToken = sanitizeString(
      requestOptions.installationToken || runtimeOptions.installationToken,
      4096
    );
    if (!installationToken) {
      return { ok: false, status: 400, error: "installation token is required" };
    }
    authorization = `Bearer ${installationToken}`;
  }

  const url = new URL(pathname, `${config.apiBaseUrl}/`);
  for (const [key, rawValue] of Object.entries(query)) {
    const safeKey = sanitizeString(key, 64);
    const safeValue = sanitizeOptionalString(rawValue, 1024);
    if (!safeKey || safeValue === null) {
      continue;
    }
    url.searchParams.set(safeKey, safeValue);
  }

  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "swarmtester-github-app",
    "X-GitHub-Api-Version": config.apiVersion,
    ...extraHeaders
  };
  if (authorization) {
    headers.Authorization = authorization;
  }
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await config.fetchImpl(url.toString(), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const data = await parseGitHubResponse(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status || 500,
      error:
        sanitizeString(data?.message || data?.error, 500) ||
        `GitHub request failed with status ${response.status || 500}`,
      data
    };
  }

  return {
    ok: true,
    status: response.status || 200,
    data
  };
}

function buildGitHubAppInstallUrl(options = {}) {
  const config = getGitHubAppConfig(options);
  if (!config.ok) {
    return config;
  }
  const state = sanitizeString(options.state, 512);
  if (!state) {
    return { ok: false, status: 400, error: "state is required" };
  }
  const url = new URL(`https://github.com/apps/${config.slug}/installations/new`);
  url.searchParams.set("state", state);
  return {
    ok: true,
    url: url.toString()
  };
}

async function getGitHubInstallation(installationId, options = {}) {
  const safeInstallationId = sanitizeString(installationId, 64);
  if (!safeInstallationId) {
    return { ok: false, status: 400, error: "installation_id is required" };
  }
  return githubRequest(`/app/installations/${safeInstallationId}`, { auth: "app" }, options);
}

async function createGitHubInstallationAccessToken(installationId, options = {}) {
  const safeInstallationId = sanitizeString(installationId, 64);
  if (!safeInstallationId) {
    return { ok: false, status: 400, error: "installation_id is required" };
  }
  return githubRequest(
    `/app/installations/${safeInstallationId}/access_tokens`,
    {
      auth: "app",
      method: "POST"
    },
    options
  );
}

function normalizeGitHubRepository(value) {
  const repo = isPlainObject(value) ? value : {};
  const owner = isPlainObject(repo.owner) ? repo.owner : {};
  const ownerLogin = sanitizeString(owner.login, 200);
  const repoName = sanitizeString(repo.name, 200);
  const fullName =
    sanitizeString(repo.full_name, 320) ||
    (ownerLogin && repoName ? `${ownerLogin}/${repoName}` : "");
  return {
    id: Number.isFinite(Number(repo.id)) ? Number(repo.id) : null,
    owner: ownerLogin || null,
    name: repoName || null,
    full_name: fullName || null,
    private: repo.private === true,
    default_branch: sanitizeOptionalString(repo.default_branch, 128) || null,
    html_url: sanitizeOptionalString(repo.html_url, 4096) || null
  };
}

function splitRepositoryFullName(value) {
  const safe = sanitizeString(value, 320);
  const [owner, ...nameParts] = safe.split("/").map((part) => part.trim()).filter(Boolean);
  if (!owner || !nameParts.length) {
    return { owner: "", repo: "" };
  }
  return {
    owner,
    repo: nameParts.join("/")
  };
}

async function listGitHubInstallationRepositories(installationId, options = {}) {
  const tokenResult = await createGitHubInstallationAccessToken(installationId, options);
  if (!tokenResult.ok) {
    return tokenResult;
  }

  const installationToken = sanitizeString(tokenResult.data?.token, 4096);
  if (!installationToken) {
    return { ok: false, status: 502, error: "GitHub did not return an installation token" };
  }

  const repositories = [];
  const perPage = 100;

  for (let page = 1; page <= 5; page += 1) {
    const listed = await githubRequest(
      "/installation/repositories",
      {
        auth: "installation",
        installationToken,
        query: {
          per_page: String(perPage),
          page: String(page)
        }
      },
      options
    );
    if (!listed.ok) {
      return listed;
    }

    const rows = Array.isArray(listed.data?.repositories) ? listed.data.repositories : [];
    repositories.push(...rows.map(normalizeGitHubRepository).filter((repo) => repo.full_name));
    if (rows.length < perPage) {
      break;
    }
  }

  return {
    ok: true,
    status: 200,
    token: installationToken,
    expires_at: sanitizeOptionalString(tokenResult.data?.expires_at, 128) || null,
    repositories
  };
}

async function getGitHubInstallationRepository(installationId, repoFullName, options = {}) {
  const safeInstallationId = sanitizeString(installationId, 64);
  const { owner, repo } = splitRepositoryFullName(repoFullName);
  if (!safeInstallationId) {
    return { ok: false, status: 400, error: "installation_id is required" };
  }
  if (!owner || !repo) {
    return { ok: false, status: 400, error: "repo_full_name must be in owner/name format" };
  }

  const tokenResult = await createGitHubInstallationAccessToken(safeInstallationId, options);
  if (!tokenResult.ok) {
    return tokenResult;
  }

  const installationToken = sanitizeString(tokenResult.data?.token, 4096);
  if (!installationToken) {
    return { ok: false, status: 502, error: "GitHub did not return an installation token" };
  }

  const repositoryResult = await githubRequest(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    {
      auth: "installation",
      installationToken
    },
    options
  );
  if (!repositoryResult.ok) {
    return repositoryResult;
  }

  return {
    ok: true,
    status: repositoryResult.status,
    token: installationToken,
    expires_at: sanitizeOptionalString(tokenResult.data?.expires_at, 128) || null,
    repository: normalizeGitHubRepository(repositoryResult.data),
    data: repositoryResult.data
  };
}

async function getGitHubInstallationRepositoryTree(installationId, repoFullName, options = {}) {
  const repositoryResult = await getGitHubInstallationRepository(installationId, repoFullName, options);
  if (!repositoryResult.ok) {
    return repositoryResult;
  }

  const { owner, repo } = splitRepositoryFullName(repoFullName);
  const ref =
    sanitizeString(options.ref, 256) ||
    sanitizeString(repositoryResult.repository?.default_branch, 128) ||
    "HEAD";
  const treeResult = await githubRequest(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(ref)}`,
    {
      auth: "installation",
      installationToken: repositoryResult.token,
      query: {
        recursive: "1"
      }
    },
    options
  );
  if (!treeResult.ok) {
    return treeResult;
  }

  return {
    ok: true,
    status: treeResult.status,
    repository: repositoryResult.repository,
    tree: Array.isArray(treeResult.data?.tree) ? treeResult.data.tree : [],
    truncated: treeResult.data?.truncated === true
  };
}

async function getGitHubInstallationRepositoryBlob(installationId, repoFullName, blobSha, options = {}) {
  const safeBlobSha = sanitizeString(blobSha, 256);
  if (!safeBlobSha) {
    return { ok: false, status: 400, error: "blob_sha is required" };
  }

  const repositoryResult = await getGitHubInstallationRepository(installationId, repoFullName, options);
  if (!repositoryResult.ok) {
    return repositoryResult;
  }

  const { owner, repo } = splitRepositoryFullName(repoFullName);
  const blobResult = await githubRequest(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs/${encodeURIComponent(safeBlobSha)}`,
    {
      auth: "installation",
      installationToken: repositoryResult.token
    },
    options
  );
  if (!blobResult.ok) {
    return blobResult;
  }

  const encoding = sanitizeString(blobResult.data?.encoding, 64).toLowerCase();
  const rawContent = sanitizeString(blobResult.data?.content, 2000000);
  let text = "";
  if (encoding === "base64" && rawContent) {
    try {
      text = Buffer.from(rawContent.replace(/\s+/g, ""), "base64").toString("utf8");
    } catch {
      text = "";
    }
  }

  return {
    ok: true,
    status: blobResult.status,
    repository: repositoryResult.repository,
    blob: {
      sha: sanitizeOptionalString(blobResult.data?.sha, 256) || safeBlobSha,
      size: Number.isFinite(Number(blobResult.data?.size)) ? Number(blobResult.data.size) : null,
      encoding: encoding || null,
      text: text || null
    }
  };
}

module.exports = {
  DEFAULT_GITHUB_API_BASE_URL,
  DEFAULT_GITHUB_API_VERSION,
  normalizeGitHubPrivateKey,
  getGitHubAppConfig,
  isGitHubAppConfigured,
  createGitHubAppJwt,
  buildGitHubAppInstallUrl,
  getGitHubInstallation,
  createGitHubInstallationAccessToken,
  getGitHubInstallationRepository,
  getGitHubInstallationRepositoryTree,
  getGitHubInstallationRepositoryBlob,
  listGitHubInstallationRepositories,
  normalizeGitHubRepository
};
