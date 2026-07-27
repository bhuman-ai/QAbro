const { isValidEmail } = require("./auth");
const {
  isPlainObject,
  normalizeUrl,
  sanitizeOptionalString,
  sanitizeString
} = require("./qa-core");
const { openSecretObject, sealSecretObject } = require("./qa-secret-box");
const { normalizeTesterPublicName } = require("./tester-applications");

const TABLE = "swarmtest_human_test_requests";
const REVIEW_TYPES = new Set(["specific_flow", "general_first_time_user"]);
const ACCESS_MODES = new Set(["public_only", "signup_allowed", "test_account"]);
const ASSIGNMENT_TYPES = new Set(["qualification", "paid"]);
const PAYOUT_STATUSES = new Set(["not_applicable", "pending", "approved", "paid"]);
const REQUEST_STATUSES = new Set(["queued", "available", "assigned", "in_progress", "submitted", "completed", "cancelled"]);
const DEFAULT_QUALIFICATION_DURATION_MINUTES = 15;
const PUBLIC_COLUMNS = [
  "id",
  "owner_user_id",
  "owner_email",
  "product_name",
  "target_url",
  "review_type",
  "test_focus",
  "expected_success",
  "duration_minutes",
  "assignment_type",
  "tester_pay_cents",
  "tester_pay_currency",
  "payout_status",
  "payout_approved_at",
  "payout_paid_at",
  "access_mode",
  "access_details",
  "context",
  "status",
  "assigned_tester_application_id",
  "assigned_tester_user_id",
  "assigned_tester_name",
  "assigned_tester_email",
  "tester_reward_type",
  "qa_credit_awarded_at",
  "funding_type",
  "qa_credit_spent_cents",
  "qa_credit_spent_at",
  "trial_session_id",
  "source",
  "request_key",
  "published_at",
  "claimed_at",
  "created_at",
  "updated_at"
].join(",");

function getSupabaseAccess(options = {}) {
  const supabaseUrl = sanitizeString(options.supabaseUrl || process.env.SUPABASE_URL, 4096).replace(/\/$/, "");
  const serviceKey = sanitizeString(options.serviceKey || process.env.SUPABASE_SERVICE_KEY, 4096);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (!supabaseUrl || !serviceKey) return { ok: false, status: 500, error: "Server is not configured" };
  if (typeof fetchImpl !== "function") return { ok: false, status: 500, error: "fetch is not available" };
  return { ok: true, supabaseUrl, serviceKey, fetchImpl };
}

function buildSupabaseHeaders(serviceKey, prefer = "return=representation") {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    Prefer: prefer
  };
}

