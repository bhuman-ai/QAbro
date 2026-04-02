const { isPlainObject, parseBoolean, sanitizeOptionalString, sanitizeString } = require("./qa-core");
const {
  buildProxyProviderConfig,
  clearWebshareProxyCache,
  extractProxyTargetFromBrand,
  resolveSubmissionProxySelection
} = require("./submission-proxy");

const DEFAULT_WEBSHARE_API_BASE_URL = "https://proxy.webshare.io/api/v2";
const DEFAULT_WEBSHARE_PROXY_REPLACE_BASE_URL = "https://proxy.webshare.io/api/v3";

function getManagedProxyFetch(options = {}) {
  const fetchImpl =
    typeof options.fetchImpl === "function"
      ? options.fetchImpl
      : typeof fetch === "function"
        ? fetch.bind(globalThis)
        : null;
  if (typeof fetchImpl !== "function") {
    return null;
  }
  return fetchImpl;
}

function getWebshareAccess(jobRequest, options = {}) {
  const providerConfig = buildProxyProviderConfig(jobRequest, options);
  const apiKey = sanitizeOptionalString(providerConfig.apiKey, 512) || null;
  return {
    ok: Boolean(apiKey),
    apiKey,
    apiBaseUrl: sanitizeOptionalString(providerConfig.apiBaseUrl, 4096) || DEFAULT_WEBSHARE_API_BASE_URL,
    proxyReplaceBaseUrl:
      sanitizeOptionalString(
        options.webshareProxyReplaceBaseUrl ??
          process.env.SUBMISSION_SELF_HOSTED_WEBSHARE_PROXY_REPLACE_BASE_URL ??
          process.env.SUBMISSION_DO_WEBSHARE_PROXY_REPLACE_BASE_URL,
        4096
      ) || DEFAULT_WEBSHARE_PROXY_REPLACE_BASE_URL,
    providerConfig
  };
}

function buildWebshareHeaders(apiKey) {
  return {
    Authorization: `Token ${apiKey}`,
    "Content-Type": "application/json"
  };
}

async function fetchWebshareJson(url, apiKey, options = {}) {
  const fetchImpl = getManagedProxyFetch(options);
  if (!fetchImpl) {
    return { ok: false, error: "fetch is not available for Webshare requests." };
  }

  let response;
  try {
    response = await fetchImpl(url, {
      method: options.method || "GET",
      headers: buildWebshareHeaders(apiKey),
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
    });
  } catch (error) {
    return {
      ok: false,
      error: error?.message || "Webshare request failed."
    };
  }

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
      error: data?.detail || data?.message || `Webshare request failed with HTTP ${response.status}.`,
      data
    };
  }

  return {
    ok: true,
    status: response.status,
    data
  };
}

function normalizeAccountSnapshot(subscription, plans, config, availableAssets) {
  const activePlan = Array.isArray(plans?.results)
    ? plans.results.find((plan) => sanitizeString(plan?.status, 32).toLowerCase() === "active") || null
    : null;
  return {
    subscription: subscription || null,
    active_plan: activePlan,
    config: config || null,
    available_assets: availableAssets || null,
    free_credits: Number(subscription?.free_credits) || 0,
    current_countries: isPlainObject(config?.countries) ? config.countries : {},
    available_countries: isPlainObject(config?.available_countries) ? config.available_countries : {},
    replacements_available: Number(activePlan?.proxy_replacements_available) || 0,
    customizable: subscription?.customizable === true
  };
}

async function fetchWebshareAccountSnapshot(jobRequest, options = {}) {
  const access = getWebshareAccess(jobRequest, options);
  if (!access.ok) {
    return {
      ok: false,
      error: "Webshare API key is not configured."
    };
  }

  const planId = sanitizeOptionalString(options.planId, 128) || null;
  const withPlanId = (baseUrl) => {
    if (!planId) {
      return baseUrl;
    }
    const url = new URL(baseUrl);
    url.searchParams.set("plan_id", planId);
    return url.toString();
  };

  const [subscription, plans, config, availableAssets] = await Promise.all([
    fetchWebshareJson(withPlanId(`${access.apiBaseUrl}/subscription/`), access.apiKey, options),
    fetchWebshareJson(withPlanId(`${access.apiBaseUrl}/subscription/plan/`), access.apiKey, options),
    fetchWebshareJson(withPlanId(`${access.apiBaseUrl}/proxy/config/`), access.apiKey, options),
    fetchWebshareJson(withPlanId(`${access.apiBaseUrl}/subscription/available_assets/`), access.apiKey, options)
  ]);

  for (const item of [subscription, plans, config, availableAssets]) {
    if (!item.ok) {
      return item;
    }
  }

  return {
    ok: true,
    snapshot: normalizeAccountSnapshot(subscription.data, plans.data, config.data, availableAssets.data),
    access
  };
}

