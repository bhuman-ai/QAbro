const {
  ALLOWED_OTP_MODES,
  isPlainObject,
  normalizeUrl,
  parseBoolean,
  sanitizeOptionalString,
  sanitizeString,
  normalizeWebhookConfig
} = require("./qa-core");
const { buildSubmissionIdentityInput, hasSubmissionIdentity } = require("./submission-identity");

const DEFAULT_SUBMISSION_SOURCE = "submission_bot";
const SUBMISSION_JOB_TYPE_RECON = "directory_recon";
const SUBMISSION_JOB_TYPE_ASSET_PREPARE = "asset_prepare";
const SUBMISSION_JOB_TYPE_SUBMIT = "directory_submit";
const SUBMISSION_JOB_TYPES = new Set(["directory_recon", "asset_prepare", "directory_submit"]);
const SUBMISSION_POLICIES = new Set(["auto", "assist", "manual"]);
const SUBMISSION_OTP_MODE_SET = new Set(ALLOWED_OTP_MODES);
const SUBMISSION_JOB_STATUSES = new Set([
  "queued",
  "processing",
  "retryable",
  "paused",
  "completed",
  "failed",
  "cancelled"
]);

function sanitizeMetadata(value) {
  if (!isPlainObject(value)) {
    return {};
  }

  const sanitized = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = sanitizeString(rawKey, 64);
    if (!key) {
      continue;
    }

    if (rawValue === null) {
      sanitized[key] = null;
      continue;
    }

    if (["string", "number", "boolean"].includes(typeof rawValue)) {
      sanitized[key] = rawValue;
      continue;
    }

    if (Array.isArray(rawValue)) {
      sanitized[key] = rawValue
        .slice(0, 50)
        .map((item) => {
          if (item === null || ["string", "number", "boolean"].includes(typeof item)) {
            return item;
          }
          return sanitizeString(item, 500);
        });
      continue;
    }

    if (isPlainObject(rawValue)) {
      sanitized[key] = JSON.parse(JSON.stringify(rawValue));
      continue;
    }

    sanitized[key] = sanitizeString(rawValue, 500);
  }

  return sanitized;
}

function sanitizeStructuredValue(value, depth = 0) {
  if (depth > 6) {
    return null;
  }
  if (value === null) {
    return null;
  }
  if (typeof value === "string") {
    return sanitizeString(value, 4000);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitizeStructuredValue(item, depth + 1));
  }
  if (isPlainObject(value)) {
    const output = {};
    for (const [rawKey, rawValue] of Object.entries(value)) {
      const key = sanitizeString(rawKey, 128);
      if (!key) {
        continue;
      }
      output[key] = sanitizeStructuredValue(rawValue, depth + 1);
    }
    return output;
  }
  return sanitizeString(value, 4000);
}

function sanitizeTrack(value) {
  const track = sanitizeString(value, 64).toLowerCase();
  return track || "custom";
}

function sanitizeSubmissionPolicy(value, fallbackValue = "assist") {
  const policy = sanitizeString(value, 64).toLowerCase();
  if (SUBMISSION_POLICIES.has(policy)) {
    return policy;
  }
  return fallbackValue;
}

function sanitizePriority(value, fallbackValue = 100) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallbackValue;
  }
  return Math.max(1, Math.min(1000, Math.floor(numeric)));
}

function sanitizeMaxAttempts(value, fallbackValue = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallbackValue;
  }
  return Math.max(1, Math.min(10, Math.floor(numeric)));
}

function sanitizeJobStatus(value, fallbackValue = "queued") {
  const status = sanitizeString(value, 64).toLowerCase();
  if (SUBMISSION_JOB_STATUSES.has(status)) {
    return status;
  }
  return fallbackValue;
}

function sanitizeJobType(value, fallbackValue = SUBMISSION_JOB_TYPE_RECON) {
  const type = sanitizeString(value, 64).toLowerCase();
  if (SUBMISSION_JOB_TYPES.has(type)) {
    return type;
  }
  return fallbackValue;
}

function parseSiteIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((item) => sanitizeString(item, 128).toLowerCase())
        .filter(Boolean)
    )
  );
}

function sanitizeSubmissionCredentials(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (!isPlainObject(value)) {
    return { error: "credentials must be an object when provided" };
  }

  const otpMode = sanitizeString(value.otp_mode || value.otpMode, 64).toLowerCase();
  const normalizedOtpMode = otpMode || "none";
  if (!SUBMISSION_OTP_MODE_SET.has(normalizedOtpMode)) {
    return {
      error: `credentials.otp_mode must be one of ${ALLOWED_OTP_MODES.join(", ")}`
    };
  }

  const loginUrl = value.login_url || value.loginUrl;
  const normalizedLoginUrl = loginUrl ? normalizeUrl(loginUrl) : null;
  if (loginUrl && !normalizedLoginUrl) {
    return { error: "credentials.login_url must be a valid http or https URL" };
  }

  return {
    value: {
      login_url: normalizedLoginUrl,
      username: sanitizeOptionalString(value.username, 320) || null,
      password: sanitizeOptionalString(value.password, 320) || null,
      otp_mode: normalizedOtpMode
    }
  };
}

