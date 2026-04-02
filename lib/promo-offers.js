const { sanitizeString } = require("./qa-core");

const DEFAULT_PROMO_CODE = "TEAMREPORT";
const DEFAULT_PROMO_LABEL = "Team report offer";
const DEFAULT_PROMO_DESCRIPTION = "Shared report team offer";

function normalizePromoCode(value) {
  return sanitizeString(value, 64)
    .replace(/[^a-z0-9_-]/gi, "")
    .toUpperCase();
}

function readDefaultPromoOffer() {
  const code = normalizePromoCode(process.env.SWARM_SHARE_PROMO_CODE || process.env.QA_SHARE_PROMO_CODE || DEFAULT_PROMO_CODE);
  if (!code) {
    return null;
  }

  return {
    code,
    label: sanitizeString(process.env.SWARM_SHARE_PROMO_LABEL || DEFAULT_PROMO_LABEL, 160) || DEFAULT_PROMO_LABEL,
    description:
      sanitizeString(process.env.SWARM_SHARE_PROMO_DESCRIPTION || DEFAULT_PROMO_DESCRIPTION, 320) || DEFAULT_PROMO_DESCRIPTION,
    signupAccess: true
  };
}

function resolvePromoOfferByCode(value) {
  const code = normalizePromoCode(value);
  const offer = readDefaultPromoOffer();
  if (!code || !offer || code !== offer.code) {
    return null;
  }
  return offer;
}

function getPromoAuthConfig(options = {}) {
  const supabaseUrl = sanitizeString(options.supabaseUrl || process.env.SUPABASE_URL, 4096).replace(/\/$/, "");
  const serviceKey = sanitizeString(options.serviceKey || process.env.SUPABASE_SERVICE_KEY, 4096);
  const anonKey = sanitizeString(options.anonKey || process.env.SUPABASE_ANON_KEY, 4096);
  const fetchImpl = options.fetchImpl || global.fetch;

  if (!supabaseUrl || (!serviceKey && !anonKey)) {
    return { ok: false, status: 500, error: "Server is not configured" };
  }
  if (typeof fetchImpl !== "function") {
    return { ok: false, status: 500, error: "fetch is not available" };
  }

  return {
    ok: true,
    supabaseUrl,
    serviceKey,
    authApiKey: anonKey || serviceKey,
    fetchImpl
  };
}

function readRedeemedOffersFromMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") {
    return [];
  }

  const source = Array.isArray(metadata.swarm_redeemed_offers) ? metadata.swarm_redeemed_offers : [];
  const offers = [];
  for (const item of source) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const code = normalizePromoCode(item.code);
    if (!code) {
      continue;
    }
    offers.push({
      code,
      label: sanitizeString(item.label, 160) || null,
      redeemed_at: sanitizeString(item.redeemed_at, 128) || null,
      source: sanitizeString(item.source, 128) || null,
      share_run_id: sanitizeString(item.share_run_id, 128) || null
    });
  }
  return offers.slice(0, 12);
}

function hasRedeemedOffer(metadata, code) {
  const normalizedCode = normalizePromoCode(code);
  if (!normalizedCode) {
    return false;
  }
  return readRedeemedOffersFromMetadata(metadata).some((item) => item.code === normalizedCode);
}

function buildPendingPromoMetadata(metadata, offer, options = {}) {
  const base = metadata && typeof metadata === "object" ? { ...metadata } : {};
  const source = sanitizeString(options.source, 128) || "shared_report_signup";
  const shareRunId = sanitizeString(options.shareRunId, 128) || null;
  base.swarm_pending_offer_code = offer.code;
  base.swarm_pending_offer_label = offer.label;
  base.swarm_pending_offer_source = source;
  base.swarm_pending_offer_recorded_at = new Date().toISOString();
  if (shareRunId) {
    base.swarm_pending_offer_share_run_id = shareRunId;
  }
  return base;
}

function clearPendingPromoMetadata(metadata) {
  const next = metadata && typeof metadata === "object" ? { ...metadata } : {};
  delete next.swarm_pending_offer_code;
  delete next.swarm_pending_offer_label;
  delete next.swarm_pending_offer_source;
  delete next.swarm_pending_offer_recorded_at;
  delete next.swarm_pending_offer_share_run_id;
  return next;
}

function mergeRedeemedOfferIntoMetadata(metadata, offer, options = {}) {
  const source = sanitizeString(options.source, 128) || "shared_report";
  const shareRunId = sanitizeString(options.shareRunId, 128) || null;
  const next = clearPendingPromoMetadata(metadata);
  const existing = readRedeemedOffersFromMetadata(next);
  const match = existing.find((item) => item.code === offer.code);
  if (match) {
    return {
      metadata: next,
      alreadyRedeemed: true,
      entry: match
    };
  }

  const entry = {
    code: offer.code,
    label: offer.label,
    redeemed_at: new Date().toISOString(),
    source,
    share_run_id: shareRunId || null
  };
  next.swarm_redeemed_offers = [...existing, entry].slice(-12);
  next.swarm_team_offer_code = offer.code;
  next.swarm_team_offer_redeemed = true;

  return {
    metadata: next,
    alreadyRedeemed: false,
    entry
  };
}

