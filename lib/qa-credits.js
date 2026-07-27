const { sanitizeString } = require("./qa-core");

const LEDGER_TABLE = "swarmtest_qa_credit_ledger";

function getSupabaseAccess(options = {}) {
  const supabaseUrl = sanitizeString(options.supabaseUrl || process.env.SUPABASE_URL, 4096).replace(/\/$/, "");
  const serviceKey = sanitizeString(options.serviceKey || process.env.SUPABASE_SERVICE_KEY, 4096);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (!supabaseUrl || !serviceKey) return { ok: false, status: 500, error: "Server is not configured" };
  if (typeof fetchImpl !== "function") return { ok: false, status: 500, error: "fetch is not available" };
  return { ok: true, supabaseUrl, serviceKey, fetchImpl };
}

function headers(serviceKey, prefer = "") {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {})
  };
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function failure(response, data, fallback) {
  return {
    ok: false,
    status: response?.status || 500,
    error: sanitizeString(data?.message || data?.error || data?.hint, 500) || fallback
  };
}

async function getQaCreditBalance(ownerUserId, currency = "USD", options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) return access;
  const userId = sanitizeString(ownerUserId, 128);
  const normalizedCurrency = sanitizeString(currency, 3).toUpperCase() || "USD";
  if (!userId) return { ok: false, status: 400, error: "owner_user_id is required" };

  const url = new URL(`${access.supabaseUrl}/rest/v1/${LEDGER_TABLE}`);
  url.searchParams.set("select", "amount_cents");
  url.searchParams.set("owner_user_id", `eq.${userId}`);
  url.searchParams.set("currency", `eq.${normalizedCurrency}`);
  const response = await access.fetchImpl(url.toString(), {
    headers: headers(access.serviceKey)
  });
  const data = await readJson(response);
  if (!response.ok || !Array.isArray(data)) {
    return failure(response, data, "Could not load QA credit");
  }
  return {
    ok: true,
    status: 200,
    balance_cents: data.reduce((sum, entry) => sum + Math.round(Number(entry?.amount_cents) || 0), 0),
    currency: normalizedCurrency
  };
}

async function callCreditRpc(name, body, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) return access;
  const response = await access.fetchImpl(`${access.supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: headers(access.serviceKey),
    body: JSON.stringify(body)
  });
  const data = await readJson(response);
  if (!response.ok) return failure(response, data, "Could not update QA credit");
  return {
    ok: true,
    status: 200,
    balance_cents: Math.max(0, Math.round(Number(data) || 0)),
    currency: sanitizeString(body.p_currency, 3).toUpperCase() || "USD"
  };
}

async function spendQaCredit(input = {}, options = {}) {
  return callCreditRpc(
    "swarmtest_spend_qa_credit",
    {
      p_owner_user_id: sanitizeString(input.owner_user_id || input.ownerUserId, 128),
      p_owner_email: sanitizeString(input.owner_email || input.ownerEmail, 320).toLowerCase(),
      p_request_id: sanitizeString(input.request_id || input.requestId, 128),
      p_amount_cents: Math.max(0, Math.round(Number(input.amount_cents || input.amountCents) || 0)),
      p_currency: sanitizeString(input.currency, 3).toUpperCase() || "USD"
    },
    options
  );
}

async function awardQaCredit(requestId, options = {}) {
  return callCreditRpc(
    "swarmtest_award_qa_credit",
    { p_request_id: sanitizeString(requestId, 128) },
    options
  );
}

module.exports = {
  awardQaCredit,
  getQaCreditBalance,
  spendQaCredit
};
