const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeHumanTestRequestPayload,
  normalizeHumanTestRequestRow
} = require("../lib/human-test-requests");
const { openSecretObject, sealSecretObject } = require("../lib/qa-secret-box");

const OWNER = {
  owner_user_id: "owner_123",
  owner_email: "owner@example.com"
};

test("human test requests default to a safe first-time-user review", () => {
  const result = normalizeHumanTestRequestPayload(
    { target_url: "https://preview.example.com" },
    OWNER
  );

  assert.equal(result.ok, true);
  assert.equal(result.payload.review_type, "general_first_time_user");
  assert.equal(result.payload.access_mode, "public_only");
  assert.equal(result.payload.access_details.purchase_allowed, false);
  assert.equal(result.payload.access_details.irreversible_actions_allowed, false);
  assert.match(result.payload.test_focus, /first-time user/i);
  assert.match(result.payload.access_details.prohibited_actions.join(" "), /real purchase/i);
});

test("explicit public-only access cannot inherit a stale signup permission", () => {
  const result = normalizeHumanTestRequestPayload(
    {
      target_url: "https://preview.example.com",
      access_mode: "public_only",
      account_creation_allowed: true
    },
    OWNER
  );

  assert.equal(result.ok, true);
  assert.equal(result.payload.access_mode, "public_only");
  assert.equal(result.payload.access_details.account_creation_allowed, false);
});

test("human test requests infer a specific flow from coding-agent context", () => {
  const result = normalizeHumanTestRequestPayload(
    {
      target_url: "https://preview.example.com/signup",
      work_summary: "Added signup password validation",
      acceptance_criteria: ["A valid password reaches the OTP screen"]
    },
    OWNER
  );

  assert.equal(result.ok, true);
  assert.equal(result.payload.review_type, "specific_flow");
  assert.match(result.payload.test_focus, /signup password validation/i);
  assert.deepEqual(result.payload.context.acceptance_criteria, ["A valid password reaches the OTP screen"]);
});

test("a specific human test asks only for its missing flow", () => {
  const result = normalizeHumanTestRequestPayload(
    {
      target_url: "https://preview.example.com",
      review_type: "specific_flow"
    },
    OWNER
  );

  assert.equal(result.ok, false);
  assert.equal(result.needs_input, true);
  assert.match(result.error, /specific flow/i);
});

test("test-account credentials are encrypted and omitted from public request rows", () => {
  const secret = "test-secret";
  const result = normalizeHumanTestRequestPayload(
    {
      target_url: "https://preview.example.com/account",
      test_focus: "Open account settings",
      access_mode: "test_account",
      credentials: {
        login_url: "https://preview.example.com/login",
        username: "qa@example.com",
        password: "NotARealPassword1!"
      }
    },
    OWNER,
    { credentialsSecret: secret }
  );

  assert.equal(result.ok, true);
  assert.equal(result.payload.access_details.credentials_supplied, true);
  assert.equal(JSON.stringify(result.payload.private_access).includes("NotARealPassword1!"), false);

  const row = { id: "request_1", created_at: "2026-07-15T00:00:00.000Z", ...result.payload };
  const publicRow = normalizeHumanTestRequestRow(row);
  const privateRow = normalizeHumanTestRequestRow(row, {
    includeCredentials: true,
    credentialsSecret: secret
  });
  assert.equal(publicRow.credentials, undefined);
  assert.equal(publicRow.private_access, undefined);
  assert.equal(privateRow.credentials.username, "qa@example.com");
  assert.equal(privateRow.credentials.password, "NotARealPassword1!");
});

test("secret envelopes reject the wrong key", () => {
  const sealed = sealSecretObject({ username: "qa@example.com" }, { credentialsSecret: "right" });
  assert.equal(sealed.ok, true);
  assert.equal(openSecretObject(sealed.envelope, { credentialsSecret: "right" }).value.username, "qa@example.com");
  assert.equal(openSecretObject(sealed.envelope, { credentialsSecret: "wrong" }).ok, false);
});
