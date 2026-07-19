const assert = require("node:assert/strict");
const test = require("node:test");

const {
  appendManualQaItemEvidence,
  buildManualQaAgentFeedbackMarkdown,
  buildManualQaCaptureSessionView,
  buildManualQaChecklist,
  buildManualQaCustomerReportMarkdown,
  buildManualQaRecordingFingerprint,
  buildManualQaRecordingSetFingerprint,
  buildManualQaSessionPayload,
  buildSafeExportSession,
  buildManualQaWorkPackets,
  claimManualQaFindingsAnalysis,
  collectManualQaRecordingMedia,
  createManualQaSession,
  exportManualQaSession,
  getManualQaSession,
  getManualQaWidgetSession,
  listManualQaSessions,
  normalizeManualQaSessionRow,
  redactSensitiveUrl,
  recordManualQaPostFixReview,
  recordManualQaPreviewProposal,
  reserveManualQaEvidenceUploadBytes,
  resolveCurrentManualQaFindingsAnalysis,
  queueManualQaFindingsAnalysis,
  updateManualQaFindingsAnalysis,
  updateManualQaWidgetItem,
  updateManualQaItem,
  updateManualQaQualificationTrial,
  __private: manualQaPrivate
} = require("../lib/manual-qa");
const widgetEvidenceChunksHandler = require("../api/manual-qa/widget-evidence-chunks");
const widgetEvidenceHandler = require("../api/manual-qa/widget-evidence");
const widgetFeedbackHandler = require("../api/manual-qa/widget-feedback");
const widgetSessionHandler = require("../api/manual-qa/widget-session");
const widgetPostFixReviewHandler = require("../api/manual-qa/post-fix-review");
const widgetPreviewProposalHandler = require("../api/manual-qa/preview-proposal");
const { buildManualQaWidgetScript } = require("../lib/manual-qa-widget");

