const test = require("node:test");
const assert = require("node:assert/strict");

const signupHandler = require("../api/auth/signup");
const exchangeHandler = require("../api/auth/exchange");

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

test("signup handler accepts the shared report promo code as a valid signup code", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url, init = {}) => {
    assert.match(String(url), /\/auth\/v1\/otp$/);
    const payload = JSON.parse(String(init.body || "{}"));
    assert.equal(payload.email, "owner@example.com");
    assert.equal(payload.create_user, true);
    assert.equal(payload.data.swarm_pending_offer_code, "TEAMREPORT");
    assert.equal(payload.data.swarm_pending_offer_source, "shared_report_signup");
    assert.equal(payload.data.swarm_pending_offer_share_run_id, "run_share_1");
    return {
      ok: true,
      status: 200,
      async json() {
        return { sent: true };
      }
    };
  };

  try {
    await withEnv(
      {
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_KEY: "service-key",
        SWARM_SHARE_PROMO_CODE: "TEAMREPORT",
        DASHBOARD_INVITE_CODE: "PrivateOnly"
      },
      async () => {
        const req = {
          method: "POST",
          headers: {
            host: "swarmtester.com"
          },
          body: {
            email: "owner@example.com",
            invite_code: "TEAMREPORT",
            share_run_id: "run_share_1",
            redirect_to: "https://swarmtester.com/dashboard?mode=signup&promo=TEAMREPORT"
          }
        };
        const res = createRes();

        await signupHandler(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.ok, true);
        assert.match(res.body.message, /Team code accepted/i);
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("exchange handler finalizes a pending promo code into a redeemed offer", async () => {
  const originalFetch = global.fetch;
  let getCount = 0;
  global.fetch = async (url, init = {}) => {
    const method = String(init.method || "GET").toUpperCase();
    if (String(url).includes("/auth/v1/user") && method === "GET") {
      getCount += 1;
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            id: "user_123",
            email: "owner@example.com",
            created_at: "2026-03-28T12:00:00.000Z",
            user_metadata: {
              swarm_onboarding_seen: false,
              swarm_pending_offer_code: "TEAMREPORT",
              swarm_pending_offer_source: "shared_report_signup",
              swarm_pending_offer_share_run_id: "run_share_1"
            }
          };
        }
      };
    }

    if (String(url).includes("/auth/v1/user") && method === "PUT") {
      const payload = JSON.parse(String(init.body || "{}"));
      assert.equal(payload.data.swarm_pending_offer_code, undefined);
      assert.equal(payload.data.swarm_team_offer_code, "TEAMREPORT");
      assert.equal(payload.data.swarm_team_offer_redeemed, true);
      assert.equal(payload.data.swarm_redeemed_offers[0].code, "TEAMREPORT");
      assert.equal(payload.data.swarm_redeemed_offers[0].share_run_id, "run_share_1");
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            id: "user_123",
            email: "owner@example.com",
            created_at: "2026-03-28T12:00:00.000Z",
            user_metadata: payload.data
          };
        }
      };
    }

    throw new Error(`Unexpected fetch ${method} ${url}`);
  };

  try {
    await withEnv(
      {
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_KEY: "service-key",
        SWARM_SHARE_PROMO_CODE: "TEAMREPORT"
      },
      async () => {
        const req = {
          method: "POST",
          headers: {
            host: "swarmtester.com"
          },
          body: {
            access_token: "access_123",
            refresh_token: "refresh_123"
          }
        };
        const res = createRes();

        await exchangeHandler(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.ok, true);
        assert.equal(getCount, 2);
        assert.equal(res.body.user.pending_offer_code, null);
        assert.equal(res.body.user.redeemed_offers[0].code, "TEAMREPORT");
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});