function collectSelfHostedAutomationMetadata(body) {
  if (!isPlainObject(body)) {
    return {};
  }

  const metadata = {};
  const assignString = (key, ...values) => {
    for (const value of values) {
      const normalized = sanitizeOptionalString(value, 4096);
      if (normalized) {
        metadata[key] = normalized;
        return;
      }
    }
  };
  const assignBoolean = (key, ...values) => {
    for (const value of values) {
      if (value !== undefined) {
        metadata[key] = parseBoolean(value);
        return;
      }
    }
  };
  const assignNumber = (key, min, max, ...values) => {
    for (const value of values) {
      if (value === undefined) {
        continue;
      }
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        metadata[key] = Math.max(min, Math.min(max, Math.floor(numeric)));
        return;
      }
    }
  };
  const assignFloat = (key, min, max, ...values) => {
    for (const value of values) {
      if (value === undefined) {
        continue;
      }
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        metadata[key] = Math.max(min, Math.min(max, numeric));
        return;
      }
    }
  };
  const assignStructured = (key, ...values) => {
    for (const value of values) {
      if (isPlainObject(value) || Array.isArray(value)) {
        metadata[key] = sanitizeStructuredValue(value);
        return;
      }
    }
  };

  assignBoolean(
    "self_hosted_headless",
    body.self_hosted_headless,
    body.selfHostedHeadless,
    body.do_headless,
    body.doHeadless
  );
  assignString(
    "self_hosted_browser_channel",
    body.self_hosted_browser_channel,
    body.selfHostedBrowserChannel,
    body.do_browser_channel,
    body.doBrowserChannel
  );
  assignString(
    "self_hosted_profile_root_dir",
    body.self_hosted_profile_root_dir,
    body.selfHostedProfileRootDir,
    body.do_profile_root_dir,
    body.doProfileRootDir
  );
  assignString(
    "self_hosted_profile_namespace",
    body.self_hosted_profile_namespace,
    body.selfHostedProfileNamespace,
    body.do_profile_namespace,
    body.doProfileNamespace
  );
  assignNumber(
    "self_hosted_browser_launch_timeout_ms",
    1000,
    120000,
    body.self_hosted_browser_launch_timeout_ms,
    body.selfHostedBrowserLaunchTimeoutMs,
    body.do_browser_launch_timeout_ms,
    body.doBrowserLaunchTimeoutMs
  );
  assignString(
    "self_hosted_proxy_server",
    body.self_hosted_proxy_server,
    body.selfHostedProxyServer,
    body.proxy_server,
    body.proxyServer,
    body.proxy_url,
    body.proxyUrl
  );
  assignString(
    "self_hosted_proxy_username",
    body.self_hosted_proxy_username,
    body.selfHostedProxyUsername,
    body.proxy_username,
    body.proxyUsername
  );
  assignString(
    "self_hosted_proxy_password",
    body.self_hosted_proxy_password,
    body.selfHostedProxyPassword,
    body.proxy_password,
    body.proxyPassword
  );
  assignString(
    "self_hosted_proxy_bypass",
    body.self_hosted_proxy_bypass,
    body.selfHostedProxyBypass,
    body.proxy_bypass,
    body.proxyBypass
  );
  assignBoolean(
    "submission_proxy_auto_select",
    body.submission_proxy_auto_select,
    body.submissionProxyAutoSelect,
    body.self_hosted_proxy_auto_select,
    body.selfHostedProxyAutoSelect,
    body.proxy_auto_select,
    body.proxyAutoSelect
  );
  assignBoolean(
    "submission_proxy_require_geo_match",
    body.submission_proxy_require_geo_match,
    body.submissionProxyRequireGeoMatch,
    body.self_hosted_proxy_require_geo_match,
    body.selfHostedProxyRequireGeoMatch,
    body.proxy_require_geo_match,
    body.proxyRequireGeoMatch
  );
  assignBoolean(
    "submission_proxy_rotation_enabled",
    body.submission_proxy_rotation_enabled,
    body.submissionProxyRotationEnabled,
    body.proxy_rotation_enabled,
    body.proxyRotationEnabled
  );
  assignNumber(
    "submission_proxy_max_attempts",
    1,
    10,
    body.submission_proxy_max_attempts,
    body.submissionProxyMaxAttempts,
    body.submission_proxy_max_rotations,
    body.submissionProxyMaxRotations,
    body.proxy_max_attempts,
    body.proxyMaxAttempts
  );
  assignNumber(
    "submission_proxy_attempt_index",
    0,
    100,
    body.submission_proxy_attempt_index,
    body.submissionProxyAttemptIndex,
    body.proxy_attempt_index,
    body.proxyAttemptIndex
  );
  assignString(
    "webshare_api_key",
    body.webshare_api_key,
    body.webshareApiKey
  );
  assignString(
    "webshare_api_base_url",
    normalizeUrl(body.webshare_api_base_url || body.webshareApiBaseUrl) ||
      sanitizeOptionalString(body.webshare_api_base_url || body.webshareApiBaseUrl, 4096)
  );
  assignString(
    "webshare_mode",
    body.webshare_mode,
    body.webshareMode
  );
  assignString(
    "self_hosted_user_agent",
    body.self_hosted_user_agent,
    body.selfHostedUserAgent,
    body.user_agent,
    body.userAgent
  );
  assignString(
    "self_hosted_locale",
    body.self_hosted_locale,
    body.selfHostedLocale,
    body.locale
  );
  assignString(
    "self_hosted_timezone_id",
    body.self_hosted_timezone_id,
    body.selfHostedTimezoneId,
    body.timezone_id,
    body.timezoneId
  );
  assignBoolean(
    "self_hosted_ignore_https_errors",
    body.self_hosted_ignore_https_errors,
    body.selfHostedIgnoreHttpsErrors,
    body.ignore_https_errors,
    body.ignoreHttpsErrors
  );
  assignStructured(
    "self_hosted_viewport",
    body.self_hosted_viewport,
    body.selfHostedViewport,
    body.viewport
  );
  assignStructured(
    "self_hosted_geolocation",
    body.self_hosted_geolocation,
    body.selfHostedGeolocation,
    body.geolocation
  );
  assignBoolean(
    "submission_stealth_mode",
    body.submission_stealth_mode,
    body.submissionStealthMode,
    body.self_hosted_stealth_mode,
    body.selfHostedStealthMode
  );
  assignBoolean(
    "submission_block_ads",
    body.submission_block_ads,
    body.submissionBlockAds,
    body.self_hosted_block_ads,
    body.selfHostedBlockAds
  );
  assignBoolean(
    "self_hosted_record_video",
    body.self_hosted_record_video,
    body.selfHostedRecordVideo,
    body.submission_record_video,
    body.submissionRecordVideo
  );
  assignString(
    "submission_captcha_strategy",
    body.submission_captcha_strategy,
    body.submissionCaptchaStrategy,
    body.captcha_strategy,
    body.captchaStrategy
  );
  assignString(
    "auth_policy",
    body.auth_policy,
    body.authPolicy
  );
  assignString(
    "auth_requirement",
    body.auth_requirement,
    body.authRequirement
  );
  assignBoolean(
    "auto_create_account",
    body.auto_create_account,
    body.autoCreateAccount
  );
  assignNumber(
    "captcha_builtin_wait_ms",
    0,
    300000,
    body.captcha_builtin_wait_ms,
    body.captchaBuiltInWaitMs
  );
  assignString(
    "twocaptcha_api_key",
    body.twocaptcha_api_key,
    body.two_captcha_api_key,
    body.twoCaptchaApiKey,
    body.captcha_api_key,
    body.captchaApiKey
  );
  assignString(
    "twocaptcha_api_base_url",
    normalizeUrl(body.twocaptcha_api_base_url || body.twoCaptchaApiBaseUrl || body.captcha_api_base_url) ||
      sanitizeOptionalString(
        body.twocaptcha_api_base_url || body.twoCaptchaApiBaseUrl || body.captcha_api_base_url,
        4096
      )
  );
  assignNumber(
    "twocaptcha_timeout_ms",
    10000,
    600000,
    body.twocaptcha_timeout_ms,
    body.twoCaptchaTimeoutMs
  );
  assignNumber(
    "twocaptcha_poll_interval_ms",
    1000,
    60000,
    body.twocaptcha_poll_interval_ms,
    body.twoCaptchaPollIntervalMs
  );
  assignNumber(
    "twocaptcha_post_inject_wait_ms",
    0,
    120000,
    body.twocaptcha_post_inject_wait_ms,
    body.twoCaptchaPostInjectWaitMs
  );
  assignNumber(
    "twocaptcha_max_attempts",
    1,
    4,
    body.twocaptcha_max_attempts,
    body.twoCaptchaMaxAttempts
  );
  assignNumber(
    "twocaptcha_retry_backoff_ms",
    0,
    30000,
    body.twocaptcha_retry_backoff_ms,
    body.twoCaptchaRetryBackoffMs
  );
  assignFloat(
    "twocaptcha_recaptcha_v3_min_score",
    0,
    1,
    body.twocaptcha_recaptcha_v3_min_score,
    body.twoCaptchaRecaptchaV3MinScore
  );
  assignString(
    "twocaptcha_recaptcha_v3_action",
    body.twocaptcha_recaptcha_v3_action,
    body.twoCaptchaRecaptchaV3Action
  );
  assignString(
    "captcha_hook_url",
    normalizeUrl(body.captcha_hook_url || body.captchaHookUrl) ||
      sanitizeOptionalString(body.captcha_hook_url || body.captchaHookUrl, 4096)
  );
  assignBoolean(
    "captcha_hook_required",
    body.captcha_hook_required,
    body.captchaHookRequired
  );
  assignNumber(
    "captcha_hook_timeout_ms",
    1000,
    120000,
    body.captcha_hook_timeout_ms,
    body.captchaHookTimeoutMs
  );
  assignNumber(
    "captcha_hook_wait_ms",
    0,
    300000,
    body.captcha_hook_wait_ms,
    body.captchaHookWaitMs
  );
  assignStructured(
    "captcha_hook_headers",
    body.captcha_hook_headers,
    body.captchaHookHeaders
  );

  return metadata;
}