async function fetchAuthUserByAccessToken(accessToken, options = {}) {
  const config = getPromoAuthConfig(options);
  if (!config.ok) {
    return config;
  }

  const response = await config.fetchImpl(`${config.supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: config.authApiKey,
      Authorization: `Bearer ${sanitizeString(accessToken, 4096)}`
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: sanitizeString(data?.error_description || data?.message || data?.error, 256) || "Could not resolve user profile"
    };
  }
  return { ok: true, status: 200, config, user: data && typeof data === "object" ? data : {} };
}

async function updateAuthUserMetadataByAccessToken(accessToken, metadata, options = {}) {
  const config = getPromoAuthConfig(options);
  if (!config.ok) {
    return config;
  }

  const response = await config.fetchImpl(`${config.supabaseUrl}/auth/v1/user`, {
    method: "PUT",
    headers: {
      apikey: config.authApiKey,
      Authorization: `Bearer ${sanitizeString(accessToken, 4096)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      data: metadata && typeof metadata === "object" ? metadata : {}
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: sanitizeString(data?.error_description || data?.message || data?.error, 256) || "Could not update offer"
    };
  }
  return { ok: true, status: 200, user: data && typeof data === "object" ? data : {} };
}

async function redeemPromoForAccessToken(accessToken, code, options = {}) {
  const normalizedCode = normalizePromoCode(code);
  const offer = resolvePromoOfferByCode(normalizedCode);
  if (!offer) {
    return {
      ok: false,
      status: 400,
      error: "Invalid team code"
    };
  }

  const fetched = await fetchAuthUserByAccessToken(accessToken, options);
  if (!fetched.ok) {
    return fetched;
  }

  const currentUser = fetched.user && typeof fetched.user === "object" ? fetched.user : {};
  const currentMetadata =
    currentUser.user_metadata && typeof currentUser.user_metadata === "object" ? currentUser.user_metadata : {};

  const merged = mergeRedeemedOfferIntoMetadata(currentMetadata, offer, options);
  if (merged.alreadyRedeemed) {
    return {
      ok: true,
      status: 200,
      offer,
      alreadyRedeemed: true,
      user: currentUser
    };
  }

  const updated = await updateAuthUserMetadataByAccessToken(accessToken, merged.metadata, options);
  if (!updated.ok) {
    return updated;
  }

  return {
    ok: true,
    status: 200,
    offer,
    alreadyRedeemed: false,
    user: updated.user
  };
}

async function redeemPendingPromoForAccessToken(accessToken, options = {}) {
  const fetched = await fetchAuthUserByAccessToken(accessToken, options);
  if (!fetched.ok) {
    return fetched;
  }

  const currentUser = fetched.user && typeof fetched.user === "object" ? fetched.user : {};
  const currentMetadata =
    currentUser.user_metadata && typeof currentUser.user_metadata === "object" ? currentUser.user_metadata : {};
  const pendingCode = normalizePromoCode(currentMetadata.swarm_pending_offer_code);
  if (!pendingCode) {
    return {
      ok: true,
      status: 200,
      offer: null,
      alreadyRedeemed: false,
      user: currentUser,
      skipped: true
    };
  }

  const offer = resolvePromoOfferByCode(pendingCode);
  if (!offer) {
    return {
      ok: false,
      status: 400,
      error: "Invalid team code"
    };
  }

  const source = sanitizeString(currentMetadata.swarm_pending_offer_source, 128) || options.source || "signup_magic_link";
  const shareRunId = sanitizeString(currentMetadata.swarm_pending_offer_share_run_id, 128) || options.shareRunId || null;
  const merged = mergeRedeemedOfferIntoMetadata(currentMetadata, offer, {
    ...options,
    source,
    shareRunId
  });
  if (merged.alreadyRedeemed) {
    return {
      ok: true,
      status: 200,
      offer,
      alreadyRedeemed: true,
      user: currentUser
    };
  }

  const updated = await updateAuthUserMetadataByAccessToken(accessToken, merged.metadata, options);
  if (!updated.ok) {
    return updated;
  }

  return {
    ok: true,
    status: 200,
    offer,
    alreadyRedeemed: false,
    user: updated.user
  };
}

module.exports = {
  DEFAULT_PROMO_CODE,
  normalizePromoCode,
  readDefaultPromoOffer,
  resolvePromoOfferByCode,
  readRedeemedOffersFromMetadata,
  hasRedeemedOffer,
  buildPendingPromoMetadata,
  mergeRedeemedOfferIntoMetadata,
  redeemPromoForAccessToken,
  redeemPendingPromoForAccessToken
};
