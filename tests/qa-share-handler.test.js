const test = require("node:test");
const assert = require("node:assert/strict");

const shareHandler = require("../api/qa/share");

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

test("share handler enables team sharing and returns a share URL", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url, init = {}) => {
    if (String(url).includes("/rest/v1/swarmtest_reports") && (!init.method || init.method === "GET")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return [
            {
              id: "row_share_enable_1",
              run_id: "run_share_enable_1",
              target: "clusterseo.com",
              payload: {
                run_request: {
                  metadata: {
                    brand_id: "clusterseo.com",
                    owner_user_id: "user_123"
                  }
                },
                report_json: {
                  run_id: "run_share_enable_1",
                  findings: []
                }
              }
            }
          ];
        }
      };
    }

    if (String(url).includes("/rest/v1/swarmtest_reports") && String(init.method || "").toUpperCase() === "PATCH") {
      const mutation = JSON.parse(String(init.body || "{}"));
      assert.equal(mutation.payload.share.enabled, true);
      assert.ok(mutation.payload.share.token);
      return {
        ok: true,
        status: 200,
        async json() {
          return [
            {
              id: "row_share_enable_1",
              run_id: "run_share_enable_1",
              target: "clusterseo.com",
              payload: mutation.payload
            }
          ];
        }
      };
    }

    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    await withEnv(
      {
        QA_SERVICE_TOKEN: "service-token",
        QA_PUBLIC_APP_URL: "https://swarmtester.com",
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_KEY: "service-key"
      },
      async () => {
        const req = {
          method: "POST",
          query: {
            run_id: "run_share_enable_1"
          },
          headers: {
            host: "swarmtester.com",
            "x-qa-service-token": "service-token",
            "x-owner-user-id": "user_123"
          }
        };
        const res = createRes();

        await shareHandler(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.ok, true);
        assert.equal(res.body.enabled, true);
        assert.match(res.body.share_url, /run_id=run_share_enable_1/);
        assert.match(res.body.share_url, /share_key=/);
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("share handler revokes an existing share link", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url, init = {}) => {
    if (String(url).includes("/rest/v1/swarmtest_reports") && (!init.method || init.method === "GET")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return [
            {
              id: "row_share_disable_1",
              run_id: "run_share_disable_1",
              target: "clusterseo.com",
              payload: {
                share: {
                  enabled: true,
                  token: "share_existing_123",
                  created_at: "2026-03-28T10:00:00.000Z"
                },
                run_request: {
                  metadata: {
                    brand_id: "clusterseo.com",
                    owner_user_id: "user_123"
                  }
                },
                report_json: {
                  run_id: "run_share_disable_1",
                  findings: []
                }
              }
            }
          ];
        }
      };
    }

    if (String(url).includes("/rest/v1/swarmtest_reports") && String(init.method || "").toUpperCase() === "PATCH") {
      const mutation = JSON.parse(String(init.body || "{}"));
      assert.equal(mutation.payload.share.enabled, false);
      assert.equal(mutation.payload.share.token, null);
      assert.ok(mutation.payload.share.revoked_at);
      return {
        ok: true,
        status: 200,
        async json() {
          return [
            {
              id: "row_share_disable_1",
              run_id: "run_share_disable_1",
              target: "clusterseo.com",
              payload: mutation.payload
            }
          ];
        }
      };
    }

    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    await withEnv(
      {
        QA_SERVICE_TOKEN: "service-token",
        QA_PUBLIC_APP_URL: "https://swarmtester.com",
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_KEY: "service-key"
      },
      async () => {
        const req = {
          method: "DELETE",
          query: {
            run_id: "run_share_disable_1"
          },
          headers: {
            host: "swarmtester.com",
            "x-qa-service-token": "service-token",
            "x-owner-user-id": "user_123"
          }
        };
        const res = createRes();

        await shareHandler(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.ok, true);
        assert.equal(res.body.enabled, false);
        assert.equal(res.body.share_url, null);
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});