function validateReconRequest(body) {
  if (!isPlainObject(body)) {
    return { ok: false, error: "Invalid JSON body" };
  }

  const jobId = sanitizeString(body.job_id || body.jobId || body.run_id || body.runId, 128);
  if (!jobId) {
    return { ok: false, error: "job_id is required" };
  }

  const credentials = sanitizeSubmissionCredentials(body.credentials);
  if (credentials?.error) {
    return { ok: false, error: credentials.error };
  }

  const siteId = sanitizeString(body.site_id || body.siteId, 128).toLowerCase();
  if (!siteId) {
    return { ok: false, error: "site_id is required" };
  }

  const submitUrl = normalizeUrl(
    body.submit_url || body.submitUrl || body.target_url || body.targetUrl || body.url
  );
  if (!submitUrl) {
    return { ok: false, error: "submit_url must be a valid http or https URL" };
  }

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

  const metadata = sanitizeMetadata({
    ...(isPlainObject(body.metadata) ? body.metadata : {}),
    ...collectSelfHostedAutomationMetadata(body)
  });
  const jobType = sanitizeJobType(body.job_type || body.jobType, SUBMISSION_JOB_TYPE_RECON);
  if (jobType !== SUBMISSION_JOB_TYPE_RECON) {
    return { ok: false, error: "Only directory_recon is supported by this endpoint" };
  }

  const request = {
    job_id: jobId,
    job_type: SUBMISSION_JOB_TYPE_RECON,
    site_id: siteId,
    site_name: sanitizeString(body.site_name || body.siteName, 180) || siteId,
    track: sanitizeTrack(body.track || metadata.track),
    submit_url: submitUrl,
    source: sanitizeString(body.source, 64) || DEFAULT_SUBMISSION_SOURCE,
    priority: sanitizePriority(body.priority),
    max_attempts: sanitizeMaxAttempts(body.max_attempts || body.maxAttempts),
    stop_before_submit:
      parseBoolean(body.stop_before_submit ?? body.stopBeforeSubmit ?? metadata.stop_before_submit ?? true) !== false,
    dry_run: parseBoolean(body.dry_run || body.dryRun),
    credentials: credentials?.value || null,
    metadata,
    webhook: webhookConfig.webhook,
    received_at: new Date().toISOString()
  };

  return { ok: true, data: request };
}

