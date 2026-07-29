#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { createOtpBroker } = require("../lib/otp-broker");

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

const AUTH_ENTRY_STRONG_TEXT_PATTERN =
  /(?:login|log\s*in|sign\s*in|sign\s*up|signup|register|create\s*account)/i;
const AUTH_ENTRY_WEAK_TEXT_PATTERN =
  /(?:start here|start free|free trial|get started|start now|continue with email|try(?:\s+\w+){0,3})/i;
const AUTH_ENTRY_HREF_PATTERN =
  /(?:\/login\b|\/signin\b|\/sign-in\b|\/signup\b|\/sign-up\b|\/register\b|\/auth\b|:\/\/(?:app|account|accounts|dashboard)\.)/i;
const SCENARIO_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "app",
  "as",
  "be",
  "by",
  "for",
  "from",
  "get",
  "goal",
  "have",
  "i",
  "in",
  "into",
  "my",
  "of",
  "on",
  "or",
  "real",
  "should",
  "simulate",
  "site",
  "solve",
  "test",
  "the",
  "their",
  "this",
  "through",
  "to",
  "try",
  "use",
  "user",
  "using",
  "with"
]);
const ONBOARDING_COPY_PATTERN =
  /(?:welcome|hi\s+\w+|let'?s start|tell us about|set up your|complete (?:your )?profile|your full name|full name|company name|team size|how many people|what brings you|job title|workspace name|organization name)/i;
const PERSONA_ARCHETYPES = [
  {
    pattern: /(marketer|marketing|growth|demand gen|brand manager|content manager|content marketer)/i,
    fullName: "Avery Stone",
    roleTitle: "Marketing Manager",
    companyName: "Northstar Media",
    industry: "Marketing"
  },
  {
    pattern: /(founder|ceo|owner|entrepreneur|operator)/i,
    fullName: "Alex Parker",
    roleTitle: "Founder",
    companyName: "Northstar Studio",
    industry: "Software"
  },
  {
    pattern: /(sales|revenue|account executive|business development|prospect)/i,
    fullName: "Jordan Cruz",
    roleTitle: "Revenue Lead",
    companyName: "Northstar Revenue",
    industry: "Sales"
  },
  {
    pattern: /(recruiter|talent|hiring|hr|human resources|people ops)/i,
    fullName: "Morgan Reed",
    roleTitle: "Talent Lead",
    companyName: "Northstar Talent",
    industry: "Recruiting"
  },
  {
    pattern: /(developer|engineer|technical|product manager|product|ops|operations)/i,
    fullName: "Samir Patel",
    roleTitle: "Product Manager",
    companyName: "Northstar Labs",
    industry: "Software"
  }
];
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MISSION_JUDGE_MODEL = "gpt-4.1-mini";
const DEFAULT_MISSION_JUDGE_TIMEOUT_MS = 30000;
const DEFAULT_MISSION_JUDGE_STATE_CHANGE_TIMEOUT_MS = 4000;
const DEFAULT_MISSION_JUDGE_STALE_ROUND_LIMIT = 6;
const MISSION_JUDGE_ALLOWED_ACTIONS = new Set([
  "click",
  "type",
  "press",
  "scroll",
  "navigate",
  "wait",
  "explore",
  "none",
  "done",
  "fail"
]);
const MISSION_ACTION_STOP_WORDS = new Set([
  "a",
  "an",
  "area",
  "at",
  "below",
  "button",
  "card",
  "cta",
  "field",
  "for",
  "from",
  "in",
  "inside",
  "input",
  "label",
  "labeled",
  "link",
  "menu",
  "menuitem",
  "of",
  "on",
  "option",
  "panel",
  "right",
  "section",
  "side",
  "tab",
  "text",
  "textbox",
  "the",
  "top",
  "under",
  "upper",
  "visible",
  "within"
]);
const MISSION_CLICKABLE_SELECTOR = [
  "button",
  "a[href]",
  "[role='button']",
  "[role='link']",
  "[role='tab']",
  "[role='menuitem']",
  "[role='option']",
  "input[type='button']",
  "input[type='submit']"
].join(",");

let buildChromiumLaunchOptions = null;
try {
  ({ buildChromiumLaunchOptions } = require("../lib/qa-playwright-runtime"));
} catch {
  buildChromiumLaunchOptions = (baseOptions) => baseOptions;
}

function isLikelyAuthEntryText(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return false;
  }
  return AUTH_ENTRY_STRONG_TEXT_PATTERN.test(normalized) || AUTH_ENTRY_WEAK_TEXT_PATTERN.test(normalized);
}

function isLikelyAuthEntryHref(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return false;
  }
  return AUTH_ENTRY_HREF_PATTERN.test(normalized);
}

function parseArgs(argv) {
  const parsed = {
    runs: 20,
    headless: true,
    target: "https://workolo.com/",
    goal: String(process.env.QA_RUN_GOAL || "").trim(),
    brandPersona: String(process.env.QA_RUN_BRAND_PERSONA || "").trim(),
    browserChannel: String(process.env.QA_LOCAL_BROWSER_CHANNEL || process.env.QA_PLAYWRIGHT_BROWSER_CHANNEL || "").trim(),
    outputRoot: path.resolve("output", "playwright"),
    otpProvider: String(process.env.QA_OTP_PROVIDER || "mailtm").trim().toLowerCase(),
    otpMailtmBaseUrl: String(process.env.QA_OTP_MAILTM_BASE_URL || "").trim(),
    otpTimeoutMs: parsePositiveInteger(process.env.QA_OTP_TIMEOUT_MS, 180000),
    otpPollIntervalMs: parsePositiveInteger(process.env.QA_OTP_POLL_INTERVAL_MS, 5000),
    otpSubjectPattern: String(process.env.QA_OTP_SUBJECT_PATTERN || "otp|verify|code|workolo"),
    featureLimit: parsePositiveInteger(process.env.QA_FEATURE_LIMIT, 12),
    publishReports: parseBoolean(process.env.QA_PUBLISH_REPORTS, true),
    publishCallbackUrl: String(process.env.QA_PUBLISH_CALLBACK_URL || "").trim(),
    publishCallbackSecret: String(
      process.env.QA_PUBLISH_CALLBACK_SECRET || process.env.QA_CALLBACK_SECRET || ""
    ).trim(),
    publishBrandKey: String(process.env.QA_PUBLISH_BRAND_KEY || "").trim(),
    publishOwnerUserId: String(
      process.env.QA_PUBLISH_OWNER_USER_ID || process.env.OWNER_USER_ID || ""
    ).trim(),
    publishOwnerEmail: String(
      process.env.QA_PUBLISH_OWNER_EMAIL || process.env.OWNER_EMAIL || ""
    )
      .trim()
      .toLowerCase(),
    publishSource: String(process.env.QA_PUBLISH_SOURCE || "qa_bot_local").trim(),
    publishRunPrefix: String(process.env.QA_PUBLISH_RUN_PREFIX || "local").trim()
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    const hasNextValue = typeof next === "string" && !next.startsWith("--");

    if (key === "runs" && hasNextValue) {
      const count = Number(next);
      if (Number.isFinite(count) && count > 0) {
        parsed.runs = Math.floor(count);
      }
      index += 1;
      continue;
    }

    if (key === "target" && hasNextValue) {
      parsed.target = next;
      index += 1;
      continue;
    }

    if (key === "goal" && hasNextValue) {
      parsed.goal = String(next).trim();
      index += 1;
      continue;
    }

    if (key === "brand-persona" && hasNextValue) {
      parsed.brandPersona = String(next).trim();
      index += 1;
      continue;
    }

    if (key === "browser-channel" && hasNextValue) {
      parsed.browserChannel = String(next).trim();
      index += 1;
      continue;
    }

    if (key === "output" && hasNextValue) {
      parsed.outputRoot = path.resolve(next);
      index += 1;
      continue;
    }
    if (key === "otp-provider" && hasNextValue) {
      parsed.otpProvider = String(next).trim().toLowerCase();
      index += 1;
      continue;
    }
    if (key === "otp-mailtm-base-url" && hasNextValue) {
      parsed.otpMailtmBaseUrl = String(next).trim();
      index += 1;
      continue;
    }
    if (key === "otp-timeout" && hasNextValue) {
      parsed.otpTimeoutMs = parsePositiveInteger(next, parsed.otpTimeoutMs);
      index += 1;
      continue;
    }
    if (key === "otp-poll" && hasNextValue) {
      parsed.otpPollIntervalMs = parsePositiveInteger(next, parsed.otpPollIntervalMs);
      index += 1;
      continue;
    }
    if (key === "otp-subject-pattern" && hasNextValue) {
      parsed.otpSubjectPattern = String(next).trim();
      index += 1;
      continue;
    }
    if (key === "feature-limit" && hasNextValue) {
      parsed.featureLimit = parsePositiveInteger(next, parsed.featureLimit);
      index += 1;
      continue;
    }
    if (key === "publish") {
      parsed.publishReports = true;
      continue;
    }
    if (key === "no-publish") {
      parsed.publishReports = false;
      continue;
    }
    if (key === "publish-callback-url" && hasNextValue) {
      parsed.publishCallbackUrl = String(next).trim();
      index += 1;
      continue;
    }
    if (key === "publish-secret" && hasNextValue) {
      parsed.publishCallbackSecret = String(next).trim();
      index += 1;
      continue;
    }
    if (key === "publish-brand" && hasNextValue) {
      parsed.publishBrandKey = String(next).trim();
      index += 1;
      continue;
    }
    if (key === "publish-owner-user-id" && hasNextValue) {
      parsed.publishOwnerUserId = String(next).trim();
      index += 1;
      continue;
    }
    if (key === "publish-owner-email" && hasNextValue) {
      parsed.publishOwnerEmail = String(next).trim().toLowerCase();
      index += 1;
      continue;
    }
    if (key === "publish-source" && hasNextValue) {
      parsed.publishSource = String(next).trim();
      index += 1;
      continue;
    }
    if (key === "publish-run-prefix" && hasNextValue) {
      parsed.publishRunPrefix = String(next).trim();
      index += 1;
      continue;
    }

    if (key === "headless") {
      parsed.headless = true;
      continue;
    }
    if (key === "headed") {
      parsed.headless = false;
      continue;
    }
  }

  return parsed;
}

function validateRequiredPublishConfig(config) {
  if (!config.publishReports) {
    return {
      ok: false,
      error: "Local matrix runs must publish a stored report. Enable publishing instead of using --no-publish."
    };
  }
  if (!String(config.publishCallbackUrl || "").trim()) {
    return { ok: false, error: "publish callback URL is required" };
  }
  if (!String(config.publishCallbackSecret || "").trim()) {
    return { ok: false, error: "publish callback secret is required" };
  }
  if (!String(config.publishOwnerUserId || "").trim()) {
    return { ok: false, error: "publish owner user id is required" };
  }
  if (!String(config.publishOwnerEmail || "").trim()) {
    return { ok: false, error: "publish owner email is required" };
  }
  return { ok: true };
}

function toTimestampId(date = new Date()) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "_")
    .replace(/\..+$/, "");
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function safeFileName(text) {
  return String(text || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 120);
}

function escapeRegExp(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isDangerousAction(value) {
  const text = normalizeText(value).toLowerCase();
  if (!text) {
    return false;
  }
  return /(logout|sign out|delete|remove|deactivate|close account|cancel account|purchase|checkout|billing|subscribe|upgrade|payment)/i.test(
    text
  );
}

function isUtilityAction(value) {
  const text = normalizeText(value).toLowerCase();
  if (!text) {
    return true;
  }
  return /^(save|submit|cancel|close|back|next|continue|verify|login|sign up|register|ok|yes|no|skip)$/i.test(
    text
  );
}

function looksFeatureLike(value) {
  const text = normalizeText(value).toLowerCase();
  if (!text) {
    return false;
  }
  return /(dashboard|profile|project|job|talent|team|message|notification|settings|report|wallet|insight|analytics|help|support|activity|application|task|workspace|search|filter|video|videos|campaign|campaigns|template|templates|studio|generator|generate|create|speakeasy|personalized)/i.test(
    text
  );
}

function looksCustomerJourneyAction(value) {
  const text = normalizeText(value).toLowerCase();
  if (!text) {
    return false;
  }
  return /(open|create|new|start|launch|explore|generate|build|continue|go to|enter|try).*(video|videos|campaign|campaigns|workspace|project|template|templates|speakeasy|personalized|studio|journey|automation|agent|report|analytics|dashboard|library)/i.test(
    text
  );
}

function tokenizeScenarioText(value) {
  return Array.from(
    new Set(
      normalizeText(value)
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3 && !SCENARIO_STOP_WORDS.has(token))
    )
  );
}

function buildScenarioGoals(scenarios) {
  if (!Array.isArray(scenarios)) {
    return [];
  }
  return scenarios
    .map((scenario, index) => {
      const original = normalizeText(scenario);
      const tokens = tokenizeScenarioText(original);
      if (!original || !tokens.length) {
        return null;
      }
      return {
        id: `goal_${index + 1}`,
        original,
        tokens
      };
    })
    .filter(Boolean);
}

function buildGoalInputs(config) {
  const safeConfig = config && typeof config === "object" ? config : {};
  const values = [];
  const goal = normalizeText(safeConfig.goal);
  if (goal) {
    values.push(goal);
  }
  if (Array.isArray(safeConfig.scenarioList)) {
    for (const scenario of safeConfig.scenarioList) {
      const normalized = normalizeText(scenario);
      if (normalized) {
        values.push(normalized);
      }
    }
  }
  return Array.from(new Set(values));
}

function buildPersonaProfile(value) {
  const raw = normalizeText(value);
  const matchedArchetype =
    PERSONA_ARCHETYPES.find((candidate) => candidate.pattern.test(raw)) || PERSONA_ARCHETYPES[PERSONA_ARCHETYPES.length - 1];
  return {
    raw,
    fullName: matchedArchetype.fullName,
    roleTitle: matchedArchetype.roleTitle,
    companyName: matchedArchetype.companyName,
    industry: matchedArchetype.industry,
    firstTime: /first.?time|new user|for the first time|learning the product/i.test(raw),
    skeptical: /skeptic|skeptical|buyer|trust|clarity|proof|before committing/i.test(raw),
    technical: /technical|developer|engineer|semi technical|power user|api|automation/i.test(raw),
    keywords: tokenizeScenarioText(raw).slice(0, 10)
  };
}

function buildPersonaWebsite(personaProfile) {
  const companyName = normalizeText(personaProfile && personaProfile.companyName).toLowerCase();
  if (!companyName) {
    return "https://example.com";
  }
  const slug = companyName.replace(/[^a-z0-9]+/g, "");
  return slug ? `https://${slug}.example.com` : "https://example.com";
}

function buildPersonaContextValue(personaProfile, goals) {
  const safePersona = personaProfile && typeof personaProfile === "object" ? personaProfile : buildPersonaProfile("");
  const goalSummary = Array.isArray(goals) && goals.length
    ? goals
        .slice(0, 2)
        .map((goal) => goal.original)
        .join("; ")
    : "learn whether this product is worth adopting";
  const contextParts = [
    `I am a ${safePersona.roleTitle.toLowerCase()} at ${safePersona.companyName}.`,
    `I want to ${goalSummary}.`
  ];
  if (safePersona.firstTime) {
    contextParts.push("I am new to the product and need the setup to make sense quickly.");
  }
  if (safePersona.skeptical) {
    contextParts.push("I care about trust, clarity, and proof before committing.");
  }
  return contextParts.join(" ");
}

function scoreCandidateAgainstGoals(candidate, goals) {
  const haystack = `${normalizeText(candidate && candidate.text)} ${normalizeText(candidate && candidate.href)}`.toLowerCase();
  if (!haystack || !Array.isArray(goals) || !goals.length) {
    return { score: 0, matchedGoals: [] };
  }
  const matchedGoals = [];
  let score = 0;
  for (const goal of goals) {
    let matchedTokens = 0;
    for (const token of goal.tokens) {
      if (haystack.includes(token)) {
        matchedTokens += 1;
      }
    }
    if (!matchedTokens) {
      continue;
    }
    matchedGoals.push(goal.original);
    score += 18 + matchedTokens * 8;
  }
  return {
    score,
    matchedGoals: matchedGoals.slice(0, 4)
  };
}

function scoreCandidateAgainstPersona(candidate, personaProfile) {
  const safePersona = personaProfile && typeof personaProfile === "object" ? personaProfile : buildPersonaProfile("");
  const text = normalizeText(candidate && candidate.text).toLowerCase();
  const haystack = `${text} ${normalizeText(candidate && candidate.href)}`.toLowerCase();
  if (!haystack) {
    return { score: 0, matchedKeywords: [], reasons: [] };
  }

  const matchedKeywords = [];
  const reasons = [];
  let score = 0;

  if (candidate && candidate.section === "main" && looksCustomerJourneyAction(text)) {
    score += 65;
    reasons.push("primary_customer_cta");
  } else if (candidate && candidate.section === "main" && looksFeatureLike(text)) {
    score += 28;
    reasons.push("main_feature_surface");
  }

  if (/(open|create|new|start|launch|generate|build|explore|try|continue)/i.test(text)) {
    score += 12;
    reasons.push("forward_motion");
  }

  if (/(video|videos|campaign|campaigns|template|templates|library|sample|examples|studio|speakeasy|personalized|workspace)/i.test(haystack)) {
    score += 18;
    reasons.push("product_entry");
  }

  if (/(settings|profile|billing|support|help|notifications|account)/i.test(haystack)) {
    score -= 38;
    reasons.push("backoffice_navigation");
  }

  if ((candidate && (candidate.section === "nav" || candidate.section === "aside")) && !looksCustomerJourneyAction(text)) {
    score -= 16;
    reasons.push("generic_navigation");
  }

  if (safePersona.firstTime && /(get started|start|template|templates|library|sample|examples|walkthrough|guide)/i.test(haystack)) {
    score += 10;
    reasons.push("first_time_onramp");
  }

  if (safePersona.skeptical && /(proof|case stud|examples|sample|results|analytics|demo|library|review)/i.test(haystack)) {
    score += 14;
    reasons.push("buyer_validation");
  }

  for (const token of Array.isArray(safePersona.keywords) ? safePersona.keywords : []) {
    if (!token || !haystack.includes(token)) {
      continue;
    }
    if (!matchedKeywords.includes(token)) {
      matchedKeywords.push(token);
      score += 4;
    }
    if (matchedKeywords.length >= 4) {
      break;
    }
  }

  return {
    score,
    matchedKeywords,
    reasons
  };
}

function isLikelyOnboardingCopy(value) {
  return ONBOARDING_COPY_PATTERN.test(normalizeText(value));
}

function sameOriginUrl(base, target) {
  try {
    return new URL(target, base).origin === new URL(base).origin;
  } catch {
    return false;
  }
}

function sanitizeReportStatus(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (["completed", "partial", "failed", "failed_validation"].includes(normalized)) {
    return normalized;
  }
  return "failed";
}

function sanitizeFindingType(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  const allowed = new Set([
    "bug",
    "frustration_point",
    "confusion_point",
    "aha_moment",
    "dead_end",
    "performance_issue",
    "accessibility_issue",
    "copy_issue",
    "visual_quality_issue"
  ]);
  if (allowed.has(normalized)) {
    return normalized;
  }
  return "confusion_point";
}

function sanitizeSeverity(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (["low", "medium", "high", "critical"].includes(normalized)) {
    return normalized;
  }
  return "medium";
}

function sanitizeEmotion(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (
    ["confidence", "uncertainty", "frustration", "delight", "confusion", "trust", "distrust"].includes(
      normalized
    )
  ) {
    return normalized;
  }
  return "";
}

function defaultEmotionForType(type) {
  if (type === "bug" || type === "dead_end") {
    return "frustration";
  }
  if (type === "frustration_point") {
    return "frustration";
  }
  if (type === "confusion_point") {
    return "confusion";
  }
  if (type === "performance_issue") {
    return "uncertainty";
  }
  if (type === "aha_moment") {
    return "delight";
  }
  if (type === "copy_issue" || type === "accessibility_issue" || type === "visual_quality_issue") {
    return "distrust";
  }
  return "uncertainty";
}

function clampEmotionIntensity(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 3;
  }
  return Math.min(5, Math.max(1, Math.round(numeric)));
}

function uniqueStringList(values, limit = 120) {
  if (!Array.isArray(values)) {
    return [];
  }
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
    if (output.length >= limit) {
      break;
    }
  }
  return output;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseFirstJsonObject(rawText) {
  const text = normalizeText(rawText);
  if (!text) {
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    return isPlainObject(parsed) ? parsed : null;
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
      const content = Array.isArray(outputItem && outputItem.content) ? outputItem.content : [];
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
  if (!isPlainObject(payload) || !Array.isArray(payload.choices) || !payload.choices.length) {
    return "";
  }
  const content = payload.choices[0]?.message?.content;
  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }
  if (Array.isArray(content)) {
    const parts = content
      .map((item) => (typeof item?.text === "string" ? item.text.trim() : ""))
      .filter(Boolean);
    return parts.join("\n").trim();
  }
  return "";
}

function sanitizeStringList(values, limit = 8, maxLength = 280) {
  if (!Array.isArray(values)) {
    return [];
  }
  return uniqueStringList(
    values
      .map((value) => normalizeText(value).slice(0, maxLength))
      .filter(Boolean),
    limit
  );
}

