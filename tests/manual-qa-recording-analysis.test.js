const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  DEFAULT_RECORDING_AGGREGATOR_MODEL,
  DEFAULT_RECORDING_ANALYZER_BASE_URL,
  DEFAULT_RECORDING_ANALYZER_MAX_CLIP_BYTES,
  DEFAULT_RECORDING_ANALYZER_MAX_NEW_CLIPS,
  DEFAULT_RECORDING_ANALYZER_MODEL,
  MAX_RECORDINGS,
  buildRecordingAggregationInput,
  buildRecordingTranscriptEvents,
  normalizeClipAnalysisResult,
  normalizeRecordingFindings,
  normalizeRecordingList,
  resolveManualQaRecordingAnalyzerConfig,
  runManualQaRecordingAnalysis,
  __private
} = require("../lib/manual-qa-recording-analysis");
const { MAX_QA_TRIAL_DURATION_MINUTES } = require("../lib/qa-trials");

function webmBuffer(durationMs = 10000) {
  const duration = Buffer.alloc(4);
  duration.writeFloatBE(durationMs, 0);
  const infoPayload = Buffer.concat([
    Buffer.from([0x2a, 0xd7, 0xb1, 0x83, 0x0f, 0x42, 0x40]),
    Buffer.from([0x44, 0x89, 0x84]),
    duration
  ]);
  return Buffer.concat([
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x82, 0x84]),
    Buffer.from("webm", "ascii"),
    Buffer.from([0x15, 0x49, 0xa9, 0x66, 0x8e]),
    infoPayload
  ]);
}

function webmClusterBuffer(relativeTimecodeMs = 1000) {
  const block = Buffer.alloc(6);
  block[0] = 0xa3;
  block[1] = 0x84;
  block[2] = 0x81;
  block.writeInt16BE(relativeTimecodeMs, 3);
  block[5] = 0;
  return Buffer.concat([
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x82, 0x84]),
    Buffer.from("webm", "ascii"),
    Buffer.from([0x15, 0x49, 0xa9, 0x66, 0x87, 0x2a, 0xd7, 0xb1, 0x83, 0x0f, 0x42, 0x40]),
    Buffer.from([0x1f, 0x43, 0xb6, 0x75, 0xff, 0xe7, 0x81, 0x00]),
    block
  ]);
}

function mp4Buffer(durationMs = 10000, majorBrand = "isom") {
  const ftyp = Buffer.alloc(24);
  ftyp.writeUInt32BE(24, 0);
  ftyp.write("ftyp", 4, "ascii");
  ftyp.write(majorBrand.padEnd(4, " ").slice(0, 4), 8, "ascii");
  ftyp.writeUInt32BE(0, 12);
  ftyp.write("isom", 16, "ascii");
  ftyp.write("mp42", 20, "ascii");

  const mvhd = Buffer.alloc(28);
  mvhd.writeUInt32BE(28, 0);
  mvhd.write("mvhd", 4, "ascii");
  mvhd.writeUInt32BE(0, 8);
  mvhd.writeUInt32BE(0, 12);
  mvhd.writeUInt32BE(0, 16);
  mvhd.writeUInt32BE(1000, 20);
  mvhd.writeUInt32BE(durationMs, 24);
  const moovHeader = Buffer.alloc(8);
  moovHeader.writeUInt32BE(mvhd.length + moovHeader.length, 0);
  moovHeader.write("moov", 4, "ascii");
  return Buffer.concat([ftyp, moovHeader, mvhd]);
}

function recording(part, overrides = {}) {
  return {
    item_id: "qualification-review",
    evidence_id: `evidence-${part}`,
    kind: "video",
    label: `Trial recording segment ${part}`,
    content_type: "video/webm;codecs=vp8,opus",
    storage_bucket: "qa-evidence",
    storage_path: `session/video/trial-recording-segment-${part}.webm`,
    duration_ms: 10000,
    ...overrides
  };
}

