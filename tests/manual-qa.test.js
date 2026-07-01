const assert = require("node:assert/strict");
const test = require("node:test");

const {
  appendManualQaItemEvidence,
  buildManualQaChecklist,
  buildManualQaSessionPayload,
  createManualQaSession,
  exportManualQaSession,
  getManualQaWidgetSession,
  redactSensitiveUrl,
  updateManualQaWidgetItem,
  updateManualQaItem
} = require("../lib/manual-qa");
const widgetEvidenceChunksHandler = require("../api/manual-qa/widget-evidence-chunks");

function createSupabaseFetchMock() {
  const rows = new Map();
  const calls = [];

  async function fetchImpl(url, options = {}) {
    calls.push({ url, options });
    const parsed = new URL(url);
    const runFilter = parsed.searchParams.get("run_id") || "";
    const runId = runFilter.startsWith("eq.") ? runFilter.slice(3) : "";

    if (options.method === "POST") {
      const body = JSON.parse(options.body || "[]");
      const row = { id: 1, created_at: "2026-07-01T00:00:00.000Z", updated_at: "2026-07-01T00:00:00.000Z", ...body[0] };
      rows.set(row.run_id, row);
      return {
        ok: true,
        status: 201,
        async json() {
          return [row];
        }
      };
    }

    if (options.method === "PATCH") {
      const current = rows.get(runId);
      const body = JSON.parse(options.body || "{}");
      const next = { ...current, ...body, updated_at: "2026-07-01T00:01:00.000Z" };
      rows.set(runId, next);
      return {
        ok: true,
        status: 200,
        async json() {
          return [next];
        }
      };
    }

    const row = rows.get(runId);
    return {
      ok: true,
      status: 200,
      async json() {
        return row ? [row] : [];
      }
    };
  }

  return { fetchImpl, rows, calls };
}

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
    end(payload) {
      this.body = payload || null;
      return this;
    }
  };
}

function createSupabaseAndStorageFetchMock() {
  const rows = new Map();
  const objects = new Map();
  const calls = [];

  async function fetchImpl(url, options = {}) {
    calls.push({ url, options });
    const parsed = new URL(url);

    if (parsed.pathname === "/storage/v1/bucket") {
      return {
        ok: true,
        status: 200,
        async json() {
          return { id: "qa-evidence" };
        }
      };
    }

    if (parsed.pathname.includes("/storage/v1/object/qa-evidence/")) {
      const objectPath = parsed.pathname
        .split("/storage/v1/object/qa-evidence/")[1]
        .split("/")
        .map((segment) => decodeURIComponent(segment))
        .join("/");
      if (options.method === "POST") {
        const data = Buffer.isBuffer(options.body) ? options.body : Buffer.from(options.body || []);
        objects.set(objectPath, {
          data,
          contentType: options.headers?.["Content-Type"] || "application/octet-stream"
        });
        return {
          ok: true,
          status: 200,
          async json() {
            return { Key: objectPath };
          }
        };
      }
      const stored = objects.get(objectPath);
      return {
        ok: Boolean(stored),
        status: stored ? 200 : 404,
        headers: {
          get(name) {
            return String(name || "").toLowerCase() === "content-type" ? stored?.contentType || "" : "";
          }
        },
        async arrayBuffer() {
          return stored ? stored.data.buffer.slice(stored.data.byteOffset, stored.data.byteOffset + stored.data.byteLength) : new ArrayBuffer(0);
        }
      };
    }

    const runFilter = parsed.searchParams.get("run_id") || "";
    const runId = runFilter.startsWith("eq.") ? runFilter.slice(3) : "";

    if (options.method === "POST") {
      const body = JSON.parse(options.body || "[]");
      const row = { id: 1, created_at: "2026-07-01T00:00:00.000Z", updated_at: "2026-07-01T00:00:00.000Z", ...body[0] };
      rows.set(row.run_id, row);
      return {
        ok: true,
        status: 201,
        async json() {
          return [row];
        }
      };
    }

    if (options.method === "PATCH") {
      const current = rows.get(runId);
      const body = JSON.parse(options.body || "{}");
      const next = { ...current, ...body, updated_at: "2026-07-01T00:01:00.000Z" };
      rows.set(runId, next);
      return {
        ok: true,
        status: 200,
        async json() {
          return [next];
        }
      };
    }

    const row = rows.get(runId);
    return {
      ok: true,
      status: 200,
      async json() {
        return row ? [row] : [];
      }
    };
  }

  return { fetchImpl, rows, objects, calls };
}

