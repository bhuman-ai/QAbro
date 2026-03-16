const test = require("node:test");
const assert = require("node:assert/strict");

const { __private, buildRunQaReport, classifyOutcome } = require("../scripts/local-workolo-matrix");

test("chooseInputValue reuses onboarding email for email-labeled fields", () => {
  assert.equal(
    __private.chooseInputValue(
      {
        label: "Work email",
        placeholder: "Your email",
        name: "email",
        id: "email"
      },
      [],
      { emailValue: "persona@test.example" }
    ),
    "persona@test.example"
  );
});

test("chooseInputValue uses persona-aware role and company fields", () => {
  const personaProfile = __private.buildPersonaProfile(
    "First-time user learning the product. A skeptical buyer. semi technical marketer"
  );

  assert.equal(
    __private.chooseInputValue(
      {
        label: "Job title",
        placeholder: "Your role",
        name: "title",
        id: "title"
      },
      [],
      { personaProfile }
    ),
    "Marketing Manager"
  );

  assert.equal(
    __private.chooseInputValue(
      {
        label: "Company name",
        placeholder: "Company",
        name: "company",
        id: "company"
      },
      [],
      { personaProfile }
    ),
    "Northstar Media"
  );
});

test("chooseInputValue still ignores password and otp fields", () => {
  assert.equal(
    __private.chooseInputValue(
      {
        label: "Verification code",
        placeholder: "123456",
        name: "otp_code",
        id: "otp"
      },
      [],
      { emailValue: "persona@test.example" }
    ),
    null
  );

  assert.equal(
    __private.chooseInputValue(
      {
        label: "Password",
        placeholder: "Password",
        name: "password",
        id: "password"
      },
      [],
      { emailValue: "persona@test.example" }
    ),
    null
  );
});

test("classifyOutcome keeps feature progress distinct from onboarding friction", () => {
  assert.equal(
    classifyOutcome({
      captchaDetected: false,
      otpRequired: true,
      otpAttempted: true,
      otpVerified: true,
      emailVerificationPrompt: false,
      onboardingDetected: true,
      onboardingCompleted: false,
      featureVisitedCount: 2,
      signedInSignal: true,
      validationErrors: [],
      submitClicked: true,
      authStillVisible: false
    }),
    "onboarding_incomplete_with_feature_progress"
  );
});

test("didAchieveMission stays false until the mission judge confirms completion", () => {
  assert.equal(
    __private.didAchieveMission({
      classification: "onboarding_incomplete_with_feature_progress",
      mission_judgment: {
        completed: false
      },
      feature_exploration: {
        visited_count: 2,
        interactions_completed: 6,
        matched_goal_count: 3
      }
    }),
    false
  );
});

test("didAchieveMission becomes true when the mission judge confirms completion", () => {
  assert.equal(
    __private.didAchieveMission({
      classification: "feature_goals_exercised_after_otp",
      mission_judgment: {
        completed: true
      },
      feature_exploration: {
        visited_count: 0,
        interactions_completed: 0,
        matched_goal_count: 0
      }
    }),
    true
  );
});

test("buildRunQaReport marks invoked feature exploration as partial instead of skipped", () => {
  const report = buildRunQaReport(
    {
      run_id: "run_123",
      target_url: "https://example.com",
      success: false,
      notes: [],
      signup_submitted: true,
      urls_visited: ["https://example.com/app"],
      request_failures: [],
      validation_errors: [],
      artifacts: { screenshots: [] },
      signals: { otp_required: true, signed_in: true },
      otp: { verified: true },
      onboarding: { detected: true, completed: false, steps_completed: 2 },
      feature_exploration: {
        invoked: true,
        attempted: 0,
        discovered: 0,
        visited_count: 0,
        blocked_count: 0,
        interactions_completed: 0,
        matched_goal_count: 0,
        matched_goals: [],
        features_visited: [],
        blocked_features: []
      },
      classification: "onboarding_incomplete"
    },
    {}
  );

  const featureJourney = report.report.tested_journeys.find((item) => item.id === "journey_feature_exploration");
  assert.equal(featureJourney.status, "partial");
  assert.match(featureJourney.summary, /Feature exploration ran/);
});

