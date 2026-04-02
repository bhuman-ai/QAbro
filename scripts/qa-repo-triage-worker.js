const {
  isPlainObject,
  sanitizeString
} = require("../lib/qa-core");
const {
  claimNextRepoTriageJob,
  buildRepoTriageJobPayload,
  updateRepoTriageJob
} = require("../lib/qa-repo-triage-queue");
const {
  runLocalRepoTriage,
  shouldEnqueueRepoTriage,
  updateStoredReportRepoTriage
} = require("../lib/qa-repo-triage");

async function markRepoTriageFailure(claimed, workerId, message) {
  const runId = sanitizeString(claimed?.jobRequest?.run_id, 128);
  const jobId = sanitizeString(claimed?.row?.job_id, 128);
  const now = new Date().toISOString();
  const safeMessage = sanitizeString(message, 500) || "Repo triage failed.";

  if (runId) {
    await updateStoredReportRepoTriage(runId, {
      repoTriage: {
        status: "failed",
        job_id: jobId || null,
        summary: safeMessage,
        reason: safeMessage,
        completed_at: now,
        updated_at: now
      }
    });
  }

  if (jobId) {
    await updateRepoTriageJob(jobId, {
      status: "failed",
      claimed_by: workerId,
      completed_at: now,
      payload: buildRepoTriageJobPayload({
        existingPayload: claimed?.payload,
        worker: {
          worker_id: workerId,
          completed_at: now
        }
      }),
      progress: {
        phase: "failed",
        percent: 100,
        message: safeMessage,
        updated_at: now
      },
      result: {
        error: safeMessage
      }
    });
  }

  return {
    processed: true,
    run_id: runId || null,
    status: "failed",
    error: safeMessage
  };
}

async function processOne(workerId = `repo-triage-worker-${Date.now()}`) {
  const claimed = await claimNextRepoTriageJob({ workerId });
  if (!claimed.ok) {
    return claimed;
  }
  if (!claimed.row) {
    return { processed: false, status: "idle" };
  }

  const runId = sanitizeString(claimed?.jobRequest?.run_id, 128);
  const now = new Date().toISOString();
  if (!runId) {
    return markRepoTriageFailure(claimed, workerId, "Repo triage job is missing run_id.");
  }

  const reportUpdated = await updateStoredReportRepoTriage(runId, {
    repoTriage: {
      status: "processing",
      job_id: claimed.row.job_id,
      started_at: now,
      updated_at: now,
      summary: "Scanning the configured workspace for likely root causes and tests."
    }
  });
  if (!reportUpdated.ok) {
    return markRepoTriageFailure(claimed, workerId, reportUpdated.error || "Could not load report for repo triage.");
  }

  const reportRow = reportUpdated.row;
  const payload = isPlainObject(reportRow?.payload) ? reportRow.payload : {};
  const report = isPlainObject(payload.report_json) ? payload.report_json : {};
  const runRequest = isPlainObject(payload.run_request) ? payload.run_request : {};
  const decision = shouldEnqueueRepoTriage(report, runRequest);

  if (!decision.shouldQueue) {
    await updateStoredReportRepoTriage(runId, {
      repoTriage: {
        status: "skipped",
        job_id: claimed.row.job_id,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        summary: decision.reason,
        reason: decision.reason
      }
    });
    await updateRepoTriageJob(claimed.row.job_id, {
      status: "completed",
      claimed_by: workerId,
      completed_at: new Date().toISOString(),
      payload: buildRepoTriageJobPayload({
        existingPayload: claimed.payload,
        worker: {
          worker_id: workerId,
          completed_at: new Date().toISOString()
        }
      }),
      progress: {
        phase: "skipped",
        percent: 100,
        message: decision.reason,
        updated_at: new Date().toISOString()
      },
      result: {
        skipped: true,
        reason: decision.reason
      }
    });
    return {
      processed: true,
      run_id: runId,
      status: "skipped"
    };
  }

  try {
    const engineeringTriage = runLocalRepoTriage({
      report,
      runRequest,
      repoTriage: decision.config
    });
    const completedAt = new Date().toISOString();
    await updateStoredReportRepoTriage(runId, {
      engineeringTriage,
      repoTriage: {
        ...decision.config,
        status: "completed",
        job_id: claimed.row.job_id,
        signal_count: decision.findings.length,
        signal_types: decision.signalTypes || [],
        completed_at: completedAt,
        updated_at: completedAt,
        summary: engineeringTriage?.summary || "Repo triage completed."
      }
    });
    await updateRepoTriageJob(claimed.row.job_id, {
      status: "completed",
      claimed_by: workerId,
      completed_at: completedAt,
      payload: buildRepoTriageJobPayload({
        existingPayload: claimed.payload,
        worker: {
          worker_id: workerId,
          completed_at: completedAt
        }
      }),
      progress: {
        phase: "completed",
        percent: 100,
        message: engineeringTriage?.summary || "Repo triage completed.",
        updated_at: completedAt
      },
      result: {
        engineering_triage: engineeringTriage
      }
    });
    return {
      processed: true,
      run_id: runId,
      status: "completed"
    };
  } catch (error) {
    return markRepoTriageFailure(
      claimed,
      workerId,
      error instanceof Error ? error.message : String(error || "Repo triage failed.")
    );
  }
}

async function main() {
  const workerId = sanitizeString(process.argv[2], 128) || `repo-triage-worker-${Date.now()}`;
  const result = await processOne(workerId);
  console.log(JSON.stringify(result, null, 2));
}

module.exports = {
  processOne
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  });
}
