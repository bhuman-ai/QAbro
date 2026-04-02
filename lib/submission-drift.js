const {
  DEFAULT_PUBLIC_BASE_URL,
  isPlainObject,
  sanitizeOptionalString,
  sanitizeString
} = require("./qa-core");
const { SUBMISSION_JOB_TYPE_RECON } = require("./submission-core");

const ACTIVE_RECON_REFRESH_STATUSES = ["queued", "processing", "retryable", "paused"];
const HIGH_SEVERITY = 3;
const MEDIUM_SEVERITY = 2;
const LOW_SEVERITY = 1;
const CONNECTOR_STALE_AFTER_DAYS = 90;

const NON_CONNECTOR_FAILURE_PATTERNS = [
  /brand profile not found/i,
  /submission asset manifest not found/i,
  /active site profile not found/i,
  /site profile is missing submit_url/i,
  /server is not configured/i,
  /fetch is not available/i
];

const CONNECTOR_FAILURE_PATTERNS = [
  /submit cta/i,
  /no safe submit/i,
  /locator/i,
  /selector/i,
  /strict mode violation/i,
  /element/i,
  /not attached/i,
  /execution context/i,
  /target page, context or browser has been closed/i,
  /timeout/i,
  /navigation/i,
  /net::/i,
  /ERR_/i,
  /page crashed/i
];

function sanitizeReasonList(reasons) {
  return Array.isArray(reasons)
    ? reasons
        .map((reason) => {
          const source = isPlainObject(reason) ? reason : {};
          const code = sanitizeString(source.code, 128).toLowerCase();
          const severity = sanitizeString(source.severity, 16).toLowerCase();
          const message = sanitizeString(source.message, 4000);
          if (!code || !message) {
            return null;
          }
          return {
            code,
            severity: ["low", "medium", "high"].includes(severity) ? severity : "medium",
            message
          };
        })
        .filter(Boolean)
    : [];
}

function severityToRank(value) {
  if (value === "high") {
    return HIGH_SEVERITY;
  }
  if (value === "medium") {
    return MEDIUM_SEVERITY;
  }
  return LOW_SEVERITY;
}

function rankToSeverity(value) {
  if (value >= HIGH_SEVERITY) {
    return "high";
  }
  if (value >= MEDIUM_SEVERITY) {
    return "medium";
  }
  return "low";
}

function addReason(reasons, code, severity, message) {
  const safeCode = sanitizeString(code, 128).toLowerCase();
  const safeSeverity = rankToSeverity(severityToRank(sanitizeString(severity, 16).toLowerCase()));
  const safeMessage = sanitizeString(message, 4000);
  if (!safeCode || !safeMessage) {
    return;
  }
  if (reasons.some((reason) => reason.code === safeCode)) {
    return;
  }
  reasons.push({
    code: safeCode,
    severity: safeSeverity,
    message: safeMessage
  });
}

function extractSummaryNote(result) {
  return (
    sanitizeString(result?.summary?.note, 4000) ||
    sanitizeString(result?.summary?.message, 4000) ||
    ""
  );
}

function isConnectorFailureMessage(summaryNote) {
  return CONNECTOR_FAILURE_PATTERNS.some((pattern) => pattern.test(summaryNote));
}

function isNonConnectorFailureMessage(summaryNote) {
  return NON_CONNECTOR_FAILURE_PATTERNS.some((pattern) => pattern.test(summaryNote));
}

function computeConnectorAgeDays(siteProfile) {
  const timestamp = Date.parse(
    sanitizeOptionalString(siteProfile?.last_recon_at || siteProfile?.updated_at, 128) || ""
  );
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  return Math.floor((Date.now() - timestamp) / 86400000);
}

function buildDriftSummary(reasons) {
  const safeReasons = sanitizeReasonList(reasons);
  if (!safeReasons.length) {
    return "No connector drift detected.";
  }
  return safeReasons.map((reason) => reason.message).join(" ");
}

