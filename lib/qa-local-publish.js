const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const {
  normalizeUrl,
  sanitizeOptionalString,
  sanitizeString,
  sendFinalCallback
} = require("./qa-core");
const {
  deleteStoredEvidenceObjects,
  resolveEvidenceStorageConfig,
  uploadLocalFileToEvidenceStorage
} = require("./qa-evidence-storage");

const DEFAULT_PUBLIC_BASE_URL = "https://swarmtester.com";
const LOCAL_IMAGE_PATH_PATTERN = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/i;
const LOCAL_VIDEO_PATH_PATTERN = /\.(mp4|webm|ogg|mov|m4v|m3u8)$/i;
const MAX_STEP_CLIPS_PER_JOURNEY = 24;
const MIN_STEP_CLIP_DURATION_MS = 1800;
const STEP_CLIP_OUTPUT_DIR = "step-clips";
const DEFAULT_EVIDENCE_STORAGE_MAX_VIDEO_BYTES = 5 * 1024 * 1024 * 1024;
const DEFAULT_EVIDENCE_STORAGE_VIDEO_SEGMENT_BYTES = 40 * 1024 * 1024;
const DEFAULT_EVIDENCE_STORAGE_MAX_VIDEO_SEGMENTS = 64;
const execFileAsync = promisify(execFile);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeEvidenceSource(value) {
  return sanitizeString(value, 4096).replaceAll("\\", "/");
}

