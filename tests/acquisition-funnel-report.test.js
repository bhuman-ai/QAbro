const test = require("node:test");
const assert = require("node:assert/strict");

const {
  filterAcquisitionEvents,
  loadAcquisitionEvents,
  summarizeAcquisitionEvents
} = require("../scripts/acquisition-funnel-report");

test("funnel report counts people once and computes truthful rates", () => {
  const events = [
    { event_name: "offer_viewed", visitor_id: "visitor_1" },
    { event_name: "offer_viewed", visitor_id: "visitor_1" },
    { event_name: "offer_viewed", visitor_id: "visitor_2" },
    { event_name: "primary_cta_clicked", visitor_id: "visitor_1" },
    { event_name: "signup_completed", visitor_id: "visitor_1", owner_user_id: "user_1" },
    { event_name: "mcp_key_created", visitor_id: "visitor_1", owner_user_id: "user_1" },
    { event_name: "mcp_key_first_used", visitor_id: "visitor_1", owner_user_id: "user_1" },
    { event_name: "first_qa_requested", visitor_id: "visitor_1", owner_user_id: "user_1" },
    {
      event_name: "first_qa_report_completed",
      visitor_id: "visitor_1",
      owner_user_id: "user_1",
      properties: { activation_latency_seconds: 600 }
    }
  ];

  const summary = summarizeAcquisitionEvents(events);

  assert.equal(summary.counts.offer_viewed, 2);
  assert.equal(summary.counts.first_qa_report_completed, 1);
  assert.equal(summary.rates.cta_rate_pct, 50);
  assert.equal(summary.rates.landing_conversion_rate_pct, 50);
  assert.equal(summary.median_activation_seconds, 600);
});

test("event loader excludes test traffic by default", async () => {
  let capturedUrl = "";
  const rows = await loadAcquisitionEvents({
    supabaseUrl: "https://db.example.com",
    serviceKey: "service_key",
    fetchImpl: async (url) => {
      capturedUrl = String(url);
      return {
        ok: true,
        async json() {
          return [];
        }
      };
    }
  });

  assert.deepEqual(rows, []);
  const parsed = new URL(capturedUrl);
  assert.equal(parsed.pathname, "/rest/v1/swarmtest_acquisition_events");
  assert.equal(parsed.searchParams.get("is_test"), "eq.false");
  assert.equal(parsed.searchParams.get("limit"), "10000");
  assert.match(parsed.searchParams.get("select"), /landing_path/);
});

test("funnel report isolates one acquisition source or landing path without exposing identities", () => {
  const events = [
    {
      event_name: "offer_viewed",
      visitor_id: "registry_visitor",
      landing_path: "/docs",
      utm_source: "mcp_registry",
      utm_medium: "marketplace",
      utm_campaign: "official_registry"
    },
    {
      event_name: "offer_viewed",
      visitor_id: "search_visitor",
      landing_path: "/qa-mcp",
      utm_source: "",
      utm_medium: "",
      utm_campaign: ""
    }
  ];

  assert.deepEqual(
    filterAcquisitionEvents(events, { source: "mcp_registry" }),
    [events[0]]
  );
  assert.deepEqual(
    filterAcquisitionEvents(events, { path: "/qa-mcp" }),
    [events[1]]
  );
});
