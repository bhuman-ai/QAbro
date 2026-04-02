const { isPlainObject, parseBoolean, sanitizeOptionalString, sanitizeString } = require("./qa-core");

const DEFAULT_WEBSHARE_API_BASE_URL = "https://proxy.webshare.io/api/v2";
const DEFAULT_PROXY_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_PROXY_RESULTS = 250;
const MAX_PROXY_PAGES = 10;
const WEBSHARE_PROXY_CACHE = new Map();
const DEFAULT_PROXY_ROTATION_MAX_ATTEMPTS = 3;

const COUNTRY_CODE_ALIASES = new Map([
  ["UNITED STATES", "US"],
  ["UNITED STATES OF AMERICA", "US"],
  ["USA", "US"],
  ["U S A", "US"],
  ["US", "US"],
  ["CANADA", "CA"],
  ["CA", "CA"],
  ["UNITED KINGDOM", "GB"],
  ["GREAT BRITAIN", "GB"],
  ["UK", "GB"],
  ["GB", "GB"],
  ["AUSTRALIA", "AU"],
  ["AU", "AU"],
  ["SWEDEN", "SE"],
  ["SE", "SE"],
  ["GERMANY", "DE"],
  ["DE", "DE"],
  ["FRANCE", "FR"],
  ["FR", "FR"],
  ["NETHERLANDS", "NL"],
  ["NL", "NL"]
]);

const US_STATE_ALIASES = new Map([
  ["ALABAMA", "AL"],
  ["ALASKA", "AK"],
  ["ARIZONA", "AZ"],
  ["ARKANSAS", "AR"],
  ["CALIFORNIA", "CA"],
  ["COLORADO", "CO"],
  ["CONNECTICUT", "CT"],
  ["DELAWARE", "DE"],
  ["FLORIDA", "FL"],
  ["GEORGIA", "GA"],
  ["HAWAII", "HI"],
  ["IDAHO", "ID"],
  ["ILLINOIS", "IL"],
  ["INDIANA", "IN"],
  ["IOWA", "IA"],
  ["KANSAS", "KS"],
  ["KENTUCKY", "KY"],
  ["LOUISIANA", "LA"],
  ["MAINE", "ME"],
  ["MARYLAND", "MD"],
  ["MASSACHUSETTS", "MA"],
  ["MICHIGAN", "MI"],
  ["MINNESOTA", "MN"],
  ["MISSISSIPPI", "MS"],
  ["MISSOURI", "MO"],
  ["MONTANA", "MT"],
  ["NEBRASKA", "NE"],
  ["NEVADA", "NV"],
  ["NEW HAMPSHIRE", "NH"],
  ["NEW JERSEY", "NJ"],
  ["NEW MEXICO", "NM"],
  ["NEW YORK", "NY"],
  ["NORTH CAROLINA", "NC"],
  ["NORTH DAKOTA", "ND"],
  ["OHIO", "OH"],
  ["OKLAHOMA", "OK"],
  ["OREGON", "OR"],
  ["PENNSYLVANIA", "PA"],
  ["RHODE ISLAND", "RI"],
  ["SOUTH CAROLINA", "SC"],
  ["SOUTH DAKOTA", "SD"],
  ["TENNESSEE", "TN"],
  ["TEXAS", "TX"],
  ["UTAH", "UT"],
  ["VERMONT", "VT"],
  ["VIRGINIA", "VA"],
  ["WASHINGTON", "WA"],
  ["WEST VIRGINIA", "WV"],
  ["WISCONSIN", "WI"],
  ["WYOMING", "WY"],
  ["DISTRICT OF COLUMBIA", "DC"]
]);

function normalizeCountryCode(value) {
  const text = sanitizeString(value, 128).toUpperCase();
  if (!text) {
    return null;
  }
  if (COUNTRY_CODE_ALIASES.has(text)) {
    return COUNTRY_CODE_ALIASES.get(text);
  }
  if (/^[A-Z]{2}$/.test(text)) {
    return text;
  }
  return null;
}