function completedClip(part, overrides = {}) {
  return {
    item_id: "qualification-review",
    evidence_id: `evidence-${part}`,
    recording_index: part,
    status: "complete",
    duration_ms: 10000,
    speech_segments: [{ start_ms: 100, end_ms: 800, text: `Spoken words in part ${part}` }],
    visual_events: [{ start_ms: 200, end_ms: 900, description: `Visible event in part ${part}` }],
    summary: `Literal evidence from recording part ${part}`,
    confidence: 0.9,
    error: null,
    ...overrides
  };
}

function storedWebm(durationMs = 10000) {
  return { contentType: "video/webm", data: webmBuffer(durationMs) };
}

test("recording analyzer config uses the required provider fallbacks and hard caps", () => {
  const keys = [
    "MANUAL_QA_RECORDING_ANALYZER_API_KEY",
    "MANUAL_QA_TOPIC_SEGMENTER_API_KEY",
    "OPENROUTER_API_KEY",
    "MANUAL_QA_RECORDING_ANALYZER_BASE_URL",
    "MANUAL_QA_TOPIC_SEGMENTER_BASE_URL",
    "MANUAL_QA_RECORDING_ANALYZER_MODEL",
    "MANUAL_QA_RECORDING_AGGREGATOR_MODEL",
    "MANUAL_QA_TOPIC_SEGMENTER_MODEL"
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    keys.forEach((key) => delete process.env[key]);
    let config = resolveManualQaRecordingAnalyzerConfig({
      aiFetchImpl: async () => {},
      maxNewClips: 999,
      maxClipBytes: Number.MAX_SAFE_INTEGER
    });
    assert.equal(config.apiKey, "");
    assert.equal(config.baseUrl, DEFAULT_RECORDING_ANALYZER_BASE_URL);
    assert.equal(config.analyzerModel, DEFAULT_RECORDING_ANALYZER_MODEL);
    assert.equal(config.aggregatorModel, DEFAULT_RECORDING_AGGREGATOR_MODEL);
    assert.equal(config.maxNewClips, DEFAULT_RECORDING_ANALYZER_MAX_NEW_CLIPS);
    assert.equal(config.maxClipBytes, DEFAULT_RECORDING_ANALYZER_MAX_CLIP_BYTES);

    process.env.OPENROUTER_API_KEY = "openrouter-key";
    process.env.MANUAL_QA_TOPIC_SEGMENTER_API_KEY = "topic-key";
    process.env.MANUAL_QA_TOPIC_SEGMENTER_BASE_URL = "https://topic.example/v1/";
    process.env.MANUAL_QA_TOPIC_SEGMENTER_MODEL = "topic/model";
    config = resolveManualQaRecordingAnalyzerConfig({ aiFetchImpl: async () => {} });
    assert.equal(config.apiKey, "openrouter-key");
    assert.equal(config.baseUrl, DEFAULT_RECORDING_ANALYZER_BASE_URL);
    assert.equal(config.aggregatorModel, DEFAULT_RECORDING_AGGREGATOR_MODEL);
    assert.equal(config.privacyEnforced, true);

    process.env.MANUAL_QA_RECORDING_ANALYZER_API_KEY = "dedicated-key";
    process.env.MANUAL_QA_RECORDING_ANALYZER_BASE_URL = "https://video.example/v1/";
    process.env.MANUAL_QA_RECORDING_ANALYZER_MODEL = "video/model";
    process.env.MANUAL_QA_RECORDING_AGGREGATOR_MODEL = "aggregate/model";
    config = resolveManualQaRecordingAnalyzerConfig({ aiFetchImpl: async () => {} });
    assert.equal(config.apiKey, "dedicated-key");
    assert.equal(config.baseUrl, "https://video.example/v1");
    assert.equal(config.analyzerModel, "video/model");
    assert.equal(config.aggregatorModel, "aggregate/model");
    assert.equal(config.privacyEnforced, false);
  } finally {
    keys.forEach((key) => {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    });
  }
});

