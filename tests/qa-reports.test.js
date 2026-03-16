const test = require("node:test");
const assert = require("node:assert/strict");

const {
  extractBrandKey,
  extractOwnerUserId,
  getQaRunStatus,
  summarizeReportRow,
  listQaReports
} = require("../lib/qa-queue");

test("extractBrandKey prefers run_request metadata", () => {
  const row = {
    target: "example.com",
    payload: {
      run_request: {
        metadata: {
          brand_id: "brand_123"
        }
      }
    }
  };

  assert.equal(extractBrandKey(row), "brand_123");
});

test("extractOwnerUserId reads owner metadata from run request", () => {
  const row = {
    payload: {
      run_request: {
        metadata: {
          owner_user_id: "user_abc"
        }
      }
    }
  };

  assert.equal(extractOwnerUserId(row), "user_abc");
});

test("summarizeReportRow returns dashboard-friendly shape", () => {
  const row = {
    run_id: "run_1",
    target: "example.com",
    status: "completed",
    delivered_at: "2026-03-04T00:00:00.000Z",
    source: "qa_bot",
    report_url: "https://swarmtester.com/api/qa/report?run_id=run_1",
    payload: {
      queue: {
        status: "completed"
      },
      run_request: {
        target_url: "https://example.com/signup",
        scope_mode: "feature_targeted",
        scenario_list: ["Create account", "Verify OTP"],
        brand_persona: "Skeptical Product Manager",
        metadata: {
          brand: "acme",
          brand_name: "Acme",
          goal: "Create an account, finish onboarding, and verify the first OTP flow."
        }
      },
      report_json: {
        status: "failed",
        findings: [{ id: "f1" }],
        tested_journeys: [{ id: "j1" }, { id: "j2" }],
        recommendations: ["r1"],
        summary: {
          note: "Summary note",
          risk_score: 42,
          counts: { bug: 1 }
        },
        evidence_gallery: {
          screenshots: ["https://example.com/1.png"],
          session_url: "https://browserbase/session",
          debug_url: "https://browserbase/debug"
        }
      }
    }
  };

  const summary = summarizeReportRow(row);
  assert.equal(summary.brand_key, "acme");
  assert.equal(summary.findings_count, 1);
  assert.equal(summary.journeys_count, 2);
  assert.equal(summary.recommendations_count, 1);
  assert.equal(summary.risk_score, 42);
  assert.equal(summary.hero_screenshot, "https://example.com/1.png");
  assert.equal(summary.persona, "Skeptical Product Manager");
  assert.equal(summary.target_url, "https://example.com/signup");
  assert.equal(summary.scope_mode, "feature_targeted");
  assert.deepEqual(summary.scenario_list, ["Create account", "Verify OTP"]);
  assert.equal(summary.brand_name, "Acme");
  assert.equal(summary.goal, "Create an account, finish onboarding, and verify the first OTP flow.");
  assert.equal(summary.latest_report_status, "failed");
});

test("listQaReports filters by brand", async () => {
  const rows = [
    {
      run_id: "run_a",
      target: "a.example",
      status: "completed",
      delivered_at: "2026-03-04T00:00:00.000Z",
      payload: {
        queue: { status: "completed" },
        run_request: { metadata: { brand_id: "brand_alpha" } },
        report_json: { findings: [], tested_journeys: [], recommendations: [], summary: {} }
      }
    },
    {
      run_id: "run_b",
      target: "b.example",
      status: "completed",
      delivered_at: "2026-03-04T00:00:00.000Z",
      payload: {
        queue: { status: "completed" },
        run_request: { metadata: { brand_id: "brand_beta" } },
        report_json: { findings: [], tested_journeys: [], recommendations: [], summary: {} }
      }
    }
  ];

  const result = await listQaReports(
    { brand: "alpha", limit: "50", offset: "0" },
    {
      supabaseUrl: "https://supabase.example",
      serviceKey: "service-key",
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async json() {
          return rows;
        }
      })
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.total, 1);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].run_id, "run_a");
});

