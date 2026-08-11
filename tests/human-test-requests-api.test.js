const test = require("node:test");
const assert = require("node:assert/strict");

const {
  deriveMcpPrivateBenchmark,
  publishAndNotify,
  shouldPublishImmediately
} = require("../api/human-test-requests").__private;

function paidRequest(overrides = {}) {
  return {
    id: "request-1",
    assignment_type: "paid",
    tester_pay_cents: 2000,
    tester_pay_currency: "USD",
    expected_success: "A new user reaches the dashboard.",
    test_focus: "Create a disposable account and complete onboarding.",
    context: {
      acceptance_criteria: ["Signup reaches onboarding"],
      scenario_list: ["Try the primary call to action"]
    },
    ...overrides
  };
}

test("only an explicit MCP hire command requests immediate publication", () => {
  assert.equal(shouldPublishImmediately({ publish_immediately: true }), true);
  assert.equal(shouldPublishImmediately({ publish_immediately: false }), false);
  assert.equal(shouldPublishImmediately({}), false);
});

test("an older MCP client still authorizes publication through its funded request source", () => {
  assert.equal(
    shouldPublishImmediately(
      {},
      paidRequest({
        source: "mcp_human_test",
        context: { funding_confirmed: true, customer_budget_cents: 2000 }
      })
    ),
    true
  );
  assert.equal(
    shouldPublishImmediately(
      {},
      paidRequest({
        source: "dashboard_draft",
        context: { funding_confirmed: true, customer_budget_cents: 2000 }
      })
    ),
    false
  );
});

test("MCP publication derives private review points from the brief already supplied", () => {
  const points = deriveMcpPrivateBenchmark(paidRequest());

  assert.deepEqual(points.slice(0, 2), [
    "Signup reaches onboarding",
    "Try the primary call to action"
  ]);
  assert.match(points.join(" "), /Expected result: A new user reaches the dashboard/i);
  assert.match(points.join(" "), /Requested focus: Create a disposable account/i);
});

test("MCP publication publishes and alerts eligible testers once", async () => {
  const request = paidRequest();
  let publishInput = null;
  let notifyCount = 0;
  const result = await publishAndNotify(
    request,
    { publish_immediately: true },
    {},
    {
      deriveBenchmark: true,
      publishImpl: async (_id, input) => {
        publishInput = input;
        return {
          ok: true,
          published: true,
          newly_published: true,
          request: { ...request, status: "available" }
        };
      },
      notifyImpl: async () => {
        notifyCount += 1;
        return { ok: true, eligible_count: 2, sent_count: 2, failed_count: 0 };
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.request.status, "available");
  assert.equal(result.notifications.sent_count, 2);
  assert.equal(notifyCount, 1);
  assert.equal(publishInput.assignment_type, "paid");
  assert.equal(publishInput.tester_pay_cents, 2000);
  assert.ok(publishInput.private_benchmark.length >= 1);
});

test("an idempotent publication retry does not alert testers twice", async () => {
  const request = paidRequest({ status: "available" });
  let notifyCount = 0;
  const result = await publishAndNotify(
    request,
    { publish_immediately: true },
    {},
    {
      deriveBenchmark: true,
      publishImpl: async () => ({
        ok: true,
        published: true,
        newly_published: false,
        request
      }),
      notifyImpl: async () => {
        notifyCount += 1;
        return { ok: true, sent_count: 1 };
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.notifications.skipped, true);
  assert.equal(notifyCount, 0);
});
