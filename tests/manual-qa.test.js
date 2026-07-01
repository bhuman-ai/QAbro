const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildManualQaChecklist,
  createManualQaSession,
  exportManualQaSession,
  redactSensitiveUrl,
  updateManualQaItem
} = require("../lib/manual-qa");

function createSupabaseFetchMock() {
  const rows = new Map();
  const calls = [];

  async function fetchImpl(url, options = {}) {
    calls.push({ url, options });
    const parsed = new URL(url);
    const runFilter = parsed.searchParams.get("run_id") || "";
    const runId = runFilter.startsWith("eq.") ? runFilter.slice(3) : "";

    if (options.method === "POST") {
      const body = JSON.parse(options.body || "[]");
      const row = { id: 1, created_at: "2026-07-01T00:00:00.000Z", updated_at: "2026-07-01T00:00:00.000Z", ...body[0] };
      rows.set(row.run_id, row);
      return {
        ok: true,
        status: 201,
        async json() {
          return [row];
        }
      };
    }

    if (options.method === "PATCH") {
      const current = rows.get(runId);
      const body = JSON.parse(options.body || "{}");
      const next = { ...current, ...body, updated_at: "2026-07-01T00:01:00.000Z" };
      rows.set(runId, next);
      return {
        ok: true,
        status: 200,
        async json() {
          return [next];
        }
      };
    }

    const row = rows.get(runId);
    return {
      ok: true,
      status: 200,
      async json() {
        return row ? [row] : [];
      }
    };
  }

  return { fetchImpl, rows, calls };
}

test("buildManualQaChecklist uses explicit agent test plan start URLs", () => {
  const items = buildManualQaChecklist({
    target_url: "https://example.com/app",
    test_plan: [
      {
        title: "Check paywall copy",
        instructions: "Go through onboarding until the paywall.",
        path: "/onboarding",
        expected: "Plan copy is centered."
      }
    ]
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Check paywall copy");
  assert.equal(items[0].start_url, "https://example.com/onboarding");
  assert.equal(items[0].expected, "Plan copy is centered.");
});

test("manual QA session can be created, updated, and exported with sensitive URLs redacted", async () => {
  const previousEnv = {
    QA_LIVE_STREAM_ENABLED: process.env.QA_LIVE_STREAM_ENABLED,
    QA_LIVE_STREAM_PUBLIC_BASE_URL: process.env.QA_LIVE_STREAM_PUBLIC_BASE_URL,
    QA_LIVE_STREAM_PASSWORD: process.env.QA_LIVE_STREAM_PASSWORD
  };
  process.env.QA_LIVE_STREAM_ENABLED = "1";
  process.env.QA_LIVE_STREAM_PUBLIC_BASE_URL = "https://browser.beforeusersdo.com";
  process.env.QA_LIVE_STREAM_PASSWORD = "pw123";

  const mock = createSupabaseFetchMock();

  try {
    const created = await createManualQaSession(
      {
        target_url: "https://preview.example.com/onboarding?token=abc123",
        brand: "Example",
        title: "Onboarding pass",
        work_summary: "Changed onboarding cards.",
        acceptance_criteria: ["Recommendation cards are personalized."]
      },
      {
        publicBaseUrl: "https://beforeusersdo.com",
        ownerUserId: "user_1",
        ownerEmail: "owner@example.com",
        fetchImpl: mock.fetchImpl,
        supabaseUrl: "https://supabase.example.com",
        serviceKey: "service"
      }
    );

    assert.equal(created.ok, true);
    assert.equal(created.session.checklist.length >= 2, true);
    assert.equal(created.session.browser.status, "viewer_ready");
    assert.match(created.session.browser.viewer_url, /password=pw123/);

    const firstItem = created.session.checklist[0];
    const updated = await updateManualQaItem(
      created.session.session_id,
      firstItem.id,
      {
        status: "pass",
        note: "Looks correct.",
        evidence_urls: ["https://assets.example.com/screenshot.png?token=abc123"]
      },
      {
        authOk: true,
        ownerUserId: "user_1",
        fetchImpl: mock.fetchImpl,
        supabaseUrl: "https://supabase.example.com",
        serviceKey: "service"
      }
    );

    assert.equal(updated.ok, true);
    assert.equal(updated.item.status, "pass");
    assert.equal(updated.item.note, "Looks correct.");

    const exported = await exportManualQaSession(created.session.session_id, {
      authOk: true,
      ownerUserId: "user_1",
      fetchImpl: mock.fetchImpl,
      supabaseUrl: "https://supabase.example.com",
      serviceKey: "service"
    });

    assert.equal(exported.ok, true);
    assert.match(exported.markdown, /token=%5Bredacted%5D/);
    assert.doesNotMatch(exported.markdown, /abc123/);
    assert.doesNotMatch(exported.markdown, /pw123/);
    assert.equal(exported.session.browser.viewer_url, "[redacted in export]");
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("redactSensitiveUrl redacts common secret query params", () => {
  assert.equal(
    redactSensitiveUrl("https://example.com/path?foo=1&access_token=secret&session=abc"),
    "https://example.com/path?foo=1&access_token=%5Bredacted%5D&session=%5Bredacted%5D"
  );
});
