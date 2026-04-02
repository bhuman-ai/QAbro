const fs = require("fs");
const path = require("path");
const { isPlainObject, parseBoolean, sanitizeOptionalString, sanitizeString } = require("./qa-core");

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_MODEL = "gpt-5.4";
const DEFAULT_OPENAI_REASONING = "medium";
const DEFAULT_OPENAI_MAX_OUTPUT_TOKENS = 6400;
const DEFAULT_REPLICATE_BASE_URL = "https://api.replicate.com/v1";
const DEFAULT_REPLICATE_MODEL = "google/nano-banana-2";
const SUPPORTED_REFERENCE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const REPLICATE_SUPPORTED_ASPECT_RATIOS = new Set([
  "match_input_image",
  "1:1",
  "1:4",
  "1:8",
  "2:3",
  "3:2",
  "3:4",
  "4:1",
  "4:3",
  "4:5",
  "5:4",
  "8:1",
  "9:16",
  "16:9",
  "21:9"
]);

const GENERATABLE_IMAGE_ASSET_TYPES = new Set(["logo", "icon", "cover_image", "banner", "og_image", "social_card"]);
const MANUAL_ONLY_ASSET_TYPES = new Set(["screenshots", "video", "team_photos", "founder_headshots", "office_photos"]);
const DEFAULT_ASPECT_RATIOS = Object.freeze({
  logo: "1:1",
  icon: "1:1",
  cover_image: "16:9",
  banner: "16:9",
  og_image: "1.91:1",
  social_card: "16:9"
});

function sanitizeStringList(values, maxItems = 20, maxLength = 240) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => sanitizeString(value, maxLength))
        .filter(Boolean)
    )
  ).slice(0, maxItems);
}

function normalizeOpenAiBaseUrl(rawUrl) {
  const safeValue = sanitizeOptionalString(rawUrl, 4096);
  return safeValue ? safeValue.replace(/\/+$/, "") : DEFAULT_OPENAI_BASE_URL;
}

function normalizeReplicateBaseUrl(rawUrl) {
  const safeValue = sanitizeOptionalString(rawUrl, 4096);
  return safeValue ? safeValue.replace(/\/+$/, "") : DEFAULT_REPLICATE_BASE_URL;
}

function normalizeAssetMap(value) {
  const source = isPlainObject(value) ? value : {};
  const normalized = {};
  for (const [rawKey, rawValue] of Object.entries(source)) {
    const key = sanitizeString(rawKey, 120);
    if (!key) {
      continue;
    }
    normalized[key] = Array.from(
      new Set(
        (Array.isArray(rawValue) ? rawValue : rawValue ? [rawValue] : [])
          .map((item) => normalizeAssetRef(item))
          .filter(Boolean)
      )
    ).slice(0, 20);
  }
  return normalized;
}

function normalizeAssetRef(value) {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return sanitizeString(value, 4096);
  }
  if (isPlainObject(value)) {
    return (
      sanitizeOptionalString(value.url || value.href || value.src || value.path || value.local_path, 4096) || ""
    );
  }
  return sanitizeString(value, 4096);
}

