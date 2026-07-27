import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  Mic,
  MonitorUp,
  Play,
  Square,
  Star,
  Video
} from "lucide-react";
import { apiFetch } from "./lib/api";
import type {
  ManualQaEvidenceAnchor,
  ManualQaRecordingFinding,
  QaTrialEvidence,
  QaTrialView
} from "./types";

const RECORDING_SEGMENT_MS = 30_000;
const UPLOAD_CHUNK_BYTES = 1_400_000;

function recordingExtension(contentType: string) {
  const normalized = String(contentType || "").toLowerCase();
  if (normalized.includes("quicktime")) return "mov";
  if (normalized.includes("mp4")) return "mp4";
  return "webm";
}

function supportedRecordingType() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return "";
  return ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4"].find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read recording segment"));
    reader.readAsDataURL(blob);
  });
}

function formatBytes(value?: number) {
  const bytes = Math.max(0, Number(value) || 0);
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTesterPay(trial: QaTrialView) {
  const cents = Math.max(0, Number(trial.assignment.tester_pay_cents) || 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: trial.assignment.tester_pay_currency || "USD",
    minimumFractionDigits: cents % 100 ? 2 : 0
  }).format(cents / 100);
}

function buyerSafeTesterFirstName(value?: string | null) {
  const name = String(value || "").trim();
  if (!name || name.toLowerCase() === "your tester") return "your tester";
  return name.split(/\s+/)[0] || "your tester";
}

function evidenceUrl(entry: QaTrialEvidence, token: string, startMs?: number | null) {
  if (!entry.url) return "";
  const url = new URL(entry.url, window.location.origin);
  url.searchParams.set("trial_token", token);
  if (startMs !== undefined && startMs !== null) {
    url.hash = `t=${Math.max(0, Number(startMs) || 0) / 1000}`;
  }
  return url.toString();
}

