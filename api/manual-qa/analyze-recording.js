const crypto = require("crypto");

const { requireDashboardOrServiceAuth } = require("../../lib/auth");
const { parseRequestBody, sanitizeString } = require("../../lib/qa-core");
const {
  buildManualQaRecordingSetFingerprint,
  claimManualQaFindingsAnalysis,
  collectManualQaRecordingMedia,
  getManualQaSession,
  hasManualQaRecordingAnalysisConsent,
  normalizeManualQaSessionRow,
  queueManualQaFindingsAnalysis,
  updateManualQaFindingsAnalysis
} = require("../../lib/manual-qa");
const { runManualQaRecordingAnalysis } = require("../../lib/manual-qa-recording-analysis");

const MANUAL_QA_SOURCE = "manual_qa";
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_BATCH_SIZE = 4;
const MAX_BATCH_SIZE = 8;
const MAX_ANALYSIS_ATTEMPTS = 3;
const LEASE_DURATION_MS = 20 * 60 * 1000;

function resolveOwner(auth, req) {
  return {
    ownerUserId:
      sanitizeString(auth.user?.id, 128) ||
      sanitizeString(req?.headers?.["x-owner-user-id"] || req?.headers?.["x-user-id"], 128),
    ownerEmail:
      sanitizeString(auth.user?.email, 320).toLowerCase() ||
      sanitizeString(req?.headers?.["x-owner-email"], 320).toLowerCase()
  };
}

function timingSafeStringEqual(left, right) {
  const leftDigest = crypto.createHash("sha256").update(String(left || "")).digest();
  const rightDigest = crypto.createHash("sha256").update(String(right || "")).digest();
  return crypto.timingSafeEqual(leftDigest, rightDigest);
}

function resolveCronSecret(options = {}) {
  const candidates = [
    options.cronSecret,
    process.env.MANUAL_QA_RECORDING_ANALYSIS_CRON_SECRET,
    process.env.CRON_SECRET
  ];
  return candidates.find((value) => typeof value === "string" && value.length > 0) || "";
}

function isCronAuthorized(req, options = {}) {
  const configuredSecret = resolveCronSecret(options);
  const rawAuthorization = req?.headers?.authorization ?? req?.headers?.Authorization;
  const authorization = typeof rawAuthorization === "string" ? rawAuthorization : "";
  if (!configuredSecret || !authorization) return false;
  return timingSafeStringEqual(authorization, `Bearer ${configuredSecret}`);
}

function analysisAttemptCount(analysis = {}) {
  return Math.max(0, Math.round(Number(analysis.attempt_count || 0) || 0));
}

function analysisLeaseIsActive(analysis = {}, nowMs = Date.now()) {
  if (analysis.status !== "processing") return false;
  const leaseExpiresAt = Date.parse(analysis.lease_expires_at || "");
  return Number.isFinite(leaseExpiresAt) && leaseExpiresAt > nowMs;
}

function recordingStateForSession(session = {}) {
  const recordings = collectManualQaRecordingMedia(session);
  return {
    recordings,
    fingerprint: buildManualQaRecordingSetFingerprint(session)
  };
}

function sessionHasSubmittedTrial(session = {}) {
  const trial = session.qualification_trial;
  const status = sanitizeString(trial?.status, 40).toLowerCase();
  return Boolean(
    trial &&
      (trial.submitted_at || ["submitted", "verified", "completed"].includes(status))
  );
}

function submittedSessionCanAnalyze(session = {}) {
  const trial = session.qualification_trial || {};
  if (!sessionHasSubmittedTrial(session)) return false;
  if (!hasManualQaRecordingAnalysisConsent(trial)) return false;
  return recordingStateForSession(session).recordings.length > 0;
}

function analysisMatchesCurrentRecordings(session = {}) {
  const analysis = session.findings_analysis || {};
  const { fingerprint } = recordingStateForSession(session);
  return Boolean(fingerprint && analysis.recording_fingerprint === fingerprint);
}

