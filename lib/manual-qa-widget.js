function json(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function buildManualQaWidgetScript(config = {}) {
  const safeConfig = {
    sessionId: String(config.sessionId || ""),
    token: String(config.token || ""),
    apiBaseUrl: String(config.apiBaseUrl || "").replace(/\/$/, "")
  };

  return `(() => {
  const CONFIG = ${json(safeConfig)};
  if (!CONFIG.sessionId || !CONFIG.token || !CONFIG.apiBaseUrl || window.__beforeUsersDoWidgetLoaded) return;
  window.__beforeUsersDoWidgetLoaded = true;

  const MAX_EVENTS = 60;
  const RECORDING_SEGMENT_MS = 10000;
  const RECORDING_SAVE_WAIT_MS = 45000;
  const state = {
    session: null,
    selectedItemId: "",
    note: "",
    renderedItemId: "",
    drawing: false,
    drawingDirty: false,
    lastSavedDrawingDataUrl: "",
    sentItemIds: new Set(),
    noteOpen: false,
    recording: false,
    recordingSaving: false,
    recordingLastError: "",
    recorder: null,
    recordingStream: null,
    recordingSegmentTimer: null,
    recordingSegmentBlobs: [],
    recordingSegmentContentType: "video/webm",
    recordingSegmentItemId: "",
    recordingSegmentIndex: 0,
    recordingSegmentUploads: [],
    recordingStopRequested: false,
    segmentStopPromise: null,
    resolveSegmentStop: null,
    streams: [],
    recordingUrl: "",
    recordingFrameVideo: null,
    recordingStartedAt: "",
    recordingSegmentStartedAt: "",
    transcriptEvents: [],
    transcriptStatus: "not_started",
    speechRecognition: null,
    speechRecognitionActive: false,
    speechRecognitionDisabled: false,
    speechRestartTimer: null,
    evidenceEvents: [],
    currentDrawingStartedAt: "",
    currentDrawingBounds: null,
    currentDrawingStrokeCount: 0,
    pageVisits: [],
    consoleEvents: [],
    networkEvents: [],
    pageErrors: [],
    pendingSend: null,
    sendingFeedback: false
  };

  const now = () => new Date().toISOString();
  const trim = (value, max = 1000) => String(value == null ? "" : value).slice(0, max);
  const pushLimited = (list, value) => {
    list.push(value);
    while (list.length > MAX_EVENTS) list.shift();
  };

  function pushEvidenceEvent(type, details = {}) {
    const itemId = details.item_id || details.itemId || selectedItem()?.id || state.selectedItemId || "";
    const event = {
      type,
      item_id: itemId,
      page_url: location.href,
      page_title: document.title,
      at: now(),
      ...details
    };
    delete event.itemId;
    pushLimited(state.evidenceEvents, event);
    return event;
  }

  function pushTranscriptEvent(details = {}) {
    const text = trim(details.text || details.transcript || "", 2000).replace(/\\s+/g, " ").trim();
    if (!text) return null;
    const itemId = details.item_id || details.itemId || selectedItem()?.id || state.selectedItemId || "";
    const event = {
      type: "speech",
      source: "web_speech",
      item_id: itemId,
      page_url: location.href,
      page_title: document.title,
      at: now(),
      ...details,
      text
    };
    delete event.itemId;
    pushLimited(state.transcriptEvents, event);
    return event;
  }

  function recordConsole(type, args) {
    pushLimited(state.consoleEvents, {
      type,
      message: args.map((arg) => {
        if (typeof arg === "string") return arg;
        try { return JSON.stringify(arg); } catch { return String(arg); }
      }).join(" ").slice(0, 1000),
      at: now()
    });
  }

  ["log", "warn", "error"].forEach((type) => {
    const original = console[type];
    if (typeof original !== "function") return;
    console[type] = function beforeUsersDoConsoleProxy(...args) {
      recordConsole(type, args);
      return original.apply(this, args);
    };
  });

  window.addEventListener("error", (event) => {
    pushLimited(state.pageErrors, {
      type: "error",
      message: trim(event.message || "Page error"),
      url: event.filename || location.href,
      at: now()
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    pushLimited(state.pageErrors, {
      type: "unhandledrejection",
      message: trim(event.reason && event.reason.message ? event.reason.message : event.reason || "Unhandled rejection"),
      url: location.href,
      at: now()
    });
  });

  if (typeof window.fetch === "function") {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const started = performance.now();
      const request = args[0];
      const url = typeof request === "string" ? request : request && request.url;
      const method = (args[1] && args[1].method) || (request && request.method) || "GET";
      try {
        const response = await originalFetch(...args);
        pushLimited(state.networkEvents, {
          type: "fetch",
          method,
          url: trim(url || "", 1000),
          status: response.status,
          duration_ms: Math.round(performance.now() - started),
          at: now()
        });
        return response;
      } catch (error) {
        pushLimited(state.networkEvents, {
          type: "fetch",
          method,
          url: trim(url || "", 1000),
          message: trim(error && error.message ? error.message : error),
          duration_ms: Math.round(performance.now() - started),
          at: now()
        });
        throw error;
      }
    };
  }

  if (window.XMLHttpRequest) {
    const OriginalXHR = window.XMLHttpRequest;
    window.XMLHttpRequest = function BeforeUsersDoXHR() {
      const xhr = new OriginalXHR();
      let method = "GET";
      let url = "";
      let started = 0;
      const originalOpen = xhr.open;
      const originalSend = xhr.send;
      xhr.open = function patchedOpen(nextMethod, nextUrl, ...rest) {
        method = nextMethod || "GET";
        url = String(nextUrl || "");
        return originalOpen.call(xhr, nextMethod, nextUrl, ...rest);
      };
      xhr.send = function patchedSend(...args) {
        started = performance.now();
        xhr.addEventListener("loadend", () => {
          pushLimited(state.networkEvents, {
            type: "xhr",
            method,
            url: trim(url, 1000),
            status: xhr.status,
            duration_ms: Math.round(performance.now() - started),
            at: now()
          });
        });
        return originalSend.apply(xhr, args);
      };
      return xhr;
    };
  }

  const host = document.createElement("div");
  host.id = "beforeusersdo-widget-root";
  host.style.position = "absolute";
  host.style.top = "0";
  host.style.left = "0";
  host.style.width = "100%";
  host.style.height = "0";
  host.style.zIndex = "2147483647";
  host.style.pointerEvents = "none";
  host.style.overflow = "visible";
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "open" });

  root.innerHTML = \`
    <style>
      :host {
        all: initial;
        --bud-panel-width: min(348px, calc(100vw - 88px));
        --bud-glass: rgba(22, 25, 31, .74);
        --bud-glass-strong: rgba(15, 18, 23, .88);
        --bud-glass-soft: rgba(255, 255, 255, .075);
        --bud-glass-lift: rgba(255, 255, 255, .12);
        --bud-line: rgba(255, 255, 255, .16);
        --bud-line-strong: rgba(255, 255, 255, .24);
        --bud-text: #f7f8fb;
        --bud-muted: #bdc6d3;
        --bud-faint: #8e99aa;
        --bud-accent: #7ab7ff;
        --bud-accent-strong: #2f8cff;
        --bud-success: #54d18a;
        --bud-danger: #ff6b7a;
        --bud-warning: #ffd166;
      }
      * { box-sizing: border-box; }
      .bud-panel, .bud-pill, .bud-canvas, .bud-toast, .bud-capture-panel {
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      button, textarea { font: inherit; }
      button { cursor: pointer; }
      .bud-canvas {
        position: absolute;
        top: 0;
        left: 0;
        display: none;
        pointer-events: auto;
        cursor: crosshair;
        z-index: 1;
      }
      .bud-canvas.is-active { display: block; }
      .bud-pill {
        position: fixed;
        right: 18px;
        bottom: 18px;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border: 0;
        border-radius: 999px;
        border: 1px solid var(--bud-line);
        background: linear-gradient(135deg, rgba(34, 38, 48, .82), rgba(17, 20, 26, .76));
        color: var(--bud-text);
        padding: 10px 13px;
        font-size: 13px;
        font-weight: 850;
        box-shadow: 0 18px 48px rgba(0, 0, 0, .34), inset 0 1px 0 rgba(255, 255, 255, .16);
        backdrop-filter: blur(24px) saturate(1.45);
        -webkit-backdrop-filter: blur(24px) saturate(1.45);
        pointer-events: auto;
        z-index: 3;
        touch-action: none;
      }
      .bud-pill.is-dragging { cursor: grabbing; }
      .bud-dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: var(--bud-success);
        box-shadow: 0 0 18px rgba(84, 209, 138, .45);
      }
      .bud-panel {
        position: fixed;
        top: 84px;
        left: 76px;
        right: auto;
        bottom: auto;
        width: var(--bud-panel-width);
        max-height: min(620px, calc(100vh - 104px));
        display: none;
        overflow: hidden;
        border: 1px solid var(--bud-line);
        border-radius: 18px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, .10), rgba(255, 255, 255, .035)),
          var(--bud-glass);
        color: var(--bud-text);
        box-shadow: 0 28px 90px rgba(0, 0, 0, .42), inset 0 1px 0 rgba(255, 255, 255, .18);
        backdrop-filter: blur(30px) saturate(1.45);
        -webkit-backdrop-filter: blur(30px) saturate(1.45);
        pointer-events: auto;
        z-index: 4;
      }
      .bud-panel.is-open { display: flex; flex-direction: column; }
      .bud-panel.is-dragging { cursor: grabbing; }
      .bud-head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: start;
        padding: 12px;
        border-bottom: 1px solid var(--bud-line);
        background: linear-gradient(180deg, rgba(255, 255, 255, .07), rgba(255, 255, 255, .025));
        cursor: grab;
        touch-action: none;
      }
      .bud-head:active { cursor: grabbing; }
      .bud-head button { cursor: pointer; }
      .bud-title { font-size: 13px; font-weight: 900; line-height: 1.25; }
      .bud-sub { margin-top: 3px; color: var(--bud-muted); font-size: 11px; line-height: 1.35; }
      .bud-progress-row {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-top: 8px;
      }
      .bud-progress { color: var(--bud-text); font-size: 11px; font-weight: 850; }
      .bud-close, .bud-nav-btn, .bud-head-tool {
        border: 1px solid var(--bud-line);
        border-radius: 12px;
        background: rgba(255, 255, 255, .08);
        color: var(--bud-text);
        width: 32px;
        height: 32px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .bud-head-tool {
        width: 30px;
        height: 30px;
        color: var(--bud-text);
      }
      .bud-head-tool:hover, .bud-close:hover, .bud-nav-btn:hover {
        background: rgba(255, 255, 255, .13);
      }
      .bud-close svg, .bud-nav-btn svg, .bud-tool svg, .bud-record svg, .bud-head-tool svg, .bud-item-send svg { width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
      .bud-tool svg .fill { fill: currentColor; stroke: none; }
      .bud-body {
        display: flex;
        min-height: 0;
        flex: 1;
        flex-direction: column;
        overflow: hidden;
      }
      .bud-current {
        padding: 12px;
        border-bottom: 1px solid var(--bud-line);
        background: rgba(255, 255, 255, .035);
      }
      .bud-label {
        color: var(--bud-faint);
        font-size: 10px;
        font-weight: 900;
        letter-spacing: 0;
        text-transform: uppercase;
      }
      .bud-current-title { margin-top: 5px; font-size: 14px; font-weight: 900; line-height: 1.25; }
      .bud-muted {
        margin: 8px 0 0;
        max-height: 96px;
        overflow: auto;
        color: var(--bud-muted);
        font-size: 12px;
        line-height: 1.42;
      }
      .bud-evidence {
        display: none;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 10px;
      }
      .bud-evidence.has-items { display: flex; }
      .bud-evidence.has-items::before {
        content: "Saved";
        align-self: center;
        color: var(--bud-faint);
        font-size: 10px;
        font-weight: 900;
        text-transform: uppercase;
      }
      .bud-evidence-chip {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        min-width: 0;
        border: 1px solid var(--bud-line);
        border-radius: 999px;
        background: rgba(255, 255, 255, .08);
        color: var(--bud-text);
        padding: 5px 7px;
        font-size: 11px;
        font-weight: 850;
        line-height: 1;
      }
      .bud-evidence-chip svg { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
      .bud-evidence-more { color: var(--bud-faint); }
      .bud-nav {
        display: grid;
        grid-template-columns: 32px 1fr 32px;
        gap: 8px;
        align-items: center;
        margin-top: 10px;
      }
      .bud-count { color: var(--bud-muted); font-size: 12px; font-weight: 850; text-align: center; }
      .bud-capture-panel {
        position: fixed;
        top: 84px;
        left: 14px;
        right: auto;
        bottom: auto;
        width: auto;
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        gap: 7px;
        border: 1px solid var(--bud-line);
        border-radius: 22px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, .11), rgba(255, 255, 255, .035)),
          var(--bud-glass);
        color: var(--bud-text);
        padding: 7px;
        box-shadow: 0 24px 76px rgba(0, 0, 0, .4), inset 0 1px 0 rgba(255, 255, 255, .16);
        backdrop-filter: blur(30px) saturate(1.45);
        -webkit-backdrop-filter: blur(30px) saturate(1.45);
        pointer-events: auto;
        z-index: 4;
        touch-action: none;
      }
      .bud-capture-panel.is-open { display: inline-flex; }
      .bud-capture-panel.is-note-open {
        width: 260px;
        max-width: min(260px, calc(100vw - 16px));
        align-items: stretch;
        border-radius: 22px;
      }
      .bud-capture-panel.is-dragging { cursor: grabbing; }
      .bud-grip {
        width: 34px;
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        cursor: grab;
        flex: 0 0 auto;
      }
      .bud-grip::before {
        content: "";
        width: 16px;
        height: 3px;
        border-radius: 999px;
        background: linear-gradient(90deg, var(--bud-faint), var(--bud-faint)) left / 3px 3px no-repeat,
          linear-gradient(90deg, var(--bud-faint), var(--bud-faint)) center / 3px 3px no-repeat,
          linear-gradient(90deg, var(--bud-faint), var(--bud-faint)) right / 3px 3px no-repeat;
        opacity: .72;
      }
      .bud-record, .bud-tool {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--bud-line);
        color: var(--bud-text);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, .12);
      }
      .bud-record {
        flex: 0 0 auto;
        width: 38px;
        height: 38px;
        padding: 0;
        border-radius: 13px;
        background: rgba(47, 140, 255, .28);
      }
      .bud-record:hover, .bud-record.active {
        border-color: rgba(122, 183, 255, .66);
        background: rgba(47, 140, 255, .38);
      }
      .bud-record.danger {
        border-color: rgba(255, 107, 122, .62);
        background: rgba(255, 107, 122, .28);
        color: #fff4f5;
      }
      .bud-record.saving {
        border-color: rgba(250, 204, 21, .62);
        background: rgba(250, 204, 21, .20);
        color: #fff9d7;
      }
      .bud-record:disabled {
        cursor: wait;
        opacity: .82;
      }
      .bud-tool {
        width: 38px;
        height: 38px;
        border-radius: 13px;
        background: rgba(255, 255, 255, .09);
        font-size: 17px;
        font-weight: 900;
        line-height: 1;
      }
      .bud-tool:hover, .bud-tool.active {
        border-color: rgba(122, 183, 255, .54);
        background: rgba(47, 140, 255, .28);
        color: #f7fbff;
      }
      .bud-record-label, .bud-sr {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
      .bud-note-popover {
        display: none;
        flex: 1 0 100%;
        min-width: 0;
      }
      .bud-capture-panel.is-note-open .bud-note-popover { display: block; }
      .bud-note {
        width: 100%;
        min-height: 76px;
        margin-top: 6px;
        resize: vertical;
        border: 1px solid var(--bud-line);
        border-radius: 14px;
        padding: 10px 11px;
        color: var(--bud-text);
        background: rgba(5, 7, 11, .34);
        font-size: 13px;
        line-height: 1.4;
        outline: none;
      }
      .bud-note::placeholder { color: var(--bud-faint); }
      .bud-note:focus {
        border-color: rgba(122, 183, 255, .72);
        box-shadow: 0 0 0 3px rgba(47, 140, 255, .22);
      }
      .bud-list-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 12px 8px;
        color: var(--bud-faint);
        font-size: 11px;
        font-weight: 900;
        letter-spacing: 0;
        text-transform: uppercase;
      }
      .bud-list {
        display: grid;
        gap: 7px;
        min-height: 0;
        overflow: auto;
        padding: 0 12px 12px;
      }
      .bud-panel.is-freestyle .bud-list-head,
      .bud-panel.is-freestyle .bud-list,
      .bud-panel.is-freestyle .bud-nav {
        display: none;
      }
      .bud-panel.is-freestyle .bud-current {
        border-bottom: 0;
      }
      .bud-panel.is-freestyle {
        max-height: min(280px, calc(100vh - 104px));
      }
      .bud-item {
        width: 100%;
        display: grid;
        grid-template-columns: 1fr 34px;
        gap: 8px;
        align-items: center;
        border: 1px solid var(--bud-line);
        border-radius: 14px;
        background: rgba(255, 255, 255, .07);
        color: var(--bud-text);
        padding: 8px;
        text-align: left;
      }
      .bud-item:hover { background: rgba(255, 255, 255, .105); }
      .bud-item.is-selected {
        border-color: rgba(122, 183, 255, .76);
        background: rgba(47, 140, 255, .18);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, .08);
      }
      .bud-item.is-sent {
        border-color: rgba(84, 209, 138, .36);
      }
      .bud-item-main {
        min-width: 0;
        display: grid;
        grid-template-columns: 22px 1fr;
        gap: 8px;
        align-items: center;
        border: 0;
        background: transparent;
        color: inherit;
        padding: 0;
        text-align: left;
      }
      .bud-item-index {
        width: 22px;
        height: 22px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        background: rgba(255, 255, 255, .12);
        color: var(--bud-muted);
        font-size: 11px;
        font-weight: 900;
      }
      .bud-item-title { min-width: 0; font-size: 12px; font-weight: 850; line-height: 1.25; }
      .bud-item-send {
        width: 34px;
        height: 34px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--bud-line);
        border-radius: 12px;
        background: rgba(255, 255, 255, .08);
        color: var(--bud-muted);
      }
      .bud-item-send:hover {
        border-color: rgba(122, 183, 255, .54);
        background: rgba(47, 140, 255, .22);
        color: var(--bud-text);
      }
      .bud-item.is-sent .bud-item-send {
        color: var(--bud-success);
        border-color: rgba(84, 209, 138, .42);
      }
      .bud-tool:disabled, .bud-nav-btn:disabled, .bud-item-send:disabled { opacity: .45; cursor: not-allowed; }
      .bud-send-menu {
        position: fixed;
        width: min(236px, calc(100vw - 16px));
        display: none;
        gap: 7px;
        border: 1px solid var(--bud-line);
        border-radius: 18px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, .12), rgba(255, 255, 255, .04)),
          var(--bud-glass-strong);
        color: var(--bud-text);
        padding: 8px;
        box-shadow: 0 22px 64px rgba(0, 0, 0, .42), inset 0 1px 0 rgba(255, 255, 255, .14);
        backdrop-filter: blur(28px) saturate(1.35);
        -webkit-backdrop-filter: blur(28px) saturate(1.35);
        pointer-events: auto;
        z-index: 7;
      }
      .bud-send-menu.is-open { display: grid; }
      .bud-send-title {
        padding: 2px 4px 4px;
        color: var(--bud-muted);
        font-size: 11px;
        font-weight: 900;
      }
      .bud-send-option {
        display: grid;
        gap: 2px;
        width: 100%;
        border: 1px solid var(--bud-line);
        border-radius: 13px;
        background: rgba(255, 255, 255, .075);
        color: var(--bud-text);
        padding: 9px 10px;
        text-align: left;
        cursor: pointer;
      }
      .bud-send-option:hover, .bud-send-option:focus {
        border-color: rgba(122, 183, 255, .58);
        background: rgba(47, 140, 255, .22);
        outline: none;
      }
      .bud-send-option strong {
        font-size: 12px;
        font-weight: 900;
        line-height: 1.2;
      }
      .bud-send-option span {
        color: var(--bud-muted);
        font-size: 11px;
        font-weight: 750;
        line-height: 1.25;
      }
      .bud-toast {
        position: fixed;
        left: 50%;
        bottom: 20px;
        transform: translateX(-50%);
        max-width: min(540px, calc(100vw - 24px));
        display: none;
        border-radius: 999px;
        border: 1px solid var(--bud-line);
        background: rgba(18, 21, 27, .88);
        color: var(--bud-text);
        padding: 10px 14px;
        font-size: 13px;
        font-weight: 850;
        pointer-events: none;
        z-index: 5;
        box-shadow: 0 18px 52px rgba(0, 0, 0, .36);
        backdrop-filter: blur(22px) saturate(1.4);
        -webkit-backdrop-filter: blur(22px) saturate(1.4);
      }
      .bud-toast.is-visible { display: block; }
      @media (max-width: 860px) {
        .bud-capture-panel { left: 8px; right: auto; top: 8px; bottom: auto; width: auto; }
        .bud-capture-panel.is-note-open { width: min(260px, calc(100vw - 16px)); }
        .bud-panel { top: 62px; left: 8px; width: min(348px, calc(100vw - 16px)); max-height: calc(100vh - 78px); }
      }
      @media (max-width: 620px) {
        .bud-panel { top: 62px; left: 8px; right: 8px; width: calc(100vw - 16px); }
        .bud-pill { right: 12px; bottom: 12px; }
      }
    </style>
    <canvas class="bud-canvas" part="canvas"></canvas>
    <button class="bud-pill" type="button"><span class="bud-dot"></span><span>BeforeUsersDo</span></button>
    <section class="bud-panel" aria-label="BeforeUsersDo review">
      <div class="bud-head">
        <div>
          <div class="bud-title">BeforeUsersDo review</div>
          <div class="bud-sub" data-role="subtitle">Test each item on this page.</div>
          <div class="bud-progress-row">
            <div class="bud-progress" data-role="progress">0 / 0 done</div>
            <button class="bud-head-tool" data-action="send-all" type="button" aria-label="Send all feedback to agent" title="Send all feedback to agent">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 2 11 13"></path><path d="m22 2-7 20-4-9-9-4 20-7z"></path><path d="M2 21h8"></path><path d="M2 17h5"></path></svg>
            </button>
          </div>
        </div>
        <button class="bud-close" type="button" aria-label="Close review">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
        </button>
      </div>
      <div class="bud-body">
        <div class="bud-current">
          <div class="bud-label" data-role="current-label">Current item</div>
          <div class="bud-current-title" data-role="current-title">Loading...</div>
          <p class="bud-muted" data-role="message">Check this, then record what you notice.</p>
          <div class="bud-evidence" data-role="evidence" aria-live="polite"></div>
          <div class="bud-nav">
            <button class="bud-nav-btn" data-action="prev" type="button" aria-label="Previous checklist item" title="Previous item">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg>
            </button>
            <div class="bud-count" data-role="item-count">0 of 0</div>
            <button class="bud-nav-btn" data-action="next" type="button" aria-label="Next checklist item" title="Next item">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>
            </button>
          </div>
        </div>
        <div class="bud-list-head"><span>Checklist</span><span data-role="list-count">0 items</span></div>
        <div class="bud-list" data-role="list"></div>
      </div>
    </section>
    <aside class="bud-capture-panel" aria-label="Capture review evidence">
      <span class="bud-grip" aria-hidden="true"></span>
      <button class="bud-record" data-action="record" type="button" aria-label="Record video" title="Record screen and voice">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 13 5 3V8l-5 3"></path><rect x="3" y="6" width="13" height="12" rx="2"></rect></svg>
        <span class="bud-record-label" data-role="record-label">Record video</span>
      </button>
      <button class="bud-tool" data-action="draw" type="button" aria-label="Draw on page" title="Draw on page">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15.2 5.2 3.6 3.6"></path><path d="M4 20l4.5-1.1L19.2 8.2a2.5 2.5 0 0 0-3.5-3.5L5 15.4 4 20z"></path></svg>
      </button>
      <button class="bud-tool" data-action="clear" type="button" aria-label="Clear drawing" title="Clear drawing">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 21-4-4L14.5 5.5a3 3 0 0 1 4.2 4.2L7.5 21H7z"></path><path d="M14 21h7"></path></svg>
      </button>
      <button class="bud-tool" data-action="note-toggle" type="button" aria-label="Add text note" aria-expanded="false" title="Add text note">T</button>
      <span class="bud-sr" data-role="recording-state">Not recording. Records screen and voice after Chrome asks.</span>
      <div class="bud-note-popover">
        <textarea class="bud-note" data-role="note" placeholder="Type what you notice..."></textarea>
      </div>
    </aside>
    <div class="bud-send-menu" role="menu" aria-hidden="true">
      <div class="bud-send-title" data-role="send-title">Send feedback</div>
      <button class="bud-send-option" data-feedback-action="share_feedback_and_start_work" type="button" role="menuitem">
        <strong>Share + start work</strong>
        <span>Agent should fix it next.</span>
      </button>
      <button class="bud-send-option" data-feedback-action="preview_fix_first" type="button" role="menuitem">
        <strong>Preview fix first</strong>
        <span>Agent should mock it before coding.</span>
      </button>
      <button class="bud-send-option" data-feedback-action="share_feedback" type="button" role="menuitem">
        <strong>Share feedback only</strong>
        <span>Save/report it, no fixes yet.</span>
      </button>
    </div>
    <div class="bud-toast" data-role="toast"></div>
  \`;

  const canvas = root.querySelector(".bud-canvas");
  const pill = root.querySelector(".bud-pill");
  const panel = root.querySelector(".bud-panel");
  const capturePanel = root.querySelector(".bud-capture-panel");
  const closeButton = root.querySelector(".bud-close");
  const listEl = root.querySelector("[data-role='list']");
  const noteEl = root.querySelector("[data-role='note']");
  const subtitleEl = root.querySelector("[data-role='subtitle']");
  const currentLabelEl = root.querySelector("[data-role='current-label']");
  const messageEl = root.querySelector("[data-role='message']");
  const currentTitleEl = root.querySelector("[data-role='current-title']");
  const evidenceEl = root.querySelector("[data-role='evidence']");
  const progressEl = root.querySelector("[data-role='progress']");
  const itemCountEl = root.querySelector("[data-role='item-count']");
  const listCountEl = root.querySelector("[data-role='list-count']");
  const toastEl = root.querySelector("[data-role='toast']");
  const sendMenu = root.querySelector(".bud-send-menu");
  const sendTitleEl = root.querySelector("[data-role='send-title']");
  const recordingStateEl = root.querySelector("[data-role='recording-state']");
  const recordLabelEl = root.querySelector("[data-role='record-label']");
  const drawButton = root.querySelector("[data-action='draw']");
  const recordButton = root.querySelector("[data-action='record']");
  const noteToggleButton = root.querySelector("[data-action='note-toggle']");
  const prevButton = root.querySelector("[data-action='prev']");
  const nextButton = root.querySelector("[data-action='next']");
  const panelDragHandle = root.querySelector(".bud-head");
  let suppressPillOpen = false;

  function toast(message, durationMs = 2200) {
    toastEl.textContent = message;
    toastEl.classList.add("is-visible");
    window.setTimeout(() => toastEl.classList.remove("is-visible"), durationMs);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function makeDraggable(element, handle, options = {}) {
    if (!element || !handle) return;
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      if (options.ignoreInteractive !== false && event.target.closest("button, textarea, input, select, a")) return;
      const startRect = element.getBoundingClientRect();
      if (!startRect.width || !startRect.height) return;
      const startX = event.clientX;
      const startY = event.clientY;
      let moved = false;
      let prepared = false;

      const prepareDrag = () => {
        if (prepared) return;
        prepared = true;
        element.classList.add("is-dragging");
        element.style.left = startRect.left + "px";
        element.style.top = startRect.top + "px";
        element.style.right = "auto";
        element.style.bottom = "auto";
        if (options.lockWidth) element.style.width = startRect.width + "px";
        if (options.lockHeight) element.style.height = startRect.height + "px";
      };

      const move = (moveEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        if (!moved && Math.hypot(dx, dy) < 4) return;
        moved = true;
        prepareDrag();
        const currentRect = element.getBoundingClientRect();
        const width = currentRect.width || startRect.width;
        const height = currentRect.height || startRect.height;
        const margin = 8;
        const maxX = Math.max(margin, window.innerWidth - width - margin);
        const maxY = Math.max(margin, window.innerHeight - height - margin);
        element.style.left = clamp(startRect.left + dx, margin, maxX) + "px";
        element.style.top = clamp(startRect.top + dy, margin, maxY) + "px";
      };

      const stop = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", stop);
        element.classList.remove("is-dragging");
        if (moved && typeof options.onMoved === "function") options.onMoved();
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", stop, { once: true });
    });
  }

  function setNoteOpen(open, options = {}) {
    state.noteOpen = Boolean(open);
    capturePanel.classList.toggle("is-note-open", state.noteOpen);
    noteToggleButton.classList.toggle("active", state.noteOpen);
    noteToggleButton.setAttribute("aria-expanded", state.noteOpen ? "true" : "false");
    if (state.noteOpen && options.focus) {
      window.setTimeout(() => noteEl.focus(), 0);
    }
  }

  function closeSendMenu() {
    state.pendingSend = null;
    sendMenu.classList.remove("is-open");
    sendMenu.setAttribute("aria-hidden", "true");
  }

  function openSendMenu(scope, itemId, anchor) {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const menuWidth = 236;
    const menuHeight = 146;
    const margin = 8;
    const below = rect.bottom + margin;
    const top = below + menuHeight > window.innerHeight
      ? clamp(rect.top - menuHeight - margin, margin, Math.max(margin, window.innerHeight - menuHeight - margin))
      : clamp(below, margin, Math.max(margin, window.innerHeight - menuHeight - margin));
    const left = clamp(rect.right - menuWidth, margin, Math.max(margin, window.innerWidth - menuWidth - margin));
    state.pendingSend = { scope, itemId: itemId || "" };
    sendTitleEl.textContent = scope === "all" ? "Send all feedback" : "Send this item";
    sendMenu.style.left = left + "px";
    sendMenu.style.top = top + "px";
    sendMenu.classList.add("is-open");
    sendMenu.setAttribute("aria-hidden", "false");
    window.setTimeout(() => {
      const firstOption = sendMenu.querySelector("[data-feedback-action]");
      if (firstOption) firstOption.focus();
    }, 0);
  }

  async function chooseSendAction(feedbackAction) {
    const pending = state.pendingSend;
    closeSendMenu();
    if (!pending || state.sendingFeedback) return;
    state.sendingFeedback = true;
    toast("Sending feedback...");
    try {
      if (pending.scope === "item") {
        await sendItemFeedback(pending.itemId, feedbackAction);
      } else {
        await sendFeedback(pending.scope, feedbackAction);
      }
    } finally {
      state.sendingFeedback = false;
    }
  }

  async function api(path, options = {}) {
    const response = await fetch(CONFIG.apiBaseUrl + path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "x-bud-widget-token": CONFIG.token,
        ...(options.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || "BeforeUsersDo request failed");
    }
    return payload;
  }

  function checklistItems() {
    return state.session && Array.isArray(state.session.checklist) ? state.session.checklist : [];
  }

  function isFreestyleMode() {
    return String(state.session?.review_mode || "").toLowerCase() === "freestyle";
  }

  function selectedIndex() {
    const items = checklistItems();
    return Math.max(0, items.findIndex((item) => item.id === state.selectedItemId));
  }

  function selectedItem() {
    const items = checklistItems();
    return items.find((item) => item.id === state.selectedItemId) || items[0] || null;
  }

  function storageKey() {
    return "beforeusersdo:selected:" + CONFIG.sessionId;
  }

  function widgetOpenKey() {
    return "beforeusersdo:open:" + CONFIG.sessionId;
  }

  function pageVisitsKey() {
    return "beforeusersdo:visits:" + CONFIG.sessionId;
  }

  function storedSelectedItemId() {
    try {
      return localStorage.getItem(storageKey()) || "";
    } catch {
      return "";
    }
  }

  function rememberSelectedItem() {
    try {
      if (state.selectedItemId) localStorage.setItem(storageKey(), state.selectedItemId);
    } catch {}
  }

  function storedWidgetOpen() {
    try {
      return localStorage.getItem(widgetOpenKey()) === "true";
    } catch {
      return false;
    }
  }

  function rememberWidgetOpen(open) {
    try {
      localStorage.setItem(widgetOpenKey(), open ? "true" : "false");
    } catch {}
  }

  function loadStoredPageVisits() {
    try {
      const parsed = JSON.parse(localStorage.getItem(pageVisitsKey()) || "[]");
      return Array.isArray(parsed) ? parsed.slice(-40) : [];
    } catch {
      return [];
    }
  }

  function persistPageVisits() {
    try {
      localStorage.setItem(pageVisitsKey(), JSON.stringify(state.pageVisits.slice(-40)));
    } catch {}
  }

  function recordPageVisit() {
    const entry = {
      page_url: location.href,
      page_title: document.title || "",
      at: now()
    };
    const previous = state.pageVisits[state.pageVisits.length - 1];
    if (previous && previous.page_url === entry.page_url && previous.page_title === entry.page_title) {
      previous.at = entry.at;
    } else {
      state.pageVisits.push(entry);
      state.pageVisits = state.pageVisits.slice(-40);
    }
    persistPageVisits();
  }

  function recordPageVisitSoon() {
    window.setTimeout(recordPageVisit, 0);
  }

  function installRouteTracking() {
    if (!window.history) return;
    ["pushState", "replaceState"].forEach((method) => {
      const original = window.history[method];
      if (typeof original !== "function") return;
      window.history[method] = function beforeUsersDoHistoryProxy(...args) {
        const result = original.apply(this, args);
        recordPageVisitSoon();
        return result;
      };
    });
    window.addEventListener("popstate", recordPageVisitSoon);
    window.addEventListener("hashchange", recordPageVisitSoon);
    window.addEventListener("pagehide", persistPageVisits);
  }

  function setSelectedItem(itemId) {
    const items = checklistItems();
    const item = items.find((candidate) => candidate.id === itemId) || items[0] || null;
    if (!item) return;
    const sameItem = item.id === state.selectedItemId;
    state.selectedItemId = item.id;
    if (!sameItem) {
      state.note = item.note || "";
      noteEl.value = state.note;
    }
    rememberSelectedItem();
    render();
  }

  function contextPayload() {
    return {
      page_url: location.href,
      page_title: document.title,
      user_agent: navigator.userAgent,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        device_pixel_ratio: window.devicePixelRatio || 1
      },
      console_events: state.consoleEvents.slice(-40),
      network_events: state.networkEvents.slice(-40),
      page_errors: state.pageErrors.slice(-20),
      page_visits: state.pageVisits.slice(-40),
      transcript_events: state.transcriptEvents.slice(-60),
      transcript_status: state.transcriptStatus,
      evidence_events: state.evidenceEvents.slice(-60)
    };
  }

  function evidenceEntries(item) {
    if (!item) return [];
    const media = Array.isArray(item.evidence_media) ? item.evidence_media : [];
    const urls = Array.isArray(item.evidence_urls)
      ? item.evidence_urls.map((url) => ({ kind: "link", url }))
      : [];
    return [...media, ...urls];
  }

  function evidenceKind(entry) {
    const kind = String(entry?.kind || "").toLowerCase();
    const contentType = String(entry?.content_type || entry?.contentType || "").toLowerCase();
    const label = String(entry?.label || "").toLowerCase();
    if (kind === "video" || contentType.startsWith("video/")) return "video";
    if (kind === "audio" || contentType.startsWith("audio/")) return "audio";
    if (kind === "screenshot" || kind === "image" || contentType.startsWith("image/") || label.includes("annotation")) return "drawing";
    return "evidence";
  }

  function evidenceLabel(entry) {
    const kind = evidenceKind(entry);
    if (kind === "video") return "Video";
    if (kind === "audio") return "Audio";
    if (kind === "drawing") return "Drawing";
    return "Saved";
  }

  function evidenceIcon(kind) {
    if (kind === "video") {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 13 5 3V8l-5 3"></path><rect x="3" y="6" width="13" height="12" rx="2"></rect></svg>';
    }
    if (kind === "drawing") {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15.2 5.2 3.6 3.6"></path><path d="M4 20l4.5-1.1L19.2 8.2a2.5 2.5 0 0 0-3.5-3.5L5 15.4 4 20z"></path></svg>';
    }
    if (kind === "audio") {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><path d="M12 19v3"></path></svg>';
    }
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>';
  }

  function savedVideoEvidenceCount(item) {
    return evidenceEntries(item).filter((entry) => evidenceKind(entry) === "video").length;
  }

  function renderEvidence(item) {
    const entries = evidenceEntries(item);
    evidenceEl.innerHTML = "";
    evidenceEl.classList.toggle("has-items", entries.length > 0);
    entries.slice(-4).forEach((entry) => {
      const kind = evidenceKind(entry);
      const chip = document.createElement("span");
      chip.className = "bud-evidence-chip";
      chip.innerHTML = evidenceIcon(kind) + "<span>" + escapeHtml(evidenceLabel(entry)) + "</span>";
      evidenceEl.appendChild(chip);
    });
    if (entries.length > 4) {
      const more = document.createElement("span");
      more.className = "bud-evidence-chip bud-evidence-more";
      more.textContent = "+" + (entries.length - 4) + " more";
      evidenceEl.appendChild(more);
    }
  }

  function render() {
    const items = checklistItems();
    const freestyle = isFreestyleMode();
    if (!state.selectedItemId && items.length) {
      const storedId = storedSelectedItemId();
      state.selectedItemId = items.some((item) => item.id === storedId) ? storedId : items[0].id;
    }
    const current = selectedItem();
    if (current && state.selectedItemId !== current.id) {
      state.selectedItemId = current.id;
      rememberSelectedItem();
    }
    const index = current ? selectedIndex() : -1;
    panel.classList.toggle("is-freestyle", freestyle);
    subtitleEl.textContent = freestyle ? "Record what you notice." : "Check this page.";
    currentLabelEl.textContent = freestyle ? "Freestyle" : "Current item";
    progressEl.textContent = freestyle
      ? "Freestyle capture"
      : items.length ? \`\${items.length} thing\${items.length === 1 ? "" : "s"} to check\` : "No checklist";
    itemCountEl.textContent = current ? \`\${index + 1} of \${items.length}\` : "0 of 0";
    listCountEl.textContent = \`\${items.length} item\${items.length === 1 ? "" : "s"}\`;
    currentTitleEl.textContent = current ? current.title || (freestyle ? "Freestyle review" : "Checklist item") : "No checklist items";
    messageEl.textContent = freestyle
      ? "Move through the product. Record, draw, or type notes."
      : current
      ? [current.instructions || "Check this item.", current.expected ? "Expected: " + current.expected : ""].filter(Boolean).join(" ")
      : "No checklist items were found.";
    renderEvidence(current);
    prevButton.disabled = !current || index <= 0;
    nextButton.disabled = !current || index >= items.length - 1;

    listEl.innerHTML = "";
    if (freestyle) {
      if (current && state.renderedItemId !== current.id) {
        state.renderedItemId = current.id;
        state.note = current.note || "";
        noteEl.value = state.note;
      }
      return;
    }
    items.forEach((item, itemIndex) => {
      const row = document.createElement("div");
      row.className = "bud-item" + (item.id === state.selectedItemId ? " is-selected" : "") + (state.sentItemIds.has(item.id) ? " is-sent" : "");
      const selectButton = document.createElement("button");
      selectButton.type = "button";
      selectButton.className = "bud-item-main";
      selectButton.innerHTML = \`<span class="bud-item-index">\${itemIndex + 1}</span><span class="bud-item-title">\${escapeHtml(item.title || "Checklist item")}</span>\`;
      selectButton.addEventListener("click", () => changeSelectedItem(item.id).catch((error) => toast(error.message || "Could not change item")));
      const sendButton = document.createElement("button");
      sendButton.type = "button";
      sendButton.className = "bud-item-send";
      sendButton.setAttribute("aria-label", state.sentItemIds.has(item.id) ? "Item feedback sent" : "Send item feedback to agent");
      sendButton.setAttribute("title", state.sentItemIds.has(item.id) ? "Sent to agent" : "Send this item to agent");
      sendButton.innerHTML = state.sentItemIds.has(item.id)
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 2 11 13"></path><path d="m22 2-7 20-4-9-9-4 20-7z"></path></svg>';
      sendButton.addEventListener("click", (event) => {
        event.stopPropagation();
        openSendMenu("item", item.id, sendButton);
      });
      row.appendChild(selectButton);
      row.appendChild(sendButton);
      listEl.appendChild(row);
    });
    if (current && state.renderedItemId !== current.id) {
      state.renderedItemId = current.id;
      state.note = current.note || "";
      noteEl.value = state.note;
    }
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\\"": "&quot;",
      "'": "&#39;"
    })[char]);
  }

  async function loadSession() {
    const payload = await api(\`/api/manual-qa/widget-session?session_id=\${encodeURIComponent(CONFIG.sessionId)}&token=\${encodeURIComponent(CONFIG.token)}\`);
    state.session = payload.session;
    render();
  }

  async function saveItem(status, options = {}) {
    const item = selectedItem();
    if (!item) {
      toast("Pick an item first.");
      return null;
    }
    state.note = noteEl.value;
    const body = {
      session_id: CONFIG.sessionId,
      token: CONFIG.token,
      item_id: item.id,
      note: state.note,
      widget_context: contextPayload()
    };
    if (status !== undefined && status !== null) {
      body.status = status;
    }
    const payload = await api("/api/manual-qa/widget-session", {
      method: "POST",
      body: JSON.stringify(body)
    });
    state.session = payload.session;
    if (!options.silent) {
      toast(status ? "Saved" : "Note saved");
    }
    render();
    return payload;
  }

  function selectByOffset(offset) {
    const items = checklistItems();
    if (!items.length) return;
    const nextIndex = Math.max(0, Math.min(items.length - 1, selectedIndex() + offset));
    return changeSelectedItem(items[nextIndex].id);
  }

  async function changeSelectedItem(itemId) {
    if (state.recording && !state.recordingSaving) {
      await stopActiveRecordingSegment();
    }
    const saved = await autoSaveDrawingIfNeeded({ clearAfterSave: true });
    if (!saved) return;
    setSelectedItem(itemId);
  }

  function feedbackSentMessage(payload, scope, copied) {
    const feedbackAction = String(payload?.feedback_action || payload?.feedbackAction || "").toLowerCase();
    const startsWork = feedbackAction === "share_feedback_and_start_work";
    const previewFirst = feedbackAction === "preview_fix_first";
    if (startsWork) return copied ? "Sent and copied. Agent can start work now." : "Sent. Agent can start work now.";
    if (previewFirst) return copied ? "Sent and copied. Agent should preview first." : "Sent. Agent should preview first.";
    if (scope === "all") return copied ? "All feedback sent and copied" : "All feedback sent";
    return copied ? "Item feedback sent and copied" : "Item feedback sent";
  }

  async function copyFeedbackPayload(payload, scope) {
    if (payload.markdown && navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(payload.markdown);
        toast(feedbackSentMessage(payload, scope, true), 4200);
        return;
      } catch {}
    }
    toast(feedbackSentMessage(payload, scope, false), 4200);
  }

  async function sendItemFeedback(itemId, feedbackAction = "") {
    const item = checklistItems().find((candidate) => candidate.id === itemId);
    if (!item) {
      toast("Pick an item first.");
      return;
    }
    if (item.id === state.selectedItemId) {
      const savedDrawing = await autoSaveDrawingIfNeeded({ silent: true });
      if (!savedDrawing) return;
      const savedRecording = await stopRecordingAndWait();
      if (!savedRecording) return;
      await saveItem(undefined, { silent: true });
    }
    const payload = await api("/api/manual-qa/widget-feedback", {
      method: "POST",
      body: JSON.stringify({
        session_id: CONFIG.sessionId,
        token: CONFIG.token,
        scope: "item",
        item_id: item.id,
        feedback_action: feedbackAction
      })
    });
    state.sentItemIds.add(item.id);
    render();
    await copyFeedbackPayload(payload, "item");
  }

  async function sendFeedback(scope, feedbackAction = "") {
    const item = selectedItem();
    if (scope === "item" && !item) {
      toast("Pick an item first.");
      return;
    }
    if (scope === "item" && item) {
      await sendItemFeedback(item.id, feedbackAction);
      return;
    }
    const savedDrawing = await autoSaveDrawingIfNeeded({ silent: true });
    if (!savedDrawing) return;
    const savedRecording = await stopRecordingAndWait();
    if (!savedRecording) return;
    await saveItem(undefined, { silent: true });
    const payload = await api("/api/manual-qa/widget-feedback", {
      method: "POST",
      body: JSON.stringify({
        session_id: CONFIG.sessionId,
        token: CONFIG.token,
        scope,
        item_id: scope === "item" && item ? item.id : undefined,
        feedback_action: feedbackAction
      })
    });
    if (scope === "all") {
      checklistItems().forEach((candidate) => state.sentItemIds.add(candidate.id));
      render();
    }
    await copyFeedbackPayload(payload, scope);
  }

  function documentCanvasSize() {
    const doc = document.documentElement;
    const body = document.body;
    return {
      width: Math.max(1, window.innerWidth, doc.scrollWidth, body?.scrollWidth || 0, doc.clientWidth, body?.clientWidth || 0),
      height: Math.max(1, window.innerHeight, doc.scrollHeight, body?.scrollHeight || 0, doc.clientHeight, body?.clientHeight || 0)
    };
  }

  function resizeCanvas() {
    const ratio = window.devicePixelRatio || 1;
    const previousWidth = canvas.width;
    const previousHeight = canvas.height;
    const previous = previousWidth && previousHeight ? document.createElement("canvas") : null;
    if (previous) {
      previous.width = previousWidth;
      previous.height = previousHeight;
      previous.getContext("2d").drawImage(canvas, 0, 0);
    }
    const size = documentCanvasSize();
    const cssWidth = size.width;
    const cssHeight = size.height;
    canvas.width = Math.max(1, Math.floor(cssWidth * ratio));
    canvas.height = Math.max(1, Math.floor(cssHeight * ratio));
    canvas.style.width = cssWidth + "px";
    canvas.style.height = cssHeight + "px";
    const context = canvas.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (previous) {
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.drawImage(previous, 0, 0);
      context.restore();
    }
    context.imageSmoothingEnabled = true;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 4;
    context.strokeStyle = "#ef4444";
  }

  function ensureCanvasReady() {
    const ratio = window.devicePixelRatio || 1;
    const size = documentCanvasSize();
    const expectedWidth = Math.max(1, Math.floor(size.width * ratio));
    const expectedHeight = Math.max(1, Math.floor(size.height * ratio));
    if (canvas.width !== expectedWidth || canvas.height !== expectedHeight) {
      resizeCanvas();
    }
  }

  function setDrawingActive(active) {
    state.drawing = active;
    canvas.classList.toggle("is-active", state.drawing);
    drawButton.classList.toggle("active", state.drawing);
    drawButton.setAttribute("aria-label", state.drawing ? "Stop drawing" : "Draw on page");
    drawButton.setAttribute("title", state.drawing ? "Stop drawing" : "Draw on page");
  }

  async function toggleDraw() {
    if (!state.drawing) {
      ensureCanvasReady();
      state.currentDrawingStartedAt = now();
      state.currentDrawingBounds = null;
      state.currentDrawingStrokeCount = 0;
      pushEvidenceEvent("drawing_started", {
        label: "Drawing started",
        started_at: state.currentDrawingStartedAt
      });
      setDrawingActive(true);
      toast("Draw on the page. Tap pencil again to stop.");
      return;
    }
    const hadDirtyDrawing = state.drawingDirty;
    setDrawingActive(false);
    const saved = await autoSaveDrawingIfNeeded();
    if (!saved) {
      setDrawingActive(true);
      return;
    }
    if (!hadDirtyDrawing) toast("Drawing off");
  }

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  function resetCurrentDrawingMetadata() {
    state.currentDrawingStartedAt = "";
    state.currentDrawingBounds = null;
    state.currentDrawingStrokeCount = 0;
  }

  function includeDrawingPoint(point) {
    if (!point) return;
    const x = Math.round(point.x);
    const y = Math.round(point.y);
    if (!state.currentDrawingBounds) {
      state.currentDrawingBounds = { minX: x, minY: y, maxX: x, maxY: y };
      return;
    }
    state.currentDrawingBounds.minX = Math.min(state.currentDrawingBounds.minX, x);
    state.currentDrawingBounds.minY = Math.min(state.currentDrawingBounds.minY, y);
    state.currentDrawingBounds.maxX = Math.max(state.currentDrawingBounds.maxX, x);
    state.currentDrawingBounds.maxY = Math.max(state.currentDrawingBounds.maxY, y);
  }

  function drawingBoundsPayload() {
    const bounds = state.currentDrawingBounds;
    if (!bounds) return null;
    return {
      x: bounds.minX,
      y: bounds.minY,
      width: Math.max(1, bounds.maxX - bounds.minX),
      height: Math.max(1, bounds.maxY - bounds.minY)
    };
  }

  let pointerDown = false;
  let lastPoint = null;
  canvas.addEventListener("pointerdown", (event) => {
    ensureCanvasReady();
    pointerDown = true;
    try { canvas.setPointerCapture(event.pointerId); } catch {}
    const point = canvasPoint(event);
    lastPoint = point;
    includeDrawingPoint(point);
    const context = canvas.getContext("2d");
    context.beginPath();
    context.moveTo(point.x, point.y);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!pointerDown || !lastPoint) return;
    const point = canvasPoint(event);
    const midPoint = {
      x: (lastPoint.x + point.x) / 2,
      y: (lastPoint.y + point.y) / 2
    };
    const context = canvas.getContext("2d");
    context.quadraticCurveTo(lastPoint.x, lastPoint.y, midPoint.x, midPoint.y);
    context.stroke();
    includeDrawingPoint(point);
    includeDrawingPoint(midPoint);
    state.currentDrawingStrokeCount += 1;
    lastPoint = point;
    state.drawingDirty = true;
  });
  canvas.addEventListener("pointerup", (event) => {
    pointerDown = false;
    lastPoint = null;
    try { canvas.releasePointerCapture(event.pointerId); } catch {}
  });
  canvas.addEventListener("pointercancel", () => {
    pointerDown = false;
    lastPoint = null;
  });

  async function uploadDataUrl(kind, dataUrl, filename, contentType, options = {}) {
    const item = options.itemId
      ? checklistItems().find((candidate) => candidate.id === options.itemId)
      : selectedItem();
    if (!item) {
      toast("Pick an item first.");
      return;
    }
    const payload = await api("/api/manual-qa/widget-evidence", {
      method: "POST",
      body: JSON.stringify({
        session_id: CONFIG.sessionId,
        token: CONFIG.token,
        item_id: item.id,
        kind,
        label: options.label || "",
        filename,
        content_type: contentType,
        data_url: dataUrl
      })
    });
    state.session = payload.session || state.session;
    if (!options.silent) toast("Evidence saved");
    render();
    return payload;
  }

  async function autoSaveDrawingIfNeeded(options = {}) {
    if (!state.drawingDirty) {
      if (options.clearAfterSave) resetDrawingSurface();
      return true;
    }
    const dataUrl = buildDrawingDataUrl();
    if (!dataUrl || dataUrl === state.lastSavedDrawingDataUrl) {
      state.drawingDirty = false;
      if (options.clearAfterSave) resetDrawingSurface();
      return true;
    }
    try {
      const endedAt = now();
      const startedAt = state.currentDrawingStartedAt || endedAt;
      const bounds = drawingBoundsPayload();
      const strokeCount = state.currentDrawingStrokeCount;
      const payload = await uploadDataUrl("screenshot", dataUrl, "drawing-annotation.png", "image/png", {
        silent: true,
        label: "Drawing annotation"
      });
      pushEvidenceEvent("drawing_saved", {
        label: "Drawing annotation",
        started_at: startedAt,
        ended_at: endedAt,
        duration_ms: Math.max(0, Date.parse(endedAt) - Date.parse(startedAt)),
        stroke_count: strokeCount,
        bounds,
        media_url: payload?.evidence_url || payload?.evidence?.url || ""
      });
      state.lastSavedDrawingDataUrl = dataUrl;
      state.drawingDirty = false;
      if (!options.silent) toast("Drawing saved");
      if (options.clearAfterSave) resetDrawingSurface();
      return true;
    } catch (error) {
      toast(error.message || "Could not save drawing");
      return false;
    }
  }

  function resetDrawingSurface() {
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    state.drawingDirty = false;
    state.lastSavedDrawingDataUrl = "";
    pointerDown = false;
    lastPoint = null;
    resetCurrentDrawingMetadata();
  }

  function clearDrawing() {
    resetDrawingSurface();
    toast("Cleared");
  }

  function stopStreams() {
    state.streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
    state.streams = [];
    state.recordingStream = null;
    if (state.recordingFrameVideo) {
      try { state.recordingFrameVideo.pause(); } catch {}
      state.recordingFrameVideo.srcObject = null;
      state.recordingFrameVideo = null;
    }
  }

  function attachRecordingFrameSource(displayStream) {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.srcObject = displayStream;
    state.recordingFrameVideo = video;
    video.play().catch(() => {});
  }

  function intersectRects(a, b) {
    const x = Math.max(a.x, b.x);
    const y = Math.max(a.y, b.y);
    const right = Math.min(a.x + a.width, b.x + b.width);
    const bottom = Math.min(a.y + a.height, b.y + b.height);
    if (right <= x || bottom <= y) return null;
    return { x, y, width: right - x, height: bottom - y };
  }

  function drawingCropRect() {
    const ratio = window.devicePixelRatio || 1;
    const cssWidth = Math.max(1, canvas.width / ratio);
    const cssHeight = Math.max(1, canvas.height / ratio);
    const bounds = drawingBoundsPayload();
    if (!bounds) {
      const x = clamp(window.scrollX, 0, Math.max(0, cssWidth - 1));
      const y = clamp(window.scrollY, 0, Math.max(0, cssHeight - 1));
      return {
        x,
        y,
        width: Math.max(1, Math.min(window.innerWidth, cssWidth - x)),
        height: Math.max(1, Math.min(window.innerHeight, cssHeight - y))
      };
    }
    const padding = 24;
    const x = clamp(bounds.x - padding, 0, Math.max(0, cssWidth - 1));
    const y = clamp(bounds.y - padding, 0, Math.max(0, cssHeight - 1));
    const maxWidth = Math.max(1, cssWidth - x);
    const maxHeight = Math.max(1, cssHeight - y);
    return {
      x,
      y,
      width: clamp(bounds.width + padding * 2, 1, maxWidth),
      height: clamp(bounds.height + padding * 2, 1, maxHeight)
    };
  }

  function buildDrawingDataUrl() {
    const ratio = window.devicePixelRatio || 1;
    const crop = drawingCropRect();
    const output = document.createElement("canvas");
    const outputWidth = Math.max(1, Math.ceil(crop.width * ratio));
    const outputHeight = Math.max(1, Math.ceil(crop.height * ratio));
    output.width = outputWidth;
    output.height = outputHeight;
    const context = output.getContext("2d");
    context.imageSmoothingEnabled = true;
    const video = state.recordingFrameVideo;
    if (video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
      const viewport = { x: window.scrollX, y: window.scrollY, width: window.innerWidth, height: window.innerHeight };
      const overlap = intersectRects(crop, viewport);
      if (overlap) {
        const scaleX = video.videoWidth / Math.max(1, viewport.width);
        const scaleY = video.videoHeight / Math.max(1, viewport.height);
        context.drawImage(
          video,
          (overlap.x - viewport.x) * scaleX,
          (overlap.y - viewport.y) * scaleY,
          overlap.width * scaleX,
          overlap.height * scaleY,
          (overlap.x - crop.x) * ratio,
          (overlap.y - crop.y) * ratio,
          overlap.width * ratio,
          overlap.height * ratio
        );
      }
    }
    context.drawImage(
      canvas,
      crop.x * ratio,
      crop.y * ratio,
      crop.width * ratio,
      crop.height * ratio,
      0,
      0,
      outputWidth,
      outputHeight
    );
    return output.toDataURL("image/png");
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Could not read recording"));
      reader.readAsDataURL(blob);
    });
  }

  function normalizeRecordingContentType(value) {
    const raw = String(value || "").toLowerCase();
    if (raw.startsWith("video/webm")) return "video/webm";
    if (raw.startsWith("video/mp4")) return "video/mp4";
    if (raw.startsWith("video/quicktime")) return "video/quicktime";
    return raw.startsWith("video/") ? raw.split(";")[0] : "video/webm";
  }

  function setRecordingUi() {
    const saving = state.recordingSaving;
    recordButton.disabled = saving;
    recordButton.classList.toggle("danger", state.recording && !saving);
    recordButton.classList.toggle("saving", saving);
    recordButton.classList.toggle("active", state.recording || saving);
    recordButton.setAttribute("aria-label", saving ? "Saving recording" : state.recording ? "Stop recording" : "Record video");
    recordButton.setAttribute("title", saving ? "Saving recording" : state.recording ? "Stop recording" : "Record screen and voice");
    recordLabelEl.textContent = saving ? "Saving" : state.recording ? "Stop" : "Record video";
    recordingStateEl.classList.toggle("is-recording", state.recording);
    recordingStateEl.textContent = saving
      ? "Saving recording. Keep this tab open."
      : state.recording
      ? "Recording screen and voice. Video saves automatically."
      : "Not recording. Records screen and voice after Chrome asks.";
  }

  function speechRecognitionConstructor() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  function startSpeechTranscript() {
    if (state.speechRecognitionDisabled || state.speechRecognition || state.speechRecognitionActive) return;
    const Recognition = speechRecognitionConstructor();
    if (!Recognition) {
      state.transcriptStatus = "not_supported";
      pushEvidenceEvent("transcript_unavailable", {
        label: "Speech transcript not supported by this browser"
      });
      return;
    }
    let recognition;
    try {
      recognition = new Recognition();
    } catch (error) {
      state.transcriptStatus = "not_available";
      state.speechRecognitionDisabled = true;
      pushEvidenceEvent("transcript_unavailable", {
        label: error.message || "Speech transcript could not start"
      });
      return;
    }
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = navigator.language || "en-US";
    recognition.onresult = (event) => {
      for (let index = event.resultIndex || 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const alternative = result && result[0];
        if (!alternative?.transcript || !result?.isFinal) continue;
        pushTranscriptEvent({
          text: alternative.transcript,
          is_final: true,
          confidence: Number.isFinite(Number(alternative.confidence)) ? Number(alternative.confidence) : null
        });
      }
      state.transcriptStatus = "capturing";
    };
    recognition.onerror = (event) => {
      const errorType = trim(event?.error || "speech_error", 80);
      state.transcriptStatus = "error:" + errorType;
      pushEvidenceEvent("transcript_error", {
        label: "Speech transcript error: " + errorType
      });
      if (["not-allowed", "service-not-allowed", "audio-capture"].includes(errorType)) {
        state.speechRecognitionDisabled = true;
      }
    };
    recognition.onend = () => {
      state.speechRecognitionActive = false;
      state.speechRecognition = null;
      if (state.recording && !state.recordingStopRequested && !state.speechRecognitionDisabled) {
        state.speechRestartTimer = window.setTimeout(startSpeechTranscript, 700);
      } else if (state.transcriptStatus === "listening" || state.transcriptStatus === "capturing") {
        state.transcriptStatus = "stopped";
      }
    };
    try {
      state.speechRecognition = recognition;
      state.speechRecognitionActive = true;
      state.transcriptStatus = "listening";
      recognition.start();
      pushEvidenceEvent("transcript_started", {
        label: "Speech transcript started"
      });
    } catch (error) {
      state.speechRecognition = null;
      state.speechRecognitionActive = false;
      state.transcriptStatus = "not_available";
      state.speechRecognitionDisabled = true;
      pushEvidenceEvent("transcript_unavailable", {
        label: error.message || "Speech transcript could not start"
      });
    }
  }

  function stopSpeechTranscript() {
    if (state.speechRestartTimer) {
      window.clearTimeout(state.speechRestartTimer);
      state.speechRestartTimer = null;
    }
    const recognition = state.speechRecognition;
    state.speechRecognition = null;
    state.speechRecognitionActive = false;
    if (recognition) {
      try { recognition.stop(); } catch {}
    }
    if (state.transcriptStatus === "listening" || state.transcriptStatus === "capturing") {
      state.transcriptStatus = "stopped";
    }
  }

  function noteRecordingFailure(message) {
    const safeMessage = trim(message || "Recording could not be saved.", 800);
    state.recordingLastError = safeMessage;
    pushLimited(state.pageErrors, {
      time: now(),
      message: "BeforeUsersDo recording failed: " + safeMessage,
      source: "beforeusersdo-widget"
    });
  }

  function recordingOptions() {
    const options = {
      videoBitsPerSecond: 600000,
      audioBitsPerSecond: 48000
    };
    if (typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")) {
      options.mimeType = "video/webm;codecs=vp8,opus";
    }
    return options;
  }

  function streamIsLive(stream) {
    return Boolean(stream && stream.getTracks().some((track) => track.readyState === "live"));
  }

  function clearRecordingSegmentTimer() {
    if (state.recordingSegmentTimer) {
      window.clearTimeout(state.recordingSegmentTimer);
      state.recordingSegmentTimer = null;
    }
  }

  function settleSegmentStop() {
    if (state.resolveSegmentStop) state.resolveSegmentStop(true);
    state.segmentStopPromise = null;
    state.resolveSegmentStop = null;
  }

  function enqueueRecordingSegmentUpload(blob, itemId, contentType, segmentIndex, segmentMeta = {}) {
    const safeContentType = normalizeRecordingContentType(contentType || blob?.type);
    const typedBlob = blob && blob.type === safeContentType ? blob : new Blob([blob], { type: safeContentType });
    const segmentNumber = segmentIndex + 1;
    const filename = "review-recording-part-" + String(segmentNumber).padStart(3, "0") + ".webm";
    const upload = blobToDataUrl(typedBlob)
      .then((dataUrl) => uploadDataUrl("video", dataUrl, filename, safeContentType, {
        silent: true,
        itemId,
        label: "Video recording segment " + segmentNumber
      }))
      .then((payload) => {
        const endedAt = segmentMeta.ended_at || now();
        const startedAt = segmentMeta.started_at || endedAt;
        pushEvidenceEvent("video_saved", {
          item_id: itemId,
          label: "Video recording segment " + segmentNumber,
          started_at: startedAt,
          ended_at: endedAt,
          duration_ms: Math.max(0, Date.parse(endedAt) - Date.parse(startedAt)),
          media_url: payload?.evidence_url || payload?.evidence?.url || "",
          content_type: safeContentType
        });
        return { ok: true, index: segmentIndex, payload };
      })
      .catch((error) => {
        const message = error.message || "Could not save video segment.";
        noteRecordingFailure("Segment " + segmentNumber + ": " + message);
        toast("A video segment could not save. Recording is still running.", 6000);
        return { ok: false, index: segmentIndex, error };
      })
      .finally(() => {
        state.recordingSegmentUploads = state.recordingSegmentUploads.filter((candidate) => candidate !== upload);
      });
    state.recordingSegmentUploads.push(upload);
    return upload;
  }

  function stopActiveRecordingSegment() {
    clearRecordingSegmentTimer();
    if (state.recorder && state.recorder.state !== "inactive") {
      if (!state.segmentStopPromise) {
        state.segmentStopPromise = new Promise((resolve) => {
          state.resolveSegmentStop = resolve;
        });
      }
      try {
        if (typeof state.recorder.requestData === "function") state.recorder.requestData();
      } catch {}
      try {
        state.recorder.stop();
      } catch (error) {
        const message = error.message || "Recording could not be stopped.";
        noteRecordingFailure(message);
        state.recorder = null;
        settleSegmentStop();
        toast(message, 6000);
      }
      return state.segmentStopPromise;
    }
    settleSegmentStop();
    return Promise.resolve(true);
  }

  function startRecordingSegment() {
    if (!state.recording || state.recordingStopRequested || !streamIsLive(state.recordingStream)) return;
    const item = selectedItem();
    if (!item) {
      noteRecordingFailure("No review item was available for the recording segment.");
      return;
    }
    state.recordingSegmentBlobs = [];
    state.recordingSegmentItemId = item.id;
    state.recordingSegmentContentType = "video/webm";
    state.recordingSegmentStartedAt = now();
    pushEvidenceEvent("video_segment_started", {
      item_id: item.id,
      label: "Video recording segment started",
      started_at: state.recordingSegmentStartedAt
    });
    const recorder = new MediaRecorder(state.recordingStream, recordingOptions());
    state.recorder = recorder;
    state.recordingSegmentContentType = normalizeRecordingContentType(recorder.mimeType || "video/webm");
    recorder.ondataavailable = (event) => {
      if (!event.data || !event.data.size) return;
      state.recordingSegmentContentType = normalizeRecordingContentType(event.data.type || state.recordingSegmentContentType);
      state.recordingSegmentBlobs.push(event.data);
    };
    recorder.onerror = (event) => {
      const message = event?.error?.message || "Recording stopped because the browser reported an error.";
      noteRecordingFailure(message);
      toast(message, 6000);
      stopRecordingAndWait().catch((error) => toast(error.message || "Could not finish recording"));
    };
    recorder.onstop = () => {
      clearRecordingSegmentTimer();
      const blobs = state.recordingSegmentBlobs.slice();
      const itemId = state.recordingSegmentItemId;
      const contentType = state.recordingSegmentContentType;
      const segmentIndex = state.recordingSegmentIndex++;
      const segmentStartedAt = state.recordingSegmentStartedAt;
      const segmentEndedAt = now();
      state.recordingSegmentBlobs = [];
      state.recordingSegmentItemId = "";
      state.recordingSegmentStartedAt = "";
      state.recorder = null;
      if (blobs.length && itemId) {
        enqueueRecordingSegmentUpload(new Blob(blobs, { type: contentType }), itemId, contentType, segmentIndex, {
          started_at: segmentStartedAt,
          ended_at: segmentEndedAt
        });
      }
      settleSegmentStop();
      if (state.recording && !state.recordingStopRequested && streamIsLive(state.recordingStream)) {
        window.setTimeout(startRecordingSegment, 0);
      } else {
        stopStreams();
      }
    };
    recorder.start();
    state.recordingSegmentTimer = window.setTimeout(() => {
      if (state.recording && state.recorder === recorder) stopActiveRecordingSegment();
    }, RECORDING_SEGMENT_MS);
  }

  async function startRecording() {
    if (state.recording || state.recordingSaving) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia || typeof MediaRecorder === "undefined") {
      toast("Recording is not available in this browser.");
      return;
    }
    const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    attachRecordingFrameSource(displayStream);
    let micStream = null;
    try { micStream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch {}
    const tracks = [
      ...displayStream.getVideoTracks(),
      ...displayStream.getAudioTracks(),
      ...(micStream ? micStream.getAudioTracks() : [])
    ];
    const stream = new MediaStream(tracks);
    state.streams = micStream ? [displayStream, micStream, stream] : [displayStream, stream];
    state.recordingStream = stream;
    state.recordingSaving = false;
    state.recordingLastError = "";
    state.recordingSegmentIndex = Math.max(state.recordingSegmentIndex, savedVideoEvidenceCount(selectedItem()));
    state.recordingSegmentUploads = [];
    state.recordingStopRequested = false;
    displayStream.getVideoTracks().forEach((track) => {
      track.addEventListener("ended", () => {
        if (!state.recording || state.recordingSaving) return;
        toast("Screen sharing stopped. Saving recording...", 6000);
        stopRecordingAndWait().catch((error) => toast(error.message || "Could not finish recording"));
      }, { once: true });
    });
    state.recording = true;
    state.recordingStartedAt = now();
    pushEvidenceEvent("recording_started", {
      label: "Screen and voice recording started",
      started_at: state.recordingStartedAt
    });
    startSpeechTranscript();
    setRecordingUi();
    startRecordingSegment();
    toast("Recording started. Segments save automatically.", 4000);
  }

  function stopRecording() {
    if (state.recordingSaving) return;
    state.recording = false;
    state.recordingStopRequested = true;
    state.recordingSaving = true;
    const stoppedAt = now();
    pushEvidenceEvent("recording_stopped", {
      label: "Screen and voice recording stopped",
      started_at: state.recordingStartedAt || stoppedAt,
      ended_at: stoppedAt,
      duration_ms: state.recordingStartedAt ? Math.max(0, Date.parse(stoppedAt) - Date.parse(state.recordingStartedAt)) : null
    });
    stopSpeechTranscript();
    state.recordingStartedAt = "";
    setRecordingUi();
    if (!state.recorder || state.recorder.state === "inactive") {
      clearRecordingSegmentTimer();
      stopStreams();
      settleSegmentStop();
    }
    stopActiveRecordingSegment();
  }

  async function stopRecordingAndWait() {
    if (state.recording) {
      toast("Stopping recording...", 4000);
      stopRecording();
    }
    const hadPendingVideo = Boolean(state.segmentStopPromise || state.recordingSegmentUploads.length);
    try {
      if (state.segmentStopPromise) {
        await state.segmentStopPromise;
      }
      const pendingUploads = state.recordingSegmentUploads.slice();
      if (!pendingUploads.length) {
        state.recordingSaving = false;
        state.recordingStopRequested = false;
        setRecordingUi();
        return true;
      }
      const results = await Promise.race([
        Promise.all(pendingUploads),
        new Promise((resolve) => window.setTimeout(() => resolve({ timeout: true }), RECORDING_SAVE_WAIT_MS))
      ]);
      if (results?.timeout) {
        toast("Video segments are still saving. Keep this tab open and press Send again.", 8000);
        return false;
      }
      const failed = Array.isArray(results) ? results.filter((result) => result && result.ok === false) : [];
      if (failed.length) {
        toast("Some video segments did not save. Other feedback will still be sent.", 7000);
      } else if (hadPendingVideo) {
        toast("Recording saved", 2200);
      }
      return true;
    } catch (error) {
      noteRecordingFailure(error.message || "Recording failed before feedback was sent.");
      toast("Recording failed. Other feedback will still be sent.", 7000);
      return true;
    } finally {
      state.recordingSaving = false;
      state.recordingStopRequested = false;
      setRecordingUi();
    }
  }

  makeDraggable(pill, pill, {
    ignoreInteractive: false,
    onMoved() {
      suppressPillOpen = true;
      window.setTimeout(() => { suppressPillOpen = false; }, 250);
    }
  });
  makeDraggable(panel, panelDragHandle, { lockWidth: true, lockHeight: true });
  makeDraggable(capturePanel, capturePanel);

  function openWidget(options = {}) {
    if (suppressPillOpen) {
      suppressPillOpen = false;
      return;
    }
    pill.style.display = "none";
    panel.classList.add("is-open");
    capturePanel.classList.add("is-open");
    rememberWidgetOpen(true);
    if (options.load !== false) {
      loadSession().catch((error) => toast(error.message || "Could not load review"));
    }
  }

  pill.addEventListener("click", () => {
    openWidget();
  });
  closeButton.addEventListener("click", async () => {
    const savedRecording = await stopRecordingAndWait();
    if (!savedRecording) return;
    await autoSaveDrawingIfNeeded({ silent: true });
    panel.classList.remove("is-open");
    capturePanel.classList.remove("is-open");
    setNoteOpen(false);
    rememberWidgetOpen(false);
    pill.style.display = "inline-flex";
  });
  noteEl.addEventListener("input", () => { state.note = noteEl.value; });
  root.querySelector("[data-action='prev']").addEventListener("click", () => {
    selectByOffset(-1)?.catch((error) => toast(error.message || "Could not change item"));
  });
  root.querySelector("[data-action='next']").addEventListener("click", () => {
    selectByOffset(1)?.catch((error) => toast(error.message || "Could not change item"));
  });
  root.querySelector("[data-action='draw']").addEventListener("click", () => {
    toggleDraw().catch((error) => toast(error.message || "Could not update drawing"));
  });
  root.querySelector("[data-action='clear']").addEventListener("click", clearDrawing);
  noteToggleButton.addEventListener("click", () => setNoteOpen(!state.noteOpen, { focus: true }));
  root.querySelector("[data-action='send-all']").addEventListener("click", (event) => {
    event.stopPropagation();
    openSendMenu("all", "", event.currentTarget);
  });
  sendMenu.querySelectorAll("[data-feedback-action]").forEach((button) => {
    button.addEventListener("click", () => {
      chooseSendAction(button.getAttribute("data-feedback-action") || "share_feedback")
        .catch((error) => toast(error.message || "Could not package feedback"));
    });
  });
  root.addEventListener("click", (event) => {
    if (!state.pendingSend) return;
    const target = event.target;
    if (target.closest(".bud-send-menu, [data-action='send-all'], .bud-item-send")) return;
    closeSendMenu();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.pendingSend) closeSendMenu();
  });
  window.addEventListener("pointerdown", (event) => {
    if (!state.pendingSend) return;
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    if (path.includes(sendMenu)) return;
    if (path.some((node) => node?.classList?.contains("bud-item-send") || node?.getAttribute?.("data-action") === "send-all")) return;
    closeSendMenu();
  }, true);
  root.querySelector("[data-action='record']").addEventListener("click", () => {
    if (state.recordingSaving) {
      toast("Recording is still saving.", 4000);
    } else if (state.recording) {
      stopRecordingAndWait().catch((error) => toast(error.message || "Could not finish recording"));
    }
    else startRecording().catch((error) => toast(error.message || "Could not start recording"));
  });
  window.addEventListener("resize", () => {
    if (state.drawing) resizeCanvas();
  });

  state.pageVisits = loadStoredPageVisits();
  recordPageVisit();
  installRouteTracking();

  if (storedWidgetOpen()) {
    openWidget({ load: false });
  }
  loadSession().catch(() => {});
})();`;
}

module.exports = {
  buildManualQaWidgetScript
};
