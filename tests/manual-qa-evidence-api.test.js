const test = require("node:test");
const assert = require("node:assert/strict");

const evidenceHandler = require("../api/manual-qa/evidence");

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

test("trial-token evidence responses cannot be cached or leak through referrers", async () => {
  const res = createRes();
  await evidenceHandler(
    {
      method: "GET",
      headers: {},
      query: { trial_token: "bud_trial_private_buyer_link" }
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.headers["Cache-Control"], "private, no-store, max-age=0");
  assert.equal(res.headers.Pragma, "no-cache");
  assert.equal(res.headers["Referrer-Policy"], "no-referrer");
  assert.equal(res.headers["X-Content-Type-Options"], "nosniff");
  assert.equal(
    evidenceHandler.__private.evidenceCacheControl("bud_trial_private_buyer_link"),
    "private, no-store, max-age=0"
  );
  assert.equal(evidenceHandler.__private.evidenceCacheControl(""), "private, max-age=3600");
});
