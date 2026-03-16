const fs = require("fs");
const path = require("path");

const {
  buildMarkdownReport,
  buildPrimaryUserGoal,
  normalizeReport,
  sanitizeOptionalString,
  sanitizeString
} = require("./qa-core");
const { buildLiveStreamArtifacts } = require("./qa-live-stream");
const {
  parseArgs,
  runOne,
  createOtpBroker,
  toTimestampId,
  safeFileName,
  mkdirp
} = require("../scripts/local-workolo-matrix");

function parsePositiveInteger(value, fallbackValue) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackValue;
  }
  return Math.floor(parsed);
}

function parseBoolean(value, fallbackValue = false) {
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized) {
    return fallbackValue;
  }
  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }
  return fallbackValue;
}

function shouldDefaultToHeadful(env = process.env) {
  const liveStreamEnabled = parseBoolean(env.QA_LIVE_STREAM_ENABLED, false);
  const displayValue = sanitizeOptionalString(env.DISPLAY, 128) || "";
  const hasLinuxDisplay = process.platform === "linux" && Boolean(displayValue.trim());
  return liveStreamEnabled || hasLinuxDisplay;
}

function normalizeRunLogEntry(value) {
  const safe = value && typeof value === "object" ? value : {};
  const event = sanitizeString(safe.event, 128) || "progress";
  const ts = sanitizeOptionalString(safe.ts, 128) || new Date().toISOString();
  const data = safe.data && typeof safe.data === "object" ? safe.data : {};
  return { ts, event, data };
}

function pushRunLog(runLog, hook, entry) {
  const safeEntry = normalizeRunLogEntry(entry);
  runLog.push(safeEntry);
  if (runLog.length > 500) {
    runLog.splice(0, runLog.length - 500);
  }
  if (typeof hook === "function") {
    Promise.resolve()
      .then(() => hook(safeEntry))
      .catch(() => {
        // Non-fatal telemetry sink failure.
      });
  }
}

function parseJsonFile(filePath) {
  if (!filePath) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function readUtf8File(filePath) {
  if (!filePath) {
    return "";
  }
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

const LOCAL_IMAGE_PATH_PATTERN = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/i;

function isLikelyLocalImagePath(value) {
  const raw = sanitizeString(value, 4096);
  if (!raw || raw.startsWith("data:") || /^https?:\/\//i.test(raw)) {
    return false;
  }
  return LOCAL_IMAGE_PATH_PATTERN.test(raw);
}

function getImageContentType(filePath) {
  const ext = path.extname(String(filePath || "")).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".avif") return "image/avif";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".bmp") return "image/bmp";
  if (ext === ".ico") return "image/x-icon";
  return "";
}

function toInlineImageDataUrl(filePath, maxBytes) {
  const safePath = sanitizeString(filePath, 4096);
  if (!safePath || !isLikelyLocalImagePath(safePath)) {
    return "";
  }

  let stat = null;
  try {
    stat = fs.statSync(safePath);
  } catch {
    return "";
  }
  if (!stat || !stat.isFile() || stat.size <= 0 || stat.size > maxBytes) {
    return "";
  }

  const contentType = getImageContentType(safePath);
  if (!contentType) {
    return "";
  }

  try {
    const data = fs.readFileSync(safePath);
    return `data:${contentType};base64,${data.toString("base64")}`;
  } catch {
    return "";
  }
}

function rewriteScreenshotArrayWithInlineData(values, inlineMap) {
  if (!Array.isArray(values) || !values.length || !(inlineMap instanceof Map) || !inlineMap.size) {
    return values;
  }
  return values.map((value) => {
    const key = sanitizeString(value, 4096);
    return inlineMap.get(key) || value;
  });
}

