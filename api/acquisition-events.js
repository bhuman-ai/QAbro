const { writeAcquisitionEvent } = require("../lib/acquisition-events");
const { requireDashboardAuth } = require("../lib/auth");
const { parseRequestBody, sanitizeString } = require("../lib/qa-core");

const PUBLIC_EVENT_NAMES = new Set([
  "offer_viewed",
  "primary_cta_clicked",
  "agent_install_step_copied"
]);
const RECENT_SIGNUP_WINDOW_MS = 30 * 60 * 1000;

function isRecentSignup(createdAt, now = Date.now()) {
  const createdTime = Date.parse(sanitizeString(createdAt, 128));
  if (!Number.isFinite(createdTime)) {
    return false;
  }
  const age = Number(now) - createdTime;
  return age >= -5 * 60 * 1000 && age <= RECENT_SIGNUP_WINDOW_MS;
}

function isTestAttribution(attribution) {
  return sanitizeString(attribution?.utm_source, 160).toLowerCase() === "codex_test";
}

function publicEventKeyIsScoped(eventName, eventKey, visitorId) {
  const safeEventKey = sanitizeString(eventKey, 320);
  const safeVisitorId = sanitizeString(visitorId, 64).toLowerCase();
  return Boolean(safeVisitorId && safeEventKey.startsWith(`${eventName}:${safeVisitorId}`));
}

function createHandler(overrides = {}) {
  const dependencies = {
    parseRequestBody: overrides.parseRequestBody || parseRequestBody,
    requireDashboardAuth: overrides.requireDashboardAuth || requireDashboardAuth,
    writeAcquisitionEvent: overrides.writeAcquisitionEvent || writeAcquisitionEvent,
    now: overrides.now || (() => Date.now())
  };

  return async (req, res) => {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    let body;
    try {
      body = await dependencies.parseRequestBody(req);
    } catch {
      return res.status(400).json({ ok: false, error: "Invalid JSON body" });
    }

    const eventName = sanitizeString(body?.event_name || body?.eventName, 80).toLowerCase();
    const attribution = body?.attribution && typeof body.attribution === "object" ? body.attribution : {};
    const commonInput = {
      event_name: eventName,
      visitor_id: body?.visitor_id || body?.visitorId,
      landing_path: body?.landing_path || body?.landingPath,
      attribution,
      is_test: isTestAttribution(attribution),
      properties: body?.properties
    };

    let eventInput;
    if (eventName === "signup_completed") {
      const auth = await dependencies.requireDashboardAuth(req, res, { allowRefresh: true });
      if (!auth.ok || !auth.user?.id) {
        return res.status(auth.status || 401).json({ ok: false, error: "Authentication required" });
      }
      if (!isRecentSignup(auth.user.created_at, dependencies.now())) {
        return res.status(202).json({ ok: true, ignored: true, reason: "existing_user" });
      }
      eventInput = {
        ...commonInput,
        event_key: `signup_completed:${sanitizeString(auth.user.id, 128)}`,
        owner_user_id: auth.user.id
      };
    } else {
      if (!PUBLIC_EVENT_NAMES.has(eventName)) {
        return res.status(400).json({ ok: false, error: "event_name is not accepted from the browser" });
      }
      if (!publicEventKeyIsScoped(eventName, body?.event_key || body?.eventKey, commonInput.visitor_id)) {
        return res.status(400).json({ ok: false, error: "event_key must be scoped to the visitor" });
      }
      eventInput = {
        ...commonInput,
        event_key: body?.event_key || body?.eventKey
      };
    }

    const written = await dependencies.writeAcquisitionEvent(eventInput);
    if (!written.ok) {
      return res.status(written.status || 500).json({
        ok: false,
        error: written.error || "Could not record acquisition event"
      });
    }

    return res.status(written.created ? 201 : 200).json({
      ok: true,
      created: written.created === true
    });
  };
}

const handler = createHandler();

handler.__private = {
  createHandler,
  isRecentSignup,
  isTestAttribution,
  publicEventKeyIsScoped
};

module.exports = handler;
