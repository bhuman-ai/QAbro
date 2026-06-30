const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
const DEFAULT_OUTPUT_ROOT = "output/dev-handoffs";
const REDACTED = "***REDACTED***";
const SECRET_KEY_PATTERN =
  /(password|passwd|pwd|token|secret|authorization|api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|auth[_-]?token|cookie|set-cookie|session)/i;
const SECRET_QUERY_PARAM_PATTERN = /(token|password|passwd|pwd|secret|key|api[_-]?key|auth|session|code|otp)/i;
const DATA_URL_PATTERN = /^data:([^;,]+);base64,(.+)$/i;

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function sanitizeString(value, maxLength = 4096) {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value).trim().slice(0, maxLength);
}

function parseBoolean(value, fallbackValue = false) {
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return fallbackValue;
  }
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallbackValue;
}

function safeFileName(value, fallback = "qa-dev-handoff") {
  const safe = sanitizeString(value, 180)
    .replace(/[^a-z0-9._-]+/gi, "_")
    .replace(/^_+|_+$/g, "");
  return safe || fallback;
}

function timestampFragment(date = new Date()) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "_")
    .slice(0, 15);
}

function mkdirp(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  mkdirp(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath, value) {
  mkdirp(path.dirname(filePath));
  fs.writeFileSync(filePath, String(value || ""));
}

function writeJsonl(filePath, values) {
  const lines = (Array.isArray(values) ? values : []).map((value) => JSON.stringify(value));
  writeText(filePath, lines.length ? `${lines.join("\n")}\n` : "");
}

function redactUrl(rawUrl) {
  const raw = sanitizeString(rawUrl, 10000);
  if (!/^https?:\/\//i.test(raw)) {
    return raw;
  }
  try {
    const parsed = new URL(raw);
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (SECRET_QUERY_PARAM_PATTERN.test(key)) {
        parsed.searchParams.set(key, REDACTED);
      }
    }
    if (parsed.username) {
      parsed.username = REDACTED;
    }
    if (parsed.password) {
      parsed.password = REDACTED;
    }
    return parsed.toString();
  } catch {
    return raw;
  }
}

