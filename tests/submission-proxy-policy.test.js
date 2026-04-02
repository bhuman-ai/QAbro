const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildCountryReplacementPayload,
  buildSemidedicatedIspCountryQuoteQuery,
  chooseProxyRemediationStrategy
} = require("../lib/submission-proxy-policy");

test("chooseProxyRemediationStrategy prefers country replacement when available", () => {
  const strategy = chooseProxyRemediationStrategy(
    {
      customizable: true,
      replacements_available: 10,
      current_countries: { SE: 1 },
      available_countries: { US: 22048 }
    },
    {
      country_code: "US",
      state_code: "TX",
      city: "Forney"
    }
  );

  assert.equal(strategy.action, "replace_country");
  assert.equal(strategy.target_country_code, "US");
});

test("buildCountryReplacementPayload swaps the current country for the target country", () => {
  const payload = buildCountryReplacementPayload(
    {
      current_countries: { SE: 1 },
      active_plan: { proxy_count: 1 }
    },
    "US"
  );

  assert.deepEqual(payload, {
    to_replace: {
      type: "country",
      country_code: "SE",
      count: 1
    },
    replace_with: [
      {
        type: "country",
        country_code: "US",
        count: 1
      }
    ],
    dry_run: false
  });
});

test("buildSemidedicatedIspCountryQuoteQuery preserves the current plan shape", () => {
  const query = buildSemidedicatedIspCountryQuoteQuery("US", {
    proxy_count: 1,
    bandwidth_limit: 1000,
    proxy_replacements_total: 10,
    subusers_total: 3,
    is_high_priority_network: true
  });

  assert.equal(query.proxy_type, "semidedicated");
  assert.equal(query.proxy_subtype, "isp");
  assert.deepEqual(query.proxy_countries, { US: 1 });
  assert.equal(query.bandwidth_limit, 1000);
  assert.equal(query.proxy_replacements_total, 10);
  assert.equal(query.is_high_priority_network, true);
});
