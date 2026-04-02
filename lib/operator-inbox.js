const { isPlainObject, sanitizeOptionalString, sanitizeString } = require("./qa-core");
const { listSubmissionJobs, sanitizeSubmissionJobPayload, summarizeSubmissionJob } = require("./submission-queue");

function deriveSubmissionInboxState(row) {
  const result = isPlainObject(row?.result) ? row.result : {};
  const submission = isPlainObject(result?.submission) ? result.submission : {};
  const submissionStatus = sanitizeString(result?.submission_status || submission?.submission_status, 64);
  const assetManifest = isPlainObject(result?.asset_manifest) ? result.asset_manifest : {};
  const assetManifestStatus = sanitizeString(assetManifest?.status, 64);
  const jobType = sanitizeString(row?.job_type, 64);
  const queueStatus = sanitizeString(row?.status, 64);

  if (jobType === "asset_prepare" && assetManifestStatus === "pending_approval") {
    return {
      inbox_state: "asset_approval",
      needs_human_action: true,
      action_label: "Approve manifest"
    };
  }
  if (submissionStatus === "paused_for_login") {
    return {
      inbox_state: "login_required",
      needs_human_action: true,
      action_label: "Resume login"
    };
  }
  if (submissionStatus === "paused_for_captcha") {
    return {
      inbox_state: "captcha_required",
      needs_human_action: true,
      action_label: "Resolve captcha"
    };
  }
  if (submissionStatus === "paused_for_duplicate_review") {
    return {
      inbox_state: "duplicate_review",
      needs_human_action: true,
      action_label: "Review duplicates"
    };
  }
  if (submissionStatus === "paused_for_missing_inputs") {
    return {
      inbox_state: "missing_inputs",
      needs_human_action: true,
      action_label: "Fill missing data"
    };
  }
  if (submissionStatus === "filled_ready_for_review" || submissionStatus === "paused_for_human_review") {
    return {
      inbox_state: "submission_review",
      needs_human_action: true,
      action_label: "Review before submit"
    };
  }
  if (queueStatus === "failed") {
    return {
      inbox_state: "failure_review",
      needs_human_action: true,
      action_label: "Inspect failure"
    };
  }
  if (submissionStatus === "pending_review" || submissionStatus === "pending_approval") {
    return {
      inbox_state: "external_review_pending",
      needs_human_action: false,
      action_label: "Wait for external review"
    };
  }
  if (queueStatus === "paused") {
    return {
      inbox_state: "human_review",
      needs_human_action: true,
      action_label: "Resume job"
    };
  }
  return {
    inbox_state: "none",
    needs_human_action: false,
    action_label: null
  };
}

function summarizeInboxRow(row) {
  const payload = sanitizeSubmissionJobPayload(row?.payload);
  const result = isPlainObject(row?.result) ? row.result : {};
  const submission = isPlainObject(result?.submission) ? result.submission : {};
  const inboxState = deriveSubmissionInboxState(row);
  const job = summarizeSubmissionJob(row);
  const nextSteps = Array.isArray(result?.next_steps) ? result.next_steps : [];
  const screenshots = Array.isArray(payload?.artifacts?.screenshots) ? payload.artifacts.screenshots : [];

  return {
    ...job,
    inbox_state: inboxState.inbox_state,
    needs_human_action: inboxState.needs_human_action,
    action_label: inboxState.action_label,
    submission_status: sanitizeString(result?.submission_status, 64) || null,
    summary_note: sanitizeOptionalString(result?.summary?.note, 4000) || null,
    next_action: sanitizeOptionalString(nextSteps[0], 320) || null,
    manifest_id: sanitizeOptionalString(result?.manifest_id || result?.asset_manifest?.manifest_id, 128) || null,
    listing_url: sanitizeOptionalString(submission?.listing_url, 4096) || null,
    final_url: sanitizeOptionalString(submission?.final_url, 4096) || null,
    screenshots_count: screenshots.length
  };
}

async function listSubmissionOperatorInbox(filters = {}, options = {}) {
  const humanOnly = filters.human_only !== false && filters.humanOnly !== false;
  const stateFilter = sanitizeString(filters.state, 64);
  const listJobs =
    typeof options.listJobs === "function"
      ? options.listJobs
      : (jobFilters, listOptions) => listSubmissionJobs(jobFilters, listOptions);

  const listed = await listJobs(
    {
      owner_user_id: filters.owner_user_id || filters.ownerUserId,
      status: filters.status || filters.statuses || "paused,failed,completed",
      job_type: filters.job_type || filters.jobType,
      limit: filters.limit,
      offset: filters.offset,
      search: filters.search
    },
    options
  );
  if (!listed.ok) {
    return listed;
  }

  let items = (Array.isArray(listed.rows) ? listed.rows : []).map(summarizeInboxRow);
  if (humanOnly) {
    items = items.filter((item) => item.needs_human_action);
  }
  if (stateFilter) {
    items = items.filter((item) => item.inbox_state === stateFilter);
  }

  return {
    ok: true,
    status: 200,
    total: items.length,
    limit: listed.limit,
    offset: listed.offset,
    items
  };
}

module.exports = {
  deriveSubmissionInboxState,
  summarizeInboxRow,
  listSubmissionOperatorInbox
};
