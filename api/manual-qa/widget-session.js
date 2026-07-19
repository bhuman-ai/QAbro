const { parseRequestBody, sanitizeString } = require("../../lib/qa-core");
const {
  buildManualQaCaptureSessionView,
  getManualQaWidgetSession,
  updateManualQaWidgetItem
} = require("../../lib/manual-qa");

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-bud-widget-token");
}

function readToken(req, body) {
  return sanitizeString(
    req.headers?.["x-bud-widget-token"] ||
      req.query?.token ||
      body?.token,
    512
  );
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method === "GET") {
    const sessionId = sanitizeString(req.query?.session_id || req.query?.sessionId, 128);
    const token = readToken(req, null);
    if (!sessionId || !token) {
      return res.status(400).json({ ok: false, error: "session_id and token are required" });
    }
    const loaded = await getManualQaWidgetSession(sessionId, token, { request: req });
    if (!loaded.ok) {
      return res.status(loaded.status || 500).json({ ok: false, error: loaded.error });
    }
    return res.status(200).json({
      ok: true,
      session: buildManualQaCaptureSessionView(loaded.session)
    });
  }

  if (req.method !== "POST" && req.method !== "PATCH") {
    res.setHeader("Allow", "GET, POST, PATCH, OPTIONS");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  let body;
  try {
    body = await parseRequestBody(req);
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid JSON body" });
  }

  const sessionId = sanitizeString(body?.session_id || body?.sessionId || req.query?.session_id, 128);
  const itemId = sanitizeString(body?.item_id || body?.itemId || req.query?.item_id, 80);
  const token = readToken(req, body);
  if (!sessionId || !token) {
    return res.status(400).json({ ok: false, error: "session_id and token are required" });
  }
  if (!itemId) {
    return res.status(400).json({ ok: false, error: "item_id is required" });
  }

  const updated = await updateManualQaWidgetItem(sessionId, token, itemId, body || {}, { request: req });
  if (!updated.ok) {
    return res.status(updated.status || 500).json({ ok: false, error: updated.error, data: updated.data });
  }
  const session = buildManualQaCaptureSessionView(updated.session);
  return res.status(200).json({
    ok: true,
    session,
    item: session.checklist.find((candidate) => candidate.id === itemId) || null
  });
};