function analysisIsEligible(session = {}, nowMs = Date.now()) {
  if (!submittedSessionCanAnalyze(session)) return false;
  const analysis = session.findings_analysis || { status: "not_started", attempt_count: 0 };
  const status = sanitizeString(analysis.status, 40).toLowerCase() || "not_started";
  const sameRecording = analysisMatchesCurrentRecordings(session);
  if (!sameRecording) return true;
  if (status === "complete") return false;
  if (analysisAttemptCount(analysis) >= MAX_ANALYSIS_ATTEMPTS) return false;
  if (status === "not_started") return false;
  if (status === "queued") return analysis.retryable !== false;
  if (status === "failed") {
    if (analysis.error_code === "recording_analysis_consent_required") return true;
    return analysis.retryable !== false;
  }
  if (status === "processing") return !analysisLeaseIsActive(analysis, nowMs);
  return false;
}

function analysisNeedsTerminalization(session = {}, nowMs = Date.now()) {
  if (!submittedSessionCanAnalyze(session)) return false;
  const analysis = session.findings_analysis || {};
  if (!analysisMatchesCurrentRecordings(session)) return false;
  if (analysisAttemptCount(analysis) < MAX_ANALYSIS_ATTEMPTS) return false;
  if (analysis.status === "complete") return false;
  if (analysisLeaseIsActive(analysis, nowMs)) return false;
  return analysis.status !== "failed" || analysis.retryable !== false;
}

function buildSupabaseHeaders(serviceKey) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json"
  };
}

async function listManualQaSessionPage(options = {}) {
  const supabaseUrl = sanitizeString(options.supabaseUrl || process.env.SUPABASE_URL, 4096).replace(/\/$/, "");
  const serviceKey = sanitizeString(
    options.serviceKey || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
    4096
  );
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (!supabaseUrl || !serviceKey || typeof fetchImpl !== "function") {
    return { ok: false, status: 500, error: "Server is not configured" };
  }

  const limit = Math.max(1, Math.min(DEFAULT_PAGE_SIZE, Number(options.limit || DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE));
  const offset = Math.max(0, Math.round(Number(options.offset || 0) || 0));
  const requestUrl = new URL(`${supabaseUrl}/rest/v1/swarmtest_reports`);
  requestUrl.searchParams.set("select", "run_id,source,status,created_at,delivered_at,target,report_url,payload");
  requestUrl.searchParams.set("source", `eq.${MANUAL_QA_SOURCE}`);
  requestUrl.searchParams.set("order", "delivered_at.asc,run_id.asc");
  requestUrl.searchParams.set("limit", String(limit));
  requestUrl.searchParams.set("offset", String(offset));
  const response = await fetchImpl(requestUrl.toString(), {
    headers: buildSupabaseHeaders(serviceKey)
  });
  let rows = [];
  try {
    rows = await response.json();
  } catch {
    rows = [];
  }
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: rows?.message || "Failed to list recording analysis jobs"
    };
  }

  const items = (Array.isArray(rows) ? rows : []).map((row) => {
    const session = normalizeManualQaSessionRow(row);
    Object.defineProperty(session, "__recordingAnalysisDeliveredAt", {
      configurable: false,
      enumerable: false,
      value: sanitizeString(row?.delivered_at, 128) || null,
      writable: false
    });
    return session;
  });
  return {
    ok: true,
    status: 200,
    items,
    offset,
    next_offset: offset + items.length,
    has_more: items.length === limit
  };
}

