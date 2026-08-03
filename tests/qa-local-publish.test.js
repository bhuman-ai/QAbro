const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { __private } = require("../lib/qa-local-publish");

test("buildEmbeddedEvidenceMedia inlines bounded local screenshots for publication", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-local-publish-"));
  const screenshotPath = path.join(tempDir, "proof.png");
  const oversizedPath = path.join(tempDir, "oversized.png");
  fs.writeFileSync(screenshotPath, Buffer.from("proof-image"));
  fs.writeFileSync(oversizedPath, Buffer.alloc(70 * 1024, 1));

  const evidenceMedia = __private.buildEmbeddedEvidenceMedia(
    {
      findings: [
        {
          evidence: {
            screenshots: [screenshotPath, screenshotPath]
          }
        }
      ]
    },
    {
      local_screenshots: [oversizedPath]
    },
    {
      maxScreenshots: 4,
      maxBytes: 65 * 1024
    }
  );

  assert.deepEqual(evidenceMedia, {
    screenshots: [
      {
        source: screenshotPath.replaceAll("\\", "/"),
        content_type: "image/png",
        data_url: `data:image/png;base64,${Buffer.from("proof-image").toString("base64")}`
      }
    ]
  });
});

test("buildEmbeddedEvidenceMedia inlines normal browser screenshots by default", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-local-publish-default-size-"));
  const screenshotPath = path.join(tempDir, "browser-proof.png");
  fs.writeFileSync(screenshotPath, Buffer.alloc(440 * 1024, 3));

  const evidenceMedia = __private.buildEmbeddedEvidenceMedia(
    {
      evidence_gallery: {
        screenshots: [screenshotPath]
      }
    },
    {}
  );

  assert.equal(evidenceMedia?.screenshots?.length, 1);
  assert.equal(evidenceMedia.screenshots[0].source, screenshotPath.replaceAll("\\", "/"));
  assert.equal(evidenceMedia.screenshots[0].content_type, "image/png");
  assert.match(evidenceMedia.screenshots[0].data_url, /^data:image\/png;base64,/);
});

test("buildEmbeddedEvidenceMedia inlines bounded local videos for publication", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-local-publish-video-"));
  const videoPath = path.join(tempDir, "proof.webm");
  const oversizedVideoPath = path.join(tempDir, "oversized.webm");
  fs.writeFileSync(videoPath, Buffer.from("proof-video"));
  fs.writeFileSync(oversizedVideoPath, Buffer.alloc(4 * 1024 * 1024, 2));

  const evidenceMedia = __private.buildEmbeddedEvidenceMedia(
    {
      evidence_gallery: {
        videos: [videoPath]
      }
    },
    {
      video: oversizedVideoPath
    },
    {
      maxVideos: 2,
      maxVideoBytes: 3 * 1024 * 1024
    }
  );

  assert.deepEqual(evidenceMedia, {
    videos: [
      {
        source: videoPath.replaceAll("\\", "/"),
        content_type: "video/webm",
        data_url: `data:video/webm;base64,${Buffer.from("proof-video").toString("base64")}`
      }
    ]
  });
});

test("buildEmbeddedEvidenceMedia prioritizes journey preview screenshots before gallery overflow", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-local-publish-priority-"));
  const galleryShots = Array.from({ length: 10 }, (_, index) => path.join(tempDir, `gallery-${index + 1}.png`));
  const journeyShot = path.join(tempDir, "journey-proof.png");

  for (const shot of [...galleryShots, journeyShot]) {
    fs.writeFileSync(shot, Buffer.from(path.basename(shot)));
  }

  const evidenceMedia = __private.buildEmbeddedEvidenceMedia(
    {
      evidence_gallery: {
        screenshots: galleryShots
      },
      tested_journeys: [
        {
          evidence: {
            screenshots: [journeyShot]
          }
        }
      ]
    },
    {},
    {
      maxScreenshots: 3,
      maxBytes: 65 * 1024
    }
  );

  assert.deepEqual(
    evidenceMedia?.screenshots?.map((entry) => entry.source),
    [
      journeyShot.replaceAll("\\", "/"),
      galleryShots[0].replaceAll("\\", "/"),
      galleryShots[1].replaceAll("\\", "/")
    ]
  );
});

