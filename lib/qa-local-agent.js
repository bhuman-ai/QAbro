const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { chromium } = require("playwright");

const {
  buildMarkdownReport,
  normalizeReport,
  parseBoolean,
  sanitizeOptionalString,
  sanitizeString,
  toIsoTimestamp
} = require("./qa-core");
const { buildLiveStreamArtifacts } = require("./qa-live-stream");
const { buildChromiumLaunchOptions } = require("./qa-playwright-runtime");
const { resolveLocalRunConfig } = require("./qa-local");
const { prepareLocalPublication, publishLocalRun } = require("./qa-local-publish");
const { toTimestampId, safeFileName, mkdirp } = require("../scripts/local-workolo-matrix");
const { __private } = require("./qa-browserbase");

const {
  executeVisionOnlyModeAttempt,
  resolveCoordinateClickFallbackConfig,
  attachBrowserTelemetry
} = __private;
const { performCredentialedLogin } = require("./qa-auth-playwright");
const { getQaProfileState } = require("./qa-session-profiles");
const { __private: submissionRunnerPrivate } = require("./submission-runner");

const {
  attemptTwoCaptchaSolve,
  buildSelfHostedRuntimeConfig,
  detectSupportedCaptchaChallenge
} = submissionRunnerPrivate;

const MAX_CAPTURED_SCREENSHOTS = 8;
const MAX_CAPTURED_SCREENSHOT_BYTES = 1500000;
const DEFAULT_BLOCKER_CLIP_LEAD_SECONDS = 6;
const DEFAULT_BLOCKER_CLIP_TAIL_SECONDS = 6;
const execFileAsync = promisify(execFile);

function appendRunLog(runLog, event, details = {}) {
  if (!Array.isArray(runLog)) {
    return;
  }

  const entry = {
    timestamp: new Date().toISOString(),
    event: sanitizeString(event, 128) || "local_agent_progress",
    details: details && typeof details === "object" ? details : {}
  };
  runLog.push(entry);

  if (typeof runLog.__progressHook === "function") {
    try {
      const maybePromise = runLog.__progressHook(entry, runLog.slice());
      if (maybePromise && typeof maybePromise.catch === "function") {
        maybePromise.catch(() => {});
      }
    } catch {
      // Ignore progress hook failures.
    }
  }
}

