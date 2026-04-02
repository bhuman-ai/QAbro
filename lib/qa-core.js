const crypto = require("crypto");

const DEFAULT_PUBLIC_BASE_URL = "https://swarmtester.com";
const DEFAULT_SCOPE_MODE = "core_20m";
const DEFAULT_SOURCE = "qa_bot";
const DEFAULT_EXECUTION_ENGINE = "auto";
const DEFAULT_CALLBACK_RETRY_DELAYS_MS = [1000, 2000, 5000, 10000, 20000];
const DEFAULT_WEBHOOK_RETRY_DELAYS_MS = [500, 1500, 3000, 5000];
const FALLBACK_PERSONA =
  "General non-developer business user with moderate technical comfort.";

const ALLOWED_FINDING_TYPES = [
  "bug",
  "frustration_point",
  "confusion_point",
  "aha_moment",
  "dead_end",
  "performance_issue",
  "accessibility_issue",
  "copy_issue"
];

const ALLOWED_SEVERITIES = ["low", "medium", "high", "critical"];
const ALLOWED_REPORT_STATUSES = ["completed", "partial", "failed", "failed_validation"];
const ALLOWED_EMOTIONS = [
  "confidence",
  "uncertainty",
  "frustration",
  "delight",
  "confusion",
  "trust",
  "distrust"
];
const ALLOWED_OTP_MODES = ["none", "manual_prompt", "provider_hook"];
const ALLOWED_WEBHOOK_EVENTS = [
  "run.started",
  "run.progress",
  "run.completed",
  "run.failed"
];
const ALLOWED_EXECUTION_ENGINES = [
  "auto",
  "local_playwright",
  "local_vision_agent"
];
const DEFAULT_WEBHOOK_EVENTS = ["run.started", "run.progress", "run.completed", "run.failed"];
const DATA_VIDEO_PATTERN = /^data:video\/[a-z0-9.+-]+;base64,/i;
const VIDEO_EVIDENCE_PATH_PATTERN = /\.(mp4|webm|mov|m4v|avi|mkv)(?:$|[?#])/i;
const EXPERIENCE_TIMELINE_DEFAULT_STEP_MS = 5000;
const EXPERIENCE_TIMELINE_MIN_DURATION_MS = 30000;
const EXPERIENCE_TIMELINE_MAX_SPANS = 24;

const FINDING_TYPE_SET = new Set(ALLOWED_FINDING_TYPES);
const SEVERITY_SET = new Set(ALLOWED_SEVERITIES);
const REPORT_STATUS_SET = new Set(ALLOWED_REPORT_STATUSES);
const EMOTION_SET = new Set(ALLOWED_EMOTIONS);
const OTP_MODE_SET = new Set(ALLOWED_OTP_MODES);
const WEBHOOK_EVENT_SET = new Set(ALLOWED_WEBHOOK_EVENTS);
const EXECUTION_ENGINE_SET = new Set(ALLOWED_EXECUTION_ENGINES);

const SCOPE_CONFIG = {
  core_20m: {
    mode: "core_20m",
    label: "Core 20 minute sweep",
    time_budget_minutes: 20,
    max_steps: 40,
    coverage_checklist: [
      "Map global navigation and homepage CTA paths.",
      "Exercise one primary conversion or activation flow.",
      "Probe forms, empty states, and validation surfaces.",
      "Capture the clearest user-value moment if present."
    ]
  },
  deep_45m: {
    mode: "deep_45m",
    label: "Deep 45 minute exploration",
    time_budget_minutes: 45,
    max_steps: 90,
    coverage_checklist: [
      "Run public acquisition and conversion flows.",
      "Branch into secondary navigation and edge cases.",
      "Probe empty states, retry states, and regressions.",
      "Test multiple forms and state transitions.",
      "Capture high-confidence bugs and standout UX wins."
    ]
  },
  feature_targeted: {
    mode: "feature_targeted",
    label: "Feature-targeted QA pass",
    time_budget_minutes: 30,
    max_steps: 60,
    coverage_checklist: [
      "Prioritize only the provided scenarios and URLs.",
      "Go deep enough to validate the requested features.",
      "Call out blockers immediately when access is impossible.",
      "Ignore unrelated surfaces unless they block the target flow."
    ]
  }
};

function sanitizeString(value, maxLength = 2048) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim().slice(0, maxLength);
}

function sanitizeOptionalString(value, maxLength = 2048) {
  const sanitized = sanitizeString(value, maxLength);
  return sanitized || null;
}

function simplifyHumanNarrative(value, maxLength = 4000) {
  const raw = sanitizeString(value, maxLength);
  if (!raw) {
    return "";
  }

  const exactMatches = new Map([
    [
      "The run failed before the requested flow completed",
      "The tester got stuck before finishing the thing they were trying to do."
    ],
    [
      "The requested flow stopped before it finished",
      "The tester got stuck before finishing the thing they were trying to do."
    ],
    [
      "The auth flow stalled before product access",
      "The tester got stuck during account setup and never got into the product."
    ],
    [
      "The site sent the tester back to the login screen right after the sign-up form was submitted",
      "The tester filled the sign-up form, clicked Sign up, and got sent back to the login page instead of entering the product."
    ],
    [
      "Primary public navigation and conversion surfaces were exercised to validate the core public user journey.",
      "The tester looked at the main public pages and tried the main button a new visitor would click."
    ],
    [
      "A lightweight sweep covered surface-level navigation, button states, and form affordances to identify blockers or unclear transitions.",
      "The tester quickly checked the main pages, buttons, and forms to see if anything felt broken or confusing."
    ],
    [
      "The worker checked the visible auth boundary but did not cross into authenticated flows because no credentials were supplied.",
      "The tester reached the login wall but could not go farther because no login was provided."
    ],
    [
      "Auth flow did not resolve to an authenticated surface",
      "The tester submitted the login or sign-up form, but the site kept showing the same login screen."
    ],
    [
      "Authenticated flows were not tested because no credentials were provided.",
      "The tester never got into the logged-in part of the product."
    ],
    [
      "Milestone screenshot captured.",
      "The tester reached the last visible screen before the blocker."
    ],
    ["Open the target entry page.", "Open the first page."],
    ["Traverse the main navigation and primary CTA path.", "Click through the main menu and the main button."],
    [
      "Complete the highest-value public flow available without credentials.",
      "Finish the main thing a visitor can do without logging in."
    ],
    ["Map major navigation surfaces and modal entry points.", "Look at the main pages, menus, and popups."],
    ["Probe visible forms, validation states, and CTA affordances.", "Try the visible forms and buttons."],
    [
      "Confirm whether the flow stays coherent without hidden prerequisites.",
      "Check whether it still makes sense without hidden setup steps."
    ],
    ["Identify the primary sign-in or account gate.", "Find where login starts."],
    [
      "Confirm the app exposes additional authenticated-only areas.",
      "Check if there are more pages after login."
    ],
    [
      "Record the auth boundary as untested rather than forcing invalid coverage.",
      "Mark the logged-in part as not tested instead of guessing."
    ],
  ]);
  if (exactMatches.has(raw)) {
    return exactMatches.get(raw);
  }

  return raw
    .replace(/\bworker\b/gi, "tester")
    .replace(/\bagent\b/gi, "tester")
    .replace(/\bauthenticated flows\b/gi, "logged-in pages")
    .replace(/\bauth boundary\b/gi, "login wall")
    .replace(/\bcredentials were supplied\b/gi, "a login was provided")
    .replace(/\bcredentials\b/gi, "login details")
    .replace(/\bdid not resolve to an authenticated surface\b/gi, "kept showing the same login screen instead of getting into the product")
    .replace(/\bauth flow stalled before product access\b/gi, "got stuck during account setup and never got into the product")
    .replace(
      /\bthe site sent the tester back to the login screen right after the sign-up form was submitted\b/gi,
      "the tester filled the sign-up form, clicked Sign up, and got sent back to the login page instead of entering the product"
    )
    .replace(/\bpublic navigation and conversion surfaces\b/gi, "main public pages and buttons")
    .replace(/\bwere exercised to validate\b/gi, "were checked to see")
    .replace(/\bcore public user journey\b/gi, "if a new visitor could use them")
    .replace(/\bsurface-level navigation, button states, and form affordances\b/gi, "main pages, buttons, and forms")
    .replace(/\bidentify blockers or unclear transitions\b/gi, "see if anything felt broken or confusing")
    .replace(/\bmajor navigation surfaces and modal entry points\b/gi, "main pages, menus, and popups")
    .replace(/\bvalidation states\b/gi, "error messages")
    .replace(/\bCTA affordances\b/gi, "buttons")
    .replace(/\bhidden prerequisites\b/gi, "hidden setup steps")
    .replace(/\bprimary sign-in or account gate\b/gi, "main login step")
    .replace(/\badditional authenticated-only areas\b/gi, "more pages after login")
    .replace(/\brecord the auth boundary as untested rather than forcing invalid coverage\b/gi, "mark the logged-in part as not tested instead of guessing")
    .replace(/\bpublic flow\b/gi, "public path")
    .replace(/\buser journey\b/gi, "user path")
    .replace(/\bconversion surfaces\b/gi, "main buttons")
    .replace(/\bmilestone screenshot captured\b/gi, "the tester reached the last visible screen before the blocker")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeReportMarkdown(value, maxLength = 12000) {
  if (value === undefined || value === null) {
    return null;
  }

  const sanitized = String(value)
    .trim()
    .replace(/!\[[^\]]*]\(data:(?:image|video)\/[^)]+\)/gi, "[embedded media removed]")
    .replace(/data:(?:image|video)\/[^\s)]+/gi, "[embedded media removed]")
    .slice(0, maxLength);

  return sanitized || null;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeJsonParse(value) {
  if (typeof value !== "string") {
    return { ok: false, value: null, error: "Value is not a string" };
  }

  try {
    return { ok: true, value: JSON.parse(value), error: null };
  } catch (error) {
    return { ok: false, value: null, error: error.message };
  }
}

function normalizeUrl(value) {
  const raw = sanitizeString(value, 4096);
  if (!raw) {
    return null;
  }

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeExecutionEngine(value, fallbackValue = DEFAULT_EXECUTION_ENGINE) {
  const normalized = sanitizeString(value, 64).toLowerCase();
  if (!normalized) {
    return fallbackValue;
  }

  if (["local", "playwright", "local_playwright", "local-playwright"].includes(normalized)) {
    return "local_vision_agent";
  }

  if (
    [
      "local_vision_agent",
      "local-vision-agent",
      "vision",
      "vision_agent",
      "vision-agent",
      "agent",
      "agentic",
      "browserbase",
      "browserbase_agent",
      "browserbase-agent",
      "stagehand"
    ].includes(normalized)
  ) {
    return "local_vision_agent";
  }

  if (EXECUTION_ENGINE_SET.has(normalized)) {
    return normalized;
  }

  return fallbackValue;
}

function sleep(ms) {
  const delay = Number(ms) || 0;
  if (delay <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    setTimeout(resolve, delay);
  });
}

function readField(object, keys) {
  if (!isPlainObject(object)) {
    return undefined;
  }

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(object, key)) {
      return object[key];
    }
  }

  return undefined;
}

function toIsoTimestamp(value) {
  const raw = sanitizeString(value, 128);
  if (!raw) {
    return new Date().toISOString();
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }

  return parsed.toISOString();
}

function parseBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "n", "off"].includes(normalized)) {
      return false;
    }
  }

  return Boolean(value);
}

function getScopeConfig(scopeMode) {
  const normalized = sanitizeString(scopeMode, 64).toLowerCase();
  return SCOPE_CONFIG[normalized] || SCOPE_CONFIG[DEFAULT_SCOPE_MODE];
}

function buildPrimaryUserGoal(runRequest) {
  const metadata = isPlainObject(runRequest?.metadata) ? runRequest.metadata : {};
  const explicitGoal =
    sanitizeString(metadata.goal, 1000) ||
    sanitizeString(metadata.user_goal, 1000) ||
    sanitizeString(metadata.objective, 1000);
  if (explicitGoal) {
    return explicitGoal;
  }

  const scenarios = Array.isArray(runRequest?.scenario_list)
    ? runRequest.scenario_list.map((item) => sanitizeString(item, 400)).filter(Boolean)
    : [];
  if (scenarios.length === 1) {
    return scenarios[0];
  }
  if (scenarios.length > 1) {
    return `Complete these user goals in order: ${scenarios.join("; ")}`;
  }

  return "Reach the product as a realistic user, finish any required onboarding, and complete at least one meaningful in-app task.";
}

function getPublicBaseUrl(req) {
  const configured = normalizeUrl(process.env.QA_PUBLIC_APP_URL);
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  const forwardedProto = sanitizeString(req?.headers?.["x-forwarded-proto"], 32)
    .split(",")[0]
    .trim()
    .toLowerCase();
  const protocol = forwardedProto === "http" ? "http" : "https";
  const host = sanitizeString(req?.headers?.["x-forwarded-host"] || req?.headers?.host, 512)
    .split(",")[0]
    .trim();

  if (host) {
    return `${protocol}://${host}`;
  }

  return DEFAULT_PUBLIC_BASE_URL;
}

function getCallbackUrl(req) {
  const configured = normalizeUrl(process.env.QA_CALLBACK_URL);
  if (configured) {
    return configured;
  }

  return `${getPublicBaseUrl(req)}/api/qa-report-callback`;
}