test("buildRunQaReport marks onboarding_incomplete_with_feature_progress as a completed run with unfinished mission", () => {
  const report = buildRunQaReport(
    {
      run_id: "run_456",
      target_url: "https://example.com",
      success: true,
      notes: [],
      signup_submitted: true,
      urls_visited: ["https://example.com/app", "https://example.com/feature"],
      request_failures: [],
      validation_errors: [],
      artifacts: { screenshots: [] },
      signals: { otp_required: true, signed_in: true },
      otp: { verified: true },
      onboarding: { detected: true, completed: false, steps_completed: 4 },
      feature_exploration: {
        invoked: true,
        attempted: 2,
        discovered: 2,
        visited_count: 2,
        blocked_count: 0,
        interactions_completed: 6,
        matched_goal_count: 3,
        matched_goals: ["generate a video"],
        features_visited: [],
        blocked_features: []
      },
      mission_judgment: {
        attempted: true,
        completed: false,
        stop_reason: "llm_fail",
        final_reason: "Visible evidence shows the app area was reached, but no generated asset exists yet."
      },
      classification: "onboarding_incomplete_with_feature_progress"
    },
    {}
  );

  assert.equal(report.report.status, "completed");
  assert.match(report.report.summary.note, /captured a real customer blocker/i);
  const missionJourney = report.report.tested_journeys.find((item) => item.id === "journey_mission_validation");
  assert.equal(missionJourney.status, "blocked");
  const blockerFinding = report.report.findings.find((item) => item.id === "finding_mission_blocked_before_completion");
  assert.equal(blockerFinding.type, "confusion_point");
});

test("buildRunQaReport marks mission completion as completed even if heuristic classification is partial", () => {
  const report = buildRunQaReport(
    {
      run_id: "run_789",
      target_url: "https://example.com",
      success: false,
      notes: [],
      signup_submitted: true,
      urls_visited: ["https://example.com/app", "https://example.com/output"],
      request_failures: [],
      validation_errors: [],
      artifacts: { screenshots: [] },
      signals: { otp_required: true, signed_in: true },
      otp: { verified: true },
      onboarding: { detected: true, completed: false, steps_completed: 4 },
      feature_exploration: {
        invoked: true,
        attempted: 2,
        discovered: 2,
        visited_count: 2,
        blocked_count: 0,
        interactions_completed: 6,
        matched_goal_count: 3,
        matched_goals: ["generate a video"],
        features_visited: [],
        blocked_features: []
      },
      mission_judgment: {
        attempted: true,
        completed: true,
        final_reason: "A generated video output is visibly present in the product."
      },
      classification: "onboarding_incomplete_with_feature_progress"
    },
    {}
  );

  assert.equal(report.report.status, "completed");
  assert.match(report.report.summary.note, /generated video output/i);
});

test("buildRunQaReport keeps true runner failures as failed", () => {
  const report = buildRunQaReport(
    {
      run_id: "run_failed",
      target_url: "https://example.com",
      success: false,
      notes: [],
      signup_submitted: true,
      urls_visited: ["https://example.com"],
      request_failures: [],
      validation_errors: [],
      artifacts: { screenshots: [] },
      signals: { otp_required: false, signed_in: false },
      otp: { verified: false, code_submitted: false, wait_polls: 0 },
      onboarding: { detected: false, completed: false, attempted: false, steps_completed: 0 },
      feature_exploration: {
        invoked: false,
        attempted: 0,
        discovered: 0,
        visited_count: 0,
        blocked_count: 0,
        interactions_completed: 0,
        matched_goal_count: 0,
        matched_goals: [],
        features_visited: [],
        blocked_features: []
      },
      mission_judgment: {
        attempted: false,
        completed: false,
        stop_reason: "judge_error",
        final_reason: "Planner timeout"
      },
      classification: "run_failed_after_submit"
    },
    {}
  );

  assert.equal(report.report.status, "failed");
  assert.equal(report.report.metadata.run_execution.runner_failed, true);
});

test("looksCustomerJourneyAction recognizes customer-like product entry actions", () => {
  assert.equal(__private.looksCustomerJourneyAction("Open Speakeasy"), true);
  assert.equal(__private.looksCustomerJourneyAction("Open Personalized Videos"), true);
  assert.equal(__private.looksCustomerJourneyAction("Dismiss"), false);
});

