const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isLikelyAuthEntryText,
  isLikelyAuthEntryHref,
  buildScenarioGoals,
  scoreCandidateAgainstGoals,
  classifyOutcome
} = require("../scripts/local-workolo-matrix");
const { resolveLocalRunConfig } = require("../lib/qa-local");

function withEnv(overrides, callback) {
  const keys = ["QA_LOCAL_HEADLESS", "QA_LIVE_STREAM_ENABLED", "DISPLAY"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      process.env[key] = overrides[key];
    } else {
      delete process.env[key];
    }
  }

  try {
    callback();
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

test("isLikelyAuthEntryText recognizes direct auth labels", () => {
  assert.equal(isLikelyAuthEntryText("Sign in"), true);
  assert.equal(isLikelyAuthEntryText("Create account"), true);
  assert.equal(isLikelyAuthEntryText("Start free trial"), true);
  assert.equal(isLikelyAuthEntryText("Book a demo"), false);
});

test("isLikelyAuthEntryHref recognizes auth-oriented destinations", () => {
  assert.equal(isLikelyAuthEntryHref("https://app.bhuman.ai/login"), true);
  assert.equal(isLikelyAuthEntryHref("/sign-up"), true);
  assert.equal(isLikelyAuthEntryHref("https://example.com/pricing"), false);
});

test("buildScenarioGoals keeps meaningful feature tokens", () => {
  const goals = buildScenarioGoals([
    "Create a video project and invite a teammate",
    "Review analytics for a campaign"
  ]);
  assert.equal(goals.length, 2);
  assert.deepEqual(goals[0].tokens, ["create", "video", "project", "invite", "teammate"]);
  assert.ok(goals[1].tokens.includes("analytics"));
});

test("scoreCandidateAgainstGoals boosts feature candidates that match scenario goals", () => {
  const goals = buildScenarioGoals(["Create a video project and invite a teammate"]);
  const matched = scoreCandidateAgainstGoals(
    { text: "Projects", href: "https://app.example.com/projects/new" },
    goals
  );
  const unmatched = scoreCandidateAgainstGoals(
    { text: "Billing", href: "https://app.example.com/billing" },
    goals
  );

  assert.ok(matched.score > unmatched.score);
  assert.deepEqual(matched.matchedGoals, ["Create a video project and invite a teammate"]);
});

test("classifyOutcome treats onboarding without feature usage as partial progress", () => {
  assert.equal(
    classifyOutcome({
      captchaDetected: false,
      otpRequired: true,
      otpAttempted: true,
      otpVerified: true,
      emailVerificationPrompt: false,
      signedInSignal: true,
      onboardingDetected: true,
      onboardingCompleted: false,
      featureVisitedCount: 0,
      validationErrors: [],
      submitClicked: true,
      authStillVisible: false
    }),
    "onboarding_incomplete"
  );

  assert.equal(
    classifyOutcome({
      captchaDetected: false,
      otpRequired: true,
      otpAttempted: true,
      otpVerified: true,
      emailVerificationPrompt: false,
      signedInSignal: true,
      onboardingDetected: false,
      onboardingCompleted: false,
      featureVisitedCount: 2,
      validationErrors: [],
      submitClicked: true,
      authStillVisible: false
    }),
    "feature_goals_exercised_after_otp"
  );
});

test("resolveLocalRunConfig passes scenario_list into local runner config", () => {
  const config = resolveLocalRunConfig({
    target_url: "https://example.com",
    scenario_list: ["Create project", "Invite teammate"],
    metadata: {
      goal: "Create a project and invite a teammate"
    }
  });

  assert.deepEqual(config.scenarioList, ["Create project", "Invite teammate"]);
  assert.equal(config.goal, "Create a project and invite a teammate");
});

test("resolveLocalRunConfig defaults to headful when live stream is enabled", () => {
  withEnv(
    {
      QA_LIVE_STREAM_ENABLED: "true"
    },
    () => {
      const config = resolveLocalRunConfig({
        target_url: "https://example.com",
        metadata: {}
      });

      assert.equal(config.headless, false);
    }
  );
});

test("resolveLocalRunConfig honors explicit headless override even when live stream is enabled", () => {
  withEnv(
    {
      QA_LIVE_STREAM_ENABLED: "true"
    },
    () => {
      const config = resolveLocalRunConfig({
        target_url: "https://example.com",
        metadata: {
          headless: true
        }
      });

      assert.equal(config.headless, true);
    }
  );
});