test("buildEmbeddedEvidenceMedia allows inline videos to be disabled", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-local-publish-no-video-"));
  const screenshotPath = path.join(tempDir, "proof.png");
  const videoPath = path.join(tempDir, "proof.webm");
  fs.writeFileSync(screenshotPath, Buffer.from("proof-image"));
  fs.writeFileSync(videoPath, Buffer.from("proof-video"));

  const evidenceMedia = __private.buildEmbeddedEvidenceMedia(
    {
      evidence_gallery: {
        screenshots: [screenshotPath],
        videos: [videoPath]
      }
    },
    {},
    {
      maxScreenshots: 1,
      maxVideos: 0,
      maxBytes: 65 * 1024
    }
  );

  assert.deepEqual(
    evidenceMedia,
    {
      screenshots: [
        {
          source: screenshotPath.replaceAll("\\", "/"),
          content_type: "image/png",
          data_url: `data:image/png;base64,${Buffer.from("proof-image").toString("base64")}`
        }
      ]
    }
  );
});

test("buildPortableEvidenceMedia uploads proof assets to storage when configured", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-local-publish-storage-"));
  const screenshotPath = path.join(tempDir, "proof.png");
  fs.writeFileSync(screenshotPath, Buffer.from("proof-image"));
  const fetchCalls = [];

  const evidenceMedia = await __private.buildPortableEvidenceMedia(
    {
      tested_journeys: [
        {
          evidence: {
            screenshots: [screenshotPath]
          }
        }
      ]
    },
    {},
    {
      runId: "run_storage",
      maxScreenshots: 1,
      maxVideos: 0,
      supabaseUrl: "https://supabase.example",
      serviceKey: "service-key",
      fetchImpl: async (url, init = {}) => {
        fetchCalls.push({ url, method: init.method || "GET" });
        const isVerificationRead = !init.method && url.includes("/storage/v1/object/");
        return {
          ok: true,
          status: 200,
          headers: {
            get(name) {
              if (isVerificationRead && String(name).toLowerCase() === "content-length") {
                return String(Buffer.byteLength("proof-image"));
              }
              return "";
            }
          },
          async arrayBuffer() {
            return Buffer.from("proof-image");
          },
          async json() {
            return {};
          }
        };
      }
    }
  );

  assert.equal(fetchCalls.length, 3);
  assert.match(fetchCalls[0].url, /storage\/v1\/bucket$/);
  assert.match(fetchCalls[1].url, /storage\/v1\/object\/qa-evidence\/run_storage\/screenshots\//);
  assert.equal(fetchCalls[2].method, "GET");
  assert.deepEqual(
    evidenceMedia,
    {
      screenshots: [
        {
          source: screenshotPath.replaceAll("\\", "/"),
          content_type: "image/png",
          storage_bucket: "qa-evidence",
          storage_path: evidenceMedia.screenshots[0].storage_path,
          byte_length: Buffer.byteLength("proof-image")
        }
      ]
    }
  );
});

test("buildPortableEvidenceMedia includes local video URL aliases for storage-backed videos", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-local-publish-video-storage-"));
  const videoPath = path.join(tempDir, "proof.webm");
  fs.writeFileSync(videoPath, Buffer.from("proof-video"));

  const evidenceMedia = await __private.buildPortableEvidenceMedia(
    {
      evidence_gallery: {
        videos: ["https://local.example/artifacts/proof.webm"]
      }
    },
    {
      local_video_path: videoPath,
      local_video_url: "https://local.example/artifacts/proof.webm"
    },
    {
      runId: "run_storage_video",
      maxScreenshots: 0,
      maxVideos: 1,
      supabaseUrl: "https://supabase.example",
      serviceKey: "service-key",
      fetchImpl: async (_url, init = {}) => ({
        ok: true,
        status: 200,
        headers: {
          get(name) {
            if (!init.method && String(name).toLowerCase() === "content-length") {
              return String(Buffer.byteLength("proof-video"));
            }
            return "";
          }
        },
        async arrayBuffer() {
          return Buffer.from("proof-video");
        },
        async json() {
          return {};
        }
      })
    }
  );

  assert.deepEqual(evidenceMedia, {
    videos: [
      {
        source: videoPath.replaceAll("\\", "/"),
        content_type: "video/webm",
        aliases: ["https://local.example/artifacts/proof.webm"],
        storage_bucket: "qa-evidence",
        storage_path: evidenceMedia.videos[0].storage_path,
        byte_length: Buffer.byteLength("proof-video")
      }
    ]
  });
});

