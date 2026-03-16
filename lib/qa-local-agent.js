const { chromium } = require("playwright");

const {
  buildMarkdownReport,
  normalizeReport,
  sanitizeString,
  toIsoTimestamp
} = require("./qa-core");
const { buildLiveStreamArtifacts } = require("./qa-live-stream");
const { resolveLocalRunConfig } = require("./qa-local");
const { __private } = require("./qa-browserbase");

const {
  executeVisionOnlyModeAttempt,
  resolveCoordinateClickFallbackConfig
} = __private;
const { performCredentialedLogin } = require("./qa-auth-playwright");

const MAX_CAPTURED_SCREENSHOTS = 8;
const MAX_CAPTURED_SCREENSHOT_BYTES = 1500000;

async function executeLocalAgentQaRun(runRequest, options = {}) {
  const config = resolveLocalRunConfig(runRequest, options);
  const runLog = [];
  const reportUrl = options.reportUrl || null;
  const onCandidateReport = typeof options.onCandidateReport === "function" ? options.onCandidateReport : null;

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
  let candidateReport = null;
  let rawAgentMessage = "";
  let agentActions = {
    visited_pages: [],
    flows_tested: runRequest.scope_mode === "feature_targeted" ? runRequest.scenario_list.length || 1 : 1,
    flows_blocked: 0,
    untested_areas: []
  };
  let failureMessage = null;

  runLog.push({
    timestamp: startedAt.toISOString(),
    event: "local_agent_started",
      details: {
        run_id: sanitizeString(runRequest?.run_id, 128) || null,
        target_url: sanitizeString(runRequest?.target_url, 4096) || null,
        headless: Boolean(config.headless)
      }
    });
  if (typeof runLog.__progressHook === "function") {
    try {
      const maybePromise = runLog.__progressHook(runLog[runLog.length - 1], runLog.slice());
      if (maybePromise && typeof maybePromise.catch === "function") {
        maybePromise.catch(() => {});
      }
    } catch {
      // Ignore progress hook errors to avoid interrupting the run.
    }
  }

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
      timezoneId: "America/New_York"
    });
    runLog.push({
      timestamp: new Date().toISOString(),
      event: "browser_context_ready",
      details: {
        execution_engine: "local_vision_agent",
        headless: Boolean(config.headless)
      }
    });
    if (typeof runLog.__progressHook === "function") {
      try {
        const maybePromise = runLog.__progressHook(runLog[runLog.length - 1], runLog.slice());
        if (maybePromise && typeof maybePromise.catch === "function") {
          maybePromise.catch(() => {});
        }
      } catch {
        // Ignore progress hook errors to avoid interrupting the run.
      }
    }
    pageRef.current = await context.newPage();
    if (!config.headless && typeof pageRef.current?.bringToFront === "function") {
      try {
        await pageRef.current.bringToFront();
        await pageRef.current.waitForTimeout(250);
      } catch {
        // Best-effort only. Failing to raise the window should not stop the run.
      }
    }

    await performCredentialedLogin(pageRef.current, runRequest, {
      runLog
    });

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
  executeLocalAgentQaRun
};
