const { sanitizeString } = require("../../lib/qa-core");
const { requireDashboardOrServiceAuth } = require("../../lib/auth");
const { fetchStoredEvidenceObject } = require("../../lib/qa-evidence-storage");
const {
  getManualQaSession,
  verifyManualQaWidgetToken
} = require("../../lib/manual-qa");
const { sendMediaBuffer } = require("../qa/evidence").__private;

function readWidgetToken(req) {
  return sanitizeString(req.headers?.["x-bud-widget-token"], 512);
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const sessionId = sanitizeString(req.query?.session_id || req.query?.sessionId, 128);
  const itemId = sanitizeString(req.query?.item_id || req.query?.itemId, 80);
  const evidenceId = sanitizeString(req.query?.evidence_id || req.query?.evidenceId, 160);
  const index = Number.parseInt(sanitizeString(req.query?.index, 16), 10);
  if (!sessionId || !itemId || (!evidenceId && (!Number.isFinite(index) || index < 0))) {
    return res.status(400).json({ ok: false, error: "session_id, item_id, and evidence_id or index are required" });
  }

  let loaded;
  const widgetToken = readWidgetToken(req);
  if (widgetToken) {
    loaded = await verifyManualQaWidgetToken(sessionId, widgetToken, { request: req });
  } else {
    const auth = await requireDashboardOrServiceAuth(req, res, { rejectInvalidServiceToken: false });
    if (!auth.ok) {
      return res.status(auth.status || 401).json({ ok: false, error: auth.error || "Authentication required" });
    }
    loaded = await getManualQaSession(sessionId, {
      authOk: auth.ok,
      ownerUserId: sanitizeString(auth.user?.id, 128),
      request: req
    });
  }
  if (!loaded.ok) {
    return res.status(loaded.status || 500).json({ ok: false, error: loaded.error });
  }

  const item = loaded.session.checklist.find((candidate) => candidate.id === itemId);
  const evidence = evidenceId
    ? item?.evidence_media?.find((candidate) => candidate.evidence_id === evidenceId)
    : item?.evidence_media?.[index];
  if (!evidence) {
    return res.status(404).json({ ok: false, error: "Evidence item not found" });
  }

  const storedObject = await fetchStoredEvidenceObject(evidence);
  if (!storedObject?.data?.length) {
    return res.status(404).json({ ok: false, error: "Stored evidence not found" });
  }
  return sendMediaBuffer(req, res, storedObject.data, storedObject.contentType, "private, max-age=3600");
};
