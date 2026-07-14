const test = require("node:test");
const assert = require("node:assert/strict");

const oauthHandler = require("../api/auth/oauth");

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

test("Google OAuth returns a Supabase authorize URL and preserves the return page", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url, init = {}) => {
    assert.equal(String(url), "https://supabase.example/auth/v1/settings");
    assert.equal(init.headers.apikey, "anon-key");
    return {
      ok: true,
      status: 200,
      async json() {
        return { external: { google: true, github: true } };
      }
    };
  };

  try {
    await withEnv(
      {
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_KEY: undefined,
        SUPABASE_ANON_KEY: "anon-key",
        AUTH_MAGIC_LINK_REDIRECT_BASE_URL: "https://beforeusersdo.com"
      },
      async () => {
        const req = {
          method: "POST",
          headers: { host: "beforeusersdo.com" },
          body: {
            provider: "google",
            redirect_to: "https://beforeusersdo.com/trials?source=auth&auth_callback=1"
          }
        };
        const res = createRes();

        await oauthHandler(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.ok, true);
        assert.equal(res.body.provider, "google");
        const authorizeUrl = new URL(res.body.url);
        assert.equal(authorizeUrl.origin, "https://supabase.example");
        assert.equal(authorizeUrl.pathname, "/auth/v1/authorize");
        assert.equal(authorizeUrl.searchParams.get("provider"), "google");
        assert.equal(
          authorizeUrl.searchParams.get("redirect_to"),
          "https://beforeusersdo.com/trials?source=auth&auth_callback=1"
        );
        assert.equal(res.headers["Cache-Control"], "no-store");
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("GitHub OAuth rejects an off-site return URL", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return { external: { google: true, github: true } };
    }
  });

  try {
    await withEnv(
      {
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_KEY: "service-key",
        SUPABASE_ANON_KEY: undefined,
        AUTH_MAGIC_LINK_REDIRECT_BASE_URL: "https://beforeusersdo.com"
      },
      async () => {
        const req = {
          method: "POST",
          headers: { host: "beforeusersdo.com" },
          body: {
            provider: "github",
            redirect_to: "https://attacker.example/steal"
          }
        };
        const res = createRes();

        await oauthHandler(req, res);

        assert.equal(res.statusCode, 200);
        const authorizeUrl = new URL(res.body.url);
        assert.equal(authorizeUrl.searchParams.get("provider"), "github");
        assert.equal(
          authorizeUrl.searchParams.get("redirect_to"),
          "https://beforeusersdo.com/?auth_callback=1"
        );
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("OAuth reports a provider that is not enabled", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return { external: { google: false, github: false } };
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
          headers: { host: "beforeusersdo.com" },
          body: { provider: "google" }
        };
        const res = createRes();

        await oauthHandler(req, res);

        assert.equal(res.statusCode, 503);
        assert.deepEqual(res.body, {
          ok: false,
          error: "Google sign-in is not available yet. Use email instead."
        });
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("OAuth returns a useful fallback when provider settings cannot be loaded", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error("network unavailable");
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
          headers: { host: "beforeusersdo.com" },
          body: { provider: "github" }
        };
        const res = createRes();

        await oauthHandler(req, res);

        assert.equal(res.statusCode, 502);
        assert.equal(res.body.error, "Could not start social sign-in. Use email instead.");
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("OAuth rejects unsupported providers before contacting Supabase", async () => {
  const originalFetch = global.fetch;
  let called = false;
  global.fetch = async () => {
    called = true;
    throw new Error("Unexpected fetch");
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
          headers: { host: "beforeusersdo.com" },
          body: { provider: "facebook" }
        };
        const res = createRes();

        await oauthHandler(req, res);

        assert.equal(res.statusCode, 400);
        assert.equal(res.body.error, "Unsupported sign-in provider");
        assert.equal(called, false);
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});
