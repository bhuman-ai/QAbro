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
  assert.equal(report.findings[0].evidence.proof_state, "fallback");
  assert.equal(report.findings[0].evidence.proof_source, "run_fallback");
  assert.ok(Array.isArray(report.tested_journeys));
  assert.ok(report.tested_journeys.length >= 2);
  assert.ok(Array.isArray(report.evidence_gallery.screenshots));
  assert.ok(report.evidence_gallery.screenshots.length >= 1);
  assert.ok(Array.isArray(report.recommendations));
  assert.ok(report.recommendations.length >= 1);
  assert.equal(validateReport(report).ok, true);
});

test("normalizeReport preserves explicit inline screenshot proof on findings", () => {
  const inlineScreenshot = `data:image/png;base64,${"a".repeat(6000)}`;
  const report = normalizeReport({
    candidateReport: {
      findings: [
        {
          id: "f_inline",
          type: "bug",
          severity: "high",
          title: "Broken CTA state",
          expected_behavior: "Primary CTA should stay visible and clickable.",
          observed_behavior: "CTA disappeared after input changed.",
          emotional_reaction: { primary: "frustration", intensity: 4 },
          evidence: {
            screenshots: [inlineScreenshot]
          }
        }
      ]
    },
    runRequest: {
      run_id: "run_inline",
      target_url: "https://example.com/signup",
      scope_mode: "core_20m",
      scenario_list: [],
      brand_persona: "A skeptical PM",
      source: "qa_bot"
    },
    artifacts: {
      browserbase_debug_url: "https://browserbase.example/debug"
    },
    actions: {},
    reportUrl: "https://swarmtester.com/api/qa/report?run_id=run_inline"
  });

  assert.equal(report.findings[0].evidence.screenshots[0], inlineScreenshot);
  assert.equal(report.findings[0].evidence.proof_state, "verified");
  assert.equal(report.findings[0].evidence.proof_source, "explicit_evidence");
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

test("buildMarkdownReport tolerates sparse historical report payloads", () => {
  const markdown = buildMarkdownReport(
    {
      run_id: "run_sparse",
      target: "example.com",
      status: "completed",
      summary: {
        note: "Stored report payload was incomplete."
      },
      findings: [
        {
          id: "f_sparse",
          type: "friction",
          severity: "medium",
          confidence: 0.51,
          title: "Confusing CTA",
          observed_behavior: "The CTA copy did not make the next step clear."
        }
      ],
      tested_journeys: [
        {
          id: "journey_sparse",
          name: "Signup",
          status: "partial",
          summary: "The flow was only partially captured."
        }
      ],
      recommendations: []
    },
    {
      scope_mode: "core_20m",
      brand_persona: "A tired operator",
      target_url: "https://example.com"
    }
  );

  assert.match(markdown, /### f_sparse: Confusing CTA/);
  assert.match(markdown, /- Emotional reaction: uncertainty \(3\/5\)/);
  assert.match(markdown, /- Screenshots:/);
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

test("normalizeReport does not invent auth coverage for early page load failures", () => {
  const report = normalizeReport({
    candidateReport: {
      findings: []
    },
    runRequest: {
      run_id: "run_dns_fail",
      target_url: "https://bhuman/",
      scope_mode: "deep_45m",
      scenario_list: [
        "Clear signup and onboarding",
        "Create the first output"
      ],
      brand_persona: "A first-time buyer",
      source: "qa_bot"
    },
    artifacts: {},
    actions: {},
    reportUrl: "https://swarmtester.com/api/qa/report?run_id=run_dns_fail",
    failureMessage:
      "page.goto: net::ERR_NAME_NOT_RESOLVED at https://bhuman/\nCall log:\n  - navigating to \"https://bhuman/\", waiting until \"domcontentloaded\""
  });

  assert.equal(report.summary.coverage.pages_visited, 0);
  assert.equal(report.summary.coverage.flows_tested, 0);
  assert.equal(
    report.summary.coverage.untested_areas.includes(
      "Authenticated flows were not tested because no credentials were provided."
    ),
    false
  );
  assert.equal(report.tested_journeys.length, 1);
  assert.equal(report.tested_journeys[0].id, "journey_entry_load_failed");
  assert.equal(report.tested_journeys[0].status, "blocked");
  assert.match(report.tested_journeys[0].summary, /could not open the first page/i);
});

test("normalizeReport recognizes early page load failures stored only in summary.note", () => {
  const report = normalizeReport({
    candidateReport: {
      tested_journeys: [
        {
          id: "journey_primary_public_flow",
          name: "Primary public flow",
          status: "completed",
          summary: "Primary public navigation and conversion surfaces were exercised to validate the core public user journey."
        },
        {
          id: "journey_recon_and_validation",
          name: "Recon and validation sweep",
          status: "completed",
          summary: "A lightweight sweep covered surface-level navigation, button states, and form affordances to identify blockers or unclear transitions."
        },
        {
          id: "journey_authenticated_boundary",
          name: "Authenticated boundary check",
          status: "partial",
          summary: "The worker checked the visible auth boundary but did not cross into authenticated flows because no credentials were supplied."
        }
      ],
      summary: {
        note:
          "page.goto: net::ERR_NAME_NOT_RESOLVED at https://bhuman/\nCall log:\n  - navigating to \"https://bhuman/\", waiting until \"domcontentloaded\""
      },
      findings: []
    },
    runRequest: {
      run_id: "run_dns_fail_summary_only",
      target_url: "https://bhuman/",
      scope_mode: "deep_45m",
      scenario_list: [],
      brand_persona: "A first-time buyer",
      source: "qa_bot"
    },
    artifacts: {},
    actions: {},
    reportUrl: "https://swarmtester.com/api/qa/report?run_id=run_dns_fail_summary_only"
  });

  assert.equal(report.summary.coverage.pages_visited, 0);
  assert.equal(report.tested_journeys.length, 1);
  assert.equal(report.tested_journeys[0].id, "journey_entry_load_failed");
  assert.equal(report.tested_journeys[0].name, "Could not open the site");
});

test("normalizeReport rewrites synthetic auth boundary coverage when account setup fails early", () => {
  const report = normalizeReport({
    candidateReport: {
      tested_journeys: [
        {
          id: "journey_primary_public_flow",
          name: "Primary public flow",
          status: "completed",
          summary: "Primary public navigation and conversion surfaces were exercised to validate the core public user journey."
        },
        {
          id: "journey_recon_and_validation",
          name: "Recon and validation sweep",
          status: "completed",
          summary: "A lightweight sweep covered surface-level navigation, button states, and form affordances to identify blockers or unclear transitions."
        },
        {
          id: "journey_authenticated_boundary",
          name: "Authenticated boundary check",
          status: "partial",
          summary: "The worker checked the visible auth boundary but did not cross into authenticated flows because no credentials were supplied."
        }
      ],
      summary: {
        note: "Auth submit button could not be activated"
      },
      findings: []
    },
    runRequest: {
      run_id: "run_auth_submit_fail",
      target_url: "https://bhuman.ai/",
      scope_mode: "feature_targeted",
      scenario_list: [
        "Create a new account if needed and finish onboarding.",
        "Make one short video inside the product and reach the final result page."
      ],
      brand_persona: "A first-time buyer",
      source: "qa_bot",
      metadata: {
        auth_policy: "signup_if_needed",
        auto_create_account: true
      }
    },
    artifacts: {},
    actions: {},
    reportUrl: "https://swarmtester.com/api/qa/report?run_id=run_auth_submit_fail"
  });

  assert.equal(report.summary.coverage.pages_visited, 1);
  assert.equal(report.summary.coverage.flows_tested, 1);
  assert.equal(report.summary.coverage.flows_blocked, 1);
  assert.deepEqual(report.summary.coverage.untested_areas, [
    "Logged-in pages were not reached because account setup got stuck."
  ]);
  assert.equal(report.tested_journeys.length, 1);
  assert.equal(report.tested_journeys[0].id, "journey_auth_setup_failed");
  assert.equal(report.tested_journeys[0].name, "Could not finish login");
  assert.equal(report.tested_journeys[0].status, "blocked");
  assert.deepEqual(report.tested_journeys[0].observations, ["Auth submit button could not be activated"]);
});

test("normalizeReport prefers blocker video clip from local agent artifacts", () => {
  const report = normalizeReport({
    candidateReport: {
      tested_journeys: [
        {
          id: "journey_vision_only_primary",
          name: "Vision-only primary flow",
          status: "blocked",
          summary: "The tester got blocked while trying the main flow.",
          evidence: {
            screenshots: [],
            videos: []
          }
        }
      ],
      summary: {
        note: "Auth submit button could not be activated"
      },
      findings: []
    },
    runRequest: {
      run_id: "run_local_clip",
      target_url: "https://bhuman.ai/",
      scope_mode: "feature_targeted",
      scenario_list: ["Create an account and make one short video."],
      brand_persona: "A first-time buyer",
      source: "qa_bot",
      metadata: {
        auth_policy: "signup_if_needed",
        auto_create_account: true
      }
    },
    artifacts: {
      blocker_clip_url: "https://161.35.53.130.sslip.io/artifacts/playwright/run/blocker.mp4",
      local_video_url: "https://161.35.53.130.sslip.io/artifacts/playwright/run/full.webm"
    },
    actions: {},
    reportUrl: "https://swarmtester.com/api/qa/report?run_id=run_local_clip"
  });

  assert.deepEqual(report.evidence_gallery.videos, [
    "https://161.35.53.130.sslip.io/artifacts/playwright/run/blocker.mp4",
    "https://161.35.53.130.sslip.io/artifacts/playwright/run/full.webm"
  ]);
  assert.deepEqual(report.tested_journeys[0].evidence.videos, [
    "https://161.35.53.130.sslip.io/artifacts/playwright/run/blocker.mp4",
    "https://161.35.53.130.sslip.io/artifacts/playwright/run/full.webm"
  ]);
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
    markdown: "# report\n![inline](data:image/png;base64,ZmFrZQ==)\n" + "x".repeat(20000),
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
  assert.equal(String(capturedBody.report_markdown || "").includes("data:image/"), false);
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
