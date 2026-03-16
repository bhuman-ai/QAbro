const {
  buildSystemPrompt,
  buildTaskPrompt,
  buildMarkdownReport,
  extractAgentSections,
  getScopeConfig,
  isPlainObject,
  normalizeReport,
  sanitizeString,
  toIsoTimestamp
} = require("./qa-core");
const zlib = require("zlib");

const AGENT_MODE_FALLBACK_ORDER = ["dom", "hybrid", "cua"];
const VISION_ONLY_AGENT_MODE = "vision_only";
const AGENT_MODE_SET = new Set([...AGENT_MODE_FALLBACK_ORDER, VISION_ONLY_AGENT_MODE]);
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_FAL_BASE_URL = "https://fal.run";
const DEFAULT_REPLICATE_BASE_URL = "https://api.replicate.com/v1";
const DEFAULT_QWEN_BASE_URL = "https://dashscope-intl.aliyuncs.com";
const COORDINATE_ANNOTATION_PROVIDER_SET = new Set(["openai", "gemini", "fal", "replicate"]);
const DEFAULT_GEMINI_COORDINATE_ANNOTATION_MODEL = "gemini-2.5-flash-image";
const DEFAULT_FAL_COORDINATE_ANNOTATION_MODEL = "fal-ai/nano-banana-2/edit";
const DEFAULT_REPLICATE_COORDINATE_ANNOTATION_MODEL = "google/nano-banana-2";
const DEFAULT_COORDINATE_ANNOTATION_MODEL = "dall-e-2";
const DEFAULT_QWEN_OCR_MODEL = "qwen-vl-ocr";
const DEFAULT_QWEN_OCR_TASK = "advanced_recognition";
const DEFAULT_COORDINATE_ANNOTATION_TIMEOUT_MS = 30000;
const DEFAULT_CLICK_SCREENSHOT_DELAY_MS = 500;
const DEFAULT_COORDINATE_CLICK_FALLBACK_MODE = "on_error";
const COORDINATE_CLICK_FALLBACK_MODE_SET = new Set(["on_error", "always"]);
const COORDINATE_LOCALIZATION_STRATEGY_SET = new Set(["ocr_qwen", "yellow_box_diff"]);
const DEFAULT_COORDINATE_LOCALIZATION_ORDER = ["ocr_qwen", "yellow_box_diff"];
const DEFAULT_VISION_MODEL = "gpt-4.1-mini";
const DEFAULT_COORDINATE_OCR_JUDGE_MODEL = DEFAULT_VISION_MODEL;
const DEFAULT_VISION_STEP_TIMEOUT_MS = 35000;
const DEFAULT_VISION_ACTION_DELAY_MS = 900;
const DEFAULT_VISION_HISTORY_ITEMS = 8;
const OCR_DESCRIPTION_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "bottom",
  "button",
  "center",
  "click",
  "control",
  "field",
  "for",
  "form",
  "hero",
  "in",
  "input",
  "left",
  "link",
  "main",
  "modal",
  "of",
  "on",
  "or",
  "page",
  "right",
  "section",
  "the",
  "to",
  "top",
  "with"
]);
const OCR_GENERIC_MATCH_TOKENS = new Set([
  "button",
  "click",
  "control",
  "field",
  "form",
  "input",
  "left",
  "login",
  "modal",
  "page",
  "right",
  "section",
  "top"
]);

function parseBooleanSetting(rawValue, fallbackValue) {
  if (typeof rawValue === "boolean") {
    return rawValue;
  }

  if (typeof rawValue === "number") {
    return rawValue !== 0;
  }

  if (typeof rawValue !== "string") {
    return fallbackValue;
  }

  const normalized = rawValue.trim().toLowerCase();
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

function truncateText(value, maxLength = 240) {
  if (typeof value !== "string") {
    return "";
  }
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function resolveOpenAiBaseUrl(rawUrl) {
  const sanitized = sanitizeString(rawUrl, 2048);
  if (!sanitized) {
    return DEFAULT_OPENAI_BASE_URL;
  }
  return sanitized.replace(/\/+$/, "");
}

function resolveGeminiBaseUrl(rawUrl) {
  const sanitized = sanitizeString(rawUrl, 2048);
  if (!sanitized) {
    return DEFAULT_GEMINI_BASE_URL;
  }
  return sanitized.replace(/\/+$/, "");
}

function resolveFalBaseUrl(rawUrl) {
  const sanitized = sanitizeString(rawUrl, 2048);
  if (!sanitized) {
    return DEFAULT_FAL_BASE_URL;
  }
  return sanitized.replace(/\/+$/, "");
}

function resolveReplicateBaseUrl(rawUrl) {
  const sanitized = sanitizeString(rawUrl, 2048);
  if (!sanitized) {
    return DEFAULT_REPLICATE_BASE_URL;
  }
  return sanitized.replace(/\/+$/, "");
}

function resolveQwenBaseUrl(rawUrl) {
  const sanitized = sanitizeString(rawUrl, 2048);
  if (!sanitized) {
    return DEFAULT_QWEN_BASE_URL;
  }
  return sanitized.replace(/\/+$/, "");
}

function resolveCoordinateAnnotationProvider(rawValue, fallbackValue) {
  const normalized = sanitizeString(rawValue, 64).toLowerCase();
  if (COORDINATE_ANNOTATION_PROVIDER_SET.has(normalized)) {
    return normalized;
  }
  return fallbackValue;
}

function normalizeLocalizationStrategy(rawValue) {
  const normalized = sanitizeString(rawValue, 64).toLowerCase();
  if (!normalized) {
    return "";
  }
  if (["qwen", "ocr", "ocr_qwen", "qwen_ocr", "qwen-ocr"].includes(normalized)) {
    return "ocr_qwen";
  }
  if (
    [
      "yellow",
      "yellow_box",
      "yellow_box_diff",
      "annotation",
      "image_edit",
      "nano",
      "nano_banana",
      "nano-banana"
    ].includes(normalized)
  ) {
    return "yellow_box_diff";
  }
  return normalized;
}

function resolveCoordinateLocalizationOrder(rawOrder, options = {}) {
  const includeQwen = options.includeQwen !== false;
  const includeYellow = options.includeYellow !== false;

  const tokens = [];
  if (Array.isArray(rawOrder)) {
    for (const entry of rawOrder) {
      if (typeof entry === "string" && entry.trim()) {
        tokens.push(entry);
      }
    }
  } else if (typeof rawOrder === "string") {
    for (const entry of rawOrder.split(/[,\s|>]+/)) {
      if (entry && entry.trim()) {
        tokens.push(entry);
      }
    }
  }

  const normalized = [];
  for (const token of tokens) {
    const strategy = normalizeLocalizationStrategy(token);
    if (!COORDINATE_LOCALIZATION_STRATEGY_SET.has(strategy)) {
      continue;
    }
    if (!normalized.includes(strategy)) {
      normalized.push(strategy);
    }
  }

  if (!normalized.length) {
    normalized.push(...DEFAULT_COORDINATE_LOCALIZATION_ORDER);
  }

  return normalized.filter((strategy) => {
    if (strategy === "ocr_qwen") {
      return includeQwen;
    }
    if (strategy === "yellow_box_diff") {
      return includeYellow;
    }
    return false;
  });
}

function resolveModelProvider(modelName) {
  const normalized = sanitizeString(modelName, 256).toLowerCase();
  if (!normalized || !normalized.includes("/")) {
    return "openai";
  }
  return normalized.split("/", 1)[0] || "openai";
}

function inferAgentExecutionSuccess(agentResult) {
  if (!isPlainObject(agentResult)) {
    return true;
  }

  if (typeof agentResult.success !== "boolean") {
    return true;
  }

  return agentResult.success;
}

function extractAgentErrorMessage(agentResult) {
  if (!isPlainObject(agentResult)) {
    return "";
  }

  const candidates = [agentResult.message, agentResult.error];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "";
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);

  if (pa <= pb && pa <= pc) {
    return a;
  }
  if (pb <= pc) {
    return b;
  }
  return c;
}

function decodePngToRgba(pngBuffer) {
  const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!Buffer.isBuffer(pngBuffer) || pngBuffer.length < PNG_SIGNATURE.length + 12) {
    throw new Error("PNG buffer is empty or too small");
  }
  if (!pngBuffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error("Image is not a PNG buffer");
  }

  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlaceMethod = 0;
  const idatChunks = [];

  while (offset + 8 <= pngBuffer.length) {
    const chunkLength = pngBuffer.readUInt32BE(offset);
    offset += 4;
    const chunkType = pngBuffer.toString("ascii", offset, offset + 4);
    offset += 4;

    if (offset + chunkLength + 4 > pngBuffer.length) {
      throw new Error("PNG chunk length exceeds buffer bounds");
    }

    const chunkData = pngBuffer.subarray(offset, offset + chunkLength);
    offset += chunkLength;

    // Skip CRC validation and move past CRC bytes.
    offset += 4;

    if (chunkType === "IHDR") {
      width = chunkData.readUInt32BE(0);
      height = chunkData.readUInt32BE(4);
      bitDepth = chunkData[8];
      colorType = chunkData[9];
      interlaceMethod = chunkData[12];
    } else if (chunkType === "IDAT") {
      idatChunks.push(chunkData);
    } else if (chunkType === "IEND") {
      break;
    }
  }

  if (width <= 0 || height <= 0) {
    throw new Error("PNG is missing a valid IHDR chunk");
  }
  if (bitDepth !== 8) {
    throw new Error(`Unsupported PNG bit depth: ${bitDepth}`);
  }
  if (interlaceMethod !== 0) {
    throw new Error("Interlaced PNG images are not supported");
  }
  if (idatChunks.length === 0) {
    throw new Error("PNG is missing image data (IDAT)");
  }

  const channels =
    colorType === 6
      ? 4
      : colorType === 2
        ? 3
        : colorType === 0
          ? 1
          : 0;
  if (!channels) {
    throw new Error(`Unsupported PNG color type: ${colorType}`);
  }

  const compressedData = Buffer.concat(idatChunks);
  let inflatedData = null;
  try {
    inflatedData = zlib.inflateSync(compressedData);
  } catch (error) {
    throw new Error(`Failed to inflate PNG image data: ${error.message || "Unknown zlib error"}`);
  }

  const bytesPerPixel = channels;
  const scanlineByteLength = width * bytesPerPixel;
  const expectedInflatedSize = height * (scanlineByteLength + 1);
  if (inflatedData.length < expectedInflatedSize) {
    throw new Error("PNG image data is truncated");
  }

  const unfiltered = Buffer.alloc(height * scanlineByteLength);
  let sourceOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filterType = inflatedData[sourceOffset];
    sourceOffset += 1;
    const rowOffset = y * scanlineByteLength;
    const prevRowOffset = (y - 1) * scanlineByteLength;

    for (let x = 0; x < scanlineByteLength; x += 1) {
      const raw = inflatedData[sourceOffset + x];
      const left = x >= bytesPerPixel ? unfiltered[rowOffset + x - bytesPerPixel] : 0;
      const up = y > 0 ? unfiltered[prevRowOffset + x] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? unfiltered[prevRowOffset + x - bytesPerPixel] : 0;

      let value = raw;
      if (filterType === 1) {
        value = (raw + left) & 0xff;
      } else if (filterType === 2) {
        value = (raw + up) & 0xff;
      } else if (filterType === 3) {
        value = (raw + Math.floor((left + up) / 2)) & 0xff;
      } else if (filterType === 4) {
        value = (raw + paethPredictor(left, up, upLeft)) & 0xff;
      } else if (filterType !== 0) {
        throw new Error(`Unsupported PNG filter type: ${filterType}`);
      }

      unfiltered[rowOffset + x] = value;
    }

    sourceOffset += scanlineByteLength;
  }

  const rgba = Buffer.alloc(width * height * 4);
  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
    const sourcePixelOffset = pixelIndex * channels;
    const targetPixelOffset = pixelIndex * 4;

    if (channels === 4) {
      rgba[targetPixelOffset] = unfiltered[sourcePixelOffset];
      rgba[targetPixelOffset + 1] = unfiltered[sourcePixelOffset + 1];
      rgba[targetPixelOffset + 2] = unfiltered[sourcePixelOffset + 2];
      rgba[targetPixelOffset + 3] = unfiltered[sourcePixelOffset + 3];
    } else if (channels === 3) {
      rgba[targetPixelOffset] = unfiltered[sourcePixelOffset];
      rgba[targetPixelOffset + 1] = unfiltered[sourcePixelOffset + 1];
      rgba[targetPixelOffset + 2] = unfiltered[sourcePixelOffset + 2];
      rgba[targetPixelOffset + 3] = 255;
    } else {
      const gray = unfiltered[sourcePixelOffset];
      rgba[targetPixelOffset] = gray;
      rgba[targetPixelOffset + 1] = gray;
      rgba[targetPixelOffset + 2] = gray;
      rgba[targetPixelOffset + 3] = 255;
    }
  }

  return {
    width,
    height,
    data: rgba
  };
}

function resolvePngDimensionsFast(pngBuffer) {
  const fallback = { width: 1280, height: 720 };
  if (!Buffer.isBuffer(pngBuffer) || pngBuffer.length < 24) {
    return fallback;
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!pngBuffer.subarray(0, signature.length).equals(signature)) {
    return fallback;
  }

  try {
    // First chunk should be IHDR in valid PNG files.
    const chunkType = pngBuffer.toString("ascii", 12, 16);
    if (chunkType !== "IHDR") {
      return fallback;
    }
    const width = pngBuffer.readUInt32BE(16);
    const height = pngBuffer.readUInt32BE(20);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return fallback;
    }
    return {
      width: Math.floor(width),
      height: Math.floor(height)
    };
  } catch {
    return fallback;
  }
}

async function sleep(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveStagehandModule() {
  try {
    // Dynamic require keeps local tests runnable without installed dependencies.
    return require("@browserbasehq/stagehand");
  } catch (error) {
    return { error };
  }
}

function buildStructuredOutputSchema() {
  try {
    const { z } = require("zod");

    const findingTypeEnum = z.enum([
      "bug",
      "frustration_point",
      "confusion_point",
      "aha_moment",
      "dead_end",
      "performance_issue",
      "accessibility_issue",
      "copy_issue"
    ]);
    const severityEnum = z.enum(["low", "medium", "high", "critical"]);
    const emotionEnum = z.enum([
      "confidence",
      "uncertainty",
      "frustration",
      "delight",
      "confusion",
      "trust",
      "distrust"
    ]);

    return z
      .object({
        status: z.enum(["completed", "partial", "failed"]).optional(),
        summary: z
          .object({
            note: z.string().optional(),
            coverage: z
              .object({
                pages_visited: z.number().int().nonnegative().optional(),
                flows_tested: z.number().int().nonnegative().optional(),
                flows_blocked: z.number().int().nonnegative().optional(),
                untested_areas: z.array(z.string()).optional()
              })
              .partial()
              .optional()
          })
          .partial()
          .optional(),
        tested_journeys: z
          .array(
            z.object({
              id: z.string().optional(),
              name: z.string().optional(),
              status: z.enum(["completed", "partial", "blocked"]).optional(),
              summary: z.string().optional(),
              steps: z.array(z.string()).optional(),
              pages: z.array(z.string()).optional(),
              evidence: z
                .object({
                  screenshots: z.array(z.string()).optional(),
                  videos: z.array(z.string()).optional(),
                  console_logs: z.array(z.string()).optional(),
                  network_logs: z.array(z.string()).optional()
                })
                .partial()
                .optional(),
              observations: z.array(z.string()).optional()
            })
          )
          .optional(),
        evidence_gallery: z
          .object({
            screenshots: z.array(z.string()).optional(),
            videos: z.array(z.string()).optional(),
            session_url: z.string().optional(),
            debug_url: z.string().optional(),
            console_logs: z.array(z.string()).optional(),
            network_logs: z.array(z.string()).optional()
          })
          .partial()
          .optional(),
        recommendations: z.array(z.string()).optional(),
        findings: z
          .array(
            z
              .object({
                id: z.string(),
                type: findingTypeEnum,
                severity: severityEnum.optional(),
                title: z.string().optional(),
                expected_behavior: z.string(),
                observed_behavior: z.string(),
                emotional_reaction: z.object({
                  primary: emotionEnum,
                  intensity: z.number().min(1).max(5).optional(),
                  signals: z.array(z.string()).optional()
                }),
                repro_steps: z.array(z.string()).optional(),
                page: z
                  .object({
                    name: z.string().optional(),
                    url: z.string().optional(),
                    route: z.string().optional()
                  })
                  .partial()
                  .optional(),
                element: z
                  .object({
                    selector: z.string().optional(),
                    text: z.string().optional(),
                    role: z.string().optional()
                  })
                  .partial()
                  .optional(),
                evidence: z.object({
                  screenshots: z.array(z.string()).min(1),
                  videos: z.array(z.string()).optional(),
                  console_logs: z.array(z.string()).optional(),
                  network_logs: z.array(z.string()).optional()
                }),
                fix_hint: z.string().optional(),
                confidence: z.number().min(0).max(1).optional(),
                tags: z.array(z.string()).optional()
              })
          )
          .default([])
      })
      .passthrough();
  } catch {
    return null;
  }
}

function appendRunLog(runLog, event, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    details
  };
  runLog.push(entry);

  const progressHook = runLog && typeof runLog.__progressHook === "function" ? runLog.__progressHook : null;
  if (!progressHook) {
    return;
  }

  try {
    const maybePromise = progressHook(entry, runLog.slice());
    if (maybePromise && typeof maybePromise.catch === "function") {
      maybePromise.catch(() => {});
    }
  } catch {
    // Ignore progress-hook errors to avoid interrupting the main run.
  }
}

function emitCandidatePreview(candidateHook, candidateReport, context = {}) {
  if (typeof candidateHook !== "function" || !isPlainObject(candidateReport)) {
    return;
  }

  try {
    const maybePromise = candidateHook(candidateReport, context);
    if (maybePromise && typeof maybePromise.catch === "function") {
      maybePromise.catch(() => {});
    }
  } catch {
    // Ignore candidate-hook errors to avoid interrupting the main run.
  }
}

function inferImageMimeType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    return "image/png";
  }

  // JPEG header
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    return "image/jpeg";
  }

  // WebP RIFF....WEBP
  if (
    buffer.length > 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }

  return "image/png";
}

function toDataUrlFromBuffer(value) {
  if (!Buffer.isBuffer(value)) {
    return null;
  }

  const mimeType = inferImageMimeType(value);
  return `data:${mimeType};base64,${value.toString("base64")}`;
}

function extractAgentMessage(result) {
  if (typeof result === "string") {
    return result;
  }

  if (!result) {
    return "";
  }

  const candidates = [result.message, result.text, result.output_text, result.outputText, result.response];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }

  if (typeof result.output === "string" && result.output.trim()) {
    return result.output;
  }

  if (isPlainObject(result.output)) {
    return JSON.stringify(result.output, null, 2);
  }

  if (isPlainObject(result)) {
    return JSON.stringify(result, null, 2);
  }

  return String(result);
}

function hasModelApiKey() {
  return Boolean(
    process.env.OPENAI_API_KEY ||
      process.env.QA_OPENAI_API_KEY ||
      process.env.BROWSERBASE_OPENAI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.QA_COORDINATE_ANNOTATION_GEMINI_API_KEY ||
      process.env.QA_COORDINATE_ANNOTATION_FAL_API_KEY ||
      process.env.FAL_KEY
  );
}

function resolveAgentModel(runRequest) {
  const requested = sanitizeString(runRequest.model || process.env.QA_MODEL, 128);
  if (!requested) {
    return null;
  }

  if (requested.includes("/")) {
    return requested;
  }

  return `openai/${requested}`;
}