function uniqueNormalizedEvidenceValues(values = []) {
  const normalized = [];
  const seen = new Set();
  for (const value of values) {
    const safeValue = normalizeEvidenceSource(value);
    if (!safeValue || seen.has(safeValue)) {
      continue;
    }
    seen.add(safeValue);
    normalized.push(safeValue);
  }
  return normalized;
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

function resolveVideoSegmentByteLimit(options = {}) {
  const requested = Number(
    options.videoSegmentBytes ||
      options.maxVideoSegmentBytes ||
      process.env.QA_EVIDENCE_STORAGE_VIDEO_SEGMENT_BYTES
  );
  return Number.isFinite(requested) && requested > 0
    ? Math.max(6 * 1024 * 1024, Math.floor(requested))
    : DEFAULT_EVIDENCE_STORAGE_VIDEO_SEGMENT_BYTES;
}

function resolveMaxVideoSegments(options = {}) {
  const requested = Number(
    options.maxVideoSegments || process.env.QA_EVIDENCE_STORAGE_MAX_VIDEO_SEGMENTS
  );
  return Number.isFinite(requested) && requested > 0
    ? Math.max(2, Math.min(256, Math.floor(requested)))
    : DEFAULT_EVIDENCE_STORAGE_MAX_VIDEO_SEGMENTS;
}

async function segmentVideoForEvidenceStorage(filePath, options = {}) {
  const safePath = sanitizeOptionalString(filePath, 4096) || "";
  const stat = fs.statSync(safePath);
  const targetBytes = resolveVideoSegmentByteLimit(options);
  if (!stat?.isFile() || stat.size <= targetBytes) {
    return {
      segmented: false,
      parts: [{ path: safePath, byte_length: stat?.size || 0 }],
      cleanup: () => {}
    };
  }

  const durationSeconds = await probeVideoDurationSeconds(safePath, options);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("Oversized evidence video could not be measured for safe segmentation");
  }

  const ffmpegPath =
    sanitizeOptionalString(options.ffmpegPath, 512) || process.env.FFMPEG_PATH || "ffmpeg";
  const maxSegments = resolveMaxVideoSegments(options);
  const extension = path.extname(safePath).toLowerCase() || ".webm";
  const fileStem = sanitizeFilenameSegment(path.basename(safePath, extension), "recording");
  let segmentSeconds = Math.max(
    15,
    Math.min(600, Math.floor((durationSeconds * targetBytes * 0.72) / stat.size))
  );
  let segmentDir = "";

  const cleanup = () => {
    if (!segmentDir) {
      return;
    }
    fs.rmSync(segmentDir, { recursive: true, force: true, maxRetries: 2 });
    segmentDir = "";
  };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    cleanup();
    segmentDir = fs.mkdtempSync(path.join(os.tmpdir(), "qabro-video-segments-"));
    const outputPattern = path.join(segmentDir, `${fileStem}-part-%03d${extension}`);
    await execFileAsync(
      ffmpegPath,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        safePath,
        "-map",
        "0:v:0?",
        "-map",
        "0:a?",
        "-c",
        "copy",
        "-f",
        "segment",
        "-segment_time",
        String(segmentSeconds),
        "-reset_timestamps",
        "1",
        outputPattern
      ],
      {
        maxBuffer: 4 * 1024 * 1024
      }
    );

    const parts = fs
      .readdirSync(segmentDir)
      .filter((name) => name.endsWith(extension))
      .sort()
      .map((name) => {
        const partPath = path.join(segmentDir, name);
        return {
          path: partPath,
          byte_length: fs.statSync(partPath).size
        };
      })
      .filter((part) => part.byte_length > 0);

    if (!parts.length) {
      cleanup();
      throw new Error("Oversized evidence video did not produce playable storage parts");
    }
    if (parts.length > maxSegments) {
      cleanup();
      throw new Error(`Evidence video requires more than ${maxSegments} storage parts`);
    }
    if (parts.every((part) => part.byte_length <= targetBytes)) {
      return {
        segmented: true,
        parts,
        cleanup
      };
    }

    segmentSeconds = Math.max(5, Math.floor(segmentSeconds / 2));
  }

  cleanup();
  throw new Error(`Evidence video could not be split below ${targetBytes} bytes per part`);
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

    const allFindings = Array.isArray(safeReport.findings) ? safeReport.findings.filter(isPlainObject) : [];
    const relatedFindings = getRelatedFindingsForJourney(safeReport, journey);
    const candidateFindings = relatedFindings.length
      ? relatedFindings
      : updatedJourneys.length === 1
        ? allFindings
        : [];
    const journeyIdSegment = sanitizeFilenameSegment(journey.id || journey.name || `journey-${journeyIndex + 1}`);
    const clips = [];
    for (const finding of candidateFindings) {
      if (clips.length >= MAX_STEP_CLIPS_PER_JOURNEY) {
        break;
      }
      const stepTimelineMap = buildStepTimelineMapForJourney(
        safeReport,
        journey,
        finding,
        timelineDurationMs
      );
      const stepKeys = [...stepTimelineMap.keys()]
        .filter((value) => Number.isInteger(value) && value > 0)
        .sort((left, right) => left - right)
        .slice(0, Math.max(0, MAX_STEP_CLIPS_PER_JOURNEY - clips.length));
      const findingId = sanitizeString(finding?.id, 128) || `finding-${clips.length + 1}`;
      const findingIdSegment = sanitizeFilenameSegment(findingId, `finding-${clips.length + 1}`);

      for (const stepNumber of stepKeys) {
        const stepMeta = stepTimelineMap.get(stepNumber);
        if (!stepMeta) {
          continue;
        }
        const clipStartMs = Math.max(0, Math.round(Number(stepMeta.clipStartMs) || 0));
        const clipEndMs = Math.max(clipStartMs + MIN_STEP_CLIP_DURATION_MS, Math.round(Number(stepMeta.clipEndMs) || 0));
        const outputPath = path.join(
          stepClipOutputDir,
          `${runIdSegment}-${journeyIdSegment}-${findingIdSegment}-step-${String(stepNumber).padStart(2, "0")}.mp4`
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
          content_type: "video/mp4",
          finding_id: findingId,
          finding_title: sanitizeString(finding?.title, 240) || null,
          finding_type: sanitizeString(finding?.type, 64) || null,
          level: sanitizeString(stepMeta.level, 32).trim().toLowerCase() || "good"
        });
      }
      if (!stepKeys.length) {
        continue;
      }
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
  pushCandidate(safeArtifacts.blocker_clip_path);
  pushCandidate(safeArtifacts.video);

  return candidates.filter((candidate) => isLikelyLocalVideoPath(candidate));
}