function resolveMissionJudgeSettings(config = {}) {
  const apiKey = normalizeText(
    config.openAiApiKey ||
      config.missionJudgeApiKey ||
      process.env.OPENAI_API_KEY ||
      process.env.QA_OPENAI_API_KEY ||
      ""
  );
  const baseUrl = normalizeText(
    config.openAiBaseUrl || process.env.QA_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL
  ).replace(/\/+$/, "");
  const model =
    normalizeText(config.missionJudgeModel || process.env.QA_MISSION_JUDGE_MODEL || process.env.QA_MODEL) ||
    DEFAULT_MISSION_JUDGE_MODEL;
  const timeoutMs = parsePositiveInteger(
    config.missionJudgeTimeoutMs || process.env.QA_MISSION_JUDGE_TIMEOUT_MS,
    DEFAULT_MISSION_JUDGE_TIMEOUT_MS
  );
  const stateChangeTimeoutMs = parsePositiveInteger(
    config.missionJudgeStateChangeTimeoutMs || process.env.QA_MISSION_JUDGE_STATE_CHANGE_TIMEOUT_MS,
    DEFAULT_MISSION_JUDGE_STATE_CHANGE_TIMEOUT_MS
  );
  const staleRoundLimit = parsePositiveInteger(
    config.missionJudgeStaleRoundLimit || process.env.QA_MISSION_JUDGE_STALE_ROUND_LIMIT,
    DEFAULT_MISSION_JUDGE_STALE_ROUND_LIMIT
  );
  return {
    enabled: Boolean(apiKey),
    apiKey,
    baseUrl: baseUrl || DEFAULT_OPENAI_BASE_URL,
    model,
    timeoutMs,
    stateChangeTimeoutMs,
    staleRoundLimit
  };
}

function resolveMissionGoalText(config, scenarioGoals) {
  const explicitGoal = normalizeText(config && config.goal);
  if (explicitGoal) {
    return explicitGoal;
  }
  return buildScenarioContextValue(Array.isArray(scenarioGoals) ? scenarioGoals : []);
}

function buildMissionJudgePrompt({
  goal,
  persona,
  currentUrl,
  pageText,
  recentNotes,
  visitedFeatures,
  round
}) {
  const noteText = Array.isArray(recentNotes) && recentNotes.length ? recentNotes.map((item) => `- ${item}`).join("\n") : "- none";
  const featureText =
    Array.isArray(visitedFeatures) && visitedFeatures.length
      ? visitedFeatures
          .slice(-5)
          .map((feature) => `- ${feature.label} -> ${feature.url || feature.before_url || "-"}`)
          .join("\n")
      : "- none yet";

  return [
    "You are the mission-completion judge for a browser QA run.",
    "The dashboard mission text is the ONLY authority for whether the run is successful.",
    "Ask yourself: did the user actually finish the requested mission yet?",
    "If the answer is no, choose one next visible action that is most likely to move the mission forward.",
    "If the mission is visibly complete, return complete=true and next_action.action=done.",
    "If the mission is impossible or irrecoverably blocked from the current product state, return complete=false and next_action.action=fail.",
    "Do not stop because of action count, round count, or time spent. Keep going until the mission is visibly complete or visibly blocked.",
    "Do NOT mark complete just because the browser reached a relevant page or opened a feature area.",
    "Only mark complete when there is concrete visible evidence that the requested outcome itself happened.",
    "Use only visible evidence from the screenshot and provided page text. Do not assume hidden state.",
    "Return EXACTLY one JSON object and nothing else.",
    "",
    "JSON schema:",
    "{",
    '  "complete": true|false,',
    '  "confidence": 0.0,',
    '  "reason": "short explanation",',
    '  "evidence": ["short visible evidence string"],',
    '  "completion_evidence": ["proof that the requested mission is finished"],',
    '  "next_action": {',
    '    "action": "click|type|press|scroll|navigate|wait|explore|none|done|fail",',
    '    "target": "visible target description",',
    '    "text": "text to type when action=type",',
    '    "key": "keyboard key when action=press",',
    '    "url": "absolute URL when action=navigate",',
    '    "direction": "up|down when action=scroll",',
    '    "amount": 700',
    "  }",
    "}",
    "",
    `Round: ${round}`,
    `Mission: ${goal || "-"}`,
    `Persona: ${persona || "-"}`,
    `Current URL: ${currentUrl || "-"}`,
    "Recently visited feature areas:",
    featureText,
    "Recent concrete actions:",
    noteText,
    "Visible page text excerpt:",
    pageText || "-"
  ].join("\n");
}

function normalizeMissionJudgeDecision(rawDecision) {
  const parsed = isPlainObject(rawDecision) ? rawDecision : parseFirstJsonObject(rawDecision);
  if (!parsed) {
    throw new Error("Mission judge did not return valid JSON");
  }

  const nextActionRaw = isPlainObject(parsed.next_action) ? parsed.next_action : {};
  const action = normalizeText(nextActionRaw.action || parsed.action).toLowerCase() || "none";
  const confidenceRaw = Number(parsed.confidence);
  const confidence = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : 0;

  return {
    complete: Boolean(parsed.complete),
    confidence,
    reason: normalizeText(parsed.reason),
    evidence: sanitizeStringList(parsed.evidence, 6, 200),
    completion_evidence: sanitizeStringList(parsed.completion_evidence, 6, 220),
    next_action: {
      action: MISSION_JUDGE_ALLOWED_ACTIONS.has(action) ? action : "none",
      target: normalizeText(nextActionRaw.target || parsed.target).slice(0, 220),
      text: normalizeText(nextActionRaw.text || parsed.text).slice(0, 2000),
      key: normalizeText(nextActionRaw.key || parsed.key).slice(0, 64),
      url: normalizeText(nextActionRaw.url || parsed.url).slice(0, 4096),
      direction: normalizeText(nextActionRaw.direction || parsed.direction).toLowerCase() === "up" ? "up" : "down",
      amount: parsePositiveInteger(nextActionRaw.amount || parsed.amount, 700)
    }
  };
}

async function requestMissionJudgeDecisionWithResponses({
  apiKey,
  baseUrl,
  model,
  prompt,
  screenshotDataUrl,
  timeoutMs
}) {
  const abortController = new AbortController();
  const effectiveTimeoutMs =
    Number.isFinite(timeoutMs) && timeoutMs >= 1000 ? Math.floor(timeoutMs) : DEFAULT_MISSION_JUDGE_TIMEOUT_MS;
  const timeoutId = setTimeout(() => abortController.abort(), effectiveTimeoutMs);

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
            content: [{ type: "input_text", text: "Judge mission completion and propose the next browser action. Return one JSON object." }]
          },
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              { type: "input_image", image_url: screenshotDataUrl }
            ]
          }
        ],
        max_output_tokens: 450
      }),
      signal: abortController.signal
    });

    if (!response.ok) {
      throw new Error(`responses endpoint failed (${response.status}): ${normalizeText(await response.text()).slice(0, 320)}`);
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

async function requestMissionJudgeDecisionWithChatCompletions({
  apiKey,
  baseUrl,
  model,
  prompt,
  screenshotDataUrl,
  timeoutMs
}) {
  const abortController = new AbortController();
  const effectiveTimeoutMs =
    Number.isFinite(timeoutMs) && timeoutMs >= 1000 ? Math.floor(timeoutMs) : DEFAULT_MISSION_JUDGE_TIMEOUT_MS;
  const timeoutId = setTimeout(() => abortController.abort(), effectiveTimeoutMs);

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
            content: "Judge mission completion and propose the next browser action. Return one JSON object."
          },
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: screenshotDataUrl } }
            ]
          }
        ],
        max_tokens: 450
      }),
      signal: abortController.signal
    });

    if (!response.ok) {
      throw new Error(
        `chat completions endpoint failed (${response.status}): ${normalizeText(await response.text()).slice(0, 320)}`
      );
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

async function requestMissionJudgeDecision(params) {
  const errors = [];

  try {
    const text = await requestMissionJudgeDecisionWithResponses(params);
    return normalizeMissionJudgeDecision(text);
  } catch (error) {
    errors.push(error.message || "responses endpoint failed");
  }

  try {
    const text = await requestMissionJudgeDecisionWithChatCompletions(params);
    return normalizeMissionJudgeDecision(text);
  } catch (error) {
    errors.push(error.message || "chat completions endpoint failed");
  }

  throw new Error(`Mission judge request failed. ${errors.join(" | ")}`);
}

async function captureMissionJudgeSnapshot(page) {
  const screenshotBuffer = await page.screenshot({ type: "png", fullPage: false });
  const safeScreenshotBuffer = Buffer.isBuffer(screenshotBuffer) ? screenshotBuffer : Buffer.from(String(screenshotBuffer || ""));
  return {
    currentUrl: page.url(),
    pageText: await textSample(page),
    screenshotDataUrl: `data:image/png;base64,${safeScreenshotBuffer.toString("base64")}`,
    visualHash: crypto.createHash("sha1").update(safeScreenshotBuffer).digest("hex")
  };
}

function buildMissionSnapshotSignature(snapshot) {
  if (!isPlainObject(snapshot)) {
    return "";
  }
  const currentUrl = normalizeText(snapshot.currentUrl).replace(/#.*$/, "");
  const pageText = normalizeText(snapshot.pageText).toLowerCase().slice(0, 1600);
  const visualHash = normalizeText(snapshot.visualHash).toLowerCase();
  return [currentUrl, visualHash, pageText].filter(Boolean).join("::");
}

function tokenizeMissionSemanticText(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3)
    .slice(0, 240);
}

function computeMissionTokenOverlap(leftTokens, rightTokens) {
  const left = new Set(Array.isArray(leftTokens) ? leftTokens : []);
  const right = new Set(Array.isArray(rightTokens) ? rightTokens : []);
  if (!left.size || !right.size) {
    return 0;
  }

  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }

  return intersection / Math.max(left.size, right.size);
}

function areMissionSnapshotsSemanticallyEquivalent(leftSnapshot, rightSnapshot) {
  if (!isPlainObject(leftSnapshot) || !isPlainObject(rightSnapshot)) {
    return false;
  }

  const leftUrl = normalizeText(leftSnapshot.currentUrl).replace(/[?#].*$/, "");
  const rightUrl = normalizeText(rightSnapshot.currentUrl).replace(/[?#].*$/, "");
  if (!leftUrl || !rightUrl || leftUrl !== rightUrl) {
    return false;
  }

  const leftText = normalizeText(leftSnapshot.pageText).toLowerCase();
  const rightText = normalizeText(rightSnapshot.pageText).toLowerCase();
  if (!leftText || !rightText) {
    return false;
  }
  if (leftText === rightText) {
    return true;
  }
  if (leftText.slice(0, 900) === rightText.slice(0, 900)) {
    return true;
  }

  const overlap = computeMissionTokenOverlap(
    tokenizeMissionSemanticText(leftText),
    tokenizeMissionSemanticText(rightText)
  );
  return overlap >= 0.7;
}

function describeMissionStateChange(beforeSnapshot, afterSnapshot) {
  const beforeUrl = normalizeText(beforeSnapshot && beforeSnapshot.currentUrl);
  const afterUrl = normalizeText(afterSnapshot && afterSnapshot.currentUrl);
  if (beforeUrl && afterUrl && beforeUrl !== afterUrl) {
    return "url_changed";
  }
  const beforeVisualHash = normalizeText(beforeSnapshot && beforeSnapshot.visualHash);
  const afterVisualHash = normalizeText(afterSnapshot && afterSnapshot.visualHash);
  if (beforeVisualHash && afterVisualHash && beforeVisualHash !== afterVisualHash) {
    return "visual_state_changed";
  }
  const beforeText = normalizeText(beforeSnapshot && beforeSnapshot.pageText);
  const afterText = normalizeText(afterSnapshot && afterSnapshot.pageText);
  if (beforeText && afterText && beforeText !== afterText) {
    return "page_text_changed";
  }
  return "no_visible_change";
}

function getMissionContextPageCount(page) {
  try {
    if (page && typeof page.context === "function") {
      const context = page.context();
      if (context && typeof context.pages === "function") {
        const pages = context.pages();
        if (Array.isArray(pages)) {
          return pages.length;
        }
      }
    }
  } catch {
    // Ignore context inspection failures.
  }
  return null;
}

async function delayMissionProbe(page, durationMs) {
  const safeDurationMs = Math.max(50, Number(durationMs) || 50);
  if (page && typeof page.waitForTimeout === "function") {
    await page.waitForTimeout(safeDurationMs);
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, safeDurationMs));
}

async function waitForMissionStateChange(page, beforeSnapshot, options = {}) {
  const initialSnapshot =
    isPlainObject(beforeSnapshot) && buildMissionSnapshotSignature(beforeSnapshot)
      ? beforeSnapshot
      : await captureMissionJudgeSnapshot(page);
  const initialSignature = buildMissionSnapshotSignature(initialSnapshot);
  const timeoutMs = parsePositiveInteger(options.timeoutMs, DEFAULT_MISSION_JUDGE_STATE_CHANGE_TIMEOUT_MS);
  const pollMs = Math.min(parsePositiveInteger(options.pollMs, 500), timeoutMs);
  const deadline = Date.now() + Math.max(timeoutMs, pollMs);
  const initialPageCount = getMissionContextPageCount(page);
  let lastSnapshot = initialSnapshot;

  while (Date.now() < deadline) {
    await delayMissionProbe(page, pollMs);

    const currentPageCount = getMissionContextPageCount(page);
    if (
      Number.isFinite(initialPageCount) &&
      Number.isFinite(currentPageCount) &&
      currentPageCount > initialPageCount
    ) {
      return {
        changed: true,
        reason: "new_page_opened",
        snapshot: lastSnapshot
      };
    }

    lastSnapshot = await captureMissionJudgeSnapshot(page);
    if (buildMissionSnapshotSignature(lastSnapshot) !== initialSignature) {
      return {
        changed: true,
        reason: describeMissionStateChange(initialSnapshot, lastSnapshot),
        snapshot: lastSnapshot
      };
    }
  }

  return {
    changed: false,
    reason: "no_visible_change",
    snapshot: lastSnapshot
  };
}

function createFeatureExplorationState() {
  return {
    attempted: 0,
    discovered: 0,
    visited_count: 0,
    blocked_count: 0,
    interactions_completed: 0,
    matched_goal_count: 0,
    matched_goals: [],
    features_visited: [],
    blocked_features: [],
    _attemptedKeys: new Set(),
    _discoveredKeys: new Set()
  };
}

function summarizeFeatureExplorationState(state) {
  const matchedGoals = Array.from(
    new Set(
      (Array.isArray(state.features_visited) ? state.features_visited : []).flatMap((feature) =>
        Array.isArray(feature.matched_goals) ? feature.matched_goals : []
      )
    )
  );
  return {
    attempted: state._attemptedKeys.size,
    discovered: state._discoveredKeys.size,
    visited_count: Array.isArray(state.features_visited) ? state.features_visited.length : 0,
    blocked_count: Array.isArray(state.blocked_features) ? state.blocked_features.length : 0,
    interactions_completed: Number(state.interactions_completed) || 0,
    matched_goal_count: matchedGoals.length,
    matched_goals: matchedGoals,
    features_visited: Array.isArray(state.features_visited) ? state.features_visited : [],
    blocked_features: Array.isArray(state.blocked_features) ? state.blocked_features : [],
    invoked: true
  };
}

function emitProgress(onProgress, event, data = {}) {
  if (typeof onProgress !== "function") {
    return;
  }
  const payload = data && typeof data === "object" ? data : {};
  try {
    onProgress({
      ts: new Date().toISOString(),
      event: String(event || "progress"),
      data: payload
    });
  } catch {
    // Never fail core QA flow on telemetry hook errors.
  }
}

function inferBrandKeyFromUrl(targetUrl) {
  try {
    const parsed = new URL(String(targetUrl || ""));
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function buildPublishedRunId(matrixId, runId, config) {
  const prefix = safeFileName(config.publishRunPrefix || "local") || "local";
  const matrix = safeFileName(matrixId || "matrix");
  const run = safeFileName(runId || "run");
  return `${prefix}_${matrix}_${run}`;
}

function extractPublicBaseUrl(callbackUrl) {
  try {
    const parsed = new URL(String(callbackUrl || ""));
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "";
  }
}

function normalizeFindingsForCallback(findings, options = {}) {
  const safeFindings = Array.isArray(findings) ? findings : [];
  const fallbackScreenshots = uniqueStringList(options.fallbackScreenshots || [], 24);
  const recommendations = uniqueStringList(options.recommendations || [], 20);

  return safeFindings.map((finding, index) => {
    const safe = finding && typeof finding === "object" ? finding : {};
    const id = String(safe.id || `finding_${String(index + 1).padStart(2, "0")}`).trim();
    const type = sanitizeFindingType(safe.type);
    const severity = sanitizeSeverity(safe.severity);
    const expectedBehavior = String(safe.expected_behavior || "").trim()
      || "Feature should be reachable and complete without avoidable friction.";
    const observedBehavior = String(safe.observed_behavior || safe.title || "").trim()
      || "Observed behavior diverged from expected user flow.";

    const sourceEmotion =
      safe.emotional_reaction && typeof safe.emotional_reaction === "object"
        ? safe.emotional_reaction
        : {};
    const primaryEmotion = sanitizeEmotion(sourceEmotion.primary) || defaultEmotionForType(type);
    const intensity = clampEmotionIntensity(sourceEmotion.intensity);
    const signals = uniqueStringList(sourceEmotion.signals || [], 6);

    const sourceEvidence = safe.evidence && typeof safe.evidence === "object" ? safe.evidence : {};
    const screenshots = uniqueStringList(sourceEvidence.screenshots || [], 20);
    if (!screenshots.length && fallbackScreenshots.length) {
      screenshots.push(fallbackScreenshots[0]);
    }
    const videos = uniqueStringList(sourceEvidence.videos || [], 10);
    const sourceDiagnostics =
      safe.diagnostic_details && typeof safe.diagnostic_details === "object" ? safe.diagnostic_details : {};
    const diagnosticDetails = buildFindingDiagnosticDetails({}, {
      pageLoaded: sourceDiagnostics.page_loaded,
      currentUrl: sourceDiagnostics.current_url,
      currentState: sourceDiagnostics.current_state || observedBehavior,
      failureReason: sourceDiagnostics.failure_reason || observedBehavior,
      lastSuccessfulStep: sourceDiagnostics.last_successful_step || "Reached the affected area.",
      attemptedActions: Array.isArray(sourceDiagnostics.attempted_actions) ? sourceDiagnostics.attempted_actions : [],
      repeatedStateCount: sourceDiagnostics.repeated_state_count,
      defaultTarget: String(safe?.element?.text || safe?.title || "").trim()
    });

    return {
      ...safe,
      id,
      type,
      severity,
      expected_behavior: expectedBehavior,
      observed_behavior: observedBehavior,
      emotional_reaction: {
        primary: primaryEmotion,
        intensity,
        signals
      },
      diagnostic_details: diagnosticDetails,
      fix_hint: String(safe.fix_hint || recommendations[0] || "Prioritize this issue in the next UX stability pass.").trim(),
      evidence: {
        ...sourceEvidence,
        screenshots,
        videos
      }
    };
  });
}

async function publishRunToCallback({ runResult, config, matrixId }) {
  const callbackUrl = String(config.publishCallbackUrl || "").trim();
  const callbackSecret = String(config.publishCallbackSecret || "").trim();
  const ownerUserId = String(config.publishOwnerUserId || "").trim();
  const ownerEmail = String(config.publishOwnerEmail || "").trim().toLowerCase();
  if (!callbackUrl) {
    return { attempted: false, ok: false, status: null, error: "publish callback URL is not configured" };
  }
  if (!callbackSecret) {
    return { attempted: false, ok: false, status: null, error: "publish callback secret is not configured" };
  }
  if (!ownerUserId) {
    return { attempted: false, ok: false, status: null, error: "publish owner user id is not configured" };
  }
  if (!ownerEmail) {
    return { attempted: false, ok: false, status: null, error: "publish owner email is not configured" };
  }
  if (typeof fetch !== "function") {
    return { attempted: false, ok: false, status: null, error: "fetch is not available in this Node runtime" };
  }

  const qaJsonPath = runResult?.artifacts?.qa_report_json;
  const qaMdPath = runResult?.artifacts?.qa_report_md;
  if (!qaJsonPath || !fs.existsSync(qaJsonPath)) {
    return { attempted: false, ok: false, status: null, error: "qa_report.json not found for publishing" };
  }

  let qaReport = null;
  try {
    qaReport = JSON.parse(fs.readFileSync(qaJsonPath, "utf8"));
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      status: null,
      error: `failed to parse qa_report.json: ${error && error.message ? error.message : String(error)}`
    };
  }
  const qaMarkdown = qaMdPath && fs.existsSync(qaMdPath) ? fs.readFileSync(qaMdPath, "utf8") : "";
  const reportCandidate = qaReport && typeof qaReport === "object" ? { ...qaReport } : {};

  const brandKey = String(config.publishBrandKey || inferBrandKeyFromUrl(runResult.target_url || config.target) || "local").trim();
  const publishedRunId = buildPublishedRunId(matrixId, runResult.run_id, config);
  const deliveredAt = new Date().toISOString();
  const publicBaseUrl = extractPublicBaseUrl(callbackUrl);
  const reportUrl = publicBaseUrl
    ? `${publicBaseUrl}/api/qa/report?run_id=${encodeURIComponent(publishedRunId)}`
    : null;
  const uiReportUrl = publicBaseUrl
    ? `${publicBaseUrl}/dashboard?${new URLSearchParams({
        view: "report",
        run_id: publishedRunId,
        brand: brandKey
      }).toString()}`
    : null;

  const reportForCallback = {
    ...reportCandidate,
    run_id: publishedRunId,
    target: String(reportCandidate.target || runResult.target_url || config.target || "").trim(),
    status: sanitizeReportStatus(reportCandidate.status || (runResult.success ? "completed" : "failed")),
    source: String(config.publishSource || "qa_bot_local").trim() || "qa_bot_local",
    delivered_at: deliveredAt,
    report_url: reportUrl,
    owner_user_id: ownerUserId,
    owner_email: ownerEmail,
    findings: normalizeFindingsForCallback(reportCandidate.findings, {
      fallbackScreenshots: reportCandidate?.evidence_gallery?.screenshots || runResult?.artifacts?.screenshots || [],
      recommendations: reportCandidate.recommendations || []
    }),
    metadata: {
      ...(reportCandidate.metadata && typeof reportCandidate.metadata === "object" ? reportCandidate.metadata : {}),
      owner_user_id: ownerUserId,
      owner_email: ownerEmail,
      brand_key: brandKey,
      imported_from: {
        matrix_id: matrixId,
        local_run_id: runResult.run_id
      }
    }
  };

  const callbackPayload = {
    ...reportForCallback,
    report_json: reportForCallback,
    report_markdown: qaMarkdown || null,
    owner_user_id: ownerUserId,
    owner_email: ownerEmail,
    artifacts: {
      ...(runResult.artifacts && typeof runResult.artifacts === "object" ? runResult.artifacts : {}),
      local_matrix_id: matrixId,
      local_run_id: runResult.run_id
    },
    run_log: uniqueStringList(runResult.notes || [], 400)
  };

  let response;
  try {
    response = await fetch(callbackUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-callback-secret": callbackSecret
      },
      body: JSON.stringify(callbackPayload)
    });
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      status: null,
      error: error && error.message ? error.message : String(error),
      published_run_id: publishedRunId,
      ui_report_url: uiReportUrl
    };
  }

  let responseBody = null;
  try {
    responseBody = await response.json();
  } catch {
    responseBody = null;
  }

  if (!response.ok || !responseBody || responseBody.ok !== true) {
    return {
      attempted: true,
      ok: false,
      status: response.status,
      error:
        (responseBody && (responseBody.error || responseBody.message)) ||
        `callback request failed with status ${response.status}`,
      published_run_id: publishedRunId,
      ui_report_url: uiReportUrl
    };
  }

  return {
    attempted: true,
    ok: true,
    status: response.status,
    error: null,
    callback_id: responseBody.id || null,
    published_run_id: publishedRunId,
    ui_report_url: uiReportUrl
  };
}

async function firstVisibleLocator(candidates) {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    try {
      const count = await candidate.count();
      for (let index = 0; index < count; index += 1) {
        const item = candidate.nth(index);
        if (await item.isVisible({ timeout: 300 })) {
          return item;
        }
      }
    } catch {
      // Ignore failed probes and keep scanning.
    }
  }
  return null;
}

