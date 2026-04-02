const Stripe = require("stripe");
const { sanitizeString } = require("./qa-core");

const DEFAULT_PUBLIC_BASE_URL = "https://swarmtester.com";
const DEFAULT_SHARE_CHECKOUT_MODE = "subscription";
const DEFAULT_SHARE_PROMO_PERCENT_OFF = 100;
const DEFAULT_SHARE_PROMO_DURATION = "once";
const DEFAULT_SHARE_PROMO_LABEL = "Team report offer";
const DEFAULT_SHARE_PROMO_CODE = "TEAMREPORT";

let cachedStripeKey = "";
let cachedStripeClient = null;

function normalizeStripePromoCode(value) {
  return sanitizeString(value, 64)
    .replace(/[^a-z0-9_-]/gi, "")
    .toUpperCase();
}

function sanitizeOptionalUrl(value) {
  const raw = sanitizeString(value, 4096);
  if (!raw) {
    return "";
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.toString();
  } catch {
    return "";
  }
}

function normalizeCheckoutMode(value) {
  const raw = sanitizeString(value, 32).toLowerCase();
  return raw === "payment" ? "payment" : DEFAULT_SHARE_CHECKOUT_MODE;
}

function normalizePercentOff(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SHARE_PROMO_PERCENT_OFF;
  }
  return Math.min(100, Math.max(1, Math.round(parsed)));
}

function normalizeDuration(value) {
  const raw = sanitizeString(value, 32).toLowerCase();
  if (raw === "forever" || raw === "once" || raw === "repeating") {
    return raw;
  }
  return DEFAULT_SHARE_PROMO_DURATION;
}

function normalizeDurationInMonths(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const safe = Math.max(1, Math.floor(parsed));
  return safe > 36 ? 36 : safe;
}

function normalizeMaxRedemptions(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const safe = Math.max(1, Math.floor(parsed));
  return safe > 100000 ? 100000 : safe;
}

function getStripeConfig(options = {}) {
  const secretKey = sanitizeString(options.secretKey || process.env.STRIPE_SECRET_KEY, 4096);
  const publishableKey = sanitizeString(options.publishableKey || process.env.STRIPE_PUBLISHABLE_KEY, 4096);
  const publicBaseUrl = sanitizeOptionalUrl(
    options.publicBaseUrl ||
      process.env.QA_PUBLIC_APP_URL ||
      process.env.AUTH_MAGIC_LINK_REDIRECT_BASE_URL ||
      DEFAULT_PUBLIC_BASE_URL
  ) || DEFAULT_PUBLIC_BASE_URL;
  const shareOfferPriceId = sanitizeString(
    options.shareOfferPriceId || process.env.STRIPE_SHARE_OFFER_PRICE_ID || process.env.STRIPE_DEFAULT_PRICE_ID,
    256
  );
  const shareOfferMode = normalizeCheckoutMode(
    options.shareOfferMode || process.env.STRIPE_SHARE_OFFER_MODE || DEFAULT_SHARE_CHECKOUT_MODE
  );
  const shareOfferSuccessUrl =
    sanitizeOptionalUrl(options.shareOfferSuccessUrl || process.env.STRIPE_SHARE_OFFER_SUCCESS_URL) || "";
  const shareOfferCancelUrl =
    sanitizeOptionalUrl(options.shareOfferCancelUrl || process.env.STRIPE_SHARE_OFFER_CANCEL_URL) || "";
  const sharePromoCode = normalizeStripePromoCode(
    options.sharePromoCode || process.env.SWARM_SHARE_PROMO_CODE || process.env.QA_SHARE_PROMO_CODE || DEFAULT_SHARE_PROMO_CODE
  );
  const sharePromoLabel =
    sanitizeString(options.sharePromoLabel || process.env.SWARM_SHARE_PROMO_LABEL, 160) || DEFAULT_SHARE_PROMO_LABEL;
  const sharePromoPercentOff = normalizePercentOff(
    options.sharePromoPercentOff || process.env.STRIPE_SHARE_PROMO_PERCENT_OFF
  );
  const sharePromoDuration = normalizeDuration(
    options.sharePromoDuration || process.env.STRIPE_SHARE_PROMO_DURATION || DEFAULT_SHARE_PROMO_DURATION
  );
  const sharePromoDurationInMonths =
    sharePromoDuration === "repeating"
      ? normalizeDurationInMonths(options.sharePromoDurationInMonths || process.env.STRIPE_SHARE_PROMO_DURATION_MONTHS)
      : null;
  const sharePromoMaxRedemptions = normalizeMaxRedemptions(
    options.sharePromoMaxRedemptions || process.env.STRIPE_SHARE_PROMO_MAX_REDEMPTIONS
  );

  return {
    secretKey,
    publishableKey,
    publicBaseUrl,
    shareOfferPriceId,
    shareOfferMode,
    shareOfferSuccessUrl,
    shareOfferCancelUrl,
    sharePromoCode,
    sharePromoLabel,
    sharePromoPercentOff,
    sharePromoDuration,
    sharePromoDurationInMonths,
    sharePromoMaxRedemptions
  };
}