async function parseRequestBody(req) {
  if (req.body !== undefined && req.body !== null && req.body !== "") {
    if (typeof req.body === "string") {
      return JSON.parse(req.body);
    }
    return req.body;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  if (!chunks.length) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function extractTargetLabel(targetUrl) {
  const normalized = normalizeUrl(targetUrl);
  if (!normalized) {
    return sanitizeString(targetUrl, 256) || "unknown-target";
  }

  try {
    const parsed = new URL(normalized);
    return parsed.host || normalized;
  } catch {
    return normalized;
  }
}

function sanitizeScenarioList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const scenarios = [];
  for (const item of value) {
    const scenario = sanitizeString(item, 500);
    if (scenario) {
      scenarios.push(scenario);
    }
  }

  return scenarios;
}

function sanitizeMetadata(value) {
  if (!isPlainObject(value)) {
    return {};
  }

  const sanitized = {};
  for (const [key, rawValue] of Object.entries(value)) {
    const safeKey = sanitizeString(key, 64);
    if (!safeKey) {
      continue;
    }

    if (rawValue === null) {
      sanitized[safeKey] = null;
      continue;
    }

    if (["string", "number", "boolean"].includes(typeof rawValue)) {
      sanitized[safeKey] = rawValue;
      continue;
    }

    if (Array.isArray(rawValue)) {
      sanitized[safeKey] = rawValue.slice(0, 20).map((item) => sanitizeString(item, 200));
      continue;
    }

    if (isPlainObject(rawValue)) {
      sanitized[safeKey] = JSON.parse(JSON.stringify(rawValue));
      continue;
    }

    sanitized[safeKey] = sanitizeString(rawValue, 500);
  }

  return sanitized;
}

const REPO_TRIAGE_STATUS_SET = new Set([
  "disabled",
  "pending_blind_report",
  "queued",
  "processing",
  "completed",
  "failed",
  "skipped"
]);
const REPO_TRIAGE_PROVIDER_SET = new Set(["workspace", "github"]);
const REPO_TRIAGE_MODE_SET = new Set(["high_signal_only", "post_findings_only", "all_findings"]);
const REPO_TRIAGE_REF_STRATEGY_SET = new Set(["workspace", "deploy_sha", "branch_fallback"]);

function sanitizeStringList(value, maxItems = 12, maxLength = 240) {
  if (!Array.isArray(value)) {
    return [];
  }

  const items = [];
  const seen = new Set();
  for (const rawValue of value) {
    const safeValue = sanitizeString(rawValue, maxLength);
    if (!safeValue) {
      continue;
    }
    const dedupeKey = safeValue.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    items.push(safeValue);
    if (items.length >= maxItems) {
      break;
    }
  }

  return items;
}

function sanitizeRepoTriageConfig(value) {
  const config = isPlainObject(value) ? value : {};
  const provider = sanitizeString(config.provider, 64).toLowerCase();
  const mode = sanitizeString(config.mode || config.auto_mode, 64).toLowerCase();
  const refStrategy = sanitizeString(config.ref_strategy || config.refStrategy, 64).toLowerCase();

  return {
    enabled: config.enabled === true,
    provider: REPO_TRIAGE_PROVIDER_SET.has(provider) ? provider : "workspace",
    repo: sanitizeOptionalString(config.repo, 320) || null,
    ref: sanitizeOptionalString(config.ref, 256) || null,
    ref_strategy: REPO_TRIAGE_REF_STRATEGY_SET.has(refStrategy) ? refStrategy : "workspace",
    branch_fallback:
      sanitizeOptionalString(config.branch_fallback || config.branchFallback, 128) || null,
    path_allowlist: sanitizeStringList(config.path_allowlist || config.pathAllowlist, 8, 320),
    mode: REPO_TRIAGE_MODE_SET.has(mode) ? mode : "high_signal_only"
  };
}

function sanitizeRepoTriageState(value, fallbackConfig = null) {
  const source = isPlainObject(value) ? value : {};
  const config = sanitizeRepoTriageConfig({
    ...(isPlainObject(fallbackConfig) ? fallbackConfig : {}),
    ...source
  });
  const status = sanitizeString(source.status, 64).toLowerCase();

  return {
    ...config,
    status: REPO_TRIAGE_STATUS_SET.has(status)
      ? status
      : config.enabled
        ? "pending_blind_report"
        : "disabled",
    job_id: sanitizeOptionalString(source.job_id || source.jobId, 128) || null,
    summary: sanitizeOptionalString(source.summary, 500) || null,
    reason: sanitizeOptionalString(source.reason, 500) || null,
    updated_at: sanitizeOptionalString(source.updated_at || source.updatedAt, 128) || null,
    queued_at: sanitizeOptionalString(source.queued_at || source.queuedAt, 128) || null,
    started_at: sanitizeOptionalString(source.started_at || source.startedAt, 128) || null,
    completed_at: sanitizeOptionalString(source.completed_at || source.completedAt, 128) || null,
    signal_count: Math.max(0, Math.min(50, Number(source.signal_count || source.signalCount) || 0)),
    signal_types: sanitizeStringList(source.signal_types || source.signalTypes, 8, 64)
  };
}

function sanitizeEngineeringTriageFinding(value, index = 0) {
  const finding = isPlainObject(value) ? value : {};
  const suspectedFiles = sanitizeStringList(finding.suspected_files || finding.suspectedFiles, 8, 512);
  const probableCauses = sanitizeStringList(
    finding.probable_causes || finding.probableCauses,
    6,
    240
  );
  const suggestedChecks = sanitizeStringList(
    finding.suggested_checks || finding.suggestedChecks,
    6,
    240
  );
  const suggestedTests = sanitizeStringList(
    finding.suggested_tests || finding.suggestedTests,
    6,
    240
  );
  const matchedTerms = sanitizeStringList(finding.matched_terms || finding.matchedTerms, 8, 120);
  const confidence = Number(finding.confidence);

  if (
    !sanitizeString(finding.finding_id || finding.findingId, 128) &&
    !sanitizeString(finding.finding_title || finding.findingTitle, 180) &&
    !suspectedFiles.length &&
    !probableCauses.length &&
    !suggestedChecks.length &&
    !suggestedTests.length
  ) {
    return null;
  }

  return {
    finding_id: sanitizeString(finding.finding_id || finding.findingId, 128) || `finding_${index + 1}`,
    finding_title:
      sanitizeOptionalString(finding.finding_title || finding.findingTitle, 180) || null,
    confidence: Number.isFinite(confidence)
      ? Math.max(0, Math.min(1, Math.round(confidence * 100) / 100))
      : null,
    suspected_files: suspectedFiles,
    probable_causes: probableCauses,
    suggested_checks: suggestedChecks,
    suggested_tests: suggestedTests,
    matched_terms: matchedTerms
  };
}

function sanitizeEngineeringTriage(value) {
  if (!isPlainObject(value)) {
    return null;
  }

  const perFinding = (Array.isArray(value.per_finding || value.perFinding)
    ? value.per_finding || value.perFinding
    : []
  )
    .map((item, index) => sanitizeEngineeringTriageFinding(item, index))
    .filter(Boolean)
    .slice(0, 8);
  const suspectedFiles = sanitizeStringList(
    value.suspected_files || value.suspectedFiles,
    12,
    512
  );
  const probableCauses = sanitizeStringList(
    value.probable_causes || value.probableCauses,
    8,
    240
  );
  const suggestedChecks = sanitizeStringList(
    value.suggested_checks || value.suggestedChecks,
    8,
    240
  );
  const suggestedTests = sanitizeStringList(
    value.suggested_tests || value.suggestedTests,
    8,
    240
  );
  const basedOn = sanitizeStringList(value.based_on || value.basedOn, 6, 64);
  const confidence = Number(value.confidence);

  if (
    !sanitizeOptionalString(value.summary, 1000) &&
    !perFinding.length &&
    !suspectedFiles.length &&
    !probableCauses.length &&
    !suggestedChecks.length &&
    !suggestedTests.length
  ) {
    return null;
  }

  return {
    summary: sanitizeOptionalString(value.summary, 1000) || null,
    repo_label: sanitizeOptionalString(value.repo_label || value.repoLabel, 240) || null,
    confidence: Number.isFinite(confidence)
      ? Math.max(0, Math.min(1, Math.round(confidence * 100) / 100))
      : null,
    based_on: basedOn,
    generated_at: sanitizeOptionalString(value.generated_at || value.generatedAt, 128) || null,
    suspected_files: suspectedFiles,
    probable_causes: probableCauses,
    suggested_checks: suggestedChecks,
    suggested_tests: suggestedTests,
    per_finding: perFinding
  };
}

function sanitizeWebhookHeaders(value) {
  if (!isPlainObject(value)) {
    return {};
  }

  const headers = {};
  let count = 0;
  for (const [rawKey, rawValue] of Object.entries(value)) {
    if (count >= 20) {
      break;
    }

    const key = sanitizeString(rawKey, 128);
    const lowerKey = key.toLowerCase();
    if (!key || !/^[a-z0-9-]+$/i.test(key)) {
      continue;
    }
    if (["content-length", "host", "connection"].includes(lowerKey)) {
      continue;
    }

    const headerValue = sanitizeString(rawValue, 1024);
    if (!headerValue) {
      continue;
    }

    headers[key] = headerValue;
    count += 1;
  }

  return headers;
}

function sanitizeWebhookEvents(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const events = [];
  const seen = new Set();
  for (const rawEvent of value) {
    const event = sanitizeString(rawEvent, 64).toLowerCase();
    if (!event || seen.has(event)) {
      continue;
    }
    seen.add(event);
    if (WEBHOOK_EVENT_SET.has(event)) {
      events.push(event);
    }
  }

  return events;
}

function normalizeWebhookConfig(input = {}, options = {}) {
  const strict = options.strict === true;
  const source = isPlainObject(input) ? input : {};
  const rawWebhook = source.webhook;
  if (rawWebhook !== undefined && rawWebhook !== null && !isPlainObject(rawWebhook)) {
    if (strict) {
      return { ok: false, error: "webhook must be an object when provided" };
    }
    return { ok: true, webhook: null };
  }

  const webhook = isPlainObject(rawWebhook) ? rawWebhook : {};
  const rawUrl = webhook.url ?? source.webhook_url ?? source.webhookUrl;
  const rawSecret = webhook.secret ?? source.webhook_secret ?? source.webhookSecret;
  const rawEvents = webhook.events ?? source.webhook_events ?? source.webhookEvents;
  const rawHeaders = webhook.headers ?? source.webhook_headers ?? source.webhookHeaders;

  const attempted =
    rawWebhook !== undefined ||
    source.webhook_url !== undefined ||
    source.webhookUrl !== undefined ||
    source.webhook_secret !== undefined ||
    source.webhookSecret !== undefined ||
    source.webhook_events !== undefined ||
    source.webhookEvents !== undefined ||
    source.webhook_headers !== undefined ||
    source.webhookHeaders !== undefined;

  if (!attempted) {
    return { ok: true, webhook: null };
  }

  const url = normalizeUrl(rawUrl);
  if (!url) {
    return { ok: false, error: "webhook_url must be a valid http or https URL" };
  }

  if (rawEvents !== undefined && rawEvents !== null && !Array.isArray(rawEvents)) {
    return { ok: false, error: "webhook_events must be an array when provided" };
  }

  if (rawHeaders !== undefined && rawHeaders !== null && !isPlainObject(rawHeaders)) {
    return { ok: false, error: "webhook_headers must be an object when provided" };
  }

  const invalidEvents = [];
  const events = [];
  if (Array.isArray(rawEvents)) {
    const seen = new Set();
    for (const rawEvent of rawEvents) {
      const event = sanitizeString(rawEvent, 64).toLowerCase();
      if (!event || seen.has(event)) {
        continue;
      }
      seen.add(event);
      if (WEBHOOK_EVENT_SET.has(event)) {
        events.push(event);
      } else {
        invalidEvents.push(event);
      }
    }
  }

  if (invalidEvents.length && strict) {
    return {
      ok: false,
      error: `webhook_events contains unsupported values: ${invalidEvents.join(", ")}`
    };
  }

  if (Array.isArray(rawEvents) && !events.length && rawEvents.length && strict) {
    return {
      ok: false,
      error: `webhook_events must include supported values: ${ALLOWED_WEBHOOK_EVENTS.join(", ")}`
    };
  }

  return {
    ok: true,
    webhook: {
      url,
      secret: sanitizeOptionalString(rawSecret, 512),
      events: events.length ? events : DEFAULT_WEBHOOK_EVENTS.slice(),
      headers: sanitizeWebhookHeaders(rawHeaders)
    }
  };
}

function resolveRunWebhookConfig(runRequest) {
  const source = isPlainObject(runRequest) ? runRequest : {};
  const metadata = isPlainObject(source.metadata) ? source.metadata : {};
  const metadataWebhook = isPlainObject(metadata.webhook) ? metadata.webhook : undefined;

  const normalized = normalizeWebhookConfig(
    {
      ...source,
      webhook: isPlainObject(source.webhook) ? source.webhook : metadataWebhook,
      webhook_url: source.webhook_url ?? source.webhookUrl ?? metadata.webhook_url ?? metadata.webhookUrl,
      webhook_secret:
        source.webhook_secret ?? source.webhookSecret ?? metadata.webhook_secret ?? metadata.webhookSecret,
      webhook_events:
        source.webhook_events ?? source.webhookEvents ?? metadata.webhook_events ?? metadata.webhookEvents,
      webhook_headers:
        source.webhook_headers ?? source.webhookHeaders ?? metadata.webhook_headers ?? metadata.webhookHeaders
    },
    { strict: false }
  );

  return normalized.ok ? normalized.webhook : null;
}

function validateRunRequest(body) {
  if (!isPlainObject(body)) {
    return { ok: false, error: "Invalid JSON body" };
  }

  const runId = sanitizeString(body.run_id || body.runId, 128);
  if (!runId) {
    return { ok: false, error: "run_id is required" };
  }

  const targetUrl = normalizeUrl(body.target_url || body.targetUrl || body.url);
  if (!targetUrl) {
    return { ok: false, error: "target_url must be a valid http or https URL" };
  }

  const requestedScopeMode = sanitizeString(body.scope_mode || body.scopeMode, 64).toLowerCase();
  const scopeMode = SCOPE_CONFIG[requestedScopeMode] ? requestedScopeMode : DEFAULT_SCOPE_MODE;
  if (requestedScopeMode && !SCOPE_CONFIG[requestedScopeMode]) {
    return {
      ok: false,
      error: `scope_mode must be one of ${Object.keys(SCOPE_CONFIG).join(", ")}`
    };
  }

  const scenarioList = sanitizeScenarioList(body.scenario_list || body.scenarioList);
  if (scopeMode === "feature_targeted" && !scenarioList.length) {
    return { ok: false, error: "scenario_list is required when scope_mode is feature_targeted" };
  }

  let credentials = null;
  if (body.credentials !== undefined && body.credentials !== null) {
    if (!isPlainObject(body.credentials)) {
      return { ok: false, error: "credentials must be an object when provided" };
    }

    const otpMode = sanitizeString(body.credentials.otp_mode || body.credentials.otpMode, 64).toLowerCase();
    const normalizedOtpMode = otpMode || "none";
    if (!OTP_MODE_SET.has(normalizedOtpMode)) {
      return {
        ok: false,
        error: `credentials.otp_mode must be one of ${ALLOWED_OTP_MODES.join(", ")}`
      };
    }

    const loginUrl = body.credentials.login_url || body.credentials.loginUrl;
    const normalizedLoginUrl = loginUrl ? normalizeUrl(loginUrl) : null;
    if (loginUrl && !normalizedLoginUrl) {
      return { ok: false, error: "credentials.login_url must be a valid http or https URL" };
    }

    credentials = {
      login_url: normalizedLoginUrl,
      username: sanitizeOptionalString(body.credentials.username, 320),
      password: sanitizeOptionalString(body.credentials.password, 320),
      otp_mode: normalizedOtpMode
    };
  }

  const model = sanitizeOptionalString(body.model, 128) || sanitizeOptionalString(body.agent_model, 128);
  const source = sanitizeString(body.source, 64) || DEFAULT_SOURCE;
  const brandPersona = sanitizeString(body.brand_persona || body.brandPersona, 500) || FALLBACK_PERSONA;
  const webhookConfig = normalizeWebhookConfig(
    {
      webhook: body.webhook,
      webhook_url: body.webhook_url || body.webhookUrl,
      webhook_secret: body.webhook_secret || body.webhookSecret,
      webhook_events: body.webhook_events || body.webhookEvents,
      webhook_headers: body.webhook_headers || body.webhookHeaders
    },
    { strict: true }
  );
  if (!webhookConfig.ok) {
    return { ok: false, error: webhookConfig.error };
  }

  return {
    ok: true,
    data: {
      run_id: runId,
      target_url: targetUrl,
      scope_mode: scopeMode,
      scenario_list: scenarioList,
      brand_persona: brandPersona,
      credentials,
      webhook: webhookConfig.webhook,
      source,
      metadata: sanitizeMetadata(body.metadata),
      dry_run: parseBoolean(body.dry_run || body.dryRun),
      model,
      received_at: new Date().toISOString(),
      scope: getScopeConfig(scopeMode)
    }
  };
}

function buildSystemPrompt(runRequest) {
  const scope = getScopeConfig(runRequest.scope_mode);
  const primaryGoal = buildPrimaryUserGoal(runRequest);

  return [
    "You are a senior QA tester acting as a realistic end-user.",
    `Adopt this exact user persona for behavior and emotional framing while exploring: ${runRequest.brand_persona}`,
    `Primary user goal: ${primaryGoal}`,
    "Your mission is to find usability friction, confusion, bugs, dead ends, and standout aha moments through real interaction.",
    "Authentication and onboarding are milestones, not the finish line.",
    "Do not stop after login, OTP, or landing on an onboarding screen. Continue until you either complete onboarding and exercise real product functionality, or you can clearly prove onboarding itself is blocking progress.",
    "Only treat a run as completed when you have attempted the actual in-product user goal. If you stop at onboarding or a gated setup step, the run should be partial, not completed.",
    "Do not invent findings. Every finding must be supported by concrete evidence gathered during the session.",
    'Finding titles must name the exact failed step and failure mode, for example "Generate presenter stalled" or "Auth submit button could not be activated". Never use generic titles like "Persona got blocked in the product" or "Run failed before the flow completed".',
    "Write the report in plain English for a non-technical reader. Avoid internal QA jargon like 'conversion surfaces', 'user journey', 'surface-level navigation', 'auth boundary', or 'exercised to validate'.",
    "When describing what happened, say exactly what the tester saw and did in everyday language, for example 'The tester reached the login page, filled the form, clicked Continue, and stayed on the same page.'",
    "Capture at least one screenshot evidence link for every finding. Include a video evidence link when the issue unfolds over time.",
    "When console logs or network events exist, include the most relevant exact error lines, failed requests, and status codes in evidence.console_logs / evidence.network_logs, and summarize the key ones in observed_behavior, current_state, or failure_reason.",
    "If you are uncertain, lower the confidence score and explain the uncertainty in observed behavior or fix hint.",
    "Include actionable fix hints and likely root-cause hypotheses, but do not claim certainty when you cannot verify implementation details.",
    `Use the selected scope mode as coverage guidance only: ${scope.label} (${scope.time_budget_minutes} minute intensity). Do not stop just because a step count or round count was reached.`,
    "Your structured output must contain JSON first and Markdown second. Emit no extra prose outside the exact markers below.",
    "BEGIN_JSON",
    "{...strict JSON report object...}",
    "END_JSON",
    "BEGIN_MARKDOWN",
    "# Developer-ready QA report",
    "END_MARKDOWN",
    "The JSON must include: schema_version, run_id, target, status, summary, findings[], tested_journeys[], evidence_gallery, recommendations[].",
    "Each finding must include: id, type, severity, title, expected_behavior, observed_behavior, emotional_reaction.primary, repro_steps, page, element, evidence.screenshots, fix_hint, confidence, diagnostic_details.",
    "diagnostic_details must include: page_loaded, current_url, current_state, last_successful_step, failure_reason, attempted_actions[].",
    "Each attempted_actions item must include: action, target, outcome, and should include url or note when available.",
    "Each tested_journeys item must describe a real flow you exercised, including what you tried, what happened, and evidence links.",
    "The evidence_gallery must summarize the best screenshots, videos, and session-level evidence captured across the entire run, not just issue-specific evidence.",
    "Recommendations must be concrete next steps for the product/developer team, even when there are few or zero hard findings.",
    `Allowed finding types: ${ALLOWED_FINDING_TYPES.join(", ")}.`,
    `Allowed severities: ${ALLOWED_SEVERITIES.join(", ")}.`,
    `Allowed emotional_reaction.primary values: ${ALLOWED_EMOTIONS.join(", ")}.`
  ].join("\n");
}

function buildTaskPrompt(runRequest) {
  const scope = getScopeConfig(runRequest.scope_mode);
  const credentials = runRequest.credentials;
  const metadata = isPlainObject(runRequest?.metadata) ? runRequest.metadata : {};
  const authPolicy = sanitizeString(metadata.auth_policy || metadata.authPolicy, 64).toLowerCase();
  const autoCreateAccount =
    !credentials &&
    !["public_only", "public-only", "disabled", "none", "off"].includes(authPolicy) &&
    (
      ["signup_if_needed", "sign_up_if_needed", "auto_signup", "auto-signup", "auto_create_account", "auto-create-account"].includes(authPolicy) ||
      parseBoolean(metadata.auto_create_account ?? metadata.autoCreateAccount) ||
      scope.mode === "feature_targeted" ||
      scope.mode === "deep_45m"
    );
  const primaryGoal = buildPrimaryUserGoal(runRequest);
  const scenarioText = runRequest.scenario_list.length
    ? runRequest.scenario_list.map((scenario, index) => `${index + 1}. ${scenario}`).join("\n")
    : "None provided. Prioritize the highest-value user journey.";
  const credentialText = credentials
    ? [
        `- Login URL: ${credentials.login_url || "Use the most obvious auth entry point."}`,
        `- Username: ${credentials.username || "Not provided"}`,
        `- Password: ${credentials.password || "Not provided"}`,
        `- OTP mode: ${credentials.otp_mode}`,
        "Attempt authenticated flows with provided credentials and reasonable alternate auth paths within the step budget. If blocked, capture evidence and continue testing any reachable paths."
      ].join("\n")
    : autoCreateAccount
      ? "No credentials were provided. If the product is gated, create a fresh test account with a generated identity, complete OTP/email verification when available, and continue into authenticated flows. If signup is blocked, capture the blocker clearly."
      : "No credentials were provided. Test only public flows and explicitly note untested authenticated areas in the report.";

  return [
    `Target URL: ${runRequest.target_url}`,
    `Run ID: ${runRequest.run_id}`,
    `Scope mode: ${scope.mode} (${scope.label})`,
    `Time budget: ${scope.time_budget_minutes} minutes`,
    `Coverage intensity: ${scope.label}`,
    `Primary goal: ${primaryGoal}`,
    "Coverage checklist:",
    ...scope.coverage_checklist.map((item, index) => `${index + 1}. ${item}`),
    "Scenario list:",
    scenarioText,
    "Login policy:",
    credentialText,
    "Execution phases:",
    "1. Recon: map nav, main CTAs, auth, pricing, contact, and conversion surfaces.",
    "2. Core journey traversal: test the primary acquisition or activation path.",
    "3. Friction and confusion probing: forms, empty states, validation, unclear copy, dead ends.",
    "4. Bug and stability pass: broken UI, failed transitions, client errors, inconsistent state.",
    "5. Aha moment capture: note any unexpectedly clear or trust-building moment.",
    "6. Goal verification: confirm whether the persona actually completed or was blocked from the intended job to be done.",
    "7. Report synthesis: create strict JSON then Markdown with evidence links.",
    "Delivery requirements:",
    "- Return one JSON object between BEGIN_JSON and END_JSON.",
    "- Return one Markdown report between BEGIN_MARKDOWN and END_MARKDOWN.",
    "- Every finding must include at least one screenshot URL in evidence.screenshots.",
    "- Do not report a problem unless diagnostic_details clearly states what page loaded, what action(s) were tried, what happened after each action, and why the flow is considered blocked or broken.",
    '- The finding title must name the exact broken thing, not a generic blocker label. Good: "Generate presenter stalled". Bad: "Persona got blocked in the product".',
    "- Write every finding, journey summary, and recommendation in plain English. If a normal person would not understand the sentence, rewrite it.",
    "- If console logs or network failures exist, include the most relevant exact lines and status codes in evidence.console_logs / evidence.network_logs and mention the key one in the finding narrative.",
    "- Always return a full QA packet, not just findings: include tested_journeys, evidence_gallery, and recommendations.",
    "- Include at least 2 tested_journeys when possible: for example navigation/recon and the primary conversion flow.",
    "- Even if there is only one finding, export a rich report with multiple evidence links, flow coverage, and next-step recommendations.",
    "- Use Browserbase-accessible asset URLs when available.",
    "- If there are zero findings, still return a valid report with findings as an empty array and explain coverage limits.",
    "- Reaching onboarding after auth does NOT count as goal completion. Either continue through onboarding into the product, or report that onboarding blocked meaningful product usage.",
    "- Stop only after you complete the coverage checklist or hit a hard blocker."
  ].join("\n");
}

function extractTextBetween(text, startMarker, endMarker) {
  const startIndex = text.indexOf(startMarker);
  if (startIndex === -1) {
    return null;
  }

  const fromStart = startIndex + startMarker.length;
  const endIndex = text.indexOf(endMarker, fromStart);
  if (endIndex === -1) {
    return null;
  }

  return text.slice(fromStart, endIndex).trim();
}

function extractAgentSections(rawText) {
  const text = typeof rawText === "string" ? rawText.trim() : "";
  let jsonText = extractTextBetween(text, "BEGIN_JSON", "END_JSON");
  let markdownText = extractTextBetween(text, "BEGIN_MARKDOWN", "END_MARKDOWN");

  if (!jsonText) {
    const jsonFenceMatch = text.match(/```json\s*([\s\S]*?)```/i);
    if (jsonFenceMatch) {
      jsonText = jsonFenceMatch[1].trim();
    }
  }

  if (!markdownText) {
    const markdownFenceMatch = text.match(/```markdown\s*([\s\S]*?)```/i);
    if (markdownFenceMatch) {
      markdownText = markdownFenceMatch[1].trim();
    }
  }

  let parsedJson = null;
  let parseError = null;
  if (jsonText) {
    const parsed = safeJsonParse(jsonText);
    if (parsed.ok && isPlainObject(parsed.value)) {
      parsedJson = parsed.value;
    } else {
      parseError = parsed.error || "JSON section is invalid";
    }
  }

  return {
    raw_text: text,
    json_text: jsonText,
    markdown_text: markdownText,
    parsed_json: parsedJson,
    parse_error: parseError
  };
}

function coerceStringArray(value, maxItems = 20, maxLength = 2048) {
  if (Array.isArray(value)) {
    return value
      .slice(0, maxItems)
      .map((item) => sanitizeString(item, maxLength))
      .filter(Boolean);
  }

  const single = sanitizeString(value, maxLength);
  if (!single) {
    return [];
  }

  return [single];
}

function normalizeFindingType(value) {
  const raw = sanitizeString(value, 64).toLowerCase();
  if (!raw) {
    return "confusion_point";
  }

  const aliases = {
    frustration: "frustration_point",
    friction: "frustration_point",
    frustrationpoint: "frustration_point",
    confusion: "confusion_point",
    confusionpoint: "confusion_point",
    aha: "aha_moment",
    ahamoment: "aha_moment",
    deadend: "dead_end",
    performance: "performance_issue",
    perf: "performance_issue",
    accessibility: "accessibility_issue",
    a11y: "accessibility_issue",
    copy: "copy_issue"
  };

  const mapped = aliases[raw] || raw;
  if (FINDING_TYPE_SET.has(mapped)) {
    return mapped;
  }

  return "confusion_point";
}

function normalizeSeverity(value) {
  const raw = sanitizeString(value, 32).toLowerCase();
  return SEVERITY_SET.has(raw) ? raw : "medium";
}

function normalizeConfidence(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, Number(value.toFixed(2))));
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return Math.max(0, Math.min(1, Number(numeric.toFixed(2))));
  }

  return 0.72;
}

function normalizeEmotionalReaction(value) {
  const reaction = isPlainObject(value) ? value : {};
  const rawPrimary = sanitizeString(
    readField(reaction, ["primary", "primary_emotion", "primaryEmotion"]),
    64
  ).toLowerCase();
  const primary = EMOTION_SET.has(rawPrimary) ? rawPrimary : "uncertainty";

  const intensityValue = readField(reaction, ["intensity"]);
  const numericIntensity = Number(intensityValue);
  const hasValidIntensity = Number.isFinite(numericIntensity) && numericIntensity >= 1 && numericIntensity <= 5;

  return {
    primary,
    intensity: hasValidIntensity ? Math.round(numericIntensity) : 3,
    signals: coerceStringArray(readField(reaction, ["signals"]), 10, 120)
  };
}

function fallbackScreenshotUrls(context) {
  const urls = [];
  if (Array.isArray(context?.artifacts?.local_screenshots)) {
    urls.push(...context.artifacts.local_screenshots);
  }
  if (Array.isArray(context?.artifacts?.captured_screenshots)) {
    urls.push(...context.artifacts.captured_screenshots);
  }
  if (context?.artifacts?.browserbase_debug_url) {
    urls.push(context.artifacts.browserbase_debug_url);
  }
  if (context?.artifacts?.browserbase_session_url) {
    urls.push(context.artifacts.browserbase_session_url);
  }
  return urls.filter(Boolean);
}