function resolveCuaAgentModel(runRequest, options = {}) {
  const requested = sanitizeString(
    options.cuaModel || runRequest.cua_model || process.env.QA_CUA_MODEL || "openai/computer-use-preview",
    128
  );
  if (!requested) {
    return null;
  }

  if (requested.includes("/")) {
    return requested;
  }

  return `openai/${requested}`;
}

function resolveVisionAgentModel(runRequest, options = {}) {
  const requested = sanitizeString(
    options.visionModel || runRequest.vision_model || process.env.QA_VISION_MODEL || DEFAULT_VISION_MODEL,
    128
  );
  if (!requested) {
    return `openai/${DEFAULT_VISION_MODEL}`;
  }

  if (requested.includes("/")) {
    return requested;
  }

  return `openai/${requested}`;
}

function resolveAgentModeFallbackOrder(rawModes) {
  if (!Array.isArray(rawModes)) {
    return AGENT_MODE_FALLBACK_ORDER.slice();
  }

  const aliases = {
    vision: VISION_ONLY_AGENT_MODE,
    "vision-only": VISION_ONLY_AGENT_MODE
  };
  const normalized = [];
  for (const rawMode of rawModes) {
    const parsedMode = sanitizeString(rawMode, 32).toLowerCase();
    const mode = aliases[parsedMode] || parsedMode;
    if (!AGENT_MODE_SET.has(mode) || normalized.includes(mode)) {
      continue;
    }
    normalized.push(mode);
  }

  return normalized.length ? normalized : AGENT_MODE_FALLBACK_ORDER.slice();
}

function resolveOpenAiApiKey(options = {}) {
  return sanitizeString(
    options.openAiApiKey ||
      options.visionApiKey ||
      process.env.QA_VISION_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.QA_OPENAI_API_KEY ||
      process.env.BROWSERBASE_OPENAI_API_KEY,
    512
  );
}

function toOpenAiModelName(modelName, fallback = DEFAULT_VISION_MODEL) {
  const normalized = sanitizeString(modelName, 256);
  if (!normalized) {
    return fallback;
  }
  if (!normalized.includes("/")) {
    return normalized;
  }
  const [provider, ...parts] = normalized.split("/");
  if (provider.toLowerCase() !== "openai") {
    return fallback;
  }
  const model = parts.join("/").trim();
  return model || fallback;
}

function resolveVisionOnlyConfig(runRequest, options = {}) {
  const configuredModel = resolveVisionAgentModel(runRequest, options);
  const model = toOpenAiModelName(configuredModel, DEFAULT_VISION_MODEL);
  const apiKey = resolveOpenAiApiKey(options);
  const baseUrl = resolveOpenAiBaseUrl(
    options.visionBaseUrl ||
      process.env.QA_VISION_BASE_URL ||
      process.env.OPENAI_BASE_URL ||
      DEFAULT_OPENAI_BASE_URL
  );
  const stepTimeoutMs = parsePositiveIntegerSetting(
    options.visionStepTimeoutMs || process.env.QA_VISION_STEP_TIMEOUT_MS,
    DEFAULT_VISION_STEP_TIMEOUT_MS
  );
  const actionDelayMs = parsePositiveIntegerSetting(
    options.visionActionDelayMs || process.env.QA_VISION_ACTION_DELAY_MS,
    DEFAULT_VISION_ACTION_DELAY_MS
  );
  const maxHistoryItems = parsePositiveIntegerSetting(
    options.visionMaxHistoryItems || process.env.QA_VISION_MAX_HISTORY_ITEMS,
    DEFAULT_VISION_HISTORY_ITEMS
  );
  const plannerClient = typeof options.visionPlannerClient === "function" ? options.visionPlannerClient : null;

  return {
    model,
    apiKey,
    baseUrl,
    stepTimeoutMs,
    actionDelayMs,
    maxHistoryItems,
    plannerClient
  };
}

function resolveAgentExcludeTools(rawTools) {
  if (!Array.isArray(rawTools)) {
    return [];
  }

  const normalized = [];
  for (const rawTool of rawTools) {
    const name = sanitizeString(rawTool, 64);
    if (!name || normalized.includes(name)) {
      continue;
    }
    normalized.push(name);
  }
  return normalized;
}

function resolveBrowserbaseSessionCreateParams(options = {}) {
  const suppliedParams = isPlainObject(options.browserbaseSessionCreateParams)
    ? options.browserbaseSessionCreateParams
    : {};
  const suppliedBrowserSettings = isPlainObject(suppliedParams.browserSettings)
    ? suppliedParams.browserSettings
    : {};

  const advancedStealth = parseBooleanSetting(
    options.browserbaseAdvancedStealth ?? process.env.QA_BROWSERBASE_ADVANCED_STEALTH,
    true
  );
  const solveCaptchas = parseBooleanSetting(
    options.browserbaseSolveCaptchas ?? process.env.QA_BROWSERBASE_SOLVE_CAPTCHAS,
    true
  );
  const blockAds = parseBooleanSetting(
    options.browserbaseBlockAds ?? process.env.QA_BROWSERBASE_BLOCK_ADS,
    false
  );
  const timeoutRaw = Number(options.browserbaseSessionTimeoutMs || process.env.QA_BROWSERBASE_SESSION_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? Math.floor(timeoutRaw) : null;
  const region = sanitizeString(
    options.browserbaseRegion || process.env.QA_BROWSERBASE_REGION,
    64
  );
  const useProxies = parseBooleanSetting(
    options.browserbaseUseProxies ?? process.env.QA_BROWSERBASE_USE_PROXIES,
    true
  );
  const proxyCountry = sanitizeString(
    options.browserbaseProxyCountry || process.env.QA_BROWSERBASE_PROXY_COUNTRY,
    8
  ).toUpperCase();
  const proxyState = sanitizeString(
    options.browserbaseProxyState || process.env.QA_BROWSERBASE_PROXY_STATE,
    32
  ).toUpperCase();
  const proxyCity = sanitizeString(
    options.browserbaseProxyCity || process.env.QA_BROWSERBASE_PROXY_CITY,
    64
  ).toUpperCase();
  const explicitProxies =
    options.browserbaseProxies !== undefined
      ? options.browserbaseProxies
      : suppliedParams.proxies !== undefined
        ? suppliedParams.proxies
        : undefined;

  const browserSettings = {
    ...suppliedBrowserSettings,
    advancedStealth
  };
  if (solveCaptchas) {
    browserSettings.solveCaptchas = true;
  }
  if (blockAds) {
    browserSettings.blockAds = true;
  }

  const params = {
    ...suppliedParams,
    browserSettings
  };
  if (explicitProxies !== undefined) {
    params.proxies = explicitProxies;
  } else if (useProxies) {
    if (proxyCountry || proxyState || proxyCity) {
      const geolocation = {};
      if (proxyCountry) {
        geolocation.country = proxyCountry;
      }
      if (proxyState) {
        geolocation.state = proxyState;
      }
      if (proxyCity) {
        geolocation.city = proxyCity;
      }
      params.proxies = [
        {
          type: "browserbase",
          geolocation
        }
      ];
    } else {
      params.proxies = true;
    }
  } else {
    params.proxies = false;
  }
  if (timeoutMs) {
    params.timeout = timeoutMs;
  }
  if (region) {
    params.region = region;
  }

  return params;
}

function isAdvancedStealthPlanError(error) {
  const message =
    typeof error === "string"
      ? error
      : error && typeof error.message === "string"
        ? error.message
        : "";
  if (!message) {
    return false;
  }
  const normalized = message.toLowerCase();
  return (
    normalized.includes("advanced stealth mode is only available on the enterprise plan") ||
    (normalized.includes("advanced stealth") && normalized.includes("enterprise"))
  );
}

function resolveCoordinateClickFallbackConfig(options = {}) {
  const enabledFromEnv = parseBooleanSetting(process.env.QA_COORDINATE_CLICK_FALLBACK, true);
  const enabled = parseBooleanSetting(options.coordinateClickFallbackEnabled, enabledFromEnv);
  const rawMode = sanitizeString(
    options.coordinateClickFallbackMode || process.env.QA_COORDINATE_CLICK_FALLBACK_MODE,
    32
  ).toLowerCase();
  const mode = COORDINATE_CLICK_FALLBACK_MODE_SET.has(rawMode)
    ? rawMode
    : DEFAULT_COORDINATE_CLICK_FALLBACK_MODE;
  const openAiApiKey = sanitizeString(
    options.coordinateAnnotationApiKey ||
      process.env.QA_COORDINATE_ANNOTATION_API_KEY ||
      process.env.QA_OPENAI_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.BROWSERBASE_OPENAI_API_KEY,
    512
  );
  const geminiApiKey = sanitizeString(
    options.coordinateAnnotationGeminiApiKey ||
      process.env.QA_COORDINATE_ANNOTATION_GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY,
    512
  );
  const falApiKey = sanitizeString(
    options.coordinateAnnotationFalApiKey ||
      process.env.QA_COORDINATE_ANNOTATION_FAL_API_KEY ||
      process.env.FAL_KEY,
    512
  );
  const replicateApiKey = sanitizeString(
    options.coordinateAnnotationReplicateApiKey ||
      process.env.QA_COORDINATE_ANNOTATION_REPLICATE_API_KEY ||
      process.env.REPLICATE_API_TOKEN,
    512
  );
  const qwenApiKey = sanitizeString(
    options.coordinateAnnotationQwenApiKey ||
      process.env.QA_COORDINATE_ANNOTATION_QWEN_API_KEY ||
      process.env.QWEN_API_KEY ||
      process.env.DASHSCOPE_API_KEY,
    512
  );
  const qwenWorkspace = sanitizeString(
    options.coordinateAnnotationQwenWorkspace ||
      process.env.QA_COORDINATE_ANNOTATION_QWEN_WORKSPACE ||
      process.env.DASHSCOPE_WORKSPACE,
    128
  );
  const annotationClient =
    typeof options.coordinateAnnotationClient === "function" ? options.coordinateAnnotationClient : null;
  const qwenOcrClient =
    typeof options.coordinateQwenOcrClient === "function" ? options.coordinateQwenOcrClient : null;
  const decodePng =
    typeof options.coordinateAnnotationDecodePng === "function" ? options.coordinateAnnotationDecodePng : null;
  const provider = resolveCoordinateAnnotationProvider(
    options.coordinateAnnotationProvider || process.env.QA_COORDINATE_ANNOTATION_PROVIDER,
    replicateApiKey ? "replicate" : falApiKey ? "fal" : geminiApiKey ? "gemini" : "openai"
  );
  const model =
    sanitizeString(options.coordinateAnnotationModel || process.env.QA_COORDINATE_ANNOTATION_MODEL, 128) ||
    (provider === "gemini"
      ? DEFAULT_GEMINI_COORDINATE_ANNOTATION_MODEL
      : provider === "replicate"
        ? DEFAULT_REPLICATE_COORDINATE_ANNOTATION_MODEL
      : provider === "fal"
        ? DEFAULT_FAL_COORDINATE_ANNOTATION_MODEL
        : DEFAULT_COORDINATE_ANNOTATION_MODEL);
  const baseUrl =
    provider === "gemini"
      ? resolveGeminiBaseUrl(
          options.coordinateAnnotationBaseUrl ||
            process.env.QA_COORDINATE_ANNOTATION_BASE_URL ||
            process.env.GEMINI_BASE_URL ||
            DEFAULT_GEMINI_BASE_URL
        )
      : provider === "replicate"
        ? resolveReplicateBaseUrl(
            options.coordinateAnnotationReplicateBaseUrl ||
              options.coordinateAnnotationBaseUrl ||
              process.env.QA_COORDINATE_ANNOTATION_REPLICATE_BASE_URL ||
              process.env.QA_COORDINATE_ANNOTATION_BASE_URL ||
              process.env.REPLICATE_BASE_URL ||
              DEFAULT_REPLICATE_BASE_URL
          )
      : provider === "fal"
        ? resolveFalBaseUrl(
            options.coordinateAnnotationFalBaseUrl ||
              options.coordinateAnnotationBaseUrl ||
              process.env.QA_COORDINATE_ANNOTATION_FAL_BASE_URL ||
              process.env.QA_COORDINATE_ANNOTATION_BASE_URL ||
              process.env.FAL_BASE_URL ||
              DEFAULT_FAL_BASE_URL
          )
      : resolveOpenAiBaseUrl(
          options.coordinateAnnotationBaseUrl ||
            process.env.QA_COORDINATE_ANNOTATION_BASE_URL ||
            process.env.OPENAI_BASE_URL ||
            DEFAULT_OPENAI_BASE_URL
        );
  const qwenModel =
    sanitizeString(options.coordinateAnnotationQwenModel || process.env.QA_COORDINATE_ANNOTATION_QWEN_MODEL, 128) ||
    DEFAULT_QWEN_OCR_MODEL;
  const qwenTask =
    sanitizeString(options.coordinateAnnotationQwenTask || process.env.QA_COORDINATE_ANNOTATION_QWEN_TASK, 64) ||
    DEFAULT_QWEN_OCR_TASK;
  const qwenBaseUrl = resolveQwenBaseUrl(
    options.coordinateAnnotationQwenBaseUrl ||
      process.env.QA_COORDINATE_ANNOTATION_QWEN_BASE_URL ||
      process.env.DASHSCOPE_BASE_URL ||
      DEFAULT_QWEN_BASE_URL
  );
  const ocrJudgeEnabled = parseBooleanSetting(
    options.coordinateOcrJudgeEnabled ?? process.env.QA_COORDINATE_OCR_JUDGE_ENABLED,
    true
  );
  const ocrJudgeApiKey = sanitizeString(
    options.coordinateOcrJudgeApiKey ||
      process.env.QA_COORDINATE_OCR_JUDGE_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.QA_VISION_API_KEY,
    4096
  );
  const ocrJudgeModel =
    sanitizeString(
      options.coordinateOcrJudgeModel ||
        process.env.QA_COORDINATE_OCR_JUDGE_MODEL ||
        process.env.QA_VISION_MODEL,
      128
    ) || DEFAULT_COORDINATE_OCR_JUDGE_MODEL;
  const ocrJudgeBaseUrl = resolveOpenAiBaseUrl(
    options.coordinateOcrJudgeBaseUrl ||
      process.env.QA_COORDINATE_OCR_JUDGE_BASE_URL ||
      process.env.OPENAI_BASE_URL
  );
  const rawLocalizationOrder = options.coordinateLocalizationOrder || process.env.QA_COORDINATE_LOCALIZATION_ORDER;

  const timeoutRaw = Number(
    options.coordinateAnnotationTimeoutMs || process.env.QA_COORDINATE_ANNOTATION_TIMEOUT_MS
  );
  const timeoutMs =
    Number.isFinite(timeoutRaw) && timeoutRaw >= 1000
      ? Math.floor(timeoutRaw)
      : DEFAULT_COORDINATE_ANNOTATION_TIMEOUT_MS;

  if (!enabled) {
    return {
      enabled: false,
      reason: "disabled_by_config",
      mode,
      provider,
      model,
      baseUrl,
      timeoutMs,
      decodePng,
      annotateImage: null,
      qwen: null,
      localizationOrder: [],
      strategy: null,
      localizeBox: null
    };
  }

  let annotateImage = null;
  if (annotationClient) {
    annotateImage = annotationClient;
  } else {
    const selectedApiKey =
      provider === "gemini"
        ? geminiApiKey
        : provider === "fal"
          ? falApiKey
          : provider === "replicate"
            ? replicateApiKey
            : openAiApiKey;
    if (selectedApiKey) {
      annotateImage = (payload) =>
        provider === "gemini"
          ? requestYellowBoxAnnotationWithGemini({
              ...payload,
              apiKey: selectedApiKey,
              model,
              baseUrl,
              timeoutMs
            })
          : provider === "replicate"
            ? requestYellowBoxAnnotationWithReplicate({
                ...payload,
                apiKey: selectedApiKey,
                model,
                baseUrl,
                timeoutMs
              })
          : provider === "fal"
            ? requestYellowBoxAnnotationWithFal({
                ...payload,
                apiKey: selectedApiKey,
                model,
                baseUrl,
                timeoutMs
              })
            : requestYellowBoxAnnotationWithOpenAi({
                ...payload,
                apiKey: selectedApiKey,
                model,
                baseUrl,
                timeoutMs
              });
    }
  }

  const qwenClient =
    qwenOcrClient ||
    (qwenApiKey
      ? (payload) =>
          requestQwenOcrWordsWithBoxes({
            ...payload,
            apiKey: qwenApiKey,
            model: qwenModel,
            task: qwenTask,
            workspace: qwenWorkspace,
            baseUrl: qwenBaseUrl,
            timeoutMs
          })
      : null);
  const ocrJudge =
    ocrJudgeEnabled && ocrJudgeApiKey
      ? {
          model: ocrJudgeModel,
          baseUrl: ocrJudgeBaseUrl,
          timeoutMs,
          selectCandidate: (payload) =>
            chooseOcrCandidateWithJudge({
              ...payload,
              apiKey: ocrJudgeApiKey,
              baseUrl: ocrJudgeBaseUrl,
              model: ocrJudgeModel,
              timeoutMs
            })
        }
      : null;

  const localizationOrder = resolveCoordinateLocalizationOrder(rawLocalizationOrder, {
    includeQwen: typeof qwenClient === "function",
    includeYellow: typeof annotateImage === "function"
  });

  if (!localizationOrder.length) {
    return {
      enabled: false,
      reason: "missing_localization_clients",
      mode,
      provider,
      model,
      baseUrl,
      timeoutMs,
      decodePng,
      annotateImage: null,
      qwen: null,
      localizationOrder: [],
      strategy: null,
      localizeBox: null
    };
  }

  const config = {
    enabled: true,
    reason: null,
    mode,
    provider,
    model,
    baseUrl,
    timeoutMs,
    decodePng,
    annotateImage,
    qwen:
      typeof qwenClient === "function"
        ? {
            provider: "qwen",
            model: qwenModel,
            task: qwenTask,
            workspace: qwenWorkspace || null,
            baseUrl: qwenBaseUrl,
            ocrImage: qwenClient,
            selectCandidate: ocrJudge?.selectCandidate || null,
            judge_model: ocrJudge?.model || null
          }
        : null,
    localizationOrder,
    strategy: localizationOrder.join("->"),
    localizeBox: null
  };
  config.localizeBox = (payload) =>
    localizeClickTargetBox({
      ...payload,
      coordinateFallbackConfig: config
    });
  return config;
}

async function waitAndCaptureActionScreenshotBase64(page, delayMs = DEFAULT_CLICK_SCREENSHOT_DELAY_MS) {
  if (!page) {
    return undefined;
  }

  if (Number.isFinite(delayMs) && delayMs > 0) {
    if (typeof page.waitForTimeout === "function") {
      await page.waitForTimeout(delayMs);
    } else {
      await sleep(delayMs);
    }
  }

  try {
    const screenshot = await page.screenshot({ fullPage: false });
    if (!Buffer.isBuffer(screenshot)) {
      return undefined;
    }
    return screenshot.toString("base64");
  } catch {
    return undefined;
  }
}

async function resolveViewportSize(page) {
  const fallback = { width: 1280, height: 720 };
  if (!page || typeof page.evaluate !== "function") {
    return fallback;
  }

  try {
    const viewport = await page.evaluate(() => {
      return {
        width: Number(window.innerWidth || 0),
        height: Number(window.innerHeight || 0)
      };
    });

    if (
      !viewport ||
      !Number.isFinite(viewport.width) ||
      !Number.isFinite(viewport.height) ||
      viewport.width <= 0 ||
      viewport.height <= 0
    ) {
      return fallback;
    }

    return {
      width: Math.floor(viewport.width),
      height: Math.floor(viewport.height)
    };
  } catch {
    return fallback;
  }
}

async function normalizeClickCoordinatesForProvider(rawCoordinates, provider, page) {
  const rawX = Number(rawCoordinates[0]);
  const rawY = Number(rawCoordinates[1]);
  if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) {
    throw new Error("Click coordinates are missing or invalid");
  }

  if (!provider.includes("google")) {
    return { x: rawX, y: rawY };
  }

  const viewport = await resolveViewportSize(page);
  const clampedX = Math.min(999, Math.max(0, rawX));
  const clampedY = Math.min(999, Math.max(0, rawY));

  return {
    x: Math.floor((clampedX / 1000) * viewport.width),
    y: Math.floor((clampedY / 1000) * viewport.height)
  };
}