function classifySubmissionDrift(input = {}) {
  const result = isPlainObject(input.result) ? input.result : {};
  const submission = isPlainObject(result.submission) ? result.submission : {};
  const jobRequest = isPlainObject(input.jobRequest) ? input.jobRequest : {};
  const siteProfile = isPlainObject(input.siteProfile) ? input.siteProfile : {};
  const reasons = [];
  const status = sanitizeString(result.status, 64).toLowerCase();
  const submissionStatus = sanitizeString(result.submission_status, 64).toLowerCase();
  const summaryNote = extractSummaryNote(result);
  const failedFields = Array.isArray(submission.failed_fields) ? submission.failed_fields : [];
  const filledFieldCount = Number.isFinite(Number(submission.filled_field_count))
    ? Math.max(0, Math.floor(Number(submission.filled_field_count)))
    : 0;
  const connectorAgeDays = computeConnectorAgeDays(siteProfile);

  if (submissionStatus === "paused_no_submit_cta") {
    addReason(
      reasons,
      "submit_cta_missing",
      "high",
      "The connector reached the filled state but no safe final submit CTA was detected."
    );
  }

  if (failedFields.length >= 3 || (failedFields.length > 0 && filledFieldCount === 0)) {
    addReason(
      reasons,
      "field_mapping_failure",
      failedFields.length >= 3 ? "high" : "medium",
      "Multiple field fills failed after the connector loaded, which usually means the site form drifted."
    );
  }

  if (status === "failed" || submissionStatus === "failed") {
    if (!isNonConnectorFailureMessage(summaryNote)) {
      addReason(
        reasons,
        isConnectorFailureMessage(summaryNote) ? "submission_execution_failed" : "submission_failed",
        isConnectorFailureMessage(summaryNote) ? "high" : "medium",
        summaryNote || "The submission run failed after entering the connector flow."
      );
    }
  }

  if (
    Number.isFinite(connectorAgeDays) &&
    connectorAgeDays >= CONNECTOR_STALE_AFTER_DAYS &&
    reasons.length > 0
  ) {
    addReason(
      reasons,
      "stale_connector",
      "medium",
      `The active connector profile is ${connectorAgeDays} day(s) old and should be refreshed.`
    );
  }

  const highestSeverity = reasons.reduce(
    (max, reason) => Math.max(max, severityToRank(reason.severity)),
    LOW_SEVERITY
  );

  return {
    detected: reasons.length > 0,
    should_refresh: reasons.length > 0,
    severity: rankToSeverity(highestSeverity),
    observed_status: status || null,
    observed_submission_status: submissionStatus || null,
    site_id:
      sanitizeString(submission.site_id, 128) ||
      sanitizeString(siteProfile.site_id, 128) ||
      sanitizeString(jobRequest.site_id, 128) ||
      null,
    site_name:
      sanitizeString(submission.site_name, 180) ||
      sanitizeString(siteProfile.site_name, 180) ||
      sanitizeString(jobRequest.site_name, 180) ||
      null,
    site_profile_version: Number.isFinite(Number(siteProfile.version))
      ? Math.floor(Number(siteProfile.version))
      : Number.isFinite(Number(submission.site_profile_version))
        ? Math.floor(Number(submission.site_profile_version))
        : null,
    connector_age_days: Number.isFinite(connectorAgeDays) ? connectorAgeDays : null,
    reason_codes: reasons.map((reason) => reason.code),
    reasons,
    note: buildDriftSummary(reasons),
    detected_at: new Date().toISOString()
  };
}

function resolveSubmissionPublicBaseUrl(value) {
  const configured = sanitizeOptionalString(value || process.env.QA_PUBLIC_APP_URL, 4096);
  return (configured || DEFAULT_PUBLIC_BASE_URL).replace(/\/$/, "");
}

function buildReconRefreshJobId(siteId) {
  const slug = String(siteId || "site")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `recon-refresh-${slug || "site"}-${Date.now()}`;
}

