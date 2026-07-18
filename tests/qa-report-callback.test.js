const test = require("node:test");
const assert = require("node:assert/strict");
const nodemailer = require("nodemailer");

const callbackHandler = require("../api/qa-report-callback");
const { validateEvidenceCoverage } = callbackHandler.__private;

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

async function withEnv(overrides, callback) {
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined || value === null) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  }

  try {
    return await callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("qa-report-callback accepts two screenshots when two distinct videos provide rich coverage", async () => {
  await withEnv(
    {
      QA_REQUIRED_SCREENSHOT_COUNT: undefined,
      QA_REQUIRED_VIDEO_COUNT: undefined
    },
    async () => {
      const result = validateEvidenceCoverage(
        {
          evidence_gallery: {
            screenshots: [
              "https://cdn.example.com/start.png",
              "https://cdn.example.com/final.png"
            ],
            videos: [
              "https://cdn.example.com/full-run.webm",
              "https://cdn.example.com/blocker.webm"
            ]
          }
        },
        {},
        {}
      );

      assert.equal(result.ok, true);
      assert.equal(result.screenshots.length, 2);
      assert.equal(result.videos.length, 2);
    }
  );
});

test("qa-report-callback keeps a two-screenshot floor with rich video coverage", async () => {
  await withEnv(
    {
      QA_REQUIRED_SCREENSHOT_COUNT: undefined,
      QA_REQUIRED_VIDEO_COUNT: undefined
    },
    async () => {
      const result = validateEvidenceCoverage(
        {
          evidence_gallery: {
            screenshots: ["https://cdn.example.com/final.png"],
            videos: [
              "https://cdn.example.com/full-run.webm",
              "https://cdn.example.com/blocker.webm"
            ]
          }
        },
        {},
        {}
      );

      assert.equal(result.ok, false);
      assert.match(result.error, /at least 2 screenshots/i);
    }
  );
});

test("qa-report-callback sanitizes stored report payloads before upsert", async () => {
  const originalFetch = global.fetch;
  let persistedRow = null;

  global.fetch = async (_url, init = {}) => {
    persistedRow = JSON.parse(String(init.body || "[]"))[0];
    return {
      ok: true,
      status: 200,
      async json() {
        return [{ id: "row_1" }];
      }
    };
  };

  try {
    await withEnv(
      {
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_KEY: "service-key",
        QA_CALLBACK_SECRET: "secret"
      },
      async () => {
        const req = {
          method: "POST",
          body: {
            run_id: "run_media_trim",
            target: "example.com",
            status: "completed",
            owner_user_id: "user_123",
            owner_email: "qa@example.com",
            findings: [
              {
                id: "finding_1",
                type: "dead_end",
                severity: "high",
                title: "Primary CTA did not advance the flow",
                expected_behavior: "CTA should work",
                observed_behavior: "Click failed",
                diagnostic_details: {
                  page_loaded: true,
                  current_url: "https://example.com/app",
                  current_state: "The same dashboard remained visible after the CTA click.",
                  last_successful_step: "Reached the signed-in dashboard.",
                  failure_reason: "Clicking the CTA did not advance the user into the next step.",
                  attempted_actions: [
                    {
                      action: "click",
                      target: "Primary CTA",
                      outcome: "no_state_change",
                      url: "https://example.com/app"
                    }
                  ]
                },
                emotional_reaction: {
                  primary: "frustration",
                  intensity: 3
                },
                evidence: {
                  screenshots: ["data:image/png;base64,abc", "https://cdn.example.com/finding.png"],
                  videos: ["https://cdn.example.com/finding.webm"]
                }
              }
            ],
            tested_journeys: [
              {
                id: "journey_1",
                name: "Primary flow",
                status: "blocked",
                summary: "The tester got stuck after reaching the dashboard CTA.",
                steps: ["click: Primary CTA", "wait: Dashboard transition"],
                pages: ["https://example.com/app"],
                evidence: {
                  screenshots: ["https://cdn.example.com/journey.png"],
                  videos: ["https://cdn.example.com/journey.webm"]
                },
                observations: ["The same dashboard remained visible after the CTA click."]
              }
            ],
            evidence_gallery: {
              screenshots: ["data:image/png;base64,abc", "https://cdn.example.com/gallery.png"],
              videos: ["https://cdn.example.com/gallery.webm"],
              console_logs: ["[2026-03-25T12:00:12.000Z] console.error @ https://example.com/app :: CTA failed"],
              network_logs: ["[2026-03-25T12:00:13.000Z] response POST https://api.example.com/cta :: status=500"]
            },
            artifacts: {
              captured_screenshots: ["data:image/png;base64,abc"],
              console_timeline: [{ ts: "2026-03-25T12:00:12.000Z", level: "error", message: "CTA failed" }],
              network_timeline: [{ ts: "2026-03-25T12:00:13.000Z", phase: "response", url: "https://api.example.com/cta" }]
            },
            evidence_media: {
              screenshots: [
                {
                  source: "/tmp/finding.png",
                  data_url: "data:image/png;base64,abc",
                  content_type: "image/png"
                },
                {
                  source: "/tmp/storage-only.png",
                  storage_bucket: "qa-evidence",
                  storage_path: "run_1/screenshots/storage-only.png",
                  content_type: "image/png",
                  byte_length: 1234
                }
              ],
              videos: [
                {
                  source: "/tmp/run.webm",
                  data_url: "data:video/webm;base64,xyz",
                  content_type: "video/webm"
                }
              ]
            },
            report_markdown: "# report\n![inline](data:image/png;base64,abc)\n" + "x".repeat(20000),
            run_log: Array.from({ length: 130 }, (_, index) => ({
              ts: `2026-03-11T00:00:${String(index % 60).padStart(2, "0")}Z`,
              event: "vision_only_step_decision",
              data: {
                step: index + 1,
                huge_text: "y".repeat(1000)
              }
            }))
          },
          headers: {
            "x-callback-secret": "secret",
            "user-agent": "qa-test"
          }
        };
        const res = createRes();

        await callbackHandler(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.ok, true);
      }
    );
  } finally {
    global.fetch = originalFetch;
  }

  assert.ok(persistedRow);
  assert.deepEqual(persistedRow.findings[0].evidence.screenshots, ["https://cdn.example.com/finding.png"]);
  assert.deepEqual(persistedRow.findings[0].evidence.videos, ["https://cdn.example.com/finding.webm"]);
  assert.deepEqual(persistedRow.payload.evidence_gallery.screenshots, ["https://cdn.example.com/gallery.png"]);
  assert.deepEqual(persistedRow.payload.evidence_gallery.videos, ["https://cdn.example.com/gallery.webm"]);
  assert.deepEqual(persistedRow.payload.evidence_gallery.console_logs, [
    "[2026-03-25T12:00:12.000Z] console.error @ https://example.com/app :: CTA failed"
  ]);
  assert.deepEqual(persistedRow.payload.evidence_gallery.network_logs, [
    "[2026-03-25T12:00:13.000Z] response POST https://api.example.com/cta :: status=500"
  ]);
  assert.equal(persistedRow.payload.artifacts.captured_screenshots, undefined);
  assert.equal(persistedRow.payload.artifacts.captured_screenshot_count, 1);
  assert.equal(persistedRow.payload.artifacts.console_timeline, undefined);
  assert.equal(persistedRow.payload.artifacts.console_event_count, 1);
  assert.equal(persistedRow.payload.artifacts.network_timeline, undefined);
  assert.equal(persistedRow.payload.artifacts.network_event_count, 1);
  assert.equal(persistedRow.payload.report_json.artifacts.captured_screenshots, undefined);
  assert.equal(persistedRow.payload.report_json.artifacts.captured_screenshot_count, 1);
  assert.equal(persistedRow.payload.report_json.artifacts.console_timeline, undefined);
  assert.equal(persistedRow.payload.report_json.artifacts.console_event_count, 1);
  assert.equal(persistedRow.payload.report_json.artifacts.network_timeline, undefined);
  assert.equal(persistedRow.payload.report_json.artifacts.network_event_count, 1);
  assert.deepEqual(persistedRow.payload.evidence_media, {
    screenshots: [
      {
        source: "/tmp/finding.png",
        content_type: "image/png",
        data_url: "data:image/png;base64,abc"
      },
      {
        source: "/tmp/storage-only.png",
        content_type: "image/png",
        storage_bucket: "qa-evidence",
        storage_path: "run_1/screenshots/storage-only.png",
        byte_length: 1234
      }
    ],
    videos: [
      {
        source: "/tmp/run.webm",
        content_type: "video/webm",
        data_url: "data:video/webm;base64,xyz"
      }
    ]
  });
  assert.equal(persistedRow.payload.run_log.length, 120);
  assert.equal(String(persistedRow.payload.report_markdown || "").includes("data:image/"), false);
  assert.ok(String(persistedRow.payload.report_markdown || "").length <= 12000);
  assert.deepEqual(persistedRow.findings[0].diagnostic_details, {
    page_loaded: true,
    current_url: "https://example.com/app",
    current_state: "The same dashboard remained visible after the CTA click.",
    last_successful_step: "Reached the signed-in dashboard.",
    failure_reason: "Clicking the CTA did not advance the user into the next step.",
    attempted_actions: [
      {
        action: "click",
        target: "Primary CTA",
        outcome: "no_state_change",
        url: "https://example.com/app"
      }
    ]
  });
});

test("qa-report-callback rejects findings without diagnostic details", async () => {
  const req = {
    method: "POST",
    body: {
      run_id: "run_missing_diagnostics",
      target: "example.com",
      status: "completed",
      owner_user_id: "user_123",
      owner_email: "qa@example.com",
      findings: [
        {
          id: "finding_missing_details",
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
            screenshots: ["https://cdn.example.com/finding.png"]
          }
        }
      ]
    },
    headers: {
      "x-callback-secret": "secret",
      "user-agent": "qa-test"
    }
  };
  const res = createRes();

  await withEnv(
    {
      SUPABASE_URL: "https://supabase.example",
      SUPABASE_SERVICE_KEY: "service-key",
      QA_CALLBACK_SECRET: "secret"
    },
    async () => {
      await callbackHandler(req, res);
    }
  );

  assert.equal(res.statusCode, 400);
  assert.match(String(res.body?.error || ""), /diagnostic_details/i);
});