function createSupabaseFetchMock() {
  const rows = new Map();
  const events = [];
  const calls = [];
  const controls = { failNextReportPatch: false };

  async function fetchImpl(url, options = {}) {
    calls.push({ url, options });
    const parsed = new URL(url);
    if (parsed.pathname === "/rest/v1/swarmtest_manual_qa_events") {
      if (options.method === "POST") {
        const body = JSON.parse(options.body || "[]");
        const inserted = [];
        for (const candidate of body) {
          if (events.some((entry) => entry.event_id === candidate.event_id)) continue;
          const row = { id: events.length + 1, ...candidate };
          events.push(row);
          inserted.push(row);
        }
        return {
          ok: true,
          status: 201,
          async json() {
            return inserted;
          }
        };
      }
      const sessionFilter = parsed.searchParams.get("session_id") || "";
      const sessionId = sessionFilter.startsWith("eq.") ? sessionFilter.slice(3) : "";
      return {
        ok: true,
        status: 200,
        async json() {
          return events.filter((entry) => !sessionId || entry.session_id === sessionId);
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
      if (controls.failNextReportPatch) {
        controls.failNextReportPatch = false;
        return {
          ok: false,
          status: 503,
          async json() {
            return { message: "temporary snapshot failure" };
          }
        };
      }
      const current = rows.get(runId);
      const currentAnalysis = current?.payload?.manual_qa?.findings_analysis || {};
      const currentEvidenceQuota = current?.payload?.manual_qa?.evidence_upload_quota || {};
      const currentTrial = current?.payload?.manual_qa?.qualification_trial || {};
      const casValues = new Map([
        ["delivered_at", current?.delivered_at ?? null],
        ["payload->manual_qa->qualification_trial->>submitted_at", currentTrial.submitted_at ?? null],
        [
          "payload->manual_qa->evidence_upload_quota->>reserved_bytes",
          Object.prototype.hasOwnProperty.call(currentEvidenceQuota, "reserved_bytes")
            ? currentEvidenceQuota.reserved_bytes
            : null
        ],
        ["payload->manual_qa->findings_analysis->>analysis_id", currentAnalysis.analysis_id ?? null],
        ["payload->manual_qa->findings_analysis->>lease_id", currentAnalysis.lease_id ?? null],
        ["payload->manual_qa->findings_analysis->>status", currentAnalysis.status ?? null],
        ["payload->manual_qa->findings_analysis->>processed_media_count", currentAnalysis.processed_media_count ?? null],
        ["payload->manual_qa->findings_analysis->>attempt_count", currentAnalysis.attempt_count ?? null],
        ["payload->manual_qa->findings_analysis->>lease_expires_at", currentAnalysis.lease_expires_at ?? null],
        ["payload->manual_qa->findings_analysis->>completed_at", currentAnalysis.completed_at ?? null],
        ["payload->manual_qa->findings_analysis->>error_code", currentAnalysis.error_code ?? null],
        [
          "payload->manual_qa->findings_analysis->>recording_fingerprint",
          currentAnalysis.recording_fingerprint ?? null
        ]
      ]);
      const casMismatch = Array.from(casValues).some(([key, currentValue]) => {
        if (!parsed.searchParams.has(key)) return false;
        const filter = parsed.searchParams.get(key);
        if (filter === "is.null") return currentValue !== null && currentValue !== undefined && currentValue !== "";
        if (filter?.startsWith("eq.")) return String(currentValue ?? "") !== filter.slice(3);
        return true;
      });
      if (casMismatch) {
        return {
          ok: true,
          status: 200,
          async json() {
            return [];
          }
        };
      }
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

  return { fetchImpl, rows, events, calls, controls };
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

function makeFinalRecording(sessionId, index, overrides = {}) {
  return {
    evidence_id: `video-${index}`,
    kind: "video",
    label: `Trial recording segment ${index}`,
    content_type: "video/webm",
    storage_bucket: "qa-evidence",
    storage_path: `${sessionId}/manual-widget-video/video-${index}.webm`,
    byte_length: 1000 + index,
    duration_ms: 10000,
    ...overrides
  };
}

function makeUploadWebm(value = "") {
  return Buffer.concat([
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
    Buffer.from(String(value))
  ]);
}

function makeCompleteRecordingAnalysis(session, overrides = {}) {
  const normalizedRecordings = collectManualQaRecordingMedia(session);
  return {
    analysis_id: "recording_complete_test",
    status: "complete",
    source: "recording_transcript",
    media_count: normalizedRecordings.length,
    processed_media_count: normalizedRecordings.length,
    transcript_event_count: 0,
    attempt_count: 1,
    recording_fingerprint: buildManualQaRecordingFingerprint(normalizedRecordings),
    completed_at: "2026-07-19T04:10:00.000Z",
    retryable: false,
    clip_results: normalizedRecordings.map((recording) => ({
      evidence_id: recording.evidence_id,
      item_id: recording.item_id,
      recording_index: recording.recording_index,
      status: "complete",
      duration_ms: recording.duration_ms ?? 10000,
      speech_segments: [],
      visual_events: [],
      summary: "No speech or meaningful visual event was captured.",
      confidence: 1
    })),
    findings: [],
    ...overrides
  };
}

function createSupabaseAndStorageFetchMock() {
  const rows = new Map();
  const events = [];
  const objects = new Map();
  const calls = [];

  async function fetchImpl(url, options = {}) {
    calls.push({ url, options });
    const parsed = new URL(url);

    if (parsed.pathname === "/rest/v1/swarmtest_manual_qa_events") {
      if (options.method === "POST") {
        const body = JSON.parse(options.body || "[]");
        const inserted = [];
        for (const candidate of body) {
          if (events.some((entry) => entry.event_id === candidate.event_id)) continue;
          const row = { id: events.length + 1, ...candidate };
          events.push(row);
          inserted.push(row);
        }
        return {
          ok: true,
          status: 201,
          async json() {
            return inserted;
          }
        };
      }
      const sessionFilter = parsed.searchParams.get("session_id") || "";
      const sessionId = sessionFilter.startsWith("eq.") ? sessionFilter.slice(3) : "";
      return {
        ok: true,
        status: 200,
        async json() {
          return events.filter((entry) => !sessionId || entry.session_id === sessionId);
        }
      };
    }

    if (parsed.pathname === "/storage/v1/bucket") {
      return {
        ok: true,
        status: 200,
        async json() {
          return { id: "qa-evidence" };
        }
      };
    }

    if (parsed.pathname === "/storage/v1/object/list-v2/qa-evidence") {
      const body = JSON.parse(options.body || "{}");
      const prefix = String(body.prefix || "");
      const offset = Math.max(0, Number(body.cursor) || 0);
      const limit = Math.max(1, Number(body.limit) || 1000);
      const entries = Array.from(objects.entries())
        .filter(([objectPath]) => !prefix || objectPath.startsWith(prefix))
        .slice(offset, offset + limit)
        .map(([name, stored]) => ({ name, metadata: { size: stored.data.length } }));
      return {
        ok: true,
        status: 200,
        async json() {
          const hasNext = offset + entries.length < Array.from(objects.keys())
            .filter((objectPath) => !prefix || objectPath.startsWith(prefix)).length;
          return {
            objects: entries,
            folders: [],
            hasNext,
            ...(hasNext ? { nextCursor: String(offset + entries.length) } : {})
          };
        }
      };
    }

    if (parsed.pathname === "/storage/v1/object/qa-evidence" && options.method === "DELETE") {
      const body = JSON.parse(options.body || "{}");
      for (const objectPath of Array.isArray(body.prefixes) ? body.prefixes : []) {
        objects.delete(objectPath);
      }
      return {
        ok: true,
        status: 200,
        async json() {
          return { message: "Deleted" };
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
      const currentAnalysis = current?.payload?.manual_qa?.findings_analysis || {};
      const currentEvidenceQuota = current?.payload?.manual_qa?.evidence_upload_quota || {};
      const currentTrial = current?.payload?.manual_qa?.qualification_trial || {};
      const casValues = new Map([
        ["delivered_at", current?.delivered_at ?? null],
        ["payload->manual_qa->qualification_trial->>submitted_at", currentTrial.submitted_at ?? null],
        [
          "payload->manual_qa->evidence_upload_quota->>reserved_bytes",
          Object.prototype.hasOwnProperty.call(currentEvidenceQuota, "reserved_bytes")
            ? currentEvidenceQuota.reserved_bytes
            : null
        ],
        ["payload->manual_qa->findings_analysis->>analysis_id", currentAnalysis.analysis_id ?? null],
        ["payload->manual_qa->findings_analysis->>lease_id", currentAnalysis.lease_id ?? null],
        ["payload->manual_qa->findings_analysis->>status", currentAnalysis.status ?? null],
        ["payload->manual_qa->findings_analysis->>processed_media_count", currentAnalysis.processed_media_count ?? null],
        ["payload->manual_qa->findings_analysis->>attempt_count", currentAnalysis.attempt_count ?? null],
        ["payload->manual_qa->findings_analysis->>lease_expires_at", currentAnalysis.lease_expires_at ?? null],
        ["payload->manual_qa->findings_analysis->>completed_at", currentAnalysis.completed_at ?? null],
        ["payload->manual_qa->findings_analysis->>error_code", currentAnalysis.error_code ?? null],
        ["payload->manual_qa->findings_analysis->>recording_fingerprint", currentAnalysis.recording_fingerprint ?? null]
      ]);
      const casMismatch = Array.from(casValues).some(([key, currentValue]) => {
        if (!parsed.searchParams.has(key)) return false;
        const filter = parsed.searchParams.get(key);
        if (filter === "is.null") return currentValue !== null && currentValue !== undefined && currentValue !== "";
        if (filter?.startsWith("eq.")) return String(currentValue ?? "") !== filter.slice(3);
        return true;
      });
      if (casMismatch) {
        return {
          ok: true,
          status: 200,
          async json() {
            return [];
          }
        };
      }
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

  return { fetchImpl, rows, events, objects, calls };
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

async function callWidgetSessionHandler(sessionId, token) {
  const req = {
    method: "GET",
    headers: {
      host: "beforeusersdo.com",
      "x-forwarded-proto": "https",
      "x-bud-widget-token": token
    },
    query: { session_id: sessionId, token }
  };
  const res = createRes();
  await widgetSessionHandler(req, res);
  return res;
}

function addPrivateCaptureMarkers(mock, sessionId, itemId) {
  const row = mock.rows.get(sessionId);
  const manual = row.payload.manual_qa;
  manual.requested_by = {
    owner_user_id: "INTERNAL_OWNER_ID",
    owner_email: "owner-private@example.com",
    launched_by: "INTERNAL_ADMIN_MARKER"
  };
  manual.browser = {
    ...(manual.browser || {}),
    viewer_url: "https://INTERNAL_BROWSER_URL.example.com"
  };
  manual.context = {
    ...(manual.context || {}),
    developer_notes: "INTERNAL_DEVELOPER_MARKER",
    repository: "INTERNAL_REPOSITORY_MARKER"
  };
  manual.qualification_trial = {
    kind: "tester_qualification",
    status: "ready",
    product_name: "Example",
    test_focus: "Try the main flow",
    lead: { email: "lead-private@example.com" },
    tester: { email: "tester-private@example.com" },
    access: { tester_token_hash: "INTERNAL_TESTER_TOKEN_HASH" },
    benchmark: { issues: [{ id: "private", title: "INTERNAL_BENCHMARK_MARKER" }] }
  };
  manual.agent_feedback = {
    latest: { markdown: "INTERNAL_AGENT_FEEDBACK_MARKER" }
  };
  manual.post_fix_reviews = {
    latest: { summary: "INTERNAL_POST_FIX_MARKER" }
  };
  manual.findings_analysis = {
    status: "processing",
    model: "INTERNAL_ANALYSIS_MODEL",
    lease_id: "INTERNAL_ANALYSIS_LEASE"
  };
  manual.work_packets = [
    {
      packet_id: "capture-topic",
      source_kind: "topic",
      item_id: itemId,
      title: "Visible captured topic",
      summary: "Visible capture summary",
      agent_task: "INTERNAL_AGENT_TASK_MARKER"
    },
    {
      packet_id: "private-feedback",
      source_kind: "feedback",
      item_id: itemId,
      title: "INTERNAL_FEEDBACK_PACKET_MARKER"
    }
  ];
  return row;
}

function assertCaptureResponseSafe(responseBody) {
  const serialized = JSON.stringify(responseBody);
  for (const marker of [
    "owner-private@example.com",
    "lead-private@example.com",
    "tester-private@example.com",
    "INTERNAL_OWNER_ID",
    "INTERNAL_ADMIN_MARKER",
    "INTERNAL_BROWSER_URL",
    "INTERNAL_DEVELOPER_MARKER",
    "INTERNAL_REPOSITORY_MARKER",
    "INTERNAL_TESTER_TOKEN_HASH",
    "INTERNAL_BENCHMARK_MARKER",
    "INTERNAL_AGENT_FEEDBACK_MARKER",
    "INTERNAL_POST_FIX_MARKER",
    "INTERNAL_ANALYSIS_MODEL",
    "INTERNAL_ANALYSIS_LEASE",
    "INTERNAL_AGENT_TASK_MARKER",
    "INTERNAL_FEEDBACK_PACKET_MARKER"
  ]) {
    assert.equal(serialized.includes(marker), false, marker);
  }
  for (const key of [
    "requested_by",
    "qualification_trial",
    "browser",
    "widget",
    "agent_feedback",
    "post_fix_reviews",
    "findings_analysis",
    "event_journal"
  ]) {
    assert.equal(Object.prototype.hasOwnProperty.call(responseBody.session, key), false, key);
  }
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

async function callPostFixReviewHandler(body, headers = {}) {
  const req = {
    method: "POST",
    headers: {
      host: "beforeusersdo.com",
      "x-forwarded-proto": "https",
      "x-qa-service-token": "service-token",
      "x-owner-user-id": "user_review",
      "x-owner-email": "owner@example.com",
      ...headers
    },
    query: {},
    body
  };
  const res = createRes();
  await widgetPostFixReviewHandler(req, res);
  return res;
}

test("manual QA widget uses a movable compact capture tray", () => {
  const script = buildManualQaWidgetScript({
    sessionId: "manual-voice-smoke",
    token: "widget-token",
    apiBaseUrl: "https://beforeusersdo.com"
  });

  assert.doesNotThrow(() => new Function(script));
  assert.match(script, /replace\(\/\\s\+\/g, " "\)/);
  assert.doesNotMatch(script, /replace\(\/s\+\/g/);
  assert.doesNotMatch(script, /split\(\/s\+\//);
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
  assert.match(script, /\.bud-canvas\.is-visible/);
  assert.match(script, /state\.drawingHasInk = true/);
  assert.match(script, /makeDraggable\(pill, pill/);
  assert.match(script, /makeDraggable\(panel, panelDragHandle/);
  assert.match(script, /makeDraggable\(capturePanel, capturePanel/);
  assert.match(script, /class="bud-record" data-action="record"/);
  assert.match(script, /Record video/);
  assert.match(script, /data-action="draw"/);
  assert.match(script, /data-action="clear"/);
  assert.match(script, /data-action="comment"/);
  assert.match(script, /key === "d"/);
  assert.match(script, /key === "c"/);
  assert.match(script, /key === "e"/);
  assert.match(script, /key === "r"/);
  assert.match(script, /Alt\/Option \+ Shift \+ R/);
  assert.match(script, /event\.composedPath\(\)/);
  assert.match(script, /isTypingTarget\(root\.activeElement\)/);
  assert.match(script, /event\?\.altKey && event\?\.shiftKey/);
  assert.match(script, /!hasToolShortcutModifier\(event\)/);
  assert.match(script, /indexedDB\.open\(EVIDENCE_DB_NAME, 1\)/);
  assert.match(script, /EVIDENCE_STORE_NAME = "pending-uploads"/);
  assert.match(script, /widget-evidence-chunks/);
  assert.match(script, /ensurePendingEvidenceUploaded/);
  assert.match(script, /evidence_id: evidenceId/);
  assert.match(script, /data-role="comment-surface"/);
  assert.match(script, /data-role="comment-pins"/);
  assert.match(script, /data-role="comment-box"/);
  assert.match(script, /data-role="comment-input"/);
  assert.match(script, /What should change here\?/);
  assert.match(script, /Click anywhere to add a comment\./);
  assert.match(script, /pushEvidenceEvent\("comment_saved"/);
  assert.match(script, /openExistingComment/);
  assert.match(script, /Comment updated/);
  assert.match(script, /saveOpenCommentIfNeeded/);
  assert.match(script, /targetPathForElement/);
  assert.match(script, /target_path: draft\.target_path/);
  assert.match(script, /sameCommentPage/);
  assert.match(script, /positionCommentPin/);
  assert.match(script, /new MutationObserver\(scheduleCommentPinRefresh\)/);
  assert.match(script, /window\.addEventListener\("scroll", scheduleCommentPinRefresh, true\)/);
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
  assert.match(script, /bud-agent-modal/);
  assert.match(script, /Copy feedback/);
  assert.match(script, /If your agent is sleeping/);
  assert.match(script, /writeClipboardText/);
  assert.match(script, /document\.execCommand\("copy"\)/);
  assert.match(script, /Copied\. Paste it to your agent\./);
  assert.match(script, /normalizeRecordingContentType/);
  assert.match(script, /new Blob\(\[blob\], \{ type: safeContentType \}\)/);
  assert.match(script, /beforeusersdo:open:/);
  assert.match(script, /rememberWidgetOpen\(true\)/);
  assert.match(script, /rememberWidgetOpen\(false\)/);
  assert.match(script, /openWidget\(\{ load: false \}\)/);
  assert.match(script, /stopRecordingAndWait/);
  assert.match(script, /recordingSaving: false/);
  assert.match(script, /RECORDING_SEGMENT_MS = 30000/);
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
  assert.match(script, /const evidenceEvents = mergeEvidenceEvents/);
  assert.match(script, /evidence_events: evidenceEvents/);
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
  assert.match(script, /return "Comment"/);
  assert.match(script, /targetContextFromPoint/);
  assert.match(script, /recordPageVisit/);
  assert.doesNotMatch(script, /Say what you notice/);
  assert.doesNotMatch(script, /bud-capture-title/);
  assert.doesNotMatch(script, /bud-note-hint/);
  assert.doesNotMatch(script, /data-action="note-toggle"/);
  assert.doesNotMatch(script, /bud-note-popover/);
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

test("manual QA comment anchors survive widget context normalization", () => {
  const context = manualQaPrivate.normalizeWidgetContext({
    evidence_events: [
      {
        event_id: "comment_anchor_1",
        type: "comment_saved",
        comment_text: "Keep this note on the script section.",
        page_url: "https://example.com/editor",
        page_x: 420,
        page_y: 315,
        target_selector: 'section#script "Script"',
        target_path: '[id="script"] > textarea:nth-of-type(1)',
        target_anchor_x: 0.35,
        target_anchor_y: 0.72,
        target_bounds: { x: 300, y: 200, width: 600, height: 240 }
      }
    ]
  });

  assert.equal(context.evidence_events.length, 1);
  assert.equal(context.evidence_events[0].target_path, '[id="script"] > textarea:nth-of-type(1)');
  assert.equal(context.evidence_events[0].target_anchor_x, 0.35);
  assert.equal(context.evidence_events[0].target_anchor_y, 0.72);
  assert.deepEqual(context.evidence_events[0].target_bounds, { x: 300, y: 200, width: 600, height: 240 });
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
  const markdown = buildManualQaAgentFeedbackMarkdown(built.session);
  assert.match(markdown, /Mode: share feedback and auto-start work/);
  assert.match(markdown, /Independent Post-Fix Review Gate/);
  assert.match(markdown, /fresh contextless reviewer agent/);
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
  assert.doesNotMatch(markdown, /Independent Post-Fix Review Gate/);
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
  assert.match(markdown, /Independent Post-Fix Review Gate/);
  assert.match(markdown, /fresh contextless reviewer agent/);
  assert.match(markdown, /approved preview\/checklist/);
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
  assert.equal(technicalPacket.category, "bug");
  assert.match(technicalPacket.agent_task, /Investigate and fix/);

  const markdown = buildManualQaAgentFeedbackMarkdown(session);
  assert.match(markdown, /## Work Packets/);
  assert.match(markdown, /Use these as separate agent or sub-agent tasks/);
  assert.match(markdown, /Packet ID:/);
  assert.match(markdown, /Drawn area: 320x180 at 110,140/);
  assert.doesNotMatch(markdown, /token=secret/);
});

test("manual QA work packets classify only explicit human signals", () => {
  const buildPacket = (note) => buildManualQaWorkPackets({
    session_id: `manual_${note.slice(0, 8).replace(/\W/g, "")}`,
    target_url: "https://example.com",
    checklist: [
      {
        id: "freestyle",
        title: "First-time user review",
        status: "reviewed",
        note,
        widget_context: { page_url: "https://example.com" }
      }
    ]
  })[0];

  assert.equal(
    buildPacket("I wasn't able to click the button in Chrome, so I had to switch browsers.").category,
    "frustration_point"
  );
  assert.equal(
    buildPacket("Aha, now I understand that the workspace is where all projects live.").category,
    "aha_moment"
  );
  assert.equal(
    buildPacket("At first I was confused, but then it made sense.").category,
    "aha_moment"
  );
  assert.equal(
    buildPacket("The continue button did not work when I clicked it.").category,
    "bug"
  );
  assert.equal(
    buildPacket("The navigation uses a compact menu on smaller screens.").category,
    "observation"
  );

  const warningPacket = buildManualQaWorkPackets({
    session_id: "manual_warning_only",
    target_url: "https://example.com",
    checklist: [
      {
        id: "freestyle",
        title: "First-time user review",
        status: "reviewed",
        widget_context: {
          page_url: "https://example.com",
          console_events: [{ type: "warn", message: "Third-party cookie will be blocked in a future browser release." }]
        }
      }
    ]
  }).find((packet) => packet.source_kind === "technical");
  assert.ok(warningPacket);
  assert.equal(warningPacket.category, "observation");

  const mediaOnlyPackets = buildManualQaWorkPackets({
    session_id: "manual_media_only",
    target_url: "https://example.com",
    checklist: [
      {
        id: "freestyle",
        title: "Homepage review",
        status: "reviewed",
        evidence_media: [
          {
            evidence_id: "video-1",
            kind: "video",
            content_type: "video/webm",
            url: "https://beforeusersdo.com/api/manual-qa/evidence?session_id=manual_media_only&item_id=freestyle&evidence_id=video-1"
          }
        ]
      }
    ]
  });
  assert.deepEqual(mediaOnlyPackets, []);
});

test("customer human-test export matches the visible findings report without internal evidence", () => {
  const recordings = Array.from({ length: 82 }, (_, index) => ({
    evidence_id: `video-${index + 1}`,
    kind: "video",
    label: `Trial recording segment ${index + 1}`,
    content_type: "video/webm",
    storage_bucket: "qa-evidence",
    storage_path: `manual-ciaro/manual-widget-video/video-${index + 1}.webm`,
    byte_length: 1000 + index,
    duration_ms: 10000,
    url: `https://beforeusersdo.com/api/manual-qa/evidence?session_id=manual-ciaro&item_id=freestyle&evidence_id=video-${index + 1}`
  }));
  const markdown = buildManualQaCustomerReportMarkdown({
    session_id: "manual-ciaro",
    title: "Ciaro Pro free QA trial",
    brand_name: "Ciaro Pro",
    target_url: "https://ciaro.pro/",
    status: "manual_completed",
    updated_at: "2026-07-19T04:00:00.000Z",
    qualification_trial: {
      status: "submitted",
      submitted_at: "2026-07-19T03:21:00.000Z",
      test_focus: "Test the complete first-time-user journey.",
      qualification: { status: "pending_review", score: null }
    },
    context: {
      developer_notes: "INTERNAL ONLY: inspect the private benchmark and repository."
    },
    checklist: [
      {
        id: "freestyle",
        title: "Ciaro Pro qualification review",
        status: "reviewed",
        note: "I wasn't able to click the button when using Chrome, so it defaulted to a Safari test.",
        evidence_media: recordings
      }
    ]
  });

  assert.match(markdown, /# Ciaro Pro free QA trial/);
  assert.match(markdown, /Status: Preparing report/);
  assert.match(markdown, /queued for automatic video-and-transcript analysis/i);
  assert.match(markdown, /Submitted: 2026-07-19T03:21:00.000Z/);
  assert.doesNotMatch(markdown, /Submitted: 2026-07-19T04:00:00.000Z/);
  assert.doesNotMatch(markdown, /### Bugs|### Frustrations|### Aha moments/);
  assert.match(markdown, /wasn't able to click the button when using Chrome/);
  assert.match(markdown, /Tester note \(supplemental\)/);
  assert.match(markdown, /82 recording parts saved in the report/);
  assert.doesNotMatch(markdown, /Agent task|Packet ID|Evidence URLs|api\/manual-qa\/evidence|manual_completed|INTERNAL ONLY/);

  const completeClips = recordings.map((recording, index) => ({
    evidence_id: recording.evidence_id,
    item_id: "freestyle",
    recording_index: index + 1,
    status: "complete",
    duration_ms: 10000,
    speech_segments:
      index === 22
        ? [{ start_ms: 6000, end_ms: 9000, text: "I cannot tell what this button will do." }]
        : [],
    visual_events: []
  }));
  const recordingFingerprint = buildManualQaRecordingFingerprint(
    collectManualQaRecordingMedia({
      session_id: "manual-ciaro",
      checklist: [{ id: "freestyle", evidence_media: recordings }]
    })
  );
  const completeMarkdown = buildManualQaCustomerReportMarkdown({
    session_id: "manual-ciaro",
    title: "Ciaro Pro free QA trial",
    brand_name: "Ciaro Pro",
    target_url: "https://ciaro.pro/",
    status: "manual_completed",
    updated_at: "2026-07-19T04:00:00.000Z",
    qualification_trial: {
      status: "submitted",
      submitted_at: "2026-07-19T03:21:00.000Z",
      test_focus: "Test the complete first-time-user journey.",
      tester: {
        recording_analysis_consent_version: 1,
        recording_analysis_consent_at: "2026-07-19T03:22:00.000Z"
      }
    },
    findings_analysis: {
      analysis_id: "recording_ciaro",
      status: "complete",
      source: "recording_transcript",
      media_count: 82,
      processed_media_count: 82,
      transcript_event_count: 19,
      completed_at: "2026-07-19T04:10:00.000Z",
      recording_fingerprint: recordingFingerprint,
      clip_results: completeClips,
      findings: [
        {
          finding_id: "finding_button",
          category: "frustration",
          title: "The main button was unclear",
          summary: "The tester hesitated because the button did not explain the next step.",
          evidence_anchors: [
            {
              evidence_id: "video-23",
              recording_index: 23,
              start_ms: 6000,
              end_ms: 9000,
              quote: "I cannot tell what this button will do."
            }
          ],
          confidence: 0.95
        }
      ]
    },
    checklist: [
      {
        id: "freestyle",
        title: "Ciaro Pro qualification review",
        status: "reviewed",
        note: "This note is supplemental and must not create findings.",
        evidence_media: recordings
      }
    ]
  });

  assert.match(completeMarkdown, /Status: Ready/);
  assert.match(completeMarkdown, /### Frustrations/);
  assert.match(completeMarkdown, /The main button was unclear/);
  assert.match(completeMarkdown, /Source: Video and transcript/);
  assert.match(completeMarkdown, /Evidence: Watch part 23 at 0:06/);
  assert.match(completeMarkdown, /I cannot tell what this button will do/);
  assert.match(completeMarkdown, /Tester note \(supplemental\)/);
  assert.doesNotMatch(completeMarkdown, /api\/manual-qa\/evidence|INTERNAL ONLY/);
});

test("recording analysis media is deduped, numerically ordered, and fingerprinted", () => {
  const session = {
    session_id: "manual-recording-order",
    checklist: [
      {
        id: "freestyle",
        evidence_media: [
          {
            evidence_id: "video-82",
            kind: "video",
            label: "Trial recording segment 82",
            content_type: "video/webm",
            storage_bucket: "qa-evidence",
            storage_path: "manual-recording-order/manual-widget-video/video-82.webm",
            byte_length: 120,
            duration_ms: 10000
          },
          {
            evidence_id: "video-81",
            kind: "video",
            label: "Trial recording segment 81",
            content_type: "video/webm",
            storage_bucket: "qa-evidence",
            storage_path: "manual-recording-order/manual-widget-video/video-81.webm",
            byte_length: 110
          },
          {
            evidence_id: "video-82",
            kind: "video",
            label: "Trial recording segment 82 duplicate",
            content_type: "video/webm",
            storage_bucket: "qa-evidence",
            storage_path: "manual-recording-order/manual-widget-video/video-82.webm",
            byte_length: 120
          },
          {
            evidence_id: "chunk-video",
            kind: "video",
            content_type: "video/webm",
            storage_bucket: "qa-evidence",
            storage_path: "manual-recording-order/manual-widget-video-chunks-upload/chunk-1.webm"
          },
          {
            evidence_id: "other-session",
            kind: "video",
            content_type: "video/webm",
            storage_bucket: "qa-evidence",
            storage_path: "other-session/manual-widget-video/video.webm"
          },
          {
            evidence_id: "wrong-bucket",
            kind: "video",
            content_type: "video/webm",
            storage_bucket: "public",
            storage_path: "manual-recording-order/manual-widget-video/video.webm"
          }
        ]
      }
    ]
  };
  const recordings = collectManualQaRecordingMedia(session);
  assert.deepEqual(recordings.map((entry) => entry.recording_index), [81, 82]);
  assert.deepEqual(recordings.map((entry) => entry.item_id), ["freestyle", "freestyle"]);
  assert.equal(recordings[1].duration_ms, 10000);
  const fingerprint = buildManualQaRecordingFingerprint(recordings);
  assert.equal(fingerprint, buildManualQaRecordingFingerprint([...recordings]));
  assert.notEqual(
    fingerprint,
    buildManualQaRecordingFingerprint(recordings.map((entry, index) => index ? entry : { ...entry, byte_length: 999 }))
  );
  assert.notEqual(
    fingerprint,
    buildManualQaRecordingFingerprint(
      recordings.map((entry, index) => index ? entry : { ...entry, content_type: "video/mp4" })
    )
  );

  const validSetFingerprint = buildManualQaRecordingSetFingerprint({
    session_id: session.session_id,
    checklist: [{ id: "freestyle", evidence_media: recordings }]
  });
  const invalidSetFingerprint = buildManualQaRecordingSetFingerprint({
    session_id: session.session_id,
    checklist: [{
      id: "freestyle",
      evidence_media: [
        ...recordings,
        { ...recordings[0], evidence_id: "invalid-extra", storage_bucket: "untrusted" }
      ]
    }]
  });
  assert.notEqual(invalidSetFingerprint, validSetFingerprint);
});

test("a mixed trusted and untrusted recording set fails instead of publishing a partial report", () => {
  const sessionId = "manual-mixed-recordings";
  const trusted = makeFinalRecording(sessionId, 1);
  const trustedOnly = {
    session_id: sessionId,
    checklist: [{ id: "freestyle", evidence_media: [trusted] }]
  };
  const mixed = {
    session_id: sessionId,
    checklist: [{
      id: "freestyle",
      evidence_media: [
        trusted,
        makeFinalRecording(sessionId, 2, { storage_bucket: "untrusted-owner-bucket" })
      ]
    }]
  };
  const inspection = manualQaPrivate.inspectManualQaRecordingMediaSet(mixed);
  assert.equal(inspection.ok, false);
  assert.equal(inspection.candidate_count, 2);
  assert.equal(inspection.recordings.length, 1);

  const resolved = resolveCurrentManualQaFindingsAnalysis(
    mixed,
    makeCompleteRecordingAnalysis(trustedOnly)
  );
  assert.equal(resolved.status, "failed");
  assert.equal(resolved.error_code, "recording_set_invalid");
  assert.equal(resolved.retryable, false);
  assert.deepEqual(resolved.findings, []);

  const retiredGateState = resolveCurrentManualQaFindingsAnalysis(mixed, {
    status: "failed",
    error_code: "recording_analysis_consent_required",
    retryable: false
  });
  assert.equal(retiredGateState.status, "failed");
  assert.equal(retiredGateState.error_code, "recording_set_invalid");
  assert.equal(retiredGateState.retryable, false);
});

test("raw complete analysis schema cannot normalize malformed findings into an empty success", () => {
  const sessionId = "manual-raw-analysis-schema";
  const session = {
    session_id: sessionId,
    checklist: [{ id: "freestyle", evidence_media: [makeFinalRecording(sessionId, 1)] }]
  };
  const recordings = collectManualQaRecordingMedia(session);
  const valid = makeCompleteRecordingAnalysis(session);
  assert.equal(manualQaPrivate.validateRawCompleteFindingsAnalysis(valid, recordings).ok, true);

  const unknownCategory = {
    ...valid,
    findings: [{
      category: "positive",
      title: "Unsupported positive claim",
      summary: "This must not silently become an observation.",
      confidence: 0.9,
      evidence_anchors: [{
        evidence_id: "video-1",
        recording_index: 1,
        start_ms: 0,
        end_ms: 1000,
        quote: "Unsupported positive claim"
      }]
    }]
  };
  assert.equal(
    manualQaPrivate.validateRawCompleteFindingsAnalysis(unknownCategory, recordings).error_code,
    "finding_response_invalid"
  );
  assert.equal(
    manualQaPrivate.validateRawCompleteFindingsAnalysis({ ...valid, findings: [{}] }, recordings).ok,
    false
  );
});

test("submitted qualification sessions suppress legacy note-derived work packets", () => {
  const sessionId = "manual-suppress-legacy-packets";
  const normalized = normalizeManualQaSessionRow({
    run_id: sessionId,
    source: "manual_qa",
    payload: {
      manual_qa: {
        session_id: sessionId,
        qualification_trial: {
          status: "submitted",
          submitted_at: "2026-07-19T00:00:00.000Z"
        },
        checklist: [{ id: "freestyle", evidence_media: [makeFinalRecording(sessionId, 1)] }],
        work_packets: [{
          packet_id: "legacy-note",
          source_kind: "feedback",
          title: "Claim inferred from tester note"
        }]
      }
    }
  });
  assert.deepEqual(normalized.work_packets, []);
  assert.equal(normalized.findings_analysis.status, "not_started");
  assert.equal(normalized.findings_analysis.error_code, null);
});

test("historical recording-derived analysis remains valid without a post-submit permission gate", () => {
  const sessionId = "manual-historical-no-consent";
  const recording = makeFinalRecording(sessionId, 1);
  const storedSession = {
    session_id: sessionId,
    title: "Historical no-consent report",
    qualification_trial: {
      kind: "tester_qualification",
      status: "submitted",
      submitted_at: "2026-07-19T00:00:00.000Z"
    },
    checklist: [{
      id: "freestyle",
      note: "A supplemental note must not become a finding.",
      evidence_media: [recording],
      widget_context: {
        transcript_events: [{
          source: "server_recording_analysis",
          text: "Stale server transcript must be replaced"
        }]
      }
    }],
    work_packets: [{
      packet_id: "historical-packet",
      source_kind: "recording_transcript",
      title: "Stale stored packet"
    }]
  };
  storedSession.findings_analysis = makeCompleteRecordingAnalysis(storedSession, {
    transcript_event_count: 1,
    clip_results: [{
      evidence_id: recording.evidence_id,
      item_id: "freestyle",
      recording_index: 1,
      status: "complete",
      duration_ms: 10000,
      speech_segments: [{
        start_ms: 1000,
        end_ms: 3000,
        text: "Historical recording finding"
      }],
      visual_events: [],
      summary: "Historical recording finding",
      confidence: 1
    }],
    findings: [{
      finding_id: "historical-finding",
      category: "bug",
      title: "Historical recording finding",
      evidence_anchors: [{
        evidence_id: recording.evidence_id,
        recording_index: 1,
        start_ms: 1000,
        end_ms: 3000,
        quote: "Historical recording finding"
      }]
    }]
  });

  const normalized = normalizeManualQaSessionRow({
    run_id: sessionId,
    source: "manual_qa",
    payload: { manual_qa: storedSession }
  });
  assert.equal(normalized.findings_analysis.status, "complete");
  assert.equal(normalized.findings_analysis.findings[0].title, "Historical recording finding");
  assert.equal(normalized.work_packets.length, 1);
  assert.equal(normalized.work_packets[0].title, "Historical recording finding");
  assert.equal(
    JSON.stringify(normalized.checklist).includes("Stale server transcript"),
    false
  );
  assert.match(JSON.stringify(normalized.checklist), /Historical recording finding/);
  const markdown = buildManualQaCustomerReportMarkdown(storedSession);
  assert.match(markdown, /Historical recording finding/);
  assert.doesNotMatch(markdown, /Stale stored packet|Stale server transcript/);
});

test("recording analysis persists lifecycle, transcript anchors, and recording-only work packets", async () => {
  const mock = createSupabaseFetchMock();
  const options = {
    publicBaseUrl: "https://beforeusersdo.com",
    ownerUserId: "user_recording",
    ownerEmail: "owner@example.com",
    authOk: true,
    fetchImpl: mock.fetchImpl,
    supabaseUrl: "https://supabase.example.com",
    serviceKey: "service"
  };
  const created = await createManualQaSession(
    {
      target_url: "https://example.com",
      title: "Recording-backed report",
      review_mode: "freestyle"
    },
    options
  );
  const item = created.session.checklist[0];
  const withRecording = await updateManualQaItem(
    created.session.session_id,
    item.id,
    {
      status: "reviewed",
      note: "A supplemental note that must not become a finding.",
      evidence_media: [
        {
          evidence_id: "video-1",
          kind: "video",
          label: "Trial recording segment 1",
          content_type: "video/webm",
          storage_bucket: "qa-evidence",
          storage_path: `${created.session.session_id}/manual-widget-video/video-1.webm`,
          byte_length: 1200,
          duration_ms: 10000
        }
      ]
    },
    options
  );
  assert.equal(withRecording.ok, true);

  const spoofAttempt = await updateManualQaItem(
    created.session.session_id,
    item.id,
    {
      widget_context: {
        transcript_events: [{
          source: "server_recording_analysis",
          evidence_id: "video-1",
          recording_index: 1,
          start_ms: 0,
          end_ms: 1000,
          text: "FAKE SERVER TRANSCRIPT"
        }]
      }
    },
    options
  );
  assert.equal(spoofAttempt.ok, true);
  assert.equal(
    spoofAttempt.item.widget_context.transcript_events.some(
      (entry) => entry.source === "server_recording_analysis"
    ),
    false
  );
  assert.equal(JSON.stringify(mock.rows.get(created.session.session_id)).includes("FAKE SERVER TRANSCRIPT"), false);

  const queued = await queueManualQaFindingsAnalysis(created.session.session_id, options);
  assert.equal(queued.ok, true);
  assert.equal(queued.analysis.status, "queued");
  assert.equal(queued.analysis.media_count, 1);
  assert.equal(queued.analysis.findings.length, 0);
  assert.equal(queued.recordings[0].duration_ms, 10000);

  const claimed = await claimManualQaFindingsAnalysis(created.session.session_id, options);
  assert.equal(claimed.ok, true);
  assert.equal(claimed.claimed, true);
  assert.equal(claimed.analysis.status, "processing");
  assert.equal(claimed.analysis.attempt_count, 1);

  const completed = await updateManualQaFindingsAnalysis(
    created.session.session_id,
    {
      ...claimed.analysis,
      status: "complete",
      processed_media_count: 1,
      transcript_event_count: 1,
      completed_at: "2026-07-19T01:00:00.000Z",
      retryable: false,
      clip_results: [
        {
          evidence_id: "video-1",
          item_id: item.id,
          recording_index: 1,
          status: "complete",
          duration_ms: 10000,
          speech_segments: [
            {
              start_ms: 2000,
              end_ms: 5000,
              text: "This button did not respond when I clicked it."
            }
          ],
          visual_events: [
            { start_ms: 2500, end_ms: 4500, description: "The button remains unchanged after the click." }
          ],
          summary: "The tester clicks the button and receives no visible response.",
          confidence: 0.96
        }
      ],
      findings: [
        {
          category: "bug",
          title: "The button did not respond",
          summary: "The recording shows the tester click without a visible response.",
          evidence_anchors: [
            {
              evidence_id: "video-1",
              recording_index: 1,
              start_ms: 2000,
              end_ms: 5000,
              quote: "This button did not respond when I clicked it.",
              visual_evidence: "The button remains unchanged after the click."
            }
          ],
          confidence: 0.96
        }
      ]
    },
    options
  );
  assert.equal(completed.ok, true);
  assert.equal(completed.analysis.status, "complete");
  assert.equal(completed.session.work_packets.length, 1);
  assert.equal(completed.session.work_packets[0].source_kind, "recording_transcript");
  assert.equal(completed.session.work_packets[0].category, "bug");
  assert.equal(completed.session.work_packets[0].evidence_anchors[0].recording_index, 1);
  const transcript = completed.session.checklist[0].widget_context.transcript_events[0];
  assert.equal(transcript.source, "server_recording_analysis");
  assert.equal(transcript.evidence_id, "video-1");
  assert.equal(transcript.start_ms, 2000);

  const persistedCompletedRow = mock.rows.get(created.session.session_id);
  persistedCompletedRow.payload.manual_qa.checklist[0].widget_context.transcript_events.unshift({
    source: "server_recording_analysis",
    evidence_id: "video-1",
    recording_index: 1,
    start_ms: 0,
    end_ms: 1000,
    text: "SPOOFED AFTER COMPLETION"
  });
  const authoritativeView = normalizeManualQaSessionRow(persistedCompletedRow);
  const authoritativeServerText = authoritativeView.checklist[0].widget_context.transcript_events
    .filter((entry) => entry.source === "server_recording_analysis")
    .map((entry) => entry.text);
  assert.deepEqual(authoritativeServerText, ["This button did not respond when I clicked it."]);

  const malformedPartialUpdate = await updateManualQaFindingsAnalysis(
    created.session.session_id,
    { findings: [{}] },
    options
  );
  assert.equal(malformedPartialUpdate.ok, false);
  assert.equal(malformedPartialUpdate.error_code, "finding_response_invalid");

  const idempotent = await queueManualQaFindingsAnalysis(created.session.session_id, options);
  assert.equal(idempotent.ok, true);
  assert.equal(idempotent.analysis.status, "complete");
  assert.equal(idempotent.analysis.analysis_id, completed.analysis.analysis_id);

  const analysisPatchCalls = mock.calls.filter((call) => {
    if (call.options?.method !== "PATCH") return false;
    return new URL(call.url).searchParams.has(
      "payload->manual_qa->findings_analysis->>analysis_id"
    );
  });
  assert.equal(analysisPatchCalls.length >= 3, true);
  for (const call of analysisPatchCalls) {
    const params = new URL(call.url).searchParams;
    assert.equal(params.has("delivered_at"), true);
    assert.equal(params.has("payload->manual_qa->findings_analysis->>analysis_id"), true);
    assert.equal(params.has("payload->manual_qa->findings_analysis->>lease_id"), true);
    assert.equal(
      params.has("payload->manual_qa->findings_analysis->>recording_fingerprint"),
      true
    );
  }

  const staleWrite = await updateManualQaFindingsAnalysis(
    created.session.session_id,
    completed.analysis,
    { ...options, expectedDeliveredAt: "2000-01-01T00:00:00.000Z" }
  );
  assert.equal(staleWrite.ok, false);
  assert.equal(staleWrite.status, 409);

  const noLongerComplete = await updateManualQaFindingsAnalysis(
    created.session.session_id,
    {
      ...completed.analysis,
      status: "failed",
      failed_at: "2026-07-19T01:05:00.000Z",
      completed_at: null,
      error_code: "analysis_runtime_failed",
      retryable: true,
      clip_results: [],
      findings: []
    },
    options
  );
  assert.equal(noLongerComplete.ok, true);
  assert.equal(
    noLongerComplete.session.checklist[0].widget_context.transcript_events.some(
      (entry) => entry.source === "server_recording_analysis"
    ),
    false
  );
  assert.equal(
    JSON.stringify(mock.rows.get(created.session.session_id).payload.manual_qa.checklist)
      .includes("server_recording_analysis"),
    false
  );
});

test("current recording analysis rejects stale clip sets and unsupported positive claims", () => {
  const sessionId = "manual-current-analysis";
  const firstRecording = makeFinalRecording(sessionId, 1);
  const currentSession = {
    session_id: sessionId,
    checklist: [{ id: "freestyle", evidence_media: [firstRecording, makeFinalRecording(sessionId, 2)] }]
  };
  const priorSession = {
    session_id: sessionId,
    checklist: [{ id: "freestyle", evidence_media: [firstRecording] }]
  };
  const priorComplete = makeCompleteRecordingAnalysis(priorSession, { attempt_count: 2 });
  const changed = resolveCurrentManualQaFindingsAnalysis(currentSession, priorComplete);
  assert.equal(changed.status, "not_started");
  assert.equal(changed.error_code, "recording_changed");
  assert.equal(changed.attempt_count, 0);
  assert.equal(changed.analysis_id, null);
  assert.deepEqual(changed.findings, []);

  const missingClip = makeCompleteRecordingAnalysis(currentSession);
  missingClip.clip_results = missingClip.clip_results.slice(0, 1);
  const incomplete = resolveCurrentManualQaFindingsAnalysis(currentSession, missingClip);
  assert.equal(incomplete.status, "not_started");
  assert.equal(incomplete.error_code, "recording_set_incomplete");

  const positive = manualQaPrivate.normalizeFindingsAnalysisFinding({
    category: "positive",
    title: "The interface looked polished",
    evidence_anchors: [
      { evidence_id: "video-1", recording_index: 1, start_ms: 0, end_ms: 1000, quote: "Looks polished" }
    ]
  });
  assert.equal(positive.category, "observation");
});

test("recording analysis refuses invalid finding anchors and evidence text", () => {
  const sessionId = "manual-invalid-anchor";
  const session = {
    session_id: sessionId,
    checklist: [{ id: "freestyle", evidence_media: [makeFinalRecording(sessionId, 1)] }]
  };
  const baseClip = {
    evidence_id: "video-1",
    item_id: "freestyle",
    recording_index: 1,
    status: "complete",
    duration_ms: 10000,
    speech_segments: [{ start_ms: 1000, end_ms: 3000, text: "The button did not respond." }],
    visual_events: [{ start_ms: 1000, end_ms: 3000, description: "The button remains unchanged." }]
  };
  const baseFinding = {
    category: "bug",
    title: "Button did not respond",
    evidence_anchors: [
      {
        evidence_id: "video-1",
        recording_index: 1,
        start_ms: 1000,
        end_ms: 3000,
        quote: "The button did not respond.",
        visual_evidence: "The button remains unchanged."
      }
    ]
  };
  const valid = makeCompleteRecordingAnalysis(session, {
    processed_media_count: 1,
    clip_results: [baseClip],
    findings: [baseFinding]
  });
  assert.equal(resolveCurrentManualQaFindingsAnalysis(session, valid).status, "complete");

  const badTime = {
    ...valid,
    findings: [{
      ...baseFinding,
      evidence_anchors: [{ ...baseFinding.evidence_anchors[0], end_ms: 11000 }]
    }]
  };
  assert.equal(
    resolveCurrentManualQaFindingsAnalysis(session, badTime).error_code,
    "finding_evidence_invalid"
  );

  const badQuote = {
    ...valid,
    findings: [{
      ...baseFinding,
      evidence_anchors: [{ ...baseFinding.evidence_anchors[0], quote: "A made-up quote" }]
    }]
  };
  assert.equal(
    resolveCurrentManualQaFindingsAnalysis(session, badQuote).error_code,
    "finding_quote_invalid"
  );

  const partialQuote = {
    ...valid,
    findings: [{
      ...baseFinding,
      evidence_anchors: [{ ...baseFinding.evidence_anchors[0], quote: "button did not" }]
    }]
  };
  assert.equal(
    resolveCurrentManualQaFindingsAnalysis(session, partialQuote).error_code,
    "finding_quote_invalid"
  );

  const nonOverlappingQuote = {
    ...valid,
    findings: [{
      ...baseFinding,
      evidence_anchors: [{ ...baseFinding.evidence_anchors[0], start_ms: 4000, end_ms: 5000 }]
    }]
  };
  assert.equal(
    resolveCurrentManualQaFindingsAnalysis(session, nonOverlappingQuote).error_code,
    "finding_quote_invalid"
  );
});

test("recording limits are terminal and media is never silently truncated", async () => {
  const mock = createSupabaseFetchMock();
  const options = {
    publicBaseUrl: "https://beforeusersdo.com",
    ownerUserId: "user_limit",
    ownerEmail: "owner@example.com",
    authOk: true,
    fetchImpl: mock.fetchImpl,
    supabaseUrl: "https://supabase.example.com",
    serviceKey: "service"
  };
  const created = await createManualQaSession(
    { target_url: "https://example.com", review_mode: "freestyle" },
    options
  );
  const recordings = Array.from({ length: 241 }, (_, index) =>
    makeFinalRecording(created.session.session_id, index + 1)
  );
  const updated = await updateManualQaItem(
    created.session.session_id,
    created.session.checklist[0].id,
    { evidence_media: recordings },
    options
  );
  assert.equal(updated.ok, true);
  assert.equal(updated.item.evidence_media.length, 241);
  assert.equal(collectManualQaRecordingMedia(updated.session).length, 241);

  const queued = await queueManualQaFindingsAnalysis(created.session.session_id, options);
  assert.equal(queued.ok, true);
  assert.equal(queued.queued, false);
  assert.equal(queued.analysis.status, "failed");
  assert.equal(queued.analysis.error_code, "recording_limit_exceeded");
  assert.equal(queued.analysis.retryable, false);
  assert.equal(queued.analysis.media_count, 241);
});

test("a changed recording fingerprint starts a fresh attempt budget", async () => {
  const mock = createSupabaseFetchMock();
  const options = {
    publicBaseUrl: "https://beforeusersdo.com",
    ownerUserId: "user_changed",
    ownerEmail: "owner@example.com",
    authOk: true,
    fetchImpl: mock.fetchImpl,
    supabaseUrl: "https://supabase.example.com",
    serviceKey: "service"
  };
  const created = await createManualQaSession(
    { target_url: "https://example.com", review_mode: "freestyle" },
    options
  );
  const itemId = created.session.checklist[0].id;
  const first = makeFinalRecording(created.session.session_id, 1);
  await updateManualQaItem(created.session.session_id, itemId, { evidence_media: [first] }, options);
  const queued = await queueManualQaFindingsAnalysis(created.session.session_id, options);
  const claimed = await claimManualQaFindingsAnalysis(created.session.session_id, options);
  const failed = await updateManualQaFindingsAnalysis(
    created.session.session_id,
    {
      ...claimed.analysis,
      status: "failed",
      failed_at: "2026-07-19T05:00:00.000Z",
      lease_id: null,
      lease_expires_at: null,
      error_code: "clip_analysis_failed",
      retryable: true,
      findings: []
    },
    options
  );
  assert.equal(failed.ok, true);
  assert.equal(failed.analysis.attempt_count, 1);

  const second = makeFinalRecording(created.session.session_id, 2);
  await updateManualQaItem(
    created.session.session_id,
    itemId,
    { evidence_media: [first, second] },
    options
  );
  const requeued = await queueManualQaFindingsAnalysis(created.session.session_id, { ...options, retry: true });
  assert.equal(requeued.ok, true, JSON.stringify(requeued));
  assert.equal(requeued.analysis.status, "queued");
  assert.equal(requeued.analysis.attempt_count, 0);
  assert.notEqual(requeued.analysis.analysis_id, queued.analysis.analysis_id);
  assert.deepEqual(requeued.analysis.clip_results, []);
});

test("retry cap becomes a persisted nonretryable terminal state", async () => {
  const mock = createSupabaseFetchMock();
  const options = {
    publicBaseUrl: "https://beforeusersdo.com",
    ownerUserId: "user_retry_cap",
    ownerEmail: "owner@example.com",
    authOk: true,
    fetchImpl: mock.fetchImpl,
    supabaseUrl: "https://supabase.example.com",
    serviceKey: "service"
  };
  const created = await createManualQaSession(
    { target_url: "https://example.com", review_mode: "freestyle" },
    options
  );
  const recording = makeFinalRecording(created.session.session_id, 1);
  await updateManualQaItem(
    created.session.session_id,
    created.session.checklist[0].id,
    { evidence_media: [recording] },
    options
  );
  const queued = await queueManualQaFindingsAnalysis(created.session.session_id, options);
  const row = mock.rows.get(created.session.session_id);
  row.payload.manual_qa.findings_analysis = {
    ...queued.analysis,
    status: "failed",
    attempt_count: 3,
    failed_at: "2026-07-19T06:00:00.000Z",
    error_code: "clip_analysis_failed",
    retryable: true
  };

  const capped = await queueManualQaFindingsAnalysis(created.session.session_id, { ...options, retry: true });
  assert.equal(capped.ok, true);
  assert.equal(capped.queued, false);
  assert.equal(capped.analysis.status, "failed");
  assert.equal(capped.analysis.error_code, "retry_limit_exceeded");
  assert.equal(capped.analysis.retryable, false);
  assert.equal(
    mock.rows.get(created.session.session_id).payload.manual_qa.findings_analysis.retryable,
    false
  );
});

test("qualification submission locks new recording evidence", async () => {
  const mock = createSupabaseFetchMock();
  const options = {
    publicBaseUrl: "https://beforeusersdo.com",
    ownerUserId: "user_locked",
    ownerEmail: "owner@example.com",
    authOk: true,
    fetchImpl: mock.fetchImpl,
    supabaseUrl: "https://supabase.example.com",
    serviceKey: "service"
  };
  const created = await createManualQaSession(
    { target_url: "https://example.com", review_mode: "freestyle" },
    options
  );
  const recording = makeFinalRecording(created.session.session_id, 1);
  const captured = await updateManualQaItem(
    created.session.session_id,
    created.session.checklist[0].id,
    { evidence_media: [recording] },
    options
  );
  assert.equal(captured.ok, true);
  const submitted = await updateManualQaQualificationTrial(
    created.session.session_id,
    {
      status: "submitted",
      submitted_at: "2026-07-19T07:00:00.000Z",
      product_name: "Example",
      test_focus: "Try the main flow."
    },
    options
  );
  assert.equal(submitted.ok, true);
  const widgetToken = new URL(created.widget_install.script_url).searchParams.get("token");

  const lockedWidgetUpdate = await updateManualQaWidgetItem(
    created.session.session_id,
    widgetToken,
    created.session.checklist[0].id,
    { note: "This late widget mutation must not be stored." },
    options
  );
  assert.equal(lockedWidgetUpdate.ok, false);
  assert.equal(lockedWidgetUpdate.status, 409);

  const appended = await appendManualQaItemEvidence(
    created.session.session_id,
    created.session.checklist[0].id,
    makeFinalRecording(created.session.session_id, 2),
    options
  );
  assert.equal(appended.ok, false);
  assert.equal(appended.status, 409);

  const appendedScreenshot = await appendManualQaItemEvidence(
    created.session.session_id,
    created.session.checklist[0].id,
    {
      evidence_id: "late-screenshot",
      kind: "screenshot",
      content_type: "image/png",
      storage_bucket: "qa-evidence",
      storage_path: `${created.session.session_id}/manual-widget-image/late-screenshot.png`,
      byte_length: 512
    },
    options
  );
  assert.equal(appendedScreenshot.ok, false);
  assert.equal(appendedScreenshot.status, 409);

  const directPatch = await updateManualQaItem(
    created.session.session_id,
    created.session.checklist[0].id,
    { evidence_media: [{ ...recording, url: "https://attacker.example/replacement.webm" }] },
    options
  );
  assert.equal(directPatch.ok, false);
  assert.equal(directPatch.status, 409);

  const removed = await updateManualQaItem(
    created.session.session_id,
    created.session.checklist[0].id,
    { evidence_media: [] },
    options
  );
  assert.equal(removed.ok, false);
  assert.equal(removed.status, 409);

  const changedMime = await updateManualQaItem(
    created.session.session_id,
    created.session.checklist[0].id,
    { evidence_media: [{ ...recording, content_type: "video/mp4" }] },
    options
  );
  assert.equal(changedMime.ok, false);
  assert.equal(changedMime.status, 409);

  const replayed = manualQaPrivate.applyManualQaEventsToSession(submitted.session, [
    {
      event_id: "raced-video-add",
      event_type: "evidence_added",
      item_id: created.session.checklist[0].id,
      created_at: "2026-07-19T07:00:00.001Z",
      payload: { evidence: makeFinalRecording(created.session.session_id, 2) }
    },
    {
      event_id: "raced-item-patch",
      event_type: "item_patch",
      item_id: created.session.checklist[0].id,
      created_at: "2026-07-19T07:00:00.002Z",
      payload: {
        patch: {
          evidence_media: [
            { ...recording, url: "https://attacker.example/replacement.webm" },
            makeFinalRecording(created.session.session_id, 3),
            {
              evidence_id: "screenshot-storage-collision",
              kind: "screenshot",
              content_type: "image/png",
              storage_bucket: recording.storage_bucket,
              storage_path: recording.storage_path,
              byte_length: 200
            },
            { evidence_id: "screenshot-after-submit", kind: "screenshot", url: "https://example.com/proof.png" }
          ]
        }
      }
    },
    {
      event_id: "raced-screenshot-id-collision",
      event_type: "evidence_added",
      item_id: created.session.checklist[0].id,
      created_at: "2026-07-19T07:00:00.003Z",
      payload: {
        evidence: {
          evidence_id: recording.evidence_id,
          kind: "screenshot",
          content_type: "image/png",
          url: "https://attacker.example/replacement.png"
        }
      }
    }
  ]);
  const replayedRecordings = replayed.checklist[0].evidence_media.filter(
    (entry) => entry.kind === "video" || String(entry.content_type || "").startsWith("video/")
  );
  assert.equal(replayedRecordings.length, 1);
  assert.equal(replayedRecordings[0].evidence_id, recording.evidence_id);
  assert.equal(replayedRecordings[0].content_type, "video/webm");
  assert.notEqual(replayedRecordings[0].url, "https://attacker.example/replacement.webm");
  assert.equal(
    replayed.checklist[0].evidence_media.some(
      (entry) => entry.evidence_id === "screenshot-storage-collision"
    ),
    false
  );
  assert.equal(
    replayed.checklist[0].evidence_media.some(
      (entry) => entry.url === "https://attacker.example/replacement.png"
    ),
    false
  );
  assert.equal(
    replayed.checklist[0].evidence_media.some((entry) => entry.evidence_id === "screenshot-after-submit"),
    true
  );
});

test("qualification updates retry on delivered-at conflicts without erasing analyzer progress", async () => {
  const mock = createSupabaseFetchMock();
  const sessionId = "manual-trial-analysis-interleave";
  const baseAnalysis = {
    analysis_id: "analysis-interleave",
    status: "processing",
    source: "recording_transcript",
    media_count: 4,
    processed_media_count: 1,
    attempt_count: 1,
    lease_id: "lease-interleave",
    recording_fingerprint: "fingerprint-interleave",
    clip_results: [{ evidence_id: "video-1", recording_index: 1, status: "complete" }],
    findings: []
  };
  const trial = {
    kind: "tester_qualification",
    status: "submitted",
    submitted_at: "2026-07-19T05:00:00.000Z",
    tester: {
      recording_analysis_consent_version: 1,
      recording_analysis_consent_at: "2026-07-19T04:59:00.000Z"
    },
    lead_rating: { score: null }
  };
  mock.rows.set(sessionId, {
    run_id: sessionId,
    source: "manual_qa",
    delivered_at: "delivered-before-race",
    payload: {
      manual_qa: {
        session_id: sessionId,
        qualification_trial: trial,
        findings_analysis: baseAnalysis,
        checklist: [{ id: "freestyle", evidence_media: [] }]
      }
    }
  });
  let patchCalls = 0;
  const interleavingFetch = async (url, options = {}) => {
    if (options.method === "PATCH") {
      patchCalls += 1;
      if (patchCalls === 1) {
        const current = mock.rows.get(sessionId);
        current.delivered_at = "delivered-analysis-progress";
        current.payload.manual_qa.findings_analysis = {
          ...baseAnalysis,
          processed_media_count: 3,
          clip_results: [
            ...baseAnalysis.clip_results,
            { evidence_id: "video-2", recording_index: 2, status: "complete" },
            { evidence_id: "video-3", recording_index: 3, status: "complete" }
          ]
        };
      }
    }
    return mock.fetchImpl(url, options);
  };

  const updated = await updateManualQaQualificationTrial(
    sessionId,
    {
      ...trial,
      lead_rating: {
        score: 5,
        note: "Useful report",
        rated_at: "2026-07-19T05:10:00.000Z"
      }
    },
    {
      authOk: true,
      adminOk: true,
      fetchImpl: interleavingFetch,
      supabaseUrl: "https://supabase.example.com",
      serviceKey: "service"
    }
  );

  assert.equal(updated.ok, true, updated.error);
  assert.equal(patchCalls, 2);
  const stored = mock.rows.get(sessionId).payload.manual_qa;
  assert.equal(stored.qualification_trial.lead_rating.score, 5);
  assert.equal(stored.findings_analysis.analysis_id, "analysis-interleave");
  assert.equal(stored.findings_analysis.lease_id, "lease-interleave");
  assert.equal(stored.findings_analysis.processed_media_count, 3);
  assert.equal(stored.findings_analysis.clip_results.length, 3);
});

test("a same-timestamp submit race cannot be overwritten by a stale item snapshot", async () => {
  const mock = createSupabaseFetchMock();
  let raceOnPatch = false;
  const racingFetch = async (url, options = {}) => {
    if (raceOnPatch && options.method === "PATCH" && new URL(url).pathname === "/rest/v1/swarmtest_reports") {
      raceOnPatch = false;
      const runFilter = new URL(url).searchParams.get("run_id") || "";
      const sessionId = runFilter.startsWith("eq.") ? runFilter.slice(3) : "";
      const current = mock.rows.get(sessionId);
      current.payload.manual_qa.qualification_trial = {
        ...current.payload.manual_qa.qualification_trial,
        status: "submitted",
        submitted_at: "2026-07-19T05:00:00.000Z"
      };
      current.payload.manual_qa.findings_analysis = {
        ...current.payload.manual_qa.findings_analysis,
        status: "processing",
        analysis_id: "analysis-submit-race",
        lease_id: "lease-submit-race",
        processed_media_count: 1
      };
      // Keep delivered_at unchanged to prove the payload fences, not timestamp luck, stop the overwrite.
    }
    return mock.fetchImpl(url, options);
  };
  const options = {
    publicBaseUrl: "https://beforeusersdo.com",
    ownerUserId: "owner_submit_race",
    fetchImpl: racingFetch,
    supabaseUrl: "https://supabase.example.com",
    serviceKey: "service"
  };
  const created = await createManualQaSession(
    {
      target_url: "https://example.com",
      title: "Submit race",
      review_mode: "freestyle",
      qualification_trial: {
        kind: "tester_qualification",
        status: "in_progress",
        assignment: { type: "qualification" }
      }
    },
    options
  );
  raceOnPatch = true;
  const updated = await updateManualQaItem(
    created.session.session_id,
    "freestyle",
    { note: "This stale note must not replace submitted state." },
    options
  );

  assert.equal(updated.ok, false);
  assert.equal(updated.status, 409);
  const stored = mock.rows.get(created.session.session_id).payload.manual_qa;
  assert.equal(stored.qualification_trial.status, "submitted");
  assert.equal(stored.findings_analysis.analysis_id, "analysis-submit-race");
  assert.notEqual(stored.checklist[0].note, "This stale note must not replace submitted state.");
});

test("customer JSON removes raw analysis internals and legacy findings", () => {
  const sessionId = "manual-customer-json";
  const recording = makeFinalRecording(sessionId, 1);
  const session = {
    session_id: sessionId,
    title: "Customer-safe report",
    target_url: "https://example.com",
    context: {
      developer_notes: "INTERNAL_DEVELOPER_MARKER",
      changed_files: ["INTERNAL_CHANGED_FILE"],
      repository: "INTERNAL_REPOSITORY",
      branch: "INTERNAL_BRANCH"
    },
    agent_feedback: { latest: { markdown: "INTERNAL_AGENT_FEEDBACK" } },
    post_fix_reviews: { latest: { summary: "INTERNAL_POST_FIX" } },
    requested_by: { owner_email: "INTERNAL_REQUESTER@example.com" },
    preview_proposal: { summary: "INTERNAL_PREVIEW" },
    qualification_trial: {
      status: "submitted",
      submitted_at: "2026-07-19T03:21:00.000Z",
      tester: {
        email: "INTERNAL_TESTER@example.com",
        recording_analysis_consent_version: 1,
        recording_analysis_consent_at: "2026-07-19T03:22:00.000Z"
      },
      lead: { email: "INTERNAL_LEAD@example.com" },
      benchmark: { issues: [{ id: "private", title: "INTERNAL_BENCHMARK" }] },
      access: { private_credentials: { password: "INTERNAL_PASSWORD" } }
    },
    findings_analysis: {
      analysis_id: "INTERNAL_ANALYSIS_ID",
      status: "processing",
      recording_fingerprint: buildManualQaRecordingFingerprint([
        { ...recording, recording_index: 1, item_id: "freestyle" }
      ]),
      media_count: 1,
      processed_media_count: 1,
      model: "INTERNAL_MODEL",
      lease_id: "INTERNAL_LEASE",
      clip_results: [{
        evidence_id: "video-1",
        item_id: "freestyle",
        recording_index: 1,
        status: "complete",
        duration_ms: 10000,
        speech_segments: [{ start_ms: 0, end_ms: 1000, text: "Unpublished speech" }]
      }],
      findings: [{
        category: "bug",
        title: "Unpublished finding",
        evidence_anchors: [{
          evidence_id: "video-1",
          recording_index: 1,
          start_ms: 0,
          end_ms: 1000,
          quote: "Unpublished speech"
        }]
      }]
    },
    work_packets: [{
      packet_id: "legacy-note",
      source_kind: "feedback",
      title: "Legacy note-derived finding",
      summary: "Must not publish"
    }],
    checklist: [{
      id: "freestyle",
      title: "First-time flow",
      note: "Supplemental note",
      evidence_media: [recording],
      widget_context: {
        transcript_events: [{ text: "Raw full transcript must stay hidden", is_final: true }],
        console_events: [{ type: "error", message: "INTERNAL_CONSOLE" }]
      }
    }]
  };
  const processing = buildSafeExportSession(session, { customer: true });
  assert.deepEqual(processing.work_packets, []);
  assert.deepEqual(processing.findings_analysis.clip_results, []);
  assert.deepEqual(processing.findings_analysis.findings, []);
  assert.equal(
    Object.prototype.hasOwnProperty.call(processing.checklist[0].widget_context, "transcript_events"),
    false
  );
  assert.doesNotMatch(JSON.stringify(processing), /Legacy note-derived|Raw full transcript|Unpublished finding/);
  const customerJson = JSON.stringify(processing);
  for (const marker of [
    "INTERNAL_DEVELOPER_MARKER",
    "INTERNAL_CHANGED_FILE",
    "INTERNAL_REPOSITORY",
    "INTERNAL_BRANCH",
    "INTERNAL_AGENT_FEEDBACK",
    "INTERNAL_POST_FIX",
    "INTERNAL_REQUESTER",
    "INTERNAL_PREVIEW",
    "INTERNAL_TESTER",
    "INTERNAL_LEAD",
    "INTERNAL_BENCHMARK",
    "INTERNAL_PASSWORD",
    "INTERNAL_ANALYSIS_ID",
    "INTERNAL_MODEL",
    "INTERNAL_LEASE",
    "INTERNAL_CONSOLE"
  ]) {
    assert.equal(customerJson.includes(marker), false, marker);
  }
  for (const internalKey of [
    "context",
    "agent_feedback",
    "post_fix_reviews",
    "requested_by",
    "preview_proposal",
    "browser",
    "widget"
  ]) {
    assert.equal(Object.prototype.hasOwnProperty.call(processing, internalKey), false, internalKey);
  }
  assert.equal(Object.prototype.hasOwnProperty.call(processing.qualification_trial, "tester"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(processing.qualification_trial, "lead"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(processing.qualification_trial, "benchmark"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(processing.qualification_trial, "access"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(processing.findings_analysis, "analysis_id"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(processing.findings_analysis, "recording_fingerprint"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(processing.findings_analysis, "model"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(processing.findings_analysis, "lease_id"), false);

  const complete = makeCompleteRecordingAnalysis(session, {
    transcript_event_count: 1,
    clip_results: [{
      evidence_id: "video-1",
      item_id: "freestyle",
      recording_index: 1,
      status: "complete",
      duration_ms: 10000,
      speech_segments: [{ start_ms: 1000, end_ms: 3000, text: "The button did not respond." }],
      visual_events: []
    }],
    findings: [{
      finding_id: "recording-finding",
      category: "bug",
      title: "Button did not respond",
      evidence_anchors: [{
        evidence_id: "video-1",
        recording_index: 1,
        start_ms: 1000,
        end_ms: 3000,
        quote: "The button did not respond."
      }]
    }]
  });
  const ready = buildSafeExportSession({ ...session, findings_analysis: complete }, { customer: true });
  assert.equal(ready.findings_analysis.status, "complete");
  assert.deepEqual(ready.findings_analysis.clip_results, []);
  assert.equal(ready.work_packets.length, 1);
  assert.equal(ready.work_packets[0].source_kind, "recording_transcript");
  assert.equal(Object.prototype.hasOwnProperty.call(ready.work_packets[0], "agent_task"), false);
  assert.doesNotMatch(JSON.stringify(ready), /Legacy note-derived|Raw full transcript/);
});

test("submitted human-test safe exports are recording-only without an explicit customer view", () => {
  for (const [kind, analysisStatus] of [
    ["tester_qualification", "processing"],
    ["paid_assignment", "failed"]
  ]) {
    const sessionId = `manual-generic-${kind}`;
    const recording = makeFinalRecording(sessionId, 1);
    const safe = buildSafeExportSession({
      session_id: sessionId,
      target_url: "https://example.com",
      qualification_trial: {
        kind,
        status: "submitted",
        submitted_at: "2026-07-19T03:21:00.000Z",
        assignment: { type: kind === "paid_assignment" ? "paid" : "qualification" }
      },
      findings_analysis: {
        status: analysisStatus,
        media_count: 1,
        processed_media_count: 0,
        findings: [{
          category: "bug",
          title: "Unpublished finding",
          evidence_anchors: [{
            evidence_id: "video-1",
            recording_index: 1,
            start_ms: 0,
            end_ms: 1000,
            quote: "This must not publish."
          }]
        }]
      },
      work_packets: [{
        packet_id: "legacy-topic",
        source_kind: "topic",
        title: "Legacy topic-derived finding",
        summary: "Must not publish"
      }],
      checklist: [{
        id: "freestyle",
        title: "First-time flow",
        note: "Supplemental tester note",
        evidence_media: [recording],
        widget_context: {
          transcript_events: [{ text: "Unverified browser transcript", is_final: true }]
        }
      }]
    });

    assert.deepEqual(safe.work_packets, []);
    assert.deepEqual(safe.findings_analysis.findings, []);
    assert.deepEqual(safe.findings_analysis.clip_results, []);
    assert.equal(
      Object.prototype.hasOwnProperty.call(safe.checklist[0].widget_context, "transcript_events"),
      false
    );
    assert.doesNotMatch(JSON.stringify(safe.work_packets), /Legacy topic-derived|Unpublished finding/);
  }

  const sessionId = "manual-generic-complete-paid";
  const recording = makeFinalRecording(sessionId, 1);
  const completeSession = {
    session_id: sessionId,
    target_url: "https://example.com",
    qualification_trial: {
      kind: "paid_assignment",
      status: "completed",
      submitted_at: "2026-07-19T03:21:00.000Z",
      tester: {
        recording_analysis_consent_version: 1,
        recording_analysis_consent_at: "2026-07-19T03:22:00.000Z"
      },
      assignment: { type: "paid" }
    },
    work_packets: [{
      packet_id: "legacy-note",
      source_kind: "feedback",
      title: "Legacy note-derived finding"
    }],
    checklist: [{
      id: "freestyle",
      title: "First-time flow",
      note: "Supplemental tester note",
      evidence_media: [recording]
    }]
  };
  completeSession.findings_analysis = makeCompleteRecordingAnalysis(completeSession, {
    transcript_event_count: 1,
    clip_results: [{
      evidence_id: "video-1",
      item_id: "freestyle",
      recording_index: 1,
      status: "complete",
      duration_ms: 10000,
      speech_segments: [{ start_ms: 1000, end_ms: 3000, text: "The button did not respond." }],
      visual_events: []
    }],
    findings: [{
      finding_id: "recording-finding",
      category: "bug",
      title: "Button did not respond",
      evidence_anchors: [{
        evidence_id: "video-1",
        recording_index: 1,
        start_ms: 1000,
        end_ms: 3000,
        quote: "The button did not respond."
      }]
    }]
  });

  const ready = buildSafeExportSession(completeSession);
  assert.equal(ready.findings_analysis.status, "complete");
  assert.deepEqual(ready.findings_analysis.clip_results, []);
  assert.equal(ready.findings_analysis.findings.length, 1);
  assert.equal(ready.work_packets.length, 1);
  assert.equal(ready.work_packets[0].source_kind, "recording_transcript");
  assert.equal(Object.prototype.hasOwnProperty.call(ready.work_packets[0], "agent_task"), false);
  assert.doesNotMatch(JSON.stringify(ready.work_packets), /Legacy note-derived/);
});

test("generic manual QA export API contract cannot rebuild submitted trial notes into findings", async () => {
  const mock = createSupabaseFetchMock();
  const sessionId = "manual-generic-export-submitted";
  const recording = makeFinalRecording(sessionId, 1);
  mock.rows.set(sessionId, {
    run_id: sessionId,
    source: "manual_qa",
    status: "manual_completed",
    delivered_at: "2026-07-19T04:00:00.000Z",
    payload: {
      owner_user_id: "owner-export",
      manual_qa: {
        session_id: sessionId,
        title: "Submitted paid human test",
        target_url: "https://example.com",
        status: "manual_completed",
        qualification_trial: {
          kind: "paid_assignment",
          status: "submitted",
          submitted_at: "2026-07-19T03:21:00.000Z",
          assignment: { type: "paid" }
        },
        findings_analysis: {
          status: "processing",
          media_count: 1,
          processed_media_count: 0
        },
        work_packets: [{
          packet_id: "legacy-topic",
          source_kind: "topic",
          title: "Legacy topic-derived export finding"
        }],
        checklist: [{
          id: "freestyle",
          title: "First-time flow",
          status: "reviewed",
          note: "Supplemental tester note",
          evidence_media: [recording],
          widget_context: {
            transcript_events: [{ text: "Unverified browser transcript", is_final: true }]
          }
        }]
      }
    }
  });

  const exported = await exportManualQaSession(sessionId, {
    authOk: true,
    adminOk: true,
    fetchImpl: mock.fetchImpl,
    supabaseUrl: "https://supabase.example.com",
    serviceKey: "service"
  });

  assert.equal(exported.ok, true);
  assert.deepEqual(exported.session.work_packets, []);
  assert.deepEqual(exported.session.findings_analysis.findings, []);
  assert.deepEqual(exported.session.findings_analysis.clip_results, []);
  assert.match(exported.markdown, /## Recording analysis/);
  assert.match(exported.markdown, /Tester note \(supplemental\)/);
  assert.doesNotMatch(exported.markdown, /Work Packets|Legacy topic-derived export finding|Unverified browser transcript/);
});

test("manual QA session listing sends and returns offset pagination", async () => {
  let requestedUrl = null;
  const listed = await listManualQaSessions({
    limit: 25,
    offset: 50,
    supabaseUrl: "https://supabase.example.com",
    serviceKey: "service",
    fetchImpl: async (url) => {
      requestedUrl = new URL(url);
      return { ok: true, status: 200, async json() { return []; } };
    }
  });
  assert.equal(listed.ok, true);
  assert.equal(requestedUrl.searchParams.get("limit"), "25");
  assert.equal(requestedUrl.searchParams.get("offset"), "50");
  assert.equal(listed.limit, 25);
  assert.equal(listed.offset, 50);
  assert.equal(listed.has_more, false);
  assert.equal(listed.next_offset, null);
});

test("human-test item updates never invoke the legacy topic segmenter", async () => {
  for (const trial of [
    {
      kind: "tester_qualification",
      status: "in_progress",
      assignment: { type: "qualification" }
    },
    {
      kind: "paid_assignment",
      status: "submitted",
      submitted_at: "2026-07-19T03:21:00.000Z",
      assignment: { type: "paid" }
    }
  ]) {
    const mock = createSupabaseFetchMock();
    let segmenterCalls = 0;
    const options = {
      publicBaseUrl: "https://beforeusersdo.com",
      ownerUserId: `owner_${trial.kind}`,
      ownerEmail: "owner@example.com",
      fetchImpl: mock.fetchImpl,
      supabaseUrl: "https://supabase.example.com",
      serviceKey: "service",
      topicSegmenter() {
        segmenterCalls += 1;
        return { topic_segments: [] };
      }
    };
    const created = await createManualQaSession(
      {
        target_url: "https://example.com/checkout",
        title: `${trial.kind} privacy pass`,
        review_mode: "freestyle",
        qualification_trial: trial
      },
      options
    );
    const item = created.session.checklist[0];

    const updated = await updateManualQaItem(
      created.session.session_id,
      item.id,
      {
        note: "The checkout step was confusing.",
        widget_context: {
          page_url: "https://example.com/checkout",
          page_title: "Private checkout",
          transcript_events: [
            {
              source: "web_speech",
              text: "I do not understand this private checkout step.",
              is_final: true
            }
          ],
          evidence_events: [
            { type: "drawing_saved", label: "Private checkout annotation" }
          ]
        }
      },
      options
    );

    assert.equal(updated.ok, trial.submitted_at ? false : true);
    if (trial.submitted_at) assert.equal(updated.status, 409);
    assert.equal(segmenterCalls, 0, `${trial.kind} evidence reached the legacy segmenter`);
    if (updated.ok) assert.deepEqual(updated.item.widget_context.topic_segments, []);
  }
});

test("non-trial topic segmentation omits server analysis transcripts but keeps client speech", async () => {
  const mock = createSupabaseFetchMock();
  const options = {
    publicBaseUrl: "https://beforeusersdo.com",
    ownerUserId: "owner_segmenter_source_filter",
    ownerEmail: "owner@example.com",
    fetchImpl: mock.fetchImpl,
    supabaseUrl: "https://supabase.example.com",
    serviceKey: "service"
  };
  const created = await createManualQaSession(
    {
      target_url: "https://example.com/onboarding",
      title: "Non-trial topic source filter",
      review_mode: "freestyle"
    },
    options
  );
  const item = created.session.checklist[0];
  const recording = makeFinalRecording(created.session.session_id, 1);
  const storedManual = mock.rows.get(created.session.session_id).payload.manual_qa;
  storedManual.checklist[0] = {
    ...storedManual.checklist[0],
    evidence_media: [recording],
    widget_context: {
      page_url: "https://example.com/onboarding",
      page_title: "Onboarding",
      transcript_events: [
        {
          source: "web_speech",
          text: "CLIENT: this onboarding choice is unclear.",
          is_final: true,
          at: "2026-07-19T04:00:00.000Z"
        }
      ],
      evidence_events: [
        { type: "drawing_saved", label: "Client annotation" }
      ]
    }
  };
  const analysisSession = {
    session_id: created.session.session_id,
    checklist: storedManual.checklist
  };
  storedManual.findings_analysis = makeCompleteRecordingAnalysis(analysisSession, {
    transcript_event_count: 1,
    clip_results: [
      {
        evidence_id: recording.evidence_id,
        item_id: item.id,
        recording_index: 1,
        status: "complete",
        duration_ms: 10000,
        speech_segments: [
          {
            start_ms: 1000,
            end_ms: 3000,
            text: "SERVER: private recording analysis transcript."
          }
        ],
        visual_events: [],
        summary: "The recording contains one spoken observation.",
        confidence: 1
      }
    ]
  });

  let segmenterInput = null;
  const updated = await updateManualQaItem(
    created.session.session_id,
    item.id,
    { note: "Keep the ordinary manual-QA topic path active." },
    {
      ...options,
      topicSegmenter(input) {
        segmenterInput = input;
        return { topic_segments: [] };
      }
    }
  );

  assert.equal(updated.ok, true);
  assert.ok(segmenterInput);
  assert.equal(segmenterInput.transcript_events.length, 1);
  assert.match(segmenterInput.transcript_events[0].text, /onboarding choice is unclear/i);
  assert.doesNotMatch(JSON.stringify(segmenterInput), /private recording analysis transcript/i);
  assert.equal(segmenterInput.page.url, "https://example.com/onboarding");
  assert.equal(segmenterInput.evidence_events[0].label, "Client annotation");
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
              category: "frustration_point",
              title: "Hero and primary CTA clarity",
              summary: "The reviewer is focused on the homepage hero and what the MCP CTA promises.",
              start_index: 0,
              end_index: 1,
              confidence: 0.92
            },
            {
              title: "Pricing page crashed",
              summary: "The pricing page crashed while the reviewer explored it.",
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
  assert.equal(topicPackets[0].category, "frustration_point");
  assert.equal(topicPackets[1].category, "bug");
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
    assert.match(exported.markdown, /Independent Post-Fix Review Gate/);
    assert.match(exported.markdown, /fresh contextless reviewer agent/);
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

test("manual QA event journal recovers a widget update when the session snapshot write fails", async () => {
  const mock = createSupabaseFetchMock();
  const options = {
    publicBaseUrl: "https://beforeusersdo.com",
    ownerUserId: "user_recovery",
    ownerEmail: "owner@example.com",
    fetchImpl: mock.fetchImpl,
    supabaseUrl: "https://supabase-recovery.example.com",
    serviceKey: "service"
  };
  const created = await createManualQaSession(
    {
      target_url: "https://preview.example.com",
      title: "Recovery pass",
      acceptance_criteria: ["Feedback survives a stale session snapshot."]
    },
    options
  );
  const item = created.session.checklist[0];

  mock.controls.failNextReportPatch = true;
  const updated = await updateManualQaItem(
    created.session.session_id,
    item.id,
    {
      client_event_id: "context-recovery-1",
      note: "This note must survive the failed snapshot write.",
      widget_context: {
        page_url: "https://preview.example.com/checkout",
        transcript_events: [
          { text: "The checkout button did not move forward.", at: "2026-07-09T12:00:00.000Z", is_final: true }
        ]
      }
    },
    options
  );

  assert.equal(updated.ok, true);
  assert.equal(updated.status, 202);
  assert.equal(updated.snapshot_pending, true);
  assert.equal(mock.events.length, 1);
  assert.equal(mock.events[0].event_id, "context-recovery-1");

  const recovered = await getManualQaSession(created.session.session_id, options);
  assert.equal(recovered.ok, true);
  const recoveredItem = recovered.session.checklist.find((candidate) => candidate.id === item.id);
  assert.equal(recoveredItem.note, "This note must survive the failed snapshot write.");
  assert.match(recoveredItem.widget_context.transcript_events[0].text, /checkout button/);
  assert.equal(recovered.session.event_journal.event_count, 1);
});

test("widget and tester capture sessions expose only the capture allowlist", async () => {
  const previousEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY
  };
  const previousFetch = globalThis.fetch;
  const mock = createSupabaseFetchMock();
  process.env.SUPABASE_URL = "https://supabase-capture-safe.example.com";
  process.env.SUPABASE_SERVICE_KEY = "service";
  globalThis.fetch = mock.fetchImpl;

  try {
    const created = await createManualQaSession(
      {
        target_url: "https://preview.example.com/?token=target-secret",
        brand: "Example",
        title: "Capture-safe response",
        acceptance_criteria: ["Tester can capture the main flow."],
        feedback_action: "preview_fix_first"
      },
      {
        publicBaseUrl: "https://beforeusersdo.com",
        ownerUserId: "owner-user",
        ownerEmail: "owner-private@example.com",
        fetchImpl: mock.fetchImpl,
        supabaseUrl: "https://supabase-capture-safe.example.com",
        serviceKey: "service"
      }
    );
    const item = created.session.checklist[0];
    const widgetToken = new URL(created.widget_install.script_url).searchParams.get("token");
    const row = addPrivateCaptureMarkers(mock, created.session.session_id, item.id);
    const internalSession = normalizeManualQaSessionRow(row);

    assert.equal(internalSession.requested_by.owner_email, "owner-private@example.com");
    assert.equal(internalSession.qualification_trial.lead.email, "lead-private@example.com");
    assert.equal(internalSession.qualification_trial.tester.email, "tester-private@example.com");

    const directView = buildManualQaCaptureSessionView(internalSession);
    assertCaptureResponseSafe({ session: directView });
    assert.equal(directView.checklist[0].title, item.title);
    assert.equal(directView.work_packets.length, 1);
    assert.equal(directView.work_packets[0].title, "Visible captured topic");
    assert.equal(directView.context.feedback_action, "preview_fix_first");
    assert.match(directView.target_url, /token=%5Bredacted%5D/);

    const loaded = await callWidgetSessionHandler(created.session.session_id, widgetToken);
    assert.equal(loaded.statusCode, 200);
    assert.equal(loaded.body.ok, true);
    assertCaptureResponseSafe(loaded.body);
    assert.equal(loaded.body.session.checklist[0].title, item.title);
    assert.equal(loaded.body.session.work_packets[0].title, "Visible captured topic");

    mock.rows.get(created.session.session_id).payload.manual_qa.preview_proposal = {
      proposal_id: "capture-safe-preview",
      status: "draft",
      title: "Visible tester preview",
      summary: "A capture-safe proposal the tester can review."
    };
    const feedback = await callWidgetFeedbackHandler(
      {
        session_id: created.session.session_id,
        token: widgetToken,
        scope: "item",
        item_id: item.id,
        feedback_id: "tester-feedback-safe-response"
      },
      widgetToken
    );
    assert.equal(feedback.statusCode, 200);
    assert.equal(feedback.body.agent_delivery.ready, false);
    assert.equal(Object.prototype.hasOwnProperty.call(feedback.body, "markdown"), false);
    assertCaptureResponseSafe(feedback.body);

    const previewResponse = await callWidgetPreviewProposalHandler(
      {
        session_id: created.session.session_id,
        token: widgetToken,
        status: "approved",
        response_note: "This tester-safe preview is clear."
      },
      widgetToken
    );
    assert.equal(previewResponse.statusCode, 200, JSON.stringify(previewResponse.body));
    assert.equal(previewResponse.body.preview_proposal.status, "approved");
    assertCaptureResponseSafe(previewResponse.body);
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

test("manual QA post-fix review is persisted and controls may_mark_done", async () => {
  const previousFetch = globalThis.fetch;
  const previousEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    QA_SERVICE_TOKEN: process.env.QA_SERVICE_TOKEN
  };
  const mock = createSupabaseFetchMock();
  globalThis.fetch = mock.fetchImpl;
  process.env.SUPABASE_URL = "https://supabase-postfix.example.com";
  process.env.SUPABASE_SERVICE_KEY = "service";
  process.env.QA_SERVICE_TOKEN = "service-token";

  try {
    const created = await createManualQaSession(
      {
        target_url: "https://preview.example.com",
        brand: "Example",
        title: "Post-fix review",
        review_mode: "freestyle",
        feedback_action: "share_feedback_and_start_work"
      },
      {
        publicBaseUrl: "https://beforeusersdo.com",
        ownerUserId: "user_review",
        ownerEmail: "owner@example.com",
        fetchImpl: mock.fetchImpl,
        supabaseUrl: "https://supabase-postfix.example.com",
        serviceKey: "service"
      }
    );

    const missed = await recordManualQaPostFixReview(
      created.session.session_id,
      {
        verdict: "missed",
        fixed_url: "https://preview.example.com?token=secret",
        missed_items: ["Hero still shows old copy."],
        changed_files: ["src/App.tsx"]
      },
      {
        authOk: true,
        ownerUserId: "user_review",
        fetchImpl: mock.fetchImpl,
        supabaseUrl: "https://supabase-postfix.example.com",
        serviceKey: "service"
      }
    );

    assert.equal(missed.ok, true);
    assert.equal(missed.may_mark_done, false);
    assert.equal(missed.post_fix_review.verdict, "missed");
    assert.equal(missed.post_fix_review.fixed_url, "https://preview.example.com/?token=%5Bredacted%5D");
    assert.deepEqual(missed.post_fix_review.missed_items, ["Hero still shows old copy."]);

    const passed = await callPostFixReviewHandler({
      session_id: created.session.session_id,
      review: {
        verdict: "fixed",
        fixed_url: "https://preview.example.com",
        fixed_items: ["Hero copy updated."],
        test_results: ["lint passed"]
      }
    });

    assert.equal(passed.statusCode, 200);
    assert.equal(passed.body.ok, true);
    assert.equal(passed.body.may_mark_done, true);
    assert.equal(passed.body.post_fix_review.verdict, "fixed");
    assert.equal(passed.body.session.post_fix_reviews.may_mark_done, true);
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
            },
            {
              type: "comment_saved",
              label: "Page comment",
              comment_text: "This specific pricing label should say free trial instead of start now.",
              at: "2026-07-05T10:00:24.000Z",
              page_x: 414,
              page_y: 260,
              client_x: 414,
              client_y: 260,
              target_selector: "button.cta \"Start now\"",
              selected_text: "Start now",
              viewport: { width: 1440, height: 900, device_pixel_ratio: 2 },
              page_url: "https://preview.example.com/onboarding?token=abc123"
            },
            {
              event_id: "comment_price_label_1",
              type: "comment_saved",
              label: "Page comment",
              comment_text: "This specific pricing label should say free trial instead of start now.",
              at: "2026-07-05T10:00:24.000Z",
              page_x: 414,
              page_y: 260,
              client_x: 414,
              client_y: 260,
              target_selector: "button.cta \"Start now\"",
              selected_text: "Start now",
              viewport: { width: 1440, height: 900, device_pixel_ratio: 2 },
              page_url: "https://preview.example.com/onboarding?token=abc123"
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
    const commentEvents = updated.item.widget_context.evidence_events.filter((entry) => entry.type === "comment_saved");
    assert.equal(commentEvents.length, 1);
    assert.equal(commentEvents[0].event_id, "comment_price_label_1");

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
    assert.match(directMarkdown, /Comment: This specific pricing label should say free trial instead of start now/);
    assert.match(directMarkdown, /at 414,260/);
    assert.match(directMarkdown, /near button\.cta/);
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
    assertCaptureResponseSafe(feedback.body);
    assert.equal(feedback.body.session.checklist[0].status, "fail");
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
    assert.match(feedback.body.markdown, /Comment: This specific pricing label should say free trial instead of start now/);
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
    assert.match(feedback.body.markdown, /Independent Post-Fix Review Gate/);
    assert.match(feedback.body.markdown, /fresh contextless reviewer agent/);
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
    addPrivateCaptureMarkers(mock, created.session.session_id, item.id);
    const segmentBytes = makeUploadWebm("segment-one");

    const spoofed = await callWidgetEvidenceHandler(
      {
        session_id: created.session.session_id,
        token: widgetToken,
        item_id: item.id,
        evidence_id: "spoofed-video",
        kind: "video",
        content_type: "video/webm",
        data_url: `data:video/webm;base64,${Buffer.from("plain text").toString("base64")}`
      },
      widgetToken
    );
    assert.equal(spoofed.statusCode, 415);
    assert.equal(mock.objects.size, 0);

    const uploaded = await callWidgetEvidenceHandler(
      {
        session_id: created.session.session_id,
        token: widgetToken,
        item_id: item.id,
        evidence_id: "video-segment-retry-1",
        kind: "video",
        label: "Video recording segment 1",
        filename: "review-recording-part-001.webm",
        content_type: "video/webm",
        data_url: `data:video/webm;base64,${segmentBytes.toString("base64")}`
      },
      widgetToken
    );

    assert.equal(uploaded.statusCode, 201);
    assert.equal(uploaded.body.item.evidence_media.length, 1);
    assert.equal(uploaded.body.item.evidence_media[0].kind, "video");
    assert.equal(uploaded.body.item.evidence_media[0].evidence_id, "video-segment-retry-1");
    assert.equal(uploaded.body.item.evidence_media[0].label, "Video recording segment 1");
    assert.equal(uploaded.body.item.evidence_media[0].byte_length, segmentBytes.length);
    assert.match(uploaded.body.evidence_url, /api\/manual-qa\/evidence/);
    assertCaptureResponseSafe(uploaded.body);
    assert.equal(
      Object.prototype.hasOwnProperty.call(uploaded.body.item.evidence_media[0], "storage_path"),
      false
    );
    const markdown = buildManualQaAgentFeedbackMarkdown(uploaded.body.session, { item_id: item.id });
    assert.match(markdown, /Video recording \(Video recording segment 1, video\/webm, 15 B/);
    const storedEntry = mock.rows.get(created.session.session_id)
      .payload.manual_qa.checklist[0].evidence_media[0];
    assert.ok(storedEntry, JSON.stringify(mock.calls.filter((call) => call.options?.method === "PATCH").map((call) => call.url)));
    const storedPath = storedEntry.storage_path;
    const storedVideo = mock.objects.get(storedPath);
    assert.deepEqual(storedVideo.data, segmentBytes);

    const retried = await callWidgetEvidenceHandler(
      {
        session_id: created.session.session_id,
        token: widgetToken,
        item_id: item.id,
        evidence_id: "video-segment-retry-1",
        kind: "video",
        label: "Video recording segment 1",
        filename: "review-recording-part-001.webm",
        content_type: "video/webm",
        data_url: `data:video/webm;base64,${segmentBytes.toString("base64")}`
      },
      widgetToken
    );
    assert.equal(retried.statusCode, 201);
    assert.equal(retried.body.item.evidence_media.length, 1);
    assertCaptureResponseSafe(retried.body);
    assert.equal(mock.events.filter((entry) => entry.event_id === "video-segment-retry-1").length, 1);
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
    addPrivateCaptureMarkers(mock, created.session.session_id, item.id);
    const firstChunkBytes = makeUploadWebm("first-");
    const secondChunkBytes = Buffer.from("second");

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
        data_url: `data:video/webm;codecs=vp8,opus;base64,${firstChunkBytes.toString("base64")}`
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
        data_url: `data:video/webm;base64,${secondChunkBytes.toString("base64")}`
      },
      widgetToken
    );
    assert.equal(chunkA.statusCode, 201);
    assert.equal(chunkB.statusCode, 201);
    assertCaptureResponseSafe(chunkA.body);
    assertCaptureResponseSafe(chunkB.body);

    const duplicatePath = await callWidgetChunksHandler(
      {
        action: "finish",
        session_id: created.session.session_id,
        token: widgetToken,
        item_id: item.id,
        upload_id: "upload-1",
        kind: "video",
        content_type: "video/webm",
        chunks: [chunkA.body.chunk, { ...chunkA.body.chunk, index: 1 }]
      },
      widgetToken
    );
    assert.equal(duplicatePath.statusCode, 400);
    assert.match(duplicatePath.body.error, /paths must be unique/i);

    const skippedIndex = await callWidgetChunksHandler(
      {
        action: "finish",
        session_id: created.session.session_id,
        token: widgetToken,
        item_id: item.id,
        upload_id: "upload-1",
        kind: "video",
        content_type: "video/webm",
        chunks: [chunkA.body.chunk, { ...chunkB.body.chunk, index: 2 }]
      },
      widgetToken
    );
    assert.equal(skippedIndex.statusCode, 400);
    assert.match(skippedIndex.body.error, /unique and contiguous/i);

    const wrongUpload = await callWidgetChunksHandler(
      {
        action: "finish",
        session_id: created.session.session_id,
        token: widgetToken,
        item_id: item.id,
        upload_id: "upload-2",
        kind: "video",
        content_type: "video/webm",
        chunks: [chunkA.body.chunk, chunkB.body.chunk]
      },
      widgetToken
    );
    assert.equal(wrongUpload.statusCode, 400);
    assert.match(wrongUpload.body.error, /do not belong to this session/i);

    const traversal = await callWidgetChunksHandler(
      {
        action: "finish",
        session_id: created.session.session_id,
        token: widgetToken,
        item_id: item.id,
        upload_id: "upload-1",
        kind: "video",
        content_type: "video/webm",
        chunks: [{
          ...chunkA.body.chunk,
          storage_path: `${created.session.session_id}/manual-widget-video-chunks-upload-1/../../victim/private.webm`
        }]
      },
      widgetToken
    );
    assert.equal(traversal.statusCode, 400);
    assert.match(traversal.body.error, /do not belong to this session/i);

    const finished = await callWidgetChunksHandler(
      {
        action: "finish",
        session_id: created.session.session_id,
        token: widgetToken,
        item_id: item.id,
        upload_id: "upload-1",
        kind: "video",
        label: "Video recording",
        filename: "review.webm",
        content_type: "video/webm;codecs=vp8,opus",
        duration_ms: 9876,
        chunks: [chunkB.body.chunk, chunkA.body.chunk]
      },
      widgetToken
    );

    assert.equal(finished.statusCode, 201);
    assert.equal(finished.body.item.evidence_media.length, 1);
    assert.equal(finished.body.item.evidence_media[0].kind, "video");
    assert.equal(finished.body.item.evidence_media[0].label, "Video recording");
    assert.equal(finished.body.item.evidence_media[0].byte_length, firstChunkBytes.length + secondChunkBytes.length);
    assert.equal(finished.body.item.evidence_media[0].duration_ms, 9876);
    assert.match(finished.body.evidence_url, /api\/manual-qa\/evidence/);
    assertCaptureResponseSafe(finished.body);
    const markdown = buildManualQaAgentFeedbackMarkdown(finished.body.session, { item_id: item.id });
    assert.match(markdown, /Video recording \(Video recording, video\/webm;codecs=vp8,opus, 16 B/);
    const storedEntry = mock.rows.get(created.session.session_id)
      .payload.manual_qa.checklist[0].evidence_media[0];
    assert.ok(storedEntry, JSON.stringify(mock.calls.filter((call) => call.options?.method === "PATCH").map((call) => call.url)));
    const storedPath = storedEntry.storage_path;
    const storedVideo = mock.objects.get(storedPath);
    assert.deepEqual(storedVideo.data, Buffer.concat([firstChunkBytes, secondChunkBytes]));

    const retriedFinish = await callWidgetChunksHandler(
      {
        action: "finish",
        session_id: created.session.session_id,
        token: widgetToken,
        item_id: item.id,
        upload_id: "upload-1",
        kind: "video",
        label: "Video recording",
        content_type: "video/webm;codecs=vp8,opus",
        duration_ms: 9876,
        chunks: [chunkA.body.chunk, chunkB.body.chunk]
      },
      widgetToken
    );
    assert.equal(retriedFinish.statusCode, 200);
    assert.equal(retriedFinish.body.evidence_id, finished.body.evidence_id);
    assert.equal(retriedFinish.body.item.evidence_media.length, 1);
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

test("submitted trials reject recording bytes before either upload endpoint writes storage", async () => {
  const previousEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    QA_EVIDENCE_STORAGE_BUCKET: process.env.QA_EVIDENCE_STORAGE_BUCKET
  };
  const previousFetch = globalThis.fetch;
  const mock = createSupabaseAndStorageFetchMock();
  process.env.SUPABASE_URL = "https://supabase-locked-upload.example.com";
  process.env.SUPABASE_SERVICE_KEY = "service";
  process.env.QA_EVIDENCE_STORAGE_BUCKET = "qa-evidence";
  globalThis.fetch = mock.fetchImpl;

  try {
    const options = {
      publicBaseUrl: "https://beforeusersdo.com",
      ownerUserId: "owner_locked_upload",
      ownerEmail: "owner@example.com",
      authOk: true,
      fetchImpl: mock.fetchImpl,
      supabaseUrl: process.env.SUPABASE_URL,
      serviceKey: "service"
    };
    const created = await createManualQaSession(
      {
        target_url: "https://example.com",
        title: "Locked recording upload",
        review_mode: "freestyle"
      },
      options
    );
    const token = new URL(created.widget_install.script_url).searchParams.get("token");
    const locked = await updateManualQaQualificationTrial(
      created.session.session_id,
      {
        kind: "tester_qualification",
        status: "submitted",
        submitted_at: "2026-07-19T05:00:00.000Z"
      },
      options
    );
    assert.equal(locked.ok, true);
    const beforeObjects = mock.objects.size;

    const direct = await callWidgetEvidenceHandler(
      {
        session_id: created.session.session_id,
        token,
        item_id: "freestyle",
        evidence_id: "late-direct-video",
        kind: "video",
        content_type: "video/webm",
        duration_ms: 30000,
        data_url: `data:video/webm;base64,${Buffer.from("late-video").toString("base64")}`
      },
      token
    );
    const chunk = await callWidgetChunksHandler(
      {
        action: "chunk",
        session_id: created.session.session_id,
        token,
        upload_id: "late-chunk-upload",
        chunk_index: 0,
        kind: "video",
        content_type: "video/webm",
        data_url: `data:video/webm;base64,${Buffer.from("late-chunk").toString("base64")}`
      },
      token
    );

    assert.equal(direct.statusCode, 409);
    assert.equal(chunk.statusCode, 409);
    assert.equal(mock.objects.size, beforeObjects);
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("recording upload storage is capped across the whole session", async () => {
  const previousEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    QA_EVIDENCE_STORAGE_BUCKET: process.env.QA_EVIDENCE_STORAGE_BUCKET,
    QA_WIDGET_MAX_SESSION_RECORDING_BYTES: process.env.QA_WIDGET_MAX_SESSION_RECORDING_BYTES
  };
  const previousFetch = globalThis.fetch;
  const mock = createSupabaseAndStorageFetchMock();
  process.env.SUPABASE_URL = "https://supabase-quota.example.com";
  process.env.SUPABASE_SERVICE_KEY = "service";
  process.env.QA_EVIDENCE_STORAGE_BUCKET = "qa-evidence";
  process.env.QA_WIDGET_MAX_SESSION_RECORDING_BYTES = "10";
  globalThis.fetch = mock.fetchImpl;

  try {
    const created = await createManualQaSession(
      { target_url: "https://example.com", title: "Recording quota", review_mode: "freestyle" },
      {
        publicBaseUrl: "https://beforeusersdo.com",
        ownerUserId: "owner_quota",
        fetchImpl: mock.fetchImpl,
        supabaseUrl: process.env.SUPABASE_URL,
        serviceKey: "service"
      }
    );
    const token = new URL(created.widget_install.script_url).searchParams.get("token");
    const first = await callWidgetEvidenceHandler(
      {
        session_id: created.session.session_id,
        token,
        item_id: "freestyle",
        evidence_id: "quota-video-1",
        kind: "video",
        filename: "quota-1.webm",
        content_type: "video/webm",
        duration_ms: 1000,
        data_url: `data:video/webm;base64,${makeUploadWebm("12").toString("base64")}`
      },
      token
    );
    assert.equal(first.statusCode, 201);
    const objectCount = mock.objects.size;
    const second = await callWidgetEvidenceHandler(
      {
        session_id: created.session.session_id,
        token,
        item_id: "freestyle",
        evidence_id: "quota-video-2",
        kind: "video",
        filename: "quota-2.webm",
        content_type: "video/webm",
        duration_ms: 1000,
        data_url: `data:video/webm;base64,${makeUploadWebm("ab").toString("base64")}`
      },
      token
    );
    assert.equal(second.statusCode, 413);
    assert.match(second.body.error, /storage limit/i);
    assert.equal(mock.objects.size, objectCount);
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("concurrent evidence uploads cannot overbook the session byte budget", async () => {
  const mock = createSupabaseFetchMock();
  const options = {
    publicBaseUrl: "https://beforeusersdo.com",
    ownerUserId: "owner_atomic_quota",
    fetchImpl: mock.fetchImpl,
    supabaseUrl: "https://supabase-atomic-quota.example.com",
    serviceKey: "service",
    maxBytes: 10
  };
  const created = await createManualQaSession(
    { target_url: "https://example.com", title: "Atomic quota", review_mode: "freestyle" },
    options
  );

  const results = await Promise.all([
    reserveManualQaEvidenceUploadBytes(created.session.session_id, "upload-a", 6, options),
    reserveManualQaEvidenceUploadBytes(created.session.session_id, "upload-b", 6, options)
  ]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(results.filter((result) => result.status === 413).length, 1);
  assert.equal(
    mock.rows.get(created.session.session_id).payload.manual_qa.evidence_upload_quota.reserved_bytes,
    6
  );
});

test("redactSensitiveUrl redacts common secret query params", () => {
  assert.equal(
    redactSensitiveUrl("https://example.com/path?foo=1&access_token=secret&session=abc"),
    "https://example.com/path?foo=1&access_token=%5Bredacted%5D&session=%5Bredacted%5D"
  );
});
