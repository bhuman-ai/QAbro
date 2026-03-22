const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { chromium } = require("playwright");

const {
  buildMarkdownReport,
  normalizeReport,
  sanitizeOptionalString,
  sanitizeString,
  toIsoTimestamp
} = require("./qa-core");
const { buildLiveStreamArtifacts } = require("./qa-live-stream");
const { resolveLocalRunConfig } = require("./qa-local");
const { toTimestampId, safeFileName, mkdirp } = require("../scripts/local-workolo-matrix");
const { __private } = require("./qa-browserbase");

const {
  executeVisionOnlyModeAttempt,
  resolveCoordinateClickFallbackConfig
} = __private;
const { performCredentialedLogin } = require("./qa-auth-playwright");

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

async function executeLocalAgentQaRun(runRequest, options = {}) {
  const config = resolveLocalRunConfig(runRequest, options);
  const runLog = [];
  const reportUrl = options.reportUrl || null;
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
    local_run_dir: runDir,
    local_video_path: null,
    local_video_url: null,
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
  let agentActions = {
    visited_pages: [],
    flows_tested: runRequest.scope_mode === "feature_targeted" ? runRequest.scenario_list.length || 1 : 1,
    flows_blocked: 0,
    untested_areas: []
  };
  let failureMessage = null;

  appendRunLog(runLog, "local_agent_started", {
    run_id: sanitizeString(runRequest?.run_id, 128) || null,
    target_url: sanitizeString(runRequest?.target_url, 4096) || null,
    headless: Boolean(config.headless),
    output_dir: runDir
  });

  try {
    browser = await chromium.launch({
      headless: config.headless,
      channel: "chromium",
      args: config.headless
        ? []
        : [
            "--start-maximized",
            "--window-position=0,0",
            "--window-size=1440,900",
            "--disable-backgrounding-occluded-windows",
            "--disable-features=CalculateNativeWinOcclusion"
          ]
    });
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: "en-US",
      timezoneId: "America/New_York",
      recordVideo: {
        dir: videoDir,
        size: { width: 1280, height: 720 }
      }
    });
    appendRunLog(runLog, "browser_context_ready", {
      execution_engine: "local_vision_agent",
      headless: Boolean(config.headless)
    });
    pageRef.current = await context.newPage();
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
      await performCredentialedLogin(pageRef.current, runRequest, {
        runLog
      });
    } catch (error) {
      appendRunLog(runLog, "auth_flow_failed", {
        message: error?.message || "Credentialed auth flow failed"
      });
      throw error;
    }

    const visionResult = await executeVisionOnlyModeAttempt({
      stagehand,
      runRequest: {
        ...runRequest,
        metadata: {
          ...(runRequest?.metadata && typeof runRequest.metadata === "object" ? runRequest.metadata : {}),
          execution_engine: "local_vision_agent"
        }
      },
      options,
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
    appendRunLog(runLog, "local_agent_failed", {
      message: failureMessage
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
    if (browser) {
      try {
        await browser.close();
      } catch {
        // Ignore teardown errors.
      }
    }
  }

  const recordedVideoPath = await resolveRecordedVideoPath(videoHandle);
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
    failureMessage
  });

  const markdown = buildMarkdownReport(report, runRequest, {
    generated_at: toIsoTimestamp(artifacts.finished_at),
    raw_agent_message_excerpt: rawAgentMessage || failureMessage || ""
  });

  return {
    report,
    markdown,
    artifacts: report.artifacts,
    runLog,
    rawAgentMessage,
    agentActions
  };
}

module.exports = {
  executeLocalAgentQaRun,
  __private: {
    resolveBlockerClipAnchorMs,
    buildArtifactPublicUrl
  }
};