function isConcreteVideoEvidenceReference(value) {
  const raw = sanitizeString(value, 4096);
  if (!raw) {
    return false;
  }

  if (DATA_VIDEO_PATTERN.test(raw) || VIDEO_EVIDENCE_PATH_PATTERN.test(raw)) {
    return true;
  }

  if (!/^https?:\/\//i.test(raw)) {
    return false;
  }

  try {
    const parsed = new URL(raw);
    if (VIDEO_EVIDENCE_PATH_PATTERN.test(parsed.pathname)) {
      return true;
    }

    if (sanitizeString(parsed.searchParams.get("kind"), 32).toLowerCase() === "video") {
      return true;
    }

    const hint = sanitizeString(
      parsed.searchParams.get("format") || parsed.searchParams.get("type"),
      64
    ).toLowerCase();
    if (hint.includes("video")) {
      return true;
    }

    const path = sanitizeString(parsed.pathname, 2048).toLowerCase();
    if (path.includes("/artifacts/") && (path.includes("video") || path.includes("recording") || path.includes("clip"))) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

function fallbackVideoUrls(context) {
  const urls = [];
  if (context?.artifacts?.blocker_clip_url) {
    urls.push(context.artifacts.blocker_clip_url);
  }
  if (context?.artifacts?.local_video_url) {
    urls.push(context.artifacts.local_video_url);
  }
  if (context?.artifacts?.blocker_clip_path) {
    urls.push(context.artifacts.blocker_clip_path);
  }
  if (context?.artifacts?.local_video_path) {
    urls.push(context.artifacts.local_video_path);
  }
  return uniqueStringList(urls.filter((value) => isConcreteVideoEvidenceReference(value)), 6, 4096);
}

function hasConcreteFallbackProof(context) {
  const screenshots = uniqueStringList(
    [
      ...(Array.isArray(context?.artifacts?.local_screenshots) ? context.artifacts.local_screenshots : []),
      ...(Array.isArray(context?.artifacts?.captured_screenshots) ? context.artifacts.captured_screenshots : [])
    ],
    6,
    2000000
  );
  const videos = uniqueStringList(
    [
      context?.artifacts?.blocker_clip_url,
      context?.artifacts?.local_video_url,
      context?.artifacts?.blocker_clip_path,
      context?.artifacts?.local_video_path
    ].filter(Boolean),
    4,
    4096
  );
  return screenshots.length > 0 || videos.length > 0;
}

const RELEVANT_LOG_WINDOW_BEFORE_MS = 15000;
const RELEVANT_LOG_WINDOW_AFTER_MS = 30000;
const MAX_GALLERY_CONSOLE_LOGS = 120;
const MAX_GALLERY_NETWORK_LOGS = 180;
const MAX_FINDING_CONSOLE_LOGS = 10;
const MAX_FINDING_NETWORK_LOGS = 12;

function parseTimestampMs(value) {
  const raw = sanitizeString(value, 128);
  if (!raw) {
    return null;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.getTime();
}

function extractHost(value) {
  const normalized = normalizeUrl(value) || sanitizeOptionalString(value, 4096);
  if (!normalized) {
    return "";
  }
  try {
    return String(new URL(normalized).hostname || "").trim().toLowerCase();
  } catch {
    return "";
  }
}

function formatConsoleTimelineText(entry) {
  const ts = sanitizeString(entry?.ts, 128);
  const source = sanitizeString(entry?.source, 64).toLowerCase() || "console";
  const level = sanitizeString(entry?.level, 32).toLowerCase() || "log";
  const url = sanitizeOptionalString(entry?.url, 4096);
  const message = sanitizeString(entry?.message, 1200);
  if (!message) {
    return "";
  }
  const parts = [`[${ts || "unknown-time"}]`, `${source}.${level}`];
  if (url) {
    parts.push(`@ ${url}`);
  }
  parts.push(`:: ${message}`);
  return sanitizeString(parts.join(" "), 1600);
}

function formatNetworkTimelineText(entry) {
  const ts = sanitizeString(entry?.ts, 128);
  const phase = sanitizeString(entry?.phase, 32).toLowerCase() || "request";
  const method = sanitizeString(entry?.method, 16).toUpperCase() || "GET";
  const url = sanitizeString(entry?.url, 4096);
  if (!url) {
    return "";
  }
  const status = Number.isFinite(Number(entry?.status)) ? String(Math.round(Number(entry.status))) : "";
  const duration = Number.isFinite(Number(entry?.duration_ms))
    ? `${Math.max(0, Math.round(Number(entry.duration_ms)))}ms`
    : "";
  const resourceType = sanitizeString(entry?.resource_type, 64).toLowerCase();
  const error = sanitizeOptionalString(entry?.error, 1000);
  const suffixParts = [];
  if (status) {
    suffixParts.push(`status=${status}`);
  }
  if (error) {
    suffixParts.push(`error=${error}`);
  }
  if (duration) {
    suffixParts.push(`duration=${duration}`);
  }
  if (resourceType) {
    suffixParts.push(`type=${resourceType}`);
  }
  return sanitizeString(
    [`[${ts || "unknown-time"}]`, phase, method, url, suffixParts.length ? `:: ${suffixParts.join(" | ")}` : ""]
      .filter(Boolean)
      .join(" "),
    1800
  );
}

function normalizeConsoleTimelineEntry(value, fallbackSource = "console") {
  if (typeof value === "string") {
    const text = sanitizeString(value, 1600);
    if (!text) {
      return null;
    }
    const tsMatch = text.match(/^\[([^\]]+)\]/);
    const ts = tsMatch ? sanitizeString(tsMatch[1], 128) : "";
    return {
      ts: ts || null,
      tsMs: parseTimestampMs(ts),
      level: text.toLowerCase().includes("warning") ? "warning" : text.toLowerCase().includes("error") ? "error" : "log",
      message: text,
      url: "",
      source: fallbackSource,
      text
    };
  }

  if (!isPlainObject(value)) {
    return null;
  }

  const entry = {
    ts: toIsoTimestamp(value.ts || value.timestamp || value.time || new Date().toISOString()),
    level: sanitizeString(value.level || value.type, 32).toLowerCase() || "log",
    message:
      sanitizeString(value.message || value.text || value.error || value.summary, 1200) ||
      sanitizeString(value.raw, 1200),
    url: sanitizeOptionalString(value.url || value.page_url || value.pageUrl || value.href, 4096),
    source: sanitizeString(value.source, 64).toLowerCase() || fallbackSource
  };
  if (!entry.message) {
    return null;
  }
  const text = formatConsoleTimelineText(entry);
  if (!text) {
    return null;
  }
  return {
    ...entry,
    tsMs: parseTimestampMs(entry.ts),
    text
  };
}

function normalizeNetworkTimelineEntry(value, fallbackPhase = "request") {
  if (typeof value === "string") {
    const text = sanitizeString(value, 1800);
    if (!text) {
      return null;
    }
    const tsMatch = text.match(/^\[([^\]]+)\]/);
    const ts = tsMatch ? sanitizeString(tsMatch[1], 128) : "";
    return {
      ts: ts || null,
      tsMs: parseTimestampMs(ts),
      phase: fallbackPhase,
      method: "",
      url: "",
      status: null,
      duration_ms: null,
      resource_type: "",
      error: null,
      page_url: "",
      text
    };
  }

  if (!isPlainObject(value)) {
    return null;
  }

  const numericStatus = Number(value.status);
  const numericDuration = Number(value.duration_ms ?? value.durationMs);
  const entry = {
    ts: toIsoTimestamp(value.ts || value.timestamp || value.time || new Date().toISOString()),
    phase: sanitizeString(value.phase, 32).toLowerCase() || fallbackPhase,
    method: sanitizeString(value.method, 16).toUpperCase(),
    url: sanitizeOptionalString(value.url || value.href, 4096),
    status: Number.isFinite(numericStatus) && numericStatus > 0 ? Math.round(numericStatus) : null,
    duration_ms: Number.isFinite(numericDuration) && numericDuration >= 0 ? Math.round(numericDuration) : null,
    resource_type: sanitizeString(value.resource_type || value.resourceType, 64).toLowerCase(),
    error: sanitizeOptionalString(value.error || value.failure, 1000),
    page_url: sanitizeOptionalString(value.page_url || value.pageUrl, 4096)
  };
  if (!entry.url) {
    return null;
  }
  const text = formatNetworkTimelineText(entry);
  if (!text) {
    return null;
  }
  return {
    ...entry,
    tsMs: parseTimestampMs(entry.ts),
    text
  };
}

function dedupeTimelineEntries(entries, maxItems = 120) {
  const deduped = [];
  const seen = new Set();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || !entry.text) {
      continue;
    }
    const key = `${entry.ts || ""}|${entry.text}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(entry);
  }
  deduped.sort((left, right) => {
    const leftMs = Number.isFinite(left?.tsMs) ? left.tsMs : -1;
    const rightMs = Number.isFinite(right?.tsMs) ? right.tsMs : -1;
    return leftMs - rightMs;
  });
  if (deduped.length <= maxItems) {
    return deduped;
  }
  return deduped.slice(deduped.length - maxItems);
}

function collectConsoleTimelineEntries(context = {}) {
  const artifacts = isPlainObject(context.artifacts) ? context.artifacts : {};
  const runLog = Array.isArray(context.runLog) ? context.runLog : [];
  const entries = [];

  if (Array.isArray(artifacts.console_timeline)) {
    for (const item of artifacts.console_timeline) {
      const normalized = normalizeConsoleTimelineEntry(item, "console");
      if (normalized) {
        entries.push(normalized);
      }
    }
  }

  for (const item of Array.isArray(artifacts.console_errors) ? artifacts.console_errors : []) {
    const normalized = normalizeConsoleTimelineEntry(
      { ts: artifacts.completed_at || artifacts.started_at, level: "error", message: item, source: "console_error" },
      "console_error"
    );
    if (normalized) {
      entries.push(normalized);
    }
  }

  for (const item of Array.isArray(artifacts.page_errors) ? artifacts.page_errors : []) {
    const normalized = normalizeConsoleTimelineEntry(
      { ts: artifacts.completed_at || artifacts.started_at, level: "error", message: item, source: "pageerror" },
      "pageerror"
    );
    if (normalized) {
      entries.push(normalized);
    }
  }

  for (const entry of runLog) {
    if (sanitizeString(entry?.event, 128).toLowerCase() !== "browser_console") {
      continue;
    }
    const normalized = normalizeConsoleTimelineEntry(
      {
        ts: entry?.ts || entry?.timestamp,
        ...(getRunLogEntryData(entry) || {})
      },
      "console"
    );
    if (normalized) {
      entries.push(normalized);
    }
  }

  return dedupeTimelineEntries(entries, MAX_GALLERY_CONSOLE_LOGS);
}

function collectNetworkTimelineEntries(context = {}) {
  const artifacts = isPlainObject(context.artifacts) ? context.artifacts : {};
  const runLog = Array.isArray(context.runLog) ? context.runLog : [];
  const entries = [];

  if (Array.isArray(artifacts.network_timeline)) {
    for (const item of artifacts.network_timeline) {
      const normalized = normalizeNetworkTimelineEntry(item, "request");
      if (normalized) {
        entries.push(normalized);
      }
    }
  }

  for (const item of Array.isArray(artifacts.request_failures) ? artifacts.request_failures : []) {
    const normalized = normalizeNetworkTimelineEntry(
      {
        ts: artifacts.completed_at || artifacts.started_at,
        phase: "failed",
        method: item?.method,
        url: item?.url,
        error: item?.error
      },
      "failed"
    );
    if (normalized) {
      entries.push(normalized);
    }
  }

  for (const item of Array.isArray(artifacts.api_responses) ? artifacts.api_responses : []) {
    const normalized = normalizeNetworkTimelineEntry(
      {
        ts: artifacts.completed_at || artifacts.started_at,
        phase: "response",
        method: item?.method,
        url: item?.url,
        status: item?.status
      },
      "response"
    );
    if (normalized) {
      entries.push(normalized);
    }
  }

  for (const entry of runLog) {
    if (sanitizeString(entry?.event, 128).toLowerCase() !== "browser_network") {
      continue;
    }
    const normalized = normalizeNetworkTimelineEntry(
      {
        ts: entry?.ts || entry?.timestamp,
        ...(getRunLogEntryData(entry) || {})
      },
      "request"
    );
    if (normalized) {
      entries.push(normalized);
    }
  }

  return dedupeTimelineEntries(entries, MAX_GALLERY_NETWORK_LOGS);
}

function isImportantConsoleEntry(entry) {
  const level = sanitizeString(entry?.level, 32).toLowerCase();
  const source = sanitizeString(entry?.source, 64).toLowerCase();
  return level === "error" || level === "warning" || source === "pageerror";
}

function isImportantNetworkEntry(entry) {
  const phase = sanitizeString(entry?.phase, 32).toLowerCase();
  const status = Number(entry?.status);
  return phase === "failed" || (Number.isFinite(status) && status >= 400);
}

function selectRelevantTimelineEntries(entries, finding, options = {}) {
  const currentUrl =
    sanitizeOptionalString(finding?.diagnostic_details?.current_url, 4096) ||
    sanitizeOptionalString(finding?.page?.url, 4096) ||
    sanitizeOptionalString(options.targetUrl, 4096);
  const currentHost = extractHost(currentUrl);
  const attemptedActions = Array.isArray(finding?.diagnostic_details?.attempted_actions)
    ? finding.diagnostic_details.attempted_actions
    : [];
  const actionTimes = attemptedActions
    .map((attempt) => parseTimestampMs(attempt?.ts || attempt?.timestamp))
    .filter((value) => Number.isFinite(value));
  const beforeMs = Math.max(0, Number(options.beforeMs) || RELEVANT_LOG_WINDOW_BEFORE_MS);
  const afterMs = Math.max(0, Number(options.afterMs) || RELEVANT_LOG_WINDOW_AFTER_MS);
  const maxItems = Math.max(1, Number(options.maxItems) || 8);
  const importanceFilter = typeof options.importanceFilter === "function" ? options.importanceFilter : null;

  let candidates = Array.isArray(entries) ? entries.slice() : [];
  if (actionTimes.length) {
    const fromMs = Math.min(...actionTimes) - beforeMs;
    const toMs = Math.max(...actionTimes) + afterMs;
    candidates = candidates.filter((entry) => Number.isFinite(entry?.tsMs) && entry.tsMs >= fromMs && entry.tsMs <= toMs);
    if (currentHost) {
      const hostMatches = candidates.filter((entry) => {
        const entryHost = extractHost(entry?.url || entry?.page_url);
        return entryHost && entryHost === currentHost;
      });
      if (hostMatches.length) {
        candidates = hostMatches;
      }
    }
  } else if (currentHost) {
    const hostMatches = candidates.filter((entry) => {
      const entryHost = extractHost(entry?.url || entry?.page_url);
      return entryHost && entryHost === currentHost;
    });
    if (hostMatches.length) {
      candidates = hostMatches;
    }
  }

  const important = importanceFilter ? candidates.filter(importanceFilter) : [];
  const selected = important.length ? important : candidates;
  const sliced = selected.slice(selected.length - maxItems);
  return uniqueStringList(
    sliced.map((entry) => sanitizeString(entry?.text, 1800)).filter(Boolean),
    maxItems,
    1800
  );
}

function attachRelevantLogsToFindings(findings, context = {}) {
  if (!Array.isArray(findings) || !findings.length) {
    return [];
  }

  const consoleEntries = collectConsoleTimelineEntries(context);
  const networkEntries = collectNetworkTimelineEntries(context);

  return findings.map((finding) => {
    if (!isPlainObject(finding)) {
      return finding;
    }
    const existingEvidence = isPlainObject(finding.evidence) ? finding.evidence : {};
    const consoleLogs = uniqueStringList(
      [
        ...coerceStringArray(existingEvidence.console_logs, MAX_FINDING_CONSOLE_LOGS, 1800),
        ...selectRelevantTimelineEntries(consoleEntries, finding, {
          targetUrl: context.target_url,
          maxItems: MAX_FINDING_CONSOLE_LOGS,
          importanceFilter: isImportantConsoleEntry
        })
      ],
      MAX_FINDING_CONSOLE_LOGS,
      1800
    );
    const networkLogs = uniqueStringList(
      [
        ...coerceStringArray(existingEvidence.network_logs, MAX_FINDING_NETWORK_LOGS, 1800),
        ...selectRelevantTimelineEntries(networkEntries, finding, {
          targetUrl: context.target_url,
          maxItems: MAX_FINDING_NETWORK_LOGS,
          importanceFilter: isImportantNetworkEntry
        })
      ],
      MAX_FINDING_NETWORK_LOGS,
      1800
    );

    return {
      ...finding,
      evidence: {
        ...existingEvidence,
        console_logs: consoleLogs,
        network_logs: networkLogs
      }
    };
  });
}

function summarizeRelevantLogContextForFinding(finding) {
  const evidence = isPlainObject(finding?.evidence) ? finding.evidence : {};
  const consoleLogs = coerceStringArray(evidence.console_logs, 2, 600);
  const networkLogs = coerceStringArray(evidence.network_logs, 2, 600);
  const parts = [];
  if (consoleLogs.length) {
    parts.push(`Console: ${consoleLogs.join(" | ")}`);
  }
  if (networkLogs.length) {
    parts.push(`Network: ${networkLogs.join(" | ")}`);
  }
  return sanitizeString(parts.join(" | "), 1800);
}

function appendSpecificContextText(baseText, extraContext, maxLength) {
  const base = sanitizeString(baseText, maxLength);
  const extra = sanitizeString(extraContext, maxLength);
  if (!extra) {
    return base;
  }
  if (!base) {
    return extra;
  }
  if (base.includes(extra)) {
    return base;
  }
  const separator = /[.!?]$/.test(base) ? " " : ". ";
  return sanitizeString(`${base}${separator}Relevant logs: ${extra}`, maxLength);
}

function enrichFindingsWithRelevantLogContext(findings) {
  if (!Array.isArray(findings) || !findings.length) {
    return [];
  }

  return findings.map((finding) => {
    if (!isPlainObject(finding)) {
      return finding;
    }
    const logSummary = summarizeRelevantLogContextForFinding(finding);
    if (!logSummary) {
      return finding;
    }
    const diagnostics = isPlainObject(finding.diagnostic_details) ? finding.diagnostic_details : {};
    return {
      ...finding,
      observed_behavior: appendSpecificContextText(finding.observed_behavior, logSummary, 4000),
      diagnostic_details: {
        ...diagnostics,
        current_state: appendSpecificContextText(diagnostics.current_state, logSummary, 2000),
        failure_reason: appendSpecificContextText(diagnostics.failure_reason, logSummary, 2000)
      }
    };
  });
}

function buildTimelineTopicToken(value, fallback = "run_experience") {
  const token = sanitizeString(value, 160)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return token || fallback;
}

function isExperienceBlockerText(value) {
  const message = sanitizeString(value, 2000).toLowerCase();
  if (!message) {
    return false;
  }
  return /timed out|timeout|stalled|same waiting state|same state|never advanced|did not advance|did not progress|blocked|could not|failed|error|submit button|not progress|spinner/i.test(
    message
  );
}

function isExperienceFrictionText(value) {
  const message = sanitizeString(value, 2000).toLowerCase();
  if (!message) {
    return false;
  }
  return /wait|waiting|slow|retry|hesitat|loading|verification|otp|still visible|took longer/i.test(message);
}

function deriveExperienceTimelineTopic(finding) {
  const title = sanitizeString(finding?.title, 180).toLowerCase();
  const diagnostics = isPlainObject(finding?.diagnostic_details) ? finding.diagnostic_details : {};
  const message = sanitizeString(
    [title, diagnostics.failure_reason, diagnostics.current_state, finding?.observed_behavior].filter(Boolean).join(" "),
    3000
  ).toLowerCase();

  if (message.includes("generate presenter")) {
    return "presenter_generation_stall";
  }
  if (message.includes("otp") || message.includes("verification code")) {
    return "otp_gate";
  }
  if (message.includes("submit") && message.includes("auth")) {
    return "auth_submit";
  }
  if (message.includes("same state") || message.includes("same waiting state") || message.includes("loop")) {
    return "same_state_loop";
  }
  if (message.includes("render")) {
    return "render_progress";
  }
  return buildTimelineTopicToken(title || message, "run_experience");
}

function classifyExperienceAttemptLevel(attempt, finding, index, blockerStartIndex) {
  const action = sanitizeString(attempt?.action, 80).toLowerCase();
  const target = sanitizeString(attempt?.target, 500);
  const combined = sanitizeString([attempt?.outcome, attempt?.note, target].filter(Boolean).join(" "), 2000);
  const lowerCombined = combined.toLowerCase();

  if (index >= blockerStartIndex) {
    return "blocker";
  }
  if (
    action === "wait" ||
    action.startsWith("retry") ||
    lowerCombined.includes("repeated") ||
    isExperienceFrictionText(combined)
  ) {
    return "friction";
  }
  if (isExperienceBlockerText(combined) && index >= Math.max(0, blockerStartIndex - 1)) {
    return "blocker";
  }
  return "good";
}

function determineExperienceBlockerStartIndex(attempts, finding) {
  const diagnostics = isPlainObject(finding?.diagnostic_details) ? finding.diagnostic_details : {};
  const repeatedStateCount = Number(diagnostics?.repeated_state_count);
  const lastIndex = attempts.length - 1;
  if (lastIndex < 0) {
    return 0;
  }

  if (Number.isFinite(repeatedStateCount) && repeatedStateCount > 0) {
    let blockerStart = Math.max(0, attempts.length - Math.round(repeatedStateCount));
    for (let index = attempts.length - 1; index >= 0; index -= 1) {
      const action = sanitizeString(attempts[index]?.action, 80).toLowerCase();
      const combined = sanitizeString(
        [attempts[index]?.outcome, attempts[index]?.note, attempts[index]?.target].filter(Boolean).join(" "),
        1200
      ).toLowerCase();
      if (action === "wait" || action.startsWith("retry") || isExperienceBlockerText(combined) || isExperienceFrictionText(combined)) {
        blockerStart = index;
        continue;
      }
      break;
    }
    return blockerStart;
  }

  for (let index = 0; index < attempts.length; index += 1) {
    const action = sanitizeString(attempts[index]?.action, 80).toLowerCase();
    const combined = sanitizeString(
      [attempts[index]?.outcome, attempts[index]?.note, attempts[index]?.target].filter(Boolean).join(" "),
      1200
    );
    if (action === "fail" || action === "complete_run" || isExperienceBlockerText(combined)) {
      return index;
    }
  }

  return Math.max(0, attempts.length - 1);
}

function estimateExperienceAttemptTimings(attempts, baseAbsoluteMs = null, initialOffsetMs = 0) {
  const normalizedAttempts = Array.isArray(attempts) ? attempts : [];
  if (!normalizedAttempts.length) {
    return [];
  }

  const estimated = [];
  let cursor = Math.max(0, Number(initialOffsetMs) || 0);
  for (let index = 0; index < normalizedAttempts.length; index += 1) {
    const attempt = normalizedAttempts[index];
    const parsed = parseTimestampMs(attempt?.ts || attempt?.timestamp);
    const action = sanitizeString(attempt?.action, 80).toLowerCase();
    const stepDurationMs =
      action === "wait"
        ? EXPERIENCE_TIMELINE_DEFAULT_STEP_MS + 1000
        : action.startsWith("retry")
          ? EXPERIENCE_TIMELINE_DEFAULT_STEP_MS
          : Math.max(2500, EXPERIENCE_TIMELINE_DEFAULT_STEP_MS - 1000);
    let startMs = cursor;
    if (Number.isFinite(parsed) && Number.isFinite(baseAbsoluteMs)) {
      startMs = Math.max(0, parsed - baseAbsoluteMs);
      if (estimated.length) {
        startMs = Math.max(estimated[estimated.length - 1].start_ms + 1200, startMs);
      }
    }
    estimated.push({
      ...attempt,
      start_ms: startMs,
      end_ms: startMs + stepDurationMs
    });
    cursor = startMs + stepDurationMs;
  }

  for (let index = 0; index < estimated.length - 1; index += 1) {
    estimated[index].end_ms = Math.max(estimated[index].start_ms + 1200, estimated[index + 1].start_ms);
  }

  return estimated;
}

function buildExperienceSpanLogs(entries, startMs, endMs, maxItems = 4, importanceFilter = null) {
  const selected = (Array.isArray(entries) ? entries : []).filter((entry) => {
    if (!Number.isFinite(entry?.tsMs)) {
      return false;
    }
    if (entry.tsMs < startMs || entry.tsMs > endMs) {
      return false;
    }
    return typeof importanceFilter === "function" ? importanceFilter(entry) : true;
  });

  const source = selected.length ? selected : (Array.isArray(entries) ? entries : []).filter((entry) => Number.isFinite(entry?.tsMs) && entry.tsMs >= startMs - 5000 && entry.tsMs <= endMs + 5000);
  return uniqueStringList(
    source
      .slice(-maxItems)
      .map((entry) => sanitizeString(entry?.text, 1800))
      .filter(Boolean),
    maxItems,
    1800
  );
}

function buildExperienceSpanMetrics(attempts, finding, consoleLogs, networkLogs) {
  const waitCount = attempts.filter((attempt) => sanitizeString(attempt?.action, 80).toLowerCase() === "wait").length;
  const retryCount = attempts.filter((attempt) => sanitizeString(attempt?.action, 80).toLowerCase().startsWith("retry")).length;
  const repeatedStateCount = Number(finding?.diagnostic_details?.repeated_state_count);
  return {
    wait_count: waitCount,
    retry_count: retryCount,
    same_state_count: Number.isFinite(repeatedStateCount) && repeatedStateCount > 0 ? Math.round(repeatedStateCount) : 0,
    console_error_count: consoleLogs.length,
    failed_request_count: networkLogs.length
  };
}

function buildExperienceSpanSummary(level, finding, attempts, metrics) {
  const firstAttempt = attempts[0] || null;
  const target = sanitizeString(firstAttempt?.target, 180) || "the current flow";
  const diagnostics = isPlainObject(finding?.diagnostic_details) ? finding.diagnostic_details : {};
  if (level === "blocker") {
    return (
      sanitizeString(diagnostics.failure_reason, 400) ||
      sanitizeString(finding?.observed_behavior, 400) ||
      `The flow got stuck at ${target}.`
    );
  }
  if (level === "friction") {
    if (metrics.wait_count > 0) {
      return `The tester started waiting on ${target}, and the flow stopped feeling responsive.`;
    }
    if (metrics.retry_count > 0) {
      return `The tester had to retry ${target} before the flow continued.`;
    }
    return `The tester hit a rough patch around ${target} before the run moved on.`;
  }
  return `The tester made visible progress through ${target} without obvious issues.`;
}

function buildExperienceSpanLabel(level, finding, attempts, metrics) {
  const firstAttempt = attempts[0] || null;
  const target = sanitizeString(firstAttempt?.target, 160) || "Current step";
  if (level === "blocker") {
    return sanitizeString(finding?.title, 160) || "Blocked step";
  }
  if (level === "friction") {
    if (metrics.wait_count > 0) {
      return `Waiting on ${target}`;
    }
    if (metrics.retry_count > 0) {
      return `Retrying ${target}`;
    }
    return `Friction at ${target}`;
  }
  return `Progress through ${target}`;
}

function buildExperienceSpanScore(level, metrics) {
  if (level === "blocker") {
    return Math.max(80, Math.min(100, 82 + metrics.same_state_count * 2 + metrics.failed_request_count * 4 + metrics.console_error_count * 3));
  }
  if (level === "friction") {
    return Math.max(45, Math.min(79, 48 + metrics.wait_count * 4 + metrics.retry_count * 6));
  }
  return Math.max(10, Math.min(44, 18 + metrics.wait_count));
}

function buildExperienceSpanTags(level, finding, attempts, metrics) {
  const tags = new Set([level]);
  const text = sanitizeString(
    [finding?.title, finding?.observed_behavior, finding?.diagnostic_details?.failure_reason]
      .filter(Boolean)
      .join(" "),
    3000
  ).toLowerCase();
  if (metrics.wait_count > 0) tags.add("wait");
  if (metrics.retry_count > 0) tags.add("retry");
  if ((metrics.same_state_count || 0) > 0) tags.add("same_state");
  if (metrics.console_error_count > 0) tags.add("console");
  if (metrics.failed_request_count > 0) tags.add("network");
  if (text.includes("otp") || text.includes("verification")) tags.add("auth");
  if (text.includes("generate presenter") || text.includes("generation")) tags.add("generation");
  return Array.from(tags).slice(0, 8);
}

function buildExperienceTimelineSpansForFinding(finding, absoluteBaseMs, consoleEntries, networkEntries) {
  const diagnostics = isPlainObject(finding?.diagnostic_details) ? finding.diagnostic_details : {};
  const attemptedActions = Array.isArray(diagnostics.attempted_actions) ? diagnostics.attempted_actions : [];
  if (!attemptedActions.length) {
    return [];
  }

  const blockerStartIndex = determineExperienceBlockerStartIndex(attemptedActions, finding);
  const estimatedAttempts = estimateExperienceAttemptTimings(attemptedActions, absoluteBaseMs, 0);
  if (!estimatedAttempts.length) {
    return [];
  }

  const grouped = [];
  for (let index = 0; index < estimatedAttempts.length; index += 1) {
    const attempt = estimatedAttempts[index];
    const level = classifyExperienceAttemptLevel(attempt, finding, index, blockerStartIndex);
    const previous = grouped[grouped.length - 1];
    if (previous && previous.level === level) {
      previous.attempts.push(attempt);
      previous.end_ms = Math.max(previous.end_ms, attempt.end_ms);
      continue;
    }
    grouped.push({
      level,
      attempts: [attempt],
      start_ms: attempt.start_ms,
      end_ms: attempt.end_ms
    });
  }

  const topic = deriveExperienceTimelineTopic(finding);
  return grouped.slice(0, EXPERIENCE_TIMELINE_MAX_SPANS).map((group, index) => {
    const startMs = Math.max(0, Math.round(group.start_ms));
    const endMs = Math.max(startMs + 1200, Math.round(group.end_ms));
    const relevantConsoleLogs = buildExperienceSpanLogs(consoleEntries, absoluteBaseMs + startMs, absoluteBaseMs + endMs, 3, isImportantConsoleEntry);
    const relevantNetworkLogs = buildExperienceSpanLogs(networkEntries, absoluteBaseMs + startMs, absoluteBaseMs + endMs, 3, isImportantNetworkEntry);
    const metrics = buildExperienceSpanMetrics(group.attempts, finding, relevantConsoleLogs, relevantNetworkLogs);
    return {
      id: `span_${topic}_${index + 1}`,
      start_ms: startMs,
      end_ms: endMs,
      level: group.level,
      topic,
      score: buildExperienceSpanScore(group.level, metrics),
      confidence: group.level === "good" ? 0.72 : group.level === "friction" ? 0.81 : 0.93,
      label: buildExperienceSpanLabel(group.level, finding, group.attempts, metrics),
      summary: buildExperienceSpanSummary(group.level, finding, group.attempts, metrics),
      jump_ts_ms: startMs,
      page: {
        url:
          sanitizeOptionalString(group.attempts[group.attempts.length - 1]?.url, 4096) ||
          sanitizeOptionalString(diagnostics.current_url, 4096) ||
          sanitizeOptionalString(finding?.page?.url, 4096)
      },
      metrics,
      evidence: {
        action_steps: group.attempts.map((attempt) => Number.isFinite(Number(attempt?.step)) ? Math.round(Number(attempt.step)) : null).filter(Number.isFinite),
        console_logs: relevantConsoleLogs,
        network_logs: relevantNetworkLogs
      },
      linked_finding_ids: [sanitizeString(finding?.id, 128) || buildTimelineTopicToken(finding?.title, "finding")]
    };
  });
}

function mergeAdjacentExperienceTimelineSpans(spans) {
  const ordered = Array.isArray(spans) ? spans.slice().sort((left, right) => Number(left?.start_ms || 0) - Number(right?.start_ms || 0)) : [];
  const merged = [];
  for (const span of ordered) {
    if (!isPlainObject(span)) {
      continue;
    }
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.level === span.level &&
      previous.topic === span.topic &&
      sanitizeOptionalString(previous?.page?.url, 4096) === sanitizeOptionalString(span?.page?.url, 4096) &&
      Number(span.start_ms) - Number(previous.end_ms) <= 2000
    ) {
      previous.end_ms = Math.max(Number(previous.end_ms) || 0, Number(span.end_ms) || 0);
      previous.score = Math.max(Number(previous.score) || 0, Number(span.score) || 0);
      previous.confidence = Math.max(Number(previous.confidence) || 0, Number(span.confidence) || 0);
      previous.metrics = {
        wait_count: (previous.metrics?.wait_count || 0) + (span.metrics?.wait_count || 0),
        retry_count: (previous.metrics?.retry_count || 0) + (span.metrics?.retry_count || 0),
        same_state_count: Math.max(previous.metrics?.same_state_count || 0, span.metrics?.same_state_count || 0),
        console_error_count: (previous.metrics?.console_error_count || 0) + (span.metrics?.console_error_count || 0),
        failed_request_count: (previous.metrics?.failed_request_count || 0) + (span.metrics?.failed_request_count || 0)
      };
      previous.evidence = {
        action_steps: uniqueStringList(
          [...(previous.evidence?.action_steps || []), ...(span.evidence?.action_steps || [])].map((item) => String(item)),
          16,
          32
        ).map((item) => Number(item)).filter(Number.isFinite),
        console_logs: uniqueStringList([...(previous.evidence?.console_logs || []), ...(span.evidence?.console_logs || [])], 6, 1800),
        network_logs: uniqueStringList([...(previous.evidence?.network_logs || []), ...(span.evidence?.network_logs || [])], 6, 1800)
      };
      previous.linked_finding_ids = uniqueStringList(
        [...(previous.linked_finding_ids || []), ...(span.linked_finding_ids || [])],
        6,
        128
      );
      if (span.level !== "good") {
        previous.summary = span.summary;
        previous.label = span.label;
      }
      continue;
    }
    merged.push({
      ...span,
      evidence: {
        action_steps: Array.isArray(span?.evidence?.action_steps) ? span.evidence.action_steps.slice(0, 12) : [],
        console_logs: Array.isArray(span?.evidence?.console_logs) ? span.evidence.console_logs.slice(0, 6) : [],
        network_logs: Array.isArray(span?.evidence?.network_logs) ? span.evidence.network_logs.slice(0, 6) : []
      }
    });
  }
  return merged.slice(0, EXPERIENCE_TIMELINE_MAX_SPANS);
}

function buildExperienceTimeline(findings, context = {}, evidenceGallery = null) {
  const candidateFindings = Array.isArray(findings)
    ? findings.filter((finding) => {
        const attempts = Array.isArray(finding?.diagnostic_details?.attempted_actions)
          ? finding.diagnostic_details.attempted_actions
          : [];
        return isPlainObject(finding) && attempts.length > 0;
      })
    : [];
  const primaryFinding = candidateFindings.length ? candidateFindings[0] : null;
  if (!primaryFinding) {
    return null;
  }

  const allAbsoluteTimes = [];
  const diagnostics = isPlainObject(primaryFinding.diagnostic_details) ? primaryFinding.diagnostic_details : {};
  for (const attempt of Array.isArray(diagnostics.attempted_actions) ? diagnostics.attempted_actions : []) {
    const parsed = parseTimestampMs(attempt?.ts || attempt?.timestamp);
    if (Number.isFinite(parsed)) {
      allAbsoluteTimes.push(parsed);
    }
  }
  const runLog = Array.isArray(context.runLog) ? context.runLog : [];
  for (const entry of runLog) {
    const parsed = parseTimestampMs(entry?.ts || entry?.timestamp);
    if (Number.isFinite(parsed)) {
      allAbsoluteTimes.push(parsed);
    }
  }
  const artifactStarted = parseTimestampMs(context?.artifacts?.started_at);
  const artifactCompleted = parseTimestampMs(context?.artifacts?.completed_at);
  if (Number.isFinite(artifactStarted)) {
    allAbsoluteTimes.push(artifactStarted);
  }
  if (Number.isFinite(artifactCompleted)) {
    allAbsoluteTimes.push(artifactCompleted);
  }
  const baseAbsoluteMs = allAbsoluteTimes.length ? Math.min(...allAbsoluteTimes) : Date.now();
  const consoleEntries = collectConsoleTimelineEntries(context);
  const networkEntries = collectNetworkTimelineEntries(context);
  const spans = mergeAdjacentExperienceTimelineSpans(
    buildExperienceTimelineSpansForFinding(primaryFinding, baseAbsoluteMs, consoleEntries, networkEntries)
  );
  if (!spans.length) {
    return null;
  }

  const endCandidates = spans.map((span) => Number(span.end_ms) || 0);
  if (Number.isFinite(artifactCompleted) && Number.isFinite(baseAbsoluteMs)) {
    endCandidates.push(Math.max(0, artifactCompleted - baseAbsoluteMs));
  }
  const videoDurationMs = Math.max(EXPERIENCE_TIMELINE_MIN_DURATION_MS, ...endCandidates);
  const summary = {
    good_ms: 0,
    friction_ms: 0,
    blocker_ms: 0
  };
  for (const span of spans) {
    const duration = Math.max(0, Number(span.end_ms) - Number(span.start_ms));
    if (span.level === "blocker") {
      summary.blocker_ms += duration;
    } else if (span.level === "friction") {
      summary.friction_ms += duration;
    } else {
      summary.good_ms += duration;
    }
  }

  return {
    version: "1",
    source: "heuristic_attempted_actions_v1",
    base_window_ms: EXPERIENCE_TIMELINE_DEFAULT_STEP_MS,
    video_duration_ms: videoDurationMs,
    has_video: Array.isArray(evidenceGallery?.videos) ? evidenceGallery.videos.length > 0 : false,
    summary,
    spans
  };
}

function getRunLogEntryData(entry) {
  if (isPlainObject(entry?.data)) {
    return entry.data;
  }
  if (isPlainObject(entry?.details)) {
    return entry.details;
  }
  return {};
}

function humanizeRunLogEvent(eventName) {
  const event = sanitizeString(eventName, 128).toLowerCase();
  if (!event) {
    return "inspected the current screen";
  }
  const labels = {
    local_agent_started: "opened the target page",
    local_runner_started: "started the QA runner",
    browser_context_ready: "initialized the browser context",
    auth_flow_started: "opened the auth flow",
    auth_submit_retried: "retried the auth submit action",
    otp_gate_detected: "reached OTP verification",
    otp_code_submitted: "submitted the OTP code",
    otp_verified: "completed OTP verification",
    post_auth_detected: "entered the signed-in product",
    feature_exploration_completed: "finished the feature exploration step",
    auth_flow_failed: "failed during the auth flow",
    local_agent_failed: "failed during local agent execution",
    run_failed: "failed during worker execution"
  };
  if (labels[event]) {
    return labels[event];
  }
  return event.replaceAll("_", " ");
}

function inferRunLogUrl(details, targetUrl) {
  const candidates = [
    details.current_url,
    details.currentUrl,
    details.url,
    details.page_url,
    details.pageUrl,
    details.href,
    details.login_url,
    details.loginUrl,
    details.target_url,
    details.targetUrl,
    targetUrl
  ];

  for (const candidate of candidates) {
    const normalized = normalizeUrl(candidate);
    if (normalized) {
      return normalized;
    }
    const raw = sanitizeOptionalString(candidate, 4096);
    if (raw) {
      return raw;
    }
  }

  return null;
}

function buildDiagnosticAttemptsFromRunLog(runLog, context = {}) {
  const targetUrl = sanitizeOptionalString(context.targetUrl, 4096);
  const failureMessage = sanitizeString(context.failureMessage, 2000);
  const attempts = [];
  const entries = Array.isArray(runLog) ? runLog.slice(-12) : [];

  for (const entry of entries) {
    const event = sanitizeString(entry?.event, 128).toLowerCase();
    if (!event) {
      continue;
    }
    const details = getRunLogEntryData(entry);
    const url = inferRunLogUrl(details, targetUrl);
    let action = "inspect";
    let target = sanitizeString(details.target || details.label || details.element, 500) || "affected area";
    let outcome =
      sanitizeString(details.message || details.note || details.summary || details.reason, 500) ||
      humanizeRunLogEvent(event);

    if (event === "local_agent_started" || event === "local_runner_started") {
      action = "open";
      target = sanitizeString(details.target_url || details.targetUrl, 500) || targetUrl || "target page";
      outcome = "runner started";
    } else if (event === "browser_context_ready") {
      action = "launch_browser";
      target = "browser context";
      outcome = "browser context ready";
    } else if (event === "auth_flow_started") {
      action = "open_auth";
      target = sanitizeString(details.login_url || details.loginUrl, 500) || targetUrl || "auth flow";
      const extras = [
        sanitizeString(details.auth_requirement, 160) ? `auth=${sanitizeString(details.auth_requirement, 160)}` : "",
        sanitizeString(details.otp_mode, 64) ? `otp=${sanitizeString(details.otp_mode, 64)}` : "",
        details.auto_create_account === true ? "auto_create_account=true" : ""
      ].filter(Boolean);
      outcome = `auth flow started${extras.length ? ` (${extras.join(", ")})` : ""}`;
    } else if (event === "auth_surface_ready") {
      const mode = sanitizeString(details.mode, 64).toLowerCase();
      action = mode === "signup" ? "open_signup" : "open_login";
      target = mode === "signup" ? "sign-up form" : "login form";
      outcome = mode === "signup" ? "sign-up form opened" : "login form opened";
    } else if (event === "auth_form_filled") {
      const mode = sanitizeString(details.mode, 64).toLowerCase();
      action = "fill_auth";
      target = mode === "signup" ? "sign-up form" : "login form";
      outcome = mode === "signup" ? "sign-up form filled" : "login form filled";
    } else if (event === "auth_submit_attempted") {
      const mode = sanitizeString(details.mode, 64).toLowerCase();
      action = "submit_auth";
      target = mode === "signup" ? "sign-up form" : "login form";
      outcome = mode === "signup" ? "sign-up form submitted" : "login form submitted";
    } else if (event === "auth_submit_retried") {
      action = "retry_submit";
      target = "auth form";
      outcome =
        sanitizeString(details.method, 160) ? `submit retried via ${sanitizeString(details.method, 160)}` : "submit retried";
    } else if (event === "auth_flow_failed") {
      action = "auth_fail";
      target = "auth form";
      outcome = sanitizeString(details.message, 500) || failureMessage || "auth flow failed";
    } else if (event === "otp_gate_detected") {
      action = "wait_for_otp";
      target = "OTP verification";
      outcome = "OTP gate detected";
    } else if (event === "otp_verified") {
      action = "verify_otp";
      target = "OTP verification";
      outcome = "OTP verified";
    } else if (event === "post_auth_detected") {
      action = "enter_product";
      target = "signed-in product";
      outcome = "signed-in area reached";
    } else if (event === "local_agent_failed" || event === "run_failed") {
      action = "complete_run";
      target = targetUrl || "requested flow";
      outcome = sanitizeString(details.message, 500) || failureMessage || "run failed";
    }

    attempts.push(
      normalizeDiagnosticAttempt(
        {
          ts: entry?.ts || entry?.timestamp,
          action,
          target,
          outcome,
          url,
          note: sanitizeOptionalString(details.note || details.summary || details.reason, 1000)
        },
        attempts.length
      )
    );
  }

  if (!attempts.length && failureMessage) {
    attempts.push(
      normalizeDiagnosticAttempt(
        {
          action: "inspect",
          target: targetUrl || "requested flow",
          outcome: failureMessage,
          url: targetUrl
        },
        0
      )
    );
  }

  return attempts;
}

function isLowSignalLastSuccessfulStep(value) {
  const safeValue = sanitizeString(value, 1000).toLowerCase();
  if (!safeValue) {
    return true;
  }
  return [
    "reached the visible entry point for the requested flow.",
    "the tester reached the last visible screen before the blocker.",
    "reached the affected area.",
    "initialized the browser context.",
    "opened the target page.",
    "opened the first page."
  ].includes(safeValue);
}

function formatLastSuccessfulStepFromAttempt(attempt) {
  const action = sanitizeString(attempt?.action, 80).toLowerCase();
  const target = sanitizeString(attempt?.target, 240);
  const targetLower = target.toLowerCase();
  const cleanedTarget = cleanDiagnosticTarget(target);

  if (action === "open_signup" || (action === "open" && /signup|sign-up|create account/.test(targetLower))) {
    return "Opened the sign-up form.";
  }
  if (action === "open_login" || (action === "open" && /login|log in/.test(targetLower))) {
    return "Opened the login form.";
  }
  if (action === "open_auth") {
    return "Opened the auth flow.";
  }
  if (action === "fill_auth") {
    if (/signup|sign-up|create account/.test(targetLower)) {
      return "Filled the sign-up form.";
    }
    if (/login|log in/.test(targetLower)) {
      return "Filled the login form.";
    }
    return "Filled the auth form.";
  }
  if (action === "submit_auth") {
    if (/signup|sign-up|create account/.test(targetLower)) {
      return "Submitted the sign-up form.";
    }
    if (/login|log in/.test(targetLower)) {
      return "Submitted the login form.";
    }
    return "Submitted the auth form.";
  }
  if (action === "wait_for_otp") {
    return "Reached OTP verification.";
  }
  if (action === "submit_otp") {
    return "Submitted the OTP code.";
  }
  if (action === "verify_otp") {
    return "Completed OTP verification.";
  }
  if (action === "enter_product") {
    return "Entered the signed-in product.";
  }
  if (action === "open" && cleanedTarget) {
    return `Opened ${cleanedTarget}.`;
  }
  if (action === "click" && cleanedTarget) {
    return `Clicked "${cleanedTarget}".`;
  }
  if ((action === "type" || action === "enter") && cleanedTarget) {
    return `Filled ${cleanedTarget}.`;
  }
  return "";
}

function inferLastSuccessfulStepFromAttempts(attemptedActions) {
  const attempts = Array.isArray(attemptedActions) ? attemptedActions : [];
  const skipActions = new Set(["inspect", "complete_run", "done", "fail", "auth_fail", "switch_tab", "new_tab", "scroll"]);

  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    const attempt = attempts[index];
    const action = sanitizeString(attempt?.action, 80).toLowerCase();
    const outcome = sanitizeString(attempt?.outcome, 500).toLowerCase();
    if (!action || skipActions.has(action)) {
      continue;
    }
    if (outcome.includes("milestone screenshot captured")) {
      continue;
    }
    const formatted = formatLastSuccessfulStepFromAttempt(attempt);
    if (formatted) {
      return formatted;
    }
  }

  return "";
}

function inferLastSuccessfulStepFromRunLog(runLog, targetUrl) {
  const entries = Array.isArray(runLog) ? runLog : [];
  const inferredFromAttempts = inferLastSuccessfulStepFromAttempts(
    buildDiagnosticAttemptsFromRunLog(entries, { targetUrl })
  );
  if (inferredFromAttempts) {
    return inferredFromAttempts;
  }

  return "Reached the visible entry point for the requested flow.";
}

function normalizeFailureDiagnostics(value, context = {}) {
  const rawDetails = isPlainObject(value) ? value : {};
  const targetUrl = sanitizeOptionalString(context.targetUrl, 4096);
  const failureMessage = sanitizeString(context.failureMessage, 2000);
  const runLog = Array.isArray(context.runLog) ? context.runLog : [];
  const currentUrl =
    sanitizeOptionalString(readField(rawDetails, ["current_url", "currentUrl", "url"]), 4096) ||
    sanitizeOptionalString(context.currentUrl, 4096) ||
    inferRunLogUrl(getRunLogEntryData(runLog[runLog.length - 1]), targetUrl) ||
    targetUrl;
  const currentState =
    simplifyHumanNarrative(
      readField(rawDetails, ["current_state", "currentState", "page_state", "pageState", "state_summary", "stateSummary"]),
      2000
    ) ||
    simplifyHumanNarrative(context.currentState, 2000) ||
    simplifyHumanNarrative(failureMessage, 2000) ||
    "The run failed before the requested flow could continue.";
  const attemptedActions = Array.isArray(
    readField(rawDetails, ["attempted_actions", "attemptedActions", "actions", "action_log", "actionLog"])
  )
    ? readField(rawDetails, ["attempted_actions", "attemptedActions", "actions", "action_log", "actionLog"]).map(
        (attempt, index) => normalizeDiagnosticAttempt(attempt, index)
      )
    : buildDiagnosticAttemptsFromRunLog(runLog, { targetUrl, failureMessage });
  const explicitLastSuccessfulStep = simplifyHumanNarrative(
    readField(rawDetails, ["last_successful_step", "lastSuccessfulStep", "last_milestone", "lastMilestone"]),
    1000
  );
  const contextualLastSuccessfulStep = simplifyHumanNarrative(context.lastSuccessfulStep, 1000);
  const lastSuccessfulStep =
    (!isLowSignalLastSuccessfulStep(explicitLastSuccessfulStep) ? explicitLastSuccessfulStep : "") ||
    (!isLowSignalLastSuccessfulStep(contextualLastSuccessfulStep) ? contextualLastSuccessfulStep : "") ||
    simplifyHumanNarrative(inferLastSuccessfulStepFromAttempts(attemptedActions), 1000) ||
    simplifyHumanNarrative(inferLastSuccessfulStepFromRunLog(runLog, targetUrl), 1000);
  const failureReason =
    simplifyHumanNarrative(
      readField(rawDetails, ["failure_reason", "failureReason", "why_reported", "whyReported"]),
      2000
    ) ||
    simplifyHumanNarrative(failureMessage, 2000) ||
    currentState;
  const pageLoadedRaw = readField(rawDetails, ["page_loaded", "pageLoaded"]);
  const pageLoaded =
    typeof pageLoadedRaw === "boolean"
      ? pageLoadedRaw
      : typeof context.pageLoaded === "boolean"
        ? context.pageLoaded
        : Boolean(currentUrl);
  const repeatedStateCount = Number(
    readField(rawDetails, ["repeated_state_count", "repeatedStateCount", "same_state_count", "sameStateCount"])
  );

  return {
    page_loaded: pageLoaded,
    current_url: currentUrl,
    current_state: currentState,
    last_successful_step: lastSuccessfulStep,
    failure_reason: failureReason,
    attempted_actions: attemptedActions.length
      ? attemptedActions
      : buildDiagnosticAttemptsFromRunLog(runLog, { targetUrl, failureMessage }),
    ...(Number.isFinite(repeatedStateCount) && repeatedStateCount > 0
      ? { repeated_state_count: Math.round(repeatedStateCount) }
      : {})
  };
}

function normalizeEvidence(value, context) {
  const evidence = isPlainObject(value) ? value : {};
  const screenshots = coerceStringArray(
    readField(evidence, ["screenshots", "screenshot", "image_urls", "imageUrls"]),
    12,
    2000000
  );
  const videos = coerceStringArray(
    readField(evidence, ["videos", "video", "video_urls", "videoUrls"]),
    6,
    4096
  );
  const consoleLogs = coerceStringArray(
    readField(evidence, ["console_logs", "consoleLogs"]),
    12,
    1800
  );
  const networkLogs = coerceStringArray(
    readField(evidence, ["network_logs", "networkLogs"]),
    16,
    1800
  );
  const explicitVideos = coerceStringArray(
    readField(evidence, ["videos", "video", "video_urls", "videoUrls"]),
    6,
    4096
  ).filter((value) => isConcreteVideoEvidenceReference(value));

  const fallbackScreenshots = fallbackScreenshotUrls(context);
  const fallbackVideos = fallbackVideoUrls(context);
  const normalizedScreenshots = uniqueStringList(
    [...screenshots, ...fallbackScreenshots],
    12,
    2000000
  );
  const normalizedVideos = uniqueStringList([...explicitVideos, ...fallbackVideos], 6, 4096);
  const hasExplicitProof = screenshots.length > 0 || explicitVideos.length > 0;
  const hasAnyProof = normalizedScreenshots.length > 0 || normalizedVideos.length > 0;
  const hasExplicitVideoProof = explicitVideos.length > 0;
  const hasAnyVideoProof = normalizedVideos.length > 0;
  const proofState =
    hasExplicitVideoProof || screenshots.length > 0
      ? "verified"
      : hasAnyProof
        ? "fallback"
        : "missing";
  const proofSource =
    hasExplicitVideoProof
      ? "explicit_evidence"
      : hasAnyVideoProof
        ? "run_fallback"
        : hasExplicitProof
          ? "explicit_evidence"
          : hasAnyProof
            ? "run_fallback"
            : "none";

  return {
    screenshots: normalizedScreenshots,
    videos: normalizedVideos,
    console_logs: consoleLogs,
    network_logs: networkLogs,
    proof_state: proofState,
    proof_source: proofSource
  };
}

function mergeEvidenceVideos(evidence, fallbackVideos = []) {
  const normalizedEvidence = isPlainObject(evidence) ? evidence : {};
  const explicitScreenshots = coerceStringArray(normalizedEvidence.screenshots, 12, 2000000);
  const currentVideos = coerceStringArray(normalizedEvidence.videos, 6, 4096).filter((value) =>
    isConcreteVideoEvidenceReference(value)
  );
  const mergedVideos = uniqueStringList([...currentVideos, ...fallbackVideos], 6, 4096);
  const existingProofSource = sanitizeString(normalizedEvidence.proof_source, 64).toLowerCase();
  const existingProofState = sanitizeString(normalizedEvidence.proof_state, 32).toLowerCase();
  const hasAnyProof = explicitScreenshots.length > 0 || mergedVideos.length > 0;
  const resolvedProofSource = mergedVideos.length
    ? existingProofSource || "run_fallback"
    : explicitScreenshots.length && existingProofSource === "explicit_evidence"
      ? "explicit_evidence"
      : "none";
  const resolvedProofState = hasAnyProof
    ? ["verified", "fallback"].includes(existingProofState)
      ? existingProofState
      : resolvedProofSource === "explicit_evidence"
        ? "verified"
        : "fallback"
    : "missing";

  return {
    ...normalizedEvidence,
    screenshots: explicitScreenshots,
    videos: mergedVideos,
    proof_state: resolvedProofState,
    proof_source: resolvedProofSource
  };
}

function selectJourneyFallbackVideos(finding, journeys, reportVideoFallbacks) {
  const normalizedJourneys = Array.isArray(journeys) ? journeys : [];
  const findingJourneyId = sanitizeOptionalString(finding?.journey_id, 128);
  const findingJourneyName = sanitizeOptionalString(finding?.journey, 180);
  const pageUrl = sanitizeOptionalString(finding?.page?.url, 4096);

  for (const journey of normalizedJourneys) {
    if (!isPlainObject(journey)) {
      continue;
    }
    const journeyVideos = coerceStringArray(journey?.evidence?.videos, 6, 4096).filter((value) =>
      isConcreteVideoEvidenceReference(value)
    );
    if (!journeyVideos.length) {
      continue;
    }

    if (findingJourneyId && sanitizeOptionalString(journey?.id, 128) === findingJourneyId) {
      return uniqueStringList([...journeyVideos, ...reportVideoFallbacks], 6, 4096);
    }
    if (findingJourneyName && sanitizeOptionalString(journey?.name, 180) === findingJourneyName) {
      return uniqueStringList([...journeyVideos, ...reportVideoFallbacks], 6, 4096);
    }
    if (pageUrl && Array.isArray(journey?.pages) && journey.pages.includes(pageUrl)) {
      return uniqueStringList([...journeyVideos, ...reportVideoFallbacks], 6, 4096);
    }
  }

  return reportVideoFallbacks;
}

function ensureVideoProofCoverage(findings, journeys, evidenceGallery) {
  const reportVideoFallbacks = uniqueStringList(
    coerceStringArray(evidenceGallery?.videos, 10, 4096).filter((value) => isConcreteVideoEvidenceReference(value)),
    10,
    4096
  );
  const normalizedJourneys = (Array.isArray(journeys) ? journeys : []).map((journey) => {
    if (!isPlainObject(journey)) {
      return journey;
    }
    return {
      ...journey,
      evidence: mergeEvidenceVideos(journey.evidence, reportVideoFallbacks)
    };
  });
  const normalizedFindings = (Array.isArray(findings) ? findings : []).map((finding) => {
    if (!isPlainObject(finding)) {
      return finding;
    }
    return {
      ...finding,
      evidence: mergeEvidenceVideos(
        finding.evidence,
        selectJourneyFallbackVideos(finding, normalizedJourneys, reportVideoFallbacks)
      )
    };
  });

  return {
    findings: normalizedFindings,
    journeys: normalizedJourneys
  };
}

function normalizePage(value, context) {
  const page = isPlainObject(value) ? value : {};
  const url =
    normalizeUrl(readField(page, ["url"])) ||
    normalizeUrl(readField(page, ["href"])) ||
    context.target_url;

  let route = sanitizeString(readField(page, ["route", "path"]), 1024);
  if (!route && url) {
    try {
      route = new URL(url).pathname || "/";
    } catch {
      route = "";
    }
  }

  return {
    name: sanitizeOptionalString(readField(page, ["name", "title"]), 160),
    url,
    route: route || null
  };
}

function normalizeElement(value) {
  const element = isPlainObject(value) ? value : {};

  return {
    selector: sanitizeOptionalString(readField(element, ["selector", "css"]), 500),
    text: sanitizeOptionalString(readField(element, ["text", "label", "copy"]), 500),
    role: sanitizeOptionalString(readField(element, ["role"]), 100)
  };
}

function normalizeDiagnosticAttempt(value, index = 0) {
  const rawAttempt = isPlainObject(value) ? value : {};
  const stepValue = Number(readField(rawAttempt, ["step", "round", "index", "order"]));
  const step = Number.isFinite(stepValue) && stepValue > 0 ? Math.round(stepValue) : index + 1;
  const action =
    sanitizeString(readField(rawAttempt, ["action", "type", "verb"]), 80) ||
    "inspect";
  const target =
    sanitizeString(readField(rawAttempt, ["target", "label", "element", "cta"]), 500) ||
    "affected area";
  const outcome =
    sanitizeString(readField(rawAttempt, ["outcome", "result", "status"]), 500) ||
    "state observed";

  return {
    step,
    action,
    target,
    outcome,
    ts: sanitizeOptionalString(readField(rawAttempt, ["ts", "timestamp", "time", "at"]), 128),
    url: sanitizeOptionalString(readField(rawAttempt, ["url", "page_url", "pageUrl", "href"]), 4096),
    note: sanitizeOptionalString(readField(rawAttempt, ["note", "details", "summary", "reason"]), 1000)
  };
}

function normalizeDiagnosticDetails(value, context = {}) {
  const rawDetails = isPlainObject(value) ? value : {};
  const reproSteps = Array.isArray(context.reproSteps) ? context.reproSteps : [];
  const page = isPlainObject(context.page) ? context.page : {};
  const element = isPlainObject(context.element) ? context.element : {};
  const title = sanitizeString(context.title, 180);
  const observedBehavior = sanitizeString(context.observedBehavior, 4000);
  const targetUrl = sanitizeOptionalString(context.targetUrl, 4096);
  const currentUrl =
    sanitizeOptionalString(readField(rawDetails, ["current_url", "currentUrl", "url"]), 4096) ||
    sanitizeOptionalString(page.url, 4096) ||
    targetUrl;
  const currentState =
    simplifyHumanNarrative(
      readField(rawDetails, ["current_state", "currentState", "page_state", "pageState", "state_summary", "stateSummary"]),
      2000
    ) ||
    simplifyHumanNarrative(observedBehavior, 2000) ||
    "The affected screen state was captured in this finding.";
  const rawAttempts = readField(rawDetails, ["attempted_actions", "attemptedActions", "actions", "action_log", "actionLog"]);
  let attemptedActions = Array.isArray(rawAttempts)
    ? rawAttempts.map((attempt, index) => normalizeDiagnosticAttempt(attempt, index))
    : [];
  const explicitLastSuccessfulStep = simplifyHumanNarrative(
    readField(rawDetails, ["last_successful_step", "lastSuccessfulStep", "last_milestone", "lastMilestone"]),
    1000
  );
  const lastSuccessfulStep =
    (!isLowSignalLastSuccessfulStep(explicitLastSuccessfulStep) ? explicitLastSuccessfulStep : "") ||
    simplifyHumanNarrative(inferLastSuccessfulStepFromAttempts(attemptedActions), 1000) ||
    simplifyHumanNarrative(reproSteps[0], 1000) ||
    "Reached the affected area.";
  const failureReason =
    simplifyHumanNarrative(
      readField(rawDetails, ["failure_reason", "failureReason", "why_reported", "whyReported"]),
      2000
    ) ||
    simplifyHumanNarrative(observedBehavior, 2000) ||
    currentState;
  if (!attemptedActions.length) {
    attemptedActions = [
      normalizeDiagnosticAttempt(
        {
          step: 1,
          action: "inspect",
          target:
            sanitizeString(element.text, 500) ||
            sanitizeString(page.name, 160) ||
            title ||
            currentUrl ||
            "affected area",
          outcome: failureReason,
          url: currentUrl,
          note: sanitizeOptionalString(reproSteps[0], 1000)
        },
        0
      )
    ];
  }

  const pageLoadedRaw = readField(rawDetails, ["page_loaded", "pageLoaded"]);
  const pageLoaded =
    typeof pageLoadedRaw === "boolean"
      ? pageLoadedRaw
      : pageLoadedRaw === "true" || pageLoadedRaw === "1"
        ? true
        : pageLoadedRaw === "false" || pageLoadedRaw === "0"
          ? false
          : Boolean(currentUrl);
  const repeatedStateCount = Number(
    readField(rawDetails, ["repeated_state_count", "repeatedStateCount", "same_state_count", "sameStateCount"])
  );

  return {
    page_loaded: pageLoaded,
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

function validateFindingDiagnosticDetails(value, prefix = "finding", options = {}) {
  const safePrefix = sanitizeString(prefix, 200) || "finding";
  if (!isPlainObject(value)) {
    return { ok: false, error: `${safePrefix}.diagnostic_details is required` };
  }

  if (typeof value.page_loaded !== "boolean") {
    return { ok: false, error: `${safePrefix}.diagnostic_details.page_loaded must be true or false` };
  }

  if (!sanitizeString(value.current_url, 4096) && !sanitizeString(options.pageUrl, 4096)) {
    return { ok: false, error: `${safePrefix}.diagnostic_details.current_url is required` };
  }

  if (!sanitizeString(value.current_state, 2000)) {
    return { ok: false, error: `${safePrefix}.diagnostic_details.current_state is required` };
  }

  if (!sanitizeString(value.last_successful_step, 1000)) {
    return { ok: false, error: `${safePrefix}.diagnostic_details.last_successful_step is required` };
  }

  if (!sanitizeString(value.failure_reason, 2000)) {
    return { ok: false, error: `${safePrefix}.diagnostic_details.failure_reason is required` };
  }

  if (!Array.isArray(value.attempted_actions) || !value.attempted_actions.length) {
    return { ok: false, error: `${safePrefix}.diagnostic_details.attempted_actions must contain at least one action` };
  }

  for (let actionIndex = 0; actionIndex < value.attempted_actions.length; actionIndex += 1) {
    const action = value.attempted_actions[actionIndex];
    if (!isPlainObject(action)) {
      return {
        ok: false,
        error: `${safePrefix}.diagnostic_details.attempted_actions[${actionIndex}] must be an object`
      };
    }
    if (!sanitizeString(action.action, 80)) {
      return {
        ok: false,
        error: `${safePrefix}.diagnostic_details.attempted_actions[${actionIndex}].action is required`
      };
    }
    if (!sanitizeString(action.target, 500)) {
      return {
        ok: false,
        error: `${safePrefix}.diagnostic_details.attempted_actions[${actionIndex}].target is required`
      };
    }
    if (!sanitizeString(action.outcome, 500)) {
      return {
        ok: false,
        error: `${safePrefix}.diagnostic_details.attempted_actions[${actionIndex}].outcome is required`
      };
    }
  }

  return { ok: true };
}

function titleFromType(type, index) {
  const label = type.replace(/_/g, " ");
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} ${index + 1}`;
}

