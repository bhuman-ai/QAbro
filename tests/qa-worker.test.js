const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

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

test("buildExecutionPlan keeps explicit browserbase requests on the browserbase runner", () => {
  const plan = __private.buildExecutionPlan(
    {
      metadata: {
        execution_engine: "browserbase"
      }
    },
    {
      BROWSERBASE_API_KEY: "browserbase-key",
      BROWSERBASE_PROJECT_ID: "project-id",
      OPENAI_API_KEY: "openai-key"
    }
  );

  assert.equal(plan.requestedEngine, "browserbase");
  assert.deepEqual(
    plan.attempts.map((attempt) => attempt.engine),
    ["browserbase"]
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

test("buildStoredExecutionPayload preserves portable evidence media for local screenshots", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-worker-evidence-"));
  const screenshotPath = path.join(tempDir, "proof.png");
  fs.writeFileSync(screenshotPath, Buffer.from("proof-image"));

  const payload = __private.buildStoredExecutionPayload(
    {
      status: "partial",
      findings: [
        {
          evidence: {
            screenshots: [screenshotPath]
          }
        }
      ]
    },
    "Report",
    {
      artifacts: {
        local_screenshots: [screenshotPath]
      },
      runLog: []
    }
  );

  assert.deepEqual(payload.evidenceMedia, {
    screenshots: [
      {
        source: screenshotPath.replaceAll("\\", "/"),
        content_type: "image/png",
        data_url: `data:image/png;base64,${Buffer.from("proof-image").toString("base64")}`
      }
    ]
  });
});

test("buildStoredExecutionPayload prefers storage-backed evidence media and cleaned artifacts", () => {
  const payload = __private.buildStoredExecutionPayload(
    {
      status: "partial",
      evidence_gallery: {
        videos: ["https://local.example/artifacts/proof.webm"]
      }
    },
    "Report",
    {
      artifacts: {
        local_video_path: "/tmp/proof.webm",
        local_video_url: "https://local.example/artifacts/proof.webm",
        local_run_dir: "/tmp/run-dir"
      },
      publishedArtifacts: {
        local_video_path: "/tmp/proof.webm",
        local_video_url: null,
        local_run_dir: null
      },
      evidenceMedia: {
        videos: [
          {
            source: "/tmp/proof.webm",
            aliases: ["https://local.example/artifacts/proof.webm"],
            content_type: "video/webm",
            storage_bucket: "qa-evidence",
            storage_path: "run_1/videos/proof.webm"
          }
        ]
      },
      runLog: []
    }
  );

  assert.deepEqual(payload.artifacts, {
    local_video_path: "/tmp/proof.webm",
    local_video_url: null,
    local_run_dir: null
  });
  assert.deepEqual(payload.evidenceMedia, {
    videos: [
      {
        source: "/tmp/proof.webm",
        aliases: ["https://local.example/artifacts/proof.webm"],
        content_type: "video/webm",
        storage_bucket: "qa-evidence",
        storage_path: "run_1/videos/proof.webm"
      }
    ]
  });
});

test("collectExecutionScreenshotEvidence and video evidence dedupe report and artifact sources", () => {
  const screenshots = __private.collectExecutionScreenshotEvidence(
    {
      evidence_gallery: {
        screenshots: ["https://cdn.example.com/gallery-1.png"]
      },
      findings: [
        {
          evidence: {
            screenshots: [
              "https://cdn.example.com/gallery-1.png",
              "https://cdn.example.com/finding-1.png"
            ],
            videos: ["https://cdn.example.com/finding-1.webm"]
          }
        }
      ],
      tested_journeys: [
        {
          evidence: {
            screenshots: ["https://cdn.example.com/journey-1.png"],
            videos: ["https://cdn.example.com/journey-1.webm"]
          }
        }
      ]
    },
    {
      artifacts: {
        local_screenshots: ["/tmp/failure-state.png", "https://cdn.example.com/finding-1.png"],
        captured_screenshots: ["/tmp/failure-state.png"],
        blocker_clip_path: "/tmp/blocker-clip.webm",
        local_video_path: "/tmp/run.webm"
      }
    }
  );
  const videos = __private.collectExecutionVideoEvidence(
    {
      evidence_gallery: {
        videos: ["https://cdn.example.com/gallery-1.webm"]
      },
      findings: [
        {
          evidence: {
            videos: ["https://cdn.example.com/finding-1.webm"]
          }
        }
      ],
      tested_journeys: [
        {
          evidence: {
            videos: ["https://cdn.example.com/journey-1.webm"]
          }
        }
      ]
    },
    {
      artifacts: {
        blocker_clip_path: "/tmp/blocker-clip.webm",
        local_video_path: "/tmp/run.webm"
      }
    }
  );

  assert.deepEqual(screenshots, [
    "https://cdn.example.com/gallery-1.png",
    "https://cdn.example.com/finding-1.png",
    "https://cdn.example.com/journey-1.png",
    "/tmp/failure-state.png"
  ]);
  assert.deepEqual(videos, [
    "https://cdn.example.com/gallery-1.webm",
    "https://cdn.example.com/finding-1.webm",
    "https://cdn.example.com/journey-1.webm",
    "/tmp/blocker-clip.webm",
    "/tmp/run.webm"
  ]);
});

test("assessExecutionEvidence fails thin proof and passes when screenshot and video minimums are met", () => {
  const thinAssessment = __private.assessExecutionEvidence(
    {
      evidence_gallery: {
        screenshots: ["https://cdn.example.com/gallery-1.png"]
      },
      findings: []
    },
    {
      artifacts: {}
    },
    {
      requiredScreenshots: 4,
      requiredVideos: 1
    }
  );

  assert.equal(thinAssessment.ok, false);
  assert.deepEqual(thinAssessment.missing, ["at least 4 screenshots", "at least 1 video artifact"]);

  const passingAssessment = __private.assessExecutionEvidence(
    {
      evidence_gallery: {
        screenshots: [
          "https://cdn.example.com/gallery-1.png",
          "https://cdn.example.com/gallery-2.png"
        ],
        videos: ["https://cdn.example.com/gallery-1.webm"]
      },
      findings: [
        {
          evidence: {
            screenshots: ["https://cdn.example.com/finding-1.png"]
          }
        }
      ]
    },
    {
      artifacts: {
        local_screenshots: ["/tmp/failure-state.png"]
      }
    },
    {
      requiredScreenshots: 4,
      requiredVideos: 1
    }
  );

  assert.equal(passingAssessment.ok, true);
  assert.equal(passingAssessment.screenshotCount, 4);
  assert.equal(passingAssessment.videoCount, 1);
  assert.deepEqual(passingAssessment.missing, []);
});