function buildYellowBoxPrompt(targetDescription) {
  const description = sanitizeString(targetDescription, 280);
  return [
    "Edit this screenshot by drawing one rectangular outline around the target UI element.",
    "Target element:",
    description || "the requested element",
    "Rules:",
    "- Keep output dimensions and layout unchanged.",
    "- Draw exactly one rectangle.",
    "- Rectangle stroke color must be pure yellow (#FFFF00).",
    "- Stroke should be 4px with no fill.",
    "- Do not add labels, text, arrows, or extra highlights.",
    "- If uncertain, choose the most likely matching element and still draw one yellow rectangle."
  ].join("\n");
}

function normalizeTextForMatching(value) {
  return sanitizeString(value, 500)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeTextForMatching(value) {
  return normalizeTextForMatching(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token && token.length >= 2);
}

function extractQuotedTargetPhrases(value) {
  if (typeof value !== "string") {
    return [];
  }
  const matches = [];
  const regex = /["']([^"']{2,120})["']/g;
  let match = null;
  while ((match = regex.exec(value)) !== null) {
    const normalized = normalizeTextForMatching(match[1]);
    if (normalized) {
      matches.push(normalized);
    }
  }
  return matches;
}

function buildTargetPhraseCandidates(targetDescription) {
  const phrases = [];
  const quoted = extractQuotedTargetPhrases(targetDescription);
  for (const phrase of quoted) {
    if (!phrases.includes(phrase)) {
      phrases.push(phrase);
    }
  }

  const meaningfulTokens = tokenizeTextForMatching(targetDescription).filter(
    (token) => !OCR_DESCRIPTION_STOPWORDS.has(token)
  );
  if (meaningfulTokens.length) {
    const joined = meaningfulTokens.join(" ");
    if (joined && !phrases.includes(joined)) {
      phrases.push(joined);
    }
  }

  const fallback = normalizeTextForMatching(targetDescription);
  if (fallback && !phrases.includes(fallback)) {
    phrases.push(fallback);
  }

  return phrases.slice(0, 6);
}

function normalizeOcrLocationToBox(rawLocation, dimensions = null) {
  const clamp = (value, max) => {
    if (!Number.isFinite(value)) {
      return null;
    }
    const rounded = Math.round(value);
    if (!Number.isFinite(max) || max <= 0) {
      return rounded;
    }
    return Math.max(0, Math.min(max - 1, rounded));
  };

  let left = null;
  let top = null;
  let right = null;
  let bottom = null;

  if (Array.isArray(rawLocation) && rawLocation.length >= 4) {
    const pointShape = rawLocation.every(
      (point) => Array.isArray(point) && point.length >= 2 && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]))
    );
    if (pointShape) {
      const xs = rawLocation.map((point) => Number(point[0]));
      const ys = rawLocation.map((point) => Number(point[1]));
      left = Math.min(...xs);
      top = Math.min(...ys);
      right = Math.max(...xs);
      bottom = Math.max(...ys);
    } else if (rawLocation.length >= 4) {
      const x1 = Number(rawLocation[0]);
      const y1 = Number(rawLocation[1]);
      const x2 = Number(rawLocation[2]);
      const y2 = Number(rawLocation[3]);
      if ([x1, y1, x2, y2].every((value) => Number.isFinite(value))) {
        left = Math.min(x1, x2);
        top = Math.min(y1, y2);
        right = Math.max(x1, x2);
        bottom = Math.max(y1, y2);
      }
    }
  } else if (isPlainObject(rawLocation)) {
    const x1 = Number(rawLocation.left ?? rawLocation.x1 ?? rawLocation.x ?? rawLocation.min_x);
    const y1 = Number(rawLocation.top ?? rawLocation.y1 ?? rawLocation.y ?? rawLocation.min_y);
    const x2 = Number(rawLocation.right ?? rawLocation.x2 ?? rawLocation.max_x);
    const y2 = Number(rawLocation.bottom ?? rawLocation.y2 ?? rawLocation.max_y);
    if ([x1, y1, x2, y2].every((value) => Number.isFinite(value))) {
      left = Math.min(x1, x2);
      top = Math.min(y1, y2);
      right = Math.max(x1, x2);
      bottom = Math.max(y1, y2);
    }
  }

  if (![left, top, right, bottom].every((value) => Number.isFinite(value))) {
    return null;
  }

  const sourceWidth = Number.isFinite(dimensions?.width) ? Math.floor(dimensions.width) : null;
  const sourceHeight = Number.isFinite(dimensions?.height) ? Math.floor(dimensions.height) : null;
  const normalizedLeft = clamp(left, sourceWidth);
  const normalizedTop = clamp(top, sourceHeight);
  const normalizedRight = clamp(right, sourceWidth);
  const normalizedBottom = clamp(bottom, sourceHeight);
  if (![normalizedLeft, normalizedTop, normalizedRight, normalizedBottom].every((value) => Number.isFinite(value))) {
    return null;
  }

  const finalLeft = Math.min(normalizedLeft, normalizedRight);
  const finalTop = Math.min(normalizedTop, normalizedBottom);
  const finalRight = Math.max(normalizedLeft, normalizedRight);
  const finalBottom = Math.max(normalizedTop, normalizedBottom);
  const width = Math.max(1, finalRight - finalLeft + 1);
  const height = Math.max(1, finalBottom - finalTop + 1);

  return {
    left: finalLeft,
    top: finalTop,
    right: finalRight,
    bottom: finalBottom,
    width,
    height,
    center_x: Math.round((finalLeft + finalRight) / 2),
    center_y: Math.round((finalTop + finalBottom) / 2),
    pixel_count: width * height,
    source_width: sourceWidth,
    source_height: sourceHeight,
    annotated_width: sourceWidth,
    annotated_height: sourceHeight,
    scaled_from_resized_annotation: false
  };
}

function sanitizeQwenWordsInfo(wordsInfo, dimensions = null) {
  if (!Array.isArray(wordsInfo)) {
    return [];
  }

  const result = [];
  for (const item of wordsInfo) {
    if (!isPlainObject(item)) {
      continue;
    }
    const text = sanitizeString(item.text || item.word || item.content, 240);
    if (!text) {
      continue;
    }
    const box = normalizeOcrLocationToBox(item.location || item.bbox || item.box, dimensions);
    if (!box) {
      continue;
    }
    result.push({
      text,
      normalized_text: normalizeTextForMatching(text),
      box
    });
  }

  return result;
}

function mergeBoxes(a, b) {
  const left = Math.min(a.left, b.left);
  const top = Math.min(a.top, b.top);
  const right = Math.max(a.right, b.right);
  const bottom = Math.max(a.bottom, b.bottom);
  const width = Math.max(1, right - left + 1);
  const height = Math.max(1, bottom - top + 1);
  return {
    left,
    top,
    right,
    bottom,
    width,
    height,
    center_x: Math.round((left + right) / 2),
    center_y: Math.round((top + bottom) / 2),
    pixel_count: width * height,
    source_width: a.source_width ?? b.source_width ?? null,
    source_height: a.source_height ?? b.source_height ?? null,
    annotated_width: a.annotated_width ?? b.annotated_width ?? null,
    annotated_height: a.annotated_height ?? b.annotated_height ?? null,
    scaled_from_resized_annotation: false
  };
}

function buildOcrCandidates(words) {
  const sorted = words
    .slice()
    .sort((a, b) => (a.box.center_y - b.box.center_y) || (a.box.left - b.box.left));
  const candidates = [];

  for (const word of sorted) {
    candidates.push({
      text: word.text,
      normalized_text: word.normalized_text,
      box: word.box
    });
  }

  const lines = [];
  const lineThreshold = 16;
  for (const word of sorted) {
    let targetLine = null;
    for (const line of lines) {
      if (Math.abs(line.centerY - word.box.center_y) <= lineThreshold) {
        targetLine = line;
        break;
      }
    }
    if (!targetLine) {
      targetLine = {
        centerY: word.box.center_y,
        words: []
      };
      lines.push(targetLine);
    }
    targetLine.words.push(word);
    targetLine.centerY =
      (targetLine.centerY * Math.max(0, targetLine.words.length - 1) + word.box.center_y) /
      targetLine.words.length;
  }

  const maxNgram = 4;
  const maxCandidates = 320;
  for (const line of lines) {
    line.words.sort((a, b) => a.box.left - b.box.left);
    for (let start = 0; start < line.words.length; start += 1) {
      let combinedText = "";
      let combinedBox = null;
      for (let end = start; end < line.words.length && end < start + maxNgram; end += 1) {
        combinedText = combinedText
          ? `${combinedText} ${line.words[end].text}`
          : line.words[end].text;
        combinedBox = combinedBox ? mergeBoxes(combinedBox, line.words[end].box) : line.words[end].box;
        candidates.push({
          text: combinedText,
          normalized_text: normalizeTextForMatching(combinedText),
          box: combinedBox
        });
        if (candidates.length >= maxCandidates) {
          return candidates;
        }
      }
    }
  }

  return candidates;
}

function prepareOcrCandidatesForJudge(candidates, maxCandidates = 80) {
  if (!Array.isArray(candidates) || !candidates.length) {
    return [];
  }

  const prepared = [];
  const seen = new Set();
  for (const candidate of candidates) {
    if (!candidate || !isPlainObject(candidate.box)) {
      continue;
    }
    const text = sanitizeString(candidate.text, 160);
    if (!text) {
      continue;
    }
    const key = [
      sanitizeString(candidate.normalized_text, 180),
      Number(candidate.box.center_x) || 0,
      Number(candidate.box.center_y) || 0,
      Number(candidate.box.width) || 0,
      Number(candidate.box.height) || 0
    ].join("|");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    prepared.push({
      text,
      normalized_text: sanitizeString(candidate.normalized_text, 180),
      box: candidate.box
    });
    if (prepared.length >= maxCandidates) {
      break;
    }
  }

  return prepared.map((candidate, index) => ({
    index,
    text: candidate.text,
    normalized_text: candidate.normalized_text,
    box: candidate.box
  }));
}

function buildOcrJudgePrompt({ targetDescription, candidates }) {
  const candidateLines = Array.isArray(candidates)
    ? candidates
        .map((candidate) => {
          const box = isPlainObject(candidate?.box) ? candidate.box : {};
          return `- ${candidate.index}: text="${sanitizeString(candidate?.text, 160)}", center=(${Number(box.center_x) || 0}, ${Number(box.center_y) || 0}), size=${Number(box.width) || 0}x${Number(box.height) || 0}`;
        })
        .join("\n")
    : "- none";

  return [
    "Choose which OCR candidate should be clicked for the requested UI target.",
    "Use the target description and the OCR candidate texts/positions.",
    "If no candidate is a credible match, return candidate_index = -1.",
    "Return EXACTLY one JSON object and nothing else.",
    "",
    "JSON schema:",
    "{",
    '  "candidate_index": 3,',
    '  "reason": "why this candidate is the right click target"',
    "}",
    "",
    `Target description: ${sanitizeString(targetDescription, 220) || "-"}`,
    "OCR candidates:",
    candidateLines
  ].join("\n");
}

function normalizeOcrJudgeDecision(rawDecision, candidateCount) {
  const parsed = isPlainObject(rawDecision) ? rawDecision : parseFirstJsonObject(rawDecision);
  if (!parsed) {
    throw new Error("OCR judge did not return valid JSON");
  }

  const rawIndex = Number(parsed.candidate_index);
  const candidateIndex = Number.isFinite(rawIndex) ? Math.floor(rawIndex) : -1;
  if (candidateIndex >= candidateCount) {
    throw new Error("OCR judge returned an out-of-range candidate index");
  }

  return {
    candidate_index: candidateIndex,
    reason: sanitizeString(parsed.reason, 400)
  };
}