test("recording normalization supports WebM, MP4, and QuickTime and sorts numeric parts", () => {
  const normalized = normalizeRecordingList([
    recording(10),
    recording(2, {
      content_type: "video/mp4",
      storage_path: "session/video/trial-recording-segment-2.mp4"
    }),
    recording(1, {
      content_type: "video/quicktime",
      storage_path: "session/video/trial-recording-segment-1.mov"
    })
  ]);
  assert.deepEqual(normalized.map((entry) => entry.recording_index), [1, 2, 10]);
  assert.deepEqual(normalized.map((entry) => entry.content_type), ["video/quicktime", "video/mp4", "video/webm"]);
  assert.equal(normalized.every((entry) => entry.item_id === "qualification-review"), true);
});

test("the longest allowed trial stays below the exact recording-set cap", () => {
  const portalSource = fs.readFileSync(path.join(__dirname, "..", "src", "QaTrialPortal.tsx"), "utf8");
  const widgetSource = fs.readFileSync(path.join(__dirname, "..", "lib", "manual-qa-widget.js"), "utf8");
  const portalSegmentMs = Number(portalSource.match(/RECORDING_SEGMENT_MS\s*=\s*([\d_]+)/)?.[1]?.replaceAll("_", ""));
  const widgetSegmentMs = Number(widgetSource.match(/RECORDING_SEGMENT_MS\s*=\s*(\d+)/)?.[1]);
  assert.equal(portalSegmentMs, 30000);
  assert.equal(widgetSegmentMs, portalSegmentMs);
  const maximumSegments = Math.ceil(MAX_QA_TRIAL_DURATION_MINUTES * 60_000 / portalSegmentMs) + 1;
  assert.equal(maximumSegments <= MAX_RECORDINGS, true);
});

test("exact input validation rejects skipped, duplicate, and oversized recording sets before fetch", async (t) => {
  await t.test("chunk entries are not silently skipped", async () => {
    let fetched = false;
    const result = await runManualQaRecordingAnalysis(
      {
        recordings: [
          recording(1),
          recording(2, { storage_path: "session/video/chunks/chunk-2.webm" })
        ]
      },
      { fetchEvidenceObject: async () => { fetched = true; } }
    );
    assert.equal(result.status, "failed");
    assert.equal(result.error_code, "recording_set_invalid");
    assert.equal(result.media_count, 2);
    assert.equal(fetched, false);
  });

  await t.test("duplicate identities are terminal", async () => {
    const result = await runManualQaRecordingAnalysis({ recordings: [recording(1), recording(1)] });
    assert.equal(result.status, "failed");
    assert.equal(result.error_code, "recording_set_invalid");
    assert.equal(result.retryable, false);
  });

  await t.test("more than 240 recordings are terminal and never truncated", async () => {
    let analyzed = false;
    const recordings = Array.from({ length: 241 }, (_, index) => recording(index + 1));
    const result = await runManualQaRecordingAnalysis(
      { recordings },
      { analyzeClip: async () => { analyzed = true; } }
    );
    assert.equal(result.status, "failed");
    assert.equal(result.error_code, "recording_limit_exceeded");
    assert.equal(result.media_count, 241);
    assert.equal(analyzed, false);
  });
});

