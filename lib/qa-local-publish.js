const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const {
  normalizeUrl,
  sanitizeOptionalString,
  sanitizeString,
  sendFinalCallback
} = require("./qa-core");
const { resolveEvidenceStorageConfig, uploadLocalFileToEvidenceStorage } = require("./qa-evidence-storage");

const DEFAULT_PUBLIC_BASE_URL = "https://swarmtester.com";
const LOCAL_IMAGE_PATH_PATTERN = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/i;
const LOCAL_VIDEO_PATH_PATTERN = /\.(mp4|webm|ogg|mov|m4v|m3u8)$/i;
const MAX_STEP_CLIPS_PER_JOURNEY = 24;
const MIN_STEP_CLIP_DURATION_MS = 1800;
const STEP_CLIP_OUTPUT_DIR = "step-clips";
const execFileAsync = promisify(execFile);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeEvidenceSource(value) {
  return sanitizeString(value, 4096).replaceAll("\\", "/");
}

function isLikelyLocalImagePath(value) {
  const raw = sanitizeString(value, 4096);
  if (!raw || raw.startsWith("data:") || /^https?:\/\//i.test(raw)) {
    return false;
  }
  return LOCAL_IMAGE_PATH_PATTERN.test(raw);
}

function isLikelyLocalVideoPath(value) {
  const raw = sanitizeString(value, 4096);
  if (!raw || raw.startsWith("data:") || /^https?:\/\//i.test(raw)) {
    return false;
  }
  return LOCAL_VIDEO_PATH_PATTERN.test(raw);
}

function getMediaContentType(filePath) {
  const ext = path.extname(String(filePath || "")).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".avif") return "image/avif";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".bmp") return "image/bmp";
  if (ext === ".ico") return "image/x-icon";
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".webm") return "video/webm";
  if (ext === ".ogg") return "video/ogg";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".m4v") return "video/x-m4v";
  if (ext === ".m3u8") return "application/vnd.apple.mpegurl";
  return "";
}

function sanitizeFilenameSegment(value, fallback = "clip") {
  const sanitized = sanitizeString(value, 128)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized || fallback;
}

function isLikelyDerivedStepClipPath(value) {
  const raw = sanitizeString(value, 4096).replaceAll("\\", "/").toLowerCase();
  return raw.includes(`/${STEP_CLIP_OUTPUT_DIR}/`) || /-step-\d+\.mp4$/.test(raw);
}