const GENERIC_FINDING_TITLE_PATTERNS = [
  /^persona got blocked in the product$/i,
  /^vision-only run blocked$/i,
  /^run failed before the flow completed$/i,
  /^the run failed before the requested flow completed$/i,
  /^the auth flow stalled before product access$/i,
  /^blocked$/i,
  /^problem$/i,
  /^issue$/i,
  /^untitled finding$/i,
  /^finding \d+$/i,
  /^dead end \d+$/i,
  /^confusion point \d+$/i
];

function trimTitlePunctuation(value) {
  return sanitizeString(value, 180).replace(/[\s.:;,-]+$/g, "").trim();
}

function sentenceCaseTitle(value) {
  const safeValue = trimTitlePunctuation(value);
  if (!safeValue) {
    return "";
  }
  return safeValue.charAt(0).toUpperCase() + safeValue.slice(1);
}

function isGenericFindingTitle(title) {
  const safeTitle = trimTitlePunctuation(title);
  if (!safeTitle) {
    return true;
  }
  if (GENERIC_FINDING_TITLE_PATTERNS.some((pattern) => pattern.test(safeTitle))) {
    return true;
  }
  const normalized = safeTitle.toLowerCase();
  if (normalized.includes("blocked in the product")) {
    return true;
  }
  if (normalized.startsWith("persona ") && normalized.includes("blocked")) {
    return true;
  }
  return false;
}