async function findNextActionableSession(options = {}, dependencies = {}) {
  const listPage = dependencies.listSessionsPage || listManualQaSessionPage;
  const pageSize = Math.max(
    1,
    Math.min(DEFAULT_PAGE_SIZE, Number(options.pageSize || options.page_size || DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE)
  );
  let offset = 0;
  let scanned = 0;
  while (true) {
    const page = await listPage({ ...options, limit: pageSize, offset });
    if (!page.ok) return page;
    const items = Array.isArray(page.items) ? page.items : [];
    scanned += items.length;
    const candidate = items.find(
      (session) => analysisNeedsTerminalization(session) || analysisIsEligible(session)
    );
    if (candidate) {
      return { ok: true, status: 200, candidate, scanned };
    }
    const hasMore = page.has_more === true || page.hasMore === true;
    if (!hasMore) {
      return { ok: true, status: 200, candidate: null, scanned };
    }
    const proposedOffset = Number(page.next_offset ?? page.nextOffset);
    offset = Number.isFinite(proposedOffset) && proposedOffset > offset
      ? Math.round(proposedOffset)
      : offset + Math.max(items.length, pageSize);
  }
}

function persistedAnalysisState(state, claimedAnalysis, now = new Date()) {
  const iso = now.toISOString();
  const status = sanitizeString(state?.status, 40) || "failed";
  const explicitAttemptCount = Number(state?.attempt_count);
  return {
    ...claimedAnalysis,
    ...state,
    analysis_id: claimedAnalysis.analysis_id,
    source: "recording_transcript",
    attempt_count: Number.isFinite(explicitAttemptCount)
      ? Math.max(0, Math.round(explicitAttemptCount))
      : analysisAttemptCount(claimedAnalysis),
    recording_fingerprint: claimedAnalysis.recording_fingerprint,
    queued_at: claimedAnalysis.queued_at,
    started_at: claimedAnalysis.started_at || iso,
    completed_at: status === "complete" ? state.completed_at || iso : null,
    failed_at: status === "failed" ? state.failed_at || iso : null,
    lease_id: status === "processing" ? claimedAnalysis.lease_id : null,
    lease_expires_at:
      status === "processing" ? new Date(now.getTime() + LEASE_DURATION_MS).toISOString() : null,
    error_code: state.error_code || null,
    retryable: status === "complete" ? false : state.retryable !== false,
    findings: status === "complete" ? state.findings || [] : []
  };
}

function recordingKey(value = {}) {
  const evidenceId = sanitizeString(value.evidence_id || value.evidenceId, 240);
  const recordingIndex = Math.max(1, Math.round(Number(value.recording_index || value.recordingIndex) || 1));
  return `${evidenceId}::${recordingIndex}`;
}

function mergeClipResults(recordings, existing, incoming) {
  const allowed = new Set((Array.isArray(recordings) ? recordings : []).map(recordingKey));
  const byKey = new Map();
  for (const clip of [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])]) {
    const key = recordingKey(clip);
    if (!allowed.has(key)) continue;
    byKey.set(key, clip);
  }
  return (Array.isArray(recordings) ? recordings : []).map((recording) => byKey.get(recordingKey(recording))).filter(Boolean);
}

function transformBatchAnalysisState(state, claimedAnalysis, recordings) {
  const clipResults = mergeClipResults(
    recordings,
    claimedAnalysis.clip_results || claimedAnalysis.clipResults,
    state.clip_results || state.clipResults
  );
  const processedMediaCount = clipResults.filter((clip) => clip.status === "complete").length;
  const allClipsComplete =
    recordings.length > 0 &&
    clipResults.length === recordings.length &&
    clipResults.every((clip) => clip.status === "complete");
  const requestedStatus = sanitizeString(state.status, 40).toLowerCase();
  const status = requestedStatus === "failed"
    ? "failed"
    : requestedStatus === "complete"
      ? allClipsComplete
        ? "complete"
        : "queued"
      : requestedStatus === "queued"
        ? "queued"
        : "processing";
  const attemptCount = status === "queued" || status === "complete"
    ? 0
    : analysisAttemptCount(claimedAnalysis);
  const exhausted = attemptCount >= MAX_ANALYSIS_ATTEMPTS;
  const transcriptEventCount = clipResults.reduce(
    (total, clip) => total + (Array.isArray(clip.speech_segments) ? clip.speech_segments.length : 0),
    0
  );
  return persistedAnalysisState(
    {
      ...state,
      status,
      media_count: recordings.length,
      processed_media_count: processedMediaCount,
      transcript_event_count: transcriptEventCount,
      attempt_count: attemptCount,
      clip_results: clipResults,
      findings: status === "complete" ? state.findings || [] : [],
      completed_at: status === "complete" ? state.completed_at : null,
      failed_at: status === "failed" ? state.failed_at : null,
      error_code:
        status === "queued" || status === "complete"
          ? null
          : state.error_code || (exhausted ? "retry_exhausted" : null),
      retryable: status === "failed" ? !exhausted && state.retryable !== false : status !== "complete"
    },
    claimedAnalysis
  );
}