function buildSemidedicatedIspCountryQuoteQuery(targetCountryCode, currentPlan = null) {
  const proxyCount = Math.max(1, Number(currentPlan?.proxy_count) || 1);
  const bandwidthLimit = Math.max(1, Number(currentPlan?.bandwidth_limit) || 1000);
  const subusersTotal = Math.max(3, Number(currentPlan?.subusers_total) || 3);
  const replacementsTotal = Math.max(0, Number(currentPlan?.proxy_replacements_total) || 0);
  return {
    behavior: "replace",
    proxy_type: "semidedicated",
    proxy_subtype: "isp",
    proxy_countries: { [targetCountryCode]: proxyCount },
    bandwidth_limit: bandwidthLimit,
    on_demand_refreshes_total: 0,
    automatic_refresh_frequency: 0,
    proxy_replacements_total: replacementsTotal,
    subusers_total: subusersTotal,
    term: "monthly",
    is_unlimited_ip_authorizations: currentPlan?.is_unlimited_ip_authorizations === true,
    is_high_concurrency: currentPlan?.is_high_concurrency === true,
    is_high_priority_network: currentPlan?.is_high_priority_network === true,
    high_quality_ips_only: currentPlan?.high_quality_ips_only === true,
    with_tax: false
  };
}

async function fetchWebsharePricingQuote(jobRequest, quoteQuery, options = {}) {
  const access = getWebshareAccess(jobRequest, options);
  if (!access.ok) {
    return {
      ok: false,
      error: "Webshare API key is not configured."
    };
  }

  const url = new URL(`${access.apiBaseUrl}/subscription/pricing/`);
  url.searchParams.set("query", JSON.stringify(quoteQuery));
  if (options.planId) {
    url.searchParams.set("plan_id", String(options.planId));
  }
  return fetchWebshareJson(url.toString(), access.apiKey, options);
}

async function createWebshareProxyReplacement(jobRequest, payload, options = {}) {
  const access = getWebshareAccess(jobRequest, options);
  if (!access.ok) {
    return {
      ok: false,
      error: "Webshare API key is not configured."
    };
  }

  const url = new URL(`${access.proxyReplaceBaseUrl}/proxy/replace/`);
  if (options.planId) {
    url.searchParams.set("plan_id", String(options.planId));
  }
  return fetchWebshareJson(url.toString(), access.apiKey, {
    ...options,
    method: "POST",
    body: payload
  });
}

async function getWebshareProxyReplacement(jobRequest, replacementId, options = {}) {
  const access = getWebshareAccess(jobRequest, options);
  if (!access.ok) {
    return {
      ok: false,
      error: "Webshare API key is not configured."
    };
  }

  const safeId = Number(replacementId);
  if (!Number.isFinite(safeId)) {
    return { ok: false, error: "replacement_id is required" };
  }

  const url = new URL(`${access.proxyReplaceBaseUrl}/proxy/replace/${safeId}/`);
  if (options.planId) {
    url.searchParams.set("plan_id", String(options.planId));
  }
  return fetchWebshareJson(url.toString(), access.apiKey, options);
}

