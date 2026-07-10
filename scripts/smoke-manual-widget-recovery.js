#!/usr/bin/env node
const http = require("http");

const { chromium } = require("playwright");
const { buildManualQaWidgetScript } = require("../lib/manual-qa-widget");

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "chrome" });
  } catch {
    return chromium.launch({ headless: true });
  }
}

async function main() {
  const sessionId = "manual-widget-recovery-smoke";
  const token = "widget-recovery-token";
  const item = {
    id: "freestyle",
    title: "Recovery smoke",
    instructions: "Draw once and verify the evidence retries after reload.",
    expected: "The queued drawing reaches the server once.",
    status: "pending",
    note: null,
    evidence_urls: [],
    evidence_media: [],
    widget_context: {}
  };
  const session = {
    session_id: sessionId,
    title: "Widget recovery smoke",
    target_url: "",
    review_mode: "freestyle",
    status: "manual_ready",
    counts: { pending: 1 },
    checklist: [item],
    work_packets: [],
    context: { feedback_action: "share_feedback" },
    widget: { enabled: true, installed: true, status: "installed" }
  };
  const evidenceAttempts = [];
  let failNextEvidenceUpload = true;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/") {
      const script = buildManualQaWidgetScript({ sessionId, token, apiBaseUrl: baseUrl });
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><html><body><main><h1>Widget recovery smoke</h1><p>Draw here.</p></main><script>${script.replaceAll("</script", "<\\/script")}</script></body></html>`);
      return;
    }
    if (url.pathname === "/api/manual-qa/widget-session" && req.method === "GET") {
      json(res, 200, { ok: true, session });
      return;
    }
    if (url.pathname === "/api/manual-qa/widget-session" && req.method === "POST") {
      json(res, 200, { ok: true, session, item });
      return;
    }
    if (url.pathname === "/api/manual-qa/widget-evidence" && req.method === "POST") {
      const body = await readBody(req);
      evidenceAttempts.push(body.evidence_id);
      if (failNextEvidenceUpload) {
        failNextEvidenceUpload = false;
        json(res, 503, { ok: false, error: "temporary upload failure" });
        return;
      }
      const evidence = {
        evidence_id: body.evidence_id,
        kind: body.kind,
        label: body.label,
        content_type: body.content_type,
        storage_bucket: "qa-evidence",
        storage_path: `${sessionId}/${body.evidence_id}.png`,
        url: `${baseUrl}/api/manual-qa/evidence?session_id=${sessionId}&item_id=${item.id}&evidence_id=${body.evidence_id}`
      };
      item.evidence_media = [evidence];
      item.evidence_urls = [evidence.url];
      json(res, 201, { ok: true, session, item, evidence, evidence_url: evidence.url });
      return;
    }
    json(res, 404, { ok: false, error: "not found" });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.evaluate(() => {
      const root = document.querySelector("#beforeusersdo-widget-root").shadowRoot;
      root.querySelector(".bud-pill").click();
      root.querySelector('[data-action="comment"]').click();
      root.querySelector('[data-role="comment-surface"]').dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        composed: true,
        clientX: 420,
        clientY: 240
      }));
      root.querySelector('[data-role="comment-input"]').focus();
    });
    await page.keyboard.type("record clear draw comment");
    const typedComment = await page.evaluate(() => {
      const root = document.querySelector("#beforeusersdo-widget-root").shadowRoot;
      return root.querySelector('[data-role="comment-input"]').value;
    });
    if (typedComment !== "record clear draw comment") {
      throw new Error(`Tool shortcuts interrupted comment typing: ${JSON.stringify(typedComment)}`);
    }
    await page.evaluate(() => {
      const root = document.querySelector("#beforeusersdo-widget-root").shadowRoot;
      root.querySelector('[data-action="comment-cancel"]').click();
    });
    await page.evaluate(() => {
      const root = document.querySelector("#beforeusersdo-widget-root").shadowRoot;
      root.querySelector('[data-action="draw"]').click();
      const canvas = root.querySelector("canvas");
      const points = [
        [180, 180],
        [240, 220],
        [300, 190]
      ];
      canvas.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: points[0][0], clientY: points[0][1] }));
      for (const [clientX, clientY] of points.slice(1)) {
        canvas.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX, clientY }));
      }
      canvas.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 300, clientY: 190 }));
      root.querySelector('[data-action="comment"]').click();
    });
    await page.waitForTimeout(800);

    const queuedBeforeReload = await page.evaluate(async () => {
      const request = indexedDB.open("beforeusersdo-evidence-v1", 1);
      const db = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = db.transaction("pending-uploads", "readonly");
      const allRequest = transaction.objectStore("pending-uploads").getAll();
      return new Promise((resolve) => {
        allRequest.onsuccess = () => resolve(allRequest.result.length);
        allRequest.onerror = () => resolve(-1);
      });
    });
    if (queuedBeforeReload !== 1) {
      throw new Error(`Expected one queued drawing before reload, received ${queuedBeforeReload}`);
    }

    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => {
      const root = document.querySelector("#beforeusersdo-widget-root")?.shadowRoot;
      return Boolean(root);
    });
    await page.waitForTimeout(900);

    const queuedAfterReload = await page.evaluate(async () => {
      const request = indexedDB.open("beforeusersdo-evidence-v1", 1);
      const db = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = db.transaction("pending-uploads", "readonly");
      const allRequest = transaction.objectStore("pending-uploads").getAll();
      return new Promise((resolve) => {
        allRequest.onsuccess = () => resolve(allRequest.result.length);
        allRequest.onerror = () => resolve(-1);
      });
    });
    if (queuedAfterReload !== 0) {
      throw new Error(`Expected the queued drawing to upload after reload, received ${queuedAfterReload}`);
    }
    if (evidenceAttempts.length !== 2 || evidenceAttempts[0] !== evidenceAttempts[1]) {
      throw new Error(`Evidence retry did not reuse one stable id: ${JSON.stringify(evidenceAttempts)}`);
    }
    process.stdout.write(
      `${JSON.stringify({ ok: true, typed_comment: typedComment, queued_before_reload: queuedBeforeReload, queued_after_reload: queuedAfterReload, evidence_attempts: evidenceAttempts.length })}\n`
    );
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || error?.message || String(error)}\n`);
  process.exitCode = 1;
});
