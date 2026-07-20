const { requireDashboardAuth } = require("../lib/auth");
const { getPublicBaseUrl, parseRequestBody, sanitizeString } = require("../lib/qa-core");
const {
  claimHumanTestRequest,
  getHumanTestRequest,
  listHumanTestRequests
} = require("../lib/human-test-requests");
const { issueQaTrialTesterLink } = require("../lib/qa-trials");
const { getTesterApplication } = require("../lib/tester-applications");

function testerJobView(request, options = {}) {
  const safe = request && typeof request === "object" ? request : {};
  return {
    id: sanitizeString(safe.id, 128),
    product_name: sanitizeString(safe.product_name, 180) || "Product",
    review_type:
      safe.review_type === "specific_flow" ? "specific_flow" : "general_first_time_user",
    test_focus: sanitizeString(safe.test_focus, 2400),
    expected_success: sanitizeString(safe.expected_success, 1600) || null,
    duration_minutes: Math.max(10, Math.min(60, Number(safe.duration_minutes) || 15)),
    assignment_type: safe.assignment_type === "paid" ? "paid" : "qualification",
    tester_pay_cents: Math.max(0, Math.round(Number(safe.tester_pay_cents) || 0)),
    tester_pay_currency: sanitizeString(safe.tester_pay_currency, 3).toUpperCase() || "USD",
    payout_status: ["not_applicable", "pending", "approved", "paid"].includes(safe.payout_status)
      ? safe.payout_status
      : "not_applicable",
    access_mode: ["public_only", "signup_allowed", "test_account"].includes(safe.access_mode)
      ? safe.access_mode
      : "public_only",
    status: sanitizeString(safe.status, 40),
    can_open: Boolean(options.includeOpenState && safe.trial_session_id),
    published_at: sanitizeString(safe.published_at, 128) || null,
    claimed_at: sanitizeString(safe.claimed_at, 128) || null,
    updated_at: sanitizeString(safe.updated_at, 128) || null
  };
}

function splitTesterJobs(application, availableItems, ownItems) {
  const current = ownItems.filter((item) => ["assigned", "in_progress", "submitted"].includes(item.status));
  const history = ownItems.filter((item) => item.status === "completed");
  const desktopReady = Array.isArray(application?.devices) && application.devices.includes("computer");
  const canClaimQualification = application?.status === "applied" && desktopReady && !current.length;
  const canClaimPaid = application?.status === "approved" && desktopReady && !current.length;
  const eligibleAvailable = availableItems.filter((item) =>
    canClaimPaid ? item.assignment_type === "paid" : canClaimQualification ? item.assignment_type !== "paid" : false
  );
  return {
    available: eligibleAvailable.map((item) => testerJobView(item)),
    current: current.map((item) => testerJobView(item, { includeOpenState: true })),
    history: history.map((item) => testerJobView(item, { includeOpenState: true })),
    can_claim_qualification: canClaimQualification,
    can_claim_paid: canClaimPaid,
    desktop_ready: desktopReady
  };
}

function requestOptions(req) {
  return {
    request: req,
    publicBaseUrl: getPublicBaseUrl(req)
  };
}

module.exports = async (req, res) => {
  const auth = await requireDashboardAuth(req, res, { allowRefresh: true });
  if (!auth.ok) {
    return res.status(auth.status || 401).json({ ok: false, error: "Sign in as a tester" });
  }
  const ownerUserId = sanitizeString(auth.user?.id, 128);
  const ownerEmail = sanitizeString(auth.user?.email, 320).toLowerCase();
  if (!ownerUserId || !ownerEmail) {
    return res.status(400).json({ ok: false, error: "Signed-in tester id and email are required" });
  }

  const applicationResult = await getTesterApplication({ owner_user_id: ownerUserId });
  if (!applicationResult.ok) {
    return res.status(applicationResult.status || 500).json({ ok: false, error: applicationResult.error });
  }
  const application = applicationResult.application;

  if (req.method === "GET") {
    if (!application) {
      return res.status(200).json({
        ok: true,
        application: null,
        available: [],
        current: [],
        history: [],
        can_claim_qualification: false,
        can_claim_paid: false,
        desktop_ready: false
      });
    }
    const [availableResult, ownResult] = await Promise.all([
      listHumanTestRequests({ status: "available", limit: 100 }),
      listHumanTestRequests({ assigned_tester_email: ownerEmail, limit: 100 })
    ]);
    if (!availableResult.ok || !ownResult.ok) {
      const failed = !availableResult.ok ? availableResult : ownResult;
      return res.status(failed.status || 500).json({ ok: false, error: failed.error });
    }
    return res.status(200).json({
      ok: true,
      application,
      ...splitTesterJobs(application, availableResult.items, ownResult.items)
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  if (!application) {
    return res.status(403).json({ ok: false, error: "Apply to become a tester first" });
  }
  let body;
  try {
    body = await parseRequestBody(req);
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid JSON body" });
  }
  const action = sanitizeString(body?.action, 40).toLowerCase();
  const requestId = sanitizeString(body?.request_id || body?.requestId, 128);
  if (!requestId) return res.status(400).json({ ok: false, error: "request_id is required" });

  if (action === "claim") {
    if (!application.devices.includes("computer")) {
      return res.status(409).json({
        ok: false,
        error: "Test recording currently requires a computer with Chrome"
      });
    }
    const loaded = await getHumanTestRequest(requestId);
    if (!loaded.ok) {
      return res.status(loaded.status || 500).json({ ok: false, error: loaded.error });
    }
    const paidAssignment = loaded.request.assignment_type === "paid";
    if (paidAssignment && application.status !== "approved") {
      return res.status(403).json({ ok: false, error: "Paid tests are available after your qualification is approved" });
    }
    if (!paidAssignment && application.status !== "applied") {
      return res.status(409).json({ ok: false, error: "Your qualification is already underway or complete" });
    }
    const claimed = await claimHumanTestRequest(
      requestId,
      {
        application_id: application.id,
        name: application.name,
        public_name: application.public_name,
        email: ownerEmail
      },
      requestOptions(req)
    );
    if (!claimed.ok) {
      return res.status(claimed.status || 500).json({ ok: false, error: claimed.error });
    }
    return res.status(200).json({
      ok: true,
      request: testerJobView(claimed.request, { includeOpenState: true }),
      open_url: claimed.tester_url,
      warning: claimed.warning || null
    });
  }

  if (action === "open") {
    const loaded = await getHumanTestRequest(requestId);
    if (!loaded.ok) {
      return res.status(loaded.status || 500).json({ ok: false, error: loaded.error });
    }
    if (sanitizeString(loaded.request.assigned_tester_email, 320).toLowerCase() !== ownerEmail) {
      return res.status(403).json({ ok: false, error: "This test belongs to another tester" });
    }
    if (!loaded.request.trial_session_id) {
      return res.status(409).json({ ok: false, error: "This test is still being prepared" });
    }
    const opened = await issueQaTrialTesterLink(
      loaded.request.trial_session_id,
      ownerEmail,
      requestOptions(req)
    );
    if (!opened.ok) {
      return res.status(opened.status || 500).json({ ok: false, error: opened.error });
    }
    return res.status(200).json({ ok: true, open_url: opened.tester_url });
  }

  return res.status(400).json({ ok: false, error: "Unknown action" });
};

module.exports.__private = {
  splitTesterJobs,
  testerJobView
};
