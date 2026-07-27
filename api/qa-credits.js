const { requireDashboardAuth } = require("../lib/auth");
const { createHumanTestRequest, patchHumanTestRequest } = require("../lib/human-test-requests");
const { getQaCreditBalance, spendQaCredit } = require("../lib/qa-credits");
const { getPublicBaseUrl, parseRequestBody, sanitizeString } = require("../lib/qa-core");

function requestOptions(req) {
  return {
    request: req,
    publicBaseUrl: getPublicBaseUrl(req)
  };
}

module.exports = async (req, res) => {
  const auth = await requireDashboardAuth(req, res, { allowRefresh: true });
  if (!auth.ok) {
    return res.status(auth.status || 401).json({ ok: false, error: "Sign in to use QA credit" });
  }
  const ownerUserId = sanitizeString(auth.user?.id, 128);
  const ownerEmail = sanitizeString(auth.user?.email, 320).toLowerCase();
  if (!ownerUserId || !ownerEmail) {
    return res.status(400).json({ ok: false, error: "Signed-in user id and email are required" });
  }
  const options = requestOptions(req);

  if (req.method === "GET") {
    const balance = await getQaCreditBalance(ownerUserId, "USD", options);
    if (!balance.ok) {
      return res.status(balance.status || 500).json({ ok: false, error: balance.error });
    }
    return res.status(200).json({ ok: true, ...balance });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  let body;
  try {
    body = await parseRequestBody(req);
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid JSON body" });
  }

  const amountCents = Math.max(
    0,
    Math.round(Number(body?.amount_cents || body?.amountCents) || 0)
  );
  const created = await createHumanTestRequest(
    {
      ...body,
      assignment_type: "paid",
      funding_type: "qa_credit",
      qa_credit_amount_cents: amountCents,
      source: "qa_credit_trade"
    },
    { owner_user_id: ownerUserId, owner_email: ownerEmail },
    options
  );
  if (!created.ok) {
    return res.status(created.status || 500).json({ ok: false, error: created.error });
  }

  const spent = await spendQaCredit(
    {
      owner_user_id: ownerUserId,
      owner_email: ownerEmail,
      request_id: created.request.id,
      amount_cents: amountCents,
      currency: "USD"
    },
    options
  );
  if (!spent.ok) {
    await patchHumanTestRequest(created.request.id, { status: "cancelled" }, options);
    return res.status(spent.status || 409).json({ ok: false, error: spent.error });
  }

  return res.status(201).json({
    ok: true,
    request: {
      ...created.request,
      funding_type: "qa_credit",
      qa_credit_spent_cents: amountCents
    },
    balance_cents: spent.balance_cents,
    currency: spent.currency
  });
};
