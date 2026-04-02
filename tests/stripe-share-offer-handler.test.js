const test = require("node:test");
const assert = require("node:assert/strict");

const handler = require("../api/stripe/share-offer");

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

test("share-offer handler returns 409 when the Stripe price is not configured", async () => {
  await withEnv(
    {
      STRIPE_SECRET_KEY: "sk_test_123",
      STRIPE_PUBLISHABLE_KEY: "pk_test_123",
      STRIPE_SHARE_OFFER_PRICE_ID: undefined
    },
    async () => {
      const req = {
        method: "POST",
        headers: {
          host: "swarmtester.com"
        },
        body: {
          code: "TEAMREPORT"
        }
      };
      const res = createRes();

      await handler(req, res);

      assert.equal(res.statusCode, 409);
      assert.equal(res.body.ok, false);
      assert.match(String(res.body.error || ""), /not configured/i);
    }
  );
});
