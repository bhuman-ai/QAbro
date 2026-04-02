#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const {
  claimNextSubmissionJob,
  enqueueSubmissionJob,
  getSubmissionWorkerTiming,
  listSubmissionJobs,
  updateSubmissionJob,
  buildSubmissionJobPayload,
  sanitizeSubmissionJobPayload
} = require("../lib/submission-queue");
const { runDirectoryRecon, runAssetPrepare, runDirectorySubmit } = require("../lib/submission-runner");
const {
  buildSubmissionMarkdown,
  SUBMISSION_JOB_TYPE_ASSET_PREPARE,
  SUBMISSION_JOB_TYPE_RECON,
  SUBMISSION_JOB_TYPE_SUBMIT
} = require("../lib/submission-core");
const {
  upsertSubmissionSiteProfile,
  loadActiveSubmissionSiteProfiles
} = require("../lib/submission-site-profiles");
const { loadSubmissionBrandProfile } = require("../lib/submission-brand-profiles");
const { createSubmissionAssetManifest, loadSubmissionAssetManifest } = require("../lib/submission-asset-manifests");
const {
  buildDriftNextSteps,
  maybeQueueSubmissionDriftRefresh,
  resolveSubmissionPublicBaseUrl
} = require("../lib/submission-drift");
const { buildProxyRotationConfig, shouldRotateProxyForExecution } = require("../lib/submission-proxy");
const { maybeEnsureSubmissionProxyCoverage } = require("../lib/submission-proxy-policy");
const { sanitizeOptionalString, sanitizeString, sleep } = require("../lib/qa-core");

function loadEnvFileIfPresent(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function bootstrapEnv() {
  loadEnvFileIfPresent(path.resolve(process.cwd(), ".env.worker"));
  loadEnvFileIfPresent(path.resolve(process.cwd(), ".env.local"));
  loadEnvFileIfPresent(path.resolve(process.cwd(), ".tmp/vercel.env"));
}

function parseArgs(argv) {
  const args = {
    once: false,
    intervalMs: 10000,
    workerId: process.env.SUBMISSION_WORKER_ID || `submission-worker-${process.pid}`
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--once") {
      args.once = true;
      continue;
    }
    if (arg === "--interval-ms") {
      const next = Number(argv[index + 1]);
      if (Number.isFinite(next) && next >= 0) {
        args.intervalMs = next;
        index += 1;
      }
      continue;
    }
    if (arg === "--worker-id") {
      const next = String(argv[index + 1] || "").trim();
      if (next) {
        args.workerId = next;
        index += 1;
      }
    }
  }

  return args;
}

function createLiveProgressUpdater(claimed, workerId) {
  const runLog = [];
  let artifacts = {};
  let progress = {
    phase: "processing",
    percent: 1,
    message: "Job claimed by submission worker.",
    updated_at: new Date().toISOString()
  };
  let pendingFlush = Promise.resolve();
  let heartbeatTimer = null;

  const flush = async (forceMessage) => {
    const payload = buildSubmissionJobPayload({
      existingPayload: claimed.payload,
      jobRequest: claimed.jobRequest,
      statusUrl: claimed.payload?.status_url,
      reportUrl: claimed.payload?.report_url,
      runLog,
      artifacts,
      worker: {
        worker_id: workerId,
        heartbeat_at: new Date().toISOString(),
        claimed_at:
          sanitizeOptionalString(claimed.payload?.worker?.claimed_at, 128) || new Date().toISOString()
      }
    });

    const message = forceMessage || progress.message;
    const updated = await updateSubmissionJob(claimed.row.job_id, {
      status: "processing",
      claimed_by: workerId,
      progress: {
        ...progress,
        message,
        updated_at: new Date().toISOString()
      },
      payload
    });
    if (updated.ok && updated.row?.payload) {
      claimed.payload = sanitizeSubmissionJobPayload(updated.row.payload);
    }
  };

  const enqueueFlush = (forceMessage) => {
    pendingFlush = pendingFlush.catch(() => {}).then(() => flush(forceMessage));
    return pendingFlush.catch(() => {
      // The worker will fail the job if the flush error is terminal.
    });
  };

  return {
    onRunLog(entry) {
      const safeEntry =
        entry && typeof entry === "object"
          ? {
              ts: sanitizeString(entry.ts || entry.timestamp, 128) || new Date().toISOString(),
              event: sanitizeString(entry.event, 128) || "submission_progress",
              data:
                entry.data && typeof entry.data === "object"
                  ? entry.data
                  : entry.details && typeof entry.details === "object"
                    ? entry.details
                    : {}
            }
          : {
              ts: new Date().toISOString(),
              event: "submission_progress",
              data: {}
            };

      runLog.push(safeEntry);
      if (runLog.length > 200) {
        runLog.splice(0, runLog.length - 200);
      }
    },
    setArtifacts(nextArtifacts) {
      artifacts = nextArtifacts && typeof nextArtifacts === "object" ? nextArtifacts : {};
    },
    async setProgress(nextProgress) {
      progress = {
        phase: sanitizeString(nextProgress?.phase, 64) || "processing",
        percent: Number.isFinite(Number(nextProgress?.percent))
          ? Math.max(0, Math.min(100, Number(nextProgress.percent)))
          : progress.percent,
        message: sanitizeString(nextProgress?.message, 240) || progress.message,
        updated_at: sanitizeOptionalString(nextProgress?.updated_at, 128) || new Date().toISOString()
      };
      await enqueueFlush();
    },
    async flushNow(message) {
      await enqueueFlush(message);
    },
    startHeartbeat(intervalMs) {
      if (heartbeatTimer || !Number.isFinite(Number(intervalMs)) || Number(intervalMs) <= 0) {
        return;
      }
      heartbeatTimer = setInterval(() => {
        void enqueueFlush();
      }, Number(intervalMs));
    },
    async stopHeartbeat() {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      await pendingFlush;
    },
    getRunLog() {
      return runLog.slice();
    }
  };
}