test("qa-report-callback rejects failed reports without top-level failure diagnostics", async () => {
  const req = {
    method: "POST",
    body: {
      run_id: "run_failed_missing_failure_details",
      target: "example.com",
      status: "failed",
      owner_user_id: "user_123",
      owner_email: "qa@example.com",
      summary: {
        note: "Auth submit button could not be activated"
      },
      findings: []
    },
    headers: {
      "x-callback-secret": "secret",
      "user-agent": "qa-test"
    }
  };
  const res = createRes();

  await withEnv(
    {
      SUPABASE_URL: "https://supabase.example",
      SUPABASE_SERVICE_KEY: "service-key",
      QA_CALLBACK_SECRET: "secret"
    },
    async () => {
      await callbackHandler(req, res);
    }
  );

  assert.equal(res.statusCode, 400);
  assert.match(String(res.body?.error || ""), /failure_diagnostics/i);
});

test("qa-report-callback rejects reports without enough portable screenshot and video evidence", async () => {
  const req = {
    method: "POST",
    body: {
      run_id: "run_missing_evidence_floor",
      target: "example.com",
      status: "failed_validation",
      owner_user_id: "user_123",
      owner_email: "qa@example.com",
      failure_diagnostics: {
        page_loaded: true,
        current_url: "https://example.com/login",
        current_state: "The auth submit button stayed disabled.",
        last_successful_step: "Opened the auth flow.",
        failure_reason: "Auth submit button could not be activated.",
        attempted_actions: [
          {
            action: "click",
            target: "Continue",
            outcome: "button_disabled",
            url: "https://example.com/login"
          }
        ]
      },
      findings: [],
      tested_journeys: [],
      evidence_gallery: {
        screenshots: ["https://cdn.example.com/only-one.png"]
      },
      evidence_media: {
        screenshots: [
          {
            source: "/tmp/only-one.png",
            data_url: "data:image/png;base64,abc",
            content_type: "image/png"
          }
        ]
      }
    },
    headers: {
      "x-callback-secret": "secret",
      "user-agent": "qa-test"
    }
  };
  const res = createRes();

  await withEnv(
    {
      SUPABASE_URL: "https://supabase.example",
      SUPABASE_SERVICE_KEY: "service-key",
      QA_CALLBACK_SECRET: "secret"
    },
    async () => {
      await callbackHandler(req, res);
    }
  );

  assert.equal(res.statusCode, 400);
  assert.match(String(res.body?.error || ""), /Evidence capture requirements not met/i);
});

