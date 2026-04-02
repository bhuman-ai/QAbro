const { parseRequestBody, sanitizeString } = require("../../lib/qa-core");
const { resolveAuthSession } = require("../../lib/auth");
const { createShareCheckoutSession, getStripeConfig } = require("../../lib/stripe");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  let body = {};
  try {
    body = (await parseRequestBody(req)) || {};
  } catch {
    body = {};
  }

  const config = getStripeConfig();
  if (!config.secretKey) {
    return res.status(500).json({ ok: false, error: "Stripe is not configured" });
  }
  if (!config.shareOfferPriceId) {
    return res.status(409).json({
      ok: false,
      error: "Stripe checkout is not configured for the shared team offer yet"
    });
  }

  const shareRunId = sanitizeString(body?.share_run_id || body?.shareRunId, 128);
  const promoCode = sanitizeString(body?.code || body?.coupon_code || body?.promo_code || config.sharePromoCode, 128);
  const explicitEmail = sanitizeString(body?.email, 320).toLowerCase();

  let email = explicitEmail;
  if (!email) {
    const session = await resolveAuthSession(req, res, { allowRefresh: true });
    if (session.ok && session.user?.email) {
      email = sanitizeString(session.user.email, 320).toLowerCase();
    }
  }

  const origin =
    sanitizeString(req?.headers?.origin, 4096) ||
    sanitizeString(req?.headers?.referer, 4096) ||
    config.publicBaseUrl;

  try {
    const created = await createShareCheckoutSession(
      {
        code: promoCode,
        shareRunId,
        email,
        origin
      },
      config
    );

    if (!created.ok) {
      return res.status(created.status || 400).json({
        ok: false,
        error: created.error || "Could not start checkout"
      });
    }

    return res.status(200).json({
      ok: true,
      checkout_url: created.url,
      session_id: created.id,
      price_id: created.priceId,
      promotion_code_id: created.promotionCodeId
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: sanitizeString(error?.message, 240) || "Could not start checkout"
    });
  }
};
