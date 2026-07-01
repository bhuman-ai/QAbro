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
    toolsOpen: false,
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
      .bud-panel, .bud-pill, .bud-canvas, .bud-toast, .bud-tray {
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
      }
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
        width: min(376px, calc(100vw - 24px));
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
      .bud-head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: start;
        padding: 14px;
        border-bottom: 1px solid var(--bud-line);
        background: linear-gradient(180deg, rgba(255, 255, 255, .07), rgba(255, 255, 255, .025));
      }
      .bud-title { font-size: 14px; font-weight: 900; line-height: 1.25; }
      .bud-sub { margin-top: 4px; color: var(--bud-muted); font-size: 12px; line-height: 1.35; }
      .bud-progress { margin-top: 8px; color: var(--bud-text); font-size: 12px; font-weight: 850; }
      .bud-close, .bud-nav-btn {
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
      .bud-close svg, .bud-nav-btn svg, .bud-tool svg, .bud-record svg, .bud-note-tool svg { width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
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
      .bud-nav {
        display: grid;
        grid-template-columns: 32px 1fr 32px;
        gap: 8px;
        align-items: center;
        margin-top: 10px;
      }
      .bud-count { color: var(--bud-muted); font-size: 12px; font-weight: 850; text-align: center; }
      .bud-note-wrap {
        padding: 12px 14px;
        border-bottom: 1px solid var(--bud-line);
        background: rgba(255, 255, 255, .025);
      }
      .bud-note-head {
        display: flex;
        align-items: stretch;
        flex-direction: column;
        gap: 10px;
        margin-bottom: 10px;
      }
      .bud-note-title { color: var(--bud-text); font-size: 14px; font-weight: 900; line-height: 1.2; }
      .bud-note-hint { margin-top: 3px; color: var(--bud-muted); font-size: 12px; line-height: 1.3; }
      .bud-note-hint.is-recording { color: #ffd5da; }
      .bud-note-actions {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        flex: 0 0 auto;
        width: 100%;
      }
      .bud-record, .bud-note-tool {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--bud-line);
        color: var(--bud-text);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, .12);
      }
      .bud-record {
        flex: 1;
        min-width: 0;
        height: 44px;
        gap: 8px;
        padding: 0 14px;
        border-radius: 999px;
        background: rgba(47, 140, 255, .28);
        font-size: 13px;
        font-weight: 900;
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
      .bud-note-tool {
        width: 40px;
        height: 40px;
        border-radius: 12px;
        background: rgba(255, 255, 255, .07);
      }
      .bud-note-tool:hover, .bud-note-tool.active { background: rgba(255, 255, 255, .12); }
      .bud-note {
        width: 100%;
        min-height: 64px;
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
        grid-template-columns: 22px 1fr;
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
      .bud-tray {
        display: none;
        align-items: center;
        justify-content: flex-end;
        gap: 6px;
        margin: 10px 0 0;
        border: 1px solid var(--bud-line);
        border-radius: 16px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, .12), rgba(255, 255, 255, .04)),
          var(--bud-glass-strong);
        padding: 7px;
        box-shadow: 0 22px 64px rgba(0, 0, 0, .42), inset 0 1px 0 rgba(255, 255, 255, .18);
        backdrop-filter: blur(28px) saturate(1.5);
        -webkit-backdrop-filter: blur(28px) saturate(1.5);
      }
      .bud-tray.is-open { display: inline-flex; }
      .bud-tool {
        width: 40px;
        height: 40px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 0;
        border: 1px solid rgba(255, 255, 255, .08);
        border-radius: 14px;
        background: rgba(255, 255, 255, .09);
        color: var(--bud-text);
      }
      .bud-tool:hover, .bud-tool.active {
        border-color: rgba(122, 183, 255, .54);
        background: rgba(47, 140, 255, .28);
        color: #f7fbff;
      }
      .bud-tool.danger { border-color: rgba(255, 107, 122, .45); background: rgba(255, 107, 122, .24); color: #fff4f5; }
      .bud-tool:disabled, .bud-nav-btn:disabled { opacity: .45; cursor: not-allowed; }
      .bud-divider { width: 1px; height: 26px; background: var(--bud-line); }
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
      @media (max-width: 620px) {
        .bud-panel { top: 8px; right: 8px; bottom: 76px; width: calc(100vw - 16px); }
        .bud-pill { right: 12px; bottom: 12px; }
        .bud-tray { justify-content: center; border-radius: 18px; }
      }
    </style>
    <canvas class="bud-canvas" part="canvas"></canvas>
    <button class="bud-pill" type="button"><span class="bud-dot"></span><span>Review</span></button>
    <section class="bud-panel" aria-label="BeforeUsersDo review">
      <div class="bud-head">
        <div>
          <div class="bud-title">BeforeUsersDo review</div>
          <div class="bud-sub">Test each item on this page.</div>
          <div class="bud-progress" data-role="progress">0 / 0 done</div>
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
        <div class="bud-note-wrap">
          <div class="bud-note-head">
            <div>
              <div class="bud-note-title">Say what you notice</div>
              <div class="bud-note-hint" data-role="recording-state">Not recording. Records screen and voice after Chrome asks.</div>
            </div>
            <div class="bud-note-actions">
              <button class="bud-record" data-action="record" type="button" aria-label="Record video" title="Record screen and voice">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 13 5 3V8l-5 3"></path><rect x="3" y="6" width="13" height="12" rx="2"></rect></svg>
                <span data-role="record-label">Record video</span>
              </button>
              <button class="bud-note-tool" data-action="toggle-tools" type="button" aria-label="Draw and send tools" aria-expanded="false" aria-controls="bud-tools-panel" title="Draw and send tools">
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle></svg>
              </button>
            </div>
          </div>
          <div class="bud-tray" id="bud-tools-panel" aria-label="Draw and send tools">
            <button class="bud-tool" data-action="draw" type="button" aria-label="Draw on page" title="Draw on page">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15.2 5.2 3.6 3.6"></path><path d="M4 20l4.5-1.1L19.2 8.2a2.5 2.5 0 0 0-3.5-3.5L5 15.4 4 20z"></path></svg>
            </button>
            <button class="bud-tool" data-action="clear" type="button" aria-label="Clear drawing" title="Clear drawing">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 21-4-4L14.5 5.5a3 3 0 0 1 4.2 4.2L7.5 21H7z"></path><path d="M14 21h7"></path></svg>
            </button>
            <span class="bud-divider" aria-hidden="true"></span>
            <button class="bud-tool" data-action="send-item" type="button" aria-label="Send current item feedback to agent" title="Send current item to agent">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 2 11 13"></path><path d="m22 2-7 20-4-9-9-4 20-7z"></path></svg>
            </button>
            <button class="bud-tool" data-action="send-all" type="button" aria-label="Send all feedback to agent" title="Send all feedback to agent">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 2 11 13"></path><path d="m22 2-7 20-4-9-9-4 20-7z"></path><path d="M2 21h8"></path><path d="M2 17h5"></path></svg>
            </button>
          </div>
          <textarea class="bud-note" data-role="note" placeholder="Type instead if you want..."></textarea>
        </div>
        <div class="bud-list-head"><span>Checklist</span><span data-role="list-count">0 items</span></div>
        <div class="bud-list" data-role="list"></div>
      </div>
    </section>
    <div class="bud-toast" data-role="toast"></div>
  \`;

  const canvas = root.querySelector(".bud-canvas");
  const pill = root.querySelector(".bud-pill");
  const panel = root.querySelector(".bud-panel");
  const tray = root.querySelector(".bud-tray");
  const closeButton = root.querySelector(".bud-close");
  const listEl = root.querySelector("[data-role='list']");
  const noteEl = root.querySelector("[data-role='note']");
  const messageEl = root.querySelector("[data-role='message']");
  const currentTitleEl = root.querySelector("[data-role='current-title']");
  const progressEl = root.querySelector("[data-role='progress']");
  const itemCountEl = root.querySelector("[data-role='item-count']");
  const listCountEl = root.querySelector("[data-role='list-count']");
  const toastEl = root.querySelector("[data-role='toast']");
  const recordingStateEl = root.querySelector("[data-role='recording-state']");
  const recordLabelEl = root.querySelector("[data-role='record-label']");
  const drawButton = root.querySelector("[data-action='draw']");
  const recordButton = root.querySelector("[data-action='record']");
  const toolsButton = root.querySelector("[data-action='toggle-tools']");
  const prevButton = root.querySelector("[data-action='prev']");
  const nextButton = root.querySelector("[data-action='next']");

  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("is-visible");
    window.setTimeout(() => toastEl.classList.remove("is-visible"), 2200);
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

  function itemStartUrl(item) {
    return item && (item.start_url || state.session?.target_url || "");
  }

  function urlsMatchCurrent(url) {
    if (!url) return true;
    try {
      return new URL(url, location.href).href === new URL(location.href).href;
    } catch {
      return true;
    }
  }

  function navigateToItem(item) {
    const url = itemStartUrl(item);
    if (!url || urlsMatchCurrent(url)) return;
    try {
      location.assign(new URL(url, location.href).href);
    } catch {}
  }

  function setSelectedItem(itemId, options = {}) {
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
    if (options.navigate) navigateToItem(item);
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
    prevButton.disabled = !current || index <= 0;
    nextButton.disabled = !current || index >= items.length - 1;

    listEl.innerHTML = "";
    items.forEach((item, itemIndex) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "bud-item" + (item.id === state.selectedItemId ? " is-selected" : "");
      button.innerHTML = \`<span class="bud-item-index">\${itemIndex + 1}</span><span class="bud-item-title">\${escapeHtml(item.title || "Checklist item")}</span>\`;
      button.addEventListener("click", () => changeSelectedItem(item.id, { navigate: true }).catch((error) => toast(error.message || "Could not change item")));
      listEl.appendChild(button);
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
    return changeSelectedItem(items[nextIndex].id, { navigate: true });
  }

  async function changeSelectedItem(itemId, options = {}) {
    const saved = await autoSaveDrawingIfNeeded();
    if (!saved) return;
    setSelectedItem(itemId, options);
  }

  async function sendFeedback(scope) {
    const item = selectedItem();
    if (scope === "item" && !item) {
      toast("Pick an item first.");
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
    if (payload.markdown && navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(payload.markdown);
        toast(scope === "all" ? "All feedback copied for agent" : "Item feedback copied for agent");
        return;
      } catch {}
    }
    toast(scope === "all" ? "All feedback ready for agent" : "Item feedback ready for agent");
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

  function toggleDraw() {
    state.drawing = !state.drawing;
    if (state.drawing && (!canvas.width || !canvas.height)) {
      resizeCanvas();
    }
    canvas.classList.toggle("is-active", state.drawing);
    drawButton.classList.toggle("active", state.drawing);
    drawButton.setAttribute("aria-label", state.drawing ? "Stop drawing" : "Draw on page");
    drawButton.setAttribute("title", state.drawing ? "Stop drawing" : "Draw on page");
    toast(state.drawing ? "Draw on the page. Tap pencil again to stop." : "Drawing off");
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

  function setToolsUi() {
    tray.classList.toggle("is-open", state.toolsOpen);
    toolsButton.classList.toggle("active", state.toolsOpen);
    toolsButton.setAttribute("aria-expanded", state.toolsOpen ? "true" : "false");
    toolsButton.setAttribute("title", state.toolsOpen ? "Hide draw and send tools" : "Draw and send tools");
  }

  function toggleTools() {
    state.toolsOpen = !state.toolsOpen;
    setToolsUi();
  }

  async function uploadRecordingChunk(blob, index, contentType, filename) {
    const dataUrl = await blobToDataUrl(blob);
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
        content_type: contentType,
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
    const contentType = state.recorder.mimeType || "video/webm";
    const filename = "review-recording.webm";
    state.recorder.ondataavailable = (event) => {
      if (!event.data || !event.data.size) return;
      const chunkIndex = state.recordingChunkIndex++;
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

  pill.addEventListener("click", () => {
    pill.style.display = "none";
    panel.classList.add("is-open");
    setToolsUi();
    loadSession().catch((error) => toast(error.message || "Could not load review"));
  });
  closeButton.addEventListener("click", async () => {
    await autoSaveDrawingIfNeeded({ silent: true });
    panel.classList.remove("is-open");
    state.toolsOpen = false;
    setToolsUi();
    pill.style.display = "inline-flex";
  });
  noteEl.addEventListener("input", () => { state.note = noteEl.value; });
  root.querySelector("[data-action='prev']").addEventListener("click", () => {
    selectByOffset(-1)?.catch((error) => toast(error.message || "Could not change item"));
  });
  root.querySelector("[data-action='next']").addEventListener("click", () => {
    selectByOffset(1)?.catch((error) => toast(error.message || "Could not change item"));
  });
  root.querySelector("[data-action='toggle-tools']").addEventListener("click", toggleTools);
  root.querySelector("[data-action='draw']").addEventListener("click", toggleDraw);
  root.querySelector("[data-action='clear']").addEventListener("click", clearDrawing);
  root.querySelector("[data-action='send-item']").addEventListener("click", () => {
    sendFeedback("item").catch((error) => toast(error.message || "Could not package item feedback"));
  });
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

  loadSession().catch(() => {});
})();`;
}

module.exports = {
  buildManualQaWidgetScript
};
