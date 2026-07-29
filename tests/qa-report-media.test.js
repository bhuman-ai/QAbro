const test = require("node:test");
const assert = require("node:assert/strict");

const { buildQaEvidenceManifest } = require("../lib/qa-report-media");

test("evidence manifest selects the full stored recording instead of a blocker clip", () => {
  const blocker = "/opt/qabro/output/run/video/page-blocker.mp4";
  const full = "/opt/qabro/output/run/video/page.webm";
  const manifest = buildQaEvidenceManifest(
    {
      run_id: "run_media_1",
      evidence_gallery: {
        videos: [blocker, full]
      }
    },
    {
      artifacts: {
        local_video_path: full
      },
      evidence_media: {
        videos: [
          {
            source: blocker,
            content_type: "video/mp4",
            storage_bucket: "qa-evidence",
            storage_path: "run_media_1/videos/blocker.mp4",
            byte_length: 32000
          },
          {
            source: full,
            content_type: "video/webm",
            storage_bucket: "qa-evidence",
            storage_path: "run_media_1/videos/full.webm",
            byte_length: 9000000
          }
        ]
      }
    },
    {
      runId: "run_media_1",
      shareKey: "share_test"
    }
  );

  assert.equal(manifest.videos.length, 2);
  assert.equal(manifest.recording.index, 1);
  assert.equal(manifest.recording.content_type, "video/webm");
  assert.equal(manifest.recording.byte_length, 9000000);
  assert.match(manifest.recording.url, /kind=video/);
  assert.match(manifest.recording.url, /index=1/);
  assert.match(manifest.recording.url, /share_key=share_test/);
  assert.doesNotMatch(JSON.stringify(manifest), /storage_path|storage_bucket|\/opt\/qabro/);
});

test("evidence manifest omits local files that were never published", () => {
  const manifest = buildQaEvidenceManifest(
    {
      run_id: "run_media_missing",
      evidence_gallery: {
        videos: ["/opt/qabro/output/run/video/page.webm"]
      }
    },
    {},
    {
      runId: "run_media_missing"
    }
  );

  assert.equal(manifest.recording, null);
  assert.deepEqual(manifest.videos, []);
});