function persistenceFence(analysis = {}, deliveredAt = null, options = {}) {
  return {
    ...options,
    expectedAnalysisId: sanitizeString(analysis.analysis_id, 160) || null,
    expectedLeaseId: sanitizeString(analysis.lease_id, 160) || null,
    expectedRecordingFingerprint: sanitizeString(analysis.recording_fingerprint, 160) || null,
    expectedDeliveredAt: sanitizeString(deliveredAt, 128) || null
  };
}

function deliveredAtFromResult(result, fallback = null) {
  return (
    sanitizeString(result?.row?.delivered_at, 128) ||
    sanitizeString(result?.session?.updated_at, 128) ||
    sanitizeString(fallback, 128) ||
    null
  );
}

function operationOptions(options = {}) {
  const {
    batchSize,
    batch_size,
    preloadedSession,
    preloadedDeliveredAt,
    pageSize,
    page_size,
    ...safe
  } = options;
  return safe;
}

async function loadCurrentSession(sessionId, options, dependencies) {
  if (options.preloadedSession?.session_id === sessionId) {
    return {
      ok: true,
      status: 200,
      session: options.preloadedSession,
      row: {
        delivered_at:
          sanitizeString(options.preloadedDeliveredAt, 128) ||
          options.preloadedSession.__recordingAnalysisDeliveredAt ||
          null
      }
    };
  }
  const loadSession = dependencies.loadSession || getManualQaSession;
  return loadSession(sessionId, operationOptions(options));
}

async function terminalizeRetryExhausted(sessionId, loaded, options, dependencies) {
  const updateAnalysis = dependencies.updateAnalysis || updateManualQaFindingsAnalysis;
  const analysis = loaded.session?.findings_analysis || {};
  const deliveredAt = deliveredAtFromResult(loaded);
  const terminalState = persistedAnalysisState(
    {
      ...analysis,
      status: "failed",
      attempt_count: Math.max(MAX_ANALYSIS_ATTEMPTS, analysisAttemptCount(analysis)),
      failed_at: analysis.failed_at || new Date().toISOString(),
      error_code: "retry_exhausted",
      retryable: false,
      findings: []
    },
    analysis
  );
  const persisted = await updateAnalysis(
    sessionId,
    terminalState,
    persistenceFence(analysis, deliveredAt, operationOptions(options))
  );
  if (!persisted.ok) return persisted;
  return {
    ok: true,
    status: 200,
    processed: true,
    terminalized: true,
    analysis: persisted.analysis || terminalState,
    session: persisted.session || loaded.session,
    row: persisted.row
  };
}

