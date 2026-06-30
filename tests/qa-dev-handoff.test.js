const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { exportQaDevHandoff, __private } = require("../lib/qa-dev-handoff");

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "qa-dev-handoff-"));
}

test("exportQaDevHandoff creates redacted developer bundle with evidence and timelines", async () => {
  const tempDir = makeTempDir();
  const videoPath = path.join(tempDir, "source.webm");
  const blockerClipPath = path.join(tempDir, "blocker.mp4");
  fs.writeFileSync(videoPath, "fake video");
  fs.writeFileSync(blockerClipPath, "fake blocker");
  const screenshotDataUrl = `data:image/png;base64,${Buffer.from("fake png").toString("base64")}`;
  const finalScreenshotDataUrl = `data:image/png;base64,${Buffer.from("final fake png").toString("base64")}`;
  const artifactPath = path.join(tempDir, "sample_local_agent_full.json");
  fs.writeFileSync(
    artifactPath,
    JSON.stringify(
      {
        run_id: "run_secret_1",
        run_request: {
          run_id: "run_secret_1",
          target_url: "https://example.com/start?token=raw-token",
          brand_persona: "A skeptical buyer",
          metadata: {
            goal: "Reach onboarding",
            otp_inbox: {
              email: "qa@example.com",
              password: "raw-password",
              token: "raw-mail-token"
            }
          }
        },
        report: {
          status: "partial",
          summary: {
            note: "Blank screen after OTP"
          },
          findings: [
            {
              id: "finding-1",
              type: "dead_end",
              severity: "high",
              title: "Blank page after verification",
              page: { url: "https://example.com/app" },
              observed_behavior: "The page stayed blank.",
              expected_behavior: "Onboarding should appear.",
              repro_steps: ["Submit email", "Enter OTP", "Wait"],
              evidence: {
                screenshots: [screenshotDataUrl],
                videos: [videoPath],
                console_logs: ["[time] console.error :: localStorage token raw-token"],
                network_logs: ["[time] response GET https://api.example.com/fail?token=raw-token :: status=500"]
              }
            }
          ],
          evidence_gallery: {
            screenshots: [screenshotDataUrl],
            videos: [videoPath],
            console_logs: ["[time] console.error :: failure"],
            network_logs: ["[time] response GET https://api.example.com/fail?token=raw-token :: status=500"]
          }
        },
        artifacts: {
          captured_screenshots: [screenshotDataUrl, finalScreenshotDataUrl],
          local_video_path: videoPath,
          blocker_clip_path: blockerClipPath,
          live_stream_embed_url: "https://viewer.example.com/?password=raw-password",
          console_timeline: [
            {
              ts: "2026-06-30T10:00:00.000Z",
              level: "error",
              message: "Failed with Bearer abcdefghijklmnopqrstuvwxyz",
              url: "https://example.com/app?session=raw-session"
            }
          ],
          network_timeline: [
            {
              ts: "2026-06-30T10:00:01.000Z",
              phase: "response",
              method: "POST",
              url: "https://api.example.com/otp?token=raw-token",
              status: 500,
              duration_ms: 123,
              resource_type: "fetch"
            }
          ]
        },
        runLog: [
          {
            timestamp: "2026-06-30T10:00:00.000Z",
            event: "browser_console",
            details: {
              level: "error",
              message: "openrouter-secret-fixture-abcdefghijklmnopqrstuvwxyz",
              url: "https://example.com/app?auth=raw-auth"
            }
          },
          {
            timestamp: "2026-06-30T10:00:01.000Z",
            event: "browser_network",
            details: {
              phase: "failed",
              method: "GET",
              url: "https://api.example.com/broken?code=123456",
              error: "net::ERR_FAILED"
            }
          }
        ],
        markdown: "Report references openrouter-secret-fixture-abcdefghijklmnopqrstuvwxyz"
      },
      null,
      2
    )
  );

  const result = await exportQaDevHandoff({
    artifactPath,
    outputRoot: path.join(tempDir, "handoffs"),
    zip: false
  });

  assert.equal(result.consoleEventCount, 2);
  assert.equal(result.networkEventCount, 2);
  assert.equal(result.failedNetworkEventCount, 2);
  assert.equal(result.screenshotCount, 2);
  assert.equal(result.videoCount, 2);

  const readme = fs.readFileSync(path.join(result.bundleDir, "README.md"), "utf8");
  assert.match(readme, /Blank screen after OTP/);
  assert.match(readme, /Relevant First-Party Network Failures/);
  assert.match(readme, /Primary\/final screenshot: screenshots\/screenshot-002\.png/);

  const reportJson = fs.readFileSync(path.join(result.bundleDir, "report.json"), "utf8");
  assert.doesNotMatch(reportJson, /data:image/);
  assert.doesNotMatch(reportJson, /raw-token|raw-password|raw-mail-token|raw-session|raw-auth|openrouter-secret-fixture/);
  assert.match(reportJson, /\*\*\*REDACTED\*\*\*/);

  assert.equal(fs.existsSync(path.join(result.bundleDir, "screenshots", "screenshot-001.png")), true);
  assert.equal(fs.existsSync(path.join(result.bundleDir, "screenshots", "screenshot-002.png")), true);
  assert.equal(fs.existsSync(path.join(result.bundleDir, "videos", "video-001.webm")), true);
  assert.equal(fs.existsSync(path.join(result.bundleDir, "network-failures.jsonl")), true);
});

