const { parseRequestBody, sanitizeString } = require("../../lib/qa-core");
const {
  buildManualQaAgentFeedbackMarkdown,
  recordManualQaAgentFeedback,
  verifyManualQaWidgetToken
} = require("../../lib/manual-qa");

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
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
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  let body;
  try {
    body = await parseRequestBody(req);
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid JSON body" });
  }

  const sessionId = sanitizeString(body?.session_id || body?.sessionId || req.query?.session_id, 128);
  const token = readToken(req, body);
  const scope = sanitizeString(body?.scope || "item", 24).toLowerCase() === "all" ? "all" : "item";
  const itemId = sanitizeString(body?.item_id || body?.itemId || req.query?.item_id, 80);
  const feedbackAction = sanitizeString(
    body?.feedback_action || body?.feedbackAction || body?.feedback_mode || body?.feedbackMode || body?.agent_action_mode || body?.agentActionMode,
    80
  );
  const feedbackId = sanitizeString(
    body?.feedback_id || body?.feedbackId || body?.client_event_id || body?.clientEventId || body?.event_id || body?.eventId,
    128
  );
  if (!sessionId || !token) {
    return res.status(400).json({ ok: false, error: "session_id and token are required" });
  }
  if (scope === "item" && !itemId) {
    return res.status(400).json({ ok: false, error: "item_id is required for item feedback" });
  }

  const verified = await verifyManualQaWidgetToken(sessionId, token, { request: req });
  if (!verified.ok) {
    return res.status(verified.status || 500).json({ ok: false, error: verified.error });
  }
  if (
    scope === "item" &&
    !((verified.session.checklist || []).some((item) => item.id === itemId))
  ) {
    return res.status(404).json({ ok: false, error: "Checklist item not found" });
  }

  const markdown = buildManualQaAgentFeedbackMarkdown(verified.session, {
    item_id: scope === "item" ? itemId : "",
    feedback_action: feedbackAction
  });
  const recorded = await recordManualQaAgentFeedback(
    verified,
    {
      feedback_id: feedbackId || undefined,
      scope,
      item_id: scope === "item" ? itemId : null,
      feedback_action: feedbackAction,
      markdown,
      generated_at: new Date().toISOString()
    },
    { request: req }
  );
  if (!recorded.ok) {
    return res.status(recorded.status || 500).json({ ok: false, error: recorded.error, data: recorded.data });
  }

  return res.status(200).json({
    ok: true,
    scope,
    session_id: sessionId,
    item_id: scope === "item" ? itemId : null,
    feedback_action: recorded.feedback.feedback_action || null,
    feedback_id: recorded.feedback.feedback_id,
    agent_delivery: {
      ready: true,
      feedback_id: recorded.feedback.feedback_id,
      note: "Feedback was saved for the MCP agent. Clipboard copy remains a fallback."
    },
    generated_at: new Date().toISOString(),
    markdown: recorded.feedback.markdown || markdown,
    session: recorded.session
  });
};
