const { isPlainObject, sanitizeOptionalString, sanitizeString } = require("./qa-core");
const { listSiteScorecard } = require("./site-packs");
const { listSubmissionJobs } = require("./submission-queue");

const SUCCESS_STATUSES = new Set(["submitted", "pending_review", "pending_approval"]);
const CAPTCHA_STATUSES = new Set(["paused_for_captcha"]);
const AUTH_STATUSES = new Set(["paused_for_login"]);
const DUPLICATE_STATUSES = new Set(["paused_for_duplicate_review"]);
const MISSING_INPUT_STATUSES = new Set(["paused_for_missing_inputs"]);
const REVIEW_STATUSES = new Set(["filled_ready_for_review", "paused_for_human_review"]);
const CTA_STATUSES = new Set(["paused_no_submit_cta"]);
const PRODUCT_STATUSES = new Set(["green", "yellow", "red"]);

function normalizeProductStatus(value, fallbackValue = "") {
  const safeValue = sanitizeString(value, 32).toLowerCase();
  return PRODUCT_STATUSES.has(safeValue) ? safeValue : fallbackValue;
}

function sanitizePositiveInteger(value, fallbackValue, maxValue) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallbackValue;
  }
  return Math.max(0, Math.min(maxValue, Math.floor(numeric)));
}

function normalizeTelemetryWindow(filters = {}) {
  return {
    days: Math.max(
      1,
      sanitizePositiveInteger(
        filters.telemetry_window_days ||
          filters.telemetryWindowDays ||
          filters.window_days ||
          filters.windowDays ||
          filters.days,
        30,
        365
      ) || 30
    ),
    limit: Math.max(
      1,
      sanitizePositiveInteger(
        filters.telemetry_limit || filters.telemetryLimit || filters.job_limit || filters.jobLimit || filters.limit,
        250,
        1000
      ) || 250
    )
  };
}

