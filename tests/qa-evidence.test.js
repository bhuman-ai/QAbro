const test = require("node:test");
const assert = require("node:assert/strict");

const evidenceHandler = require("../api/qa/evidence");
const {
  ensureEvidenceStorageBucket,
  fetchStoredEvidenceObject,
  measureStoredEvidenceForRun
} = require("../lib/qa-evidence-storage");

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

test("fetchStoredEvidenceObject rejects oversized declared content before reading", async () => {
  let bodyRead = false;
  const result = await fetchStoredEvidenceObject(
    {
      storage_bucket: "qa-evidence",
      storage_path: "run_1/videos/too-large.webm",
      content_type: "video/webm"
    },
    {
      maxBytes: 10,
      supabaseUrl: "https://supabase.example",
      serviceKey: "service-key",
      fetchImpl: async () => ({
        ok: true,
        headers: {
          get(name) {
            const key = String(name || "").toLowerCase();
            if (key === "content-length") return "11";
            if (key === "content-type") return "video/webm";
            return "";
          }
        },
        async arrayBuffer() {
          bodyRead = true;
          return Uint8Array.from(Buffer.from("too-large!!")).buffer;
        }
      })
    }
  );
  assert.equal(result, null);
  assert.equal(bodyRead, false);
});

test("fetchStoredEvidenceObject rejects oversized actual bytes when length is absent", async () => {
  const result = await fetchStoredEvidenceObject(
    {
      storage_bucket: "qa-evidence",
      storage_path: "run_1/videos/undeclared-large.webm",
      content_type: "video/webm"
    },
    {
      maxBytes: 10,
      supabaseUrl: "https://supabase.example",
      serviceKey: "service-key",
      fetchImpl: async () => ({
        ok: true,
        headers: {
          get(name) {
            return String(name || "").toLowerCase() === "content-type" ? "video/webm" : "";
          }
        },
        async arrayBuffer() {
          return Uint8Array.from(Buffer.from("eleven-bytes")).buffer;
        }
      })
    }
  );
  assert.equal(result, null);
});

test("stored evidence paths reject traversal before a service-key request is sent", async () => {
  let fetchCalls = 0;
  const result = await fetchStoredEvidenceObject(
    {
      storage_bucket: "qa-evidence",
      storage_path: "session/manual-widget-video-chunks-upload/../../victim/private.webm",
      content_type: "video/webm"
    },
    {
      supabaseUrl: "https://supabase.example",
      serviceKey: "service-key",
      fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error("must not fetch");
      }
    }
  );
  assert.equal(result, null);
  assert.equal(fetchCalls, 0);
});

test("stored evidence cannot use the service key to read another bucket", async () => {
  let fetchCalls = 0;
  const result = await fetchStoredEvidenceObject(
    {
      storage_bucket: "unrelated-private-bucket",
      storage_path: "session/private.webm",
      content_type: "video/webm"
    },
    {
      supabaseUrl: "https://supabase.example",
      serviceKey: "service-key",
      bucket: "qa-evidence",
      fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error("must not fetch");
      }
    }
  );
  assert.equal(result, null);
  assert.equal(fetchCalls, 0);
});

test("ensureEvidenceStorageBucket treats existing-bucket messages as ready", async () => {
  const calls = [];
  const result = await ensureEvidenceStorageBucket({
    supabaseUrl: "https://supabase-existing-bucket.example",
    serviceKey: "service-key",
    bucket: "qa-evidence",
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      if (options.method === "GET") {
        return {
          ok: true,
          status: 200,
          async json() {
            return { id: "qa-evidence", name: "qa-evidence", public: false };
          }
        };
      }
      return {
        ok: false,
        status: 400,
        async json() {
          return { message: "The resource already exists" };
        }
      };
    }
  });

  assert.equal(result, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[1].options.method, "GET");
  assert.match(calls[1].url, /storage\/v1\/bucket\/qa-evidence$/);
  assert.equal(calls[1].options.headers.apikey, "service-key");
});

test("ensureEvidenceStorageBucket accepts a private bucket after a create conflict", async () => {
  const result = await ensureEvidenceStorageBucket({
    supabaseUrl: "https://supabase-private-conflict.example",
    serviceKey: "service-key",
    bucket: "private-evidence",
    fetchImpl: async (_url, options = {}) => {
      if (options.method === "GET") {
        return {
          ok: true,
          status: 200,
          async json() {
            return { id: "private-evidence", public: false };
          }
        };
      }
      return {
        ok: false,
        status: 409,
        async json() {
          return { message: "Bucket already exists" };
        }
      };
    }
  });

  assert.equal(result, true);
});

test("ensureEvidenceStorageBucket rejects a pre-existing public bucket", async () => {
  await assert.rejects(
    ensureEvidenceStorageBucket({
      supabaseUrl: "https://supabase-public-conflict.example",
      serviceKey: "service-key",
      bucket: "public-evidence",
      fetchImpl: async (_url, options = {}) => {
        if (options.method === "GET") {
          return {
            ok: true,
            status: 200,
            async json() {
              return { id: "public-evidence", public: true };
            }
          };
        }
        return {
          ok: false,
          status: 409,
          async json() {
            return { message: "Bucket already exists" };
          }
        };
      }
    }),
    /must be private/i
  );
});

test("session storage usage recursively counts nested objects with list-v2 cursor pagination", async () => {
  const requests = [];
  const usage = await measureStoredEvidenceForRun("manual-nested", {
    stopAfterBytes: 10,
    supabaseUrl: "https://supabase.example",
    serviceKey: "service-key",
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, body: JSON.parse(options.body || "{}") });
      const body = JSON.parse(options.body || "{}");
      assert.match(url, /storage\/v1\/object\/list-v2\/qa-evidence$/);
      assert.equal(body.prefix, "manual-nested/");
      assert.equal(body.with_delimiter, false);
      return {
        ok: true,
        status: 200,
        async json() {
          return body.cursor
            ? {
                objects: [{
                  name: "manual-nested/manual-widget-video/part-2.webm",
                  metadata: { size: 5 }
                }],
                folders: [],
                hasNext: false
              }
            : {
                objects: [{
                  name: "manual-nested/manual-widget-video-chunks-a/part-1.webm",
                  metadata: { size: 6 }
                }],
                folders: [],
                hasNext: true,
                nextCursor: "cursor-2"
              };
        }
      };
    }
  });

  assert.deepEqual(usage, { byte_length: 11, object_count: 2, limit_exceeded: true });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].body.cursor, undefined);
  assert.equal(requests[1].body.cursor, "cursor-2");
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