function buildGeneratorConfig(jobRequest = {}, options = {}) {
  const metadata = isPlainObject(jobRequest.metadata) ? jobRequest.metadata : {};

  const builtinEnabled =
    metadata.asset_generation_builtin === undefined &&
    metadata.assetGenerationBuiltin === undefined &&
    options.assetGenerationBuiltin === undefined &&
    process.env.SUBMISSION_ASSET_GENERATOR_BUILTIN === undefined
      ? true
      : parseBoolean(
          metadata.asset_generation_builtin ??
            metadata.assetGenerationBuiltin ??
            options.assetGenerationBuiltin ??
            process.env.SUBMISSION_ASSET_GENERATOR_BUILTIN
        ) !== false;

  const openAiApiKey = sanitizeString(
    metadata.asset_generation_openai_api_key ||
      metadata.assetGenerationOpenAiApiKey ||
      options.assetGenerationOpenAiApiKey ||
      process.env.SUBMISSION_ASSET_OPENAI_API_KEY ||
      process.env.OPENAI_API_KEY,
    4096
  );
  const openAiModel =
    sanitizeString(
      metadata.asset_generation_openai_model ||
        metadata.assetGenerationOpenAiModel ||
        options.assetGenerationOpenAiModel ||
        process.env.SUBMISSION_ASSET_OPENAI_MODEL,
      128
    ) || DEFAULT_OPENAI_MODEL;
  const openAiBaseUrl = normalizeOpenAiBaseUrl(
    metadata.asset_generation_openai_base_url ||
      metadata.assetGenerationOpenAiBaseUrl ||
      options.assetGenerationOpenAiBaseUrl ||
      process.env.SUBMISSION_ASSET_OPENAI_BASE_URL ||
      process.env.OPENAI_BASE_URL
  );
  const openAiReasoning =
    sanitizeString(
      metadata.asset_generation_openai_reasoning ||
        metadata.assetGenerationOpenAiReasoning ||
        options.assetGenerationOpenAiReasoning ||
        process.env.SUBMISSION_ASSET_OPENAI_REASONING,
      32
    ) || DEFAULT_OPENAI_REASONING;
  const openAiTimeoutMs = Math.max(
    5000,
    Math.min(
      300000,
      Number(
        metadata.asset_generation_openai_timeout_ms ||
          metadata.assetGenerationOpenAiTimeoutMs ||
          options.assetGenerationOpenAiTimeoutMs ||
          process.env.SUBMISSION_ASSET_OPENAI_TIMEOUT_MS
      ) || 90000
    )
  );
  const openAiMaxOutputTokens = Math.max(
    1000,
    Math.min(
      12000,
      Number(
        metadata.asset_generation_openai_max_output_tokens ||
          metadata.assetGenerationOpenAiMaxOutputTokens ||
          options.assetGenerationOpenAiMaxOutputTokens ||
          process.env.SUBMISSION_ASSET_OPENAI_MAX_OUTPUT_TOKENS
      ) || DEFAULT_OPENAI_MAX_OUTPUT_TOKENS
    )
  );

  const replicateApiKey = sanitizeString(
    metadata.asset_generation_replicate_api_key ||
      metadata.assetGenerationReplicateApiKey ||
      options.assetGenerationReplicateApiKey ||
      process.env.SUBMISSION_ASSET_REPLICATE_API_KEY ||
      process.env.REPLICATE_API_TOKEN,
    4096
  );
  const replicateModel =
    sanitizeString(
      metadata.asset_generation_replicate_model ||
        metadata.assetGenerationReplicateModel ||
        options.assetGenerationReplicateModel ||
        process.env.SUBMISSION_ASSET_REPLICATE_MODEL,
      256
    ) || DEFAULT_REPLICATE_MODEL;
  const replicateBaseUrl = normalizeReplicateBaseUrl(
    metadata.asset_generation_replicate_base_url ||
      metadata.assetGenerationReplicateBaseUrl ||
      options.assetGenerationReplicateBaseUrl ||
      process.env.SUBMISSION_ASSET_REPLICATE_BASE_URL ||
      process.env.REPLICATE_BASE_URL
  );
  const replicateTimeoutMs = Math.max(
    10000,
    Math.min(
      300000,
      Number(
        metadata.asset_generation_replicate_timeout_ms ||
          metadata.assetGenerationReplicateTimeoutMs ||
          options.assetGenerationReplicateTimeoutMs ||
          process.env.SUBMISSION_ASSET_REPLICATE_TIMEOUT_MS
      ) || 180000
    )
  );
  const replicateResolution =
    sanitizeString(
      metadata.asset_generation_replicate_resolution ||
        metadata.assetGenerationReplicateResolution ||
        options.assetGenerationReplicateResolution ||
        process.env.SUBMISSION_ASSET_REPLICATE_RESOLUTION,
      32
      ) || "1K";
  const replicateMaxAttempts = Math.max(
    1,
    Math.min(
      4,
      Number(
        metadata.asset_generation_replicate_max_attempts ||
          metadata.assetGenerationReplicateMaxAttempts ||
          options.assetGenerationReplicateMaxAttempts ||
          process.env.SUBMISSION_ASSET_REPLICATE_MAX_ATTEMPTS
      ) || 2
    )
  );

  return {
    builtinEnabled,
    openai: {
      enabled: builtinEnabled && Boolean(openAiApiKey),
      apiKey: openAiApiKey || "",
      model: openAiModel,
      baseUrl: openAiBaseUrl,
      reasoningEffort: openAiReasoning,
      timeoutMs: openAiTimeoutMs,
      maxOutputTokens: openAiMaxOutputTokens
    },
    replicate: {
      enabled: builtinEnabled && Boolean(replicateApiKey),
      apiKey: replicateApiKey || "",
      model: replicateModel,
      baseUrl: replicateBaseUrl,
      timeoutMs: replicateTimeoutMs,
      resolution: replicateResolution,
      maxAttempts: replicateMaxAttempts
    }
  };
}