function normalizeStringList(value, maxItems = 20, maxLength = 600) {
  const source = Array.isArray(value)
    ? value
    : sanitizeString(value, maxItems * maxLength)
        .split(/\r?\n/)
        .map((line) => line.replace(/^\s*[-*0-9.)]+\s*/, ""));
  return source
    .map((entry) => sanitizeString(entry, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function deriveProductName(targetUrl, input = {}) {
  const explicit = sanitizeString(input.product_name || input.productName || input.brand_name || input.brandName, 180);
  if (explicit) return explicit;
  try {
    return new URL(targetUrl).hostname.replace(/^www\./i, "");
  } catch {
    return "Product";
  }
}

function sanitizeSource(value) {
  return (
    sanitizeString(value, 80)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "mcp_human_test"
  );
}

function normalizeAssignmentType(value) {
  const normalized = sanitizeString(value, 40).toLowerCase();
  return ASSIGNMENT_TYPES.has(normalized) ? normalized : "qualification";
}

function explicitAssignmentType(value) {
  const normalized = sanitizeString(value, 40).toLowerCase();
  return ASSIGNMENT_TYPES.has(normalized) ? normalized : "";
}

function normalizeCurrency(value) {
  const normalized = sanitizeString(value, 3).toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : "USD";
}

function normalizeFundingType(value) {
  return sanitizeString(value, 40).toLowerCase() === "qa_credit" ? "qa_credit" : "cash";
}

function normalizeRewardType(value) {
  return sanitizeString(value, 40).toLowerCase() === "qa_credit" ? "qa_credit" : "cash";
}

function normalizeCredentials(input = {}) {
  const credentials = isPlainObject(input.credentials) ? input.credentials : {};
  const username = sanitizeString(credentials.username, 320);
  const password = sanitizeString(credentials.password, 320);
  const loginUrl = normalizeUrl(credentials.login_url || credentials.loginUrl || input.login_url || input.loginUrl);
  const rawOtpMode = sanitizeString(credentials.otp_mode || credentials.otpMode, 40).toLowerCase();
  const otpMode = ["none", "manual_prompt", "provider_hook"].includes(rawOtpMode) ? rawOtpMode : "none";
  if ((username && !password) || (!username && password)) {
    return { ok: false, status: 400, error: "Both test-account username and password are required" };
  }
  return {
    ok: true,
    credentials: username && password ? { login_url: loginUrl || null, username, password, otp_mode: otpMode } : null,
    loginUrl: loginUrl || null
  };
}

function inferReviewType(input = {}) {
  const explicit = sanitizeString(input.review_type || input.reviewType, 60).toLowerCase();
  if (REVIEW_TYPES.has(explicit)) return explicit;
  const hasSpecificContext = Boolean(
    sanitizeString(input.task_to_try || input.taskToTry || input.test_focus || input.testFocus, 1000) ||
      sanitizeString(input.feature_name || input.featureName || input.work_summary || input.workSummary, 1200) ||
      normalizeStringList(input.acceptance_criteria || input.acceptanceCriteria, 20, 800).length
  );
  return hasSpecificContext ? "specific_flow" : "general_first_time_user";
}

function buildSpecificFocus(input = {}) {
  const direct = sanitizeString(input.test_focus || input.testFocus || input.task_to_try || input.taskToTry, 2400);
  if (direct) return direct;
  const feature = sanitizeString(input.feature_name || input.featureName, 240);
  const summary = sanitizeString(input.work_summary || input.workSummary || input.change_summary || input.changeSummary, 1400);
  const criteria = normalizeStringList(input.acceptance_criteria || input.acceptanceCriteria, 12, 600);
  return [feature ? `Test ${feature}.` : "", summary, criteria.length ? `Confirm: ${criteria.join("; ")}` : ""]
    .filter(Boolean)
    .join(" ")
    .slice(0, 2400);
}

function normalizeHumanTestRequestPayload(input = {}, owner = {}, options = {}) {
  const safeInput = isPlainObject(input) ? input : {};
  const ownerUserId = sanitizeString(owner.owner_user_id || owner.ownerUserId || safeInput.owner_user_id || safeInput.ownerUserId, 128);
  const ownerEmail = sanitizeString(owner.owner_email || owner.ownerEmail || safeInput.owner_email || safeInput.ownerEmail, 320).toLowerCase();
  const targetUrl = normalizeUrl(safeInput.target_url || safeInput.targetUrl || safeInput.url);
  if (!ownerUserId || !isValidEmail(ownerEmail)) {
    return { ok: false, status: 400, error: "Signed-in owner id and email are required" };
  }
  if (!targetUrl) return { ok: false, status: 400, error: "target_url must be a valid http or https URL" };

  const reviewType = inferReviewType(safeInput);
  const specificFocus = buildSpecificFocus(safeInput);
  if (reviewType === "specific_flow" && !specificFocus) {
    return {
      ok: false,
      status: 400,
      needs_input: true,
      error: "Say what specific flow to test, or choose a general first-time-user review"
    };
  }

  const credentialResult = normalizeCredentials(safeInput);
  if (!credentialResult.ok) return credentialResult;
  const explicitAccessMode = sanitizeString(safeInput.access_mode || safeInput.accessMode, 60).toLowerCase();
  const accessMode = ACCESS_MODES.has(explicitAccessMode)
    ? explicitAccessMode
    : credentialResult.credentials
      ? "test_account"
      : safeInput.account_creation_allowed === true || safeInput.accountCreationAllowed === true
        ? "signup_allowed"
        : "public_only";
  if (accessMode === "test_account" && !credentialResult.credentials) {
    return {
      ok: false,
      status: 400,
      needs_input: true,
      error: "Provide a test account, or choose public_only or signup_allowed access"
    };
  }

  const sealed = sealSecretObject(credentialResult.credentials, options);
  if (!sealed.ok) return sealed;
  const accountCreationAllowed = accessMode === "signup_allowed";
  const purchaseAllowed = safeInput.purchase_allowed === true || safeInput.purchaseAllowed === true;
  const irreversibleActionsAllowed =
    safeInput.irreversible_actions_allowed === true || safeInput.irreversibleActionsAllowed === true;
  const prohibitedActions = normalizeStringList(safeInput.prohibited_actions || safeInput.prohibitedActions, 20, 400);
  if (!purchaseAllowed && !prohibitedActions.some((entry) => /purchase|payment|checkout/i.test(entry))) {
    prohibitedActions.push("Do not make a real purchase or submit payment");
  }
  if (!irreversibleActionsAllowed && !prohibitedActions.some((entry) => /delete|publish|irreversible/i.test(entry))) {
    prohibitedActions.push("Do not delete, publish, or make irreversible changes");
  }

  const testFocus =
    reviewType === "specific_flow"
      ? specificFocus
      : "Act like a first-time user. Review the homepage and continue through everything available without paying. Explain what is confusing, broken, or likely to make someone stop.";
  const expectedSuccess =
    sanitizeOptionalString(safeInput.expected_success || safeInput.expectedSuccess, 1600) ||
    (reviewType === "specific_flow"
      ? "The requested flow works clearly from its starting point through the expected result."
      : "A first-time user can understand the product and reach the first useful result without paying or getting unexpectedly blocked.");
  const assignmentType = explicitAssignmentType(
    safeInput.assignment_type || safeInput.assignmentType || safeInput.job_type || safeInput.jobType
  );
  if (!assignmentType) {
    return {
      ok: false,
      status: 400,
      needs_input: true,
      error: "Choose cash, QA credit, or an explicit qualification trial before requesting human QA"
    };
  }
  const fundingType = normalizeFundingType(safeInput.funding_type || safeInput.fundingType);
  const payCents = Math.max(
    0,
    Math.round(Number(safeInput.tester_pay_cents ?? safeInput.testerPayCents) || 0)
  );
  const creditAmountCents = Math.max(
    0,
    Math.round(
      Number(
        safeInput.qa_credit_amount_cents ||
          safeInput.qaCreditAmountCents ||
          (fundingType === "qa_credit" ? payCents : 0)
      ) || 0
    )
  );
  if (assignmentType === "paid" && fundingType === "cash" && payCents < 100) {
    return { ok: false, status: 400, needs_input: true, error: "Choose a cash tester budget of at least $1" };
  }
  if (assignmentType === "paid" && fundingType === "qa_credit" && creditAmountCents < 100) {
    return {
      ok: false,
      status: 400,
      needs_input: true,
      error: "Choose at least $1 of QA credit for this request"
    };
  }
  if (assignmentType === "qualification" && (payCents > 0 || fundingType === "qa_credit")) {
    return { ok: false, status: 400, error: "Qualification trials cannot carry a paid budget" };
  }
  const committedPayCents =
    assignmentType === "paid"
      ? fundingType === "qa_credit"
        ? creditAmountCents
        : payCents
      : 0;
  const paymentMethod =
    assignmentType === "qualification"
      ? "qualification_trial"
      : fundingType === "qa_credit"
        ? "qa_credit"
        : "cash";

  return {
    ok: true,
    payload: {
      owner_user_id: ownerUserId,
      owner_email: ownerEmail,
      product_name: deriveProductName(targetUrl, safeInput),
      target_url: targetUrl,
      review_type: reviewType,
      test_focus: testFocus,
      expected_success: expectedSuccess,
      duration_minutes: Math.max(
        10,
        Math.min(
          60,
          Number(safeInput.duration_minutes || safeInput.durationMinutes) ||
            DEFAULT_QUALIFICATION_DURATION_MINUTES
        )
      ),
      assignment_type: assignmentType,
      tester_pay_cents: committedPayCents,
      tester_pay_currency: "USD",
      payout_status: assignmentType === "paid" ? "pending" : "not_applicable",
      tester_reward_type: "cash",
      funding_type: fundingType,
      qa_credit_spent_cents: 0,
      access_mode: accessMode,
      access_details: {
        login_url: credentialResult.loginUrl,
        credentials_supplied: Boolean(credentialResult.credentials),
        account_creation_allowed: accountCreationAllowed,
        purchase_allowed: purchaseAllowed,
        irreversible_actions_allowed: irreversibleActionsAllowed,
        prohibited_actions: prohibitedActions
      },
      private_access: sealed.envelope,
      context: {
        work_summary: sanitizeOptionalString(safeInput.work_summary || safeInput.workSummary || safeInput.change_summary || safeInput.changeSummary, 4000) || null,
        feature_name: sanitizeOptionalString(safeInput.feature_name || safeInput.featureName, 240) || null,
        acceptance_criteria: normalizeStringList(safeInput.acceptance_criteria || safeInput.acceptanceCriteria, 24, 900),
        scenario_list: normalizeStringList(safeInput.scenario_list || safeInput.scenarioList, 24, 1000),
        changed_files: normalizeStringList(safeInput.changed_files || safeInput.changedFiles, 60, 400),
        repository: sanitizeOptionalString(safeInput.repository || safeInput.repo, 500) || null,
        branch: sanitizeOptionalString(safeInput.branch, 240) || null,
        commit_sha: sanitizeOptionalString(safeInput.commit_sha || safeInput.commitSha, 120) || null,
        pull_request_url: normalizeUrl(safeInput.pull_request_url || safeInput.pullRequestUrl) || null,
        developer_notes: sanitizeOptionalString(safeInput.developer_notes || safeInput.developerNotes, 4000) || null,
        payment_method: paymentMethod,
        funding_confirmed: true,
        customer_budget_cents: committedPayCents
      },
      status: "queued",
      source: sanitizeSource(safeInput.source),
      request_key: sanitizeOptionalString(safeInput.request_key || safeInput.requestKey || safeInput.idempotency_key || safeInput.idempotencyKey, 180) || null
    }
  };
}

function normalizeHumanTestRequestRow(value, options = {}) {
  const row = isPlainObject(value) ? value : {};
  const id = sanitizeString(row.id, 128);
  if (!id) return null;
  const accessDetails = isPlainObject(row.access_details) ? row.access_details : {};
  const context = isPlainObject(row.context) ? row.context : {};
  const normalized = {
    id,
    owner_user_id: sanitizeString(row.owner_user_id, 128),
    owner_email: sanitizeString(row.owner_email, 320).toLowerCase(),
    product_name: sanitizeString(row.product_name, 180),
    target_url: normalizeUrl(row.target_url) || sanitizeString(row.target_url, 4096),
    review_type: REVIEW_TYPES.has(sanitizeString(row.review_type, 60)) ? sanitizeString(row.review_type, 60) : "general_first_time_user",
    test_focus: sanitizeString(row.test_focus, 2400),
    expected_success: sanitizeOptionalString(row.expected_success, 1600) || null,
    duration_minutes: Math.max(
      10,
      Math.min(60, Number(row.duration_minutes) || DEFAULT_QUALIFICATION_DURATION_MINUTES)
    ),
    assignment_type: normalizeAssignmentType(row.assignment_type),
    tester_pay_cents: Math.max(0, Math.round(Number(row.tester_pay_cents) || 0)),
    tester_pay_currency: normalizeCurrency(row.tester_pay_currency),
    payout_status: PAYOUT_STATUSES.has(sanitizeString(row.payout_status, 40))
      ? sanitizeString(row.payout_status, 40)
      : "not_applicable",
    payout_approved_at: sanitizeOptionalString(row.payout_approved_at, 128) || null,
    payout_paid_at: sanitizeOptionalString(row.payout_paid_at, 128) || null,
    access_mode: ACCESS_MODES.has(sanitizeString(row.access_mode, 60)) ? sanitizeString(row.access_mode, 60) : "public_only",
    access: {
      login_url: normalizeUrl(accessDetails.login_url) || null,
      credentials_supplied: accessDetails.credentials_supplied === true,
      account_creation_allowed: accessDetails.account_creation_allowed === true,
      purchase_allowed: accessDetails.purchase_allowed === true,
      irreversible_actions_allowed: accessDetails.irreversible_actions_allowed === true,
      prohibited_actions: normalizeStringList(accessDetails.prohibited_actions, 20, 400)
    },
    context,
    status: REQUEST_STATUSES.has(sanitizeString(row.status, 40)) ? sanitizeString(row.status, 40) : "queued",
    assigned_tester_application_id: sanitizeOptionalString(row.assigned_tester_application_id, 128) || null,
    assigned_tester_user_id: sanitizeOptionalString(row.assigned_tester_user_id, 128) || null,
    assigned_tester_name: sanitizeOptionalString(row.assigned_tester_name, 180) || null,
    assigned_tester_email: sanitizeOptionalString(row.assigned_tester_email, 320) || null,
    tester_reward_type: normalizeRewardType(row.tester_reward_type),
    qa_credit_awarded_at: sanitizeOptionalString(row.qa_credit_awarded_at, 128) || null,
    funding_type: normalizeFundingType(row.funding_type),
    qa_credit_spent_cents: Math.max(0, Math.round(Number(row.qa_credit_spent_cents) || 0)),
    qa_credit_spent_at: sanitizeOptionalString(row.qa_credit_spent_at, 128) || null,
    trial_session_id: sanitizeOptionalString(row.trial_session_id, 128) || null,
    source: sanitizeString(row.source, 80) || "mcp_human_test",
    request_key: sanitizeOptionalString(row.request_key, 180) || null,
    published_at: sanitizeOptionalString(row.published_at, 128) || null,
    claimed_at: sanitizeOptionalString(row.claimed_at, 128) || null,
    created_at: sanitizeOptionalString(row.created_at, 128) || null,
    updated_at: sanitizeOptionalString(row.updated_at, 128) || null
  };
  if (options.includeCredentials === true && row.private_access) {
    const opened = openSecretObject(row.private_access, options);
    if (!opened.ok) return { ...normalized, credentials_error: opened.error, credentials: null };
    normalized.credentials = opened.value;
  }
  return normalized;
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function buildSupabaseError(response, data, fallback) {
  const message = sanitizeString(data?.message || data?.error || data?.hint, 512);
  const missingTable = response?.status === 404 && message.toLowerCase().includes(TABLE);
  return {
    ok: false,
    status: missingTable ? 503 : response?.status || 500,
    error: missingTable ? "Human tester requests are not available yet" : message || fallback
  };
}

async function findByRequestKey(ownerUserId, requestKey, options = {}) {
  if (!requestKey) return null;
  const access = getSupabaseAccess(options);
  if (!access.ok) return access;
  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/${TABLE}`);
  requestUrl.searchParams.set("select", PUBLIC_COLUMNS);
  requestUrl.searchParams.set("owner_user_id", `eq.${ownerUserId}`);
  requestUrl.searchParams.set("request_key", `eq.${requestKey}`);
  requestUrl.searchParams.set("limit", "1");
  const response = await access.fetchImpl(requestUrl.toString(), {
    headers: buildSupabaseHeaders(access.serviceKey, "return=minimal")
  });
  const data = await readJsonResponse(response);
  if (!response.ok) return buildSupabaseError(response, data, "Could not check the existing human test request");
  return Array.isArray(data) && data[0] ? normalizeHumanTestRequestRow(data[0]) : null;
}

async function createHumanTestRequest(input = {}, owner = {}, options = {}) {
  const normalized = normalizeHumanTestRequestPayload(input, owner, options);
  if (!normalized.ok) return normalized;
  const existing = await findByRequestKey(normalized.payload.owner_user_id, normalized.payload.request_key, options);
  if (existing?.ok === false) return existing;
  if (existing) return { ok: true, status: 200, duplicate: true, request: existing };

  const access = getSupabaseAccess(options);
  if (!access.ok) return access;
  const response = await access.fetchImpl(`${access.supabaseUrl}/rest/v1/${TABLE}`, {
    method: "POST",
    headers: buildSupabaseHeaders(access.serviceKey),
    body: JSON.stringify(normalized.payload)
  });
  const data = await readJsonResponse(response);
  if (!response.ok || !Array.isArray(data) || !data[0]) {
    return buildSupabaseError(response, data, "Could not request a human tester");
  }
  return { ok: true, status: 201, duplicate: false, request: normalizeHumanTestRequestRow(data[0]) };
}

async function getHumanTestRequest(id, filters = {}, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) return access;
  const requestId = sanitizeString(id, 128);
  if (!requestId) return { ok: false, status: 400, error: "request_id is required" };
  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/${TABLE}`);
  requestUrl.searchParams.set("select", options.includeCredentials === true ? "*" : PUBLIC_COLUMNS);
  requestUrl.searchParams.set("id", `eq.${requestId}`);
  if (filters.owner_user_id || filters.ownerUserId) {
    requestUrl.searchParams.set("owner_user_id", `eq.${sanitizeString(filters.owner_user_id || filters.ownerUserId, 128)}`);
  }
  requestUrl.searchParams.set("limit", "1");
  const response = await access.fetchImpl(requestUrl.toString(), {
    headers: buildSupabaseHeaders(access.serviceKey, "return=minimal")
  });
  const data = await readJsonResponse(response);
  if (!response.ok || !Array.isArray(data)) return buildSupabaseError(response, data, "Could not load the human test request");
  if (!data[0]) return { ok: false, status: 404, error: "Human test request not found" };
  return { ok: true, status: 200, request: normalizeHumanTestRequestRow(data[0], options), row: data[0] };
}

async function listHumanTestRequests(filters = {}, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) return access;
  const status = sanitizeString(filters.status, 40).toLowerCase();
  if (status && !REQUEST_STATUSES.has(status)) return { ok: false, status: 400, error: "Unsupported request status" };
  const limit = Math.max(1, Math.min(200, Number(filters.limit) || 100));
  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/${TABLE}`);
  requestUrl.searchParams.set("select", PUBLIC_COLUMNS);
  requestUrl.searchParams.set("order", "created_at.desc");
  requestUrl.searchParams.set("limit", String(limit));
  if (status) requestUrl.searchParams.set("status", `eq.${status}`);
  if (filters.owner_user_id || filters.ownerUserId) {
    requestUrl.searchParams.set("owner_user_id", `eq.${sanitizeString(filters.owner_user_id || filters.ownerUserId, 128)}`);
  }
  if (filters.assigned_tester_email || filters.assignedTesterEmail) {
    requestUrl.searchParams.set(
      "assigned_tester_email",
      `eq.${sanitizeString(filters.assigned_tester_email || filters.assignedTesterEmail, 320).toLowerCase()}`
    );
  }
  const response = await access.fetchImpl(requestUrl.toString(), {
    headers: buildSupabaseHeaders(access.serviceKey, "return=minimal")
  });
  const data = await readJsonResponse(response);
  if (!response.ok || !Array.isArray(data)) return buildSupabaseError(response, data, "Could not load human test requests");
  return { ok: true, status: 200, items: data.map(normalizeHumanTestRequestRow).filter(Boolean) };
}

async function publishHumanTestRequest(id, input = {}, options = {}) {
  const loaded = await getHumanTestRequest(id, {}, options);
  if (!loaded.ok) return loaded;
  if (!["queued", "available"].includes(loaded.request.status)) {
    return { ok: false, status: 409, error: "Only a waiting request can be published to testers" };
  }
  const privateBenchmark = normalizeStringList(
    input.known_issues || input.knownIssues || input.private_benchmark || input.privateBenchmark,
    24,
    1200
  );
  if (!privateBenchmark.length) {
    return { ok: false, status: 400, error: "Add at least one private review point before publishing the test" };
  }
  const assignmentType = normalizeAssignmentType(
    input.assignment_type || input.assignmentType || input.job_type || input.jobType || loaded.request.assignment_type
  );
  const payCents = Math.max(
    0,
    Math.round(Number(input.tester_pay_cents ?? input.testerPayCents ?? loaded.request.tester_pay_cents) || 0)
  );
  if (assignmentType === "paid" && payCents < 1) {
    return { ok: false, status: 400, error: "Set the tester pay before publishing a paid test" };
  }
  if (
    loaded.request.funding_type === "qa_credit" &&
    loaded.request.qa_credit_spent_cents !== payCents
  ) {
    return {
      ok: false,
      status: 409,
      error: "This credit-funded request must keep its original tester pay"
    };
  }
  if (
    loaded.request.context?.funding_confirmed === true &&
    Math.max(0, Math.round(Number(loaded.request.context?.customer_budget_cents) || 0)) !== payCents
  ) {
    return {
      ok: false,
      status: 409,
      error: "This customer-confirmed request must keep its original tester budget"
    };
  }
  const payCurrency = normalizeCurrency(
    input.tester_pay_currency || input.testerPayCurrency || loaded.request.tester_pay_currency
  );
  const firstPublication = loaded.request.status !== "available";
  const newlyPublished = firstPublication || loaded.request.assignment_type !== assignmentType;
  const published = await patchHumanTestRequest(
    loaded.request.id,
    {
      status: "available",
      private_benchmark: privateBenchmark,
      assignment_type: assignmentType,
      tester_pay_cents: assignmentType === "paid" ? payCents : 0,
      tester_pay_currency: payCurrency,
      payout_status: assignmentType === "paid" ? "pending" : "not_applicable",
      payout_approved_at: null,
      payout_paid_at: null,
      published_at: firstPublication ? new Date().toISOString() : loaded.request.published_at || new Date().toISOString(),
      claimed_at: null,
      assigned_tester_application_id: null,
      assigned_tester_user_id: null,
      assigned_tester_name: null,
      assigned_tester_email: null,
      tester_reward_type: "cash",
      trial_session_id: null
    },
    options
  );
  if (!published.ok) return published;
  return { ...published, published: true, newly_published: newlyPublished };
}

async function reserveHumanTestRequest(id, tester = {}, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) return access;
  const requestId = sanitizeString(id, 128);
  const testerApplicationId = sanitizeString(tester.application_id || tester.applicationId, 128);
  const testerUserId = sanitizeString(tester.owner_user_id || tester.ownerUserId, 128);
  const testerName = sanitizeString(tester.name, 180);
  const testerEmail = sanitizeString(tester.email, 320).toLowerCase();
  const rewardType = normalizeRewardType(tester.reward_type || tester.rewardType);
  if (!requestId) return { ok: false, status: 400, error: "request_id is required" };
  if (!testerApplicationId || !isValidEmail(testerEmail)) {
    return { ok: false, status: 400, error: "A signed-in tester application is required" };
  }

  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/${TABLE}`);
  requestUrl.searchParams.set("select", "*");
  requestUrl.searchParams.set("id", `eq.${requestId}`);
  requestUrl.searchParams.set("status", "eq.available");
  const response = await access.fetchImpl(requestUrl.toString(), {
    method: "PATCH",
    headers: buildSupabaseHeaders(access.serviceKey),
    body: JSON.stringify({
      status: "assigned",
      assigned_tester_application_id: testerApplicationId,
      assigned_tester_user_id: testerUserId || null,
      assigned_tester_name: testerName || null,
      assigned_tester_email: testerEmail,
      tester_reward_type: rewardType,
      claimed_at: new Date().toISOString()
    })
  });
  const data = await readJsonResponse(response);
  if (!response.ok || !Array.isArray(data)) {
    return buildSupabaseError(response, data, "Could not claim this test");
  }
  if (!data[0]) {
    return { ok: false, status: 409, error: "Another tester already took this test" };
  }
  return {
    ok: true,
    status: 200,
    row: data[0],
    request: normalizeHumanTestRequestRow(data[0], { ...options, includeCredentials: true })
  };
}

