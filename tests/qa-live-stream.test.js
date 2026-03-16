const test = require("node:test");
const assert = require("node:assert/strict");

const STREAM_ENV_KEYS = [
  "QA_LIVE_STREAM_ENABLED",
  "QA_LIVE_STREAM_PUBLIC_BASE_URL",
  "QA_LIVE_STREAM_PASSWORD"
];

function withEnv(overrides, callback) {
  const previous = Object.fromEntries(STREAM_ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of STREAM_ENV_KEYS) {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      process.env[key] = overrides[key];
    } else {
      delete process.env[key];
    }
  }

  try {
    callback();
  } finally {
    for (const key of STREAM_ENV_KEYS) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

test("buildLiveStreamArtifacts returns empty object when disabled", () => {
  withEnv({}, () => {
    delete require.cache[require.resolve("../lib/qa-live-stream")];
    const { buildLiveStreamArtifacts } = require("../lib/qa-live-stream");
    assert.deepEqual(buildLiveStreamArtifacts({}), {});
  });
});

test("buildLiveStreamArtifacts builds noVNC urls from env", () => {
  withEnv(
    {
      QA_LIVE_STREAM_ENABLED: "true",
      QA_LIVE_STREAM_PUBLIC_BASE_URL: "https://161.35.53.130.sslip.io/",
      QA_LIVE_STREAM_PASSWORD: "secret-pass"
    },
    () => {
      delete require.cache[require.resolve("../lib/qa-live-stream")];
      const { buildLiveStreamArtifacts } = require("../lib/qa-live-stream");
      const result = buildLiveStreamArtifacts({});

      assert.equal(result.live_stream_enabled, true);
      assert.equal(result.live_stream_mode, "novnc");
      assert.equal(result.live_stream_public_base_url, "https://161.35.53.130.sslip.io");
      assert.match(result.live_stream_embed_url, /^https:\/\/161\.35\.53\.130\.sslip\.io\/vnc\.html\?/);
      assert.match(result.live_stream_embed_url, /password=secret-pass/);
      assert.match(result.live_stream_embed_url, /view_only=1/);
      assert.match(result.live_stream_viewer_url, /resize=remote/);
      assert.match(result.live_stream_viewer_url, /view_only=0/);
    }
  );
});

test("buildLiveStreamArtifacts replaces stale stored noVNC urls with current env values", () => {
  withEnv(
    {
      QA_LIVE_STREAM_ENABLED: "true",
      QA_LIVE_STREAM_PUBLIC_BASE_URL: "https://161.35.53.130.sslip.io/",
      QA_LIVE_STREAM_PASSWORD: "fresh-pass"
    },
    () => {
      delete require.cache[require.resolve("../lib/qa-live-stream")];
      const { buildLiveStreamArtifacts } = require("../lib/qa-live-stream");
      const result = buildLiveStreamArtifacts({
        live_stream_enabled: true,
        live_stream_public_base_url: "https://161.35.53.130.sslip.io",
        live_stream_embed_url:
          "https://161.35.53.130.sslip.io/vnc.html?autoconnect=1&password=stale-pass&path=websockify",
        live_stream_viewer_url:
          "https://161.35.53.130.sslip.io/vnc.html?autoconnect=1&password=stale-pass&resize=remote&path=websockify"
      });

      assert.match(result.live_stream_embed_url, /password=fresh-pass/);
      assert.doesNotMatch(result.live_stream_embed_url, /stale-pass/);
      assert.match(result.live_stream_viewer_url, /password=fresh-pass/);
      assert.doesNotMatch(result.live_stream_viewer_url, /stale-pass/);
    }
  );
});