async function findAuthEntryTrigger(page) {
  return firstVisibleLocator([
    page.locator("header a, nav a").filter({ hasText: AUTH_ENTRY_STRONG_TEXT_PATTERN }),
    page.locator("header button, nav button").filter({ hasText: AUTH_ENTRY_STRONG_TEXT_PATTERN }),
    page.locator(
      [
        'header a[href*="/login"]',
        'header a[href*="/signin"]',
        'header a[href*="/sign-in"]',
        'header a[href*="/signup"]',
        'header a[href*="/sign-up"]',
        'header a[href*="/register"]',
        'header a[href*="/auth"]',
        'header a[href*="app."]',
        'nav a[href*="/login"]',
        'nav a[href*="/signin"]',
        'nav a[href*="/sign-in"]',
        'nav a[href*="/signup"]',
        'nav a[href*="/sign-up"]',
        'nav a[href*="/register"]',
        'nav a[href*="/auth"]',
        'nav a[href*="app."]'
      ].join(",")
    ),
    page.getByRole("link", { name: AUTH_ENTRY_STRONG_TEXT_PATTERN }),
    page.getByRole("button", { name: AUTH_ENTRY_STRONG_TEXT_PATTERN }),
    page.locator("main a, main button").filter({ hasText: AUTH_ENTRY_STRONG_TEXT_PATTERN }),
    page.locator("header a, header button, nav a, nav button").filter({ hasText: AUTH_ENTRY_WEAK_TEXT_PATTERN }),
    page.locator("main a, main button").filter({ hasText: AUTH_ENTRY_WEAK_TEXT_PATTERN }),
    page.locator(
      [
        'a[href*="/login"]',
        'a[href*="/signin"]',
        'a[href*="/sign-in"]',
        'a[href*="/signup"]',
        'a[href*="/sign-up"]',
        'a[href*="/register"]',
        'a[href*="/auth"]',
        'a[href*="app."]'
      ].join(",")
    ),
    page.locator('button:has-text("Login"),a:has-text("Login")'),
    page.locator("text=/^\\s*Login\\s*$/i")
  ]);
}

async function waitForAuthSurface(page, timeoutMs = 8000) {
  const deadline = Date.now() + Math.max(1000, Number(timeoutMs) || 8000);
  while (Date.now() < deadline) {
    if (
      await hasVisibleLocator([
        page.locator(
          'input[type="email"],input[autocomplete="email"],input[name*="email" i],input[placeholder*="email" i]'
        ),
        page.locator('input[type="password"]'),
        page.locator(
          'input[maxlength="1"],input[inputmode="numeric"][maxlength="1"],input[autocomplete="one-time-code"]'
        ),
        page.locator("text=/let'?s start|check your email|security code|verification code|create account/i")
      ])
    ) {
      return true;
    }
    await page.waitForTimeout(250);
  }
  return false;
}

async function hasVisibleLocator(candidates) {
  return Boolean(await firstVisibleLocator(candidates));
}

async function textSample(page) {
  try {
    const bodyText = await page.locator("body").innerText({ timeout: 3000 });
    return bodyText.replace(/\s+/g, " ").slice(0, 6000);
  } catch {
    return "";
  }
}

async function collectVisibleTexts(page, candidates, limit = 10) {
  const values = [];
  for (const locator of candidates) {
    if (!locator) {
      continue;
    }
    try {
      const count = await locator.count();
      for (let index = 0; index < count && values.length < limit; index += 1) {
        const item = locator.nth(index);
        if (!(await item.isVisible({ timeout: 200 }))) {
          continue;
        }
        const text = (await item.innerText({ timeout: 500 })).trim();
        if (!text) {
          continue;
        }
        values.push(text.slice(0, 240));
      }
    } catch {
      // Ignore text extraction errors.
    }
    if (values.length >= limit) {
      break;
    }
  }
  return values;
}

function sanitizeMissionActionPhrase(value) {
  return normalizeText(value)
    .replace(/\b(?:click|tap|press|choose|select)\b/gi, " ")
    .replace(/\b(?:button|link|tab|menu(?:\s+item)?|option|section|card|panel|area|field|textbox|input)\b/gi, " ")
    .replace(/\b(?:top[\s-]*right|top[\s-]*left|bottom[\s-]*right|bottom[\s-]*left)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractQuotedPhrases(value) {
  const phrases = [];
  const pattern = /["'`](.+?)["'`]/g;
  let match;
  while ((match = pattern.exec(String(value || "")))) {
    const phrase = sanitizeMissionActionPhrase(match[1]);
    if (phrase) {
      phrases.push(phrase);
    }
  }
  return Array.from(new Set(phrases));
}

function tokenizeMissionActionText(value) {
  const tokens = sanitizeMissionActionPhrase(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token && token.length >= 2 && !MISSION_ACTION_STOP_WORDS.has(token));
  return Array.from(new Set(tokens));
}

function extractMissionActionIntent(target) {
  const safeTarget = normalizeText(target);
  const quotedPhrases = extractQuotedPhrases(safeTarget);
  const contextHints = new Set(quotedPhrases.slice(1));
  const contextPattern = /\b(?:under|inside|within|in|from|near)\s+([^.,;]+)/gi;
  let contextMatch;
  while ((contextMatch = contextPattern.exec(safeTarget))) {
    const hint = sanitizeMissionActionPhrase(contextMatch[1]).replace(/\b(?:section|card|panel|area)\b/gi, "").trim();
    if (hint) {
      contextHints.add(hint);
    }
  }

  let primaryLabel = quotedPhrases[0] || "";
  if (!primaryLabel) {
    const actionFreeTarget = safeTarget.replace(/\b(?:click|tap|press|choose|select)\b/gi, " ").trim();
    const descriptorMatch = actionFreeTarget.match(
      /^(.*?)(?:\b(?:button|link|tab|menu(?:\s+item)?|option|field|textbox|input)\b|$)/i
    );
    primaryLabel = sanitizeMissionActionPhrase(descriptorMatch && descriptorMatch[1] ? descriptorMatch[1] : actionFreeTarget);
    if (!primaryLabel) {
      primaryLabel = sanitizeMissionActionPhrase(actionFreeTarget);
    }
  }

  if (!primaryLabel && quotedPhrases.length) {
    primaryLabel = quotedPhrases[0];
  }

  return {
    rawTarget: safeTarget,
    primaryLabel,
    primaryTokens: tokenizeMissionActionText(primaryLabel || safeTarget),
    contextHints: Array.from(contextHints),
    contextTokens: Array.from(new Set(Array.from(contextHints).flatMap((item) => tokenizeMissionActionText(item)))),
    targetTokens: tokenizeMissionActionText(safeTarget)
  };
}

function scoreMissionActionCandidate(candidate, intent) {
  if (!candidate || !intent) {
    return Number.NEGATIVE_INFINITY;
  }
  const label = normalizeText(candidate.label).toLowerCase();
  const context = normalizeText(candidate.context).toLowerCase();
  if (!label) {
    return Number.NEGATIVE_INFINITY;
  }

  const primaryLabel = normalizeText(intent.primaryLabel).toLowerCase();
  const primaryTokens = Array.isArray(intent.primaryTokens) ? intent.primaryTokens : [];
  const contextHints = Array.isArray(intent.contextHints) ? intent.contextHints : [];
  const contextTokens = Array.isArray(intent.contextTokens) ? intent.contextTokens : [];
  const targetTokens = Array.isArray(intent.targetTokens) ? intent.targetTokens : [];

  let score = 0;
  if (primaryLabel) {
    if (label === primaryLabel) {
      score += 180;
    } else if (label.includes(primaryLabel)) {
      score += 140;
    }
  }

  let labelTokenHits = 0;
  for (const token of primaryTokens) {
    if (label.includes(token)) {
      score += 28;
      labelTokenHits += 1;
    } else if (context.includes(token)) {
      score += 10;
    }
  }

  if (primaryTokens.length && labelTokenHits === primaryTokens.length) {
    score += 90;
  }

  for (const hint of contextHints) {
    const safeHint = normalizeText(hint).toLowerCase();
    if (!safeHint) {
      continue;
    }
    if (context.includes(safeHint)) {
      score += 50;
    } else if (label.includes(safeHint)) {
      score += 28;
    }
  }

  for (const token of contextTokens) {
    if (context.includes(token)) {
      score += 16;
    } else if (label.includes(token)) {
      score += 8;
    }
  }

  for (const token of targetTokens) {
    if (label.includes(token)) {
      score += 8;
    } else if (context.includes(token)) {
      score += 4;
    }
  }

  if ((candidate.role || "").includes("button") || candidate.tagName === "button") {
    score += 4;
  }

  if (!primaryTokens.length && !contextTokens.length && !contextHints.length) {
    score -= 40;
  }

  if (/\b(?:close|dismiss|cancel|back|help|support|settings?)\b/.test(label) && !/\b(?:close|dismiss|cancel|back|help|support|settings?)\b/.test(primaryLabel)) {
    score -= 30;
  }

  return score;
}

async function findMissionActionLocatorByIntent(page, intent) {
  const locator = page.locator(MISSION_CLICKABLE_SELECTOR);
  const count = Math.min(await locator.count(), 120);
  let bestMatch = null;

  for (let index = 0; index < count; index += 1) {
    const item = locator.nth(index);
    try {
      if (!(await item.isVisible({ timeout: 200 }))) {
        continue;
      }
      const candidate = await item.evaluate((element) => {
        const label = [
          element.getAttribute("aria-label"),
          element.getAttribute("title"),
          "value" in element ? element.value : "",
          element.innerText,
          element.textContent
        ]
          .filter(Boolean)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 240);

        const contextNode =
          element.closest("section,article,form,[role='dialog'],[role='tabpanel'],[data-testid],main,aside,nav,div") ||
          element.parentElement;
        const context = contextNode
          ? String(contextNode.innerText || contextNode.textContent || "")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 480)
          : "";

        return {
          label,
          context,
          role: element.getAttribute("role") || "",
          tagName: element.tagName.toLowerCase()
        };
      });
      const score = scoreMissionActionCandidate(candidate, intent);
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { score, index };
      }
    } catch {
      // Ignore detached nodes while scanning.
    }
  }

  if (!bestMatch || bestMatch.score < 90) {
    return null;
  }
  return locator.nth(bestMatch.index);
}

async function clickBestEffort(locator, options = {}) {
  const timeout = Number(options.timeout) > 0 ? Number(options.timeout) : 8000;
  try {
    await locator.click({ timeout });
    return;
  } catch (error) {
    const message = String(error && error.message ? error.message : error);
    const pointerIssue =
      message.includes("intercepts pointer events") ||
      message.includes("outside of the viewport") ||
      message.includes("not receiving pointer events");
    if (pointerIssue) {
      try {
        await locator.click({ timeout: 3000, force: true });
        return;
      } catch {
        // Fall through to JS click fallback.
      }
    }

    try {
      await locator.evaluate((element) => {
        const clickable = element.closest("button,a,[role='button'],label") || element;
        clickable.click();
      });
      return;
    } catch {
      throw error;
    }
  }
}

async function fillBestEffort(locator, value, options = {}) {
  const timeout = Number(options.timeout) > 0 ? Number(options.timeout) : 6000;
  const textValue = String(value == null ? "" : value);
  try {
    await locator.fill(textValue, { timeout });
    return;
  } catch {
    try {
      await locator.fill(textValue, { timeout: 3000, force: true });
      return;
    } catch {
      await locator.evaluate(
        (element, nextValue) => {
          element.focus();
          element.value = nextValue;
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
        },
        textValue
      );
    }
  }
}

async function dismissBlockingOverlays(page, notes) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    let dismissed = false;

    const maybeLater = await firstVisibleLocator([
      page.getByRole("button", { name: /maybe later|not now|skip/i }),
      page.locator('button:has-text("Maybe Later"),button:has-text("Not Now"),button:has-text("Skip")')
    ]);
    if (maybeLater) {
      await clickBestEffort(maybeLater, { timeout: 3000 });
      await page.waitForTimeout(500);
      notes.push("Dismissed top-level modal via secondary action.");
      dismissed = true;
    }

    if (!dismissed) {
      const closeButton = await firstVisibleLocator([
        page.getByRole("button", { name: /close|dismiss/i }),
        page.locator('[aria-label*="close" i],button:has-text("Close"),button:has-text("Dismiss")'),
        page.locator('button:has-text("×"),button:has-text("✕")')
      ]);
      if (closeButton) {
        await clickBestEffort(closeButton, { timeout: 3000 });
        await page.waitForTimeout(500);
        notes.push("Dismissed top-level modal via close control.");
        dismissed = true;
      }
    }

    if (!dismissed) {
      const hasOpenBackdrop = await hasVisibleLocator([
        page.locator('div[data-state="open"][aria-hidden="true"]'),
        page.locator(".fixed.inset-0.bg-black\\/80")
      ]);
      if (hasOpenBackdrop) {
        await page.keyboard.press("Escape");
        await page.waitForTimeout(500);
        notes.push("Sent Escape to clear blocking overlay.");
        dismissed = true;
      }
    }

    if (!dismissed) {
      break;
    }
  }
}

async function collectInvalidFields(page) {
  try {
    return await page.evaluate(() => {
      const fields = Array.from(
        document.querySelectorAll(
          [
            "input:invalid",
            "select:invalid",
            "textarea:invalid",
            '[aria-invalid="true"]',
            "[data-invalid]",
            '[role="combobox"][aria-required="true"]',
            '[role="textbox"][aria-required="true"]'
          ].join(",")
        )
      );
      const seen = new Set();
      return fields
        .filter((field) => {
          if (!(field instanceof HTMLElement)) {
            return false;
          }
          const key = [
            field.tagName,
            field.getAttribute("name") || "",
            field.getAttribute("id") || "",
            field.getAttribute("aria-label") || "",
            field.getAttribute("placeholder") || ""
          ].join("|");
          if (seen.has(key)) {
            return false;
          }
          seen.add(key);

          if (field.matches("input,select,textarea")) {
            if (typeof field.checkValidity === "function" && field.checkValidity() === false) {
              return true;
            }
            if (field.required && !String(field.value || "").trim()) {
              return true;
            }
          }

          const ariaInvalid = String(field.getAttribute("aria-invalid") || "").toLowerCase() === "true";
          const dataInvalid = field.hasAttribute("data-invalid");
          if (ariaInvalid || dataInvalid) {
            return true;
          }

          const ariaRequired = String(field.getAttribute("aria-required") || "").toLowerCase() === "true";
          if (!ariaRequired) {
            return false;
          }

          const currentText =
            "value" in field && typeof field.value === "string"
              ? field.value
              : field.getAttribute("value") || field.textContent || "";
          return !String(currentText || "").trim();
        })
        .slice(0, 12)
        .map((field) => {
        const id = field.getAttribute("id") || "";
        let label = "";
        if (id) {
          const forLabel = document.querySelector(`label[for="${CSS.escape(id)}"]`);
          if (forLabel && typeof forLabel.textContent === "string") {
            label = forLabel.textContent.trim();
          }
        }
        if (!label) {
          const parentLabel = field.closest("label");
          if (parentLabel && typeof parentLabel.textContent === "string") {
            label = parentLabel.textContent.trim();
          }
        }
        return {
          tag: field.tagName.toLowerCase(),
          type: field.getAttribute("type") || "",
          name: field.getAttribute("name") || "",
          id,
          placeholder: field.getAttribute("placeholder") || "",
          required: field.required === true,
          label: label || field.getAttribute("aria-label") || ""
        };
      });
    });
  } catch {
    return [];
  }
}

async function discoverFeatureCandidates(page, options = {}) {
  const maxCandidates = Number(options.maxCandidates) > 0 ? Number(options.maxCandidates) : 30;
  const scenarioGoals = Array.isArray(options.scenarioGoals) ? options.scenarioGoals : [];
  const personaProfile =
    options.personaProfile && typeof options.personaProfile === "object"
      ? options.personaProfile
      : buildPersonaProfile("");
  const currentUrl = page.url();
  const raw = await page.evaluate(() => {
    const selectors = [
      "nav a",
      "nav button",
      "[role='navigation'] a",
      "[role='navigation'] button",
      "aside a",
      "aside button",
      "main a[href]",
      "main button",
      "main [role='button']",
      "main [role='link']",
      "section a[href]",
      "section button",
      "section [role='button']",
      "[class*='sidebar' i] a",
      "[class*='sidebar' i] button",
      "[class*='menu' i] a",
      "[class*='menu' i] button",
      "[class*='card' i] a",
      "[class*='card' i] button",
      "[class*='workspace' i] a",
      "[class*='workspace' i] button"
    ];
    const nodes = Array.from(document.querySelectorAll(selectors.join(",")));
    const unique = new Set();
    const records = [];
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number(style.opacity) === 0 ||
        rect.width < 6 ||
        rect.height < 6
      ) {
        continue;
      }
      const text = (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
      const href =
        node instanceof HTMLAnchorElement
          ? node.href
          : node.getAttribute("href")
            ? new URL(node.getAttribute("href"), location.href).href
            : "";
      const section = node.closest("aside")
        ? "aside"
        : node.closest("nav")
          ? "nav"
          : node.closest("header")
            ? "header"
            : "main";
      const role = node.getAttribute("role") || node.tagName.toLowerCase();
      const key = `${section}|${role}|${text.toLowerCase()}|${href}`;
      if (unique.has(key)) {
        continue;
      }
      unique.add(key);
      let score = 0;
      if (section === "nav" || section === "aside") {
        score += 50;
      } else if (section === "header") {
        score += 35;
      } else {
        score += 20;
      }
      if (href) {
        score += 20;
      }
      if (text.length >= 3 && text.length <= 50) {
        score += 10;
      }
      records.push({
        key,
        text,
        href,
        section,
        role,
        score
      });
    }
    return records;
  });

  const filtered = [];
  const dedupe = new Set();
  for (const candidate of raw) {
    const text = normalizeText(candidate.text);
    const href = normalizeText(candidate.href);
    if (!text && !href) {
      continue;
    }
    if (text.length > 80) {
      continue;
    }
    if (isDangerousAction(text) || isDangerousAction(href)) {
      continue;
    }
    if (isUtilityAction(text)) {
      continue;
    }
    const hasSameOriginHref = href ? sameOriginUrl(currentUrl, href) : false;
    const hrefPath = hasSameOriginHref ? new URL(href).pathname : "";
    const isValidHref =
      hasSameOriginHref &&
      hrefPath &&
      hrefPath !== "/" &&
      !/\/(logout|login|register|signup|auth|privacy|terms|contact)/i.test(hrefPath);
    const goalScore = scoreCandidateAgainstGoals(candidate, scenarioGoals);
    const personaScore = scoreCandidateAgainstPersona(candidate, personaProfile);
    const shouldInclude =
      isValidHref ||
      candidate.section === "nav" ||
      candidate.section === "aside" ||
      looksFeatureLike(text) ||
      looksCustomerJourneyAction(text) ||
      goalScore.score > 0 ||
      personaScore.score > 0;
    if (!shouldInclude) {
      continue;
    }
    const key = `${text.toLowerCase()}|${hrefPath || href}|${candidate.section}`;
    if (dedupe.has(key)) {
      continue;
    }
    dedupe.add(key);
    filtered.push({
      key,
      text: text || hrefPath || candidate.key,
      href: isValidHref ? href : "",
      section: candidate.section,
      role: candidate.role,
      score: (Number(candidate.score) || 0) + goalScore.score + personaScore.score,
      matched_goals: goalScore.matchedGoals,
      matched_persona_keywords: personaScore.matchedKeywords,
      customer_reasons: personaScore.reasons
    });
  }

  filtered.sort((left, right) => right.score - left.score);
  return filtered.slice(0, maxCandidates);
}