test("WebM and ISO media parsers produce trusted duration without model input", () => {
  assert.equal(__private.extractWebmDurationMs(webmBuffer(1750)), 1750);
  assert.equal(__private.extractWebmDurationMs(webmClusterBuffer(1000)), 1100);
  assert.equal(__private.extractMp4DurationMs(mp4Buffer(2400)), 2400);
  assert.equal(
    __private.extractMp4DurationMs(Buffer.concat([mp4Buffer(2400).subarray(0, 24), Buffer.from("mvhd-not-a-box")])),
    null
  );

  const webmRecording = normalizeRecordingList([recording(1, { duration_ms: null })])[0];
  const parsedWebm = __private.prepareRecordingMedia(storedWebm(1750), webmRecording, {});
  assert.equal(parsedWebm.contentType, "video/webm");
  assert.equal(parsedWebm.durationMs, 1750);

  const parsedContainerDurationWins = __private.prepareRecordingMedia(
    storedWebm(1750),
    { ...webmRecording, duration_ms: 777 },
    {}
  );
  assert.equal(parsedContainerDurationWins.durationMs, 1750);

  const unparseableWebm = Buffer.concat([
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x00, 0x00, 0x00]),
    Buffer.from("webm", "ascii")
  ]);
  assert.throws(
    () => __private.prepareRecordingMedia(
      { contentType: "video/webm", data: unparseableWebm },
      { ...webmRecording, duration_ms: 3600000 },
      {}
    ),
    (error) => error?.code === "recording_duration_unavailable"
  );

  const mp4Recording = normalizeRecordingList([recording(2, {
    duration_ms: null,
    content_type: "video/mp4",
    storage_path: "session/video/trial-recording-segment-2.mp4"
  })])[0];
  assert.equal(
    __private.prepareRecordingMedia({ contentType: "video/mp4", data: mp4Buffer(2400) }, mp4Recording, {}).durationMs,
    2400
  );

  const quickTimeRecording = normalizeRecordingList([recording(3, {
    duration_ms: null,
    content_type: "video/quicktime",
    storage_path: "session/video/trial-recording-segment-3.mov"
  })])[0];
  assert.equal(
    __private.prepareRecordingMedia(
      { contentType: "video/quicktime", data: mp4Buffer(3200, "qt") },
      quickTimeRecording,
      {}
    ).durationMs,
    3200
  );
});

test("container signatures, MIME agreement, and the 12 MiB limit fail closed", async (t) => {
  await t.test("storage fetch receives the byte cap before buffering", async () => {
    let receivedMaxBytes = null;
    const result = await runManualQaRecordingAnalysis(
      { recordings: [recording(1)] },
      {
        fetchEvidenceObject: async (_entry, storageOptions) => {
          receivedMaxBytes = storageOptions.maxBytes;
          return storedWebm();
        },
        analyzeClip: async () => completedClip(1),
        aggregateFindings: async () => ({ findings: [] })
      }
    );
    assert.equal(result.status, "complete");
    assert.equal(receivedMaxBytes, DEFAULT_RECORDING_ANALYZER_MAX_CLIP_BYTES);
  });

  await t.test("spoofed WebM bytes never reach AI", async () => {
    let analyzed = false;
    const result = await runManualQaRecordingAnalysis(
      { recordings: [recording(1)] },
      {
        fetchEvidenceObject: async () => ({ contentType: "video/webm", data: Buffer.from("not a webm") }),
        analyzeClip: async () => { analyzed = true; }
      }
    );
    assert.equal(result.status, "failed");
    assert.equal(result.clip_results[0].error_code, "recording_signature_invalid");
    assert.equal(result.retryable, false);
    assert.equal(analyzed, false);
  });

  await t.test("stored MIME disagreement is rejected", async () => {
    const result = await runManualQaRecordingAnalysis(
      { recordings: [recording(1)] },
      {
        fetchEvidenceObject: async () => ({ contentType: "video/mp4", data: mp4Buffer(10000) }),
        analyzeClip: async () => completedClip(1)
      }
    );
    assert.equal(result.status, "failed");
    assert.equal(result.clip_results[0].error_code, "recording_type_mismatch");
  });

  await t.test("metadata over 12 MiB prevents even fetching", async () => {
    let fetched = false;
    const result = await runManualQaRecordingAnalysis(
      { recordings: [recording(1, { byte_length: DEFAULT_RECORDING_ANALYZER_MAX_CLIP_BYTES + 1 })] },
      { fetchEvidenceObject: async () => { fetched = true; } }
    );
    assert.equal(result.status, "failed");
    assert.equal(result.clip_results[0].error_code, "recording_too_large");
    assert.equal(result.retryable, false);
    assert.equal(fetched, false);
  });

  await t.test("actual bytes over 12 MiB never reach AI even without size metadata", async () => {
    let analyzed = false;
    const oversized = Buffer.alloc(DEFAULT_RECORDING_ANALYZER_MAX_CLIP_BYTES + 1);
    webmBuffer(10000).copy(oversized, 0);
    const result = await runManualQaRecordingAnalysis(
      { recordings: [recording(1, { byte_length: null })] },
      {
        fetchEvidenceObject: async () => ({ contentType: "video/webm", data: oversized }),
        analyzeClip: async () => { analyzed = true; }
      }
    );
    assert.equal(result.status, "failed");
    assert.equal(result.clip_results[0].error_code, "recording_too_large");
    assert.equal(analyzed, false);
  });
});