async function waitForWebshareProxyReplacement(jobRequest, replacementId, options = {}) {
  const timeoutMs = Math.max(5000, Math.min(300000, Number(options.timeoutMs) || 60000));
  const pollIntervalMs = Math.max(1000, Math.min(30000, Number(options.pollIntervalMs) || 3000));
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await getWebshareProxyReplacement(jobRequest, replacementId, options);
    if (!result.ok) {
      return result;
    }
    const state = sanitizeString(result.data?.state, 64).toLowerCase();
    if (["completed", "failed", "cancelled"].includes(state)) {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return {
    ok: false,
    error: `Timed out waiting for proxy replacement ${replacementId}.`
  };
}

function buildProxyProcurementPolicy(jobRequest, options = {}) {
  const metadata = isPlainObject(jobRequest?.metadata) ? jobRequest.metadata : {};
  return {
    autoReplaceCountryMismatch:
      parseBoolean(
        options.proxyAutoReplaceCountryMismatch ??
          metadata.submission_proxy_auto_replace_country_mismatch ??
          process.env.SUBMISSION_SELF_HOSTED_PROXY_AUTO_REPLACE_COUNTRY_MISMATCH ??
          process.env.SUBMISSION_DO_PROXY_AUTO_REPLACE_COUNTRY_MISMATCH ??
          "true"
      ) !== false,
    autoPurchaseEnabled:
      parseBoolean(
        options.proxyAutoPurchaseEnabled ??
          metadata.submission_proxy_auto_purchase_enabled ??
          process.env.SUBMISSION_SELF_HOSTED_PROXY_AUTO_PURCHASE_ENABLED ??
          process.env.SUBMISSION_DO_PROXY_AUTO_PURCHASE_ENABLED
      ) === true,
    creditsOnly:
      parseBoolean(
        options.proxyAutoPurchaseCreditsOnly ??
          metadata.submission_proxy_auto_purchase_credits_only ??
          process.env.SUBMISSION_SELF_HOSTED_PROXY_AUTO_PURCHASE_CREDITS_ONLY ??
          process.env.SUBMISSION_DO_PROXY_AUTO_PURCHASE_CREDITS_ONLY ??
          "true"
      ) !== false,
    allowPaymentRequired:
      parseBoolean(
        options.proxyAutoPurchaseAllowPaymentRequired ??
          metadata.submission_proxy_auto_purchase_allow_payment_required ??
          process.env.SUBMISSION_SELF_HOSTED_PROXY_AUTO_PURCHASE_ALLOW_PAYMENT_REQUIRED ??
          process.env.SUBMISSION_DO_PROXY_AUTO_PURCHASE_ALLOW_PAYMENT_REQUIRED
      ) === true,
    maxPaidTodayUsd: Math.max(
      0,
      Math.min(
        10000,
        Number(
          options.proxyAutoPurchaseMaxPaidTodayUsd ??
            metadata.submission_proxy_auto_purchase_max_paid_today_usd ??
            process.env.SUBMISSION_SELF_HOSTED_PROXY_AUTO_PURCHASE_MAX_PAID_TODAY_USD ??
            process.env.SUBMISSION_DO_PROXY_AUTO_PURCHASE_MAX_PAID_TODAY_USD
        ) || 0
      )
    )
  };
}

function chooseProxyRemediationStrategy(snapshot, target) {
  const targetCountryCode = sanitizeOptionalString(target?.country_code, 8) || null;
  if (!targetCountryCode) {
    return {
      action: "none",
      reason: "missing_target_country"
    };
  }

  if (
    snapshot.customizable &&
    snapshot.replacements_available > 0 &&
    Number(snapshot.current_countries?.[targetCountryCode] || 0) < 1 &&
    Number(snapshot.available_countries?.[targetCountryCode] || 0) > 0
  ) {
    return {
      action: "replace_country",
      target_country_code: targetCountryCode,
      reason: "country_available_via_replacement"
    };
  }

  return {
    action: "quote_plan_change",
    target_country_code: targetCountryCode,
    reason: "replacement_not_available"
  };
}

function buildCountryReplacementPayload(snapshot, targetCountryCode) {
  const currentCountries = isPlainObject(snapshot.current_countries) ? snapshot.current_countries : {};
  const [fromCountry, count] =
    Object.entries(currentCountries).sort((left, right) => Number(right[1]) - Number(left[1]))[0] || [];
  const replaceCount = Math.max(1, Number(count) || Number(snapshot.active_plan?.proxy_count) || 1);
  return {
    to_replace: {
      type: "country",
      country_code: fromCountry || "ANY",
      count: replaceCount
    },
    replace_with: [
      {
        type: "country",
        country_code: targetCountryCode,
        count: replaceCount
      }
    ],
    dry_run: false
  };
}

async function maybeEnsureSubmissionProxyCoverage(jobRequest, brandLike, options = {}) {
  const policy = buildProxyProcurementPolicy(jobRequest, options);
  const initialSelection = await resolveSubmissionProxySelection(jobRequest, brandLike, options.fallbackProxy || null, options);
  const target = extractProxyTargetFromBrand(brandLike);

  if (initialSelection?.selection?.matched !== false) {
    return {
      ok: true,
      changed: false,
      selection: initialSelection.selection,
      note: initialSelection.selection?.note || "Managed proxy inventory already matches the target geography."
    };
  }

  const snapshotResult = await fetchWebshareAccountSnapshot(jobRequest, options);
  if (!snapshotResult.ok) {
    return {
      ok: false,
      error: snapshotResult.error || "Failed to inspect Webshare account state."
    };
  }

  const snapshot = snapshotResult.snapshot;
  const strategy = chooseProxyRemediationStrategy(snapshot, target);
  if (strategy.action === "replace_country" && policy.autoReplaceCountryMismatch) {
    const replacementPayload = buildCountryReplacementPayload(snapshot, strategy.target_country_code);
    const createResult = await createWebshareProxyReplacement(jobRequest, replacementPayload, {
      ...options,
      planId: snapshot.active_plan?.id || snapshot.subscription?.plan
    });
    if (!createResult.ok) {
      return {
        ok: false,
        error: createResult.error || "Failed to create Webshare proxy replacement.",
        remediation: {
          strategy,
          snapshot
        }
      };
    }

    const replacementId = Number(createResult.data?.id);
    const waited = await waitForWebshareProxyReplacement(jobRequest, replacementId, {
      ...options,
      planId: snapshot.active_plan?.id || snapshot.subscription?.plan
    });
    if (!waited.ok) {
      return {
        ok: false,
        error: waited.error || "Failed waiting for Webshare proxy replacement.",
        remediation: {
          strategy,
          replacement: createResult.data
        }
      };
    }

    clearWebshareProxyCache(snapshotResult.access.providerConfig);
    const refreshedSelection = await resolveSubmissionProxySelection(jobRequest, brandLike, options.fallbackProxy || null, options);
    return {
      ok: true,
      changed: true,
      selection: refreshedSelection.selection,
      remediation: {
        strategy,
        replacement: waited.data
      },
      note:
        refreshedSelection.selection?.note ||
        `Replaced the current proxy allocation with ${strategy.target_country_code}.`
    };
  }

  if (strategy.action === "quote_plan_change") {
    const quoteQuery = buildSemidedicatedIspCountryQuoteQuery(
      strategy.target_country_code,
      snapshot.active_plan
    );
    const quoteResult = await fetchWebsharePricingQuote(jobRequest, quoteQuery, {
      ...options,
      planId: snapshot.active_plan?.id || snapshot.subscription?.plan
    });
    const quote = quoteResult.ok ? quoteResult.data : null;
    const paidToday = Number(quote?.paid_today) || 0;
    const purchaseAllowed =
      policy.autoPurchaseEnabled &&
      (!policy.creditsOnly || paidToday <= Number(snapshot.free_credits || 0)) &&
      (policy.allowPaymentRequired || paidToday <= Number(snapshot.free_credits || 0)) &&
      paidToday <= Number(policy.maxPaidTodayUsd || 0);

    return {
      ok: true,
      changed: false,
      selection: initialSelection.selection,
      remediation: {
        strategy,
        snapshot,
        quote,
        purchase_allowed: purchaseAllowed
      },
      note: quote
        ? `A ${strategy.target_country_code} ISP replacement plan is quotable, but not applied automatically.`
        : "A plan change may be required to match the target geography."
    };
  }

  return {
    ok: true,
    changed: false,
    selection: initialSelection.selection,
    remediation: {
      strategy,
      snapshot
    },
    note: "No proxy remediation action was taken."
  };
}

module.exports = {
  buildCountryReplacementPayload,
  buildProxyProcurementPolicy,
  buildSemidedicatedIspCountryQuoteQuery,
  chooseProxyRemediationStrategy,
  createWebshareProxyReplacement,
  fetchWebshareAccountSnapshot,
  fetchWebsharePricingQuote,
  getWebshareAccess,
  getWebshareProxyReplacement,
  maybeEnsureSubmissionProxyCoverage,
  waitForWebshareProxyReplacement
};
