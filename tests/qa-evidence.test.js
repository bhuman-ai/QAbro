const test = require("node:test");
const assert = require("node:assert/strict");

const evidenceHandler = require("../api/qa/evidence");
const { ensureEvidenceStorageBucket } = require("../lib/qa-evidence-storage");

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    }
  };
}

async function withEnv(overrides, callback) {
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined || value === null) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  }

  try {
    return await callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("readEmbeddedEvidenceSource resolves inline screenshot data for matching local paths", () => {
  const dataUrl = evidenceHandler.__private.readEmbeddedEvidenceSource(
    {
      evidence_media: {
        screenshots: [
          {
            source: "C:\\tmp\\proof.png",
            data_url: "data:image/png;base64,abc"
          }
        ]
      }
    },
    "screenshot",
    "C:/tmp/proof.png"
  );

  assert.equal(dataUrl, "data:image/png;base64,abc");
});

test("readEmbeddedEvidenceSource resolves inline video data for matching local paths", () => {
  const dataUrl = evidenceHandler.__private.readEmbeddedEvidenceSource(
    {
      evidence_media: {
        videos: [
          {
            source: "/tmp/proof.webm",
            data_url: "data:video/webm;base64,xyz"
          }
        ]
      }
    },
    "video",
    "/tmp/proof.webm"
  );

  assert.equal(dataUrl, "data:video/webm;base64,xyz");
  assert.equal(evidenceHandler.__private.getEmbeddedEvidenceMaxLength("video"), 8000000);
});

test("readEvidenceMediaEntry resolves storage-backed media metadata for matching local paths", () => {
  const entry = evidenceHandler.__private.readEvidenceMediaEntry(
    {
      evidence_media: {
        screenshots: [
          {
            source: "/tmp/proof.png",
            storage_bucket: "qa-evidence",
            storage_path: "run_1/screenshots/proof.png",
            content_type: "image/png"
          }
        ]
      }
    },
    "screenshot",
    "/tmp/proof.png"
  );

  assert.deepEqual(entry, {
    source: "/tmp/proof.png",
    content_type: "image/png",
    data_url: "",
    storage_bucket: "qa-evidence",
    storage_path: "run_1/screenshots/proof.png"
  });
});

test("readEvidenceMediaEntry resolves storage-backed media metadata for matching aliases", () => {
  const entry = evidenceHandler.__private.readEvidenceMediaEntry(
    {
      evidence_media: {
        videos: [
          {
            source: "/tmp/proof.webm",
            aliases: ["https://local.example/artifacts/proof.webm"],
            storage_bucket: "qa-evidence",
            storage_path: "run_1/videos/proof.webm",
            content_type: "video/webm"
          }
        ]
      }
    },
    "video",
    "https://local.example/artifacts/proof.webm"
  );

  assert.deepEqual(entry, {
    source: "/tmp/proof.webm",
    content_type: "video/webm",
    data_url: "",
    storage_bucket: "qa-evidence",
    storage_path: "run_1/videos/proof.webm",
    aliases: ["https://local.example/artifacts/proof.webm"]
  });
});

test("fetchStoredEvidenceObject streams media from Supabase storage", async () => {
  const result = await evidenceHandler.__private.fetchStoredEvidenceObject(
    {
      storage_bucket: "qa-evidence",
      storage_path: "run_1/screenshots/proof.png",
      content_type: "image/png"
    },
    {
      supabaseUrl: "https://supabase.example",
      serviceKey: "service-key",
      fetchImpl: async (url, init = {}) => {
        assert.match(url, /storage\/v1\/object\/qa-evidence\/run_1\/screenshots\/proof\.png$/);
        assert.equal(init.headers.apikey, "service-key");
        return {
          ok: true,
          headers: {
            get(name) {
              return String(name || "").toLowerCase() === "content-type" ? "image/png" : "";
            }
          },
          async arrayBuffer() {
            return Uint8Array.from(Buffer.from("proof-bytes")).buffer;
          }
        };
      }
    }
  );

  assert.equal(result.contentType, "image/png");
  assert.equal(result.data.toString(), "proof-bytes");
});

test("ensureEvidenceStorageBucket treats existing-bucket messages as ready", async () => {
  const result = await ensureEvidenceStorageBucket({
    supabaseUrl: "https://supabase-existing-bucket.example",
    serviceKey: "service-key",
    bucket: "qa-evidence",
    fetchImpl: async () => ({
      ok: false,
      status: 400,
      async json() {
        return { message: "The resource already exists" };
      }
    })
  });

  assert.equal(result, true);
});

test("readEvidenceList includes journey step clip videos in lookup order", () => {
  const values = evidenceHandler.__private.readEvidenceList(
    {
      evidence_gallery: {
        videos: ["https://example.com/run.webm"]
      },
      tested_journeys: [
        {
          evidence: {
            videos: ["/tmp/journey.webm"]
          },
          step_video_clips: [
            { step: 1, video: "/tmp/step-01.mp4" },
            { step: 2, video: "/tmp/step-02.mp4" }
          ]
        }
      ]
    },
    "video",
    {}
  );

  assert.deepEqual(values, [
    "https://example.com/run.webm",
    "/tmp/journey.webm",
    "/tmp/step-01.mp4",
    "/tmp/step-02.mp4"
  ]);
});

test("evidence handler requires owner-authenticated video read by run_id", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes("/rest/v1/swarmtest_reports")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return [
            {
              id: "row_public_video_1",
              run_id: "run_public_video_1",
              payload: {
                run_request: {
                  metadata: {
                    owner_user_id: "user_789"
                  }
                },
                report_json: {
                  evidence_gallery: {
                    videos: ["data:video/webm;base64,dmlkZW8="]
                  }
                }
              }
            }
          ];
        }
      };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    await withEnv(
      {
        QA_SERVICE_TOKEN: "service-token",
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_KEY: "service-key"
      },
      async () => {
        const req = {
          method: "GET",
          query: {
            run_id: "run_public_video_1",
            kind: "video",
            index: "0"
          },
          headers: {
            "x-qa-service-token": "service-token",
            "x-owner-user-id": "user_789"
          }
        };
        const res = createRes();

        await evidenceHandler(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.headers["Content-Type"], "video/webm");
        assert.equal(Buffer.from(res.body).toString(), "video");
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("evidence handler allows shared-link video read by run_id", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes("/rest/v1/swarmtest_reports")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return [
            {
              id: "row_shared_video_1",
              run_id: "run_shared_video_1",
              payload: {
                share: {
                  enabled: true,
                  token: "share_video_123"
                },
                report_json: {
                  evidence_gallery: {
                    videos: ["data:video/webm;base64,dmlkZW8="]
                  }
                }
              }
            }
          ];
        }
      };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    await withEnv(
      {
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_KEY: "service-key"
      },
      async () => {
        const req = {
          method: "GET",
          query: {
            run_id: "run_shared_video_1",
            kind: "video",
            index: "0",
            share_key: "share_video_123"
          },
          headers: {
            host: "swarmtester.com"
          }
        };
        const res = createRes();

        await evidenceHandler(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.headers["Content-Type"], "video/webm");
        assert.equal(Buffer.from(res.body).toString(), "video");
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("evidence handler supports byte-range requests for inline video replays", async () => {
  const originalFetch = global.fetch;
  const inlineVideo = Buffer.from("abcdefghij").toString("base64");
  global.fetch = async (url) => {
    if (String(url).includes("/rest/v1/swarmtest_reports")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return [
            {
              id: "row_range_video_1",
              run_id: "run_range_video_1",
              payload: {
                run_request: {
                  metadata: {
                    owner_user_id: "user_range_1"
                  }
                },
                report_json: {
                  evidence_gallery: {
                    videos: ["data:video/webm;base64," + inlineVideo]
                  }
                }
              }
            }
          ];
        }
      };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    await withEnv(
      {
        QA_SERVICE_TOKEN: "service-token",
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_KEY: "service-key"
      },
      async () => {
        const req = {
          method: "GET",
          query: {
            run_id: "run_range_video_1",
            kind: "video",
            index: "0"
          },
          headers: {
            "x-qa-service-token": "service-token",
            "x-owner-user-id": "user_range_1",
            range: "bytes=2-5"
          }
        };
        const res = createRes();

        await evidenceHandler(req, res);

        assert.equal(res.statusCode, 206);
        assert.equal(res.headers["Content-Type"], "video/webm");
        assert.equal(res.headers["Accept-Ranges"], "bytes");
        assert.equal(res.headers["Content-Range"], "bytes 2-5/10");
        assert.equal(res.headers["Content-Length"], "4");
        assert.equal(Buffer.from(res.body).toString(), "cdef");
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});