function extractQuotedTitleSegment(value) {
  const safeValue = sanitizeString(value, 1000);
  if (!safeValue) {
    return "";
  }
  const match = safeValue.match(/"([^"]+)"/);
  return match ? sanitizeString(match[1], 240) : "";
}

function cleanDiagnosticTarget(value) {
  let safeValue = sanitizeString(value, 240);
  if (!safeValue) {
    return "";
  }
  const quoted = extractQuotedTitleSegment(safeValue);
  if (quoted) {
    safeValue = quoted;
  }
  safeValue = safeValue
    .replace(/^(click(?:ed)?|tap(?:ped)?|press(?:ed)?|type(?:d)?|open(?:ed)?|submit(?:ted)?|enter(?:ed)?)\s+/i, "")
    .replace(/\b(button|cta|link|tab|field|input box|input|textbox|text area|textarea|modal|popup|dialog|screen|page)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^the\s+/i, "")
    .trim();

  const normalized = safeValue.toLowerCase();
  if (
    !safeValue ||
    [
      "affected area",
      "current screen",
      "requested flow",
      "signed-in product",
      "auth form",
      "browser context",
      "target page"
    ].includes(normalized)
  ) {
    return "";
  }

  return sentenceCaseTitle(safeValue);
}

function findSpecificFailureTarget(finding) {
  const diagnostics = isPlainObject(finding?.diagnostic_details) ? finding.diagnostic_details : {};
  const attemptedActions = Array.isArray(diagnostics.attempted_actions) ? diagnostics.attempted_actions : [];

  for (let index = attemptedActions.length - 1; index >= 0; index -= 1) {
    const attempt = attemptedActions[index];
    const action = sanitizeString(attempt?.action, 80).toLowerCase();
    if (["wait", "inspect", "done", "fail", "scroll", "switch_tab", "new_tab"].includes(action)) {
      continue;
    }
    if (
      isLikelyRecoveryStepText(attempt?.target) ||
      isLikelyRecoveryStepText(attempt?.outcome) ||
      isLikelyRecoveryStepText(attempt?.note)
    ) {
      continue;
    }
    const cleanedTarget = cleanDiagnosticTarget(attempt?.target);
    if (cleanedTarget) {
      return cleanedTarget;
    }
  }

  const milestoneTarget = cleanDiagnosticTarget(diagnostics.last_successful_step);
  if (milestoneTarget && !isLikelyRecoveryStepText(milestoneTarget) && !isLikelyRecoveryStepText(diagnostics.last_successful_step)) {
    return milestoneTarget;
  }

  return cleanDiagnosticTarget(finding?.element?.text || finding?.element?.label);
}

function buildSpecificTitleFromFailure(target, failureReason, currentState, observedBehavior) {
  const detail =
    sanitizeString(failureReason, 2000) || sanitizeString(currentState, 2000) || sanitizeString(observedBehavior, 2000);
  const detailLower = detail.toLowerCase();
  const stateLower = sanitizeString(currentState, 2000).toLowerCase();
  const signupBouncedToLogin =
    /sent the tester back to the login screen right after the sign-up form was submitted/.test(detailLower) ||
    /filled the sign-up form, clicked sign up, and got sent back to the login page instead of entering the product/.test(
      detailLower
    );

  if (
    /auth submit button could not be activated/.test(detailLower) ||
    /submit button could not be activated/.test(detailLower)
  ) {
    return "Auth submit button could not be activated";
  }
  if (signupBouncedToLogin) {
    return "Sign-up returned to the login screen";
  }
  if (
    /sign-up form never opened|site stayed on the login form instead of switching to sign-up|login form instead of switching to sign-up/.test(
      detailLower
    ) ||
    ((/log in|login/.test(stateLower) && /sign up|register|create account/.test(stateLower)) && /need an account/.test(stateLower))
  ) {
    return "Sign-up never opened";
  }
  if (/presenter generation/.test(detailLower)) {
    return /timed out/.test(detailLower) ? "Presenter generation timed out" : "Presenter generation stalled";
  }
  if (
    /(verification code|otp)/.test(detailLower) &&
    /(required|unavailable|not available|missing|could not fetch|not provided)/.test(detailLower)
  ) {
    return "Verification code was required but unavailable";
  }
  if (/site could not be opened|navigation failed|dns|net::|timeout loading/.test(detailLower)) {
    return "Site entry failed to load";
  }
  if (/did not resolve to an authenticated surface|kept showing the same login screen/.test(detailLower)) {
    if ((/log in|login/.test(stateLower) && /sign up|register|create account/.test(stateLower)) || /need an account/.test(stateLower)) {
      return "Sign-up never left the login screen";
    }
    if (/log in|login/.test(stateLower)) {
      return "Login stayed on the same screen";
    }
    if (/sign up|register|create account/.test(stateLower)) {
      return "Sign-up stayed on the same screen";
    }
    return "Login or sign-up did not finish";
  }

  if (target) {
    if (/timed out|stalled|stuck|same waiting state|never advanced|did not advance|did not progress|spinner|loading/.test(detailLower)) {
      return `${target} stalled`;
    }
    if (/could not be activated|not activated/.test(detailLower)) {
      return `${target} could not be activated`;
    }
    if (/disabled/.test(detailLower)) {
      return `${target} stayed disabled`;
    }
    if (/not found|could not find|missing/.test(detailLower)) {
      return `${target} was not found`;
    }
    if (/did nothing|no state change|same visible state/.test(detailLower)) {
      return `${target} did not advance the flow`;
    }
    if (/(required|must enter|needs)/.test(detailLower) && /(code|otp|email|password|authenticator)/.test(detailLower)) {
      return `${target} was required to continue`;
    }
    if (/failed/.test(detailLower)) {
      return `${target} failed`;
    }
  }

  if (/(verification code|otp)/.test(detailLower)) {
    return "Verification code entry blocked the flow";
  }
  if (/timed out|stalled|same waiting state|never advanced|did not progress/.test(detailLower)) {
    return "Flow stalled before completion";
  }

  const conciseDetail = sentenceCaseTitle(detail);
  if (conciseDetail && conciseDetail.length <= 120) {
    return conciseDetail;
  }
  return "";
}

function deriveSpecificFindingTitle(finding, fallbackTitle = "") {
  const currentTitle = trimTitlePunctuation(fallbackTitle || finding?.title);
  if (currentTitle && !isGenericFindingTitle(currentTitle)) {
    return currentTitle;
  }

  const diagnostics = isPlainObject(finding?.diagnostic_details) ? finding.diagnostic_details : {};
  const target = findSpecificFailureTarget(finding);
  const specificTitle = buildSpecificTitleFromFailure(
    target,
    diagnostics.failure_reason,
    diagnostics.current_state,
    finding?.observed_behavior
  );

  return specificTitle || currentTitle;
}

function normalizeFinding(finding, index, context = {}) {
  const rawFinding = isPlainObject(finding) ? finding : {};
  const type = normalizeFindingType(readField(rawFinding, ["type", "classification", "category"]));
  const page = normalizePage(readField(rawFinding, ["page"]), context);

  const expectedBehavior =
    simplifyHumanNarrative(readField(rawFinding, ["expected_behavior", "expectedBehavior"]), 4000) ||
    "The user should be able to complete this step smoothly and understand the next action.";
  const observedBehavior =
    simplifyHumanNarrative(readField(rawFinding, ["observed_behavior", "observedBehavior"]), 4000) ||
    "The observed behavior was not fully captured by the agent output.";

  const normalized = {
    id: sanitizeString(readField(rawFinding, ["id", "finding_id", "findingId"]), 128) || `finding_${index + 1}`,
    type,
    severity: normalizeSeverity(readField(rawFinding, ["severity", "priority"])),
    title: sanitizeString(readField(rawFinding, ["title", "headline"]), 180) || titleFromType(type, index),
    journey: sanitizeOptionalString(
      readField(rawFinding, ["journey", "journey_name", "journeyName", "flow", "flow_name", "flowName"]),
      180
    ),
    journey_id: sanitizeOptionalString(
      readField(rawFinding, ["journey_id", "journeyId", "flow_id", "flowId"]),
      128
    ),
    expected_behavior: expectedBehavior,
    observed_behavior: observedBehavior,
    emotional_reaction: normalizeEmotionalReaction(
      readField(rawFinding, ["emotional_reaction", "emotionalReaction"])
    ),
    repro_steps: coerceStringArray(
      readField(rawFinding, ["repro_steps", "reproSteps", "steps"]),
      12,
      1000
    ),
    page,
    element: normalizeElement(readField(rawFinding, ["element"])),
    evidence: normalizeEvidence(readField(rawFinding, ["evidence", "artifacts"]), {
      artifacts: context.artifacts,
      target_url: page.url || context.target_url
    }),
    fix_hint:
      simplifyHumanNarrative(
        readField(rawFinding, ["fix_hint", "fixHint", "suggested_fix", "suggestedFix"]),
        4000
      ) ||
      "Review the impacted UI state, copy, and event handling around the cited element. Reproduce the issue manually and patch the underlying UX or logic gap.",
    confidence: normalizeConfidence(readField(rawFinding, ["confidence", "certainty"])),
    tags: coerceStringArray(readField(rawFinding, ["tags"]), 10, 120)
  };

  if (!normalized.repro_steps.length && normalized.page.url) {
    normalized.repro_steps = [
      `Open ${normalized.page.url}.`,
      "Follow the most obvious path to the impacted area.",
      "Observe the behavior described above and compare it to the expected outcome."
    ];
  }

  normalized.diagnostic_details = normalizeDiagnosticDetails(
    readField(rawFinding, ["diagnostic_details", "diagnosticDetails", "problem_details", "problemDetails"]),
    {
      title: normalized.title,
      observedBehavior: normalized.observed_behavior,
      reproSteps: normalized.repro_steps,
      page: normalized.page,
      element: normalized.element,
      targetUrl: context.target_url
    }
  );
  normalized.title = deriveSpecificFindingTitle(normalized, normalized.title) || titleFromType(type, index);

  return normalized;
}

function uniqueStringList(values, maxItems = 20, maxLength = 4096) {
  const normalized = [];
  const seen = new Set();

  for (const value of values || []) {
    const item = sanitizeString(value, maxLength);
    if (!item || seen.has(item)) {
      continue;
    }
    seen.add(item);
    normalized.push(item);
    if (normalized.length >= maxItems) {
      break;
    }
  }

  return normalized;
}

function normalizeJourney(journey, index, context = {}) {
  const rawJourney = isPlainObject(journey) ? journey : {};
  const evidence = normalizeEvidence(readField(rawJourney, ["evidence", "artifacts"]), context);
  const pages = uniqueStringList(
    coerceStringArray(readField(rawJourney, ["pages", "page_urls", "pageUrls"]), 10, 4096),
    10,
    4096
  );
  const steps = coerceStringArray(readField(rawJourney, ["steps", "journey_steps", "journeySteps"]), 12, 1000);
  const stepVideoClips = normalizeJourneyStepClips(
    readField(rawJourney, ["step_video_clips", "stepVideoClips"]),
    context
  );
  const rawStatus = sanitizeString(readField(rawJourney, ["status", "outcome"]), 32).toLowerCase();
  const status = ["completed", "partial", "blocked"].includes(rawStatus) ? rawStatus : "completed";

  return {
    id: sanitizeString(readField(rawJourney, ["id", "journey_id", "journeyId"]), 128) || `journey_${index + 1}`,
    name:
      sanitizeString(readField(rawJourney, ["name", "title"]), 180) ||
      `Journey ${index + 1}`,
    status,
    summary:
      simplifyHumanNarrative(readField(rawJourney, ["summary", "description"]), 4000) ||
      "The flow was exercised during this QA run.",
    steps: steps.map((step) => simplifyHumanNarrative(step, 1000)).filter(Boolean),
    ...(stepVideoClips.length ? { step_video_clips: stepVideoClips } : {}),
    pages,
    evidence,
    observations: coerceStringArray(readField(rawJourney, ["observations", "notes"]), 10, 500)
      .map((note) => simplifyHumanNarrative(note, 500))
      .filter(Boolean)
  };
}

function normalizeJourneyStepClips(value) {
  const source = Array.isArray(value) ? value : [];
  if (!source.length) {
    return [];
  }

  const clips = [];
  for (const rawClip of source.slice(0, 24)) {
    if (!isPlainObject(rawClip)) {
      continue;
    }

    const step = Number.isFinite(Number(rawClip.step))
      ? Math.max(1, Math.round(Number(rawClip.step)))
      : null;
    const video =
      sanitizeString(
        readField(rawClip, ["video", "video_url", "videoUrl", "source", "url", "path"]),
        4096
      ) || "";
    if (!step || !video) {
      continue;
    }

    const clipStartMs = Math.max(0, Math.round(Number(rawClip.clip_start_ms || rawClip.clipStartMs || 0) || 0));
    const clipEndMs = Math.max(
      clipStartMs + 1,
      Math.round(Number(rawClip.clip_end_ms || rawClip.clipEndMs || clipStartMs + 1) || clipStartMs + 1)
    );

    clips.push({
      step,
      clip_start_ms: clipStartMs,
      clip_end_ms: clipEndMs,
      video,
      ...(sanitizeString(rawClip.content_type || rawClip.contentType, 128)
        ? { content_type: sanitizeString(rawClip.content_type || rawClip.contentType, 128) }
        : {}),
      ...(sanitizeString(rawClip.title, 240) ? { title: sanitizeString(rawClip.title, 240) } : {})
    });
  }

  return clips;
}

function normalizeJourneyStepAction(value) {
  const raw = sanitizeString(value, 80).toLowerCase();
  if (!raw) {
    return "inspect";
  }
  if (["click", "tap", "press", "submit"].includes(raw)) {
    return "click";
  }
  if (["type", "fill", "enter"].includes(raw)) {
    return "type";
  }
  if (["open", "navigate", "visit"].includes(raw)) {
    return "open";
  }
  if (["wait", "pause", "poll"].includes(raw)) {
    return "wait";
  }
  if (["scroll", "swipe"].includes(raw)) {
    return "scroll";
  }
  return raw.replace(/\s+/g, "_");
}

function parseJourneyStep(step) {
  const raw = sanitizeString(step, 1000);
  if (!raw) {
    return { action: "inspect", target: "affected area" };
  }

  const delimiterIndex = raw.indexOf(":");
  if (delimiterIndex > 0) {
    const action = normalizeJourneyStepAction(raw.slice(0, delimiterIndex));
    const target = sanitizeString(raw.slice(delimiterIndex + 1), 500) || "affected area";
    return { action, target };
  }

  return {
    action: normalizeJourneyStepAction(raw),
    target: raw
  };
}

function isLikelyRecoveryJourneyStep(step) {
  const parsed = typeof step === "string" ? parseJourneyStep(step) : step;
  const target = sanitizeString(parsed?.target, 500).toLowerCase();
  return (
    target.includes("retry") ||
    target.includes("try again") ||
    target.includes("regenerate") ||
    target.includes("start over")
  );
}

function hasOnlyJourneyWaitsAfter(steps, index) {
  for (let cursor = index + 1; cursor < steps.length; cursor += 1) {
    const parsed = parseJourneyStep(steps[cursor]);
    if (parsed.action === "wait" || parsed.action === "fail" || parsed.action === "done") {
      continue;
    }
    return false;
  }
  return true;
}

function isLikelyRecoveryStepText(value) {
  const normalized = sanitizeString(value, 1000).toLowerCase();
  return (
    normalized.includes("retry") ||
    normalized.includes("try again") ||
    normalized.includes("regenerate") ||
    normalized.includes("start over")
  );
}

function formatJourneyStepAsSentence(step) {
  const parsed = parseJourneyStep(step);
  if (parsed.action === "click") {
    return `Clicked "${parsed.target}".`;
  }
  if (parsed.action === "type") {
    return `Entered text into "${parsed.target}".`;
  }
  if (parsed.action === "open") {
    return `Opened "${parsed.target}".`;
  }
  if (parsed.action === "wait") {
    return `Waited for "${parsed.target}".`;
  }
  if (parsed.action === "scroll") {
    return `Scrolled to "${parsed.target}".`;
  }
  return `${parsed.action.replace(/_/g, " ").replace(/^\w/, (match) => match.toUpperCase())} "${parsed.target}".`;
}

function buildAttemptedActionsFromJourney(journey, finding) {
  const steps = Array.isArray(journey?.steps) ? journey.steps : [];
  const observations = Array.isArray(journey?.observations) ? journey.observations : [];
  const fallbackOutcome =
    sanitizeString(observations[0], 500) ||
    sanitizeString(finding?.observed_behavior, 500) ||
    sanitizeString(journey?.summary, 500) ||
    "The flow stayed on the same product state.";
  const pageUrl =
    sanitizeOptionalString((Array.isArray(journey?.pages) ? journey.pages[journey.pages.length - 1] : null), 4096) ||
    sanitizeOptionalString(finding?.page?.url, 4096) ||
    null;

  return steps.slice(0, 12).map((step, index) => {
    const parsed = parseJourneyStep(step);
    const isLast = index === steps.length - 1;
    let outcome = "The flow moved to the next visible step.";
    if (parsed.action === "wait") {
      outcome = isLast ? fallbackOutcome : "The expected next state did not appear yet.";
    } else if (isLast) {
      outcome = fallbackOutcome;
    }

    return normalizeDiagnosticAttempt(
      {
        step: index + 1,
        action: parsed.action,
        target: parsed.target,
        outcome,
        url: pageUrl,
        note: isLast && observations.length ? sanitizeOptionalString(observations[0], 1000) : null
      },
      index
    );
  });
}

function deriveLastSuccessfulStepFromJourney(journey) {
  const steps = Array.isArray(journey?.steps) ? journey.steps : [];
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const parsed = parseJourneyStep(steps[index]);
    if (parsed.action === "wait") {
      continue;
    }
    if (isLikelyRecoveryJourneyStep(parsed) && hasOnlyJourneyWaitsAfter(steps, index)) {
      continue;
    }
    return formatJourneyStepAsSentence(steps[index]);
  }

  return steps.length ? formatJourneyStepAsSentence(steps[0]) : "";
}

function countRepeatedJourneyStepTail(journey) {
  const steps = Array.isArray(journey?.steps) ? journey.steps : [];
  if (!steps.length) {
    return 0;
  }

  const lastParsed = parseJourneyStep(steps[steps.length - 1]);
  let count = 1;
  for (let index = steps.length - 2; index >= 0; index -= 1) {
    const parsed = parseJourneyStep(steps[index]);
    if (parsed.action !== lastParsed.action || parsed.target !== lastParsed.target) {
      break;
    }
    count += 1;
  }

  return count > 1 ? count : 0;
}

function isSyntheticInspectOnlyAttemptedActions(attempts) {
  if (!Array.isArray(attempts) || attempts.length !== 1) {
    return false;
  }
  const attempt = attempts[0];
  return sanitizeString(attempt?.action, 80).toLowerCase() === "inspect";
}

function findingNeedsBlockedJourneyContext(finding) {
  const severity = sanitizeString(finding?.severity, 32).toLowerCase();
  const type = sanitizeString(finding?.type, 64).toLowerCase();
  return (
    ["high", "critical"].includes(severity) ||
    ["dead_end", "confusion_point", "bug"].includes(type)
  );
}

function selectBestJourneyForFinding(journeys, finding) {
  const normalizedFindingUrl = normalizeUrl(finding?.page?.url);
  const candidates = Array.isArray(journeys) ? journeys : [];
  let bestJourney = null;
  let bestScore = -1;

  for (const journey of candidates) {
    if (!isPlainObject(journey)) {
      continue;
    }
    const pages = Array.isArray(journey.pages) ? journey.pages : [];
    const steps = Array.isArray(journey.steps) ? journey.steps : [];
    let score = 0;
    if (sanitizeString(journey.status, 32).toLowerCase() === "blocked") {
      score += 5;
    }
    if (steps.length) {
      score += Math.min(steps.length, 6);
    }
    if (normalizedFindingUrl && pages.some((page) => normalizeUrl(page) === normalizedFindingUrl)) {
      score += 4;
    }
    if (!normalizedFindingUrl && pages.length) {
      score += 2;
    }
    if (Array.isArray(journey.observations) && journey.observations.length) {
      score += 2;
    }
    if (score > bestScore) {
      bestScore = score;
      bestJourney = journey;
    }
  }

  return bestJourney;
}

function deriveBlockedFixHintFromReason(reason, fallbackHint = "") {
  const message = sanitizeString(reason, 2000).toLowerCase();
  if (
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("generating") ||
    message.includes("no progress")
  ) {
    return "Expose a deterministic completion or error state for long-running generation, and give the user a retry or recovery path when progress stalls.";
  }
  if (
    message.includes("same state") ||
    message.includes("stuck") ||
    message.includes("loop")
  ) {
    return "Break same-screen loops with a clear next action, explicit error state, or alternate path instead of leaving the user on an ambiguous waiting surface.";
  }
  return fallbackHint;
}

function getRecentEvidenceUrls(values, maxItems = 6, maxLength = 2000000) {
  const source = Array.isArray(values) ? values : [];
  if (!source.length) {
    return [];
  }
  return uniqueStringList([...source].reverse(), maxItems, maxLength);
}

function isLikelyAuthCheckpointEvidence(value) {
  const raw = sanitizeString(value, 4096).toLowerCase();
  return Boolean(
    raw &&
      /(auth[-_]|authentry|login|sign-?in|otp|magic[-_]?link|verification|submit-attempted|auth-flow|email)/.test(raw)
  );
}

function filterMixedAuthCheckpointEvidence(values) {
  const list = Array.isArray(values) ? values : [];
  if (!list.length) {
    return [];
  }

  const hasNonAuth = list.some((item) => !isLikelyAuthCheckpointEvidence(item));
  if (!hasNonAuth) {
    return list;
  }

  return list.filter((item) => !isLikelyAuthCheckpointEvidence(item));
}