test("clip response schema rejects malformed objects and ignores model duration", () => {
  const normalizedRecording = normalizeRecordingList([recording(1, { duration_ms: 1500 })])[0];
  const empty = normalizeClipAnalysisResult({}, normalizedRecording, { trustedDurationMs: 1500 });
  assert.equal(empty.status, "failed");
  assert.equal(empty.error_code, "clip_response_invalid");

  const malformedEvent = normalizeClipAnalysisResult(
    {
      speech_segments: [{ start_ms: 500, end_ms: 100, text: "Backwards time" }],
      visual_events: [],
      summary: "Malformed timestamps",
      confidence: 0.7
    },
    normalizedRecording,
    { trustedDurationMs: 1500 }
  );
  assert.equal(malformedEvent.status, "failed");

  const outsideTrustedDuration = normalizeClipAnalysisResult(
    {
      duration_ms: 999999,
      speech_segments: [{ start_ms: 0, end_ms: 2500, text: "Exact speech event" }],
      visual_events: [{ start_ms: 1400, end_ms: 2500, description: "Button becomes disabled" }],
      summary: "Direct clip evidence only",
      confidence: 0.8
    },
    normalizedRecording,
    { trustedDurationMs: 1500 }
  );
  assert.equal(outsideTrustedDuration.status, "failed");
  assert.equal(outsideTrustedDuration.error_code, "clip_response_invalid");

  const valid = normalizeClipAnalysisResult(
    {
      duration_ms: 999999,
      speech_segments: [{ start_ms: 0, end_ms: 1500, text: "Exact speech event" }],
      visual_events: [{ start_ms: 1400, end_ms: 1500, description: "Button becomes disabled" }],
      summary: "Direct clip evidence only",
      confidence: 0.8
    },
    normalizedRecording,
    { trustedDurationMs: 1500 }
  );
  assert.equal(valid.status, "complete");
  assert.equal(valid.duration_ms, 1500);
  assert.equal(valid.speech_segments[0].end_ms, 1500);
  assert.equal(valid.visual_events[0].end_ms, 1500);
});