function appendExecutionToLiveProgress(liveProgress, execution) {
  for (const entry of Array.isArray(execution?.runLog) ? execution.runLog : []) {
    liveProgress.onRunLog(entry);
  }
  liveProgress.setArtifacts(execution?.artifacts || {});
}

function buildSubmitJobRequestForProxyAttempt(jobRequest, attemptIndex) {
  const metadata =
    jobRequest?.metadata && typeof jobRequest.metadata === "object"
      ? { ...jobRequest.metadata }
      : {};
  metadata.submission_proxy_attempt_index = Math.max(0, Number(attemptIndex) || 0);
  return {
    ...jobRequest,
    metadata
  };
}

function getSiteProfileFieldCount(siteProfile) {
  const fields = Array.isArray(siteProfile?.fields) ? siteProfile.fields : [];
  return fields.length;
}

function getSiteProfilePageSignals(siteProfile) {
  const pages = Array.isArray(siteProfile?.pages) ? siteProfile.pages : [];
  const collected = [];
  for (const page of pages) {
    const title = sanitizeString(page?.title, 240);
    if (title) {
      collected.push(title);
    }
    for (const hint of Array.isArray(page?.text_hints) ? page.text_hints : []) {
      const safeHint = sanitizeString(hint, 500);
      if (safeHint) {
        collected.push(safeHint);
      }
    }
  }
  return collected;
}

function isInterstitialReconProfile(siteProfile) {
  const haystack = getSiteProfilePageSignals(siteProfile)
    .join(" \n ")
    .toLowerCase();
  if (!haystack) {
    return false;
  }

  return [
    "just a moment",
    "performing security verification",
    "security service to protect against malicious bots",
    "cloudflare",
    "verify you are not a bot"
  ].some((pattern) => haystack.includes(pattern));
}

function shouldPromoteReconSiteProfile(existingSiteRow, nextSiteProfile) {
  const existingProfile =
    existingSiteRow?.profile && typeof existingSiteRow.profile === "object" ? existingSiteRow.profile : {};
  const existingFieldCount = getSiteProfileFieldCount(existingProfile);
  const nextFieldCount = getSiteProfileFieldCount(nextSiteProfile);

  if (existingFieldCount > 0 && nextFieldCount === 0 && isInterstitialReconProfile(nextSiteProfile)) {
    return {
      ok: false,
      reason: "interstitial_recon_profile"
    };
  }

  return {
    ok: true,
    reason: null
  };
}

async function processOne(workerId) {
  const claimed = await claimNextSubmissionJob({
    workerId,
    jobTypes: [SUBMISSION_JOB_TYPE_RECON, SUBMISSION_JOB_TYPE_ASSET_PREPARE, SUBMISSION_JOB_TYPE_SUBMIT]
  });
  if (!claimed.ok) {
    throw new Error(claimed.error || "Failed to claim submission job");
  }

  if (!claimed.row) {
    return { processed: false, reason: "no_jobs" };
  }

  return processClaimedSubmissionJob(claimed, workerId);
}

