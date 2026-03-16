const { parseRequestBody, sanitizeString } = require("../../lib/qa-core");
const { getSupabaseAuthConfig, isValidEmail, resolveMagicLinkRedirectTo, sanitizeEmail } = require("../../lib/auth");

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
  const redirectTo = resolveMagicLinkRedirectTo(req, body?.redirect_to || body?.redirectTo);

  if (!isValidEmail(email)) {
    return res.status(400).json({ ok: false, error: "Invalid email" });
  }

  const config = getSupabaseAuthConfig();
  if (!config.ok) {
    return res.status(config.status || 500).json({ ok: false, error: config.error });
  }

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
      create_user: false,
      email_redirect_to: redirectTo,
      redirect_to: redirectTo
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
    if (response.status >= 400 && response.status < 500) {
      return res.status(200).json({
        ok: true,
        sent: true,
        message: "If your account exists, a magic link has been sent."
      });
    }
    return res.status(500).json({
      ok: false,
      error: message || "Could not send magic link"
    });
  }

  return res.status(200).json({
    ok: true,
    sent: true,
    message: "Check your email for your sign-in link."
  });
};