function normalizeStateCode(value, countryCode = null) {
  const text = sanitizeString(value, 128).toUpperCase();
  if (!text) {
    return null;
  }
  if (countryCode === "US" || !countryCode) {
    if (US_STATE_ALIASES.has(text)) {
      return US_STATE_ALIASES.get(text);
    }
    if (/^[A-Z]{2}$/.test(text) && Array.from(US_STATE_ALIASES.values()).includes(text)) {
      return text;
    }
  }
  return /^[A-Z0-9-]{2,8}$/.test(text) ? text : null;
}

function normalizeLocationParts(location = {}, brandLike = {}) {
  const city = sanitizeOptionalString(location.city || brandLike.city, 120) || null;
  const stateLabel = sanitizeOptionalString(location.state || brandLike.state, 120) || null;
  const countryLabel = sanitizeOptionalString(location.country || brandLike.country, 120) || null;
  let countryCode = normalizeCountryCode(countryLabel);
  const stateCode = normalizeStateCode(stateLabel, countryCode);

  if (!countryCode && stateCode && Array.from(US_STATE_ALIASES.values()).includes(stateCode)) {
    countryCode = "US";
  }

  return {
    city,
    state_label: stateLabel,
    state_code: stateCode,
    country_label: countryLabel,
    country_code: countryCode,
    postal_code: sanitizeOptionalString(location.postal_code || location.zip || brandLike.postal_code, 64) || null
  };
}

function extractProxyTargetFromBrand(brandLike) {
  const safeBrand = isPlainObject(brandLike) ? brandLike : {};
  const profile = isPlainObject(safeBrand.profile) ? safeBrand.profile : {};
  const profileLocation = isPlainObject(profile.location) ? profile.location : {};
  const brandLocation = isPlainObject(safeBrand.location) ? safeBrand.location : {};
  const location = {
    ...profileLocation,
    ...brandLocation
  };

  const normalized = normalizeLocationParts(location, safeBrand);
  const track = sanitizeString(safeBrand.track || profile.track, 64).toLowerCase() || "custom";
  const target = {
    track,
    country_code: normalized.country_code,
    country_label: normalized.country_label,
    state_code: normalized.state_code,
    state_label: normalized.state_label,
    city: normalized.city,
    postal_code: normalized.postal_code,
    locality_required: track === "physical_local"
  };

  return {
    ...target,
    has_location: Boolean(target.country_code || target.state_code || target.city || target.postal_code)
  };
}

function parseProviderMode(value) {
  const mode = sanitizeString(value, 32).toLowerCase();
  return mode === "backbone" || mode === "premium" ? mode : "direct";
}

