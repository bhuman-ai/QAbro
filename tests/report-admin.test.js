const test = require("node:test");
const assert = require("node:assert/strict");

const reportsHandler = require("../api/qa/reports");
const { SESSION_ACCESS_COOKIE } = require("../lib/auth");

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
    process.env[key] = String(value);
  }
  try {
    return await callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("report admin dashboard sessions list reports across owners", async () => {
  const originalFetch = global.fetch;
  const reportUrls = [];
  global.fetch = async (url) => {
    const value = String(url);
    if (value.endsWith("/auth/v1/user")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            id: "admin_user",
            email: "admin@example.com",
            app_metadata: { report_admin: true },
            user_metadata: {}
          };
        }
      };
    }

    reportUrls.push(value);
    return {
      ok: true,
      status: 200,
      async json() {
        return [
          {
            run_id: "customer_run",
            owner_user_id: "customer_owner",
            brand_key: "customer-brand",
            target: "customer.example",
            status: "completed",
            source: "manual_qa",
            delivered_at: "2026-07-19T00:00:00.000Z",
            payload: {
              report_json: {
                findings: [],
                tested_journeys: [],
                recommendations: [],
                summary: {}
              }
            }
          }
        ];
      }
    };
  };

  try {
    await withEnv(
      {
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_KEY: "service-key"
      },
      async () => {
        const req = {
          method: "GET",
          query: { limit: "50", offset: "0" },
          headers: {
            host: "beforeusersdo.com",
            cookie: `${SESSION_ACCESS_COOKIE}=admin-token`
          }
        };
        const res = createRes();

        await reportsHandler(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.items[0].run_id, "customer_run");
        assert.equal(res.body.filters.owner_user_id, "");
        assert.equal(res.body.filters.owner_email, "");
        assert.equal(reportUrls.length, 1);
        assert.doesNotMatch(decodeURIComponent(reportUrls[0]), /owner_user_id=eq\./);
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});
