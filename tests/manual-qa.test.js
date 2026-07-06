const assert = require("node:assert/strict");
const test = require("node:test");

const {
  appendManualQaItemEvidence,
  buildManualQaAgentFeedbackMarkdown,
  buildManualQaChecklist,
  buildManualQaSessionPayload,
  buildManualQaWorkPackets,
  createManualQaSession,
  exportManualQaSession,
  getManualQaWidgetSession,
  redactSensitiveUrl,
  recordManualQaPreviewProposal,
  updateManualQaWidgetItem,
  updateManualQaItem
} = require("../lib/manual-qa");
const widgetEvidenceChunksHandler = require("../api/manual-qa/widget-evidence-chunks");
const widgetEvidenceHandler = require("../api/manual-qa/widget-evidence");
const widgetFeedbackHandler = require("../api/manual-qa/widget-feedback");
const widgetPreviewProposalHandler = require("../api/manual-qa/preview-proposal");
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

async function callWidgetEvidenceHandler(body, token) {
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
  await widgetEvidenceHandler(req, res);
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

async function callWidgetPreviewProposalHandler(body, token) {
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
  await widgetPreviewProposalHandler(req, res);
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
  assert.match(script, /flex-direction: column/);
  assert.match(script, /top: 84px;\n        left: 14px;/);
  assert.match(script, /top: 84px;\n        left: 76px;/);
  assert.match(script, /max-height: min\(280px, calc\(100vh - 104px\)\)/);
  assert.match(script, /capturePanel\.classList\.add\("is-open"\)/);
  assert.match(script, /host\.style\.position = "absolute"/);
  assert.match(script, /host\.style\.overflow = "visible"/);
  assert.match(script, /\.bud-canvas \{\n        position: absolute;/);
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
  assert.match(script, /class="bud-send-menu"/);
  assert.match(script, /data-feedback-action="share_feedback_and_start_work"/);
  assert.match(script, /data-feedback-action="preview_fix_first"/);
  assert.match(script, /Preview fix first/);
  assert.match(script, /Proposed fix/);
  assert.match(script, /Looks right/);
  assert.match(script, /Needs changes/);
  assert.match(script, /api\/manual-qa\/preview-proposal/);
  assert.match(script, /scheduleSessionRefresh/);
  assert.match(script, /data-feedback-action="share_feedback"/);
  assert.match(script, /openSendMenu\("all"/);
  assert.match(script, /openSendMenu\("item", item\.id/);
  assert.match(script, /chooseSendAction/);
  assert.match(script, /return "Video"/);
  assert.match(script, /return "Drawing"/);
  assert.match(script, /content: "Saved"/);
  assert.match(script, /const saved = await autoSaveDrawingIfNeeded\(\{ clearAfterSave: true \}\)/);
  assert.match(script, /resetDrawingSurface/);
  assert.match(script, /ensureCanvasReady/);
  assert.match(script, /documentCanvasSize/);
  assert.match(script, /canvas\.style\.width = cssWidth \+ "px"/);
  assert.match(script, /context\.setTransform\(ratio, 0, 0, ratio, 0, 0\)/);
  assert.match(script, /context\.lineWidth = 4/);
  assert.match(script, /context\.quadraticCurveTo/);
  assert.match(script, /attachRecordingFrameSource\(displayStream\)/);
  assert.match(script, /buildDrawingDataUrl/);
  assert.match(script, /drawingCropRect/);
  assert.match(script, /intersectRects\(crop, viewport\)/);
  assert.match(script, /video\.videoWidth \/ Math\.max\(1, viewport\.width\)/);
  assert.match(script, /crop\.x \* ratio/);
  assert.match(script, /Sent\. Agent can start work now/);
  assert.match(script, /normalizeRecordingContentType/);
  assert.match(script, /new Blob\(\[blob\], \{ type: safeContentType \}\)/);
  assert.match(script, /beforeusersdo:open:/);
  assert.match(script, /rememberWidgetOpen\(true\)/);
  assert.match(script, /rememberWidgetOpen\(false\)/);
  assert.match(script, /openWidget\(\{ load: false \}\)/);
  assert.match(script, /stopRecordingAndWait/);
  assert.match(script, /recordingSaving: false/);
  assert.match(script, /RECORDING_SEGMENT_MS = 10000/);
  assert.match(script, /RECORDING_SAVE_WAIT_MS = 45000/);
  assert.match(script, /Screen sharing stopped\. Saving recording/);
  assert.match(script, /Recording screen and voice\. Video saves automatically\./);
  assert.match(script, /Recording started\. Segments save automatically\./);
  assert.match(script, /Video segments are still saving\. Keep this tab open and press Send again\./);
  assert.match(script, /Other feedback will still be sent/);
  assert.match(script, /startRecordingSegment/);
  assert.match(script, /review-recording-part-/);
  assert.match(script, /Video recording segment/);
  assert.match(script, /savedVideoEvidenceCount/);
  assert.match(script, /Math\.max\(state\.recordingSegmentIndex, savedVideoEvidenceCount\(selectedItem\(\)\)\)/);
  assert.match(script, /videoBitsPerSecond: 600000/);
  assert.match(script, /label: "Drawing annotation"/);
  assert.match(script, /isFreestyleMode/);
  assert.match(script, /bud-panel\.is-freestyle/);
  assert.match(script, /page_visits: state\.pageVisits/);
  assert.match(script, /transcript_events: state\.transcriptEvents/);
  assert.match(script, /evidence_events: state\.evidenceEvents/);
  assert.match(script, /topic_segments: Array\.isArray\(existingContext\.topic_segments\)/);
  assert.match(script, /data-role="live"/);
  assert.match(script, /Live items/);
  assert.match(script, /workPacketsForItem/);
  assert.match(script, /renderLiveItems/);
  assert.match(script, /Live item ready for agent/);
  assert.match(script, /SpeechRecognition/);
  assert.match(script, /pushTranscriptEvent/);
  assert.match(script, /scheduleLiveContextSave/);
  assert.match(script, /runLiveContextSave/);
  assert.match(script, /liveSaveInFlight/);
  assert.match(script, /pushEvidenceEvent\("drawing_saved"/);
  assert.match(script, /pushEvidenceEvent\("video_saved"/);
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
  assert.doesNotMatch(script, /state\.recordingSegmentIndex = 0/);
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
    reviewed: 0,
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
  assert.equal(built.session.context.agent_action_mode, "fix_and_retest");
  assert.equal(built.session.context.feedback_action, "share_feedback_and_start_work");
  assert.equal(built.session.context.auto_start_work, true);
  assert.equal(built.session.status, "manual_ready");
  assert.equal(built.session.checklist.length, 1);
  assert.equal(built.session.checklist[0].id, "freestyle");
  assert.equal(built.session.checklist[0].title, "Freestyle QA");
  assert.equal(built.session.checklist[0].status, "pending");
  assert.deepEqual(built.session.checklist[0].evidence_media, []);
  assert.equal(built.widgetInstall.review_url, "https://preview.example.com/app");
});

test("first-party manual QA review links open with widget boot params", () => {
  const built = buildManualQaSessionPayload(
    {
      session_id: "manual_first_party",
      target_url: "https://beforeusersdo.com/?existing=1",
      review_mode: "freestyle",
      work_summary: "Review homepage."
    },
    {
      publicBaseUrl: "https://beforeusersdo.com"
    }
  );

  assert.equal(built.ok, true);
  const scriptUrl = new URL(built.widgetInstall.script_url);
  const reviewUrl = new URL(built.widgetInstall.review_url);
  assert.equal(reviewUrl.origin, "https://beforeusersdo.com");
  assert.equal(reviewUrl.searchParams.get("existing"), "1");
  assert.equal(reviewUrl.searchParams.get("bud_session_id"), "manual_first_party");
  assert.equal(reviewUrl.searchParams.get("bud_token"), scriptUrl.searchParams.get("token"));
  assert.equal(built.widgetInstall.checklist_review_urls[0].review_url, built.widgetInstall.review_url);
});

test("manual QA feedback markdown can be report-only instead of auto-fix", () => {
  const built = buildManualQaSessionPayload(
    {
      target_url: "https://preview.example.com",
      review_mode: "freestyle",
      feedback_action: "share_feedback",
      work_summary: "Review homepage messaging."
    },
    {
      publicBaseUrl: "https://beforeusersdo.com"
    }
  );

  assert.equal(built.ok, true);
  assert.equal(built.session.context.agent_action_mode, "report_only");
  assert.equal(built.session.context.feedback_action, "share_feedback");
  assert.equal(built.session.context.auto_start_work, false);
  const markdown = buildManualQaAgentFeedbackMarkdown(built.session);
  assert.match(markdown, /Mode: share feedback only/);
  assert.match(markdown, /Do not edit code, deploy, or create a replacement QA link/);
  assert.doesNotMatch(markdown, /Fix the target product\/code/);
});

test("manual QA feedback markdown can request a preview before coding", () => {
  const built = buildManualQaSessionPayload(
    {
      target_url: "https://preview.example.com",
      review_mode: "freestyle",
      feedback_action: "preview_fix_first",
      work_summary: "User gave design feedback that needs confirmation before implementation."
    },
    {
      publicBaseUrl: "https://beforeusersdo.com"
    }
  );

  assert.equal(built.ok, true);
  assert.equal(built.session.context.agent_action_mode, "preview_then_fix");
  assert.equal(built.session.context.feedback_action, "preview_fix_first");
  assert.equal(built.session.context.auto_start_work, false);
  const markdown = buildManualQaAgentFeedbackMarkdown(built.session);
  assert.match(markdown, /Mode: preview fix first/);
  assert.match(markdown, /Produce a proposed future-state preview before implementation/);
  assert.match(markdown, /Ask the user to confirm or correct the preview/);
  assert.doesNotMatch(markdown, /Mode: share feedback and auto-start work/);
});

test("manual QA evidence becomes agent work packets with page anchors", () => {
  const session = {
    session_id: "manual_packets",
    title: "Packet test",
    target_url: "https://preview.example.com/app?token=secret",
    checklist: [
      {
        id: "freestyle",
        title: "Freestyle capture",
        status: "reviewed",
        start_url: "https://preview.example.com/app?token=secret",
        note: "The hero top section still feels wrong and the CTA copy is unclear.",
        evidence_urls: ["https://beforeusersdo.com/api/manual-qa/evidence?session_id=manual_packets&item_id=freestyle&index=0&token=secret"],
        evidence_media: [
          {
            kind: "video",
            label: "Video recording segment 1",
            content_type: "video/webm",
            url: "https://beforeusersdo.com/api/manual-qa/evidence?session_id=manual_packets&item_id=freestyle&index=1&token=secret"
          }
        ],
        widget_context: {
          page_url: "https://preview.example.com/app?token=secret",
          page_title: "Preview App",
          viewport: { width: 1512, height: 772, device_pixel_ratio: 2 },
          transcript_events: [
            {
              text: "This top section is the part that feels wrong. It should explain the MCP first.",
              at: "2026-07-05T17:12:20.000Z"
            }
          ],
          evidence_events: [
            {
              type: "drawing_saved",
              label: "Drawing annotation",
              at: "2026-07-05T17:12:24.000Z",
              media_url: "https://beforeusersdo.com/api/manual-qa/evidence?session_id=manual_packets&item_id=freestyle&index=0&token=secret",
              bounds: { x: 110, y: 140, width: 320, height: 180 },
              stroke_count: 3
            },
            {
              type: "video_segment_saved",
              label: "Video recording segment 1",
              at: "2026-07-05T17:12:30.000Z",
              duration_ms: 10000
            }
          ],
          network_events: [
            {
              type: "fetch",
              method: "GET",
              status: 500,
              url: "https://preview.example.com/api/hero?token=secret",
              at: "2026-07-05T17:12:28.000Z"
            }
          ]
        }
      }
    ]
  };

  const packets = buildManualQaWorkPackets(session);
  assert.equal(packets.length >= 2, true);
  const drawingPacket = packets.find((packet) => packet.source_kind === "drawing");
  const technicalPacket = packets.find((packet) => packet.source_kind === "technical");
  assert.ok(drawingPacket);
  assert.ok(technicalPacket);
  assert.match(drawingPacket.page_anchor.url, /token=%5Bredacted%5D/);
  assert.deepEqual(drawingPacket.page_anchor.bounds, { x: 110, y: 140, width: 320, height: 180 });
  assert.match(drawingPacket.transcript_snippets.join(" "), /MCP first/);
  assert.match(drawingPacket.evidence_urls[0], /token=%5Bredacted%5D/);
  assert.match(technicalPacket.technical_signals[0].url, /token=%5Bredacted%5D/);
  assert.match(technicalPacket.agent_task, /Investigate and fix/);

  const markdown = buildManualQaAgentFeedbackMarkdown(session);
  assert.match(markdown, /## Work Packets/);
  assert.match(markdown, /Use these as separate agent or sub-agent tasks/);
  assert.match(markdown, /Packet ID:/);
  assert.match(markdown, /Drawn area: 320x180 at 110,140/);
  assert.doesNotMatch(markdown, /token=secret/);
});

test("manual QA transcript segments become topic work packets through an LLM segmenter", async () => {
  const mock = createSupabaseFetchMock();
  const created = await createManualQaSession(
    {
      target_url: "https://beforeusersdo.com/",
      brand: "beforeusersdo",
      title: "Freestyle topic pass",
      review_mode: "freestyle",
      work_summary: "Open-ended homepage review."
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
  const item = created.session.checklist[0];
  assert.equal(created.ok, true);
  let segmenterInput = null;
  const updated = await updateManualQaItem(
    created.session.session_id,
    item.id,
    {
      widget_context: {
        page_url: "https://beforeusersdo.com/",
        page_title: "Before Users Do QA MCP",
        transcript_events: [
          { text: "The hero headline is not clear about the MCP.", at: "2026-07-06T03:00:00.000Z", is_final: true },
          { text: "The main button should say what happens after clicking.", at: "2026-07-06T03:00:07.000Z", is_final: true },
          { text: "The pricing section later on feels separate and needs a simpler explanation.", at: "2026-07-06T03:00:40.000Z", is_final: true }
        ],
        evidence_events: [
          {
            type: "drawing_saved",
            label: "Drawing annotation",
            at: "2026-07-06T03:00:06.000Z",
            bounds: { x: 120, y: 90, width: 420, height: 160 }
          }
        ]
      }
    },
    {
      authOk: true,
      ownerUserId: "user_1",
      fetchImpl: mock.fetchImpl,
      supabaseUrl: "https://supabase.example.com",
      serviceKey: "service",
      topicSegmenter(input) {
        segmenterInput = input;
        return {
          topic_segments: [
            {
              title: "Hero and primary CTA clarity",
              summary: "The reviewer is focused on the homepage hero and what the MCP CTA promises.",
              start_index: 0,
              end_index: 1,
              confidence: 0.92
            },
            {
              title: "Pricing explanation",
              summary: "The reviewer moved to pricing clarity as a separate topic.",
              start_index: 2,
              end_index: 2,
              confidence: 0.86
            }
          ]
        };
      }
    }
  );

  assert.equal(updated.ok, true);
  assert.equal(segmenterInput.transcript_events.length, 3);
  assert.equal(updated.item.widget_context.topic_segments.length, 2);
  assert.equal(updated.item.widget_context.topic_segments[0].title, "Hero and primary CTA clarity");
  const topicPackets = updated.session.work_packets.filter((packet) => packet.source_kind === "topic");
  assert.equal(topicPackets.length, 2);
  assert.equal(topicPackets[0].title, "Hero and primary CTA clarity");
  assert.match(topicPackets[0].transcript_snippets.join(" "), /main button/);
  assert.deepEqual(topicPackets[0].page_anchor.bounds, { x: 120, y: 90, width: 420, height: 160 });
  assert.equal(updated.session.work_packets.some((packet) => packet.source_kind === "feedback"), false);
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

test("manual QA preview proposal is saved, shown to widget sessions, and can be approved", async () => {
  const previousEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY
  };
  const previousFetch = globalThis.fetch;
  const mock = createSupabaseFetchMock();
  process.env.SUPABASE_URL = "https://supabase-preview.example.com";
  process.env.SUPABASE_SERVICE_KEY = "service";
  globalThis.fetch = mock.fetchImpl;

  try {
    const created = await createManualQaSession(
      {
        target_url: "https://preview.example.com/?token=abc123",
        brand: "Example",
        title: "Preview proposal pass",
        work_summary: "User asked to preview the fix before coding.",
        feedback_action: "preview_fix_first"
      },
      {
        publicBaseUrl: "https://beforeusersdo.com",
        ownerUserId: "user_preview",
        ownerEmail: "owner@example.com",
        fetchImpl: mock.fetchImpl,
        supabaseUrl: "https://supabase-preview.example.com",
        serviceKey: "service"
      }
    );
    const widgetToken = new URL(created.widget_install.script_url).searchParams.get("token");

    const saved = await recordManualQaPreviewProposal(
      created.session.session_id,
      {
        title: "Cleaner hero preview",
        summary: "Replace the confusing top hero with a simpler MCP-first message.",
        changes: ["Make MCP install the primary CTA.", "Keep proof/report card in the right column."],
        expected_behavior: ["User can understand what BeforeUsersDo does without reading the whole page."],
        visual_preview_url: "https://assets.example.com/mock.png?token=secret"
      },
      {
        authOk: true,
        ownerUserId: "user_preview",
        ownerEmail: "owner@example.com",
        fetchImpl: mock.fetchImpl,
        supabaseUrl: "https://supabase-preview.example.com",
        serviceKey: "service"
      }
    );

    assert.equal(saved.ok, true);
    assert.equal(saved.proposal.status, "draft");
    assert.equal(saved.proposal.title, "Cleaner hero preview");
    assert.deepEqual(saved.proposal.changes, ["Make MCP install the primary CTA.", "Keep proof/report card in the right column."]);
    assert.match(saved.proposal.visual_preview_url, /token=%5Bredacted%5D/);

    const widgetLoaded = await getManualQaWidgetSession(created.session.session_id, widgetToken, {
      fetchImpl: mock.fetchImpl,
      supabaseUrl: "https://supabase-preview.example.com",
      serviceKey: "service"
    });
    assert.equal(widgetLoaded.ok, true);
    assert.equal(widgetLoaded.session.preview_proposal.title, "Cleaner hero preview");
    assert.match(widgetLoaded.session.preview_proposal.visual_preview_url, /token=%5Bredacted%5D/);

    const approved = await callWidgetPreviewProposalHandler(
      {
        session_id: created.session.session_id,
        token: widgetToken,
        status: "approved",
        response_note: "Looks good."
      },
      widgetToken
    );
    assert.equal(approved.statusCode, 200);
    assert.equal(approved.body.ok, true);
    assert.equal(approved.body.preview_proposal.status, "approved");
    assert.equal(approved.body.preview_proposal.response_note, "Looks good.");
    assert.ok(approved.body.preview_proposal.responded_at);
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
            {
              method: "GET",
              status: 500,
              url: "https://preview.example.com/api/cards?token=abc123",
              message: "https://preview.example.com/api/cards?token=abc123"
            }
          ],
          transcript_events: [
            {
              text: "The card copy is still too generic and I circled the headline.",
              source: "web_speech",
              confidence: 0.91,
              is_final: true,
              at: "2026-07-05T10:00:20.000Z"
            }
          ],
          evidence_events: [
            {
              type: "drawing_saved",
              label: "Drawing annotation",
              started_at: "2026-07-05T10:00:18.000Z",
              ended_at: "2026-07-05T10:00:22.000Z",
              at: "2026-07-05T10:00:22.000Z",
              stroke_count: 4,
              bounds: { x: 100, y: 120, width: 320, height: 90 },
              media_url: "https://beforeusersdo.com/api/manual-qa/evidence?session_id=feedback&item_id=item&index=0&token=abc123"
            },
            {
              type: "video_saved",
              label: "Video recording segment 1",
              started_at: "2026-07-05T10:00:10.000Z",
              ended_at: "2026-07-05T10:00:20.000Z",
              duration_ms: 10000,
              media_url: "https://beforeusersdo.com/api/manual-qa/evidence?session_id=feedback&item_id=item&index=1&token=abc123"
            }
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
    assert.match(
      updated.item.widget_context.network_events[1].message,
      /token=%5Bredacted%5D/
    );
    assert.doesNotMatch(updated.item.widget_context.network_events[1].message, /abc123/);

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
    assert.match(directMarkdown, /Processed Evidence Digest/);
    assert.match(directMarkdown, /Transcript snippets:/);
    assert.match(directMarkdown, /The card copy is still too generic and I circled the headline/);
    assert.match(directMarkdown, /Drawings with nearby speech:/);
    assert.match(directMarkdown, /Nearby speech:/);
    assert.match(directMarkdown, /Evidence timeline:/);
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
        item_id: item.id,
        feedback_action: "share_feedback"
      },
      widgetToken
    );

    assert.equal(feedback.statusCode, 200);
    assert.equal(feedback.body.ok, true);
    assert.equal(feedback.body.scope, "item");
    assert.equal(feedback.body.feedback_action, "share_feedback");
    assert.equal(feedback.body.agent_delivery.ready, true);
    assert.ok(feedback.body.feedback_id);
    assert.equal(feedback.body.session.agent_feedback.ready, true);
    assert.equal(feedback.body.session.agent_feedback.latest.scope, "item");
    assert.equal(feedback.body.session.agent_feedback.latest.item_id, item.id);
    assert.equal(feedback.body.session.agent_feedback.latest.feedback_action, "share_feedback");
    assert.equal(feedback.body.session.agent_feedback.latest.agent_action_mode, "report_only");
    assert.equal(feedback.body.session.agent_feedback.latest.auto_start_work, false);
    assert.match(feedback.body.session.agent_feedback.latest.markdown, /BeforeUsersDo Manual QA Feedback/);
    assert.match(feedback.body.markdown, /BeforeUsersDo Manual QA Feedback/);
    assert.match(feedback.body.markdown, /Required Agent Next Steps/);
    assert.match(feedback.body.markdown, /Mode: share feedback only/);
    assert.match(feedback.body.markdown, /Do not edit code, deploy, or create a replacement QA link/);
    assert.doesNotMatch(feedback.body.markdown, /Treat this feedback as user instructions/);
    assert.doesNotMatch(feedback.body.markdown, /Fix the target product\/code/);
    assert.match(feedback.body.markdown, /The card still shows generic copy/);
    assert.match(feedback.body.markdown, /Processed Evidence Digest/);
    assert.match(feedback.body.markdown, /Drawing context: 1 drawing\/annotation event captured/);
    assert.match(feedback.body.markdown, /Transcript captured: 1 snippet/);
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

test("freestyle widget Send All marks the capture reviewed", async () => {
  const previousEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY
  };
  const previousFetch = globalThis.fetch;
  const mock = createSupabaseFetchMock();
  process.env.SUPABASE_URL = "https://supabase-freestyle-feedback.example.com";
  process.env.SUPABASE_SERVICE_KEY = "service";
  globalThis.fetch = mock.fetchImpl;

  try {
    const created = await createManualQaSession(
      {
        target_url: "https://preview.example.com",
        brand: "Example",
        title: "Freestyle feedback pass",
        review_mode: "freestyle",
        freestyle_prompt: "Record anything confusing."
      },
      {
        publicBaseUrl: "https://beforeusersdo.com",
        ownerUserId: "user_1",
        fetchImpl: mock.fetchImpl,
        supabaseUrl: "https://supabase-freestyle-feedback.example.com",
        serviceKey: "service"
      }
    );
    const widgetToken = new URL(created.widget_install.script_url).searchParams.get("token");

    const feedback = await callWidgetFeedbackHandler(
      {
        session_id: created.session.session_id,
        token: widgetToken,
        scope: "all"
      },
      widgetToken
    );

    assert.equal(feedback.statusCode, 200);
    assert.equal(feedback.body.ok, true);
    assert.equal(feedback.body.session.status, "manual_completed");
    assert.equal(feedback.body.session.counts.reviewed, 1);
    assert.equal(feedback.body.session.counts.pending, 0);
    assert.equal(feedback.body.session.checklist[0].status, "reviewed");
    assert.match(feedback.body.markdown, /1 reviewed/);
    assert.match(feedback.body.markdown, /Required Agent Next Steps/);
    assert.match(feedback.body.markdown, /Create a fresh BeforeUsersDo manual QA session\/link/);
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

test("widget evidence endpoint saves recording segments directly", async () => {
  const previousEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    QA_EVIDENCE_STORAGE_BUCKET: process.env.QA_EVIDENCE_STORAGE_BUCKET
  };
  const previousFetch = globalThis.fetch;
  const mock = createSupabaseAndStorageFetchMock();
  process.env.SUPABASE_URL = "https://supabase-segments.example.com";
  process.env.SUPABASE_SERVICE_KEY = "service";
  process.env.QA_EVIDENCE_STORAGE_BUCKET = "qa-evidence";
  globalThis.fetch = mock.fetchImpl;

  try {
    const created = await createManualQaSession(
      {
        target_url: "https://preview.example.com",
        brand: "Example",
        title: "Segment upload pass",
        acceptance_criteria: ["Recording segments can be uploaded as evidence."]
      },
      {
        publicBaseUrl: "https://beforeusersdo.com",
        ownerUserId: "user_1",
        fetchImpl: mock.fetchImpl,
        supabaseUrl: "https://supabase-segments.example.com",
        serviceKey: "service"
      }
    );
    const item = created.session.checklist[0];
    const widgetToken = new URL(created.widget_install.script_url).searchParams.get("token");

    const uploaded = await callWidgetEvidenceHandler(
      {
        session_id: created.session.session_id,
        token: widgetToken,
        item_id: item.id,
        kind: "video",
        label: "Video recording segment 1",
        filename: "review-recording-part-001.webm",
        content_type: "video/webm",
        data_url: `data:video/webm;base64,${Buffer.from("segment-one").toString("base64")}`
      },
      widgetToken
    );

    assert.equal(uploaded.statusCode, 201);
    assert.equal(uploaded.body.item.evidence_media.length, 1);
    assert.equal(uploaded.body.item.evidence_media[0].kind, "video");
    assert.equal(uploaded.body.item.evidence_media[0].label, "Video recording segment 1");
    assert.equal(uploaded.body.item.evidence_media[0].byte_length, Buffer.byteLength("segment-one"));
    assert.match(uploaded.body.evidence_url, /api\/manual-qa\/evidence/);
    const markdown = buildManualQaAgentFeedbackMarkdown(uploaded.body.session, { item_id: item.id });
    assert.match(markdown, /Video recording \(Video recording segment 1, video\/webm, 11 B/);
    const storedVideo = mock.objects.get(uploaded.body.item.evidence_media[0].storage_path);
    assert.equal(storedVideo.data.toString(), "segment-one");
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