function pickPrimaryLocalVideoPath(report, artifacts) {
  const safeReport = isPlainObject(report) ? report : {};
  const safeArtifacts = isPlainObject(artifacts) ? artifacts : {};
  const candidates = [
    safeArtifacts.local_video_path,
    safeArtifacts.video,
    ...(Array.isArray(safeReport?.evidence_gallery?.videos) ? safeReport.evidence_gallery.videos : [])
  ];

  if (Array.isArray(safeReport.findings)) {
    for (const finding of safeReport.findings) {
      if (Array.isArray(finding?.evidence?.videos)) {
        candidates.push(...finding.evidence.videos);
      }
    }
  }

  if (Array.isArray(safeReport.tested_journeys)) {
    for (const journey of safeReport.tested_journeys) {
      if (Array.isArray(journey?.evidence?.videos)) {
        candidates.push(...journey.evidence.videos);
      }
    }
  }

  for (const candidate of candidates) {
    const normalized = normalizeEvidenceSource(candidate);
    if (!normalized || !isLikelyLocalVideoPath(normalized) || isLikelyDerivedStepClipPath(normalized)) {
      continue;
    }
    try {
      const stat = fs.statSync(normalized);
      if (stat?.isFile() && stat.size > 0) {
        return normalized;
      }
    } catch {
      // Ignore missing local candidates.
    }
  }

  return "";
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

function normalizeAttemptedActionRecord(attempt, index) {
  const stepNumber = Number.isFinite(Number(attempt?.step))
    ? Math.max(1, Math.round(Number(attempt.step)))
    : index + 1;
  const tsMs = Date.parse(String(attempt?.ts || ""));
  return {
    stepNumber,
    tsMs: Number.isFinite(tsMs) ? tsMs : null,
    actionLabel: sanitizeString(attempt?.action, 120).trim().toLowerCase() || "inspect",
    targetLabel: sanitizeString(attempt?.target, 500).trim() || "current screen",
    outcomeLabel: sanitizeString(attempt?.outcome, 1000).trim() || "state observed"
  };
}

function getExperienceTimeline(report) {
  return isPlainObject(report?.experience_timeline) ? report.experience_timeline : {};
}

function getExperienceTimelineDurationMs(timeline) {
  if (Number.isFinite(Number(timeline?.video_duration_ms)) && Number(timeline.video_duration_ms) > 0) {
    return Math.round(Number(timeline.video_duration_ms));
  }
  const spans = Array.isArray(timeline?.spans) ? timeline.spans : [];
  const lastSpanEndMs = spans.reduce((max, span) => {
    const endMs = Math.round(Number(span?.end_ms) || 0);
    return endMs > max ? endMs : max;
  }, 0);
  return Math.max(0, lastSpanEndMs);
}

function getRelatedFindingsForJourney(report, journey) {
  const findings = Array.isArray(report?.findings) ? report.findings : [];
  const journeyTokens = [
    journey?.id,
    journey?.journey_id,
    journey?.journeyId,
    journey?.name,
    journey?.flow,
    journey?.flow_id,
    journey?.flowId
  ]
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);
  const journeyPages = Array.isArray(journey?.pages)
    ? journey.pages.map((page) => String(page || "").trim().toLowerCase()).filter(Boolean)
    : [];

  return findings.filter((finding) => {
    const findingTokens = [
      finding?.journey_id,
      finding?.journeyId,
      finding?.journey,
      finding?.flow_id,
      finding?.flowId,
      finding?.flow
    ]
      .map((item) => String(item || "").trim().toLowerCase())
      .filter(Boolean);
    const findingPage = String(finding?.page?.url || finding?.page || finding?.route || "").trim().toLowerCase();
    const hasTokenMatch =
      Boolean(journeyTokens.length) &&
      findingTokens.some((token) => journeyTokens.some((journeyToken) => token.includes(journeyToken)));
    const hasPageMatch =
      Boolean(findingPage) &&
      journeyPages.some(
        (journeyPage) => findingPage.includes(journeyPage) || journeyPage.includes(findingPage)
      );
    return hasTokenMatch || hasPageMatch;
  });
}

