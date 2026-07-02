const assert = require("node:assert/strict");
const test = require("node:test");

const {
  appendManualQaItemEvidence,
  buildManualQaAgentFeedbackMarkdown,
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
const widgetFeedbackHandler = require("../api/manual-qa/widget-feedback");
const { buildManualQaWidgetScript } = require("../lib/manual-qa-widget");

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

async function callWidgetFeedbackHandler(body, token) {
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
  await widgetFeedbackHandler(req, res);
  return res;
}

test("manual QA widget uses a movable compact capture tray", () => {
  const script = buildManualQaWidgetScript({
    sessionId: "manual-voice-smoke",
    token: "widget-token",
    apiBaseUrl: "https://beforeusersdo.com"
  });

  assert.match(script, /BeforeUsersDo<\/span>/);
  assert.match(script, /Not recording\. Records screen and voice after Chrome asks\./);
  assert.match(script, /class="bud-capture-panel"/);
  assert.match(script, /capturePanel\.classList\.add\("is-open"\)/);
  assert.match(script, /makeDraggable\(pill, pill/);
  assert.match(script, /makeDraggable\(panel, panelDragHandle/);
  assert.match(script, /makeDraggable\(capturePanel, capturePanel/);
  assert.match(script, /class="bud-record" data-action="record"/);
  assert.match(script, /Record video/);
  assert.match(script, /data-action="draw"/);
  assert.match(script, /data-action="clear"/);
  assert.match(script, /data-action="note-toggle"/);
  assert.match(script, /bud-note-popover/);
  assert.match(script, /data-action="send-all"/);
  assert.match(script, /className = "bud-item-send"/);
  assert.match(script, /Video saved/);
  assert.match(script, /Drawing saved/);
  assert.match(script, /const saved = await autoSaveDrawingIfNeeded\(\{ clearAfterSave: true \}\)/);
  assert.match(script, /resetDrawingSurface/);
  assert.match(script, /ensureCanvasReady/);
  assert.match(script, /context\.setTransform\(ratio, 0, 0, ratio, 0, 0\)/);
  assert.match(script, /context\.lineWidth = 4/);
  assert.match(script, /context\.quadraticCurveTo/);
  assert.match(script, /normalizeRecordingContentType/);
  assert.match(script, /new Blob\(\[blob\], \{ type: safeContentType \}\)/);
  assert.match(script, /beforeusersdo:open:/);
  assert.match(script, /rememberWidgetOpen\(true\)/);
  assert.match(script, /rememberWidgetOpen\(false\)/);
  assert.match(script, /openWidget\(\{ load: false \}\)/);
  assert.match(script, /stopRecordingAndWait/);
  assert.match(script, /label: "Drawing annotation"/);
  assert.match(script, /label: "Video recording"/);
  assert.match(script, /isFreestyleMode/);
  assert.match(script, /bud-panel\.is-freestyle/);
  assert.match(script, /page_visits: state\.pageVisits/);
  assert.match(script, /recordPageVisit/);
  assert.doesNotMatch(script, /Say what you notice/);
  assert.doesNotMatch(script, /bud-capture-title/);
  assert.doesNotMatch(script, /bud-note-hint/);
  assert.doesNotMatch(script, /data-action="toggle-tools"/);
  assert.doesNotMatch(script, /id="bud-tools-panel"/);
  assert.doesNotMatch(script, /toolsOpen: false/);
  assert.doesNotMatch(script, /bud-note-wrap/);
  assert.doesNotMatch(script, /bud-tray/);
  assert.doesNotMatch(script, /class="bud-tool" data-action="record"/);
  assert.doesNotMatch(script, /data-action="save-drawing"/);
  assert.doesNotMatch(script, /Save drawing/);
  assert.doesNotMatch(script, /data-status="pass"/);
  assert.doesNotMatch(script, /data-status="fail"/);
  assert.doesNotMatch(script, /data-status="confusing"/);
  assert.doesNotMatch(script, /data-status="blocked"/);
  assert.doesNotMatch(script, /location\.assign/);
  assert.doesNotMatch(script, /options\.navigate/);
  assert.doesNotMatch(script, /navigate: true/);
});

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

test("new manual QA sessions clear copied feedback and evidence from agent plans", () => {
  const built = buildManualQaSessionPayload(
    {
      target_url: "https://preview.example.com/signup",
      brand: "Example",
      title: "Fresh QA pass",
      test_plan: [
        {
          id: "account-step",
          title: "Account step layout",
          instructions: "Check the account step.",
          expected: "The form is visible.",
          status: "fail",
          note: "Old feedback from the previous run.",
          evidence_urls: ["https://beforeusersdo.com/api/manual-qa/evidence?session_id=old&token=secret"],
          evidence_media: [
            {
              kind: "video",
              label: "Old recording",
              content_type: "video/webm",
              storage_bucket: "qa-evidence",
              storage_path: "manual/old/video.webm",
              url: "https://beforeusersdo.com/api/manual-qa/evidence?session_id=old&index=0&token=secret"
            }
          ],
          widget_context: {
            page_url: "https://preview.example.com/signup?token=old",
            console_events: [{ type: "error", message: "Old console error" }]
          },
          created_at: "2026-01-01T00:00:00.000Z",
          reviewed_at: "2026-01-01T00:10:00.000Z"
        }
      ]
    },
    { publicBaseUrl: "https://beforeusersdo.com" }
  );

  assert.equal(built.ok, true);
  assert.equal(built.session.status, "manual_ready");
  assert.deepEqual(built.session.counts, {
    pending: 1,
    pass: 0,
    fail: 0,
    confusing: 0,
    blocked: 0,
    skip: 0
  });
  const item = built.session.checklist[0];
  assert.equal(item.id, "account-step");
  assert.equal(item.title, "Account step layout");
  assert.equal(item.status, "pending");
  assert.equal(item.note, null);
  assert.deepEqual(item.evidence_urls, []);
  assert.deepEqual(item.evidence_media, []);
  assert.equal(item.widget_context.page_url, null);
  assert.deepEqual(item.widget_context.console_events, []);
  assert.equal(item.reviewed_at, null);
  assert.notEqual(item.created_at, "2026-01-01T00:00:00.000Z");
});

test("freestyle manual QA sessions create one capture item without checklist setup", () => {
  const built = buildManualQaSessionPayload(
    {
      target_url: "https://preview.example.com/app",
      brand: "Example",
      title: "Freestyle QA",
      review_mode: "freestyle",
      work_summary: "Open review pass for latest changes.",
      test_plan: [
        {
          title: "This should not appear as a visible checklist item",
          instructions: "Copied checklist should be ignored in freestyle mode."
        }
      ]
    },
    { publicBaseUrl: "https://beforeusersdo.com" }
  );

  assert.equal(built.ok, true);
  assert.equal(built.session.review_mode, "freestyle");
  assert.equal(built.session.context.review_mode, "freestyle");
  assert.equal(built.session.status, "manual_ready");
  assert.equal(built.session.checklist.length, 1);
  assert.equal(built.session.checklist[0].id, "freestyle");
  assert.equal(built.session.checklist[0].title, "Freestyle QA");
  assert.equal(built.session.checklist[0].status, "pending");
  assert.deepEqual(built.session.checklist[0].evidence_media, []);
  assert.equal(built.widgetInstall.review_url, "https://preview.example.com/app");
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
    const firstItem = created.session.checklist[0];
    assert.equal(created.session.browser.mode, "local_browser_sidecar");
    assert.equal(created.session.browser.status, "viewer_ready");
    assert.equal(created.session.browser.remote_fallback_ready, true);
    assert.match(created.session.browser.viewer_url, /password=pw123/);
    assert.equal(created.session.widget.status, "install_required");
    assert.equal(created.session.widget.installed, false);
    assert.equal(created.session.widget.token_hash, undefined);
    assert.match(created.widget_install.script_tag, /api\/manual-qa\/widget\.js/);
    assert.match(created.widget_install.script_tag, /token=/);
    assert.equal(created.widget_install.review_url, firstItem.start_url);
    assert.equal(created.widget_install.direct_review_url, firstItem.start_url);
    assert.equal(created.widget_install.checklist_review_urls[0].review_url, firstItem.start_url);

    const widgetUrl = new URL(created.widget_install.script_url);
    const widgetToken = widgetUrl.searchParams.get("token");
    const widgetLoaded = await getManualQaWidgetSession(created.session.session_id, widgetToken, {
      fetchImpl: mock.fetchImpl,
      supabaseUrl: "https://supabase.example.com",
      serviceKey: "service"
    });
    assert.equal(widgetLoaded.ok, true);
    assert.equal(widgetLoaded.session.widget.status, "installed");
    assert.equal(widgetLoaded.session.widget.installed, true);
    assert.ok(widgetLoaded.session.widget.installed_at);
    assert.ok(widgetLoaded.session.widget.last_seen_at);

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
    assert.equal(payload.session.widget.status, "install_required");
    assert.equal(payload.widgetInstall.required, true);
    assert.equal(payload.widgetInstall.target_locked_until_widget_loads, true);
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

test("widget feedback endpoint returns redacted agent feedback for one item", async () => {
  const previousEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY
  };
  const previousFetch = globalThis.fetch;
  const mock = createSupabaseFetchMock();
  process.env.SUPABASE_URL = "https://supabase-feedback.example.com";
  process.env.SUPABASE_SERVICE_KEY = "service";
  globalThis.fetch = mock.fetchImpl;

  try {
    const created = await createManualQaSession(
      {
        target_url: "https://preview.example.com/onboarding?token=abc123",
        brand: "Example",
        title: "Feedback pass",
        test_plan: [
          {
            title: "Check onboarding card",
            instructions: "Confirm the card is personalized.",
            expected: "The card explains why it was picked."
          }
        ]
      },
      {
        publicBaseUrl: "https://beforeusersdo.com",
        ownerUserId: "user_1",
        fetchImpl: mock.fetchImpl,
        supabaseUrl: "https://supabase-feedback.example.com",
        serviceKey: "service"
      }
    );
    const item = created.session.checklist[0];
    const widgetToken = new URL(created.widget_install.script_url).searchParams.get("token");
    const updated = await updateManualQaWidgetItem(
      created.session.session_id,
      widgetToken,
      item.id,
      {
        status: "fail",
        note: "The card still shows generic copy.",
        widget_context: {
          page_url: "https://preview.example.com/onboarding?token=abc123",
          page_title: "Onboarding",
          viewport: { width: 1440, height: 900, device_pixel_ratio: 2 },
          page_errors: [{ type: "error", message: "Hydration failed" }],
          console_events: [{ type: "error", message: "Cannot read properties of undefined" }],
          network_events: [
            { method: "GET", status: 200, url: "https://preview.example.com/api/ok", message: "loaded" },
            { method: "GET", status: 500, url: "https://preview.example.com/api/cards?token=abc123" }
          ]
        }
      },
      {
        widgetAccessOk: true,
        fetchImpl: mock.fetchImpl,
        supabaseUrl: "https://supabase-feedback.example.com",
        serviceKey: "service"
      }
    );
    assert.equal(updated.ok, true);

    const withDrawing = await appendManualQaItemEvidence(
      created.session.session_id,
      item.id,
      {
        kind: "screenshot",
        label: "Drawing annotation",
        content_type: "image/png",
        byte_length: 4096,
        storage_bucket: "qa-evidence",
        storage_path: "manual/drawing.png",
        url: "https://beforeusersdo.com/api/manual-qa/evidence?session_id=feedback&item_id=item&index=0&token=abc123"
      },
      {
        widgetAccessOk: true,
        fetchImpl: mock.fetchImpl,
        supabaseUrl: "https://supabase-feedback.example.com",
        serviceKey: "service"
      }
    );
    assert.equal(withDrawing.ok, true);

    const withVideo = await appendManualQaItemEvidence(
      created.session.session_id,
      item.id,
      {
        kind: "video",
        label: "Video recording",
        content_type: "video/webm",
        byte_length: 2 * 1024 * 1024,
        storage_bucket: "qa-evidence",
        storage_path: "manual/video.webm",
        url: "https://beforeusersdo.com/api/manual-qa/evidence?session_id=feedback&item_id=item&index=1&token=abc123"
      },
      {
        widgetAccessOk: true,
        fetchImpl: mock.fetchImpl,
        supabaseUrl: "https://supabase-feedback.example.com",
        serviceKey: "service"
      }
    );
    assert.equal(withVideo.ok, true);

    const directMarkdown = buildManualQaAgentFeedbackMarkdown(withVideo.session, { item_id: item.id });
    assert.match(directMarkdown, /single checklist item/);
    assert.match(directMarkdown, /The card still shows generic copy/);
    assert.match(directMarkdown, /Hydration failed/);
    assert.match(directMarkdown, /Captured media:/);
    assert.match(directMarkdown, /Drawing \(Drawing annotation, image\/png, 4 KB/);
    assert.match(directMarkdown, /Video recording \(Video recording, video\/webm, 2\.0 MB/);
    assert.match(directMarkdown, /api\/manual-qa\/evidence\?session_id=feedback/);
    assert.match(directMarkdown, /GET 500 https:\/\/preview\.example\.com\/api\/cards\?token=%5Bredacted%5D/);
    assert.doesNotMatch(directMarkdown, /api\/ok/);
    assert.doesNotMatch(directMarkdown, /Captured media: 2 files/);
    assert.doesNotMatch(directMarkdown, /abc123/);

    const feedback = await callWidgetFeedbackHandler(
      {
        session_id: created.session.session_id,
        token: widgetToken,
        scope: "item",
        item_id: item.id
      },
      widgetToken
    );

    assert.equal(feedback.statusCode, 200);
    assert.equal(feedback.body.ok, true);
    assert.equal(feedback.body.scope, "item");
    assert.equal(feedback.body.agent_delivery.ready, true);
    assert.ok(feedback.body.feedback_id);
    assert.equal(feedback.body.session.agent_feedback.ready, true);
    assert.equal(feedback.body.session.agent_feedback.latest.scope, "item");
    assert.equal(feedback.body.session.agent_feedback.latest.item_id, item.id);
    assert.match(feedback.body.session.agent_feedback.latest.markdown, /BeforeUsersDo Manual QA Feedback/);
    assert.match(feedback.body.markdown, /BeforeUsersDo Manual QA Feedback/);
    assert.match(feedback.body.markdown, /The card still shows generic copy/);
    assert.match(feedback.body.markdown, /Cannot read properties of undefined/);
    assert.match(feedback.body.markdown, /Drawing \(Drawing annotation, image\/png, 4 KB/);
    assert.match(feedback.body.markdown, /Video recording \(Video recording, video\/webm, 2\.0 MB/);
    assert.match(feedback.body.markdown, /token=%5Bredacted%5D/);
    assert.doesNotMatch(feedback.body.markdown, /abc123/);
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
        content_type: "video/webm;codecs=vp8,opus",
        data_url: `data:video/webm;codecs=vp8,opus;base64,${Buffer.from("first-").toString("base64")}`
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
        label: "Video recording",
        filename: "review.webm",
        content_type: "video/webm;codecs=vp8,opus",
        chunks: [chunkB.body.chunk, chunkA.body.chunk]
      },
      widgetToken
    );

    assert.equal(finished.statusCode, 201);
    assert.equal(finished.body.item.evidence_media.length, 1);
    assert.equal(finished.body.item.evidence_media[0].kind, "video");
    assert.equal(finished.body.item.evidence_media[0].label, "Video recording");
    assert.equal(finished.body.item.evidence_media[0].byte_length, Buffer.byteLength("first-second"));
    assert.match(finished.body.evidence_url, /api\/manual-qa\/evidence/);
    const markdown = buildManualQaAgentFeedbackMarkdown(finished.body.session, { item_id: item.id });
    assert.match(markdown, /Video recording \(Video recording, video\/webm;codecs=vp8,opus, 12 B/);
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