function extractPalette(profile = {}) {
  const colors = [];
  const pushColors = (values) => {
    for (const value of Array.isArray(values) ? values : values ? [values] : []) {
      const safeValue = sanitizeString(value, 64);
      if (safeValue) {
        colors.push(safeValue);
      }
    }
  };

  pushColors(profile.colors);
  if (isPlainObject(profile.branding)) {
    pushColors(profile.branding.colors);
    pushColors(profile.branding.palette);
  }
  if (isPlainObject(profile.visual)) {
    pushColors(profile.visual.colors);
    pushColors(profile.visual.palette);
  }

  return sanitizeStringList(colors, 8, 64);
}

function extractBrandNarrative(brand = {}) {
  const profile = isPlainObject(brand.profile) ? brand.profile : {};
  return {
    audience: sanitizeString(profile.target_audience || profile.audience || profile.ideal_customer_profile, 1200) || "",
    positioning: sanitizeString(profile.positioning || profile.value_prop || profile.value_proposition, 1200) || "",
    tone: sanitizeString(profile.tone || profile.voice || profile.brand_voice, 800) || "",
    pricing_summary: sanitizeString(profile.pricing_summary || profile.pricing || profile.price_summary, 1200) || "",
    colors: extractPalette(profile),
    visual_style: sanitizeString(profile.visual_style || profile.design_direction || profile.art_direction, 800) || "",
    scraped_site_summary: sanitizeString(
      profile.scraped_site_summary ||
        profile.scraped_summary ||
        profile.site_scrape_summary ||
        profile.website_summary,
      4000
    ) || ""
  };
}

function summarizeSiteProfiles(siteProfiles = []) {
  return (Array.isArray(siteProfiles) ? siteProfiles : []).map((siteProfile) => {
    const profile = isPlainObject(siteProfile.profile) ? siteProfile.profile : {};
    return {
      site_id: sanitizeString(siteProfile.site_id, 128),
      site_name: sanitizeString(siteProfile.site_name, 180),
      category: sanitizeString(profile.category || siteProfile.category, 120) || "",
      submission_policy: sanitizeString(siteProfile.submission_policy, 64) || "assist",
      notes: sanitizeStringList(profile.notes || siteProfile.notes || [], 6, 220),
      fields: (Array.isArray(profile.fields) ? profile.fields : []).slice(0, 30).map((field) => ({
        label: sanitizeString(field.label, 180) || "",
        name: sanitizeString(field.name || field.hidden_name, 180) || "",
        type: sanitizeString(field.type || field.role || field.widget, 64) || "text",
        required: field.required === true,
        multiple: field.multiple === true
      })),
      asset_requirements: (Array.isArray(profile.asset_requirements) ? profile.asset_requirements : []).slice(0, 20).map((item) => ({
        asset_type: sanitizeString(item.asset_type, 120) || "",
        label: sanitizeString(item.label, 180) || "",
        required: item.required !== false,
        multiple: item.multiple === true,
        accept: sanitizeString(item.accept, 120) || ""
      }))
    };
  });
}

function buildGenerationTasks(payload = {}) {
  const siteProfiles = Array.isArray(payload.site_profiles) ? payload.site_profiles : [];
  const availableAssets = normalizeAssetMap(payload.available_assets);
  const tasks = new Map();
  const manualOnly = [];

  for (const siteProfile of siteProfiles) {
    const profile = isPlainObject(siteProfile.profile) ? siteProfile.profile : {};
    for (const assetRequirement of Array.isArray(profile.asset_requirements) ? profile.asset_requirements : []) {
      const assetType = sanitizeString(assetRequirement.asset_type, 120);
      if (!assetType) {
        continue;
      }

      const existing = Array.isArray(availableAssets[assetType]) ? availableAssets[assetType] : [];
      if (existing.length > 0) {
        continue;
      }

      if (MANUAL_ONLY_ASSET_TYPES.has(assetType)) {
        manualOnly.push({
          asset_type: assetType,
          site_id: sanitizeString(siteProfile.site_id, 128),
          site_name: sanitizeString(siteProfile.site_name, 180) || sanitizeString(siteProfile.site_id, 128),
          reason: `Missing ${assetType}; requires a real product or trust asset rather than AI fabrication.`
        });
        continue;
      }

      if (!GENERATABLE_IMAGE_ASSET_TYPES.has(assetType)) {
        continue;
      }

      if (!tasks.has(assetType)) {
        tasks.set(assetType, {
          asset_type: assetType,
          output_bucket: assetType,
          aspect_ratio: DEFAULT_ASPECT_RATIOS[assetType] || "16:9",
          required_for: [],
          labels: []
        });
      }
      const task = tasks.get(assetType);
      task.required_for.push(sanitizeString(siteProfile.site_id, 128));
      if (assetRequirement.label) {
        task.labels.push(sanitizeString(assetRequirement.label, 180));
      }
    }
  }

  return {
    tasks: Array.from(tasks.values()).map((task) => ({
      ...task,
      required_for: Array.from(new Set(task.required_for)).filter(Boolean),
      labels: Array.from(new Set(task.labels)).filter(Boolean)
    })),
    manual_only_requirements: manualOnly
  };
}