function validateBrandProfileInput(body) {
  if (!isPlainObject(body)) {
    return { ok: false, error: "Invalid JSON body" };
  }

  const brandProfileId = sanitizeString(
    body.brand_profile_id || body.brandProfileId || body.brand_key || body.brandKey,
    128
  );
  if (!brandProfileId) {
    return { ok: false, error: "brand_profile_id is required" };
  }

  const displayName = sanitizeString(body.display_name || body.displayName || body.name, 180);
  if (!displayName) {
    return { ok: false, error: "display_name is required" };
  }

  const profileSource =
    isPlainObject(body.profile) ? body.profile : isPlainObject(body.brand_profile) ? body.brand_profile : {};

  const profile = {
    ...sanitizeStructuredValue(profileSource),
    ...(body.summary !== undefined ? { summary: sanitizeString(body.summary, 1000) } : {}),
    ...(body.description !== undefined ? { description: sanitizeString(body.description, 4000) } : {}),
    ...(Array.isArray(body.tags) ? { tags: parseSiteIds(body.tags.map((tag) => sanitizeString(tag, 128))) } : {}),
    ...(Array.isArray(body.services)
      ? {
          services: body.services
            .map((item) => sanitizeString(item, 180))
            .filter(Boolean)
            .slice(0, 50)
        }
      : {}),
    ...(isPlainObject(body.assets) ? { assets: sanitizeStructuredValue(body.assets) } : {})
  };
  const identity = buildSubmissionIdentityInput(profileSource, body);
  if (hasSubmissionIdentity(identity)) {
    profile.identity = identity;
  }

  const normalized = {
    brand_profile_id: brandProfileId,
    brand_key: sanitizeOptionalString(body.brand_key || body.brandKey, 256) || null,
    track: sanitizeTrack(body.track || profile.track),
    display_name: displayName,
    legal_name: sanitizeOptionalString(body.legal_name || body.legalName, 240) || null,
    website_url: normalizeUrl(body.website_url || body.websiteUrl || profile.website_url || profile.websiteUrl) ||
      sanitizeOptionalString(body.website_url || body.websiteUrl, 4096) ||
      null,
    profile
  };

  return { ok: true, data: normalized };
}