async function releaseHumanTestReservation(id, testerApplicationId, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) return access;
  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/${TABLE}`);
  requestUrl.searchParams.set("id", `eq.${sanitizeString(id, 128)}`);
  requestUrl.searchParams.set("status", "eq.assigned");
  requestUrl.searchParams.set(
    "assigned_tester_application_id",
    `eq.${sanitizeString(testerApplicationId, 128)}`
  );
  requestUrl.searchParams.set("trial_session_id", "is.null");
  const response = await access.fetchImpl(requestUrl.toString(), {
    method: "PATCH",
    headers: buildSupabaseHeaders(access.serviceKey, "return=minimal"),
    body: JSON.stringify({
      status: "available",
      assigned_tester_application_id: null,
      assigned_tester_user_id: null,
      assigned_tester_name: null,
      assigned_tester_email: null,
      tester_reward_type: "cash",
      claimed_at: null
    })
  });
  return { ok: response.ok, status: response.status };
}

async function reserveHumanTestRequestForInvite(id, tester = {}, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) return access;
  const requestId = sanitizeString(id, 128);
  const testerApplicationId = sanitizeOptionalString(
    tester.application_id || tester.applicationId,
    128
  );
  const testerName = sanitizeString(tester.name, 180);
  const testerEmail = sanitizeString(tester.email, 320).toLowerCase();
  if (!requestId) return { ok: false, status: 400, error: "request_id is required" };
  if (!isValidEmail(testerEmail)) {
    return { ok: false, status: 400, error: "tester_email must be a valid email" };
  }

  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/${TABLE}`);
  requestUrl.searchParams.set("select", "*");
  requestUrl.searchParams.set("id", `eq.${requestId}`);
  requestUrl.searchParams.set("status", "eq.available");
  const response = await access.fetchImpl(requestUrl.toString(), {
    method: "PATCH",
    headers: buildSupabaseHeaders(access.serviceKey),
    body: JSON.stringify({
      status: "assigned",
      assigned_tester_application_id: testerApplicationId || null,
      assigned_tester_name: testerName || null,
      assigned_tester_email: testerEmail,
      claimed_at: new Date().toISOString()
    })
  });
  const data = await readJsonResponse(response);
  if (!response.ok || !Array.isArray(data)) {
    return buildSupabaseError(response, data, "Could not reserve this test for the invited tester");
  }
  if (!data[0]) {
    return { ok: false, status: 409, error: "This test is no longer available" };
  }
  return {
    ok: true,
    status: 200,
    row: data[0],
    request: normalizeHumanTestRequestRow(data[0], {
      ...options,
      includeCredentials: true
    })
  };
}