function inlineReportScreenshots(report, artifacts) {
  const safeReport = report && typeof report === "object" ? report : {};
  const safeArtifacts = artifacts && typeof artifacts === "object" ? artifacts : {};
  const maxScreenshots = Math.max(1, Number(process.env.QA_INLINE_EVIDENCE_MAX_SCREENSHOTS) || 8);
  const maxBytes = Math.max(64 * 1024, Number(process.env.QA_INLINE_EVIDENCE_MAX_BYTES) || 450 * 1024);

  const candidates = [];
  const pushCandidates = (values) => {
    if (!Array.isArray(values)) {
      return;
    }
    for (const value of values) {
      const safeValue = sanitizeString(value, 4096);
      if (!safeValue || candidates.includes(safeValue)) {
        continue;
      }
      candidates.push(safeValue);
    }
  };

  pushCandidates(safeReport?.evidence_gallery?.screenshots);
  pushCandidates(safeArtifacts.local_screenshots);
  if (Array.isArray(safeReport.findings)) {
    for (const finding of safeReport.findings) {
      pushCandidates(finding?.evidence?.screenshots);
    }
  }
  if (Array.isArray(safeReport.tested_journeys)) {
    for (const journey of safeReport.tested_journeys) {
      pushCandidates(journey?.evidence?.screenshots);
    }
  }

  const inlineMap = new Map();
  for (const candidate of candidates) {
    if (inlineMap.size >= maxScreenshots) {
      break;
    }
    if (!isLikelyLocalImagePath(candidate)) {
      continue;
    }
    const dataUrl = toInlineImageDataUrl(candidate, maxBytes);
    if (!dataUrl) {
      continue;
    }
    inlineMap.set(candidate, dataUrl);
  }

  if (!inlineMap.size) {
    return 0;
  }

  if (safeReport.evidence_gallery && typeof safeReport.evidence_gallery === "object") {
    safeReport.evidence_gallery.screenshots = rewriteScreenshotArrayWithInlineData(
      safeReport.evidence_gallery.screenshots,
      inlineMap
    );
  }
  if (Array.isArray(safeReport.findings)) {
    for (const finding of safeReport.findings) {
      if (finding?.evidence && typeof finding.evidence === "object") {
        finding.evidence.screenshots = rewriteScreenshotArrayWithInlineData(finding.evidence.screenshots, inlineMap);
      }
    }
  }
  if (Array.isArray(safeReport.tested_journeys)) {
    for (const journey of safeReport.tested_journeys) {
      if (journey?.evidence && typeof journey.evidence === "object") {
        journey.evidence.screenshots = rewriteScreenshotArrayWithInlineData(journey.evidence.screenshots, inlineMap);
      }
    }
  }

  return inlineMap.size;
}

function resolveLocalRunConfig(runRequest, options = {}) {
  const baseConfig = parseArgs([]);
  const metadata = runRequest && runRequest.metadata && typeof runRequest.metadata === "object" ? runRequest.metadata : {};
  const explicitHeadlessValue = options.headless ?? metadata.headless ?? process.env.QA_LOCAL_HEADLESS;
  const inferredHeadlessFallback = shouldDefaultToHeadful(process.env) ? false : true;

  const otpProvider = sanitizeString(
    options.otpProvider || metadata.otp_provider || process.env.QA_OTP_PROVIDER,
    64
  ).toLowerCase();

  const headless = parseBoolean(explicitHeadlessValue, inferredHeadlessFallback);

  const outputRoot = path.resolve(
    sanitizeString(
      options.outputRoot || process.env.QA_LOCAL_OUTPUT_ROOT || baseConfig.outputRoot,
      4096
    ) || baseConfig.outputRoot
  );

  return {
    ...baseConfig,
    target: sanitizeString(runRequest?.target_url, 4096) || baseConfig.target,
    goal: buildPrimaryUserGoal(runRequest),
    brandPersona: sanitizeString(runRequest?.brand_persona, 500) || baseConfig.brandPersona,
    scenarioList: Array.isArray(runRequest?.scenario_list)
      ? runRequest.scenario_list.map((item) => sanitizeString(item, 512)).filter(Boolean).slice(0, 20)
      : [],
    headless,
    outputRoot,
    otpProvider: otpProvider || baseConfig.otpProvider,
    otpMailtmBaseUrl: sanitizeOptionalString(
      options.otpMailtmBaseUrl || process.env.QA_OTP_MAILTM_BASE_URL || baseConfig.otpMailtmBaseUrl,
      4096
    ) || "",
    otpTimeoutMs: parsePositiveInteger(
      options.otpTimeoutMs ?? metadata.otp_timeout_ms ?? process.env.QA_OTP_TIMEOUT_MS,
      baseConfig.otpTimeoutMs
    ),
    otpPollIntervalMs: parsePositiveInteger(
      options.otpPollIntervalMs ?? metadata.otp_poll_interval_ms ?? process.env.QA_OTP_POLL_INTERVAL_MS,
      baseConfig.otpPollIntervalMs
    ),
    otpSubjectPattern:
      sanitizeString(
        options.otpSubjectPattern || metadata.otp_subject_pattern || process.env.QA_OTP_SUBJECT_PATTERN,
        256
      ) || baseConfig.otpSubjectPattern,
    featureLimit: parsePositiveInteger(
      options.featureLimit ?? metadata.feature_limit ?? process.env.QA_FEATURE_LIMIT,
      baseConfig.featureLimit
    )
  };
}