test("buildPortableEvidenceMedia stores videos larger than the former 25 MB cutoff", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-local-publish-large-video-"));
  const videoPath = path.join(tempDir, "large-proof.webm");
  const videoBytes = 26 * 1024 * 1024;
  fs.writeFileSync(videoPath, Buffer.alloc(0));
  fs.truncateSync(videoPath, videoBytes);
  let resumableUpload = null;

  const evidenceMedia = await __private.buildPortableEvidenceMedia(
    {
      evidence_gallery: {
        videos: [videoPath]
      }
    },
    {
      local_video_path: videoPath
    },
    {
      runId: "run_large_video",
      maxScreenshots: 0,
      maxVideos: 1,
      supabaseUrl: "https://large-video.supabase.example",
      serviceKey: "service-key",
      resumableThresholdBytes: 1024,
      async resumableUpload(input) {
        resumableUpload = input;
      },
      fetchImpl: async (_url, init = {}) => ({
        ok: true,
        status: init.method === "POST" ? 200 : 206,
        headers: {
          get(name) {
            return String(name).toLowerCase() === "content-range"
              ? `bytes 0-31/${videoBytes}`
              : "";
          }
        },
        async arrayBuffer() {
          return Buffer.alloc(32);
        },
        async json() {
          return {};
        }
      })
    }
  );

  assert.equal(resumableUpload.byteLength, videoBytes);
  assert.equal(evidenceMedia.videos.length, 1);
  assert.equal(evidenceMedia.videos[0].byte_length, videoBytes);
  assert.equal(evidenceMedia.upload_errors, undefined);
});

test("buildPortableEvidenceMedia splits recordings above the storage cap into ordered playable parts", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-local-publish-segmented-video-"));
  const videoPath = path.join(tempDir, "full-recording.webm");
  const partOne = path.join(tempDir, "full-recording-part-001.webm");
  const partTwo = path.join(tempDir, "full-recording-part-002.webm");
  fs.writeFileSync(videoPath, Buffer.alloc(0));
  fs.truncateSync(videoPath, 80 * 1024 * 1024);
  fs.writeFileSync(partOne, Buffer.from("playable-part-one"));
  fs.writeFileSync(partTwo, Buffer.from("playable-part-two"));
  const uploadedPaths = [];
  let cleaned = false;

  const evidenceMedia = await __private.buildPortableEvidenceMedia(
    {
      evidence_gallery: {
        videos: [videoPath]
      }
    },
    {
      local_video_path: videoPath
    },
    {
      runId: "run_segmented_video",
      maxScreenshots: 0,
      maxVideos: 1,
      videoSegmentBytes: 40 * 1024 * 1024,
      supabaseUrl: "https://segmented-video.supabase.example",
      serviceKey: "service-key",
      async segmentVideo(candidate) {
        assert.equal(candidate, videoPath);
        return {
          segmented: true,
          parts: [
            { path: partOne, byte_length: fs.statSync(partOne).size },
            { path: partTwo, byte_length: fs.statSync(partTwo).size }
          ],
          cleanup() {
            cleaned = true;
          }
        };
      },
      async uploadLocalFile(candidate) {
        uploadedPaths.push(candidate);
        return {
          storage_bucket: "qa-evidence",
          storage_path: `run_segmented_video/videos/${path.basename(candidate)}`,
          byte_length: fs.statSync(candidate).size
        };
      }
    }
  );

  assert.deepEqual(uploadedPaths, [partOne, partTwo]);
  assert.equal(cleaned, true);
  assert.equal(evidenceMedia.videos.length, 2);
  assert.equal(evidenceMedia.videos[0].source, videoPath.replaceAll("\\", "/"));
  assert.deepEqual(evidenceMedia.videos[0].aliases, [partOne.replaceAll("\\", "/")]);
  assert.equal(evidenceMedia.videos[0].segment_index, 0);
  assert.equal(evidenceMedia.videos[0].segment_count, 2);
  assert.equal(evidenceMedia.videos[1].source, partTwo.replaceAll("\\", "/"));
  assert.equal(evidenceMedia.videos[1].segment_index, 1);
  assert.equal(evidenceMedia.videos[1].segment_label, "Part 2 of 2");
  assert.equal(evidenceMedia.upload_errors, undefined);
});

