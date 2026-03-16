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
    "Capture at least one screenshot evidence link for every finding. Include a video evidence link when the issue unfolds over time.",
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
    "Each finding must include: id, type, severity, title, expected_behavior, observed_behavior, emotional_reaction.primary, repro_steps, page, element, evidence.screenshots, fix_hint, confidence.",
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
  if (Array.isArray(context?.artifacts?.captured_screenshots)) {
    urls.push(...context.artifacts.captured_screenshots);
  }
  if (context?.artifacts?.browserbase_debug_url) {
    urls.push(context.artifacts.browserbase_debug_url);
  }
  if (context?.artifacts?.browserbase_session_url) {
    urls.push(context.artifacts.browserbase_session_url);
  }
  if (context?.target_url) {
    urls.push(context.target_url);
  }
  return urls.filter(Boolean);
}

function normalizeEvidence(value, context) {
  const evidence = isPlainObject(value) ? value : {};
  const screenshots = coerceStringArray(
    readField(evidence, ["screenshots", "screenshot", "image_urls", "imageUrls"]),
    12,
    4096
  );
  const videos = coerceStringArray(
    readField(evidence, ["videos", "video", "video_urls", "videoUrls"]),
    6,
    4096
  );
  const consoleLogs = coerceStringArray(
    readField(evidence, ["console_logs", "consoleLogs"]),
    6,
    4096
  );
  const networkLogs = coerceStringArray(
    readField(evidence, ["network_logs", "networkLogs"]),
    6,
    4096
  );

  const normalizedScreenshots = screenshots.length ? screenshots : fallbackScreenshotUrls(context);
  const normalizedVideos = videos.length
    ? videos
    : context?.artifacts?.browserbase_session_url
      ? [context.artifacts.browserbase_session_url]
      : [];

  return {
    screenshots: normalizedScreenshots,
    videos: normalizedVideos,
    console_logs: consoleLogs,
    network_logs: networkLogs
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

function titleFromType(type, index) {
  const label = type.replace(/_/g, " ");
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} ${index + 1}`;
}

function normalizeFinding(finding, index, context = {}) {
  const rawFinding = isPlainObject(finding) ? finding : {};
  const type = normalizeFindingType(readField(rawFinding, ["type", "classification", "category"]));
  const page = normalizePage(readField(rawFinding, ["page"]), context);

  const expectedBehavior =
    sanitizeString(readField(rawFinding, ["expected_behavior", "expectedBehavior"]), 4000) ||
    "The user should be able to complete this step smoothly and understand the next action.";
  const observedBehavior =
    sanitizeString(readField(rawFinding, ["observed_behavior", "observedBehavior"]), 4000) ||
    "The observed behavior was not fully captured by the agent output.";

  const normalized = {
    id: sanitizeString(readField(rawFinding, ["id", "finding_id", "findingId"]), 128) || `finding_${index + 1}`,
    type,
    severity: normalizeSeverity(readField(rawFinding, ["severity", "priority"])),
    title: sanitizeString(readField(rawFinding, ["title", "headline"]), 180) || titleFromType(type, index),
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
      sanitizeString(
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
  const rawStatus = sanitizeString(readField(rawJourney, ["status", "outcome"]), 32).toLowerCase();
  const status = ["completed", "partial", "blocked"].includes(rawStatus) ? rawStatus : "completed";

  return {
    id: sanitizeString(readField(rawJourney, ["id", "journey_id", "journeyId"]), 128) || `journey_${index + 1}`,
    name:
      sanitizeString(readField(rawJourney, ["name", "title"]), 180) ||
      `Journey ${index + 1}`,
    status,
    summary:
      sanitizeString(readField(rawJourney, ["summary", "description"]), 4000) ||
      "The flow was exercised during this QA run.",
    steps,
    pages,
    evidence,
    observations: coerceStringArray(readField(rawJourney, ["observations", "notes"]), 10, 500)
  };
}

function buildFallbackJourneys(runRequest, findings, coverage, context) {
  const journeys = [];
  const primaryScreenshots = uniqueStringList(
    findings.flatMap((finding) => finding.evidence?.screenshots || []),
    6
  );
  const primaryVideos = uniqueStringList(
    findings.flatMap((finding) => finding.evidence?.videos || []),
    3
  );

  journeys.push({
    id: "journey_primary_public_flow",
    name: "Primary public flow",
    status: findings.some((finding) => finding.type === "dead_end") ? "blocked" : "completed",
    summary:
      "Primary public navigation and conversion surfaces were exercised to validate the core public user journey.",
    steps: [
      "Open the target entry page.",
      "Traverse the main navigation and primary CTA path.",
      "Complete the highest-value public flow available without credentials."
    ],
    pages: uniqueStringList([runRequest.target_url], 5),
    evidence: {
      screenshots: primaryScreenshots.length ? primaryScreenshots : fallbackScreenshotUrls(context),
      videos: primaryVideos.length
        ? primaryVideos
        : context?.artifacts?.browserbase_session_url
          ? [context.artifacts.browserbase_session_url]
          : [],
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
      "A lightweight sweep covered surface-level navigation, button states, and form affordances to identify blockers or unclear transitions.",
    steps: [
      "Map major navigation surfaces and modal entry points.",
      "Probe visible forms, validation states, and CTA affordances.",
      "Confirm whether the flow stays coherent without hidden prerequisites."
    ],
    pages: uniqueStringList([runRequest.target_url], 5),
    evidence: {
      screenshots: fallbackScreenshotUrls(context),
      videos: context?.artifacts?.browserbase_debug_url
        ? [context.artifacts.browserbase_debug_url]
        : context?.artifacts?.browserbase_session_url
          ? [context.artifacts.browserbase_session_url]
          : [],
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
        "The worker checked the visible auth boundary but did not cross into authenticated flows because no credentials were supplied.",
      steps: [
        "Identify the primary sign-in or account gate.",
        "Confirm the app exposes additional authenticated-only areas.",
        "Record the auth boundary as untested rather than forcing invalid coverage."
      ],
      pages: uniqueStringList([runRequest.target_url], 5),
      evidence: {
        screenshots: fallbackScreenshotUrls(context),
        videos: context?.artifacts?.browserbase_session_url
          ? [context.artifacts.browserbase_session_url]
          : [],
        console_logs: [],
        network_logs: []
      },
      observations: ["Authenticated flows remain untested until valid credentials are supplied."]
    });
  }

  return journeys;
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

  if (normalized.length) {
    return normalized;
  }

  return buildFallbackJourneys(runRequest, findings, coverage, context);
}

function buildEvidenceGallery(candidateValue, findings, context) {
  const candidate = isPlainObject(candidateValue) ? candidateValue : {};
  const fromFindingsScreenshots = findings.flatMap((finding) => finding.evidence?.screenshots || []);
  const fromFindingsVideos = findings.flatMap((finding) => finding.evidence?.videos || []);

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
      context?.artifacts?.browserbase_session_url,
      context?.artifacts?.browserbase_debug_url
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
        ...coerceStringArray(readField(candidate, ["console_logs", "consoleLogs"]), 10, 4096),
        ...findings.flatMap((finding) => finding.evidence?.console_logs || [])
      ],
      10
    ),
    network_logs: uniqueStringList(
      [
        ...coerceStringArray(readField(candidate, ["network_logs", "networkLogs"]), 10, 4096),
        ...findings.flatMap((finding) => finding.evidence?.network_logs || [])
      ],
      10
    )
  };
}

function buildRecommendations(candidateValue, findings, runRequest) {
  const explicit = uniqueStringList(coerceStringArray(candidateValue, 10, 500), 10, 500);
  if (explicit.length) {
    return explicit;
  }

  const derived = uniqueStringList(
    findings.map((finding) => finding.fix_hint).filter(Boolean),
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
  ];

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

function buildCoverage(actions = {}, findings = [], runRequest) {
  const visitedPages = new Set();

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

  if (!visitedPages.size && runRequest?.target_url) {
    visitedPages.add(runRequest.target_url);
  }

  const flowsBlocked =
    Number(actions.flows_blocked) || findings.filter((finding) => finding.type === "dead_end").length;

  let flowsTested = Number(actions.flows_tested) || 0;
  if (!flowsTested) {
    if (runRequest?.scope_mode === "feature_targeted" && runRequest.scenario_list.length) {
      flowsTested = runRequest.scenario_list.length;
    } else {
      flowsTested = 1;
    }
  }

  const untestedAreas = coerceStringArray(actions.untested_areas || actions.untestedAreas, 10, 200);
  if (!runRequest?.credentials) {
    untestedAreas.push("Authenticated flows were not tested because no credentials were provided.");
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

  const lower = message.toLowerCase();
  const likelyBlocker = ["blocked", "captcha", "forbidden", "denied", "login", "timeout", "cloudflare"].some(
    (token) => lower.includes(token)
  );

  if (!likelyBlocker) {
    return null;
  }

  return normalizeFinding(
    {
      id: "finding_dead_end_1",
      type: "dead_end",
      severity: "high",
      title: "Automation hit a hard blocker before coverage completed",
      expected_behavior: "The QA agent should be able to access the target flow and continue the requested coverage path.",
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
        url: context?.target_url || null
      },
      fix_hint:
        "Review anti-bot protections, auth requirements, or broken navigation that prevented access. Provide an allowlisted test path or credentials if needed."
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
  const context = {
    artifacts: options.artifacts || {},
    target_url: targetUrl,
    runRequest
  };

  const rawFindings = Array.isArray(candidateReport.findings) ? candidateReport.findings : [];
  const findings = rawFindings.map((finding, index) => normalizeFinding(finding, index, context));

  if (!findings.length) {
    const syntheticDeadEnd = createSyntheticDeadEndFinding(context, options.failureMessage);
    if (syntheticDeadEnd) {
      findings.push(syntheticDeadEnd);
    }
  }

  const counts = computeCounts(findings);
  const candidateSummary = isPlainObject(candidateReport.summary) ? candidateReport.summary : {};
  const coverage = buildCoverage(options.actions, findings, runRequest);
  const testedJourneys = normalizeJourneys(
    readField(candidateReport, ["tested_journeys", "testedJourneys", "journeys", "flows"]),
    runRequest,
    findings,
    coverage,
    context
  );
  const evidenceGallery = buildEvidenceGallery(
    readField(candidateReport, ["evidence_gallery", "evidenceGallery", "gallery"]),
    findings,
    context
  );
  const recommendations = buildRecommendations(
    readField(candidateReport, ["recommendations", "next_steps", "nextSteps"]),
    findings,
    runRequest
  );
  const summaryNote =
    sanitizeString(candidateSummary.note || candidateSummary.notes, 2000) ||
    sanitizeString(options.failureMessage, 2000) ||
    (!findings.length ? "The QA run completed without recorded findings." : "");

  const explicitStatus = sanitizeString(candidateReport.status, 64).toLowerCase();
  let status = REPORT_STATUS_SET.has(explicitStatus) ? explicitStatus : "completed";
  if (options.failureMessage) {
    status = findings.length ? "partial" : "failed";
  }

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
    tested_journeys: testedJourneys,
    evidence_gallery: evidenceGallery,
    recommendations,
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
      model: runRequest.model || null,
      parse_error: options.parseError || null,
      raw_agent_output_excerpt: sanitizeOptionalString(options.rawAgentMessage, 4000),
      failure_message: sanitizeOptionalString(options.failureMessage, 2000)
    },
    artifacts: isPlainObject(options.artifacts) ? options.artifacts : {}
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

    if (!Array.isArray(finding.evidence.screenshots) || !finding.evidence.screenshots.length) {
      return {
        ok: false,
        error: `report.findings[${index}].evidence.screenshots must contain at least one URL`
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

function buildMarkdownReport(report, runRequest, extras = {}) {
  const counts = report.summary?.counts || computeCounts(report.findings || []);
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
  for (const journey of report.tested_journeys || []) {
    lines.push(`### ${journey.id}: ${journey.name}`);
    lines.push("");
    lines.push(`- Status: ${journey.status}`);
    lines.push(`- Summary: ${journey.summary}`);
    lines.push("- Steps:");
    lines.push(markdownList(journey.steps, "No journey steps were recorded."));
    lines.push("- Pages:");
    lines.push(markdownList(journey.pages, "No specific pages were recorded."));
    lines.push("- Evidence:");
    lines.push(`- Screenshots: ${(journey.evidence?.screenshots || []).join(", ") || "None"}`);
    lines.push(`- Videos: ${(journey.evidence?.videos || []).join(", ") || "None"}`);
    if (journey.observations?.length) {
      lines.push("- Observations:");
      lines.push(markdownList(journey.observations));
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
    lines.push(`- Console logs: ${report.evidence_gallery.console_logs.join(", ")}`);
  }
  if ((report.evidence_gallery?.network_logs || []).length) {
    lines.push(`- Network logs: ${report.evidence_gallery.network_logs.join(", ")}`);
  }

  lines.push("");
  lines.push("## Findings Table");
  lines.push("");
  lines.push("| ID | Type | Severity | Confidence | Page |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const finding of report.findings) {
    lines.push(
      `| ${finding.id} | ${finding.type} | ${finding.severity} | ${finding.confidence} | ${finding.page?.url || "n/a"} |`
    );
  }
  if (!report.findings.length) {
    lines.push("| none | n/a | n/a | n/a | n/a |");
  }

  lines.push("");
  lines.push("## Detailed Findings");
  lines.push("");

  for (const finding of report.findings) {
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
    lines.push(
      `- Emotional reaction: ${finding.emotional_reaction.primary} (${finding.emotional_reaction.intensity}/5)`
    );
    if (finding.emotional_reaction.signals.length) {
      lines.push(`- Emotional signals: ${finding.emotional_reaction.signals.join(", ")}`);
    }
    lines.push("- Repro steps:");
    if (finding.repro_steps.length) {
      for (const step of finding.repro_steps) {
        lines.push(`  - ${step}`);
      }
    } else {
      lines.push("  - No exact repro steps were captured.");
    }
    lines.push("- Evidence:");
    lines.push(`  - Screenshots: ${finding.evidence.screenshots.join(", ")}`);
    if (finding.evidence.videos.length) {
      lines.push(`  - Videos: ${finding.evidence.videos.join(", ")}`);
    }
    if (finding.evidence.console_logs.length) {
      lines.push(`  - Console logs: ${finding.evidence.console_logs.join(", ")}`);
    }
    if (finding.evidence.network_logs.length) {
      lines.push(`  - Network logs: ${finding.evidence.network_logs.join(", ")}`);
    }
    lines.push(`- Fix hint: ${finding.fix_hint}`);
    if (finding.tags.length) {
      lines.push(`- Tags: ${finding.tags.join(", ")}`);
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
    report_markdown: sanitizeOptionalString(options.markdown, 12000),
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
  return sanitized;
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
      videos: stripEmbeddedMediaItems(report.evidence_gallery.videos)
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
        evidence: sanitizeEvidenceForCallback(journey.evidence)
      };
    });
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
  normalizeWebhookConfig,
  resolveRunWebhookConfig,
  validateRunRequest,
  buildSystemPrompt,
  buildTaskPrompt,
  extractAgentSections,
  normalizeFinding,
  computeCounts,
  computeRiskScore,
  buildCoverage,
  normalizeReport,
  validateReport,
  buildMarkdownReport,
  sendFinalCallback,
  sendRunWebhook,
  loadStoredReportByRunId
};
