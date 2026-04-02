const test = require("node:test");
const assert = require("node:assert/strict");

const handler = require("../api/site-scan");

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

test("site scan handler rejects non-POST methods", async () => {
  const req = { method: "GET" };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, "POST");
});

test("site scan handler returns validation errors for bad bodies", async () => {
  const req = { method: "POST", body: "{not-json" };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.ok, false);
});
