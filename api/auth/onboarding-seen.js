const { parseRequestBody } = require("../../lib/qa-core");
const { getSupabaseAuthConfig, requireDashboardAuth, sanitizePublicUser } = require("../../lib/auth");

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

  const seen = body?.seen === false ? false : true;
  const session = await requireDashboardAuth(req, res, { allowRefresh: true });
  if (!session.ok) {
    return res.status(session.status || 401).json({ ok: false, error: "Authentication required" });
  }

  const config = getSupabaseAuthConfig();
  if (!config.ok) {
    return res.status(config.status || 500).json({ ok: false, error: config.error });
  }

  const accessToken = String(session.accessToken || "").trim();
  if (!accessToken) {
    return res.status(401).json({ ok: false, error: "Authentication required" });
  }

  const fetchUserResponse = await config.fetchImpl(`${config.supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: config.authApiKey,
      Authorization: `Bearer ${accessToken}`
    }
  });
  const fetchUserData = await fetchUserResponse.json().catch(() => ({}));
  if (!fetchUserResponse.ok) {
    return res.status(500).json({ ok: false, error: "Could not resolve user profile" });
  }

  const currentMetadata =
    fetchUserData && typeof fetchUserData === "object" && fetchUserData.user_metadata && typeof fetchUserData.user_metadata === "object"
      ? fetchUserData.user_metadata
      : {};

  const updateResponse = await config.fetchImpl(`${config.supabaseUrl}/auth/v1/user`, {
    method: "PUT",
    headers: {
      apikey: config.authApiKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      data: {
        ...currentMetadata,
        swarm_onboarding_seen: Boolean(seen)
      }
    })
  });
  const updateData = await updateResponse.json().catch(() => ({}));
  if (!updateResponse.ok) {
    return res.status(500).json({ ok: false, error: "Could not update onboarding state" });
  }

  return res.status(200).json({
    ok: true,
    user: sanitizePublicUser(updateData && typeof updateData === "object" ? updateData : fetchUserData)
  });
};
