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
    drawing: false,
    recording: false,
    recorder: null,
    chunks: [],
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
      :host { all: initial; }
      * { box-sizing: border-box; }
      .bud-panel, .bud-pill, .bud-canvas, .bud-toast {
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
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
        background: #0f172a;
        color: #fff;
        padding: 12px 15px;
        font-size: 14px;
        font-weight: 800;
        box-shadow: 0 12px 32px rgba(15, 23, 42, .28);
        pointer-events: auto;
        z-index: 3;
      }
      .bud-dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: #10b981;
      }
      .bud-panel {
        position: fixed;
        right: 18px;
        bottom: 18px;
        width: min(390px, calc(100vw - 24px));
        max-height: min(720px, calc(100vh - 24px));
        display: none;
        overflow: hidden;
        border: 1px solid #d9e2ec;
        border-radius: 14px;
        background: #fff;
        color: #0f172a;
        box-shadow: 0 22px 70px rgba(15, 23, 42, .28);
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
        border-bottom: 1px solid #e2e8f0;
      }
      .bud-title { font-size: 14px; font-weight: 900; line-height: 1.25; }
      .bud-sub { margin-top: 4px; color: #64748b; font-size: 12px; line-height: 1.35; }
      .bud-close {
        border: 0;
        border-radius: 10px;
        background: #f1f5f9;
        color: #0f172a;
        width: 32px;
        height: 32px;
        font-size: 18px;
        font-weight: 900;
      }
      .bud-body { padding: 12px 14px 14px; overflow: auto; }
      .bud-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
      .bud-btn {
        border: 1px solid #d9e2ec;
        border-radius: 10px;
        background: #fff;
        color: #0f172a;
        padding: 9px 11px;
        font-size: 13px;
        font-weight: 850;
      }
      .bud-btn.primary { border-color: #0f172a; background: #0f172a; color: #fff; }
      .bud-btn.danger { border-color: #ef4444; background: #ef4444; color: #fff; }
      .bud-btn.active { border-color: #8b5cf6; box-shadow: 0 0 0 3px rgba(139, 92, 246, .16); }
      .bud-btn:disabled { opacity: .45; cursor: not-allowed; }
      .bud-list { margin: 12px 0; display: grid; gap: 8px; }
      .bud-item {
        width: 100%;
        border: 1px solid #e2e8f0;
        border-radius: 11px;
        background: #f8fafc;
        color: #0f172a;
        padding: 10px;
        text-align: left;
      }
      .bud-item.is-selected { border-color: #8b5cf6; background: #f5f3ff; }
      .bud-item-title { font-size: 13px; font-weight: 850; line-height: 1.3; }
      .bud-item-status { margin-top: 4px; color: #64748b; font-size: 11px; font-weight: 800; text-transform: uppercase; }
      .bud-note {
        width: 100%;
        min-height: 78px;
        resize: vertical;
        border: 1px solid #d9e2ec;
        border-radius: 11px;
        padding: 10px;
        color: #0f172a;
        font-size: 13px;
        line-height: 1.4;
      }
      .bud-muted { color: #64748b; font-size: 12px; line-height: 1.35; }
      .bud-toast {
        position: fixed;
        left: 50%;
        bottom: 20px;
        transform: translateX(-50%);
        max-width: min(540px, calc(100vw - 24px));
        display: none;
        border-radius: 999px;
        background: #0f172a;
        color: white;
        padding: 10px 14px;
        font-size: 13px;
        font-weight: 800;
        pointer-events: none;
        z-index: 5;
      }
      .bud-toast.is-visible { display: block; }
      @media (max-width: 520px) {
        .bud-panel { right: 10px; bottom: 10px; width: calc(100vw - 20px); max-height: calc(100vh - 20px); }
        .bud-pill { right: 12px; bottom: 12px; }
      }
    </style>
    <canvas class="bud-canvas" part="canvas"></canvas>
    <button class="bud-pill" type="button"><span class="bud-dot"></span><span>Review</span></button>
    <section class="bud-panel" aria-label="BeforeUsersDo review">
      <div class="bud-head">
        <div>
          <div class="bud-title">BeforeUsersDo review</div>
          <div class="bud-sub">Draw, talk, and mark the checklist on this page.</div>
        </div>
        <button class="bud-close" type="button" aria-label="Close">x</button>
      </div>
      <div class="bud-body">
        <div class="bud-row">
          <button class="bud-btn primary" data-action="record" type="button">Record</button>
          <button class="bud-btn" data-action="draw" type="button">Draw</button>
          <button class="bud-btn" data-action="clear" type="button">Clear</button>
          <button class="bud-btn" data-action="save-drawing" type="button">Save drawing</button>
        </div>
        <p class="bud-muted" data-role="message">Pick a checklist item, then mark what happened.</p>
        <div class="bud-list" data-role="list"></div>
        <textarea class="bud-note" data-role="note" placeholder="Say what you noticed..."></textarea>
        <div class="bud-row" style="margin-top:10px">
          <button class="bud-btn primary" data-status="pass" type="button">Pass</button>
          <button class="bud-btn danger" data-status="fail" type="button">Fail</button>
          <button class="bud-btn" data-status="confusing" type="button">Confusing</button>
          <button class="bud-btn" data-status="blocked" type="button">Blocked</button>
        </div>
      </div>
    </section>
    <div class="bud-toast" data-role="toast"></div>
  \`;

  const canvas = root.querySelector(".bud-canvas");
  const pill = root.querySelector(".bud-pill");
  const panel = root.querySelector(".bud-panel");
  const closeButton = root.querySelector(".bud-close");
  const listEl = root.querySelector("[data-role='list']");
  const noteEl = root.querySelector("[data-role='note']");
  const messageEl = root.querySelector("[data-role='message']");
  const toastEl = root.querySelector("[data-role='toast']");
  const drawButton = root.querySelector("[data-action='draw']");
  const recordButton = root.querySelector("[data-action='record']");

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

  function selectedItem() {
    const items = state.session && Array.isArray(state.session.checklist) ? state.session.checklist : [];
    return items.find((item) => item.id === state.selectedItemId) || items[0] || null;
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
    const items = state.session && Array.isArray(state.session.checklist) ? state.session.checklist : [];
    if (!state.selectedItemId && items[0]) state.selectedItemId = items[0].id;
    const current = selectedItem();
    listEl.innerHTML = "";
    items.forEach((item, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "bud-item" + (item.id === state.selectedItemId ? " is-selected" : "");
      button.innerHTML = \`<div class="bud-item-title">\${index + 1}. \${escapeHtml(item.title || "Checklist item")}</div><div class="bud-item-status">\${escapeHtml(item.status || "pending")}</div>\`;
      button.addEventListener("click", () => {
        state.selectedItemId = item.id;
        state.note = item.note || "";
        noteEl.value = state.note;
        render();
      });
      listEl.appendChild(button);
    });
    if (current && noteEl.value !== state.note) {
      state.note = current.note || "";
      noteEl.value = state.note;
    }
    messageEl.textContent = current ? (current.instructions || "Mark this item after you test it.") : "No checklist items were found.";
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

  async function saveStatus(status) {
    const item = selectedItem();
    if (!item) {
      toast("Pick an item first.");
      return;
    }
    state.note = noteEl.value;
    const payload = await api("/api/manual-qa/widget-session", {
      method: "POST",
      body: JSON.stringify({
        session_id: CONFIG.sessionId,
        token: CONFIG.token,
        item_id: item.id,
        status,
        note: state.note,
        widget_context: contextPayload()
      })
    });
    state.session = payload.session;
    toast("Saved");
    render();
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
    resizeCanvas();
    canvas.classList.toggle("is-active", state.drawing);
    drawButton.classList.toggle("active", state.drawing);
    toast(state.drawing ? "Draw on the page. Click Draw again to stop." : "Drawing off");
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
  });
  canvas.addEventListener("pointerup", (event) => {
    pointerDown = false;
    try { canvas.releasePointerCapture(event.pointerId); } catch {}
  });

  async function uploadDataUrl(kind, dataUrl, filename, contentType) {
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
    toast("Evidence saved");
    render();
  }

  async function saveDrawing() {
    try {
      await uploadDataUrl("screenshot", canvas.toDataURL("image/png"), "annotation.png", "image/png");
    } catch (error) {
      toast(error.message || "Could not save drawing");
    }
  }

  function clearDrawing() {
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
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
    state.chunks = [];
    state.recorder = new MediaRecorder(stream, MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus") ? { mimeType: "video/webm;codecs=vp8,opus" } : undefined);
    state.recorder.ondataavailable = (event) => {
      if (event.data && event.data.size) state.chunks.push(event.data);
    };
    state.recorder.onstop = async () => {
      const blob = new Blob(state.chunks, { type: state.recorder.mimeType || "video/webm" });
      stopStreams();
      state.recording = false;
      recordButton.textContent = "Record";
      recordButton.classList.remove("danger");
      if (blob.size > 3500000) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "beforeusersdo-recording.webm";
        a.click();
        URL.revokeObjectURL(url);
        toast("Recording was large, so it downloaded locally.");
        return;
      }
      try {
        const dataUrl = await blobToDataUrl(blob);
        await uploadDataUrl("video", dataUrl, "review-recording.webm", blob.type || "video/webm");
      } catch (error) {
        toast(error.message || "Could not upload recording");
      }
    };
    displayStream.getVideoTracks()[0]?.addEventListener("ended", () => stopRecording());
    state.recording = true;
    recordButton.textContent = "Stop";
    recordButton.classList.add("danger");
    state.recorder.start(1000);
    toast("Recording. Share this tab when Chrome asks.");
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
    loadSession().catch((error) => toast(error.message || "Could not load review"));
  });
  closeButton.addEventListener("click", () => {
    panel.classList.remove("is-open");
    pill.style.display = "inline-flex";
  });
  noteEl.addEventListener("input", () => { state.note = noteEl.value; });
  root.querySelector("[data-action='draw']").addEventListener("click", toggleDraw);
  root.querySelector("[data-action='clear']").addEventListener("click", clearDrawing);
  root.querySelector("[data-action='save-drawing']").addEventListener("click", saveDrawing);
  root.querySelector("[data-action='record']").addEventListener("click", () => {
    if (state.recording) stopRecording();
    else startRecording().catch((error) => toast(error.message || "Could not start recording"));
  });
  root.querySelectorAll("[data-status]").forEach((button) => {
    button.addEventListener("click", () => saveStatus(button.getAttribute("data-status")).catch((error) => toast(error.message || "Could not save")));
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
