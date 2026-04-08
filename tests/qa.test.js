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
  sanitizeReportForCallback,
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

test("validateRunRequest rejects controlled UX runs without an entry path or route hints", () => {
  const result = validateRunRequest({
    run_id: "run_controlled_missing_plan",
    target_url: "https://example.com",
    scope_mode: "feature_targeted",
    scenario_list: ["Validate the signup flow"],
    metadata: {
      qa_mode: "controlled_ux",
      controlled_ux: {
        enabled: true,
        user_job: "Create an account and understand the next step."
      }
    }
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /entry_path|route_hints/i);
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

test("buildTaskPrompt adds controlled UX instructions when qa_mode is controlled", () => {
  const prompt = buildTaskPrompt({
    run_id: "run_controlled_ux_1",
    target_url: "https://example.com",
    scope_mode: "feature_targeted",
    scenario_list: ["Validate the signup flow"],
    brand_persona: "Test user",
    source: "qa_bot",
    metadata: {
      qa_mode: "controlled_ux",
      controlled_ux: {
        enabled: true,
        entry_path: "/signup",
        user_job: "Create an account and understand the next step.",
        route_hints: ["/signup", "/onboarding", "/dashboard"],
        success_signals: ["The next step is obvious", "Validation errors are clear"]
      }
    }
  });

  assert.match(prompt, /Run mode: Controlled UX validation/);
  assert.match(prompt, /Validation target: Public flow/);
  assert.match(prompt, /Access method: No login needed/);
  assert.match(prompt, /Owned flow entry path: \/signup/);
  assert.match(prompt, /Planned route hints:\n- \/signup\n- \/onboarding\n- \/dashboard/);
  assert.match(prompt, /Do not spend the run on unrelated exploratory coverage/);
});

test("buildTaskPrompt tells controlled UX runs to stop when the flow plan is missing", () => {
  const prompt = buildTaskPrompt({
    run_id: "run_controlled_ux_missing_plan_1",
    target_url: "https://example.com",
    scope_mode: "feature_targeted",
    scenario_list: ["Validate the signup flow"],
    brand_persona: "Test user",
    source: "qa_bot",
    metadata: {
      qa_mode: "controlled_ux",
      controlled_ux: {
        enabled: true,
        user_job: "Create an account and understand the next step."
      }
    }
  });

  assert.match(prompt, /Owned flow entry path: Not provided/);
  assert.match(prompt, /stop and report missing controlled-flow setup instead of clicking generic homepage CTAs/i);
});

test("buildTaskPrompt adds inside-product instructions when validation target is authenticated", () => {
  const prompt = buildTaskPrompt({
    run_id: "run_inside_product_1",
    target_url: "https://example.com",
    scope_mode: "feature_targeted",
    scenario_list: ["Reach the dashboard and create the first project"],
    brand_persona: "Test user",
    source: "qa_bot",
    credentials: {
      login_url: "https://example.com/login",
      username: "tester@example.com",
      password: "Secret123!",
      otp_mode: "none"
    },
    metadata: {
      validation_target: "inside_product",
      access_method: "credentials",
      auth_entry_url: "https://example.com/login"
    }
  });

  assert.match(prompt, /Validation target: Inside the product/);
  assert.match(prompt, /Access method: Use test login via https:\/\/example.com\/login/);
  assert.match(prompt, /Inside-product rules:/);
  assert.match(prompt, /Once authenticated, spend the run on the in-product workflow rather than public pages/);
});

test("buildTaskPrompt supports saved project sessions for inside-product runs", () => {
  const prompt = buildTaskPrompt({
    run_id: "run_inside_product_saved_1",
    target_url: "https://example.com/app",
    scope_mode: "feature_targeted",
    scenario_list: ["Open the dashboard and create the first project"],
    brand_persona: "Test user",
    source: "qa_bot",
    metadata: {
      validation_target: "inside_product",
      access_method: "saved_session"
    }
  });

  assert.match(prompt, /Validation target: Inside the product/);
  assert.match(prompt, /Access method: Use saved project session/);
  assert.match(prompt, /Reuse the saved project session when it is still valid/);
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
  assert.equal(normalizeExecutionEngine("stagehand"), "browserbase");
  assert.equal(normalizeExecutionEngine("browserbase"), "browserbase");
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
  assert.equal(
    runHandler.__private.resolveRequestedExecutionEngine({
      metadata: {
        browser_mode: "advanced_browser"
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
      local_video_url: "https://cdn.example.com/run.webm",
      browserbase_debug_url: "https://browserbase.example/debug",
      browserbase_session_url: "https://browserbase.example/session"
    },
    actions: {},
    reportUrl: "https://swarmtester.com/api/qa/report?run_id=run_1"
  });

  assert.equal(report.findings.length, 1);
  assert.equal(report.findings[0].type, "frustration_point");
  assert.equal(report.findings[0].evidence.screenshots[0], "https://browserbase.example/debug");
  assert.equal(report.findings[0].evidence.videos[0], "https://cdn.example.com/run.webm");
  assert.equal(report.findings[0].evidence.proof_state, "fallback");
  assert.equal(report.findings[0].evidence.proof_source, "run_fallback");
  assert.equal(report.findings[0].diagnostic_details.page_loaded, true);
  assert.equal(report.findings[0].diagnostic_details.current_url, "https://example.com/signup");
  assert.ok(Array.isArray(report.findings[0].diagnostic_details.attempted_actions));
  assert.ok(report.findings[0].diagnostic_details.attempted_actions.length >= 1);
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
      local_video_url: "https://cdn.example.com/run.webm",
      browserbase_debug_url: "https://browserbase.example/debug"
    },
    actions: {},
    reportUrl: "https://swarmtester.com/api/qa/report?run_id=run_inline"
  });

  assert.equal(report.findings[0].evidence.screenshots[0], inlineScreenshot);
  assert.equal(report.findings[0].evidence.videos[0], "https://cdn.example.com/run.webm");
  assert.equal(report.findings[0].evidence.proof_state, "verified");
  assert.equal(report.findings[0].evidence.proof_source, "explicit_evidence");
  assert.equal(validateReport(report).ok, true);
});

test("normalizeReport preserves persona summary fields when provided", () => {
  const report = normalizeReport({
    candidateReport: {
      run_id: "persona_summary_run",
      target: "example.com",
      status: "completed",
      summary: {
        note: "The flow completed.",
        persona_overall: "I understand the offer, but I still want to know what happens after sign-up.",
        emotional_state: "Uncertain because the post-signup outcome is not explained.",
        persona_takeaways: [
          "This looks like a service for getting a brand talked about online.",
          "The headline makes a concrete promise."
        ],
        persona_skepticisms: [
          "What the free preview includes is still vague."
        ],
        coverage: {
          pages_visited: 1,
          flows_tested: 1,
          flows_blocked: 0,
          untested_areas: []
        }
      },
      findings: []
    },
    runRequest: {
      run_id: "persona_summary_run",
      target_url: "https://example.com"
    },
    rawAgentMessage: "Completed."
  });

  assert.equal(
    report.summary.persona_overall,
    "I understand the offer, but I still want to know what happens after sign-up."
  );
  assert.equal(
    report.summary.emotional_state,
    "Uncertain because the post-signup outcome is not explained."
  );
  assert.deepEqual(report.summary.persona_takeaways, [
    "This looks like a service for getting a brand talked about online.",
    "The headline makes a concrete promise."
  ]);
  assert.deepEqual(report.summary.persona_skepticisms, [
    "What the free preview includes is still vague."
  ]);
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

test("normalizeReport does not synthesize friction from normal partial summaries", () => {
  const report = normalizeReport({
    candidateReport: {
      run_id: "run_normal_partial",
      target: "https://example.com/app",
      status: "partial",
      summary: {
        note: "Scrolled through the workspace and examined the visible content. No further interaction was needed."
      },
      tested_journeys: [
        {
          id: "journey_workspace_review",
          name: "Workspace review",
          status: "partial",
          summary: "The tester reviewed the workspace without observing a blocker."
        }
      ],
      findings: []
    },
    runRequest: {
      run_id: "run_normal_partial",
      target_url: "https://example.com/app",
      scope_mode: "feature_targeted",
      scenario_list: ["Review the workspace"],
      brand_persona: "Test user",
      source: "qa_bot"
    },
    artifacts: {
      local_screenshots: ["https://cdn.example.com/normal-workspace.png"],
      local_video_url: "https://cdn.example.com/normal-run.webm"
    },
    actions: {},
    reportUrl: "https://swarmtester.com/api/qa/report?run_id=run_normal_partial"
  });

  assert.equal(report.status, "partial");
  assert.equal(report.findings.length, 0);
  assert.equal(report.summary.coverage.flows_blocked, 0);
});

test("normalizeReport removes stale generic synthetic findings when no blocker happened", () => {
  const report = normalizeReport({
    candidateReport: {
      run_id: "run_stale_synthetic",
      target: "https://example.com/app",
      status: "partial",
      summary: {
        note: "Scrolled through the workspace and examined the visible content. No further interaction was needed."
      },
      tested_journeys: [
        {
          id: "journey_workspace_review",
          name: "Workspace review",
          status: "partial",
          summary: "The tester reviewed the workspace without observing a blocker."
        }
      ],
      findings: [
        {
          id: "finding_dead_end_1",
          type: "dead_end",
          severity: "high",
          title: "The requested flow stopped before it finished",
          expected_behavior: "The QA run should continue through the requested user flow without crashing or stalling.",
          observed_behavior: "Scrolled through the workspace and examined the visible content. No further interaction was needed.",
          emotional_reaction: { primary: "frustration", intensity: 4 },
          evidence: {
            screenshots: ["https://cdn.example.com/normal-workspace.png"]
          },
          diagnostic_details: {
            page_loaded: true,
            current_url: "https://example.com/app",
            current_state: "The workspace remained usable.",
            last_successful_step: "Reviewed the workspace.",
            failure_reason: "No further interaction was needed.",
            attempted_actions: []
          }
        }
      ]
    },
    runRequest: {
      run_id: "run_stale_synthetic",
      target_url: "https://example.com/app",
      scope_mode: "feature_targeted",
      scenario_list: ["Review the workspace"],
      brand_persona: "Test user",
      source: "qa_bot"
    },
    artifacts: {
      local_screenshots: ["https://cdn.example.com/normal-workspace.png"],
      local_video_url: "https://cdn.example.com/normal-run.webm"
    },
    actions: {},
    reportUrl: "https://swarmtester.com/api/qa/report?run_id=run_stale_synthetic"
  });

  assert.equal(report.status, "partial");
  assert.equal(report.findings.length, 0);
  assert.equal(report.summary.coverage.flows_blocked, 0);
});

test("normalizeReport preserves journey step clip metadata", () => {
  const report = normalizeReport({
    candidateReport: {
      run_id: "run_step_clip_meta",
      target: "https://example.com/app",
      status: "partial",
      summary: {
        note: "Captured step clips."
      },
      tested_journeys: [
        {
          id: "journey_primary",
          name: "Primary flow",
          status: "partial",
          summary: "The tester got through the main flow with saved per-step clips.",
          steps: ["click: Start", "click: Continue"],
          step_video_clips: [
            {
              step: 1,
              clip_start_ms: 48000,
              clip_end_ms: 68000,
              video: "/tmp/run-step-01.mp4",
              content_type: "video/mp4"
            }
          ],
          evidence: {
            videos: ["https://example.com/run.webm"]
          }
        }
      ],
      findings: [],
      recommendations: []
    },
    runRequest: {
      run_id: "run_step_clip_meta",
      target_url: "https://example.com/app",
      scope_mode: "feature_targeted",
      brand_persona: "Test user",
      source: "qa_bot"
    },
    artifacts: {},
    actions: {},
    reportUrl: "https://swarmtester.com/api/qa/report?run_id=run_step_clip_meta"
  });

  assert.deepEqual(report.tested_journeys[0].step_video_clips, [
    {
      step: 1,
      clip_start_ms: 48000,
      clip_end_ms: 68000,
      video: "/tmp/run-step-01.mp4",
      content_type: "video/mp4"
    }
  ]);
});

test("normalizeReport rewrites stock QA jargon into plain English for stored report text", () => {
  const report = normalizeReport({
    candidateReport: {
      summary: {
        note: "Primary public navigation and conversion surfaces were exercised to validate the core public user journey."
      },
      findings: [
        {
          id: "finding_plain_english",
          type: "dead_end",
          severity: "high",
          title: "Login did not work",
          expected_behavior:
            "Primary public navigation and conversion surfaces were exercised to validate the core public user journey.",
          observed_behavior:
            "A lightweight sweep covered surface-level navigation, button states, and form affordances to identify blockers or unclear transitions.",
          emotional_reaction: { primary: "frustration", intensity: 3 },
          repro_steps: ["Traverse the main navigation and primary CTA path."],
          evidence: { videos: ["https://example.com/run.webm"] },
          diagnostic_details: {
            page_loaded: true,
            current_url: "https://example.com/login",
            current_state: "Login page visible",
            last_successful_step: "Opened the site",
            failure_reason:
              "The worker checked the visible auth boundary but did not cross into authenticated flows because no credentials were supplied.",
            attempted_actions: [
              {
                action: "open",
                target: "https://example.com",
                outcome: "runner started"
              }
            ]
          }
        }
      ],
      tested_journeys: [
        {
          id: "journey_plain_english",
          name: "Primary public flow",
          status: "blocked",
          summary: "Primary public navigation and conversion surfaces were exercised to validate the core public user journey.",
          steps: ["Traverse the main navigation and primary CTA path."]
        }
      ],
      recommendations: [
        "Record the auth boundary as untested rather than forcing invalid coverage."
      ]
    },
    runRequest: {
      run_id: "run_plain_english",
      target_url: "https://example.com/",
      scope_mode: "feature_targeted",
      scenario_list: ["Sign up if needed and reach the app."],
      brand_persona: "A first-time buyer",
      source: "qa_bot"
    },
    artifacts: {},
    actions: {},
    reportUrl: "https://swarmtester.com/api/qa/report?run_id=run_plain_english"
  });

  assert.equal(
    report.summary.note,
    "The tester looked at the main public pages and tried the main button a new visitor would click."
  );
  assert.match(report.findings[0].observed_behavior, /The tester /);
  assert.doesNotMatch(report.findings[0].observed_behavior, /conversion surfaces|user journey|surface-level navigation/i);
  assert.equal(
    report.tested_journeys[0].steps[0],
    "Click through the main menu and the main button."
  );
  assert.equal(
    report.recommendations[0],
    "Mark the logged-in part as not tested instead of guessing."
  );
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
    ],
    tested_journeys: []
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /expected_behavior/i);
});

test("validateReport rejects finding without diagnostic details", () => {
  const result = validateReport({
    run_id: "run_2",
    target: "example.com",
    status: "completed",
    findings: [
      {
        id: "f2",
        type: "bug",
        severity: "medium",
        expected_behavior: "CTA should work.",
        observed_behavior: "CTA did nothing.",
        emotional_reaction: { primary: "frustration", intensity: 3 },
        evidence: { screenshots: ["https://example.com/1.png"], videos: ["https://example.com/run.webm"] }
      }
    ],
    tested_journeys: []
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /diagnostic_details/i);
});

test("validateReport rejects failed reports without failure diagnostics", () => {
  const result = validateReport({
    run_id: "run_failed_no_diag",
    target: "example.com",
    status: "failed",
    findings: [],
    tested_journeys: [],
    summary: { counts: {}, risk_score: 0, coverage: {} },
    artifacts: {}
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /failure_diagnostics/i);
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

test("normalizeReport synthesizes failure diagnostics and blocker finding for auth submit failures with proof", () => {
  const report = normalizeReport({
    candidateReport: {
      findings: []
    },
    runRequest: {
      run_id: "run_failed_auth",
      target_url: "https://bhuman.ai/",
      scope_mode: "feature_targeted",
      scenario_list: ["Create an account and make one generated AI video."],
      brand_persona: "A first-time buyer",
      source: "qa_bot",
      metadata: {
        auth_policy: "signup_if_needed",
        auto_create_account: true
      }
    },
    artifacts: {
      captured_screenshots: ["/tmp/failure-state.png"],
      local_video_path: "/tmp/failure-state.webm"
    },
    actions: {},
    reportUrl: "https://swarmtester.com/api/qa/report?run_id=run_failed_auth",
    failureMessage: "Auth submit button could not be activated",
    runLog: [
      {
        timestamp: "2026-03-25T08:19:32.165Z",
        event: "local_agent_started",
        details: {
          target_url: "https://bhuman.ai/"
        }
      },
      {
        timestamp: "2026-03-25T08:19:32.493Z",
        event: "browser_context_ready",
        details: {}
      },
      {
        timestamp: "2026-03-25T08:19:33.812Z",
        event: "auth_flow_started",
        details: {
          login_url: "https://bhuman.ai/",
          otp_mode: "provider_hook",
          auto_create_account: true
        }
      },
      {
        timestamp: "2026-03-25T08:19:34.100Z",
        event: "auth_flow_failed",
        details: {
          message: "Auth submit button could not be activated"
        }
      }
    ],
    failureDiagnostics: {
      page_loaded: true,
      current_url: "https://bhuman.ai/",
      current_state: "Title: BHuman || Headings: Create videos that look human",
      failure_reason: "Auth submit button could not be activated"
    }
  });

  assert.equal(report.status, "partial");
  assert.ok(report.failure_diagnostics);
  assert.equal(report.failure_diagnostics.current_url, "https://bhuman.ai/");
  assert.equal(report.failure_diagnostics.last_successful_step, "Opened the auth flow.");
  assert.ok(Array.isArray(report.failure_diagnostics.attempted_actions));
  assert.ok(report.failure_diagnostics.attempted_actions.length >= 3);
  assert.equal(report.findings.length, 1);
  assert.equal(report.findings[0].type, "dead_end");
  assert.deepEqual(report.findings[0].evidence.screenshots, ["/tmp/failure-state.png"]);
  assert.deepEqual(report.findings[0].evidence.videos, ["/tmp/failure-state.webm"]);
  assert.equal(validateReport(report).ok, true);

  const markdown = buildMarkdownReport(report, {
    scope_mode: "feature_targeted",
    brand_persona: "A first-time buyer",
    target_url: "https://bhuman.ai/"
  });
  assert.match(markdown, /## Failure Diagnostics/);
  assert.match(markdown, /Auth submit button could not be activated/);
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
  assert.equal(report.tested_journeys[0].name, "Could not create account");
  assert.equal(report.tested_journeys[0].status, "blocked");
  assert.deepEqual(report.tested_journeys[0].observations, ["Auth submit button could not be activated"]);
  assert.equal(report.failure_diagnostics.failure_reason, "Auth submit button could not be activated");
});

test("normalizeReport treats unresolved auth surfaces as account-setup failures during auto-signup runs", () => {
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
        note: "Auth flow did not resolve to an authenticated surface"
      },
      findings: []
    },
    runRequest: {
      run_id: "run_auth_resolve_fail",
      target_url: "https://clusterseo.com/",
      scope_mode: "feature_targeted",
      scenario_list: [
        "Sign up or sign in as needed, then reach the first authenticated screen."
      ],
      brand_persona: "A first-time buyer",
      source: "qa_bot",
      metadata: {
        auth_policy: "signup_if_needed",
        auto_create_account: true
      }
    },
    artifacts: {
      captured_screenshots: ["data:image/png;base64,ZmFrZV9mYWlsdXJlX3Nob3Q="]
    },
    actions: {},
    reportUrl: "https://swarmtester.com/api/qa/report?run_id=run_auth_resolve_fail"
  });

  assert.deepEqual(report.summary.coverage.untested_areas, [
    "Logged-in pages were not reached because account setup got stuck."
  ]);
  assert.equal(report.tested_journeys[0].id, "journey_auth_setup_failed");
  assert.equal(report.tested_journeys[0].name, "Could not create account");
  assert.equal(report.tested_journeys[0].status, "blocked");
  assert.equal(
    report.summary.note,
    "The tester submitted the login or sign-up form, but the site kept showing the same login screen."
  );
  assert.equal(
    report.failure_diagnostics.failure_reason,
    "The tester submitted the login or sign-up form, but the site kept showing the same login screen."
  );
  assert.equal(
    report.tested_journeys[0].summary,
    "The tester submitted the account form, but the site kept showing the same login screen instead of getting into the product."
  );
  assert.equal(report.findings[0].title, "Login stayed on the same screen");
});

test("normalizeReport gives auto-signup failures a specific sign-up title instead of a generic dead-end title", () => {
  const report = normalizeReport({
    candidateReport: {
      findings: []
    },
    runRequest: {
      run_id: "run_signup_switch_fail",
      target_url: "https://clusterseo.com/login",
      scope_mode: "feature_targeted",
      scenario_list: ["Create a new account and reach the first logged-in screen."],
      brand_persona: "A first-time buyer",
      source: "qa_bot",
      metadata: {
        auth_policy: "signup_if_needed",
        auto_create_account: true
      }
    },
    artifacts: {
      local_video_url: "https://cdn.example.com/run.webm"
    },
    actions: {},
    failureMessage: "Auto-create account was requested but the sign-up form never opened",
    failureDiagnostics: {
      page_loaded: true,
      current_url: "https://clusterseo.com/login",
      current_state:
        "ClusterSEO Log in Enter your login details Need an account? Sign up Continue",
      last_successful_step: "Opened the account form.",
      failure_reason: "Auto-create account was requested but the sign-up form never opened",
      attempted_actions: [
        {
          step: 1,
          action: "open_auth",
          target: "login form",
          outcome: "login form opened instead of sign-up",
          url: "https://clusterseo.com/login"
        }
      ]
    },
    reportUrl: "https://swarmtester.com/api/qa/report?run_id=run_signup_switch_fail"
  });

  assert.equal(report.findings[0].title, "Sign-up never opened");
  assert.equal(report.tested_journeys[0].name, "Could not create account");
  assert.equal(
    report.tested_journeys[0].summary,
    "The tester tried to create an account, but the site stayed on the login form instead of switching to sign-up."
  );
});

test("normalizeReport describes signup bounce-backs in plain English", () => {
  const report = normalizeReport({
    candidateReport: {
      status: "partial",
      summary: {
        note: "The site sent the tester back to the login screen right after the sign-up form was submitted"
      },
      findings: []
    },
    runRequest: {
      run_id: "run_signup_bounced_to_login",
      target_url: "https://clusterseo.com/login",
      scope_mode: "feature_targeted",
      scenario_list: ["Create a new account and reach the first logged-in screen."],
      brand_persona: "A first-time buyer",
      source: "qa_bot",
      metadata: {
        auth_policy: "signup_if_needed",
        auto_create_account: true
      }
    },
    artifacts: {
      local_video_url: "https://cdn.example.com/run.webm"
    },
    actions: {},
    failureMessage: "The site sent the tester back to the login screen right after the sign-up form was submitted",
    failureDiagnostics: {
      page_loaded: true,
      current_url: "https://clusterseo.com/login",
      current_state:
        "ClusterSEO Log in Enter your credentials Need an account? Sign up Continue",
      last_successful_step: "Submitted the sign-up form.",
      failure_reason:
        "The site sent the tester back to the login screen right after the sign-up form was submitted",
      attempted_actions: [
        {
          step: 1,
          action: "auth_surface_ready",
          target: "sign-up form",
          outcome: "sign-up form opened",
          url: "https://clusterseo.com/login"
        },
        {
          step: 2,
          action: "auth_submit_attempted",
          target: "sign-up form",
          outcome: "site returned to login form after submit",
          url: "https://clusterseo.com/login"
        }
      ]
    },
    reportUrl: "https://swarmtester.com/api/qa/report?run_id=run_signup_bounced_to_login"
  });

  assert.equal(report.findings[0].title, "Sign-up returned to the login screen");
  assert.equal(report.tested_journeys[0].name, "Could not create account");
  assert.equal(
    report.tested_journeys[0].summary,
    "The tester filled the sign-up form, clicked Sign up, and got sent back to the login page instead of entering the product."
  );
});

test("normalizeReport upgrades stale auth failure text when diagnostics show signup bounced back to login", () => {
  const report = normalizeReport({
    candidateReport: {
      status: "partial",
      summary: {
        note: "Auto-create account was requested but the sign-up form never opened"
      },
      findings: []
    },
    runRequest: {
      run_id: "run_signup_bounced_to_login_from_diagnostics",
      target_url: "https://clusterseo.com/login",
      scope_mode: "feature_targeted",
      scenario_list: ["Create a new account and reach the first logged-in screen."],
      brand_persona: "A first-time buyer",
      source: "qa_bot",
      metadata: {
        auth_policy: "signup_if_needed",
        auto_create_account: true
      }
    },
    artifacts: {
      local_video_url: "https://cdn.example.com/run.webm"
    },
    actions: {},
    failureMessage: "Auto-create account was requested but the sign-up form never opened",
    failureDiagnostics: {
      page_loaded: true,
      current_url: "https://clusterseo.com/login",
      current_state:
        "ClusterSEO Log in Enter your credentials Need an account? Sign up Continue",
      last_successful_step: "Submitted the sign-up form.",
      failure_reason: "Auto-create account was requested but the sign-up form never opened",
      attempted_actions: [
        {
          step: 1,
          action: "inspect",
          target: "affected area",
          outcome: "auth surface ready",
          url: "https://clusterseo.com/signup"
        },
        {
          step: 2,
          action: "submit_auth",
          target: "sign-up form",
          outcome: "auth submit attempted",
          url: "https://clusterseo.com/login"
        }
      ]
    },
    runLog: [
      { event: "auth_surface_ready", data: { url: "https://clusterseo.com/signup", mode: "signup" } },
      { event: "auth_form_filled", data: { url: "https://clusterseo.com/signup", mode: "signup" } },
      { event: "auth_submit_attempted", data: { url: "https://clusterseo.com/login", mode: "signup" } }
    ],
    reportUrl: "https://swarmtester.com/api/qa/report?run_id=run_signup_bounced_to_login_from_diagnostics"
  });

  assert.equal(
    report.summary.note,
    "The tester filled the sign-up form, clicked Sign up, and got sent back to the login page instead of entering the product."
  );
  assert.equal(report.findings[0].title, "Sign-up returned to the login screen");
  assert.equal(
    report.findings[0].diagnostic_details.failure_reason,
    "The tester filled the sign-up form, clicked Sign up, and got sent back to the login page instead of entering the product."
  );
  assert.equal(report.findings[0].diagnostic_details.last_successful_step, "Submitted the sign-up form.");
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

test("normalizeReport rewrites blocked findings from journey history and keeps proof through callback sanitization", () => {
  const inlineScreenshot = `data:image/png;base64,${"a".repeat(6000)}`;
  const report = normalizeReport({
    candidateReport: {
      status: "completed",
      findings: [
        {
          id: "finding_blocked_product",
          type: "dead_end",
          severity: "high",
          title: "Persona got blocked in the product",
          expected_behavior: "A user should be able to finish presenter generation.",
          observed_behavior: "Presenter generation timed out after 89 seconds, no progress beyond generating presenter.",
          emotional_reaction: { primary: "frustration", intensity: 4 },
          page: { url: "https://bhuman.ai/" },
          evidence: {
            screenshots: [inlineScreenshot]
          },
          diagnostic_details: {
            page_loaded: true,
            current_url: "https://bhuman.ai/",
            current_state: "Presenter generation timed out after 89 seconds.",
            last_successful_step: "Clicked \"Retry generation button\".",
            failure_reason: "Presenter generation timed out after 89 seconds.",
            attempted_actions: [
              {
                step: 1,
                action: "inspect",
                target: "Persona got blocked in the product",
                outcome: "Presenter generation timed out after 89 seconds.",
                url: "https://bhuman.ai/"
              }
            ]
          }
        }
      ],
      tested_journeys: [
        {
          id: "journey_generated_ai_video",
          name: "Generated AI video mission",
          status: "blocked",
          summary: "Presenter generation stayed on the generating state and timed out.",
          steps: [
            "click: Start Free",
            "click: Start building",
            "click: Describe and generate with AI",
            "type: Presenter description",
            "click: Generate presenter",
            "wait: Generating presenter",
            "wait: Generating presenter",
            "click: Retry generation button",
            "wait: Generating presenter"
          ],
          pages: ["https://bhuman.ai/", "https://bhuman.ai/ai-studio"],
          evidence: {
            screenshots: ["/tmp/speakeasy-1.png"],
            videos: ["/tmp/run.webm"]
          },
          observations: [
            "Presenter generation timed out after 89 seconds, no progress beyond generating presenter."
          ]
        }
      ]
    },
    runRequest: {
      run_id: "run_blocked_journey_rewrite",
      target_url: "https://bhuman.ai/",
      scope_mode: "feature_targeted",
      scenario_list: ["Make one generated AI video."],
      brand_persona: "A first-time buyer",
      source: "qa_bot",
      metadata: {
        auth_policy: "signup_if_needed",
        auto_create_account: true
      }
    },
    artifacts: {
      local_screenshots: ["/tmp/speakeasy-1.png", "/tmp/speakeasy-2.png"],
      local_video_path: "/tmp/run.webm"
    },
    actions: {
      visited_pages: ["https://bhuman.ai/", "https://bhuman.ai/ai-studio"],
      flows_tested: 1,
      flows_blocked: 1
    },
    reportUrl: "https://swarmtester.com/api/qa/report?run_id=run_blocked_journey_rewrite"
  });

  assert.equal(report.status, "partial");
  assert.equal(report.findings[0].page.url, "https://bhuman.ai/ai-studio");
  assert.equal(report.findings[0].journey, "Generated AI video mission");
  assert.match(report.findings[0].title, /presenter/i);
  assert.doesNotMatch(report.findings[0].title, /persona got blocked in the product/i);
  assert.equal(report.findings[0].diagnostic_details.current_url, "https://bhuman.ai/ai-studio");
  assert.match(report.findings[0].diagnostic_details.last_successful_step, /Generate presenter/i);
  assert.ok(report.findings[0].diagnostic_details.attempted_actions.length >= 6);
  assert.equal(report.findings[0].diagnostic_details.attempted_actions[0].action, "click");
  assert.equal(report.findings[0].diagnostic_details.attempted_actions[3].action, "type");
  assert.ok(
    report.findings[0].diagnostic_details.attempted_actions.some((attempt) => attempt.action === "wait")
  );
  assert.ok(
    report.findings[0].diagnostic_details.attempted_actions.some((attempt) =>
      /retry generation/i.test(String(attempt.target || ""))
    )
  );
  assert.ok(report.findings[0].evidence.screenshots.includes("/tmp/speakeasy-1.png"));
  assert.ok(report.findings[0].evidence.videos.includes("/tmp/run.webm"));
  assert.equal(
    report.summary.coverage.untested_areas.includes("Logged-in pages were not reached during this test."),
    false
  );
  assert.equal(validateReport(report).ok, true);

  const sanitized = sanitizeReportForCallback(report);
  assert.ok(sanitized.findings[0].evidence.screenshots.includes("/tmp/speakeasy-1.png"));
  assert.ok(sanitized.findings[0].evidence.videos.includes("/tmp/run.webm"));
});

test("validateReport accepts findings with video-only proof", () => {
  const result = validateReport({
    run_id: "run_video_only_proof",
    target: "bhuman.ai",
    status: "partial",
    findings: [
      {
        id: "finding_video_only",
        type: "dead_end",
        severity: "high",
        title: "Generation stalled",
        expected_behavior: "The generation flow should complete.",
        observed_behavior: "The generation flow stayed stuck on the same waiting state.",
        emotional_reaction: { primary: "frustration", intensity: 4 },
        page: { url: "https://bhuman.ai/ai-studio" },
        evidence: {
          screenshots: [],
          videos: ["https://example.com/run.webm"],
          proof_state: "verified",
          proof_source: "explicit_evidence"
        },
        diagnostic_details: {
          page_loaded: true,
          current_url: "https://bhuman.ai/ai-studio",
          current_state: "The generation spinner stayed visible.",
          last_successful_step: "Clicked \"Generate presenter\".",
          failure_reason: "The generation flow stayed stuck on the same waiting state.",
          attempted_actions: [
            {
              step: 1,
              action: "click",
              target: "Generate presenter",
              outcome: "Presenter generation started",
              url: "https://bhuman.ai/ai-studio"
            },
            {
              step: 2,
              action: "wait",
              target: "Generating presenter",
              outcome: "The generation spinner stayed visible.",
              url: "https://bhuman.ai/ai-studio"
            }
          ]
        }
      }
    ],
    tested_journeys: [
      {
        id: "journey_video_only",
        name: "Generated AI video mission",
        status: "blocked",
        summary: "The mission stalled at generation.",
        steps: ["click: Generate presenter", "wait: Generating presenter"],
        pages: ["https://bhuman.ai/ai-studio"],
        evidence: {
          screenshots: [],
          videos: ["https://example.com/run.webm"]
        },
        observations: ["The generation spinner stayed visible."]
      }
    ],
    summary: {
      counts: {},
      risk_score: 88,
      coverage: {
        pages_visited: 1,
        flows_tested: 1,
        flows_blocked: 1,
        untested_areas: []
      }
    },
    recommendations: [],
    artifacts: {}
  });

  assert.equal(result.ok, true);
});

test("validateReport rejects synthetic inspect-only blocker timelines when richer journey history exists", () => {
  const result = validateReport({
    run_id: "run_reject_synthetic_timeline",
    target: "bhuman.ai",
    status: "partial",
    findings: [
      {
        id: "finding_shallow",
        type: "dead_end",
        severity: "high",
        title: "Presenter generation stalled",
        expected_behavior: "The user should be able to finish the mission.",
        observed_behavior: "Presenter generation timed out after 89 seconds.",
        emotional_reaction: { primary: "frustration", intensity: 4 },
        page: { url: "https://bhuman.ai/ai-studio" },
        evidence: {
          screenshots: [],
          videos: ["https://example.com/run.webm"]
        },
        diagnostic_details: {
          page_loaded: true,
          current_url: "https://bhuman.ai/ai-studio",
          current_state: "Presenter generation timed out after 89 seconds.",
          last_successful_step: "Reached the affected area.",
          failure_reason: "Presenter generation timed out after 89 seconds.",
          attempted_actions: [
            {
              step: 1,
              action: "inspect",
              target: "Persona got blocked in the product",
              outcome: "Presenter generation timed out after 89 seconds.",
              url: "https://bhuman.ai/ai-studio"
            }
          ]
        }
      }
    ],
    tested_journeys: [
      {
        id: "journey_rich_history",
        name: "Generated AI video mission",
        status: "blocked",
        summary: "The run got to generation and then stalled.",
        steps: [
          "click: Start Free",
          "click: Start building",
          "click: Describe and generate with AI",
          "type: Presenter description",
          "click: Generate presenter",
          "wait: Generating presenter"
        ],
        pages: ["https://bhuman.ai/", "https://bhuman.ai/ai-studio"],
        evidence: {
          screenshots: ["https://example.com/frame.png"],
          videos: ["https://example.com/run.webm"]
        },
        observations: ["Presenter generation timed out after 89 seconds."]
      }
    ],
    summary: {
      counts: {},
      risk_score: 92,
      coverage: {
        pages_visited: 2,
        flows_tested: 1,
        flows_blocked: 1,
        untested_areas: []
      }
    },
    recommendations: [],
    artifacts: {}
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /real journey timeline/i);
});

test("normalizeReport prioritizes blocker-tail screenshots for blocked findings", () => {
  const report = normalizeReport({
    candidateReport: {
      status: "partial",
      findings: [
        {
          id: "finding_blocked_tail",
          type: "dead_end",
          severity: "high",
          title: "Generate presenter stalled",
          expected_behavior: "Presenter generation should move to a completed or error state.",
          observed_behavior: "The run stayed on the same waiting state for 6 consecutive waits and never advanced.",
          emotional_reaction: { primary: "frustration", intensity: 4 },
          page: { url: "https://speakeasy.bhuman.ai/" },
          evidence: {
            screenshots: [
              "/tmp/auth-entry-loaded.png",
              "/tmp/generate-wait-1.png",
              "/tmp/generate-wait-2.png"
            ],
            videos: ["https://example.com/run.webm"]
          },
          diagnostic_details: {
            page_loaded: true,
            current_url: "https://speakeasy.bhuman.ai/",
            current_state: "The generator stayed on the same waiting state.",
            last_successful_step: 'Clicked "Generate presenter".',
            failure_reason: "The run stayed on the same waiting state for 6 consecutive waits and never advanced.",
            repeated_state_count: 6,
            attempted_actions: [
              {
                step: 1,
                action: "click",
                target: "Generate presenter",
                outcome: "Generation started",
                url: "https://speakeasy.bhuman.ai/"
              },
              {
                step: 2,
                action: "wait",
                target: "Generating presenter",
                outcome: "The run stayed on the same waiting state for 6 consecutive waits and never advanced.",
                url: "https://speakeasy.bhuman.ai/"
              }
            ]
          }
        }
      ],
      tested_journeys: [
        {
          id: "journey_blocked_tail",
          name: "Generated AI video mission",
          status: "blocked",
          summary: "Presenter generation stalled after the submit click.",
          steps: ["click: Generate presenter", "wait: Generating presenter"],
          pages: ["https://speakeasy.bhuman.ai/"],
          evidence: {
            screenshots: [
              "/tmp/auth-form-filled.png",
              "/tmp/generate-wait-2.png",
              "/tmp/generate-wait-3.png"
            ],
            videos: ["https://example.com/run.webm"]
          },
          observations: ["The run stayed on the same waiting state for 6 consecutive waits and never advanced."]
        }
      ]
    },
    runRequest: {
      run_id: "run_blocked_tail_screenshots",
      target_url: "https://speakeasy.bhuman.ai/",
      scope_mode: "feature_targeted",
      scenario_list: ["Generate one AI presenter video"],
      brand_persona: "A first-time business user",
      source: "qa_bot"
    },
    artifacts: {
      local_screenshots: [
        "/tmp/auth-entry-loaded.png",
        "/tmp/auth-form-filled.png",
        "/tmp/generate-wait-1.png",
        "/tmp/generate-wait-2.png",
        "/tmp/generate-wait-3.png"
      ],
      local_video_url: "https://example.com/run.webm"
    },
    actions: {
      visited_pages: ["https://speakeasy.bhuman.ai/"],
      flows_tested: 1,
      flows_blocked: 1
    }
  });

  assert.deepEqual(report.findings[0].evidence.screenshots.slice(0, 3), [
    "/tmp/generate-wait-3.png",
    "/tmp/generate-wait-2.png",
    "/tmp/generate-wait-1.png"
  ]);
  assert.equal(
    report.findings[0].evidence.screenshots.some((item) => /auth-entry|auth-form/i.test(String(item || ""))),
    false
  );
});

test("validateReport rejects generic blocker titles when the exact failed step is available", () => {
  const result = validateReport({
    run_id: "run_reject_generic_title",
    target: "bhuman.ai",
    status: "partial",
    findings: [
      {
        id: "finding_generic_title",
        type: "dead_end",
        severity: "high",
        title: "Persona got blocked in the product",
        expected_behavior: "The user should be able to generate a presenter and continue.",
        observed_behavior: "The run stayed on the same waiting state for 6 consecutive waits and never advanced.",
        emotional_reaction: { primary: "frustration", intensity: 4 },
        page: { url: "https://speakeasy.bhuman.ai/" },
        evidence: {
          screenshots: [],
          videos: ["https://example.com/run.webm"]
        },
        diagnostic_details: {
          page_loaded: true,
          current_url: "https://speakeasy.bhuman.ai/",
          current_state: "The app stayed on the same generating state.",
          last_successful_step: 'Clicked "Generate presenter button".',
          failure_reason: "The run stayed on the same waiting state for 6 consecutive waits and never advanced.",
          attempted_actions: [
            {
              step: 1,
              action: "click",
              target: "Generate presenter button",
              outcome: 'Clicked "Generate presenter button".',
              url: "https://speakeasy.bhuman.ai/"
            },
            {
              step: 2,
              action: "wait",
              target: "current screen",
              outcome: "Waited 900ms",
              url: "https://speakeasy.bhuman.ai/",
              note: "Repeated 6 times"
            }
          ]
        }
      }
    ],
    tested_journeys: [
      {
        id: "journey_specific_title",
        name: "Generated AI video mission",
        status: "blocked",
        summary: "The run got to presenter generation and stalled.",
        steps: ["click: Generate presenter", "wait: Generating presenter"],
        pages: ["https://speakeasy.bhuman.ai/"],
        evidence: {
          screenshots: ["https://example.com/frame.png"],
          videos: ["https://example.com/run.webm"]
        },
        observations: ["The run stayed on the same waiting state for 6 consecutive waits and never advanced."]
      }
    ],
    summary: {
      counts: {},
      risk_score: 90,
      coverage: {
        pages_visited: 1,
        flows_tested: 1,
        flows_blocked: 1,
        untested_areas: []
      }
    },
    recommendations: []
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /title must name the exact broken step or issue/i);
  assert.match(result.error, /Generate presenter stalled/i);
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

test("normalizeReport attaches relevant timestamped console and network logs to blocked findings", () => {
  const report = normalizeReport({
    candidateReport: {
      status: "partial",
      findings: [
        {
          id: "finding_logs_1",
          type: "dead_end",
          severity: "high",
          title: "Presenter generation stalled",
          expected_behavior: "The presenter should finish generating so the user can keep going.",
          observed_behavior: "The generation spinner stayed visible and no presenter was returned.",
          emotional_reaction: {
            primary: "frustration",
            intensity: 4
          },
          page: {
            url: "https://speakeasy.example.com/generate"
          },
          evidence: {
            videos: ["https://cdn.example.com/run.webm"]
          },
          diagnostic_details: {
            page_loaded: true,
            current_url: "https://speakeasy.example.com/generate",
            current_state: "Generating presenter stayed visible.",
            last_successful_step: 'Clicked "Generate presenter button".',
            failure_reason: "Presenter generation timed out after 89 seconds.",
            attempted_actions: [
              {
                step: 5,
                action: "click",
                target: "Generate presenter button",
                outcome: 'Clicked "Generate presenter button".',
                url: "https://speakeasy.example.com/generate",
                ts: "2026-03-25T12:00:05.000Z"
              },
              {
                step: 6,
                action: "wait",
                target: "Generating presenter",
                outcome: "Spinner stayed visible.",
                url: "https://speakeasy.example.com/generate",
                ts: "2026-03-25T12:00:18.000Z"
              }
            ]
          }
        }
      ]
    },
    runRequest: {
      run_id: "run_logs_1",
      target_url: "https://bhuman.ai",
      scope_mode: "feature_targeted",
      scenario_list: ["Generate one AI presenter video"],
      brand_persona: "A marketer",
      source: "qa_bot"
    },
    artifacts: {
      local_video_url: "https://cdn.example.com/run.webm",
      console_timeline: [
        {
          ts: "2026-03-25T11:59:10.000Z",
          level: "log",
          message: "Unrelated page mounted",
          url: "https://bhuman.ai/"
        },
        {
          ts: "2026-03-25T12:00:12.000Z",
          level: "error",
          message: "Presenter polling failed with 504 Gateway Timeout",
          url: "https://speakeasy.example.com/generate",
          source: "console"
        }
      ],
      network_timeline: [
        {
          ts: "2026-03-25T12:00:14.000Z",
          phase: "response",
          method: "POST",
          url: "https://api.example.com/presenter/generate",
          status: 504,
          duration_ms: 842,
          resource_type: "fetch",
          page_url: "https://speakeasy.example.com/generate"
        },
        {
          ts: "2026-03-25T12:05:14.000Z",
          phase: "response",
          method: "GET",
          url: "https://api.example.com/health",
          status: 200,
          duration_ms: 20,
          resource_type: "fetch",
          page_url: "https://bhuman.ai/"
        }
      ]
    },
    runLog: [
      {
        ts: "2026-03-25T12:00:12.000Z",
        event: "browser_console",
        data: {
          level: "error",
          message: "Presenter polling failed with 504 Gateway Timeout",
          url: "https://speakeasy.example.com/generate"
        }
      },
      {
        ts: "2026-03-25T12:00:14.000Z",
        event: "browser_network",
        data: {
          phase: "response",
          method: "POST",
          url: "https://api.example.com/presenter/generate",
          status: 504,
          duration_ms: 842,
          resource_type: "fetch",
          page_url: "https://speakeasy.example.com/generate"
        }
      }
    ],
    actions: {
      visited_pages: ["https://bhuman.ai", "https://speakeasy.example.com/generate"],
      flows_tested: 1,
      flows_blocked: 1,
      untested_areas: []
    },
    reportUrl: "https://swarmtester.com/api/qa/report?run_id=run_logs_1"
  });

  assert.equal(report.findings.length, 1);
  assert.equal(report.findings[0].evidence.videos[0], "https://cdn.example.com/run.webm");
  assert.ok(report.findings[0].evidence.console_logs.some((item) => item.includes("504 Gateway Timeout")));
  assert.ok(report.findings[0].evidence.network_logs.some((item) => item.includes("status=504")));
  assert.match(report.findings[0].observed_behavior, /Relevant logs:/);
  assert.match(report.findings[0].diagnostic_details.failure_reason, /status=504/);
  assert.ok(report.evidence_gallery.console_logs.some((item) => item.includes("[2026-03-25T12:00:12.000Z]")));
  assert.ok(report.evidence_gallery.network_logs.some((item) => item.includes("POST https://api.example.com/presenter/generate")));
  assert.equal(validateReport(report).ok, true);
});

test("normalizeReport builds experience timeline spans for blocked runs and preserves them through callback sanitization", () => {
  const report = normalizeReport({
    candidateReport: {
      status: "partial",
      findings: [
        {
          id: "finding_generate_presenter_stalled",
          type: "dead_end",
          severity: "high",
          title: "Generate presenter stalled",
          expected_behavior: "The presenter should generate so the user can continue to the next step.",
          observed_behavior: "After clicking Generate presenter, the app stayed on the same generating state and never moved forward.",
          emotional_reaction: {
            primary: "frustration",
            intensity: 4
          },
          page: {
            url: "https://speakeasy.example.com/generate"
          },
          evidence: {
            videos: ["https://cdn.example.com/run.webm"]
          },
          diagnostic_details: {
            page_loaded: true,
            current_url: "https://speakeasy.example.com/generate",
            current_state: "The app stayed on the same generating state.",
            last_successful_step: 'Clicked "Generate presenter button".',
            failure_reason: "After clicking Generate presenter, the app stayed on the same generating state and never moved forward.",
            repeated_state_count: 6,
            attempted_actions: [
              {
                step: 1,
                action: "click",
                target: "Start Free button top right",
                outcome: "Opened the auth flow.",
                url: "https://bhuman.ai/",
                ts: "2026-03-25T12:00:00.000Z"
              },
              {
                step: 2,
                action: "click",
                target: "Start building button in welcome popup",
                outcome: "Opened the presenter workspace.",
                url: "https://speakeasy.example.com/generate",
                ts: "2026-03-25T12:00:05.000Z"
              },
              {
                step: 3,
                action: "click",
                target: "Describe AI presenter tab",
                outcome: "Switched to the AI presenter creation form.",
                url: "https://speakeasy.example.com/generate",
                ts: "2026-03-25T12:00:10.000Z"
              },
              {
                step: 4,
                action: "type",
                target: "Presenter description text area",
                outcome: "Filled the presenter description.",
                url: "https://speakeasy.example.com/generate",
                ts: "2026-03-25T12:00:15.000Z"
              },
              {
                step: 5,
                action: "click",
                target: "Generate presenter button",
                outcome: 'Clicked "Generate presenter button".',
                url: "https://speakeasy.example.com/generate",
                ts: "2026-03-25T12:00:20.000Z"
              },
              {
                step: 6,
                action: "wait",
                target: "Generating presenter",
                outcome: "The app stayed on the same generating state.",
                url: "https://speakeasy.example.com/generate",
                ts: "2026-03-25T12:00:26.000Z"
              },
              {
                step: 7,
                action: "wait",
                target: "Generating presenter",
                outcome: "The app stayed on the same generating state and never moved forward.",
                url: "https://speakeasy.example.com/generate",
                ts: "2026-03-25T12:00:32.000Z"
              }
            ]
          }
        }
      ]
    },
    runRequest: {
      run_id: "run_timeline_generation",
      target_url: "https://bhuman.ai/",
      scope_mode: "feature_targeted",
      scenario_list: ["Make one generated AI video"],
      brand_persona: "A first-time business user",
      source: "qa_bot"
    },
    artifacts: {
      local_video_url: "https://cdn.example.com/run.webm",
      console_timeline: [
        {
          ts: "2026-03-25T12:00:28.000Z",
          level: "error",
          message: "Presenter polling failed with 504 Gateway Timeout",
          url: "https://speakeasy.example.com/generate"
        }
      ],
      network_timeline: [
        {
          ts: "2026-03-25T12:00:29.000Z",
          phase: "response",
          method: "POST",
          url: "https://api.example.com/presenter/generate",
          status: 504,
          duration_ms: 842,
          resource_type: "fetch",
          page_url: "https://speakeasy.example.com/generate"
        }
      ]
    },
    runLog: [
      {
        ts: "2026-03-25T12:00:28.000Z",
        event: "browser_console",
        data: {
          level: "error",
          message: "Presenter polling failed with 504 Gateway Timeout",
          url: "https://speakeasy.example.com/generate"
        }
      },
      {
        ts: "2026-03-25T12:00:29.000Z",
        event: "browser_network",
        data: {
          phase: "response",
          method: "POST",
          url: "https://api.example.com/presenter/generate",
          status: 504,
          duration_ms: 842,
          resource_type: "fetch",
          page_url: "https://speakeasy.example.com/generate"
        }
      }
    ],
    actions: {
      visited_pages: ["https://bhuman.ai/", "https://speakeasy.example.com/generate"],
      flows_tested: 1,
      flows_blocked: 1
    }
  });

  assert.ok(report.experience_timeline);
  assert.ok(Array.isArray(report.experience_timeline.spans));
  assert.ok(report.experience_timeline.spans.length >= 2);
  assert.equal(report.experience_timeline.has_video, true);
  const blockerSpan = report.experience_timeline.spans.find((span) => span.level === "blocker");
  assert.ok(blockerSpan);
  assert.match(blockerSpan.label, /Generate presenter stalled/i);
  assert.ok(blockerSpan.linked_finding_ids.includes("finding_generate_presenter_stalled"));
  assert.ok(blockerSpan.evidence.console_logs.some((item) => item.includes("504 Gateway Timeout")));
  assert.ok(blockerSpan.evidence.network_logs.some((item) => item.includes("status=504")));

  const sanitized = sanitizeReportForCallback(report);
  assert.ok(sanitized.experience_timeline);
  assert.ok(Array.isArray(sanitized.experience_timeline.spans));
  assert.ok(sanitized.experience_timeline.spans.some((span) => span.level === "blocker"));

  const markdown = buildMarkdownReport(report, {
    scope_mode: "feature_targeted",
    brand_persona: "A first-time business user",
    target_url: "https://bhuman.ai/"
  });
  assert.match(markdown, /## Experience Timeline/);
  assert.match(markdown, /Generate presenter stalled/);
});
