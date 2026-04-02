#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const BASE_URL = (process.env.SWARM_BASE_URL || "https://swarmtester.com").replace(/\/$/, "");
const SERVICE_TOKEN = process.env.QA_SERVICE_TOKEN || "";
const OWNER_USER_ID = process.env.OWNER_USER_ID || "";

function usage() {
  console.error("Usage: node scripts/walkthrough-api-client-example.mjs <target-url>");
  console.error("Required env: QA_SERVICE_TOKEN, OWNER_USER_ID");
  console.error(
    "Optional env: RUN_ID, BRAND_PERSONA, SCENARIOS, LOGIN_URL, LOGIN_USERNAME, LOGIN_PASSWORD, OTP_MODE, WEBHOOK_URL, WEBHOOK_SECRET, WEBHOOK_EVENTS"
  );
}

function parseScenarios(raw) {
  if (!raw) {
    return [
      "Open the site and identify the primary login/signup path.",
      "Authenticate with provided credentials and reach the main dashboard.",
      "Complete one high-value action and verify success state."
    ];
  }

  return String(raw)
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function parseWebhookEvents(raw) {
  if (!raw) {
    return null;
  }
  const events = String(raw)
    .split(/[|,]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 12);
  return events.length ? events : null;
}

function extensionForContentType(contentType, fallback = "bin") {
  const safeType = String(contentType || "").toLowerCase();
  if (safeType.includes("image/png")) return "png";
  if (safeType.includes("image/jpeg")) return "jpg";
  if (safeType.includes("image/webp")) return "webp";
  if (safeType.includes("image/gif")) return "gif";
  if (safeType.includes("video/mp4")) return "mp4";
  if (safeType.includes("video/webm")) return "webm";
  if (safeType.includes("video/ogg")) return "ogg";
  if (safeType.includes("application/vnd.apple.mpegurl")) return "m3u8";
  return fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function terminalQueueStatus(status) {
  const safe = String(status || "").toLowerCase();
  return ["completed", "failed", "failed_validation", "partial", "cancelled"].includes(safe);
}

async function requestJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-qa-service-token": SERVICE_TOKEN,
      "x-owner-user-id": OWNER_USER_ID,
      ...(init.headers || {})
    }
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  return { response, json };
}

