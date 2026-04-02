const { requireDashboardOrServiceAuth } = require("../../lib/auth");
const { sanitizeString } = require("../../lib/qa-core");
const { listSubmissionOperatorInbox } = require("../../lib/operator-inbox");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const auth = await requireDashboardOrServiceAuth(req, res);
  if (!auth.ok) {
    return res.status(auth.status || 401).json({ ok: false, error: "Authentication required" });
  }

  const ownerUserId =
    sanitizeString(auth.user?.id, 128) ||
    sanitizeString(req.headers?.["x-owner-user-id"] || req.query?.owner_user_id || req.query?.ownerUserId, 128);
  if (auth.is_service_token && !ownerUserId) {
    return res.status(400).json({ ok: false, error: "owner_user_id is required when using service token auth" });
  }

  const listed = await listSubmissionOperatorInbox(
    {
      owner_user_id: ownerUserId,
      limit: req.query?.limit,
      offset: req.query?.offset,
      state: req.query?.state,
      status: req.query?.status,
      job_type: req.query?.job_type || req.query?.jobType,
      human_only: req.query?.human_only !== "false",
      search: req.query?.search
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
    total: listed.total,
    limit: listed.limit,
    offset: listed.offset,
    items: listed.items
  });
};
