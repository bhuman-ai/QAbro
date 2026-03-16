const { parseRequestBody, sanitizeString } = require("../../lib/qa-core");
const { getSupabaseAuthConfig, sanitizePublicUser, setSessionCookies } = require("../../lib/auth");

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

  const accessToken = sanitizeString(body?.access_token || body?.accessToken, 4096);
  const refreshToken = sanitizeString(body?.refresh_token || body?.refreshToken, 4096);

  if (!accessToken || !refreshToken) {
    return res.status(400).json({ ok: false, error: "Missing auth tokens" });
  }

  const config = getSupabaseAuthConfig();
  if (!config.ok) {
    return res.status(config.status || 500).json({ ok: false, error: config.error });
  }

  const response = await config.fetchImpl(`${config.supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: config.authApiKey,
      Authorization: `Bearer ${accessToken}`
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return res.status(401).json({ ok: false, error: "Invalid or expired sign-in link" });
  }

  setSessionCookies(res, req, {
    access_token: accessToken,
    refresh_token: refreshToken
  });

  return res.status(200).json({
    ok: true,
    user: sanitizePublicUser(data && typeof data === "object" ? data : null)
  });
};
