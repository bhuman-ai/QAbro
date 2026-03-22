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

