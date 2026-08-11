const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assignHumanTestRequest,
  claimHumanTestRequest,
  normalizeHumanTestRequestPayload,
  normalizeHumanTestRequestRow,
  markHumanTestRequestPaid,
  publishHumanTestRequest,
  reserveHumanTestRequest
} = require("../lib/human-test-requests");
const { openSecretObject, sealSecretObject } = require("../lib/qa-secret-box");

const OWNER = {
  owner_user_id: "owner_123",
  owner_email: "owner@example.com"
};

test("explicit qualification trials default to a safe first-time-user review", () => {
  const result = normalizeHumanTestRequestPayload(
    { target_url: "https://preview.example.com", assignment_type: "qualification" },
    OWNER
  );

  assert.equal(result.ok, true);
  assert.equal(result.payload.review_type, "general_first_time_user");
  assert.equal(result.payload.access_mode, "public_only");
  assert.equal(result.payload.duration_minutes, 15);
  assert.equal(result.payload.access_details.purchase_allowed, false);
  assert.equal(result.payload.access_details.irreversible_actions_allowed, false);
  assert.match(result.payload.test_focus, /first-time user/i);
  assert.match(result.payload.test_focus, /vague, generic, robotic, repetitive/i);
  assert.match(result.payload.test_focus, /Quote the exact words/i);
  assert.match(result.payload.test_focus, /do not guess who or what wrote them/i);
  assert.match(result.payload.test_focus, /cluttered, generic, AI-templated/i);
  assert.match(result.payload.test_focus, /exact visual pattern/i);
  assert.match(result.payload.test_focus, /do not report personal taste as a problem/i);
  assert.match(result.payload.access_details.prohibited_actions.join(" "), /real purchase/i);
});

test("human test requests require funding and preserve explicit paid budgets", () => {
  const creditRequest = normalizeHumanTestRequestPayload(
    {
      target_url: "https://preview.example.com",
      test_focus: "Create the first project.",
      assignment_type: "paid",
      funding_type: "qa_credit",
      qa_credit_amount_cents: 2500
    },
    OWNER
  );
  const missingFunding = normalizeHumanTestRequestPayload(
    { target_url: "https://preview.example.com" },
    OWNER
  );
  const cashRequest = normalizeHumanTestRequestPayload(
    {
      target_url: "https://preview.example.com",
      assignment_type: "paid",
      funding_type: "cash",
      tester_pay_cents: 3000
    },
    OWNER
  );

  assert.equal(creditRequest.ok, true);
  assert.equal(creditRequest.payload.funding_type, "qa_credit");
  assert.equal(creditRequest.payload.assignment_type, "paid");
  assert.equal(creditRequest.payload.tester_pay_cents, 2500);
  assert.equal(creditRequest.payload.payout_status, "pending");
  assert.equal(missingFunding.ok, false);
  assert.equal(missingFunding.needs_input, true);
  assert.match(missingFunding.error, /cash, QA credit, or an explicit qualification trial/i);
  assert.equal(cashRequest.ok, true);
  assert.equal(cashRequest.payload.funding_type, "cash");
  assert.equal(cashRequest.payload.assignment_type, "paid");
  assert.equal(cashRequest.payload.tester_pay_cents, 3000);
  assert.equal(cashRequest.payload.context.customer_budget_cents, 3000);
});

