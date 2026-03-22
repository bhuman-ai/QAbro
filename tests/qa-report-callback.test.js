const test = require("node:test");
const assert = require("node:assert/strict");

const callbackHandler = require("../api/qa-report-callback");

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
                  screenshots: ["data:image/png;base64,abc", "https://cdn.example.com/finding.png"]
                }
              }
            ],
            evidence_gallery: {
              screenshots: ["data:image/png;base64,abc", "https://cdn.example.com/gallery.png"]
            },
            artifacts: {
              captured_screenshots: ["data:image/png;base64,abc"]
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
  assert.deepEqual(persistedRow.payload.evidence_gallery.screenshots, ["https://cdn.example.com/gallery.png"]);
  assert.equal(persistedRow.payload.artifacts.captured_screenshots, undefined);
  assert.equal(persistedRow.payload.artifacts.captured_screenshot_count, 1);
  assert.equal(persistedRow.payload.report_json.artifacts.captured_screenshots, undefined);
  assert.equal(persistedRow.payload.report_json.artifacts.captured_screenshot_count, 1);
  assert.equal(persistedRow.payload.run_log.length, 120);
  assert.equal(String(persistedRow.payload.report_markdown || "").includes("data:image/"), false);
  assert.ok(String(persistedRow.payload.report_markdown || "").length <= 12000);
});