async function openFeatureCandidate(page, candidate, notes) {
  const beforeUrl = page.url();
  const label = normalizeText(candidate.text) || "unnamed_feature";

  if (candidate.href) {
    try {
      await page.goto(candidate.href, { waitUntil: "domcontentloaded", timeout: 25000 });
      const changed = page.url() !== beforeUrl;
      if (changed) {
        notes.push(`Opened feature via direct route: ${label}`);
        return { opened: true, mode: "goto" };
      }
    } catch {
      // Fall back to click-based open.
    }
  }

  const escaped = escapeRegExp(label);
  const clickable = await firstVisibleLocator([
    page.getByRole("link", { name: new RegExp(`^\\s*${escaped}\\s*$`, "i") }),
    page.getByRole("button", { name: new RegExp(`^\\s*${escaped}\\s*$`, "i") }),
    page.getByText(new RegExp(`^\\s*${escaped}\\s*$`, "i")).first()
  ]);
  if (!clickable) {
    return { opened: false, mode: "not_found" };
  }

  try {
    await clickBestEffort(clickable, { timeout: 10000 });
    await page.waitForTimeout(1200);
    notes.push(`Opened feature via click: ${label}`);
    return { opened: true, mode: "click" };
  } catch {
    return { opened: false, mode: "click_failed" };
  }
}

async function exerciseFeatureSurface(page, notes, featureLabel, options = {}) {
  const scenarioGoals = Array.isArray(options.scenarioGoals) ? options.scenarioGoals : [];
  const personaProfile =
    options.personaProfile && typeof options.personaProfile === "object"
      ? options.personaProfile
      : buildPersonaProfile("");
  const actions = [];
  let interactions = 0;
  const textEntryValue = buildPersonaContextValue(personaProfile, scenarioGoals);

  const tab = await firstVisibleLocator([
    page.locator('[role="tab"][aria-selected="false"]'),
    page.locator('[role="tab"]:not([aria-selected="true"])')
  ]);
  if (tab) {
    await clickBestEffort(tab, { timeout: 5000 });
    await page.waitForTimeout(500);
    actions.push("Switched tab on feature surface.");
    interactions += 1;
  }

  const textInput = await firstVisibleLocator([
    page.locator(
      'main input[type="text"]:not([disabled]):not([readonly]):not([name*="otp" i]),main input[type="search"]:not([disabled]):not([readonly]),main textarea:not([disabled]):not([readonly])'
    ),
    page.locator(
      'input[type="text"]:not([disabled]):not([readonly]):not([name*="otp" i]),input[type="search"]:not([disabled]):not([readonly]),textarea:not([disabled]):not([readonly])'
    )
  ]);
  if (textInput) {
    await fillBestEffort(textInput, textEntryValue, { timeout: 5000 });
    actions.push("Filled editable text field.");
    interactions += 1;
  }

  const selectInput = await firstVisibleLocator([
    page.locator("main select:not([disabled])"),
    page.locator("select:not([disabled])")
  ]);
  if (selectInput) {
    try {
      const selected = await selectInput.evaluate((element) => {
        const options = Array.from(element.querySelectorAll("option"));
        const target = options.find(
          (option) =>
            !option.disabled &&
            option.value &&
            option.value !== "0" &&
            option.value !== "select" &&
            option.value !== ""
        );
        if (!target) {
          return "";
        }
        element.value = target.value;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return target.value;
      });
      if (selected) {
        actions.push("Changed dropdown selection.");
        interactions += 1;
      }
    } catch {
      // Ignore select issues and continue.
    }
  }

  const choiceInput = await firstVisibleLocator([
    page.locator('main input[type="checkbox"]:not([disabled]):not([name*="terms" i])'),
    page.locator('main input[type="radio"]:not([disabled])')
  ]);
  if (choiceInput) {
    await clickBestEffort(choiceInput, { timeout: 4000 });
    actions.push("Toggled choice control.");
    interactions += 1;
  }

  const primaryAction = await firstVisibleLocator([
    page.getByRole("button", { name: /create|generate|start|launch|continue|next|open|use template|try sample|build/i }),
    page.getByRole("link", { name: /create|generate|start|launch|continue|next|open|use template|try sample|build/i })
  ]);
  if (primaryAction) {
    await clickBestEffort(primaryAction, { timeout: 4000 });
    await page.waitForTimeout(500);
    actions.push("Triggered primary in-feature CTA.");
    interactions += 1;
  }

  const lowRiskAction = await firstVisibleLocator([
    page.getByRole("button", { name: /view|details|open|filter|more|load more/i }),
    page.getByRole("link", { name: /view|details|open|learn more|explore/i })
  ]);
  if (lowRiskAction) {
    await clickBestEffort(lowRiskAction, { timeout: 4000 });
    await page.waitForTimeout(500);
    actions.push("Clicked low-risk detail/filter action.");
    interactions += 1;
  }

  try {
    await page.evaluate(() => {
      window.scrollBy({ top: 650, left: 0, behavior: "auto" });
    });
  } catch {
    await page.evaluate(() => window.scrollBy(0, 650));
  }
  await page.waitForTimeout(350);
  actions.push("Scrolled feature page.");
  interactions += 1;

  notes.push(`Feature exercised: ${featureLabel} (${interactions} interaction(s)).`);
  return { interactions, actions };
}

async function exploreNextFeatureCandidate(page, notes, screenshot, state, options = {}) {
  const scenarioGoals = Array.isArray(options.scenarioGoals) ? options.scenarioGoals : [];
  const personaProfile =
    options.personaProfile && typeof options.personaProfile === "object"
      ? options.personaProfile
      : buildPersonaProfile("");
  const safeState = state && typeof state === "object" ? state : createFeatureExplorationState();
  const maxFeatures = Number(options.maxFeatures) > 0 ? Number(options.maxFeatures) : 12;

  const candidates = await discoverFeatureCandidates(page, {
    maxCandidates: Math.max(30, maxFeatures * 3),
    scenarioGoals,
    personaProfile
  });
  for (const candidate of candidates) {
    safeState._discoveredKeys.add(candidate.key);
  }

  const next = candidates.find((candidate) => !safeState._attemptedKeys.has(candidate.key));
  if (!next) {
    return {
      progressed: false,
      reason: "no_candidate",
      state: summarizeFeatureExplorationState(safeState)
    };
  }
  safeState._attemptedKeys.add(next.key);

  const featureLabel =
    normalizeText(next.text) || `feature_${String(safeState.features_visited.length + safeState.blocked_features.length + 1).padStart(2, "0")}`;
  const beforeUrl = page.url();
  const openResult = await openFeatureCandidate(page, next, notes);
  if (!openResult.opened) {
    safeState.blocked_features.push({
      label: featureLabel,
      section: next.section || "",
      reason: openResult.mode || "open_failed"
    });
    notes.push(`Feature blocked: ${featureLabel} (${openResult.mode || "open_failed"}).`);
    return {
      progressed: false,
      reason: openResult.mode || "open_failed",
      state: summarizeFeatureExplorationState(safeState)
    };
  }

  const exerciseResult = await exerciseFeatureSurface(page, notes, featureLabel, {
    scenarioGoals,
    personaProfile
  });
  safeState.interactions_completed += exerciseResult.interactions;
  const currentUrl = page.url();
  const pageTitle = normalizeText(await page.title());
  safeState.features_visited.push({
    label: featureLabel,
    section: next.section || "",
    opened_via: openResult.mode,
    before_url: beforeUrl,
    url: currentUrl,
    page_title: pageTitle,
    interactions: exerciseResult.interactions,
    actions: exerciseResult.actions,
    matched_goals: Array.isArray(next.matched_goals) ? next.matched_goals : [],
    matched_persona_keywords: Array.isArray(next.matched_persona_keywords) ? next.matched_persona_keywords : [],
    customer_reasons: Array.isArray(next.customer_reasons) ? next.customer_reasons : []
  });
  if (typeof screenshot === "function") {
    await screenshot(`08_feature_${String(safeState.features_visited.length).padStart(2, "0")}_${featureLabel}`);
  }

  return {
    progressed: true,
    reason: "feature_exercised",
    feature: featureLabel,
    state: summarizeFeatureExplorationState(safeState)
  };
}

async function resolveMissionActionLocator(page, target, action) {
  const safeTarget = normalizeText(target);
  if (!safeTarget) {
    return null;
  }
  const intent = extractMissionActionIntent(safeTarget);
  const lookupLabel = normalizeText(intent.primaryLabel) || safeTarget;
  const escaped = escapeRegExp(lookupLabel);
  if (action === "type") {
    return firstVisibleLocator([
      page.getByRole("textbox", { name: new RegExp(escaped, "i") }),
      page.getByLabel(new RegExp(escaped, "i")),
      page.getByPlaceholder(new RegExp(escaped, "i")),
      page.locator('input:not([type="hidden"]):not([disabled]):not([readonly]),textarea:not([disabled]):not([readonly])').first()
    ]);
  }

  const directMatch = await firstVisibleLocator([
    page.getByRole("button", { name: new RegExp(escaped, "i") }),
    page.getByRole("link", { name: new RegExp(escaped, "i") }),
    page.getByRole("tab", { name: new RegExp(escaped, "i") }),
    page.getByRole("menuitem", { name: new RegExp(escaped, "i") }),
    page.getByRole("option", { name: new RegExp(escaped, "i") }),
    page.getByLabel(new RegExp(escaped, "i")),
    page.getByPlaceholder(new RegExp(escaped, "i")),
    page.getByText(new RegExp(escaped, "i")).first()
  ]);
  if (directMatch) {
    return directMatch;
  }

  return findMissionActionLocatorByIntent(page, intent);
}

async function executeMissionJudgeAction(page, decision, notes, options = {}) {
  const nextAction = isPlainObject(decision && decision.next_action) ? decision.next_action : {};
  const action = normalizeText(nextAction.action).toLowerCase() || "none";
  const scenarioGoals = Array.isArray(options.scenarioGoals) ? options.scenarioGoals : [];
  const personaProfile =
    options.personaProfile && typeof options.personaProfile === "object"
      ? options.personaProfile
      : buildPersonaProfile("");

  if (action === "none" || action === "explore") {
    return { progressed: false, reason: "delegate_to_exploration" };
  }

  if (action === "done" || action === "fail") {
    return {
      progressed: false,
      terminal: true,
      status: action,
      reason: normalizeText(decision && decision.reason) || action
    };
  }

  try {
    if (action === "scroll") {
      const amount = parsePositiveInteger(nextAction.amount, 700);
      const signedAmount = nextAction.direction === "up" ? -amount : amount;
      await page.evaluate((delta) => window.scrollBy(0, delta), signedAmount);
      await page.waitForTimeout(700);
      notes.push(`Mission judge requested scroll ${nextAction.direction || "down"} (${amount}px).`);
      return { progressed: true, reason: "scrolled" };
    }

    if (action === "wait") {
      const waitMs = Math.min(parsePositiveInteger(nextAction.amount, 1200), 5000);
      await page.waitForTimeout(waitMs);
      notes.push(`Mission judge requested wait (${waitMs}ms).`);
      return { progressed: true, reason: "waited" };
    }

    if (action === "navigate" && normalizeText(nextAction.url)) {
      await page.goto(nextAction.url, { waitUntil: "domcontentloaded", timeout: 25000 });
      notes.push(`Mission judge navigated directly to ${normalizeText(nextAction.url)}.`);
      return { progressed: true, reason: "navigated" };
    }

    if (action === "press" && normalizeText(nextAction.key)) {
      await page.keyboard.press(nextAction.key);
      await page.waitForTimeout(700);
      notes.push(`Mission judge pressed ${normalizeText(nextAction.key)}.`);
      return { progressed: true, reason: "pressed_key" };
    }

    if (action === "type") {
      const locator = await resolveMissionActionLocator(page, nextAction.target, "type");
      if (!locator) {
        return { progressed: false, reason: "type_target_not_found" };
      }
      const textValue = normalizeText(nextAction.text) || buildPersonaContextValue(personaProfile, scenarioGoals);
      await fillBestEffort(locator, textValue, { timeout: 6000 });
      await page.waitForTimeout(500);
      notes.push(`Mission judge typed into ${normalizeText(nextAction.target) || "an input field"}.`);
      return { progressed: true, reason: "typed" };
    }

    if (action === "click") {
      const locator = await resolveMissionActionLocator(page, nextAction.target, "click");
      if (!locator) {
        return { progressed: false, reason: "click_target_not_found" };
      }
      const beforeSnapshot = isPlainObject(options.beforeSnapshot) ? options.beforeSnapshot : null;
      await clickBestEffort(locator, { timeout: 8000 });
      const stateChange = await waitForMissionStateChange(page, beforeSnapshot, {
        timeoutMs: options.stateChangeTimeoutMs
      });
      if (!stateChange.changed) {
        notes.push(
          `Mission judge clicked ${normalizeText(nextAction.target) || "a visible control"}, but the page state did not change.`
        );
        return {
          progressed: false,
          reason: "click_no_state_change",
          snapshot: stateChange.snapshot
        };
      }
      notes.push(
        `Mission judge clicked ${normalizeText(nextAction.target) || "a visible control"} and observed ${stateChange.reason}.`
      );
      return {
        progressed: true,
        reason: `clicked_${stateChange.reason}`,
        snapshot: stateChange.snapshot
      };
    }
  } catch (error) {
    return {
      progressed: false,
      reason: `action_error:${normalizeText(error && error.message ? error.message : error).slice(0, 120)}`
    };
  }

  return { progressed: false, reason: `unsupported_action_${action}` };
}

async function performMissionFallbackNudge(page, notes) {
  try {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(300);
    await page.evaluate(() => window.scrollBy(0, 480));
    await page.waitForTimeout(500);
    notes.push("Mission loop used Tab + scroll fallback to reveal more of the app.");
    return { progressed: true, reason: "tab_scroll_fallback" };
  } catch {
    return { progressed: false, reason: "fallback_failed" };
  }
}

async function runMissionJudgeLoop(page, notes, screenshot, options = {}) {
  const config = options.config && typeof options.config === "object" ? options.config : {};
  const scenarioGoals = Array.isArray(options.scenarioGoals) ? options.scenarioGoals : [];
  const personaProfile =
    options.personaProfile && typeof options.personaProfile === "object"
      ? options.personaProfile
      : buildPersonaProfile("");
  const emit = typeof options.emit === "function" ? options.emit : () => {};
  const missionSettings = resolveMissionJudgeSettings(config);
  const goalText = resolveMissionGoalText(config, scenarioGoals);
  const featureState = createFeatureExplorationState();
  const mission = {
    attempted: false,
    enabled: Boolean(missionSettings.enabled && goalText),
    goal: goalText,
    model: missionSettings.model,
    max_rounds: null,
    rounds_attempted: 0,
    completed: false,
    final_reason: null,
    completion_evidence: [],
    error: null,
    stop_reason: null,
    judgments: []
  };

  if (!goalText) {
    mission.error = "Mission goal text was missing.";
    mission.stop_reason = "missing_goal";
    notes.push("Mission judge unavailable because no dashboard goal text was provided.");
    return {
      mission_judgment: mission,
      feature_exploration: summarizeFeatureExplorationState(featureState)
    };
  }

  if (!missionSettings.enabled) {
    mission.error = "Mission judge requires OPENAI_API_KEY.";
    mission.stop_reason = "judge_unavailable";
    notes.push("Mission judge unavailable because OPENAI_API_KEY is not configured.");
    return {
      mission_judgment: mission,
      feature_exploration: summarizeFeatureExplorationState(featureState)
    };
  }

  let round = 1;
  let staleRounds = 0;
  let previousSemanticSnapshot = null;
  let repeatedSemanticRoundStarts = 0;
  while (true) {
    mission.attempted = true;
    mission.rounds_attempted = round;

    let decision;
    let roundSnapshot;
    try {
      roundSnapshot = await captureMissionJudgeSnapshot(page);
      if (areMissionSnapshotsSemanticallyEquivalent(previousSemanticSnapshot, roundSnapshot)) {
        repeatedSemanticRoundStarts += 1;
      } else {
        repeatedSemanticRoundStarts = 1;
      }
      previousSemanticSnapshot = roundSnapshot;
      if (repeatedSemanticRoundStarts >= missionSettings.staleRoundLimit) {
        mission.completed = false;
        mission.stop_reason = "stalled_no_state_change";
        mission.final_reason =
          `The automation returned to the same in-app page state for ${repeatedSemanticRoundStarts} consecutive mission rounds after auth.`;
        notes.push(`Mission loop stopped before round ${round} because the same page state kept recurring.`);
        emit("mission_failed", {
          round,
          confidence: null,
          reason: mission.final_reason
        });
        break;
      }
      const prompt = buildMissionJudgePrompt({
        goal: goalText,
        persona: normalizeText(config.brandPersona),
        currentUrl: roundSnapshot.currentUrl,
        pageText: roundSnapshot.pageText,
        recentNotes: notes.slice(-10),
        visitedFeatures: featureState.features_visited,
        round
      });
      decision = await requestMissionJudgeDecision({
        apiKey: missionSettings.apiKey,
        baseUrl: missionSettings.baseUrl,
        model: missionSettings.model,
        prompt,
        screenshotDataUrl: roundSnapshot.screenshotDataUrl,
        timeoutMs: missionSettings.timeoutMs
      });
      mission.judgments.push({
        round,
        url: roundSnapshot.currentUrl,
        complete: Boolean(decision.complete),
        confidence: decision.confidence,
        reason: decision.reason,
        evidence: decision.evidence,
        completion_evidence: decision.completion_evidence,
        next_action: decision.next_action
      });
      emit("mission_judge_round", {
        round,
        complete: Boolean(decision.complete),
        confidence: decision.confidence,
        reason: decision.reason || null,
        next_action: decision.next_action?.action || "none"
      });
    } catch (error) {
      mission.error = error && error.message ? error.message : String(error);
      mission.stop_reason = "judge_error";
      mission.final_reason = mission.error;
      notes.push(`Mission judge failed: ${mission.error}`);
      emit("mission_judge_failed", {
        round,
        error: mission.error
      });
      break;
    }

    if (decision.complete) {
      mission.completed = true;
      mission.stop_reason = "mission_completed";
      mission.final_reason = decision.reason || "Mission judge confirmed the dashboard goal was completed.";
      mission.completion_evidence = sanitizeStringList(decision.completion_evidence, 6, 220);
      notes.push(`Mission judge marked goal complete: ${mission.final_reason}`);
      emit("mission_completed", {
        round,
        confidence: decision.confidence,
        reason: mission.final_reason
      });
      break;
    }

    notes.push(`Mission judge says goal not finished yet: ${decision.reason || "no reason provided"}`);

    let progress = false;
    const judgeAction = await executeMissionJudgeAction(page, decision, notes, {
      scenarioGoals,
      personaProfile,
      beforeSnapshot: roundSnapshot,
      stateChangeTimeoutMs: missionSettings.stateChangeTimeoutMs
    });
    if (judgeAction.terminal && judgeAction.status === "done") {
      mission.completed = true;
      mission.stop_reason = "mission_completed";
      mission.final_reason = decision.reason || judgeAction.reason || "Mission judge explicitly ended the run as complete.";
      mission.completion_evidence = sanitizeStringList(decision.completion_evidence, 6, 220);
      notes.push(`Mission judge marked goal complete: ${mission.final_reason}`);
      emit("mission_completed", {
        round,
        confidence: decision.confidence,
        reason: mission.final_reason
      });
      break;
    }
    if (judgeAction.terminal && judgeAction.status === "fail") {
      mission.completed = false;
      mission.stop_reason = "llm_fail";
      mission.final_reason =
        decision.reason || judgeAction.reason || "Mission judge explicitly marked the flow blocked.";
      notes.push(`Mission judge marked goal blocked: ${mission.final_reason}`);
      emit("mission_failed", {
        round,
        confidence: decision.confidence,
        reason: mission.final_reason
      });
      break;
    }

    if (judgeAction.progressed) {
      progress = true;
      if (typeof screenshot === "function") {
        await screenshot(`09_mission_round_${String(round).padStart(2, "0")}_judge_action`);
      }
    }

    if (!progress) {
      const exploration = await exploreNextFeatureCandidate(page, notes, screenshot, featureState, {
        maxFeatures: Number(config.featureLimit) > 0 ? Number(config.featureLimit) : 12,
        scenarioGoals,
        personaProfile
      });
      progress = exploration.progressed;
    }

    if (!progress) {
      const fallback = await performMissionFallbackNudge(page, notes);
      progress = fallback.progressed;
    }

    if (!progress) {
      notes.push("Mission judge did not produce visible progress this round; asking again.");
      try {
        await page.waitForTimeout(500);
      } catch {
        // Ignore timer errors and continue asking the judge.
      }
    }

    let roundEndSnapshot = null;
    try {
      roundEndSnapshot = await captureMissionJudgeSnapshot(page);
    } catch {
      roundEndSnapshot = judgeAction && isPlainObject(judgeAction.snapshot) ? judgeAction.snapshot : null;
    }

    const roundStartSignature = buildMissionSnapshotSignature(roundSnapshot);
    const roundEndSignature = buildMissionSnapshotSignature(roundEndSnapshot);
    if (roundStartSignature && roundEndSignature && roundStartSignature === roundEndSignature) {
      staleRounds += 1;
      notes.push(`Mission round ${round} ended on the same visible app state.`);
      if (staleRounds >= missionSettings.staleRoundLimit) {
        mission.completed = false;
        mission.stop_reason = "stalled_no_state_change";
        mission.final_reason =
          `The automation remained on the same in-app state for ${staleRounds} consecutive mission rounds after auth.`;
        notes.push(`Mission loop stopped after ${staleRounds} consecutive no-change rounds.`);
        emit("mission_failed", {
          round,
          confidence: decision.confidence,
          reason: mission.final_reason
        });
        break;
      }
    } else {
      staleRounds = 0;
    }

    round += 1;
  }

  return {
    mission_judgment: mission,
    feature_exploration: summarizeFeatureExplorationState(featureState)
  };
}

