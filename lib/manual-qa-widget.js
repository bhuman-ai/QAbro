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
    recorder: null,
    chunkUploads: [],
    recordingUploadId: "",
    recordingChunkIndex: 0,
    streams: [],
    recordingUrl: "",
    consoleEvents: [],
    networkEvents: [],
    pageErrors: []
  };

  const now = () => new Date().toISOString();
  const trim = (value, max = 1000) => String(value == null ? "" : value).slice(0, max);
  const pushLimited = (list, value) => {
    list.push(value);
    while (list.length > MAX_EVENTS) list.shift();
  };

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
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.zIndex = "2147483647";
  host.style.pointerEvents = "none";
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "open" });

  root.innerHTML = \`
    <style>
      :host {
        all: initial;
        --bud-panel-width: min(376px, calc(100vw - 24px));
        --bud-glass: rgba(21, 24, 30, .72);
        --bud-glass-strong: rgba(18, 21, 27, .86);
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
        position: fixed;
        inset: 0;
        width: 100vw;
        height: 100vh;
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
        padding: 12px 15px;
        font-size: 14px;
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
        top: 14px;
        right: 14px;
        bottom: 82px;
        width: var(--bud-panel-width);
        display: none;
        overflow: hidden;
        border: 1px solid var(--bud-line);
        border-radius: 20px;
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
        padding: 14px;
        border-bottom: 1px solid var(--bud-line);
        background: linear-gradient(180deg, rgba(255, 255, 255, .07), rgba(255, 255, 255, .025));
        cursor: grab;
        touch-action: none;
      }
      .bud-head:active { cursor: grabbing; }
      .bud-head button { cursor: pointer; }
      .bud-title { font-size: 14px; font-weight: 900; line-height: 1.25; }
      .bud-sub { margin-top: 4px; color: var(--bud-muted); font-size: 12px; line-height: 1.35; }
      .bud-progress-row {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-top: 8px;
      }
      .bud-progress { color: var(--bud-text); font-size: 12px; font-weight: 850; }
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
        padding: 12px 14px 14px;
        border-bottom: 1px solid var(--bud-line);
        background: rgba(255, 255, 255, .035);
      }
      .bud-label {
        color: var(--bud-faint);
        font-size: 11px;
        font-weight: 900;
        letter-spacing: 0;
        text-transform: uppercase;
      }
      .bud-current-title { margin-top: 5px; font-size: 15px; font-weight: 900; line-height: 1.25; }
      .bud-muted { margin: 8px 0 0; color: var(--bud-muted); font-size: 12px; line-height: 1.42; }
      .bud-evidence {
        display: none;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 10px;
      }
      .bud-evidence.has-items { display: flex; }
      .bud-evidence-chip {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        min-width: 0;
        border: 1px solid var(--bud-line);
        border-radius: 999px;
        background: rgba(255, 255, 255, .08);
        color: var(--bud-muted);
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
        top: auto;
        right: calc(14px + var(--bud-panel-width) + 10px);
        bottom: 18px;
        width: auto;
        display: none;
        align-items: center;
        gap: 6px;
        border: 1px solid var(--bud-line);
        border-radius: 18px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, .11), rgba(255, 255, 255, .035)),
          var(--bud-glass);
        color: var(--bud-text);
        padding: 6px;
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
        align-items: flex-start;
        flex-wrap: wrap;
      }
      .bud-capture-panel.is-dragging { cursor: grabbing; }
      .bud-grip {
        width: 10px;
        height: 34px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        cursor: grab;
        flex: 0 0 auto;
      }
      .bud-grip::before {
        content: "";
        width: 3px;
        height: 16px;
        border-radius: 999px;
        background: linear-gradient(var(--bud-faint), var(--bud-faint)) top / 3px 3px no-repeat,
          linear-gradient(var(--bud-faint), var(--bud-faint)) center / 3px 3px no-repeat,
          linear-gradient(var(--bud-faint), var(--bud-faint)) bottom / 3px 3px no-repeat;
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
        width: 40px;
        height: 40px;
        padding: 0;
        border-radius: 14px;
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
      .bud-tool {
        width: 40px;
        height: 40px;
        border-radius: 14px;
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
        padding: 10px 14px 8px;
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
        padding: 0 14px 14px;
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
        padding: 9px;
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
      .bud-item-title { min-width: 0; font-size: 13px; font-weight: 850; line-height: 1.25; }
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
        .bud-capture-panel { left: 8px; right: auto; top: auto; bottom: 76px; width: auto; }
        .bud-capture-panel.is-note-open { width: min(260px, calc(100vw - 16px)); }
      }
      @media (max-width: 620px) {
        .bud-panel { top: 8px; right: 8px; width: calc(100vw - 16px); }
        .bud-pill { right: 12px; bottom: 12px; }
      }
    </style>
    <canvas class="bud-canvas" part="canvas"></canvas>
    <button class="bud-pill" type="button"><span class="bud-dot"></span><span>BeforeUsersDo</span></button>
    <section class="bud-panel" aria-label="BeforeUsersDo review">
      <div class="bud-head">
        <div>
          <div class="bud-title">BeforeUsersDo review</div>
          <div class="bud-sub">Test each item on this page.</div>
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
          <div class="bud-label">Current item</div>
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
    <div class="bud-toast" data-role="toast"></div>
  \`;

  const canvas = root.querySelector(".bud-canvas");
  const pill = root.querySelector(".bud-pill");
  const panel = root.querySelector(".bud-panel");
  const capturePanel = root.querySelector(".bud-capture-panel");
  const closeButton = root.querySelector(".bud-close");
  const listEl = root.querySelector("[data-role='list']");
  const noteEl = root.querySelector("[data-role='note']");
  const messageEl = root.querySelector("[data-role='message']");
  const currentTitleEl = root.querySelector("[data-role='current-title']");
  const evidenceEl = root.querySelector("[data-role='evidence']");
  const progressEl = root.querySelector("[data-role='progress']");
  const itemCountEl = root.querySelector("[data-role='item-count']");
  const listCountEl = root.querySelector("[data-role='list-count']");
  const toastEl = root.querySelector("[data-role='toast']");
  const recordingStateEl = root.querySelector("[data-role='recording-state']");
  const recordLabelEl = root.querySelector("[data-role='record-label']");
  const drawButton = root.querySelector("[data-action='draw']");
  const recordButton = root.querySelector("[data-action='record']");
  const noteToggleButton = root.querySelector("[data-action='note-toggle']");
  const prevButton = root.querySelector("[data-action='prev']");
  const nextButton = root.querySelector("[data-action='next']");
  const panelDragHandle = root.querySelector(".bud-head");
  let suppressPillOpen = false;

  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("is-visible");
    window.setTimeout(() => toastEl.classList.remove("is-visible"), 2200);
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
      page_errors: state.pageErrors.slice(-20)
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
    if (kind === "video") return "Video saved";
    if (kind === "audio") return "Audio saved";
    if (kind === "drawing") return "Drawing saved";
    return "Evidence saved";
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
    progressEl.textContent = items.length ? \`\${items.length} thing\${items.length === 1 ? "" : "s"} to check\` : "No checklist";
    itemCountEl.textContent = current ? \`\${index + 1} of \${items.length}\` : "0 of 0";
    listCountEl.textContent = \`\${items.length} item\${items.length === 1 ? "" : "s"}\`;
    currentTitleEl.textContent = current ? current.title || "Checklist item" : "No checklist items";
    messageEl.textContent = current
      ? [current.instructions || "Check this item.", current.expected ? "Expected: " + current.expected : ""].filter(Boolean).join(" ")
      : "No checklist items were found.";
    renderEvidence(current);
    prevButton.disabled = !current || index <= 0;
    nextButton.disabled = !current || index >= items.length - 1;

    listEl.innerHTML = "";
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
      sendButton.addEventListener("click", () => {
        sendItemFeedback(item.id).catch((error) => toast(error.message || "Could not package item feedback"));
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
    const saved = await autoSaveDrawingIfNeeded();
    if (!saved) return;
    setSelectedItem(itemId);
  }

  async function copyFeedbackPayload(payload, scope) {
    if (payload.markdown && navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(payload.markdown);
        toast(scope === "all" ? "All feedback copied for agent" : "Item feedback copied for agent");
        return;
      } catch {}
    }
    toast(scope === "all" ? "All feedback ready for agent" : "Item feedback ready for agent");
  }

  async function sendItemFeedback(itemId) {
    const item = checklistItems().find((candidate) => candidate.id === itemId);
    if (!item) {
      toast("Pick an item first.");
      return;
    }
    if (item.id === state.selectedItemId) {
      const savedDrawing = await autoSaveDrawingIfNeeded({ silent: true });
      if (!savedDrawing) return;
      await saveItem(undefined, { silent: true });
    }
    const payload = await api("/api/manual-qa/widget-feedback", {
      method: "POST",
      body: JSON.stringify({
        session_id: CONFIG.sessionId,
        token: CONFIG.token,
        scope: "item",
        item_id: item.id
      })
    });
    state.sentItemIds.add(item.id);
    render();
    await copyFeedbackPayload(payload, "item");
  }

  async function sendFeedback(scope) {
    const item = selectedItem();
    if (scope === "item" && !item) {
      toast("Pick an item first.");
      return;
    }
    if (scope === "item" && item) {
      await sendItemFeedback(item.id);
      return;
    }
    const savedDrawing = await autoSaveDrawingIfNeeded({ silent: true });
    if (!savedDrawing) return;
    await saveItem(undefined, { silent: true });
    const payload = await api("/api/manual-qa/widget-feedback", {
      method: "POST",
      body: JSON.stringify({
        session_id: CONFIG.sessionId,
        token: CONFIG.token,
        scope,
        item_id: scope === "item" && item ? item.id : undefined
      })
    });
    if (scope === "all") {
      checklistItems().forEach((candidate) => state.sentItemIds.add(candidate.id));
      render();
    }
    await copyFeedbackPayload(payload, scope);
  }

  function resizeCanvas() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(window.innerWidth * ratio));
    canvas.height = Math.max(1, Math.floor(window.innerHeight * ratio));
    canvas.style.width = "100vw";
    canvas.style.height = "100vh";
    const context = canvas.getContext("2d");
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = Math.max(5, canvas.width / 220);
    context.strokeStyle = "#ef4444";
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
      if (!canvas.width || !canvas.height) {
        resizeCanvas();
      }
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
      x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * canvas.width,
      y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * canvas.height
    };
  }

  let pointerDown = false;
  canvas.addEventListener("pointerdown", (event) => {
    pointerDown = true;
    canvas.setPointerCapture(event.pointerId);
    const point = canvasPoint(event);
    const context = canvas.getContext("2d");
    context.beginPath();
    context.moveTo(point.x, point.y);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!pointerDown) return;
    const point = canvasPoint(event);
    const context = canvas.getContext("2d");
    context.lineTo(point.x, point.y);
    context.stroke();
    state.drawingDirty = true;
  });
  canvas.addEventListener("pointerup", (event) => {
    pointerDown = false;
    try { canvas.releasePointerCapture(event.pointerId); } catch {}
  });

  async function uploadDataUrl(kind, dataUrl, filename, contentType, options = {}) {
    const item = selectedItem();
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
    if (!state.drawingDirty) return true;
    const dataUrl = canvas.toDataURL("image/png");
    if (!dataUrl || dataUrl === state.lastSavedDrawingDataUrl) {
      state.drawingDirty = false;
      return true;
    }
    try {
      await uploadDataUrl("screenshot", dataUrl, "annotation.png", "image/png", { silent: true });
      state.lastSavedDrawingDataUrl = dataUrl;
      state.drawingDirty = false;
      if (!options.silent) toast("Drawing saved");
      return true;
    } catch (error) {
      toast(error.message || "Could not save drawing");
      return false;
    }
  }

  function clearDrawing() {
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    state.drawingDirty = false;
    state.lastSavedDrawingDataUrl = "";
    toast("Cleared");
  }

  function stopStreams() {
    state.streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
    state.streams = [];
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

  function createUploadId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID().replace(/[^a-z0-9_-]+/gi, "");
    }
    return "rec_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
  }

  function setRecordingUi() {
    recordButton.classList.toggle("danger", state.recording);
    recordButton.classList.toggle("active", state.recording);
    recordButton.setAttribute("aria-label", state.recording ? "Stop recording" : "Record video");
    recordButton.setAttribute("title", state.recording ? "Stop recording" : "Record screen and voice");
    recordLabelEl.textContent = state.recording ? "Stop" : "Record video";
    recordingStateEl.classList.toggle("is-recording", state.recording);
    recordingStateEl.textContent = state.recording
      ? "Recording screen and voice. Press Stop when done."
      : "Not recording. Records screen and voice after Chrome asks.";
  }

  async function uploadRecordingChunk(blob, index, contentType, filename) {
    const safeContentType = normalizeRecordingContentType(contentType || blob?.type);
    const typedBlob = blob && blob.type === safeContentType ? blob : new Blob([blob], { type: safeContentType });
    const dataUrl = await blobToDataUrl(typedBlob);
    const payload = await api("/api/manual-qa/widget-evidence-chunks", {
      method: "POST",
      body: JSON.stringify({
        action: "chunk",
        session_id: CONFIG.sessionId,
        token: CONFIG.token,
        upload_id: state.recordingUploadId,
        chunk_index: index,
        kind: "video",
        filename,
        content_type: safeContentType,
        data_url: dataUrl
      })
    });
    return payload.chunk;
  }

  async function finishRecordingUpload(chunkRefs, contentType, filename) {
    const item = selectedItem();
    if (!item) {
      toast("Pick an item first.");
      return;
    }
    const payload = await api("/api/manual-qa/widget-evidence-chunks", {
      method: "POST",
      body: JSON.stringify({
        action: "finish",
        session_id: CONFIG.sessionId,
        token: CONFIG.token,
        item_id: item.id,
        kind: "video",
        filename,
        content_type: contentType,
        chunks: chunkRefs
      })
    });
    state.session = payload.session || state.session;
    toast("Recording saved");
    render();
  }

  async function startRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia || typeof MediaRecorder === "undefined") {
      toast("Recording is not available in this browser.");
      return;
    }
    const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    let micStream = null;
    try { micStream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch {}
    const tracks = [
      ...displayStream.getVideoTracks(),
      ...displayStream.getAudioTracks(),
      ...(micStream ? micStream.getAudioTracks() : [])
    ];
    const stream = new MediaStream(tracks);
    state.streams = micStream ? [displayStream, micStream, stream] : [displayStream, stream];
    state.chunkUploads = [];
    state.recordingUploadId = createUploadId();
    state.recordingChunkIndex = 0;
    state.recorder = new MediaRecorder(stream, MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus") ? { mimeType: "video/webm;codecs=vp8,opus" } : undefined);
    let contentType = normalizeRecordingContentType(state.recorder.mimeType || "video/webm");
    const filename = "review-recording.webm";
    state.recorder.ondataavailable = (event) => {
      if (!event.data || !event.data.size) return;
      const chunkIndex = state.recordingChunkIndex++;
      contentType = normalizeRecordingContentType(event.data.type || contentType);
      state.chunkUploads.push(uploadRecordingChunk(event.data, chunkIndex, contentType, filename));
    };
    state.recorder.onstop = async () => {
      stopStreams();
      state.recording = false;
      setRecordingUi();
      try {
        toast("Saving recording...");
        const results = await Promise.allSettled(state.chunkUploads);
        const failed = results.find((result) => result.status === "rejected");
        if (failed) {
          throw failed.reason || new Error("Could not upload recording chunk");
        }
        const chunkRefs = results.map((result) => result.value).filter(Boolean);
        if (!chunkRefs.length) {
          toast("No recording data was captured.");
          return;
        }
        await finishRecordingUpload(chunkRefs, contentType, filename);
      } catch (error) {
        toast(error.message || "Could not upload recording");
      } finally {
        state.chunkUploads = [];
        state.recordingUploadId = "";
        state.recordingChunkIndex = 0;
      }
    };
    displayStream.getVideoTracks()[0]?.addEventListener("ended", () => stopRecording());
    state.recording = true;
    setRecordingUi();
    state.recorder.start(1000);
    toast("Choose this tab in Chrome to start recording.");
  }

  function stopRecording() {
    if (state.recorder && state.recorder.state !== "inactive") {
      state.recorder.stop();
    } else {
      stopStreams();
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
  root.querySelector("[data-action='send-all']").addEventListener("click", () => {
    sendFeedback("all").catch((error) => toast(error.message || "Could not package feedback"));
  });
  root.querySelector("[data-action='record']").addEventListener("click", () => {
    if (state.recording) stopRecording();
    else startRecording().catch((error) => toast(error.message || "Could not start recording"));
  });
  window.addEventListener("resize", () => {
    if (state.drawing) resizeCanvas();
  });

  if (storedWidgetOpen()) {
    openWidget({ load: false });
  }
  loadSession().catch(() => {});
})();`;
}

module.exports = {
  buildManualQaWidgetScript
};