function buildStepTimelineMapForJourney(report, journey, finding, timelineDurationMs) {
  const timeline = getExperienceTimeline(report);
  const spans = Array.isArray(timeline?.spans) ? timeline.spans : [];
  const attemptedActions = Array.isArray(finding?.diagnostic_details?.attempted_actions)
    ? finding.diagnostic_details.attempted_actions
        .map(normalizeAttemptedActionRecord)
        .sort((left, right) => left.stepNumber - right.stepNumber)
    : [];

  if (!spans.length || !attemptedActions.length) {
    return new Map();
  }

  const normalizedFindingId = String(finding?.id || "").trim();
  const matchingSpans = spans.filter((span) => {
    const linkedIds = Array.isArray(span?.linked_finding_ids) ? span.linked_finding_ids : [];
    return linkedIds.some((item) => String(item || "").trim() === normalizedFindingId);
  });
  const sourceSpans = matchingSpans.length ? matchingSpans : spans;
  const attemptedByStep = new Map(attemptedActions.map((item) => [item.stepNumber, item]));
  const map = new Map();

  for (let spanIndex = 0; spanIndex < sourceSpans.length; spanIndex += 1) {
    const span = sourceSpans[spanIndex];
    const spanStartMs = Math.max(0, Math.round(Number(span?.start_ms) || 0));
    const spanEndMs = Math.max(spanStartMs + 1, Math.round(Number(span?.end_ms) || spanStartMs + 1));
    const nextSpan = sourceSpans[spanIndex + 1];
    const segmentEndMs = Math.max(spanStartMs + 1, Math.round(Number(nextSpan?.start_ms) || spanEndMs));
    const actionSteps = Array.isArray(span?.evidence?.action_steps)
      ? span.evidence.action_steps
          .map((value) => Math.round(Number(value)))
          .filter((value) => Number.isInteger(value) && attemptedByStep.has(value))
          .sort((left, right) => left - right)
      : [];
    if (!actionSteps.length) {
      continue;
    }

    const actionsInSpan = actionSteps.map((stepNumber) => attemptedByStep.get(stepNumber)).filter(Boolean);
    const actionsWithTs = actionsInSpan.filter((item) => Number.isFinite(item?.tsMs));
    const availableWindowMs = Math.max(1200, segmentEndMs - spanStartMs);
    const firstTsMs =
      actionsWithTs.length >= 2 ? Math.min(...actionsWithTs.map((item) => Number(item.tsMs))) : Number.NaN;
    const lastTsMs =
      actionsWithTs.length >= 2 ? Math.max(...actionsWithTs.map((item) => Number(item.tsMs))) : Number.NaN;

    const stepEntries = [];
    actionsInSpan.forEach((attempt, actionIndex) => {
      let relativeProgress = 0;
      if (Number.isFinite(attempt?.tsMs) && Number.isFinite(firstTsMs) && Number.isFinite(lastTsMs) && lastTsMs > firstTsMs) {
        relativeProgress = Math.max(0, Math.min(1, (Number(attempt.tsMs) - firstTsMs) / (lastTsMs - firstTsMs)));
      } else if (actionsInSpan.length > 1) {
        relativeProgress = actionIndex / Math.max(1, actionsInSpan.length - 1);
      }

      const jumpMs =
        actionsInSpan.length === 1
          ? spanStartMs
          : Math.max(
              spanStartMs,
              Math.min(segmentEndMs - 320, spanStartMs + Math.round(relativeProgress * (availableWindowMs - 320)))
            );
      stepEntries.push({
        stepNumber: attempt.stepNumber,
        level: sanitizeString(span?.level, 32).trim().toLowerCase() || "good",
        jumpMs
      });
    });

    stepEntries.forEach((entry, actionIndex) => {
      const nextEntry = stepEntries[actionIndex + 1] || null;
      const clipStartMs = Math.max(spanStartMs, entry.jumpMs);
      const rawClipEndMs = nextEntry
        ? Math.max(clipStartMs + 320, nextEntry.jumpMs)
        : Math.max(clipStartMs + 320, segmentEndMs);
      const clipEndMs = Math.max(
        clipStartMs + MIN_STEP_CLIP_DURATION_MS,
        Math.min(
          timelineDurationMs,
          Math.max(clipStartMs + MIN_STEP_CLIP_DURATION_MS, rawClipEndMs)
        )
      );
      map.set(entry.stepNumber, {
        stepNumber: entry.stepNumber,
        level: entry.level,
        jumpMs: entry.jumpMs,
        clipStartMs,
        clipEndMs
      });
    });
  }

  return map;
}

async function createStepVideoClip(videoPath, options = {}) {
  const safeVideoPath = sanitizeOptionalString(videoPath, 4096) || "";
  const outputPath = sanitizeOptionalString(options.outputPath, 4096) || "";
  if (!safeVideoPath || !outputPath) {
    return null;
  }

  let stat = null;
  try {
    stat = fs.statSync(safeVideoPath);
  } catch {
    stat = null;
  }
  if (!stat?.isFile() || stat.size <= 0) {
    return null;
  }

  const durationSeconds =
    Number.isFinite(Number(options.videoDurationSeconds)) && Number(options.videoDurationSeconds) > 0
      ? Number(options.videoDurationSeconds)
      : await probeVideoDurationSeconds(safeVideoPath, options);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return null;
  }

  const clipStartSeconds = Math.max(0, Math.min(durationSeconds, Number(options.startMs || 0) / 1000));
  const clipEndSeconds = Math.max(
    clipStartSeconds + MIN_STEP_CLIP_DURATION_MS / 1000,
    Math.min(durationSeconds, Number(options.endMs || 0) / 1000)
  );
  const clipDurationSeconds = Math.max(1, clipEndSeconds - clipStartSeconds);
  const ffmpegPath = sanitizeOptionalString(options.ffmpegPath, 512) || process.env.FFMPEG_PATH || "ffmpeg";

  try {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  } catch {
    return null;
  }

  try {
    await execFileAsync(ffmpegPath, [
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
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      outputPath
    ]);
    const clipStat = fs.statSync(outputPath);
    if (clipStat?.isFile() && clipStat.size > 0) {
      return {
        path: outputPath,
        start_seconds: clipStartSeconds,
        end_seconds: clipEndSeconds,
        duration_seconds: clipDurationSeconds
      };
    }
  } catch {
    return null;
  }

  return null;
}