function guessMimeType(filePath, responseContentType = "") {
  const contentType = sanitizeString(responseContentType, 120).toLowerCase();
  if (contentType.startsWith("image/")) {
    return contentType;
  }
  const extension = path.extname(filePath || "").toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  if (extension === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

async function assetRefToDataUrl(assetRef, fetchImpl) {
  const safeRef = normalizeAssetRef(assetRef);
  if (!safeRef) {
    return null;
  }

  if (/^data:/i.test(safeRef)) {
    return safeRef;
  }

  if (/^https?:\/\//i.test(safeRef)) {
    const response = await fetchImpl(safeRef);
    if (!response.ok) {
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    const mimeType = guessMimeType(safeRef, response.headers.get("content-type"));
    return `data:${mimeType};base64,${Buffer.from(arrayBuffer).toString("base64")}`;
  }

  const localPath = path.isAbsolute(safeRef) ? safeRef : path.resolve(safeRef);
  if (!fs.existsSync(localPath)) {
    return null;
  }
  const buffer = fs.readFileSync(localPath);
  const mimeType = guessMimeType(localPath);
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

async function collectPlanningReferenceImages(payload = {}, fetchImpl) {
  const availableAssets = normalizeAssetMap(payload.available_assets);
  const candidates = [
    ["Logo reference", availableAssets.logo?.[0]],
    ["Cover reference", availableAssets.cover_image?.[0]],
    ["Screenshot reference", availableAssets.screenshots?.[0]]
  ].filter((entry) => entry[1]);

  const images = [];
  for (const [label, assetRef] of candidates.slice(0, 3)) {
    const dataUrl = await assetRefToDataUrl(assetRef, fetchImpl).catch(() => null);
    if (isSupportedReferenceDataUrl(dataUrl)) {
      images.push({ label, image_url: dataUrl });
    }
  }
  return images;
}

function isSupportedReferenceDataUrl(dataUrl) {
  const safeValue = sanitizeOptionalString(dataUrl, 10000000) || "";
  const match = safeValue.match(/^data:([^;,]+)[;,]/i);
  if (!match) {
    return false;
  }
  return SUPPORTED_REFERENCE_MIME_TYPES.has(String(match[1]).toLowerCase());
}

function extractResponsesText(payload) {
  if (payload && typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  if (payload && typeof payload.output_text?.text === "string" && payload.output_text.text.trim()) {
    return payload.output_text.text.trim();
  }
  const output = Array.isArray(payload?.output) ? payload.output : [];
  const parts = [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.text === "string" && part.text.trim()) {
        parts.push(part.text);
        continue;
      }
      if (typeof part?.text?.value === "string" && part.text.value.trim()) {
        parts.push(part.text.value);
        continue;
      }
      if (typeof part?.arguments === "string" && part.arguments.trim()) {
        parts.push(part.arguments);
        continue;
      }
      if (typeof part?.json === "string" && part.json.trim()) {
        parts.push(part.json);
      }
    }
  }
  return parts.join("\n").trim();
}

function extractStructuredResponsesPayload(payload) {
  if (isPlainObject(payload?.output_parsed)) {
    return payload.output_parsed;
  }
  if (isPlainObject(payload?.parsed)) {
    return payload.parsed;
  }

  const output = Array.isArray(payload?.output) ? payload.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (isPlainObject(part?.parsed)) {
        return part.parsed;
      }
      if (isPlainObject(part?.json)) {
        return part.json;
      }
      if (typeof part?.arguments === "string") {
        const parsedArguments = parseStructuredOutput(part.arguments);
        if (isPlainObject(parsedArguments)) {
          return parsedArguments;
        }
      }
      if (typeof part?.text === "string") {
        const parsedText = parseStructuredOutput(part.text);
        if (isPlainObject(parsedText)) {
          return parsedText;
        }
      }
      if (typeof part?.text?.value === "string") {
        const parsedTextValue = parseStructuredOutput(part.text.value);
        if (isPlainObject(parsedTextValue)) {
          return parsedTextValue;
        }
      }
    }
  }

  return null;
}

function parseStructuredOutput(text) {
  const safeText = sanitizeOptionalString(text, 60000) || "";
  if (!safeText) {
    return null;
  }
  try {
    return JSON.parse(safeText);
  } catch {
    const firstBrace = safeText.indexOf("{");
    const lastBrace = safeText.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(safeText.slice(firstBrace, lastBrace + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function buildPlanningContext(payload = {}, generationTasks = {}) {
  const brand = isPlainObject(payload.brand) ? payload.brand : {};
  const narrative = extractBrandNarrative(brand);
  return {
    brand: {
      brand_profile_id: sanitizeString(brand.brand_profile_id, 128),
      brand_key: sanitizeOptionalString(brand.brand_key, 256) || null,
      track: sanitizeString(brand.track, 64) || "custom",
      display_name: sanitizeString(brand.display_name, 180),
      legal_name: sanitizeOptionalString(brand.legal_name, 240) || null,
      website_url: sanitizeOptionalString(brand.website_url, 4096) || null,
      summary: sanitizeString(brand.summary, 1000) || "",
      description: sanitizeString(brand.description, 4000) || "",
      services: sanitizeStringList(brand.services || [], 20, 160),
      tags: sanitizeStringList(brand.tags || [], 20, 120),
      competitors: sanitizeStringList(brand.competitors || [], 12, 160),
      location: isPlainObject(brand.location)
        ? {
            city: sanitizeOptionalString(brand.location.city, 120) || null,
            state: sanitizeOptionalString(brand.location.state, 120) || null,
            country: sanitizeOptionalString(brand.location.country, 120) || null,
            service_areas: sanitizeStringList(brand.location.service_areas || [], 20, 120)
          }
        : {},
      contact: isPlainObject(brand.contact)
        ? {
            email: sanitizeOptionalString(brand.contact.email, 320) || null,
            phone: sanitizeOptionalString(brand.contact.phone, 120) || null
          }
        : {},
      links: isPlainObject(brand.links)
        ? {
            pricing_url: sanitizeOptionalString(brand.links.pricing_url, 4096) || null,
            demo_url: sanitizeOptionalString(brand.links.demo_url, 4096) || null,
            linkedin_url: sanitizeOptionalString(brand.links.linkedin_url, 4096) || null
          }
        : {},
      narrative
    },
    available_asset_buckets: Object.fromEntries(
      Object.entries(normalizeAssetMap(payload.available_assets)).map(([key, refs]) => [key, refs.length])
    ),
    requested_site_ids: sanitizeStringList(payload.requested_site_ids || [], 30, 128),
    generation_tasks: Array.isArray(generationTasks.tasks) ? generationTasks.tasks : [],
    manual_only_requirements: Array.isArray(generationTasks.manual_only_requirements)
      ? generationTasks.manual_only_requirements
      : [],
    site_profiles: summarizeSiteProfiles(payload.site_profiles)
  };
}

function buildPlannerSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      copy_pack: {
        type: "object",
        additionalProperties: false,
        properties: {
          one_liner_60: { type: "string" },
          blurb_160: { type: "string" },
          blurb_280: { type: "string" },
          about_500: { type: "string" },
          long_description_1000: { type: "string" },
          target_market_description: { type: "string" },
          ideal_customer_profile: { type: "string" },
          pricing_summary: { type: "string" },
          categories: { type: "array", items: { type: "string" } },
          services: { type: "array", items: { type: "string" } }
        },
        required: [
          "one_liner_60",
          "blurb_160",
          "blurb_280",
          "about_500",
          "long_description_1000",
          "target_market_description",
          "ideal_customer_profile",
          "pricing_summary",
          "categories",
          "services"
        ]
      },
      factual_pack: {
        type: "object",
        additionalProperties: false,
        properties: {
          legal_name: { type: "string" },
          website_url: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          linkedin_url: { type: "string" },
          city: { type: "string" },
          state: { type: "string" },
          country: { type: "string" },
          competitors: { type: "array", items: { type: "string" } },
          service_areas: { type: "array", items: { type: "string" } }
        },
        required: [
          "legal_name",
          "website_url",
          "email",
          "phone",
          "linkedin_url",
          "city",
          "state",
          "country",
          "competitors",
          "service_areas"
        ]
      },
      site_plans: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            site_id: { type: "string" },
            notes: { type: "string" },
            field_overrides: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  field_label: { type: "string" },
                  field_name: { type: "string" },
                  suggested_value: { type: "string" }
                },
                required: ["field_label", "field_name", "suggested_value"]
              }
            }
          },
          required: ["site_id", "notes", "field_overrides"]
        }
      },
      asset_plans: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            asset_type: { type: "string" },
            output_bucket: { type: "string" },
            should_generate: { type: "boolean" },
            reason: { type: "string" },
            prompt: { type: "string" },
            negative_prompt: { type: "string" },
            aspect_ratio: { type: "string" },
            variants: { type: "integer" },
            required_for: { type: "array", items: { type: "string" } },
            use_reference_assets: { type: "array", items: { type: "string" } }
          },
          required: [
            "asset_type",
            "output_bucket",
            "should_generate",
            "reason",
            "prompt",
            "negative_prompt",
            "aspect_ratio",
            "variants",
            "required_for",
            "use_reference_assets"
          ]
        }
      },
      notes: { type: "array", items: { type: "string" } }
    },
    required: ["copy_pack", "factual_pack", "site_plans", "asset_plans", "notes"]
  };
}