function buildProxyProviderConfig(jobRequest, options = {}) {
  const metadata = isPlainObject(jobRequest?.metadata) ? jobRequest.metadata : {};
  const explicitProxyOverride = Boolean(
    sanitizeOptionalString(
      options.proxyServer ??
        metadata.self_hosted_proxy_server ??
        metadata.proxy_server,
      4096
    )
  );
  const autoSelectValue =
    options.proxyAutoSelect ??
    metadata.submission_proxy_auto_select ??
    metadata.self_hosted_proxy_auto_select ??
    process.env.SUBMISSION_SELF_HOSTED_PROXY_AUTO_SELECT ??
    process.env.SUBMISSION_DO_PROXY_AUTO_SELECT;
  const apiKey =
    sanitizeOptionalString(
      options.webshareApiKey ??
        metadata.webshare_api_key ??
        process.env.SUBMISSION_SELF_HOSTED_WEBSHARE_API_KEY ??
        process.env.SUBMISSION_DO_WEBSHARE_API_KEY ??
        process.env.WEBSHARE_API_KEY,
      512
    ) || null;
  const apiBaseUrl =
    sanitizeOptionalString(
      options.webshareApiBaseUrl ??
        metadata.webshare_api_base_url ??
        process.env.SUBMISSION_SELF_HOSTED_WEBSHARE_API_BASE_URL ??
        process.env.SUBMISSION_DO_WEBSHARE_API_BASE_URL ??
        process.env.WEBSHARE_API_BASE_URL,
      4096
    ) || DEFAULT_WEBSHARE_API_BASE_URL;
  const autoSelect =
    parseBoolean(
      autoSelectValue ??
        (apiKey ? "true" : "false")
    ) !== false && !(explicitProxyOverride && autoSelectValue === undefined);
  const requireGeoMatch =
    parseBoolean(
      options.proxyRequireGeoMatch ??
        metadata.submission_proxy_require_geo_match ??
        metadata.self_hosted_proxy_require_geo_match ??
        process.env.SUBMISSION_SELF_HOSTED_PROXY_REQUIRE_GEO_MATCH ??
        process.env.SUBMISSION_DO_PROXY_REQUIRE_GEO_MATCH
    ) === true;

  return {
    provider: "webshare",
    apiKey,
    apiBaseUrl: apiBaseUrl.replace(/\/+$/, ""),
    mode: parseProviderMode(
      options.webshareMode ??
        metadata.webshare_mode ??
        process.env.SUBMISSION_SELF_HOSTED_WEBSHARE_MODE ??
        process.env.SUBMISSION_DO_WEBSHARE_MODE
    ),
    pageSize: Math.max(
      1,
      Math.min(
        100,
        Number(
          options.websharePageSize ??
            metadata.webshare_page_size ??
            process.env.SUBMISSION_SELF_HOSTED_WEBSHARE_PAGE_SIZE ??
            process.env.SUBMISSION_DO_WEBSHARE_PAGE_SIZE
        ) || 100
      )
    ),
    maxPages: Math.max(
      1,
      Math.min(
        MAX_PROXY_PAGES,
        Number(
          options.webshareMaxPages ??
            metadata.webshare_max_pages ??
            process.env.SUBMISSION_SELF_HOSTED_WEBSHARE_MAX_PAGES ??
            process.env.SUBMISSION_DO_WEBSHARE_MAX_PAGES
        ) || 3
      )
    ),
    cacheTtlMs: Math.max(
      0,
      Math.min(
        60 * 60 * 1000,
        Number(
          options.webshareCacheTtlMs ??
            metadata.webshare_cache_ttl_ms ??
            process.env.SUBMISSION_SELF_HOSTED_WEBSHARE_CACHE_TTL_MS ??
            process.env.SUBMISSION_DO_WEBSHARE_CACHE_TTL_MS
        ) || DEFAULT_PROXY_CACHE_TTL_MS
      )
    ),
    autoSelect,
    requireGeoMatch,
    explicitProxyOverride
  };
}

function buildProxyRotationConfig(jobRequest, options = {}) {
  const metadata = isPlainObject(jobRequest?.metadata) ? jobRequest.metadata : {};
  const enabled =
    parseBoolean(
      options.proxyRotationEnabled ??
        metadata.submission_proxy_rotation_enabled ??
        metadata.self_hosted_proxy_rotation_enabled ??
        process.env.SUBMISSION_SELF_HOSTED_PROXY_ROTATION_ENABLED ??
        process.env.SUBMISSION_DO_PROXY_ROTATION_ENABLED ??
        "true"
    ) !== false;
  const maxAttempts = Math.max(
    1,
    Math.min(
      10,
      Number(
        options.proxyRotationMaxAttempts ??
          metadata.submission_proxy_max_attempts ??
          metadata.submission_proxy_max_rotations ??
          process.env.SUBMISSION_SELF_HOSTED_PROXY_MAX_ATTEMPTS ??
          process.env.SUBMISSION_DO_PROXY_MAX_ATTEMPTS
      ) || DEFAULT_PROXY_ROTATION_MAX_ATTEMPTS
    )
  );
  const retryOnCaptcha =
    parseBoolean(
      options.proxyRotateOnCaptcha ??
        metadata.submission_proxy_rotate_on_captcha ??
        process.env.SUBMISSION_SELF_HOSTED_PROXY_ROTATE_ON_CAPTCHA ??
        process.env.SUBMISSION_DO_PROXY_ROTATE_ON_CAPTCHA ??
        "true"
    ) !== false;
  const retryOnNetworkErrors =
    parseBoolean(
      options.proxyRotateOnNetworkErrors ??
        metadata.submission_proxy_rotate_on_network_errors ??
        process.env.SUBMISSION_SELF_HOSTED_PROXY_ROTATE_ON_NETWORK_ERRORS ??
        process.env.SUBMISSION_DO_PROXY_ROTATE_ON_NETWORK_ERRORS ??
        "true"
    ) !== false;

  return {
    enabled,
    maxAttempts,
    retryOnCaptcha,
    retryOnNetworkErrors
  };
}

