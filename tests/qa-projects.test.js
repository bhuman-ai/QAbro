const test = require("node:test");
const assert = require("node:assert/strict");

const projectsHandler = require("../api/qa/projects");

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
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

test("projects handler lists canonical projects with report counts", async () => {
  const originalFetch = global.fetch;
  const capturedUrls = [];

  global.fetch = async (url) => {
    const requestUrl = String(url);
    capturedUrls.push(requestUrl);

    if (requestUrl.includes("/rest/v1/swarmtest_projects")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return [
            {
              brand_key: "acme",
              brand_name: "Acme",
              target_url: "https://acme.example",
              owner_user_id: "user_123",
              last_used_at: "2026-03-16T10:20:00.000Z",
              created_at: "2026-03-15T10:20:00.000Z",
              updated_at: "2026-03-16T10:20:00.000Z",
              metadata: { source: "dashboard" }
            }
          ];
        }
      };
    }

    return {
      ok: true,
      status: 200,
      async json() {
        return [
          {
            run_id: "run_1",
            status: "completed",
            delivered_at: "2026-03-16T11:20:00.000Z",
            payload: {
              queue: { status: "completed" },
              run_request: {
                target_url: "https://acme.example/app",
                metadata: {
                  brand_id: "acme",
                  brand_name: "Acme",
                  owner_user_id: "user_123"
                }
              },
              report_json: { findings: [], tested_journeys: [], recommendations: [], summary: {} }
            }
          },
          {
            run_id: "run_2",
            status: "completed",
            delivered_at: "2026-03-16T12:20:00.000Z",
            payload: {
              queue: { status: "completed" },
              run_request: {
                target_url: "https://acme.example/app",
                metadata: {
                  brand_id: "acme",
                  brand_name: "Acme",
                  owner_user_id: "user_123"
                }
              },
              report_json: { findings: [], tested_journeys: [], recommendations: [], summary: {} }
            }
          }
        ];
      }
    };
  };

  try {
    await withEnv(
      {
        QA_SERVICE_TOKEN: "service-token",
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_KEY: "service-key"
      },
      async () => {
        const req = {
          method: "GET",
          headers: {
            "x-qa-service-token": "service-token",
            "x-owner-user-id": "user_123"
          }
        };
        const res = createRes();

        await projectsHandler(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.ok, true);
        assert.equal(res.body.total, 1);
        assert.equal(res.body.items[0].brand_key, "acme");
        assert.equal(res.body.items[0].run_count, 2);
        assert.equal(res.body.items[0].latest_run_at, "2026-03-16T12:20:00.000Z");
        assert.equal(capturedUrls.length, 2);
        assert.match(capturedUrls[0], /swarmtest_projects/);
        assert.match(capturedUrls[0], /owner_user_id=eq\.user_123/);
        assert.match(capturedUrls[1], /swarmtest_reports/);
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("projects handler returns the canonical project catalog even when bootstrap is requested", async () => {
  const originalFetch = global.fetch;
  const capturedUrls = [];

  global.fetch = async (url) => {
    const requestUrl = String(url);
    capturedUrls.push(requestUrl);

    if (requestUrl.includes("/rest/v1/swarmtest_projects")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return [
            {
              brand_key: "acme",
              brand_name: "Acme",
              target_url: "https://acme.example",
              owner_user_id: "user_123",
              last_used_at: "2026-03-16T10:20:00.000Z",
              created_at: "2026-03-15T10:20:00.000Z",
              updated_at: "2026-03-16T10:20:00.000Z",
              metadata: { source: "dashboard" }
            }
          ];
        }
      };
    }

    if (requestUrl.includes("/rest/v1/swarmtest_reports")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return [];
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
        SUPABASE_SERVICE_KEY: "service-key"
      },
      async () => {
        const req = {
          method: "GET",
          query: {
            bootstrap: "1"
          },
          headers: {
            "x-qa-service-token": "service-token",
            "x-owner-user-id": "user_123"
          }
        };
        const res = createRes();

        await projectsHandler(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.ok, true);
        assert.equal(res.body.source, "canonical");
        assert.equal(res.body.total, 1);
        assert.equal(res.body.items[0].brand_key, "acme");
        assert.equal(capturedUrls.length, 2);
        assert.match(capturedUrls[0], /swarmtest_projects/);
        assert.match(capturedUrls[1], /swarmtest_reports/);
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("projects handler backfills report-only projects into saved projects", async () => {
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url, init = {}) => {
    const requestUrl = String(url);
    calls.push({ url: requestUrl, init });

    if (requestUrl.includes("/rest/v1/swarmtest_projects") && (!init.method || init.method === "GET")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return [];
        }
      };
    }

    if (requestUrl.includes("/rest/v1/swarmtest_reports")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return [
            {
              run_id: "run_beta",
              status: "completed",
              delivered_at: "2026-03-16T13:20:00.000Z",
              payload: {
                queue: { status: "completed" },
                run_request: {
                  target_url: "https://beta.example/app",
                  metadata: {
                    brand_id: "beta",
                    brand_name: "Beta",
                    owner_user_id: "user_123"
                  }
                },
                report_json: { findings: [], tested_journeys: [], recommendations: [], summary: {} }
              }
            }
          ];
        }
      };
    }

    return {
      ok: true,
      status: 200,
      async json() {
        return [
          {
            brand_key: "beta",
            brand_name: "Beta",
            target_url: "https://beta.example/app",
            owner_user_id: "user_123",
            owner_email: "owner@example.com",
            last_used_at: "2026-03-16T13:20:00.000Z",
            created_at: "2026-03-16T13:20:00.000Z",
            updated_at: "2026-03-16T13:20:00.000Z",
            metadata: { source: "report_backfill" }
          }
        ];
      }
    };
  };

  try {
    await withEnv(
      {
        QA_SERVICE_TOKEN: "service-token",
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_KEY: "service-key"
      },
      async () => {
        const req = {
          method: "GET",
          headers: {
            "x-qa-service-token": "service-token",
            "x-owner-user-id": "user_123",
            "x-owner-email": "owner@example.com"
          }
        };
        const res = createRes();

        await projectsHandler(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.items[0].brand_key, "beta");
        assert.equal(res.body.items[0].run_count, 1);
        const upsertCall = calls.find((call) => call.url.includes("/rest/v1/swarmtest_projects?on_conflict="));
        assert.ok(upsertCall);
        const payload = JSON.parse(String(upsertCall.init.body || "[]"));
        assert.equal(payload[0].brand_key, "beta");
        assert.equal(payload[0].owner_user_id, "user_123");
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("projects handler upserts projects for the requested owner", async () => {
  const originalFetch = global.fetch;
  let capturedUrl = null;
  let capturedInit = null;

  global.fetch = async (url, init = {}) => {
    capturedUrl = String(url);
    capturedInit = init;
    return {
      ok: true,
      status: 200,
      async json() {
        return [
          {
            brand_key: "acme",
            brand_name: "Acme",
            target_url: "https://acme.example",
            owner_user_id: "user_123",
            owner_email: "owner@example.com",
            last_used_at: "2026-03-16T10:20:00.000Z",
            created_at: "2026-03-15T10:20:00.000Z",
            updated_at: "2026-03-16T10:20:00.000Z",
            metadata: { source: "dashboard_onboarding" }
          }
        ];
      }
    };
  };

  try {
    await withEnv(
      {
        QA_SERVICE_TOKEN: "service-token",
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_KEY: "service-key"
      },
      async () => {
        const req = {
          method: "POST",
          body: {
            projects: [
              {
                brand_key: "Acme",
                brand_name: "Acme",
                target_url: "acme.example",
                metadata: { source: "dashboard_onboarding" }
              }
            ]
          },
          headers: {
            "x-qa-service-token": "service-token",
            "x-owner-user-id": "user_123",
            "x-owner-email": "owner@example.com"
          }
        };
        const res = createRes();

        await projectsHandler(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.ok, true);
        assert.equal(res.body.items[0].brand_key, "acme");
        assert.match(capturedUrl, /swarmtest_projects\?on_conflict=owner_user_id%2Cbrand_key/);
        assert.equal(capturedInit.method, "POST");
        assert.equal(capturedInit.headers.Prefer, "resolution=merge-duplicates,return=representation");

        const payload = JSON.parse(String(capturedInit.body || "[]"));
        assert.deepEqual(payload, [
          {
            owner_user_id: "user_123",
            owner_email: "owner@example.com",
            brand_key: "acme",
            brand_name: "Acme",
            target_url: "https://acme.example/",
            metadata: {
              source: "dashboard_onboarding"
            },
            last_used_at: payload[0].last_used_at
          }
        ]);
        assert.match(String(payload[0].last_used_at), /^20/);
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("projects handler falls back to report-derived projects when saved projects table is missing", async () => {
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url, init = {}) => {
    const requestUrl = String(url);
    calls.push({ url: requestUrl, init });

    if (requestUrl.includes("/rest/v1/swarmtest_projects")) {
      return {
        ok: false,
        status: 404,
        async json() {
          return {
            code: "PGRST205",
            message: "Could not find the table 'public.swarmtest_projects' in the schema cache",
            hint: "Perhaps you meant the table 'public.swarmtest_reports'"
          };
        }
      };
    }

    return {
      ok: true,
      status: 200,
      async json() {
        return [
          {
            run_id: "run_fallback",
            status: "completed",
            delivered_at: "2026-03-16T14:20:00.000Z",
            payload: {
              queue: { status: "completed" },
              run_request: {
                target_url: "https://fallback.example/app",
                metadata: {
                  brand_id: "fallback",
                  brand_name: "Fallback",
                  owner_user_id: "user_123"
                }
              },
              report_json: { findings: [], tested_journeys: [], recommendations: [], summary: {} }
            }
          }
        ];
      }
    };
  };

  try {
    await withEnv(
      {
        QA_SERVICE_TOKEN: "service-token",
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_KEY: "service-key"
      },
      async () => {
        const req = {
          method: "GET",
          headers: {
            "x-qa-service-token": "service-token",
            "x-owner-user-id": "user_123",
            "x-owner-email": "owner@example.com"
          }
        };
        const res = createRes();

        await projectsHandler(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.ok, true);
        assert.equal(res.body.total, 1);
        assert.equal(res.body.items[0].brand_key, "fallback");
        assert.equal(res.body.items[0].brand_name, "Fallback");
        assert.equal(res.body.items[0].run_count, 1);
        assert.equal(calls.length, 2);
        assert.ok(!calls.some((call) => call.url.includes("/rest/v1/swarmtest_projects?on_conflict=")));
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});