async function callOpenAiPlanner(config, planningContext, planningImages = [], fetchImpl = globalThis.fetch) {
  if (!config.openai.enabled) {
    return { ok: false, skipped: true, error: "OpenAI asset planner is not configured." };
  }
  if (typeof fetchImpl !== "function") {
    return { ok: false, skipped: false, error: "fetch is not available for OpenAI planning." };
  }

  const systemPrompt = [
    "You are a launch asset generation planner for directory distribution.",
    "Use only the provided brand facts and site requirements.",
    "Do not invent unverifiable trust assets such as team photos, office photos, testimonials, customer logos, awards, or screenshots of product UI that are not clearly grounded in the provided inputs.",
    "You may create marketing copy, target-market descriptions, positioning copy, and prompts for generatable visual assets such as a logo refresh, icon, cover image, OG card, or banner.",
    "For site-specific field_overrides, prefer the actual field labels/names provided in the site profile.",
    "Keep copy concise, specific, and submission-ready.",
    "If a value is unknown, return an empty string rather than fabricating.",
    "If an asset should not be generated, set should_generate=false and explain why in reason."
  ].join(" ");

  const userContent = [
    { type: "input_text", text: `Planning context JSON:\n${JSON.stringify(planningContext, null, 2)}` }
  ];
  for (const image of planningImages) {
    userContent.push({ type: "input_text", text: image.label });
    userContent.push({ type: "input_image", image_url: image.image_url });
  }

  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), config.openai.timeoutMs) : null;
  try {
    const response = await fetchImpl(`${config.openai.baseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openai.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.openai.model,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: systemPrompt }]
          },
          {
            role: "user",
            content: userContent
          }
        ],
        reasoning: { effort: config.openai.reasoningEffort },
        text: {
          format: {
            type: "json_schema",
            name: "submission_asset_plan",
            schema: buildPlannerSchema()
          }
        },
        max_output_tokens: config.openai.maxOutputTokens,
        store: false
      }),
      ...(controller ? { signal: controller.signal } : {})
    });

    const raw = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        skipped: false,
        error: `OpenAI asset planner failed (${response.status}): ${raw.slice(0, 500)}`
      };
    }

    let payload = {};
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = {};
    }
    const structuredPayload = extractStructuredResponsesPayload(payload);
    if (isPlainObject(structuredPayload)) {
      return { ok: true, skipped: false, payload: structuredPayload };
    }

    const parsed = parseStructuredOutput(extractResponsesText(payload));
    if (!isPlainObject(parsed)) {
      const incompleteReason = sanitizeString(payload?.incomplete_details?.reason, 120);
      return {
        ok: false,
        skipped: false,
        error: incompleteReason
          ? `OpenAI asset planner returned invalid structured output (${incompleteReason}). Raw response: ${sanitizeString(raw, 1200)}`
          : `OpenAI asset planner returned invalid structured output. Raw response: ${sanitizeString(raw, 1200)}`
      };
    }

    return { ok: true, skipped: false, payload: parsed };
  } catch (error) {
    if (error?.name === "AbortError") {
      return { ok: false, skipped: false, error: `OpenAI asset planner timed out after ${config.openai.timeoutMs}ms` };
    }
    return { ok: false, skipped: false, error: error?.message || "OpenAI asset planner failed." };
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function extractReplicateOutputUrls(payload = {}) {
  const candidates = [];
  if (typeof payload.output === "string" && payload.output.trim()) {
    candidates.push(payload.output.trim());
  }
  if (Array.isArray(payload.output)) {
    for (const item of payload.output) {
      if (typeof item === "string" && item.trim()) {
        candidates.push(item.trim());
      } else if (isPlainObject(item) && typeof item.url === "string" && item.url.trim()) {
        candidates.push(item.url.trim());
      }
    }
  }
  return Array.from(new Set(candidates));
}

async function createReplicatePrediction(config, input, fetchImpl) {
  const normalizedModelPath = sanitizeString(config.replicate.model, 256).replace(/^\/+/, "").replace(/\/+$/, "");
  if (!normalizedModelPath.includes("/")) {
    return { ok: false, error: "Replicate model must be in owner/name format." };
  }

  const response = await fetchImpl(`${config.replicate.baseUrl}/models/${normalizedModelPath}/predictions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.replicate.apiKey}`,
      Prefer: "wait"
    },
    body: JSON.stringify({ input })
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    return {
      ok: false,
      error: `Replicate asset generation failed (${response.status}): ${sanitizeString(payload?.detail || payload?.error || "", 500)}`
    };
  }

  if (sanitizeString(payload?.status, 64).toLowerCase() === "succeeded") {
    return { ok: true, payload };
  }

  const pollUrl = sanitizeOptionalString(payload?.urls?.get, 4096);
  if (!pollUrl) {
    return { ok: true, payload };
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < config.replicate.timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const pollResponse = await fetchImpl(pollUrl, {
      headers: {
        Authorization: `Bearer ${config.replicate.apiKey}`
      }
    });
    let pollPayload = {};
    try {
      pollPayload = await pollResponse.json();
    } catch {
      pollPayload = {};
    }
    const status = sanitizeString(pollPayload?.status, 64).toLowerCase();
    if (status === "succeeded") {
      return { ok: true, payload: pollPayload };
    }
    if (status === "failed" || status === "canceled") {
      return {
        ok: false,
        error: sanitizeString(pollPayload?.error || `Replicate prediction ${status}`, 500) || `Replicate prediction ${status}`
      };
    }
  }

  return { ok: false, error: `Replicate asset generation timed out after ${config.replicate.timeoutMs}ms.` };
}

async function generateImageAssets(config, assetPlans = [], payload = {}, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") {
    return { generated_assets: {}, notes: ["fetch is not available for Replicate image generation."] };
  }

  const availableAssets = normalizeAssetMap(payload.available_assets);
  const generatedAssets = {};
  const notes = [];

  for (const assetPlan of Array.isArray(assetPlans) ? assetPlans : []) {
    const assetType = sanitizeString(assetPlan.asset_type, 120);
    const outputBucket = sanitizeString(assetPlan.output_bucket, 120) || assetType;
    if (!assetType || !outputBucket || assetPlan.should_generate !== true) {
      continue;
    }
    if (!config.replicate.enabled) {
      notes.push(`Skipped ${assetType} generation because Replicate is not configured.`);
      continue;
    }

    const referenceAssetTypes = sanitizeStringList(assetPlan.use_reference_assets || [], 6, 120);
    const referenceRefs = referenceAssetTypes.flatMap((key) => availableAssets[key] || []).slice(0, 3);
    const imageInput = [];
    for (const ref of referenceRefs) {
      const dataUrl = await assetRefToDataUrl(ref, fetchImpl).catch(() => null);
      if (isSupportedReferenceDataUrl(dataUrl)) {
        imageInput.push(dataUrl);
      }
    }

    const requestInput = {
      prompt: sanitizeString(assetPlan.prompt, 4000),
      resolution: config.replicate.resolution,
      aspect_ratio: normalizeReplicateAspectRatio(assetType, assetPlan.aspect_ratio),
      output_format: "png"
    };
    if (imageInput.length) {
      requestInput.image_input = imageInput;
    }

    let prediction = null;
    let lastError = "";
    for (let attemptIndex = 0; attemptIndex < config.replicate.maxAttempts; attemptIndex += 1) {
      prediction = await createReplicatePrediction(config, requestInput, fetchImpl);
      if (prediction.ok) {
        break;
      }
      lastError = sanitizeString(prediction.error, 500) || "Replicate prediction failed";
      if (!isRetryableReplicateError(lastError) || attemptIndex >= config.replicate.maxAttempts - 1) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attemptIndex + 1)));
    }

    if (!prediction?.ok) {
      notes.push(`Failed to generate ${assetType}: ${lastError || "Replicate prediction failed"}`);
      continue;
    }

    const outputUrls = extractReplicateOutputUrls(prediction.payload);
    if (!outputUrls.length) {
      notes.push(`Replicate did not return an output URL for ${assetType}.`);
      continue;
    }

    generatedAssets[outputBucket] = Array.from(
      new Set([...(Array.isArray(generatedAssets[outputBucket]) ? generatedAssets[outputBucket] : []), ...outputUrls])
    ).slice(0, Math.max(1, Math.min(4, Number(assetPlan.variants) || 1)));
  }

  return { generated_assets: generatedAssets, notes };
}

function normalizeReplicateAspectRatio(assetType, value) {
  const requested = sanitizeString(value, 32);
  if (requested && REPLICATE_SUPPORTED_ASPECT_RATIOS.has(requested)) {
    return requested;
  }
  const fallback = DEFAULT_ASPECT_RATIOS[assetType] || "16:9";
  if (REPLICATE_SUPPORTED_ASPECT_RATIOS.has(fallback)) {
    return fallback;
  }
  return "16:9";
}

function isRetryableReplicateError(message) {
  const safeMessage = sanitizeString(message, 500).toLowerCase();
  if (!safeMessage) {
    return false;
  }
  return (
    safeMessage.includes("service is currently unavailable") ||
    safeMessage.includes("temporarily unavailable") ||
    safeMessage.includes("try again later") ||
    safeMessage.includes("timed out") ||
    safeMessage.includes("internal server error") ||
    safeMessage.includes("prediction failed")
  );
}

function buildSitePlanMap(sitePlans = []) {
  const entries = new Map();
  for (const sitePlan of Array.isArray(sitePlans) ? sitePlans : []) {
    const siteId = sanitizeString(sitePlan?.site_id, 128).toLowerCase();
    if (!siteId) {
      continue;
    }
    entries.set(siteId, {
      site_id: siteId,
      notes: sanitizeString(sitePlan?.notes, 1000) || "",
      field_overrides: (Array.isArray(sitePlan?.field_overrides) ? sitePlan.field_overrides : []).map((item) => ({
        field_label: sanitizeString(item?.field_label, 180) || "",
        field_name: sanitizeString(item?.field_name, 180) || "",
        suggested_value: sanitizeString(item?.suggested_value, 4000) || ""
      }))
    });
  }
  return Object.fromEntries(entries);
}

async function generateSubmissionAssets(jobRequest = {}, payload = {}, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const config = buildGeneratorConfig(jobRequest, options);
  if (!config.builtinEnabled) {
    return { ok: false, skipped: true, error: "Built-in asset generation is disabled." };
  }
  if (!config.openai.enabled) {
    return { ok: false, skipped: true, error: "OpenAI asset planner is not configured." };
  }

  const generationTasks = buildGenerationTasks(payload);
  const planningContext = buildPlanningContext(payload, generationTasks);
  const planningImages = await collectPlanningReferenceImages(payload, fetchImpl).catch(() => []);
  const plannerResult = await callOpenAiPlanner(config, planningContext, planningImages, fetchImpl);
  if (!plannerResult.ok) {
    return plannerResult;
  }

  const plannerPayload = isPlainObject(plannerResult.payload) ? plannerResult.payload : {};
  const imageGeneration = await generateImageAssets(
    config,
    plannerPayload.asset_plans,
    payload,
    fetchImpl
  );

  return {
    ok: true,
    skipped: false,
    response: {
      provider: "builtin_openai_replicate",
      copy_pack: isPlainObject(plannerPayload.copy_pack) ? plannerPayload.copy_pack : {},
      factual_pack: isPlainObject(plannerPayload.factual_pack) ? plannerPayload.factual_pack : {},
      generated_assets: imageGeneration.generated_assets || {},
      site_plans: buildSitePlanMap(plannerPayload.site_plans),
      asset_plans: Array.isArray(plannerPayload.asset_plans) ? plannerPayload.asset_plans : [],
      notes: [
        ...sanitizeStringList(plannerPayload.notes || [], 20, 500),
        ...sanitizeStringList(imageGeneration.notes || [], 20, 500),
        ...sanitizeStringList(
          (generationTasks.manual_only_requirements || []).map((item) => item.reason),
          20,
          500
        )
      ],
      generation_meta: {
        openai_model: config.openai.model,
        replicate_model: config.replicate.enabled ? config.replicate.model : null,
        planning_reference_image_count: planningImages.length,
        planned_asset_count: Array.isArray(plannerPayload.asset_plans) ? plannerPayload.asset_plans.length : 0,
        generated_asset_count: Object.values(normalizeAssetMap(imageGeneration.generated_assets)).reduce(
          (sum, refs) => sum + refs.length,
          0
        )
      }
    }
  };
}

module.exports = {
  buildGeneratorConfig,
  buildGenerationTasks,
  buildPlanningContext,
  generateSubmissionAssets,
  __private: {
    buildPlannerSchema,
    buildSitePlanMap,
    callOpenAiPlanner,
    extractStructuredResponsesPayload,
    extractReplicateOutputUrls,
    extractResponsesText,
    generateImageAssets,
    isRetryableReplicateError,
    normalizeReplicateAspectRatio,
    normalizeAssetMap,
    parseStructuredOutput
  }
};