function shouldPrioritizeBlockedTailEvidence(finding, diagnostics = null) {
  const safeDiagnostics = isPlainObject(diagnostics) ? diagnostics : {};
  const repeatedStateCount = Number(safeDiagnostics.repeated_state_count);
  if (Number.isFinite(repeatedStateCount) && repeatedStateCount > 0) {
    return true;
  }

  const type = sanitizeString(finding?.type, 64).toLowerCase();
  if (type === "dead_end") {
    return true;
  }

  const message = sanitizeString(
    [
      finding?.observed_behavior,
      safeDiagnostics.current_state,
      safeDiagnostics.failure_reason
    ]
      .filter(Boolean)
      .join(" "),
    4000
  ).toLowerCase();

  return /timed out|timeout|stalled|same waiting state|same state|never advanced|did not advance|did not progress|spinner|generating/.test(message);
}

function buildBlockedScreenshotEvidence(finding, journeyEvidence, context, diagnostics) {
  const repeatedStateCount = Number(diagnostics?.repeated_state_count);
  const recentWindow = Math.max(
    4,
    Math.min(8, Number.isFinite(repeatedStateCount) && repeatedStateCount > 0 ? Math.round(repeatedStateCount) + 1 : 6)
  );
  const explicit = getRecentEvidenceUrls(finding?.evidence?.screenshots, recentWindow, 2000000);
  const journey = getRecentEvidenceUrls(journeyEvidence?.screenshots, recentWindow, 2000000);
  const fallback = getRecentEvidenceUrls(fallbackScreenshotUrls(context), recentWindow + 2, 2000000);

  if (explicit.length || journey.length) {
    return filterMixedAuthCheckpointEvidence(uniqueStringList([...explicit, ...journey, ...fallback.slice(0, 2)], 12, 2000000));
  }

  return filterMixedAuthCheckpointEvidence(uniqueStringList(fallback, 12, 2000000));
}

function enrichBlockedFindingFromJourneys(finding, journeys, context = {}) {
  if (!isPlainObject(finding) || !findingNeedsBlockedJourneyContext(finding)) {
    return finding;
  }

  const journey = selectBestJourneyForFinding(journeys, finding);
  if (!journey) {
    return finding;
  }

  const diagnostics = isPlainObject(finding.diagnostic_details) ? { ...finding.diagnostic_details } : {};
  const attemptedActions = Array.isArray(diagnostics.attempted_actions) ? diagnostics.attempted_actions : [];
  const journeyAttempts = buildAttemptedActionsFromJourney(journey, finding);
  if (isSyntheticInspectOnlyAttemptedActions(attemptedActions) && journeyAttempts.length) {
    diagnostics.attempted_actions = journeyAttempts;
  }

  const journeyLastStep = deriveLastSuccessfulStepFromJourney(journey);
  if (
    journeyLastStep &&
    (!sanitizeString(diagnostics.last_successful_step, 1000) ||
      isLowSignalLastSuccessfulStep(diagnostics.last_successful_step) ||
      isLikelyRecoveryStepText(diagnostics.last_successful_step))
  ) {
    diagnostics.last_successful_step = journeyLastStep;
  }

  const observation =
    simplifyHumanNarrative((Array.isArray(journey.observations) ? journey.observations[0] : ""), 2000) ||
    simplifyHumanNarrative(journey.summary, 2000) ||
    simplifyHumanNarrative(finding.observed_behavior, 2000);
  if (!sanitizeString(diagnostics.current_state, 2000) || diagnostics.current_state === finding.observed_behavior) {
    diagnostics.current_state = observation || diagnostics.current_state;
  }
  if (!sanitizeString(diagnostics.failure_reason, 2000) || diagnostics.failure_reason === finding.observed_behavior) {
    diagnostics.failure_reason = observation || diagnostics.failure_reason;
  }

  const journeyUrl =
    sanitizeOptionalString((Array.isArray(journey.pages) ? journey.pages[journey.pages.length - 1] : null), 4096) ||
    sanitizeOptionalString(diagnostics.current_url, 4096) ||
    sanitizeOptionalString(finding?.page?.url, 4096) ||
    sanitizeOptionalString(context.target_url, 4096);
  diagnostics.current_url = journeyUrl;

  const repeatedStateCount = countRepeatedJourneyStepTail(journey);
  if (repeatedStateCount > 0 && !Number.isFinite(Number(diagnostics.repeated_state_count))) {
    diagnostics.repeated_state_count = repeatedStateCount;
  }

  const journeyEvidence = isPlainObject(journey.evidence) ? journey.evidence : {};
  const screenshots = shouldPrioritizeBlockedTailEvidence(finding, diagnostics)
    ? buildBlockedScreenshotEvidence(finding, journeyEvidence, context, diagnostics)
    : uniqueStringList(
        [
          ...coerceStringArray(finding?.evidence?.screenshots, 12, 2000000),
          ...coerceStringArray(journeyEvidence.screenshots, 12, 2000000),
          ...fallbackScreenshotUrls(context)
        ],
        12,
        2000000
      );
  const videos = uniqueStringList(
    [
      ...coerceStringArray(finding?.evidence?.videos, 6, 4096),
      ...coerceStringArray(journeyEvidence.videos, 6, 4096),
      ...fallbackVideoUrls(context)
    ],
    6,
    4096
  );

  const proofSource =
    finding?.evidence?.proof_source === "explicit_evidence" ||
    (Array.isArray(finding?.evidence?.screenshots) && finding.evidence.screenshots.length) ||
    (Array.isArray(finding?.evidence?.videos) && finding.evidence.videos.length)
      ? "explicit_evidence"
      : screenshots.length || videos.length
        ? "run_fallback"
        : "none";
  const proofState = proofSource === "explicit_evidence" ? "verified" : proofSource === "run_fallback" ? "fallback" : "missing";

  const enrichedFinding = {
    ...finding,
    journey: sanitizeOptionalString(journey.name, 180) || finding.journey,
    journey_id: sanitizeOptionalString(journey.id, 128) || finding.journey_id,
    page: {
      ...(isPlainObject(finding.page) ? finding.page : {}),
      url: journeyUrl || finding?.page?.url || null
    },
    evidence: {
      ...(isPlainObject(finding.evidence) ? finding.evidence : {}),
      screenshots,
      videos,
      proof_source: proofSource,
      proof_state: proofState
    },
    observed_behavior: observation || finding.observed_behavior,
    fix_hint:
      deriveBlockedFixHintFromReason(
        observation || diagnostics.failure_reason || finding.observed_behavior,
        sanitizeString(finding.fix_hint, 4000)
      ) || finding.fix_hint,
    diagnostic_details: normalizeDiagnosticDetails(diagnostics, {
      title: finding.title,
      observedBehavior: observation || finding.observed_behavior,
      reproSteps: Array.isArray(finding.repro_steps) ? finding.repro_steps : [],
      page: {
        ...(isPlainObject(finding.page) ? finding.page : {}),
        url: journeyUrl || finding?.page?.url || null
      },
      element: finding.element,
      targetUrl: context.target_url
    })
  };

  enrichedFinding.title = deriveSpecificFindingTitle(enrichedFinding, finding.title) || enrichedFinding.title;
  return enrichedFinding;
}

function enrichBlockedFindingsFromJourneys(findings, journeys, context = {}) {
  if (!Array.isArray(findings) || !findings.length) {
    return [];
  }
  return findings.map((finding) => enrichBlockedFindingFromJourneys(finding, journeys, context));
}

function hasVisitedAuthenticatedSurface(visitedPages, targetUrl) {
  const pages = Array.isArray(visitedPages) ? visitedPages : [];
  const normalizedTarget = normalizeUrl(targetUrl);
  const uniquePages = uniqueStringList(pages, 24, 4096).map((page) => normalizeUrl(page) || sanitizeString(page, 4096));
  if (uniquePages.length > 1) {
    return true;
  }

  if (!normalizedTarget) {
    return false;
  }

  return uniquePages.some((page) => page && page !== normalizedTarget);
}

function isEarlyNavigationFailureMessage(value) {
  const message = sanitizeString(value, 2000).toLowerCase();
  if (!message) {
    return false;
  }

  return (
    message.includes("page.goto:") ||
    message.includes("net::err_") ||
    message.includes("err_name_not_resolved") ||
    message.includes("err_connection") ||
    message.includes("err_ssl") ||
    message.includes("err_timed_out") ||
    (message.includes("navigating to") && message.includes("domcontentloaded"))
  );
}

function isAuthSetupFailureMessage(value) {
  const message = sanitizeString(value, 2000).toLowerCase();
  if (!message) {
    return false;
  }

  if (
    message.includes("sign-up form never opened") ||
    message.includes("sent the tester back to the login screen right after the sign-up form was submitted") ||
    message.includes("filled the sign-up form, clicked sign up, and got sent back to the login page instead of entering the product") ||
    message.includes("kept showing the same login screen") ||
    message.includes("login or sign-up did not finish") ||
    message.includes("stayed on the login form instead of switching to sign-up")
  ) {
    return true;
  }

  return (
    (message.includes("auth") || message.includes("login") || message.includes("sign") || message.includes("submit")) &&
    (
      message.includes("could not be activated") ||
      message.includes("could not activate") ||
      message.includes("could not be clicked") ||
      message.includes("could not click") ||
      message.includes("button did not work") ||
      message.includes("submit button") ||
      message.includes("did not resolve to an authenticated surface")
    )
  );
}

function expectsAutoAuth(runRequest) {
  const metadata = isPlainObject(runRequest?.metadata) ? runRequest.metadata : {};
  const authPolicy = sanitizeString(metadata.auth_policy || metadata.authPolicy, 64).toLowerCase();
  if (runRequest?.credentials) {
    return false;
  }
  if (["public_only", "public-only", "disabled", "none", "off"].includes(authPolicy)) {
    return false;
  }
  return (
    ["signup_if_needed", "sign_up_if_needed", "auto_signup", "auto-signup", "auto_create_account", "auto-create-account"].includes(authPolicy) ||
    parseBoolean(metadata.auto_create_account ?? metadata.autoCreateAccount) ||
    runRequest?.scope_mode === "feature_targeted" ||
    runRequest?.scope_mode === "deep_45m"
  );
}

function buildPlainEnglishAuthSetupSummary(context = {}) {
  const failureMessage = simplifyHumanNarrative(context?.failureMessage, 2000).toLowerCase();
  const currentState = sanitizeString(context?.currentState, 2000).toLowerCase();
  const autoAccountSetupExpected = expectsAutoAuth(context?.runRequest);
  if (
    failureMessage.includes("sign-up form never opened") ||
    ((currentState.includes("log in") || currentState.includes("login")) &&
      (currentState.includes("sign up") || currentState.includes("need an account")))
  ) {
    return "The tester tried to create an account, but the site stayed on the login form instead of switching to sign-up.";
  }
  if (failureMessage.includes("sent the tester back to the login screen right after the sign-up form was submitted")) {
    return "The tester filled the sign-up form, clicked Sign up, and got sent back to the login page instead of entering the product.";
  }
  if (failureMessage.includes("filled the sign-up form, clicked sign up, and got sent back to the login page instead of entering the product")) {
    return "The tester filled the sign-up form, clicked Sign up, and got sent back to the login page instead of entering the product.";
  }
  if (failureMessage.includes("kept showing the same login screen") || failureMessage.includes("login or sign-up did not finish")) {
    return "The tester submitted the account form, but the site kept showing the same login screen instead of getting into the product.";
  }
  if (failureMessage.includes("submit button could not be activated")) {
    return "The tester reached the login or sign-up form, but the submit button would not work.";
  }
  if (autoAccountSetupExpected && (currentState.includes("log in") || currentState.includes("login"))) {
    return "The tester tried to create an account, but the site kept showing the login form instead of opening sign-up.";
  }
  return "The tester reached the login or sign-up step, but account setup got stuck before the product opened.";
}

function inferSpecificAuthSetupFailureMessage(context = {}) {
  if (!expectsAutoAuth(context?.runRequest)) {
    return sanitizeString(context?.failureMessage, 2000) || "";
  }

  const failureMessage = sanitizeString(context?.failureMessage, 2000);
  const failureMessageLower = failureMessage.toLowerCase();
  const failureDiagnostics = isPlainObject(context?.failureDiagnostics) ? context.failureDiagnostics : {};
  const currentUrl = sanitizeString(failureDiagnostics.current_url || context?.currentUrl, 4096).toLowerCase();
  const currentState = sanitizeString(failureDiagnostics.current_state || context?.currentState, 2000).toLowerCase();
  const attemptedActions = Array.isArray(failureDiagnostics.attempted_actions) ? failureDiagnostics.attempted_actions : [];
  const runLog = Array.isArray(context?.runLog) ? context.runLog : [];

  const sawSignupSurfaceInRunLog = runLog.some((entry) => {
    const event = sanitizeString(entry?.event, 128).toLowerCase();
    const mode = sanitizeString(entry?.data?.mode, 64).toLowerCase();
    const url = sanitizeString(entry?.data?.url, 4096).toLowerCase();
    return (
      ["auth_surface_ready", "auth_form_filled", "auth_submit_attempted"].includes(event) &&
      (mode === "signup" || url.includes("/signup"))
    );
  });
  const sawSignupSubmitInRunLog = runLog.some((entry) => {
    const event = sanitizeString(entry?.event, 128).toLowerCase();
    const mode = sanitizeString(entry?.data?.mode, 64).toLowerCase();
    return event === "auth_submit_attempted" && mode === "signup";
  });

  const sawSignupSurfaceInAttempts = attemptedActions.some((attempt) => {
    const action = sanitizeString(attempt?.action, 128).toLowerCase();
    const target = sanitizeString(attempt?.target, 1000).toLowerCase();
    const outcome = sanitizeString(attempt?.outcome, 2000).toLowerCase();
    const url = sanitizeString(attempt?.url, 4096).toLowerCase();
    return (
      ["inspect", "submit_auth"].includes(action) &&
      (target.includes("sign-up") ||
        outcome.includes("sign-up form opened") ||
        outcome.includes("auth surface ready") ||
        outcome.includes("auth form filled") ||
        url.includes("/signup"))
    );
  });
  const sawSignupSubmitInAttempts = attemptedActions.some((attempt) => {
    const action = sanitizeString(attempt?.action, 128).toLowerCase();
    const target = sanitizeString(attempt?.target, 1000).toLowerCase();
    const outcome = sanitizeString(attempt?.outcome, 2000).toLowerCase();
    return (
      action === "submit_auth" ||
      outcome.includes("auth submit attempted") ||
      target.includes("sign-up form")
    );
  });

  const endedOnLogin =
    currentUrl.includes("/login") ||
    currentState.includes("log in") ||
    currentState.includes("login");

  if (
    endedOnLogin &&
    (sawSignupSubmitInRunLog || (sawSignupSurfaceInRunLog && sawSignupSubmitInAttempts) || sawSignupSubmitInAttempts)
  ) {
    return "The site sent the tester back to the login screen right after the sign-up form was submitted";
  }

  if (
    failureMessageLower.includes("sign-up form never opened") &&
    endedOnLogin &&
    (sawSignupSurfaceInRunLog || sawSignupSurfaceInAttempts)
  ) {
    return "The tester reached sign-up, but the site sent them back to the login form before the account was created";
  }

  return failureMessage;
}

function buildFallbackJourneys(runRequest, findings, coverage, context) {
  const earlyNavigationFailure = isEarlyNavigationFailureMessage(context?.failureMessage);
  const authSetupFailure = isAuthSetupFailureMessage(context?.failureMessage);
  const journeys = [];
  const primaryScreenshots = uniqueStringList(
    findings.flatMap((finding) => finding.evidence?.screenshots || []),
    6
  );
  const primaryVideos = uniqueStringList(
    findings.flatMap((finding) => finding.evidence?.videos || []),
    3
  );

  if (earlyNavigationFailure) {
    return [
      {
        id: "journey_entry_load_failed",
        name: "Could not open the site",
        status: "blocked",
        summary: "The tester could not open the first page, so the rest of the test never started.",
        steps: [
          "Try to open the first page.",
          "Wait for the page to load.",
          "Stop when the browser error blocks the test."
        ],
        pages: uniqueStringList([runRequest.target_url], 5),
        evidence: {
          screenshots: primaryScreenshots.length ? primaryScreenshots : fallbackScreenshotUrls(context),
          videos: primaryVideos.length ? primaryVideos : fallbackVideoUrls(context),
          console_logs: [],
          network_logs: []
        },
        observations: context?.failureMessage ? [sanitizeString(context.failureMessage, 500)] : []
      }
    ];
  }

  if (authSetupFailure) {
    const autoAccountSetupExpected = expectsAutoAuth(runRequest);
    return [
      {
        id: "journey_auth_setup_failed",
        name: autoAccountSetupExpected ? "Could not create account" : "Could not finish login",
        status: "blocked",
        summary: buildPlainEnglishAuthSetupSummary(context),
        steps: [
          "Open the first page.",
          autoAccountSetupExpected ? "Switch into sign-up and enter the new account details." : "Start login or sign-up.",
          autoAccountSetupExpected
            ? "Stop when the site keeps showing the login form and the product never opens."
            : "Stop when account setup gets stuck and the product never opens."
        ],
        pages: uniqueStringList([runRequest.target_url], 5),
        evidence: {
          screenshots: primaryScreenshots.length ? primaryScreenshots : fallbackScreenshotUrls(context),
          videos: primaryVideos.length ? primaryVideos : fallbackVideoUrls(context),
          console_logs: [],
          network_logs: []
        },
        observations: context?.failureMessage ? [simplifyHumanNarrative(context.failureMessage, 500)] : []
      }
    ];
  }

  journeys.push({
    id: "journey_primary_public_flow",
    name: "Primary public flow",
    status: findings.some((finding) => finding.type === "dead_end") ? "blocked" : "completed",
    summary:
      "The tester moved through the main public pages and tried the main button a new visitor would click.",
    steps: [
      "Open the target entry page.",
      "Traverse the main navigation and primary CTA path.",
      "Complete the highest-value public flow available without credentials."
    ],
    pages: uniqueStringList([runRequest.target_url], 5),
    evidence: {
      screenshots: primaryScreenshots.length ? primaryScreenshots : fallbackScreenshotUrls(context),
      videos: primaryVideos.length ? primaryVideos : fallbackVideoUrls(context),
      console_logs: [],
      network_logs: []
    },
    observations: []
  });

  journeys.push({
    id: "journey_recon_and_validation",
    name: "Recon and validation sweep",
    status: "completed",
    summary:
      "The tester quickly checked the main pages, buttons, and forms to see if anything felt broken or confusing.",
    steps: [
      "Map major navigation surfaces and modal entry points.",
      "Probe visible forms, validation states, and CTA affordances.",
      "Confirm whether the flow stays coherent without hidden prerequisites."
    ],
    pages: uniqueStringList([runRequest.target_url], 5),
    evidence: {
      screenshots: fallbackScreenshotUrls(context),
      videos: fallbackVideoUrls(context),
      console_logs: [],
      network_logs: []
    },
    observations: coverage?.untested_areas?.length
      ? [`Coverage limits: ${coverage.untested_areas.join(" | ")}`]
      : []
  });

  if (!runRequest.credentials) {
    journeys.push({
      id: "journey_authenticated_boundary",
      name: "Authenticated boundary check",
      status: "partial",
      summary:
        "The tester reached the login wall but could not go farther because no login was provided.",
      steps: [
        "Identify the primary sign-in or account gate.",
        "Confirm the app exposes additional authenticated-only areas.",
        "Record the auth boundary as untested rather than forcing invalid coverage."
      ],
      pages: uniqueStringList([runRequest.target_url], 5),
      evidence: {
        screenshots: fallbackScreenshotUrls(context),
        videos: fallbackVideoUrls(context),
        console_logs: [],
        network_logs: []
      },
      observations: ["Authenticated flows remain untested until valid credentials are supplied."]
    });
  }

  return journeys;
}

function isLegacySyntheticJourneySet(journeys = []) {
  if (!Array.isArray(journeys) || !journeys.length || journeys.length > 3) {
    return false;
  }

  const allowedIds = new Set([
    "journey_primary_public_flow",
    "journey_recon_and_validation",
    "journey_authenticated_boundary"
  ]);
  const allowedNames = new Set([
    "primary public flow",
    "recon and validation sweep",
    "authenticated boundary check"
  ]);

  return journeys.every((journey) => {
    const id = sanitizeString(journey?.id, 128);
    const name = sanitizeString(journey?.name, 180).toLowerCase();
    return (id && allowedIds.has(id)) || (name && allowedNames.has(name));
  });
}

function normalizeJourneys(value, runRequest, findings, coverage, context) {
  const rawJourneys = Array.isArray(value)
    ? value
    : Array.isArray(runRequest?.metadata?.tested_journeys)
      ? runRequest.metadata.tested_journeys
      : [];

  const normalized = rawJourneys
    .slice(0, 10)
    .map((journey, index) => normalizeJourney(journey, index, context));

  if (
    (isEarlyNavigationFailureMessage(context?.failureMessage) || isAuthSetupFailureMessage(context?.failureMessage)) &&
    isLegacySyntheticJourneySet(normalized)
  ) {
    return buildFallbackJourneys(runRequest, findings, coverage, context);
  }

  if (normalized.length) {
    return normalized;
  }

  return buildFallbackJourneys(runRequest, findings, coverage, context);
}

function buildEvidenceGallery(candidateValue, findings, context) {
  const candidate = isPlainObject(candidateValue) ? candidateValue : {};
  const fromFindingsScreenshots = findings.flatMap((finding) => finding.evidence?.screenshots || []);
  const fromFindingsVideos = findings.flatMap((finding) => finding.evidence?.videos || []);
  const consoleTimelineEntries = collectConsoleTimelineEntries(context);
  const networkTimelineEntries = collectNetworkTimelineEntries(context);

  const screenshots = uniqueStringList(
    [
      ...coerceStringArray(readField(candidate, ["captured_screenshots", "capturedScreenshots"]), 24, 2000000),
      ...coerceStringArray(readField(candidate, ["screenshots", "images"]), 20, 4096),
      ...fromFindingsScreenshots,
      ...fallbackScreenshotUrls(context)
    ],
    24,
    2000000
  );
  const videos = uniqueStringList(
    [
      ...coerceStringArray(readField(candidate, ["videos"]), 10, 4096),
      ...fromFindingsVideos,
      ...fallbackVideoUrls(context)
    ],
    10
  );

  return {
    screenshots,
    videos,
    session_url:
      sanitizeOptionalString(readField(candidate, ["session_url", "sessionUrl"]), 4096) ||
      sanitizeOptionalString(context?.artifacts?.browserbase_session_url, 4096),
    debug_url:
      sanitizeOptionalString(readField(candidate, ["debug_url", "debugUrl"]), 4096) ||
      sanitizeOptionalString(context?.artifacts?.browserbase_debug_url, 4096),
    console_logs: uniqueStringList(
      [
        ...coerceStringArray(readField(candidate, ["console_logs", "consoleLogs"]), MAX_GALLERY_CONSOLE_LOGS, 1800),
        ...consoleTimelineEntries.map((entry) => entry.text),
        ...findings.flatMap((finding) => finding.evidence?.console_logs || [])
      ],
      MAX_GALLERY_CONSOLE_LOGS,
      1800
    ),
    network_logs: uniqueStringList(
      [
        ...coerceStringArray(readField(candidate, ["network_logs", "networkLogs"]), MAX_GALLERY_NETWORK_LOGS, 1800),
        ...networkTimelineEntries.map((entry) => entry.text),
        ...findings.flatMap((finding) => finding.evidence?.network_logs || [])
      ],
      MAX_GALLERY_NETWORK_LOGS,
      1800
    )
  };
}

function buildRecommendations(candidateValue, findings, runRequest) {
  const explicit = uniqueStringList(
    coerceStringArray(candidateValue, 10, 500)
      .map((item) => simplifyHumanNarrative(item, 500))
      .filter(Boolean),
    10,
    500
  );
  if (explicit.length) {
    return explicit;
  }

  const derived = uniqueStringList(
    findings.map((finding) => simplifyHumanNarrative(finding.fix_hint, 500)).filter(Boolean),
    8,
    500
  );

  if (derived.length) {
    return derived;
  }

  const fallback = [
    "Review the captured replay evidence and screenshots to validate the exact user path exercised in this run.",
    "Supply test credentials if you want authenticated flows covered in the next pass.",
    `Re-run the ${runRequest.scope_mode || DEFAULT_SCOPE_MODE} sweep after any UX or copy changes to confirm the public flow still holds together.`
  ].map((item) => simplifyHumanNarrative(item, 500));

  return uniqueStringList(fallback, 8, 500);
}

function computeCounts(findings) {
  const counts = {};
  for (const type of ALLOWED_FINDING_TYPES) {
    counts[type] = 0;
  }

  for (const finding of findings) {
    if (finding && FINDING_TYPE_SET.has(finding.type)) {
      counts[finding.type] += 1;
    }
  }

  return counts;
}

function computeRiskScore(findings) {
  const severityWeights = {
    low: 1,
    medium: 2,
    high: 4,
    critical: 6
  };
  const typeWeights = {
    bug: 1.35,
    dead_end: 1.3,
    performance_issue: 1.15,
    accessibility_issue: 1.1,
    frustration_point: 1,
    confusion_point: 0.9,
    copy_issue: 0.75,
    aha_moment: -0.2
  };

  let weightedScore = 0;
  for (const finding of findings) {
    const severityWeight = severityWeights[finding.severity] || 2;
    const typeWeight = typeWeights[finding.type] || 1;
    weightedScore += severityWeight * typeWeight;
  }

  return Math.max(0, Math.min(100, Math.round(weightedScore * 5)));
}