function redactString(value) {
  let redacted = String(value);
  redacted = redacted.replace(/https?:\/\/[^\s)'"<>]+/gi, (match) => redactUrl(match));
  redacted = redacted.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`);
  redacted = redacted.replace(
    /\b(token|password|passwd|secret|api[_-]?key|authorization)\b\s*[:=]?\s+([A-Za-z0-9._~+/-]{6,})/gi,
    (_match, label) => `${label} ${REDACTED}`
  );
  redacted = redacted.replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, `sk-${REDACTED}`);
  redacted = redacted.replace(/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/g, REDACTED);
  return redacted;
}

function scrubEmbeddedMediaString(value) {
  const raw = String(value || "");
  if (/^data:image\//i.test(raw)) {
    return "[embedded image extracted to screenshots/]";
  }
  if (/^data:video\//i.test(raw)) {
    return "[embedded video omitted from JSON; see videos/]";
  }
  return raw;
}

function redactDeep(value, key = "", options = {}) {
  if (Array.isArray(value)) {
    return value.map((item) => redactDeep(item, "", options));
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redactDeep(entryValue, entryKey, options)])
    );
  }
  if (typeof value !== "string") {
    return value;
  }
  if (SECRET_KEY_PATTERN.test(key)) {
    return value ? REDACTED : value;
  }
  const withoutEmbeddedMedia = options.stripEmbeddedMedia ? scrubEmbeddedMediaString(value) : value;
  return redactString(withoutEmbeddedMedia);
}

function readJsonFile(filePath) {
  const parsedPath = path.resolve(filePath);
  return JSON.parse(fs.readFileSync(parsedPath, "utf8"));
}

function addUnique(target, value) {
  const safe = typeof value === "string" ? value.trim() : value;
  if (!safe) {
    return;
  }
  const key = typeof safe === "string" ? safe : JSON.stringify(safe);
  if (!target.__seen) {
    Object.defineProperty(target, "__seen", {
      value: new Set(),
      enumerable: false,
      configurable: true
    });
  }
  if (target.__seen.has(key)) {
    return;
  }
  target.__seen.add(key);
  target.push(safe);
}

function getRunLogEntryData(entry) {
  if (!entry || typeof entry !== "object") {
    return {};
  }
  return isPlainObject(entry.details) ? entry.details : isPlainObject(entry.data) ? entry.data : {};
}

function getMergedArtifacts(artifact) {
  return {
    ...(isPlainObject(artifact?.report?.artifacts) ? artifact.report.artifacts : {}),
    ...(isPlainObject(artifact?.artifacts) ? artifact.artifacts : {})
  };
}

function collectConsoleEvents(artifact) {
  const events = [];
  const artifacts = getMergedArtifacts(artifact);
  for (const entry of Array.isArray(artifacts.console_timeline) ? artifacts.console_timeline : []) {
    addUnique(events, redactDeep(entry));
  }
  for (const entry of Array.isArray(artifact?.runLog) ? artifact.runLog : []) {
    if (sanitizeString(entry?.event, 128).toLowerCase() !== "browser_console") {
      continue;
    }
    addUnique(
      events,
      redactDeep({
        ts: entry.timestamp || entry.ts || null,
        ...getRunLogEntryData(entry)
      })
    );
  }
  if (!events.length) {
    for (const text of Array.isArray(artifact?.report?.evidence_gallery?.console_logs)
      ? artifact.report.evidence_gallery.console_logs
      : []) {
      addUnique(events, redactDeep({ text, source: "evidence_gallery" }));
    }
  }
  return events;
}

function collectNetworkEvents(artifact) {
  const events = [];
  const artifacts = getMergedArtifacts(artifact);
  for (const entry of Array.isArray(artifacts.network_timeline) ? artifacts.network_timeline : []) {
    addUnique(events, redactDeep(entry));
  }
  for (const entry of Array.isArray(artifact?.runLog) ? artifact.runLog : []) {
    if (sanitizeString(entry?.event, 128).toLowerCase() !== "browser_network") {
      continue;
    }
    addUnique(
      events,
      redactDeep({
        ts: entry.timestamp || entry.ts || null,
        ...getRunLogEntryData(entry)
      })
    );
  }
  if (!events.length) {
    for (const text of Array.isArray(artifact?.report?.evidence_gallery?.network_logs)
      ? artifact.report.evidence_gallery.network_logs
      : []) {
      addUnique(events, redactDeep({ text, source: "evidence_gallery" }));
    }
  }
  return events;
}

function formatConsoleEvent(event) {
  if (event.text) {
    return event.text;
  }
  const pieces = [
    `[${event.ts || event.timestamp || "unknown-time"}]`,
    `${event.source || "console"}.${event.level || "log"}`,
    event.url ? `@ ${event.url}` : "",
    "::",
    event.message || event.error || ""
  ].filter(Boolean);
  return pieces.join(" ");
}

function formatNetworkEvent(event) {
  if (event.text) {
    return event.text;
  }
  const rawStatus = event.status;
  const numericStatus = Number(rawStatus);
  const suffix = [
    rawStatus !== null && rawStatus !== undefined && rawStatus !== "" && Number.isFinite(numericStatus) && numericStatus > 0
      ? `status=${Math.round(numericStatus)}`
      : "",
    event.error ? `error=${event.error}` : "",
    Number.isFinite(Number(event.duration_ms)) ? `duration=${Math.max(0, Math.round(Number(event.duration_ms)))}ms` : "",
    event.resource_type ? `type=${event.resource_type}` : ""
  ].filter(Boolean);
  return [
    `[${event.ts || event.timestamp || "unknown-time"}]`,
    event.phase || "request",
    event.method || "",
    event.url || "",
    suffix.length ? `:: ${suffix.join(" | ")}` : ""
  ]
    .filter(Boolean)
    .join(" ");
}

function isNetworkFailure(event) {
  if (!event || typeof event !== "object") {
    return false;
  }
  const text = sanitizeString(event.text, 2000).toLowerCase();
  if (/\bstatus=([45]\d\d)\b/.test(text) || /\bstatus\s+([45]\d\d)\b/.test(text) || /net::err_|failed/.test(text)) {
    return true;
  }
  if (event.error || event.phase === "failed") {
    return true;
  }
  const status = Number(event.status);
  return Number.isFinite(status) && status >= 400;
}

function extractHost(value) {
  const raw = sanitizeString(value, 4096);
  if (!/^https?:\/\//i.test(raw)) {
    return "";
  }
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isRelevantNetworkFailure(event, summary) {
  if (!isNetworkFailure(event)) {
    return false;
  }
  const targetHost = extractHost(summary?.target_url);
  const pageHost = extractHost(summary?.top_issue?.page);
  const eventHost = extractHost(event?.url);
  if (!eventHost) {
    const text = sanitizeString(event?.text, 1800);
    return Boolean((targetHost && text.includes(targetHost)) || (pageHost && text.includes(pageHost)));
  }
  return Boolean((pageHost && eventHost === pageHost) || (targetHost && eventHost === targetHost));
}

function collectStringsFromPaths(rootValue, pathSegmentsList) {
  const values = [];
  for (const pathSegments of pathSegmentsList) {
    let current = rootValue;
    for (const segment of pathSegments) {
      current = current?.[segment];
      if (current === undefined || current === null) {
        break;
      }
    }
    if (Array.isArray(current)) {
      for (const item of current) {
        if (typeof item === "string") {
          addUnique(values, item);
        } else if (isPlainObject(item)) {
          for (const key of ["path", "url", "data_url", "dataUrl", "ref", "source", "video"]) {
            if (typeof item[key] === "string") {
              addUnique(values, item[key]);
            }
          }
        }
      }
    } else if (typeof current === "string") {
      addUnique(values, current);
    }
  }
  return values;
}

function collectEvidenceSources(artifact) {
  const screenshotSources = collectStringsFromPaths(artifact, [
    ["artifacts", "captured_screenshots"],
    ["artifacts", "local_screenshots"],
    ["report", "artifacts", "captured_screenshots"],
    ["report", "artifacts", "local_screenshots"],
    ["report", "evidence_gallery", "screenshots"]
  ]);
  const videoSources = collectStringsFromPaths(artifact, [
    ["artifacts", "local_video_path"],
    ["artifacts", "blocker_clip_path"],
    ["artifacts", "videos"],
    ["report", "artifacts", "local_video_path"],
    ["report", "artifacts", "blocker_clip_path"],
    ["report", "evidence_gallery", "videos"]
  ]);
  for (const finding of Array.isArray(artifact?.report?.findings) ? artifact.report.findings : []) {
    for (const value of Array.isArray(finding?.evidence?.screenshots) ? finding.evidence.screenshots : []) {
      addUnique(screenshotSources, value);
    }
    for (const value of Array.isArray(finding?.evidence?.videos) ? finding.evidence.videos : []) {
      addUnique(videoSources, value);
    }
  }
  for (const journey of Array.isArray(artifact?.report?.tested_journeys) ? artifact.report.tested_journeys : []) {
    for (const value of Array.isArray(journey?.evidence?.screenshots) ? journey.evidence.screenshots : []) {
      addUnique(screenshotSources, value);
    }
    for (const value of Array.isArray(journey?.evidence?.videos) ? journey.evidence.videos : []) {
      addUnique(videoSources, value);
    }
    for (const clip of Array.isArray(journey?.step_video_clips) ? journey.step_video_clips : []) {
      if (typeof clip?.video === "string") {
        addUnique(videoSources, clip.video);
      }
    }
  }
  return { screenshotSources, videoSources };
}

function extensionForMimeType(mimeType, fallback = ".bin") {
  const normalized = sanitizeString(mimeType, 120).toLowerCase();
  if (normalized === "image/png") return ".png";
  if (normalized === "image/jpeg" || normalized === "image/jpg") return ".jpg";
  if (normalized === "image/webp") return ".webp";
  if (normalized === "video/webm") return ".webm";
  if (normalized === "video/mp4") return ".mp4";
  return fallback;
}

function maybeWriteDataUrl(dataUrl, outputDir, prefix, index) {
  const match = String(dataUrl || "").match(DATA_URL_PATTERN);
  if (!match) {
    return null;
  }
  const mimeType = match[1].toLowerCase();
  const extension = extensionForMimeType(mimeType);
  const fileName = `${prefix}-${String(index).padStart(3, "0")}${extension}`;
  const filePath = path.join(outputDir, fileName);
  mkdirp(outputDir);
  fs.writeFileSync(filePath, Buffer.from(match[2], "base64"));
  return {
    source: "embedded_data_url",
    file: filePath,
    relative_file: path.relative(path.dirname(outputDir), filePath).replaceAll(path.sep, "/"),
    mime_type: mimeType
  };
}

function copyLocalEvidenceFile(sourcePath, outputDir, prefix, index) {
  const raw = sanitizeString(sourcePath, 4096);
  if (!raw || /^https?:\/\//i.test(raw) || /^data:/i.test(raw)) {
    return null;
  }
  const resolved = path.resolve(raw);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return null;
  }
  const extension = path.extname(resolved) || ".bin";
  const fileName = `${prefix}-${String(index).padStart(3, "0")}${extension}`;
  const filePath = path.join(outputDir, fileName);
  mkdirp(outputDir);
  fs.copyFileSync(resolved, filePath);
  return {
    source: resolved,
    file: filePath,
    relative_file: path.relative(path.dirname(outputDir), filePath).replaceAll(path.sep, "/")
  };
}

function materializeEvidenceFiles(artifact, bundleDir) {
  const { screenshotSources, videoSources } = collectEvidenceSources(artifact);
  const screenshotsDir = path.join(bundleDir, "screenshots");
  const videosDir = path.join(bundleDir, "videos");
  const screenshots = [];
  const videos = [];
  const external = [];

  screenshotSources.forEach((source, index) => {
    const embedded = maybeWriteDataUrl(source, screenshotsDir, "screenshot", index + 1);
    if (embedded) {
      screenshots.push(redactDeep({ ...embedded, original: "[embedded image]" }));
      return;
    }
    const copied = copyLocalEvidenceFile(source, screenshotsDir, "screenshot", index + 1);
    if (copied) {
      screenshots.push(redactDeep(copied));
      return;
    }
    external.push(redactDeep({ kind: "screenshot", ref: source }));
  });

  videoSources.forEach((source, index) => {
    const embedded = maybeWriteDataUrl(source, videosDir, "video", index + 1);
    if (embedded) {
      videos.push(redactDeep({ ...embedded, original: "[embedded video]" }));
      return;
    }
    const copied = copyLocalEvidenceFile(source, videosDir, "video", index + 1);
    if (copied) {
      videos.push(redactDeep(copied));
      return;
    }
    external.push(redactDeep({ kind: "video", ref: source }));
  });

  return { screenshots, videos, external };
}

function selectPrimaryScreenshot(materializedEvidence) {
  const screenshots = Array.isArray(materializedEvidence?.screenshots) ? materializedEvidence.screenshots : [];
  if (!screenshots.length) {
    return null;
  }
  return screenshots[screenshots.length - 1]?.relative_file || null;
}

function buildSummary(artifact, consoleEvents, networkEvents, materializedEvidence) {
  const report = isPlainObject(artifact?.report) ? artifact.report : {};
  const runRequest = isPlainObject(artifact?.run_request) ? artifact.run_request : {};
  const artifacts = getMergedArtifacts(artifact);
  const primaryFinding = Array.isArray(report.findings) ? report.findings[0] : null;
  const networkFailures = networkEvents.filter(isNetworkFailure);
  const topIssuePage = primaryFinding?.page?.url || primaryFinding?.page || null;
  const provisionalSummaryForRelevance = {
    target_url: redactString(sanitizeString(runRequest.target_url || report.target_url, 4096)),
    top_issue: { page: topIssuePage }
  };
  const relevantNetworkFailures = networkEvents.filter((event) => isRelevantNetworkFailure(event, provisionalSummaryForRelevance));
  return {
    run_id: sanitizeString(artifact?.run_id || report.run_id || runRequest.run_id, 128) || null,
    generated_at: new Date().toISOString(),
    source_artifact: sanitizeString(artifact?.__source_artifact, 4096) || null,
    status: sanitizeString(report.status, 64) || null,
    target_url: redactString(sanitizeString(runRequest.target_url || report.target_url, 4096)),
    persona: sanitizeString(runRequest.brand_persona || runRequest.persona || report.summary?.persona_overall, 1000),
    goal: sanitizeString(runRequest.metadata?.goal || runRequest.scenario_list?.[0], 1200),
    started_at: artifacts.started_at || null,
    finished_at: artifacts.finished_at || null,
    note: sanitizeString(report.summary?.note, 1200),
    top_issue: primaryFinding
      ? {
          id: primaryFinding.id || null,
          type: primaryFinding.type || null,
          severity: primaryFinding.severity || null,
          title: primaryFinding.title || null,
          page: topIssuePage,
          observed_behavior: primaryFinding.observed_behavior || null,
          expected_behavior: primaryFinding.expected_behavior || null,
          repro_steps: Array.isArray(primaryFinding.repro_steps) ? primaryFinding.repro_steps : []
        }
      : null,
    counts: {
      findings: Array.isArray(report.findings) ? report.findings.length : 0,
      console_events: consoleEvents.length,
      network_events: networkEvents.length,
      failed_network_events: networkFailures.length,
      relevant_failed_network_events: relevantNetworkFailures.length,
      screenshots: materializedEvidence.screenshots.length,
      videos: materializedEvidence.videos.length,
      external_refs: materializedEvidence.external.length
    },
    files: {
      readme: "README.md",
      full_report_json: "report.json",
      report_markdown: "report.md",
      run_log_jsonl: "run-log.jsonl",
      console_jsonl: "console.jsonl",
      network_jsonl: "network.jsonl",
      network_failures_jsonl: "network-failures.jsonl",
      primary_screenshot: selectPrimaryScreenshot(materializedEvidence),
      screenshots_dir: "screenshots/",
      videos_dir: "videos/"
    }
  };
}

function buildReadme(summary, consoleEvents, networkEvents, materializedEvidence) {
  const topIssue = summary.top_issue || {};
  const reproSteps = Array.isArray(topIssue.repro_steps) ? topIssue.repro_steps : [];
  const failedNetwork = networkEvents.filter(isNetworkFailure).slice(0, 20);
  const relevantFailedNetwork = networkEvents.filter((event) => isRelevantNetworkFailure(event, summary)).slice(0, 20);
  const primaryScreenshot = selectPrimaryScreenshot(materializedEvidence) || summary.files?.primary_screenshot || "";
  const lines = [
    "# QA Developer Handoff",
    "",
    "This bundle contains a redacted QA run artifact, browser evidence, console logs, network logs, and replay files for engineering triage.",
    "",
    "## Run",
    "",
    `- Run ID: ${summary.run_id || "n/a"}`,
    `- Status: ${summary.status || "n/a"}`,
    `- Target URL: ${summary.target_url || "n/a"}`,
    `- Started: ${summary.started_at || "n/a"}`,
    `- Finished: ${summary.finished_at || "n/a"}`,
    `- Persona: ${summary.persona || "n/a"}`,
    `- Goal: ${summary.goal || "n/a"}`,
    "",
    "## Result",
    "",
    `- Summary: ${summary.note || "n/a"}`,
    `- Top issue: ${topIssue.title || "n/a"}${topIssue.severity ? ` (${topIssue.severity})` : ""}`,
    `- Page: ${topIssue.page || "n/a"}`,
    `- Observed: ${topIssue.observed_behavior || "n/a"}`,
    `- Expected: ${topIssue.expected_behavior || "n/a"}`,
    "",
    "## Repro Steps",
    ""
  ];

  if (reproSteps.length) {
    reproSteps.forEach((step, index) => {
      lines.push(`${index + 1}. ${step}`);
    });
  } else {
    lines.push("No repro steps were recorded.");
  }

  lines.push(
    "",
    "## Evidence Files",
    "",
    `- Primary/final screenshot: ${primaryScreenshot || "n/a"}`,
    `- Videos copied: ${materializedEvidence.videos.length}`,
    `- Screenshots extracted/copied: ${materializedEvidence.screenshots.length}`,
    `- External evidence refs: ${materializedEvidence.external.length}`,
    `- Console events: ${consoleEvents.length}`,
    `- Network events: ${networkEvents.length}`,
    `- Failed/error network events: ${failedNetwork.length}`,
    "",
    "Open `report.md` first for the human report, then `network-failures.jsonl`, `console.jsonl`, and `network.jsonl` for engineering detail.",
    "",
    "## Relevant First-Party Network Failures",
    ""
  );

  if (relevantFailedNetwork.length) {
    relevantFailedNetwork.forEach((event) => {
      lines.push(`- ${formatNetworkEvent(event)}`);
    });
  } else {
    lines.push("No first-party failed/error requests were captured near the blocker. All captured failures remain in `network-failures.jsonl` for reference.");
    if (failedNetwork.length) {
      lines.push(`Third-party or unrelated failures captured: ${failedNetwork.length}.`);
    }
  }

  lines.push(
    "",
    "## Sanitization",
    "",
    "Passwords, tokens, API keys, authorization headers, session values, and sensitive URL query parameters are redacted before export."
  );

  return `${lines.join("\n")}\n`;
}

function findLatestArtifactFile(searchRoot = "output") {
  const root = path.resolve(searchRoot);
  if (!fs.existsSync(root)) {
    return "";
  }
  const candidates = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!/node_modules|\.git/.test(entry.name)) {
          stack.push(entryPath);
        }
        continue;
      }
      if (!entry.isFile() || !/_local_agent_full\.json$/i.test(entry.name)) {
        continue;
      }
      try {
        candidates.push({ file: entryPath, mtimeMs: fs.statSync(entryPath).mtimeMs });
      } catch {
        // Ignore unreadable files.
      }
    }
  }
  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return candidates[0]?.file || "";
}

async function createZipArchive(bundleDir) {
  const parentDir = path.dirname(bundleDir);
  const baseName = path.basename(bundleDir);
  const zipPath = path.join(parentDir, `${baseName}.zip`);
  await execFileAsync("zip", ["-qr", zipPath, baseName], { cwd: parentDir });
  return zipPath;
}

async function exportQaDevHandoff(options = {}) {
  const artifactPath =
    sanitizeString(options.artifactPath || options.artifact || "", 4096) ||
    findLatestArtifactFile(options.searchRoot || "output");
  if (!artifactPath) {
    throw new Error("No QA artifact found. Provide --artifact or run a local QA task first.");
  }
  const resolvedArtifactPath = path.resolve(artifactPath);
  const artifact = readJsonFile(resolvedArtifactPath);
  artifact.__source_artifact = resolvedArtifactPath;

  const runId = safeFileName(artifact.run_id || artifact.report?.run_id || artifact.run_request?.run_id || "qa_run");
  const outputRoot = path.resolve(sanitizeString(options.outputRoot || DEFAULT_OUTPUT_ROOT, 4096) || DEFAULT_OUTPUT_ROOT);
  const bundleDir =
    options.bundleDir ||
    path.join(outputRoot, `${runId}_${timestampFragment(options.generatedAt || new Date())}_dev_handoff`);
  mkdirp(bundleDir);

  const consoleEvents = collectConsoleEvents(artifact);
  const networkEvents = collectNetworkEvents(artifact);
  const materializedEvidence = materializeEvidenceFiles(artifact, bundleDir);
  const summary = buildSummary(artifact, consoleEvents, networkEvents, materializedEvidence);
  const networkFailures = networkEvents.filter(isNetworkFailure);

  writeJson(path.join(bundleDir, "summary.json"), summary);
  writeJson(path.join(bundleDir, "request.json"), redactDeep(artifact.run_request || {}, "", { stripEmbeddedMedia: true }));
  writeJson(path.join(bundleDir, "artifacts.json"), redactDeep(getMergedArtifacts(artifact), "", { stripEmbeddedMedia: true }));
  writeJson(path.join(bundleDir, "report.json"), redactDeep(artifact.report || {}, "", { stripEmbeddedMedia: true }));
  writeText(path.join(bundleDir, "report.md"), redactString(artifact.markdown || ""));
  writeJsonl(path.join(bundleDir, "run-log.jsonl"), redactDeep(artifact.runLog || [], "", { stripEmbeddedMedia: true }));
  writeJsonl(path.join(bundleDir, "console.jsonl"), consoleEvents);
  writeText(path.join(bundleDir, "console.txt"), consoleEvents.map(formatConsoleEvent).join("\n") + (consoleEvents.length ? "\n" : ""));
  writeJsonl(path.join(bundleDir, "network.jsonl"), networkEvents);
  writeText(path.join(bundleDir, "network.txt"), networkEvents.map(formatNetworkEvent).join("\n") + (networkEvents.length ? "\n" : ""));
  writeJsonl(path.join(bundleDir, "network-failures.jsonl"), networkFailures);
  writeJson(path.join(bundleDir, "evidence-manifest.json"), redactDeep(materializedEvidence, "", { stripEmbeddedMedia: true }));
  writeText(path.join(bundleDir, "README.md"), buildReadme(summary, consoleEvents, networkEvents, materializedEvidence));

  const manifest = {
    ...summary,
    bundle_dir: bundleDir,
    zip_path: null,
    source_artifact: resolvedArtifactPath
  };

  let zipPath = null;
  let zipError = null;
  if (parseBoolean(options.zip, false)) {
    try {
      zipPath = await createZipArchive(bundleDir);
      manifest.zip_path = zipPath;
    } catch (error) {
      zipError = error?.message || String(error || "zip failed");
      manifest.zip_error = zipError;
    }
  }
  writeJson(path.join(bundleDir, "manifest.json"), manifest);

  return {
    bundleDir,
    zipPath,
    zipError,
    summary,
    consoleEventCount: consoleEvents.length,
    networkEventCount: networkEvents.length,
    failedNetworkEventCount: networkFailures.length,
    relevantFailedNetworkEventCount: summary.counts?.relevant_failed_network_events || 0,
    screenshotCount: materializedEvidence.screenshots.length,
    videoCount: materializedEvidence.videos.length
  };
}

module.exports = {
  exportQaDevHandoff,
  __private: {
    collectConsoleEvents,
    collectNetworkEvents,
    findLatestArtifactFile,
    redactDeep,
    redactString,
    isNetworkFailure
  }
};
