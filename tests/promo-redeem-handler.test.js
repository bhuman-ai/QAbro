const test = require("node:test");
const assert = require("node:assert/strict");

const redeemHandler = require("../api/promo/redeem");
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

test("promo redeem handler attaches the shared team code to a signed-in user", async () => {
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
              swarm_onboarding_seen: true
            }
          };
        }
      };
    }

    if (String(url).includes("/auth/v1/user") && method === "PUT") {
      const payload = JSON.parse(String(init.body || "{}"));
      assert.equal(payload.data.swarm_team_offer_code, "TEAMREPORT");
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
            host: "swarmtester.com",
            cookie: `${SESSION_ACCESS_COOKIE}=token_abc`
          },
          body: {
            code: "TEAMREPORT",
            share_run_id: "run_share_1"
          }
        };
        const res = createRes();

        await redeemHandler(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.ok, true);
        assert.equal(getCount, 2);
        assert.equal(res.body.user.redeemed_offers[0].code, "TEAMREPORT");
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});