async function exploreFeatureSet(page, notes, screenshot, options = {}) {
  const maxFeatures = Number(options.maxFeatures) > 0 ? Number(options.maxFeatures) : 12;
  const state = createFeatureExplorationState();
  for (let index = 0; index < maxFeatures; index += 1) {
    const result = await exploreNextFeatureCandidate(page, notes, screenshot, state, options);
    if (!result.progressed && result.reason === "no_candidate") {
      break;
    }
  }
  return summarizeFeatureExplorationState(state);
}

function maskSecret(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  if (raw.length <= 2) {
    return "*".repeat(raw.length);
  }
  return `${raw.slice(0, 1)}${"*".repeat(Math.max(0, raw.length - 2))}${raw.slice(-1)}`;
}

async function detectOtpRequiredUi(page) {
  return hasVisibleLocator([
    page.locator(
      "text=/access-otp required|otp required|verify access-otp|verify otp|one-time|security code|verification code|confirm you're not a robot/i"
    ),
    page.locator(
      'input[maxlength="1"],input[inputmode="numeric"][maxlength="1"],input[autocomplete="one-time-code"],input[name*="otp" i],input[id*="otp" i]'
    ),
    page.locator('button:has-text("Verify Access-OTP"),button:has-text("Verify OTP")')
  ]);
}

async function fillOtpCode(page, otpCode, notes) {
  const code = String(otpCode || "").replace(/\D+/g, "");
  if (!code) {
    return false;
  }

  const otpDialog = await firstVisibleLocator([
    page.locator('[role="dialog"][data-state="open"]'),
    page.locator('[role="dialog"]')
  ]);
  const root = otpDialog || page;

  const segmentedInputs = root
    .locator(
      'input[maxlength="1"],input[inputmode="numeric"][maxlength="1"],input[name*="otp" i][maxlength],input[id*="otp" i][maxlength]'
    )
    .filter({ hasNot: root.locator('input[type="email"],input[type="password"]') });

  let filled = false;
  try {
    const count = await segmentedInputs.count();
    if (count >= 4) {
      for (let index = 0; index < count && index < code.length; index += 1) {
        const input = segmentedInputs.nth(index);
        if (!(await input.isVisible({ timeout: 300 }))) {
          continue;
        }
        await fillBestEffort(input, code[index], { timeout: 4000 });
      }
      notes.push(`Filled segmented OTP inputs (${Math.min(count, code.length)} digits).`);
      filled = true;
    }
  } catch {
    // Continue to single-input fallback.
  }

  if (!filled) {
    const singleInput = await firstVisibleLocator([
      root.locator(
        'input[autocomplete="one-time-code"],input[name*="otp" i],input[id*="otp" i],input[placeholder*="otp" i]'
      ),
      root.locator('input[inputmode="numeric"],input[type="tel"]').first()
    ]);
    if (!singleInput) {
      return false;
    }
    await fillBestEffort(singleInput, code, { timeout: 5000 });
    notes.push("Filled single OTP input.");
  }

  const verifyButton = await firstVisibleLocator([
    root.getByRole("button", { name: /verify access-otp|verify otp|verify/i }),
    root.locator(
      'button:has-text("Verify Access-OTP"),button:has-text("Verify OTP"),button:has-text("Verify")'
    )
  ]);
  if (verifyButton) {
    await clickBestEffort(verifyButton, { timeout: 8000 });
    notes.push("Clicked OTP verify button.");
  } else {
    await page.keyboard.press("Enter");
    notes.push("OTP verify button not found; submitted with Enter.");
  }

  return true;
}

async function detectOnboardingSurface(page) {
  const currentUrl = page.url();
  if (/(\/onboard|\/onboarding|\/welcome|\/getting-started|\/setup|\/profile-setup)/i.test(currentUrl)) {
    return true;
  }

  const sampledText = await textSample(page);
  if (isLikelyOnboardingCopy(sampledText)) {
    return true;
  }

  return hasVisibleLocator([
    page.locator(
      'input[placeholder*="full name" i],input[name*="full_name" i],input[name*="fullname" i],input[name*="company" i],input[name*="organization" i],input[name*="workspace" i],select[name*="team" i],select[name*="size" i]'
    ),
    page.locator("text=/your full name|company name|team size|tell us about/i")
  ]);
}

function buildScenarioContextValue(goals) {
  if (!Array.isArray(goals) || !goals.length) {
    return "Evaluating the product as a realistic end user.";
  }
  return goals
    .slice(0, 2)
    .map((goal) => goal.original)
    .join(" ");
}

function chooseInputValue(meta, scenarioGoals, options = {}) {
  const label = `${meta.label || ""} ${meta.placeholder || ""} ${meta.name || ""} ${meta.id || ""}`.toLowerCase();
  const emailValue = normalizeText(options.emailValue || "");
  const personaProfile =
    options.personaProfile && typeof options.personaProfile === "object"
      ? options.personaProfile
      : buildPersonaProfile(options.brandPersona || "");
  if (!label) {
    return null;
  }
  if (/(password|otp|verification|code|search|filter)/i.test(label)) {
    return null;
  }
  if (/email/i.test(label)) {
    return emailValue || "qa.onboarding@example.com";
  }
  if (/company|organization|business|workspace|team name/i.test(label)) {
    return personaProfile.companyName || "Northstar Labs";
  }
  if (/full.?name|your name|display name|first name|last name|name/i.test(label)) {
    return personaProfile.fullName || "Jordan Lee";
  }
  if (/role|job title|title|position/i.test(label)) {
    return personaProfile.roleTitle || "Product Manager";
  }
  if (/website|url|domain/i.test(label)) {
    return buildPersonaWebsite(personaProfile);
  }
  if (/phone|mobile|whatsapp|telegram/i.test(label)) {
    return "+14155550101";
  }
  if (/team size|employees|company size|headcount/i.test(label)) {
    return "25";
  }
  if (/use case|goal|about|bio|description|what brings/i.test(label)) {
    return buildPersonaContextValue(personaProfile, scenarioGoals);
  }
  if (/industry/i.test(label)) {
    return personaProfile.industry || "Software";
  }
  return buildPersonaContextValue(personaProfile, scenarioGoals);
}

async function fillVisibleProfileFields(page, notes, scenarioGoals, options = {}) {
  const inputs = page.locator(
    'input:not([type="hidden"]):not([type="password"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([disabled]):not([readonly]),textarea:not([disabled]):not([readonly])'
  );
  const count = await inputs.count();
  let fieldsCompleted = 0;

  for (let index = 0; index < count && fieldsCompleted < 8; index += 1) {
    const locator = inputs.nth(index);
    if (!(await locator.isVisible({ timeout: 200 }).catch(() => false))) {
      continue;
    }

    const meta = await locator.evaluate((element) => {
      const id = element.getAttribute("id") || "";
      let label = "";
      if (id) {
        const forLabel = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (forLabel && typeof forLabel.textContent === "string") {
          label = forLabel.textContent.trim();
        }
      }
      if (!label) {
        const parentLabel = element.closest("label");
        if (parentLabel && typeof parentLabel.textContent === "string") {
          label = parentLabel.textContent.trim();
        }
      }
      return {
        name: element.getAttribute("name") || "",
        id,
        placeholder: element.getAttribute("placeholder") || "",
        label,
        value: "value" in element ? String(element.value || "") : ""
      };
    });

    if (normalizeText(meta.value)) {
      continue;
    }

    const nextValue = chooseInputValue(meta, scenarioGoals, options);
    if (!nextValue) {
      continue;
    }
    await fillBestEffort(locator, nextValue, { timeout: 5000 });
    fieldsCompleted += 1;
  }

  if (fieldsCompleted > 0) {
    notes.push(`Completed ${fieldsCompleted} onboarding/profile field(s).`);
  }
  return fieldsCompleted;
}

async function fillVisibleRichTextFields(page, notes, scenarioGoals, options = {}) {
  const fields = page.locator(
    '[contenteditable="true"]:not([aria-disabled="true"]):not([data-disabled]),[role="textbox"][contenteditable="true"]'
  );
  const count = await fields.count();
  let fieldsCompleted = 0;

  for (let index = 0; index < count && fieldsCompleted < 4; index += 1) {
    const locator = fields.nth(index);
    if (!(await locator.isVisible({ timeout: 200 }).catch(() => false))) {
      continue;
    }

    const meta = await locator.evaluate((element) => {
      const id = element.getAttribute("id") || "";
      let label = element.getAttribute("aria-label") || "";
      if (!label && id) {
        const forLabel = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (forLabel && typeof forLabel.textContent === "string") {
          label = forLabel.textContent.trim();
        }
      }
      if (!label) {
        const parentLabel = element.closest("label");
        if (parentLabel && typeof parentLabel.textContent === "string") {
          label = parentLabel.textContent.trim();
        }
      }
      return {
        name: element.getAttribute("name") || "",
        id,
        placeholder: element.getAttribute("data-placeholder") || element.getAttribute("placeholder") || "",
        label,
        value: String(element.textContent || "").trim()
      };
    });

    if (normalizeText(meta.value)) {
      continue;
    }

    const nextValue = chooseInputValue(meta, scenarioGoals, options);
    if (!nextValue) {
      continue;
    }

    try {
      await clickBestEffort(locator, { timeout: 4000 });
      await locator.evaluate((element, value) => {
        element.textContent = "";
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.textContent = value;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        element.dispatchEvent(new Event("blur", { bubbles: true }));
      }, nextValue);
      fieldsCompleted += 1;
    } catch {
      // Ignore contenteditable failures and continue.
    }
  }

  if (fieldsCompleted > 0) {
    notes.push(`Completed ${fieldsCompleted} onboarding rich-text field(s).`);
  }
  return fieldsCompleted;
}

async function chooseVisibleSelects(page, notes) {
  const selects = page.locator("select:not([disabled])");
  const count = await selects.count();
  let changed = 0;
  for (let index = 0; index < count && changed < 4; index += 1) {
    const locator = selects.nth(index);
    if (!(await locator.isVisible({ timeout: 200 }).catch(() => false))) {
      continue;
    }
    try {
      const selected = await locator.evaluate((element) => {
        const options = Array.from(element.querySelectorAll("option"));
        const target = options.find((option) => {
          const value = String(option.value || "").trim().toLowerCase();
          const label = String(option.textContent || "").trim().toLowerCase();
          return !option.disabled && value && !["", "0", "select"].includes(value) && !/select|choose|pick|placeholder/.test(label);
        });
        if (!target) {
          return "";
        }
        element.value = target.value;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return target.value;
      });
      if (selected) {
        changed += 1;
      }
    } catch {
      // Ignore select failures.
    }
  }
  if (changed > 0) {
    notes.push(`Updated ${changed} onboarding dropdown(s).`);
  }
  return changed;
}

async function chooseVisibleComboboxes(page, notes) {
  const triggers = page.locator(
    [
      '[role="combobox"]:not([aria-disabled="true"])',
      'button[role="combobox"]:not([disabled])',
      'button[aria-haspopup="listbox"]:not([disabled])',
      '[data-radix-select-trigger]:not([data-disabled])'
    ].join(",")
  );
  const count = await triggers.count();
  let changed = 0;

  for (let index = 0; index < count && changed < 4; index += 1) {
    const locator = triggers.nth(index);
    if (!(await locator.isVisible({ timeout: 200 }).catch(() => false))) {
      continue;
    }

    const meta = await locator.evaluate((element) => ({
      label: element.getAttribute("aria-label") || "",
      text: String(element.textContent || "").trim(),
      expanded: String(element.getAttribute("aria-expanded") || "").toLowerCase() === "true"
    }));
    const currentLabel = normalizeText(`${meta.label} ${meta.text}`).toLowerCase();
    if (
      currentLabel &&
      !/select|choose|pick|team|size|industry|role|country|timezone|goal|use case|about|profile/.test(currentLabel)
    ) {
      continue;
    }

    try {
      if (!meta.expanded) {
        await clickBestEffort(locator, { timeout: 4000 });
        await page.waitForTimeout(250);
      }

      const options = page.locator(
        [
          '[role="listbox"] [role="option"]:not([aria-disabled="true"])',
          '[role="option"]:not([aria-disabled="true"])',
          '[cmdk-item]:not([data-disabled="true"])',
          '[data-radix-popper-content-wrapper] [data-state]'
        ].join(",")
      );
      const optionCount = await options.count();
      let picked = false;

      for (let optionIndex = 0; optionIndex < optionCount; optionIndex += 1) {
        const option = options.nth(optionIndex);
        if (!(await option.isVisible({ timeout: 200 }).catch(() => false))) {
          continue;
        }
        const optionMeta = await option.evaluate((element) => ({
          text: String(element.textContent || "").trim(),
          selected:
            String(element.getAttribute("aria-selected") || "").toLowerCase() === "true" ||
            String(element.getAttribute("data-state") || "").toLowerCase() === "checked"
        }));
        const optionText = normalizeText(optionMeta.text).toLowerCase();
        if (
          !optionText ||
          optionMeta.selected ||
          /select|choose|pick|placeholder|back|previous|skip|later|cancel|close/.test(optionText)
        ) {
          continue;
        }
        await clickBestEffort(option, { timeout: 4000 });
        changed += 1;
        picked = true;
        break;
      }

      if (!picked) {
        await page.keyboard.press("ArrowDown");
        await page.waitForTimeout(150);
        await page.keyboard.press("Enter");
        changed += 1;
      }
    } catch {
      // Ignore combobox failures and continue.
    }

    await page.waitForTimeout(200);
  }

  if (changed > 0) {
    notes.push(`Updated ${changed} onboarding combobox control(s).`);
  }
  return changed;
}

async function chooseVisibleChoices(page, notes) {
  const choices = page.locator(
    [
      'input[type="radio"]:not([disabled])',
      'input[type="checkbox"]:not([disabled])',
      '[role="radio"][aria-checked="false"]',
      '[role="checkbox"][aria-checked="false"]',
      '[role="option"][aria-selected="false"]'
    ].join(",")
  );
  const count = await choices.count();
  let changed = 0;
  for (let index = 0; index < count && changed < 4; index += 1) {
    const locator = choices.nth(index);
    if (!(await locator.isVisible({ timeout: 200 }).catch(() => false))) {
      continue;
    }
    const meta = await locator.evaluate((element) => {
      const id = element.getAttribute("id") || "";
      let label = "";
      if (id) {
        const forLabel = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (forLabel && typeof forLabel.textContent === "string") {
          label = forLabel.textContent.trim();
        }
      }
      if (!label) {
        const parentLabel = element.closest("label");
        if (parentLabel && typeof parentLabel.textContent === "string") {
          label = parentLabel.textContent.trim();
        }
      }
      return {
        checked:
          element.checked === true ||
          String(element.getAttribute("aria-checked") || "").toLowerCase() === "true" ||
          String(element.getAttribute("aria-selected") || "").toLowerCase() === "true",
        label,
        name: element.getAttribute("name") || ""
      };
    });
    if (
      meta.checked ||
      /terms|privacy|marketing|newsletter|updates|skip|later|back|previous/i.test(`${meta.label} ${meta.name}`)
    ) {
      continue;
    }
    await clickBestEffort(locator, { timeout: 3000 });
    changed += 1;
  }
  if (changed > 0) {
    notes.push(`Selected ${changed} onboarding choice control(s).`);
  }
  return changed;
}

async function clickOnboardingPrimaryAction(page, notes) {
  const action = await firstVisibleLocator([
    page.getByRole("button", { name: /continue|next|get started|finish|complete|submit|save|start|done/i }),
    page.locator(
      'button:has-text("Continue"),button:has-text("Next"),button:has-text("Get Started"),button:has-text("Finish"),button:has-text("Complete"),button:has-text("Submit"),button:has-text("Save"),button:has-text("Done")'
    ),
    page.getByRole("link", { name: /continue|next|get started|finish|complete|start/i }),
    page.locator(
      'button[type="submit"]:not([disabled]),input[type="submit"]:not([disabled]),button[aria-label*="continue" i]:not([disabled]),button[aria-label*="next" i]:not([disabled]),button[aria-label*="submit" i]:not([disabled]),button[aria-label*="start" i]:not([disabled]),button[title*="continue" i]:not([disabled]),button[title*="next" i]:not([disabled]),button[title*="submit" i]:not([disabled]),button[title*="start" i]:not([disabled])'
    )
  ]);
  if (!action) {
    const editableField = await firstVisibleLocator([
      page.locator(
        'input:not([type="hidden"]):not([disabled]):not([readonly]),textarea:not([disabled]):not([readonly]),[contenteditable="true"]:not([aria-disabled="true"])'
      )
    ]);
    if (!editableField) {
      return false;
    }
    try {
      await clickBestEffort(editableField, { timeout: 3000 });
    } catch {
      // Ignore focus failures and still try the form Enter fallback.
    }
    try {
      await page.keyboard.press("Enter");
      notes.push("Submitted onboarding form with Enter fallback.");
      return true;
    } catch {
      return false;
    }
  }
  await clickBestEffort(action, { timeout: 6000 });
  notes.push("Advanced onboarding via primary action.");
  return true;
}

async function completeOnboardingFlow(page, notes, options = {}) {
  const scenarioGoals = Array.isArray(options.scenarioGoals) ? options.scenarioGoals : [];
  const screenshot = typeof options.screenshot === "function" ? options.screenshot : null;
  const personaProfile =
    options.personaProfile && typeof options.personaProfile === "object"
      ? options.personaProfile
      : buildPersonaProfile("");
  const onboardingFieldOptions = {
    emailValue: options.onboardingEmail || "",
    personaProfile
  };
  const result = {
    detected: false,
    attempted: false,
    completed: false,
    steps_completed: 0,
    fields_completed: 0,
    select_actions: 0,
    choice_actions: 0,
    error: null
  };

  result.detected = await detectOnboardingSurface(page);
  if (!result.detected) {
    return result;
  }

  result.attempted = true;
  for (let step = 0; step < 8; step += 1) {
    const stillOnboarding = await detectOnboardingSurface(page);
    if (!stillOnboarding) {
      result.completed = true;
      break;
    }

    const fieldsCompleted =
      (await fillVisibleProfileFields(page, notes, scenarioGoals, onboardingFieldOptions)) +
      (await fillVisibleRichTextFields(page, notes, scenarioGoals, onboardingFieldOptions));
    const selectActions = (await chooseVisibleSelects(page, notes)) + (await chooseVisibleComboboxes(page, notes));
    const choiceActions = await chooseVisibleChoices(page, notes);
    const advanced = await clickOnboardingPrimaryAction(page, notes);

    result.fields_completed += fieldsCompleted;
    result.select_actions += selectActions;
    result.choice_actions += choiceActions;
    if (advanced) {
      result.steps_completed += 1;
    }

    if (screenshot && (fieldsCompleted > 0 || selectActions > 0 || choiceActions > 0 || advanced)) {
      await screenshot(`07_onboarding_step_${String(step + 1).padStart(2, "0")}`);
    }

    if (!(fieldsCompleted > 0 || selectActions > 0 || choiceActions > 0 || advanced)) {
      break;
    }

    await page.waitForTimeout(1200);
  }

  result.completed = !(await detectOnboardingSurface(page));
  return result;
}