async function requestOcrJudgeDecisionWithResponses({
  apiKey,
  baseUrl,
  model,
  prompt,
  timeoutMs
}) {
  const abortController = new AbortController();
  const effectiveTimeoutMs =
    Number.isFinite(timeoutMs) && timeoutMs >= 1000 ? Math.floor(timeoutMs) : DEFAULT_VISION_STEP_TIMEOUT_MS;
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, effectiveTimeoutMs);

  try {
    const response = await fetch(`${baseUrl}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: "Choose the best OCR candidate index for the requested UI target. Return one JSON object."
              }
            ]
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: prompt
              }
            ]
          }
        ],
        max_output_tokens: 180
      }),
      signal: abortController.signal
    });

    if (!response.ok) {
      const body = truncateText(await response.text(), 320);
      throw new Error(`responses endpoint failed (${response.status}): ${body}`);
    }

    const payload = await response.json();
    const text = extractResponseOutputText(payload);
    if (!text) {
      throw new Error("responses endpoint returned no text output");
    }
    return text;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`responses endpoint timed out after ${effectiveTimeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function requestOcrJudgeDecisionWithChatCompletions({
  apiKey,
  baseUrl,
  model,
  prompt,
  timeoutMs
}) {
  const abortController = new AbortController();
  const effectiveTimeoutMs =
    Number.isFinite(timeoutMs) && timeoutMs >= 1000 ? Math.floor(timeoutMs) : DEFAULT_VISION_STEP_TIMEOUT_MS;
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, effectiveTimeoutMs);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "Choose the best OCR candidate index for the requested UI target. Return one JSON object."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 180
      }),
      signal: abortController.signal
    });

    if (!response.ok) {
      const body = truncateText(await response.text(), 320);
      throw new Error(`chat completions endpoint failed (${response.status}): ${body}`);
    }

    const payload = await response.json();
    const text = extractChatCompletionOutputText(payload);
    if (!text) {
      throw new Error("chat completions endpoint returned no text output");
    }
    return text;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`chat completions endpoint timed out after ${effectiveTimeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function chooseOcrCandidateWithJudge({
  apiKey,
  baseUrl,
  model,
  targetDescription,
  candidates,
  timeoutMs
}) {
  const preparedCandidates = prepareOcrCandidatesForJudge(candidates);
  if (!preparedCandidates.length) {
    return null;
  }

  const prompt = buildOcrJudgePrompt({
    targetDescription,
    candidates: preparedCandidates
  });
  const errors = [];

  try {
    const text = await requestOcrJudgeDecisionWithResponses({
      apiKey,
      baseUrl,
      model,
      prompt,
      timeoutMs
    });
    const decision = normalizeOcrJudgeDecision(text, preparedCandidates.length);
    if (decision.candidate_index < 0) {
      return {
        candidate: null,
        reason: decision.reason || "OCR judge did not find a credible match."
      };
    }
    return {
      candidate: preparedCandidates[decision.candidate_index],
      reason: decision.reason || ""
    };
  } catch (error) {
    errors.push(error.message || "responses endpoint failed");
  }

  try {
    const text = await requestOcrJudgeDecisionWithChatCompletions({
      apiKey,
      baseUrl,
      model,
      prompt,
      timeoutMs
    });
    const decision = normalizeOcrJudgeDecision(text, preparedCandidates.length);
    if (decision.candidate_index < 0) {
      return {
        candidate: null,
        reason: decision.reason || "OCR judge did not find a credible match."
      };
    }
    return {
      candidate: preparedCandidates[decision.candidate_index],
      reason: decision.reason || ""
    };
  } catch (error) {
    errors.push(error.message || "chat completions endpoint failed");
  }

  throw new Error(`OCR candidate judge failed. ${errors.join(" | ")}`);
}

function scoreOcrCandidate(candidate, targetPhrases, targetTokens) {
  const normalizedText = candidate.normalized_text;
  if (!normalizedText) {
    return 0;
  }

  let score = 0;
  for (const phrase of targetPhrases) {
    if (!phrase) {
      continue;
    }
    if (normalizedText === phrase) {
      score += 200 + phrase.length * 2;
      continue;
    }
    if (normalizedText.includes(phrase)) {
      score += 120 + phrase.length;
      continue;
    }

    const phraseTokens = phrase.split(" ").filter(Boolean);
    if (!phraseTokens.length) {
      continue;
    }
    const candidateTokens = new Set(normalizedText.split(" ").filter(Boolean));
    let overlap = 0;
    for (const token of phraseTokens) {
      if (candidateTokens.has(token)) {
        overlap += 1;
      }
    }
    if (overlap > 0) {
      score += (overlap / phraseTokens.length) * 80;
    }
  }

  if (targetTokens.length) {
    const candidateTokens = new Set(normalizedText.split(" ").filter(Boolean));
    let overlap = 0;
    for (const token of targetTokens) {
      if (candidateTokens.has(token)) {
        overlap += 1;
      }
    }
    if (overlap > 0) {
      score += overlap * 11;
    }
  }

  const tokenCount = normalizedText.split(" ").filter(Boolean).length;
  if (tokenCount > 8) {
    score -= (tokenCount - 8) * 3;
  }

  return score;
}

function selectBestOcrCandidate(candidates, targetDescription) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }

  const targetPhrases = buildTargetPhraseCandidates(targetDescription);
  const targetTokens = tokenizeTextForMatching(targetDescription).filter(
    (token) => !OCR_DESCRIPTION_STOPWORDS.has(token)
  );
  const distinctiveTargetTokens = targetTokens.filter((token) => !OCR_GENERIC_MATCH_TOKENS.has(token));
  if (!targetPhrases.length && !targetTokens.length) {
    return null;
  }

  let best = null;
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    const score = scoreOcrCandidate(candidate, targetPhrases, targetTokens);
    if (!Number.isFinite(score)) {
      continue;
    }
    if (!best || score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  if (!best || bestScore < 24) {
    return null;
  }

  if (distinctiveTargetTokens.length) {
    const candidateTokens = new Set((best.normalized_text || "").split(" ").filter(Boolean));
    let overlap = 0;
    for (const token of distinctiveTargetTokens) {
      if (candidateTokens.has(token)) {
        overlap += 1;
      }
    }
    if (overlap === 0) {
      return null;
    }
  }

  return {
    candidate: best,
    score: bestScore
  };
}

function extractWordsInfoFromPotentialOcrJson(value) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const extracted = extractWordsInfoFromPotentialOcrJson(entry);
      if (Array.isArray(extracted) && extracted.length) {
        return extracted;
      }
    }
    return null;
  }

  if (!isPlainObject(value)) {
    return null;
  }

  if (Array.isArray(value.words_info) && value.words_info.length) {
    return value.words_info;
  }
  if (isPlainObject(value.ocr_result) && Array.isArray(value.ocr_result.words_info) && value.ocr_result.words_info.length) {
    return value.ocr_result.words_info;
  }

  const nestedKeys = ["content", "message", "choice", "choices", "output", "data", "result"];
  for (const key of nestedKeys) {
    const nested = value[key];
    if (!nested) {
      continue;
    }
    const extracted = extractWordsInfoFromPotentialOcrJson(nested);
    if (Array.isArray(extracted) && extracted.length) {
      return extracted;
    }
  }

  return null;
}

function extractQwenWordsInfoFromChatPayload(payload) {
  if (!isPlainObject(payload)) {
    return null;
  }

  const direct = extractWordsInfoFromPotentialOcrJson(payload);
  if (Array.isArray(direct) && direct.length) {
    return direct;
  }

  const textCandidates = [];
  const collectText = (value) => {
    if (typeof value === "string" && value.trim()) {
      textCandidates.push(value.trim());
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        collectText(item);
      }
      return;
    }
    if (isPlainObject(value)) {
      if (typeof value.text === "string" && value.text.trim()) {
        textCandidates.push(value.text.trim());
      }
      for (const nested of Object.values(value)) {
        collectText(nested);
      }
    }
  };

  collectText(payload.choices);
  collectText(payload.output);

  for (const textCandidate of textCandidates) {
    const parsed = parseFirstJsonObject(textCandidate);
    const extracted = extractWordsInfoFromPotentialOcrJson(parsed);
    if (Array.isArray(extracted) && extracted.length) {
      return extracted;
    }
  }

  return null;
}

async function requestQwenOcrWordsWithBoxes({
  imageBuffer,
  targetDescription,
  apiKey,
  model,
  task,
  workspace,
  baseUrl,
  timeoutMs
}) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    throw new Error("Cannot OCR localize without a screenshot buffer");
  }
  if (!apiKey) {
    throw new Error("Qwen OCR API key is missing");
  }

  const resolvedModel = sanitizeString(model, 256) || DEFAULT_QWEN_OCR_MODEL;
  const resolvedTask = sanitizeString(task, 64) || DEFAULT_QWEN_OCR_TASK;
  const resolvedWorkspace = sanitizeString(workspace, 128);
  const requestBody = {
    model: resolvedModel,
    input: {
      messages: [
        {
          role: "user",
          content: [
            {
              image: `data:image/png;base64,${imageBuffer.toString("base64")}`
            }
          ]
        }
      ]
    },
    parameters: {
      result_format: "message",
      ocr_options: {
        task: resolvedTask
      }
    },
    task: "ocr"
  };

  const abortController = new AbortController();
  const effectiveTimeoutMs =
    Number.isFinite(timeoutMs) && timeoutMs >= 1000
      ? Math.floor(timeoutMs)
      : DEFAULT_COORDINATE_ANNOTATION_TIMEOUT_MS;
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, effectiveTimeoutMs);

  try {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    };
    if (resolvedWorkspace) {
      headers["X-DashScope-WorkSpace"] = resolvedWorkspace;
    }

    const response = await fetch(`${baseUrl}/api/v1/services/aigc/multimodal-generation/generation`, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: abortController.signal
    });

    if (!response.ok) {
      const errorText = truncateText(await response.text(), 320);
      throw new Error(`Qwen OCR request failed (${response.status}): ${errorText}`);
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      throw new Error("Qwen OCR response was not valid JSON");
    }

    const wordsInfo = extractQwenWordsInfoFromChatPayload(payload);
    if (!Array.isArray(wordsInfo) || wordsInfo.length === 0) {
      throw new Error("Qwen OCR response did not include words_info");
    }

    return wordsInfo;
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`Qwen OCR request timed out after ${effectiveTimeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function localizeWithQwenOcr({
  imageBuffer,
  targetDescription,
  qwenConfig
}) {
  const dimensions = resolvePngDimensionsFast(imageBuffer);
  const wordsInfo = await qwenConfig.ocrImage({
    imageBuffer,
    targetDescription
  });
  const words = sanitizeQwenWordsInfo(wordsInfo, dimensions);
  if (!words.length) {
    throw new Error("Qwen OCR returned no usable words with locations");
  }

  const candidates = buildOcrCandidates(words);
  let best = null;
  let selectionMode = "heuristic";
  let judgeReason = "";
  if (typeof qwenConfig.selectCandidate === "function") {
    const judged = await qwenConfig.selectCandidate({
      targetDescription,
      candidates
    });
    if (judged?.candidate) {
      best = {
        candidate: judged.candidate,
        score: Number.isFinite(judged.score) ? judged.score : null
      };
      selectionMode = "llm_judge";
      judgeReason = sanitizeString(judged.reason, 400);
    } else if (sanitizeString(judged?.reason, 400)) {
      judgeReason = sanitizeString(judged.reason, 400);
    }
  }

  if (!best) {
    best = selectBestOcrCandidate(candidates, targetDescription);
  }
  if (!best) {
    throw new Error("Qwen OCR could not match target text to a reliable bounding box");
  }

  return {
    strategy: "ocr_qwen",
    provider: "qwen",
    model: qwenConfig.model || DEFAULT_QWEN_OCR_MODEL,
    box: best.candidate.box,
    metadata: {
      matched_text: best.candidate.text,
      score: best.score,
      selection_mode: selectionMode,
      judge_reason: judgeReason || null,
      ocr_words: words.length,
      candidate_boxes: candidates.length
    }
  };
}

async function localizeWithYellowBoxDiff({
  imageBuffer,
  targetDescription,
  coordinateFallbackConfig
}) {
  if (typeof coordinateFallbackConfig?.annotateImage !== "function") {
    throw new Error("Yellow-box annotation client is unavailable");
  }

  const annotatedScreenshot = await coordinateFallbackConfig.annotateImage({
    imageBuffer,
    targetDescription
  });
  const box = extractYellowBoxFromAnnotatedDiff(imageBuffer, annotatedScreenshot, {
    decodePng: coordinateFallbackConfig.decodePng
  });

  return {
    strategy: "yellow_box_diff",
    provider: coordinateFallbackConfig.provider || null,
    model: coordinateFallbackConfig.model || null,
    box,
    metadata: {}
  };
}

async function localizeClickTargetBox({
  imageBuffer,
  targetDescription,
  coordinateFallbackConfig
}) {
  const strategies = Array.isArray(coordinateFallbackConfig?.localizationOrder)
    ? coordinateFallbackConfig.localizationOrder
    : [];
  const attempts = [];

  for (const strategy of strategies) {
    if (strategy === "ocr_qwen" && isPlainObject(coordinateFallbackConfig?.qwen)) {
      try {
        const result = await localizeWithQwenOcr({
          imageBuffer,
          targetDescription,
          qwenConfig: coordinateFallbackConfig.qwen
        });
        return {
          ...result,
          attempts
        };
      } catch (error) {
        attempts.push({
          strategy,
          error: error.message || "Unknown OCR localization error"
        });
      }
      continue;
    }

    if (strategy === "yellow_box_diff") {
      try {
        const result = await localizeWithYellowBoxDiff({
          imageBuffer,
          targetDescription,
          coordinateFallbackConfig
        });
        return {
          ...result,
          attempts
        };
      } catch (error) {
        attempts.push({
          strategy,
          error: error.message || "Unknown yellow-box localization error"
        });
      }
    }
  }

  if (!attempts.length) {
    throw new Error("No coordinate localization strategy is configured");
  }

  throw new Error(
    `Coordinate localization failed: ${attempts
      .map((attempt) => `${attempt.strategy}: ${attempt.error}`)
      .join(" | ")}`
  );
}

function resolveLocalizeBoxClient(coordinateFallbackConfig = {}) {
  if (typeof coordinateFallbackConfig?.localizeBox === "function") {
    return coordinateFallbackConfig.localizeBox;
  }

  const localizationOrder = resolveCoordinateLocalizationOrder(coordinateFallbackConfig?.localizationOrder, {
    includeQwen: isPlainObject(coordinateFallbackConfig?.qwen),
    includeYellow: typeof coordinateFallbackConfig?.annotateImage === "function"
  });
  if (!localizationOrder.length) {
    return null;
  }

  return (payload) =>
    localizeClickTargetBox({
      ...payload,
      coordinateFallbackConfig: {
        ...coordinateFallbackConfig,
        localizationOrder
      }
    });
}

async function parseOpenAiImageEditResponseImageBuffer(payload) {
  if (!isPlainObject(payload) || !Array.isArray(payload.data) || payload.data.length === 0) {
    throw new Error("Annotation response did not include image data");
  }

  const first = payload.data[0];
  if (!isPlainObject(first)) {
    throw new Error("Annotation response image payload was malformed");
  }

  if (typeof first.b64_json === "string" && first.b64_json.trim()) {
    return Buffer.from(first.b64_json, "base64");
  }
  if (typeof first.image_base64 === "string" && first.image_base64.trim()) {
    return Buffer.from(first.image_base64, "base64");
  }
  if (typeof first.url === "string" && first.url.trim()) {
    const response = await fetch(first.url);
    if (!response.ok) {
      throw new Error(`Failed to download annotation image (${response.status})`);
    }
    const imageArrayBuffer = await response.arrayBuffer();
    return Buffer.from(imageArrayBuffer);
  }

  throw new Error("Annotation response did not contain b64_json or url image content");
}

function parseGeminiImageResponseBuffer(payload) {
  if (!isPlainObject(payload) || !Array.isArray(payload.candidates) || payload.candidates.length === 0) {
    throw new Error("Gemini annotation response did not include candidates");
  }

  for (const candidate of payload.candidates) {
    const parts = candidate?.content?.parts;
    if (!Array.isArray(parts)) {
      continue;
    }

    for (const part of parts) {
      const inlineData = part?.inlineData || part?.inline_data;
      if (isPlainObject(inlineData) && typeof inlineData.data === "string" && inlineData.data.trim()) {
        return Buffer.from(inlineData.data, "base64");
      }
    }
  }

  const textHints = [];
  for (const candidate of payload.candidates) {
    const parts = candidate?.content?.parts;
    if (!Array.isArray(parts)) {
      continue;
    }
    for (const part of parts) {
      if (typeof part?.text === "string" && part.text.trim()) {
        textHints.push(part.text.trim());
      }
    }
  }

  const hint = textHints.length ? ` Message: ${truncateText(textHints[0], 200)}` : "";
  throw new Error(`Gemini response did not include inline image data.${hint}`);
}

function parseDataUrlImageBuffer(imageUrl) {
  const value = sanitizeString(imageUrl, 15000000);
  if (!value || !value.startsWith("data:")) {
    return null;
  }

  const match = /^data:[^;]+;base64,(.+)$/i.exec(value);
  if (!match || !match[1]) {
    return null;
  }

  try {
    return Buffer.from(match[1], "base64");
  } catch {
    return null;
  }
}

function inferReplicateAspectRatio(imageBuffer) {
  const dimensions = resolvePngDimensionsFast(imageBuffer);
  const width = Number.isFinite(dimensions?.width) ? dimensions.width : 0;
  const height = Number.isFinite(dimensions?.height) ? dimensions.height : 0;
  if (!(width > 0 && height > 0)) {
    return "match_input_image";
  }

  const ratio = width / height;
  const candidates = [
    ["1:1", 1 / 1],
    ["16:9", 16 / 9],
    ["9:16", 9 / 16],
    ["4:3", 4 / 3],
    ["3:4", 3 / 4],
    ["3:2", 3 / 2],
    ["2:3", 2 / 3]
  ];
  let bestLabel = "match_input_image";
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const [label, candidateRatio] of candidates) {
    const delta = Math.abs(candidateRatio - ratio);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestLabel = label;
    }
  }

  return bestDelta <= 0.02 ? bestLabel : "match_input_image";
}

async function parseReplicateImageResponseBuffer(payload) {
  if (!isPlainObject(payload)) {
    throw new Error("Replicate annotation response payload was malformed");
  }

  const outputCandidates = [];
  if (typeof payload.output === "string" && payload.output.trim()) {
    outputCandidates.push(payload.output.trim());
  }
  if (Array.isArray(payload.output)) {
    for (const item of payload.output) {
      if (typeof item === "string" && item.trim()) {
        outputCandidates.push(item.trim());
      } else if (isPlainObject(item) && typeof item.url === "string" && item.url.trim()) {
        outputCandidates.push(item.url.trim());
      }
    }
  }

  for (const candidateUrl of outputCandidates) {
    const dataBuffer = parseDataUrlImageBuffer(candidateUrl);
    if (dataBuffer) {
      return dataBuffer;
    }
  }

  for (const candidateUrl of outputCandidates) {
    if (!/^https?:\/\//i.test(candidateUrl)) {
      continue;
    }
    const response = await fetch(candidateUrl);
    if (!response.ok) {
      continue;
    }
    const imageArrayBuffer = await response.arrayBuffer();
    return Buffer.from(imageArrayBuffer);
  }

  throw new Error("Replicate annotation response did not include an output image URL");
}

async function parseFalImageResponseBuffer(payload) {
  if (!isPlainObject(payload)) {
    throw new Error("Fal annotation response payload was malformed");
  }

  const imageUrlCandidates = [];
  if (Array.isArray(payload.images)) {
    for (const image of payload.images) {
      if (isPlainObject(image) && typeof image.url === "string" && image.url.trim()) {
        imageUrlCandidates.push(image.url.trim());
      }
    }
  }
  if (isPlainObject(payload.image) && typeof payload.image.url === "string" && payload.image.url.trim()) {
    imageUrlCandidates.push(payload.image.url.trim());
  }
  if (typeof payload.url === "string" && payload.url.trim()) {
    imageUrlCandidates.push(payload.url.trim());
  }

  for (const candidateUrl of imageUrlCandidates) {
    const dataBuffer = parseDataUrlImageBuffer(candidateUrl);
    if (dataBuffer) {
      return dataBuffer;
    }
  }

  for (const candidateUrl of imageUrlCandidates) {
    if (!/^https?:\/\//i.test(candidateUrl)) {
      continue;
    }
    const response = await fetch(candidateUrl);
    if (!response.ok) {
      continue;
    }
    const imageArrayBuffer = await response.arrayBuffer();
    return Buffer.from(imageArrayBuffer);
  }

  throw new Error("Fal annotation response did not include an image URL");
}