async function callWidgetChunksHandler(body, token) {
  const req = {
    method: "POST",
    headers: {
      host: "beforeusersdo.com",
      "x-forwarded-proto": "https",
      "x-bud-widget-token": token
    },
    query: {},
    body
  };
  const res = createRes();
  await widgetEvidenceChunksHandler(req, res);
  return res;
}

test("buildManualQaChecklist uses explicit agent test plan start URLs", () => {
  const items = buildManualQaChecklist({
    target_url: "https://example.com/app",
    test_plan: [
      {
        title: "Check paywall copy",
        instructions: "Go through onboarding until the paywall.",
        path: "/onboarding",
        expected: "Plan copy is centered."
      }
    ]
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Check paywall copy");
  assert.equal(items[0].start_url, "https://example.com/onboarding");
  assert.equal(items[0].expected, "Plan copy is centered.");
});

test("manual QA session can be created, updated, and exported with sensitive URLs redacted", async () => {
  const previousEnv = {
    QA_LIVE_STREAM_ENABLED: process.env.QA_LIVE_STREAM_ENABLED,
    QA_LIVE_STREAM_PUBLIC_BASE_URL: process.env.QA_LIVE_STREAM_PUBLIC_BASE_URL,
    QA_LIVE_STREAM_PASSWORD: process.env.QA_LIVE_STREAM_PASSWORD
  };
  process.env.QA_LIVE_STREAM_ENABLED = "1";
  process.env.QA_LIVE_STREAM_PUBLIC_BASE_URL = "https://browser.beforeusersdo.com";
  process.env.QA_LIVE_STREAM_PASSWORD = "pw123";

  const mock = createSupabaseFetchMock();

  try {
    const created = await createManualQaSession(
      {
        target_url: "https://preview.example.com/onboarding?token=abc123",
        brand: "Example",
        title: "Onboarding pass",
        work_summary: "Changed onboarding cards.",
        acceptance_criteria: ["Recommendation cards are personalized."]
      },
      {
        publicBaseUrl: "https://beforeusersdo.com",
        ownerUserId: "user_1",
        ownerEmail: "owner@example.com",
        fetchImpl: mock.fetchImpl,
        supabaseUrl: "https://supabase.example.com",
        serviceKey: "service"
      }
    );

    assert.equal(created.ok, true);
    assert.equal(created.session.checklist.length >= 2, true);
    assert.equal(created.session.browser.mode, "local_browser_sidecar");
    assert.equal(created.session.browser.status, "viewer_ready");
    assert.equal(created.session.browser.remote_fallback_ready, true);
    assert.match(created.session.browser.viewer_url, /password=pw123/);
    assert.equal(created.session.widget.status, "ready");
    assert.equal(created.session.widget.token_hash, undefined);
    assert.match(created.widget_install.script_tag, /api\/manual-qa\/widget\.js/);
    assert.match(created.widget_install.script_tag, /token=/);

    const firstItem = created.session.checklist[0];
    const widgetUrl = new URL(created.widget_install.script_url);
    const widgetToken = widgetUrl.searchParams.get("token");
    const widgetLoaded = await getManualQaWidgetSession(created.session.session_id, widgetToken, {
      fetchImpl: mock.fetchImpl,
      supabaseUrl: "https://supabase.example.com",
      serviceKey: "service"
    });
    assert.equal(widgetLoaded.ok, true);

    const widgetUpdated = await updateManualQaWidgetItem(
      created.session.session_id,
      widgetToken,
      firstItem.id,
      {
        status: "confusing",
        note: "The CTA label was unclear.",
        widget_context: {
          page_url: "https://preview.example.com/onboarding?token=abc123",
          page_errors: [{ message: "Hydration failed", type: "error" }]
        }
      },
      {
        fetchImpl: mock.fetchImpl,
        supabaseUrl: "https://supabase.example.com",
        serviceKey: "service"
      }
    );
    assert.equal(widgetUpdated.ok, true);
    assert.equal(widgetUpdated.item.status, "confusing");
    assert.match(widgetUpdated.item.widget_context.page_url, /token=%5Bredacted%5D/);

    const appended = await appendManualQaItemEvidence(
      created.session.session_id,
      firstItem.id,
      {
        kind: "screenshot",
        content_type: "image/png",
        storage_bucket: "qa-evidence",
        storage_path: "manual/example.png",
        url: "https://beforeusersdo.com/api/manual-qa/evidence?session_id=x&token=secret"
      },
      {
        widgetAccessOk: true,
        fetchImpl: mock.fetchImpl,
        supabaseUrl: "https://supabase.example.com",
        serviceKey: "service"
      }
    );
    assert.equal(appended.ok, true);
    assert.equal(appended.item.evidence_media.length, 1);

    const updated = await updateManualQaItem(
      created.session.session_id,
      firstItem.id,
      {
        status: "pass",
        note: "Looks correct.",
        evidence_urls: ["https://assets.example.com/screenshot.png?token=abc123"]
      },
      {
        authOk: true,
        ownerUserId: "user_1",
        fetchImpl: mock.fetchImpl,
        supabaseUrl: "https://supabase.example.com",
        serviceKey: "service"
      }
    );

    assert.equal(updated.ok, true);
    assert.equal(updated.item.status, "pass");
    assert.equal(updated.item.note, "Looks correct.");

    const exported = await exportManualQaSession(created.session.session_id, {
      authOk: true,
      ownerUserId: "user_1",
      fetchImpl: mock.fetchImpl,
      supabaseUrl: "https://supabase.example.com",
      serviceKey: "service"
    });

    assert.equal(exported.ok, true);
    assert.match(exported.markdown, /token=%5Bredacted%5D/);
    assert.doesNotMatch(exported.markdown, /abc123/);
    assert.doesNotMatch(exported.markdown, /pw123/);
    assert.equal(exported.session.browser.viewer_url, "[redacted in export]");
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("manual QA browser state defaults to user's own browser sidecar without remote fallback", () => {
  const previousEnv = {
    QA_LIVE_STREAM_ENABLED: process.env.QA_LIVE_STREAM_ENABLED,
    QA_LIVE_STREAM_PUBLIC_BASE_URL: process.env.QA_LIVE_STREAM_PUBLIC_BASE_URL,
    QA_LIVE_STREAM_PASSWORD: process.env.QA_LIVE_STREAM_PASSWORD
  };
  delete process.env.QA_LIVE_STREAM_ENABLED;
  delete process.env.QA_LIVE_STREAM_PUBLIC_BASE_URL;
  delete process.env.QA_LIVE_STREAM_PASSWORD;

  try {
    const payload = buildManualQaSessionPayload(
      {
        target_url: "https://preview.example.com",
        work_summary: "Changed onboarding cards."
      },
      { publicBaseUrl: "https://beforeusersdo.com" }
    );

    assert.equal(payload.ok, true);
    assert.equal(payload.session.browser.mode, "local_browser_sidecar");
    assert.equal(payload.session.browser.status, "local_sidecar_ready");
    assert.equal(payload.session.browser.remote_fallback_ready, false);
    assert.equal(payload.session.browser.viewer_url, null);
    assert.match(payload.session.browser.note, /own browser/);
    assert.equal(payload.session.widget.mode, "in_page_overlay");
    assert.match(payload.widgetInstall.script_tag, /api\/manual-qa\/widget\.js/);
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("widget chunk endpoint assembles recording chunks into one evidence item", async () => {
  const previousEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    QA_EVIDENCE_STORAGE_BUCKET: process.env.QA_EVIDENCE_STORAGE_BUCKET,
    QA_WIDGET_MAX_RECORDING_BYTES: process.env.QA_WIDGET_MAX_RECORDING_BYTES
  };
  const previousFetch = globalThis.fetch;
  const mock = createSupabaseAndStorageFetchMock();
  process.env.SUPABASE_URL = "https://supabase-chunks.example.com";
  process.env.SUPABASE_SERVICE_KEY = "service";
  process.env.QA_EVIDENCE_STORAGE_BUCKET = "qa-evidence";
  process.env.QA_WIDGET_MAX_RECORDING_BYTES = "1024";
  globalThis.fetch = mock.fetchImpl;

  try {
    const created = await createManualQaSession(
      {
        target_url: "https://preview.example.com",
        brand: "Example",
        title: "Chunk upload pass",
        acceptance_criteria: ["Recording evidence can be uploaded."]
      },
      {
        publicBaseUrl: "https://beforeusersdo.com",
        ownerUserId: "user_1",
        fetchImpl: mock.fetchImpl,
        supabaseUrl: "https://supabase-chunks.example.com",
        serviceKey: "service"
      }
    );
    const item = created.session.checklist[0];
    const widgetToken = new URL(created.widget_install.script_url).searchParams.get("token");

    const chunkA = await callWidgetChunksHandler(
      {
        action: "chunk",
        session_id: created.session.session_id,
        token: widgetToken,
        upload_id: "upload-1",
        chunk_index: 0,
        kind: "video",
        filename: "review.webm",
        content_type: "video/webm",
        data_url: `data:video/webm;base64,${Buffer.from("first-").toString("base64")}`
      },
      widgetToken
    );
    const chunkB = await callWidgetChunksHandler(
      {
        action: "chunk",
        session_id: created.session.session_id,
        token: widgetToken,
        upload_id: "upload-1",
        chunk_index: 1,
        kind: "video",
        filename: "review.webm",
        content_type: "video/webm",
        data_url: `data:video/webm;base64,${Buffer.from("second").toString("base64")}`
      },
      widgetToken
    );
    assert.equal(chunkA.statusCode, 201);
    assert.equal(chunkB.statusCode, 201);

    const finished = await callWidgetChunksHandler(
      {
        action: "finish",
        session_id: created.session.session_id,
        token: widgetToken,
        item_id: item.id,
        kind: "video",
        filename: "review.webm",
        content_type: "video/webm",
        chunks: [chunkB.body.chunk, chunkA.body.chunk]
      },
      widgetToken
    );

    assert.equal(finished.statusCode, 201);
    assert.equal(finished.body.item.evidence_media.length, 1);
    assert.equal(finished.body.item.evidence_media[0].kind, "video");
    assert.equal(finished.body.item.evidence_media[0].byte_length, Buffer.byteLength("first-second"));
    assert.match(finished.body.evidence_url, /api\/manual-qa\/evidence/);
    const storedVideo = mock.objects.get(finished.body.item.evidence_media[0].storage_path);
    assert.equal(storedVideo.data.toString(), "first-second");
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("redactSensitiveUrl redacts common secret query params", () => {
  assert.equal(
    redactSensitiveUrl("https://example.com/path?foo=1&access_token=secret&session=abc"),
    "https://example.com/path?foo=1&access_token=%5Bredacted%5D&session=%5Bredacted%5D"
  );
});