function classifyOutcome(payload) {
  if (payload.missionCompleted) {
    return "mission_completed";
  }
  if (payload.captchaDetected) {
    return "blocked_captcha";
  }
  if (payload.otpRequired && payload.otpAttempted && !payload.otpVerified) {
    return "otp_not_verified";
  }
  if (payload.otpRequired && !payload.otpAttempted) {
    return "otp_required_pending";
  }
  if (payload.emailVerificationPrompt) {
    return "submitted_email_verification";
  }
  if (payload.onboardingDetected && !payload.onboardingCompleted && payload.featureVisitedCount > 0) {
    return "onboarding_incomplete_with_feature_progress";
  }
  if (payload.onboardingDetected && !payload.onboardingCompleted) {
    return "onboarding_incomplete";
  }
  if (payload.featureVisitedCount > 0 && payload.otpVerified) {
    return "feature_goals_exercised_after_otp";
  }
  if (payload.featureVisitedCount > 0 && payload.signedInSignal) {
    return "feature_goals_exercised";
  }
  if (payload.onboardingDetected && payload.onboardingCompleted) {
    return "onboarding_completed_no_feature_progress";
  }
  if (payload.signedInSignal) {
    return "signed_in_surface_only";
  }
  if (payload.validationErrors.length) {
    return "validation_error";
  }
  if (payload.submitClicked && payload.authStillVisible) {
    return "submit_no_state_change";
  }
  if (payload.submitClicked) {
    return "submit_unknown_state";
  }
  return "pre_submit_blocked";
}

async function performPostAuthActions(page, notes, options = {}) {
  const scenarioGoals = Array.isArray(options.scenarioGoals) ? options.scenarioGoals : [];
  const personaProfile =
    options.personaProfile && typeof options.personaProfile === "object"
      ? options.personaProfile
      : buildPersonaProfile("");
  let interactions = 0;

  const getStarted = await firstVisibleLocator([
    page.getByRole("button", { name: /get started/i }),
    page.locator('button:has-text("Get Started")')
  ]);
  if (getStarted) {
    await clickBestEffort(getStarted, { timeout: 5000 });
    await page.waitForTimeout(800);
    notes.push("Clicked post-login onboarding CTA (Get Started).");
    interactions += 1;
  }

  const editableInput = await firstVisibleLocator([
    page.getByPlaceholder(/professional name|father's name|spouse's name|occupation/i),
    page.locator(
      'input[placeholder*="professional" i],input[placeholder*="father" i],input[placeholder*="spouse" i]'
    )
  ]);
  if (editableInput) {
    const meta = await editableInput.evaluate((element) => ({
      label: element.getAttribute("aria-label") || "",
      placeholder: element.getAttribute("placeholder") || "",
      name: element.getAttribute("name") || "",
      id: element.getAttribute("id") || ""
    }));
    const nextValue =
      chooseInputValue(meta, scenarioGoals, { personaProfile }) || buildPersonaContextValue(personaProfile, scenarioGoals);
    await fillBestEffort(editableInput, nextValue, { timeout: 5000 });
    notes.push("Filled one profile field to validate post-login form interaction.");
    interactions += 1;
  }

  const genderOption = await firstVisibleLocator([
    page.getByRole("radio", { name: /male|female|trans/i }),
    page.locator('input[type="radio"]').first()
  ]);
  if (genderOption) {
    await clickBestEffort(genderOption, { timeout: 4000 });
    notes.push("Selected one profile option (radio) in post-login form.");
    interactions += 1;
  }

  try {
    await page.evaluate(() => {
      window.scrollBy({ top: 700, left: 0, behavior: "auto" });
    });
  } catch {
    await page.evaluate(() => {
      window.scrollBy(0, 700);
    });
  }
  await page.waitForTimeout(500);
  notes.push("Performed post-login scroll exploration.");
  interactions += 1;

  return interactions;
}

function isPartialClassification(value) {
  return new Set([
    "otp_required_pending",
    "otp_not_verified",
    "submitted_email_verification",
    "onboarding_incomplete",
    "onboarding_incomplete_with_feature_progress",
    "onboarding_completed_no_feature_progress",
    "signed_in_surface_only"
  ]).has(String(value || "").trim());
}

function didAchieveMission(runResult) {
  return Boolean(runResult && runResult.mission_judgment && runResult.mission_judgment.completed);
}

function isRunnerFailure(runResult) {
  const classification = normalizeText(runResult && runResult.classification);
  const stopReason = normalizeText(runResult && runResult.mission_judgment && runResult.mission_judgment.stop_reason);
  if (classification === "run_failed_pre_submit" || classification === "run_failed_after_submit") {
    return true;
  }
  return stopReason === "judge_error" || stopReason === "judge_unavailable" || stopReason === "missing_goal";
}

function didReachUserFacingOutcome(runResult) {
  if (!runResult || typeof runResult !== "object") {
    return false;
  }
  if (didAchieveMission(runResult)) {
    return true;
  }
  if (runResult.signup_submitted) {
    return true;
  }
  if (runResult.otp && (runResult.otp.verified || runResult.otp.code_submitted || runResult.otp.wait_polls > 0)) {
    return true;
  }
  if (runResult.onboarding && (runResult.onboarding.detected || runResult.onboarding.attempted)) {
    return true;
  }
  if (runResult.feature_exploration && runResult.feature_exploration.invoked) {
    return true;
  }
  if (runResult.mission_judgment && runResult.mission_judgment.attempted) {
    return true;
  }
  return false;
}

function didMissionEndBlocked(runResult) {
  const stopReason = normalizeText(runResult && runResult.mission_judgment && runResult.mission_judgment.stop_reason);
  return stopReason === "llm_fail" || stopReason === "stalled_no_state_change";
}

function getLastVisitedUrl(runResult) {
  const urls = Array.isArray(runResult && runResult.urls_visited) ? runResult.urls_visited : [];
  for (let index = urls.length - 1; index >= 0; index -= 1) {
    const normalized = normalizeText(urls[index]);
    if (normalized) {
      return normalized;
    }
  }
  return normalizeText(runResult && runResult.target_url);
}

function describeLastSuccessfulStep(runResult) {
  if (didAchieveMission(runResult)) {
    return normalizeText(runResult?.mission_judgment?.final_reason) || "Completed the requested mission.";
  }
  if (runResult?.feature_exploration?.visited_count > 0) {
    return "Reached the signed-in product area and exercised at least one in-product surface.";
  }
  if (runResult?.onboarding?.completed) {
    return "Completed onboarding and reached the authenticated product shell.";
  }
  if (runResult?.onboarding?.detected && Number(runResult.onboarding.steps_completed) > 0) {
    return `Advanced ${Number(runResult.onboarding.steps_completed)} onboarding step(s).`;
  }
  if (runResult?.otp?.verified) {
    return "Verified the OTP gate and entered the authenticated app.";
  }
  if (runResult?.signup_submitted) {
    return "Submitted the signup flow.";
  }
  return "Loaded the target experience.";
}

function extractRepeatedStateCount(value) {
  const match = normalizeText(value).match(/(\d+)\s+consecutive mission rounds/i);
  if (!match) {
    return null;
  }
  const count = Number(match[1]);
  return Number.isFinite(count) && count > 0 ? Math.round(count) : null;
}

function normalizeDiagnosticAttempt(attempt, index = 0) {
  const safeAttempt = attempt && typeof attempt === "object" ? attempt : {};
  const parsedStep = Number(safeAttempt.step);
  return {
    step: Number.isFinite(parsedStep) && parsedStep > 0 ? Math.round(parsedStep) : index + 1,
    action: normalizeText(safeAttempt.action) || "inspect",
    target: normalizeText(safeAttempt.target) || "affected area",
    outcome: normalizeText(safeAttempt.outcome) || "state observed",
    url: normalizeText(safeAttempt.url) || null,
    note: normalizeText(safeAttempt.note) || null
  };
}

function parseMissionActionNote(note) {
  const text = normalizeText(note);
  if (!text) {
    return null;
  }
  let match = text.match(/^Mission judge clicked (.+?) and observed ([a-z_]+)\.?$/i);
  if (match) {
    return {
      action: "click",
      target: normalizeText(match[1]),
      outcome: normalizeText(match[2])
    };
  }
  match = text.match(/^Mission judge clicked (.+?), but the page state did not change\.?$/i);
  if (match) {
    return {
      action: "click",
      target: normalizeText(match[1]),
      outcome: "no_state_change"
    };
  }
  if (/^Mission loop used Tab \+ scroll fallback to reveal more of the app\.?$/i.test(text)) {
    return {
      action: "scroll",
      target: "current app shell",
      outcome: "visibility_probe"
    };
  }
  return null;
}

function extractMissionAttemptedActions(runResult) {
  const notes = Array.isArray(runResult?.notes) ? runResult.notes : [];
  const judgments = Array.isArray(runResult?.mission_judgment?.judgments) ? runResult.mission_judgment.judgments : [];
  const noteActions = notes.map((note) => parseMissionActionNote(note)).filter(Boolean);
  const attemptedActions = [];
  let noteIndex = 0;

  for (const judgment of judgments) {
    const nextAction = judgment && typeof judgment.next_action === "object" ? judgment.next_action : null;
    if (!nextAction || !normalizeText(nextAction.action)) {
      continue;
    }
    const noteAction = noteActions[noteIndex] || null;
    if (noteAction) {
      noteIndex += 1;
    }
    attemptedActions.push(
      normalizeDiagnosticAttempt(
        {
          step: Number(judgment.round) || attemptedActions.length + 1,
          action: nextAction.action,
          target: nextAction.target || nextAction.text || nextAction.url || "current page",
          outcome: noteAction?.outcome || "state_checked",
          url: judgment.url,
          note: sanitizeStringList(judgment.evidence || [], 4, 220).join("; ") || normalizeText(judgment.reason)
        },
        attemptedActions.length
      )
    );
  }

  if (!attemptedActions.length && noteActions.length) {
    return noteActions.map((attempt, index) => normalizeDiagnosticAttempt(attempt, index)).slice(0, 8);
  }

  for (; noteIndex < noteActions.length; noteIndex += 1) {
    attemptedActions.push(normalizeDiagnosticAttempt(noteActions[noteIndex], attemptedActions.length));
    if (attemptedActions.length >= 8) {
      break;
    }
  }

  return attemptedActions.slice(0, 8);
}

function buildFindingDiagnosticDetails(runResult, options = {}) {
  const currentUrl = normalizeText(options.currentUrl) || getLastVisitedUrl(runResult) || null;
  const currentState =
    normalizeText(options.currentState) ||
    normalizeText(options.failureReason) ||
    "The affected page state remained visible.";
  const failureReason = normalizeText(options.failureReason) || currentState;
  const lastSuccessfulStep = normalizeText(options.lastSuccessfulStep) || describeLastSuccessfulStep(runResult);
  const rawActions = Array.isArray(options.attemptedActions) ? options.attemptedActions : [];
  const attemptedActions = rawActions.length
    ? rawActions.map((attempt, index) => normalizeDiagnosticAttempt(attempt, index)).filter(Boolean).slice(0, 8)
    : [
        normalizeDiagnosticAttempt(
          {
            step: 1,
            action: normalizeText(options.defaultAction) || "inspect",
            target: normalizeText(options.defaultTarget) || currentUrl || "affected area",
            outcome: failureReason,
            url: currentUrl,
            note: normalizeText(options.defaultNote) || null
          },
          0
        )
      ];
  const repeatedStateCount = Number(options.repeatedStateCount);

  return {
    page_loaded: options.pageLoaded !== undefined ? Boolean(options.pageLoaded) : Boolean(currentUrl),
    current_url: currentUrl,
    current_state: currentState,
    last_successful_step: lastSuccessfulStep,
    failure_reason: failureReason,
    attempted_actions: attemptedActions,
    ...(Number.isFinite(repeatedStateCount) && repeatedStateCount > 0
      ? { repeated_state_count: Math.round(repeatedStateCount) }
      : {})
  };
}

function buildSummaryNote(runResult) {
  if (didAchieveMission(runResult)) {
    const reason = normalizeText(runResult.mission_judgment && runResult.mission_judgment.final_reason);
    return reason || "Mission judge confirmed the dashboard goal was completed.";
  }
  if (didMissionEndBlocked(runResult)) {
    const missionReason = normalizeText(runResult.mission_judgment && runResult.mission_judgment.final_reason);
    return missionReason
      ? `The run completed and captured a real customer blocker: ${missionReason}`
      : "The run completed and captured a real customer blocker before the mission could finish.";
  }
  if (runResult.mission_judgment && runResult.mission_judgment.attempted) {
    const missionReason = normalizeText(runResult.mission_judgment.final_reason);
    if (missionReason) {
      return `The run completed, but the mission was not finished yet: ${missionReason}`;
    }
    return "The run completed, but the mission judge did not confirm completion of the dashboard goal yet.";
  }
  if (runResult.feature_exploration && runResult.feature_exploration.visited_count > 0) {
    return `Local QA run continued past onboarding friction and exercised ${runResult.feature_exploration.visited_count} in-product feature surface(s).`;
  }
  if (runResult.onboarding && runResult.onboarding.detected && !runResult.onboarding.completed) {
    return "Local QA run cleared auth but remained blocked in onboarding before meaningful product usage.";
  }
  if (runResult.otp && runResult.otp.verified) {
    return "Local QA run cleared auth and OTP but did not reach meaningful in-product feature usage.";
  }
  return `Local QA run classified as ${runResult.classification}.`;
}