test("qa-report-callback sends scheduled QA alert emails when a recipient is configured", async () => {
  const originalFetch = global.fetch;
  const originalCreateTransport = nodemailer.createTransport;
  let sentMail = null;

  nodemailer.createTransport = () => ({
    async sendMail(payload) {
      sentMail = payload;
      return { messageId: "message_qa_alert" };
    }
  });

  global.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target.includes("/rest/v1/swarmtest_reports")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return [
            {
              id: "row_1",
              run_id: "run_scheduled_email",
              status: "partial",
              report_url: "https://swarmtester.com/api/qa/report?run_id=run_scheduled_email"
            }
          ];
        }
      };
    }
    if (target.includes("/rest/v1/swarmtest_qa_schedules") && init.method !== "PATCH") {
      return {
        ok: true,
        status: 200,
        async json() {
          return [
            {
              id: "schedule_1",
              owner_user_id: "user_123",
              owner_email: "qa@example.com",
              brand_key: "clusterseo.com",
              brand_name: "ClusterSEO",
              target_url: "https://clusterseo.com",
              name: "ClusterSEO regular QA",
              active: true,
              frequency_hours: 24,
              scope_mode: "deep_45m",
              persona: "General non-developer business user with moderate technical comfort.",
              mission: "Sign up and reach the product.",
              metadata: {
                alert_email_to: "alerts@example.com"
              }
            }
          ];
        }
      };
    }
    if (target.includes("/rest/v1/swarmtest_qa_alerts")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return [
            {
              id: "alert_1",
              owner_user_id: "user_123",
              owner_email: "qa@example.com",
              schedule_id: "schedule_1",
              run_id: "run_scheduled_email",
              brand_key: "clusterseo.com",
              severity: "high",
              status: "open",
              title: "Sign-up returned to the login screen",
              message: "The tester clicked Sign up and landed back on the login page.",
              ui_report_url: "https://swarmtester.com/dashboard?view=report&run_id=run_scheduled_email&brand=clusterseo.com",
              payload: {}
            }
          ];
        }
      };
    }
    if (target.includes("/rest/v1/swarmtest_qa_schedules") && init.method === "PATCH") {
      return {
        ok: true,
        status: 200,
        async json() {
          return [
            {
              id: "schedule_1",
              owner_user_id: "user_123",
              owner_email: "qa@example.com",
              brand_key: "clusterseo.com",
              metadata: {
                alert_email_to: "alerts@example.com"
              }
            }
          ];
        }
      };
    }
    throw new Error(`Unexpected fetch URL: ${target}`);
  };

  try {
    await withEnv(
      {
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_KEY: "service-key",
        QA_CALLBACK_SECRET: "secret",
        QA_REQUIRED_SCREENSHOT_COUNT: "1",
        QA_REQUIRED_VIDEO_COUNT: "0",
        QA_ALERT_EMAIL_SMTP_HOST: "smtp.example.com",
        QA_ALERT_EMAIL_SMTP_PORT: "465",
        QA_ALERT_EMAIL_SMTP_SECURE: "true",
        QA_ALERT_EMAIL_SMTP_USERNAME: "alerts@beforeusersdo.com",
        QA_ALERT_EMAIL_SMTP_PASSWORD: "secret",
        QA_ALERT_EMAIL_FROM: "Before Users Do <alerts@beforeusersdo.com>"
      },
      async () => {
        const req = {
          method: "POST",
          body: {
            run_id: "run_scheduled_email",
            target: "clusterseo.com",
            status: "partial",
            owner_user_id: "user_123",
            owner_email: "qa@example.com",
            metadata: {
              qa_schedule_id: "schedule_1",
              brand_key: "clusterseo.com"
            },
            findings: [
              {
                id: "finding_1",
                type: "dead_end",
                severity: "high",
                title: "Sign-up returned to the login screen",
                expected_behavior: "New accounts should land inside the product after sign-up.",
                observed_behavior: "The tester clicked Sign up and landed back on the login page.",
                diagnostic_details: {
                  page_loaded: true,
                  current_url: "https://clusterseo.com/login",
                  current_state: "The login form stayed visible after sign-up.",
                  last_successful_step: "Filled the sign-up form.",
                  failure_reason: "Submitting sign-up sent the tester back to login instead of into the product.",
                  attempted_actions: [
                    {
                      action: "click",
                      target: "Sign up",
                      outcome: "returned_to_login",
                      url: "https://clusterseo.com/login"
                    }
                  ]
                },
                emotional_reaction: {
                  primary: "frustration",
                  intensity: 4
                },
                evidence: {
                  screenshots: ["https://cdn.example.com/finding.png"],
                  videos: ["https://cdn.example.com/finding.webm"]
                }
              }
            ],
            evidence_gallery: {
              screenshots: ["https://cdn.example.com/finding.png"],
              videos: ["https://cdn.example.com/finding.webm"]
            },
            tested_journeys: []
          },
          headers: {
            "x-callback-secret": "secret",
            "user-agent": "qa-test"
          }
        };
        const res = createRes();
        await callbackHandler(req, res);
        assert.equal(res.statusCode, 200);
      }
    );
  } finally {
    nodemailer.createTransport = originalCreateTransport;
    global.fetch = originalFetch;
  }

  assert.ok(sentMail);
  assert.deepEqual(sentMail.to, ["alerts@example.com"]);
  assert.match(String(sentMail.subject || ""), /Sign-up returned to the login screen/);
  assert.match(String(sentMail.subject || ""), /Before Users Do/);
});
