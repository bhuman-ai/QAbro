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

test("projects handler lists saved projects for the requested owner", async () => {
  const originalFetch = global.fetch;
  let capturedUrl = null;

  global.fetch = async (url) => {
    capturedUrl = String(url);
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
        assert.match(capturedUrl, /swarmtest_projects/);
        assert.match(capturedUrl, /owner_user_id=eq\.user_123/);
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