async function executeLocalQaRun(runRequest, options = {}) {
  const { chromium } = require("playwright");
  const runLog = [];
  const onRunLog = typeof options.onRunLog === "function" ? options.onRunLog : null;
  const onCandidateReport = typeof options.onCandidateReport === "function" ? options.onCandidateReport : null;

  const config = resolveLocalRunConfig(runRequest, options);
  const runTag = safeFileName(runRequest?.run_id || "run") || "run";
  const matrixDir = path.join(config.outputRoot, `dashboard_local_${runTag}_${toTimestampId()}`);
  mkdirp(matrixDir);

  const otpBroker = createOtpBroker({
    provider: config.otpProvider,
    mailtmBaseUrl: config.otpMailtmBaseUrl || undefined
  });

  pushRunLog(runLog, onRunLog, {
    event: "local_runner_started",
    data: {
      run_id: sanitizeString(runRequest?.run_id, 128) || null,
      target_url: config.target,
      output_dir: matrixDir,
      headless: Boolean(config.headless)
    }
  });

  let browser = null;
  let runResult = null;
  const executionStartedAt = new Date().toISOString();

  try {
    browser = await chromium.launch({
      headless: config.headless,
      channel: "chromium"
    });

    runResult = await runOne({
      chromium: browser,
      config,
      matrixDir,
      runIndex: 1,
      otpBroker,
      runId: sanitizeString(runRequest?.run_id, 128) || undefined,
      onProgress: (entry) => {
        pushRunLog(runLog, onRunLog, entry);
      }
    });
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // Ignore shutdown errors.
      }
    }
  }

  pushRunLog(runLog, onRunLog, {
    event: "local_runner_finished",
    data: {
      classification: sanitizeOptionalString(runResult?.classification, 64) || null,
      success: Boolean(runResult?.success)
    }
  });

  const reportPath = sanitizeOptionalString(runResult?.artifacts?.qa_report_json, 4096);
  const markdownPath = sanitizeOptionalString(runResult?.artifacts?.qa_report_md, 4096);
  const candidateReport = parseJsonFile(reportPath) || {};
  const rawMarkdown = readUtf8File(markdownPath);

  const agentActions = {
    visited_pages: Array.isArray(runResult?.urls_visited) ? runResult.urls_visited.slice(0, 80) : [],
    flows_tested: Array.isArray(candidateReport?.tested_journeys) ? candidateReport.tested_journeys.length : 1,
    flows_blocked: Array.isArray(candidateReport?.tested_journeys)
      ? candidateReport.tested_journeys.filter((item) => String(item?.status || "").toLowerCase() === "blocked").length
      : runResult?.success
        ? 0
        : 1,
    untested_areas: []
  };

  const artifacts = {
    started_at: executionStartedAt,
    finished_at: new Date().toISOString(),
    artifact_expires_at: null,
    ...buildLiveStreamArtifacts(runResult?.artifacts),
    local_matrix_dir: matrixDir,
    local_trace_path: sanitizeOptionalString(runResult?.artifacts?.trace, 4096) || null,
    local_video_path: sanitizeOptionalString(runResult?.artifacts?.video, 4096) || null,
    local_run_json: sanitizeOptionalString(runResult?.artifacts?.run_json, 4096) || null,
    local_qa_report_json: reportPath || null,
    local_qa_report_markdown: markdownPath || null,
    local_screenshots: Array.isArray(runResult?.artifacts?.screenshots)
      ? runResult.artifacts.screenshots.slice(0, 120)
      : []
  };

  const report = normalizeReport({
    candidateReport,
    runRequest,
    artifacts,
    actions: agentActions,
    reportUrl: options.reportUrl || null,
    deliveredAt: new Date().toISOString(),
    rawAgentMessage: Array.isArray(runResult?.notes) ? runResult.notes.join("\n") : ""
  });
  inlineReportScreenshots(report, artifacts);

  if (typeof onCandidateReport === "function") {
    Promise.resolve()
      .then(() =>
        onCandidateReport(report, {
          mode: "local_playwright",
          run_id: sanitizeString(runRequest?.run_id, 128) || report.run_id
        })
      )
      .catch(() => {
        // Non-fatal telemetry sink failure.
      });
  }

  const markdown = sanitizeString(rawMarkdown, 200000) || buildMarkdownReport(report, runRequest, {
    generated_at: new Date().toISOString(),
    raw_agent_message_excerpt: sanitizeString(runResult?.error || "", 2000)
  });

  return {
    report,
    markdown,
    artifacts: report.artifacts,
    runLog,
    rawAgentMessage: Array.isArray(runResult?.notes) ? runResult.notes.join("\n") : "",
    agentActions
  };
}

module.exports = {
  executeLocalQaRun,
  resolveLocalRunConfig
};
