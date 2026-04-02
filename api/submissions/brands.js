const { parseRequestBody, sanitizeString } = require("../../lib/qa-core");
const { validateBrandProfileInput } = require("../../lib/submission-core");
const {
  loadSubmissionBrandProfile,
  listSubmissionBrandProfiles,
  upsertSubmissionBrandProfile
} = require("../../lib/submission-brand-profiles");
const { requireDashboardOrServiceAuth } = require("../../lib/auth");
const { hasSubmissionIdentity, normalizeSubmissionIdentityProfile } = require("../../lib/submission-identity");

function extractRequestedOwner(req, payload) {
  const ownerUserId = sanitizeString(
    req?.headers?.["x-owner-user-id"] || payload?.owner_user_id || payload?.ownerUserId,
    128
  );
  const ownerEmail = sanitizeString(
    req?.headers?.["x-owner-email"] || payload?.owner_email || payload?.ownerEmail,
    320
  ).toLowerCase();
  return { ownerUserId, ownerEmail };
}

function mergeBrandProfileForUpdate(existingRow, incomingData) {
  const existingProfile =
    existingRow?.profile && typeof existingRow.profile === "object" ? existingRow.profile : {};
  const nextProfile =
    incomingData?.profile && typeof incomingData.profile === "object" ? incomingData.profile : {};
  const existingIdentity = normalizeSubmissionIdentityProfile(existingProfile.identity, {
    includeSecrets: true
  });
  const nextIdentity = normalizeSubmissionIdentityProfile(nextProfile.identity, {
    includeSecrets: true
  });

  const mergedProfile = {
    ...existingProfile,
    ...nextProfile
  };

  if (hasSubmissionIdentity(existingIdentity) || hasSubmissionIdentity(nextIdentity)) {
    mergedProfile.identity = {
      ...existingIdentity,
      ...nextIdentity,
      mailbox: {
        ...(existingIdentity.mailbox && typeof existingIdentity.mailbox === "object" ? existingIdentity.mailbox : {}),
        ...(nextIdentity.mailbox && typeof nextIdentity.mailbox === "object" ? nextIdentity.mailbox : {})
      }
    };
  }

  return {
    ...existingRow,
    ...incomingData,
    profile: mergedProfile
  };
}

module.exports = async (req, res) => {
  const auth = await requireDashboardOrServiceAuth(req, res);
  if (!auth.ok) {
    return res.status(auth.status || 401).json({ ok: false, error: "Authentication required" });
  }

  if (req.method === "GET") {
    const brandProfileId = sanitizeString(req.query?.brand_profile_id || req.query?.brandProfileId, 128);
    const requestedOwner = extractRequestedOwner(req, req.query);
    const ownerUserId = sanitizeString(auth.user?.id, 128) || requestedOwner.ownerUserId;
    if (auth.is_service_token && !ownerUserId) {
      return res.status(400).json({ ok: false, error: "owner_user_id is required when using service token auth" });
    }

    if (!brandProfileId) {
      const listed = await listSubmissionBrandProfiles(
        {
          track: sanitizeString(req.query?.track, 64),
          brand_key: sanitizeString(req.query?.brand_key || req.query?.brandKey, 256),
          limit: sanitizeString(req.query?.limit, 16)
        },
        {
          ownerUserId
        }
      );
      if (!listed.ok) {
        return res.status(listed.status || 500).json({ ok: false, error: listed.error });
      }

      return res.status(200).json({
        ok: true,
        brand_profiles: listed.rows
      });
    }

    const loaded = await loadSubmissionBrandProfile(brandProfileId, {
      ownerUserId
    });
    if (!loaded.ok) {
      return res.status(loaded.status || 500).json({ ok: false, error: loaded.error });
    }

    return res.status(200).json({
      ok: true,
      brand_profile: loaded.row
    });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await parseRequestBody(req);
    } catch {
      return res.status(400).json({ ok: false, error: "Invalid JSON body" });
    }

    const validation = validateBrandProfileInput(body);
    if (!validation.ok) {
      return res.status(400).json({ ok: false, error: validation.error });
    }

    const requestedOwner = extractRequestedOwner(req, body);
    const ownerUserId = sanitizeString(auth.user?.id, 128) || requestedOwner.ownerUserId;
    const ownerEmail = sanitizeString(auth.user?.email, 320).toLowerCase() || requestedOwner.ownerEmail;
    if (auth.is_service_token && !ownerUserId) {
      return res.status(400).json({ ok: false, error: "owner_user_id is required when using service token auth" });
    }
    if (auth.is_service_token && !ownerEmail) {
      return res.status(400).json({ ok: false, error: "owner_email is required when using service token auth" });
    }

    const existing = await loadSubmissionBrandProfile(validation.data.brand_profile_id, {
      ownerUserId,
      includeSecrets: true
    });
    const mergedInput =
      existing.ok && existing.row
        ? mergeBrandProfileForUpdate(existing.row, validation.data)
        : validation.data;

    const saved = await upsertSubmissionBrandProfile(mergedInput, {
      ownerUserId,
      ownerEmail
    });
    if (!saved.ok) {
      return res.status(saved.status || 500).json({ ok: false, error: saved.error });
    }

    return res.status(200).json({
      ok: true,
      brand_profile: saved.row
    });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
};