function resolveRunLogTimestampMs(entry) {
  const raw = sanitizeOptionalString(entry?.timestamp || entry?.ts, 128) || "";
  if (!raw) {
    return NaN;
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function findLatestRunLogTimestampMs(runLog, eventNames = []) {
  const allowed = new Set(
    (Array.isArray(eventNames) ? eventNames : [])
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean)
  );
  if (!allowed.size || !Array.isArray(runLog)) {
    return NaN;
  }

  for (let index = runLog.length - 1; index >= 0; index -= 1) {
    const entry = runLog[index];
    const event = String(entry?.event || "").trim().toLowerCase();
    if (!allowed.has(event)) {
      continue;
    }
    const parsed = resolveRunLogTimestampMs(entry);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return NaN;
}

function findLastMeaningfulRunLogTimestampMs(runLog) {
  if (!Array.isArray(runLog)) {
    return NaN;
  }

  for (let index = runLog.length - 1; index >= 0; index -= 1) {
    const parsed = resolveRunLogTimestampMs(runLog[index]);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return NaN;
}

function shouldEnableAdvancedCaptchaAssist(runRequest) {
  const metadata = runRequest?.metadata && typeof runRequest.metadata === "object" ? runRequest.metadata : {};
  const browserMode = sanitizeOptionalString(
    metadata.browser_mode || metadata.browserMode || metadata.browser_runtime || metadata.browserRuntime,
    64
  )
    ?.toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (browserMode === "advanced_browser") {
    return true;
  }
  return parseBoolean(
    metadata.enable_captcha_solver ||
      metadata.enableCaptchaSolver ||
      metadata.browserbase_solve_captchas ||
      metadata.browserbaseSolveCaptchas
  ) === true;
}

function collectCustomerInstructionText(runRequest) {
  const metadata = runRequest?.metadata && typeof runRequest.metadata === "object" ? runRequest.metadata : {};
  const parts = [];

  if (Array.isArray(runRequest?.scenario_list)) {
    parts.push(...runRequest.scenario_list);
  }

  parts.push(
    metadata.task_to_try,
    metadata.taskToTry,
    metadata.expected_success,
    metadata.expectedSuccess,
    metadata.goal,
    metadata.objective
  );

  return parts
    .map((part) => sanitizeOptionalString(part, 1200) || "")
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function removeAuthObjectivePhrases(value) {
  return sanitizeOptionalString(value, 4000)
    .toLowerCase()
    .replace(/\b(create|created|finish|complete|submit|start|open|fill|use|enter|continue through|reach|reaches|reached)\s+(a |an |the )?(brand new |new )?(signup|sign-up|sign up|registration|register|account|form|otp|one[-\s]?time password|verification|dashboard|authenticated dashboard)\b/g, " ")
    .replace(/\b(create|created)\s+(a |an )?(brand new |new )?account\b/g, " ")
    .replace(/\b(sign\s?up|signup|sign-up|register|registration|login|log in|logged in|signed in|authenticated|auth|otp|one[-\s]?time password|verification|verify|dashboard|password|confirm password|phone|email|required field|required fields)\b/g, " ")
    .replace(/\b(the )?(signup|sign-up|registration|register|auth|account) form\b/g, " ");
}

function hasExplicitPostAuthProductTask(instructionText) {
  const cleaned = removeAuthObjectivePhrases(instructionText);
  return /\b(upload|download|generate|make|send|invite|purchase|checkout|subscribe|connect|configure|edit|delete|add|import|export|analy[sz]e|publish|book|schedule|create video|generated video|payment|billing|file|vendor|report)\b/.test(
    cleaned
  );
}

function shouldCompleteAfterAuthSuccess(runRequest, authResult) {
  if (!authResult || authResult.success !== true) {
    return false;
  }

  const instructionText = collectCustomerInstructionText(runRequest);
  if (!instructionText) {
    return false;
  }

  const hasExplicitSuccessCondition =
    /\bonly count\b/.test(instructionText) ||
    /\bcount (the )?(flow|run|test|signup|sign-up|registration) as successful\b/.test(instructionText) ||
    /\bsuccess(?:ful)? if\b/.test(instructionText) ||
    /\bexpected success\b/.test(instructionText);
  const namesAuthSuccess =
    /\b(otp|one[-\s]?time password|verification|verify|authenticated dashboard|authenticated|dashboard|logged in|signed in|signup|sign-up|sign up|register|registered|created account|new account)\b/.test(
      instructionText
    );

  if (!hasExplicitSuccessCondition || !namesAuthSuccess) {
    return false;
  }

  return !hasExplicitPostAuthProductTask(instructionText);
}

function buildAuthSuccessCandidateReport(runRequest, authResult, currentUrl, artifacts) {
  const screenshotEvidence = Array.isArray(artifacts?.local_screenshots)
    ? artifacts.local_screenshots.slice(-6)
    : [];
  const videoEvidence = sanitizeOptionalString(artifacts?.local_video_path, 4096)
    ? [artifacts.local_video_path]
    : [];
  const finalUrl = sanitizeOptionalString(currentUrl, 4096) || sanitizeOptionalString(runRequest?.target_url, 4096) || null;

  return {
    run_id: sanitizeString(runRequest?.run_id, 128),
    target: sanitizeString(runRequest?.target_url, 320),
    status: "completed",
    summary: {
      note:
        "The requested signup/authentication success condition was met: the account form was filled, OTP was reached when required, and the browser reached the authenticated surface.",
      risk_score: 0
    },
    findings: [],
    tested_journeys: [
      {
        id: "journey_signup_auth_completed",
        name: authResult?.autoCreatedAccount ? "New account signup" : "Authentication",
        status: "completed",
        summary:
          "The deterministic auth flow completed the customer-requested success condition and reached the authenticated product surface.",
        steps: [
          "Open the requested signup or auth entry page.",
          "Fill the required account fields with generated QA-safe values.",
          "Submit the form and complete OTP when required.",
          "Confirm the browser reaches the authenticated product surface."
        ],
        pages: [runRequest?.target_url, finalUrl].filter(Boolean),
        evidence: {
          screenshots: screenshotEvidence,
          videos: videoEvidence,
          console_logs: [],
          network_logs: []
        },
        observations: [
          authResult?.otpMode === "provider_hook"
            ? "OTP was handled through the configured inbox provider."
            : "The auth flow reached the authenticated surface."
        ]
      }
    ],
    evidence_gallery: {
      screenshots: screenshotEvidence,
      videos: videoEvidence,
      console_logs: [],
      network_logs: []
    },
    recommendations: [
      "Use this auth-success evidence as the proof for this signup objective. Run a separate post-login QA when the customer asks for product actions after signup."
    ],
    metadata: {
      auth_success_satisfied_customer_objective: true,
      auth_auto_created_account: authResult?.autoCreatedAccount === true,
      auth_otp_mode: sanitizeOptionalString(authResult?.otpMode, 64) || null,
      final_url: finalUrl
    }
  };
}

function resolveBlockerClipAnchorMs(runLog, startedAtIso, finishedAtIso) {
  const prioritized = [
    "auth_flow_failed",
    "vision_only_step_failed",
    "agent_execution_failed",
    "local_agent_failed",
    "agent_mode_attempt_failed"
  ];
  for (const eventName of prioritized) {
    const prioritizedTimestampMs = findLatestRunLogTimestampMs(runLog, [eventName]);
    if (Number.isFinite(prioritizedTimestampMs)) {
      return prioritizedTimestampMs;
    }
  }

  const lastLoggedMs = findLastMeaningfulRunLogTimestampMs(runLog);
  if (Number.isFinite(lastLoggedMs)) {
    return lastLoggedMs;
  }

  const finishedAtMs = Date.parse(sanitizeOptionalString(finishedAtIso, 128) || "");
  if (Number.isFinite(finishedAtMs)) {
    return finishedAtMs;
  }

  const startedAtMs = Date.parse(sanitizeOptionalString(startedAtIso, 128) || "");
  return Number.isFinite(startedAtMs) ? startedAtMs : Date.now();
}

function getOutputRelativePath(value) {
  const raw = sanitizeOptionalString(value, 4096) || "";
  if (!raw) {
    return "";
  }

  const normalized = raw.replaceAll("\\", "/");
  const outputIndex = normalized.toLowerCase().lastIndexOf("/output/");
  if (outputIndex < 0) {
    return "";
  }

  return normalized.slice(outputIndex + "/output/".length).replace(/^\/+/, "");
}

function buildArtifactPublicUrl(filePath, liveStreamPublicBaseUrl) {
  const baseUrl = sanitizeOptionalString(liveStreamPublicBaseUrl, 4096) || "";
  const relativePath = getOutputRelativePath(filePath);
  if (!baseUrl || !relativePath) {
    return "";
  }

  const encodedPath = relativePath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  if (!encodedPath) {
    return "";
  }

  return `${baseUrl.replace(/\/+$/, "")}/artifacts/${encodedPath}`;
}

async function resolveRecordedVideoPath(videoHandle) {
  if (!videoHandle || typeof videoHandle.path !== "function") {
    return "";
  }

  try {
    return sanitizeOptionalString(await videoHandle.path(), 4096) || "";
  } catch {
    return "";
  }
}

function appendCapturedScreenshotPath(artifacts, screenshotPath) {
  const safePath = sanitizeOptionalString(screenshotPath, 4096) || "";
  if (!safePath) {
    return false;
  }

  if (!Array.isArray(artifacts.captured_screenshots)) {
    artifacts.captured_screenshots = [];
  }
  if (!artifacts.captured_screenshots.includes(safePath)) {
    artifacts.captured_screenshots.push(safePath);
  }

  if (!Array.isArray(artifacts.local_screenshots)) {
    artifacts.local_screenshots = [];
  }
  if (!artifacts.local_screenshots.includes(safePath)) {
    artifacts.local_screenshots.push(safePath);
  }

  artifacts.screenshot_event_count = Number(artifacts.screenshot_event_count || 0) + 1;
  return true;
}

function findLatestVideoInDirectory(videoDir) {
  const safeDir = sanitizeOptionalString(videoDir, 4096) || "";
  if (!safeDir) {
    return "";
  }

  let entries = [];
  try {
    entries = fs.readdirSync(safeDir, { withFileTypes: true });
  } catch {
    return "";
  }

  const candidates = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(safeDir, entry.name))
    .filter((candidate) => /\.(webm|mp4|mov|m4v)$/i.test(candidate))
    .map((candidate) => {
      try {
        const stat = fs.statSync(candidate);
        return stat.isFile() && stat.size > 0 ? { candidate, mtimeMs: stat.mtimeMs } : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  return candidates[0]?.candidate || "";
}

async function probeVideoDurationSeconds(filePath, options = {}) {
  const safePath = sanitizeOptionalString(filePath, 4096) || "";
  if (!safePath) {
    return NaN;
  }

  const ffprobePath = sanitizeOptionalString(options.ffprobePath, 512) || process.env.FFPROBE_PATH || "ffprobe";
  try {
    const { stdout } = await execFileAsync(ffprobePath, [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      safePath
    ]);
    const parsed = Number.parseFloat(String(stdout || "").trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : NaN;
  } catch {
    return NaN;
  }
}

async function createBlockerClip(videoPath, options = {}) {
  const safeVideoPath = sanitizeOptionalString(videoPath, 4096) || "";
  if (!safeVideoPath) {
    return null;
  }

  let stat = null;
  try {
    stat = fs.statSync(safeVideoPath);
  } catch {
    return null;
  }
  if (!stat || !stat.isFile() || stat.size <= 0) {
    return null;
  }

  const durationSeconds = await probeVideoDurationSeconds(safeVideoPath, options);
  if (!Number.isFinite(durationSeconds) || durationSeconds < 1) {
    return null;
  }

  const clipLeadSeconds = Math.max(
    1,
    Number(options.clipLeadSeconds) || DEFAULT_BLOCKER_CLIP_LEAD_SECONDS
  );
  const clipTailSeconds = Math.max(
    1,
    Number(options.clipTailSeconds) || DEFAULT_BLOCKER_CLIP_TAIL_SECONDS
  );

  const startedAtMs = Date.parse(sanitizeOptionalString(options.startedAt, 128) || "");
  const anchorMs = resolveBlockerClipAnchorMs(options.runLog, options.startedAt, options.finishedAt);
  const anchorOffsetSeconds =
    Number.isFinite(anchorMs) && Number.isFinite(startedAtMs)
      ? Math.max(0, (anchorMs - startedAtMs) / 1000)
      : durationSeconds;

  const clipStartSeconds = Math.max(0, Math.min(durationSeconds, anchorOffsetSeconds - clipLeadSeconds));
  const clipEndSeconds = Math.max(
    clipStartSeconds + 1,
    Math.min(durationSeconds, anchorOffsetSeconds + clipTailSeconds)
  );
  const clipDurationSeconds = Math.max(1, clipEndSeconds - clipStartSeconds);
  const clipPath = path.join(
    path.dirname(safeVideoPath),
    `${path.basename(safeVideoPath, path.extname(safeVideoPath))}-blocker.mp4`
  );
  const ffmpegPath = sanitizeOptionalString(options.ffmpegPath, 512) || process.env.FFMPEG_PATH || "ffmpeg";
  const attempts = [
    [
      "-y",
      "-ss",
      clipStartSeconds.toFixed(3),
      "-i",
      safeVideoPath,
      "-t",
      clipDurationSeconds.toFixed(3),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      clipPath
    ],
    [
      "-y",
      "-sseof",
      `-${Math.min(durationSeconds, clipLeadSeconds + clipTailSeconds).toFixed(3)}`,
      "-i",
      safeVideoPath,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      clipPath
    ]
  ];

  for (const args of attempts) {
    try {
      await execFileAsync(ffmpegPath, args);
      const clipStat = fs.statSync(clipPath);
      if (clipStat.isFile() && clipStat.size > 0) {
        return {
          path: clipPath,
          start_seconds: clipStartSeconds,
          end_seconds: clipEndSeconds,
          duration_seconds: clipDurationSeconds
        };
      }
    } catch {
      // Try the fallback invocation.
    }
  }

  return null;
}

async function captureFailureState(page, runDir, artifacts) {
  if (!page || typeof page.isClosed !== "function" || page.isClosed()) {
    return null;
  }

  const failureState = {
    page_loaded: false,
    current_url: null,
    current_state: null
  };

  try {
    failureState.current_url = sanitizeOptionalString(page.url(), 4096) || null;
    failureState.page_loaded = Boolean(failureState.current_url);
  } catch {
    // Ignore URL read failures.
  }

  let pageTitle = "";
  try {
    pageTitle = sanitizeString(await page.title(), 160);
  } catch {
    pageTitle = "";
  }

  let pageSummary = "";
  try {
    pageSummary = sanitizeString(
      await page.evaluate(() => {
        const headings = Array.from(document.querySelectorAll("h1, h2, [role='heading']"))
          .map((element) => (element.textContent || "").replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .slice(0, 3)
          .join(" | ");
        const buttons = Array.from(document.querySelectorAll("button, [role='button'], input[type='submit']"))
          .map((element) => {
            const text = (element.textContent || element.value || "").replace(/\s+/g, " ").trim();
            return text || "";
          })
          .filter(Boolean)
          .slice(0, 4)
          .join(" | ");
        const bodyText = (document.body?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 240);
        return [headings ? `Headings: ${headings}` : "", buttons ? `Buttons: ${buttons}` : "", bodyText ? `Body: ${bodyText}` : ""]
          .filter(Boolean)
          .join(" || ");
      }),
      2000
    );
  } catch {
    pageSummary = "";
  }

  failureState.current_state =
    sanitizeOptionalString([pageTitle ? `Title: ${pageTitle}` : "", pageSummary].filter(Boolean).join(" || "), 2000) ||
    null;

  const screenshotPath = path.join(runDir, `failure-state-${toTimestampId()}.png`);
  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const screenshotStat = fs.statSync(screenshotPath);
    if (screenshotStat.isFile() && screenshotStat.size > 0) {
      appendCapturedScreenshotPath(artifacts, screenshotPath);
      failureState.screenshot_path = screenshotPath;
    }
  } catch {
    // Failure evidence is best-effort only.
  }

  return failureState;
}

async function captureCheckpointScreenshot(page, runDir, artifacts, runLog, label) {
  if (!page || typeof page.isClosed !== "function" || page.isClosed()) {
    return null;
  }

  const safeLabel =
    sanitizeString(label, 64)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "checkpoint";
  const screenshotPath = path.join(runDir, `${safeLabel}-${toTimestampId()}.png`);

  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const screenshotStat = fs.statSync(screenshotPath);
    if (!screenshotStat.isFile() || screenshotStat.size <= 0) {
      return null;
    }
    appendCapturedScreenshotPath(artifacts, screenshotPath);
    appendRunLog(runLog, "milestone_screenshot_captured", {
      label: safeLabel,
      path: screenshotPath
    });
    return screenshotPath;
  } catch (error) {
    appendRunLog(runLog, "milestone_screenshot_failed", {
      label: safeLabel,
      message: error?.message || "Milestone screenshot failed"
    });
    return null;
  }
}

async function executeLocalAgentQaRun(runRequest, options = {}) {
  const publication = prepareLocalPublication(runRequest, options);
  if (!publication.ok) {
    throw new Error(publication.error || "Local QA run is missing report publication context.");
  }
  const config = resolveLocalRunConfig(runRequest, options);
  const runLog = [];
  const reportUrl = publication.reportUrl || null;
  const onCandidateReport = typeof options.onCandidateReport === "function" ? options.onCandidateReport : null;
  const runTag = safeFileName(runRequest?.run_id || "run") || "run";
  const runDir = path.join(config.outputRoot, `dashboard_agent_${runTag}_${toTimestampId()}`);
  const videoDir = path.join(runDir, "video");
  mkdirp(runDir);
  mkdirp(videoDir);

  if (typeof options.onRunLog === "function") {
    Object.defineProperty(runLog, "__progressHook", {
      value: options.onRunLog,
      enumerable: false,
      configurable: true,
      writable: false
    });
  }

  const startedAt = new Date();
  const artifacts = {
    started_at: startedAt.toISOString(),
    finished_at: null,
    artifact_expires_at: null,
    ...buildLiveStreamArtifacts(),
    viewport_width: 1440,
    viewport_height: 900,
    local_run_dir: runDir,
    local_video_path: null,
    local_video_url: null,
    local_screenshots: [],
    blocker_clip_path: null,
    blocker_clip_url: null,
    screenshot_event_count: 0,
    captured_screenshots: [],
    agent_mode_used: null
  };
  const captureState = {
    maxCount: MAX_CAPTURED_SCREENSHOTS,
    maxBytes: MAX_CAPTURED_SCREENSHOT_BYTES,
    capturedBytes: 0
  };

  const coordinateFallbackConfig = resolveCoordinateClickFallbackConfig(options);
  const pageRef = { current: null };
  const telemetryState = {
    attachedPages: new WeakSet(),
    requestStartTimes: new WeakMap()
  };
  const stagehand = {
    context: {
      awaitActivePage: async () => pageRef.current,
      activePage: () => pageRef.current
    }
  };

  let browser = null;
  let context = null;
  let videoHandle = null;
  let candidateReport = null;
  let rawAgentMessage = "";
  let authResult = null;
  const qaProfile = getQaProfileState(runRequest);
  let agentActions = {
    visited_pages: [],
    flows_tested: runRequest.scope_mode === "feature_targeted" ? runRequest.scenario_list.length || 1 : 1,
    flows_blocked: 0,
    untested_areas: []
  };
  let failureMessage = null;
  let failureDiagnostics = null;

  appendRunLog(runLog, "local_agent_started", {
    run_id: sanitizeString(runRequest?.run_id, 128) || null,
    target_url: sanitizeString(runRequest?.target_url, 4096) || null,
    headless: Boolean(config.headless),
    output_dir: runDir,
    persistent_profile_enabled: Boolean(qaProfile.profile_dir),
    persistent_profile_available: qaProfile.available === true,
    persistent_profile_bypassed: qaProfile.bypassed === true,
    persistent_profile_bypass_reason: qaProfile.bypass_reason || null
  });

  try {
    const launchOptions = buildChromiumLaunchOptions({
      headless: config.headless,
      args: config.headless
        ? []
        : [
            "--start-maximized",
            "--window-position=0,0",
            "--window-size=1440,900",
            "--disable-backgrounding-occluded-windows",
            "--disable-features=CalculateNativeWinOcclusion"
          ]
    }, { browserChannel: config.browserChannel });
    const contextOptions = {
      viewport: { width: 1440, height: 900 },
      locale: "en-US",
      timezoneId: "America/New_York",
      recordVideo: {
        dir: videoDir,
        size: { width: 1280, height: 720 }
      }
    };

    if (qaProfile.profile_dir) {
      mkdirp(qaProfile.profile_dir);
      context = await chromium.launchPersistentContext(qaProfile.profile_dir, {
        ...launchOptions,
        ...contextOptions
      });
      artifacts.persistent_profile_dir = qaProfile.profile_dir;
      artifacts.persistent_profile_enabled = true;
      artifacts.persistent_profile_bypassed = false;
      artifacts.persistent_profile_bypass_reason = null;
    } else {
      browser = await chromium.launch(launchOptions);
      context = await browser.newContext(contextOptions);
      artifacts.persistent_profile_enabled = false;
      artifacts.persistent_profile_bypassed = qaProfile.bypassed === true;
      artifacts.persistent_profile_bypass_reason = qaProfile.bypass_reason || null;
    }
    appendRunLog(runLog, "browser_context_ready", {
      execution_engine: "local_vision_agent",
      headless: Boolean(config.headless),
      persistent_profile_enabled: Boolean(qaProfile.profile_dir),
      persistent_profile_available: qaProfile.available === true,
      persistent_profile_bypassed: qaProfile.bypassed === true,
      persistent_profile_bypass_reason: qaProfile.bypass_reason || null
    });
    pageRef.current = context.pages()[0] || (await context.newPage());
    if (typeof attachBrowserTelemetry === "function") {
      for (const page of context.pages()) {
        attachBrowserTelemetry(page, artifacts, runLog, telemetryState);
      }
      if (typeof context.on === "function") {
        context.on("page", (page) => {
          attachBrowserTelemetry(page, artifacts, runLog, telemetryState);
        });
      }
      appendRunLog(runLog, "browser_telemetry_ready", {
        console: true,
        network: true,
        pages_attached: context.pages().length
      });
    }
    videoHandle = typeof pageRef.current?.video === "function" ? pageRef.current.video() : null;
    if (!config.headless && typeof pageRef.current?.bringToFront === "function") {
      try {
        await pageRef.current.bringToFront();
        await pageRef.current.waitForTimeout(250);
      } catch {
        // Best-effort only. Failing to raise the window should not stop the run.
      }
    }

    try {
      const captchaAssistEnabled = shouldEnableAdvancedCaptchaAssist(runRequest);
      const captchaRuntime = captchaAssistEnabled
        ? buildSelfHostedRuntimeConfig({
            metadata: runRequest?.metadata && typeof runRequest.metadata === "object" ? runRequest.metadata : {}
          })
        : null;
      authResult = await performCredentialedLogin(pageRef.current, runRequest, {
        runLog,
        captureCheckpoint: async (label, page) => {
          await captureCheckpointScreenshot(page, runDir, artifacts, runLog, label);
        },
        resolveCaptcha:
          captchaAssistEnabled
            ? async (page) => attemptTwoCaptchaSolve(page, captchaRuntime, runLog)
            : undefined,
        hasCaptchaChallenge:
          captchaAssistEnabled
            ? async (page) => Boolean(await detectSupportedCaptchaChallenge(page))
            : undefined,
        captchaPostWaitMs:
          captchaRuntime?.twoCaptcha?.postInjectWaitMs ||
          captchaRuntime?.captchaBuiltInWaitMs ||
          4000
      });
    } catch (error) {
      appendRunLog(runLog, "auth_flow_failed", {
        message: error?.message || "Credentialed auth flow failed"
      });
      throw error;
    }

    if (shouldCompleteAfterAuthSuccess(runRequest, authResult)) {
      const currentUrl =
        pageRef.current && typeof pageRef.current.url === "function"
          ? sanitizeOptionalString(pageRef.current.url(), 4096)
          : "";
      artifacts.agent_mode_used = "auth_success";
      artifacts.auth_success_satisfied_customer_objective = true;
      appendRunLog(runLog, "auth_success_satisfied_customer_objective", {
        final_url: currentUrl || null,
        auto_created_account: authResult?.autoCreatedAccount === true,
        otp_mode: sanitizeOptionalString(authResult?.otpMode, 64) || null
      });
      candidateReport = buildAuthSuccessCandidateReport(runRequest, authResult, currentUrl, artifacts);
      rawAgentMessage = candidateReport.summary?.note || "";
      agentActions = {
        ...agentActions,
        visited_pages: [runRequest?.target_url, currentUrl].filter(Boolean),
        flows_tested: 1,
        flows_blocked: 0,
        untested_areas: []
      };
    } else {
      const visionResult = await executeVisionOnlyModeAttempt({
        stagehand,
        runRequest: {
          ...runRequest,
          metadata: {
            ...(runRequest?.metadata && typeof runRequest.metadata === "object" ? runRequest.metadata : {}),
            execution_engine: "local_vision_agent",
            ...(sanitizeOptionalString(authResult?.username, 320)
              ? { vision_forced_email: sanitizeOptionalString(authResult.username, 320) }
              : {}),
            ...(authResult?.otpInbox && typeof authResult.otpInbox === "object"
              ? { otp_inbox: authResult.otpInbox }
              : {})
          }
        },
        options: {
          ...options,
          otpProvider: options.otpProvider || config.otpProvider,
          otpMailtmBaseUrl: options.otpMailtmBaseUrl || config.otpMailtmBaseUrl,
          otpTimeoutMs: options.otpTimeoutMs || config.otpTimeoutMs,
          otpPollIntervalMs: options.otpPollIntervalMs || config.otpPollIntervalMs,
          otpSubjectPattern: options.otpSubjectPattern || config.otpSubjectPattern
        },
        runLog,
        artifacts,
        captureState,
        coordinateFallbackConfig
      });

      artifacts.agent_mode_used = "vision_only";
      candidateReport = visionResult?.candidateReport || null;
      rawAgentMessage = visionResult?.rawAgentMessage || "";
      if (visionResult?.agentActions && typeof visionResult.agentActions === "object") {
        agentActions = {
          ...agentActions,
          ...visionResult.agentActions
        };
      }
    }

    if (candidateReport && onCandidateReport) {
      Promise.resolve()
        .then(() =>
          onCandidateReport(candidateReport, {
            mode: "local_vision_agent",
            run_id: sanitizeString(runRequest?.run_id, 128) || null
          })
        )
        .catch(() => {});
    }
  } catch (error) {
    failureMessage = error?.message || "Local vision agent run failed";
    failureDiagnostics = await captureFailureState(pageRef.current, runDir, artifacts);
    appendRunLog(runLog, "local_agent_failed", {
      message: failureMessage,
      current_url: sanitizeOptionalString(failureDiagnostics?.current_url, 4096) || null,
      current_state: sanitizeOptionalString(failureDiagnostics?.current_state, 2000) || null
    });
  } finally {
    artifacts.finished_at = new Date().toISOString();
    if (context) {
      try {
        await context.close();
      } catch {
        // Ignore teardown errors.
      }
    }
    const resolvedVideoPath =
      (await resolveRecordedVideoPath(videoHandle)) || findLatestVideoInDirectory(videoDir);
    if (resolvedVideoPath) {
      artifacts.local_video_path = resolvedVideoPath;
      artifacts.local_video_url =
        buildArtifactPublicUrl(resolvedVideoPath, artifacts.live_stream_public_base_url) || null;
    }
    if (browser) {
      try {
        await browser.close();
      } catch {
        // Ignore teardown errors.
      }
    }
  }

  const recordedVideoPath =
    sanitizeOptionalString(artifacts.local_video_path, 4096) ||
    (await resolveRecordedVideoPath(videoHandle)) ||
    findLatestVideoInDirectory(videoDir);
  if (recordedVideoPath) {
    artifacts.local_video_path = recordedVideoPath;
    artifacts.local_video_url =
      buildArtifactPublicUrl(recordedVideoPath, artifacts.live_stream_public_base_url) || null;
  }

  if (recordedVideoPath && (failureMessage || Number(agentActions.flows_blocked) > 0)) {
    const blockerClip = await createBlockerClip(recordedVideoPath, {
      runLog,
      startedAt: artifacts.started_at,
      finishedAt: artifacts.finished_at
    });
    if (blockerClip?.path) {
      artifacts.blocker_clip_path = blockerClip.path;
      artifacts.blocker_clip_url =
        buildArtifactPublicUrl(blockerClip.path, artifacts.live_stream_public_base_url) || null;
      artifacts.blocker_clip_window = {
        start_seconds: blockerClip.start_seconds,
        end_seconds: blockerClip.end_seconds,
        duration_seconds: blockerClip.duration_seconds
      };
      appendRunLog(runLog, "blocker_clip_created", {
        duration_seconds: blockerClip.duration_seconds,
        start_seconds: blockerClip.start_seconds,
        end_seconds: blockerClip.end_seconds
      });
    }
  }

  const report = normalizeReport({
    candidateReport,
    rawAgentMessage,
    runRequest: {
      ...runRequest,
      metadata: {
        ...(runRequest?.metadata && typeof runRequest.metadata === "object" ? runRequest.metadata : {}),
        execution_engine: "local_vision_agent"
      }
    },
    artifacts,
    actions: agentActions,
    reportUrl,
    deliveredAt: artifacts.finished_at,
    failureMessage,
    failureDiagnostics,
    runLog,
    currentUrl: sanitizeOptionalString(failureDiagnostics?.current_url, 4096) || null,
    currentState: sanitizeOptionalString(failureDiagnostics?.current_state, 2000) || null,
    pageLoaded: typeof failureDiagnostics?.page_loaded === "boolean" ? failureDiagnostics.page_loaded : undefined
  });

  const markdown = buildMarkdownReport(report, runRequest, {
    generated_at: toIsoTimestamp(artifacts.finished_at),
    raw_agent_message_excerpt: rawAgentMessage || failureMessage || ""
  });

  const publishResult = await publishLocalRun({
    publication,
    report,
    markdown,
    artifacts: report.artifacts,
    runLog,
    runRequest
  });
  if (!publishResult.ok) {
    throw new Error(publishResult.error || "Failed to publish local QA run.");
  }

  return {
    report,
    markdown,
    artifacts: report.artifacts,
    runLog,
    rawAgentMessage,
    agentActions,
    publish: publishResult
  };
}

module.exports = {
  executeLocalAgentQaRun,
  __private: {
    resolveBlockerClipAnchorMs,
    buildArtifactPublicUrl,
    shouldCompleteAfterAuthSuccess,
    buildAuthSuccessCandidateReport
  }
};