function collectPortableEvidenceAliases(artifacts, candidate, kind) {
  const safeArtifacts = isPlainObject(artifacts) ? artifacts : {};
  const safeCandidate = normalizeEvidenceSource(candidate);
  if (!safeCandidate || kind !== "videos") {
    return [];
  }

  const aliases = [];
  if (normalizeEvidenceSource(safeArtifacts.local_video_path) === safeCandidate) {
    aliases.push(safeArtifacts.local_video_url);
  }
  if (normalizeEvidenceSource(safeArtifacts.blocker_clip_path) === safeCandidate) {
    aliases.push(safeArtifacts.blocker_clip_url);
  }

  return uniqueNormalizedEvidenceValues(aliases.filter(Boolean)).filter((value) => value !== safeCandidate);
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
    Number(options.maxScreenshotBytes || options.maxBytes || process.env.QA_EMBEDDED_EVIDENCE_MAX_BYTES) ||
      1024 * 1024
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
      DEFAULT_EVIDENCE_STORAGE_MAX_VIDEO_BYTES
  );
  const runId = sanitizeString(options.runId, 128);
  const uploadErrors = [];

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
    } catch (error) {
      uploadErrors.push({
        kind: "screenshot",
        source: candidate,
        error: sanitizeString(error?.message || error, 1000) || "Screenshot upload failed"
      });
      continue;
    }
  }

  const uploadLocalFile =
    typeof options.uploadLocalFile === "function"
      ? options.uploadLocalFile
      : uploadLocalFileToEvidenceStorage;
  const deleteStoredObjects =
    typeof options.deleteStoredObjects === "function"
      ? options.deleteStoredObjects
      : deleteStoredEvidenceObjects;
  const segmentVideo =
    typeof options.segmentVideo === "function"
      ? options.segmentVideo
      : segmentVideoForEvidenceStorage;
  const videoSegmentBytes = resolveVideoSegmentByteLimit(options);
  const videos = [];
  for (const candidate of videoCandidates.slice(0, maxVideos)) {
    let stat = null;
    try {
      stat = fs.statSync(candidate);
    } catch {
      stat = null;
    }
    if (!stat?.isFile() || stat.size <= 0) {
      continue;
    }
    if (stat.size > maxVideoUploadBytes) {
      uploadErrors.push({
        kind: "video",
        source: candidate,
        error: `Video is ${stat.size} bytes, above the configured ${maxVideoUploadBytes} byte evidence limit.`
      });
      continue;
    }

    let segmentedVideo = null;
    const stagedUploads = [];
    try {
      segmentedVideo =
        stat.size > videoSegmentBytes
          ? await segmentVideo(candidate, {
              ...options,
              videoSegmentBytes
            })
          : {
              segmented: false,
              parts: [{ path: candidate, byte_length: stat.size }],
              cleanup: () => {}
            };
      const parts = Array.isArray(segmentedVideo?.parts) ? segmentedVideo.parts : [];
      if (!parts.length) {
        throw new Error("Evidence video segmentation returned no playable parts");
      }

      const originalAliases = collectPortableEvidenceAliases(artifacts, candidate, "videos");
      for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
        const part = parts[partIndex];
        const partPath = normalizeEvidenceSource(part?.path);
        const contentType = getMediaContentType(partPath);
        if (!partPath || !contentType) {
          throw new Error(`Evidence video part ${partIndex + 1} is not playable media`);
        }

        const uploaded = await uploadLocalFile(partPath, {
          ...storageConfig,
          runId,
          kind: "videos",
          contentType
        });
        if (!uploaded) {
          throw new Error(`Evidence video part ${partIndex + 1} was not stored`);
        }

        const isSegmented = parts.length > 1;
        const source = isSegmented && partIndex > 0 ? partPath : candidate;
        const aliases =
          partIndex === 0
            ? uniqueNormalizedEvidenceValues([
                ...originalAliases,
                ...(partPath !== candidate ? [partPath] : [])
              ])
            : [];
        stagedUploads.push({
          source,
          content_type: contentType,
          ...(aliases.length ? { aliases } : {}),
          ...(isSegmented
            ? {
                segment_index: partIndex,
                segment_count: parts.length,
                segment_label: `Part ${partIndex + 1} of ${parts.length}`
              }
            : {}),
          storage_bucket: uploaded.storage_bucket,
          storage_path: uploaded.storage_path,
          byte_length: uploaded.byte_length
        });
      }

      videos.push(...stagedUploads);
    } catch (error) {
      if (stagedUploads.length) {
        await deleteStoredObjects(stagedUploads, storageConfig).catch(() => false);
      }
      uploadErrors.push({
        kind: "video",
        source: candidate,
        error: sanitizeString(error?.message || error, 1000) || "Video upload failed"
      });
    } finally {
      if (typeof segmentedVideo?.cleanup === "function") {
        segmentedVideo.cleanup();
      }
    }
  }

  if (!screenshots.length && !videos.length) {
    const embedded = buildEmbeddedEvidenceMedia(report, artifacts, options);
    if (!uploadErrors.length) {
      return embedded;
    }
    return {
      ...(embedded || {}),
      upload_errors: uploadErrors
    };
  }

  return {
    ...(screenshots.length ? { screenshots } : {}),
    ...(videos.length ? { videos } : {}),
    ...(uploadErrors.length ? { upload_errors: uploadErrors } : {})
  };
}