function buildReconRefreshJobRequest(context = {}) {
  const claimed = isPlainObject(context.claimed) ? context.claimed : {};
  const jobRequest = isPlainObject(claimed.jobRequest) ? claimed.jobRequest : {};
  const row = isPlainObject(claimed.row) ? claimed.row : {};
  const siteProfile = isPlainObject(context.siteProfile) ? context.siteProfile : {};
  const driftEvent = isPlainObject(context.driftEvent) ? context.driftEvent : {};
  const siteId =
    sanitizeString(siteProfile.site_id, 128) ||
    sanitizeString(jobRequest.site_id, 128).toLowerCase();
  const submitUrl = sanitizeOptionalString(siteProfile.submit_url, 4096);

  if (!siteId || !submitUrl) {
    return null;
  }

  const baseMetadata = isPlainObject(jobRequest.metadata) ? jobRequest.metadata : {};
  return {
    job_id: buildReconRefreshJobId(siteId),
    job_type: SUBMISSION_JOB_TYPE_RECON,
    site_id: siteId,
    site_name:
      sanitizeString(siteProfile.site_name, 180) ||
      sanitizeString(jobRequest.site_name, 180) ||
      siteId,
    track:
      sanitizeString(siteProfile.track, 64) ||
      sanitizeString(jobRequest.track, 64) ||
      "custom",
    submit_url: submitUrl,
    source: "submission_bot",
    priority: 450,
    max_attempts: 2,
    stop_before_submit: true,
    metadata: {
      ...baseMetadata,
      track:
        sanitizeString(siteProfile.track, 64) ||
        sanitizeString(jobRequest.track, 64) ||
        sanitizeString(baseMetadata.track, 64) ||
        "custom",
      brand_key:
        sanitizeOptionalString(jobRequest.brand_key, 256) ||
        sanitizeOptionalString(row.brand_key, 256) ||
        sanitizeOptionalString(baseMetadata.brand_key, 256) ||
        null,
      refresh_kind: "connector_drift",
      refresh_trigger_job_id: sanitizeString(row.job_id, 128) || sanitizeString(jobRequest.job_id, 128) || null,
      refresh_trigger_submission_status: sanitizeString(driftEvent.observed_submission_status, 64) || null,
      drift_reason_codes: Array.isArray(driftEvent.reason_codes) ? driftEvent.reason_codes.slice(0, 10) : [],
      prior_site_profile_version: Number.isFinite(Number(siteProfile.version))
        ? Math.floor(Number(siteProfile.version))
        : null,
      stop_before_submit: true
    }
  };
}

function buildDriftNextSteps(driftEvent) {
  const drift = isPlainObject(driftEvent) ? driftEvent : {};
  const reconRefresh = isPlainObject(drift.recon_refresh) ? drift.recon_refresh : {};
  const steps = [];

  if (!drift.detected) {
    return steps;
  }

  steps.push(
    sanitizeString(drift.note, 320) || "Connector drift was detected and should be reviewed."
  );

  if (reconRefresh.enqueued && reconRefresh.job_id) {
    steps.push(`A recon refresh was queued automatically (${reconRefresh.job_id}).`);
  } else if (reconRefresh.state === "existing" && reconRefresh.job_id) {
    steps.push(`An active recon refresh already exists for this site (${reconRefresh.job_id}).`);
  } else if (reconRefresh.state === "skipped") {
    steps.push("Connector drift was detected but recon could not be auto-queued from the current site profile.");
  } else if (reconRefresh.state === "error") {
    steps.push("Connector drift was detected but the automatic recon refresh failed to queue.");
  }

  return steps.filter(Boolean);
}

