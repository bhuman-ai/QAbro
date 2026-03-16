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