function normalizeWebshareProxyRow(row) {
  const safeRow = isPlainObject(row) ? row : {};
  const host = sanitizeOptionalString(safeRow.proxy_address || safeRow.host || safeRow.ip, 256) || null;
  const port = Number(safeRow.port);
  const countryCode = normalizeCountryCode(safeRow.country_code || safeRow.country || safeRow.countryCode);
  const cityName = sanitizeOptionalString(safeRow.city_name || safeRow.city, 120) || null;
  const regionLabel =
    sanitizeOptionalString(
      safeRow.region_name || safeRow.region || safeRow.state || safeRow.state_name || safeRow.area,
      120
    ) || null;
  const regionCode =
    normalizeStateCode(safeRow.region_code || safeRow.regionCode || safeRow.state_code, countryCode) ||
    normalizeStateCode(regionLabel, countryCode);

  return {
    id: sanitizeOptionalString(safeRow.id, 128) || null,
    username: sanitizeOptionalString(safeRow.username, 320) || null,
    password: sanitizeOptionalString(safeRow.password, 320) || null,
    host,
    port: Number.isFinite(port) ? port : null,
    country_code: countryCode,
    city_name: cityName,
    region_label: regionLabel,
    region_code: regionCode
  };
}

function buildProxyServer(candidate) {
  if (!candidate?.host || !candidate?.port) {
    return null;
  }
  return `http://${candidate.host}:${candidate.port}`;
}

function buildWebshareCacheKey(config) {
  return JSON.stringify({
    provider: "webshare",
    apiKeyTail: sanitizeOptionalString(config.apiKey, 512)?.slice(-12) || "",
    base: config.apiBaseUrl,
    mode: config.mode,
    pageSize: config.pageSize,
    maxPages: config.maxPages
  });
}

function clearWebshareProxyCache(config = null) {
  if (!config) {
    WEBSHARE_PROXY_CACHE.clear();
    return;
  }
  WEBSHARE_PROXY_CACHE.delete(buildWebshareCacheKey(config));
}