function validateAssetPrepareRequest(body) {
  if (!isPlainObject(body)) {
    return { ok: false, error: "Invalid JSON body" };
  }

  const jobId = sanitizeString(body.job_id || body.jobId || body.run_id || body.runId, 128);
  if (!jobId) {
    return { ok: false, error: "job_id is required" };
  }

  const brandProfileId = sanitizeString(body.brand_profile_id || body.brandProfileId, 128);
  if (!brandProfileId) {
    return { ok: false, error: "brand_profile_id is required" };
  }

  const siteIds = parseSiteIds(body.site_ids || body.siteIds);
  if (!siteIds.length) {
    return { ok: false, error: "site_ids is required" };
  }

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

  const metadata = sanitizeMetadata({
    ...(isPlainObject(body.metadata) ? body.metadata : {}),
    ...(body.asset_generation_hook_url !== undefined || body.assetGenerationHookUrl !== undefined
      ? {
          asset_generation_hook_url:
            normalizeUrl(body.asset_generation_hook_url || body.assetGenerationHookUrl) ||
            sanitizeString(body.asset_generation_hook_url || body.assetGenerationHookUrl, 4096)
        }
      : {}),
    ...(body.asset_generation_hook_required !== undefined || body.assetGenerationHookRequired !== undefined
      ? {
          asset_generation_hook_required: parseBoolean(
            body.asset_generation_hook_required ?? body.assetGenerationHookRequired
          )
        }
      : {}),
    ...(body.asset_generation_timeout_ms !== undefined || body.assetGenerationTimeoutMs !== undefined
      ? {
          asset_generation_timeout_ms: Math.max(
            1000,
            Math.min(120000, Number(body.asset_generation_timeout_ms || body.assetGenerationTimeoutMs) || 15000)
          )
        }
      : {}),
    ...(body.asset_generation_prefer_builtin !== undefined || body.assetGenerationPreferBuiltin !== undefined
      ? {
          asset_generation_prefer_builtin: parseBoolean(
            body.asset_generation_prefer_builtin ?? body.assetGenerationPreferBuiltin
          )
        }
      : {}),
    ...(body.asset_generation_builtin !== undefined || body.assetGenerationBuiltin !== undefined
      ? {
          asset_generation_builtin: parseBoolean(body.asset_generation_builtin ?? body.assetGenerationBuiltin)
        }
      : {}),
    ...(body.asset_generation_openai_api_key !== undefined || body.assetGenerationOpenAiApiKey !== undefined
      ? {
          asset_generation_openai_api_key: sanitizeString(
            body.asset_generation_openai_api_key || body.assetGenerationOpenAiApiKey,
            4096
          )
        }
      : {}),
    ...(body.asset_generation_openai_model !== undefined || body.assetGenerationOpenAiModel !== undefined
      ? {
          asset_generation_openai_model: sanitizeString(
            body.asset_generation_openai_model || body.assetGenerationOpenAiModel,
            128
          )
        }
      : {}),
    ...(body.asset_generation_openai_base_url !== undefined || body.assetGenerationOpenAiBaseUrl !== undefined
      ? {
          asset_generation_openai_base_url:
            normalizeUrl(body.asset_generation_openai_base_url || body.assetGenerationOpenAiBaseUrl) ||
            sanitizeString(body.asset_generation_openai_base_url || body.assetGenerationOpenAiBaseUrl, 4096)
        }
      : {}),
    ...(body.asset_generation_openai_reasoning !== undefined || body.assetGenerationOpenAiReasoning !== undefined
      ? {
          asset_generation_openai_reasoning: sanitizeString(
            body.asset_generation_openai_reasoning || body.assetGenerationOpenAiReasoning,
            32
          )
        }
      : {}),
    ...(body.asset_generation_openai_timeout_ms !== undefined || body.assetGenerationOpenAiTimeoutMs !== undefined
      ? {
          asset_generation_openai_timeout_ms: Math.max(
            5000,
            Math.min(
              300000,
              Number(body.asset_generation_openai_timeout_ms || body.assetGenerationOpenAiTimeoutMs) || 90000
            )
          )
        }
      : {}),
    ...(body.asset_generation_replicate_api_key !== undefined || body.assetGenerationReplicateApiKey !== undefined
      ? {
          asset_generation_replicate_api_key: sanitizeString(
            body.asset_generation_replicate_api_key || body.assetGenerationReplicateApiKey,
            4096
          )
        }
      : {}),
    ...(body.asset_generation_replicate_model !== undefined || body.assetGenerationReplicateModel !== undefined
      ? {
          asset_generation_replicate_model: sanitizeString(
            body.asset_generation_replicate_model || body.assetGenerationReplicateModel,
            256
          )
        }
      : {}),
    ...(body.asset_generation_replicate_base_url !== undefined || body.assetGenerationReplicateBaseUrl !== undefined
      ? {
          asset_generation_replicate_base_url:
            normalizeUrl(body.asset_generation_replicate_base_url || body.assetGenerationReplicateBaseUrl) ||
            sanitizeString(body.asset_generation_replicate_base_url || body.assetGenerationReplicateBaseUrl, 4096)
        }
      : {}),
    ...(body.asset_generation_replicate_timeout_ms !== undefined || body.assetGenerationReplicateTimeoutMs !== undefined
      ? {
          asset_generation_replicate_timeout_ms: Math.max(
            10000,
            Math.min(
              300000,
              Number(body.asset_generation_replicate_timeout_ms || body.assetGenerationReplicateTimeoutMs) || 180000
            )
          )
        }
      : {}),
    ...(body.asset_generation_replicate_resolution !== undefined ||
    body.assetGenerationReplicateResolution !== undefined
      ? {
          asset_generation_replicate_resolution: sanitizeString(
            body.asset_generation_replicate_resolution || body.assetGenerationReplicateResolution,
            32
          )
        }
      : {}),
    ...(isPlainObject(body.asset_generation_hook_headers || body.assetGenerationHookHeaders)
      ? {
          asset_generation_hook_headers: sanitizeStructuredValue(
            body.asset_generation_hook_headers || body.assetGenerationHookHeaders
          )
        }
      : {})
  });
  const jobType = sanitizeJobType(body.job_type || body.jobType, SUBMISSION_JOB_TYPE_ASSET_PREPARE);
  if (jobType !== SUBMISSION_JOB_TYPE_ASSET_PREPARE) {
    return { ok: false, error: "Only asset_prepare is supported by this endpoint" };
  }

  return {
    ok: true,
    data: {
      job_id: jobId,
      job_type: SUBMISSION_JOB_TYPE_ASSET_PREPARE,
      brand_profile_id: brandProfileId,
      brand_key: sanitizeOptionalString(body.brand_key || body.brandKey, 256) || null,
      track: sanitizeTrack(body.track || metadata.track),
      site_ids: siteIds,
      source: sanitizeString(body.source, 64) || DEFAULT_SUBMISSION_SOURCE,
      priority: sanitizePriority(body.priority),
      max_attempts: sanitizeMaxAttempts(body.max_attempts || body.maxAttempts),
      dry_run: parseBoolean(body.dry_run || body.dryRun),
      metadata,
      webhook: webhookConfig.webhook,
      received_at: new Date().toISOString()
    }
  };
}