test("findings require exact meaningful full-event evidence and allowed categories", () => {
  const clips = [completedClip(1)];
  const valid = normalizeRecordingFindings({
    findings: [{
      category: "observation",
      title: "Supported interface observation",
      summary: "The spoken and visible events directly support this observation.",
      evidence_anchors: [{
        evidence_id: "evidence-1",
        recording_index: 1,
        start_ms: 0,
        end_ms: 10000,
        quote: "Spoken words in part 1",
        visual_evidence: "Visible event in part 1"
      }],
      confidence: 0.8
    }]
  }, clips);
  assert.equal(valid.length, 1);
  assert.deepEqual(valid[0].evidence_anchors[0], {
    evidence_id: "evidence-1",
    recording_index: 1,
    start_ms: 100,
    end_ms: 900,
    quote: "Spoken words in part 1",
    visual_evidence: "Visible event in part 1"
  });

  const adversarial = normalizeRecordingFindings({
    findings: [
      {
        category: "bug",
        title: "Substring quote",
        summary: "A fragment must not count as exact evidence.",
        evidence_anchors: [{
          evidence_id: "evidence-1",
          recording_index: 1,
          start_ms: 100,
          end_ms: 800,
          quote: "words in part 1"
        }],
        confidence: 0.8
      },
      {
        category: "frustration",
        title: "Substring visual evidence",
        summary: "A visual fragment must not count as exact evidence.",
        evidence_anchors: [{
          evidence_id: "evidence-1",
          recording_index: 1,
          start_ms: 200,
          end_ms: 900,
          visual_evidence: "event in part 1"
        }],
        confidence: 0.8
      },
      {
        category: "positive",
        title: "Disallowed legacy category",
        summary: "Positive is no longer an allowed category.",
        evidence_anchors: [{
          evidence_id: "evidence-1",
          recording_index: 1,
          start_ms: 100,
          end_ms: 800,
          quote: "Spoken words in part 1"
        }],
        confidence: 0.8
      }
    ]
  }, clips);
  assert.deepEqual(adversarial, []);

  const weakClip = [completedClip(1, {
    speech_segments: [{ start_ms: 0, end_ms: 100, text: "I" }],
    visual_events: []
  })];
  assert.deepEqual(normalizeRecordingFindings({
    findings: [{
      category: "observation",
      title: "Weak one-letter evidence",
      summary: "One letter is not meaningful evidence.",
      evidence_anchors: [{
        evidence_id: "evidence-1",
        recording_index: 1,
        start_ms: 0,
        end_ms: 100,
        quote: "I"
      }],
      confidence: 0.5
    }]
  }, weakClip), []);
});

test("aggregation receives only IDs, trusted duration, and timestamped evidence", () => {
  const clips = [completedClip(1)];
  const input = buildRecordingAggregationInput(clips);
  assert.deepEqual(Object.keys(input.recordings[0]), [
    "evidence_id",
    "recording_index",
    "duration_ms",
    "speech_segments",
    "visual_events"
  ]);
  const serialized = JSON.stringify(input);
  assert.equal(serialized.includes("item_id"), false);
  assert.equal(serialized.includes("summary"), false);
  assert.equal(serialized.includes("confidence"), false);

  assert.deepEqual(buildRecordingTranscriptEvents(clips), [{
    source: "server_recording_analysis",
    item_id: "qualification-review",
    evidence_id: "evidence-1",
    recording_index: 1,
    start_ms: 100,
    end_ms: 800,
    text: "Spoken words in part 1"
  }]);
});

test("a failed clip blocks aggregation and retry reuses every successful clip", async () => {
  const recordings = [recording(1), recording(2), recording(3)];
  const analyzedFirstRun = [];
  let aggregateCalls = 0;
  const first = await runManualQaRecordingAnalysis(
    { recordings, existing_clip_results: [completedClip(1)] },
    {
      fetchEvidenceObject: async () => storedWebm(),
      analyzeClip: async ({ recording: entry }) => {
        analyzedFirstRun.push(entry.recording_index);
        if (entry.recording_index === 3) throw new Error("temporary model failure");
        return completedClip(entry.recording_index);
      },
      aggregateFindings: async () => { aggregateCalls += 1; return { findings: [] }; }
    }
  );
  assert.equal(first.status, "failed");
  assert.equal(first.retryable, true);
  assert.deepEqual(analyzedFirstRun.sort((a, b) => a - b), [2, 3]);
  assert.equal(first.processed_media_count, 2);
  assert.equal(aggregateCalls, 0);

  const analyzedRetry = [];
  const second = await runManualQaRecordingAnalysis(
    { recordings, existing_clip_results: first.clip_results },
    {
      fetchEvidenceObject: async () => storedWebm(),
      analyzeClip: async ({ recording: entry }) => {
        analyzedRetry.push(entry.recording_index);
        return completedClip(entry.recording_index);
      },
      aggregateFindings: async () => ({
        findings: [{
          category: "aha_moment",
          title: "Clear value moment",
          summary: "The tester names the value directly in the complete speech event.",
          evidence_anchors: [{
            evidence_id: "evidence-3",
            recording_index: 3,
            start_ms: 100,
            end_ms: 800,
            quote: "Spoken words in part 3"
          }],
          confidence: 0.9
        }]
      })
    }
  );
  assert.equal(second.status, "complete");
  assert.deepEqual(analyzedRetry, [3]);
  assert.equal(second.findings.length, 1);
  assert.equal(second.processed_media_count, 3);
});