test("explicit public-only access cannot inherit a stale signup permission", () => {
  const result = normalizeHumanTestRequestPayload(
    {
      target_url: "https://preview.example.com",
      assignment_type: "qualification",
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
      assignment_type: "qualification",
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
      assignment_type: "qualification",
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
      assignment_type: "qualification",
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

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return data;
    }
  };
}

function requestRow(overrides = {}) {
  return {
    id: "request-1",
    owner_user_id: "owner-1",
    owner_email: "founder@example.com",
    product_name: "Example App",
    target_url: "https://example.com",
    review_type: "specific_flow",
    test_focus: "Try signup.",
    duration_minutes: 30,
    access_mode: "public_only",
    access_details: {},
    context: {},
    status: "queued",
    source: "mcp_human_test",
    ...overrides
  };
}

test("operator publishing stores private review points and makes a request available", async () => {
  const calls = [];
  const result = await publishHumanTestRequest(
    "request-1",
    { known_issues: ["The main action is hard to find"] },
    {
      supabaseUrl: "https://supabase.example",
      serviceKey: "service-key",
      fetchImpl: async (url, init = {}) => {
        calls.push({ url: String(url), init });
        if (init.method === "PATCH") {
          const body = JSON.parse(init.body);
          return jsonResponse([requestRow({ ...body })]);
        }
        return jsonResponse([requestRow()]);
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.request.status, "available");
  assert.equal(result.newly_published, true);
  const patchBody = JSON.parse(calls.find((call) => call.init.method === "PATCH").init.body);
  assert.deepEqual(patchBody.private_benchmark, ["The main action is hard to find"]);
  assert.equal(patchBody.status, "available");
});

test("operator publishing a paid assignment requires and stores the exact tester pay", async () => {
  let patchBody = null;
  const missingPay = await publishHumanTestRequest(
    "request-1",
    { assignment_type: "paid", known_issues: ["The main action is hard to find"] },
    {
      supabaseUrl: "https://supabase.example",
      serviceKey: "service-key",
      fetchImpl: async () => jsonResponse([requestRow()])
    }
  );
  assert.equal(missingPay.ok, false);
  assert.match(missingPay.error, /tester pay/i);

  const published = await publishHumanTestRequest(
    "request-1",
    {
      assignment_type: "paid",
      tester_pay_cents: 2500,
      tester_pay_currency: "usd",
      known_issues: ["The main action is hard to find"]
    },
    {
      supabaseUrl: "https://supabase.example",
      serviceKey: "service-key",
      fetchImpl: async (_url, init = {}) => {
        if (init.method === "PATCH") {
          patchBody = JSON.parse(init.body);
          return jsonResponse([requestRow({ ...patchBody })]);
        }
        return jsonResponse([requestRow()]);
      }
    }
  );

  assert.equal(published.ok, true);
  assert.equal(published.request.assignment_type, "paid");
  assert.equal(published.request.tester_pay_cents, 2500);
  assert.equal(published.request.tester_pay_currency, "USD");
  assert.equal(published.request.payout_status, "pending");
  assert.equal(patchBody.payout_paid_at, null);
});

test("operator cannot change the tester reward on a credit-funded request", async () => {
  const result = await publishHumanTestRequest(
    "request-1",
    {
      assignment_type: "paid",
      tester_pay_cents: 3000,
      known_issues: ["The main action is hard to find"]
    },
    {
      supabaseUrl: "https://supabase.example",
      serviceKey: "service-key",
      fetchImpl: async () =>
        jsonResponse([
          requestRow({
            assignment_type: "paid",
            tester_pay_cents: 2500,
            payout_status: "pending",
            funding_type: "qa_credit",
            qa_credit_spent_cents: 2500
          })
        ])
    }
  );

  assert.equal(result.ok, false);
  assert.match(result.error, /original tester pay/i);
});

test("operator cannot change a customer-confirmed cash tester budget", async () => {
  const result = await publishHumanTestRequest(
    "request-1",
    {
      assignment_type: "paid",
      tester_pay_cents: 3000,
      known_issues: ["The main action is hard to find"]
    },
    {
      supabaseUrl: "https://supabase.example",
      serviceKey: "service-key",
      fetchImpl: async () =>
        jsonResponse([
          requestRow({
            assignment_type: "paid",
            tester_pay_cents: 2500,
            payout_status: "pending",
            funding_type: "cash",
            context: {
              payment_method: "cash",
              funding_confirmed: true,
              customer_budget_cents: 2500
            }
          })
        ])
    }
  );

  assert.equal(result.ok, false);
  assert.match(result.error, /customer-confirmed/i);
});

test("a completed approved payout can be recorded as paid", async () => {
  let patchBody = null;
  const result = await markHumanTestRequestPaid("request-1", {
    supabaseUrl: "https://supabase.example",
    serviceKey: "service-key",
    fetchImpl: async (_url, init = {}) => {
      if (init.method === "PATCH") {
        patchBody = JSON.parse(init.body);
        return jsonResponse([
          requestRow({
            assignment_type: "paid",
            tester_pay_cents: 2500,
            payout_status: "paid",
            status: "completed",
            ...patchBody
          })
        ]);
      }
      return jsonResponse([
        requestRow({
          assignment_type: "paid",
          tester_pay_cents: 2500,
          payout_status: "approved",
          status: "completed",
          trial_session_id: null
        })
      ]);
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.request.payout_status, "paid");
  assert.ok(patchBody.payout_paid_at);
});

test("republishing an available request is marked as a retry and preserves its publication time", async () => {
  const publishedAt = "2026-07-15T12:00:00.000Z";
  let patchBody = null;
  const result = await publishHumanTestRequest(
    "request-1",
    { known_issues: ["The main action is hard to find"] },
    {
      supabaseUrl: "https://supabase.example",
      serviceKey: "service-key",
      fetchImpl: async (_url, init = {}) => {
        if (init.method === "PATCH") {
          patchBody = JSON.parse(init.body);
          return jsonResponse([requestRow({ status: "available", published_at: publishedAt, ...patchBody })]);
        }
        return jsonResponse([requestRow({ status: "available", published_at: publishedAt })]);
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.newly_published, false);
  assert.equal(patchBody.published_at, publishedAt);
});

test("concurrent publication loses the compare-and-set race without duplicating publication", async () => {
  let reads = 0;
  const publishedAt = "2026-07-15T12:00:00.000Z";
  const result = await publishHumanTestRequest(
    "request-1",
    { known_issues: ["The main action is hard to find"] },
    {
      supabaseUrl: "https://supabase.example",
      serviceKey: "service-key",
      fetchImpl: async (_url, init = {}) => {
        if (init.method === "PATCH") return jsonResponse([]);
        reads += 1;
        return jsonResponse([
          requestRow(
            reads === 1
              ? { status: "queued" }
              : { status: "available", published_at: publishedAt }
          )
        ]);
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.request.status, "available");
  assert.equal(result.newly_published, false);
  assert.equal(result.request.published_at, publishedAt);
});

test("tester reservation uses a conditional update so only one tester can take a job", async () => {
  let capturedUrl = "";
  const unavailable = await reserveHumanTestRequest(
    "request-1",
    { application_id: "application-1", name: "Maya", email: "maya@example.com" },
    {
      supabaseUrl: "https://supabase.example",
      serviceKey: "service-key",
      fetchImpl: async (url) => {
        capturedUrl = String(url);
        return jsonResponse([]);
      }
    }
  );

  assert.equal(unavailable.status, 409);
  assert.match(unavailable.error, /already took/i);
  const requestUrl = new URL(capturedUrl);
  assert.equal(requestUrl.searchParams.get("id"), "eq.request-1");
  assert.equal(requestUrl.searchParams.get("status"), "eq.available");
});

test("operator can send a published test directly to an invited tester", async () => {
  const trialInputs = [];
  let reservedBody = null;
  let finalPatch = null;
  const result = await assignHumanTestRequest(
    "request-1",
    { tester_name: "Haley", tester_public_name: "Haley", tester_email: "haley@example.com" },
    {
      supabaseUrl: "https://supabase.example",
      serviceKey: "service-key",
      publicBaseUrl: "https://beforeusersdo.com",
      createQaTrialImpl: async (input) => {
        trialInputs.push(input);
        return {
          ok: true,
          status: 201,
          session_id: "trial-1",
          tester_url: "https://beforeusersdo.com/trial?tester=1",
          lead_url: "https://beforeusersdo.com/trial?lead=1"
        };
      },
      fetchImpl: async (url, init = {}) => {
        const requestUrl = new URL(String(url));
        if (init.method === "PATCH" && requestUrl.searchParams.get("status") === "eq.available") {
          reservedBody = JSON.parse(init.body);
          return jsonResponse([
            requestRow({
              status: "assigned",
              duration_minutes: 15,
              assignment_type: "qualification",
              private_benchmark: ["The main action is hard to find"],
              ...reservedBody
            })
          ]);
        }
        if (init.method === "PATCH") {
          finalPatch = JSON.parse(init.body);
          return jsonResponse([
            requestRow({
              status: "assigned",
              duration_minutes: 15,
              assigned_tester_name: "Haley",
              assigned_tester_email: "haley@example.com",
              ...finalPatch
            })
          ]);
        }
        return jsonResponse([]);
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.session_id, "trial-1");
  assert.equal(reservedBody.status, "assigned");
  assert.equal(reservedBody.assigned_tester_email, "haley@example.com");
  assert.equal(finalPatch.trial_session_id, "trial-1");
  assert.equal(trialInputs.length, 1);
  assert.equal(trialInputs[0].duration_minutes, 15);
  assert.equal(trialInputs[0].tester_public_name, "Haley");
  assert.deepEqual(trialInputs[0].known_issues, ["The main action is hard to find"]);
});

test("self-claim snapshots only the tester's explicit public name", async () => {
  let trialInput = null;
  const result = await claimHumanTestRequest(
    "request-1",
    {
      application_id: "application-1",
      name: "Maya Tester",
      public_name: "Maya",
      email: "maya@example.com"
    },
    {
      supabaseUrl: "https://supabase.example",
      serviceKey: "service-key",
      publicBaseUrl: "https://beforeusersdo.com",
      createQaTrialImpl: async (input) => {
        trialInput = input;
        return {
          ok: true,
          status: 201,
          session_id: "trial-1",
          tester_url: "https://beforeusersdo.com/trial?tester=1",
          lead_url: "https://beforeusersdo.com/trial?lead=1"
        };
      },
      fetchImpl: async (url, init = {}) => {
        const requestUrl = new URL(String(url));
        if (!init.method) return jsonResponse([]);
        if (requestUrl.searchParams.get("status") === "eq.available") {
          const body = JSON.parse(init.body);
          return jsonResponse([
            requestRow({
              ...body,
              status: "assigned",
              assignment_type: "paid",
              tester_pay_cents: 2500,
              tester_pay_currency: "USD",
              private_benchmark: ["The main action is hard to find"],
              assigned_tester_email: "maya@example.com"
            })
          ]);
        }
        return jsonResponse([
          requestRow({
            ...JSON.parse(init.body),
            status: "assigned",
            assignment_type: "paid",
            assigned_tester_email: "maya@example.com"
          })
        ]);
      }
    }
  );

  assert.equal(result.ok, true, result.error);
  assert.equal(trialInput.tester_name, "Maya Tester");
  assert.equal(trialInput.tester_public_name, "Maya");
});

test("direct invite does not create a trial after another tester takes the request", async () => {
  let created = false;
  const result = await assignHumanTestRequest(
    "request-1",
    { tester_name: "Haley", tester_public_name: "Haley", tester_email: "haley@example.com" },
    {
      supabaseUrl: "https://supabase.example",
      serviceKey: "service-key",
      createQaTrialImpl: async () => {
        created = true;
        return { ok: true };
      },
      fetchImpl: async () => jsonResponse([])
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.equal(created, false);
});

test("failed direct invite releases the request back to the tester pool", async () => {
  const patches = [];
  const result = await assignHumanTestRequest(
    "request-1",
    { tester_name: "Haley", tester_public_name: "Haley", tester_email: "haley@example.com" },
    {
      supabaseUrl: "https://supabase.example",
      serviceKey: "service-key",
      createQaTrialImpl: async () => ({ ok: false, status: 503, error: "Email service unavailable" }),
      fetchImpl: async (url, init = {}) => {
        const requestUrl = new URL(String(url));
        if (init.method === "PATCH") patches.push({ requestUrl, body: JSON.parse(init.body) });
        if (requestUrl.searchParams.get("status") === "eq.available") {
          return jsonResponse([
            requestRow({
              status: "assigned",
              private_benchmark: ["The main action is hard to find"],
              assigned_tester_email: "haley@example.com"
            })
          ]);
        }
        return jsonResponse(null, 204);
      }
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.equal(patches.length, 2);
  assert.equal(patches[1].requestUrl.searchParams.get("assigned_tester_email"), "eq.haley@example.com");
  assert.equal(patches[1].body.status, "available");
  assert.equal(patches[1].body.assigned_tester_email, null);
});