function validateSubmitRequest(body) {
  if (!isPlainObject(body)) {
    return { ok: false, error: "Invalid JSON body" };
  }

  const jobId = sanitizeString(body.job_id || body.jobId || body.run_id || body.runId, 128);
  if (!jobId) {
    return { ok: false, error: "job_id is required" };
  }

  const credentials = sanitizeSubmissionCredentials(body.credentials);
  if (credentials?.error) {
    return { ok: false, error: credentials.error };
  }

  const brandProfileId = sanitizeString(body.brand_profile_id || body.brandProfileId, 128);
  if (!brandProfileId) {
    return { ok: false, error: "brand_profile_id is required" };
  }

  const siteId = sanitizeString(body.site_id || body.siteId, 128).toLowerCase();
  if (!siteId) {
    return { ok: false, error: "site_id is required" };
  }

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

  const metadata = sanitizeMetadata({
    ...(isPlainObject(body.metadata) ? body.metadata : {}),
    ...collectSelfHostedAutomationMetadata(body)
  });
  const jobType = sanitizeJobType(body.job_type || body.jobType, SUBMISSION_JOB_TYPE_SUBMIT);
  if (jobType !== SUBMISSION_JOB_TYPE_SUBMIT) {
    return { ok: false, error: "Only directory_submit is supported by this endpoint" };
  }

  return {
    ok: true,
    data: {
      job_id: jobId,
      job_type: SUBMISSION_JOB_TYPE_SUBMIT,
      brand_profile_id: brandProfileId,
      manifest_id: sanitizeOptionalString(body.manifest_id || body.manifestId, 128) || null,
      brand_key: sanitizeOptionalString(body.brand_key || body.brandKey, 256) || null,
      site_id: siteId,
      site_name: sanitizeOptionalString(body.site_name || body.siteName, 180) || null,
      track: sanitizeTrack(body.track || metadata.track),
      source: sanitizeString(body.source, 64) || DEFAULT_SUBMISSION_SOURCE,
      priority: sanitizePriority(body.priority),
      max_attempts: sanitizeMaxAttempts(body.max_attempts || body.maxAttempts),
      submission_policy: sanitizeSubmissionPolicy(body.submission_policy || body.submissionPolicy),
      stop_before_submit:
        parseBoolean(body.stop_before_submit ?? body.stopBeforeSubmit ?? metadata.stop_before_submit ?? true) !== false,
      dry_run: parseBoolean(body.dry_run || body.dryRun),
      credentials: credentials?.value || null,
      metadata,
      webhook: webhookConfig.webhook,
      received_at: new Date().toISOString()
    }
  };
}