async function maybeQueueSubmissionDriftRefresh(context = {}, options = {}) {
  const driftEvent = classifySubmissionDrift(context);
  if (!driftEvent.detected || driftEvent.should_refresh === false) {
    return {
      ok: true,
      drift_event: driftEvent,
      refresh_job: null
    };
  }

  const listJobs = typeof options.listJobs === "function" ? options.listJobs : null;
  const enqueueJob = typeof options.enqueueJob === "function" ? options.enqueueJob : null;
  const ownerUserId = sanitizeString(options.ownerUserId, 128);
  const ownerEmail = sanitizeOptionalString(options.ownerEmail, 320) || null;
  const claimed = isPlainObject(context.claimed) ? context.claimed : {};
  const siteProfile = isPlainObject(context.siteProfile) ? context.siteProfile : {};
  const siteId =
    sanitizeString(siteProfile.site_id, 128) ||
    sanitizeString(claimed.jobRequest?.site_id, 128).toLowerCase();

  if (!ownerUserId || !listJobs || !enqueueJob || !siteId) {
    driftEvent.recon_refresh = {
      enqueued: false,
      state: "skipped",
      reason: !siteId ? "missing_site_id" : "missing_queue_dependencies"
    };
    return {
      ok: false,
      drift_event: driftEvent,
      refresh_job: null
    };
  }

  const existing = await listJobs(
    {
      owner_user_id: ownerUserId,
      site_id: siteId,
      job_type: SUBMISSION_JOB_TYPE_RECON,
      statuses: ACTIVE_RECON_REFRESH_STATUSES,
      limit: 10
    },
    {
      ownerUserId
    }
  );

  if (!existing?.ok) {
    driftEvent.recon_refresh = {
      enqueued: false,
      state: "error",
      reason: "list_failed",
      error: sanitizeString(existing?.error, 320) || "Failed to inspect active recon jobs."
    };
    return {
      ok: false,
      drift_event: driftEvent,
      refresh_job: null
    };
  }

  const existingRow = Array.isArray(existing.rows) && existing.rows[0] ? existing.rows[0] : null;
  if (existingRow) {
    driftEvent.recon_refresh = {
      enqueued: false,
      state: "existing",
      job_id: sanitizeString(existingRow.job_id, 128),
      status: sanitizeString(existingRow.status, 64) || null
    };
    return {
      ok: true,
      drift_event: driftEvent,
      refresh_job: existingRow
    };
  }

  const refreshRequest = buildReconRefreshJobRequest({
    claimed,
    siteProfile,
    driftEvent
  });
  if (!refreshRequest) {
    driftEvent.recon_refresh = {
      enqueued: false,
      state: "skipped",
      reason: "missing_submit_url"
    };
    return {
      ok: false,
      drift_event: driftEvent,
      refresh_job: null
    };
  }

  const enqueued = await enqueueJob(refreshRequest, {
    ownerUserId,
    ownerEmail,
    publicBaseUrl: resolveSubmissionPublicBaseUrl(options.publicBaseUrl),
    brandKey:
      sanitizeOptionalString(claimed.row?.brand_key, 256) ||
      sanitizeOptionalString(claimed.jobRequest?.brand_key, 256) ||
      sanitizeOptionalString(refreshRequest.metadata?.brand_key, 256) ||
      null
  });

  if (!enqueued?.ok) {
    driftEvent.recon_refresh = {
      enqueued: false,
      state: "error",
      reason: "enqueue_failed",
      error: sanitizeString(enqueued?.error, 320) || "Failed to queue recon refresh."
    };
    return {
      ok: false,
      drift_event: driftEvent,
      refresh_job: null
    };
  }

  driftEvent.recon_refresh = {
    enqueued: true,
    state: "queued",
    job_id: sanitizeString(enqueued?.job?.job_id || enqueued?.row?.job_id, 128),
    status: sanitizeString(enqueued?.job?.status || enqueued?.row?.status, 64) || "queued",
    status_url: sanitizeOptionalString(enqueued?.job?.status_url, 4096) || null,
    report_url: sanitizeOptionalString(enqueued?.job?.report_url, 4096) || null
  };

  return {
    ok: true,
    drift_event: driftEvent,
    refresh_job: enqueued?.job || enqueued?.row || null
  };
}

module.exports = {
  ACTIVE_RECON_REFRESH_STATUSES,
  CONNECTOR_STALE_AFTER_DAYS,
  classifySubmissionDrift,
  buildReconRefreshJobRequest,
  buildDriftNextSteps,
  maybeQueueSubmissionDriftRefresh,
  resolveSubmissionPublicBaseUrl
};
