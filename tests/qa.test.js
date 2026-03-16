const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ALLOWED_WEBHOOK_EVENTS,
  buildPrimaryUserGoal,
  buildTaskPrompt,
  buildMarkdownReport,
  extractAgentSections,
  normalizeExecutionEngine,
  normalizeWebhookConfig,
  normalizeReport,
  sendFinalCallback,
  sendRunWebhook,
  validateReport,
  validateRunRequest,
  resolveRunWebhookConfig
} = require("../lib/qa-core");
const runHandler = require("../api/qa/run");

test("validateRunRequest applies defaults", () => {
  const result = validateRunRequest({
    run_id: "run_123",
    target_url: "https://example.com"
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.scope_mode, "core_20m");
  assert.equal(result.data.source, "qa_bot");
  assert.equal(result.data.brand_persona, "General non-developer business user with moderate technical comfort.");
  assert.equal(result.data.dry_run, false);
});

test("validateRunRequest rejects feature_targeted without scenarios", () => {
  const result = validateRunRequest({
    run_id: "run_123",
    target_url: "https://example.com",
    scope_mode: "feature_targeted"
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /scenario_list/i);
});

test("validateRunRequest accepts webhook config and defaults events", () => {
  const result = validateRunRequest({
    run_id: "run_webhook_1",
    target_url: "https://example.com",
    webhook_url: "https://hooks.example.com/swarm"
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.webhook.url, "https://hooks.example.com/swarm");
  assert.deepEqual(result.data.webhook.events, [
    "run.started",
    "run.progress",
    "run.completed",
    "run.failed"
  ]);
});

test("validateRunRequest rejects invalid webhook URL", () => {
  const result = validateRunRequest({
    run_id: "run_webhook_2",
    target_url: "https://example.com",
    webhook_url: "not-a-url"
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /webhook_url/i);
});

test("normalizeWebhookConfig rejects unsupported webhook events in strict mode", () => {
  const normalized = normalizeWebhookConfig(
    {
      webhook_url: "https://hooks.example.com/ingest",
      webhook_events: ["run.started", "run.unknown"]
    },
    { strict: true }
  );

  assert.equal(normalized.ok, false);
  assert.match(normalized.error, /webhook_events/i);
});

test("resolveRunWebhookConfig reads metadata fallback fields", () => {
  const resolved = resolveRunWebhookConfig({
    run_id: "run_webhook_3",
    target_url: "https://example.com",
    metadata: {
      webhook_url: "https://hooks.example.com/metadata",
      webhook_events: ["run.completed"]
    }
  });

  assert.equal(resolved.url, "https://hooks.example.com/metadata");
  assert.deepEqual(resolved.events, ["run.completed"]);
});

test("extractAgentSections parses marked JSON and markdown", () => {
  const raw = [
    "BEGIN_JSON",
    JSON.stringify({ run_id: "run_1", findings: [] }),
    "END_JSON",
    "BEGIN_MARKDOWN",
    "# Hello",
    "END_MARKDOWN"
  ].join("\n");

  const parsed = extractAgentSections(raw);

  assert.deepEqual(parsed.parsed_json, { run_id: "run_1", findings: [] });
  assert.equal(parsed.markdown_text, "# Hello");
  assert.equal(parsed.parse_error, null);
});

test("buildTaskPrompt includes plaintext credentials when supplied", () => {
  const prompt = buildTaskPrompt({
    run_id: "run_creds_1",
    target_url: "https://example.com/login",
    scope_mode: "feature_targeted",
    scenario_list: ["Login and continue to dashboard"],
    brand_persona: "Test user",
    source: "qa_bot",
    credentials: {
      login_url: "https://example.com/login",
      username: "user@example.com",
      password: "Secret123!",
      otp_mode: "none"
    }
  });

  assert.match(prompt, /- Username: user@example\.com/);
  assert.match(prompt, /- Password: Secret123!/);
  assert.match(
    prompt,
    /Attempt authenticated flows with provided credentials and reasonable alternate auth paths/
  );
  assert.match(prompt, /Primary goal: Login and continue to dashboard/);
  assert.match(prompt, /Reaching onboarding after auth does NOT count as goal completion/);
});

test("buildTaskPrompt defaults feature-targeted runs toward account creation when no credentials are provided", () => {
  const prompt = buildTaskPrompt({
    run_id: "run_signup_default_1",
    target_url: "https://example.com",
    scope_mode: "feature_targeted",
    scenario_list: ["Create an account and reach the dashboard"],
    brand_persona: "Test user",
    source: "qa_bot",
    metadata: {}
  });

  assert.match(prompt, /create a fresh test account with a generated identity/i);
  assert.match(prompt, /complete OTP\/email verification when available/i);
});

test("buildPrimaryUserGoal prefers explicit metadata goal", () => {
  const goal = buildPrimaryUserGoal({
    scenario_list: ["Create a project", "Invite teammate"],
    metadata: {
      goal: "Set up the workspace and publish the first project"
    }
  });

  assert.equal(goal, "Set up the workspace and publish the first project");
});

test("normalizeExecutionEngine canonicalizes aliases and falls back to auto", () => {
  assert.equal(normalizeExecutionEngine("local"), "local_vision_agent");
  assert.equal(normalizeExecutionEngine("local_playwright"), "local_vision_agent");
  assert.equal(normalizeExecutionEngine("stagehand"), "local_vision_agent");
  assert.equal(normalizeExecutionEngine("agentic"), "local_vision_agent");
  assert.equal(normalizeExecutionEngine("unknown-engine"), "auto");
});

test("api run helper resolves requested execution engine from body and metadata", () => {
  assert.equal(
    runHandler.__private.resolveRequestedExecutionEngine({
      execution_engine: "vision"
    }),
    "local_vision_agent"
  );
  assert.equal(
    runHandler.__private.resolveRequestedExecutionEngine({
      metadata: {
        execution_engine: "local"
      }
    }),
    "local_vision_agent"
  );
  assert.equal(runHandler.__private.resolveRequestedExecutionEngine({}), "auto");
});

test("normalizeReport produces callback-valid findings with evidence fallback", () => {
  const report = normalizeReport({
    candidateReport: {
      findings: [
        {
          id: "f1",
          type: "friction",
          title: "Confusing CTA",
          observed_behavior: "User hesitated for several seconds before clicking.",
          emotional_reaction: { primary: "confusion" }
        }
      ]
    },
    runRequest: {
      run_id: "run_1",
      target_url: "https://example.com/signup",
      scope_mode: "core_20m",
      scenario_list: [],
      brand_persona: "A cautious SMB buyer",
      source: "qa_bot"
    },
    artifacts: {
      browserbase_debug_url: "https://browserbase.example/debug",
      browserbase_session_url: "https://browserbase.example/session"
    },
    actions: {},
    reportUrl: "https://swarmtester.com/api/qa/report?run_id=run_1"
  });

  assert.equal(report.findings.length, 1);
  assert.equal(report.findings[0].type, "frustration_point");
  assert.equal(report.findings[0].evidence.screenshots[0], "https://browserbase.example/debug");
  assert.ok(Array.isArray(report.tested_journeys));
  assert.ok(report.tested_journeys.length >= 2);
  assert.ok(Array.isArray(report.evidence_gallery.screenshots));
  assert.ok(report.evidence_gallery.screenshots.length >= 1);
  assert.ok(Array.isArray(report.recommendations));
  assert.ok(report.recommendations.length >= 1);
  assert.equal(validateReport(report).ok, true);
});

test("normalizeReport unwraps nested local qa report envelopes", () => {
  const report = normalizeReport({
    candidateReport: {
      report: {
        run_id: "run_nested",
        target: "https://example.com/app",
        status: "partial",
        summary: {
          note: "Feature exploration ran from the authenticated surface."
        },
        tested_journeys: [
          {
            id: "journey_feature_exploration",
            name: "Feature exploration",
            status: "partial",
            summary: "Feature exploration ran, but no reachable in-product candidates were discoverable."
          }
        ],
        findings: [],
        recommendations: ["Keep exploring"],
        evidence_gallery: {
          screenshots: ["https://example.com/s1.png"],
          videos: []
        }
      },
      markdown: "# Nested"
    },
    runRequest: {
      run_id: "run_nested",
      target_url: "https://example.com/app",
      scope_mode: "feature_targeted",
      scenario_list: ["Explore app"],
      brand_persona: "Test user",
      source: "qa_bot"
    },
    artifacts: {},
    actions: {},
    reportUrl: "https://swarmtester.com/api/qa/report?run_id=run_nested"
  });

  assert.equal(report.summary.note, "Feature exploration ran from the authenticated surface.");
  assert.equal(report.tested_journeys[0].id, "journey_feature_exploration");
  assert.equal(report.tested_journeys[0].status, "partial");
  assert.match(report.tested_journeys[0].summary, /Feature exploration ran/);
});

test("validateReport rejects malformed finding", () => {
  const result = validateReport({
    run_id: "run_1",
    target: "example.com",
    status: "completed",
    findings: [
      {
        id: "f1",
        type: "bug",
        severity: "medium",
        observed_behavior: "Something broke.",
        emotional_reaction: { primary: "frustration", intensity: 3 },
        evidence: { screenshots: ["https://example.com/1.png"] }
      }
    ]
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /expected_behavior/i);
});

test("buildMarkdownReport includes journeys, gallery, and recommendations sections", () => {
  const report = normalizeReport({
    candidateReport: {
      findings: []
    },
    runRequest: {
      run_id: "run_markdown",
      target_url: "https://example.com",
      scope_mode: "core_20m",
      scenario_list: [],
      brand_persona: "A skeptical PM",
      source: "qa_bot"
    },
    artifacts: {
      browserbase_session_url: "https://browserbase.example/session",
      browserbase_debug_url: "https://browserbase.example/debug"
    },
    actions: {},
    reportUrl: "https://swarmtester.com/api/qa/report?run_id=run_markdown"
  });

  const markdown = buildMarkdownReport(report, {
    scope_mode: "core_20m",
    brand_persona: "A skeptical PM",
    target_url: "https://example.com"
  });

  assert.match(markdown, /## Tested Journeys/);
  assert.match(markdown, /## Evidence Gallery/);
  assert.match(markdown, /## Recommendations/);
  assert.doesNotMatch(markdown, /Browserbase session/i);
  assert.match(markdown, /Session replay URL/);
});

test("normalizeReport promotes captured_screenshots into evidence gallery", () => {
  const report = normalizeReport({
    candidateReport: {
      findings: []
    },
    runRequest: {
      run_id: "run_media",
      target_url: "https://example.com",
      scope_mode: "core_20m",
      scenario_list: [],
      brand_persona: "A skeptical PM",
      source: "qa_bot"
    },
    artifacts: {
      captured_screenshots: [
        "data:image/png;base64,ZmFrZV9zY3JlZW5zaG90"
      ]
    },
    actions: {},
    reportUrl: "https://swarmtester.com/api/qa/report?run_id=run_media"
  });

  assert.equal(report.evidence_gallery.screenshots[0], "data:image/png;base64,ZmFrZV9zY3JlZW5zaG90");
});

test("sendFinalCallback retries on 500 and then succeeds", async () => {
  let calls = 0;
  const sleepCalls = [];

  const responseBodies = [
    { ok: false, status: 500, body: { error: "temporary" } },
    { ok: true, status: 200, body: { ok: true, id: 1 } }
  ];

  const fetchImpl = async () => {
    const response = responseBodies[calls];
    calls += 1;
    return {
      ok: response.ok,
      status: response.status,
      async json() {
        return response.body;
      }
    };
  };

  const result = await sendFinalCallback({
    callbackUrl: "https://swarmtester.com/api/qa-report-callback",
    callbackSecret: "secret",
    report: {
      run_id: "run_1",
      target: "example.com",
      status: "completed",
      findings: [],
      summary: { counts: {}, risk_score: 0, coverage: {} },
      artifacts: {}
    },
    markdown: "# report",
    artifacts: {},
    runLog: [],
    retryDelaysMs: [0],
    fetchImpl,
    sleepFn: async (ms) => {
      sleepCalls.push(ms);
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.attempts, 2);
  assert.equal(calls, 2);
  assert.deepEqual(sleepCalls, [0]);
});

test("sendFinalCallback strips embedded media before sending callback payload", async () => {
  let capturedBody = null;

  const fetchImpl = async (_url, init = {}) => {
    capturedBody = JSON.parse(String(init.body || "{}"));
    return {
      ok: true,
      status: 200,
      async json() {
        return { ok: true };
      }
    };
  };

  const result = await sendFinalCallback({
    callbackUrl: "https://swarmtester.com/api/qa-report-callback",
    callbackSecret: "secret",
    report: {
      run_id: "run_media_trim",
      target: "example.com",
      status: "failed",
      findings: [
        {
          id: "finding_1",
          type: "dead_end",
          severity: "high",
          title: "Blocked",
          expected_behavior: "CTA should work",
          observed_behavior: "Click failed",
          emotional_reaction: {
            primary: "frustration",
            intensity: 3
          },
          evidence: {
            screenshots: ["data:image/png;base64,ZmFrZQ==", "https://cdn.example.com/finding.png"]
          }
        }
      ],
      evidence_gallery: {
        screenshots: ["data:image/png;base64,ZmFrZQ==", "https://cdn.example.com/gallery.png"],
        videos: ["data:video/mp4;base64,ZmFrZQ=="]
      },
      summary: { counts: {}, risk_score: 0, coverage: {} },
      artifacts: {
        captured_screenshots: ["data:image/png;base64,ZmFrZQ=="]
      }
    },
    markdown: "# report\n" + "x".repeat(20000),
    artifacts: {
      captured_screenshots: ["data:image/png;base64,ZmFrZQ=="]
    },
    runLog: Array.from({ length: 130 }, (_, index) => ({
      timestamp: `2026-03-11T00:00:${String(index).padStart(2, "0")}Z`,
      event: "vision_only_step_decision",
      details: {
        step: index + 1,
        huge_text: "y".repeat(2000),
        nested: {
          values: Array.from({ length: 50 }, () => "z".repeat(200))
        }
      }
    })),
    fetchImpl
  });

  assert.equal(result.ok, true);
  assert.equal(capturedBody.artifacts.captured_screenshot_count, 1);
  assert.equal("captured_screenshots" in capturedBody.artifacts, false);
  assert.deepEqual(capturedBody.report_json.evidence_gallery.screenshots, ["https://cdn.example.com/gallery.png"]);
  assert.deepEqual(capturedBody.report_json.evidence_gallery.videos, []);
  assert.equal(capturedBody.report_json.findings[0].evidence.screenshot_count, 2);
  assert.deepEqual(capturedBody.report_json.findings[0].evidence.screenshots, ["https://cdn.example.com/finding.png"]);
  assert.equal(capturedBody.run_log.length, 120);
  assert.ok(capturedBody.run_log.every((entry) => entry.event === "vision_only_step_decision"));
  assert.ok(capturedBody.run_log.every((entry) => String(entry.data.huge_text || "").length <= 400));
  assert.ok(String(capturedBody.report_markdown || "").length <= 12000);
});

test("sendRunWebhook retries on 500, signs payload, and succeeds", async () => {
  let callCount = 0;
  let firstHeaders = null;
  const sleepCalls = [];

  const fetchImpl = async (_url, init = {}) => {
    callCount += 1;
    if (callCount === 1) {
      firstHeaders = init.headers;
      return {
        ok: false,
        status: 500,
        async text() {
          return JSON.stringify({ error: "temporary" });
        }
      };
    }

    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({ ok: true });
      }
    };
  };

  const result = await sendRunWebhook({
    webhook: {
      url: "https://hooks.example.com/swarm",
      secret: "topsecret",
      events: ALLOWED_WEBHOOK_EVENTS,
      headers: {
        "x-vendor-account": "acct_123"
      }
    },
    event: "run.progress",
    run_id: "run_webhook_retry",
    payload: {
      run_id: "run_webhook_retry",
      progress: { percent: 50 }
    },
    retryDelaysMs: [0],
    fetchImpl,
    sleepFn: async (ms) => {
      sleepCalls.push(ms);
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.attempts, 2);
  assert.equal(callCount, 2);
  assert.deepEqual(sleepCalls, [0]);
  assert.ok(firstHeaders["x-swarm-signature"]);
  assert.equal(firstHeaders["x-swarm-event"], "run.progress");
  assert.equal(firstHeaders["x-vendor-account"], "acct_123");
});