function recordingPartNumber(entry: QaTrialEvidence) {
  const indexedEntry = entry as QaTrialEvidence & {
    recording_index?: number | null;
    recordingIndex?: number | null;
  };
  const explicit = Number(indexedEntry.recording_index ?? indexedEntry.recordingIndex);
  if (Number.isInteger(explicit) && explicit > 0) return explicit;
  const label = String(entry.label || "");
  const match = label.match(/(?:part|segment|clip|recording)[^0-9]{0,24}(\d+)/i) || label.match(/(\d+)/);
  const parsed = Number(match?.[1]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function nextRecordingSegmentIndex(evidence: QaTrialEvidence[]) {
  return evidence.reduce((highest, entry) => {
    if (entry.kind !== "video") return highest;
    return Math.max(highest, recordingPartNumber(entry));
  }, 0);
}

function formatEvidenceTime(value?: number | null) {
  const seconds = Math.max(0, Math.floor((Number(value) || 0) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function findingAnchors(finding: ManualQaRecordingFinding) {
  const anchors = [...(finding.evidence_anchors || [])];
  const primary = finding.evidence_anchor;
  if (primary && !anchors.some((anchor) => (
    anchor.evidence_id === primary.evidence_id &&
    anchor.recording_index === primary.recording_index &&
    anchor.start_ms === primary.start_ms
  ))) {
    anchors.unshift(primary);
  }
  return anchors;
}

function recordingForAnchor(anchor: ManualQaEvidenceAnchor, recordings: QaTrialEvidence[]) {
  const evidenceId = String(anchor.evidence_id || "").trim();
  if (evidenceId) {
    const directMatch = recordings.find((entry) => entry.evidence_id === evidenceId);
    if (directMatch) return directMatch;
  }
  const partNumber = Number(anchor.recording_index);
  if (Number.isInteger(partNumber) && partNumber > 0) {
    return recordings.find((entry) => recordingPartNumber(entry) === partNumber) || recordings[partNumber - 1] || null;
  }
  return null;
}

function anchorPartNumber(anchor: ManualQaEvidenceAnchor, recording: QaTrialEvidence, recordings: QaTrialEvidence[]) {
  const statedPart = Number(anchor.recording_index);
  if (Number.isInteger(statedPart) && statedPart > 0) return statedPart;
  const recordedPart = recordingPartNumber(recording);
  if (recordedPart > 0) return recordedPart;
  const index = recordings.indexOf(recording);
  return index >= 0 ? index + 1 : 1;
}

function ReportFinding({
  finding,
  recordings,
  token,
  showProblemType = false
}: {
  finding: ManualQaRecordingFinding;
  recordings: QaTrialEvidence[];
  token: string;
  showProblemType?: boolean;
}) {
  const anchors = findingAnchors(finding);
  const category = String(finding.category || "").toLowerCase();
  const summary = String(finding.summary || "").trim();
  return (
    <li className="py-5 first:pt-0 last:pb-0">
      {showProblemType ? (
        <p className="mb-2 text-xs font-black uppercase tracking-widest text-brand-muted">
          {category === "bug" ? "Bug" : "Friction"}
        </p>
      ) : null}
      <h3 className="text-lg font-black leading-7">{finding.title || "Captured point"}</h3>
      {summary ? <p className="mt-2 text-sm font-semibold leading-6 text-brand-muted">{summary}</p> : null}
      {anchors.length ? (
        <ol className="mt-4 space-y-4 border-l-2 border-brand-line pl-4">
          {anchors.map((anchor, index) => {
            const recording = recordingForAnchor(anchor, recordings);
            const link = recording ? evidenceUrl(recording, token, anchor.start_ms) : "";
            const partNumber = recording ? anchorPartNumber(anchor, recording, recordings) : 1;
            return (
              <li key={`${finding.finding_id || finding.title || "finding"}-evidence-${index}`}>
                {anchor.quote ? (
                  <blockquote className="text-sm font-semibold leading-6 text-brand-ink">&ldquo;{anchor.quote}&rdquo;</blockquote>
                ) : null}
                {anchor.visual_evidence ? (
                  <p className="mt-1 text-sm font-semibold leading-6 text-brand-muted">On screen: {anchor.visual_evidence}</p>
                ) : null}
                {link ? (
                  <a
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex min-h-11 items-center gap-2 font-black text-brand-accent underline decoration-brand-accent/30 underline-offset-4 hover:text-brand-ink"
                  >
                    <Play className="h-4 w-4" />
                    Watch part {partNumber} at {formatEvidenceTime(anchor.start_ms)}
                  </a>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}
    </li>
  );
}

function BuyerReport({ trial, recordings, token }: { trial: QaTrialView; recordings: QaTrialEvidence[]; token: string }) {
  const findings = (trial.report?.findings || []).filter((finding) => finding.support_verified !== false);
  const problems = findings.filter((finding) => ["bug", "frustration_point"].includes(String(finding.category || "").toLowerCase()));
  const wins = findings.filter((finding) => String(finding.category || "").toLowerCase() === "aha_moment");
  const observations = findings.filter((finding) => !["bug", "frustration_point", "aha_moment"].includes(String(finding.category || "").toLowerCase()));
  const suggestedFixes = problems.filter((finding) => Boolean(String(finding.suggested_fix || "").trim()));

  const renderFinding = (finding: ManualQaRecordingFinding, showProblemType = false) => (
    <ReportFinding
      key={finding.finding_id || `${finding.category}-${finding.title}`}
      finding={finding}
      recordings={recordings}
      token={token}
      showProblemType={showProblemType}
    />
  );

  return (
    <section aria-labelledby="buyer-report-title">
      <div className="flex items-start gap-3 bg-brand-success/10 p-4">
        <Check className="mt-0.5 h-6 w-6 shrink-0 text-brand-success" />
        <div>
          <h2 id="buyer-report-title" className="font-black">Report ready</h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-brand-muted">
            Created only from the tester&apos;s video and speech transcript.
          </p>
        </div>
      </div>

      <div className="mt-7 divide-y divide-brand-line border-y border-brand-line">
        {!findings.length ? (
          <p className="py-7 text-sm font-semibold text-brand-muted">No clear findings were identified in the recording.</p>
        ) : null}

        {problems.length ? (
          <section className="py-7" aria-labelledby="buyer-report-problems-title">
            <h2 id="buyer-report-problems-title" className="text-sm font-black uppercase tracking-widest">Problems</h2>
            <ol className="mt-5 divide-y divide-brand-line">{problems.map((finding) => renderFinding(finding, true))}</ol>
          </section>
        ) : null}

        {wins.length ? (
          <section className="py-7" aria-labelledby="buyer-report-wins-title">
            <h2 id="buyer-report-wins-title" className="text-sm font-black uppercase tracking-widest">What worked</h2>
            <ol className="mt-5 divide-y divide-brand-line">{wins.map((finding) => renderFinding(finding))}</ol>
          </section>
        ) : null}

        {suggestedFixes.length ? (
          <section className="py-7" aria-labelledby="buyer-report-fixes-title">
            <h2 id="buyer-report-fixes-title" className="text-sm font-black uppercase tracking-widest">Suggested fixes</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-brand-muted">
              Recommendations based on the recording-backed problems above.
            </p>
            <ol className="mt-5 divide-y divide-brand-line">
              {suggestedFixes.map((finding) => (
                <li key={`${finding.finding_id || finding.title}-fix`} className="py-4 first:pt-0 last:pb-0">
                  <p className="text-sm font-semibold leading-6">{finding.suggested_fix}</p>
                  <p className="mt-1 text-sm font-semibold text-brand-muted">For: {finding.title || "Recorded problem"}</p>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {observations.length ? (
          <details className="py-4">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-black focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-accent">
              More observations ({observations.length})
              <ChevronDown aria-hidden="true" className="h-4 w-4 text-brand-muted" />
            </summary>
            <ol className="mt-3 divide-y divide-brand-line">{observations.map((finding) => renderFinding(finding))}</ol>
          </details>
        ) : null}
      </div>
    </section>
  );
}

function TrialLogo() {
  return (
    <a href="/" className="inline-flex items-center gap-3 font-display text-xl font-black text-brand-ink">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-ink text-brand-accent">B</span>
      beforeusersdo<span className="text-brand-accent">.</span>
    </a>
  );
}

function TrialState({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="py-12 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-accent/10 text-brand-accent">
        {icon}
      </div>
      <h2 className="mt-5 text-2xl font-black text-brand-ink">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-brand-muted">{body}</p>
    </div>
  );
}

export default function QaTrialPortal({ search }: { search: string }) {
  const params = new URLSearchParams(search);
  const sessionId = String(params.get("session_id") || "").trim();
  const token = String(params.get("token") || "").trim();
  const [trial, setTrial] = useState<QaTrialView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [rating, setRating] = useState(0);
  const [ratingNote, setRatingNote] = useState("");
  const [ratingError, setRatingError] = useState("");
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedSegments, setSavedSegments] = useState(0);
  const [recordingMessage, setRecordingMessage] = useState("");
  const streamRef = useRef<MediaStream | null>(null);
  const sourceStreamsRef = useRef<MediaStream[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceNodesRef = useRef<MediaStreamAudioSourceNode[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const segmentTimerRef = useRef<number | null>(null);
  const segmentDoneRef = useRef<Promise<void> | null>(null);
  const uploadPromisesRef = useRef<Array<Promise<unknown>>>([]);
  const segmentIndexRef = useRef(0);
  const stopRequestedRef = useRef(false);

  async function loadTrial(silent = false) {
    if (!sessionId || !token) {
      setError("This trial link is incomplete.");
      setLoading(false);
      return;
    }
    try {
      if (!silent) setLoading(true);
      const response = await apiFetch<{ trial: QaTrialView }>("/api/qa-trials", {
        params: { session_id: sessionId, token }
      });
      setTrial(response.trial);
      setNote((current) => current || response.trial.submission.note || "");
      setError("");
    } catch (caught) {
      if (!silent) setError(caught instanceof Error ? caught.message : "Could not open this trial.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void loadTrial();
    const timer = window.setInterval(() => {
      if (!recording) void loadTrial(true);
    }, 8000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, token, recording]);

  useEffect(() => {
    return () => {
      const uploads = uploadPromisesRef.current.splice(0);
      if (uploads.length) void Promise.allSettled(uploads);
      releaseRecordingResources();
    };
  }, []);

  function releaseRecordingResources() {
    stopRequestedRef.current = true;
    if (segmentTimerRef.current !== null) window.clearTimeout(segmentTimerRef.current);
    segmentTimerRef.current = null;
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onerror = null;
      recorder.onstop = null;
      if (recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // The browser may already be stopping this recorder.
        }
      }
    }
    const tracks = new Set<MediaStreamTrack>();
    streamRef.current?.getTracks().forEach((track) => tracks.add(track));
    sourceStreamsRef.current.forEach((stream) => stream.getTracks().forEach((track) => tracks.add(track)));
    tracks.forEach((track) => track.stop());
    audioSourceNodesRef.current.forEach((source) => {
      try {
        source.disconnect();
      } catch {
        // The node may already be disconnected.
      }
    });
    const audioContext = audioContextRef.current;
    if (audioContext && audioContext.state !== "closed") void audioContext.close().catch(() => undefined);
    streamRef.current = null;
    sourceStreamsRef.current = [];
    audioContextRef.current = null;
    audioSourceNodesRef.current = [];
    recorderRef.current = null;
    segmentDoneRef.current = null;
  }

  function failRecordingStart(caught: unknown) {
    const uploads = uploadPromisesRef.current.splice(0);
    if (uploads.length) void Promise.allSettled(uploads);
    releaseRecordingResources();
    setRecording(false);
    setSaving(false);
    setRecordingMessage("");
    setError(caught instanceof Error ? caught.message : "Could not start screen and microphone recording.");
  }

  async function performAction(action: "accept" | "start" | "submit" | "rate", body: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    if (action === "rate") setRatingError("");
    try {
      const response = await apiFetch<{ trial: QaTrialView }>("/api/qa-trials", {
        method: "POST",
        body: { action, session_id: sessionId, token, ...body }
      });
      setTrial(response.trial);
      return response.trial;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not update this trial.";
      if (action === "rate") setRatingError(message);
      else setError(message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function uploadRecordingBlob(blob: Blob, segmentIndex: number, durationMs: number) {
    const contentType = blob.type || "video/webm";
    const extension = recordingExtension(contentType);
    const uploadId = `trial_${Date.now().toString(36)}_${segmentIndex.toString(36)}`;
    const chunks = [];
    let chunkIndex = 0;
    for (let offset = 0; offset < blob.size; offset += UPLOAD_CHUNK_BYTES) {
      const chunk = blob.slice(offset, Math.min(blob.size, offset + UPLOAD_CHUNK_BYTES), contentType);
      const uploaded = await apiFetch<{ chunk: Record<string, unknown> }>("/api/manual-qa/widget-evidence-chunks", {
        method: "POST",
        body: {
          action: "chunk",
          session_id: sessionId,
          token,
          upload_id: uploadId,
          kind: "video",
          chunk_index: chunkIndex,
          content_type: contentType,
          filename: `trial-part-${segmentIndex + 1}.${extension}`,
          data_url: await blobToDataUrl(chunk)
        }
      });
      chunks.push(uploaded.chunk);
      chunkIndex += 1;
    }
    await apiFetch("/api/manual-qa/widget-evidence-chunks", {
      method: "POST",
      body: {
        action: "finish",
        session_id: sessionId,
        item_id: "freestyle",
        token,
        upload_id: uploadId,
        kind: "video",
        content_type: contentType,
        filename: `trial-recording-segment-${segmentIndex + 1}.${extension}`,
        label: `Trial recording segment ${segmentIndex + 1}`,
        duration_ms: durationMs,
        chunks
      }
    });
    setSavedSegments((current) => current + 1);
  }

  function streamIsLive() {
    const stream = streamRef.current;
    return Boolean(
      stream?.getVideoTracks().some((track) => track.readyState === "live") &&
        stream.getAudioTracks().some((track) => track.readyState === "live")
    );
  }

  function startSegment() {
    if (stopRequestedRef.current) return;
    if (!streamRef.current || !streamIsLive()) {
      throw new Error("Screen and microphone must both be live before recording can start.");
    }
    const chunks: Blob[] = [];
    const mimeType = supportedRecordingType();
    const recorder = new MediaRecorder(streamRef.current, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 600_000
    });
    const segmentStartedAt = performance.now();
    recorderRef.current = recorder;
    let resolveSegment: () => void = () => undefined;
    segmentDoneRef.current = new Promise<void>((resolve) => {
      resolveSegment = resolve;
    });
    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunks.push(event.data);
    };
    recorder.onerror = () => {
      setRecordingMessage("A recording segment failed. Finish the test so saved evidence is kept.");
    };
    recorder.onstop = () => {
      if (segmentTimerRef.current) window.clearTimeout(segmentTimerRef.current);
      segmentTimerRef.current = null;
      const segmentIndex = segmentIndexRef.current++;
      if (chunks.length) {
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "video/webm" });
        const durationMs = Math.max(1, Math.round(performance.now() - segmentStartedAt));
        const upload = uploadRecordingBlob(blob, segmentIndex, durationMs).catch((caught) => {
          setError(caught instanceof Error ? caught.message : "A recording segment could not save.");
          throw caught;
        });
        uploadPromisesRef.current.push(upload);
      }
      resolveSegment();
      if (!stopRequestedRef.current) {
        if (!streamIsLive()) {
          failRecordingStart(new Error("Screen or microphone access stopped. Allow access, then resume recording."));
          return;
        }
        try {
          startSegment();
        } catch (caught) {
          failRecordingStart(caught);
        }
      }
    };
    try {
      recorder.start();
      segmentTimerRef.current = window.setTimeout(() => {
        if (recorder.state !== "inactive") recorder.stop();
      }, RECORDING_SEGMENT_MS);
    } catch (caught) {
      recorder.ondataavailable = null;
      recorder.onerror = null;
      recorder.onstop = null;
      recorderRef.current = null;
      segmentDoneRef.current = null;
      resolveSegment();
      throw caught;
    }
  }

  async function stopAndSaveRecording() {
    if (!recording && !streamRef.current) return true;
    setSaving(true);
    setRecordingMessage("Saving the last recording segment...");
    stopRequestedRef.current = true;
    if (segmentTimerRef.current) window.clearTimeout(segmentTimerRef.current);
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch (caught) {
        failRecordingStart(caught);
        return false;
      }
    }
    if (segmentDoneRef.current) await segmentDoneRef.current;
    const uploads = uploadPromisesRef.current.slice();
    const results = await Promise.allSettled(uploads);
    uploadPromisesRef.current = [];
    releaseRecordingResources();
    setRecording(false);
    setSaving(false);
    const failed = results.filter((result) => result.status === "rejected");
    if (failed.length) {
      setRecordingMessage(`${failed.length} recording segment${failed.length === 1 ? "" : "s"} failed to save.`);
      return false;
    }
    setRecordingMessage("Recording saved.");
    return true;
  }

  async function startTest(acceptFirst = false) {
    const AudioContextConstructor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (
      !navigator.mediaDevices?.getDisplayMedia ||
      !navigator.mediaDevices.getUserMedia ||
      typeof MediaRecorder === "undefined" ||
      !AudioContextConstructor
    ) {
      setError("Use a current version of Chrome to record this trial.");
      return;
    }
    const targetWindow = window.open(trial?.target_url || "about:blank", "beforeusersdo-test-target");
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      sourceStreamsRef.current = [display];
      const displayVideoTracks = display.getVideoTracks().filter((track) => track.readyState === "live");
      if (!displayVideoTracks.length) throw new Error("Choose a screen or tab to share, then try again.");

      let mic: MediaStream;
      try {
        mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        throw new Error("Microphone access is required. Allow it, then press Start again.");
      }
      sourceStreamsRef.current.push(mic);
      const microphoneTracks = mic.getAudioTracks().filter((track) => track.readyState === "live");
      if (!microphoneTracks.length) {
        throw new Error("Microphone access is required. Allow it, then press Start again.");
      }

      const audioContext = new AudioContextConstructor();
      audioContextRef.current = audioContext;
      const destination = audioContext.createMediaStreamDestination();
      const audioTracks = [
        ...display.getAudioTracks().filter((track) => track.readyState === "live"),
        ...microphoneTracks
      ];
      audioSourceNodesRef.current = audioTracks.map((track) => {
        const source = audioContext.createMediaStreamSource(new MediaStream([track]));
        source.connect(destination);
        return source;
      });
      if (audioContext.state === "suspended") await audioContext.resume();
      const mixedAudioTrack = destination.stream.getAudioTracks().find((track) => track.readyState === "live");
      if (!mixedAudioTrack) throw new Error("Could not combine screen and microphone audio. Please try again.");
      const stream = new MediaStream([...displayVideoTracks, mixedAudioTrack]);
      streamRef.current = stream;

      if (acceptFirst) {
        const accepted = await performAction("accept");
        if (!accepted) {
          releaseRecordingResources();
          targetWindow?.close();
          return;
        }
      }
      const started = await performAction("start");
      if (!started) {
        releaseRecordingResources();
        targetWindow?.close();
        return;
      }
      if (!microphoneTracks.some((track) => track.readyState === "live")) {
        throw new Error("Microphone access is required. Allow it, then press Start again.");
      }
      stopRequestedRef.current = false;
      uploadPromisesRef.current = [];
      segmentIndexRef.current = nextRecordingSegmentIndex(started.submission.evidence_media);
      setSavedSegments(started.submission.evidence_media.filter((entry) => entry.kind === "video").length);
      startSegment();
      setRecording(true);
      setRecordingMessage("Recording screen and voice. Saved segments will appear as you test.");
      display.getVideoTracks()[0]?.addEventListener("ended", () => {
        void stopAndSaveRecording();
      });
      microphoneTracks[0]?.addEventListener("ended", () => {
        if (stopRequestedRef.current) return;
        setError("Microphone stopped. Allow it, then resume recording.");
        void stopAndSaveRecording();
      });
    } catch (caught) {
      failRecordingStart(caught);
      targetWindow?.close();
    }
  }

  async function finishTrial() {
    const saved = await stopAndSaveRecording();
    if (!saved) return;
    const submitted = await performAction("submit", {
      note,
      widget_context: {
        page_url: trial?.target_url || null,
        page_title: trial?.product_name || null,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          device_pixel_ratio: window.devicePixelRatio || 1
        }
      }
    });
    if (submitted) setRecordingMessage("");
  }

  async function submitRating() {
    if (!rating) return;
    await performAction("rate", { score: rating, note: ratingNote });
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-bg">
        <LoaderCircle className="h-6 w-6 animate-spin text-brand-accent" />
      </div>
    );
  }

  if (!trial) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-bg px-4">
        <div className="max-w-md text-center">
          <CircleAlert className="mx-auto h-10 w-10 text-brand-danger" />
          <h1 className="mt-4 text-2xl font-black">This trial link does not work</h1>
          <p className="mt-2 text-sm font-semibold text-brand-muted">{error || "Ask BeforeUsersDo for a fresh link."}</p>
        </div>
      </div>
    );
  }

  const submitted = Boolean(trial.submission.submitted_at);
  const paidAssignment = trial.assignment.type === "paid";
  const otherPersonAccepted = trial.role === "tester" ? trial.consent.lead_accepted : trial.consent.tester_accepted;
  const videoEvidence = trial.submission.evidence_media.filter((entry) => entry.kind === "video");
  const reportComplete = trial.report?.status === "complete";
  const reportFailed = trial.report?.status === "failed";
  const showBuyerReport = trial.role !== "tester" && reportComplete;
  const testerFirstName = buyerSafeTesterFirstName(trial.tester.public_name);
  const testerPossessive = testerFirstName === "your tester" ? "your tester’s" : `${testerFirstName}’s`;
  const testerInitial = testerFirstName === "your tester" ? "T" : testerFirstName.charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-brand-bg text-brand-ink">
      <header className="border-b border-brand-line bg-white px-4 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <TrialLogo />
          <span className="text-xs font-black uppercase tracking-widest text-brand-muted">
            {trial.role === "tester" ? (paidAssignment ? "Paid test" : "Tester trial") : "Product test"}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-2xl border border-brand-line bg-white p-6 shadow-sm sm:p-8">
          <div className="text-xs font-black uppercase tracking-widest text-brand-accent">{trial.product_name}</div>
          <h1 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
            {trial.role === "tester"
              ? paidAssignment
                ? `Complete this ${formatTesterPay(trial)} test`
                : "Complete your first verified test"
              : showBuyerReport
                ? "Your test report"
                : "Your product test"}
          </h1>
          {!showBuyerReport ? (
            <p className="mt-4 text-base font-semibold leading-7 text-brand-muted">{trial.test_focus}</p>
          ) : null}

          {trial.role === "tester" ? (
            <div className="mt-7 border-y border-brand-line py-5">
              <div className="flex items-center gap-2 text-sm font-black">
                <KeyRound className="h-4 w-4 text-brand-accent" />
                Access for this test
              </div>
              <p className="mt-2 text-sm font-semibold text-brand-muted">
                {trial.access.mode === "test_account"
                  ? "Use the private test account below."
                  : trial.access.mode === "signup_allowed"
                    ? "You may create a fresh test account."
                    : "Stay on pages that work without signing in."}
              </p>
              {trial.access.credentials ? (
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-black uppercase text-brand-muted">Username</dt>
                    <dd className="mt-1 select-all break-all font-mono font-bold">{trial.access.credentials.username}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-black uppercase text-brand-muted">Password</dt>
                    <dd className="mt-1 select-all break-all font-mono font-bold">{trial.access.credentials.password}</dd>
                  </div>
                </dl>
              ) : null}
              {trial.access.login_url ? (
                <a href={trial.access.login_url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-black text-brand-accent hover:text-brand-ink">
                  Open sign in
                  <ExternalLink className="h-4 w-4" />
                </a>
              ) : null}
              {trial.access.prohibited_actions.length ? (
                <p className="mt-4 text-xs font-bold leading-5 text-brand-muted">
                  {trial.access.prohibited_actions.join(" · ")}
                </p>
              ) : null}
            </div>
          ) : null}

          {!trial.consent.accepted ? (
            trial.role === "tester" ? (
              <div className="mt-8 border-t border-brand-line pt-8">
                <p className="text-sm font-semibold leading-6 text-brand-muted">
                  {paidAssignment
                    ? `This ${trial.duration_minutes}-minute test pays ${formatTesterPay(trial)} after Before Users Do reviews the submitted recording and report.`
                    : `This ${trial.duration_minutes}-minute qualification is unpaid. Your recording and report are shared with the product owner and scored for your first verified result.`}
                  {" "}We record your screen and voice, then use AI to make a transcript and report. Before Users Do and the product owner can view them; the AI provider does not keep them.
                </p>
                <button
                  type="button"
                  onClick={() => void startTest(true)}
                  disabled={busy}
                  className="mt-6 inline-flex w-full items-center justify-center gap-3 rounded-xl bg-brand-accent px-6 py-5 text-lg font-black text-white transition hover:bg-brand-ink disabled:opacity-60"
                >
                  {busy ? <LoaderCircle className="h-6 w-6 animate-spin" /> : <MonitorUp className="h-6 w-6" />}
                  {paidAssignment ? "Start paid test" : `Start ${trial.duration_minutes}-minute test`}
                  <ArrowRight className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <div className="mt-8 rounded-2xl bg-brand-bg p-6">
                <h2 className="text-xl font-black">Approve this test</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-brand-muted">
                  {paidAssignment
                    ? "An approved tester will follow your brief and record the full test. The report and evidence will appear here when it is submitted."
                    : "A new tester will review your product as their first BUD qualification. You receive the complete test for free and can rate how useful it was."}
                </p>
                <button
                  type="button"
                  onClick={() => void performAction("accept")}
                  disabled={busy}
                  className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-ink px-5 py-4 font-black text-white transition hover:bg-brand-accent disabled:opacity-60 sm:w-auto"
                >
                  {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
                  Approve test
                </button>
              </div>
            )
          ) : !otherPersonAccepted ? (
            <TrialState
              icon={<LoaderCircle className="h-7 w-7 animate-spin" />}
              title="Waiting for the other person"
              body="This page updates automatically once both people accept."
            />
          ) : trial.role === "lead" && !submitted ? (
            <TrialState
              icon={<MonitorUp className="h-7 w-7" />}
              title={trial.status === "in_progress" ? "Testing is underway" : "Your test is ready"}
              body="The tester will record the flow and send the report here when finished."
            />
          ) : trial.role === "lead" && reportFailed ? (
            <TrialState
              icon={<CircleAlert className="h-7 w-7" />}
              title="We couldn't analyze the recording."
              body="The recording is safe, but the report is not available yet."
            />
          ) : trial.role === "lead" && !reportComplete ? (
            <TrialState
              icon={<LoaderCircle className="h-7 w-7 animate-spin" />}
              title="Preparing your report…"
              body="We are reviewing the tester's video and speech. This page updates automatically."
            />
          ) : trial.role === "tester" && !submitted ? (
            <div className="mt-8 border-t border-brand-line pt-8">
              {!recording && !savedSegments && !trial.submission.evidence_media.length ? (
                <p className="mb-6 text-sm font-semibold leading-6 text-brand-muted">
                  We record your screen and voice, then use AI to make a transcript and report. Before Users Do and the product owner can view them; the AI provider does not keep them.
                </p>
              ) : null}
              {!recording ? (
                <button
                  type="button"
                  onClick={() => void startTest()}
                  disabled={busy}
                  className="inline-flex w-full items-center justify-center gap-3 rounded-xl bg-brand-accent px-6 py-5 text-lg font-black text-white transition hover:bg-brand-ink disabled:opacity-60"
                >
                  <MonitorUp className="h-6 w-6" />
                  {trial.status === "in_progress" ? "Resume recording" : `Start ${trial.duration_minutes}-minute test`}
                  <ArrowRight className="h-5 w-5" />
                </button>
              ) : null}

              {recording || trial.status === "in_progress" ? (
                <div className="rounded-2xl bg-brand-ink p-5 text-white">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="relative flex h-3 w-3">
                        {recording ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-danger opacity-70" /> : null}
                        <span className={`relative inline-flex h-3 w-3 rounded-full ${recording ? "bg-brand-danger" : "bg-brand-success"}`} />
                      </span>
                      <div>
                        <div className="font-black">{recording ? "Recording screen and voice" : "Recording paused"}</div>
                        <div className="mt-1 text-xs font-semibold text-white/60">{savedSegments} segment{savedSegments === 1 ? "" : "s"} saved</div>
                      </div>
                    </div>
                    {recording ? (
                      <button
                        type="button"
                        onClick={() => void stopAndSaveRecording()}
                        className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20"
                        aria-label="Stop recording"
                      >
                        <Square className="h-5 w-5 fill-current" />
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-white/60">
                    <Mic className="h-4 w-4" />
                    Talk naturally while you use the product. Each segment saves as you go.
                  </div>
                </div>
              ) : null}

              <label className="mt-6 block">
                <span className="text-sm font-black">Anything else?</span>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Optional note for the product owner"
                  className="mt-2 min-h-28 w-full rounded-xl border border-brand-line bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-brand-accent"
                />
              </label>

              <button
                type="button"
                onClick={() => void finishTrial()}
                disabled={busy || saving || (!recording && !savedSegments && !trial.submission.evidence_media.length)}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-ink px-5 py-4 font-black text-white transition hover:bg-brand-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy || saving ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
                Finish and send
              </button>
              {recordingMessage ? <p className="mt-3 text-sm font-semibold text-brand-muted">{recordingMessage}</p> : null}
            </div>
          ) : (
            <div className="mt-8 border-t border-brand-line pt-8">
              {showBuyerReport ? (
                <>
                  <div className="mb-8 flex items-center gap-3 border-b border-brand-line pb-6">
                    <div
                      aria-hidden="true"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-ink text-sm font-black text-white"
                    >
                      {testerInitial}
                    </div>
                    <div className="min-w-0">
                      <div className="font-black">
                        {testerFirstName === "your tester" ? "Your tester" : `Tested by ${testerFirstName}`}
                      </div>
                      <div className="mt-0.5 text-sm font-semibold text-brand-muted">
                        {paidAssignment ? "Before Users Do tester" : "New tester · first trial"}
                      </div>
                    </div>
                  </div>
                  {trial.role === "lead" && reportComplete && !trial.lead_rating.score ? (
                    <section
                      className="mb-8 rounded-2xl border border-brand-accent/20 bg-brand-accent/5 p-5"
                      aria-labelledby="buyer-review-title"
                    >
                      <h2 id="buyer-review-title" className="text-xl font-black">Leave a review</h2>
                      <p className="mt-1 text-sm font-semibold text-brand-muted">
                        {`How useful was ${testerPossessive} test? Private to Before Users Do.`}
                      </p>
                      <div
                        className="mt-4 grid max-w-72 grid-cols-3 gap-2 min-[375px]:grid-cols-5"
                        role="group"
                        aria-label={`Rate ${testerPossessive} test`}
                      >
                        {[1, 2, 3, 4, 5].map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => {
                              setRating(value);
                              setRatingError("");
                            }}
                            className={`flex h-12 min-w-0 w-full items-center justify-center rounded-xl border bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent ${
                              rating === value ? "border-brand-warning" : "border-brand-line"
                            }`}
                            aria-label={`${value} star${value === 1 ? "" : "s"}`}
                            aria-pressed={rating === value}
                          >
                            <Star className={`h-6 w-6 ${value <= rating ? "fill-brand-warning text-brand-warning" : "text-slate-300"}`} />
                          </button>
                        ))}
                      </div>
                      {rating ? (
                        <div className="mt-4">
                          <textarea
                            value={ratingNote}
                            onChange={(event) => setRatingNote(event.target.value)}
                            aria-label="Private feedback note"
                            placeholder="What was useful or missing? (optional)"
                            className="min-h-24 w-full rounded-xl border border-brand-line bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-brand-accent"
                          />
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void submitRating()}
                            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-ink px-5 py-3 font-black text-white disabled:opacity-40"
                          >
                            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            Send review
                          </button>
                          {ratingError ? (
                            <p role="alert" className="mt-3 text-sm font-semibold text-brand-danger">
                              {ratingError}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </section>
                  ) : trial.role === "lead" && reportComplete && trial.lead_rating.score ? (
                    <div
                      role="status"
                      aria-live="polite"
                      className="mb-8 flex items-center gap-3 rounded-2xl bg-brand-success/10 p-5"
                    >
                      <Check className="h-6 w-6 text-brand-success" />
                      <span className="font-black">{`Review sent · ${trial.lead_rating.score}/5`}</span>
                    </div>
                  ) : null}
                  <BuyerReport trial={trial} recordings={videoEvidence} token={token} />
                </>
              ) : (
                <div className="flex items-center gap-3 rounded-2xl bg-brand-success/10 p-4 text-brand-ink">
                  <Check className="h-6 w-6 text-brand-success" />
                  <div>
                    <div className="font-black">Test submitted</div>
                    <div className="text-sm font-semibold text-brand-muted">Your recording is saved. The report is created automatically.</div>
                  </div>
                </div>
              )}

              {trial.submission.note ? (
                <details className="mt-6 border-y border-brand-line py-2">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-black focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-accent">
                    Tester&apos;s extra note
                    <ChevronDown aria-hidden="true" className="h-4 w-4 text-brand-muted" />
                  </summary>
                  <p className="border-t border-brand-line py-4 whitespace-pre-wrap text-sm font-semibold leading-6 text-brand-muted">
                    {trial.submission.note}
                  </p>
                </details>
              ) : null}

              {videoEvidence.length ? (
                <details className="mt-2 border-b border-brand-line py-2">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-black focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-accent">
                    All recordings ({videoEvidence.length})
                    <ChevronDown aria-hidden="true" className="h-4 w-4 text-brand-muted" />
                  </summary>
                  <div className="space-y-4 border-t border-brand-line py-4">
                    {videoEvidence.map((entry, index) => (
                      <div key={entry.evidence_id || `${entry.url}-${index}`} className="overflow-hidden rounded-2xl border border-brand-line bg-brand-ink">
                        <video controls preload="none" className="aspect-video w-full" src={evidenceUrl(entry, token)} />
                        <div className="flex items-center justify-between gap-3 bg-white px-4 py-3 text-xs font-bold text-brand-muted">
                          <span>{entry.label || `Recording ${index + 1}`}</span>
                          <span>{formatBytes(entry.byte_length)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}

              {paidAssignment && trial.role === "tester" ? (
                <div className="mt-6 rounded-2xl border border-brand-success/30 bg-brand-success/10 p-5">
                  <div className="text-xs font-black uppercase tracking-widest text-brand-success">
                    {formatTesterPay(trial)} {trial.assignment.tester_reward_type === "qa_credit" ? "QA credit" : "cash"}
                  </div>
                  <div className="mt-2 text-xl font-black">
                    {trial.assignment.payout_status === "paid"
                      ? trial.assignment.tester_reward_type === "qa_credit"
                        ? "Credit added"
                        : "Paid"
                      : trial.assignment.payout_status === "approved"
                        ? trial.assignment.tester_reward_type === "qa_credit"
                          ? "Credit approved"
                          : "Payment approved"
                        : "Report under review"}
                  </div>
                  <p className="mt-2 text-sm font-semibold text-brand-muted">
                    {trial.assignment.payout_status === "paid"
                      ? trial.assignment.tester_reward_type === "qa_credit"
                        ? "This credit is ready to spend on QA for your own product."
                        : "Before Users Do recorded this payment as sent."
                      : trial.assignment.payout_status === "approved"
                        ? trial.assignment.tester_reward_type === "qa_credit"
                          ? "Your report passed review and the credit is ready to be added."
                          : "Your report passed review and is ready for payment."
                        : "Before Users Do will review the report before approving payment."}
                  </p>
                </div>
              ) : !paidAssignment && trial.qualification.status === "verified" ? (
                <div className="mt-6 rounded-2xl border border-brand-accent/30 bg-brand-accent/5 p-5">
                  <div className="text-xs font-black uppercase tracking-widest text-brand-accent">BUD Verified Trial</div>
                  <div className="mt-2 text-4xl font-black">{trial.qualification.score}/100</div>
                  {trial.qualification.reviewer_note ? <p className="mt-2 text-sm font-semibold text-brand-muted">{trial.qualification.reviewer_note}</p> : null}
                </div>
              ) : trial.role === "tester" ? (
                <p className="mt-5 text-sm font-semibold text-brand-muted">BUD is reviewing your evidence for your first score.</p>
              ) : null}

            </div>
          )}

          {error ? (
            <div className="mt-6 flex items-start gap-3 rounded-xl border border-brand-danger/20 bg-brand-danger/10 px-4 py-3 text-sm font-semibold text-brand-danger">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          ) : null}

          <a href={trial.target_url} target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-2 text-sm font-black text-brand-muted hover:text-brand-ink">
            Open product
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>

        <div className="mt-6 flex items-center justify-center gap-2 text-xs font-bold text-brand-muted">
          <Video className="h-4 w-4" />
          Shared only with Before Users Do and the product owner for this trial.
        </div>
      </main>
    </div>
  );
}