test("exportQaDevHandoff does not present third-party failures as the blocker cause", async () => {
  const tempDir = makeTempDir();
  const artifactPath = path.join(tempDir, "sample_local_agent_full.json");
  fs.writeFileSync(
    artifactPath,
    JSON.stringify({
      run_id: "run_third_party_noise",
      run_request: {
        run_id: "run_third_party_noise",
        target_url: "https://bhuman.ai/"
      },
      report: {
        status: "partial",
        summary: { note: "Blank white screen after OTP" },
        findings: [
          {
            id: "finding-1",
            type: "dead_end",
            severity: "high",
            title: "Blank white screen after successful OTP verification",
            page: { url: "https://app.bhuman.ai/" },
            observed_behavior: "The app stayed blank.",
            expected_behavior: "Onboarding should appear.",
            repro_steps: ["Enter OTP", "Wait"],
            evidence: { screenshots: [], videos: [] }
          }
        ],
        evidence_gallery: {}
      },
      artifacts: {
        network_timeline: [
          {
            ts: "2026-06-30T10:00:00.000Z",
            phase: "failed",
            method: "GET",
            url: "https://api.churnkey.co/v1/api/orgs/YOUR_APP_ID/passive/config",
            error: "net::ERR_ABORTED",
            page_url: "https://app.bhuman.ai/"
          }
        ]
      },
      runLog: [],
      markdown: ""
    })
  );

  const result = await exportQaDevHandoff({
    artifactPath,
    outputRoot: path.join(tempDir, "handoffs"),
    zip: false
  });
  const readme = fs.readFileSync(path.join(result.bundleDir, "README.md"), "utf8");

  assert.equal(result.failedNetworkEventCount, 1);
  assert.equal(result.relevantFailedNetworkEventCount, 0);
  assert.match(readme, /No first-party failed\/error requests were captured/);
  assert.match(readme, /Third-party or unrelated failures captured: 1/);
  assert.doesNotMatch(readme, /api\.churnkey\.co\/v1\/api/);
});

test("redactString scrubs sensitive URL parameters and bearer credentials", () => {
  const redacted = __private.redactString(
    "https://example.com/path?token=abc&safe=ok Authorization: Bearer abcdefghijklmnopqrstuvwxyz"
  );
  assert.match(redacted, /token=\*\*\*REDACTED\*\*\*/);
  assert.match(redacted, /safe=ok/);
  assert.doesNotMatch(redacted, /abcdefghijklmnopqrstuvwxyz/);
});

test("exportQaDevHandoff falls back to evidence gallery logs without raw telemetry", async () => {
  const tempDir = makeTempDir();
  const artifactPath = path.join(tempDir, "sample_local_agent_full.json");
  fs.writeFileSync(
    artifactPath,
    JSON.stringify({
      run_id: "run_gallery_only",
      run_request: { run_id: "run_gallery_only", target_url: "https://example.com/" },
      report: {
        status: "partial",
        summary: { note: "Gallery-only logs" },
        findings: [],
        evidence_gallery: {
          console_logs: ["[time] console.error :: gallery failure"],
          network_logs: ["[time] response GET https://api.example.com/fail :: status=500"]
        }
      },
      artifacts: {},
      runLog: [],
      markdown: ""
    })
  );

  const result = await exportQaDevHandoff({
    artifactPath,
    outputRoot: path.join(tempDir, "handoffs"),
    zip: false
  });

  assert.equal(result.consoleEventCount, 1);
  assert.equal(result.networkEventCount, 1);
  assert.equal(result.failedNetworkEventCount, 1);
});