test("a run analyzes at most 12 new clips and durably queues the remainder", async () => {
  const recordings = Array.from({ length: 13 }, (_, index) => recording(index + 1));
  const analyzed = [];
  let aggregateCalls = 0;
  const first = await runManualQaRecordingAnalysis(
    { analysis_id: "analysis-13", recordings },
    {
      concurrency: 4,
      fetchEvidenceObject: async () => storedWebm(),
      analyzeClip: async ({ recording: entry }) => {
        analyzed.push(entry.recording_index);
        return completedClip(entry.recording_index);
      },
      aggregateFindings: async () => { aggregateCalls += 1; return { findings: [] }; },
      now: () => "2026-07-19T02:00:00.000Z"
    }
  );
  assert.equal(first.status, "queued");
  assert.equal(first.processed_media_count, 12);
  assert.equal(first.clip_results.length, 12);
  assert.equal(first.queued_at, "2026-07-19T02:00:00.000Z");
  assert.deepEqual(analyzed.sort((a, b) => a - b), Array.from({ length: 12 }, (_, index) => index + 1));
  assert.equal(aggregateCalls, 0);

  const secondAnalyzed = [];
  const second = await runManualQaRecordingAnalysis(
    { analysis_id: "analysis-13", recordings, existing_clip_results: first.clip_results },
    {
      fetchEvidenceObject: async () => storedWebm(),
      analyzeClip: async ({ recording: entry }) => {
        secondAnalyzed.push(entry.recording_index);
        return completedClip(entry.recording_index);
      },
      aggregateFindings: async () => { aggregateCalls += 1; return { findings: [] }; }
    }
  );
  assert.equal(second.status, "complete");
  assert.deepEqual(secondAnalyzed, [13]);
  assert.equal(second.processed_media_count, 13);
  assert.equal(aggregateCalls, 1);
});

test("default OpenRouter requests use privacy flags and never trust model or client duration or notes", async () => {
  const bodies = [];
  const responses = [
    {
      duration_ms: 999999,
      speech_segments: [{ start_ms: 100, end_ms: 400, text: "I cannot continue" }],
      visual_events: [{ start_ms: 150, end_ms: 450, description: "Continue button remains disabled" }],
      summary: "Direct speech and interface evidence",
      confidence: 0.9
    },
    {
      findings: [{
        category: "frustration",
        title: "Tester cannot continue",
        summary: "The complete spoken and visible events show the tester is blocked.",
        evidence_anchors: [{
          evidence_id: "evidence-1",
          recording_index: 1,
          start_ms: 100,
          end_ms: 450,
          quote: "I cannot continue",
          visual_evidence: "Continue button remains disabled"
        }],
        confidence: 0.95
      }]
    }
  ];
  const aiFetchImpl = async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    const response = responses.shift();
    return {
      ok: true,
      status: 200,
      async json() {
        return { choices: [{ message: { content: JSON.stringify(response) } }] };
      }
    };
  };
  const result = await runManualQaRecordingAnalysis(
    {
      recordings: [recording(1, { duration_ms: 900 })],
      tester_note: "SECRET TESTER NOTE MUST NOT REACH THE MODEL"
    },
    { apiKey: "test-key", aiFetchImpl, fetchEvidenceObject: async () => storedWebm(1750) }
  );
  assert.equal(result.status, "complete");
  assert.equal(result.clip_results[0].duration_ms, 1750);
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies.map((body) => body.provider), [
    { zdr: true, data_collection: "deny" },
    { zdr: true, data_collection: "deny" }
  ]);
  assert.equal(bodies[0].model, DEFAULT_RECORDING_ANALYZER_MODEL);
  assert.match(bodies[0].messages[1].content[1].video_url.url, /^data:video\/webm;base64,/);
  assert.equal(bodies[1].model, DEFAULT_RECORDING_AGGREGATOR_MODEL);
  assert.equal(JSON.stringify(bodies).includes("SECRET TESTER NOTE MUST NOT REACH THE MODEL"), false);
  assert.equal(JSON.stringify(bodies[1]).includes("Direct speech and interface evidence"), false);
});

