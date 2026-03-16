const test = require("node:test");
const assert = require("node:assert/strict");

const waitlistHandler = require("../api/waitlist");

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

test("waitlist handler stores normalized payload in Supabase", async () => {
  let capturedUrl = null;
  let capturedInit = null;
  const originalFetch = global.fetch;
  global.fetch = async (url, init = {}) => {
    capturedUrl = url;
    capturedInit = init;
    return {
      ok: true,
      async json() {
        return {};
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
          method: "POST",
          body: {
            email: "Tester@Example.com",
            source: "hero"
          },
          headers: {
            "x-forwarded-for": "203.0.113.10, 198.51.100.2",
            "user-agent": "Codex Test Agent"
          }
        };
        const res = createRes();

        await waitlistHandler(req, res);

        assert.equal(res.statusCode, 201);
        assert.deepEqual(res.body, { ok: true });
        assert.equal(capturedUrl, "https://supabase.example/rest/v1/swarmtest_waitlist");

        const payload = JSON.parse(String(capturedInit.body || "[]"));
        assert.deepEqual(payload, [
          {
            email: "tester@example.com",
            source: "hero",
            metadata: {
              ip: "203.0.113.10",
              user_agent: "Codex Test Agent"
            }
          }
        ]);
        assert.equal(capturedInit.headers.apikey, "service-key");
        assert.equal(capturedInit.headers.Authorization, "Bearer service-key");
        assert.equal(capturedInit.headers.Prefer, "return=minimal");
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("waitlist handler treats duplicate email as success", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: false,
    async json() {
      return { code: "23505", message: "duplicate key value violates unique constraint" };
    }
  });

  try {
    await withEnv(
      {
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_KEY: "service-key"
      },
      async () => {
        const req = {
          method: "POST",
          body: {
            email: "duplicate@example.com",
            source: "website"
          },
          headers: {}
        };
        const res = createRes();

        await waitlistHandler(req, res);

        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body, { ok: true, duplicate: true });
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});
