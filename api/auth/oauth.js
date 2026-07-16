const { parseRequestBody } = require("../../lib/qa-core");
const {
  buildOAuthAuthorizeUrl,
  getSupabaseAuthConfig,
  normalizeOAuthProvider,
  resolveMagicLinkRedirectTo
} = require("../../lib/auth");

const PROVIDER_LABELS = {
  google: "Google",
  github: "GitHub"
};

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

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

  const provider = normalizeOAuthProvider(body?.provider);
  if (!provider) {
    return res.status(400).json({ ok: false, error: "Unsupported sign-in provider" });
  }

  const config = getSupabaseAuthConfig();
  if (!config.ok) {
    return res.status(config.status || 500).json({ ok: false, error: config.error });
  }

  let settingsResponse;
  try {
    settingsResponse = await config.fetchImpl(`${config.supabaseUrl}/auth/v1/settings`, {
      method: "GET",
      headers: {
        apikey: config.authApiKey,
        Authorization: `Bearer ${config.authApiKey}`
      }
    });
  } catch {
    return res.status(502).json({ ok: false, error: "Could not start social sign-in. Use email instead." });
  }

  const settings = await settingsResponse.json().catch(() => ({}));
  if (!settingsResponse.ok) {
    return res.status(502).json({ ok: false, error: "Could not start social sign-in. Use email instead." });
  }

  if (!settings?.external?.[provider]) {
    return res.status(503).json({
      ok: false,
      error: `${PROVIDER_LABELS[provider]} sign-in is not available yet. Use email instead.`
    });
  }

  const redirectTo = resolveMagicLinkRedirectTo(req, body?.redirect_to || body?.redirectTo);
  const url = buildOAuthAuthorizeUrl(config.supabaseUrl, provider, redirectTo);
  if (!url) {
    return res.status(500).json({ ok: false, error: "Could not start social sign-in" });
  }

  return res.status(200).json({
    ok: true,
    provider,
    url
  });
};