async function listWebshareProxies(config, options = {}) {
  if (!config?.apiKey) {
    return {
      ok: false,
      error: "Webshare API key is not configured."
    };
  }

  const fetchImpl =
    typeof options.fetchImpl === "function"
      ? options.fetchImpl
      : typeof fetch === "function"
        ? fetch.bind(globalThis)
        : null;
  if (typeof fetchImpl !== "function") {
    return { ok: false, error: "fetch is not available for Webshare requests." };
  }

  const cacheKey = buildWebshareCacheKey(config);
  const now = Date.now();
  const cached = WEBSHARE_PROXY_CACHE.get(cacheKey);
  if (options.bustCache === true) {
    WEBSHARE_PROXY_CACHE.delete(cacheKey);
  } else if (cached && cached.expiresAt > now && Array.isArray(cached.rows)) {
    return {
      ok: true,
      rows: cached.rows.slice()
    };
  }

  const rows = [];
  let nextUrl = `${config.apiBaseUrl}/proxy/list/?${new URLSearchParams({
    mode: config.mode || "direct",
    page: "1",
    page_size: String(config.pageSize || 100)
  }).toString()}`;
  let pagesFetched = 0;

  while (nextUrl && rows.length < MAX_PROXY_RESULTS && pagesFetched < config.maxPages) {
    const response = await fetchImpl(nextUrl, {
      method: "GET",
      headers: {
        Authorization: `Token ${config.apiKey}`
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
        error: data?.detail || data?.message || "Webshare proxy list request failed.",
        data
      };
    }

    const results = Array.isArray(data?.results) ? data.results : [];
    rows.push(...results.map(normalizeWebshareProxyRow).filter((item) => item.host && item.port));
    nextUrl = sanitizeOptionalString(data?.next, 4096) || null;
    pagesFetched += 1;
  }

  if (config.cacheTtlMs > 0) {
    WEBSHARE_PROXY_CACHE.set(cacheKey, {
      expiresAt: now + config.cacheTtlMs,
      rows: rows.slice()
    });
  }

  return {
    ok: true,
    rows
  };
}

function scoreProxyCandidate(candidate, target) {
  const safeTarget = isPlainObject(target) ? target : {};
  let score = 0;
  let matchQuality = "fallback";

  if (safeTarget.country_code) {
    if (candidate.country_code === safeTarget.country_code) {
      score += 100;
      matchQuality = "country";
    } else {
      score -= 150;
    }
  }

  if (safeTarget.state_code && candidate.region_code === safeTarget.state_code) {
    score += 35;
    matchQuality = "country_region";
  }

  if (
    safeTarget.city &&
    candidate.city_name &&
    sanitizeString(candidate.city_name, 120).toLowerCase() === sanitizeString(safeTarget.city, 120).toLowerCase()
  ) {
    score += 20;
    matchQuality = matchQuality === "country_region" ? "country_region_city" : "country_city";
  }

  return {
    score,
    matchQuality
  };
}

function orderManagedProxyCandidates(candidates, target) {
  const normalizedCandidates = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
  if (!normalizedCandidates.length) {
    return [];
  }

  return normalizedCandidates
    .map((candidate) => {
      const score = scoreProxyCandidate(candidate, target);
      return {
        candidate,
        score: score.score,
        matchQuality: score.matchQuality
      };
    })
    .sort((left, right) => right.score - left.score);
}

function selectBestManagedProxy(candidates, target, options = {}) {
  const scored = orderManagedProxyCandidates(candidates, target);
  if (!scored.length) {
    return {
      ok: false,
      reason: "no_proxies_available"
    };
  }

  const availableCountries = Array.from(
    new Set(scored.map((item) => item.candidate.country_code).filter(Boolean))
  ).sort();

  const best = scored[0];
  if (!best) {
    return {
      ok: false,
      reason: "no_candidate_selected",
      availableCountries
    };
  }

  const requireGeoMatch = options.requireGeoMatch === true;
  const hasCountryTarget = Boolean(target?.country_code);
  const countryMatched = !hasCountryTarget || best.candidate.country_code === target.country_code;

  if (requireGeoMatch && hasCountryTarget && !countryMatched) {
    return {
      ok: false,
      reason: "geo_match_required",
      availableCountries
    };
  }

  return {
    ok: true,
    candidate: best.candidate,
    matchQuality: countryMatched ? best.matchQuality : "country_mismatch_fallback",
    availableCountries,
    matched: countryMatched
  };
}

function describeProxySelection(target, selection) {
  const targetBits = [target?.city, target?.state_code || target?.state_label, target?.country_code || target?.country_label]
    .filter(Boolean)
    .join(", ");
  const selectedBits = [selection?.city_name, selection?.region_code || selection?.region_label, selection?.country_code]
    .filter(Boolean)
    .join(", ");

  if (!selection) {
    return targetBits ? `No managed proxy was selected for ${targetBits}.` : "No managed proxy was selected.";
  }

  if (selection.matched === false && targetBits && selectedBits) {
    return `No nearby proxy matched ${targetBits}; falling back to ${selectedBits}.`;
  }
  if (targetBits && selectedBits) {
    return `Selected a proxy near ${targetBits} using ${selectedBits}.`;
  }
  if (selectedBits) {
    return `Selected a managed proxy in ${selectedBits}.`;
  }
  return "Selected a managed proxy.";
}

async function resolveSubmissionProxySelection(jobRequest, brandLike, fallbackProxy = null, options = {}) {
  const providerConfig = buildProxyProviderConfig(jobRequest, options);
  const rotationConfig = buildProxyRotationConfig(jobRequest, options);
  const metadata = isPlainObject(jobRequest?.metadata) ? jobRequest.metadata : {};
  const target = extractProxyTargetFromBrand(brandLike);
  const attemptIndex = Math.max(
    0,
    Math.min(
      MAX_PROXY_RESULTS - 1,
      Number(
        options.proxyAttemptIndex ??
          metadata.submission_proxy_attempt_index ??
          metadata.proxy_attempt_index
      ) || 0
    )
  );
  const fallbackSelection = {
    provider: fallbackProxy?.server ? "static" : null,
    status: fallbackProxy?.server ? "static" : "disabled",
    matched: !target.country_code,
    match_quality: fallbackProxy?.server ? "static" : "none",
    attempt_index: attemptIndex,
    available_candidate_count: fallbackProxy?.server ? 1 : 0,
    has_more_candidates: false,
    target,
    selected: fallbackProxy?.server
      ? {
          country_code: sanitizeOptionalString(options.fallbackCountryCode, 8) || null,
          region_code: sanitizeOptionalString(options.fallbackRegionCode, 16) || null,
          city_name: sanitizeOptionalString(options.fallbackCityName, 120) || null
        }
      : null,
    note: fallbackProxy?.server ? "Using the configured static proxy." : "No proxy is configured.",
    warnings: []
  };

  if (!providerConfig.autoSelect) {
    return {
      proxy: fallbackProxy,
      selection: fallbackSelection
    };
  }

  if (!target.has_location) {
    return {
      proxy: fallbackProxy,
      selection: {
        ...fallbackSelection,
        status: fallbackProxy?.server ? "missing_target" : "disabled",
        note: "Brand location is incomplete, so proxy auto-selection was skipped.",
        warnings: ["Add a business country and city/state to improve proxy selection."]
      }
    };
  }

  if (!providerConfig.apiKey) {
    return {
      proxy: fallbackProxy,
      selection: {
        ...fallbackSelection,
        status: fallbackProxy?.server ? "provider_missing" : "disabled",
        note: "Managed proxy auto-selection is enabled, but no Webshare API key is configured.",
        warnings: ["Set a Webshare API key to choose a nearby proxy automatically."]
      }
    };
  }

  const listResult = await (typeof options.listManagedProxies === "function"
    ? options.listManagedProxies(providerConfig, options)
    : listWebshareProxies(providerConfig, options));
  if (!listResult?.ok) {
    return {
      proxy: fallbackProxy,
      selection: {
        ...fallbackSelection,
        provider: "webshare",
        status: "provider_error",
        note: listResult?.error || "Failed to load managed proxy inventory.",
        warnings: ["Managed proxy lookup failed; using the configured fallback proxy if available."]
      }
    };
  }

  const ordered = orderManagedProxyCandidates(listResult.rows, target);
  const availableCountries = Array.from(
    new Set(ordered.map((item) => item.candidate.country_code).filter(Boolean))
  ).sort();
  const matchingOrdered = providerConfig.requireGeoMatch && target.country_code
    ? ordered.filter((item) => item.candidate.country_code === target.country_code)
    : ordered;
  const chosenEntry = matchingOrdered[Math.min(attemptIndex, Math.max(0, matchingOrdered.length - 1))] || null;
  if (!chosenEntry || !chosenEntry.candidate) {
    return {
      proxy: fallbackProxy,
      selection: {
        ...fallbackSelection,
        provider: "webshare",
        status: "no_match",
        note:
          providerConfig.requireGeoMatch && target.country_code
            ? "No managed proxy matched the required geography."
            : "Managed proxy inventory did not return a usable proxy.",
        available_countries: availableCountries || [],
        warnings: [
          providerConfig.requireGeoMatch && target.country_code
            ? "The current proxy inventory does not include a near-business match."
            : "Proxy inventory is available, but no usable proxy could be selected."
        ]
      }
    };
  }
  const chosen = {
    candidate: chosenEntry.candidate,
    matchQuality: chosenEntry.matchQuality,
    matched: !target.country_code || chosenEntry.candidate.country_code === target.country_code
  };

  const resolvedProxy = {
    server: buildProxyServer(chosen.candidate),
    ...(chosen.candidate.username ? { username: chosen.candidate.username } : {}),
    ...(chosen.candidate.password ? { password: chosen.candidate.password } : {}),
    ...(fallbackProxy?.bypass ? { bypass: fallbackProxy.bypass } : {})
  };

  const selection = {
    provider: "webshare",
    status: chosen.matched === false ? "mismatch" : "matched",
    matched: chosen.matched !== false,
    match_quality: chosen.matchQuality,
    attempt_index: attemptIndex,
    available_candidate_count: matchingOrdered.length,
    has_more_candidates: attemptIndex + 1 < matchingOrdered.length,
    target,
    available_countries: availableCountries || [],
    selected: {
      country_code: chosen.candidate.country_code || null,
      region_code: chosen.candidate.region_code || null,
      region_label: chosen.candidate.region_label || null,
      city_name: chosen.candidate.city_name || null
    },
    note: describeProxySelection(target, {
      ...chosen.candidate,
      matched: chosen.matched !== false
    }),
    warnings:
      chosen.matched === false
        ? ["No nearby proxy matched the business geography; using the closest available fallback."]
        : []
  };

  return {
    proxy: resolvedProxy,
    selection,
    rotation: rotationConfig
  };
}

function shouldRotateProxyForExecution(execution, selection, jobRequest, options = {}) {
  const rotation = options.rotationConfig || buildProxyRotationConfig(jobRequest, options);
  if (!rotation.enabled) {
    return { shouldRotate: false, reason: "rotation_disabled" };
  }

  const selectionState = isPlainObject(selection) ? selection : {};
  const attemptIndex = Number(selectionState.attempt_index) || 0;
  const availableCount = Number(selectionState.available_candidate_count) || 0;
  if (!selectionState.has_more_candidates || attemptIndex + 1 >= Math.min(availableCount, rotation.maxAttempts)) {
    return { shouldRotate: false, reason: "no_more_candidates" };
  }

  const submissionStatus = sanitizeString(execution?.result?.submission_status, 128).toLowerCase();
  const note = sanitizeString(
    execution?.result?.summary?.note || execution?.error?.message || "",
    4000
  ).toLowerCase();

  if (rotation.retryOnCaptcha && submissionStatus === "paused_for_captcha") {
    return {
      shouldRotate: true,
      reason: "captcha",
      nextAttemptIndex: attemptIndex + 1
    };
  }

  if (
    rotation.retryOnNetworkErrors &&
    (execution?.ok !== true || submissionStatus === "failed") &&
    /proxy|tunnel|timeout|timed out|forbidden|denied|too many requests|429|captcha|blocked|access denied/i.test(note)
  ) {
    return {
      shouldRotate: true,
      reason: "network_or_block",
      nextAttemptIndex: attemptIndex + 1
    };
  }

  return {
    shouldRotate: false,
    reason: "outcome_not_retryable"
  };
}

module.exports = {
  DEFAULT_WEBSHARE_API_BASE_URL,
  buildProxyProviderConfig,
  buildProxyRotationConfig,
  extractProxyTargetFromBrand,
  listWebshareProxies,
  clearWebshareProxyCache,
  normalizeCountryCode,
  normalizeStateCode,
  normalizeWebshareProxyRow,
  orderManagedProxyCandidates,
  resolveSubmissionProxySelection,
  scoreProxyCandidate,
  selectBestManagedProxy,
  shouldRotateProxyForExecution
};
