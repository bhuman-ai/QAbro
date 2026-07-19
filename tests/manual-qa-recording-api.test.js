const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildManualQaRecordingFingerprint,
  collectManualQaRecordingMedia,
  normalizeManualQaSessionRow
} = require("../lib/manual-qa");
const {
  analysisIsEligible,
  analysisNeedsTerminalization,
  createHandler,
  findNextActionableSession,
  isCronAuthorized,
  persistedAnalysisState,
  processManualQaRecordingAnalysis,
  transformBatchAnalysisState
} = require("../api/manual-qa/analyze-recording").__private;

function submittedSession({
  analysis,
  recordingCount = 1,
  sessionId = "manual-recording-api"
} = {}) {
  const session = {
    session_id: sessionId,
    qualification_trial: {
      status: "submitted",
      submitted_at: "2026-07-19T00:00:00.000Z",
      tester: {
        recording_analysis_consent_version: 1,
        recording_analysis_consent_at: "2026-07-19T00:00:00.000Z"
      }
    },
    checklist: [
      {
        id: "freestyle",
        evidence_media: Array.from({ length: recordingCount }, (_unused, index) => ({
          evidence_id: `video-${index + 1}`,
          kind: "video",
          label: `Recording part ${index + 1}`,
          content_type: "video/webm",
          storage_bucket: "qa-evidence",
          storage_path: `${sessionId}/manual-widget-video/part-${index + 1}.webm`
        }))
      }
    ]
  };
  if (analysis !== undefined) session.findings_analysis = { ...analysis };
  return session;
}

function currentSession(analysis = {}, options = {}) {
  const session = submittedSession({ ...options, analysis });
  if (!Object.prototype.hasOwnProperty.call(analysis, "recording_fingerprint")) {
    session.findings_analysis.recording_fingerprint = buildManualQaRecordingFingerprint(
      collectManualQaRecordingMedia(session)
    );
  }
  return session;
}

function completeClip(recording, overrides = {}) {
  return {
    evidence_id: recording.evidence_id,
    item_id: recording.item_id,
    recording_index: recording.recording_index,
    status: "complete",
    duration_ms: 2000,
    speech_segments: [
      {
        start_ms: 100,
        end_ms: 500,
        text: `Transcript for recording ${recording.recording_index}`,
        confidence: 0.95
      }
    ],
    visual_events: [],
    summary: `Recording ${recording.recording_index} completed`,
    confidence: 0.95,
    error_code: null,
    retryable: false,
    ...overrides
  };
}

function responseCapture() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    }
  };
}

test("cron auth accepts only the exact configured bearer value and rejects spoof headers", async () => {
  const authOptions = { cronSecret: "correct-secret" };
  assert.equal(isCronAuthorized({ headers: {} }, authOptions), false);
  assert.equal(
    isCronAuthorized({ headers: { "x-vercel-cron": "1" } }, authOptions),
    false
  );
  assert.equal(
    isCronAuthorized({ headers: { authorization: "Bearer wrong-secret" } }, authOptions),
    false
  );
  assert.equal(
    isCronAuthorized({ headers: { authorization: "bearer correct-secret" } }, authOptions),
    false
  );
  assert.equal(
    isCronAuthorized({ headers: { authorization: "Bearer correct-secret " } }, authOptions),
    false
  );
  assert.equal(
    isCronAuthorized({ headers: { authorization: "Bearer correct-secret" } }, authOptions),
    true
  );

  const handler = createHandler({
    ...authOptions,
    listSessionsPage: async () => {
      throw new Error("spoofed cron request must not reach session selection");
    }
  });
  const response = responseCapture();
  await handler({ method: "GET", headers: { "x-vercel-cron": "1" } }, response);
  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { ok: false, error: "Unauthorized" });
});