async function processManualQaRecordingAnalysis(sessionId, options = {}, dependencies = {}) {
  const baseOptions = operationOptions(options);
  const queueAnalysis = dependencies.queueAnalysis || queueManualQaFindingsAnalysis;
  const claimAnalysis = dependencies.claimAnalysis || claimManualQaFindingsAnalysis;
  const updateAnalysis = dependencies.updateAnalysis || updateManualQaFindingsAnalysis;
  const loaded = await loadCurrentSession(sessionId, options, dependencies);
  if (!loaded.ok) return loaded;

  const currentSession = loaded.session || {};
  const currentAnalysis = currentSession.findings_analysis || { status: "not_started", attempt_count: 0 };
  const { fingerprint: currentFingerprint } = recordingStateForSession(currentSession);
  const sameRecording = Boolean(
    currentFingerprint && currentAnalysis.recording_fingerprint === currentFingerprint
  );
  if (!sessionHasSubmittedTrial(currentSession)) {
    return {
      ok: false,
      status: 409,
      processed: false,
      error: "Recording analysis requires a submitted human test with recorded tester consent",
      error_code: "recording_analysis_consent_unavailable"
    };
  }
  if (!hasManualQaRecordingAnalysisConsent(currentSession.qualification_trial || {})) {
    const consentState = await queueAnalysis(
      sessionId,
      persistenceFence(
        currentAnalysis,
        deliveredAtFromResult(loaded),
        { ...baseOptions, force: false, retry: false }
      )
    );
    return consentState.ok
      ? { ...consentState, processed: false }
      : consentState;
  }
  if (sameRecording && currentAnalysis.status === "complete") {
    return { ...loaded, processed: false, analysis: currentAnalysis };
  }
  if (sameRecording && analysisLeaseIsActive(currentAnalysis)) {
    return { ...loaded, ok: true, status: 202, processed: false, analysis: currentAnalysis };
  }
  if (sameRecording && analysisAttemptCount(currentAnalysis) >= MAX_ANALYSIS_ATTEMPTS) {
    return terminalizeRetryExhausted(sessionId, loaded, options, dependencies);
  }
  if (
    sameRecording &&
    currentAnalysis.status === "failed" &&
    currentAnalysis.retryable === false &&
    currentAnalysis.error_code !== "recording_analysis_consent_required"
  ) {
    return { ...loaded, ok: true, status: 200, processed: false, analysis: currentAnalysis };
  }

  const initialFence = persistenceFence(
    currentAnalysis,
    deliveredAtFromResult(loaded),
    { ...baseOptions, force: false, retry: false }
  );
  let queued = await queueAnalysis(sessionId, initialFence);
  if (!queued.ok) return queued;
  if (queued.analysis?.status === "complete" && sameRecording) {
    return { ...queued, processed: false };
  }
  if (queued.analysis?.status === "failed" && queued.analysis.retryable === false) {
    return { ...queued, processed: false };
  }

  const queuedStartsNewRecordingSet = Boolean(
    queued.analysis?.analysis_id !== currentAnalysis.analysis_id ||
      queued.analysis?.recording_fingerprint !== currentAnalysis.recording_fingerprint
  );
  if (queuedStartsNewRecordingSet && analysisAttemptCount(queued.analysis) !== 0) {
    const resetState = persistedAnalysisState(
      {
        ...queued.analysis,
        status: "queued",
        attempt_count: 0,
        started_at: null,
        completed_at: null,
        failed_at: null,
        error_code: null,
        retryable: true,
        findings: []
      },
      queued.analysis
    );
    const reset = await updateAnalysis(
      sessionId,
      resetState,
      persistenceFence(queued.analysis, deliveredAtFromResult(queued), {
        ...baseOptions,
        allowAttemptChange: true
      })
    );
    if (!reset.ok) return reset;
    queued = {
      ...queued,
      analysis: reset.analysis || resetState,
      session: reset.session || queued.session,
      row: reset.row || queued.row
    };
  }

  const claimed = await claimAnalysis(sessionId, {
    ...baseOptions,
    force: false,
    retry: false,
    expectedAnalysisId: queued.analysis?.analysis_id || null,
    expectedLeaseId: queued.analysis?.lease_id || null,
    expectedRecordingFingerprint: queued.analysis?.recording_fingerprint || null,
    expectedDeliveredAt: deliveredAtFromResult(queued)
  });
  if (!claimed.ok) {
    if (claimed.status === 409 && claimed.analysis?.status === "processing") {
      return {
        ok: true,
        status: 202,
        processed: false,
        analysis: claimed.analysis
      };
    }
    if (analysisAttemptCount(claimed.analysis) >= MAX_ANALYSIS_ATTEMPTS) {
      const refreshed = await loadCurrentSession(sessionId, { ...options, preloadedSession: null }, dependencies);
      if (refreshed.ok) return terminalizeRetryExhausted(sessionId, refreshed, options, dependencies);
    }
    return claimed;
  }
  if (!claimed.claimed) {
    return { ...claimed, processed: false };
  }

  const recordings = Array.isArray(claimed.recordings) ? claimed.recordings : [];
  const existingCompleteKeys = new Set(
    (claimed.analysis.clip_results || [])
      .filter((clip) => clip.status === "complete")
      .map(recordingKey)
  );
  const pendingRecordings = recordings.filter((recording) => !existingCompleteKeys.has(recordingKey(recording)));
  const batchSize = Math.max(
    1,
    Math.min(
      MAX_BATCH_SIZE,
      Number(options.batchSize || options.batch_size || process.env.MANUAL_QA_RECORDING_ANALYSIS_BATCH_SIZE || DEFAULT_BATCH_SIZE) ||
        DEFAULT_BATCH_SIZE
    )
  );
  const batch = pendingRecordings.slice(0, batchSize);
  const batchKeys = new Set(batch.map(recordingKey));
  const finalBatch = pendingRecordings.length <= batchSize;
  const includedRecordings = recordings.filter(
    (recording) => existingCompleteKeys.has(recordingKey(recording)) || batchKeys.has(recordingKey(recording))
  );
  const runAnalysis = dependencies.runAnalysis || runManualQaRecordingAnalysis;
  let lastDeliveredAt = deliveredAtFromResult(claimed, deliveredAtFromResult(queued));
  let lastPersistedAnalysis = claimed.analysis;
  let lastPersistedSession = claimed.session || null;
  const persistAnalysis = async (state) => {
    const nextState = transformBatchAnalysisState(state, claimed.analysis, recordings);
    const persisted = await updateAnalysis(
      sessionId,
      nextState,
      persistenceFence(claimed.analysis, lastDeliveredAt, {
        ...baseOptions,
        allowAttemptChange: true
      })
    );
    if (!persisted.ok) {
      const error = new Error(persisted.error || "Failed to save recording analysis progress");
      error.status = persisted.status;
      throw error;
    }
    lastDeliveredAt = deliveredAtFromResult(persisted, lastDeliveredAt);
    lastPersistedAnalysis = persisted.analysis || nextState;
    lastPersistedSession = persisted.session || lastPersistedSession;
  };

  try {
    const analysisResult = await runAnalysis(
      {
        recordings: includedRecordings,
        existingAnalysis: claimed.analysis,
        analysis_id: claimed.analysis.analysis_id
      },
      {
        persistAnalysis,
        apiKey: options.recordingAnalyzerApiKey,
        baseUrl: options.recordingAnalyzerBaseUrl,
        analyzerModel: options.recordingAnalyzerModel,
        aggregatorModel: options.recordingAggregatorModel,
        concurrency: options.recordingAnalyzerConcurrency,
        timeoutMs: options.recordingAnalyzerTimeoutMs,
        aiFetchImpl: options.aiFetchImpl,
        fetchEvidenceObject: dependencies.fetchEvidenceObject,
        analyzeClip: dependencies.analyzeClip,
        aggregateFindings: finalBatch
          ? dependencies.aggregateFindings
          : async () => ({ findings: [] }),
        evidenceStorageOptions: {
          supabaseUrl: options.supabaseUrl,
          serviceKey: options.serviceKey,
          fetchImpl: options.storageFetchImpl || options.fetchImpl
        }
      }
    );
    const resultingAnalysis =
      lastPersistedAnalysis?.status === "failed"
        ? lastPersistedAnalysis
        : analysisResult?.status === "failed"
          ? analysisResult
          : lastPersistedAnalysis;
    if (resultingAnalysis?.status === "failed") {
      return {
        ok: false,
        status: resultingAnalysis.retryable === false ? 422 : 500,
        processed: true,
        batch_size: batch.length,
        error:
          sanitizeString(analysisResult?.error, 600) ||
          "Recording analysis failed",
        error_code:
          sanitizeString(resultingAnalysis.error_code, 160) ||
          "recording_analysis_failed",
        analysis: resultingAnalysis,
        session: lastPersistedSession
      };
    }
    return {
      ok: true,
      status: lastPersistedAnalysis.status === "complete" ? 200 : 202,
      processed: true,
      batch_size: batch.length,
      remaining_media_count: Math.max(
        0,
        Number(lastPersistedAnalysis.media_count || recordings.length) -
          Number(lastPersistedAnalysis.processed_media_count || 0)
      ),
      analysis: lastPersistedAnalysis,
      session: lastPersistedSession
    };
  } catch (error) {
    const exhausted = analysisAttemptCount(claimed.analysis) >= MAX_ANALYSIS_ATTEMPTS;
    const failedState = persistedAnalysisState(
      {
        ...lastPersistedAnalysis,
        status: "failed",
        attempt_count: analysisAttemptCount(claimed.analysis),
        error_code: exhausted ? "retry_exhausted" : "analysis_runtime_failed",
        retryable: !exhausted,
        findings: []
      },
      claimed.analysis
    );
    const failed = await updateAnalysis(
      sessionId,
      failedState,
      persistenceFence(claimed.analysis, lastDeliveredAt, baseOptions)
    );
    return {
      ok: false,
      status: Number(error?.status) || 500,
      error: sanitizeString(error?.message || error, 600) || "Recording analysis failed",
      analysis: failed.ok ? failed.analysis : failedState,
      session: failed.ok ? failed.session : lastPersistedSession
    };
  }
}