function buildCoverage(actions = {}, findings = [], runRequest, context = {}) {
  const scenarioList = Array.isArray(runRequest?.scenario_list) ? runRequest.scenario_list : [];
  const visitedPages = new Set();
  const earlyNavigationFailure = isEarlyNavigationFailureMessage(context?.failureMessage);
  const authSetupFailure = isAuthSetupFailureMessage(context?.failureMessage);
  const autoAuthExpected = expectsAutoAuth(runRequest);

  if (Array.isArray(actions.visited_pages)) {
    for (const page of actions.visited_pages) {
      const url = normalizeUrl(page);
      if (url) {
        visitedPages.add(url);
      }
    }
  }

  for (const finding of findings) {
    const url = finding?.page?.url ? normalizeUrl(finding.page.url) : null;
    if (url) {
      visitedPages.add(url);
    }
  }

  if (!earlyNavigationFailure && !visitedPages.size && runRequest?.target_url) {
    visitedPages.add(runRequest.target_url);
  }

  const flowsBlocked =
    Number(actions.flows_blocked) ||
    findings.filter((finding) => finding.type === "dead_end").length ||
    (authSetupFailure ? 1 : 0);

  let flowsTested = Number(actions.flows_tested) || 0;
  if (!flowsTested) {
    if (earlyNavigationFailure) {
      flowsTested = 0;
    } else if (authSetupFailure) {
      flowsTested = 1;
    } else if (runRequest?.scope_mode === "feature_targeted" && scenarioList.length) {
      flowsTested = scenarioList.length;
    } else {
      flowsTested = 1;
    }
  }

  const untestedAreas = coerceStringArray(actions.untested_areas || actions.untestedAreas, 10, 200);
  const reachedAuthenticatedSurface = hasVisitedAuthenticatedSurface(Array.from(visitedPages), runRequest?.target_url);
  if (!earlyNavigationFailure && !runRequest?.credentials && !reachedAuthenticatedSurface) {
    if (authSetupFailure && autoAuthExpected) {
      untestedAreas.push("Logged-in pages were not reached because account setup got stuck.");
    } else if (autoAuthExpected) {
      untestedAreas.push("Logged-in pages were not reached during this test.");
    } else {
      untestedAreas.push("Authenticated flows were not tested because no credentials were provided.");
    }
  }

  return {
    pages_visited: visitedPages.size,
    flows_tested: flowsTested,
    flows_blocked: flowsBlocked,
    untested_areas: Array.from(new Set(untestedAreas)).slice(0, 10)
  };
}

function createSyntheticDeadEndFinding(context, failureMessage) {
  const message = sanitizeString(failureMessage, 1000);
  if (!message) {
    return null;
  }

  if (!hasConcreteFallbackProof(context)) {
    return null;
  }

  const earlyNavigationFailure = isEarlyNavigationFailureMessage(message);
  const authSetupFailure = isAuthSetupFailureMessage(message);
  const diagnostics = isPlainObject(context?.failureDiagnostics) ? context.failureDiagnostics : {};
  const specificTitle = buildSpecificTitleFromFailure(
    cleanDiagnosticTarget(diagnostics.last_successful_step),
    diagnostics.failure_reason || message,
    diagnostics.current_state,
    message
  );
  const autoAccountSetupExpected = expectsAutoAuth(context?.runRequest);
  const title =
    specificTitle ||
    (earlyNavigationFailure
      ? "The site could not be opened"
      : authSetupFailure
        ? autoAccountSetupExpected
          ? "Account setup never got past the login screen"
          : "Login or sign-up did not finish"
        : "The requested flow stopped before it finished");
  const expectedBehavior = earlyNavigationFailure
    ? "The first page should load so the QA run can begin."
    : authSetupFailure
      ? autoAccountSetupExpected
        ? "The site should switch into sign-up and create the new account."
        : "The login or sign-up form should move the user into the product."
      : "The QA run should continue through the requested user flow without crashing or stalling.";
  const fixHint = earlyNavigationFailure
    ? "Fix the site entry failure, DNS/network issue, or browser error that stopped the run from opening the first page."
    : authSetupFailure
      ? autoAccountSetupExpected
        ? "Fix the account-creation path so a new visitor can switch into sign-up and finish creating an account."
        : "Fix the login or sign-up path so submitting the form actually gets the user into the product."
      : "Inspect the failure diagnostics, reproduce the same path manually, and fix the blocker that ended the run early.";

  return normalizeFinding(
    {
      id: "finding_dead_end_1",
      type: "dead_end",
      severity: earlyNavigationFailure ? "critical" : "high",
      title,
      expected_behavior: expectedBehavior,
      observed_behavior: message,
      emotional_reaction: {
        primary: "frustration",
        intensity: 4,
        signals: ["blocked progress", "coverage interrupted"]
      },
      repro_steps: [
        `Open ${context?.target_url || "the target URL"}.`,
        "Follow the primary path until the blocker appears.",
        "Confirm the blocker prevents further coverage."
      ],
      page: {
        url: context?.failureDiagnostics?.current_url || context?.target_url || null
      },
      fix_hint: fixHint,
      diagnostic_details: isPlainObject(context?.failureDiagnostics) ? context.failureDiagnostics : undefined
    },
    0,
    context
  );
}

function buildTopIssues(findings) {
  const severityRank = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1
  };

  return findings
    .slice()
    .sort((a, b) => {
      const aRank = severityRank[a.severity] || 0;
      const bRank = severityRank[b.severity] || 0;
      if (aRank !== bRank) {
        return bRank - aRank;
      }
      return b.confidence - a.confidence;
    })
    .slice(0, 3)
    .map((finding) => ({
      id: finding.id,
      title: finding.title,
      type: finding.type,
      severity: finding.severity,
      page: finding.page?.url || null
    }));
}

function normalizeReport(options = {}) {
  const rawCandidateReport = isPlainObject(options.candidateReport) ? options.candidateReport : {};
  const candidateReport = isPlainObject(rawCandidateReport.report) ? rawCandidateReport.report : rawCandidateReport;
  const runRequest = options.runRequest || {};
  const targetUrl = runRequest.target_url || normalizeUrl(candidateReport.target) || null;
  const candidateSummary = isPlainObject(candidateReport.summary) ? candidateReport.summary : {};
  const initialFailureMessage =
    sanitizeOptionalString(options.failureMessage, 2000) ||
    sanitizeOptionalString(candidateSummary.note || candidateSummary.notes, 2000);
  let normalizedFailureMessage = initialFailureMessage;
  const context = {
    artifacts: options.artifacts || {},
    target_url: targetUrl,
    runRequest,
    failureMessage: normalizedFailureMessage,
    runLog: Array.isArray(options.runLog) ? options.runLog : []
  };

  const rawFindings = Array.isArray(candidateReport.findings) ? candidateReport.findings : [];
  let findings = rawFindings.map((finding, index) => normalizeFinding(finding, index, context));

  const explicitStatus = sanitizeString(candidateReport.status, 64).toLowerCase();
  let status = REPORT_STATUS_SET.has(explicitStatus) ? explicitStatus : "completed";

  const shouldAttachFailureDiagnostics =
    status === "failed" ||
    status === "failed_validation" ||
    Boolean(sanitizeString(options.failureMessage, 2000)) ||
    isEarlyNavigationFailureMessage(normalizedFailureMessage) ||
    isAuthSetupFailureMessage(normalizedFailureMessage);

  let failureDiagnostics =
    shouldAttachFailureDiagnostics
      ? normalizeFailureDiagnostics(
          readField(candidateReport, ["failure_diagnostics", "failureDiagnostics"]) ||
            (isPlainObject(options.failureDiagnostics) ? options.failureDiagnostics : null),
          {
            targetUrl,
            failureMessage: normalizedFailureMessage,
            runLog: Array.isArray(options.runLog) ? options.runLog : [],
            currentUrl: sanitizeOptionalString(options.currentUrl, 4096),
            currentState: sanitizeOptionalString(options.currentState, 2000),
            lastSuccessfulStep: sanitizeOptionalString(options.lastSuccessfulStep, 1000),
            pageLoaded: typeof options.pageLoaded === "boolean" ? options.pageLoaded : undefined
          }
        )
      : null;

  const inferredFailureMessage = inferSpecificAuthSetupFailureMessage({
    runRequest,
    failureMessage: normalizedFailureMessage,
    failureDiagnostics,
    runLog: Array.isArray(options.runLog) ? options.runLog : [],
    currentUrl: sanitizeOptionalString(options.currentUrl, 4096),
    currentState: sanitizeOptionalString(options.currentState, 2000)
  });

  if (sanitizeString(inferredFailureMessage, 2000) && inferredFailureMessage !== normalizedFailureMessage) {
    normalizedFailureMessage = sanitizeString(inferredFailureMessage, 2000);
    context.failureMessage = normalizedFailureMessage;
    if (failureDiagnostics) {
      failureDiagnostics = normalizeFailureDiagnostics(failureDiagnostics, {
        targetUrl,
        failureMessage: normalizedFailureMessage,
        runLog: Array.isArray(options.runLog) ? options.runLog : [],
        currentUrl: sanitizeOptionalString(failureDiagnostics.current_url, 4096),
        currentState: sanitizeOptionalString(failureDiagnostics.current_state, 2000),
        lastSuccessfulStep: sanitizeOptionalString(failureDiagnostics.last_successful_step, 1000),
        pageLoaded: typeof failureDiagnostics.page_loaded === "boolean" ? failureDiagnostics.page_loaded : undefined
      });
      failureDiagnostics.failure_reason =
        simplifyHumanNarrative(normalizedFailureMessage, 2000) || failureDiagnostics.failure_reason;
    }
  }

  context.failureDiagnostics = failureDiagnostics;

  const shouldSynthesizeDeadEndFinding =
    !findings.length &&
    (status !== "completed" ||
      Boolean(sanitizeString(options.failureMessage, 2000)) ||
      Boolean(failureDiagnostics)) &&
    (Boolean(normalizedFailureMessage) ||
      Boolean(sanitizeString(options.failureMessage, 2000)) ||
      Boolean(failureDiagnostics));

  if (shouldSynthesizeDeadEndFinding) {
    const syntheticDeadEnd = createSyntheticDeadEndFinding(context, normalizedFailureMessage);
    if (syntheticDeadEnd) {
      findings.push(syntheticDeadEnd);
    }
  }

  if (options.failureMessage) {
    status = findings.length ? "partial" : "failed";
  }

  const initialCoverage = buildCoverage(options.actions, findings, runRequest, context);
  const testedJourneys = normalizeJourneys(
    readField(candidateReport, ["tested_journeys", "testedJourneys", "journeys", "flows"]),
    runRequest,
    findings,
    initialCoverage,
    context
  );
  findings = enrichBlockedFindingsFromJourneys(findings, testedJourneys, context);
  findings = attachRelevantLogsToFindings(findings, context);
  findings = enrichFindingsWithRelevantLogContext(findings);
  const counts = computeCounts(findings);
  const coverage = buildCoverage(options.actions, findings, runRequest, context);
  if (
    status === "completed" &&
    (testedJourneys.some((journey) => sanitizeString(journey?.status, 32).toLowerCase() === "blocked") ||
      counts.dead_end > 0)
  ) {
    status = "partial";
  }
  const evidenceGallery = buildEvidenceGallery(
    readField(candidateReport, ["evidence_gallery", "evidenceGallery", "gallery"]),
    findings,
    context
  );
  const videoProofCoverage = ensureVideoProofCoverage(findings, testedJourneys, evidenceGallery);
  findings = videoProofCoverage.findings;
  const normalizedJourneys = videoProofCoverage.journeys;
  const experienceTimeline = buildExperienceTimeline(findings, context, evidenceGallery);
  const recommendations = buildRecommendations(
    readField(candidateReport, ["recommendations", "next_steps", "nextSteps"]),
    findings,
    runRequest
  );
  const candidateMetadata = isPlainObject(candidateReport.metadata) ? candidateReport.metadata : {};
  const runRequestMetadata = isPlainObject(runRequest.metadata) ? runRequest.metadata : {};
  const engineeringTriage = sanitizeEngineeringTriage(
    readField(candidateReport, ["engineering_triage", "engineeringTriage"]) ||
      (isPlainObject(options.engineeringTriage) ? options.engineeringTriage : null)
  );
  const repoTriageConfig = sanitizeRepoTriageConfig(
    candidateMetadata.repo_triage ||
      candidateMetadata.repoTriage ||
      runRequestMetadata.repo_triage ||
      runRequestMetadata.repoTriage
  );
  const summaryNote =
    simplifyHumanNarrative(normalizedFailureMessage, 2000) ||
    simplifyHumanNarrative(candidateSummary.note || candidateSummary.notes, 2000) ||
    (!findings.length ? "The QA run completed without recorded findings." : "");

  const normalized = {
    schema_version: "1.1",
    run_id: sanitizeString(candidateReport.run_id || runRequest.run_id, 128),
    target: sanitizeString(candidateReport.target, 320) || extractTargetLabel(targetUrl),
    status,
    report_url: sanitizeOptionalString(candidateReport.report_url || options.reportUrl, 4096),
    source: sanitizeString(candidateReport.source || runRequest.source, 64) || DEFAULT_SOURCE,
    delivered_at: toIsoTimestamp(candidateReport.delivered_at || options.deliveredAt),
    summary: {
      counts,
      risk_score:
        typeof candidateSummary.risk_score === "number" && Number.isFinite(candidateSummary.risk_score)
          ? Math.max(0, Math.min(100, Math.round(candidateSummary.risk_score)))
          : computeRiskScore(findings),
      coverage,
      note: summaryNote || null,
      top_issues: buildTopIssues(findings)
    },
    findings,
    tested_journeys: normalizedJourneys,
    evidence_gallery: evidenceGallery,
    ...(experienceTimeline ? { experience_timeline: experienceTimeline } : {}),
    recommendations,
    ...(engineeringTriage ? { engineering_triage: engineeringTriage } : {}),
    metadata: {
      target_url: targetUrl,
      scope_mode: runRequest.scope_mode || DEFAULT_SCOPE_MODE,
      scenario_list: Array.isArray(runRequest.scenario_list) ? runRequest.scenario_list : [],
      brand_persona: runRequest.brand_persona || FALLBACK_PERSONA,
      credentials_supplied: Boolean(runRequest.credentials),
      execution_engine: normalizeExecutionEngine(
        runRequest?.metadata?.execution_engine || runRequest?.metadata?.executionEngine
      ),
      requested_execution_engine: normalizeExecutionEngine(
        runRequest?.metadata?.requested_execution_engine || runRequest?.metadata?.requestedExecutionEngine
      ),
      repo_triage: repoTriageConfig,
      model: runRequest.model || null,
      parse_error: options.parseError || null,
      raw_agent_output_excerpt: sanitizeOptionalString(options.rawAgentMessage, 4000),
      failure_message: sanitizeOptionalString(normalizedFailureMessage, 2000)
    },
    artifacts: isPlainObject(options.artifacts) ? options.artifacts : {},
    ...(failureDiagnostics ? { failure_diagnostics: failureDiagnostics } : {})
  };

  return normalized;
}

function validateReport(report) {
  if (!isPlainObject(report)) {
    return { ok: false, error: "report must be an object" };
  }

  if (!sanitizeString(report.run_id, 128)) {
    return { ok: false, error: "report.run_id is required" };
  }

  if (!sanitizeString(report.target, 320)) {
    return { ok: false, error: "report.target is required" };
  }

  const status = sanitizeString(report.status, 64).toLowerCase();
  if (!REPORT_STATUS_SET.has(status)) {
    return { ok: false, error: "report.status is invalid" };
  }

  if (!Array.isArray(report.findings)) {
    return { ok: false, error: "report.findings must be an array" };
  }
  if (!Array.isArray(report.tested_journeys)) {
    return { ok: false, error: "report.tested_journeys must be an array" };
  }

  if (status === "failed" || status === "failed_validation") {
    const failureDiagnosticsValidation = validateFindingDiagnosticDetails(
      report.failure_diagnostics,
      "report.failure_diagnostics",
      { pageUrl: sanitizeString(report?.metadata?.target_url, 4096) }
    );
    if (!failureDiagnosticsValidation.ok) {
      return failureDiagnosticsValidation;
    }
  }

  for (let index = 0; index < report.findings.length; index += 1) {
    const finding = report.findings[index];
    if (!isPlainObject(finding)) {
      return { ok: false, error: `report.findings[${index}] must be an object` };
    }

    if (!sanitizeString(finding.id, 128)) {
      return { ok: false, error: `report.findings[${index}].id is required` };
    }

    if (!FINDING_TYPE_SET.has(sanitizeString(finding.type, 64).toLowerCase())) {
      return { ok: false, error: `report.findings[${index}].type is invalid` };
    }

    if (!SEVERITY_SET.has(sanitizeString(finding.severity, 32).toLowerCase())) {
      return { ok: false, error: `report.findings[${index}].severity is invalid` };
    }

    if (!sanitizeString(finding.expected_behavior, 4000)) {
      return { ok: false, error: `report.findings[${index}].expected_behavior is required` };
    }

    if (!sanitizeString(finding.observed_behavior, 4000)) {
      return { ok: false, error: `report.findings[${index}].observed_behavior is required` };
    }

    if (!isPlainObject(finding.emotional_reaction)) {
      return { ok: false, error: `report.findings[${index}].emotional_reaction is required` };
    }

    const primaryEmotion = sanitizeString(finding.emotional_reaction.primary, 64).toLowerCase();
    if (!EMOTION_SET.has(primaryEmotion)) {
      return {
        ok: false,
        error: `report.findings[${index}].emotional_reaction.primary is invalid`
      };
    }

    const intensity = Number(finding.emotional_reaction.intensity);
    if (!Number.isFinite(intensity) || intensity < 1 || intensity > 5) {
      return {
        ok: false,
        error: `report.findings[${index}].emotional_reaction.intensity must be between 1 and 5`
      };
    }

    if (!isPlainObject(finding.evidence)) {
      return { ok: false, error: `report.findings[${index}].evidence is required` };
    }

    const hasVideoProof = Array.isArray(finding.evidence.videos) && finding.evidence.videos.length > 0;
    if (!hasVideoProof) {
      return {
        ok: false,
        error: `report.findings[${index}].evidence must contain at least one video URL`
      };
    }

    const diagnosticsValidation = validateFindingDiagnosticDetails(
      finding.diagnostic_details,
      `report.findings[${index}]`,
      { pageUrl: sanitizeString(finding?.page?.url, 4096) }
    );
    if (!diagnosticsValidation.ok) {
      return diagnosticsValidation;
    }

    const specificTitle = deriveSpecificFindingTitle(finding, finding.title);
    if (isGenericFindingTitle(finding.title) && specificTitle && specificTitle !== sanitizeString(finding.title, 180)) {
      return {
        ok: false,
        error: `report.findings[${index}].title must name the exact broken step or issue, for example "${specificTitle}"`
      };
    }

    if (
      isSyntheticInspectOnlyAttemptedActions(finding?.diagnostic_details?.attempted_actions) &&
      findingNeedsBlockedJourneyContext(finding) &&
      Array.isArray(report.tested_journeys) &&
      report.tested_journeys.some((journey) => Array.isArray(journey?.steps) && journey.steps.length >= 2)
    ) {
      return {
        ok: false,
        error: `report.findings[${index}].diagnostic_details.attempted_actions must use the real journey timeline when richer run history exists`
      };
    }
  }

  for (let index = 0; index < report.tested_journeys.length; index += 1) {
    const journey = report.tested_journeys[index];
    if (!isPlainObject(journey)) {
      return { ok: false, error: `report.tested_journeys[${index}] must be an object` };
    }
    if (!isPlainObject(journey.evidence)) {
      return { ok: false, error: `report.tested_journeys[${index}].evidence is required` };
    }
    const hasVideoProof = Array.isArray(journey.evidence.videos) && journey.evidence.videos.length > 0;
    if (!hasVideoProof) {
      return {
        ok: false,
        error: `report.tested_journeys[${index}].evidence must contain at least one video URL`
      };
    }
  }

  return { ok: true };
}

function markdownList(items, emptyLabel = "None") {
  if (!Array.isArray(items) || !items.length) {
    return `- ${emptyLabel}`;
  }

  return items.map((item) => `- ${item}`).join("\n");
}

