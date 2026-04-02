const { isQaAlertEmailConfigured } = require("../lib/qa-alert-email");
const { buildQaRunRequest } = require("../lib/qa-mcp");
const { getPublicBaseUrl, parseRequestBody, sanitizeString } = require("../lib/qa-core");
const { isValidEmail } = require("../lib/auth");
const { enqueueQaRun, generateQaReportShareToken } = require("../lib/qa-queue");

function deriveBrandKey(urlString) {
  try {
    const parsed = new URL(urlString);
    return parsed.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "public-site";
  }
}

function buildRunId(brandKey) {
  const slug = sanitizeString(brandKey, 128).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `homepage_${slug || "site"}_${Date.now()}`;
}

function normalizePublicUrl(value) {
  const raw = sanitizeString(value, 2048);
  if (!raw) {
    return "";
  }
  const hasScheme = /^https?:\/\//i.test(raw);
  try {
    const parsed = new URL(hasScheme ? raw : `https://${raw}`);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.toString();
  } catch {
    return "";
  }
}

function resolvePublicQaOwner(env = process.env) {
  const ownerUserId = sanitizeString(
    env.HOMEPAGE_QA_OWNER_USER_ID || env.SITE_QA_OWNER_USER_ID || env.QA_MCP_OWNER_USER_ID || env.SWARM_OWNER_USER_ID,
    128
  );
  const ownerEmail = sanitizeString(
    env.HOMEPAGE_QA_OWNER_EMAIL || env.SITE_QA_OWNER_EMAIL || env.QA_MCP_OWNER_EMAIL || env.SWARM_OWNER_EMAIL,
    320
  ).toLowerCase();

  return {
    ownerUserId: ownerUserId || null,
    ownerEmail: ownerEmail || null
  };
}

function buildSharedReportUrl(baseUrl, runId, brandKey, shareToken) {
  const params = new URLSearchParams({
    view: "report",
    run_id: runId,
    share_key: shareToken
  });
  if (brandKey) {
    params.set("brand", brandKey);
  }
  return `${baseUrl}/dashboard?${params.toString()}#qa-dashboard`;
}

function formatEstimatedStartLabel(seconds) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
  if (!safeSeconds) {
    return "";
  }
  if (safeSeconds < 60) {
    return `about ${safeSeconds}s`;
  }
  const minutes = Math.round(safeSeconds / 60);
  if (minutes < 60) {
    return `about ${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (!remainingMinutes) {
    return `about ${hours}h`;
  }
  return `about ${hours}h ${remainingMinutes}m`;
}

function buildQueuedResponse(baseUrl, runRequest, shareToken, queued, requesterEmail) {
  const brandKey = deriveBrandKey(runRequest.target_url);
  const estimatedStartSeconds =
    typeof queued?.queue?.estimated_start_seconds === "number" && Number.isFinite(queued.queue.estimated_start_seconds)
      ? Math.max(0, Math.round(queued.queue.estimated_start_seconds))
      : null;
  const queueAhead =
    typeof queued?.queue?.queue_ahead === "number" && Number.isFinite(queued.queue.queue_ahead)
      ? Math.max(0, Math.round(queued.queue.queue_ahead))
      : null;
  const estimatedStartLabel = estimatedStartSeconds ? formatEstimatedStartLabel(estimatedStartSeconds) : "";
  return {
    ok: true,
    queued: true,
    run_id: runRequest.run_id,
    email: requesterEmail,
    target_url: runRequest.target_url,
    report_url: `${baseUrl}/api/qa/report?run_id=${encodeURIComponent(runRequest.run_id)}`,
    status_url: `${baseUrl}/api/qa/status?run_id=${encodeURIComponent(runRequest.run_id)}`,
    ui_report_url: `${baseUrl}/dashboard?view=report&run_id=${encodeURIComponent(runRequest.run_id)}&brand=${encodeURIComponent(brandKey)}`,
    share_url: buildSharedReportUrl(baseUrl, runRequest.run_id, brandKey, shareToken),
    queue: queued?.queue || null,
    estimated_start_seconds: estimatedStartSeconds,
    estimated_start_label: estimatedStartLabel || null,
    queue_ahead: queueAhead,
    message: `Queued a real browser-backed QA run for ${brandKey}. We'll email the report to ${requesterEmail} when it finishes.`
  };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  let body;
  try {
    body = await parseRequestBody(req);
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid JSON body" });
  }

  const rawEmail = sanitizeString(body?.email, 320).toLowerCase();
  if (!isValidEmail(rawEmail)) {
    return res.status(400).json({ ok: false, error: "Enter a real work email so we can send the finished report." });
  }

  if (!isQaAlertEmailConfigured(process.env)) {
    return res.status(503).json({ ok: false, error: "Email delivery is not configured right now. Please try again later." });
  }

  const owner = resolvePublicQaOwner(process.env);
  if (!owner.ownerUserId || !owner.ownerEmail) {
    return res.status(500).json({ ok: false, error: "Public QA requests are not configured right now." });
  }

  const shareToken = generateQaReportShareToken();

  const normalizedTargetUrl = normalizePublicUrl(body?.url);
  if (!normalizedTargetUrl) {
    return res.status(400).json({
      ok: false,
      error: "Enter a real public URL, like clusterseo.com or https://clusterseo.com."
    });
  }

  let runRequest;
  try {
    const brandKey = deriveBrandKey(normalizedTargetUrl);
    runRequest = buildQaRunRequest(
      {
        run_id: buildRunId(brandKey),
        target_url: normalizedTargetUrl,
        scope_mode: "core_20m",
        feature_name: "Homepage trial run",
        task_to_try:
          "Act like a first-time visitor, understand what the product does, try the main get-started, sign-up, or start-free path, and keep going until you either reach the first meaningful product state or can clearly show what blocked progress.",
        expected_success:
          "The tester reaches the first meaningful signed-in or in-product state, or ends with a clear blocker and video-backed report.",
        persona:
          "A first-time product buyer evaluating whether this site feels trustworthy, clear, and easy to start using.",
        source: "homepage_public_request"
      },
      {
        defaultBrand: brandKey
      }
    );
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Enter a real public URL, like clusterseo.com or https://clusterseo.com."
    });
  }

  runRequest.metadata = {
    ...(runRequest.metadata && typeof runRequest.metadata === "object" ? runRequest.metadata : {}),
    owner_user_id: owner.ownerUserId,
    owner_email: owner.ownerEmail,
    public_request_email: rawEmail,
    public_request_source: "homepage",
    public_request_share_token: shareToken,
    public_request_share_enabled: true,
    public_request_delivery: "email_share_link"
  };

  const publicBaseUrl = getPublicBaseUrl(req);
  const queued = await enqueueQaRun(runRequest, {
    publicBaseUrl,
    reportUrl: `${publicBaseUrl}/api/qa/report?run_id=${encodeURIComponent(runRequest.run_id)}`,
    statusUrl: `${publicBaseUrl}/api/qa/status?run_id=${encodeURIComponent(runRequest.run_id)}`,
    additionalPayload: {
      share: {
        enabled: true,
        token: shareToken,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        revoked_at: null
      }
    }
  });

  if (!queued.ok) {
    return res.status(queued.status || 500).json({
      ok: false,
      error: queued.error || "Could not queue a real QA run right now."
    });
  }

  return res.status(202).json(buildQueuedResponse(publicBaseUrl, runRequest, shareToken, queued, rawEmail));
};

module.exports.__private = {
  buildQueuedResponse,
  buildRunId,
  buildSharedReportUrl,
  deriveBrandKey,
  resolvePublicQaOwner
};
