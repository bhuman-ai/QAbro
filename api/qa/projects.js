const { requireDashboardOrServiceAuth } = require("../../lib/auth");
const { parseRequestBody, sanitizeString } = require("../../lib/qa-core");
const { listCanonicalQaProjects, upsertQaProjects } = require("../../lib/qa-projects");
const { getQaProfileState } = require("../../lib/qa-session-profiles");

function attachQaProfileMetadata(project, owner) {
  const safeProject = project && typeof project === "object" ? project : {};
  const metadata = safeProject.metadata && typeof safeProject.metadata === "object" ? safeProject.metadata : {};
  return {
    ...safeProject,
    metadata: {
      ...metadata,
      qa_profile: getQaProfileState(
        {
          ...safeProject,
          metadata: {
            ...metadata,
            owner_user_id: owner.ownerUserId || safeProject.owner_user_id,
            owner_email: owner.ownerEmail || safeProject.owner_email,
            brand_key: safeProject.brand_key
          }
        },
        {}
      )
    }
  };
}

module.exports = async (req, res) => {
  const auth = await requireDashboardOrServiceAuth(req, res);
  if (!auth.ok) {
    return res.status(auth.status || 401).json({ ok: false, error: "Authentication required" });
  }

  const ownerUserId = sanitizeString(auth.user?.id, 128);
  const ownerEmail = sanitizeString(auth.user?.email, 320).toLowerCase();
  if (auth.is_service_token && !ownerUserId) {
    return res.status(400).json({
      ok: false,
      error: "Provide x-owner-user-id or owner_user_id when managing projects via service token auth"
    });
  }

  if (req.method === "GET") {
    const listed = await listCanonicalQaProjects({
      owner_user_id: ownerUserId,
      owner_email: ownerEmail
    });
    if (!listed.ok) {
      return res.status(listed.status || 500).json({ ok: false, error: listed.error });
    }

    return res.status(200).json({
      ok: true,
      total: listed.total,
      items: (listed.items || []).map((item) =>
        attachQaProfileMetadata(item, {
          ownerUserId,
          ownerEmail
        })
      ),
      source: listed.source || "canonical"
    });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await parseRequestBody(req);
    } catch {
      return res.status(400).json({ ok: false, error: "Invalid JSON body" });
    }

    const payload = Array.isArray(body?.projects) ? body.projects : [body];
    const saved = await upsertQaProjects(payload, {
      owner_user_id: ownerUserId,
      owner_email: ownerEmail
    });
    if (!saved.ok) {
      return res.status(saved.status || 500).json({ ok: false, error: saved.error });
    }

    return res.status(200).json({
      ok: true,
      items: (saved.items || []).map((item) =>
        attachQaProfileMetadata(item, {
          ownerUserId,
          ownerEmail
        })
      )
    });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
};
