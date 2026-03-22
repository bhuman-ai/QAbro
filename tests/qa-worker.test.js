const test = require("node:test");
const assert = require("node:assert/strict");

const { __private } = require("../scripts/qa-worker");

test("buildExecutionPlan auto prefers local vision agent when configured", () => {
  const plan = __private.buildExecutionPlan(
    {
      metadata: {
        execution_engine: "auto"
      }
    },
    {
      BROWSERBASE_API_KEY: "browserbase-key",
      BROWSERBASE_PROJECT_ID: "project-id",
      OPENAI_API_KEY: "openai-key"
    }
  );

  assert.equal(plan.requestedEngine, "auto");
  assert.equal(plan.localAgent.ok, true);
  assert.deepEqual(
    plan.attempts.map((attempt) => attempt.engine),
    ["local_vision_agent"]
  );
  assert.equal(plan.attempts[0].reason, "auto_ocr_stack_only");
});

test("buildExecutionPlan keeps auto on local vision agent when agent config is unavailable", () => {
  const plan = __private.buildExecutionPlan(
    {
      metadata: {
        execution_engine: "auto"
      }
    },
    {}
  );

  assert.equal(plan.requestedEngine, "auto");
  assert.equal(plan.localAgent.ok, false);
  assert.deepEqual(
    plan.attempts.map((attempt) => attempt.engine),
    ["local_vision_agent"]
  );
  assert.equal(plan.attempts[0].reason, "ocr_stack_required_missing_agent_config");
});

test("buildExecutionPlan rewrites explicit local_playwright requests onto local vision agent", () => {
  const plan = __private.buildExecutionPlan(
    {
      metadata: {
        execution_engine: "local_playwright"
      }
    },
    {
      OPENAI_API_KEY: "openai-key"
    }
  );

  assert.equal(plan.requestedEngine, "local_vision_agent");
  assert.deepEqual(
    plan.attempts.map((attempt) => attempt.engine),
    ["local_vision_agent"]
  );
  assert.equal(plan.attempts[0].reason, "requested");
});

test("shouldFallbackToNextEngine falls back after failed vision-only agent runs", () => {
  assert.equal(
    __private.shouldFallbackToNextEngine(
      {
        report: { status: "failed" },
        artifacts: { agent_mode_used: null }
      },
      { engine: "local_vision_agent" }
    ),
    true
  );

  assert.equal(
    __private.shouldFallbackToNextEngine(
      {
        report: { status: "failed" },
        artifacts: { agent_mode_used: "vision_only" }
      },
      { engine: "local_vision_agent" }
    ),
    true
  );

  assert.equal(
    __private.shouldFallbackToNextEngine(
      {
        report: { status: "partial" },
        artifacts: { agent_mode_used: "vision_only" }
      },
      { engine: "local_vision_agent" }
    ),
    false
  );

  assert.equal(
    __private.shouldFallbackToNextEngine(
      {
        report: { status: "failed" },
        artifacts: { agent_mode_used: null }
      },
      { engine: "local_playwright" }
    ),
    false
  );
});

test("buildStoredExecutionPayload strips embedded media before persisting final rows", () => {
  const payload = __private.buildStoredExecutionPayload(
    {
      status: "completed",
      evidence_gallery: {
        screenshots: ["data:image/png;base64,abc", "https://example.com/final.png"]
      },
      findings: [
        {
          evidence: {
            screenshots: ["data:image/png;base64,def", "https://example.com/finding.png"]
          }
        }
      ],
      tested_journeys: [
        {
          evidence: {
            screenshots: ["data:image/png;base64,ghi", "https://example.com/journey.png"]
          }
        }
      ]
    },
    "Before\n![inline](data:image/png;base64,zzz)\n" + "x".repeat(13000),
    {
      artifacts: {
        captured_screenshots: ["data:image/png;base64,abc"],
        local_screenshots: ["/tmp/one.png"]
      },
      runLog: [
        {
          ts: "2026-03-19T00:00:00.000Z",
          event: "progress",
          data: {
            note: "ok",
            nested: {
              screenshot: "data:image/png;base64,xyz"
            }
          }
        }
      ]
    }
  );

  assert.equal(payload.reportMarkdown.length, 12000);
  assert.equal(payload.reportMarkdown.includes("data:image/"), false);
  assert.deepEqual(payload.artifacts.local_screenshots, ["/tmp/one.png"]);
  assert.equal(payload.artifacts.captured_screenshots, undefined);
  assert.equal(payload.artifacts.captured_screenshot_count, 1);
  assert.deepEqual(payload.findings[0].evidence.screenshots, ["https://example.com/finding.png"]);
  assert.deepEqual(payload.reportJson.evidence_gallery.screenshots, ["https://example.com/final.png"]);
  assert.deepEqual(payload.reportJson.findings[0].evidence.screenshots, ["https://example.com/finding.png"]);
  assert.deepEqual(payload.reportJson.tested_journeys[0].evidence.screenshots, ["https://example.com/journey.png"]);
  assert.equal(payload.runLog[0].data.note, "ok");
});
