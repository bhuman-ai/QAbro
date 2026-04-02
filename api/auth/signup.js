const { parseRequestBody, sanitizeString } = require("../../lib/qa-core");
const { getInviteCode, getSupabaseAuthConfig, isValidEmail, resolveMagicLinkRedirectTo, sanitizeEmail } = require("../../lib/auth");
const { buildPendingPromoMetadata, resolvePromoOfferByCode } = require("../../lib/promo-offers");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  let body;
  try {
    body = await parseRequestBody(req);
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid JSON body" });
  }

  const email = sanitizeEmail(body?.email);
  const inviteCode = sanitizeString(body?.invite_code || body?.inviteCode, 128);
  const redirectTo = resolveMagicLinkRedirectTo(req, body?.redirect_to || body?.redirectTo);
  const shareRunId = sanitizeString(body?.share_run_id || body?.shareRunId, 128);
  const requiredInviteCode = getInviteCode();
  const promoOffer = resolvePromoOfferByCode(inviteCode);

  if (!isValidEmail(email)) {
    return res.status(400).json({ ok: false, error: "Invalid email" });
  }

  if (!inviteCode || (inviteCode !== requiredInviteCode && !promoOffer)) {
    return res.status(403).json({ ok: false, error: "Invalid invite code" });
  }

  const config = getSupabaseAuthConfig();
  if (!config.ok) {
    return res.status(config.status || 500).json({ ok: false, error: config.error });
  }

  const metadata = promoOffer
    ? buildPendingPromoMetadata(
        {
          swarm_onboarding_seen: false,
          swarm_signup_source: "shared_report_offer"
        },
        promoOffer,
        {
          source: "shared_report_signup",
          shareRunId
        }
      )
    : {
        swarm_onboarding_seen: false,
        swarm_signup_source: "dashboard_invite"
      };

  const response = await config.fetchImpl(`${config.supabaseUrl}/auth/v1/otp`, {
    method: "POST",
    headers: {
      apikey: config.authApiKey,
      Authorization: `Bearer ${config.authApiKey}`,
      "Content-Type": "application/json",
      redirect_to: redirectTo
    },
    body: JSON.stringify({
      email,
      create_user: true,
      email_redirect_to: redirectTo,
      redirect_to: redirectTo,
      data: metadata
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = sanitizeString(data?.error_description || data?.msg || data?.message, 220);
    if (message.toLowerCase().includes("redirect")) {
      return res.status(500).json({
        ok: false,
        error: "Auth redirect URL is misconfigured. Contact support."
      });
    }
    if (response.status >= 400 && response.status < 500 && message.toLowerCase().includes("invalid")) {
      return res.status(400).json({ ok: false, error: "Invalid email" });
    }
    if (message.toLowerCase().includes("rate limit")) {
      return res.status(429).json({ ok: false, error: "Too many requests. Try again shortly." });
    }
    return res.status(500).json({
      ok: false,
      error: message || "Could not send magic link"
    });
  }

  return res.status(200).json({
    ok: true,
    sent: true,
    message: promoOffer ? "Team code accepted. Check your email for your sign-in link." : "Check your email for your sign-in link."
  });
};