test("authenticated cron responses expose metadata only, never analysis or transcript payloads", async () => {
  const candidate = currentSession(
    { status: "queued", analysis_id: "analysis-private", attempt_count: 0, retryable: true },
    { sessionId: "cron-private-session" }
  );
  candidate.report = { private_notes: "PRIVATE REPORT CONTENT" };
  const handler = createHandler({
    cronSecret: "correct-secret",
    listSessionsPage: async () => ({
      ok: true,
      items: [candidate],
      has_more: false
    }),
    processAnalysis: async () => ({
      ok: true,
      status: 200,
      processed: true,
      analysis: {
        status: "complete",
        media_count: 1,
        processed_media_count: 1,
        clip_results: [
          {
            speech_segments: [{ text: "SECRET TRANSCRIPT CONTENT" }]
          }
        ],
        findings: [{ title: "PRIVATE FINDING" }]
      },
      session: candidate
    })
  });
  const response = responseCapture();
  await handler(
    { method: "GET", headers: { authorization: "Bearer correct-secret" } },
    response
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(Object.keys(response.body).sort(), [
    "analysis_status",
    "error_code",
    "media_count",
    "ok",
    "processed",
    "processed_media_count",
    "session_id",
    "terminalized"
  ]);
  const serialized = JSON.stringify(response.body);
  assert.equal(serialized.includes("SECRET TRANSCRIPT CONTENT"), false);
  assert.equal(serialized.includes("PRIVATE FINDING"), false);
  assert.equal(serialized.includes("PRIVATE REPORT CONTENT"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(response.body, "analysis"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(response.body, "session"), false);
});

test("cron selection paginates past ineligible sessions without starving later work", async () => {
  const first = currentSession(
    { status: "complete", analysis_id: "analysis-1", attempt_count: 0 },
    { sessionId: "already-complete-1" }
  );
  const second = currentSession(
    { status: "complete", analysis_id: "analysis-2", attempt_count: 0 },
    { sessionId: "already-complete-2" }
  );
  const waiting = currentSession(
    { status: "queued", analysis_id: "analysis-3", attempt_count: 0, retryable: true },
    { sessionId: "waiting-on-page-two" }
  );
  const calls = [];
  const result = await findNextActionableSession(
    { pageSize: 2 },
    {
      listSessionsPage: async ({ limit, offset }) => {
        calls.push({ limit, offset });
        if (offset === 0) {
          return {
            ok: true,
            items: [first, second],
            has_more: true,
            next_offset: 2
          };
        }
        return {
          ok: true,
          items: [waiting],
          has_more: false,
          next_offset: 3
        };
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.candidate.session_id, "waiting-on-page-two");
  assert.equal(result.scanned, 3);
  assert.deepEqual(calls, [
    { limit: 2, offset: 0 },
    { limit: 2, offset: 2 }
  ]);
});

test("recording analysis eligibility respects fingerprints, retries, and leases", () => {
  assert.equal(analysisIsEligible(currentSession({ status: "not_started" })), true);
  assert.equal(analysisIsEligible(currentSession({ status: "queued", retryable: true })), true);
  assert.equal(analysisIsEligible(currentSession({ status: "complete" })), false);
  assert.equal(
    analysisIsEligible(currentSession({ status: "complete", recording_fingerprint: "stale" })),
    true
  );
  assert.equal(
    analysisIsEligible(currentSession({ status: "failed", retryable: true, attempt_count: 2 })),
    true
  );
  assert.equal(
    analysisIsEligible(currentSession({ status: "failed", retryable: true, attempt_count: 3 })),
    false
  );
  assert.equal(
    analysisIsEligible(
      currentSession({
        status: "processing",
        attempt_count: 2,
        lease_expires_at: "2020-01-01T00:00:00.000Z"
      })
    ),
    true
  );
  assert.equal(
    analysisIsEligible(
      currentSession({
        status: "processing",
        attempt_count: 2,
        lease_expires_at: "2999-01-01T00:00:00.000Z"
      })
    ),
    false
  );

  const noConsent = currentSession({ status: "queued", retryable: true });
  delete noConsent.qualification_trial.tester.recording_analysis_consent_version;
  delete noConsent.qualification_trial.tester.recording_analysis_consent_at;
  assert.equal(analysisIsEligible(noConsent), true);

  const legacyConsentError = currentSession({
      status: "failed",
      retryable: false,
      attempt_count: 0,
      error_code: "recording_analysis_consent_required"
  });
  const normalizedLegacy = normalizeManualQaSessionRow({
    run_id: legacyConsentError.session_id,
    source: "manual_qa",
    payload: { manual_qa: legacyConsentError }
  });
  assert.equal(normalizedLegacy.findings_analysis.status, "not_started");
  assert.equal(analysisIsEligible(normalizedLegacy), true);

  assert.equal(
    analysisNeedsTerminalization(
      currentSession({ status: "failed", retryable: true, attempt_count: 3 })
    ),
    true
  );
  assert.equal(
    analysisNeedsTerminalization(
      currentSession({ status: "failed", retryable: false, attempt_count: 3 })
    ),
    false
  );
  assert.equal(
    analysisNeedsTerminalization(
      currentSession({
        status: "processing",
        retryable: true,
        attempt_count: 3,
        lease_expires_at: "2999-01-01T00:00:00.000Z"
      })
    ),
    false
  );
});

test("owner processing blocks non-trials but accepts submitted legacy recordings", async () => {
  const nonTrial = currentSession({ status: "not_started", retryable: true });
  delete nonTrial.qualification_trial;
  let nonTrialQueueCalls = 0;
  const blocked = await processManualQaRecordingAnalysis("non-trial", {}, {
    loadSession: async () => ({ ok: true, status: 200, session: nonTrial, row: { delivered_at: "d0" } }),
    queueAnalysis: async () => {
      nonTrialQueueCalls += 1;
      throw new Error("non-trial recording must not queue");
    }
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, 409);
  assert.equal(blocked.error_code, "recording_analysis_unavailable");
  assert.equal(nonTrialQueueCalls, 0);

  const missingConsent = currentSession({ status: "not_started", retryable: true });
  delete missingConsent.qualification_trial.tester.recording_analysis_consent_version;
  delete missingConsent.qualification_trial.tester.recording_analysis_consent_at;
  let queueCalls = 0;
  let claimCalls = 0;
  const queuedAnalysis = {
    ...missingConsent.findings_analysis,
    analysis_id: "legacy-analysis",
    status: "queued",
    retryable: true
  };
  const queuedSession = { ...missingConsent, findings_analysis: queuedAnalysis };
  const processed = await processManualQaRecordingAnalysis("missing-consent", {}, {
    loadSession: async () => ({
      ok: true,
      status: 200,
      session: missingConsent,
      row: { delivered_at: "d1" }
    }),
    queueAnalysis: async () => {
      queueCalls += 1;
      return {
        ok: true,
        status: 200,
        analysis: queuedAnalysis,
        session: queuedSession,
        row: { delivered_at: "d2" }
      };
    },
    claimAnalysis: async () => {
      claimCalls += 1;
      return {
        ok: true,
        status: 202,
        claimed: false,
        analysis: queuedAnalysis,
        session: queuedSession,
        recordings: collectManualQaRecordingMedia(queuedSession),
        row: { delivered_at: "d2" }
      };
    }
  });
  assert.equal(processed.ok, true);
  assert.equal(processed.processed, false);
  assert.equal(queueCalls, 1);
  assert.equal(claimCalls, 1);

  const recovered = currentSession({
    status: "failed",
    retryable: false,
    attempt_count: 0,
    error_code: "recording_analysis_consent_required"
  });
  let recoveredQueueCalls = 0;
  const retried = await processManualQaRecordingAnalysis("legacy-consent-error", {}, {
    loadSession: async () => ({ ok: true, status: 200, session: recovered, row: { delivered_at: "d3" } }),
    queueAnalysis: async () => {
      recoveredQueueCalls += 1;
      return { ok: false, status: 503, error: "simulated queue outage" };
    }
  });
  assert.equal(retried.ok, false);
  assert.equal(retried.status, 503);
  assert.equal(recoveredQueueCalls, 1);
});

test("persisted recording state keeps claim identity and terminal timestamps", () => {
  const claimed = {
    analysis_id: "analysis-1",
    status: "processing",
    attempt_count: 2,
    recording_fingerprint: "fingerprint-1",
    queued_at: "2026-07-19T00:00:00.000Z",
    started_at: "2026-07-19T00:01:00.000Z",
    lease_id: "lease-1"
  };
  const complete = persistedAnalysisState(
    {
      status: "complete",
      media_count: 1,
      processed_media_count: 1,
      findings: [{ title: "Recorded finding" }]
    },
    claimed,
    new Date("2026-07-19T00:02:00.000Z")
  );
  assert.equal(complete.analysis_id, "analysis-1");
  assert.equal(complete.attempt_count, 2);
  assert.equal(complete.recording_fingerprint, "fingerprint-1");
  assert.equal(complete.completed_at, "2026-07-19T00:02:00.000Z");
  assert.equal(complete.failed_at, null);
  assert.equal(complete.lease_id, null);
  assert.equal(complete.retryable, false);
});

test("batch transforms preserve completed clips and aggregate only after the full set", () => {
  const session = currentSession(
    { status: "processing" },
    { recordingCount: 3, sessionId: "batch-transform" }
  );
  const recordings = collectManualQaRecordingMedia(session);
  const claimed = {
    analysis_id: "analysis-batch",
    status: "processing",
    attempt_count: 1,
    recording_fingerprint: session.findings_analysis.recording_fingerprint,
    queued_at: "2026-07-19T00:00:00.000Z",
    started_at: "2026-07-19T00:01:00.000Z",
    lease_id: "lease-batch",
    clip_results: [completeClip(recordings[0])]
  };
  const partial = transformBatchAnalysisState(
    {
      status: "complete",
      clip_results: [completeClip(recordings[1])],
      findings: [{ title: "must wait for the last clip" }]
    },
    claimed,
    recordings
  );
  assert.equal(partial.status, "queued");
  assert.equal(partial.attempt_count, 0);
  assert.equal(partial.processed_media_count, 2);
  assert.equal(partial.clip_results.length, 2);
  assert.deepEqual(partial.findings, []);

  const explicitlyQueued = transformBatchAnalysisState(
    {
      status: "queued",
      clip_results: [completeClip(recordings[1])],
      findings: []
    },
    claimed,
    recordings
  );
  assert.equal(explicitlyQueued.status, "queued");
  assert.equal(explicitlyQueued.attempt_count, 0);
  assert.equal(explicitlyQueued.lease_id, null);

  const complete = transformBatchAnalysisState(
    {
      status: "complete",
      clip_results: [completeClip(recordings[1]), completeClip(recordings[2])],
      findings: [{ title: "all clips are now represented" }]
    },
    claimed,
    recordings
  );
  assert.equal(complete.status, "complete");
  assert.equal(complete.attempt_count, 0);
  assert.equal(complete.processed_media_count, 3);
  assert.equal(complete.clip_results.length, 3);
  assert.equal(complete.findings[0].title, "all clips are now represented");

  const failed = transformBatchAnalysisState(
    {
      status: "failed",
      clip_results: [
        {
          ...completeClip(recordings[1]),
          status: "failed",
          speech_segments: [],
          error_code: "clip_analysis_failed",
          retryable: true
        }
      ],
      error_code: "clip_analysis_failed",
      retryable: true
    },
    claimed,
    recordings
  );
  assert.equal(failed.status, "failed");
  assert.equal(failed.processed_media_count, 1);
  assert.equal(failed.clip_results.length, 2);
  assert.equal(failed.clip_results[0].status, "complete");
});

test("partial batches are bounded, durable, retry-neutral, and fully lease fenced", async () => {
  const initialSession = currentSession(
    { status: "not_started", analysis_id: null, attempt_count: 0, retryable: true },
    { recordingCount: 3, sessionId: "durable-batch" }
  );
  const recordings = collectManualQaRecordingMedia(initialSession);
  const fingerprint = initialSession.findings_analysis.recording_fingerprint;
  const queuedAnalysis = {
    ...initialSession.findings_analysis,
    analysis_id: "analysis-durable",
    status: "queued",
    media_count: 3,
    processed_media_count: 0,
    attempt_count: 0,
    lease_id: null,
    clip_results: []
  };
  const claimedAnalysis = {
    ...queuedAnalysis,
    status: "processing",
    attempt_count: 1,
    lease_id: "lease-durable",
    lease_expires_at: "2999-01-01T00:00:00.000Z"
  };
  let queueOptions;
  let claimOptions;
  const writes = [];
  const deliveredAts = ["delivered-3", "delivered-4"];

  const result = await processManualQaRecordingAnalysis(
    "durable-batch",
    { batchSize: 2 },
    {
      loadSession: async () => ({
        ok: true,
        status: 200,
        session: initialSession,
        row: { delivered_at: "delivered-0" }
      }),
      queueAnalysis: async (_sessionId, options) => {
        queueOptions = options;
        return {
          ok: true,
          status: 200,
          analysis: queuedAnalysis,
          session: currentSession(queuedAnalysis, {
            recordingCount: 3,
            sessionId: "durable-batch"
          }),
          row: { delivered_at: "delivered-1" }
        };
      },
      claimAnalysis: async (_sessionId, options) => {
        claimOptions = options;
        return {
          ok: true,
          status: 200,
          claimed: true,
          analysis: claimedAnalysis,
          recordings,
          session: currentSession(claimedAnalysis, {
            recordingCount: 3,
            sessionId: "durable-batch"
          }),
          row: { delivered_at: "delivered-2" }
        };
      },
      updateAnalysis: async (_sessionId, analysis, options) => {
        writes.push({ analysis, options });
        const deliveredAt = deliveredAts[writes.length - 1];
        return {
          ok: true,
          analysis,
          session: currentSession(analysis, {
            recordingCount: 3,
            sessionId: "durable-batch"
          }),
          row: { delivered_at: deliveredAt }
        };
      },
      runAnalysis: async (input, options) => {
        assert.deepEqual(
          input.recordings.map((recording) => recording.evidence_id),
          ["video-1", "video-2"]
        );
        assert.deepEqual(await options.aggregateFindings({}), { findings: [] });
        assert.equal(options.verifyFindings, null);
        const batchClips = [completeClip(recordings[0]), completeClip(recordings[1])];
        const aiUsage = {
          provider: "openrouter",
          currency: "USD",
          tracking_available: true,
          cost_complete: true,
          total_cost_usd: 0.02,
          request_count: 2,
          priced_request_count: 2,
          unpriced_response_count: 0,
          uncertain_request_count: 0,
          prompt_tokens: 120,
          completion_tokens: 40,
          total_tokens: 160
        };
        await options.persistAnalysis({
          status: "processing",
          clip_results: batchClips,
          findings: [],
          ai_usage: aiUsage
        });
        await options.persistAnalysis({
          status: "complete",
          clip_results: batchClips,
          findings: [{ title: "must not publish before clip three" }],
          ai_usage: aiUsage
        });
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, 202);
  assert.equal(result.analysis.status, "queued");
  assert.equal(result.analysis.attempt_count, 0);
  assert.equal(result.analysis.processed_media_count, 2);
  assert.deepEqual(result.analysis.findings, []);
  assert.equal(result.analysis.ai_usage.total_cost_usd, 0.02);
  assert.equal(result.analysis.ai_usage.request_count, 2);
  assert.equal(result.batch_size, 2);
  assert.equal(result.remaining_media_count, 1);

  assert.equal(queueOptions.force, false);
  assert.equal(queueOptions.retry, false);
  assert.equal(queueOptions.expectedAnalysisId, null);
  assert.equal(queueOptions.expectedLeaseId, null);
  assert.equal(queueOptions.expectedRecordingFingerprint, fingerprint);
  assert.equal(queueOptions.expectedDeliveredAt, "delivered-0");
  assert.equal(claimOptions.expectedAnalysisId, "analysis-durable");
  assert.equal(claimOptions.expectedLeaseId, null);
  assert.equal(claimOptions.expectedRecordingFingerprint, fingerprint);
  assert.equal(claimOptions.expectedDeliveredAt, "delivered-1");

  assert.equal(writes.length, 2);
  assert.equal(writes[0].options.expectedDeliveredAt, "delivered-2");
  assert.equal(writes[1].options.expectedDeliveredAt, "delivered-3");
  for (const write of writes) {
    assert.equal(write.options.expectedAnalysisId, "analysis-durable");
    assert.equal(write.options.expectedLeaseId, "lease-durable");
    assert.equal(write.options.expectedRecordingFingerprint, fingerprint);
    assert.equal(write.options.allowAttemptChange, true);
  }
});

test("a failed progress write keeps newly incurred AI cost in the fallback state", async () => {
  const initialSession = currentSession(
    { status: "not_started", analysis_id: null, attempt_count: 0, retryable: true },
    { sessionId: "persisted-cost-fallback" }
  );
  const recordings = collectManualQaRecordingMedia(initialSession);
  const queuedAnalysis = {
    ...initialSession.findings_analysis,
    analysis_id: "analysis-cost-fallback",
    status: "queued",
    media_count: 1,
    attempt_count: 0,
    clip_results: []
  };
  const claimedAnalysis = {
    ...queuedAnalysis,
    status: "processing",
    attempt_count: 1,
    lease_id: "lease-cost-fallback"
  };
  const writes = [];

  const result = await processManualQaRecordingAnalysis(
    "persisted-cost-fallback",
    {},
    {
      loadSession: async () => ({
        ok: true,
        status: 200,
        session: initialSession,
        row: { delivered_at: "delivered-0" }
      }),
      queueAnalysis: async () => ({
        ok: true,
        status: 200,
        analysis: queuedAnalysis,
        session: currentSession(queuedAnalysis, { sessionId: "persisted-cost-fallback" }),
        row: { delivered_at: "delivered-1" }
      }),
      claimAnalysis: async () => ({
        ok: true,
        status: 200,
        claimed: true,
        analysis: claimedAnalysis,
        recordings,
        session: currentSession(claimedAnalysis, { sessionId: "persisted-cost-fallback" }),
        row: { delivered_at: "delivered-2" }
      }),
      updateAnalysis: async (_sessionId, analysis) => {
        writes.push(analysis);
        if (writes.length === 1) {
          return { ok: false, status: 503, error: "Temporary persistence failure" };
        }
        return {
          ok: true,
          status: 200,
          analysis,
          session: currentSession(analysis, { sessionId: "persisted-cost-fallback" }),
          row: { delivered_at: "delivered-3" }
        };
      },
      runAnalysis: async (_input, options) => {
        await options.persistAnalysis({
          status: "processing",
          clip_results: [completeClip(recordings[0])],
          findings: [],
          ai_usage: {
            provider: "openrouter",
            currency: "USD",
            tracking_available: true,
            cost_complete: true,
            total_cost_usd: 0.03,
            request_count: 1,
            priced_request_count: 1,
            unpriced_response_count: 0,
            uncertain_request_count: 0,
            prompt_tokens: 80,
            completion_tokens: 20,
            total_tokens: 100
          }
        });
      }
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.equal(writes.length, 2);
  assert.equal(writes[1].status, "failed");
  assert.equal(writes[1].ai_usage.total_cost_usd, 0.03);
  assert.equal(writes[1].ai_usage.request_count, 1);
  assert.equal(result.analysis.ai_usage.total_cost_usd, 0.03);
});

test("a persisted analyzer failure is returned as a failed job instead of HTTP success", async () => {
  const initialSession = currentSession(
    { status: "not_started", analysis_id: null, attempt_count: 0, retryable: true },
    { sessionId: "persisted-analyzer-failure" }
  );
  const recordings = collectManualQaRecordingMedia(initialSession);
  const queuedAnalysis = {
    ...initialSession.findings_analysis,
    analysis_id: "analysis-failed",
    status: "queued",
    media_count: 1,
    attempt_count: 0,
    clip_results: []
  };
  const claimedAnalysis = {
    ...queuedAnalysis,
    status: "processing",
    attempt_count: 1,
    lease_id: "lease-failed"
  };
  let deliveredIndex = 2;

  const result = await processManualQaRecordingAnalysis(
    "persisted-analyzer-failure",
    {},
    {
      loadSession: async () => ({
        ok: true,
        status: 200,
        session: initialSession,
        row: { delivered_at: "delivered-0" }
      }),
      queueAnalysis: async () => ({
        ok: true,
        status: 200,
        analysis: queuedAnalysis,
        session: currentSession(queuedAnalysis, { sessionId: "persisted-analyzer-failure" }),
        row: { delivered_at: "delivered-1" }
      }),
      claimAnalysis: async () => ({
        ok: true,
        status: 200,
        claimed: true,
        analysis: claimedAnalysis,
        recordings,
        session: currentSession(claimedAnalysis, { sessionId: "persisted-analyzer-failure" }),
        row: { delivered_at: "delivered-2" }
      }),
      updateAnalysis: async (_sessionId, analysis) => ({
        ok: true,
        analysis,
        session: currentSession(analysis, { sessionId: "persisted-analyzer-failure" }),
        row: { delivered_at: `delivered-${++deliveredIndex}` }
      }),
      runAnalysis: async (_input, options) => {
        const failed = {
          ...claimedAnalysis,
          status: "failed",
          processed_media_count: 0,
          error_code: "clip_analysis_failed",
          retryable: true,
          clip_results: [{
            ...completeClip(recordings[0]),
            status: "failed",
            speech_segments: [],
            error_code: "clip_analysis_failed",
            retryable: true
          }],
          findings: [],
          error: "The recording clip could not be analyzed"
        };
        await options.persistAnalysis(failed);
        return failed;
      }
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 500);
  assert.equal(result.processed, true);
  assert.equal(result.error_code, "clip_analysis_failed");
  assert.equal(result.analysis.status, "failed");
  assert.match(result.error, /could not be analyzed/i);
});

test("retry-exhausted jobs become nonretryable without being queued or claimed again", async () => {
  const exhaustedSession = currentSession(
    {
      status: "failed",
      analysis_id: "analysis-exhausted",
      attempt_count: 3,
      retryable: true,
      lease_id: null,
      error_code: "analysis_runtime_failed"
    },
    { sessionId: "exhausted-session" }
  );
  const fingerprint = exhaustedSession.findings_analysis.recording_fingerprint;
  let queueCalls = 0;
  let claimCalls = 0;
  let terminalWrite;
  const result = await processManualQaRecordingAnalysis("exhausted-session", {}, {
    loadSession: async () => ({
      ok: true,
      status: 200,
      session: exhaustedSession,
      row: { delivered_at: "delivered-exhausted" }
    }),
    queueAnalysis: async () => {
      queueCalls += 1;
      throw new Error("exhausted work must not be requeued");
    },
    claimAnalysis: async () => {
      claimCalls += 1;
      throw new Error("exhausted work must not be reclaimed");
    },
    updateAnalysis: async (_sessionId, analysis, options) => {
      terminalWrite = { analysis, options };
      return {
        ok: true,
        analysis,
        session: currentSession(analysis, { sessionId: "exhausted-session" }),
        row: { delivered_at: "delivered-terminal" }
      };
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.terminalized, true);
  assert.equal(queueCalls, 0);
  assert.equal(claimCalls, 0);
  assert.equal(terminalWrite.analysis.status, "failed");
  assert.equal(terminalWrite.analysis.attempt_count, 3);
  assert.equal(terminalWrite.analysis.retryable, false);
  assert.equal(terminalWrite.analysis.error_code, "retry_exhausted");
  assert.equal(terminalWrite.options.expectedAnalysisId, "analysis-exhausted");
  assert.equal(terminalWrite.options.expectedLeaseId, null);
  assert.equal(terminalWrite.options.expectedRecordingFingerprint, fingerprint);
  assert.equal(terminalWrite.options.expectedDeliveredAt, "delivered-exhausted");
});

test("an active recording-analysis lease is accepted without queueing duplicate work", async () => {
  const processingSession = currentSession({
    status: "processing",
    analysis_id: "analysis-active",
    attempt_count: 1,
    retryable: true,
    lease_id: "lease-active",
    lease_expires_at: "2999-01-01T00:00:00.000Z"
  });
  let queueCalls = 0;
  const result = await processManualQaRecordingAnalysis("manual-recording-api", {}, {
    loadSession: async () => ({
      ok: true,
      status: 200,
      session: processingSession,
      row: { delivered_at: "delivered-active" }
    }),
    queueAnalysis: async () => {
      queueCalls += 1;
      throw new Error("an active lease must not be queued again");
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 202);
  assert.equal(result.processed, false);
  assert.equal(result.analysis.analysis_id, "analysis-active");
  assert.equal(queueCalls, 0);
});

test("recording analysis cron runs every minute within the five-minute function budget", () => {
  const vercelConfig = require("../vercel.json");
  const cron = vercelConfig.crons.find(
    (entry) => entry.path === "/api/manual-qa/analyze-recording"
  );
  assert.equal(cron.schedule, "* * * * *");
  assert.equal(
    vercelConfig.functions["api/manual-qa/analyze-recording.js"].maxDuration,
    300
  );
});