function getStripeClient(options = {}) {
  const config = getStripeConfig(options);
  if (!config.secretKey) {
    return null;
  }
  if (cachedStripeClient && cachedStripeKey === config.secretKey) {
    return cachedStripeClient;
  }
  cachedStripeKey = config.secretKey;
  cachedStripeClient = new Stripe(config.secretKey);
  return cachedStripeClient;
}

function buildShareCheckoutRedirect(baseOrigin, targetPath, params = {}) {
  const url = new URL(targetPath || "/dashboard", baseOrigin || DEFAULT_PUBLIC_BASE_URL);
  for (const [key, value] of Object.entries(params)) {
    const safeValue = sanitizeString(value, 512);
    if (!safeValue) {
      continue;
    }
    url.searchParams.set(key, safeValue);
  }
  return url.toString();
}

async function findPromotionCodeByCode(code, options = {}) {
  const normalizedCode = normalizeStripePromoCode(code);
  const client = options.client || getStripeClient(options);
  if (!normalizedCode || !client) {
    return null;
  }
  const response = await client.promotionCodes.list({
    code: normalizedCode,
    active: true,
    limit: 1
  });
  return Array.isArray(response?.data) && response.data.length ? response.data[0] : null;
}

async function ensureSharePromotionCode(options = {}) {
  const config = getStripeConfig(options);
  const client = options.client || getStripeClient(options);
  if (!client) {
    return {
      ok: false,
      status: 500,
      error: "Stripe secret key is not configured"
    };
  }

  const code = normalizeStripePromoCode(options.code || config.sharePromoCode);
  if (!code) {
    return {
      ok: false,
      status: 400,
      error: "Promotion code is required"
    };
  }

  const existing = await findPromotionCodeByCode(code, { client, ...options });
  if (existing) {
    const existingCoupon = existing.coupon && typeof existing.coupon === "object" ? existing.coupon : null;
    return {
      ok: true,
      created: false,
      promotionCodeId: sanitizeString(existing.id, 128) || null,
      couponId:
        sanitizeString(existingCoupon?.id, 128) || sanitizeString(existing.coupon, 128) || null,
      code
    };
  }

  const couponPayload = {
    name: sanitizeString(options.label || config.sharePromoLabel, 160) || DEFAULT_SHARE_PROMO_LABEL,
    percent_off: normalizePercentOff(options.percentOff || config.sharePromoPercentOff),
    duration: normalizeDuration(options.duration || config.sharePromoDuration),
    metadata: {
      swarm_offer_source: "shared_report",
      swarm_offer_code: code
    }
  };
  if (couponPayload.duration === "repeating") {
    couponPayload.duration_in_months =
      normalizeDurationInMonths(options.durationInMonths || config.sharePromoDurationInMonths) || 1;
  }

  const coupon = await client.coupons.create(couponPayload);
  const promotionCodePayload = {
    coupon: coupon.id,
    code,
    active: true,
    metadata: {
      swarm_offer_source: "shared_report",
      swarm_offer_code: code
    }
  };
  const maxRedemptions = normalizeMaxRedemptions(options.maxRedemptions || config.sharePromoMaxRedemptions);
  if (maxRedemptions) {
    promotionCodePayload.max_redemptions = maxRedemptions;
  }
  const promotionCode = await client.promotionCodes.create(promotionCodePayload);
  return {
    ok: true,
    created: true,
    promotionCodeId: sanitizeString(promotionCode.id, 128) || null,
    couponId: sanitizeString(coupon.id, 128) || null,
    code
  };
}