test("listQaReports filters by owner_user_id", async () => {
  const rows = [
    {
      run_id: "run_owner_a",
      target: "a.example",
      status: "completed",
      delivered_at: "2026-03-04T00:00:00.000Z",
      payload: {
        queue: { status: "completed" },
        run_request: { metadata: { owner_user_id: "user_alpha" } },
        report_json: { findings: [], tested_journeys: [], recommendations: [], summary: {} }
      }
    },
    {
      run_id: "run_owner_b",
      target: "b.example",
      status: "completed",
      delivered_at: "2026-03-04T00:00:00.000Z",
      payload: {
        queue: { status: "completed" },
        run_request: { metadata: { owner_user_id: "user_beta" } },
        report_json: { findings: [], tested_journeys: [], recommendations: [], summary: {} }
      }
    }
  ];
  const capturedUrls = [];

  const result = await listQaReports(
    { owner_user_id: "user_alpha", limit: "50", offset: "0" },
    {
      supabaseUrl: "https://supabase.example",
      serviceKey: "service-key",
      fetchImpl: async (url) => {
        capturedUrls.push(String(url));
        return {
          ok: true,
          status: 200,
          async json() {
            return rows;
          }
        };
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.total, 1);
  assert.equal(result.items[0].run_id, "run_owner_a");
  assert.equal(capturedUrls.length, 1);
  assert.match(
    decodeURIComponent(capturedUrls[0]),
    /payload=cs\.\{"run_request":\{"metadata":\{"owner_user_id":"user_alpha"\}\}\}/
  );
});

test("getQaRunStatus enforces owner_user_id visibility", async () => {
  const row = {
    run_id: "run_secure",
    target: "secure.example",
    status: "processing",
    payload: {
      queue: { status: "processing" },
      run_request: {
        run_id: "run_secure",
        target_url: "https://secure.example",
        metadata: {
          owner_user_id: "user_alpha"
        }
      }
    }
  };

  const denied = await getQaRunStatus("run_secure", {
    ownerUserId: "user_beta",
    supabaseUrl: "https://supabase.example",
    serviceKey: "service-key",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return [row];
      }
    })
  });

  assert.equal(denied.ok, false);
  assert.equal(denied.status, 404);

  const allowed = await getQaRunStatus("run_secure", {
    ownerUserId: "user_alpha",
    supabaseUrl: "https://supabase.example",
    serviceKey: "service-key",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return [row];
      }
    })
  });

  assert.equal(allowed.ok, true);
  assert.equal(allowed.queue.queue_status, "processing");
});

test("getQaRunStatus returns queue insight for queued runs", async () => {
  const queuedRow = {
    run_id: "run_waiting",
    created_at: "2026-03-07T10:01:00.000Z",
    target: "queued.example",
    status: "queued",
    payload: {
      queue: {
        status: "queued",
        enqueued_at: "2026-03-07T10:01:00.000Z"
      },
      run_request: {
        run_id: "run_waiting",
        target_url: "https://queued.example",
        metadata: {
          owner_user_id: "user_alpha"
        }
      }
    }
  };

  const processingAheadRow = {
    run_id: "run_processing",
    created_at: "2026-03-07T10:00:00.000Z",
    target: "queued.example",
    status: "processing",
    payload: {
      queue: {
        status: "processing",
        enqueued_at: "2026-03-07T10:00:00.000Z"
      },
      run_request: {
        run_id: "run_processing",
        target_url: "https://queued.example",
        metadata: {
          owner_user_id: "user_alpha"
        }
      }
    }
  };

  const result = await getQaRunStatus("run_waiting", {
    ownerUserId: "user_alpha",
    supabaseUrl: "https://supabase.example",
    serviceKey: "service-key",
    fetchImpl: async (url) => {
      const value = String(url || "");
      if (value.includes("run_id=eq.run_waiting")) {
        return {
          ok: true,
          status: 200,
          async json() {
            return [queuedRow];
          }
        };
      }

      return {
        ok: true,
        status: 200,
        async json() {
          return [processingAheadRow, queuedRow];
        }
      };
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.queue.queue_status, "queued");
  assert.equal(result.queue.queue_ahead, 1);
  assert.equal(result.queue.processing_ahead, 1);
  assert.equal(result.queue.active_total, 2);
  assert.equal(typeof result.queue.estimated_start_seconds, "number");
  assert.equal(result.queue.estimated_start_seconds > 0, true);
});