test("cleanupPublishedLocalArtifacts removes local run directories after storage upload", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-local-publish-cleanup-"));
  const screenshotPath = path.join(tempDir, "proof.png");
  const videoPath = path.join(tempDir, "proof.webm");
  const reportPath = path.join(tempDir, "report.json");
  fs.writeFileSync(screenshotPath, Buffer.from("proof-image"));
  fs.writeFileSync(videoPath, Buffer.from("proof-video"));
  fs.writeFileSync(reportPath, "{}");

  const cleanup = __private.cleanupPublishedLocalArtifacts(
    {
      findings: [
        {
          evidence: {
            screenshots: [screenshotPath]
          }
        }
      ],
      evidence_gallery: {
        videos: [videoPath]
      }
    },
    {
      local_run_dir: tempDir,
      local_screenshots: [screenshotPath],
      local_video_path: videoPath,
      local_qa_report_json: reportPath
    },
    {
      screenshots: [
        {
          source: screenshotPath,
          storage_bucket: "qa-evidence",
          storage_path: "run_1/screenshots/proof.png"
        }
      ],
      videos: [
        {
          source: videoPath,
          storage_bucket: "qa-evidence",
          storage_path: "run_1/videos/proof.webm"
        }
      ]
    }
  );

  assert.equal(cleanup.ok, true);
  assert.equal(cleanup.skipped, false);
  assert.equal(fs.existsSync(tempDir), false);
});

test("portable evidence coverage fails when a captured recording was not stored", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-local-publish-coverage-"));
  const screenshotPath = path.join(tempDir, "proof.png");
  const videoPath = path.join(tempDir, "full.webm");
  fs.writeFileSync(screenshotPath, Buffer.from("proof-image"));
  fs.writeFileSync(videoPath, Buffer.from("proof-video"));

  const coverage = __private.assessPortableEvidenceCoverage(
    {
      evidence_gallery: {
        screenshots: [screenshotPath],
        videos: [videoPath]
      }
    },
    {},
    {
      screenshots: [
        {
          source: screenshotPath,
          storage_bucket: "qa-evidence",
          storage_path: "run_coverage/screenshots/proof.png"
        }
      ]
    }
  );

  assert.equal(coverage.ok, false);
  assert.equal(coverage.required_count, 2);
  assert.equal(coverage.portable_count, 1);
  assert.deepEqual(coverage.missing_video_sources, [videoPath.replaceAll("\\", "/")]);
});