function parseTimestamp(value) {
  const safeValue = sanitizeOptionalString(value, 128);
  if (!safeValue) {
    return null;
  }
  const timestamp = Date.parse(safeValue);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function deriveSubmissionStatus(row) {
  const result = isPlainObject(row?.result) ? row.result : {};
  const submission = isPlainObject(result?.submission) ? result.submission : {};
  return sanitizeString(result?.submission_status || submission?.submission_status, 64).toLowerCase();
}

function deriveQueueStatus(row) {
  return sanitizeString(row?.status, 64).toLowerCase();
}

function classifyJobBucket(row) {
  const submissionStatus = deriveSubmissionStatus(row);
  const queueStatus = deriveQueueStatus(row);

  if (SUCCESS_STATUSES.has(submissionStatus)) {
    return "success";
  }
  if (CAPTCHA_STATUSES.has(submissionStatus)) {
    return "captcha";
  }
  if (AUTH_STATUSES.has(submissionStatus)) {
    return "auth";
  }
  if (DUPLICATE_STATUSES.has(submissionStatus)) {
    return "duplicate_review";
  }
  if (MISSING_INPUT_STATUSES.has(submissionStatus)) {
    return "missing_inputs";
  }
  if (REVIEW_STATUSES.has(submissionStatus)) {
    return "review";
  }
  if (CTA_STATUSES.has(submissionStatus)) {
    return "no_submit_cta";
  }
  if (submissionStatus === "failed" || queueStatus === "failed") {
    return "failed";
  }
  if (queueStatus === "paused") {
    return "review";
  }
  return "other";
}

function derivePrimaryBlocker(counters = {}) {
  const candidates = [
    ["captcha", Number(counters.captcha_count || 0)],
    ["auth", Number(counters.auth_count || 0)],
    ["failed", Number(counters.failed_count || 0)],
    ["no_submit_cta", Number(counters.no_submit_cta_count || 0)],
    ["duplicate_review", Number(counters.duplicate_review_count || 0)],
    ["missing_inputs", Number(counters.missing_inputs_count || 0)],
    ["review", Number(counters.review_count || 0)],
    ["other", Number(counters.other_count || 0)]
  ];
  candidates.sort((left, right) => right[1] - left[1]);
  return candidates[0] && candidates[0][1] > 0 ? candidates[0][0] : "none";
}

function deriveOperationalStatus(counters = {}) {
  const totalRuns = Number(counters.total_runs || 0);
  if (!totalRuns) {
    return "untested";
  }

  const successCount = Number(counters.success_count || 0);
  const hardBlockerCount =
    Number(counters.captcha_count || 0) +
    Number(counters.auth_count || 0) +
    Number(counters.failed_count || 0) +
    Number(counters.no_submit_cta_count || 0);
  const softBlockerCount =
    Number(counters.review_count || 0) +
    Number(counters.duplicate_review_count || 0) +
    Number(counters.missing_inputs_count || 0) +
    Number(counters.other_count || 0);
  const successRate = successCount / Math.max(1, totalRuns);

  if (successCount > 0 && successRate >= 0.6 && hardBlockerCount === 0 && softBlockerCount <= Math.ceil(totalRuns * 0.25)) {
    return "healthy";
  }

  if (successCount === 0 && (hardBlockerCount >= Math.max(1, Math.ceil(totalRuns * 0.5)) || Number(counters.no_submit_cta_count || 0) > 0)) {
    return "blocked";
  }

  if (hardBlockerCount >= Math.max(2, Math.ceil(totalRuns * 0.6))) {
    return "blocked";
  }

  return "watch";
}

function deriveOperationalNote(telemetry = {}) {
  const totalRuns = Number(telemetry.total_runs || 0);
  if (!totalRuns) {
    return "No recent submission runs recorded yet.";
  }

  const successRate = Number(telemetry.success_rate_percent || 0);
  const primaryBlocker = sanitizeString(telemetry.primary_blocker, 64).toLowerCase();
  const operationalStatus = sanitizeString(telemetry.operational_status, 64).toLowerCase();

  if (operationalStatus === "healthy") {
    return `Recent runs are converting cleanly at ${successRate}% success.`;
  }
  if (operationalStatus === "blocked") {
    if (primaryBlocker === "captcha") {
      return "Recent runs are dominated by captcha pauses.";
    }
    if (primaryBlocker === "auth") {
      return "Recent runs are dominated by authentication gates.";
    }
    if (primaryBlocker === "no_submit_cta") {
      return "Recent runs are stalling at the final submit step.";
    }
    if (primaryBlocker === "failed") {
      return "Recent runs are failing before the connector can finish.";
    }
    return "Recent runs are mostly blocked and need connector work.";
  }
  if (primaryBlocker === "review") {
    return "Recent runs are reaching review checkpoints more than final submit.";
  }
  if (primaryBlocker === "duplicate_review") {
    return "Recent runs are pausing on duplicate-listing checks.";
  }
  if (primaryBlocker === "missing_inputs") {
    return "Recent runs are missing required facts or assets.";
  }
  if (primaryBlocker === "captcha") {
    return "Recent runs are reaching the form but pausing on captcha.";
  }
  if (primaryBlocker === "auth") {
    return "Recent runs are reaching sign-in before the connector can finish.";
  }
  if (primaryBlocker === "failed") {
    return "Recent runs are mixed, with failures still dominating the friction.";
  }
  return `Recent runs are mixed, with ${successRate}% success so far.`;
}

function deriveEligibilityTier(site = {}, effectiveStatus = "") {
  const track = sanitizeString(site?.track, 64).toLowerCase();
  const productLane = sanitizeString(site?.product_lane, 64).toLowerCase();
  const normalizedStatus = normalizeProductStatus(effectiveStatus, "yellow");

  if (track === "startup") {
    if (productLane === "community_launch" || normalizedStatus === "red") {
      return "manual";
    }
    if (normalizedStatus === "green") {
      return "starter";
    }
    return "booster";
  }

  if (track === "physical_local") {
    return normalizedStatus === "red" ? "manual" : "assisted";
  }

  if (normalizedStatus === "green") {
    return "starter";
  }
  if (normalizedStatus === "red") {
    return "manual";
  }
  return "assisted";
}

function deriveEffectiveProductDecision(site = {}, telemetry = {}) {
  const staticStatus = normalizeProductStatus(site?.product_status, "yellow");
  const liveStatus = sanitizeString(telemetry?.operational_status, 64).toLowerCase() || "untested";
  const primaryBlocker = sanitizeString(telemetry?.primary_blocker, 64).toLowerCase() || "none";
  const totalRuns = Number(telemetry?.total_runs || 0);

  let effectiveStatus = staticStatus;
  let degraded = false;
  let note = "";

  if (!totalRuns) {
    note = "No live runs yet; using the catalog classification.";
  } else if (staticStatus === "green") {
    if (liveStatus === "watch") {
      effectiveStatus = "yellow";
      degraded = true;
      if (primaryBlocker === "captcha") {
        note = "Downgraded from Starter because recent runs are pausing on captcha.";
      } else if (primaryBlocker === "auth") {
        note = "Downgraded from Starter because recent runs are pausing on authentication.";
      } else {
        note = "Downgraded from Starter because recent runs need operator review.";
      }
    } else if (liveStatus === "blocked") {
      effectiveStatus = primaryBlocker === "failed" || primaryBlocker === "no_submit_cta" ? "red" : "yellow";
      degraded = true;
      if (primaryBlocker === "no_submit_cta") {
        note = "Downgraded from Starter because the connector is stalling before final submit.";
      } else if (primaryBlocker === "failed") {
        note = "Downgraded from Starter because recent runs are failing before completion.";
      } else if (primaryBlocker === "captcha") {
        note = "Downgraded from Starter because recent runs are dominated by captcha pauses.";
      } else if (primaryBlocker === "auth") {
        note = "Downgraded from Starter because recent runs are dominated by authentication gates.";
      } else {
        note = "Downgraded from Starter because recent runs are blocked.";
      }
    } else if (liveStatus === "healthy") {
      note = "Recent live runs support Starter eligibility.";
    }
  } else if (staticStatus === "yellow") {
    if (liveStatus === "blocked" && (primaryBlocker === "failed" || primaryBlocker === "no_submit_cta")) {
      effectiveStatus = "red";
      degraded = true;
      if (primaryBlocker === "no_submit_cta") {
        note = "Escalated to manual because the connector is stalling before final submit.";
      } else {
        note = "Escalated to manual because recent runs are failing before completion.";
      }
    } else if (liveStatus === "healthy") {
      note = "Recent live runs look healthier, but this connector stays Booster-only until it earns promotion.";
    }
  } else if (staticStatus === "red") {
    note = totalRuns
      ? "This connector remains manual-only even with live telemetry."
      : "This connector is manual-only by catalog policy.";
  }

  if (!note) {
    note = totalRuns
      ? "Live telemetry currently matches the catalog classification."
      : "No live runs yet; using the catalog classification.";
  }

  return {
    effective_product_status: effectiveStatus,
    eligibility_tier: deriveEligibilityTier(site, effectiveStatus),
    degraded_from_catalog: degraded,
    eligibility_note: note
  };
}

function aggregateSiteTelemetry(rows = [], window = {}) {
  const telemetry = {
    sample_window_days: Number(window.days || 30),
    total_runs: 0,
    success_count: 0,
    failed_count: 0,
    captcha_count: 0,
    auth_count: 0,
    duplicate_review_count: 0,
    missing_inputs_count: 0,
    review_count: 0,
    no_submit_cta_count: 0,
    other_count: 0,
    success_rate_percent: 0,
    primary_blocker: "none",
    operational_status: "untested",
    operational_note: "No recent submission runs recorded yet.",
    last_run_at: null,
    last_submission_status: null,
    last_queue_status: null
  };

  for (const row of rows) {
    telemetry.total_runs += 1;
    const bucket = classifyJobBucket(row);
    if (bucket === "success") telemetry.success_count += 1;
    if (bucket === "failed") telemetry.failed_count += 1;
    if (bucket === "captcha") telemetry.captcha_count += 1;
    if (bucket === "auth") telemetry.auth_count += 1;
    if (bucket === "duplicate_review") telemetry.duplicate_review_count += 1;
    if (bucket === "missing_inputs") telemetry.missing_inputs_count += 1;
    if (bucket === "review") telemetry.review_count += 1;
    if (bucket === "no_submit_cta") telemetry.no_submit_cta_count += 1;
    if (bucket === "other") telemetry.other_count += 1;

    const createdAt = sanitizeOptionalString(row?.created_at, 128) || sanitizeOptionalString(row?.updated_at, 128) || null;
    const createdAtMs = parseTimestamp(createdAt);
    const lastRunAtMs = parseTimestamp(telemetry.last_run_at);
    if (createdAtMs !== null && (lastRunAtMs === null || createdAtMs > lastRunAtMs)) {
      telemetry.last_run_at = createdAt;
      telemetry.last_submission_status = deriveSubmissionStatus(row) || null;
      telemetry.last_queue_status = deriveQueueStatus(row) || null;
    }
  }

  telemetry.success_rate_percent = telemetry.total_runs
    ? Math.round((telemetry.success_count / telemetry.total_runs) * 100)
    : 0;
  telemetry.primary_blocker = derivePrimaryBlocker(telemetry);
  telemetry.operational_status = deriveOperationalStatus(telemetry);
  telemetry.operational_note = deriveOperationalNote(telemetry);

  return telemetry;
}

function buildTelemetrySummary(sites = [], window = {}) {
  const summary = {
    sample_window_days: Number(window.days || 30),
    sampled_jobs: 0,
    sites_with_live_runs: 0,
    healthy_sites: 0,
    watch_sites: 0,
    blocked_sites: 0,
    untested_sites: 0,
    success_count: 0,
    failed_count: 0,
    captcha_count: 0,
    auth_count: 0,
    duplicate_review_count: 0,
    missing_inputs_count: 0,
    review_count: 0,
    no_submit_cta_count: 0
  };

  for (const site of sites) {
    const telemetry = isPlainObject(site?.telemetry) ? site.telemetry : {};
    if (Number(telemetry.total_runs || 0) > 0) {
      summary.sites_with_live_runs += 1;
    }
    const status = sanitizeString(telemetry.operational_status, 64).toLowerCase();
    if (status === "healthy") summary.healthy_sites += 1;
    else if (status === "watch") summary.watch_sites += 1;
    else if (status === "blocked") summary.blocked_sites += 1;
    else summary.untested_sites += 1;

    summary.sampled_jobs += Number(telemetry.total_runs || 0);
    summary.success_count += Number(telemetry.success_count || 0);
    summary.failed_count += Number(telemetry.failed_count || 0);
    summary.captcha_count += Number(telemetry.captcha_count || 0);
    summary.auth_count += Number(telemetry.auth_count || 0);
    summary.duplicate_review_count += Number(telemetry.duplicate_review_count || 0);
    summary.missing_inputs_count += Number(telemetry.missing_inputs_count || 0);
    summary.review_count += Number(telemetry.review_count || 0);
    summary.no_submit_cta_count += Number(telemetry.no_submit_cta_count || 0);
  }

  summary.success_rate_percent = summary.sampled_jobs
    ? Math.round((summary.success_count / summary.sampled_jobs) * 100)
    : 0;

  return summary;
}

function buildEffectiveStatusSummary(sites = []) {
  const summary = {
    total_sites: sites.length,
    green_count: 0,
    yellow_count: 0,
    red_count: 0
  };

  for (const site of sites) {
    const status = normalizeProductStatus(site?.effective_product_status, "");
    if (status) {
      summary[`${status}_count`] += 1;
    }
  }

  return summary;
}

function buildEligibilitySummary(sites = []) {
  const summary = {
    total_sites: sites.length,
    starter_count: 0,
    booster_count: 0,
    assisted_count: 0,
    manual_count: 0,
    degraded_count: 0
  };

  for (const site of sites) {
    const tier = sanitizeString(site?.eligibility_tier, 32).toLowerCase();
    if (tier === "starter") summary.starter_count += 1;
    else if (tier === "booster") summary.booster_count += 1;
    else if (tier === "manual") summary.manual_count += 1;
    else summary.assisted_count += 1;

    if (site?.degraded_from_catalog === true) {
      summary.degraded_count += 1;
    }
  }

  return summary;
}

async function buildSubmissionSiteScorecard(filters = {}, options = {}) {
  const baseScorecard = listSiteScorecard(filters);
  const window = normalizeTelemetryWindow(filters);
  const siteIds = new Set(
    (Array.isArray(baseScorecard.sites) ? baseScorecard.sites : [])
      .map((site) => sanitizeString(site?.site_id, 128).toLowerCase())
      .filter(Boolean)
  );

  if (!siteIds.size) {
    return {
      ok: true,
      status: 200,
      summary: baseScorecard.summary,
      telemetry_summary: buildTelemetrySummary([], window),
      telemetry_error: null,
      sites: []
    };
  }

  const createdAfter = new Date(Date.now() - window.days * 24 * 60 * 60 * 1000).toISOString();
  const listJobs = typeof options.listJobs === "function" ? options.listJobs : listSubmissionJobs;

  let rows = [];
  let telemetryError = null;
  try {
    const listed = await listJobs(
      {
        owner_user_id: options.ownerUserId || filters.owner_user_id || filters.ownerUserId,
        job_type: "directory_submit",
        created_after: createdAfter,
        limit: window.limit
      },
      options
    );

    if (!listed?.ok) {
      telemetryError = listed?.error || "Failed to load live submission telemetry.";
    } else {
      rows = (Array.isArray(listed.rows) ? listed.rows : []).filter((row) =>
        siteIds.has(sanitizeString(row?.site_id, 128).toLowerCase())
      );
    }
  } catch (error) {
    telemetryError = error?.message || "Failed to load live submission telemetry.";
  }

  const rowsBySiteId = new Map();
  for (const row of rows) {
    const siteId = sanitizeString(row?.site_id, 128).toLowerCase();
    if (!siteId) {
      continue;
    }
    if (!rowsBySiteId.has(siteId)) {
      rowsBySiteId.set(siteId, []);
    }
    rowsBySiteId.get(siteId).push(row);
  }

  const sites = (Array.isArray(baseScorecard.sites) ? baseScorecard.sites : []).map((site) => {
    const siteId = sanitizeString(site?.site_id, 128).toLowerCase();
    const telemetry = aggregateSiteTelemetry(rowsBySiteId.get(siteId) || [], window);
    const decision = deriveEffectiveProductDecision(site, telemetry);
    return {
      ...site,
      live_status: telemetry.operational_status,
      live_note: telemetry.operational_note,
      telemetry,
      ...decision
    };
  });

  const sortOrder = { green: 0, yellow: 1, red: 2 };
  sites.sort((left, right) => {
    const leftWeight = sortOrder[normalizeProductStatus(left?.effective_product_status, "")] ?? 99;
    const rightWeight = sortOrder[normalizeProductStatus(right?.effective_product_status, "")] ?? 99;
    if (leftWeight !== rightWeight) {
      return leftWeight - rightWeight;
    }
    return sanitizeString(left?.site_name, 160).localeCompare(sanitizeString(right?.site_name, 160));
  });

  return {
    ok: true,
    status: 200,
    summary: baseScorecard.summary,
    effective_summary: buildEffectiveStatusSummary(sites),
    eligibility_summary: buildEligibilitySummary(sites),
    telemetry_summary: buildTelemetrySummary(sites, window),
    telemetry_error: telemetryError,
    sites
  };
}

module.exports = {
  normalizeTelemetryWindow,
  classifyJobBucket,
  aggregateSiteTelemetry,
  buildTelemetrySummary,
  deriveEffectiveProductDecision,
  buildSubmissionSiteScorecard
};