async function createShareCheckoutSession(input = {}, options = {}) {
  const config = getStripeConfig(options);
  const client = options.client || getStripeClient(options);
  if (!client) {
    return {
      ok: false,
      status: 500,
      error: "Stripe secret key is not configured"
    };
  }
  if (!config.shareOfferPriceId) {
    return {
      ok: false,
      status: 409,
      error: "Stripe checkout price is not configured"
    };
  }

  const code = normalizeStripePromoCode(input.code || config.sharePromoCode);
  const shareRunId = sanitizeString(input.shareRunId, 128);
  const email = sanitizeString(input.email, 320).toLowerCase();
  const origin = sanitizeOptionalUrl(input.origin || config.publicBaseUrl) || config.publicBaseUrl;
  const promotionCode = code ? await findPromotionCodeByCode(code, { client, ...options }) : null;
  const successUrl =
    sanitizeOptionalUrl(input.successUrl || config.shareOfferSuccessUrl) ||
    buildShareCheckoutRedirect(origin, "/dashboard", {
      checkout: "success",
      promo: code,
      share_run_id: shareRunId,
      session_id: "{CHECKOUT_SESSION_ID}"
    });
  const cancelUrl =
    sanitizeOptionalUrl(input.cancelUrl || config.shareOfferCancelUrl) ||
    buildShareCheckoutRedirect(origin, "/dashboard", {
      checkout: "cancel",
      promo: code,
      share_run_id: shareRunId
    });

  const params = {
    mode: config.shareOfferMode,
    success_url: successUrl,
    cancel_url: cancelUrl,
    line_items: [
      {
        price: config.shareOfferPriceId,
        quantity: 1
      }
    ],
    metadata: {
      swarm_offer_source: "shared_report",
      swarm_offer_code: code || "",
      swarm_share_run_id: shareRunId || ""
    }
  };

  if (promotionCode?.id) {
    params.discounts = [{ promotion_code: promotionCode.id }];
  } else {
    params.allow_promotion_codes = true;
  }
  if (email) {
    params.customer_email = email;
  }
  if (shareRunId) {
    params.client_reference_id = shareRunId;
  }
  if (config.shareOfferMode === "subscription") {
    params.subscription_data = {
      metadata: {
        swarm_offer_source: "shared_report",
        swarm_offer_code: code || "",
        swarm_share_run_id: shareRunId || ""
      }
    };
  }

  const session = await client.checkout.sessions.create(params);
  return {
    ok: true,
    status: 200,
    id: sanitizeString(session?.id, 128) || null,
    url: sanitizeOptionalUrl(session?.url) || "",
    mode: config.shareOfferMode,
    promotionCodeId: sanitizeString(promotionCode?.id, 128) || null,
    priceId: config.shareOfferPriceId
  };
}

module.exports = {
  DEFAULT_SHARE_PROMO_CODE,
  DEFAULT_SHARE_PROMO_DURATION,
  DEFAULT_SHARE_PROMO_LABEL,
  DEFAULT_SHARE_PROMO_PERCENT_OFF,
  buildShareCheckoutRedirect,
  createShareCheckoutSession,
  ensureSharePromotionCode,
  findPromotionCodeByCode,
  getStripeClient,
  getStripeConfig,
  normalizeStripePromoCode
};