function buildRunQaReport(runResult, config) {
  const status = isRunnerFailure(runResult)
    ? "failed"
    : didReachUserFacingOutcome(runResult)
      ? "completed"
      : isPartialClassification(runResult.classification)
        ? "partial"
        : "failed";

  const findings = [];
  if (runResult.notes.some((item) => /Dismissed top-level modal/.test(item))) {
    findings.push({
      id: "finding_notification_modal_blocking",
      type: "frustration_point",
      severity: "medium",
      title: "Blocking notification modal appears before core flow",
      expected_behavior: "User should start login/signup flow without intrusive blocking popups.",
      observed_behavior:
        "A Stay Connected notification modal appears on landing and intercepts interaction until dismissed.",
      diagnostic_details: buildFindingDiagnosticDetails(runResult, {
        currentUrl: normalizeText(runResult.target_url) || getLastVisitedUrl(runResult),
        currentState: "Landing page loaded with a Stay Connected notification modal covering the first interaction.",
        failureReason: "The first interaction path was blocked until the modal was manually dismissed.",
        lastSuccessfulStep: "Loaded the public landing page.",
        attemptedActions: [
          {
            step: 1,
            action: "open",
            target: "landing page",
            outcome: "page_loaded",
            url: normalizeText(runResult.target_url) || getLastVisitedUrl(runResult)
          },
          {
            step: 2,
            action: "click",
            target: "primary auth entry",
            outcome: "blocked_by_modal",
            url: normalizeText(runResult.target_url) || getLastVisitedUrl(runResult),
            note: "Stay Connected notification modal intercepted the interaction."
          },
          {
            step: 3,
            action: "dismiss",
            target: "Stay Connected notification modal",
            outcome: "modal_dismissed",
            url: normalizeText(runResult.target_url) || getLastVisitedUrl(runResult)
          }
        ]
      }),
      evidence: {
        screenshots: runResult.artifacts.screenshots.slice(0, 2)
      },
      confidence: 0.93
    });
  }

  if (runResult.signals.otp_required) {
    findings.push({
      id: "finding_otp_gate",
      type: runResult.otp.verified ? "confusion_point" : "dead_end",
      severity: runResult.otp.verified ? "medium" : "high",
      title: runResult.otp.verified ? "OTP gate adds onboarding friction" : "OTP gate blocked platform usage",
      expected_behavior: "User should understand and complete verification with clear, reliable guidance.",
      observed_behavior: runResult.otp.verified
        ? "Access-OTP is required immediately after signup; automation can proceed only after reading email OTP."
        : "Access-OTP modal blocked feature use because OTP verification did not complete in-run.",
      diagnostic_details: buildFindingDiagnosticDetails(runResult, {
        currentUrl: getLastVisitedUrl(runResult) || normalizeText(runResult.target_url),
        currentState: runResult.otp.verified
          ? "OTP verification gate appeared immediately after signup and required the emailed code before the app could continue."
          : "OTP verification gate remained active and blocked entry into the product.",
        failureReason: runResult.otp.verified
          ? "The run could continue only after retrieving the OTP from email."
          : "The OTP gate prevented further product use because verification never completed.",
        lastSuccessfulStep: runResult.signup_submitted ? "Submitted the signup form." : "Opened the auth flow.",
        attemptedActions: [
          {
            step: 1,
            action: "submit",
            target: "signup form",
            outcome: "otp_gate_shown",
            url: normalizeText(runResult.target_url) || getLastVisitedUrl(runResult)
          },
          {
            step: 2,
            action: "wait",
            target: "email OTP message",
            outcome: runResult.otp.verified ? "otp_received" : "otp_not_verified",
            note: Number(runResult?.otp?.wait_polls) > 0 ? `Polled ${Number(runResult.otp.wait_polls)} time(s) for the OTP.` : null
          },
          {
            step: 3,
            action: "enter",
            target: "OTP verification form",
            outcome: runResult.otp.verified ? "otp_verified" : "otp_submission_not_confirmed"
          }
        ]
      }),
      evidence: {
        screenshots: runResult.artifacts.screenshots.filter((item) => item.includes("05_after_submit")).slice(0, 1)
      },
      confidence: 0.95
    });
  }

  if (runResult.onboarding && runResult.onboarding.detected && !runResult.onboarding.completed) {
    findings.push({
      id: "finding_onboarding_not_cleared",
      type: "dead_end",
      severity: "high",
      title: "Authenticated onboarding stalled before core product usage",
      expected_behavior: "A newly authenticated user should be able to clear onboarding and reach the core app.",
      observed_behavior:
        "The run reached authenticated onboarding but could not complete the profile/setup steps needed to enter the product.",
      diagnostic_details: buildFindingDiagnosticDetails(runResult, {
        currentUrl: getLastVisitedUrl(runResult),
        currentState: "Authenticated onboarding remained active instead of handing the user into the core product.",
        failureReason: "The profile/setup flow did not fully complete, so the user never reached the intended in-product destination.",
        lastSuccessfulStep: Number(runResult?.onboarding?.steps_completed) > 0
          ? `Completed ${Number(runResult.onboarding.steps_completed)} onboarding/profile step(s).`
          : "Reached the authenticated onboarding flow.",
        attemptedActions: [
          {
            step: 1,
            action: "complete",
            target: "onboarding profile fields",
            outcome: Number(runResult?.onboarding?.steps_completed) > 0
              ? `advanced_${Math.round(Number(runResult.onboarding.steps_completed))}_steps`
              : "fields_filled_without_completion"
          },
          {
            step: 2,
            action: "submit",
            target: "onboarding primary action",
            outcome: "onboarding_not_completed"
          }
        ]
      }),
      evidence: {
        screenshots: runResult.artifacts.screenshots.filter((item) => /07_onboarding_step_|06_after_otp_submit/.test(item)).slice(0, 4)
      },
      confidence: 0.91,
      fix_hint:
        "Make onboarding fields and next-step actions easier to complete programmatically and clearly expose the first in-product destination after setup."
    });
  }

  if (runResult.mission_judgment && runResult.mission_judgment.attempted && !didAchieveMission(runResult)) {
    const finalReason = normalizeText(runResult.mission_judgment.final_reason);
    if (finalReason) {
      const judgments = Array.isArray(runResult.mission_judgment.judgments) ? runResult.mission_judgment.judgments : [];
      const lastJudgment = judgments.length ? judgments[judgments.length - 1] : null;
      const lastJudgmentEvidence = sanitizeStringList(lastJudgment?.evidence || [], 6, 220);
      findings.push({
        id: "finding_mission_blocked_before_completion",
        type: didMissionEndBlocked(runResult) ? "confusion_point" : "dead_end",
        severity: didMissionEndBlocked(runResult) ? "high" : "medium",
        title: "Persona could not finish the requested mission",
        expected_behavior:
          normalizeText(config.goal)
            ? `A real customer should be able to ${normalizeText(config.goal)}.`
            : "A real customer should be able to finish the requested in-product mission.",
        observed_behavior: finalReason,
        diagnostic_details: buildFindingDiagnosticDetails(runResult, {
          currentUrl: normalizeText(lastJudgment?.url) || getLastVisitedUrl(runResult),
          currentState:
            lastJudgmentEvidence.join("; ") ||
            "The same signed-in dashboard state kept reappearing instead of advancing into a completed task state.",
          failureReason: finalReason,
          lastSuccessfulStep: describeLastSuccessfulStep(runResult),
          attemptedActions: extractMissionAttemptedActions(runResult),
          repeatedStateCount: extractRepeatedStateCount(finalReason)
        }),
        evidence: {
          screenshots: runResult.artifacts.screenshots.slice(-4)
        },
        confidence: 0.88
      });
    }
  }

  if (runResult.request_failures.some((item) => String(item.url || "").includes("mercury.phonepe.com"))) {
    findings.push({
      id: "finding_third_party_script_error",
      type: "performance_issue",
      severity: "low",
      title: "Third-party script repeatedly fails to load",
      expected_behavior: "Ancillary scripts should either load cleanly or fail silently without repeated noise.",
      observed_behavior: "Checkout script from mercury.phonepe.com fails with ERR_BLOCKED_BY_ORB.",
      diagnostic_details: buildFindingDiagnosticDetails(runResult, {
        currentUrl: getLastVisitedUrl(runResult),
        currentState: "Authenticated product surface loaded, but a third-party checkout script repeatedly failed in the background.",
        failureReason: "Repeated ERR_BLOCKED_BY_ORB script failures were captured while the app was open.",
        lastSuccessfulStep: describeLastSuccessfulStep(runResult),
        attemptedActions: [
          {
            step: 1,
            action: "open",
            target: "authenticated product surface",
            outcome: "page_loaded",
            url: getLastVisitedUrl(runResult)
          },
          {
            step: 2,
            action: "load",
            target: "mercury.phonepe.com checkout script",
            outcome: "err_blocked_by_orb"
          }
        ]
      }),
      evidence: {
        screenshots: runResult.artifacts.screenshots.slice(-1)
      },
      confidence: 0.72
    });
  }

  if (runResult.feature_exploration && runResult.feature_exploration.blocked_count > 0) {
    findings.push({
      id: "finding_feature_navigation_blockers",
      type: "confusion_point",
      severity: runResult.feature_exploration.blocked_count >= 3 ? "high" : "medium",
      title: "Some platform features were not reachable in exploration",
      expected_behavior: "Core features should be discoverable and reachable from authenticated surfaces.",
      observed_behavior: `${runResult.feature_exploration.blocked_count} feature candidate(s) could not be opened during automated in-app exploration.`,
      diagnostic_details: buildFindingDiagnosticDetails(runResult, {
        currentUrl: getLastVisitedUrl(runResult),
        currentState: "Authenticated exploration found feature surfaces that did not open into usable product states.",
        failureReason: `${runResult.feature_exploration.blocked_count} feature candidate(s) could not be opened during exploration.`,
        lastSuccessfulStep: describeLastSuccessfulStep(runResult),
        attemptedActions: (Array.isArray(runResult?.feature_exploration?.blocked_features)
          ? runResult.feature_exploration.blocked_features
          : []
        )
          .slice(0, 6)
          .map((feature, index) => ({
            step: index + 1,
            action: "open",
            target: normalizeText(feature?.label) || `feature_${index + 1}`,
            outcome: normalizeText(feature?.reason) || "open_failed",
            note: normalizeText(feature?.section) || null
          }))
      }),
      evidence: {
        screenshots: runResult.artifacts.screenshots.filter((item) => item.includes("08_feature_")).slice(0, 3)
      },
      confidence: 0.81
    });
  }

  const journeys = [
    {
      id: "journey_signup",
      name: "Signup flow",
      status: runResult.signup_submitted ? "completed" : "blocked",
      summary: runResult.signup_submitted
        ? "Opened auth modal, filled signup form, and submitted."
        : "Failed before signup submission.",
      evidence: {
        screenshots: runResult.artifacts.screenshots.filter((item) => /02_auth|03_signup|04_filled/.test(item))
      }
    },
    {
      id: "journey_otp",
      name: "OTP verification",
      status: runResult.otp.verified ? "completed" : runResult.signals.otp_required ? "blocked" : "partial",
      summary: runResult.signals.otp_required
        ? runResult.otp.verified
          ? "OTP fetched and verified successfully."
          : runResult.otp.error || "OTP required but not verified."
        : "OTP gate not detected.",
      evidence: {
        screenshots: runResult.artifacts.screenshots.filter((item) => /05_after_submit|06_after_otp_submit/.test(item))
      }
    },
    {
      id: "journey_onboarding",
      name: "Onboarding completion",
      status:
        runResult.onboarding && runResult.onboarding.detected
          ? runResult.onboarding.completed
            ? "completed"
            : "blocked"
          : runResult.signals.signed_in
          ? "completed"
          : runResult.otp.verified
            ? "partial"
            : "blocked",
      summary:
        runResult.onboarding && runResult.onboarding.detected
          ? runResult.onboarding.completed
            ? `Completed onboarding after ${runResult.onboarding.steps_completed} step transition(s).`
            : "Reached onboarding but did not clear it."
          : runResult.signals.signed_in
            ? "No authenticated onboarding gate was detected."
            : "Authenticated onboarding was not reached.",
      evidence: {
        screenshots: runResult.artifacts.screenshots.filter((item) =>
          /07_onboarding_step_|07_post_auth_exploration|06_after_otp_submit/.test(item)
        )
      }
    },
    {
      id: "journey_feature_exploration",
      name: "Feature exploration",
      status:
        runResult.feature_exploration && runResult.feature_exploration.visited_count > 0
          ? "completed"
          : runResult.feature_exploration &&
              (runResult.feature_exploration.attempted > 0 || runResult.feature_exploration.invoked)
            ? "partial"
            : "blocked",
      summary:
        runResult.feature_exploration && runResult.feature_exploration.visited_count > 0
          ? `Visited ${runResult.feature_exploration.visited_count} feature surface(s) out of ${runResult.feature_exploration.discovered} discovered candidate(s).`
          : runResult.feature_exploration && runResult.feature_exploration.attempted > 0
            ? "Feature candidates were discovered but none reached an interaction surface."
            : runResult.feature_exploration && runResult.feature_exploration.invoked
              ? "Feature exploration ran, but no reachable in-product candidates were discoverable from the current surface."
            : runResult.onboarding && runResult.onboarding.detected && !runResult.onboarding.completed
              ? "Feature exploration was skipped because onboarding was not cleared."
              : "No feature exploration was attempted.",
      evidence: {
        screenshots: runResult.artifacts.screenshots.filter((item) => item.includes("08_feature_")).slice(0, 8)
      }
    },
    {
      id: "journey_mission_validation",
      name: "Mission validation",
      status: didAchieveMission(runResult)
        ? "completed"
        : didMissionEndBlocked(runResult)
          ? "blocked"
          : runResult.mission_judgment && runResult.mission_judgment.attempted
          ? "partial"
          : "blocked",
      summary: didAchieveMission(runResult)
        ? normalizeText(runResult.mission_judgment && runResult.mission_judgment.final_reason) ||
          "Mission judge confirmed the dashboard goal was completed."
        : normalizeText(runResult.mission_judgment && runResult.mission_judgment.final_reason) ||
          "Mission judge did not confirm completion of the dashboard goal yet.",
      evidence: {
        screenshots: runResult.artifacts.screenshots.slice(-4)
      },
      observations: didAchieveMission(runResult)
        ? sanitizeStringList(runResult.mission_judgment && runResult.mission_judgment.completion_evidence, 6, 220)
        : sanitizeStringList(runResult.mission_judgment && runResult.mission_judgment.judgments?.slice(-1)?.[0]?.evidence, 6, 220)
    }
  ];

  const report = {
    schema_version: "local-qa-report/v1",
    run_id: runResult.run_id,
    target: runResult.target_url,
    status,
    summary: {
      note: buildSummaryNote(runResult),
      coverage: {
        pages_visited: Array.isArray(runResult.urls_visited) ? runResult.urls_visited.length : 0,
        flows_tested: journeys.length,
        flows_blocked: journeys.filter((item) => item.status === "blocked").length
      }
    },
    tested_journeys: journeys,
    findings,
    recommendations: [
      "Keep a non-blocking path through landing/login even when notification prompts are shown.",
      "Standardize OTP messaging and fallback flows to reduce onboarding friction.",
      "Monitor and clean up repeated third-party script failures that add console/network noise.",
      "Expose clear, stable navigation landmarks so all feature areas are easy to reach and test."
    ],
    feature_inventory: {
      discovered_count: runResult.feature_exploration ? runResult.feature_exploration.discovered : 0,
      attempted_count: runResult.feature_exploration ? runResult.feature_exploration.attempted : 0,
      visited_count: runResult.feature_exploration ? runResult.feature_exploration.visited_count : 0,
      blocked_count: runResult.feature_exploration ? runResult.feature_exploration.blocked_count : 0,
      matched_goal_count: runResult.feature_exploration ? runResult.feature_exploration.matched_goal_count : 0,
      matched_goals: runResult.feature_exploration ? runResult.feature_exploration.matched_goals : [],
      visited_features: runResult.feature_exploration ? runResult.feature_exploration.features_visited : [],
      blocked_features: runResult.feature_exploration ? runResult.feature_exploration.blocked_features : []
    },
    evidence_gallery: {
      screenshots: runResult.artifacts.screenshots,
      videos: runResult.artifacts.video ? [runResult.artifacts.video] : [],
      session_url: null,
      debug_url: null
    },
      metadata: {
        config: {
          target: config.target,
          goal: normalizeText(config.goal),
        brand_persona: normalizeText(config.brandPersona),
        otp_provider: config.otpProvider,
        feature_limit: config.featureLimit,
        scenario_list: Array.isArray(config.scenarioList) ? config.scenarioList : []
      },
      otp: runResult.otp,
      onboarding: runResult.onboarding || null,
      post_auth: runResult.post_auth || null,
      feature_exploration: runResult.feature_exploration || null,
      mission_judgment: runResult.mission_judgment || null,
      run_execution: {
        completed: didReachUserFacingOutcome(runResult),
        runner_failed: isRunnerFailure(runResult),
        mission_completed: didAchieveMission(runResult),
        mission_blocked: didMissionEndBlocked(runResult)
      }
    }
  };

  const markdownLines = [
    "# Local QA Report",
    "",
    `- Run ID: ${report.run_id}`,
    `- Target: ${report.target}`,
    `- Status: ${report.status}`,
    `- Classification: ${runResult.classification}`,
    `- Goal: ${normalizeText(config.goal) || "Not provided"}`,
    `- Persona: ${normalizeText(config.brandPersona) || "Not provided"}`,
    "",
    "## Summary",
    report.summary.note,
    "",
    "## Goal Coverage",
    `- Scenario goals supplied: ${Array.isArray(config.scenarioList) ? config.scenarioList.length : 0}`,
    `- Matched goals exercised: ${runResult.feature_exploration ? runResult.feature_exploration.matched_goal_count : 0}`,
    `- Mission completed: ${didAchieveMission(runResult) ? "yes" : "no"}`,
    "",
    "## Tested Journeys",
    ...report.tested_journeys.map(
      (journey) => `- ${journey.name}: ${journey.status}. ${journey.summary}`
    ),
    "",
    "## Mission Judge",
    `- Goal text: ${normalizeText(runResult.mission_judgment && runResult.mission_judgment.goal) || normalizeText(config.goal) || "Not provided"}`,
    `- Completed: ${didAchieveMission(runResult) ? "yes" : "no"}`,
    `- Reason: ${normalizeText(runResult.mission_judgment && runResult.mission_judgment.final_reason) || "No final judgment recorded."}`,
    `- Rounds attempted: ${Number(runResult.mission_judgment && runResult.mission_judgment.rounds_attempted) || 0}`,
    `- Model: ${normalizeText(runResult.mission_judgment && runResult.mission_judgment.model) || "Not recorded"}`,
    ...(Array.isArray(runResult.mission_judgment && runResult.mission_judgment.completion_evidence) &&
    runResult.mission_judgment.completion_evidence.length
      ? runResult.mission_judgment.completion_evidence
          .slice(0, 6)
          .map((item) => `- Evidence: ${item}`)
      : []),
    "",
    "## Findings",
    ...(report.findings.length
      ? report.findings.map(
          (finding) =>
            `- ${finding.title} [${finding.type}/${finding.severity}]: ${finding.observed_behavior}`
        )
      : ["- No critical findings captured in this run."]),
    "",
    "## Recommendations",
    ...report.recommendations.map((item) => `- ${item}`),
    "",
    "## Feature Coverage",
    `- Discovered candidates: ${runResult.feature_exploration ? runResult.feature_exploration.discovered : 0}`,
    `- Attempted candidates: ${runResult.feature_exploration ? runResult.feature_exploration.attempted : 0}`,
    `- Visited feature surfaces: ${runResult.feature_exploration ? runResult.feature_exploration.visited_count : 0}`,
    `- Blocked candidates: ${runResult.feature_exploration ? runResult.feature_exploration.blocked_count : 0}`,
    "",
    "## Feature Surfaces Visited",
    ...(runResult.feature_exploration && runResult.feature_exploration.features_visited.length
      ? runResult.feature_exploration.features_visited
          .slice(0, 15)
          .map(
            (feature) =>
              `- ${feature.label} (${feature.opened_via}, ${feature.interactions} interaction(s)) -> ${feature.url}`
          )
      : ["- None"]),
    "",
    "## Evidence",
    `- Screenshots: ${report.evidence_gallery.screenshots.length}`,
    `- Video: ${report.evidence_gallery.videos[0] || "none"}`
  ];

  return {
    report,
    markdown: `${markdownLines.join("\n")}\n`
  };
}