function collectStorageBackedEvidenceSources(evidenceMedia) {
  const safeEvidenceMedia = isPlainObject(evidenceMedia) ? evidenceMedia : {};
  const sources = new Set();

  const pushEntry = (entry) => {
    if (!isPlainObject(entry)) {
      return;
    }
    if (!sanitizeString(entry.storage_bucket || entry.storageBucket, 128) || !sanitizeString(entry.storage_path || entry.storagePath, 4096)) {
      return;
    }
    uniqueNormalizedEvidenceValues([
      entry.source,
      entry.path,
      entry.raw,
      ...(Array.isArray(entry.aliases) ? entry.aliases : [])
    ]).forEach((value) => sources.add(value));
  };

  for (const field of ["screenshots", "videos"]) {
    const entries = Array.isArray(safeEvidenceMedia[field]) ? safeEvidenceMedia[field] : [];
    entries.forEach(pushEntry);
  }

  return sources;
}

function collectPortableEvidenceSources(evidenceMedia) {
  const safeEvidenceMedia = isPlainObject(evidenceMedia) ? evidenceMedia : {};
  const sources = new Set();

  const pushEntry = (entry) => {
    if (!isPlainObject(entry)) {
      return;
    }
    const hasStoredObject =
      Boolean(sanitizeString(entry.storage_bucket || entry.storageBucket, 128)) &&
      Boolean(sanitizeString(entry.storage_path || entry.storagePath, 4096));
    const hasEmbeddedData = /^data:(?:image|video)\//i.test(
      sanitizeString(entry.data_url || entry.dataUrl || entry.value, 8000000)
    );
    if (!hasStoredObject && !hasEmbeddedData) {
      return;
    }
    uniqueNormalizedEvidenceValues([
      entry.source,
      entry.path,
      entry.raw,
      ...(Array.isArray(entry.aliases) ? entry.aliases : [])
    ]).forEach((value) => sources.add(value));
  };

  for (const field of ["screenshots", "videos"]) {
    const entries = Array.isArray(safeEvidenceMedia[field]) ? safeEvidenceMedia[field] : [];
    entries.forEach(pushEntry);
  }

  return sources;
}

function assessPortableEvidenceCoverage(report, artifacts, evidenceMedia) {
  const safeEvidenceMedia = isPlainObject(evidenceMedia) ? evidenceMedia : {};
  const screenshotSources = collectLocalScreenshotCandidates(report, artifacts);
  const videoSources = collectLocalVideoCandidates(report, artifacts);
  const requiredSources = uniqueNormalizedEvidenceValues([...screenshotSources, ...videoSources]);
  const portableSources = collectPortableEvidenceSources(evidenceMedia);
  const missingSources = requiredSources.filter((source) => !portableSources.has(source));
  const missingScreenshotSources = screenshotSources.filter((source) => !portableSources.has(source));
  const missingVideoSources = videoSources.filter((source) => !portableSources.has(source));

  return {
    ok: missingSources.length === 0,
    required_count: requiredSources.length,
    portable_count: requiredSources.length - missingSources.length,
    required_screenshot_count: screenshotSources.length,
    required_video_count: videoSources.length,
    missing_sources: missingSources,
    missing_screenshot_sources: missingScreenshotSources,
    missing_video_sources: missingVideoSources,
    upload_errors: Array.isArray(safeEvidenceMedia.upload_errors)
      ? safeEvidenceMedia.upload_errors.slice(0, 20)
      : []
  };
}

function buildPublishedArtifacts(artifacts, options = {}) {
  const safeArtifacts = isPlainObject(artifacts) ? { ...artifacts } : {};
  const storageBackedSources = collectStorageBackedEvidenceSources(options.evidenceMedia);

  safeArtifacts.local_run_dir = null;
  safeArtifacts.local_matrix_dir = null;
  safeArtifacts.local_run_json = null;
  safeArtifacts.local_trace_path = null;
  safeArtifacts.local_qa_report_json = null;
  safeArtifacts.local_qa_report_markdown = null;

  if (
    sanitizeString(safeArtifacts.local_video_path, 4096) &&
    storageBackedSources.has(normalizeEvidenceSource(safeArtifacts.local_video_path))
  ) {
    safeArtifacts.local_video_url = null;
  }
  if (
    sanitizeString(safeArtifacts.blocker_clip_path, 4096) &&
    storageBackedSources.has(normalizeEvidenceSource(safeArtifacts.blocker_clip_path))
  ) {
    safeArtifacts.blocker_clip_url = null;
  }

  return safeArtifacts;
}

function collectCleanupTargets(artifacts) {
  const safeArtifacts = isPlainObject(artifacts) ? artifacts : {};
  const directories = uniqueNormalizedEvidenceValues([
    safeArtifacts.local_run_dir,
    safeArtifacts.local_matrix_dir
  ]);
  const files = uniqueNormalizedEvidenceValues([
    safeArtifacts.local_run_json,
    safeArtifacts.local_trace_path,
    safeArtifacts.local_video_path,
    safeArtifacts.blocker_clip_path,
    safeArtifacts.local_qa_report_json,
    safeArtifacts.local_qa_report_markdown,
    ...(Array.isArray(safeArtifacts.local_screenshots) ? safeArtifacts.local_screenshots : [])
  ]);

  return { directories, files };
}