test("recording bytes are never sent to an unapproved custom AI endpoint", async () => {
  let aiCalls = 0;
  const result = await runManualQaRecordingAnalysis(
    { recordings: [recording(1)] },
    {
      apiKey: "custom-provider-key",
      baseUrl: "https://custom-provider.example/v1",
      fetchEvidenceObject: async () => storedWebm(1750),
      aiFetchImpl: async () => {
        aiCalls += 1;
        throw new Error("custom endpoint must not be called");
      }
    }
  );
  assert.equal(result.status, "failed");
  assert.equal(result.clip_results[0].error_code, "recording_provider_privacy_unverified");
  assert.equal(result.clip_results[0].retryable, false);
  assert.equal(aiCalls, 0);
});

test("malformed or unsupported aggregation fails instead of publishing empty findings", async (t) => {
  const input = { recordings: [recording(1)], existing_clip_results: [completedClip(1)] };

  await t.test("an empty object is not an aggregation schema", async () => {
    const result = await runManualQaRecordingAnalysis(input, { aggregateFindings: async () => ({}) });
    assert.equal(result.status, "failed");
    assert.equal(result.error_code, "aggregation_response_invalid");
    assert.equal(result.findings.length, 0);
  });

  await t.test("nonempty findings with inexact evidence cannot become a successful empty report", async () => {
    const result = await runManualQaRecordingAnalysis(input, {
      aggregateFindings: async () => ({
        findings: [{
          category: "bug",
          title: "Unsupported generated finding",
          summary: "The quote is a fragment rather than the complete transcript event.",
          evidence_anchors: [{
            evidence_id: "evidence-1",
            recording_index: 1,
            start_ms: 100,
            end_ms: 800,
            quote: "words in part 1"
          }],
          confidence: 0.8
        }]
      })
    });
    assert.equal(result.status, "failed");
    assert.equal(result.error_code, "aggregation_evidence_invalid");
    assert.equal(result.findings.length, 0);
  });

  await t.test("an explicit empty findings array is valid", async () => {
    const result = await runManualQaRecordingAnalysis(input, {
      aggregateFindings: async () => ({ findings: [] })
    });
    assert.equal(result.status, "complete");
    assert.deepEqual(result.findings, []);
  });
});

test("missing recordings are terminal and JSON extraction remains strict", async () => {
  let analyzed = false;
  const result = await runManualQaRecordingAnalysis(
    { recordings: [] },
    { analyzeClip: async () => { analyzed = true; } }
  );
  assert.equal(result.status, "failed");
  assert.equal(result.error_code, "recording_missing");
  assert.equal(result.retryable, false);
  assert.equal(analyzed, false);
  assert.deepEqual(__private.parseJsonObject("```json\n{\"findings\":[]}\n```"), { findings: [] });
  assert.equal(__private.parseJsonObject("There are no structured results."), null);
});
