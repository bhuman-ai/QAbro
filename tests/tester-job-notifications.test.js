const test = require("node:test");
const assert = require("node:assert/strict");

const {
  notifyEligibleTestersAboutJob,
  selectEligibleTesterApplications
} = require("../lib/tester-job-notifications");

function application(overrides = {}) {
  return {
    id: "application-1",
    owner_email: "maya@example.com",
    name: "Maya",
    status: "applied",
    devices: ["computer"],
    can_record: true,
    ...overrides
  };
}

test("tester job alerts use the same applied desktop eligibility as the job board", () => {
  const eligible = application();
  const mobileOnly = application({ id: "application-2", owner_email: "mobile@example.com", devices: ["ios"] });
  const approved = application({ id: "application-3", owner_email: "approved@example.com", status: "approved" });
  const busy = application({ id: "application-4", owner_email: "busy@example.com" });
  const selected = selectEligibleTesterApplications(
    [eligible, mobileOnly, approved, busy],
    [{ assigned_tester_application_id: busy.id, assigned_tester_email: busy.owner_email }]
  );

  assert.deepEqual(selected.map((item) => item.id), [eligible.id]);
});

test("publishing notifies each eligible available tester without exposing the job", async () => {
  const deliveries = [];
  const result = await notifyEligibleTestersAboutJob(
    { duration_minutes: 30, target_url: "https://customer.example/private" },
    {
      publicBaseUrl: "https://beforeusersdo.com",
      listTesterApplications: async () => ({
        ok: true,
        items: [
          application(),
          application({ id: "application-2", owner_email: "busy@example.com", name: "Busy" })
        ]
      }),
      listHumanTestRequests: async ({ status }) => ({
        ok: true,
        items:
          status === "in_progress"
            ? [{ assigned_tester_application_id: "application-2", assigned_tester_email: "busy@example.com" }]
            : []
      }),
      sendTesterJobAvailableEmail: async (payload) => {
        deliveries.push(payload);
        return { ok: true };
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.eligible_count, 1);
  assert.equal(result.sent_count, 1);
  assert.equal(result.failed_count, 0);
  assert.deepEqual(deliveries, [
    {
      email: "maya@example.com",
      name: "Maya",
      durationMinutes: 30,
      assignmentType: "qualification",
      testerPayCents: undefined,
      testerPayCurrency: undefined,
      jobsUrl: "https://beforeusersdo.com/testers/jobs"
    }
  ]);
  assert.equal(JSON.stringify(deliveries).includes("customer.example"), false);
});

test("paid job alerts go only to approved desktop testers and include the pay", async () => {
  const deliveries = [];
  const result = await notifyEligibleTestersAboutJob(
    {
      assignment_type: "paid",
      duration_minutes: 20,
      tester_pay_cents: 3500,
      tester_pay_currency: "USD"
    },
    {
      publicBaseUrl: "https://beforeusersdo.com",
      listTesterApplications: async ({ status }) => ({
        ok: true,
        items: status === "approved" ? [application({ status: "approved" })] : []
      }),
      listHumanTestRequests: async () => ({ ok: true, items: [] }),
      sendTesterJobAvailableEmail: async (payload) => {
        deliveries.push(payload);
        return { ok: true };
      }
    }
  );

  assert.equal(result.sent_count, 1);
  assert.equal(deliveries[0].assignmentType, "paid");
  assert.equal(deliveries[0].testerPayCents, 3500);
});

test("notification lookup failures do not throw into the publisher", async () => {
  const result = await notifyEligibleTestersAboutJob(
    { duration_minutes: 30 },
    {
      listTesterApplications: async () => ({ ok: false, error: "database unavailable" }),
      listHumanTestRequests: async () => ({ ok: true, items: [] })
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.skipped, true);
  assert.equal(result.sent_count, 0);
  assert.match(result.error, /database unavailable/i);
});
