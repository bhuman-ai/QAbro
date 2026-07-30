const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  normalizeAcquisitionEvent,
  normalizeLandingPath,
  writeAcquisitionEvent
} = require("../lib/acquisition-events");

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}

test("acquisition migration creates a private idempotent event journal", () => {
  const migration = fs.readFileSync(
    path.resolve(__dirname, "../supabase/migrations/20260730140000_create_swarmtest_acquisition_events.sql"),
    "utf8"
  );

  assert.match(migration, /create table if not exists public\.swarmtest_acquisition_events/);
  assert.match(migration, /event_key text not null unique/);
  assert.match(migration, /event_name in \(/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /idx_swarmtest_acquisition_events_owner_occurred/);
});

test("database triggers record first use, first request, and first completed report", () => {
  const migration = fs.readFileSync(
    path.resolve(__dirname, "../supabase/migrations/20260730143000_wire_acquisition_milestones.sql"),
    "utf8"
  );

  assert.match(migration, /old\.last_used_at is null and new\.last_used_at is not null/);
  assert.match(migration, /'mcp_key_first_used:' \|\| new\.id::text/);
  assert.match(migration, /'first_qa_requested:' \|\| new\.owner_user_id/);
  assert.match(migration, /lower\(coalesce\(new\.status, ''\)\) = 'completed'/);
  assert.match(migration, /'first_qa_report_completed:' \|\| new\.owner_user_id/);
  assert.match(migration, /on conflict \(event_key\) do nothing/g);

  const mcpAttributionMigration = fs.readFileSync(
    path.resolve(__dirname, "../supabase/migrations/20260730150000_fix_mcp_acquisition_attribution.sql"),
    "utf8"
  );
  assert.match(mcpAttributionMigration, /if tg_op = 'INSERT'/);
  assert.match(mcpAttributionMigration, /'mcp_key_created:' \|\| new\.id::text/);
  assert.match(mcpAttributionMigration, /first_touch\.utm_source/);
  assert.match(mcpAttributionMigration, /coalesce\(first_touch\.is_test, false\)/);
  assert.match(mcpAttributionMigration, /after insert or update of last_used_at/);
});

test("landing paths discard origins, queries, and fragments", () => {
  assert.equal(normalizeLandingPath("https://beforeusersdo.com/docs?secret=1#start"), "/docs");
  assert.equal(normalizeLandingPath("/dashboard?panel=coding_agents"), "/dashboard");
  assert.equal(normalizeLandingPath("dashboard"), "");
});

test("event normalization keeps only allowlisted attribution and properties", () => {
  const normalized = normalizeAcquisitionEvent(
    {
      event_name: "first_qa_report_completed",
      event_key: "first_qa_report_completed:user_123",
      owner_user_id: "user_123",
      owner_email: "must-not-be-stored@example.com",
      landing_path: "https://beforeusersdo.com/?invite=secret",
      attribution: {
        utm_source: "founder_outreach",
        utm_medium: "dm",
        utm_campaign: "install_funnel_v1",
        email: "must-not-be-stored@example.com"
      },
      is_test: true,
      properties: {
        run_id: "run_123",
        report_status: "completed",
        finding_count: 3,
        activation_latency_seconds: 420,
        target_url: "https://private.example.com",
        report_markdown: "private report"
      }
    },
    { now: "2026-07-30T14:00:00.000Z" }
  );

  assert.equal(normalized.ok, true);
  assert.deepEqual(normalized.payload, {
    event_name: "first_qa_report_completed",
    event_key: "first_qa_report_completed:user_123",
    visitor_id: null,
    owner_user_id: "user_123",
    occurred_at: "2026-07-30T14:00:00.000Z",
    landing_path: "/",
    utm_source: "founder_outreach",
    utm_medium: "dm",
    utm_campaign: "install_funnel_v1",
    utm_content: null,
    utm_term: null,
    is_test: true,
    properties: {
      run_id: "run_123",
      report_status: "completed",
      finding_count: 3,
      activation_latency_seconds: 420
    }
  });
  assert.equal(JSON.stringify(normalized.payload).includes("must-not-be-stored"), false);
  assert.equal(JSON.stringify(normalized.payload).includes("private.example.com"), false);
});

test("event normalization rejects unsupported or incomplete milestones", () => {
  const invalidEvent = normalizeAcquisitionEvent({
    event_name: "email_captured",
    event_key: "email_captured:user_123",
    owner_user_id: "user_123",
    properties: {}
  });
  assert.equal(invalidEvent.ok, false);
  assert.equal(invalidEvent.error, "event_name is invalid");

  const invalidVisitor = normalizeAcquisitionEvent({
    event_name: "offer_viewed",
    event_key: "offer_viewed:visitor",
    visitor_id: "not-a-uuid",
    properties: { surface: "homepage", path: "/" }
  });
  assert.equal(invalidVisitor.ok, false);
  assert.equal(invalidVisitor.error, "visitor_id must be a UUID");

  const incompleteReport = normalizeAcquisitionEvent({
    event_name: "first_qa_report_completed",
    event_key: "first_qa_report_completed:user_123",
    owner_user_id: "user_123",
    properties: {
      run_id: "run_123",
      report_status: "failed",
      finding_count: 0,
      activation_latency_seconds: 10
    }
  });
  assert.equal(incompleteReport.ok, false);
  assert.equal(incompleteReport.error, "report_status must be completed");
});

test("writer posts a sanitized event with conflict-safe idempotency", async () => {
  let captured = null;
  const result = await writeAcquisitionEvent(
    {
      event_name: "mcp_key_created",
      event_key: "mcp_key_created:token_123",
      owner_user_id: "user_123",
      properties: {
        token_id: "token_123",
        source: "dashboard_settings",
        token_secret: "must-not-be-stored"
      }
    },
    {
      now: "2026-07-30T14:05:00.000Z",
      supabaseUrl: "https://db.example.com/",
      serviceKey: "service_key",
      fetchImpl: async (url, init) => {
        captured = { url: String(url), init, body: JSON.parse(init.body) };
        return jsonResponse([{ id: 42, ...captured.body }], 201);
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.created, true);
  const requestUrl = new URL(captured.url);
  assert.equal(requestUrl.pathname, "/rest/v1/swarmtest_acquisition_events");
  assert.equal(requestUrl.searchParams.get("on_conflict"), "event_key");
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.init.headers.Prefer, "resolution=ignore-duplicates,return=representation");
  assert.deepEqual(captured.body.properties, {
    token_id: "token_123",
    source: "dashboard_settings"
  });
});

test("writer treats an ignored duplicate as successful and not newly created", async () => {
  const result = await writeAcquisitionEvent(
    {
      event_name: "mcp_key_first_used",
      event_key: "mcp_key_first_used:token_123",
      owner_user_id: "user_123",
      properties: { token_id: "token_123" }
    },
    {
      supabaseUrl: "https://db.example.com",
      serviceKey: "service_key",
      fetchImpl: async () => jsonResponse([], 201)
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.created, false);
  assert.equal(result.item, null);
});
