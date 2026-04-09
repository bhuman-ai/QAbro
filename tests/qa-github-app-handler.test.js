const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const installUrlHandler = require("../api/qa/github-app/install-url");
const connectionHandler = require("../api/qa/github-app/connection");
const routesHandler = require("../api/qa/github-app/routes");
const setupHandler = require("../api/qa/github-app/setup");

const { privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048
});
const TEST_GITHUB_PRIVATE_KEY = privateKey.export({ type: "pkcs1", format: "pem" });

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    ended: false,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.ended = true;
      return this;
    },
    end(payload = null) {
      this.body = payload;
      this.ended = true;
      return this;
    }
  };
}

async function withEnv(overrides, callback) {
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined || value === null) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  }

  try {
    return await callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("github app install-url handler persists pending brand connection state", async () => {
  const originalFetch = global.fetch;
  const savedRows = [];

  global.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    if (requestUrl.includes("/rest/v1/swarmtest_brand_repo_connections")) {
      const rows = JSON.parse(options.body || "[]");
      savedRows.push(rows[0]);
      return {
        ok: true,
        status: 200,
        async json() {
          return rows;
        }
      };
    }
    throw new Error(`Unexpected fetch: ${requestUrl}`);
  };

  try {
    await withEnv(
      {
        QA_SERVICE_TOKEN: "service-token",
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_KEY: "service-key",
        GITHUB_APP_ID: "12345",
        GITHUB_APP_SLUG: "swarmtester-qa",
        GITHUB_APP_PRIVATE_KEY: TEST_GITHUB_PRIVATE_KEY
      },
      async () => {
        const req = {
          method: "POST",
          body: {
            brand_key: "acme"
          },
          headers: {
            "x-qa-service-token": "service-token",
            "x-owner-user-id": "user_123"
          }
        };
        const res = createRes();

        await installUrlHandler(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.ok, true);
        assert.match(res.body.install_url, /^https:\/\/github\.com\/apps\/swarmtester-qa\/installations\/new\?state=/);
        assert.equal(savedRows.length, 1);
        assert.equal(savedRows[0].brand_key, "acme");
        assert.equal(savedRows[0].connection_status, "pending_install");
        assert.ok(savedRows[0].pending_state_token);
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("github app connection handler returns saved connection with installation repositories", async () => {
  const originalFetch = global.fetch;

  global.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    if (requestUrl.includes("/rest/v1/swarmtest_brand_repo_connections")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return [
            {
              brand_key: "acme",
              provider: "github",
              connection_status: "connected",
              installation_id: 789,
              installation_account_login: "acme-org",
              selected_repo_id: 10,
              selected_repo_owner: "acme-org",
              selected_repo_name: "web",
              selected_repo_full_name: "acme-org/web",
              default_branch: "main",
              path_allowlist: ["apps/web"]
            }
          ];
        }
      };
    }
    if (requestUrl === "https://api.github.com/app/installations/789/access_tokens") {
      return {
        ok: true,
        status: 201,
        headers: new Headers({ "content-type": "application/json" }),
        async json() {
          return {
            token: "inst_token_123",
            expires_at: "2026-04-01T13:00:00.000Z"
          };
        }
      };
    }
    if (requestUrl === "https://api.github.com/installation/repositories?per_page=100&page=1") {
      assert.equal(options.headers.Authorization, "Bearer inst_token_123");
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        async json() {
          return {
            total_count: 2,
            repositories: [
              {
                id: 10,
                name: "web",
                full_name: "acme-org/web",
                default_branch: "main",
                private: true,
                owner: { login: "acme-org" }
              },
              {
                id: 11,
                name: "docs",
                full_name: "acme-org/docs",
                default_branch: "main",
                private: true,
                owner: { login: "acme-org" }
              }
            ]
          };
        }
      };
    }
    throw new Error(`Unexpected fetch: ${requestUrl}`);
  };

  try {
    await withEnv(
      {
        QA_SERVICE_TOKEN: "service-token",
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_KEY: "service-key",
        GITHUB_APP_ID: "12345",
        GITHUB_APP_SLUG: "swarmtester-qa",
        GITHUB_APP_PRIVATE_KEY: TEST_GITHUB_PRIVATE_KEY
      },
      async () => {
        const req = {
          method: "GET",
          query: {
            brand_key: "acme",
            include_repositories: "1"
          },
          headers: {
            "x-qa-service-token": "service-token",
            "x-owner-user-id": "user_123"
          }
        };
        const res = createRes();

        await connectionHandler(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.ok, true);
        assert.equal(res.body.connection.selected_repo_full_name, "acme-org/web");
        assert.deepEqual(res.body.connection.associated_repo_full_names, ["acme-org/web"]);
        assert.equal(res.body.repositories.length, 2);
        assert.equal(res.body.repositories[1].full_name, "acme-org/docs");
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("github app connection handler reconciles pending installs with the owner's existing installation", async () => {
  const originalFetch = global.fetch;
  const upsertRows = [];

  global.fetch = async (url, options = {}) => {
    const requestUrl = new URL(String(url));

    if (requestUrl.pathname.endsWith("/rest/v1/swarmtest_brand_repo_connections") && (!options.method || options.method === "GET")) {
      if (requestUrl.searchParams.get("brand_key") === "eq.acme") {
        return {
          ok: true,
          status: 200,
          async json() {
            return [
              {
                owner_user_id: "user_123",
                owner_email: "owner@example.com",
                brand_key: "acme",
                provider: "github",
                connection_status: "pending_install",
                installation_id: null,
                pending_state_token: "pending_state_123"
              }
            ];
          }
        };
      }

      if (requestUrl.searchParams.get("owner_user_id") === "eq.user_123") {
        return {
          ok: true,
          status: 200,
          async json() {
            return [
              {
                owner_user_id: "user_123",
                owner_email: "owner@example.com",
                brand_key: "clusterseo.com",
                provider: "github",
                connection_status: "connected",
                installation_id: 789,
                installation_account_login: "acme-org",
                installation_account_type: "Organization",
                selected_repo_id: 10,
                selected_repo_owner: "acme-org",
                selected_repo_name: "web",
                selected_repo_full_name: "acme-org/web",
                default_branch: "main"
              },
              {
                owner_user_id: "user_123",
                owner_email: "owner@example.com",
                brand_key: "acme",
                provider: "github",
                connection_status: "pending_install",
                installation_id: null,
                pending_state_token: "pending_state_123"
              }
            ];
          }
        };
      }
    }

    if (requestUrl.toString() === "https://api.github.com/app/installations/789/access_tokens") {
      return {
        ok: true,
        status: 201,
        headers: new Headers({ "content-type": "application/json" }),
        async json() {
          return {
            token: "inst_token_123",
            expires_at: "2026-04-01T13:00:00.000Z"
          };
        }
      };
    }

    if (requestUrl.toString() === "https://api.github.com/installation/repositories?per_page=100&page=1") {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        async json() {
          return {
            total_count: 2,
            repositories: [
              {
                id: 10,
                name: "web",
                full_name: "acme-org/web",
                default_branch: "main",
                private: true,
                owner: { login: "acme-org" }
              },
              {
                id: 11,
                name: "docs",
                full_name: "acme-org/docs",
                default_branch: "main",
                private: true,
                owner: { login: "acme-org" }
              }
            ]
          };
        }
      };
    }

    if (requestUrl.pathname.endsWith("/rest/v1/swarmtest_brand_repo_connections") && options.method === "POST") {
      const rows = JSON.parse(options.body || "[]");
      upsertRows.push(rows[0]);
      return {
        ok: true,
        status: 200,
        async json() {
          return rows;
        }
      };
    }

    throw new Error(`Unexpected fetch: ${requestUrl.toString()}`);
  };

  try {
    await withEnv(
      {
        QA_SERVICE_TOKEN: "service-token",
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_KEY: "service-key",
        GITHUB_APP_ID: "12345",
        GITHUB_APP_SLUG: "swarmtester-qa",
        GITHUB_APP_PRIVATE_KEY: TEST_GITHUB_PRIVATE_KEY
      },
      async () => {
        const req = {
          method: "GET",
          query: {
            brand_key: "acme",
            include_repositories: "1",
            reconcile: "1"
          },
          headers: {
            "x-qa-service-token": "service-token",
            "x-owner-user-id": "user_123"
          }
        };
        const res = createRes();

        await connectionHandler(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.ok, true);
        assert.equal(res.body.connection.connection_status, "awaiting_repo_selection");
        assert.equal(res.body.connection.installation_id, 789);
        assert.equal(res.body.connection.installation_account_login, "acme-org");
        assert.equal(res.body.connection.selected_repo_full_name, null);
        assert.equal(res.body.repositories.length, 2);
        assert.equal(upsertRows.length, 1);
        assert.equal(upsertRows[0].brand_key, "acme");
        assert.equal(upsertRows[0].connection_status, "awaiting_repo_selection");
        assert.equal(upsertRows[0].installation_id, 789);
        assert.equal(upsertRows[0].pending_state_token, null);
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("github app routes handler infers route hints from the connected repository", async () => {
  const originalFetch = global.fetch;

  global.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    if (requestUrl.includes("/rest/v1/swarmtest_brand_repo_connections")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return [
            {
              brand_key: "acme",
              provider: "github",
              connection_status: "connected",
              installation_id: 789,
              installation_account_login: "acme-org",
              selected_repo_full_name: "acme-org/web",
              default_branch: "main"
            }
          ];
        }
      };
    }
    if (requestUrl === "https://api.github.com/app/installations/789/access_tokens") {
      return {
        ok: true,
        status: 201,
        headers: new Headers({ "content-type": "application/json" }),
        async json() {
          return {
            token: "inst_token_123",
            expires_at: "2026-04-01T13:00:00.000Z"
          };
        }
      };
    }
    if (requestUrl === "https://api.github.com/repos/acme-org/web") {
      assert.equal(options.headers.Authorization, "Bearer inst_token_123");
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        async json() {
          return {
            id: 10,
            name: "web",
            full_name: "acme-org/web",
            default_branch: "main",
            owner: { login: "acme-org" }
          };
        }
      };
    }
    if (requestUrl === "https://api.github.com/repos/acme-org/web/git/trees/main?recursive=1") {
      assert.equal(options.headers.Authorization, "Bearer inst_token_123");
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        async json() {
          return {
            truncated: false,
            tree: [
              { path: "app/page.tsx", type: "blob" },
              { path: "app/signup/page.tsx", type: "blob" },
              { path: "app/onboarding/page.tsx", type: "blob" },
              { path: "app/dashboard/[teamId]/page.tsx", type: "blob" }
            ]
          };
        }
      };
    }
    throw new Error(`Unexpected fetch: ${requestUrl}`);
  };

  try {
    await withEnv(
      {
        QA_SERVICE_TOKEN: "service-token",
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_KEY: "service-key",
        GITHUB_APP_ID: "12345",
        GITHUB_APP_SLUG: "swarmtester-qa",
        GITHUB_APP_PRIVATE_KEY: TEST_GITHUB_PRIVATE_KEY
      },
      async () => {
        const req = {
          method: "GET",
          query: {
            brand_key: "acme"
          },
          headers: {
            "x-qa-service-token": "service-token",
            "x-owner-user-id": "user_123"
          }
        };
        const res = createRes();

        await routesHandler(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.ok, true);
        assert.equal(res.body.routes[0].path, "/");
        assert.deepEqual(
          res.body.routes.map((route) => route.path),
          ["/", "/onboarding", "/signup", "/dashboard/:teamId"]
        );
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("github app connection handler saves the selected repo for a brand", async () => {
  const originalFetch = global.fetch;
  const upsertRows = [];

  global.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    if (requestUrl.includes("/rest/v1/swarmtest_brand_repo_connections") && !options.method) {
      return {
        ok: true,
        status: 200,
        async json() {
          return [
            {
              brand_key: "acme",
              provider: "github",
              connection_status: "awaiting_repo_selection",
              installation_id: 789,
              installation_account_login: "acme-org",
              path_allowlist: ["apps/web"]
            }
          ];
        }
      };
    }
    if (requestUrl === "https://api.github.com/app/installations/789/access_tokens") {
      return {
        ok: true,
        status: 201,
        headers: new Headers({ "content-type": "application/json" }),
        async json() {
          return {
            token: "inst_token_123",
            expires_at: "2026-04-01T13:00:00.000Z"
          };
        }
      };
    }
    if (requestUrl === "https://api.github.com/installation/repositories?per_page=100&page=1") {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        async json() {
          return {
            total_count: 2,
            repositories: [
              {
                id: 10,
                name: "web",
                full_name: "acme-org/web",
                default_branch: "main",
                private: true,
                owner: { login: "acme-org" }
              },
              {
                id: 11,
                name: "docs",
                full_name: "acme-org/docs",
                default_branch: "main",
                private: true,
                owner: { login: "acme-org" }
              }
            ]
          };
        }
      };
    }
    if (requestUrl.includes("/rest/v1/swarmtest_brand_repo_connections") && options.method === "POST") {
      const rows = JSON.parse(options.body || "[]");
      upsertRows.push(rows[0]);
      return {
        ok: true,
        status: 200,
        async json() {
          return rows;
        }
      };
    }
    throw new Error(`Unexpected fetch: ${requestUrl}`);
  };

  try {
    await withEnv(
      {
        QA_SERVICE_TOKEN: "service-token",
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_KEY: "service-key",
        GITHUB_APP_ID: "12345",
        GITHUB_APP_SLUG: "swarmtester-qa",
        GITHUB_APP_PRIVATE_KEY: TEST_GITHUB_PRIVATE_KEY
      },
      async () => {
        const req = {
          method: "POST",
          body: {
            brand_key: "acme",
            repo_full_name: "acme-org/docs",
            associated_repo_full_names: ["acme-org/web", "acme-org/docs"],
            path_allowlist: ["apps/docs"]
          },
          headers: {
            "x-qa-service-token": "service-token",
            "x-owner-user-id": "user_123"
          }
        };
        const res = createRes();

        await connectionHandler(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.ok, true);
        assert.equal(res.body.connection.selected_repo_full_name, "acme-org/docs");
        assert.deepEqual(res.body.connection.associated_repo_full_names, ["acme-org/docs", "acme-org/web"]);
        assert.equal(upsertRows.length, 1);
        assert.equal(upsertRows[0].selected_repo_full_name, "acme-org/docs");
        assert.deepEqual(upsertRows[0].path_allowlist, ["apps/docs"]);
        assert.deepEqual(upsertRows[0].connection.associated_repo_full_names, ["acme-org/docs", "acme-org/web"]);
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("github app setup handler finalizes the installation and redirects back to dashboard", async () => {
  const originalFetch = global.fetch;
  const upsertRows = [];

  global.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    if (
      requestUrl.includes("/rest/v1/swarmtest_brand_repo_connections") &&
      requestUrl.includes("pending_state_token=eq.state_123")
    ) {
      return {
        ok: true,
        status: 200,
        async json() {
          return [
            {
              owner_user_id: "user_123",
              owner_email: "owner@example.com",
              brand_key: "acme",
              provider: "github",
              pending_state_token: "state_123",
              pending_state_expires_at: "2099-04-01T12:00:00.000Z"
            }
          ];
        }
      };
    }
    if (requestUrl === "https://api.github.com/app/installations/789") {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        async json() {
          return {
            id: 789,
            account: {
              login: "acme-org",
              type: "Organization"
            },
            target_type: "Organization",
            target_id: 45
          };
        }
      };
    }
    if (requestUrl === "https://api.github.com/app/installations/789/access_tokens") {
      return {
        ok: true,
        status: 201,
        headers: new Headers({ "content-type": "application/json" }),
        async json() {
          return {
            token: "inst_token_123",
            expires_at: "2026-04-01T13:00:00.000Z"
          };
        }
      };
    }
    if (requestUrl === "https://api.github.com/installation/repositories?per_page=100&page=1") {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        async json() {
          return {
            total_count: 1,
            repositories: [
              {
                id: 10,
                name: "web",
                full_name: "acme-org/web",
                default_branch: "main",
                private: true,
                owner: { login: "acme-org" }
              }
            ]
          };
        }
      };
    }
    if (requestUrl.includes("/rest/v1/swarmtest_brand_repo_connections") && options.method === "POST") {
      const rows = JSON.parse(options.body || "[]");
      upsertRows.push(rows[0]);
      return {
        ok: true,
        status: 200,
        async json() {
          return rows;
        }
      };
    }
    throw new Error(`Unexpected fetch: ${requestUrl}`);
  };

  try {
    await withEnv(
      {
        QA_SERVICE_TOKEN: "service-token",
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_KEY: "service-key",
        GITHUB_APP_ID: "12345",
        GITHUB_APP_SLUG: "swarmtester-qa",
        GITHUB_APP_PRIVATE_KEY: TEST_GITHUB_PRIVATE_KEY,
        QA_PUBLIC_APP_URL: "https://swarmtester.com"
      },
      async () => {
        const req = {
          method: "GET",
          query: {
            installation_id: "789",
            state: "state_123",
            setup_action: "install"
          },
          headers: {
            host: "swarmtester.com",
            "x-forwarded-proto": "https",
            "x-qa-service-token": "service-token",
            "x-owner-user-id": "user_123"
          }
        };
        const res = createRes();

        await setupHandler(req, res);

        assert.equal(res.statusCode, 302);
        assert.match(String(res.headers.Location || ""), /panel=overview/);
        assert.match(String(res.headers.Location || ""), /brand=acme/);
        assert.match(String(res.headers.Location || ""), /github_app_status=connected/);
        assert.match(String(res.headers.Location || ""), /github_app_brand=acme/);
        assert.equal(upsertRows.length, 1);
        assert.equal(upsertRows[0].connection_status, "connected");
        assert.equal(upsertRows[0].selected_repo_full_name, "acme-org/web");
        assert.equal(upsertRows[0].pending_state_token, null);
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("github app setup handler redirects multi-repo installs to repo selection", async () => {
  const originalFetch = global.fetch;
  const upsertRows = [];

  global.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    if (
      requestUrl.includes("/rest/v1/swarmtest_brand_repo_connections") &&
      requestUrl.includes("pending_state_token=eq.state_multi")
    ) {
      return {
        ok: true,
        status: 200,
        async json() {
          return [
            {
              owner_user_id: "user_123",
              owner_email: "owner@example.com",
              brand_key: "acme",
              provider: "github",
              pending_state_token: "state_multi",
              pending_state_expires_at: "2099-04-01T12:00:00.000Z"
            }
          ];
        }
      };
    }
    if (requestUrl === "https://api.github.com/app/installations/789") {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        async json() {
          return {
            id: 789,
            account: {
              login: "acme-org",
              type: "Organization"
            },
            target_type: "Organization",
            target_id: 45
          };
        }
      };
    }
    if (requestUrl === "https://api.github.com/app/installations/789/access_tokens") {
      return {
        ok: true,
        status: 201,
        headers: new Headers({ "content-type": "application/json" }),
        async json() {
          return {
            token: "inst_token_123",
            expires_at: "2026-04-01T13:00:00.000Z"
          };
        }
      };
    }
    if (requestUrl === "https://api.github.com/installation/repositories?per_page=100&page=1") {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        async json() {
          return {
            total_count: 2,
            repositories: [
              {
                id: 10,
                name: "web",
                full_name: "acme-org/web",
                default_branch: "main",
                private: true,
                owner: { login: "acme-org" }
              },
              {
                id: 11,
                name: "docs",
                full_name: "acme-org/docs",
                default_branch: "main",
                private: true,
                owner: { login: "acme-org" }
              }
            ]
          };
        }
      };
    }
    if (requestUrl.includes("/rest/v1/swarmtest_brand_repo_connections") && options.method === "POST") {
      const rows = JSON.parse(options.body || "[]");
      upsertRows.push(rows[0]);
      return {
        ok: true,
        status: 200,
        async json() {
          return rows;
        }
      };
    }
    throw new Error(`Unexpected fetch: ${requestUrl}`);
  };

  try {
    await withEnv(
      {
        QA_SERVICE_TOKEN: "service-token",
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_KEY: "service-key",
        GITHUB_APP_ID: "12345",
        GITHUB_APP_SLUG: "swarmtester-qa",
        GITHUB_APP_PRIVATE_KEY: TEST_GITHUB_PRIVATE_KEY,
        QA_PUBLIC_APP_URL: "https://swarmtester.com"
      },
      async () => {
        const req = {
          method: "GET",
          query: {
            installation_id: "789",
            state: "state_multi",
            setup_action: "install"
          },
          headers: {
            host: "swarmtester.com",
            "x-forwarded-proto": "https",
            "x-qa-service-token": "service-token",
            "x-owner-user-id": "user_123"
          }
        };
        const res = createRes();

        await setupHandler(req, res);

        assert.equal(res.statusCode, 302);
        assert.match(String(res.headers.Location || ""), /panel=settings/);
        assert.match(String(res.headers.Location || ""), /brand=acme/);
        assert.match(String(res.headers.Location || ""), /github_app_status=repo_selection_required/);
        assert.match(String(res.headers.Location || ""), /github_app_brand=acme/);
        assert.equal(upsertRows.length, 1);
        assert.equal(upsertRows[0].connection_status, "awaiting_repo_selection");
        assert.equal(upsertRows[0].selected_repo_full_name, null);
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});
