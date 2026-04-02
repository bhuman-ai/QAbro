const { requireDashboardOrServiceAuth } = require("../../lib/auth");
const { getPublicBaseUrl, isPlainObject, loadStoredReportByRunId, sanitizeString, toIsoTimestamp } = require("../../lib/qa-core");
const {
  extractBrandKey,
  extractOwnerUserId,
  generateQaReportShareToken,
  readReportShareSettings,
  updateQueueRow
} = require("../../lib/qa-queue");

function buildSharedReportUrl(req, runId, row, token) {
  const publicBaseUrl = getPublicBaseUrl(req);
  const params = new URLSearchParams({
    view: "report",
    run_id: String(runId || "").trim(),
    share_key: String(token || "").trim()
  });
  const brand = sanitizeString(extractBrandKey(row), 256);
  if (brand) {
    params.set("brand", brand);
  }
  return `${publicBaseUrl}/dashboard?${params.toString()}#qa-dashboard`;
}

module.exports = async (req, res) => {
  if (!["GET", "POST", "DELETE"].includes(req.method || "")) {
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const auth = await requireDashboardOrServiceAuth(req, res);
  if (!auth.ok) {
    return res.status(auth.status || 401).json({ ok: false, error: "Authentication required" });
  }

  const runId = sanitizeString(req.query?.run_id || req.query?.runId, 128);
  if (!runId) {
    return res.status(400).json({ ok: false, error: "run_id is required" });
  }

  const ownerUserId = sanitizeString(auth.user?.id, 128);
  if (auth.is_service_token && !ownerUserId) {
    return res.status(400).json({
      ok: false,
      error: "Provide x-owner-user-id or owner_user_id when managing share links via service token auth"
    });
  }

  const loaded = await loadStoredReportByRunId(runId);
  if (!loaded.ok) {
    return res.status(loaded.status || 500).json({ ok: false, error: loaded.error });
  }

  const rowOwnerUserId = sanitizeString(extractOwnerUserId(loaded.row), 128);
  if (ownerUserId && (!rowOwnerUserId || rowOwnerUserId !== ownerUserId)) {
    return res.status(404).json({ ok: false, error: "Run not found" });
  }

  const row = loaded.row;
  const payload = isPlainObject(row?.payload) ? row.payload : {};
  const existingShare = readReportShareSettings(row);

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      run_id: runId,
      enabled: existingShare.enabled,
      share_url: existingShare.enabled ? buildSharedReportUrl(req, runId, row, existingShare.token) : null
    });
  }

  const now = toIsoTimestamp(new Date());
  let nextShare = null;

  if (req.method === "DELETE") {
    nextShare = {
      enabled: false,
      token: null,
      created_at: existingShare.created_at || null,
      updated_at: now,
      revoked_at: now
    };
  } else {
    const token = existingShare.enabled && existingShare.token ? existingShare.token : generateQaReportShareToken();
    nextShare = {
      enabled: true,
      token,
      created_at: existingShare.created_at || now,
      updated_at: now,
      revoked_at: null
    };
  }

  const updated = await updateQueueRow(runId, {
    payload: {
      ...payload,
      share: nextShare
    }
  });

  if (!updated.ok) {
    return res.status(updated.status || 500).json({ ok: false, error: updated.error || "Failed to update share settings" });
  }

  return res.status(200).json({
    ok: true,
    run_id: runId,
    enabled: nextShare.enabled === true,
    share_url: nextShare.enabled ? buildSharedReportUrl(req, runId, row, nextShare.token) : null
  });
};