test("buildPersonaContextValue carries real customer framing", () => {
  const personaProfile = __private.buildPersonaProfile(
    "First-time user learning the product. A skeptical buyer testing trust, clarity, and proof points before committing. semi technical marketer"
  );
  const context = __private.buildPersonaContextValue(personaProfile, [
    { original: "generate a video with speakeasy" }
  ]);

  assert.match(context, /marketing manager/i);
  assert.match(context, /generate a video with speakeasy/i);
  assert.match(context, /trust, clarity, and proof/i);
});

test("scoreCandidateAgainstPersona prefers customer CTA over settings navigation", () => {
  const personaProfile = __private.buildPersonaProfile(
    "First-time user learning the product. A skeptical buyer. semi technical marketer"
  );
  const ctaScore = __private.scoreCandidateAgainstPersona(
    {
      text: "Open Speakeasy",
      href: "https://app.bhuman.ai/speakeasy",
      section: "main"
    },
    personaProfile
  );
  const settingsScore = __private.scoreCandidateAgainstPersona(
    {
      text: "Settings",
      href: "https://app.bhuman.ai/settings",
      section: "nav"
    },
    personaProfile
  );

  assert.ok(ctaScore.score > settingsScore.score);
});

test("extractMissionActionIntent pulls primary label and context from freeform mission target", () => {
  const intent = __private.extractMissionActionIntent("Create button in Personalized Videos section");

  assert.equal(intent.primaryLabel, "Create");
  assert.ok(intent.contextHints.includes("Personalized Videos"));
});

test("scoreMissionActionCandidate prefers matching section context for generic create buttons", () => {
  const intent = __private.extractMissionActionIntent("Create button in Personalized Videos section");
  const matchingCandidate = __private.scoreMissionActionCandidate(
    {
      label: "Create",
      context: "Personalized Videos Create a new campaign for your audience",
      role: "button",
      tagName: "button"
    },
    intent
  );
  const unrelatedCandidate = __private.scoreMissionActionCandidate(
    {
      label: "Create",
      context: "Billing Settings Upgrade your plan",
      role: "button",
      tagName: "button"
    },
    intent
  );

  assert.ok(matchingCandidate > unrelatedCandidate);
});

test("runMissionJudgeLoop ignores configured round caps and continues until the judge says complete", async () => {
  const originalFetch = global.fetch;
  const decisions = [
    {
      complete: false,
      confidence: 0.42,
      reason: "Still gathering proof.",
      next_action: {
        action: "wait",
        amount: 1
      }
    },
    {
      complete: true,
      confidence: 0.94,
      reason: "A generated asset is visibly present.",
      completion_evidence: ["Generated asset card is visible in the app."],
      next_action: {
        action: "done"
      }
    }
  ];
  let fetchCallCount = 0;

  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      output_text: JSON.stringify(decisions[fetchCallCount++] || decisions[decisions.length - 1])
    })
  });

  const page = {
    screenshot: async () => Buffer.from("fake-png"),
    url: () => "https://app.example.com/workspace",
    locator: (selector) => {
      if (selector === "body") {
        return {
          innerText: async () => "Generated asset card"
        };
      }
      return {
        count: async () => 0
      };
    },
    waitForTimeout: async () => {},
    keyboard: {
      press: async () => {
        throw new Error("keyboard fallback should not be needed");
      }
    },
    evaluate: async () => {
      throw new Error("scroll fallback should not be needed");
    }
  };

  try {
    const result = await __private.runMissionJudgeLoop(page, [], null, {
      config: {
        goal: "Generate a personalized video",
        brandPersona: "Skeptical marketer",
        openAiApiKey: "test-openai-api-key",
        missionJudgeMaxRounds: 1
      }
    });

    assert.equal(fetchCallCount, 2);
    assert.equal(result.mission_judgment.completed, true);
    assert.equal(result.mission_judgment.rounds_attempted, 2);
    assert.equal(result.mission_judgment.stop_reason, "mission_completed");
    assert.match(result.mission_judgment.final_reason, /generated asset/i);
  } finally {
    global.fetch = originalFetch;
  }
});