function cleanupPublishedLocalArtifacts(report, artifacts, evidenceMedia, options = {}) {
  const cleanupEnabled = options.cleanup !== false && sanitizeString(process.env.QA_DELETE_LOCAL_ARTIFACTS_AFTER_UPLOAD, 16) !== "0";
  if (!cleanupEnabled) {
    return { ok: true, skipped: true, reason: "cleanup_disabled" };
  }

  const requiredEvidenceSources = uniqueNormalizedEvidenceValues([
    ...collectLocalScreenshotCandidates(report, artifacts),
    ...collectLocalVideoCandidates(report, artifacts)
  ]);
  const storageBackedSources = collectStorageBackedEvidenceSources(evidenceMedia);
  const missingSources = requiredEvidenceSources.filter((value) => !storageBackedSources.has(value));

  if (missingSources.length) {
    return {
      ok: true,
      skipped: true,
      reason: "storage_incomplete",
      missing_sources: missingSources
    };
  }

  const cleanupTargets = collectCleanupTargets(artifacts);
  const removedPaths = [];
  const failedPaths = [];

  const deleteTarget = (targetPath, recursive) => {
    const safePath = normalizeEvidenceSource(targetPath);
    if (!safePath) {
      return;
    }

    try {
      fs.rmSync(safePath, {
        recursive: recursive === true,
        force: true,
        maxRetries: 2
      });
      removedPaths.push(safePath);
    } catch (error) {
      failedPaths.push({
        path: safePath,
        message: sanitizeString(error?.message, 400) || "cleanup_failed"
      });
    }
  };

  cleanupTargets.directories
    .slice()
    .sort((left, right) => right.length - left.length)
    .forEach((value) => deleteTarget(value, true));
  cleanupTargets.files
    .filter((value) => !cleanupTargets.directories.some((dir) => value === dir || value.startsWith(`${dir}/`)))
    .forEach((value) => deleteTarget(value, false));

  return {
    ok: failedPaths.length === 0,
    skipped: false,
    removed_paths: removedPaths,
    failed_paths: failedPaths
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
  const portableEvidenceCoverage = assessPortableEvidenceCoverage(
    reportWithStepClips,
    sanitizedArtifacts,
    portableEvidenceMedia
  );
  if (!portableEvidenceCoverage.ok) {
    return {
      ok: false,
      error: `Evidence delivery incomplete: ${portableEvidenceCoverage.missing_sources.length} captured file(s) were not stored for report playback.`,
      status: 503,
      attempts: 0,
      retryable: true,
      evidence_delivery: portableEvidenceCoverage
    };
  }
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
  const publishedArtifacts = buildPublishedArtifacts(sanitizedArtifacts, {
    evidenceMedia: portableEvidenceMedia
  });

  const callbackResult = await sendFinalCallback({
    report: finalReport,
    markdown: options.markdown || "",
    artifacts: publishedArtifacts,
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

  const cleanupResult = cleanupPublishedLocalArtifacts(
    reportWithStepClips,
    sanitizedArtifacts,
    portableEvidenceMedia
  );

  return {
    ok: true,
    skipped: false,
    callback_id: callbackResult.data?.id || null,
    report_url: publication.reportUrl,
    status_url: publication.statusUrl,
    ui_report_url: publication.uiReportUrl,
    cleanup: cleanupResult
  };
}

module.exports = {
  prepareLocalPublication,
  publishLocalRun,
  buildPortableEvidenceMedia,
  buildPublishedArtifacts,
  cleanupPublishedLocalArtifacts,
  assessPortableEvidenceCoverage,
  __private: {
    attachStepVideoClipsToReport,
    buildPortableEvidenceMedia,
    buildPublishedArtifacts,
    buildEmbeddedEvidenceMedia,
    buildLocalReportUrls,
    cleanupPublishedLocalArtifacts,
    assessPortableEvidenceCoverage,
    collectPortableEvidenceSources,
    collectStorageBackedEvidenceSources,
    createStepVideoClip,
    extractBrandKey,
    extractOwnerMetadata,
    normalizeEvidenceSource,
    pickPrimaryLocalVideoPath,
    probeVideoDurationSeconds,
    resolveVideoSegmentByteLimit,
    segmentVideoForEvidenceStorage,
    resolvePublicBaseUrl
  }
};