async function attachStepVideoClipsToReport(report, artifacts, options = {}) {
  const safeReport = isPlainObject(report) ? report : {};
  const journeys = Array.isArray(safeReport.tested_journeys) ? safeReport.tested_journeys : [];
  if (!journeys.length) {
    return safeReport;
  }

  const masterVideoPath = pickPrimaryLocalVideoPath(safeReport, artifacts);
  if (!masterVideoPath) {
    return safeReport;
  }

  const probeDurationImpl =
    typeof options.probeVideoDurationSecondsImpl === "function"
      ? options.probeVideoDurationSecondsImpl
      : probeVideoDurationSeconds;
  const createStepVideoClipImpl =
    typeof options.createStepVideoClipImpl === "function"
      ? options.createStepVideoClipImpl
      : createStepVideoClip;

  const videoDurationSeconds = await probeDurationImpl(masterVideoPath, options);
  if (!Number.isFinite(videoDurationSeconds) || videoDurationSeconds <= 0) {
    return safeReport;
  }

  const timelineDurationMs = Math.max(
    Math.round(videoDurationSeconds * 1000),
    getExperienceTimelineDurationMs(getExperienceTimeline(safeReport))
  );
  const runIdSegment = sanitizeFilenameSegment(safeReport.run_id || options.runId || "run", "run");
  const stepClipOutputDir = path.join(path.dirname(masterVideoPath), STEP_CLIP_OUTPUT_DIR);
  let anyAttached = false;
  const updatedJourneys = journeys.map((journey, journeyIndex) => {
    if (!isPlainObject(journey)) {
      return journey;
    }

    return { ...journey, step_video_clips: [] };
  });

  for (let journeyIndex = 0; journeyIndex < updatedJourneys.length; journeyIndex += 1) {
    const journey = updatedJourneys[journeyIndex];
    if (!isPlainObject(journey)) {
      continue;
    }

    const relatedFindings = getRelatedFindingsForJourney(safeReport, journey);
    const primaryFinding = relatedFindings[0] || null;
    const stepTimelineMap = primaryFinding
      ? buildStepTimelineMapForJourney(safeReport, journey, primaryFinding, timelineDurationMs)
      : new Map();
    if (!stepTimelineMap.size) {
      continue;
    }

    const stepKeys = [...stepTimelineMap.keys()]
      .filter((value) => Number.isInteger(value) && value > 0)
      .sort((left, right) => left - right)
      .slice(0, MAX_STEP_CLIPS_PER_JOURNEY);
    if (!stepKeys.length) {
      continue;
    }

    const journeyIdSegment = sanitizeFilenameSegment(journey.id || journey.name || `journey-${journeyIndex + 1}`);
    const clips = [];
    for (const stepNumber of stepKeys) {
      const stepMeta = stepTimelineMap.get(stepNumber);
      if (!stepMeta) {
        continue;
      }
      const clipStartMs = Math.max(0, Math.round(Number(stepMeta.clipStartMs) || 0));
      const clipEndMs = Math.max(clipStartMs + MIN_STEP_CLIP_DURATION_MS, Math.round(Number(stepMeta.clipEndMs) || 0));
      const outputPath = path.join(
        stepClipOutputDir,
        `${runIdSegment}-${journeyIdSegment}-step-${String(stepNumber).padStart(2, "0")}.mp4`
      );
      const createdClip = await createStepVideoClipImpl(masterVideoPath, {
        ...options,
        outputPath,
        startMs: clipStartMs,
        endMs: clipEndMs,
        videoDurationSeconds
      });
      if (!createdClip?.path) {
        continue;
      }

      clips.push({
        step: stepNumber,
        clip_start_ms: clipStartMs,
        clip_end_ms: clipEndMs,
        video: createdClip.path.replaceAll("\\", "/"),
        content_type: "video/mp4"
      });
    }

    if (clips.length) {
      journey.step_video_clips = clips;
      anyAttached = true;
    } else {
      delete journey.step_video_clips;
    }
  }

  if (!anyAttached) {
    return safeReport;
  }

  return {
    ...safeReport,
    tested_journeys: updatedJourneys
  };
}