test("attachStepVideoClipsToReport derives and stores real step clip refs", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-local-step-clips-"));
  const masterVideoPath = path.join(tempDir, "full.webm");
  fs.writeFileSync(masterVideoPath, Buffer.from("master-video"));
  const clipCalls = [];

  const reportWithClips = await __private.attachStepVideoClipsToReport(
    {
      run_id: "run_step_clips",
      findings: [
        {
          id: "finding_generate_presenter_stalled",
          journey_id: "journey_generated_video",
          diagnostic_details: {
            attempted_actions: [
              { step: 1, action: "click", target: "Start Free", outcome: "advanced" },
              { step: 2, action: "click", target: "Sign in", outcome: "advanced" }
            ]
          }
        }
      ],
      tested_journeys: [
        {
          id: "journey_generated_video",
          name: "Generated video",
          steps: ["click: Start Free", "click: Sign in"],
          evidence: {
            videos: [masterVideoPath]
          }
        }
      ],
      experience_timeline: {
        video_duration_ms: 150000,
        spans: [
          {
            id: "span_steps",
            start_ms: 48000,
            end_ms: 73000,
            linked_finding_ids: ["finding_generate_presenter_stalled"],
            evidence: {
              action_steps: [1, 2]
            }
          }
        ]
      }
    },
    {
      local_video_path: masterVideoPath
    },
    {
      probeVideoDurationSecondsImpl: async () => 150,
      createStepVideoClipImpl: async (_videoPath, options = {}) => {
        clipCalls.push({ startMs: options.startMs, endMs: options.endMs, outputPath: options.outputPath });
        return { path: options.outputPath };
      }
    }
  );

  assert.equal(clipCalls.length, 2);
  assert.match(clipCalls[0].outputPath, /step-clips\/run-step-clips-journey-generated-video-finding-generate-presenter-stalled-step-01\.mp4$/);
  assert.match(clipCalls[1].outputPath, /step-clips\/run-step-clips-journey-generated-video-finding-generate-presenter-stalled-step-02\.mp4$/);
  assert.ok(clipCalls[0].startMs >= 48000);
  assert.ok(clipCalls[1].endMs <= 150000);
  assert.equal(reportWithClips.tested_journeys[0].step_video_clips.length, 2);
  assert.equal(reportWithClips.tested_journeys[0].step_video_clips[0].step, 1);
  assert.equal(reportWithClips.tested_journeys[0].step_video_clips[0].finding_id, "finding_generate_presenter_stalled");
  assert.match(reportWithClips.tested_journeys[0].step_video_clips[0].video, /step-01\.mp4$/);
});

test("attachStepVideoClipsToReport keeps an exact clip mapping for every finding", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-local-finding-clips-"));
  const masterVideoPath = path.join(tempDir, "full.webm");
  fs.writeFileSync(masterVideoPath, Buffer.from("master-video"));

  const reportWithClips = await __private.attachStepVideoClipsToReport(
    {
      run_id: "run_finding_clips",
      findings: [
        {
          id: "finding_bug",
          type: "bug",
          title: "Checkout button failed",
          journey_id: "journey_checkout",
          diagnostic_details: {
            attempted_actions: [{ step: 1, action: "click", target: "Checkout", outcome: "blocked" }]
          }
        },
        {
          id: "finding_aha",
          type: "aha_moment",
          title: "Price became clear",
          journey_id: "journey_checkout",
          diagnostic_details: {
            attempted_actions: [{ step: 1, action: "inspect", target: "Price", outcome: "understood" }]
          }
        }
      ],
      tested_journeys: [{ id: "journey_checkout", pages: ["https://example.com/checkout"] }],
      experience_timeline: {
        video_duration_ms: 30000,
        spans: [
          { start_ms: 5000, end_ms: 10000, level: "blocker", linked_finding_ids: ["finding_bug"], evidence: { action_steps: [1] } },
          { start_ms: 18000, end_ms: 23000, level: "good", linked_finding_ids: ["finding_aha"], evidence: { action_steps: [1] } }
        ]
      }
    },
    { local_video_path: masterVideoPath },
    {
      probeVideoDurationSecondsImpl: async () => 30,
      createStepVideoClipImpl: async (_videoPath, options = {}) => ({ path: options.outputPath })
    }
  );

  const clips = reportWithClips.tested_journeys[0].step_video_clips;
  assert.equal(clips.length, 2);
  assert.deepEqual(clips.map((clip) => clip.finding_id), ["finding_bug", "finding_aha"]);
  assert.deepEqual(clips.map((clip) => clip.level), ["blocker", "good"]);
});