async function releaseInvitedHumanTestReservation(id, testerEmail, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) return access;
  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/${TABLE}`);
  requestUrl.searchParams.set("id", `eq.${sanitizeString(id, 128)}`);
  requestUrl.searchParams.set("status", "eq.assigned");
  requestUrl.searchParams.set(
    "assigned_tester_email",
    `eq.${sanitizeString(testerEmail, 320).toLowerCase()}`
  );
  requestUrl.searchParams.set("trial_session_id", "is.null");
  const response = await access.fetchImpl(requestUrl.toString(), {
    method: "PATCH",
    headers: buildSupabaseHeaders(access.serviceKey, "return=minimal"),
    body: JSON.stringify({
      status: "available",
      assigned_tester_application_id: null,
      assigned_tester_name: null,
      assigned_tester_email: null,
      claimed_at: null
    })
  });
  return { ok: response.ok, status: response.status };
}

async function claimHumanTestRequest(id, tester = {}, options = {}) {
  const testerEmail = sanitizeString(tester.email, 320).toLowerCase();
  const existing = await listHumanTestRequests(
    { assigned_tester_email: testerEmail, limit: 100 },
    options
  );
  if (!existing.ok) return existing;
  if (existing.items.some((item) => ["assigned", "in_progress", "submitted"].includes(item.status))) {
    return { ok: false, status: 409, error: "Finish your current test before taking another one" };
  }

  const reserved = await reserveHumanTestRequest(id, tester, options);
  if (!reserved.ok) return reserved;
  if (reserved.request.credentials_error) {
    await releaseHumanTestReservation(id, tester.application_id || tester.applicationId, options);
    return { ok: false, status: 500, error: reserved.request.credentials_error };
  }
  const privateBenchmark = normalizeStringList(reserved.row.private_benchmark, 24, 1200);
  if (!privateBenchmark.length) {
    await releaseHumanTestReservation(id, tester.application_id || tester.applicationId, options);
    return { ok: false, status: 409, error: "This test is not ready yet" };
  }

  const createQaTrial = options.createQaTrialImpl || require("./qa-trials").createQaTrial;
  const created = await createQaTrial(
    {
      product_name: reserved.request.product_name,
      target_url: reserved.request.target_url,
      lead_email: reserved.request.owner_email,
      tester_name: sanitizeString(tester.name, 180),
      tester_public_name: normalizeTesterPublicName(tester.public_name || tester.publicName),
      tester_email: testerEmail,
      test_focus: reserved.request.test_focus,
      known_issues: privateBenchmark,
      duration_minutes: reserved.request.duration_minutes,
      lead_preapproved: true,
      source_request_id: reserved.request.id,
      access_mode: reserved.request.access_mode,
      access_details: reserved.request.access,
      credentials: reserved.request.credentials,
      assignment_type: reserved.request.assignment_type,
      tester_pay_cents: reserved.request.tester_pay_cents,
      tester_pay_currency: reserved.request.tester_pay_currency,
      payout_status: reserved.request.payout_status,
      tester_reward_type: reserved.request.tester_reward_type
    },
    {
      ...options,
      ownerUserId: reserved.request.owner_user_id,
      ownerEmail: reserved.request.owner_email,
      launchedBy: "tester_self_claim"
    }
  );
  if (!created.ok) {
    await releaseHumanTestReservation(id, tester.application_id || tester.applicationId, options);
    return created;
  }

  const updated = await patchHumanTestRequest(
    reserved.request.id,
    { trial_session_id: created.session_id },
    options
  );
  let applicationUpdate = { ok: true };
  if (reserved.request.assignment_type === "qualification") {
    const { updateTesterApplication } = require("./tester-applications");
    applicationUpdate = await updateTesterApplication(
      {
        id: tester.application_id || tester.applicationId,
        status: "invited",
        qualification_session_id: created.session_id
      },
      options
    );
  }

  return {
    ...created,
    request: updated.ok ? updated.request : reserved.request,
    warning: !updated.ok
      ? updated.error
      : !applicationUpdate.ok
        ? applicationUpdate.error
        : null
  };
}

async function patchHumanTestRequest(id, patch = {}, options = {}) {
  const access = getSupabaseAccess(options);
  if (!access.ok) return access;
  const requestUrl = new URL(`${access.supabaseUrl}/rest/v1/${TABLE}`);
  requestUrl.searchParams.set("id", `eq.${sanitizeString(id, 128)}`);
  requestUrl.searchParams.set("select", PUBLIC_COLUMNS);
  const response = await access.fetchImpl(requestUrl.toString(), {
    method: "PATCH",
    headers: buildSupabaseHeaders(access.serviceKey),
    body: JSON.stringify(patch)
  });
  const data = await readJsonResponse(response);
  if (!response.ok || !Array.isArray(data)) return buildSupabaseError(response, data, "Could not update the human test request");
  if (!data[0]) return { ok: false, status: 404, error: "Human test request not found" };
  return { ok: true, status: 200, request: normalizeHumanTestRequestRow(data[0]) };
}

async function assignHumanTestRequest(id, input = {}, options = {}) {
  const testerEmail = sanitizeString(input.tester_email || input.testerEmail, 320).toLowerCase();
  const testerName = sanitizeString(input.tester_name || input.testerName, 180);
  const testerPublicName = normalizeTesterPublicName(input.tester_public_name || input.testerPublicName);
  if (!isValidEmail(testerEmail)) return { ok: false, status: 400, error: "tester_email must be a valid email" };
  if (!testerPublicName) {
    return { ok: false, status: 400, error: "tester_public_name must be one first name" };
  }
  const reserved = await reserveHumanTestRequestForInvite(
    id,
    {
      application_id: input.tester_application_id || input.testerApplicationId,
      name: testerName,
      email: testerEmail
    },
    options
  );
  if (!reserved.ok) return reserved;
  if (reserved.request.credentials_error) {
    await releaseInvitedHumanTestReservation(id, testerEmail, options);
    return { ok: false, status: 500, error: reserved.request.credentials_error };
  }
  const knownIssues = normalizeStringList(reserved.row.private_benchmark, 24, 1200);
  if (!knownIssues.length) {
    await releaseInvitedHumanTestReservation(id, testerEmail, options);
    return { ok: false, status: 409, error: "This test is not ready yet" };
  }

  const createQaTrial = options.createQaTrialImpl || require("./qa-trials").createQaTrial;
  const created = await createQaTrial(
    {
      product_name: reserved.request.product_name,
      target_url: reserved.request.target_url,
      lead_email: reserved.request.owner_email,
      tester_name: testerName,
      tester_public_name: testerPublicName,
      tester_email: testerEmail,
      test_focus: reserved.request.test_focus,
      known_issues: knownIssues,
      duration_minutes: reserved.request.duration_minutes,
      lead_preapproved: true,
      source_request_id: reserved.request.id,
      access_mode: reserved.request.access_mode,
      access_details: reserved.request.access,
      credentials: reserved.request.credentials,
      assignment_type: reserved.request.assignment_type,
      tester_pay_cents: reserved.request.tester_pay_cents,
      tester_pay_currency: reserved.request.tester_pay_currency,
      payout_status: reserved.request.payout_status,
      tester_reward_type: reserved.request.tester_reward_type
    },
    {
      ...options,
      ownerUserId: reserved.request.owner_user_id,
      ownerEmail: reserved.request.owner_email,
      launchedBy: "human_test_request_direct_invite"
    }
  );
  if (!created.ok) {
    await releaseInvitedHumanTestReservation(id, testerEmail, options);
    return created;
  }

  const updated = await patchHumanTestRequest(
    reserved.request.id,
    {
      trial_session_id: created.session_id
    },
    options
  );
  if (!updated.ok) {
    return { ...created, warning: updated.error, request: reserved.request };
  }
  const testerApplicationId = sanitizeOptionalString(
    input.tester_application_id || input.testerApplicationId,
    128
  );
  let applicationUpdate = { ok: true };
  if (testerApplicationId && reserved.request.assignment_type === "qualification") {
    const { updateTesterApplication } = require("./tester-applications");
    applicationUpdate = await updateTesterApplication(
      {
        id: testerApplicationId,
        status: "invited",
        qualification_session_id: created.session_id
      },
      options
    );
  }
  return {
    ...created,
    request: updated.request,
    warning: applicationUpdate.ok ? null : applicationUpdate.error
  };
}

async function markHumanTestRequestPaid(id, options = {}) {
  const loaded = await getHumanTestRequest(id, {}, options);
  if (!loaded.ok) return loaded;
  if (loaded.request.assignment_type !== "paid") {
    return { ok: false, status: 409, error: "Qualification tests do not have a payout" };
  }
  if (loaded.request.status !== "completed") {
    return { ok: false, status: 409, error: "The report must be reviewed before payment can be marked paid" };
  }
  if (
    loaded.request.tester_reward_type === "qa_credit" &&
    loaded.request.payout_status === "paid" &&
    loaded.request.trial_session_id
  ) {
    const { markQaTrialPaid } = require("./qa-trials");
    const trialUpdated = await markQaTrialPaid(loaded.request.trial_session_id, options);
    return trialUpdated.ok
      ? { ok: true, status: 200, request: loaded.request }
      : { ok: false, status: trialUpdated.status || 500, error: trialUpdated.error };
  }
  if (loaded.request.payout_status !== "approved") {
    return { ok: false, status: 409, error: "The report must be reviewed before payment can be marked paid" };
  }
  if (loaded.request.tester_reward_type === "qa_credit") {
    const { awardQaCredit } = require("./qa-credits");
    const awarded = await awardQaCredit(loaded.request.id, options);
    if (!awarded.ok) return awarded;
    if (!loaded.request.trial_session_id) {
      return {
        ok: true,
        status: 200,
        request: {
          ...loaded.request,
          payout_status: "paid",
          qa_credit_awarded_at: new Date().toISOString()
        },
        credit_balance_cents: awarded.balance_cents
      };
    }
    const { markQaTrialPaid } = require("./qa-trials");
    const trialUpdated = await markQaTrialPaid(loaded.request.trial_session_id, options);
    const refreshed = await getHumanTestRequest(loaded.request.id, {}, options);
    return {
      ...(refreshed.ok ? refreshed : { ok: true, status: 200, request: loaded.request }),
      credit_balance_cents: awarded.balance_cents,
      warning: trialUpdated.ok ? null : trialUpdated.error
    };
  }
  const paidAt = new Date().toISOString();
  const updated = await patchHumanTestRequest(
    loaded.request.id,
    { payout_status: "paid", payout_paid_at: paidAt },
    options
  );
  if (!updated.ok || !loaded.request.trial_session_id) return updated;
  const { markQaTrialPaid } = require("./qa-trials");
  const trialUpdated = await markQaTrialPaid(loaded.request.trial_session_id, options);
  return trialUpdated.ok ? updated : { ...updated, warning: trialUpdated.error };
}

module.exports = {
  ACCESS_MODES,
  ASSIGNMENT_TYPES,
  PAYOUT_STATUSES,
  REQUEST_STATUSES,
  REVIEW_TYPES,
  assignHumanTestRequest,
  claimHumanTestRequest,
  createHumanTestRequest,
  getHumanTestRequest,
  listHumanTestRequests,
  markHumanTestRequestPaid,
  normalizeHumanTestRequestPayload,
  normalizeHumanTestRequestRow,
  patchHumanTestRequest,
  publishHumanTestRequest,
  reserveHumanTestRequestForInvite,
  reserveHumanTestRequest
};
