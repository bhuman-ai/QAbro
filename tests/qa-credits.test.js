const test = require("node:test");
const assert = require("node:assert/strict");

const { awardQaCredit, getQaCreditBalance, spendQaCredit } = require("../lib/qa-credits");

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return data;
    }
  };
}

test("QA credit balance sums immutable ledger entries", async () => {
  const result = await getQaCreditBalance("user-1", "USD", {
    supabaseUrl: "https://supabase.example",
    serviceKey: "service-key",
    fetchImpl: async (url) => {
      assert.match(String(url), /owner_user_id=eq\.user-1/);
      return jsonResponse([{ amount_cents: 3000 }, { amount_cents: -1200 }]);
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.balance_cents, 1800);
  assert.equal(result.currency, "USD");
});

test("spending and earning QA credit use the guarded database functions", async () => {
  const calls = [];
  const options = {
    supabaseUrl: "https://supabase.example",
    serviceKey: "service-key",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) });
      return jsonResponse(2500);
    }
  };

  const spent = await spendQaCredit(
    {
      owner_user_id: "user-1",
      owner_email: "tester@example.com",
      request_id: "request-1",
      amount_cents: 2500,
      currency: "usd"
    },
    options
  );
  const earned = await awardQaCredit("request-2", options);

  assert.equal(spent.ok, true);
  assert.equal(spent.balance_cents, 2500);
  assert.match(calls[0].url, /rpc\/swarmtest_spend_qa_credit$/);
  assert.equal(calls[0].body.p_amount_cents, 2500);
  assert.match(calls[1].url, /rpc\/swarmtest_award_qa_credit$/);
  assert.equal(calls[1].body.p_request_id, "request-2");
  assert.equal(earned.ok, true);
});