function formatTimelineClockMs(value) {
  const totalMs = Math.max(0, Math.round(Number(value) || 0));
  const totalSeconds = Math.floor(totalMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function buildMarkdownReport(report, runRequest, extras = {}) {
  const findings = Array.isArray(report?.findings) ? report.findings : [];
  const testedJourneys = Array.isArray(report?.tested_journeys) ? report.tested_journeys : [];
  const counts = report.summary?.counts || computeCounts(findings);
  const lines = [];
  const generatedAt = toIsoTimestamp(extras.generated_at || report.delivered_at);

  lines.push("# QA Report");
  lines.push("");
  lines.push("## Executive Summary");
  lines.push("");
  lines.push(`- Run ID: ${report.run_id}`);
  lines.push(`- Target: ${report.target}`);
  lines.push(`- Status: ${report.status}`);
  lines.push(`- Scope mode: ${runRequest.scope_mode}`);
  lines.push(`- Risk score: ${report.summary?.risk_score ?? 0}`);
  lines.push(`- Generated at: ${generatedAt}`);
  lines.push("");
  lines.push("### Findings By Type");
  lines.push("");
  for (const type of ALLOWED_FINDING_TYPES) {
    lines.push(`- ${type}: ${counts[type] || 0}`);
  }

  if (report.summary?.note) {
    lines.push("");
    lines.push(`- Summary note: ${report.summary.note}`);
  }

  if (report?.failure_diagnostics && typeof report.failure_diagnostics === "object") {
    const failureDiagnostics = report.failure_diagnostics;
    const attemptedActions = Array.isArray(failureDiagnostics.attempted_actions)
      ? failureDiagnostics.attempted_actions
      : [];
    lines.push("");
    lines.push("## Failure Diagnostics");
    lines.push("");
    lines.push(`- Page loaded: ${failureDiagnostics.page_loaded === true ? "yes" : failureDiagnostics.page_loaded === false ? "no" : "n/a"}`);
    lines.push(`- Current URL: ${failureDiagnostics.current_url || "n/a"}`);
    lines.push(`- Current state: ${failureDiagnostics.current_state || "n/a"}`);
    lines.push(`- Last successful step: ${failureDiagnostics.last_successful_step || "n/a"}`);
    lines.push(`- Failure reason: ${failureDiagnostics.failure_reason || "n/a"}`);
    if (Number.isFinite(Number(failureDiagnostics.repeated_state_count)) && Number(failureDiagnostics.repeated_state_count) > 0) {
      lines.push(`- Repeated state count: ${Math.round(Number(failureDiagnostics.repeated_state_count))}`);
    }
    lines.push("- Actions tried:");
    if (attemptedActions.length) {
      for (const action of attemptedActions) {
        const stepPrefix = Number.isFinite(Number(action?.step)) ? `${Math.round(Number(action.step))}. ` : "";
        const actionLabel = sanitizeString(action?.action, 80) || "inspect";
        const targetLabel = sanitizeString(action?.target, 500) || "affected area";
        const outcomeLabel = sanitizeString(action?.outcome, 500) || "state observed";
        const extras = [
          sanitizeString(action?.ts, 128) ? `At: ${sanitizeString(action.ts, 128)}` : "",
          sanitizeString(action?.url, 4096) ? `URL: ${sanitizeString(action.url, 4096)}` : "",
          sanitizeString(action?.note, 1000) ? `Note: ${sanitizeString(action.note, 1000)}` : ""
        ].filter(Boolean);
        lines.push(`  - ${stepPrefix}${actionLabel} -> ${targetLabel} -> ${outcomeLabel}${extras.length ? ` (${extras.join(" | ")})` : ""}`);
      }
    } else {
      lines.push("  - No concrete actions were captured.");
    }
  }

  if (report?.experience_timeline && Array.isArray(report.experience_timeline.spans) && report.experience_timeline.spans.length) {
    const timeline = report.experience_timeline;
    const summary = isPlainObject(timeline.summary) ? timeline.summary : {};
    lines.push("");
    lines.push("## Experience Timeline");
    lines.push("");
    lines.push(`- Video duration: ${formatTimelineClockMs(timeline.video_duration_ms || 0)}`);
    lines.push(`- Good: ${formatTimelineClockMs(summary.good_ms || 0)}`);
    lines.push(`- Friction: ${formatTimelineClockMs(summary.friction_ms || 0)}`);
    lines.push(`- Blocker: ${formatTimelineClockMs(summary.blocker_ms || 0)}`);
    lines.push("- Spans:");
    for (const span of timeline.spans.slice(0, EXPERIENCE_TIMELINE_MAX_SPANS)) {
      const label = sanitizeString(span?.label, 240) || "Unnamed span";
      const level = sanitizeString(span?.level, 32).toLowerCase() || "good";
      const spanSummary = sanitizeString(span?.summary, 600);
      const pageUrl = sanitizeOptionalString(span?.page?.url, 4096);
      const consoleLogs = uniqueStringList(span?.evidence?.console_logs, 2, 400);
      const networkLogs = uniqueStringList(span?.evidence?.network_logs, 2, 400);
      const evidenceNotes = [
        pageUrl ? `URL: ${pageUrl}` : "",
        consoleLogs.length ? `Console: ${consoleLogs.join(" | ")}` : "",
        networkLogs.length ? `Network: ${networkLogs.join(" | ")}` : ""
      ].filter(Boolean);
      lines.push(
        `  - [${formatTimelineClockMs(span?.start_ms || 0)}-${formatTimelineClockMs(span?.end_ms || 0)}] ${label} (${level})${spanSummary ? ` :: ${spanSummary}` : ""}${evidenceNotes.length ? ` (${evidenceNotes.join(" | ")})` : ""}`
      );
    }
  }

  lines.push("");
  lines.push("## Coverage Summary");
  lines.push("");
  lines.push(`- Pages visited: ${report.summary?.coverage?.pages_visited ?? 0}`);
  lines.push(`- Flows tested: ${report.summary?.coverage?.flows_tested ?? 0}`);
  lines.push(`- Flows blocked: ${report.summary?.coverage?.flows_blocked ?? 0}`);
  lines.push("- Untested areas:");
  lines.push(markdownList(report.summary?.coverage?.untested_areas));

  lines.push("");
  lines.push("## Tested Journeys");
  lines.push("");
  for (const journey of testedJourneys) {
    const journeyEvidence = isPlainObject(journey?.evidence) ? journey.evidence : {};
    const journeyObservations = Array.isArray(journey?.observations) ? journey.observations : [];
    lines.push(`### ${journey.id}: ${journey.name}`);
    lines.push("");
    lines.push(`- Status: ${journey.status}`);
    lines.push(`- Summary: ${journey.summary}`);
    lines.push("- Steps:");
    lines.push(markdownList(journey.steps, "No journey steps were recorded."));
    lines.push("- Pages:");
    lines.push(markdownList(journey.pages, "No specific pages were recorded."));
    lines.push("- Evidence:");
    lines.push(`- Screenshots: ${(journeyEvidence.screenshots || []).join(", ") || "None"}`);
    lines.push(`- Videos: ${(journeyEvidence.videos || []).join(", ") || "None"}`);
    if (journeyObservations.length) {
      lines.push("- Observations:");
      lines.push(markdownList(journeyObservations));
    }
    lines.push("");
  }

  lines.push("## Evidence Gallery");
  lines.push("");
  lines.push(
    `- Screenshots: ${(report.evidence_gallery?.screenshots || []).join(", ") || "None"}`
  );
  lines.push(`- Videos: ${(report.evidence_gallery?.videos || []).join(", ") || "None"}`);
  if (report.evidence_gallery?.session_url) {
    lines.push(`- Session URL: ${report.evidence_gallery.session_url}`);
  }
  if (report.evidence_gallery?.debug_url) {
    lines.push(`- Debug URL: ${report.evidence_gallery.debug_url}`);
  }
  if ((report.evidence_gallery?.console_logs || []).length) {
    lines.push(`- Console logs: ${(report.evidence_gallery.console_logs || []).slice(0, 20).join(", ")}`);
  }
  if ((report.evidence_gallery?.network_logs || []).length) {
    lines.push(`- Network logs: ${(report.evidence_gallery.network_logs || []).slice(0, 20).join(", ")}`);
  }

  lines.push("");
  lines.push("## Findings Table");
  lines.push("");
  lines.push("| ID | Type | Severity | Confidence | Page |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const finding of findings) {
    lines.push(
      `| ${finding.id} | ${finding.type} | ${finding.severity} | ${finding.confidence} | ${finding.page?.url || "n/a"} |`
    );
  }
  if (!findings.length) {
    lines.push("| none | n/a | n/a | n/a | n/a |");
  }

  lines.push("");
  lines.push("## Detailed Findings");
  lines.push("");

  for (const finding of findings) {
    const emotionalReaction =
      finding?.emotional_reaction && typeof finding.emotional_reaction === "object"
        ? finding.emotional_reaction
        : {};
    const emotionalSignals = Array.isArray(emotionalReaction.signals) ? emotionalReaction.signals : [];
    const reproSteps = Array.isArray(finding?.repro_steps) ? finding.repro_steps : [];
    const evidence = finding?.evidence && typeof finding.evidence === "object" ? finding.evidence : {};
    const diagnosticDetails =
      finding?.diagnostic_details && typeof finding.diagnostic_details === "object"
        ? finding.diagnostic_details
        : {};
    const attemptedActions = Array.isArray(diagnosticDetails.attempted_actions)
      ? diagnosticDetails.attempted_actions
      : [];
    const tags = Array.isArray(finding?.tags) ? finding.tags : [];
    lines.push(`### ${finding.id}: ${finding.title}`);
    lines.push("");
    lines.push(`- Type: ${finding.type}`);
    lines.push(`- Severity: ${finding.severity}`);
    lines.push(`- Confidence: ${finding.confidence}`);
    lines.push(`- Page: ${finding.page?.url || "n/a"}`);
    if (finding.page?.route) {
      lines.push(`- Route: ${finding.page.route}`);
    }
    if (finding.element?.selector) {
      lines.push(`- Element selector: ${finding.element.selector}`);
    }
    if (finding.element?.text) {
      lines.push(`- Element text: ${finding.element.text}`);
    }
    lines.push(`- Expected behavior: ${finding.expected_behavior}`);
    lines.push(`- Observed behavior: ${finding.observed_behavior}`);
    lines.push(`- Page loaded: ${diagnosticDetails.page_loaded === true ? "yes" : diagnosticDetails.page_loaded === false ? "no" : "n/a"}`);
    lines.push(`- Current URL: ${diagnosticDetails.current_url || finding.page?.url || "n/a"}`);
    lines.push(`- Current state: ${diagnosticDetails.current_state || "n/a"}`);
    lines.push(`- Last successful step: ${diagnosticDetails.last_successful_step || "n/a"}`);
    lines.push(`- Why this was reported: ${diagnosticDetails.failure_reason || finding.observed_behavior}`);
    if (Number.isFinite(Number(diagnosticDetails.repeated_state_count)) && Number(diagnosticDetails.repeated_state_count) > 0) {
      lines.push(`- Repeated state count: ${Math.round(Number(diagnosticDetails.repeated_state_count))}`);
    }
    lines.push(
      `- Emotional reaction: ${emotionalReaction.primary || "uncertainty"} (${emotionalReaction.intensity || 3}/5)`
    );
    if (emotionalSignals.length) {
      lines.push(`- Emotional signals: ${emotionalSignals.join(", ")}`);
    }
    lines.push("- Actions tried:");
    if (attemptedActions.length) {
      for (const action of attemptedActions) {
        const stepPrefix = Number.isFinite(Number(action?.step)) ? `${Math.round(Number(action.step))}. ` : "";
        const actionLabel = sanitizeString(action?.action, 80) || "inspect";
        const targetLabel = sanitizeString(action?.target, 500) || "affected area";
        const outcomeLabel = sanitizeString(action?.outcome, 500) || "state observed";
        const extras = [
          sanitizeString(action?.ts, 128) ? `At: ${sanitizeString(action.ts, 128)}` : "",
          sanitizeString(action?.url, 4096) ? `URL: ${sanitizeString(action.url, 4096)}` : "",
          sanitizeString(action?.note, 1000) ? `Note: ${sanitizeString(action.note, 1000)}` : ""
        ].filter(Boolean);
        lines.push(`  - ${stepPrefix}${actionLabel} -> ${targetLabel} -> ${outcomeLabel}${extras.length ? ` (${extras.join(" | ")})` : ""}`);
      }
    } else {
      lines.push("  - No concrete actions were captured.");
    }
    lines.push("- Repro steps:");
    if (reproSteps.length) {
      for (const step of reproSteps) {
        lines.push(`  - ${step}`);
      }
    } else {
      lines.push("  - No exact repro steps were captured.");
    }
    lines.push("- Evidence:");
    lines.push(`  - Screenshots: ${(evidence.screenshots || []).join(", ")}`);
    if ((evidence.videos || []).length) {
      lines.push(`  - Videos: ${evidence.videos.join(", ")}`);
    }
    if ((evidence.console_logs || []).length) {
      lines.push(`  - Console logs: ${(evidence.console_logs || []).slice(0, 12).join(", ")}`);
    }
    if ((evidence.network_logs || []).length) {
      lines.push(`  - Network logs: ${(evidence.network_logs || []).slice(0, 12).join(", ")}`);
    }
    lines.push(`- Fix hint: ${finding.fix_hint}`);
    if (tags.length) {
      lines.push(`- Tags: ${tags.join(", ")}`);
    }
    lines.push("");
  }

  lines.push("## Recommendations");
  lines.push("");
  lines.push(markdownList(report.recommendations, "No recommendations were recorded."));
  lines.push("");

  lines.push("## Appendix");
  lines.push("");
  lines.push(`- Persona used: ${runRequest.brand_persona}`);
  lines.push(`- Target URL: ${runRequest.target_url}`);
  lines.push(`- Report URL: ${report.report_url || "n/a"}`);
  lines.push(`- Session replay URL: ${report.artifacts?.browserbase_session_url || "n/a"}`);
  lines.push(`- Debug replay URL: ${report.artifacts?.browserbase_debug_url || "n/a"}`);
  if (report.artifacts?.artifact_expires_at) {
    lines.push(`- Artifact expiry: ${report.artifacts.artifact_expires_at}`);
  }
  if (extras.raw_agent_message_excerpt) {
    lines.push("");
    lines.push("### Raw Agent Output Excerpt");
    lines.push("");
    lines.push("```text");
    lines.push(sanitizeString(extras.raw_agent_message_excerpt, 4000));
    lines.push("```");
  }

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}

async function sendFinalCallback(options = {}) {
  const callbackUrl = normalizeUrl(options.callbackUrl);
  const callbackSecret = sanitizeString(options.callbackSecret, 512);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const sleepFn = options.sleepFn || sleep;
  const retryDelaysMs = Array.isArray(options.retryDelaysMs)
    ? options.retryDelaysMs
    : DEFAULT_CALLBACK_RETRY_DELAYS_MS;

  if (!callbackUrl) {
    return { ok: false, status: 0, attempts: 0, error: "Missing callbackUrl" };
  }

  if (!callbackSecret) {
    return { ok: false, status: 0, attempts: 0, error: "Missing callbackSecret" };
  }

  if (typeof fetchImpl !== "function") {
    return { ok: false, status: 0, attempts: 0, error: "fetch is not available" };
  }

  const report = sanitizeReportForCallback(options.report);
  const extraPayload = isPlainObject(options.extraPayload) ? options.extraPayload : {};
  const callbackArtifacts = sanitizeArtifactsForCallback(options.artifacts || report?.artifacts || {});
  const payload = {
    ...report,
    ...extraPayload,
    report_json: report,
    report_markdown: sanitizeReportMarkdown(options.markdown, 12000),
    artifacts: callbackArtifacts,
    run_log: sanitizeRunLogForCallback(options.runLog),
    artifact_expires_at:
      sanitizeOptionalString(callbackArtifacts?.artifact_expires_at, 128) ||
      sanitizeOptionalString(report?.artifacts?.artifact_expires_at, 128)
  };

  let attempts = 0;
  for (;;) {
    attempts += 1;

    try {
      const response = await fetchImpl(callbackUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-callback-secret": callbackSecret
        },
        body: JSON.stringify(payload)
      });

      let responseBody = null;
      try {
        responseBody = await response.json();
      } catch {
        responseBody = null;
      }

      if (response.ok) {
        return {
          ok: true,
          status: response.status,
          attempts,
          data: responseBody
        };
      }

      const retryable = response.status >= 500 && attempts <= retryDelaysMs.length;
      if (retryable) {
        await sleepFn(retryDelaysMs[attempts - 1] || 0);
        continue;
      }

      return {
        ok: false,
        status: response.status,
        attempts,
        error: responseBody?.error || `Callback request failed with status ${response.status}`,
        data: responseBody
      };
    } catch (error) {
      const retryable = attempts <= retryDelaysMs.length;
      if (retryable) {
        await sleepFn(retryDelaysMs[attempts - 1] || 0);
        continue;
      }

      return {
        ok: false,
        status: 0,
        attempts,
        error: error.message || "Callback request failed"
      };
    }
  }
}

function stripEmbeddedMediaItems(items, maxItems = 24) {
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .map((item) => sanitizeString(item, 2000000))
    .filter((item) => item && !item.startsWith("data:image/") && !item.startsWith("data:video/"))
    .slice(0, maxItems);
}

function sanitizeEvidenceForCallback(evidence) {
  if (!isPlainObject(evidence)) {
    return evidence;
  }
  const sanitized = { ...evidence };
  if (Array.isArray(evidence.screenshots)) {
    sanitized.screenshot_count = evidence.screenshots.length;
    sanitized.screenshots = stripEmbeddedMediaItems(evidence.screenshots);
  }
  if (Array.isArray(evidence.videos)) {
    sanitized.video_count = evidence.videos.length;
    sanitized.videos = stripEmbeddedMediaItems(evidence.videos);
  }
  if (Array.isArray(evidence.console_logs)) {
    sanitized.console_logs = uniqueStringList(evidence.console_logs, MAX_FINDING_CONSOLE_LOGS, 1800);
  }
  if (Array.isArray(evidence.network_logs)) {
    sanitized.network_logs = uniqueStringList(evidence.network_logs, MAX_FINDING_NETWORK_LOGS, 1800);
  }
  return sanitized;
}

function sanitizeExperienceTimelineForCallback(timeline) {
  if (!isPlainObject(timeline)) {
    return timeline;
  }

  const summary = isPlainObject(timeline.summary) ? timeline.summary : {};
  const spans = Array.isArray(timeline.spans) ? timeline.spans.slice(0, EXPERIENCE_TIMELINE_MAX_SPANS) : [];

  return {
    ...timeline,
    version: sanitizeString(timeline.version, 32) || "1",
    source: sanitizeString(timeline.source, 120) || "",
    base_window_ms: Math.max(0, Math.round(Number(timeline.base_window_ms) || EXPERIENCE_TIMELINE_DEFAULT_STEP_MS)),
    video_duration_ms: Math.max(0, Math.round(Number(timeline.video_duration_ms) || 0)),
    has_video: timeline.has_video === true,
    summary: {
      good_ms: Math.max(0, Math.round(Number(summary.good_ms) || 0)),
      friction_ms: Math.max(0, Math.round(Number(summary.friction_ms) || 0)),
      blocker_ms: Math.max(0, Math.round(Number(summary.blocker_ms) || 0))
    },
    spans: spans.map((span, index) => {
      const metrics = isPlainObject(span?.metrics) ? span.metrics : {};
      const evidence = isPlainObject(span?.evidence) ? span.evidence : {};
      const page = isPlainObject(span?.page) ? span.page : {};
      return {
        id: sanitizeString(span?.id, 128) || `span_${index + 1}`,
        start_ms: Math.max(0, Math.round(Number(span?.start_ms) || 0)),
        end_ms: Math.max(0, Math.round(Number(span?.end_ms) || 0)),
        level: sanitizeString(span?.level, 32).toLowerCase() || "good",
        topic: sanitizeString(span?.topic, 120).toLowerCase() || "progress",
        score: Math.max(0, Math.min(100, Math.round(Number(span?.score) || 0))),
        confidence: Math.max(0, Math.min(1, Number(span?.confidence) || 0)),
        label: sanitizeString(span?.label, 240) || "Unnamed span",
        summary: sanitizeString(span?.summary, 1200),
        fix_direction: sanitizeOptionalString(span?.fix_direction, 1200),
        jump_ts_ms: Math.max(0, Math.round(Number(span?.jump_ts_ms) || Number(span?.start_ms) || 0)),
        page: {
          url: sanitizeOptionalString(page.url, 4096),
          title: sanitizeOptionalString(page.title, 240)
        },
        metrics: {
          wait_count: Math.max(0, Math.round(Number(metrics.wait_count) || 0)),
          retry_count: Math.max(0, Math.round(Number(metrics.retry_count) || 0)),
          same_state_count: Math.max(0, Math.round(Number(metrics.same_state_count) || 0)),
          console_error_count: Math.max(0, Math.round(Number(metrics.console_error_count) || 0)),
          failed_request_count: Math.max(0, Math.round(Number(metrics.failed_request_count) || 0))
        },
        tags: uniqueStringList(span?.tags, 12, 80),
        evidence: {
          action_steps: uniqueStringList(evidence.action_steps, 12, 400),
          console_logs: uniqueStringList(evidence.console_logs, MAX_FINDING_CONSOLE_LOGS, 1800),
          network_logs: uniqueStringList(evidence.network_logs, MAX_FINDING_NETWORK_LOGS, 1800),
          screenshot_ids: uniqueStringList(evidence.screenshot_ids, 12, 120),
          frame_ids: uniqueStringList(evidence.frame_ids, 12, 120)
        },
        linked_finding_ids: uniqueStringList(span?.linked_finding_ids, 8, 160)
      };
    })
  };
}

function sanitizeArtifactsForCallback(artifacts) {
  if (!isPlainObject(artifacts)) {
    return {};
  }
  const sanitized = { ...artifacts };
  if (Array.isArray(artifacts.captured_screenshots)) {
    sanitized.captured_screenshot_count = artifacts.captured_screenshots.length;
    delete sanitized.captured_screenshots;
  }
  if (Array.isArray(artifacts.console_timeline)) {
    sanitized.console_event_count = artifacts.console_timeline.length;
    delete sanitized.console_timeline;
  }
  if (Array.isArray(artifacts.network_timeline)) {
    sanitized.network_event_count = artifacts.network_timeline.length;
    delete sanitized.network_timeline;
  }
  return sanitized;
}

function sanitizeCallbackLogValue(value, depth = 0) {
  if (depth > 3) {
    return null;
  }
  if (typeof value === "string") {
    return sanitizeString(value, 400);
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, 20)
      .map((item) => sanitizeCallbackLogValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (isPlainObject(value)) {
    const sanitized = {};
    for (const [key, raw] of Object.entries(value).slice(0, 24)) {
      const next = sanitizeCallbackLogValue(raw, depth + 1);
      if (next !== undefined) {
        sanitized[sanitizeString(key, 64)] = next;
      }
    }
    return sanitized;
  }
  return sanitizeOptionalString(value, 200);
}

function sanitizeRunLogForCallback(runLog) {
  if (!Array.isArray(runLog)) {
    return [];
  }
  return runLog.slice(-120).map((entry) => {
    if (!isPlainObject(entry)) {
      return {
        ts: new Date().toISOString(),
        event: "progress",
        data: {}
      };
    }
    const timestamp = sanitizeString(entry.ts || entry.timestamp, 128) || new Date().toISOString();
    const event = sanitizeString(entry.event, 128) || "progress";
    const data = sanitizeCallbackLogValue(entry.data || entry.details || {}, 0);
    return {
      ts: timestamp,
      event,
      data: isPlainObject(data) ? data : {}
    };
  });
}

function sanitizeReportForCallback(report) {
  if (!isPlainObject(report)) {
    return report;
  }

  const sanitized = {
    ...report,
    artifacts: sanitizeArtifactsForCallback(report.artifacts)
  };

  if (isPlainObject(report.evidence_gallery)) {
    sanitized.evidence_gallery = {
      ...report.evidence_gallery,
      screenshots: stripEmbeddedMediaItems(report.evidence_gallery.screenshots),
      videos: stripEmbeddedMediaItems(report.evidence_gallery.videos),
      console_logs: uniqueStringList(report.evidence_gallery.console_logs, MAX_GALLERY_CONSOLE_LOGS, 1800),
      network_logs: uniqueStringList(report.evidence_gallery.network_logs, MAX_GALLERY_NETWORK_LOGS, 1800)
    };
  }

  if (Array.isArray(report.findings)) {
    sanitized.findings = report.findings.map((finding) => {
      if (!isPlainObject(finding)) {
        return finding;
      }
      return {
        ...finding,
        evidence: sanitizeEvidenceForCallback(finding.evidence)
      };
    });
  }

  if (Array.isArray(report.tested_journeys)) {
    sanitized.tested_journeys = report.tested_journeys.map((journey) => {
      if (!isPlainObject(journey)) {
        return journey;
      }
      return {
        ...journey,
        ...(Array.isArray(journey.step_video_clips)
          ? { step_video_clips: normalizeJourneyStepClips(journey.step_video_clips) }
          : {}),
        evidence: sanitizeEvidenceForCallback(journey.evidence)
      };
    });
  }

  if (isPlainObject(report.experience_timeline)) {
    sanitized.experience_timeline = sanitizeExperienceTimelineForCallback(report.experience_timeline);
  }

  if (report.engineering_triage !== undefined) {
    sanitized.engineering_triage = sanitizeEngineeringTriage(report.engineering_triage);
  }

  if (isPlainObject(report.metadata)) {
    sanitized.metadata = {
      ...report.metadata,
      repo_triage: sanitizeRepoTriageConfig(report.metadata.repo_triage || report.metadata.repoTriage)
    };
  }

  return sanitized;
}

function buildWebhookSignature(secret, timestamp, bodyText) {
  const safeSecret = sanitizeString(secret, 512);
  if (!safeSecret) {
    return "";
  }

  return crypto
    .createHmac("sha256", safeSecret)
    .update(`${timestamp}.${bodyText}`)
    .digest("hex");
}

async function sendRunWebhook(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const sleepFn = options.sleepFn || sleep;
  const retryDelaysMs = Array.isArray(options.retryDelaysMs)
    ? options.retryDelaysMs
    : DEFAULT_WEBHOOK_RETRY_DELAYS_MS;

  if (typeof fetchImpl !== "function") {
    return { ok: false, status: 0, attempts: 0, error: "fetch is not available" };
  }

  const webhook = isPlainObject(options.webhook)
    ? options.webhook
    : isPlainObject(options.webhook_config)
      ? options.webhook_config
      : {};
  const webhookUrl = normalizeUrl(webhook.url || options.webhook_url || options.webhookUrl);
  if (!webhookUrl) {
    return { ok: false, status: 0, attempts: 0, error: "Missing webhook URL" };
  }

  const eventType = sanitizeString(options.event || options.eventType, 64).toLowerCase();
  if (!eventType || !WEBHOOK_EVENT_SET.has(eventType)) {
    return { ok: false, status: 0, attempts: 0, error: "Invalid webhook event" };
  }

  const payloadData = isPlainObject(options.payload) ? options.payload : {};
  const now = new Date();
  const sentAt = now.toISOString();
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const envelope = {
    event: eventType,
    sent_at: sentAt,
    run_id: sanitizeOptionalString(options.run_id || payloadData.run_id, 128),
    data: payloadData
  };

  const bodyText = JSON.stringify(envelope);
  const customHeaders = sanitizeWebhookHeaders(webhook.headers || options.headers);
  const headers = {
    "Content-Type": "application/json",
    "x-swarm-event": eventType,
    "x-swarm-sent-at": timestamp,
    ...customHeaders
  };
  const secret = sanitizeOptionalString(webhook.secret || options.webhook_secret || options.webhookSecret, 512);
  if (secret) {
    headers["x-swarm-signature"] = `t=${timestamp},v1=${buildWebhookSignature(secret, timestamp, bodyText)}`;
  }

  let attempts = 0;
  for (;;) {
    attempts += 1;

    try {
      const response = await fetchImpl(webhookUrl, {
        method: "POST",
        headers,
        body: bodyText
      });

      const rawBody = await response.text();
      let parsedBody = null;
      try {
        parsedBody = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        parsedBody = rawBody || null;
      }

      if (response.ok) {
        return {
          ok: true,
          status: response.status,
          attempts,
          data: parsedBody
        };
      }

      const retryable = response.status >= 500 && attempts <= retryDelaysMs.length;
      if (retryable) {
        await sleepFn(retryDelaysMs[attempts - 1] || 0);
        continue;
      }

      return {
        ok: false,
        status: response.status,
        attempts,
        error:
          (parsedBody && typeof parsedBody === "object" ? parsedBody.error : null) ||
          `Webhook request failed with status ${response.status}`,
        data: parsedBody
      };
    } catch (error) {
      const retryable = attempts <= retryDelaysMs.length;
      if (retryable) {
        await sleepFn(retryDelaysMs[attempts - 1] || 0);
        continue;
      }

      return {
        ok: false,
        status: 0,
        attempts,
        error: error.message || "Webhook request failed"
      };
    }
  }
}

async function loadStoredReportByRunId(runId, options = {}) {
  const safeRunId = sanitizeString(runId, 128);
  if (!safeRunId) {
    return { ok: false, status: 400, error: "run_id is required" };
  }

  const supabaseUrl = sanitizeString(options.supabaseUrl || process.env.SUPABASE_URL, 4096);
  const serviceKey = sanitizeString(
    options.serviceKey || process.env.SUPABASE_SERVICE_KEY,
    4096
  );
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  if (!supabaseUrl || !serviceKey) {
    return { ok: false, status: 500, error: "Server is not configured" };
  }

  if (typeof fetchImpl !== "function") {
    return { ok: false, status: 500, error: "fetch is not available" };
  }

  const requestUrl = new URL(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/swarmtest_reports`);
  requestUrl.searchParams.set("select", "*");
  requestUrl.searchParams.set("run_id", `eq.${safeRunId}`);
  requestUrl.searchParams.set("limit", "1");
  requestUrl.searchParams.set("order", "delivered_at.desc");

  const response = await fetchImpl(requestUrl.toString(), {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`
    }
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: data?.message || "Failed to load QA report",
      data
    };
  }

  const row = Array.isArray(data) && data[0] ? data[0] : null;
  if (!row) {
    return { ok: false, status: 404, error: "QA report not found" };
  }

  return { ok: true, status: 200, row };
}

module.exports = {
  ALLOWED_FINDING_TYPES,
  ALLOWED_SEVERITIES,
  ALLOWED_REPORT_STATUSES,
  ALLOWED_EMOTIONS,
  ALLOWED_OTP_MODES,
  ALLOWED_WEBHOOK_EVENTS,
  ALLOWED_EXECUTION_ENGINES,
  DEFAULT_PUBLIC_BASE_URL,
  DEFAULT_SCOPE_MODE,
  DEFAULT_SOURCE,
  DEFAULT_EXECUTION_ENGINE,
  DEFAULT_CALLBACK_RETRY_DELAYS_MS,
  DEFAULT_WEBHOOK_RETRY_DELAYS_MS,
  FALLBACK_PERSONA,
  SCOPE_CONFIG,
  sanitizeString,
  sanitizeOptionalString,
  isPlainObject,
  safeJsonParse,
  normalizeUrl,
  normalizeExecutionEngine,
  isConcreteVideoEvidenceReference,
  sleep,
  readField,
  toIsoTimestamp,
  parseBoolean,
  getScopeConfig,
  buildPrimaryUserGoal,
  getPublicBaseUrl,
  getCallbackUrl,
  parseRequestBody,
  extractTargetLabel,
  sanitizeWebhookHeaders,
  sanitizeWebhookEvents,
  sanitizeRepoTriageConfig,
  sanitizeRepoTriageState,
  sanitizeEngineeringTriage,
  sanitizeReportMarkdown,
  normalizeWebhookConfig,
  resolveRunWebhookConfig,
  validateRunRequest,
  buildSystemPrompt,
  buildTaskPrompt,
  extractAgentSections,
  deriveSpecificFindingTitle,
  normalizeFinding,
  normalizeDiagnosticDetails,
  validateFindingDiagnosticDetails,
  computeCounts,
  computeRiskScore,
  buildCoverage,
  normalizeReport,
  validateReport,
  buildMarkdownReport,
  sanitizeArtifactsForCallback,
  sanitizeRunLogForCallback,
  sanitizeReportForCallback,
  sendFinalCallback,
  sendRunWebhook,
  loadStoredReportByRunId
};
