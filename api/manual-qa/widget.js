const { getPublicBaseUrl, sanitizeString } = require("../../lib/qa-core");
const { buildManualQaWidgetScript } = require("../../lib/manual-qa-widget");

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-bud-widget-token");
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).send("Method not allowed");
  }

  const sessionId = sanitizeString(req.query?.session_id || req.query?.sessionId, 128);
  const token = sanitizeString(req.query?.token, 512);
  if (!sessionId || !token) {
    return res.status(400).send("session_id and token are required");
  }

  const publicBaseUrl = getPublicBaseUrl(req).replace(/\/$/, "");
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  return res.status(200).send(
    buildManualQaWidgetScript({
      sessionId,
      token,
      apiBaseUrl: publicBaseUrl
    })
  );
};