async function runOne({ chromium, config, matrixDir, runIndex, otpBroker, runId: runIdOverride, onProgress }) {
  const runId =
    safeFileName(runIdOverride) ||
    `run_${String(Number.isFinite(Number(runIndex)) ? Number(runIndex) : 1).padStart(2, "0")}`;
  const runDir = path.join(matrixDir, runId);
  mkdirp(runDir);
  const emit = (event, data = {}) => emitProgress(onProgress, event, { run_id: runId, ...data });

  const startedAt = new Date();
  const urlsVisited = new Set();
  const consoleErrors = [];
  const pageErrors = [];
  const requestFailures = [];
  const apiResponses = [];
  const notes = [];
  const scenarioGoals = buildScenarioGoals(buildGoalInputs(config));
  const personaProfile = buildPersonaProfile(config.brandPersona);

  const runResult = {
    run_id: runId,
    started_at: startedAt.toISOString(),
    duration_ms: 0,
    target_url: config.target,
    headless: config.headless,
    input_data: {
      goal: normalizeText(config.goal),
      scenario_list: Array.isArray(config.scenarioList) ? config.scenarioList : [],
      brand_persona: normalizeText(config.brandPersona)
    },
    urls_visited: [],
    classification: "unknown",
    success: false,
    signup_submitted: false,
    captcha_detected: false,
    validation_errors: [],
    signals: {
      signed_in: false,
      email_verification_prompt: false,
      otp_required: false
    },
    otp: {
      broker_enabled: Boolean(otpBroker && otpBroker.enabled),
      provider: otpBroker && otpBroker.enabled ? otpBroker.provider : "none",
      inbox_email: null,
      identity_created: false,
      code_received: false,
      code_submitted: false,
      verified: false,
      wait_elapsed_ms: 0,
      wait_polls: 0,
      code_masked: null,
      message_subject: null,
      message_from: null,
      matched_link: null,
      error: null
    },
    post_auth: {
      attempted: false,
      interactions_completed: 0,
      error: null
    },
    onboarding: {
      detected: false,
      attempted: false,
      completed: false,
      steps_completed: 0,
      fields_completed: 0,
      select_actions: 0,
      choice_actions: 0,
      error: null
    },
    feature_exploration: {
      invoked: false,
      attempted: 0,
      discovered: 0,
      visited_count: 0,
      blocked_count: 0,
      interactions_completed: 0,
      matched_goal_count: 0,
      matched_goals: [],
      features_visited: [],
      blocked_features: []
    },
    mission_judgment: {
      attempted: false,
      enabled: false,
      goal: resolveMissionGoalText(config, scenarioGoals),
      model: null,
      max_rounds: null,
      rounds_attempted: 0,
      completed: false,
      final_reason: null,
      completion_evidence: [],
      error: null,
      stop_reason: null,
      judgments: []
    },
    publish: {
      attempted: false,
      ok: false,
      status: null,
      error: null,
      published_run_id: null,
      ui_report_url: null
    },
    notes,
    console_errors: [],
    page_errors: [],
    request_failures: [],
    api_responses: [],
    artifacts: {
      screenshots: [],
      trace: null,
      video: null,
      qa_report_json: null,
      qa_report_md: null,
      run_json: path.join(runDir, "run.json")
    },
    error: null
  };

  emit("run_started", {
    target_url: config.target,
    headless: Boolean(config.headless),
    scenario_count: scenarioGoals.length,
    brand_persona: normalizeText(config.brandPersona) || null
  });

  let context = null;
  let page = null;
  let videoHandle = null;

  const screenshot = async (label) => {
    if (!page) {
      return;
    }
    const file = path.join(runDir, `${safeFileName(label)}.png`);
    await page.screenshot({ path: file, fullPage: true });
    runResult.artifacts.screenshots.push(file);
    emit("screenshot_captured", {
      label: safeFileName(label),
      path: file,
      count: runResult.artifacts.screenshots.length,
      url: page.url()
    });
  };

  try {
    context = await chromium.newContext({
      viewport: { width: 1440, height: 900 },
      locale: "en-US",
      timezoneId: "America/New_York",
      recordVideo: {
        dir: path.join(runDir, "video"),
        size: { width: 1280, height: 720 }
      }
    });

    await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
    emit("browser_context_ready");

    page = await context.newPage();
    videoHandle = page.video();

    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) {
        urlsVisited.add(frame.url());
      }
    });
    page.on("console", (msg) => {
      const type = msg.type();
      if (type === "error" || type === "warning") {
        consoleErrors.push(`${type}: ${msg.text()}`.slice(0, 600));
      }
    });
    page.on("pageerror", (error) => {
      pageErrors.push(String(error && error.message ? error.message : error).slice(0, 600));
    });
    page.on("requestfailed", (request) => {
      requestFailures.push({
        url: request.url().slice(0, 600),
        method: request.method(),
        error: request.failure() ? request.failure().errorText : "unknown"
      });
    });
    page.on("response", (response) => {
      const request = response.request();
      const method = request.method();
      const url = response.url();
      if (!url.includes("workolo.com")) {
        return;
      }
      if (!["POST", "PUT", "PATCH"].includes(method)) {
        return;
      }
      apiResponses.push({
        method,
        url: url.slice(0, 600),
        status: response.status()
      });
    });

    const unique = `${Date.now()}_${runIndex}`;
    const fullName = `QA Matrix ${runIndex}`;
    const password = `Workolo!${unique}`;
    let email = `autotest.workolo.${unique}@gmail.com`;
    let otpIdentity = null;
    if (otpBroker && otpBroker.enabled) {
      try {
        otpIdentity = await otpBroker.createIdentity({
          runTag: `workolo.${runIndex}`
        });
        if (otpIdentity && otpIdentity.email) {
          email = String(otpIdentity.email);
          runResult.otp.inbox_email = email;
          runResult.otp.identity_created = true;
          notes.push(`OTP inbox created: ${email}`);
        }
      } catch (error) {
        runResult.otp.error = error && error.message ? error.message : String(error);
        notes.push(`OTP inbox creation failed, fallback email used: ${runResult.otp.error}`);
      }
    }
    runResult.input_data = { full_name: fullName, email, password_masked: "***" };

    await page.goto(config.target, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(1500);
    await screenshot("01_home");
    emit("target_loaded", { url: page.url() });
    await dismissBlockingOverlays(page, notes);
    await page.waitForTimeout(700);
    await screenshot("01b_home_after_overlay_dismiss");

    const loginTrigger = await findAuthEntryTrigger(page);

    if (!loginTrigger) {
      notes.push("No visible auth entry trigger found.");
      throw new Error("LOGIN_TRIGGER_NOT_FOUND");
    }

    await clickBestEffort(loginTrigger, { timeout: 12000 });
    await Promise.allSettled([
      page.waitForLoadState("domcontentloaded", { timeout: 8000 }),
      waitForAuthSurface(page, 8000)
    ]);
    await page.waitForTimeout(800);
    await screenshot("02_auth_entry");
    emit("auth_entry_opened", { url: page.url() });

    const authDialog = await firstVisibleLocator([
      page.locator('[role="dialog"][data-state="open"]'),
      page.locator('[role="dialog"]')
    ]);
    const authRoot = authDialog || page;

    const fullNameInputInitial = await firstVisibleLocator([
      authRoot.getByLabel(/full\s*name/i),
      authRoot.getByPlaceholder(/full\s*name/i),
      authRoot.locator(
        'input[name*="name" i],input[id*="name" i],input[placeholder*="name" i],input[autocomplete="name" i]'
      ),
      authRoot.locator('input:not([type]),input[type="text"],input[type="search"]').first()
    ]);

    if (!fullNameInputInitial) {
      const signUpSwitcher = await firstVisibleLocator([
        authRoot.getByRole("button", { name: /sign\s*up|create account|register/i }),
        authRoot.getByRole("link", { name: /sign\s*up|create account|register/i }),
        authRoot.locator(
          'a:has-text("Register here"),button:has-text("Register here"),[role="button"]:has-text("Register here"),text=/sign\\s*up|create\\s*account|register here|register/i'
        )
      ]);
      if (signUpSwitcher) {
        try {
          await clickBestEffort(signUpSwitcher, { timeout: 5000 });
          await page.waitForTimeout(1000);
        } catch {
          notes.push("Signup switcher click failed; continuing with current auth view.");
        }
      }
    }

    await screenshot("03_signup_mode");

    const fullNameInput = await firstVisibleLocator([
      authRoot.getByLabel(/full\s*name|name/i),
      authRoot.getByPlaceholder(/full\s*name|name/i),
      authRoot.locator(
        'input[name*="full" i],input[name*="name" i],input[id*="name" i],input[placeholder*="name" i],input[autocomplete="name" i]'
      ),
      authRoot.locator('input:not([type]),input[type="text"],input[type="search"]').first()
    ]);
    const emailInput = await firstVisibleLocator([
      authRoot.getByLabel(/email/i),
      authRoot.getByPlaceholder(/email/i),
      authRoot.locator('input[type="email"],input[name*="email" i],input[placeholder*="mail" i]')
    ]);
    const passwordInput = await firstVisibleLocator([
      authRoot.getByLabel(/^password$/i),
      authRoot.getByPlaceholder(/^password$/i),
      authRoot.locator('input[type="password"]')
    ]);
    const confirmPasswordInput = await firstVisibleLocator([
      authRoot.getByLabel(/confirm|re-?enter|repeat/i),
      authRoot.getByPlaceholder(/confirm|re-?enter|repeat/i),
      authRoot.locator('input[type="password"]').nth(1)
    ]);

    if (!emailInput) {
      notes.push("Email input not found after opening auth flow.");
      throw new Error("EMAIL_INPUT_NOT_FOUND");
    }
    const emailFirstAuthFlow = Boolean(emailInput && !passwordInput);
    let submitButton = null;

    if (emailFirstAuthFlow) {
      notes.push("Email-first auth flow detected; continuing with code verification.");
      await fillBestEffort(emailInput, email, { timeout: 6000 });
      emit("signup_form_filled", { mode: "email_first" });
      await screenshot("04_filled_form");
      submitButton = await firstVisibleLocator([
        authRoot.getByRole("button", {
          name: /continue|next|start|start free|sign\s*in|log\s*in|get started|submit|send code/i
        }),
        authRoot.locator('button[type="submit"],input[type="submit"]'),
        authRoot.locator(
          [
            'button:has-text("Continue")',
            'button:has-text("Next")',
            'button:has-text("Start")',
            'button:has-text("Start Free")',
            'button:has-text("Sign In")',
            'button:has-text("Log In")',
            'button:has-text("Get Started")'
          ].join(",")
        )
      ]);
      if (!submitButton) {
        notes.push("Submit button not found on email-first auth form.");
        throw new Error("SUBMIT_NOT_FOUND");
      }
    } else {
      if (!passwordInput) {
        notes.push("Password input not found after opening auth flow.");
        throw new Error("PASSWORD_INPUT_NOT_FOUND");
      }

      if (fullNameInput) {
        await fillBestEffort(fullNameInput, fullName, { timeout: 6000 });
      } else {
        notes.push("Full Name field not found; proceeding without it.");
      }
      await fillBestEffort(emailInput, email, { timeout: 6000 });
      await fillBestEffort(passwordInput, password, { timeout: 6000 });
      if (confirmPasswordInput) {
        await fillBestEffort(confirmPasswordInput, password, { timeout: 6000 });
      }
      emit("signup_form_filled", { mode: "full_form" });

      const checkbox = await firstVisibleLocator([
        authRoot.getByRole("checkbox"),
        authRoot.locator('input[type="checkbox"]')
      ]);
      if (checkbox) {
        try {
          const checked = await checkbox.isChecked();
          if (!checked) {
            await checkbox.check({ timeout: 3000 });
          }
        } catch {
          await clickBestEffort(checkbox, { timeout: 3000 });
        }
      }

      await screenshot("04_filled_form");

      submitButton = await firstVisibleLocator([
        authRoot.getByRole("button", {
          name: /sign\s*up|signup|register|create account|continue|next|start|get started/i
        }),
        authRoot.locator('button[type="submit"],input[type="submit"]'),
        authRoot.locator(
          [
            'button:has-text("Sign Up")',
            'button:has-text("Signup")',
            'button:has-text("Register")',
            'button:has-text("Continue")',
            'button:has-text("Next")',
            'button:has-text("Start")',
            'button:has-text("Get Started")'
          ].join(",")
        )
      ]);
      if (!submitButton) {
        notes.push("Submit button not found on auth form.");
        throw new Error("SUBMIT_NOT_FOUND");
      }
    }

    const beforeUrl = page.url();
    await Promise.allSettled([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 }),
      clickBestEffort(submitButton, { timeout: 12000 })
    ]);
    runResult.signup_submitted = true;
    emit("signup_submitted");
    await page.waitForTimeout(4500);
    await screenshot("05_after_submit");

    const otpRequiredInitially = await detectOtpRequiredUi(page);
    runResult.signals.otp_required = otpRequiredInitially;
    if (otpRequiredInitially) {
      notes.push("OTP gate detected after signup.");
      emit("otp_gate_detected");
      if (otpBroker && otpBroker.enabled && otpIdentity) {
        const otpWaitResult = await otpBroker.waitForOtpCode(otpIdentity, {
          timeoutMs: config.otpTimeoutMs,
          pollIntervalMs: config.otpPollIntervalMs,
          subjectPattern: config.otpSubjectPattern
        });
        runResult.otp.wait_elapsed_ms = Number(otpWaitResult.elapsedMs) || 0;
        runResult.otp.wait_polls = Number(otpWaitResult.polls) || 0;
        runResult.otp.matched_link = otpWaitResult.link || null;
        runResult.otp.message_subject = otpWaitResult.message ? otpWaitResult.message.subject || null : null;
        runResult.otp.message_from = otpWaitResult.message ? otpWaitResult.message.from || null : null;
        if (!otpWaitResult.ok) {
          runResult.otp.error = otpWaitResult.error || "OTP wait timed out";
          notes.push(`OTP retrieval failed: ${runResult.otp.error}`);
          emit("otp_wait_failed", {
            error: runResult.otp.error
          });
        } else {
          runResult.otp.code_received = Boolean(otpWaitResult.code);
          runResult.otp.code_masked = maskSecret(otpWaitResult.code || "");
          notes.push(
            `OTP message received from ${runResult.otp.message_from || "unknown sender"} (code: ${
              runResult.otp.code_masked || "none"
            }).`
          );
          if (otpWaitResult.code) {
            runResult.otp.code_submitted = await fillOtpCode(page, otpWaitResult.code, notes);
            if (runResult.otp.code_submitted) {
              emit("otp_code_submitted");
            }
            if (runResult.otp.code_submitted) {
              await page.waitForTimeout(6000);
              await screenshot("06_after_otp_submit");
              const otpStillRequired = await detectOtpRequiredUi(page);
              runResult.otp.verified = !otpStillRequired;
              if (runResult.otp.verified) {
                notes.push("OTP gate cleared after code submission.");
                emit("otp_verified");
              } else {
                notes.push("OTP gate still visible after code submission.");
                emit("otp_verification_incomplete");
              }
            }
          } else {
            notes.push("OTP email arrived but no numeric OTP code was parsed.");
            emit("otp_code_missing");
          }
        }
      } else {
        notes.push("OTP broker unavailable for this run; OTP not attempted.");
        emit("otp_broker_unavailable");
      }
    }

    const likelySignedInSurface =
      runResult.otp.verified || /(\/dashboard|\/profile|\/account|\/onboard|\/onboarding)/i.test(page.url());
    if (likelySignedInSurface) {
      runResult.post_auth.attempted = true;
      emit("post_auth_detected", {
        url: page.url()
      });
      try {
        runResult.onboarding = await completeOnboardingFlow(page, notes, {
          scenarioGoals,
          screenshot,
          onboardingEmail: email,
          personaProfile
        });
        if (runResult.onboarding.detected) {
          emit(runResult.onboarding.completed ? "onboarding_completed" : "onboarding_incomplete", {
            steps_completed: runResult.onboarding.steps_completed,
            fields_completed: runResult.onboarding.fields_completed
          });
        }
        runResult.post_auth.interactions_completed = await performPostAuthActions(page, notes, {
          scenarioGoals,
          personaProfile
        });
        if (runResult.post_auth.interactions_completed > 0) {
          await screenshot("07_post_auth_exploration");
        }
        if (runResult.onboarding.detected && !runResult.onboarding.completed) {
          notes.push("Continuing into deeper product exploration even though onboarding still appears present.");
        }
      } catch (error) {
        const message = error && error.message ? error.message : String(error);
        if (runResult.onboarding && runResult.onboarding.detected) {
          runResult.onboarding.error = message;
        } else {
          runResult.post_auth.error = message;
        }
        notes.push(`Post-login exploration failed: ${message}`);
      }

      try {
        const missionLoop = await runMissionJudgeLoop(page, notes, screenshot, {
          config,
          scenarioGoals,
          personaProfile,
          emit
        });
        runResult.feature_exploration.invoked = true;
        runResult.feature_exploration = {
          ...missionLoop.feature_exploration,
          invoked: true
        };
        runResult.mission_judgment = missionLoop.mission_judgment || runResult.mission_judgment;
        emit("feature_exploration_completed", {
          discovered: Number(runResult.feature_exploration.discovered) || 0,
          visited: Number(runResult.feature_exploration.visited_count) || 0,
          blocked: Number(runResult.feature_exploration.blocked_count) || 0,
          matched_goals: Number(runResult.feature_exploration.matched_goal_count) || 0
        });
        emit(runResult.mission_judgment.completed ? "mission_goal_completed" : "mission_goal_incomplete", {
          round_count: Number(runResult.mission_judgment.rounds_attempted) || 0,
          reason: runResult.mission_judgment.final_reason || null,
          stop_reason: runResult.mission_judgment.stop_reason || null
        });
        notes.push(
          `Feature exploration coverage: ${runResult.feature_exploration.visited_count}/${runResult.feature_exploration.discovered} visited/discovered.`
        );
      } catch (error) {
        const message = error && error.message ? error.message : String(error);
        runResult.feature_exploration.invoked = true;
        runResult.feature_exploration.blocked_count += 1;
        runResult.feature_exploration.blocked_features.push({
          label: "feature_exploration_runtime",
          section: "",
          reason: message
        });
        runResult.mission_judgment.error = message;
        notes.push(`Feature exploration failed unexpectedly: ${message}`);
      }
    }

    const sampledText = await textSample(page);
    const rawValidationTexts = await collectVisibleTexts(page, [
      page.locator('[role="alert"]'),
      page.locator(".error,.text-red-500,.text-danger,.invalid-feedback"),
      page.locator("text=/invalid|already exists|too weak|must be|please fill|email/i")
    ]);
    const validationErrors = rawValidationTexts.filter((text) => {
      const normalized = String(text || "").toLowerCase();
      if (!normalized) {
        return false;
      }
      if (normalized.includes("otp required") || normalized.includes("verification required")) {
        return false;
      }
      return (
        normalized.includes("invalid") ||
        normalized.includes("already exists") ||
        normalized.includes("too weak") ||
        normalized.includes("please fill") ||
        (normalized.includes("email") && normalized.includes("invalid")) ||
        normalized.includes("must be")
      );
    });
    const invalidFields = await collectInvalidFields(page);
    for (const field of invalidFields) {
      const label = field.label || field.placeholder || field.name || field.id || field.type || field.tag;
      validationErrors.push(`Invalid required field: ${label}`);
    }
    const captchaDetected = await hasVisibleLocator([
      page.locator('iframe[src*="recaptcha"],iframe[src*="hcaptcha"],iframe[title*="captcha" i]'),
      page.locator("text=/captcha|not a robot|security check/i")
    ]);
    const emailVerificationPrompt = /verify\s+email|check\s+your\s+email|verification/i.test(sampledText);
    const signedInSignal =
      /dashboard|logout|my profile|my account|post project|onboarding|profile details/i.test(sampledText) ||
      /(\/dashboard|\/profile|\/account)/i.test(page.url());
    const authStillVisible = await hasVisibleLocator([
      page.locator('input[type="email"]'),
      page.locator('input[type="password"]'),
      page.getByRole("button", { name: /sign\s*up|signup|register/i })
    ]);

    if (page.url() !== beforeUrl) {
      notes.push(`URL changed after submit: ${beforeUrl} -> ${page.url()}`);
    } else {
      notes.push("URL did not change after submit.");
    }
    if (validationErrors.length) {
      notes.push(`Validation/Error text detected (${validationErrors.length}).`);
    }
    if (captchaDetected) {
      notes.push("Captcha challenge detected on page.");
    }
    if (emailVerificationPrompt) {
      notes.push("Email verification prompt detected.");
    }
    if (signedInSignal) {
      notes.push("Signed-in surface detected.");
    }

    runResult.captcha_detected = captchaDetected;
    runResult.validation_errors = validationErrors;
    runResult.signals.signed_in = signedInSignal;
    runResult.signals.email_verification_prompt = emailVerificationPrompt;
    runResult.classification = classifyOutcome({
      missionCompleted: didAchieveMission(runResult),
      captchaDetected,
      emailVerificationPrompt,
      signedInSignal,
      otpRequired: runResult.signals.otp_required,
      otpAttempted: runResult.otp.code_submitted || runResult.otp.wait_polls > 0,
      otpVerified: runResult.otp.verified,
      onboardingDetected: runResult.onboarding.detected,
      onboardingCompleted: runResult.onboarding.completed,
      featureVisitedCount: runResult.feature_exploration.visited_count,
      validationErrors,
      submitClicked: runResult.signup_submitted,
      authStillVisible
    });
    runResult.success = didAchieveMission(runResult);
    emit("classification_finalized", {
      classification: runResult.classification,
      success: runResult.success,
      mission_completed: runResult.success,
      mission_reason: runResult.mission_judgment.final_reason || null,
      captcha_detected: runResult.captcha_detected,
      validation_error_count: Array.isArray(runResult.validation_errors) ? runResult.validation_errors.length : 0
    });

    runResult.console_errors = consoleErrors.slice(0, 80);
    runResult.page_errors = pageErrors.slice(0, 80);
    runResult.request_failures = requestFailures.slice(0, 120);
    runResult.api_responses = apiResponses.slice(0, 80);
    runResult.urls_visited = Array.from(urlsVisited).slice(0, 80);
  } catch (error) {
    runResult.classification = runResult.signup_submitted ? "run_failed_after_submit" : "run_failed_pre_submit";
    runResult.error = error && error.message ? error.message : String(error);
    runResult.success = false;
    emit("run_failed", {
      error: runResult.error,
      classification: runResult.classification
    });
    try {
      await screenshot("99_error_state");
    } catch {
      // Ignore screenshot errors while already failing.
    }
    runResult.console_errors = consoleErrors.slice(0, 80);
    runResult.page_errors = pageErrors.slice(0, 80);
    runResult.request_failures = requestFailures.slice(0, 120);
    runResult.api_responses = apiResponses.slice(0, 80);
    runResult.urls_visited = Array.from(urlsVisited).slice(0, 80);
  } finally {
    if (context) {
      try {
        const tracePath = path.join(runDir, "trace.zip");
        await context.tracing.stop({ path: tracePath });
        runResult.artifacts.trace = tracePath;
      } catch {
        // Ignore trace stop errors.
      }

      try {
        await context.close();
      } catch {
        // Ignore context close errors.
      }
    }

    if (videoHandle) {
      try {
        const videoPath = await videoHandle.path();
        runResult.artifacts.video = videoPath;
      } catch {
        // Ignore missing video path.
      }
    }
  }

  runResult.duration_ms = Date.now() - startedAt.getTime();
  const qaReportPayload = buildRunQaReport(runResult, config);
  const qaReportJsonPath = path.join(runDir, "qa_report.json");
  const qaReportMarkdownPath = path.join(runDir, "qa_report.md");
  writeJson(qaReportJsonPath, qaReportPayload.report);
  fs.writeFileSync(qaReportMarkdownPath, qaReportPayload.markdown, "utf8");
  runResult.artifacts.qa_report_json = qaReportJsonPath;
  runResult.artifacts.qa_report_md = qaReportMarkdownPath;
  writeJson(path.join(runDir, "run.json"), runResult);
  emit("run_artifacts_written", {
    qa_report_json: qaReportJsonPath,
    qa_report_md: qaReportMarkdownPath,
    screenshot_count: Array.isArray(runResult.artifacts.screenshots) ? runResult.artifacts.screenshots.length : 0,
    screenshots: Array.isArray(runResult.artifacts.screenshots) ? runResult.artifacts.screenshots.slice(-30) : [],
    trace: runResult.artifacts.trace || null,
    video: runResult.artifacts.video || null
  });
  return runResult;
}

function summarizeRuns(runs) {
  const byClass = {};
  let success = 0;
  let captcha = 0;
  let validation = 0;
  let failures = 0;
  let otpRequired = 0;
  let otpVerified = 0;
  let otpAttempted = 0;
  let publishAttempted = 0;
  let publishSucceeded = 0;

  for (const run of runs) {
    byClass[run.classification] = (byClass[run.classification] || 0) + 1;
    if (run.success) {
      success += 1;
    }
    if (run.captcha_detected) {
      captcha += 1;
    }
    if (Array.isArray(run.validation_errors) && run.validation_errors.length) {
      validation += 1;
    }
    if (run.error) {
      failures += 1;
    }
    if (run && run.signals && run.signals.otp_required) {
      otpRequired += 1;
    }
    if (run && run.otp && run.otp.code_submitted) {
      otpAttempted += 1;
    }
    if (run && run.otp && run.otp.verified) {
      otpVerified += 1;
    }
    if (run && run.publish && run.publish.attempted) {
      publishAttempted += 1;
    }
    if (run && run.publish && run.publish.ok) {
      publishSucceeded += 1;
    }
  }

  return {
    total_runs: runs.length,
    success_runs: success,
    success_rate: runs.length ? Number((success / runs.length).toFixed(4)) : 0,
    captcha_runs: captcha,
    validation_error_runs: validation,
    error_runs: failures,
    otp_required_runs: otpRequired,
    otp_attempted_runs: otpAttempted,
    otp_verified_runs: otpVerified,
    publish_attempted_runs: publishAttempted,
    publish_succeeded_runs: publishSucceeded,
    classifications: byClass
  };
}

async function main() {
  const { chromium } = require("playwright");
  const config = parseArgs(process.argv.slice(2));
  const publishValidation = validateRequiredPublishConfig(config);
  if (!publishValidation.ok) {
    throw new Error(publishValidation.error);
  }
  const otpBroker = createOtpBroker({
    provider: config.otpProvider,
    mailtmBaseUrl: config.otpMailtmBaseUrl || undefined
  });

  const matrixId = `workolo_local_matrix_${toTimestampId()}`;
  const matrixDir = path.join(config.outputRoot, matrixId);
  mkdirp(matrixDir);

  const browser = await chromium.launch(
    buildChromiumLaunchOptions(
      {
        headless: config.headless
      },
      { browserChannel: config.browserChannel }
    )
  );

  const runs = [];
  try {
    for (let index = 1; index <= config.runs; index += 1) {
      const result = await runOne({
        chromium: browser,
        config,
        matrixDir,
        runIndex: index,
        otpBroker
      });

      if (config.publishReports) {
        const publishResult = await publishRunToCallback({
          runResult: result,
          config,
          matrixId
        });
        result.publish = {
          attempted: Boolean(publishResult.attempted),
          ok: Boolean(publishResult.ok),
          status: publishResult.status ?? null,
          error: publishResult.error || null,
          published_run_id: publishResult.published_run_id || null,
          ui_report_url: publishResult.ui_report_url || null
        };
        writeJson(path.join(matrixDir, result.run_id, "run.json"), result);
      }

      runs.push(result);
      console.log(
        JSON.stringify(
          {
            event: "run_complete",
            run: index,
            total: config.runs,
            classification: result.classification,
            success: result.success,
            captcha: result.captcha_detected,
            published: result.publish && result.publish.attempted ? result.publish.ok : null,
            published_run_id: result.publish && result.publish.ok ? result.publish.published_run_id : null,
            error: result.error || null
          },
          null,
          2
        )
      );
    }
  } finally {
    await browser.close();
  }

  const summary = summarizeRuns(runs);
  const summaryPayload = {
    matrix_id: matrixId,
    generated_at: new Date().toISOString(),
    config,
    summary,
    runs: runs.map((run) => ({
      run_id: run.run_id,
      classification: run.classification,
      success: run.success,
      signup_submitted: run.signup_submitted,
      captcha_detected: run.captcha_detected,
      otp_required: Boolean(run.signals && run.signals.otp_required),
      otp_code_submitted: Boolean(run.otp && run.otp.code_submitted),
      otp_verified: Boolean(run.otp && run.otp.verified),
      features_discovered: Number(run.feature_exploration && run.feature_exploration.discovered) || 0,
      features_visited: Number(run.feature_exploration && run.feature_exploration.visited_count) || 0,
      feature_blockers: Number(run.feature_exploration && run.feature_exploration.blocked_count) || 0,
      publish_attempted: Boolean(run.publish && run.publish.attempted),
      publish_ok: Boolean(run.publish && run.publish.ok),
      published_run_id: run.publish && run.publish.published_run_id ? run.publish.published_run_id : null,
      ui_report_url: run.publish && run.publish.ui_report_url ? run.publish.ui_report_url : null,
      publish_error: run.publish && run.publish.error ? run.publish.error : null,
      has_validation_errors: Array.isArray(run.validation_errors) && run.validation_errors.length > 0,
      error: run.error,
      duration_ms: run.duration_ms,
      run_json: run.artifacts.run_json,
      qa_report_json: run.artifacts.qa_report_json,
      qa_report_md: run.artifacts.qa_report_md,
      trace: run.artifacts.trace,
      video: run.artifacts.video
    }))
  };

  const summaryPath = path.join(matrixDir, "summary.json");
  writeJson(summaryPath, summaryPayload);

  console.log(
    JSON.stringify(
      {
        event: "matrix_complete",
        matrix_id: matrixId,
        output_dir: matrixDir,
        summary_path: summaryPath,
        summary
      },
      null,
      2
    )
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      JSON.stringify(
        {
          ok: false,
          message: error && error.message ? error.message : String(error),
          stack: error && error.stack ? error.stack : null
        },
        null,
        2
      )
    );
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  runOne,
  buildRunQaReport,
  createOtpBroker,
  toTimestampId,
  safeFileName,
  mkdirp,
  isLikelyAuthEntryText,
  isLikelyAuthEntryHref,
  buildScenarioGoals,
  scoreCandidateAgainstGoals,
  classifyOutcome,
  __private: {
    chooseInputValue,
    extractMissionActionIntent,
    looksCustomerJourneyAction,
    normalizeMissionJudgeDecision,
    runMissionJudgeLoop,
    buildPersonaProfile,
    buildPersonaContextValue,
    scoreMissionActionCandidate,
    scoreCandidateAgainstPersona,
    buildMissionSnapshotSignature,
    areMissionSnapshotsSemanticallyEquivalent,
    didReachUserFacingOutcome,
    isRunnerFailure,
    didMissionEndBlocked,
    didAchieveMission
  }
};
