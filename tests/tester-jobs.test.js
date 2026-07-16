const test = require("node:test");
const assert = require("node:assert/strict");

const { __private } = require("../api/tester-jobs");

function request(overrides = {}) {
  return {
    id: "request-1",
    owner_user_id: "owner-1",
    owner_email: "founder@example.com",
    product_name: "Example App",
    target_url: "https://private.example.com/admin",
    review_type: "specific_flow",
    test_focus: "Create the first project.",
    expected_success: "The project opens.",
    duration_minutes: 30,
    access_mode: "test_account",
    status: "available",
    trial_session_id: null,
    ...overrides
  };
}

test("available tester jobs hide customer identity, target URL, credentials, and benchmark", () => {
  const view = __private.testerJobView({
    ...request(),
    credentials: { username: "secret", password: "secret" },
    private_benchmark: ["Hidden issue"]
  });

  assert.equal(view.product_name, "Example App");
  assert.equal(view.access_mode, "test_account");
  assert.equal(view.can_open, false);
  assert.equal(Object.hasOwn(view, "owner_email"), false);
  assert.equal(Object.hasOwn(view, "target_url"), false);
  assert.equal(Object.hasOwn(view, "credentials"), false);
  assert.equal(Object.hasOwn(view, "private_benchmark"), false);
});

test("only an applied desktop tester without an active test sees qualifications", () => {
  const available = [request()];
  const desktopApplicant = {
    status: "applied",
    devices: ["computer"]
  };
  const ready = __private.splitTesterJobs(desktopApplicant, available, []);
  const mobileOnly = __private.splitTesterJobs({ ...desktopApplicant, devices: ["ios"] }, available, []);
  const busy = __private.splitTesterJobs(desktopApplicant, available, [request({ status: "in_progress" })]);

  assert.equal(ready.available.length, 1);
  assert.equal(ready.can_claim_qualification, true);
  assert.equal(mobileOnly.available.length, 0);
  assert.equal(mobileOnly.desktop_ready, false);
  assert.equal(busy.available.length, 0);
  assert.equal(busy.current.length, 1);
});
