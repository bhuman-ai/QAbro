const test = require("node:test");
const assert = require("node:assert/strict");

const sessionHandler = require("../api/auth/session");
const {
  REFRESHED_ACCESS_RESPONSE_HEADER,
  REFRESHED_REFRESH_RESPONSE_HEADER,
  SESSION_ACCESS_COOKIE,
  SESSION_ACCESS_HEADER,
  SESSION_REFRESH_HEADER
} = require("../lib/auth");

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

test("session handler returns anonymous session payload for signed-out requests", async () => {
  const req = {
    method: "GET",
    headers: {
      host: "swarmtester.com"
    }
  };
  const res = createRes();

  await withEnv(
    {
      SUPABASE_URL: "https://supabase.example",
      SUPABASE_SERVICE_KEY: "service-key"
    },
    async () => {
      await sessionHandler(req, res);
    }
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    ok: false,
    user: null,
    error: "Authentication required"
  });
  assert.ok(Array.isArray(res.headers["Set-Cookie"]));
  assert.equal(res.headers["Set-Cookie"].length, 2);
});

test("session handler returns user payload for valid access-token cookies", async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          id: "user_123",
          email: "owner@example.com",
          created_at: "2026-03-16T10:20:00.000Z",
          user_metadata: {
            swarm_onboarding_seen: true
          }
        };
      }
    };
  };

  try {
    const req = {
      method: "GET",
      headers: {
        host: "swarmtester.com",
        cookie: `${SESSION_ACCESS_COOKIE}=token_abc`
      }
    };
    const res = createRes();

    await withEnv(
      {
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_KEY: "service-key"
      },
      async () => {
        await sessionHandler(req, res);
      }
    );

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      ok: true,
      user: {
        id: "user_123",
        email: "owner@example.com",
        created_at: "2026-03-16T10:20:00.000Z",
        onboarding_seen: true,
        pending_offer_code: null,
        redeemed_offers: []
      }
    });
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/auth\/v1\/user$/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("session handler accepts dashboard header tokens for MCP-style auth", async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          id: "user_header_1",
          email: "header@example.com",
          created_at: "2026-03-29T10:00:00.000Z",
          user_metadata: {
            swarm_onboarding_seen: false
          }
        };
      }
    };
  };

  try {
    const req = {
      method: "GET",
      headers: {
        host: "swarmtester.com",
        [SESSION_ACCESS_HEADER]: "header_access_123",
        [SESSION_REFRESH_HEADER]: "header_refresh_123"
      }
    };
    const res = createRes();

    await withEnv(
      {
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_KEY: "service-key"
      },
      async () => {
        await sessionHandler(req, res);
      }
    );

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      ok: true,
      user: {
        id: "user_header_1",
        email: "header@example.com",
        created_at: "2026-03-29T10:00:00.000Z",
        onboarding_seen: false,
        pending_offer_code: null,
        redeemed_offers: []
      }
    });
    assert.equal(calls.length, 1);
    assert.equal(res.headers[REFRESHED_ACCESS_RESPONSE_HEADER], undefined);
    assert.equal(res.headers[REFRESHED_REFRESH_RESPONSE_HEADER], undefined);
  } finally {
    global.fetch = originalFetch;
  }
});

test("session handler preserves server misconfiguration errors", async () => {
  const req = {
    method: "GET",
    headers: {
      host: "swarmtester.com"
    }
  };
  const res = createRes();

  await withEnv(
    {
      SUPABASE_URL: undefined,
      SUPABASE_SERVICE_KEY: undefined,
      SUPABASE_ANON_KEY: undefined
    },
    async () => {
      await sessionHandler(req, res);
    }
  );

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    ok: false,
    user: null,
    error: "Server is not configured"
  });
});