async function requestYellowBoxAnnotationWithReplicate({
  imageBuffer,
  targetDescription,
  apiKey,
  model,
  baseUrl,
  timeoutMs
}) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    throw new Error("Cannot annotate coordinates without a screenshot buffer");
  }
  if (!apiKey) {
    throw new Error("Replicate API key is missing for coordinate annotation");
  }

  const resolvedModel = sanitizeString(model, 256) || DEFAULT_REPLICATE_COORDINATE_ANNOTATION_MODEL;
  const normalizedModelPath = resolvedModel.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!normalizedModelPath.includes("/")) {
    throw new Error("Replicate model must be in owner/name format");
  }

  const requestBody = {
    input: {
      prompt: buildYellowBoxPrompt(targetDescription),
      resolution: "1K",
      image_input: [`data:image/png;base64,${imageBuffer.toString("base64")}`],
      aspect_ratio: inferReplicateAspectRatio(imageBuffer),
      image_search: false,
      google_search: false,
      output_format: "png"
    }
  };

  const abortController = new AbortController();
  const effectiveTimeoutMs =
    Number.isFinite(timeoutMs) && timeoutMs >= 1000
      ? Math.floor(timeoutMs)
      : DEFAULT_COORDINATE_ANNOTATION_TIMEOUT_MS;
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, effectiveTimeoutMs);

  try {
    const response = await fetch(`${baseUrl}/models/${normalizedModelPath}/predictions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        Prefer: "wait"
      },
      body: JSON.stringify(requestBody),
      signal: abortController.signal
    });

    if (!response.ok) {
      const errorText = truncateText(await response.text(), 320);
      throw new Error(`Replicate annotation request failed (${response.status}): ${errorText}`);
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      throw new Error("Replicate annotation response was not valid JSON");
    }

    if (typeof payload?.status === "string" && payload.status.toLowerCase() === "failed") {
      const errorMessage = sanitizeString(payload?.error, 320) || "Replicate prediction failed";
      throw new Error(`Replicate annotation prediction failed: ${errorMessage}`);
    }
    if (typeof payload?.status === "string" && payload.status.toLowerCase() === "canceled") {
      throw new Error("Replicate annotation prediction was canceled");
    }

    return parseReplicateImageResponseBuffer(payload);
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`Replicate annotation request timed out after ${effectiveTimeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function requestYellowBoxAnnotationWithFal({
  imageBuffer,
  targetDescription,
  apiKey,
  model,
  baseUrl,
  timeoutMs
}) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    throw new Error("Cannot annotate coordinates without a screenshot buffer");
  }
  if (!apiKey) {
    throw new Error("Fal API key is missing for coordinate annotation");
  }

  const resolvedModel = sanitizeString(model, 256) || DEFAULT_FAL_COORDINATE_ANNOTATION_MODEL;
  const normalizedModelPath = resolvedModel.replace(/^\/+/, "");
  const requestBody = {
    prompt: buildYellowBoxPrompt(targetDescription),
    image_urls: [`data:image/png;base64,${imageBuffer.toString("base64")}`],
    output_format: "png",
    sync_mode: true
  };

  const abortController = new AbortController();
  const effectiveTimeoutMs =
    Number.isFinite(timeoutMs) && timeoutMs >= 1000
      ? Math.floor(timeoutMs)
      : DEFAULT_COORDINATE_ANNOTATION_TIMEOUT_MS;
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, effectiveTimeoutMs);

  try {
    const response = await fetch(`${baseUrl}/${normalizedModelPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${apiKey}`
      },
      body: JSON.stringify(requestBody),
      signal: abortController.signal
    });

    if (!response.ok) {
      const errorText = truncateText(await response.text(), 320);
      throw new Error(`Fal annotation request failed (${response.status}): ${errorText}`);
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      throw new Error("Fal annotation response was not valid JSON");
    }

    return parseFalImageResponseBuffer(payload);
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`Fal annotation request timed out after ${effectiveTimeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function requestYellowBoxAnnotationWithGemini({
  imageBuffer,
  targetDescription,
  apiKey,
  model,
  baseUrl,
  timeoutMs
}) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    throw new Error("Cannot annotate coordinates without a screenshot buffer");
  }
  if (!apiKey) {
    throw new Error("Gemini API key is missing for coordinate annotation");
  }

  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: buildYellowBoxPrompt(targetDescription)
          },
          {
            inlineData: {
              mimeType: "image/png",
              data: imageBuffer.toString("base64")
            }
          }
        ]
      }
    ],
    generationConfig: {
      responseModalities: ["IMAGE"]
    }
  };

  const abortController = new AbortController();
  const effectiveTimeoutMs =
    Number.isFinite(timeoutMs) && timeoutMs >= 1000
      ? Math.floor(timeoutMs)
      : DEFAULT_COORDINATE_ANNOTATION_TIMEOUT_MS;
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, effectiveTimeoutMs);

  try {
    const response = await fetch(`${baseUrl}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify(requestBody),
      signal: abortController.signal
    });

    if (!response.ok) {
      const errorText = truncateText(await response.text(), 320);
      throw new Error(`Gemini annotation request failed (${response.status}): ${errorText}`);
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      throw new Error("Gemini annotation response was not valid JSON");
    }

    return parseGeminiImageResponseBuffer(payload);
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`Gemini annotation request timed out after ${effectiveTimeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function requestYellowBoxAnnotationWithOpenAi({
  imageBuffer,
  targetDescription,
  apiKey,
  model,
  baseUrl,
  timeoutMs
}) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    throw new Error("Cannot annotate coordinates without a screenshot buffer");
  }
  if (!apiKey) {
    throw new Error("OpenAI API key is missing for coordinate annotation");
  }

  const formData = new FormData();
  formData.append("model", model || DEFAULT_COORDINATE_ANNOTATION_MODEL);
  formData.append("prompt", buildYellowBoxPrompt(targetDescription));
  formData.append("response_format", "b64_json");
  formData.append("image", new Blob([imageBuffer], { type: "image/png" }), "screenshot.png");

  const abortController = new AbortController();
  const effectiveTimeoutMs =
    Number.isFinite(timeoutMs) && timeoutMs >= 1000
      ? Math.floor(timeoutMs)
      : DEFAULT_COORDINATE_ANNOTATION_TIMEOUT_MS;
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, effectiveTimeoutMs);

  try {
    const response = await fetch(`${baseUrl}/images/edits`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: formData,
      signal: abortController.signal
    });

    if (!response.ok) {
      const errorText = truncateText(await response.text(), 320);
      throw new Error(`Annotation request failed (${response.status}): ${errorText}`);
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      throw new Error("Annotation response was not valid JSON");
    }

    return parseOpenAiImageEditResponseImageBuffer(payload);
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`Annotation request timed out after ${effectiveTimeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function isLikelyYellowPixel(r, g, b, a = 255) {
  return a >= 180 && r >= 205 && g >= 205 && b <= 125 && Math.abs(r - g) <= 45;
}

function shouldIncludeYellowDiffPixel(beforeOffset, afterOffset, beforeData, afterData) {
  const afterR = afterData[afterOffset];
  const afterG = afterData[afterOffset + 1];
  const afterB = afterData[afterOffset + 2];
  const afterA = afterData[afterOffset + 3];

  if (!isLikelyYellowPixel(afterR, afterG, afterB, afterA)) {
    return false;
  }

  const beforeR = beforeData[beforeOffset];
  const beforeG = beforeData[beforeOffset + 1];
  const beforeB = beforeData[beforeOffset + 2];
  const beforeA = beforeData[beforeOffset + 3];
  const beforeWasYellow = isLikelyYellowPixel(beforeR, beforeG, beforeB, beforeA);
  const delta =
    Math.abs(afterR - beforeR) +
    Math.abs(afterG - beforeG) +
    Math.abs(afterB - beforeB) +
    Math.abs(afterA - beforeA);

  if (beforeWasYellow && delta < 90) {
    return false;
  }

  return delta >= 65 || !beforeWasYellow;
}

function extractYellowBoxFromAnnotatedDiff(beforeImageBuffer, annotatedImageBuffer, options = {}) {
  if (!Buffer.isBuffer(beforeImageBuffer) || beforeImageBuffer.length === 0) {
    throw new Error("Original screenshot buffer is empty");
  }
  if (!Buffer.isBuffer(annotatedImageBuffer) || annotatedImageBuffer.length === 0) {
    throw new Error("Annotated screenshot buffer is empty");
  }

  const decodePng = typeof options.decodePng === "function" ? options.decodePng : decodePngToRgba;
  let beforePng = null;
  let afterPng = null;
  try {
    beforePng = decodePng(beforeImageBuffer);
    afterPng = decodePng(annotatedImageBuffer);
  } catch (error) {
    throw new Error(`Failed to decode annotation image as PNG: ${error.message || "Unknown error"}`);
  }

  if (!beforePng || !afterPng || beforePng.width <= 0 || beforePng.height <= 0 || afterPng.width <= 0 || afterPng.height <= 0) {
    throw new Error("Annotation image metadata is invalid");
  }

  const dimensionsMatch = beforePng.width === afterPng.width && beforePng.height === afterPng.height;
  const width = afterPng.width;
  const height = afterPng.height;
  const totalPixels = width * height;
  const mask = new Uint8Array(totalPixels);
  const visited = new Uint8Array(totalPixels);
  const afterData = afterPng.data;
  const beforeData = beforePng.data;

  if (dimensionsMatch) {
    for (let pixelIndex = 0; pixelIndex < totalPixels; pixelIndex += 1) {
      const rgbaOffset = pixelIndex * 4;
      if (shouldIncludeYellowDiffPixel(rgbaOffset, rgbaOffset, beforeData, afterData)) {
        mask[pixelIndex] = 1;
      }
    }
  } else {
    for (let pixelIndex = 0; pixelIndex < totalPixels; pixelIndex += 1) {
      const rgbaOffset = pixelIndex * 4;
      if (
        isLikelyYellowPixel(
          afterData[rgbaOffset],
          afterData[rgbaOffset + 1],
          afterData[rgbaOffset + 2],
          afterData[rgbaOffset + 3]
        )
      ) {
        mask[pixelIndex] = 1;
      }
    }
  }

  let bestComponent = null;
  const queue = [];

  for (let index = 0; index < totalPixels; index += 1) {
    if (!mask[index] || visited[index]) {
      continue;
    }

    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let pixelCount = 0;

    queue.push(index);
    visited[index] = 1;

    while (queue.length > 0) {
      const current = queue.pop();
      pixelCount += 1;

      const x = current % width;
      const y = (current - x) / width;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;

      const left = x > 0 ? current - 1 : -1;
      const right = x + 1 < width ? current + 1 : -1;
      const up = y > 0 ? current - width : -1;
      const down = y + 1 < height ? current + width : -1;

      if (left >= 0 && mask[left] && !visited[left]) {
        visited[left] = 1;
        queue.push(left);
      }
      if (right >= 0 && mask[right] && !visited[right]) {
        visited[right] = 1;
        queue.push(right);
      }
      if (up >= 0 && mask[up] && !visited[up]) {
        visited[up] = 1;
        queue.push(up);
      }
      if (down >= 0 && mask[down] && !visited[down]) {
        visited[down] = 1;
        queue.push(down);
      }
    }

    if (!bestComponent || pixelCount > bestComponent.pixel_count) {
      bestComponent = {
        left: minX,
        top: minY,
        right: maxX,
        bottom: maxY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
        center_x: Math.round((minX + maxX) / 2),
        center_y: Math.round((minY + maxY) / 2),
        pixel_count: pixelCount
      };
    }
  }

  if (!bestComponent || bestComponent.pixel_count < 16) {
    throw new Error("No reliable yellow bounding box was detected in annotation diff");
  }

  if (dimensionsMatch) {
    return bestComponent;
  }

  const scaleX = beforePng.width / afterPng.width;
  const scaleY = beforePng.height / afterPng.height;
  const clamp = (value, max) => Math.max(0, Math.min(max, value));

  const scaledLeft = clamp(Math.round(bestComponent.left * scaleX), beforePng.width - 1);
  const scaledTop = clamp(Math.round(bestComponent.top * scaleY), beforePng.height - 1);
  const scaledRight = clamp(Math.round(bestComponent.right * scaleX), beforePng.width - 1);
  const scaledBottom = clamp(Math.round(bestComponent.bottom * scaleY), beforePng.height - 1);

  const normalizedLeft = Math.min(scaledLeft, scaledRight);
  const normalizedTop = Math.min(scaledTop, scaledBottom);
  const normalizedRight = Math.max(scaledLeft, scaledRight);
  const normalizedBottom = Math.max(scaledTop, scaledBottom);

  return {
    left: normalizedLeft,
    top: normalizedTop,
    right: normalizedRight,
    bottom: normalizedBottom,
    width: normalizedRight - normalizedLeft + 1,
    height: normalizedBottom - normalizedTop + 1,
    center_x: Math.round((normalizedLeft + normalizedRight) / 2),
    center_y: Math.round((normalizedTop + normalizedBottom) / 2),
    pixel_count: bestComponent.pixel_count,
    source_width: beforePng.width,
    source_height: beforePng.height,
    annotated_width: afterPng.width,
    annotated_height: afterPng.height,
    scaled_from_resized_annotation: true
  };
}

function toClickToolModelOutput(result) {
  if (!result || !result.success) {
    return {
      type: "content",
      value: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: result?.error || "Click failed"
          })
        }
      ]
    };
  }

  const content = [
    {
      type: "text",
      text: JSON.stringify({
        success: true,
        describe: result.describe,
        coordinates: result.coordinates,
        fallback_used: Boolean(result.fallback_used)
      })
    }
  ];
  if (typeof result.screenshotBase64 === "string" && result.screenshotBase64.trim()) {
    content.push({
      type: "media",
      mediaType: "image/png",
      data: result.screenshotBase64
    });
  }

  return {
    type: "content",
    value: content
  };
}

function createCoordinateAwareClickTool({
  stagehand,
  runLog,
  artifacts,
  resolvedModule,
  coordinateFallbackConfig,
  modelProvider
}) {
  if (!stagehand || !resolvedModule || typeof resolvedModule.tool !== "function") {
    return null;
  }

  let z = null;
  try {
    z = require("zod").z;
  } catch {
    return null;
  }

  if (!z) {
    return null;
  }

  const provider = sanitizeString(modelProvider, 64).toLowerCase();
  const localizeBox = resolveLocalizeBoxClient(coordinateFallbackConfig);

  return resolvedModule.tool({
    description:
      "Click on an element using coordinates. If supplied coordinates fail, recover coordinates via configured screenshot localization strategies.",
    inputSchema: z.object({
      describe: z
        .string()
        .describe(
          "Describe the element to click in a short, specific phrase (element type + visible label or context)."
        ),
      coordinates: z.array(z.number()).length(2).describe("The (x, y) coordinates to click.")
    }),
    execute: async ({ describe, coordinates }) => {
      const clickDescription = sanitizeString(describe, 280) || "requested element";

      let page = null;
      try {
        page = await resolveActiveStagehandPage(stagehand);
      } catch (error) {
        return {
          success: false,
          error: `Error clicking: failed to get active page (${error.message || "Unknown error"})`
        };
      }
      if (!page) {
        return {
          success: false,
          error: "Error clicking: active page is unavailable"
        };
      }

      let firstAttemptCoordinates = null;
      try {
        firstAttemptCoordinates = await normalizeClickCoordinatesForProvider(coordinates, provider, page);
      } catch (error) {
        return {
          success: false,
          error: `Error clicking: ${error.message || "Invalid coordinates"}`
        };
      }

      const ensureFallbackArtifact = () => {
        if (isPlainObject(artifacts.coordinate_click_fallback)) {
          return;
        }
        artifacts.coordinate_click_fallback = {
          enabled: true,
          mode: coordinateFallbackConfig.mode || DEFAULT_COORDINATE_CLICK_FALLBACK_MODE,
          provider: coordinateFallbackConfig.provider || null,
          model: coordinateFallbackConfig.model || null,
          strategy: coordinateFallbackConfig.strategy || "yellow_box_diff",
          invoked: 0,
          resolved: 0,
          failed: 0
        };
      };

      const attemptAnnotatedClick = async (reasonTag, primaryErrorMessage) => {
        if (typeof localizeBox !== "function") {
          throw new Error("Coordinate localization client is unavailable");
        }

        ensureFallbackArtifact();
        artifacts.coordinate_click_fallback.invoked += 1;
        appendRunLog(runLog, "agent_click_coordinate_fallback_started", {
          reason: reasonTag,
          describe: clickDescription,
          initial_coordinates: [firstAttemptCoordinates.x, firstAttemptCoordinates.y],
          provider: coordinateFallbackConfig.provider || null,
          model: coordinateFallbackConfig.model || null,
          strategy: coordinateFallbackConfig.strategy || null,
          localization_order: Array.isArray(coordinateFallbackConfig.localizationOrder)
            ? coordinateFallbackConfig.localizationOrder
            : []
        });

        try {
          const sourceScreenshot = await page.screenshot({
            fullPage: false,
            type: "png",
            scale: "css"
          });
          if (!Buffer.isBuffer(sourceScreenshot) || sourceScreenshot.length === 0) {
            throw new Error("Failed to capture source screenshot for fallback");
          }

          const localization = await localizeBox({
            imageBuffer: sourceScreenshot,
            targetDescription: clickDescription
          });
          const box = localization?.box;
          if (!isPlainObject(box)) {
            throw new Error("Coordinate localization did not return a valid box");
          }

          await page.click(box.center_x, box.center_y);
          const screenshotBase64 = await waitAndCaptureActionScreenshotBase64(page);

          artifacts.coordinate_click_fallback.resolved += 1;
          appendRunLog(runLog, "agent_click_coordinate_fallback_succeeded", {
            reason: reasonTag,
            describe: clickDescription,
            fallback_coordinates: [box.center_x, box.center_y],
            strategy: localization.strategy || null,
            provider: localization.provider || null,
            model: localization.model || null,
            attempts: Array.isArray(localization.attempts) ? localization.attempts : [],
            box
          });

          return {
            success: true,
            describe: clickDescription,
            coordinates: [box.center_x, box.center_y],
            fallback_used: true,
            fallback_box: box,
            fallback_strategy: localization.strategy || null,
            screenshotBase64
          };
        } catch (fallbackError) {
          artifacts.coordinate_click_fallback.failed += 1;
          appendRunLog(runLog, "agent_click_coordinate_fallback_failed", {
            reason: reasonTag,
            describe: clickDescription,
            initial_error: primaryErrorMessage || null,
            fallback_error: fallbackError.message || "Unknown fallback error"
          });
          throw fallbackError;
        }
      };

      if (coordinateFallbackConfig.mode === "always" && typeof localizeBox === "function") {
        try {
          return await attemptAnnotatedClick("always", null);
        } catch {
          // Continue with direct coordinate click when always-mode annotation fails unexpectedly.
        }
      }

      try {
        await page.click(firstAttemptCoordinates.x, firstAttemptCoordinates.y);
        const screenshotBase64 = await waitAndCaptureActionScreenshotBase64(page);
        return {
          success: true,
          describe: clickDescription,
          coordinates: [firstAttemptCoordinates.x, firstAttemptCoordinates.y],
          fallback_used: false,
          screenshotBase64
        };
      } catch (primaryError) {
        if (typeof localizeBox !== "function") {
          return {
            success: false,
            error: `Error clicking: ${primaryError.message || "Primary click failed"}`
          };
        }

        try {
          return await attemptAnnotatedClick("on_error", primaryError.message || "Primary click failed");
        } catch (fallbackError) {
          return {
            success: false,
            error: `Error clicking: ${primaryError.message || "Primary click failed"}; fallback error: ${
              fallbackError.message || "Unknown fallback error"
            }`
          };
        }
      }
    },
    toModelOutput: toClickToolModelOutput
  });
}

async function closeStagehand(stagehand, runLog) {
  if (!stagehand || typeof stagehand.close !== "function") {
    return;
  }

  try {
    await stagehand.close();
    appendRunLog(runLog, "stagehand_closed");
  } catch (error) {
    appendRunLog(runLog, "stagehand_close_failed", { message: error.message || "Unknown error" });
  }
}

async function resolveActiveStagehandPage(stagehand) {
  const context = stagehand?.context;
  if (!context || typeof context !== "object") {
    return null;
  }

  try {
    if (typeof context.awaitActivePage === "function") {
      const page = await context.awaitActivePage(2000);
      if (page) {
        return page;
      }
    }
  } catch {
    // Fall back to activePage() when awaitActivePage is unavailable or times out.
  }

  try {
    if (typeof context.activePage === "function") {
      return context.activePage() || null;
    }
  } catch {
    return null;
  }

  return null;
}

async function captureInlineScreenshot(stagehand, artifacts, runLog, label, captureState) {
  if (!stagehand || !captureState || typeof captureState !== "object") {
    return false;
  }

  if (!Array.isArray(artifacts.captured_screenshots)) {
    artifacts.captured_screenshots = [];
  }

  if (artifacts.captured_screenshots.length >= captureState.maxCount) {
    return false;
  }

  const page = await resolveActiveStagehandPage(stagehand);
  if (!page || typeof page.screenshot !== "function") {
    return false;
  }

  try {
    const screenshotBuffer = await page.screenshot({ fullPage: false });
    return storeCapturedScreenshotBuffer(artifacts, runLog, captureState, label, screenshotBuffer);
  } catch (error) {
    appendRunLog(runLog, "inline_screenshot_capture_failed", {
      label,
      message: error.message || "Unknown screenshot capture error"
    });
    return false;
  }
}

function storeCapturedScreenshotBuffer(artifacts, runLog, captureState, label, screenshotBuffer) {
  if (!captureState || typeof captureState !== "object") {
    return false;
  }
  if (!Buffer.isBuffer(screenshotBuffer) || screenshotBuffer.length <= 0) {
    return false;
  }
  if (captureState.capturedBytes + screenshotBuffer.length > captureState.maxBytes) {
    return false;
  }

  const screenshotDataUrl = toDataUrlFromBuffer(screenshotBuffer);
  if (!screenshotDataUrl) {
    return false;
  }

  captureState.capturedBytes += screenshotBuffer.length;
  artifacts.captured_screenshots.push(screenshotDataUrl);
  appendRunLog(runLog, "inline_screenshot_captured", {
    label,
    size_bytes: screenshotBuffer.length,
    screenshot_count: artifacts.captured_screenshots.length
  });

  return true;
}

function parsePositiveIntegerSetting(rawValue, fallbackValue) {
  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallbackValue;
  }
  return Math.floor(numeric);
}

async function waitForPageReadyForAgent(page, options = {}) {
  if (!page || typeof page.evaluate !== "function") {
    return {
      ready: false,
      waited_ms: 0,
      snapshot: null
    };
  }

  const timeoutMs = parsePositiveIntegerSetting(
    options.pageReadyTimeoutMs || process.env.QA_STAGEHAND_PAGE_READY_TIMEOUT_MS,
    15000
  );
  const pollIntervalMs = parsePositiveIntegerSetting(
    options.pageReadyPollMs || process.env.QA_STAGEHAND_PAGE_READY_POLL_MS,
    500
  );

  const startedAt = Date.now();
  let lastSnapshot = null;

  while (Date.now() - startedAt <= timeoutMs) {
    try {
      const snapshot = await page.evaluate(() => {
        const root = document.querySelector("#root");
        const normalizeText = (value) =>
          String(value || "")
            .replace(/\s+/g, " ")
            .trim();

        const bodyText = normalizeText(document.body?.innerText);
        const rootText = normalizeText(root?.textContent);
        const combinedText = `${bodyText} ${rootText}`.toLowerCase();
        const loadingLike = /(loading|please wait|initializing|one moment)/i.test(combinedText);
        const actionableCount = document.querySelectorAll(
          "button, input, textarea, select, a[href], [role='button']"
        ).length;

        return {
          href: String(location.href || ""),
          title: String(document.title || ""),
          ready_state: String(document.readyState || ""),
          body_text_length: bodyText.length,
          root_text_length: rootText.length,
          actionable_count: actionableCount,
          loading_like: loadingLike
        };
      });

      lastSnapshot = snapshot;
      const hasSubstantialText = snapshot.body_text_length >= 120 || snapshot.root_text_length >= 120;
      const hasActionableUi = snapshot.actionable_count >= 2;
      const notLikelyLoading = !snapshot.loading_like || snapshot.body_text_length >= 60;

      if ((hasSubstantialText || hasActionableUi) && notLikelyLoading) {
        return {
          ready: true,
          waited_ms: Date.now() - startedAt,
          snapshot
        };
      }
    } catch (error) {
      lastSnapshot = {
        evaluation_error: error.message || "Unknown page readiness evaluation error"
      };
    }

    await sleep(pollIntervalMs);
  }

  return {
    ready: false,
    waited_ms: Date.now() - startedAt,
    snapshot: lastSnapshot
  };
}

async function navigateToTargetForCapture(stagehand, targetUrl, runLog, options = {}) {
  const url = sanitizeString(targetUrl, 4096);
  if (!url) {
    return false;
  }

  const page = await resolveActiveStagehandPage(stagehand);
  if (!page || typeof page.goto !== "function") {
    return false;
  }

  try {
    const waitUntil = sanitizeString(
      options.pagePrimeWaitUntil || process.env.QA_STAGEHAND_PAGE_PRIME_WAIT_UNTIL,
      32
    );
    await page.goto(url, {
      waitUntil: waitUntil || "domcontentloaded"
    });

    let readiness = await waitForPageReadyForAgent(page, options);
    appendRunLog(runLog, "stagehand_page_prime_readiness", readiness);

    if (!readiness.ready) {
      appendRunLog(runLog, "stagehand_page_prime_retrying", {
        reason: "page_not_ready_after_initial_wait",
        url
      });
      await page.reload({
        waitUntil: waitUntil || "domcontentloaded"
      });
      readiness = await waitForPageReadyForAgent(page, options);
      appendRunLog(runLog, "stagehand_page_prime_readiness_after_retry", readiness);
    }

    appendRunLog(runLog, "stagehand_page_primed", { url });
    return true;
  } catch (error) {
    appendRunLog(runLog, "stagehand_page_prime_failed", {
      url,
      message: error.message || "Unknown navigation error"
    });
    return false;
  }
}