async function processClaimedSubmissionJob(claimed, workerId) {
  const liveProgress = createLiveProgressUpdater(claimed, workerId);
  const workerTiming = getSubmissionWorkerTiming();
  const jobType = sanitizeString(claimed.jobRequest?.job_type, 64) || SUBMISSION_JOB_TYPE_RECON;
  liveProgress.startHeartbeat(workerTiming.heartbeatIntervalMs);
  await liveProgress.flushNow(`${jobType} job claimed by submission worker.`);

  let execution;
  let finalJobRequest = claimed.jobRequest;
  try {
    const brandProfileLoader = async (brandProfileId, loaderOptions = {}) =>
      loadSubmissionBrandProfile(brandProfileId, {
        ownerUserId: sanitizeString(claimed.row?.owner_user_id, 128),
        includeSecrets: loaderOptions.includeSecrets === true
      });
    const assetManifestLoader = async (filters) =>
      loadSubmissionAssetManifest(filters, {
        ownerUserId: sanitizeString(claimed.row?.owner_user_id, 128)
      });
    const siteProfileLoader = async (siteIds) =>
      loadActiveSubmissionSiteProfiles(siteIds);

    if (jobType === SUBMISSION_JOB_TYPE_RECON) {
      execution = await runDirectoryRecon(claimed.jobRequest, {
        onProgress: async (progress) => {
          await liveProgress.setProgress(progress);
        },
        loadBrandProfile: brandProfileLoader
      });
    } else if (jobType === SUBMISSION_JOB_TYPE_ASSET_PREPARE) {
      execution = await runAssetPrepare(claimed.jobRequest, {
        onProgress: async (progress) => {
          await liveProgress.setProgress(progress);
        },
        loadBrandProfile: brandProfileLoader,
        loadSiteProfiles: siteProfileLoader
      });
    } else if (jobType === SUBMISSION_JOB_TYPE_SUBMIT) {
      const rotationConfig = buildProxyRotationConfig(claimed.jobRequest);
      const proxyAttempts = [];
      const brandLoaded = await brandProfileLoader(claimed.jobRequest.brand_profile_id, { includeSecrets: true });
      if (!brandLoaded?.ok || !brandLoaded.row) {
        throw new Error(brandLoaded?.error || "Brand profile not found.");
      }
      const proxyCoverage = await maybeEnsureSubmissionProxyCoverage(claimed.jobRequest, brandLoaded.row);
      if (!proxyCoverage?.ok) {
        liveProgress.onRunLog({
          ts: new Date().toISOString(),
          event: "proxy_coverage_failed",
          data: {
            message: proxyCoverage?.error || "Failed to remediate proxy coverage."
          }
        });
      } else {
        liveProgress.onRunLog({
          ts: new Date().toISOString(),
          event: proxyCoverage.changed ? "proxy_coverage_changed" : "proxy_coverage_checked",
          data: {
            note: proxyCoverage.note || null,
            selection: proxyCoverage.selection || null,
            remediation: proxyCoverage.remediation || null
          }
        });
      }
      let workingJobRequest = buildSubmitJobRequestForProxyAttempt(
        claimed.jobRequest,
        claimed.jobRequest?.metadata?.submission_proxy_attempt_index
      );

      while (true) {
        finalJobRequest = workingJobRequest;
        claimed.jobRequest = workingJobRequest;
        execution = await runDirectorySubmit(workingJobRequest, {
          onProgress: async (progress) => {
            await liveProgress.setProgress(progress);
          },
          loadBrandProfile: (brandProfileId) => brandProfileLoader(brandProfileId, { includeSecrets: true }),
          loadAssetManifest: assetManifestLoader,
          loadSiteProfiles: siteProfileLoader
        });
        appendExecutionToLiveProgress(liveProgress, execution);

        const proxySelection =
          execution?.artifacts?.runtime?.proxy_selection &&
          typeof execution.artifacts.runtime.proxy_selection === "object"
            ? execution.artifacts.runtime.proxy_selection
            : null;
        proxyAttempts.push({
          attempt_index: Number(proxySelection?.attempt_index) || 0,
          provider: sanitizeOptionalString(proxySelection?.provider, 64) || null,
          status: sanitizeOptionalString(proxySelection?.status, 64) || null,
          matched: proxySelection?.matched !== false,
          selected: proxySelection?.selected || null,
          submission_status: sanitizeOptionalString(execution?.result?.submission_status, 128) || null,
          note: sanitizeOptionalString(execution?.result?.summary?.note, 4000) || null
        });

        const rotationDecision = shouldRotateProxyForExecution(
          execution,
          proxySelection,
          workingJobRequest,
          { rotationConfig }
        );
        if (!rotationDecision.shouldRotate) {
          execution.result = execution.result && typeof execution.result === "object" ? execution.result : {};
          execution.result.proxy_rotation = {
            enabled: rotationConfig.enabled,
            attempts_used: proxyAttempts.length,
            max_attempts: rotationConfig.maxAttempts,
            rotated: proxyAttempts.length > 1,
            attempts: proxyAttempts
          };
          break;
        }

        liveProgress.onRunLog({
          ts: new Date().toISOString(),
          event: "proxy_rotation_retrying",
          data: {
            reason: rotationDecision.reason,
            next_attempt_index: rotationDecision.nextAttemptIndex
          }
        });
        await liveProgress.setProgress({
          phase: "rotating_proxy",
          percent: 18,
          message: `Retrying with proxy candidate ${Number(rotationDecision.nextAttemptIndex) + 1}.`,
          updated_at: new Date().toISOString()
        });
        workingJobRequest = buildSubmitJobRequestForProxyAttempt(
          workingJobRequest,
          rotationDecision.nextAttemptIndex
        );
      }
    } else {
      throw new Error(`Unsupported submission job type: ${jobType}`);
    }
  } finally {
    await liveProgress.stopHeartbeat();
  }

  if (jobType !== SUBMISSION_JOB_TYPE_SUBMIT) {
    appendExecutionToLiveProgress(liveProgress, execution);
  }

  const result = {
    ...(execution.result && typeof execution.result === "object" ? execution.result : {})
  };
  const finalStatus = execution.ok ? "completed" : "failed";
  const now = new Date().toISOString();

  if (execution.ok && result?.asset_manifest) {
    const manifestCreate = await createSubmissionAssetManifest(
      {
        brand_profile_id: sanitizeString(finalJobRequest.brand_profile_id, 128),
        status: "pending_approval",
        brand_key:
          sanitizeOptionalString(finalJobRequest.brand_key, 256) ||
          sanitizeOptionalString(claimed.row?.brand_key, 256) ||
          null,
        track: sanitizeString(result.asset_manifest.track, 64) || sanitizeString(finalJobRequest.track, 64) || "custom",
        source_job_id: claimed.row.job_id,
        manifest: result.asset_manifest,
        approval: {
          required: true,
          items: Array.isArray(result.asset_manifest.approval_items)
            ? result.asset_manifest.approval_items
            : []
        }
      },
      {
        ownerUserId: sanitizeString(claimed.row?.owner_user_id, 128),
        ownerEmail: sanitizeOptionalString(claimed.row?.owner_email, 320) || null
      }
    );
    if (!manifestCreate.ok) {
      throw new Error(manifestCreate.error || "Failed to create submission asset manifest");
    }

    result.asset_manifest = {
      ...result.asset_manifest,
      manifest_id: manifestCreate.row.manifest_id,
      version: manifestCreate.row.version,
      status: manifestCreate.row.status
    };
    result.manifest_id = manifestCreate.row.manifest_id;
    result.manifest_version = manifestCreate.row.version;
  }

  if (jobType === SUBMISSION_JOB_TYPE_SUBMIT) {
    const activeSiteProfileLoaded = await loadActiveSubmissionSiteProfiles([finalJobRequest.site_id]);
    const activeSiteProfile =
      activeSiteProfileLoaded?.ok && Array.isArray(activeSiteProfileLoaded.rows) && activeSiteProfileLoaded.rows[0]
        ? activeSiteProfileLoaded.rows[0]
        : null;
    const driftRefresh = await maybeQueueSubmissionDriftRefresh(
      {
        claimed,
        execution,
        result,
        siteProfile: activeSiteProfile
      },
      {
        ownerUserId: sanitizeString(claimed.row?.owner_user_id, 128),
        ownerEmail: sanitizeOptionalString(claimed.row?.owner_email, 320) || null,
        publicBaseUrl: resolveSubmissionPublicBaseUrl(),
        listJobs: listSubmissionJobs,
        enqueueJob: enqueueSubmissionJob
      }
    );
    if (driftRefresh?.drift_event) {
      result.drift_event = driftRefresh.drift_event;
      const driftSteps = buildDriftNextSteps(driftRefresh.drift_event);
      if (driftSteps.length) {
        const existingNextSteps = Array.isArray(result.next_steps) ? result.next_steps : [];
        result.next_steps = Array.from(new Set([...existingNextSteps, ...driftSteps]));
      }
    }
  }

  result.markdown = buildSubmissionMarkdown(result, finalJobRequest);
  claimed.jobRequest = finalJobRequest;

  const finalPayload = buildSubmissionJobPayload({
    existingPayload: claimed.payload,
    jobRequest: finalJobRequest,
    statusUrl: claimed.payload?.status_url,
    reportUrl: claimed.payload?.report_url,
    runLog: liveProgress.getRunLog(),
    artifacts: execution.artifacts || {},
    worker: {
      worker_id: workerId,
      claimed_at: sanitizeOptionalString(claimed.payload?.worker?.claimed_at, 128) || now,
      heartbeat_at: now,
      completed_at: now
    }
  });

  const updated = await updateSubmissionJob(claimed.row.job_id, {
    status: finalStatus,
    claimed_by: workerId,
    progress: {
      phase: finalStatus,
      percent: 100,
      message:
        sanitizeString(result?.summary?.note, 240) ||
        (finalStatus === "completed" ? "Submission job completed." : "Submission job failed."),
      updated_at: now
    },
    payload: finalPayload,
    result,
    completed_at: now
  });
  if (!updated.ok) {
    throw new Error(updated.error || "Failed to persist submission result");
  }

  if (execution.ok && result?.site_profile) {
    const existingSiteProfiles = await loadActiveSubmissionSiteProfiles([finalJobRequest.site_id]);
    const existingSiteProfile =
      existingSiteProfiles?.ok && Array.isArray(existingSiteProfiles.rows) ? existingSiteProfiles.rows[0] || null : null;
    const promotionDecision = shouldPromoteReconSiteProfile(existingSiteProfile, result.site_profile);
    result.site_profile_promotion = {
      promoted: promotionDecision.ok === true,
      reason: promotionDecision.reason || null
    };
    if (promotionDecision.ok !== true) {
      liveProgress.onRunLog({
        ts: new Date().toISOString(),
        event: "site_profile_promotion_skipped",
        data: {
          site_id: finalJobRequest.site_id,
          reason: promotionDecision.reason || "skipped"
        }
      });
      return {
        processed: true,
        jobId: claimed.row.job_id,
        status: finalStatus
      };
    }

    const profileUpdate = await upsertSubmissionSiteProfile({
      site_id: sanitizeString(result.site_profile.site_id, 128) || finalJobRequest.site_id,
      site_name: sanitizeString(result.site_profile.site_name, 180) || finalJobRequest.site_name,
      track: sanitizeString(result.site_profile.track, 64) || finalJobRequest.track,
      status: "active",
      submission_policy:
        sanitizeString(result.site_profile.recommended_submission_policy, 64) || "assist",
      submit_url: finalJobRequest.submit_url,
      profile: result.site_profile,
      evidence: result.evidence || {},
      source_job_id: claimed.row.job_id,
      last_recon_at: now
    });
    if (!profileUpdate.ok) {
      throw new Error(profileUpdate.error || "Failed to upsert submission site profile");
    }
  }

  return {
    processed: true,
    jobId: claimed.row.job_id,
    status: finalStatus
  };
}

async function main() {
  bootstrapEnv();
  const args = parseArgs(process.argv.slice(2));

  do {
    const result = await processOne(args.workerId);
    if (args.once) {
      break;
    }
    if (!result.processed) {
      await sleep(args.intervalMs);
    }
  } while (true);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      JSON.stringify(
        {
          ok: false,
          message: error?.message || "Unhandled error",
          stack: error?.stack || null
        },
        null,
        2
      )
    );
    process.exit(1);
  });
}

module.exports = {
  bootstrapEnv,
  processClaimedSubmissionJob,
  processOne,
  main,
  __private: {
    isInterstitialReconProfile,
    shouldPromoteReconSiteProfile
  }
};