function buildAssetManifestMarkdown(result = {}, request = {}) {
  const manifest = isPlainObject(result?.asset_manifest) ? result.asset_manifest : {};
  const copyPack = isPlainObject(manifest.copy_pack) ? manifest.copy_pack : {};
  const requiredAssets = Array.isArray(manifest.required_assets) ? manifest.required_assets : [];
  const siteManifests = Array.isArray(manifest.site_manifests) ? manifest.site_manifests : [];
  const missingItems = Array.isArray(manifest.missing_items) ? manifest.missing_items : [];
  const approvalItems = Array.isArray(manifest.approval_items) ? manifest.approval_items : [];
  const nextSteps = Array.isArray(result?.next_steps) ? result.next_steps : [];

  const lines = [
    "# Submission Asset Manifest",
    "",
    "## Summary",
    "",
    `- Job ID: ${request.job_id || "n/a"}`,
    `- Brand profile ID: ${request.brand_profile_id || manifest.brand_profile_id || "n/a"}`,
    `- Manifest ID: ${manifest.manifest_id || result.manifest_id || "n/a"}`,
    `- Track: ${manifest.track || request.track || "custom"}`,
    `- Status: ${sanitizeString(result.status, 64) || "unknown"}`,
    `- Summary note: ${sanitizeString(result?.summary?.note, 4000) || "No summary note recorded."}`,
    "",
    "## Copy Pack",
    ""
  ];

  if (!Object.keys(copyPack).length) {
    lines.push("- No copy pack generated.");
  } else {
    for (const [key, rawValue] of Object.entries(copyPack)) {
      const value = Array.isArray(rawValue) ? rawValue.join(", ") : sanitizeString(rawValue, 4000);
      if (!value) {
        continue;
      }
      lines.push(`- ${key}: ${value}`);
    }
  }

  lines.push("", "## Required Assets", "");
  if (!requiredAssets.length) {
    lines.push("- No site-specific assets required.");
  } else {
    for (const asset of requiredAssets) {
      const name = sanitizeString(asset.asset_type, 120) || "unknown_asset";
      const status = sanitizeString(asset.status, 64) || "unknown";
      const requiredFor = Array.isArray(asset.required_for) ? asset.required_for.join(", ") : "";
      lines.push(`- ${name} [${status}]${requiredFor ? ` for ${requiredFor}` : ""}`);
    }
  }

  lines.push("", "## Missing Items", "");
  if (!missingItems.length) {
    lines.push("- No missing items flagged.");
  } else {
    for (const item of missingItems) {
      lines.push(`- ${sanitizeString(item.message || item.label || item, 320)}`);
    }
  }

  lines.push("", "## Approval Items", "");
  if (!approvalItems.length) {
    lines.push("- No approval items flagged.");
  } else {
    for (const item of approvalItems) {
      lines.push(`- ${sanitizeString(item.message || item.label || item, 320)}`);
    }
  }

  lines.push("", "## Site Coverage", "");
  if (!siteManifests.length) {
    lines.push("- No site manifests generated.");
  } else {
    for (const site of siteManifests) {
      const siteId = sanitizeString(site.site_id, 128) || "unknown_site";
      const siteName = sanitizeString(site.site_name, 180) || siteId;
      const missingCount = Array.isArray(site.missing_items) ? site.missing_items.length : 0;
      lines.push(`- ${siteName} (${siteId}): ${missingCount} missing item(s)`);
    }
  }

  lines.push("", "## Next Steps", "");
  if (!nextSteps.length) {
    lines.push("- Review the manifest and confirm factual fields before submission.");
  } else {
    for (const step of nextSteps) {
      lines.push(`- ${sanitizeString(step, 320)}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function buildSubmissionMarkdown(result = {}, request = {}) {
  if (isPlainObject(result?.asset_manifest)) {
    return buildAssetManifestMarkdown(result, request);
  }
  if (isPlainObject(result?.submission) || sanitizeString(result?.submission_status, 64)) {
    const submission = isPlainObject(result?.submission) ? result.submission : {};
    const evidence = isPlainObject(result?.evidence) ? result.evidence : {};
    const driftEvent = isPlainObject(result?.drift_event) ? result.drift_event : {};
    const driftReasons = Array.isArray(driftEvent.reasons) ? driftEvent.reasons : [];
    const reconRefresh = isPlainObject(driftEvent.recon_refresh) ? driftEvent.recon_refresh : {};
    const screenshots = Array.isArray(evidence.screenshots) ? evidence.screenshots : [];
    const nextSteps = Array.isArray(result?.next_steps) ? result.next_steps : [];
    const skippedUploads = Array.isArray(submission.skipped_uploads) ? submission.skipped_uploads : [];
    const lines = [
      "# Directory Submission Report",
      "",
      "## Summary",
      "",
      `- Job ID: ${request.job_id || "n/a"}`,
      `- Brand profile ID: ${request.brand_profile_id || submission.brand_profile_id || "n/a"}`,
      `- Site ID: ${request.site_id || submission.site_id || "n/a"}`,
      `- Site Name: ${sanitizeString(submission.site_name, 180) || request.site_name || request.site_id || "n/a"}`,
      `- Manifest ID: ${request.manifest_id || submission.manifest_id || "n/a"}`,
      `- Status: ${sanitizeString(result.status, 64) || "unknown"}`,
      `- Submission status: ${sanitizeString(result.submission_status, 64) || "unknown"}`,
      `- Policy: ${sanitizeString(submission.submission_policy, 64) || sanitizeString(request.submission_policy, 64) || "assist"}`,
      `- Filled fields: ${Number.isFinite(Number(submission.filled_field_count)) ? Math.floor(Number(submission.filled_field_count)) : 0}`,
      `- Uploaded asset fields: ${Number.isFinite(Number(submission.uploaded_asset_count)) ? Math.floor(Number(submission.uploaded_asset_count)) : 0}`,
      `- Final URL: ${sanitizeString(submission.final_url, 4096) || "n/a"}`,
      `- Listing URL: ${sanitizeString(submission.listing_url, 4096) || "n/a"}`,
      `- Summary note: ${sanitizeString(result?.summary?.note, 4000) || "No summary note recorded."}`,
      "",
      "## Skipped Uploads",
      ""
    ];

    if (!skippedUploads.length) {
      lines.push("- No uploads were skipped.");
    } else {
      for (const item of skippedUploads) {
        lines.push(`- ${sanitizeString(item.field_label || item.asset_type || "upload", 160)}: ${sanitizeString(item.reason, 320) || "Skipped."}`);
      }
    }

    lines.push("", "## Next Steps", "");
    if (!nextSteps.length) {
      lines.push("- Review the evidence bundle and decide whether a human should finish the submission.");
    } else {
      for (const step of nextSteps) {
        lines.push(`- ${sanitizeString(step, 320)}`);
      }
    }

    lines.push("", "## Drift", "");
    if (!driftEvent.detected) {
      lines.push("- No connector drift signals were recorded.");
    } else {
      lines.push(`- Severity: ${sanitizeString(driftEvent.severity, 32) || "unknown"}`);
      lines.push(`- Note: ${sanitizeString(driftEvent.note, 4000) || "Connector drift detected."}`);
      if (!driftReasons.length) {
        lines.push("- No detailed drift reasons were stored.");
      } else {
        for (const reason of driftReasons) {
          lines.push(
            `- ${sanitizeString(reason.code, 120) || "drift_reason"}: ${sanitizeString(reason.message, 4000) || "Connector drift detected."}`
          );
        }
      }
      if (reconRefresh.enqueued && reconRefresh.job_id) {
        lines.push(`- Recon refresh queued: ${sanitizeString(reconRefresh.job_id, 128)}`);
      } else if (sanitizeString(reconRefresh.state, 64) === "existing" && reconRefresh.job_id) {
        lines.push(`- Recon refresh already active: ${sanitizeString(reconRefresh.job_id, 128)}`);
      } else if (sanitizeString(reconRefresh.state, 64) === "error") {
        lines.push(`- Recon refresh queue error: ${sanitizeString(reconRefresh.error, 320) || "Unknown error."}`);
      } else if (sanitizeString(reconRefresh.state, 64) === "skipped") {
        lines.push(`- Recon refresh skipped: ${sanitizeString(reconRefresh.reason, 160) || "Missing connector details."}`);
      }
    }

    lines.push("", "## Evidence", "");
    if (!screenshots.length) {
      lines.push("- No screenshots saved.");
    } else {
      for (const screenshot of screenshots) {
        lines.push(`- Screenshot: ${sanitizeString(screenshot, 4096)}`);
      }
    }

    return `${lines.join("\n")}\n`;
  }

  const summaryNote =
    sanitizeString(result?.summary?.note, 4000) ||
    sanitizeString(result?.summary?.message, 4000) ||
    "No summary note recorded.";
  const siteProfile = isPlainObject(result?.site_profile) ? result.site_profile : {};
  const fields = Array.isArray(siteProfile.fields) ? siteProfile.fields : [];
  const assets = Array.isArray(siteProfile.asset_requirements) ? siteProfile.asset_requirements : [];
  const gates = Array.isArray(siteProfile.gates) ? siteProfile.gates : [];
  const duplicateFlow = Array.isArray(siteProfile.duplicate_check_flow) ? siteProfile.duplicate_check_flow : [];
  const nextSteps = Array.isArray(result?.next_steps) ? result.next_steps : [];
  const evidence = isPlainObject(result?.evidence) ? result.evidence : {};
  const screenshots = Array.isArray(evidence.screenshots) ? evidence.screenshots : [];

  const lines = [
    "# Submission Recon Report",
    "",
    "## Summary",
    "",
    `- Job ID: ${request.job_id || "n/a"}`,
    `- Site ID: ${request.site_id || "n/a"}`,
    `- Site Name: ${request.site_name || request.site_id || "n/a"}`,
    `- Track: ${request.track || "custom"}`,
    `- Submit URL: ${request.submit_url || "n/a"}`,
    `- Status: ${sanitizeString(result.status, 64) || "unknown"}`,
    `- Recommended policy: ${sanitizeString(siteProfile.recommended_submission_policy, 64) || "assist"}`,
    `- Summary note: ${summaryNote}`,
    "",
    "## Fields",
    ""
  ];

  if (!fields.length) {
    lines.push("- No form fields were discovered.");
  } else {
    for (const field of fields) {
      const label = sanitizeString(field.label, 200) || sanitizeString(field.name, 200) || "Unnamed field";
      const fieldType = sanitizeString(field.type, 64) || "unknown";
      const required = field.required ? "required" : "optional";
      lines.push(`- ${label} (${fieldType}, ${required})`);
    }
  }

  lines.push("", "## Assets", "");
  if (!assets.length) {
    lines.push("- No explicit asset requirements were detected.");
  } else {
    for (const asset of assets) {
      const name = sanitizeString(asset.asset_type, 120) || "unknown_asset";
      const note =
        sanitizeString(asset.note, 240) ||
        sanitizeString(asset.accept, 240) ||
        sanitizeString(asset.label, 240) ||
        "No additional note.";
      lines.push(`- ${name}: ${note}`);
    }
  }

  lines.push("", "## Gates", "");
  if (!gates.length) {
    lines.push("- No explicit gates detected.");
  } else {
    for (const gate of gates) {
      const gateType = sanitizeString(gate.type, 120) || "unknown_gate";
      const note = sanitizeString(gate.note, 320) || "No additional note.";
      lines.push(`- ${gateType}: ${note}`);
    }
  }

  lines.push("", "## Duplicate Check", "");
  if (!duplicateFlow.length) {
    lines.push("- No duplicate-check guidance detected.");
  } else {
    for (const step of duplicateFlow) {
      lines.push(`- ${sanitizeString(step, 320)}`);
    }
  }

  lines.push("", "## Next Steps", "");
  if (!nextSteps.length) {
    lines.push("- Review the site profile and confirm whether this flow is safe to automate.");
  } else {
    for (const step of nextSteps) {
      lines.push(`- ${sanitizeString(step, 320)}`);
    }
  }

  lines.push("", "## Evidence", "");
  if (!screenshots.length) {
    lines.push("- No screenshots saved.");
  } else {
    for (const screenshot of screenshots) {
      lines.push(`- Screenshot: ${sanitizeString(screenshot, 4096)}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

module.exports = {
  DEFAULT_SUBMISSION_SOURCE,
  SUBMISSION_JOB_TYPE_RECON,
  SUBMISSION_JOB_TYPE_ASSET_PREPARE,
  SUBMISSION_JOB_TYPE_SUBMIT,
  SUBMISSION_JOB_TYPES,
  SUBMISSION_POLICIES,
  SUBMISSION_JOB_STATUSES,
  sanitizeMetadata,
  sanitizeStructuredValue,
  sanitizeTrack,
  sanitizeSubmissionPolicy,
  sanitizePriority,
  sanitizeMaxAttempts,
  sanitizeJobStatus,
  sanitizeJobType,
  parseSiteIds,
  validateReconRequest,
  validateBrandProfileInput,
  validateAssetPrepareRequest,
  validateSubmitRequest,
  buildAssetManifestMarkdown,
  buildSubmissionMarkdown
};