function minimalCronResponse(candidate, result) {
  const analysis = result?.analysis || {};
  return {
    ok: result?.ok === true,
    processed: result?.processed === true,
    terminalized: result?.terminalized === true,
    session_id: sanitizeString(candidate?.session_id, 128) || null,
    analysis_status: sanitizeString(analysis.status, 40) || null,
    processed_media_count: Math.max(0, Number(analysis.processed_media_count || 0) || 0),
    media_count: Math.max(0, Number(analysis.media_count || 0) || 0),
    error_code: result?.ok === true
      ? null
      : sanitizeString(analysis.error_code, 160) || "recording_analysis_failed"
  };
}

function createHandler(dependencies = {}) {
  return async function handler(req, res) {
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    if (req.method === "GET") {
      if (!isCronAuthorized(req, dependencies)) {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }
      const found = await findNextActionableSession({}, dependencies);
      if (!found.ok) {
        return res.status(found.status || 500).json({ ok: false, error: found.error });
      }
      const candidate = found.candidate;
      if (!candidate) {
        return res.status(200).json({
          ok: true,
          processed: false,
          scanned: found.scanned,
          message: "No recording analysis is waiting"
        });
      }
      const processAnalysis = dependencies.processAnalysis || processManualQaRecordingAnalysis;
      const result = await processAnalysis(
        candidate.session_id,
        {
          authOk: true,
          adminOk: true,
          preloadedSession: candidate,
          preloadedDeliveredAt: candidate.__recordingAnalysisDeliveredAt || null
        },
        dependencies.processDependencies || {}
      );
      return res
        .status(result.status || (result.ok ? 200 : 500))
        .json(minimalCronResponse(candidate, result));
    }

    const auth = await requireDashboardOrServiceAuth(req, res);
    if (!auth.ok) {
      return res.status(auth.status || 401).json({ ok: false, error: auth.error || "Authentication required" });
    }
    const owner = resolveOwner(auth, req);
    if (auth.is_service_token && (!owner.ownerUserId || !owner.ownerEmail)) {
      return res.status(400).json({
        ok: false,
        error: "owner_user_id and owner_email are required when using service token auth"
      });
    }
    let body = {};
    try {
      body = await parseRequestBody(req);
    } catch {
      body = {};
    }
    const sessionId = sanitizeString(
      req.query?.session_id || req.query?.sessionId || body?.session_id || body?.sessionId,
      128
    );
    if (!sessionId) {
      return res.status(400).json({ ok: false, error: "session_id is required" });
    }
    const reportAdmin = auth.user?.report_admin === true;
    const result = await processManualQaRecordingAnalysis(sessionId, {
      authOk: true,
      adminOk: reportAdmin,
      ownerUserId: reportAdmin ? "" : owner.ownerUserId,
      ownerEmail: owner.ownerEmail,
      request: req,
      retry: body?.retry === true || body?.force === true
    });
    return res.status(result.status || (result.ok ? 200 : 500)).json({
      ok: result.ok,
      processed: result.processed === true,
      analysis: result.analysis,
      session: result.session,
      error: result.ok ? undefined : result.error
    });
  };
}

const handler = createHandler();

module.exports = handler;
module.exports.config = { maxDuration: 300 };
module.exports.__private = {
  analysisIsEligible,
  analysisNeedsTerminalization,
  createHandler,
  findNextActionableSession,
  isCronAuthorized,
  listManualQaSessionPage,
  mergeClipResults,
  minimalCronResponse,
  persistedAnalysisState,
  persistenceFence,
  processManualQaRecordingAnalysis,
  recordingKey,
  resolveOwner,
  timingSafeStringEqual,
  transformBatchAnalysisState
};