function resolvePageUrl(page, fallbackUrl = "") {
  if (!page || typeof page.url !== "function") {
    return fallbackUrl;
  }
  const current = sanitizeString(page.url(), 4096);
  return current || fallbackUrl;
}

function parseFirstJsonObject(rawText) {
  const text = sanitizeString(rawText, 200000);
  if (!text) {
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    if (isPlainObject(parsed)) {
      return parsed;
    }
  } catch {
    // Continue with substring extraction.
  }

  const startIndex = text.indexOf("{");
  const endIndex = text.lastIndexOf("}");
  if (startIndex < 0 || endIndex <= startIndex) {
    return null;
  }

  try {
    const parsed = JSON.parse(text.slice(startIndex, endIndex + 1));
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function extractResponseOutputText(payload) {
  if (!isPlainObject(payload)) {
    return "";
  }
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const parts = [];
  if (Array.isArray(payload.output)) {
    for (const outputItem of payload.output) {
      const content = Array.isArray(outputItem?.content) ? outputItem.content : [];
      for (const item of content) {
        if (typeof item?.text === "string" && item.text.trim()) {
          parts.push(item.text.trim());
        }
      }
    }
  }

  return parts.join("\n").trim();
}

function extractChatCompletionOutputText(payload) {
  if (!isPlainObject(payload) || !Array.isArray(payload.choices) || payload.choices.length === 0) {
    return "";
  }
  const content = payload.choices[0]?.message?.content;
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    const parts = [];
    for (const entry of content) {
      if (typeof entry?.text === "string" && entry.text.trim()) {
        parts.push(entry.text.trim());
      }
    }
    return parts.join("\n").trim();
  }
  return "";
}

function formatVisionHistoryForPrompt(history, maxItems = DEFAULT_VISION_HISTORY_ITEMS) {
  if (!Array.isArray(history) || history.length === 0) {
    return "- none yet";
  }
  const recent = history.slice(-Math.max(1, maxItems));
  return recent
    .map((item) => {
      const step = Number.isFinite(item?.step) ? item.step : "?";
      const action = sanitizeString(item?.action, 32) || "unknown";
      const target = sanitizeString(item?.target, 140) || "-";
      const outcome = sanitizeString(item?.outcome, 200) || "no outcome";
      const url = sanitizeString(item?.url, 240) || "-";
      return `- step ${step}: action=${action}, target=${target}, outcome=${outcome}, url=${url}`;
    })
    .join("\n");
}

function buildVisionPlannerPrompt({
  runRequest,
  step,
  currentUrl,
  historyText
}) {
  const objective = sanitizeString(runRequest?.metadata?.goal, 1000) || "Complete the assigned QA objective.";
  const scenarios = Array.isArray(runRequest?.scenario_list)
    ? runRequest.scenario_list
        .map((item) => sanitizeString(item, 400))
        .filter(Boolean)
        .slice(0, 8)
    : [];
  const scenarioText = scenarios.length ? scenarios.map((item) => `- ${item}`).join("\n") : "- none";

  return [
    "You are controlling a browser only through screenshots and primitive actions.",
    "Rules:",
    "- Use only visible evidence from the screenshot.",
    "- Never assume hidden DOM state.",
    "- Prefer concrete targets visible on screen (button labels, nav items, fields).",
    "- If blocked repeatedly, return action=fail with concise reason.",
    "- Do not stop because of step count. Stop only by returning action=done or action=fail.",
    "- Return EXACTLY one JSON object and nothing else.",
    "",
    "JSON schema:",
    "{",
    '  "action": "click|type|press|scroll|wait|navigate|new_tab|switch_tab|done|fail",',
    '  "target": "short visible target description",',
    '  "text": "text to type when action=type",',
    '  "key": "keyboard key when action=press",',
    '  "url": "absolute URL for navigate/new_tab when needed",',
    '  "direction": "up|down when action=scroll",',
    '  "amount": 700,',
    '  "tab_index": 0,',
    '  "reason": "why this next action",',
    '  "success_criteria": "what should change after this action"',
    "}",
    "",
    `Step: ${step}`,
    `Current URL: ${sanitizeString(currentUrl, 4096) || runRequest.target_url || "-"}`,
    `Objective: ${objective}`,
    "Scenario checklist:",
    scenarioText,
    "Recent action history:",
    historyText
  ].join("\n");
}

async function requestVisionPlannerDecisionWithResponses({
  apiKey,
  baseUrl,
  model,
  prompt,
  screenshotDataUrl,
  timeoutMs
}) {
  const abortController = new AbortController();
  const effectiveTimeoutMs =
    Number.isFinite(timeoutMs) && timeoutMs >= 1000 ? Math.floor(timeoutMs) : DEFAULT_VISION_STEP_TIMEOUT_MS;
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, effectiveTimeoutMs);

  try {
    const response = await fetch(`${baseUrl}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: "Plan the next UI action from screenshot pixels only. Return one JSON object."
              }
            ]
          },
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              { type: "input_image", image_url: screenshotDataUrl }
            ]
          }
        ],
        max_output_tokens: 350
      }),
      signal: abortController.signal
    });

    if (!response.ok) {
      const body = truncateText(await response.text(), 320);
      throw new Error(`responses endpoint failed (${response.status}): ${body}`);
    }

    const payload = await response.json();
    const text = extractResponseOutputText(payload);
    if (!text) {
      throw new Error("responses endpoint returned no text output");
    }
    return text;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`responses endpoint timed out after ${effectiveTimeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function requestVisionPlannerDecisionWithChatCompletions({
  apiKey,
  baseUrl,
  model,
  prompt,
  screenshotDataUrl,
  timeoutMs
}) {
  const abortController = new AbortController();
  const effectiveTimeoutMs =
    Number.isFinite(timeoutMs) && timeoutMs >= 1000 ? Math.floor(timeoutMs) : DEFAULT_VISION_STEP_TIMEOUT_MS;
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, effectiveTimeoutMs);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "Plan the next UI action from screenshot pixels only. Return one JSON object."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt
              },
              {
                type: "image_url",
                image_url: {
                  url: screenshotDataUrl
                }
              }
            ]
          }
        ],
        max_tokens: 350
      }),
      signal: abortController.signal
    });

    if (!response.ok) {
      const body = truncateText(await response.text(), 320);
      throw new Error(`chat completions endpoint failed (${response.status}): ${body}`);
    }

    const payload = await response.json();
    const text = extractChatCompletionOutputText(payload);
    if (!text) {
      throw new Error("chat completions endpoint returned no text output");
    }
    return text;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`chat completions endpoint timed out after ${effectiveTimeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeVisionPlannerDecision(rawDecision) {
  const parsed = isPlainObject(rawDecision) ? rawDecision : parseFirstJsonObject(rawDecision);
  if (!parsed) {
    throw new Error("Planner did not return valid JSON");
  }

  const allowedActions = new Set([
    "click",
    "type",
    "press",
    "scroll",
    "wait",
    "navigate",
    "new_tab",
    "switch_tab",
    "done",
    "fail"
  ]);
  const action = sanitizeString(parsed.action, 32).toLowerCase();
  if (!allowedActions.has(action)) {
    throw new Error(`Planner returned unsupported action: ${action || "missing"}`);
  }

  const amountRaw = Number(parsed.amount);
  const amount = Number.isFinite(amountRaw) ? Math.floor(amountRaw) : 0;
  const tabIndexRaw = Number(parsed.tab_index);
  const tabIndex = Number.isFinite(tabIndexRaw) ? Math.floor(tabIndexRaw) : null;
  const submit = parseBooleanSetting(parsed.submit, false);

  return {
    action,
    target: sanitizeString(parsed.target, 220),
    text: sanitizeString(parsed.text, 2000),
    key: sanitizeString(parsed.key, 64),
    url: sanitizeString(parsed.url, 4096),
    direction: sanitizeString(parsed.direction, 16).toLowerCase() || "down",
    amount,
    tab_index: tabIndex,
    reason: sanitizeString(parsed.reason, 400),
    success_criteria: sanitizeString(parsed.success_criteria, 600),
    submit
  };
}

async function requestVisionPlannerDecision({
  apiKey,
  baseUrl,
  model,
  prompt,
  screenshotDataUrl,
  timeoutMs
}) {
  const errors = [];

  try {
    const text = await requestVisionPlannerDecisionWithResponses({
      apiKey,
      baseUrl,
      model,
      prompt,
      screenshotDataUrl,
      timeoutMs
    });
    return normalizeVisionPlannerDecision(text);
  } catch (error) {
    errors.push(error.message || "responses endpoint failed");
  }

  try {
    const text = await requestVisionPlannerDecisionWithChatCompletions({
      apiKey,
      baseUrl,
      model,
      prompt,
      screenshotDataUrl,
      timeoutMs
    });
    return normalizeVisionPlannerDecision(text);
  } catch (error) {
    errors.push(error.message || "chat completions endpoint failed");
  }

  throw new Error(`Vision planner request failed. ${errors.join(" | ")}`);
}

function ensureCoordinateFallbackArtifact(artifacts, coordinateFallbackConfig) {
  if (isPlainObject(artifacts.coordinate_click_fallback)) {
    return artifacts.coordinate_click_fallback;
  }

  artifacts.coordinate_click_fallback = {
    enabled: Boolean(coordinateFallbackConfig?.enabled),
    reason: coordinateFallbackConfig?.reason || null,
    mode: coordinateFallbackConfig?.mode || DEFAULT_COORDINATE_CLICK_FALLBACK_MODE,
    provider: coordinateFallbackConfig?.provider || null,
    model: coordinateFallbackConfig?.model || null,
    strategy: coordinateFallbackConfig?.enabled ? coordinateFallbackConfig?.strategy || "yellow_box_diff" : null,
    invoked: 0,
    resolved: 0,
    failed: 0
  };
  return artifacts.coordinate_click_fallback;
}

async function clickWithVisionLocalization({
  page,
  targetDescription,
  coordinateFallbackConfig,
  artifacts,
  runLog,
  actionDelayMs
}) {
  if (!page || typeof page.screenshot !== "function") {
    throw new Error("Active page is unavailable for vision click");
  }
  const localizeBox = resolveLocalizeBoxClient(coordinateFallbackConfig);
  if (typeof localizeBox !== "function") {
    throw new Error("Coordinate localization client is unavailable for vision click");
  }

  const fallbackArtifact = ensureCoordinateFallbackArtifact(artifacts, coordinateFallbackConfig);
  fallbackArtifact.invoked += 1;
  appendRunLog(runLog, "agent_click_coordinate_fallback_started", {
    reason: "vision_only_click",
    describe: targetDescription,
    provider: coordinateFallbackConfig.provider || null,
    model: coordinateFallbackConfig.model || null,
    strategy: coordinateFallbackConfig.strategy || null,
    localization_order: Array.isArray(coordinateFallbackConfig.localizationOrder)
      ? coordinateFallbackConfig.localizationOrder
      : []
  });

  try {
    const sourceScreenshot = await page.screenshot({
      fullPage: false,
      type: "png",
      scale: "css"
    });
    if (!Buffer.isBuffer(sourceScreenshot) || sourceScreenshot.length <= 0) {
      throw new Error("Failed to capture source screenshot");
    }

    const localization = await localizeBox({
      imageBuffer: sourceScreenshot,
      targetDescription
    });
    let activeLocalization = localization;
    let box = activeLocalization?.box;
    if (!isPlainObject(box)) {
      throw new Error("Coordinate localization did not return a valid box");
    }

    const performClickAtBox = async (nextBox) => {
      if (page.mouse && typeof page.mouse.move === "function" && typeof page.mouse.click === "function") {
        await page.mouse.move(nextBox.center_x, nextBox.center_y, { steps: 6 });
        await page.mouse.click(nextBox.center_x, nextBox.center_y, { delay: 60 });
      } else if (typeof page.click === "function") {
        await page.click(nextBox.center_x, nextBox.center_y);
      } else {
        throw new Error("Page does not support coordinate click");
      }
    };

    try {
      await performClickAtBox(box);
    } catch (clickError) {
      const canEscalateToYellowBox =
        activeLocalization?.strategy === "ocr_qwen" && typeof coordinateFallbackConfig?.annotateImage === "function";
      if (!canEscalateToYellowBox) {
        throw clickError;
      }

      appendRunLog(runLog, "agent_click_coordinate_fallback_retrying", {
        reason: "vision_only_click",
        describe: targetDescription,
        from_strategy: activeLocalization.strategy || null,
        retry_strategy: "yellow_box_diff",
        click_error: clickError.message || "Unknown click error"
      });

      const retryLocalization = await localizeWithYellowBoxDiff({
        imageBuffer: sourceScreenshot,
        targetDescription,
        coordinateFallbackConfig
      });
      const retryBox = retryLocalization?.box;
      if (!isPlainObject(retryBox)) {
        throw clickError;
      }

      const retryAttempts = Array.isArray(activeLocalization?.attempts) ? activeLocalization.attempts.slice() : [];
      retryAttempts.push({
        strategy: activeLocalization.strategy || "ocr_qwen",
        error: `click_error: ${clickError.message || "Unknown click error"}`
      });

      activeLocalization = {
        ...retryLocalization,
        attempts: retryAttempts
      };
      box = retryBox;
      await performClickAtBox(box);
    }

    if (Number.isFinite(actionDelayMs) && actionDelayMs > 0) {
      await sleep(actionDelayMs);
    }

    fallbackArtifact.resolved += 1;
    appendRunLog(runLog, "agent_click_coordinate_fallback_succeeded", {
      reason: "vision_only_click",
      describe: targetDescription,
      strategy: activeLocalization.strategy || null,
      provider: activeLocalization.provider || null,
      model: activeLocalization.model || null,
      attempts: Array.isArray(activeLocalization.attempts) ? activeLocalization.attempts : [],
      fallback_coordinates: [box.center_x, box.center_y],
      box,
      metadata: isPlainObject(activeLocalization.metadata) ? activeLocalization.metadata : null
    });

    return {
      x: box.center_x,
      y: box.center_y,
      box
    };
  } catch (error) {
    fallbackArtifact.failed += 1;
    appendRunLog(runLog, "agent_click_coordinate_fallback_failed", {
      reason: "vision_only_click",
      describe: targetDescription,
      fallback_error: error.message || "Unknown fallback error"
    });
    throw error;
  }
}

async function typeIntoFocusedElement(page, text) {
  if (!page) {
    return false;
  }
  if (page.keyboard && typeof page.keyboard.type === "function") {
    await page.keyboard.type(text, { delay: 25 });
    return true;
  }
  if (page.keyboard && typeof page.keyboard.insertText === "function") {
    await page.keyboard.insertText(text);
    return true;
  }
  if (typeof page.evaluate === "function") {
    const inserted = await page.evaluate((value) => {
      const active = document.activeElement;
      if (!active) {
        return false;
      }

      const nextValue = String(value ?? "");
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        const previous = active.value || "";
        active.value = `${previous}${nextValue}`;
        active.dispatchEvent(new Event("input", { bubbles: true }));
        active.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }

      if (active.isContentEditable) {
        active.textContent = `${active.textContent || ""}${nextValue}`;
        active.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      }

      return false;
    }, text);

    if (inserted) {
      return true;
    }
  }

  return false;
}

async function typeIntoElementAtCoordinates(page, text, x, y) {
  if (!page || typeof page.evaluate !== "function") {
    return false;
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return false;
  }

  try {
    const inserted = await page.evaluate(
      ({ value, px, py }) => {
        const findEditableAtPoint = (x, y) => {
          const raw = document.elementFromPoint(x, y);
          if (!raw) {
            return null;
          }
          return raw.closest?.("input, textarea, [contenteditable='true'], [contenteditable='']") || raw;
        };

        const findNearestEditable = (x, y) => {
          const candidates = Array.from(
            document.querySelectorAll("input, textarea, [contenteditable='true'], [contenteditable='']")
          );
          if (!candidates.length) {
            return null;
          }

          let best = null;
          let bestScore = Infinity;
          for (const candidate of candidates) {
            const rect = candidate.getBoundingClientRect();
            if (!rect || rect.width < 4 || rect.height < 4) {
              continue;
            }
            const style = window.getComputedStyle(candidate);
            if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity || "1") < 0.1) {
              continue;
            }
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const dist = Math.hypot(cx - x, cy - y);
            const score = dist + (cy < y ? 140 : 0);
            if (score < bestScore) {
              best = candidate;
              bestScore = score;
            }
          }

          if (!best || bestScore > 520) {
            return null;
          }
          return best;
        };

        const editable = findEditableAtPoint(px, py) || findNearestEditable(px, py);
        if (!editable) {
          return false;
        }

        const tagName = String(editable.tagName || "").toUpperCase();
        const isInputLike = tagName === "INPUT" || tagName === "TEXTAREA";
        const isContentEditable = editable.isContentEditable === true;
        if (!isInputLike && !isContentEditable) {
          return false;
        }

        if (typeof editable.focus === "function") {
          editable.focus();
        }

        if (isInputLike) {
          editable.value = value;
        } else {
          editable.textContent = value;
        }

        const inputEvent = new Event("input", { bubbles: true });
        const changeEvent = new Event("change", { bubbles: true });
        editable.dispatchEvent(inputEvent);
        editable.dispatchEvent(changeEvent);
        return true;
      },
      { value: text, px: Math.round(x), py: Math.round(y) }
    );
    return Boolean(inserted);
  } catch {
    return false;
  }
}

function isLikelyTextFieldTarget(targetDescription) {
  const tokens = tokenizeTextForMatching(targetDescription);
  if (!tokens.length) {
    return false;
  }
  const trigger = new Set([
    "address",
    "email",
    "field",
    "input",
    "message",
    "name",
    "otp",
    "password",
    "phone",
    "text",
    "username"
  ]);
  return tokens.some((token) => trigger.has(token));
}

async function resolveEditableCenterNearPoint(page, x, y) {
  if (!page || typeof page.evaluate !== "function") {
    return null;
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  try {
    const point = await page.evaluate(
      ({ px, py }) => {
        const candidates = Array.from(
          document.querySelectorAll("input, textarea, [contenteditable='true'], [contenteditable='']")
        );
        if (!candidates.length) {
          return null;
        }

        let best = null;
        let bestScore = Infinity;
        for (const candidate of candidates) {
          const rect = candidate.getBoundingClientRect();
          if (!rect || rect.width < 4 || rect.height < 4) {
            continue;
          }
          const style = window.getComputedStyle(candidate);
          if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity || "1") < 0.1) {
            continue;
          }

          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const dist = Math.hypot(cx - px, cy - py);
          const score = dist + (cy < py ? 160 : 0);
          if (score < bestScore) {
            best = { x: Math.round(cx), y: Math.round(cy), score };
            bestScore = score;
          }
        }

        if (!best || best.score > 540) {
          return null;
        }
        return { x: best.x, y: best.y };
      },
      { px: Math.round(x), py: Math.round(y) }
    );

    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return null;
    }
    return { x: Math.round(point.x), y: Math.round(point.y) };
  } catch {
    return null;
  }
}

async function pressKeyWithFallback(page, key) {
  const resolvedKey = sanitizeString(key, 32) || "Enter";
  if (page?.keyboard && typeof page.keyboard.press === "function") {
    await page.keyboard.press(resolvedKey);
    return true;
  }

  if (typeof page?.evaluate === "function") {
    const dispatched = await page.evaluate((value) => {
      const active = document.activeElement || document.body || document.documentElement;
      if (!active) {
        return false;
      }
      const keydown = new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true });
      const keyup = new KeyboardEvent("keyup", { key: value, bubbles: true, cancelable: true });
      active.dispatchEvent(keydown);
      active.dispatchEvent(keyup);
      return true;
    }, resolvedKey);
    return Boolean(dispatched);
  }

  return false;
}

async function scrollWithFallback(page, amount) {
  const signedAmount = Number.isFinite(amount) && amount !== 0 ? amount : 900;
  if (page?.mouse && typeof page.mouse.wheel === "function") {
    await page.mouse.wheel(0, signedAmount);
    return true;
  }
  if (page?.keyboard && typeof page.keyboard.press === "function") {
    await page.keyboard.press(signedAmount < 0 ? "PageUp" : "PageDown");
    return true;
  }
  if (typeof page?.evaluate === "function") {
    const scrolled = await page.evaluate((deltaY) => {
      const before = Number(window.scrollY || 0);
      window.scrollBy(0, deltaY);
      const after = Number(window.scrollY || 0);
      return Math.abs(after - before) > 1;
    }, signedAmount);
    return Boolean(scrolled);
  }
  return false;
}

async function executeVisionStepAction({
  decision,
  pageRef,
  runRequest,
  coordinateFallbackConfig,
  artifacts,
  runLog,
  actionDelayMs
}) {
  const page = pageRef.current;
  if (!page) {
    throw new Error("No active browser page");
  }

  if (decision.action === "done" || decision.action === "fail") {
    return {
      terminal: true,
      status: decision.action,
      observation: decision.reason || decision.success_criteria || decision.action
    };
  }

  if (decision.action === "navigate") {
    const targetUrl = sanitizeString(decision.url, 4096) || sanitizeString(runRequest.target_url, 4096);
    if (!targetUrl) {
      throw new Error("navigate action requires a URL");
    }
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    await sleep(actionDelayMs);
    return {
      terminal: false,
      observation: `Navigated to ${targetUrl}`
    };
  }

  if (decision.action === "new_tab") {
    const context = typeof page.context === "function" ? page.context() : null;
    if (!context || typeof context.newPage !== "function") {
      throw new Error("new_tab action is unavailable in this browser context");
    }
    const nextPage = await context.newPage();
    if (decision.url) {
      await nextPage.goto(decision.url, { waitUntil: "domcontentloaded" });
    }
    if (typeof nextPage.bringToFront === "function") {
      await nextPage.bringToFront();
    }
    pageRef.current = nextPage;
    await sleep(actionDelayMs);
    return {
      terminal: false,
      observation: `Opened new tab${decision.url ? `: ${decision.url}` : ""}`
    };
  }

  if (decision.action === "switch_tab") {
    const context = typeof page.context === "function" ? page.context() : null;
    const pages = context && typeof context.pages === "function" ? context.pages() : [];
    if (!Array.isArray(pages) || pages.length === 0) {
      throw new Error("switch_tab failed because no tabs are available");
    }
    const requestedIndex = Number.isFinite(decision.tab_index) ? decision.tab_index : 0;
    const index = Math.max(0, Math.min(pages.length - 1, requestedIndex));
    const nextPage = pages[index];
    if (typeof nextPage?.bringToFront === "function") {
      await nextPage.bringToFront();
    }
    pageRef.current = nextPage;
    await sleep(Math.max(250, Math.floor(actionDelayMs / 2)));
    return {
      terminal: false,
      observation: `Switched to tab index ${index}`
    };
  }

  if (decision.action === "click") {
    const target = decision.target || "primary clickable control";
    const result = await clickWithVisionLocalization({
      page,
      targetDescription: target,
      coordinateFallbackConfig,
      artifacts,
      runLog,
      actionDelayMs
    });
    return {
      terminal: false,
      observation: `Clicked "${target}" at (${result.x}, ${result.y})`
    };
  }

  if (decision.action === "type") {
    const target = decision.target || "";
    let clickResult = null;
    if (target) {
      clickResult = await clickWithVisionLocalization({
        page,
        targetDescription: target,
        coordinateFallbackConfig,
        artifacts,
        runLog,
        actionDelayMs: Math.max(250, Math.floor(actionDelayMs / 2))
      });
    }
    const text = decision.text || "";
    if (!text) {
      throw new Error("type action requires non-empty text");
    }
    let typed = await typeIntoFocusedElement(page, text);
    if (!typed && clickResult && Number.isFinite(clickResult.x) && Number.isFinite(clickResult.y)) {
      typed = await typeIntoElementAtCoordinates(page, text, clickResult.x, clickResult.y);
    }
    if (!typed) {
      throw new Error(
        "type action is unavailable because no typing method is exposed (keyboard.type/insertText/focused element/element-at-coordinates fallback failed)"
      );
    }
    if (decision.submit && page.keyboard && typeof page.keyboard.press === "function") {
      await page.keyboard.press("Enter");
    }
    await sleep(actionDelayMs);
    return {
      terminal: false,
      observation: `Typed ${text.length} characters${target ? ` into "${target}"` : ""}`
    };
  }

  if (decision.action === "press") {
    const key = decision.key || "Enter";
    if (!page.keyboard || typeof page.keyboard.press !== "function") {
      throw new Error("press action is unavailable because keyboard.press is missing");
    }
    await page.keyboard.press(key);
    await sleep(Math.max(250, Math.floor(actionDelayMs / 2)));
    return {
      terminal: false,
      observation: `Pressed key "${key}"`
    };
  }

  if (decision.action === "scroll") {
    const rawAmount = Number.isFinite(decision.amount) && decision.amount !== 0 ? decision.amount : 900;
    const signedAmount = decision.direction === "up" ? -Math.abs(rawAmount) : Math.abs(rawAmount);
    if (page.mouse && typeof page.mouse.wheel === "function") {
      await page.mouse.wheel(0, signedAmount);
    } else if (page.keyboard && typeof page.keyboard.press === "function") {
      await page.keyboard.press(signedAmount < 0 ? "PageUp" : "PageDown");
    } else {
      throw new Error("scroll action is unavailable because mouse.wheel and keyboard.press are missing");
    }
    await sleep(Math.max(250, Math.floor(actionDelayMs / 2)));
    return {
      terminal: false,
      observation: `Scrolled ${decision.direction === "up" ? "up" : "down"} by ${Math.abs(signedAmount)}`
    };
  }

  if (decision.action === "wait") {
    const waitMs = parsePositiveIntegerSetting(decision.amount, actionDelayMs);
    await sleep(waitMs);
    return {
      terminal: false,
      observation: `Waited ${waitMs}ms`
    };
  }

  throw new Error(`Unsupported action: ${decision.action}`);
}

async function navigateToTargetForVisionMode(page, targetUrl, runLog) {
  const url = sanitizeString(targetUrl, 4096);
  if (!page || typeof page.goto !== "function" || !url) {
    return false;
  }
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    if (typeof page.bringToFront === "function") {
      await page.bringToFront().catch(() => {});
    }
    appendRunLog(runLog, "stagehand_page_primed", { url, strategy: "vision_only" });
    return true;
  } catch (error) {
    appendRunLog(runLog, "stagehand_page_prime_failed", {
      url,
      strategy: "vision_only",
      message: error.message || "Unknown navigation error"
    });
    return false;
  }
}

function buildVisionModeCandidateReport({
  runRequest,
  outcomeType,
  finalStatus,
  finalNote,
  issues,
  visitedPages,
  history,
  stepsExecuted
}) {
  const testedSteps = history
    .filter((entry) => entry?.result !== "planner_error")
    .slice(0, 12)
    .map((entry) => {
      const target = sanitizeString(entry.target, 140);
      return target ? `${entry.action}: ${target}` : `${entry.action}`;
    });

  const findings = Array.isArray(issues) ? issues.slice(0, 20) : [];
  if ((outcomeType === "product_blocked" || finalStatus === "failed" || finalStatus === "partial") && findings.length === 0) {
    findings.push({
      id: "finding-vision-blocked",
      type: outcomeType === "product_blocked" ? "confusion_point" : "dead_end",
      severity: "high",
      title: outcomeType === "product_blocked" ? "Persona got blocked in the product" : "Vision-only run blocked",
      expected_behavior:
        outcomeType === "product_blocked"
          ? "A real customer should be able to continue the requested flow."
          : "The agent should continue progressing through the requested QA flow.",
      observed_behavior:
        finalNote || "The run stopped before completing the requested flow due to repeated action failures.",
      emotional_reaction: {
        primary: "frustration",
        intensity: 3
      },
      repro_steps: [
        `Open ${sanitizeString(runRequest.target_url, 4096) || "the target URL"}.`,
        "Follow the primary conversion flow.",
        "Observe that the interaction loop stalls before the flow can complete."
      ],
      page: {
        url: Array.from(visitedPages)[0] || sanitizeString(runRequest.target_url, 4096) || null
      },
      evidence: {
        screenshots: []
      },
      fix_hint:
        "Review UI states where element localization or action execution repeatedly fails, and ensure key controls remain visually distinct and interactable."
    });
  }

  return {
    status: finalStatus,
    summary: {
      note:
        finalNote ||
        `Vision-only mode completed ${stepsExecuted} step(s) across ${visitedPages.size || 1} page(s).`,
      coverage: {
        pages_visited: Math.max(1, visitedPages.size),
        flows_tested: runRequest.scope_mode === "feature_targeted" ? runRequest.scenario_list.length || 1 : 1,
        flows_blocked: outcomeType === "product_blocked" || finalStatus === "failed" ? 1 : 0,
        untested_areas: []
      }
    },
    findings,
    tested_journeys: [
      {
        id: "journey_vision_only_primary",
        name: "Vision-only primary flow",
        status:
          outcomeType === "mission_completed"
            ? "completed"
            : outcomeType === "product_blocked" || finalStatus === "failed"
              ? "blocked"
              : "partial",
        summary:
          "A screenshot-driven control loop executed browser interactions without DOM targeting.",
        steps: testedSteps.length ? testedSteps : ["No actionable steps were recorded."],
        pages: Array.from(visitedPages).slice(0, 10),
        evidence: {
          screenshots: [],
          videos: []
        },
        observations: finalNote ? [finalNote] : []
      }
    ],
    recommendations: [
      "Keep critical controls visually distinct with stable labels so screenshot-driven automation can localize reliably.",
      "Ensure primary conversion paths expose clear, unambiguous CTA text on each step.",
      "Keep OCR-visible labels and high-contrast CTA shapes stable so the OCR -> nano-banana stack can continue deeper into the flow."
    ]
  };
}

async function executeVisionOnlyModeAttempt({
  stagehand,
  runRequest,
  options,
  runLog,
  artifacts,
  captureState,
  coordinateFallbackConfig
}) {
  const visionConfig = resolveVisionOnlyConfig(runRequest, options);
  if (!visionConfig.apiKey) {
    throw new Error(
      "vision_only mode requires an OpenAI API key (set OPENAI_API_KEY or QA_VISION_API_KEY)."
    );
  }
  if (typeof resolveLocalizeBoxClient(coordinateFallbackConfig) !== "function") {
    throw new Error(
      "vision_only mode requires coordinate localization but no localization client is configured."
    );
  }

  const initialPage = await resolveActiveStagehandPage(stagehand);
  if (!initialPage) {
    throw new Error("vision_only mode could not resolve an active page");
  }

  const pageRef = { current: initialPage };
  await navigateToTargetForVisionMode(pageRef.current, runRequest.target_url, runLog);
  await sleep(Math.max(350, Math.floor(visionConfig.actionDelayMs / 2)));

  const history = [];
  const issues = [];
  const visitedPages = new Set();
  let completed = false;
  let failed = false;
  let outcomeType = "incomplete";
  let finalNote = "";
  let stepsExecuted = 0;
  let step = 1;

  while (true) {
    const activePage = pageRef.current;
    if (!activePage || typeof activePage.screenshot !== "function") {
      throw new Error("vision_only mode lost the active browser page");
    }

    const currentUrl = resolvePageUrl(activePage, sanitizeString(runRequest.target_url, 4096));
    if (currentUrl) {
      visitedPages.add(currentUrl);
    }

    const screenshotBuffer = await activePage.screenshot({
      fullPage: false,
      type: "png",
      scale: "css"
    });
    storeCapturedScreenshotBuffer(
      artifacts,
      runLog,
      captureState,
      `vision_step_${step}_before_decision`,
      screenshotBuffer
    );
    const screenshotDataUrl = toDataUrlFromBuffer(screenshotBuffer);
    if (!screenshotDataUrl) {
      throw new Error("vision_only mode failed to encode screenshot as data URL");
    }

    const prompt = buildVisionPlannerPrompt({
      runRequest,
      step,
      currentUrl,
      historyText: formatVisionHistoryForPrompt(history, visionConfig.maxHistoryItems)
    });

    let decision = null;
    try {
      if (typeof visionConfig.plannerClient === "function") {
        const plannerOutput = await visionConfig.plannerClient({
          prompt,
          screenshotDataUrl,
          step,
          currentUrl
        });
        decision = normalizeVisionPlannerDecision(plannerOutput);
      } else {
        decision = await requestVisionPlannerDecision({
          apiKey: visionConfig.apiKey,
          baseUrl: visionConfig.baseUrl,
          model: visionConfig.model,
          prompt,
          screenshotDataUrl,
          timeoutMs: visionConfig.stepTimeoutMs
        });
      }
    } catch (error) {
      const errorMessage = error.message || "Vision planner failed";
      history.push({
        step,
        action: "planner_error",
        target: "",
        outcome: errorMessage,
        url: currentUrl,
        result: "planner_error"
      });
      appendRunLog(runLog, "vision_only_step_failed", {
        step,
        reason: "planner_error",
        message: errorMessage
      });
      finalNote = `Planner failed at step ${step}: ${errorMessage}`;
      failed = true;
      outcomeType = "runner_failed";
      break;
    }

    appendRunLog(runLog, "vision_only_step_decision", {
      step,
      action: decision.action,
      target: decision.target || null,
      reason: decision.reason || null
    });

    try {
      const actionResult = await executeVisionStepAction({
        decision,
        pageRef,
        runRequest,
        coordinateFallbackConfig,
        artifacts,
        runLog,
        actionDelayMs: visionConfig.actionDelayMs
      });
      stepsExecuted += 1;

      const updatedUrl = resolvePageUrl(pageRef.current, currentUrl);
      if (updatedUrl) {
        visitedPages.add(updatedUrl);
      }

      history.push({
        step,
        action: decision.action,
        target: decision.target || "",
        outcome: actionResult.observation || "ok",
        url: updatedUrl || currentUrl,
        result: actionResult.status || "ok"
      });

      const afterBuffer = await pageRef.current.screenshot({
        fullPage: false,
        type: "png",
        scale: "css"
      });
      storeCapturedScreenshotBuffer(
        artifacts,
        runLog,
        captureState,
        `vision_step_${step}_after_action`,
        afterBuffer
      );

      if (actionResult.terminal && actionResult.status === "done") {
        completed = true;
        outcomeType = "mission_completed";
        finalNote = actionResult.observation || decision.success_criteria || "Planner marked objective complete.";
        break;
      }
      if (actionResult.terminal && actionResult.status === "fail") {
        failed = true;
        outcomeType = "product_blocked";
        finalNote = actionResult.observation || decision.reason || "Planner marked flow blocked.";
        break;
      }
    } catch (error) {
      const errorMessage = error.message || "Unknown vision action error";
      const actionFailureCount = issues.length + 1;
      appendRunLog(runLog, "vision_only_step_failed", {
        step,
        reason: "action_error",
        action: decision.action,
        target: decision.target || null,
        message: errorMessage
      });
      history.push({
        step,
        action: decision.action,
        target: decision.target || "",
        outcome: errorMessage,
        url: currentUrl,
        result: "action_error"
      });
      issues.push({
        id: `finding-vision-step-${issues.length + 1}`,
        type: actionFailureCount >= 2 ? "dead_end" : "confusion_point",
        severity: actionFailureCount >= 2 ? "high" : "medium",
        title: `Vision action failed: ${decision.action}`,
        expected_behavior:
          decision.success_criteria ||
          `The action "${decision.action}" should progress the flow on the visible UI.`,
        observed_behavior: errorMessage,
        emotional_reaction: {
          primary: "frustration",
          intensity: 3
        },
        repro_steps: [
          `Open ${currentUrl || sanitizeString(runRequest.target_url, 4096) || "the target page"}.`,
          decision.target
            ? `Attempt to execute "${decision.action}" on "${decision.target}".`
            : `Attempt to execute "${decision.action}".`,
          `Observe failure: ${errorMessage}.`
        ],
        page: {
          url: currentUrl || sanitizeString(runRequest.target_url, 4096) || null
        },
        evidence: {
          screenshots: []
        },
        fix_hint:
          "Review the visual affordance and interaction state of the target control so the action remains detectable and clickable from pixels alone.",
        confidence: 0.84
      });
      await sleep(Math.max(250, Math.floor(visionConfig.actionDelayMs / 2)));
    }

    step += 1;
  }

  const finalStatus =
    outcomeType === "mission_completed" || outcomeType === "product_blocked"
      ? "completed"
      : failed
        ? "failed"
        : "partial";
  if (!finalNote) {
    finalNote =
      outcomeType === "mission_completed"
        ? "Vision-only mode completed the objective."
        : outcomeType === "product_blocked"
          ? "Vision-only mode completed the run and recorded a product blocker."
          : "Vision-only mode ended before explicit completion.";
  }

  const candidateReport = buildVisionModeCandidateReport({
    runRequest,
    outcomeType,
    finalStatus,
    finalNote,
    issues,
    visitedPages,
    history,
    stepsExecuted
  });
  const rawAgentMessage = [
    `Vision-only mode status: ${finalStatus}.`,
    finalNote,
    `Steps executed: ${stepsExecuted}.`,
    `Pages visited: ${Math.max(1, visitedPages.size)}.`
  ].join(" ");
  const agentActions = {
    visited_pages: Array.from(visitedPages),
    flows_tested: runRequest.scope_mode === "feature_targeted" ? runRequest.scenario_list.length || 1 : 1,
    flows_blocked: outcomeType === "product_blocked" || finalStatus === "failed" ? 1 : 0,
    untested_areas: []
  };

  return {
    candidateReport,
    rawAgentMessage,
    agentActions
  };
}

async function executeBrowserbaseQaRun(runRequest, options = {}) {
  const scope = getScopeConfig(runRequest.scope_mode);
  const runLog = [];
  const startedAt = new Date();
  const artifacts = {
    started_at: startedAt.toISOString(),
    artifact_expires_at: new Date(startedAt.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    screenshot_event_count: 0,
    captured_screenshots: []
  };
  const MAX_CAPTURED_SCREENSHOTS = 8;
  const MAX_CAPTURED_SCREENSHOT_BYTES = 1500000;
  const captureState = {
    maxCount: MAX_CAPTURED_SCREENSHOTS,
    maxBytes: MAX_CAPTURED_SCREENSHOT_BYTES,
    capturedBytes: 0
  };

  const systemPrompt = buildSystemPrompt(runRequest);
  const taskPrompt = buildTaskPrompt(runRequest);
  const reportUrl = options.reportUrl || null;
  if (typeof options.onRunLog === "function") {
    Object.defineProperty(runLog, "__progressHook", {
      value: options.onRunLog,
      enumerable: false,
      configurable: true,
      writable: false
    });
  }

  appendRunLog(runLog, "run_started", {
    run_id: runRequest.run_id,
    scope_mode: scope.mode,
    target_url: runRequest.target_url
  });

  const resolvedModule = options.stagehandModule || resolveStagehandModule();
  if (resolvedModule.error) {
    const failureMessage =
      "Browserbase runtime is unavailable because @browserbasehq/stagehand is not installed in this environment.";
    appendRunLog(runLog, "stagehand_unavailable", {
      message: resolvedModule.error.message || failureMessage
    });

    const report = normalizeReport({
      runRequest,
      artifacts,
      actions: {},
      reportUrl,
      deliveredAt: new Date().toISOString(),
      failureMessage
    });

    const markdown = buildMarkdownReport(report, runRequest, {
      generated_at: new Date().toISOString(),
      raw_agent_message_excerpt: failureMessage
    });

    return {
      report,
      markdown,
      artifacts: report.artifacts,
      runLog,
      rawAgentMessage: "",
      agentActions: {}
    };
  }

  const browserbaseApiKey = process.env.BROWSERBASE_API_KEY;
  const browserbaseProjectId = process.env.BROWSERBASE_PROJECT_ID;
  const agentModel = resolveAgentModel(runRequest);
  const cuaAgentModel = resolveCuaAgentModel(runRequest, options);
  const visionAgentModel = resolveVisionAgentModel(runRequest, options);
  const agentModelProvider = resolveModelProvider(agentModel);
  const agentModeFallbackOrder = resolveAgentModeFallbackOrder(options.agentModeFallbackOrder);
  const agentExcludeTools = resolveAgentExcludeTools(options.agentExcludeTools);
  const requestedSessionCreateParams = resolveBrowserbaseSessionCreateParams(options);
  let effectiveSessionCreateParams = requestedSessionCreateParams;
  const coordinateFallbackConfig = resolveCoordinateClickFallbackConfig(options);

  if (!browserbaseApiKey || !browserbaseProjectId || !hasModelApiKey()) {
    const missing = [];
    if (!browserbaseApiKey) missing.push("BROWSERBASE_API_KEY");
    if (!browserbaseProjectId) missing.push("BROWSERBASE_PROJECT_ID");
    if (!hasModelApiKey()) missing.push("OPENAI_API_KEY");
    const failureMessage = `Browserbase run cannot start because required environment variables are missing: ${missing.join(", ")}.`;

    appendRunLog(runLog, "browserbase_config_missing", { missing });

    const report = normalizeReport({
      runRequest,
      artifacts,
      actions: {},
      reportUrl,
      deliveredAt: new Date().toISOString(),
      failureMessage
    });

    const markdown = buildMarkdownReport(report, runRequest, {
      generated_at: new Date().toISOString(),
      raw_agent_message_excerpt: failureMessage
    });

    return {
      report,
      markdown,
      artifacts: report.artifacts,
      runLog,
      rawAgentMessage: "",
      agentActions: {}
    };
  }

  const { Stagehand } = resolvedModule;
  if (typeof Stagehand !== "function") {
    const failureMessage = "@browserbasehq/stagehand loaded, but Stagehand export is unavailable.";
    appendRunLog(runLog, "stagehand_export_missing", { message: failureMessage });

    const report = normalizeReport({
      runRequest,
      artifacts,
      actions: {},
      reportUrl,
      deliveredAt: new Date().toISOString(),
      failureMessage
    });

    const markdown = buildMarkdownReport(report, runRequest, {
      generated_at: new Date().toISOString(),
      raw_agent_message_excerpt: failureMessage
    });

    return {
      report,
      markdown,
      artifacts: report.artifacts,
      runLog,
      rawAgentMessage: "",
      agentActions: {}
    };
  }

  let stagehand = null;
  let rawAgentMessage = "";
  let candidateReport = null;
  let parsedMarkdown = "";
  let parseError = null;
  let failureMessage = null;
  let successfulAgentMode = null;
  const agentActions = {
    visited_pages: [],
    flows_tested: runRequest.scope_mode === "feature_targeted" ? runRequest.scenario_list.length || 1 : 1,
    flows_blocked: 0,
    untested_areas: []
  };

  try {
    appendRunLog(runLog, "stagehand_initializing");
    const createStagehand = (sessionCreateParams) =>
      new Stagehand({
        env: "BROWSERBASE",
        apiKey: browserbaseApiKey,
        projectId: browserbaseProjectId,
        browserbaseSessionCreateParams: sessionCreateParams,
        experimental: true,
        disableAPI: true,
        verbose: 0,
        disablePino: true,
        keepAlive: false
      });

    stagehand = createStagehand(effectiveSessionCreateParams);
    try {
      if (typeof stagehand.init === "function") {
        await stagehand.init();
      }
    } catch (error) {
      const advancedStealthRequested =
        effectiveSessionCreateParams?.browserSettings?.advancedStealth === true;
      if (advancedStealthRequested && isAdvancedStealthPlanError(error)) {
        appendRunLog(runLog, "browserbase_advanced_stealth_unavailable", {
          message: error.message || "Advanced stealth mode is unavailable for current plan",
          fallback_to_standard_session: true
        });

        await closeStagehand(stagehand, runLog);
        effectiveSessionCreateParams = {
          ...effectiveSessionCreateParams,
          browserSettings: {
            ...(isPlainObject(effectiveSessionCreateParams?.browserSettings)
              ? effectiveSessionCreateParams.browserSettings
              : {}),
            advancedStealth: false
          }
        };
        stagehand = createStagehand(effectiveSessionCreateParams);
        if (typeof stagehand.init === "function") {
          await stagehand.init();
        }
      } else {
        throw error;
      }
    }
    appendRunLog(runLog, "stagehand_initialized");

    if (stagehand?.bus && typeof stagehand.bus.on === "function") {
      stagehand.bus.on("agent_screenshot_taken_event", (screenshotPayload) => {
        artifacts.screenshot_event_count += 1;

        if (!Array.isArray(artifacts.captured_screenshots)) {
          artifacts.captured_screenshots = [];
        }

        // Keep payload sizes bounded while preserving enough evidence for inline UI replay.
        if (artifacts.captured_screenshots.length >= MAX_CAPTURED_SCREENSHOTS) {
          return;
        }

        if (!Buffer.isBuffer(screenshotPayload) || screenshotPayload.length <= 0) {
          return;
        }

        if (captureState.capturedBytes + screenshotPayload.length > captureState.maxBytes) {
          return;
        }

        const screenshotDataUrl = toDataUrlFromBuffer(screenshotPayload);
        if (!screenshotDataUrl) {
          return;
        }

        captureState.capturedBytes += screenshotPayload.length;
        artifacts.captured_screenshots.push(screenshotDataUrl);
      });
    }

    artifacts.browserbase_session_id = sanitizeString(stagehand.browserbaseSessionID, 256) || null;
    artifacts.browserbase_session_url = sanitizeString(stagehand.browserbaseSessionURL, 4096) || null;
    artifacts.browserbase_debug_url = sanitizeString(stagehand.browserbaseDebugURL, 4096) || null;
    artifacts.browserbase_session_create = {
      advanced_stealth:
        effectiveSessionCreateParams?.browserSettings?.advancedStealth === true,
      solve_captchas:
        effectiveSessionCreateParams?.browserSettings?.solveCaptchas === true,
      block_ads: effectiveSessionCreateParams?.browserSettings?.blockAds === true,
      proxies: effectiveSessionCreateParams?.proxies ?? null,
      region: sanitizeString(effectiveSessionCreateParams?.region, 32) || null,
      advanced_stealth_requested:
        requestedSessionCreateParams?.browserSettings?.advancedStealth === true
    };
    artifacts.agent_mode_attempts = agentModeFallbackOrder.slice();
    artifacts.agent_mode_used = null;
    artifacts.coordinate_click_fallback = {
      enabled: Boolean(coordinateFallbackConfig.enabled),
      reason: coordinateFallbackConfig.reason || null,
      mode: coordinateFallbackConfig.mode || DEFAULT_COORDINATE_CLICK_FALLBACK_MODE,
      provider: coordinateFallbackConfig.provider || null,
      model: coordinateFallbackConfig.model || null,
      strategy: coordinateFallbackConfig.enabled ? coordinateFallbackConfig.strategy || "yellow_box_diff" : null,
      invoked: 0,
      resolved: 0,
      failed: 0
    };
    appendRunLog(runLog, "agent_mode_fallback_configured", {
      modes: agentModeFallbackOrder
    });
    appendRunLog(runLog, "browserbase_session_create_configured", {
      advanced_stealth_requested:
        artifacts.browserbase_session_create.advanced_stealth_requested,
      advanced_stealth: artifacts.browserbase_session_create.advanced_stealth,
      solve_captchas: artifacts.browserbase_session_create.solve_captchas,
      block_ads: artifacts.browserbase_session_create.block_ads,
      proxies: artifacts.browserbase_session_create.proxies,
      region: artifacts.browserbase_session_create.region
    });
    if (artifacts.coordinate_click_fallback.enabled) {
      appendRunLog(runLog, "agent_click_coordinate_fallback_configured", {
        mode: artifacts.coordinate_click_fallback.mode,
        provider: artifacts.coordinate_click_fallback.provider,
        model: artifacts.coordinate_click_fallback.model,
        strategy: artifacts.coordinate_click_fallback.strategy,
        localization_order: Array.isArray(coordinateFallbackConfig.localizationOrder)
          ? coordinateFallbackConfig.localizationOrder
          : [],
        qwen_model: coordinateFallbackConfig.qwen?.model || null
      });
    } else {
      appendRunLog(runLog, "agent_click_coordinate_fallback_disabled", {
        reason: artifacts.coordinate_click_fallback.reason || "disabled_by_config"
      });
    }

    const isVisionOnlyRun = agentModeFallbackOrder.every((mode) => mode === VISION_ONLY_AGENT_MODE);
    if (!isVisionOnlyRun) {
      // Prime the active tab on the requested target and capture at least one first-party screenshot.
      const pagePrimed = await navigateToTargetForCapture(stagehand, runRequest.target_url, runLog, options);
      if (pagePrimed) {
        await sleep(300);
        await captureInlineScreenshot(stagehand, artifacts, runLog, "primed_target", captureState);
      }
    }

    const outputSchema = buildStructuredOutputSchema();
    const baseAgentExecuteOptions = {
      instruction: taskPrompt
    };
    if (agentExcludeTools.length) {
      baseAgentExecuteOptions.excludeTools = agentExcludeTools;
      appendRunLog(runLog, "agent_execute_tools_excluded", {
        tools: agentExcludeTools
      });
    }

    const hybridCoordinateClickTool = createCoordinateAwareClickTool({
      stagehand,
      runLog,
      artifacts,
      resolvedModule,
      coordinateFallbackConfig,
      modelProvider: agentModelProvider
    });
    if (artifacts.coordinate_click_fallback.enabled && !hybridCoordinateClickTool) {
      artifacts.coordinate_click_fallback.enabled = false;
      artifacts.coordinate_click_fallback.reason = "custom_click_tool_unavailable";
      appendRunLog(runLog, "agent_click_coordinate_fallback_unavailable", {
        reason: artifacts.coordinate_click_fallback.reason
      });
    }

    let lastAttemptErrorMessage = null;
    for (let index = 0; index < agentModeFallbackOrder.length; index += 1) {
      const mode = agentModeFallbackOrder[index];
      const attempt = index + 1;
      const modelForMode =
        mode === "cua"
          ? cuaAgentModel || agentModel
          : mode === VISION_ONLY_AGENT_MODE
            ? visionAgentModel
            : agentModel;

      appendRunLog(runLog, "agent_mode_attempt_started", {
        mode,
        attempt,
        total_attempts: agentModeFallbackOrder.length
      });
      appendRunLog(runLog, "agent_mode_model_selected", {
        mode,
        attempt,
        model: modelForMode || null
      });

      if (mode === VISION_ONLY_AGENT_MODE) {
        try {
          appendRunLog(runLog, "agent_created", {
            mode,
            attempt,
            driver: "vision_only"
          });

          await captureInlineScreenshot(
            stagehand,
            artifacts,
            runLog,
            `attempt_${attempt}_before_execute`,
            captureState
          );

          const visionResult = await executeVisionOnlyModeAttempt({
            stagehand,
            runRequest,
            options,
            runLog,
            artifacts,
            captureState,
            coordinateFallbackConfig: {
              ...coordinateFallbackConfig,
              mode: "always"
            }
          });

          successfulAgentMode = mode;
          artifacts.agent_mode_used = mode;
          rawAgentMessage = visionResult.rawAgentMessage || "";
          candidateReport = visionResult.candidateReport || null;
          emitCandidatePreview(options.onCandidateReport, candidateReport, {
            mode,
            attempt,
            run_id: runRequest.run_id
          });
          if (isPlainObject(visionResult.agentActions)) {
            if (Array.isArray(visionResult.agentActions.visited_pages)) {
              agentActions.visited_pages = visionResult.agentActions.visited_pages.slice(0, 50);
            }
            if (Number.isFinite(Number(visionResult.agentActions.flows_tested))) {
              agentActions.flows_tested = Number(visionResult.agentActions.flows_tested);
            }
            if (Number.isFinite(Number(visionResult.agentActions.flows_blocked))) {
              agentActions.flows_blocked = Number(visionResult.agentActions.flows_blocked);
            }
            if (Array.isArray(visionResult.agentActions.untested_areas)) {
              agentActions.untested_areas = visionResult.agentActions.untested_areas.slice(0, 20);
            }
          }

          appendRunLog(runLog, "agent_mode_attempt_succeeded", {
            mode,
            attempt
          });
          appendRunLog(runLog, "agent_execution_completed", {
            mode,
            attempt
          });

          await captureInlineScreenshot(
            stagehand,
            artifacts,
            runLog,
            `attempt_${attempt}_after_execute`,
            captureState
          );

          break;
        } catch (error) {
          lastAttemptErrorMessage = error.message || `Browserbase QA run failed in ${mode} mode`;
          appendRunLog(runLog, "agent_mode_attempt_failed", {
            mode,
            attempt,
            message: lastAttemptErrorMessage
          });
          continue;
        }
      }

      const agentConfig = {
        systemPrompt,
        mode
      };
      if (modelForMode) {
        agentConfig.model = modelForMode;
      }
      if (mode === "hybrid" && hybridCoordinateClickTool) {
        agentConfig.tools = {
          click: hybridCoordinateClickTool
        };
        appendRunLog(runLog, "agent_click_coordinate_fallback_attached", {
          mode,
          attempt
        });
      }

      try {
        const agent = await stagehand.agent(agentConfig);
        appendRunLog(runLog, "agent_created", {
          mode,
          attempt,
          step_policy: "llm_controlled"
        });

        const agentExecuteOptions = {
          ...baseAgentExecuteOptions
        };
        if (outputSchema && mode !== "cua") {
          agentExecuteOptions.output = outputSchema;
          appendRunLog(runLog, "agent_structured_output_requested", {
            mode,
            attempt
          });
        } else if (outputSchema && mode === "cua") {
          appendRunLog(runLog, "agent_structured_output_skipped", {
            mode,
            attempt,
            reason: "unsupported_in_cua_mode"
          });
        }

        await captureInlineScreenshot(
          stagehand,
          artifacts,
          runLog,
          `attempt_${attempt}_before_execute`,
          captureState
        );

        const agentResult = await agent.execute(agentExecuteOptions);
        if (!inferAgentExecutionSuccess(agentResult)) {
          throw new Error(
            extractAgentErrorMessage(agentResult) ||
              `Browserbase QA run failed in ${mode} mode with an unsuccessful agent result`
          );
        }

        successfulAgentMode = mode;
        artifacts.agent_mode_used = mode;
        appendRunLog(runLog, "agent_mode_attempt_succeeded", {
          mode,
          attempt
        });
        appendRunLog(runLog, "agent_execution_completed", {
          mode,
          attempt
        });

        await captureInlineScreenshot(
          stagehand,
          artifacts,
          runLog,
          `attempt_${attempt}_after_execute`,
          captureState
        );

        rawAgentMessage = extractAgentMessage(agentResult);
        if (isPlainObject(agentResult?.output)) {
          candidateReport = agentResult.output;
          emitCandidatePreview(options.onCandidateReport, candidateReport, {
            mode,
            attempt,
            run_id: runRequest.run_id
          });
          appendRunLog(runLog, "agent_structured_output_received", {
            mode,
            attempt,
            findings:
              Array.isArray(candidateReport.findings) ? candidateReport.findings.length : null
          });
        } else {
          const sections = extractAgentSections(rawAgentMessage);
          candidateReport = sections.parsed_json;
          emitCandidatePreview(options.onCandidateReport, candidateReport, {
            mode,
            attempt,
            run_id: runRequest.run_id
          });
          parsedMarkdown = sections.markdown_text || "";
          parseError = sections.parse_error;
        }

        if (!candidateReport) {
          appendRunLog(runLog, "agent_output_parse_issue", {
            mode,
            attempt,
            message: parseError || "Structured JSON report was not present in agent output."
          });
        }

        if (candidateReport?.summary?.coverage && isPlainObject(candidateReport.summary.coverage)) {
          const coverage = candidateReport.summary.coverage;
          if (typeof coverage.pages_visited === "number") {
            agentActions.visited_pages = new Array(Math.max(0, coverage.pages_visited)).fill(runRequest.target_url);
          }
          if (typeof coverage.flows_tested === "number") {
            agentActions.flows_tested = coverage.flows_tested;
          }
          if (typeof coverage.flows_blocked === "number") {
            agentActions.flows_blocked = coverage.flows_blocked;
          }
          if (Array.isArray(coverage.untested_areas)) {
            agentActions.untested_areas = coverage.untested_areas;
          }
        }

        break;
      } catch (error) {
        lastAttemptErrorMessage = error.message || `Browserbase QA run failed in ${mode} mode`;
        appendRunLog(runLog, "agent_mode_attempt_failed", {
          mode,
          attempt,
          message: lastAttemptErrorMessage
        });
      }
    }

    if (!successfulAgentMode) {
      failureMessage = lastAttemptErrorMessage || "Browserbase QA run failed";
      appendRunLog(runLog, "agent_execution_failed", {
        message: failureMessage,
        attempted_modes: agentModeFallbackOrder
      });
      agentActions.flows_blocked += 1;
    }
  } catch (error) {
    failureMessage = error.message || "Browserbase QA run failed";
    appendRunLog(runLog, "agent_execution_failed", {
      message: failureMessage,
      attempted_modes: agentModeFallbackOrder
    });
    agentActions.flows_blocked += 1;
  } finally {
    await captureInlineScreenshot(stagehand, artifacts, runLog, "pre_close_final", captureState);
    await closeStagehand(stagehand, runLog);
  }

  artifacts.completed_at = new Date().toISOString();

  const report = normalizeReport({
    candidateReport,
    rawAgentMessage,
    runRequest,
    artifacts,
    actions: agentActions,
    reportUrl,
    deliveredAt: artifacts.completed_at,
    parseError,
    failureMessage
  });

  const markdown = buildMarkdownReport(report, runRequest, {
    generated_at: toIsoTimestamp(artifacts.completed_at),
    raw_agent_message_excerpt: rawAgentMessage || failureMessage || parsedMarkdown
  });

  appendRunLog(runLog, "report_normalized", {
    status: report.status,
    findings: report.findings.length
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
  executeBrowserbaseQaRun,
  __private: {
    resolveBrowserbaseSessionCreateParams,
    resolveCoordinateClickFallbackConfig,
    executeVisionOnlyModeAttempt,
    prepareOcrCandidatesForJudge,
    chooseOcrCandidateWithJudge,
    clickWithVisionLocalization,
    extractYellowBoxFromAnnotatedDiff,
    createCoordinateAwareClickTool,
    requestYellowBoxAnnotationWithReplicate,
    requestYellowBoxAnnotationWithFal,
    requestYellowBoxAnnotationWithOpenAi,
    requestYellowBoxAnnotationWithGemini
  }
};