async function downloadEvidence(runId, kind, outputDir, maxItems = 24) {
  const saved = [];

  for (let index = 0; index < maxItems; index += 1) {
    const url = `${BASE_URL}/api/qa/evidence?run_id=${encodeURIComponent(runId)}&kind=${kind}&index=${index}`;
    const response = await fetch(url, {
      headers: {
        "x-qa-service-token": SERVICE_TOKEN,
        "x-owner-user-id": OWNER_USER_ID
      }
    });

    if (response.status === 404) {
      break;
    }

    if (!response.ok) {
      const body = await response.text();
      console.warn(`[evidence:${kind}] index=${index} skipped (${response.status}) ${body.slice(0, 200)}`);
      continue;
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const ext = extensionForContentType(contentType, kind === "video" ? "mp4" : "png");
    const bytes = Buffer.from(await response.arrayBuffer());
    const filePath = path.join(outputDir, `${kind}-${String(index).padStart(2, "0")}.${ext}`);
    await fs.writeFile(filePath, bytes);
    saved.push(filePath);
  }

  return saved;
}

async function main() {
  const targetUrl = process.argv[2] || process.env.TARGET_URL || "";
  if (!targetUrl || !SERVICE_TOKEN || !OWNER_USER_ID) {
    usage();
    process.exit(1);
  }

  let hostname = "unknown-target";
  try {
    hostname = new URL(targetUrl).hostname;
  } catch {
    console.error("Invalid target URL:", targetUrl);
    process.exit(1);
  }

  const runId = process.env.RUN_ID || `walkthrough_${Date.now()}`;
  const scenarios = parseScenarios(process.env.SCENARIOS);

  const credentialsProvided =
    process.env.LOGIN_URL || process.env.LOGIN_USERNAME || process.env.LOGIN_PASSWORD;
  const credentials = credentialsProvided
    ? {
        login_url: process.env.LOGIN_URL || null,
        username: process.env.LOGIN_USERNAME || null,
        password: process.env.LOGIN_PASSWORD || null,
        otp_mode: process.env.OTP_MODE || "none"
      }
    : null;

  const runPayload = {
    run_id: runId,
    target_url: targetUrl,
    scope_mode: "feature_targeted",
    scenario_list: scenarios,
    brand_persona:
      process.env.BRAND_PERSONA ||
      "A first-time product manager narrating confusion, trust, and aha moments.",
    credentials,
    metadata: {
      owner_user_id: OWNER_USER_ID,
      brand_key: hostname,
      workflow_type: "walkthrough_video"
    }
  };
  const webhookUrl = process.env.WEBHOOK_URL || "";
  if (webhookUrl) {
    const webhookEvents = parseWebhookEvents(process.env.WEBHOOK_EVENTS);
    runPayload.webhook = {
      url: webhookUrl,
      secret: process.env.WEBHOOK_SECRET || null,
      ...(webhookEvents ? { events: webhookEvents } : {})
    };
  }

  console.log("Queueing run:", runId);
  const start = await requestJson(`${BASE_URL}/api/qa/run`, {
    method: "POST",
    body: JSON.stringify(runPayload)
  });

  if (!start.response.ok || !start.json?.ok) {
    console.error("Failed to queue run:", start.response.status, start.json);
    process.exit(1);
  }

  const statusUrl = start.json?.status_url || `${BASE_URL}/api/qa/status?run_id=${encodeURIComponent(runId)}`;
  console.log("Status URL:", statusUrl);

  let finalStatus = null;
  for (let attempt = 1; attempt <= 180; attempt += 1) {
    await sleep(5000);
    const status = await requestJson(`${BASE_URL}/api/qa/status?run_id=${encodeURIComponent(runId)}`);

    if (!status.response.ok || !status.json?.ok) {
      console.warn("Status poll warning:", status.response.status, status.json);
      continue;
    }

    const queueStatus = status.json?.queue?.queue_status || status.json?.queue?.status || "unknown";
    const progressMessage = status.json?.progress?.message || status.json?.progress?.phase || "";
    console.log(`[poll ${attempt}] queue=${queueStatus}${progressMessage ? ` | ${progressMessage}` : ""}`);

    if (status.json?.report_ready) {
      finalStatus = status.json;
      break;
    }

    if (terminalQueueStatus(queueStatus)) {
      finalStatus = status.json;
      break;
    }
  }

  if (!finalStatus?.report_ready) {
    console.error("Run ended before report became ready:", finalStatus?.queue || finalStatus || "unknown");
    process.exit(1);
  }

  const report = await requestJson(`${BASE_URL}/api/qa/report?run_id=${encodeURIComponent(runId)}`);
  if (!report.response.ok || !report.json?.ok) {
    console.error("Failed to fetch final report:", report.response.status, report.json);
    process.exit(1);
  }

  const outputDir = path.join(process.cwd(), "output", "walkthrough-api", runId);
  await fs.mkdir(outputDir, { recursive: true });

  await fs.writeFile(path.join(outputDir, "report.json"), JSON.stringify(report.json, null, 2));
  await fs.writeFile(path.join(outputDir, "report.md"), report.json.markdown || "", "utf8");

  const screenshots = await downloadEvidence(runId, "screenshot", outputDir, 60);
  const videos = await downloadEvidence(runId, "video", outputDir, 10);

  const narrationInput = {
    run_id: runId,
    target: targetUrl,
    ui_report_url: report.json.ui_report_url || null,
    summary: report.json.report?.summary || null,
    findings: report.json.report?.findings || [],
    tested_journeys: report.json.report?.tested_journeys || [],
    recommendations: report.json.report?.recommendations || []
  };
  await fs.writeFile(path.join(outputDir, "narration-input.json"), JSON.stringify(narrationInput, null, 2));

  console.log("Run complete.");
  console.log("Report URL:", report.json.ui_report_url || "n/a");
  console.log("Saved report to:", outputDir);
  console.log(`Saved media: screenshots=${screenshots.length}, videos=${videos.length}`);
  console.log("Use narration-input.json as input to your talking-head script generator.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