function toInlineMediaDataUrl(filePath, maxBytes, validator) {
  const safePath = sanitizeString(filePath, 4096);
  if (!safePath || typeof validator !== "function" || !validator(safePath)) {
    return "";
  }

  let stat = null;
  try {
    stat = fs.statSync(safePath);
  } catch {
    return "";
  }
  if (!stat?.isFile() || stat.size <= 0 || stat.size > maxBytes) {
    return "";
  }

  const contentType = getMediaContentType(safePath);
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

function collectLocalScreenshotCandidates(report, artifacts) {
  const safeReport = isPlainObject(report) ? report : {};
  const safeArtifacts = isPlainObject(artifacts) ? artifacts : {};
  const candidates = [];
  const seen = new Set();

  const pushCandidates = (values) => {
    if (!Array.isArray(values)) {
      return;
    }
    for (const value of values) {
      const normalized = normalizeEvidenceSource(value);
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      candidates.push(normalized);
    }
  };

  if (Array.isArray(safeReport.tested_journeys)) {
    for (const journey of safeReport.tested_journeys) {
      const screenshots = Array.isArray(journey?.evidence?.screenshots) ? journey.evidence.screenshots : [];
      if (screenshots.length) {
        pushCandidates([screenshots[0]]);
      }
    }
  }
  if (Array.isArray(safeReport.findings)) {
    for (const finding of safeReport.findings) {
      const screenshots = Array.isArray(finding?.evidence?.screenshots) ? finding.evidence.screenshots : [];
      if (screenshots.length) {
        pushCandidates([screenshots[0]]);
      }
    }
  }
  if (Array.isArray(safeReport.tested_journeys)) {
    for (const journey of safeReport.tested_journeys) {
      pushCandidates(journey?.evidence?.screenshots);
    }
  }
  if (Array.isArray(safeReport.findings)) {
    for (const finding of safeReport.findings) {
      pushCandidates(finding?.evidence?.screenshots);
    }
  }
  pushCandidates(safeReport?.evidence_gallery?.screenshots);
  pushCandidates(safeArtifacts.local_screenshots);

  return candidates.filter((candidate) => isLikelyLocalImagePath(candidate));
}

function collectLocalVideoCandidates(report, artifacts) {
  const safeReport = isPlainObject(report) ? report : {};
  const safeArtifacts = isPlainObject(artifacts) ? artifacts : {};
  const candidates = [];
  const seen = new Set();

  const pushCandidate = (value) => {
    const normalized = normalizeEvidenceSource(value);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    candidates.push(normalized);
  };

  const pushCandidates = (values) => {
    if (!Array.isArray(values)) {
      return;
    }
    for (const value of values) {
      pushCandidate(value);
    }
  };

  pushCandidates(safeReport?.evidence_gallery?.videos);
  if (Array.isArray(safeReport.findings)) {
    for (const finding of safeReport.findings) {
      pushCandidates(finding?.evidence?.videos);
    }
  }
  if (Array.isArray(safeReport.tested_journeys)) {
    for (const journey of safeReport.tested_journeys) {
      pushCandidates(journey?.evidence?.videos);
      if (Array.isArray(journey?.step_video_clips)) {
        for (const clip of journey.step_video_clips) {
          pushCandidate(clip?.video || clip?.source || clip?.url || clip?.path);
        }
      }
    }
  }

  pushCandidate(safeArtifacts.local_video_path);
  pushCandidate(safeArtifacts.video);

  return candidates.filter((candidate) => isLikelyLocalVideoPath(candidate));
}

function buildEmbeddedEvidenceMedia(report, artifacts, options = {}) {
  const requestedMaxScreenshots = Number(
    options.maxScreenshots ?? process.env.QA_EMBEDDED_EVIDENCE_MAX_SCREENSHOTS
  );
  const maxScreenshots = Number.isFinite(requestedMaxScreenshots)
    ? Math.max(0, Math.floor(requestedMaxScreenshots))
    : 8;
  const maxScreenshotBytes = Math.max(
    64 * 1024,
    Number(options.maxScreenshotBytes || options.maxBytes || process.env.QA_EMBEDDED_EVIDENCE_MAX_BYTES) || 350 * 1024
  );
  const requestedMaxVideos = Number(options.maxVideos ?? process.env.QA_EMBEDDED_EVIDENCE_MAX_VIDEOS);
  const maxVideos = Number.isFinite(requestedMaxVideos)
    ? Math.max(0, Math.floor(requestedMaxVideos))
    : 1;
  const maxVideoBytes = Math.max(
    512 * 1024,
    Number(options.maxVideoBytes || process.env.QA_EMBEDDED_EVIDENCE_MAX_VIDEO_BYTES) || 3 * 1024 * 1024
  );

  const screenshots = [];
  for (const candidate of collectLocalScreenshotCandidates(report, artifacts)) {
    if (screenshots.length >= maxScreenshots) {
      break;
    }

    const dataUrl = toInlineMediaDataUrl(candidate, maxScreenshotBytes, isLikelyLocalImagePath);
    if (!dataUrl) {
      continue;
    }

    screenshots.push({
      source: candidate,
      content_type: getMediaContentType(candidate) || null,
      data_url: dataUrl
    });
  }

  const videos = [];
  for (const candidate of collectLocalVideoCandidates(report, artifacts)) {
    if (videos.length >= maxVideos) {
      break;
    }

    const dataUrl = toInlineMediaDataUrl(candidate, maxVideoBytes, isLikelyLocalVideoPath);
    if (!dataUrl) {
      continue;
    }

    videos.push({
      source: candidate,
      content_type: getMediaContentType(candidate) || null,
      data_url: dataUrl
    });
  }

  if (!screenshots.length && !videos.length) {
    return null;
  }

  return {
    ...(screenshots.length ? { screenshots } : {}),
    ...(videos.length ? { videos } : {})
  };
}

async function buildPortableEvidenceMedia(report, artifacts, options = {}) {
  const storageConfig =
    options.useStorage === false
      ? null
      : resolveEvidenceStorageConfig(options.storageOptions || options);
  if (!storageConfig) {
    return buildEmbeddedEvidenceMedia(report, artifacts, options);
  }

  const requestedMaxScreenshots = Number(
    options.maxScreenshots ?? process.env.QA_EVIDENCE_STORAGE_MAX_SCREENSHOTS
  );
  const maxScreenshots = Number.isFinite(requestedMaxScreenshots)
    ? Math.max(0, Math.floor(requestedMaxScreenshots))
    : 24;
  const requestedMaxVideos = Number(options.maxVideos ?? process.env.QA_EVIDENCE_STORAGE_MAX_VIDEOS);
  const videoCandidates = collectLocalVideoCandidates(report, artifacts);
  const maxVideos = Number.isFinite(requestedMaxVideos)
    ? Math.max(0, Math.floor(requestedMaxVideos))
    : Math.max(4, Math.min(32, videoCandidates.length || 4));
  const maxScreenshotUploadBytes = Math.max(
    64 * 1024,
    Number(options.maxScreenshotUploadBytes || process.env.QA_EVIDENCE_STORAGE_MAX_SCREENSHOT_BYTES) ||
      5 * 1024 * 1024
  );
  const maxVideoUploadBytes = Math.max(
    512 * 1024,
    Number(options.maxVideoUploadBytes || process.env.QA_EVIDENCE_STORAGE_MAX_VIDEO_BYTES) ||
      25 * 1024 * 1024
  );
  const runId = sanitizeString(options.runId, 128);

  const screenshots = [];
  for (const candidate of collectLocalScreenshotCandidates(report, artifacts)) {
    if (screenshots.length >= maxScreenshots) {
      break;
    }

    let stat = null;
    try {
      stat = fs.statSync(candidate);
    } catch {
      stat = null;
    }
    if (!stat?.isFile() || stat.size <= 0 || stat.size > maxScreenshotUploadBytes) {
      continue;
    }

    const contentType = getMediaContentType(candidate);
    if (!contentType) {
      continue;
    }

    try {
      const uploaded = await uploadLocalFileToEvidenceStorage(candidate, {
        ...storageConfig,
        runId,
        kind: "screenshots",
        contentType
      });
      if (!uploaded) {
        continue;
      }

      screenshots.push({
        source: candidate,
        content_type: contentType,
        storage_bucket: uploaded.storage_bucket,
        storage_path: uploaded.storage_path,
        byte_length: uploaded.byte_length
      });
    } catch {
      continue;
    }
  }

  const videos = [];
  for (const candidate of videoCandidates) {
    if (videos.length >= maxVideos) {
      break;
    }

    let stat = null;
    try {
      stat = fs.statSync(candidate);
    } catch {
      stat = null;
    }
    if (!stat?.isFile() || stat.size <= 0 || stat.size > maxVideoUploadBytes) {
      continue;
    }

    const contentType = getMediaContentType(candidate);
    if (!contentType) {
      continue;
    }

    try {
      const uploaded = await uploadLocalFileToEvidenceStorage(candidate, {
        ...storageConfig,
        runId,
        kind: "videos",
        contentType
      });
      if (!uploaded) {
        continue;
      }

      videos.push({
        source: candidate,
        content_type: contentType,
        storage_bucket: uploaded.storage_bucket,
        storage_path: uploaded.storage_path,
        byte_length: uploaded.byte_length
      });
    } catch {
      continue;
    }
  }

  if (!screenshots.length && !videos.length) {
    return buildEmbeddedEvidenceMedia(report, artifacts, options);
  }

  return {
    ...(screenshots.length ? { screenshots } : {}),
    ...(videos.length ? { videos } : {})
  };
}

function extractBrandKey(runRequest) {
  const metadata = isPlainObject(runRequest?.metadata) ? runRequest.metadata : {};
  const candidates = [
    metadata.brand_id,
    metadata.brandId,
    metadata.brand_key,
    metadata.brandKey,
    metadata.brand,
    metadata.brand_slug,
    metadata.brandSlug,
    metadata.workspace_id,
    metadata.workspaceId
  ];

  for (const candidate of candidates) {
    const value = sanitizeString(candidate, 256);
    if (value) {
      return value;
    }
  }

  return "";
}

function extractOwnerMetadata(runRequest) {
  const metadata = isPlainObject(runRequest?.metadata) ? runRequest.metadata : {};
  return {
    ownerUserId: sanitizeString(
      metadata.owner_user_id || metadata.ownerUserId || metadata.user_id || metadata.userId,
      128
    ),
    ownerEmail: sanitizeString(metadata.owner_email || metadata.ownerEmail, 320).toLowerCase()
  };
}

function resolvePublicBaseUrl(options = {}) {
  const configured = normalizeUrl(
    options.publicBaseUrl || process.env.QA_PUBLIC_APP_URL || DEFAULT_PUBLIC_BASE_URL
  );
  return (configured || DEFAULT_PUBLIC_BASE_URL).replace(/\/$/, "");
}

function buildLocalReportUrls(runRequest, options = {}) {
  const runId = sanitizeString(runRequest?.run_id, 128);
  const publicBaseUrl = resolvePublicBaseUrl(options);
  const brandKey = extractBrandKey(runRequest);
  const reportUrl =
    sanitizeOptionalString(options.reportUrl, 4096) ||
    `${publicBaseUrl}/api/qa/report?run_id=${encodeURIComponent(runId)}`;
  const statusUrl =
    sanitizeOptionalString(options.statusUrl, 4096) ||
    `${publicBaseUrl}/api/qa/status?run_id=${encodeURIComponent(runId)}`;
  const uiParams = new URLSearchParams({
    view: "report",
    run_id: runId
  });
  if (brandKey) {
    uiParams.set("brand", brandKey);
  }

  return {
    publicBaseUrl,
    brandKey,
    reportUrl,
    statusUrl,
    uiReportUrl: `${publicBaseUrl}/dashboard?${uiParams.toString()}`
  };
}

function prepareLocalPublication(runRequest, options = {}) {
  const runId = sanitizeString(runRequest?.run_id, 128);
  if (!runId) {
    return { ok: false, error: "Local QA runs require run_id before execution." };
  }

  const owner = extractOwnerMetadata(runRequest);
  if (!owner.ownerUserId) {
    return { ok: false, error: "Local QA runs require metadata.owner_user_id." };
  }
  if (!owner.ownerEmail) {
    return { ok: false, error: "Local QA runs require metadata.owner_email." };
  }

  const urls = buildLocalReportUrls(runRequest, options);
  const skipCallbackPublication = options.skipCallbackPublication === true;
  if (skipCallbackPublication) {
    return {
      ok: true,
      skipCallbackPublication: true,
      runId,
      ...owner,
      ...urls,
      callbackUrl: null,
      callbackSecret: null
    };
  }

  const callbackUrl = normalizeUrl(
    options.callbackUrl || process.env.QA_CALLBACK_URL || `${urls.publicBaseUrl}/api/qa-report-callback`
  );
  if (!callbackUrl) {
    return { ok: false, error: "Local QA runs require a valid QA callback URL." };
  }

  const callbackSecret = sanitizeString(options.callbackSecret || process.env.QA_CALLBACK_SECRET, 512);
  if (!callbackSecret) {
    return { ok: false, error: "Local QA runs require QA_CALLBACK_SECRET for report publication." };
  }

  return {
    ok: true,
    skipCallbackPublication: false,
    runId,
    ...owner,
    ...urls,
    callbackUrl,
    callbackSecret
  };
}

async function publishLocalRun(options = {}) {
  const publication = options.publication;
  if (!publication || publication.ok !== true) {
    return {
      ok: false,
      error: sanitizeString(publication?.error, 400) || "Missing local publication context."
    };
  }

  if (publication.skipCallbackPublication) {
    return {
      ok: true,
      skipped: true,
      report_url: publication.reportUrl,
      status_url: publication.statusUrl,
      ui_report_url: publication.uiReportUrl
    };
  }

  const runRequest = isPlainObject(options.runRequest) ? options.runRequest : {};
  const runRequestMetadata = isPlainObject(runRequest.metadata) ? runRequest.metadata : {};
  const normalizedRunRequest = {
    ...runRequest,
    metadata: {
      ...runRequestMetadata,
      owner_user_id: publication.ownerUserId,
      owner_email: publication.ownerEmail,
      ...(publication.brandKey ? { brand_key: publication.brandKey } : {})
    }
  };

  const report = isPlainObject(options.report) ? options.report : {};
  const reportMetadata = isPlainObject(report.metadata) ? report.metadata : {};
  const sanitizedArtifacts = isPlainObject(options.artifacts)
    ? options.artifacts
    : isPlainObject(report.artifacts)
      ? report.artifacts
      : {};
  const reportWithStepClips = await attachStepVideoClipsToReport(report, sanitizedArtifacts, {
    ...(isPlainObject(options.evidenceMediaOptions) ? options.evidenceMediaOptions : {}),
    runId: publication.runId
  });
  const portableEvidenceMedia =
    isPlainObject(options.evidenceMedia) || Array.isArray(options.evidenceMedia?.screenshots)
      ? options.evidenceMedia
      : await buildPortableEvidenceMedia(reportWithStepClips, sanitizedArtifacts, {
          ...(isPlainObject(options.evidenceMediaOptions) ? options.evidenceMediaOptions : {}),
          runId: publication.runId
        });
  const finalReport = {
    ...reportWithStepClips,
    report_url: publication.reportUrl,
    metadata: {
      ...reportMetadata,
      owner_user_id: publication.ownerUserId,
      owner_email: publication.ownerEmail,
      ...(publication.brandKey ? { brand_key: publication.brandKey } : {})
    }
  };

  const callbackResult = await sendFinalCallback({
    report: finalReport,
    markdown: options.markdown || "",
    artifacts: sanitizedArtifacts,
    runLog: options.runLog,
    callbackUrl: publication.callbackUrl,
    callbackSecret: publication.callbackSecret,
    extraPayload: {
      owner_user_id: publication.ownerUserId,
      owner_email: publication.ownerEmail,
      report_url: publication.reportUrl,
      status_url: publication.statusUrl,
      ui_report_url: publication.uiReportUrl,
      run_request: normalizedRunRequest,
      ...(portableEvidenceMedia ? { evidence_media: portableEvidenceMedia } : {}),
      ...(isPlainObject(options.extraPayload) ? options.extraPayload : {})
    }
  });

  if (!callbackResult.ok) {
    return {
      ok: false,
      error:
        sanitizeString(callbackResult.error, 400) ||
        "Failed to publish local QA run through callback.",
      status: callbackResult.status || 0,
      attempts: callbackResult.attempts || 0
    };
  }

  return {
    ok: true,
    skipped: false,
    callback_id: callbackResult.data?.id || null,
    report_url: publication.reportUrl,
    status_url: publication.statusUrl,
    ui_report_url: publication.uiReportUrl
  };
}

module.exports = {
  prepareLocalPublication,
  publishLocalRun,
  __private: {
    attachStepVideoClipsToReport,
    buildPortableEvidenceMedia,
    buildEmbeddedEvidenceMedia,
    buildLocalReportUrls,
    createStepVideoClip,
    extractBrandKey,
    extractOwnerMetadata,
    normalizeEvidenceSource,
    pickPrimaryLocalVideoPath,
    probeVideoDurationSeconds,
    resolvePublicBaseUrl
  }
};
