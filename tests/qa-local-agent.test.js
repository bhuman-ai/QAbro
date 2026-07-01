const test = require("node:test");
const assert = require("node:assert/strict");

const { __private } = require("../lib/qa-local-agent");

test("buildArtifactPublicUrl maps output paths to public artifact URLs", () => {
  assert.equal(
    __private.buildArtifactPublicUrl(
      "/opt/qabro/output/playwright/dashboard_agent_run_123/video/recording.webm",
      "https://161.35.53.130.sslip.io"
    ),
    "https://161.35.53.130.sslip.io/artifacts/playwright/dashboard_agent_run_123/video/recording.webm"
  );
});

test("resolveBlockerClipAnchorMs prefers the exact failure event", () => {
  const anchorMs = __private.resolveBlockerClipAnchorMs(
    [
      {
        timestamp: "2026-03-22T17:21:42.320Z",
        event: "local_agent_started"
      },
      {
        timestamp: "2026-03-22T17:21:44.408Z",
        event: "auth_flow_started"
      },
      {
        timestamp: "2026-03-22T17:21:51.100Z",
        event: "auth_flow_failed"
      },
      {
        timestamp: "2026-03-22T17:22:04.200Z",
        event: "local_agent_failed"
      }
    ],
    "2026-03-22T17:21:42.320Z",
    "2026-03-22T17:22:04.252Z"
  );

  assert.equal(anchorMs, Date.parse("2026-03-22T17:21:51.100Z"));
});

test("shouldCompleteAfterAuthSuccess honors auth-only customer success conditions", () => {
  assert.equal(
    __private.shouldCompleteAfterAuthSuccess(
      {
        scenario_list: [
          "Start at the signup page.",
          "Create a brand new account; do not reuse an existing signed-in session.",
          "Fill every visible required field, including phone.",
          "Use Testpass1! in both the password and confirm password fields.",
          "Only count success if signup reaches OTP verification or the authenticated dashboard."
        ],
        metadata: {
          auth_policy: "signup_if_needed",
          new_account_required: true
        }
      },
      {
        success: true,
        autoCreatedAccount: true,
        otpMode: "provider_hook"
      }
    ),
    true
  );
});

test("shouldCompleteAfterAuthSuccess keeps testing when customer asks for a post-login action", () => {
  assert.equal(
    __private.shouldCompleteAfterAuthSuccess(
      {
        scenario_list: [
          "Create an account and make one generated AI video.",
          "Only count success if the final video result page is reached."
        ],
        metadata: {
          auth_policy: "signup_if_needed",
          new_account_required: true
        }
      },
      {
        success: true,
        autoCreatedAccount: true,
        otpMode: "provider_hook"
      }
    ),
    false
  );
});

test("buildAuthSuccessCandidateReport returns completed proof report", () => {
  const report = __private.buildAuthSuccessCandidateReport(
    {
      run_id: "run_signup_success",
      target_url: "https://databoss.us/customer/register"
    },
    {
      success: true,
      autoCreatedAccount: true,
      otpMode: "provider_hook"
    },
    "https://databoss.us/customer/dashboard",
    {
      local_screenshots: ["/tmp/auth-form-filled.png", "/tmp/auth-otp-gate.png", "/tmp/auth-flow-completed.png"],
      local_video_path: "/tmp/run.webm"
    }
  );

  assert.equal(report.status, "completed");
  assert.equal(report.findings.length, 0);
  assert.equal(report.tested_journeys[0].status, "completed");
  assert.deepEqual(report.evidence_gallery.screenshots, [
    "/tmp/auth-form-filled.png",
    "/tmp/auth-otp-gate.png",
    "/tmp/auth-flow-completed.png"
  ]);
  assert.equal(report.metadata.auth_success_satisfied_customer_objective, true);
});
